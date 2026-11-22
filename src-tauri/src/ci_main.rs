//! I6b, the department lamp: one tracker per department follows the head of its repository's default branch on
//! GitHub. Every `IDLE_MS` it reads the branch's combined status by name (which names the head commit) and that
//! commit's check-runs; a new head is polled at I6's `POLL_MS` until its verdict. A scribe done with its turn brings the
//! check forward (`scribe_done`); a live push watch on the same branch is mirrored instead of polled (`live`, `adopt`).
//! Pure core with an injected clock and `gh`, like `ci::Watcher`; the watcher thread drives it.
#![allow(dead_code)] // `Mains` is wired into the CI worker by the next step (Task 3)
use crate::{
    ci::{
        branch_api, default_branch_of, evaluate, parse_default_branch, rate_limit_reset, status_sha, Ended, Finished, Gh, GhError, Lamp, Link, Repo, Target, Verdict, CAP_MS, DEFAULT_PAUSE_MS,
        MAX_FAILURES, NO_CI_MS, POLL_MS,
    },
    registry::{CiState, CiStatus},
};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

/// The idle rhythm: one check of the default branch every 5 min.
pub const IDLE_MS: i64 = 300_000;
/// The second early check, after the one a scribe's end of turn brings at once.
pub const EARLY_AGAIN_MS: i64 = 120_000;
/// Triggers in one department closer than this make one early check.
pub const TRIGGER_GAP_MS: i64 = 60_000;
/// A department not seen for this long is gone: its tracker, lamp and link go.
pub const GONE_MS: i64 = 10_000;

/// How a tracker's check of a head ended: `Pass` / `Fail` on a new head (a Chronicon record), `Skipped` / `Error` for
/// Settings > Status. `target.sha` is empty when no head was known yet (a `Skipped` before the first answer).
#[derive(Clone, Debug, PartialEq)]
pub struct MainEnded {
    pub dept: String,
    pub target: Target,
    pub ended: Ended,
}

/// The commit a tracker follows and what its polls learned about it (the I6 watch's fields, per head).
struct Head {
    target: Target,
    started_ms: i64,
    /// The checks the last poll saw, for the two-stable-polls rule.
    prev_ids: Option<Vec<String>>,
    seen: bool,
    /// Whether this head has its Pass / Fail already (by the tracker, a push watch, or as the first head seen).
    given: bool,
}

/// One department's tracker of its default branch.
struct Tracker {
    id: u64,
    dept: String,
    cwd: String,
    repo: Repo,
    /// None until `gh api repos/<o>/<r>` named it.
    branch: Option<String>,
    head: Option<Head>,
    /// What the lamp shows.
    shown: CiState,
    next_ms: i64,
    /// Polled every `POLL_MS` (a head's CI runs), not idle.
    fast: bool,
    failures: u32,
    last_seen_ms: i64,
    /// The second early check, pending.
    again_ms: Option<i64>,
    /// The last early check trigger that counted.
    trigger_ms: Option<i64>,
    /// The lamp mirrors a live push watch.
    mirroring: bool,
    /// A push watch ended (`adopt`): the next tick sets the idle time.
    adopted: bool,
}

enum Step {
    Keep,
    /// The department has no tracker for the rest of the run.
    Untrack,
    Pause(i64),
}

impl Tracker {
    /// The next check once idle: the pending early check, else the 5-min one.
    fn go_idle(&mut self, now_ms: i64) {
        self.fast = false;
        self.again_ms = self.again_ms.filter(|&a| a > now_ms);
        self.next_ms = self.again_ms.map_or(now_ms + IDLE_MS, |a| a.min(now_ms + IDLE_MS));
    }

    /// The head, or (before any) the repository and branch with an empty `sha`.
    fn target_or_branch(&self) -> Target {
        match &self.head {
            Some(h) => h.target.clone(),
            None => Target { repo: self.repo.clone(), branch: self.branch.clone().unwrap_or_default(), sha: String::new() },
        }
    }

    fn set_shown(&mut self, state: CiStatus, failed: Option<String>) {
        (self.shown.state, self.shown.failed) = (state, failed);
    }

    /// Takes `target` as the head; another commit than before starts a fresh verdict, the lamp unlit until it knows.
    fn take_head(&mut self, target: Target, now_ms: i64) {
        if self.head.as_ref().map(|h| &h.target.sha) == Some(&target.sha) {
            return;
        }
        let first = self.head.is_none();
        (self.shown.branch, self.shown.sha7) = (target.branch.clone(), target.sha7().into());
        (self.shown.done, self.shown.total) = (0, 0);
        self.set_shown(CiStatus::None, None);
        self.failures = 0;
        // the head found at first sight is the last known state, not news: no Chronicon record for it
        self.head = Some(Head { target, started_ms: now_ms, prev_ids: None, seen: false, given: first });
    }

    fn mirror(&mut self, ci: CiState) {
        self.shown = ci;
        self.mirroring = true;
    }
}

/// Every department's main tracker. Driven by `tick` with the clock passed in (epoch ms), like `ci::Watcher`.
#[derive(Default)]
pub struct Mains {
    trackers: Vec<Tracker>,
    /// Departments with no tracker for the run: not GitHub, or no default branch to be had.
    untracked: HashSet<String>,
    /// `default_branch` by repository slug (lowercase), None when the lookup failed; once per repository per run.
    branches: HashMap<String, Option<String>>,
    next_id: u64,
    paused_until_ms: i64,
    /// The clock of the last tick: lamps are unlit while it is inside a pause.
    now_ms: i64,
}

fn skip_reason(e: &GhError, repo: &Repo) -> Option<String> {
    match e {
        GhError::Missing => Some("gh not found".into()),
        GhError::NotLoggedIn => Some("gh not logged in".into()),
        GhError::NoAccess => Some(format!("no access to {}", repo.slug())),
        _ => None,
    }
}

/// The end of a rate-limit pause, as `Watcher::poll` sets it.
fn pause_until(gh: &dyn Gh, reset: Option<i64>, now_ms: i64) -> i64 {
    let reset_ms = reset.or_else(|| rate_limit_reset(gh)).map_or(now_ms + DEFAULT_PAUSE_MS, |s| s * 1000);
    reset_ms.max(now_ms + 5_000)
}

impl Mains {
    /// `dept` (working in `cwd`) is in the roster at `now_ms`. On first sight in the run its tracker starts, first check
    /// due at once; a folder that is no GitHub repository is remembered as untracked and never looked at again.
    pub fn see(&mut self, dept: &str, cwd: &str, now_ms: i64) {
        if let Some(t) = self.trackers.iter_mut().find(|t| t.dept == dept) {
            t.last_seen_ms = now_ms;
            return;
        }
        if self.untracked.contains(dept) {
            return;
        }
        let Some(main) = default_branch_of(Path::new(cwd)) else {
            self.untracked.insert(dept.to_string());
            return;
        };
        let branch = main.branch.or_else(|| self.branches.get(&main.repo.slug().to_lowercase()).cloned().flatten());
        self.next_id += 1;
        let shown = CiState { repo: main.repo.slug(), branch: branch.clone().unwrap_or_default(), sha7: String::new(), state: CiStatus::None, done: 0, total: 0, failed: None };
        self.trackers.push(Tracker {
            id: self.next_id,
            dept: dept.into(),
            cwd: cwd.into(),
            repo: main.repo,
            branch,
            head: None,
            shown,
            next_ms: now_ms,
            fast: false,
            failures: 0,
            last_seen_ms: now_ms,
            again_ms: None,
            trigger_ms: None,
            mirroring: false,
            adopted: false,
        });
    }

    /// A scribe of `dept` ended its turn or left: check at once and again `EARLY_AGAIN_MS` later. Triggers within
    /// `TRIGGER_GAP_MS` of the last one that counted make no new check; none while the head's CI is polled at 30 s.
    pub fn scribe_done(&mut self, dept: &str, now_ms: i64) {
        let Some(t) = self.trackers.iter_mut().find(|t| t.dept == dept) else { return };
        if t.fast || t.trigger_ms.is_some_and(|last| now_ms - last < TRIGGER_GAP_MS) {
            return;
        }
        t.trigger_ms = Some(now_ms);
        t.next_ms = t.next_ms.min(now_ms);
        t.again_ms = Some(now_ms + EARLY_AGAIN_MS);
    }

    /// Drops the departments gone from the roster, then runs every due check, one `gh` call at a time. A tracker whose
    /// branch `live` reports (a running push watch) shows that and makes no call. While a rate limit pauses, nothing
    /// runs. Returns the verdicts on new heads and the endings Settings > Status names.
    pub fn tick(&mut self, gh: &dyn Gh, now_ms: i64, live: &dyn Fn(&Repo, &str) -> Option<CiState>) -> Vec<MainEnded> {
        self.now_ms = now_ms;
        self.trackers.retain(|t| now_ms - t.last_seen_ms < GONE_MS);
        let mut out = vec![];
        if now_ms < self.paused_until_ms {
            return out;
        }
        let mut i = 0;
        while i < self.trackers.len() {
            match self.step(i, gh, now_ms, live, &mut out) {
                Step::Keep => i += 1,
                Step::Untrack => {
                    let t = self.trackers.remove(i);
                    self.untracked.insert(t.dept);
                }
                Step::Pause(until) => {
                    self.paused_until_ms = until;
                    break;
                }
            }
        }
        out
    }

    /// Tracker `i`'s part of a tick: an adopted ending, the live mirror, the branch lookup, the due check.
    fn step(&mut self, i: usize, gh: &dyn Gh, now_ms: i64, live: &dyn Fn(&Repo, &str) -> Option<CiState>, out: &mut Vec<MainEnded>) -> Step {
        let t = &mut self.trackers[i];
        if t.adopted {
            t.adopted = false;
            t.go_idle(now_ms);
        }
        if let Some(b) = &t.branch {
            match live(&t.repo, b) {
                Some(ci) => {
                    t.mirror(ci);
                    return Step::Keep;
                }
                // the watch went without ending here (replaced, dropped): check the branch now
                None if t.mirroring => {
                    t.mirroring = false;
                    t.next_ms = t.next_ms.min(now_ms);
                }
                None => {}
            }
        }
        if now_ms < t.next_ms {
            return Step::Keep;
        }
        let branch = match t.branch.clone() {
            Some(b) => b,
            None => {
                let slug = t.repo.slug().to_lowercase();
                let found = match self.branches.get(&slug) {
                    Some(cached) => cached.clone(),
                    None => {
                        let t = &self.trackers[i];
                        let found = match gh.run(&["api", &format!("repos/{}/{}", t.repo.owner, t.repo.name)]) {
                            Ok(json) => parse_default_branch(&json),
                            Err(GhError::RateLimit(reset)) => return Step::Pause(pause_until(gh, reset, now_ms)),
                            Err(e) => {
                                if let Some(why) = skip_reason(&e, &t.repo) {
                                    out.push(MainEnded { dept: t.dept.clone(), target: t.target_or_branch(), ended: Ended::Skipped(why) });
                                }
                                None
                            }
                        };
                        self.branches.insert(slug, found.clone());
                        found
                    }
                };
                let Some(b) = found else { return Step::Untrack };
                let t = &mut self.trackers[i];
                (t.branch, t.shown.branch) = (Some(b.clone()), b.clone());
                if let Some(ci) = live(&t.repo, &b) {
                    t.mirror(ci);
                    return Step::Keep;
                }
                b
            }
        };
        match self.poll(i, gh, now_ms, &branch, out) {
            Some(until) => Step::Pause(until),
            None => Step::Keep,
        }
    }

    /// One check: the branch's combined status by name (its `sha` is the head), that commit's check-runs, the verdict.
    /// Some: a rate limit, the end of the pause.
    fn poll(&mut self, i: usize, gh: &dyn Gh, now_ms: i64, branch: &str, out: &mut Vec<MainEnded>) -> Option<i64> {
        let repo = self.trackers[i].repo.clone();
        let fetched = gh.run(&["api", &branch_api(&repo, branch, "status")]).and_then(|status| {
            let sha = status_sha(&status).ok_or_else(|| GhError::Other("status: no sha".into()))?;
            let target = Target { repo: repo.clone(), branch: branch.to_string(), sha };
            let runs = gh.run(&["api", &target.api("check-runs?per_page=100")])?;
            let snap = evaluate(&runs, &status).map_err(GhError::Other)?;
            Ok((target, snap))
        });
        let t = &mut self.trackers[i];
        let (target, snap) = match fetched {
            Ok(x) => x,
            Err(GhError::RateLimit(reset)) => {
                t.next_ms = now_ms; // due again the moment the pause is over
                return Some(pause_until(gh, reset, now_ms));
            }
            Err(GhError::Other(_)) => {
                t.failures += 1;
                if t.failures < MAX_FAILURES {
                    t.next_ms = now_ms + POLL_MS;
                    return None;
                }
                t.failures = 0;
                t.set_shown(CiStatus::None, None);
                t.go_idle(now_ms);
                out.push(MainEnded { dept: t.dept.clone(), target: t.target_or_branch(), ended: Ended::Error });
                return None;
            }
            Err(e) => {
                t.failures = 0;
                t.set_shown(CiStatus::None, None);
                t.go_idle(now_ms);
                let why = skip_reason(&e, &repo).unwrap_or_default();
                out.push(MainEnded { dept: t.dept.clone(), target: t.target_or_branch(), ended: Ended::Skipped(why) });
                return None;
            }
        };
        t.failures = 0;
        t.take_head(target, now_ms);
        // what the lamp showed for this head before this poll (unlit on a head just taken)
        let (was, was_failed) = (t.shown.state, t.shown.failed.clone());
        let h = t.head.as_mut().expect("a head was just taken");
        h.seen |= snap.total > 0;
        let stable = h.prev_ids.as_ref() == Some(&snap.ids);
        h.prev_ids = Some(snap.ids.clone());
        let (elapsed, seen) = (now_ms - h.started_ms, h.seen);
        let (state, failed, fast, ended) = match snap.verdict {
            Verdict::Fail(check) => (CiStatus::Fail, Some(check.clone()), false, Some(Ended::Fail(check))),
            // a head already green stays green while a changed set of checks is confirmed
            Verdict::Pass if stable || was == CiStatus::Pass => (CiStatus::Pass, None, false, Some(Ended::Pass)),
            // unconfirmed: the lamp keeps what it shows (unlit on a head just taken)
            Verdict::Pass => (was, was_failed, true, None),
            Verdict::NoCi => (CiStatus::None, None, elapsed < NO_CI_MS, None),
            Verdict::Running if elapsed >= CAP_MS => (CiStatus::Timeout, None, false, None),
            Verdict::Running => (if seen { CiStatus::Running } else { CiStatus::None }, None, true, None),
        };
        (t.shown.done, t.shown.total) = (snap.done, snap.total);
        t.set_shown(state, failed);
        // a Pass or Fail on a head with none yet: its Chronicon record
        if let Some(ended) = ended {
            let h = t.head.as_mut().expect("a head was just taken");
            if !std::mem::replace(&mut h.given, true) {
                out.push(MainEnded { dept: t.dept.clone(), target: h.target.clone(), ended });
            }
        }
        if fast {
            t.fast = true;
            t.next_ms = now_ms + POLL_MS;
        } else {
            t.go_idle(now_ms);
        }
        None
    }

    /// A push watch ended on a tracked default branch: the tracker takes its commit and state and goes back to the
    /// 5-min rhythm from the next tick. No `MainEnded`: the push has its own Chronicon record.
    pub fn adopt(&mut self, f: &Finished) {
        let now_ms = self.now_ms;
        for t in self.trackers.iter_mut().filter(|t| t.repo.slug().eq_ignore_ascii_case(&f.target.repo.slug()) && t.branch.as_deref() == Some(f.target.branch.as_str())) {
            t.take_head(Target { repo: t.repo.clone(), ..f.target.clone() }, now_ms);
            if let Some(h) = t.head.as_mut() {
                h.given |= matches!(f.ended, Ended::Pass | Ended::Fail(_));
            }
            let (state, failed) = match &f.ended {
                Ended::Pass => (CiStatus::Pass, None),
                Ended::Fail(c) => (CiStatus::Fail, Some(c.clone())),
                Ended::Timeout => (CiStatus::Timeout, None),
                Ended::Error => (CiStatus::Error, None),
                Ended::NoCi | Ended::Skipped(_) => (CiStatus::None, None),
            };
            t.set_shown(state, failed);
            (t.shown.branch, t.shown.sha7) = (f.target.branch.clone(), f.target.sha7().into());
            t.mirroring = false;
            t.adopted = true;
        }
    }

    fn paused(&self) -> bool {
        self.now_ms < self.paused_until_ms
    }

    /// Each tracked department's lamp, sorted by department; unlit while a rate limit pauses.
    pub fn lamp_rows(&self) -> Vec<Lamp> {
        let paused = self.paused();
        let mut rows: Vec<Lamp> = self
            .trackers
            .iter()
            .map(|t| Lamp {
                dept: t.dept.clone(),
                cwd: t.cwd.clone(),
                state: if paused { CiStatus::None } else { t.shown.state },
                branch: t.shown.branch.clone(),
                sha7: t.shown.sha7.clone(),
                failed: if paused { None } else { t.shown.failed.clone() },
            })
            .collect();
        rows.sort_by(|a, b| a.dept.cmp(&b.dept));
        rows
    }

    /// What `ci_open` may open for a department: its tracker's head (no session).
    pub fn links(&self) -> Vec<Link> {
        let paused = self.paused();
        self.trackers
            .iter()
            .filter_map(|t| {
                let h = t.head.as_ref()?;
                Some(Link { id: t.id, session_id: None, dept: t.dept.clone(), state: if paused { CiStatus::None } else { t.shown.state }, target: h.target.clone() })
            })
            .collect()
    }

    /// The time (epoch ms) a rate limit holds every tracker until; in the past when none does.
    pub fn paused_until(&self) -> i64 {
        self.paused_until_ms
    }

    /// Holds every tracker until `until_ms` (a rate limit the push watches met).
    pub fn pause(&mut self, until_ms: i64) {
        self.paused_until_ms = self.paused_until_ms.max(until_ms);
    }

    /// `adm.ci` went off: every tracker, cache and pause goes; the next sight is a first sight.
    pub fn clear(&mut self) {
        *self = Mains::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ci::{testgh::*, Who};
    use serde_json::{json, Value};
    use std::{fs, path::PathBuf};

    const T0: i64 = 1_000_000;
    const A: &str = "aaaaaaa0123456789abcdef0123456789abcdef0";
    const B: &str = "bbbbbbb0123456789abcdef0123456789abcdef0";
    const STATUS: &str = "api repos/o/r/commits/main/status";

    fn runs_of(sha: &str, list: &[(&str, &str, Option<&str>)]) -> String {
        let r: Vec<Value> = list.iter().map(|(n, s, c)| json!({"id": 1, "name": n, "status": s, "conclusion": c, "head_sha": sha})).collect();
        json!({"total_count": r.len(), "check_runs": r}).to_string()
    }

    fn status_of(sha: &str) -> String {
        json!({"state": "pending", "sha": sha, "total_count": 0, "statuses": []}).to_string()
    }

    /// One tracker poll's two answers: the branch's status (naming `sha`), then that commit's check-runs.
    fn poll(sha: &str, list: &[(&str, &str, Option<&str>)]) -> Vec<Result<String, GhError>> {
        vec![Ok(status_of(sha)), Ok(runs_of(sha, list))]
    }

    fn ok(c: &str) -> (&str, &str, Option<&str>) {
        (c, "completed", Some("success"))
    }

    fn runs_call(sha: &str) -> String {
        format!("api repos/o/r/commits/{sha}/check-runs?per_page=100")
    }

    /// A repo on `feat` whose `origin/HEAD` names `main` (or none, with `head` false).
    fn main_repo(name: &str, head: bool) -> (PathBuf, String) {
        let d = temp(&format!("main-{name}"));
        let r = repo(&d, "feat", "git@github.com:o/r.git", None);
        if head {
            origin_head(&r, "ref: refs/remotes/origin/main\n");
        }
        (d, r.to_string_lossy().into_owned())
    }

    fn no_live(_: &Repo, _: &str) -> Option<CiState> {
        None
    }

    /// The department is in the roster at `now`, then the tick.
    fn at(m: &mut Mains, gh: &dyn Gh, cwd: &str, now: i64) -> Vec<MainEnded> {
        m.see("Terra", cwd, now);
        m.tick(gh, now, &no_live)
    }

    fn lamp(m: &Mains) -> Vec<(String, CiStatus)> {
        m.lamp_rows().into_iter().map(|l| (l.dept, l.state)).collect()
    }

    fn terra(s: CiStatus) -> Vec<(String, CiStatus)> {
        vec![("Terra".to_string(), s)]
    }

    fn ended(e: &[MainEnded]) -> Vec<Ended> {
        e.iter().map(|e| e.ended.clone()).collect()
    }

    #[test]
    fn first_sight_checks_at_once_then_every_five_minutes() {
        let (d, cwd) = main_repo("first", true);
        let gh = Stub::new([poll(A, &[ok("build")]), poll(A, &[ok("build")]), poll(A, &[ok("build")])].concat());
        let mut m = Mains::default();
        assert!(at(&mut m, &gh, &cwd, T0).is_empty());
        assert_eq!(gh.log(), vec![STATUS.to_string(), runs_call(A)]);
        assert_eq!(lamp(&m), terra(CiStatus::None)); // one pass is not confirmed yet
        at(&mut m, &gh, &cwd, T0 + POLL_MS - 1);
        assert_eq!(gh.log().len(), 2);
        // the confirming poll; the head seen at first sight is the last known state, not news: no Chronicon record
        assert!(at(&mut m, &gh, &cwd, T0 + POLL_MS).is_empty());
        assert_eq!(gh.log().len(), 4);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        at(&mut m, &gh, &cwd, T0 + POLL_MS + IDLE_MS - 1);
        assert_eq!(gh.log().len(), 4);
        assert!(at(&mut m, &gh, &cwd, T0 + POLL_MS + IDLE_MS).is_empty());
        assert_eq!(gh.log().len(), 6);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_new_head_runs_at_thirty_seconds_until_its_verdict() {
        let (d, cwd) = main_repo("newhead", true);
        let failed = [("build", "completed", Some("failure")), ("lint", "completed", Some("success"))];
        let script = [poll(A, &[ok("build")]), poll(A, &[ok("build")]), poll(B, &[("build", "in_progress", None)]), poll(B, &failed), poll(B, &failed)].concat();
        let gh = Stub::new(script);
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        let t = T0 + POLL_MS + IDLE_MS;
        assert!(at(&mut m, &gh, &cwd, t).is_empty());
        assert_eq!(gh.log()[4..], [STATUS.to_string(), runs_call(B)]);
        assert_eq!(lamp(&m), terra(CiStatus::Running));
        at(&mut m, &gh, &cwd, t + POLL_MS - 1);
        assert_eq!(gh.log().len(), 6);
        let e = at(&mut m, &gh, &cwd, t + POLL_MS);
        assert_eq!(gh.log().len(), 8);
        assert_eq!(ended(&e), vec![Ended::Fail("build".into())]);
        assert_eq!((e[0].dept.as_str(), e[0].target.sha.as_str(), e[0].target.branch.as_str()), ("Terra", B, "main"));
        let row = &m.lamp_rows()[0];
        assert_eq!((row.state, row.branch.as_str(), row.sha7.as_str(), row.failed.as_deref()), (CiStatus::Fail, "main", &B[..7], Some("build")));
        assert_eq!(m.links()[0].target.sha, B);
        assert_eq!(m.links()[0].session_id, None);
        // back to the 5-min rhythm; the same failed head is not recorded twice
        at(&mut m, &gh, &cwd, t + POLL_MS + IDLE_MS - 1);
        assert_eq!(gh.log().len(), 8);
        assert!(at(&mut m, &gh, &cwd, t + POLL_MS + IDLE_MS).is_empty());
        assert_eq!(gh.log().len(), 10);
        assert_eq!(lamp(&m), terra(CiStatus::Fail));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn an_old_green_head_is_unlit_until_confirmed() {
        let (d, cwd) = main_repo("oldgreen", true);
        let gh = Stub::new(polls_of(2, A, &[ok("build"), ok("test")]));
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        assert_eq!(lamp(&m), terra(CiStatus::None));
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        let _ = fs::remove_dir_all(&d);
    }

    fn polls_of(n: usize, sha: &str, list: &[(&str, &str, Option<&str>)]) -> Vec<Result<String, GhError>> {
        (0..n).flat_map(|_| poll(sha, list)).collect()
    }

    #[test]
    fn scribe_done_brings_the_check_forward() {
        let (d, cwd) = main_repo("early", true);
        let failed = [("build", "completed", Some("failure"))];
        let gh = Stub::new(polls_of(4, A, &failed));
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0); // a failure ends at once: idle
        assert_eq!(lamp(&m), terra(CiStatus::Fail));
        at(&mut m, &gh, &cwd, T0 + 59_000);
        assert_eq!(gh.log().len(), 2);
        let t = T0 + 60_000;
        m.scribe_done("Terra", t);
        at(&mut m, &gh, &cwd, t);
        assert_eq!(gh.log().len(), 4); // at once
        m.scribe_done("Terra", t + 30_000); // within a minute of the first: the same check
        at(&mut m, &gh, &cwd, t + 30_000);
        at(&mut m, &gh, &cwd, t + EARLY_AGAIN_MS - 1);
        assert_eq!(gh.log().len(), 4);
        at(&mut m, &gh, &cwd, t + EARLY_AGAIN_MS);
        assert_eq!(gh.log().len(), 6); // once more 2 min later
        at(&mut m, &gh, &cwd, t + EARLY_AGAIN_MS + 30_000 + EARLY_AGAIN_MS);
        at(&mut m, &gh, &cwd, t + EARLY_AGAIN_MS + IDLE_MS - 1);
        assert_eq!(gh.log().len(), 6);
        at(&mut m, &gh, &cwd, t + EARLY_AGAIN_MS + IDLE_MS);
        assert_eq!(gh.log().len(), 8); // then the 5-min rhythm
        let _ = fs::remove_dir_all(&d);

        // while a head's CI is polled at 30 s, a scribe done adds nothing
        let (d, cwd) = main_repo("early30", true);
        let gh = Stub::new(polls_of(3, A, &[("build", "in_progress", None)]));
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        assert_eq!(lamp(&m), terra(CiStatus::Running));
        m.scribe_done("Terra", T0 + 10_000);
        at(&mut m, &gh, &cwd, T0 + 10_000);
        at(&mut m, &gh, &cwd, T0 + POLL_MS - 1);
        assert_eq!(gh.log().len(), 2);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        assert_eq!(gh.log().len(), 4);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_push_watch_on_main_is_reused() {
        let (d, cwd) = main_repo("reuse", true);
        let gh = Stub::new(poll(B, &[ok("build")]));
        let live = |r: &Repo, b: &str| {
            (r.slug() == "o/r" && b == "main").then(|| CiState { repo: "o/r".into(), branch: "main".into(), sha7: B[..7].into(), state: CiStatus::Running, done: 1, total: 3, failed: None })
        };
        let mut m = Mains::default();
        m.see("Terra", &cwd, T0);
        assert!(m.tick(&gh, T0, &live).is_empty());
        assert!(gh.log().is_empty());
        assert_eq!(lamp(&m), terra(CiStatus::Running));
        m.see("Terra", &cwd, T0 + POLL_MS);
        m.tick(&gh, T0 + POLL_MS, &live);
        assert!(gh.log().is_empty());
        // the push watch ended green: the tracker takes its commit and state, and records nothing
        let who = Who { session_id: Some("s1".into()), name: "terra-77".into(), dept: "Terra".into(), cwd: cwd.clone() };
        m.adopt(&Finished { who, target: Target { repo: Repo { owner: "O".into(), name: "r".into() }, branch: "main".into(), sha: B.into() }, ended: Ended::Pass });
        let t = T0 + 40_000;
        assert!(at(&mut m, &gh, &cwd, t).is_empty());
        assert!(gh.log().is_empty());
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        assert_eq!(m.links()[0].target.sha, B);
        at(&mut m, &gh, &cwd, t + IDLE_MS - 1);
        assert!(gh.log().is_empty());
        // its next own check is the 5-min one, and that head is not recorded a second time
        assert!(at(&mut m, &gh, &cwd, t + IDLE_MS).is_empty());
        assert_eq!(gh.log(), vec![STATUS.to_string(), runs_call(B)]);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn no_origin_head_asks_gh_once() {
        let (d, cwd) = main_repo("nohead", false);
        let gh = Stub::new([vec![Ok(json!({"default_branch": "main"}).to_string())], polls_of(2, A, &[ok("build")])].concat());
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        assert_eq!(gh.log(), vec!["api repos/o/r".to_string(), STATUS.to_string(), runs_call(A)]);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        assert_eq!(gh.log()[3..], [STATUS.to_string(), runs_call(A)]);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));

        // gh missing: one note, the department stays without a lamp, never asked again this run
        let gh = Stub::always(Err(GhError::Missing));
        let mut m = Mains::default();
        let e = at(&mut m, &gh, &cwd, T0);
        assert_eq!(ended(&e), vec![Ended::Skipped("gh not found".into())]);
        assert_eq!(e[0].dept, "Terra");
        // no head yet: the target has no commit, and formatting it as a Chronicon detail must not panic
        assert_eq!((e[0].target.sha.as_str(), e[0].target.sha7()), ("", ""));
        assert_eq!(gh.log().len(), 1);
        for k in 1..20 {
            assert!(at(&mut m, &gh, &cwd, T0 + k * IDLE_MS).is_empty());
        }
        m.scribe_done("Terra", T0 + 30 * IDLE_MS);
        at(&mut m, &gh, &cwd, T0 + 30 * IDLE_MS);
        assert_eq!(gh.log().len(), 1);
        assert!(m.lamp_rows().is_empty());
        assert!(m.links().is_empty());

        // an answer that names no usable branch: untracked as well, without a note
        let gh = Stub::new(vec![Ok(json!({"default_branch": "../x"}).to_string())]);
        let mut m = Mains::default();
        assert!(at(&mut m, &gh, &cwd, T0).is_empty());
        at(&mut m, &gh, &cwd, T0 + IDLE_MS);
        assert_eq!(gh.log().len(), 1);
        assert!(m.lamp_rows().is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn errors_leave_the_lamp_unlit() {
        let (d, cwd) = main_repo("errors", true);
        let reset_s = T0 / 1000 + IDLE_MS / 1000 + 120;
        let script = [polls_of(2, A, &[ok("build")]), vec![Err(GhError::RateLimit(Some(reset_s)))], polls_of(1, A, &[ok("build")])].concat();
        let gh = Stub::new(script);
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        assert_eq!(lamp(&m), terra(CiStatus::Pass));
        let t = T0 + POLL_MS + IDLE_MS;
        assert!(at(&mut m, &gh, &cwd, t).is_empty());
        assert_eq!(gh.log().len(), 5);
        assert_eq!(m.paused_until(), reset_s * 1000);
        assert_eq!(lamp(&m), terra(CiStatus::None)); // no stale green while paused
        assert!(m.links().iter().all(|l| l.state == CiStatus::None));
        at(&mut m, &gh, &cwd, reset_s * 1000 - 1);
        assert_eq!(gh.log().len(), 5);
        at(&mut m, &gh, &cwd, reset_s * 1000);
        assert_eq!(gh.log().len(), 7); // due again the moment the pause is over
        assert_eq!(lamp(&m), terra(CiStatus::Pass));

        // a pause set from outside (the push watches hit the limit) masks the lamps the same way
        m.pause(reset_s * 1000 + 60_000);
        at(&mut m, &gh, &cwd, reset_s * 1000 + 1_000);
        assert_eq!(lamp(&m), terra(CiStatus::None));
        assert_eq!(gh.log().len(), 7);
        let _ = fs::remove_dir_all(&d);

        // three failures in a row: unlit, one `Error` for Settings > Status, back to the 5-min rhythm
        let (d, cwd) = main_repo("errors3", true);
        let other = || Err(GhError::Other("boom".into()));
        let gh = Stub::new([polls_of(2, A, &[ok("build")]), vec![other(), other(), other()], polls_of(1, A, &[ok("build")])].concat());
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        let t = T0 + POLL_MS + IDLE_MS;
        assert!(at(&mut m, &gh, &cwd, t).is_empty());
        assert!(at(&mut m, &gh, &cwd, t + POLL_MS).is_empty());
        let e = at(&mut m, &gh, &cwd, t + 2 * POLL_MS);
        assert_eq!(ended(&e), vec![Ended::Error]);
        assert_eq!(gh.log().len(), 7);
        assert_eq!(lamp(&m), terra(CiStatus::None));
        at(&mut m, &gh, &cwd, t + 2 * POLL_MS + IDLE_MS - 1);
        assert_eq!(gh.log().len(), 7);
        at(&mut m, &gh, &cwd, t + 2 * POLL_MS + IDLE_MS);
        assert_eq!(gh.log().len(), 9);
        let _ = fs::remove_dir_all(&d);

        // logged out: unlit at once, with its reason
        let (d, cwd) = main_repo("errorsauth", true);
        let gh = Stub::new([polls_of(2, A, &[ok("build")]), vec![Err(GhError::NotLoggedIn)]].concat());
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        at(&mut m, &gh, &cwd, T0 + POLL_MS);
        let e = at(&mut m, &gh, &cwd, T0 + POLL_MS + IDLE_MS);
        assert_eq!(ended(&e), vec![Ended::Skipped("gh not logged in".into())]);
        assert_eq!(lamp(&m), terra(CiStatus::None));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn gh_missing_at_the_first_poll_is_a_note_without_a_commit() {
        let (d, cwd) = main_repo("nogh", true);
        let gh = Stub::always(Err(GhError::Missing));
        let mut m = Mains::default();
        let e = at(&mut m, &gh, &cwd, T0);
        assert_eq!(ended(&e), vec![Ended::Skipped("gh not found".into())]);
        assert_eq!(gh.log(), vec![STATUS.to_string()]);
        let detail = format!("{} · {}", e[0].target.branch, e[0].target.sha7());
        assert_eq!(detail, "main · ");
        assert_eq!(lamp(&m), terra(CiStatus::None));
        assert!(m.links().is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_department_gone_stops_its_calls() {
        let (d, cwd) = main_repo("gone", true);
        let gh = Stub::new(poll(A, &[ok("build")]));
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        assert_eq!(m.links().len(), 1);
        m.tick(&gh, T0 + GONE_MS - 1, &no_live);
        assert_eq!(lamp(&m), terra(CiStatus::None));
        m.tick(&gh, T0 + GONE_MS, &no_live);
        assert!(m.lamp_rows().is_empty());
        assert!(m.links().is_empty());
        for k in 1..20 {
            m.tick(&gh, T0 + k * POLL_MS, &no_live);
        }
        assert_eq!(gh.log().len(), 2);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_non_github_folder_has_no_tracker() {
        let d = temp("main-gitlab");
        let r = repo(&d, "main", "git@gitlab.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        let gh = Stub::new(vec![]); // any call panics
        let mut m = Mains::default();
        for (dept, cwd) in [("Terra", r.to_string_lossy().into_owned()), ("Mars", d.join("nothing").to_string_lossy().into_owned())] {
            m.see(dept, &cwd, T0);
            m.scribe_done(dept, T0);
        }
        assert!(m.tick(&gh, T0, &no_live).is_empty());
        assert!(gh.log().is_empty());
        assert!(m.lamp_rows().is_empty());
        assert!(m.links().is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn clear_forgets_everything() {
        let (d, cwd) = main_repo("clear", true);
        let gh = Stub::new(polls_of(2, A, &[ok("build")]));
        let mut m = Mains::default();
        at(&mut m, &gh, &cwd, T0);
        m.pause(T0 + 1_000_000);
        m.clear();
        assert!(m.lamp_rows().is_empty());
        assert_eq!(m.paused_until(), 0);
        at(&mut m, &gh, &cwd, T0 + 1_000);
        assert_eq!(gh.log().len(), 4); // a fresh first sight
        let _ = fs::remove_dir_all(&d);
    }
}
