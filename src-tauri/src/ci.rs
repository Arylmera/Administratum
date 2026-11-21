//! I6, the CI verdict after a push: the pure core. Push output parsing, GitHub remote URLs, ref lookup read straight
//! from `.git` (git is never run), the verdict over check-runs and statuses, and the watch state machine with an
//! injected clock. The `gh` CLI sits behind the `Gh` trait: `RealGh` runs it like `orca.rs` runs Orca (arguments
//! straight to the process, `no_window`, candidate paths), tests use a stub. No thread, no timer, no UI here: the
//! watcher thread (`Hub`, `Worker`) owns the clock and calls `Watcher::tick`.
use crate::{
    chronicle::{CiPush, Event},
    git, no_window,
    registry::{self, CiState, CiStatus},
    status,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};

/// First `gh` call after a push (CI needs a moment to register), then one every `POLL_MS`.
pub const FIRST_CALL_MS: i64 = 20_000;
pub const POLL_MS: i64 = 30_000;
/// No check-run and no status this long after the push: the repo has no CI for the branch.
pub const NO_CI_MS: i64 = 180_000;
/// No verdict this long after the push: the watch ends with `timeout`.
pub const CAP_MS: i64 = 30 * 60_000;
pub const MAX_WATCHES: usize = 8;
/// Failed polls in a row that end a watch with `error`.
const MAX_FAILURES: u32 = 3;
/// How long a rate limit pauses every watch when `gh` names no reset time.
const DEFAULT_PAUSE_MS: i64 = 60_000;

// ---- GitHub repositories and push output ------------------------------------------------------------------------

/// A GitHub repository, `owner/name`, each part made of `[A-Za-z0-9_.-]` only (it goes into a `gh api` path).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Repo {
    pub owner: String,
    pub name: String,
}

impl Repo {
    pub fn slug(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
}

fn valid_part(s: &str) -> bool {
    !s.is_empty() && s.len() <= 100 && s != "." && s != ".." && s.chars().all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
}

/// `owner/repo` of a github.com remote URL (`git@github.com:o/r.git`, `ssh://git@github.com/o/r`,
/// `https://github.com/o/r.git`, `github.com:o/r.git`); None for any other host or shape.
pub fn parse_remote_url(url: &str) -> Option<Repo> {
    let url = url.trim();
    let (host, path) = match url.split_once("://") {
        Some((scheme, rest)) => {
            if !["https", "http", "ssh", "git"].contains(&scheme) {
                return None;
            }
            let (auth, path) = rest.split_once('/')?;
            (auth.rsplit('@').next()?.split(':').next()?, path)
        }
        None => url.split_once(':').map(|(h, p)| (h.rsplit('@').next().unwrap_or(h), p))?,
    };
    if !host.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.split_once('/')?;
    (valid_part(owner) && valid_part(name)).then(|| Repo { owner: owner.into(), name: name.into() })
}

/// What a push printed that a watch needs.
#[derive(Debug, PartialEq)]
pub struct PushRef {
    /// The `To <url>` line.
    pub url: Option<String>,
    /// The destination branch of the first ref update.
    pub branch: String,
    /// The new commit's abbreviated SHA; None for a new branch (git prints no range).
    pub short: Option<String>,
}

/// The first branch update of a push's output: `   1a2b3c4..5d6e7f8  main -> main`, `+ 1a2b...3c4d feat -> feat
/// (forced update)`, ` * [new branch]      feat -> feat`, `HEAD -> feat/x`. An up-to-date push, a quiet one (`-q`), a
/// rejected or deleted ref and a tag print no such line: None.
pub fn parse_push_output(output: &str) -> Option<PushRef> {
    let url = output.lines().find_map(|l| l.strip_prefix("To ")).map(|u| u.trim().to_string()).filter(|u| !u.is_empty());
    let hex = |s: &str| s.len() >= 4 && s.chars().all(|c| c.is_ascii_hexdigit());
    for line in output.lines() {
        let l = line.trim();
        let (short, rest) = if let Some(r) = l.strip_prefix("* [new branch]") {
            (None, r)
        } else {
            let l = l.strip_prefix('+').unwrap_or(l).trim_start();
            let Some((range, rest)) = l.split_once(char::is_whitespace) else { continue };
            let Some((old, new)) = range.split_once("...").or_else(|| range.split_once("..")) else { continue };
            if !hex(old) || !hex(new) {
                continue;
            }
            (Some(new.to_ascii_lowercase()), rest)
        };
        let Some((_, dst)) = rest.split_once(" -> ") else { continue };
        let branch = dst.split_whitespace().next().unwrap_or("").trim_start_matches("refs/heads/");
        if valid_ref_name(branch) {
            return Some(PushRef { url, branch: branch.into(), short });
        }
    }
    None
}

/// A branch or remote name safe to join into a path under `.git`: no `..`, no empty part, no backslash or colon.
fn valid_ref_name(n: &str) -> bool {
    !n.is_empty() && !n.contains(['\\', ':', '\0']) && n.split('/').all(|p| !p.is_empty() && p != "." && !p.contains(".."))
}

/// The remote a push command names: the first word after `push` that is no option (`-o` and `--push-option` take a
/// value). May be a configured remote name or a URL.
fn push_remote(command: &str) -> Option<String> {
    let seg = command.split(['&', ';', '|', '\n']).next().unwrap_or("");
    let mut it = seg.split_whitespace().skip_while(|w| *w != "push").skip(1);
    while let Some(w) = it.next() {
        if matches!(w, "-o" | "--push-option" | "--repo" | "--receive-pack" | "--exec") {
            it.next();
        } else if !w.starts_with('-') {
            return Some(w.to_string());
        }
    }
    None
}

// ---- refs and config, read from .git ----------------------------------------------------------------------------

/// The git dir holding HEAD, and the common one holding config, `refs/remotes` and `packed-refs` (the main repo's
/// `.git` for a linked worktree).
struct GitDirs {
    head: PathBuf,
    common: PathBuf,
}

fn git_dirs(cwd: &Path) -> Option<GitDirs> {
    let head = git::head_file(cwd)?;
    let common = match git::worktree_repo(cwd) {
        Some(repo) => repo.join(".git"),
        None => head.parent()?.to_path_buf(),
    };
    Some(GitDirs { head, common })
}

/// A git config as (section, key, value); a section is `remote "origin"` or `branch "main"`, keys lowercased.
type Config = Vec<(String, String, String)>;

fn parse_config(text: &str) -> Config {
    let mut section = String::new();
    let mut out = vec![];
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with(['#', ';']) {
            continue;
        }
        if let Some(h) = l.strip_prefix('[').and_then(|h| h.split_once(']')).map(|(h, _)| h) {
            section = h.split_whitespace().collect::<Vec<_>>().join(" ");
        } else if let Some((k, v)) = l.split_once('=') {
            out.push((section.clone(), k.trim().to_ascii_lowercase(), v.trim().trim_matches('"').to_string()));
        }
    }
    out
}

fn config_get(config: &Config, section: &str, key: &str) -> Option<String> {
    config.iter().find(|(s, k, _)| s == section && k == key).map(|(_, _, v)| v.clone())
}

fn read_config(common: &Path) -> Config {
    fs::read_to_string(common.join("config")).map(|t| parse_config(&t)).unwrap_or_default()
}

/// The full SHA a ref names: its loose file, then `packed-refs`. `name` is `refs/remotes/<remote>/<branch>`.
pub fn read_ref(common: &Path, name: &str) -> Option<String> {
    if !valid_ref_name(name) {
        return None;
    }
    let full = |s: &str| (s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit())).then(|| s.to_ascii_lowercase());
    if let Some(sha) = fs::read_to_string(common.join(name)).ok().and_then(|t| full(t.trim())) {
        return Some(sha);
    }
    fs::read_to_string(common.join("packed-refs")).ok()?.lines().find_map(|l| {
        let (sha, r) = l.split_once(' ')?;
        if r.trim() == name {
            full(sha)
        } else {
            None
        }
    })
}

/// What a watch follows: one commit of a GitHub repository, on a branch.
#[derive(Clone, Debug, PartialEq)]
pub struct Target {
    pub repo: Repo,
    pub branch: String,
    /// The full 40-hex SHA.
    pub sha: String,
}

impl Target {
    pub fn sha7(&self) -> &str {
        &self.sha[..7]
    }

    /// The real `repos/<owner>/<repo>/commits/<sha>/<what>` path, never the `{owner}/{repo}` placeholders (which
    /// `gh` would fill from its own cwd).
    fn api(&self, what: &str) -> String {
        format!("repos/{}/{}/commits/{}/{what}", self.repo.owner, self.repo.name, self.sha)
    }
}

/// The commit a push sent: the repository from the `To` line (else the remote's `url` in `.git/config`), the branch
/// and short SHA from the ref update line, the full SHA from `refs/remotes/<remote>/<branch>` (git updates it on a
/// successful push), which must start with the short SHA. None for anything else: not GitHub, a quiet or up-to-date
/// push, a push by URL (git keeps no remote ref then), no repository found from `cwd`.
pub fn resolve_push(cwd: &Path, command: &str, output: &str) -> Option<Target> {
    let pushed = parse_push_output(output)?;
    let dirs = git_dirs(cwd)?;
    let config = read_config(&dirs.common);
    let remotes: Vec<(&str, &str)> = config.iter().filter(|(s, k, _)| k == "url" && s.starts_with("remote ")).map(|(s, _, v)| (s["remote ".len()..].trim_matches('"'), v.as_str())).collect();
    let by_name = |n: &str| remotes.iter().find(|(r, _)| *r == n).copied();
    let to = pushed.url.as_deref().and_then(parse_remote_url);
    let remote = match push_remote(command) {
        Some(arg) => by_name(&arg)?,
        None => to.as_ref().and_then(|to| remotes.iter().find(|(_, u)| parse_remote_url(u).as_ref() == Some(to)).copied()).or_else(|| by_name("origin"))?,
    };
    let repo = to.or_else(|| parse_remote_url(remote.1))?;
    let sha = read_ref(&dirs.common, &format!("refs/remotes/{}/{}", remote.0, pushed.branch))?;
    if pushed.short.as_deref().is_some_and(|s| !sha.starts_with(s)) {
        return None;
    }
    Some(Target { repo, branch: pushed.branch, sha })
}

/// The start check's inputs for a folder: the branch from `.git/HEAD`, its remote ref (its `branch.<b>.remote`, else
/// `origin`) and the repository from that remote's `url`. None for a detached HEAD, no remote ref, or not GitHub.
pub fn start_target(cwd: &Path) -> Option<Target> {
    let dirs = git_dirs(cwd)?;
    let head = fs::read_to_string(&dirs.head).ok()?;
    let branch = head.trim().strip_prefix("ref:")?.trim().strip_prefix("refs/heads/")?.to_string();
    if !valid_ref_name(&branch) {
        return None;
    }
    let config = read_config(&dirs.common);
    let remote = config_get(&config, &format!("branch \"{branch}\""), "remote").filter(|r| r != ".").unwrap_or_else(|| "origin".into());
    let repo = parse_remote_url(&config_get(&config, &format!("remote \"{remote}\""), "url")?)?;
    let sha = read_ref(&dirs.common, &format!("refs/remotes/{remote}/{branch}"))?;
    Some(Target { repo, branch, sha })
}

// ---- the verdict ------------------------------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub enum Verdict {
    /// No check-run and no status.
    NoCi,
    Running,
    /// One check failed; its name.
    Fail(String),
    /// Every check passed (a watch still waits for a second poll with the same checks).
    Pass,
}

/// One reading of a commit's checks.
#[derive(Clone, Debug, PartialEq)]
pub struct Snapshot {
    pub verdict: Verdict,
    pub done: u32,
    pub total: u32,
    /// Every check, as `run:<name>` / `status:<context>`, sorted: two polls saw "the same set" when these are equal.
    pub ids: Vec<String>,
}

enum Outcome {
    Pending,
    Ok,
    Bad,
}

fn run_outcome(r: &Value) -> Outcome {
    if r["status"] != "completed" {
        return Outcome::Pending;
    }
    match r["conclusion"].as_str() {
        Some("failure" | "timed_out" | "cancelled" | "action_required" | "startup_failure") => Outcome::Bad,
        Some(_) => Outcome::Ok, // success, neutral, skipped (and a stale run)
        None => Outcome::Pending,
    }
}

fn status_outcome(s: &Value) -> Outcome {
    match s["state"].as_str() {
        Some("success") => Outcome::Ok,
        Some("failure" | "error") => Outcome::Bad,
        _ => Outcome::Pending,
    }
}

/// The verdict over `gh api .../check-runs` and `.../status` output of one commit: fail as soon as any check is
/// completed badly, pass when every check passed, running otherwise. Err when either is no JSON of the expected shape.
pub fn evaluate(check_runs: &str, status: &str) -> Result<Snapshot, String> {
    let runs: Value = serde_json::from_str(check_runs).map_err(|_| "check-runs: not JSON".to_string())?;
    let stat: Value = serde_json::from_str(status).map_err(|_| "status: not JSON".to_string())?;
    let runs = runs["check_runs"].as_array().ok_or("check-runs: no check_runs list")?;
    // the combined `state` of a commit with no statuses is "pending": only the list is read
    let stats = stat["statuses"].as_array().ok_or("status: no statuses list")?;
    let all = runs
        .iter()
        .map(|r| ("run", r["name"].as_str(), run_outcome(r)))
        .chain(stats.iter().map(|s| ("status", s["context"].as_str(), status_outcome(s))));
    let (mut ids, mut done, mut failed) = (vec![], 0, None);
    for (kind, name, outcome) in all {
        match outcome {
            Outcome::Ok => done += 1,
            Outcome::Bad => {
                done += 1;
                failed.get_or_insert_with(|| registry::clip(name.filter(|n| !n.is_empty()).unwrap_or("check")));
            }
            Outcome::Pending => {}
        }
        ids.push(format!("{kind}:{}", name.unwrap_or("")));
    }
    ids.sort();
    let total = ids.len() as u32;
    let verdict = match failed {
        Some(check) => Verdict::Fail(check),
        None if total == 0 => Verdict::NoCi,
        None if done == total => Verdict::Pass,
        None => Verdict::Running,
    };
    Ok(Snapshot { verdict, done, total, ids })
}

// ---- gh ---------------------------------------------------------------------------------------------------------

/// Why a `gh` call gave nothing.
#[derive(Clone, Debug, PartialEq)]
pub enum GhError {
    /// `gh` is not installed (no candidate started).
    Missing,
    NotLoggedIn,
    /// 403 or 404: the login has no access to the repository.
    NoAccess,
    /// A rate limit; the reset time (epoch seconds) when `gh` printed it.
    RateLimit(Option<i64>),
    Other(String),
}

/// `gh <args>` and its standard output. Arguments go straight to the process, never through a shell.
pub trait Gh {
    fn run(&self, args: &[&str]) -> Result<String, GhError>;
}

/// What `gh` printed on failure, as an error. The API's own words (`HTTP 404`, `rate limit`) come through stderr.
pub fn classify_failure(code: Option<i32>, stderr: &str) -> GhError {
    let t = stderr.to_ascii_lowercase();
    if t.contains("rate limit") || t.contains("http 429") {
        let reset = t.split("x-ratelimit-reset:").nth(1).and_then(|r| r.split_whitespace().next()).and_then(|n| n.parse().ok());
        GhError::RateLimit(reset)
    } else if code == Some(4) || t.contains("http 401") || t.contains("gh auth login") || t.contains("not logged in") {
        GhError::NotLoggedIn
    } else if t.contains("http 403") || t.contains("http 404") {
        GhError::NoAccess
    } else {
        GhError::Other(registry::clip(stderr.lines().next().unwrap_or("gh failed").trim()))
    }
}

/// Where to look for `gh`: on PATH first, then the known install paths (an app started from Finder or the Dock does
/// not get the shell's PATH).
fn candidates() -> Vec<String> {
    let mut c = vec!["gh".to_string()];
    #[cfg(windows)]
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        c.extend(std::env::var(var).map(|p| format!("{p}\\GitHub CLI\\gh.exe")));
    }
    #[cfg(windows)]
    c.extend(std::env::var("LOCALAPPDATA").map(|l| format!("{l}\\Programs\\GitHub CLI\\gh.exe")));
    #[cfg(target_os = "macos")]
    c.extend(["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/opt/local/bin/gh"].map(String::from));
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        c.extend(["/usr/bin/gh", "/usr/local/bin/gh", "/snap/bin/gh"].map(String::from));
        c.extend(std::env::home_dir().map(|h| h.join(".local/bin/gh").to_string_lossy().into_owned()));
    }
    c
}

/// Calls are serialized, app-wide: one `gh` process at a time.
static RUNNING: Mutex<()> = Mutex::new(());

/// The real `gh`: the user's own login, no token read or kept by the app.
pub struct RealGh;

impl Gh for RealGh {
    fn run(&self, args: &[&str]) -> Result<String, GhError> {
        let _one_at_a_time = crate::lock(&RUNNING);
        for exe in candidates() {
            let mut cmd = no_window(Command::new(&exe));
            cmd.args(args).env("GH_PROMPT_DISABLED", "1").stdin(Stdio::null());
            let Ok(out) = cmd.output() else { continue };
            return if out.status.success() {
                Ok(String::from_utf8_lossy(&out.stdout).into_owned())
            } else {
                Err(classify_failure(out.status.code(), &String::from_utf8_lossy(&out.stderr)))
            };
        }
        Err(GhError::Missing)
    }
}

/// What `gh auth status` says, for the Settings line under the switch.
#[derive(Debug, PartialEq)]
pub enum GhAuth {
    Ready,
    NotFound,
    NotLoggedIn,
}

pub fn auth_status(gh: &dyn Gh) -> GhAuth {
    match gh.run(&["auth", "status"]) {
        Ok(_) => GhAuth::Ready,
        Err(GhError::Missing) => GhAuth::NotFound,
        Err(_) => GhAuth::NotLoggedIn,
    }
}

// ---- the opener's URL -------------------------------------------------------------------------------------------

/// The commit's checks page, built from the watch (never from UI input).
pub fn checks_url(t: &Target) -> String {
    format!("https://github.com/{}/{}/commit/{}/checks", t.repo.owner, t.repo.name, t.sha)
}

/// Whether `url` is exactly such a page: no `&`, `%` or space can reach `cmd /c start`.
pub fn valid_checks_url(url: &str) -> bool {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/[0-9a-f]{40}/checks$").expect("static pattern")).is_match(url)
}

// ---- the watches ------------------------------------------------------------------------------------------------

/// Who a watch was started for: the pushing session, or a folder's start check (no session).
#[derive(Clone, Debug, PartialEq)]
pub struct Who {
    pub session_id: Option<String>,
    pub name: String,
    pub dept: String,
    pub cwd: String,
}

/// How a watch ended.
#[derive(Clone, Debug, PartialEq)]
pub enum Ended {
    Pass,
    /// The first failed check.
    Fail(String),
    Timeout,
    Error,
    /// No CI for the branch: ends silently.
    NoCi,
    /// `gh` missing, not logged in, or no access: the reason, for Settings > Status.
    Skipped(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Finished {
    pub who: Who,
    pub target: Target,
    pub ended: Ended,
}

struct Watch {
    id: u64,
    who: Who,
    target: Target,
    started_ms: i64,
    next_ms: i64,
    /// A folder's start check: unlit until it sees a check, since an old commit may have no CI at all.
    start_check: bool,
    /// The checks the last poll saw, for the two-stable-polls rule.
    prev_ids: Option<Vec<String>>,
    seen: bool,
    failures: u32,
}

/// What the card of a session and the lamp of a folder show; `id` orders them (higher is newer).
struct Entry {
    id: u64,
    who: Who,
    ci: CiState,
    /// The watched commit, for the card's and the lamp's click (`open_target`).
    target: Target,
}

enum Poll {
    Keep,
    End(Ended),
    Pause(i64),
}

/// Every CI watch of the run, and what they show. Driven by `tick` with the clock passed in (epoch ms).
#[derive(Default)]
pub struct Watcher {
    watches: Vec<Watch>,
    entries: Vec<Entry>,
    next_id: u64,
    /// Every watch waits until this time (a rate limit).
    paused_until_ms: i64,
    /// Departments whose start check ran, or that pushed, this run.
    checked: HashSet<String>,
}

fn ci_state(t: &Target, state: CiStatus) -> CiState {
    CiState { repo: t.repo.slug(), branch: t.branch.clone(), sha7: t.sha7().into(), state, done: 0, total: 0, failed: None }
}

fn same_branch(a: &Target, b: &Target) -> bool {
    a.repo.slug().eq_ignore_ascii_case(&b.repo.slug()) && a.branch == b.branch
}

/// The core rate limit's reset (epoch seconds), from `gh api rate_limit` (which GitHub does not count).
fn rate_limit_reset(gh: &dyn Gh) -> Option<i64> {
    let v: Value = serde_json::from_str(&gh.run(&["api", "rate_limit"]).ok()?).ok()?;
    v["resources"]["core"]["reset"].as_i64()
}

impl Watcher {
    /// A live push by a session. With `enabled` false: nothing, and no `gh` call ever follows. Returns whether a watch
    /// started. A push also counts as its folder's start check.
    pub fn on_push(&mut self, enabled: bool, push: &CiPush, now_ms: i64) -> bool {
        if !enabled {
            return false;
        }
        self.checked.insert(push.dept.clone());
        let Some(target) = resolve_push(Path::new(&push.cwd), &push.command, &push.output) else { return false };
        let who = Who { session_id: Some(push.session_id.clone()), name: push.name.clone(), dept: push.dept.clone(), cwd: push.cwd.clone() };
        self.start(target, who, now_ms, false);
        true
    }

    /// The first time `dept` is seen in a run: look up its latest CI once (the commit on its branch's remote ref) and
    /// watch it like a push, but polled at once. At most once per folder per run; nothing while `enabled` is false, for
    /// a detached HEAD, a branch with no remote ref or a non-GitHub remote, or when that branch is already watched.
    pub fn start_check(&mut self, enabled: bool, dept: &str, cwd: &str, now_ms: i64) -> bool {
        if !enabled || !self.checked.insert(dept.to_string()) {
            return false;
        }
        let Some(target) = start_target(Path::new(cwd)) else { return false };
        if self.watches.iter().any(|w| same_branch(&w.target, &target)) {
            return false;
        }
        let who = Who { session_id: None, name: dept.into(), dept: dept.into(), cwd: cwd.into() };
        self.start(target, who, now_ms, true);
        true
    }

    fn start(&mut self, target: Target, who: Who, now_ms: i64, start_check: bool) {
        // a new push to the same repo and branch replaces that watch; the same session's last card line goes too
        let replaced: Vec<u64> = self.watches.iter().filter(|w| same_branch(&w.target, &target)).map(|w| w.id).collect();
        self.watches.retain(|w| !replaced.contains(&w.id));
        self.entries.retain(|e| !replaced.contains(&e.id) && (e.who.session_id.is_none() || e.who.session_id != who.session_id));
        while self.watches.len() >= MAX_WATCHES {
            let dropped = self.watches.remove(0).id; // the oldest
            self.entries.retain(|e| e.id != dropped);
        }
        self.next_id += 1;
        let id = self.next_id;
        let state = if start_check { CiStatus::None } else { CiStatus::Running };
        let first = if start_check { 0 } else { FIRST_CALL_MS };
        self.entries.push(Entry { id, who: who.clone(), ci: ci_state(&target, state), target: target.clone() });
        self.watches.push(Watch { id, who, target, started_ms: now_ms, next_ms: now_ms + first, start_check, prev_ids: None, seen: false, failures: 0 });
    }

    /// Runs every due poll, one `gh` call at a time, and returns the watches that ended. With `enabled` false every
    /// watch and its lamp are dropped and no call is made. While a rate limit pauses, nothing runs.
    pub fn tick(&mut self, gh: &dyn Gh, now_ms: i64, enabled: bool) -> Vec<Finished> {
        if !enabled {
            self.watches.clear();
            self.entries.clear();
            self.checked.clear();
            return vec![];
        }
        let mut finished = vec![];
        if now_ms < self.paused_until_ms {
            return finished;
        }
        let mut i = 0;
        while i < self.watches.len() {
            if now_ms < self.watches[i].next_ms {
                i += 1;
                continue;
            }
            match self.poll(i, gh, now_ms) {
                Poll::Keep => i += 1,
                Poll::End(ended) => {
                    let w = self.watches.remove(i);
                    self.set_ended(&w, &ended);
                    finished.push(Finished { who: w.who, target: w.target, ended });
                }
                Poll::Pause(until) => {
                    self.paused_until_ms = until;
                    break;
                }
            }
        }
        finished
    }

    /// One poll of watch `i`: the cap, the two `gh` calls, the verdict.
    fn poll(&mut self, i: usize, gh: &dyn Gh, now_ms: i64) -> Poll {
        let w = &self.watches[i];
        if now_ms - w.started_ms >= CAP_MS {
            return Poll::End(Ended::Timeout);
        }
        let fetched = gh.run(&["api", &w.target.api("check-runs?per_page=100")]).and_then(|runs| Ok((runs, gh.run(&["api", &w.target.api("status")])?)));
        let snap = fetched.and_then(|(runs, status)| evaluate(&runs, &status).map_err(GhError::Other));
        let w = &mut self.watches[i];
        w.next_ms = (now_ms + POLL_MS).min(w.started_ms + CAP_MS);
        let snap = match snap {
            Ok(s) => s,
            Err(GhError::Missing) => return Poll::End(Ended::Skipped("gh not found".into())),
            Err(GhError::NotLoggedIn) => return Poll::End(Ended::Skipped("gh not logged in".into())),
            Err(GhError::NoAccess) => return Poll::End(Ended::Skipped(format!("no access to {}", w.target.repo.slug()))),
            Err(GhError::RateLimit(reset)) => {
                w.next_ms = now_ms; // due again the moment the pause is over
                let reset_ms = reset.or_else(|| rate_limit_reset(gh)).map_or(now_ms + DEFAULT_PAUSE_MS, |s| s * 1000);
                return Poll::Pause(reset_ms.max(now_ms + 5_000));
            }
            Err(GhError::Other(_)) => {
                w.failures += 1;
                return if w.failures >= MAX_FAILURES { Poll::End(Ended::Error) } else { Poll::Keep };
            }
        };
        w.failures = 0;
        w.seen |= snap.total > 0;
        let stable = w.prev_ids.as_ref() == Some(&snap.ids);
        w.prev_ids = Some(snap.ids.clone());
        let (id, started, state) = (w.id, w.started_ms, if w.start_check && !w.seen { CiStatus::None } else { CiStatus::Running });
        match snap.verdict {
            Verdict::Fail(check) => Poll::End(Ended::Fail(check)),
            Verdict::Pass if stable => Poll::End(Ended::Pass),
            Verdict::NoCi if now_ms - started >= NO_CI_MS => Poll::End(Ended::NoCi),
            _ => {
                if let Some(e) = self.entries.iter_mut().find(|e| e.id == id) {
                    e.ci.state = state;
                    (e.ci.done, e.ci.total) = (snap.done, snap.total);
                }
                Poll::Keep
            }
        }
    }

    /// Records how watch `w` ended on its card and lamp (if a later push of the session did not remove the line).
    fn set_ended(&mut self, w: &Watch, ended: &Ended) {
        let Some(e) = self.entries.iter_mut().find(|e| e.id == w.id) else { return };
        (e.ci.state, e.ci.failed) = match ended {
            Ended::Pass => (CiStatus::Pass, None),
            Ended::Fail(c) => (CiStatus::Fail, Some(c.clone())),
            Ended::Timeout => (CiStatus::Timeout, None),
            Ended::Error => (CiStatus::Error, None),
            Ended::NoCi | Ended::Skipped(_) => (CiStatus::None, None),
        };
        if *ended == Ended::Pass {
            e.ci.done = e.ci.total;
        }
    }

    /// The card line of a session: its latest push's CI; None before it pushed, or when no CI was found.
    #[cfg(test)]
    pub fn card(&self, session_id: &str) -> Option<CiState> {
        self.entries.iter().find(|e| e.who.session_id.as_deref() == Some(session_id)).map(|e| e.ci.clone()).filter(|c| c.state != CiStatus::None)
    }

    /// The newest watch of each folder (department), in the order the folders first appeared.
    fn newest(&self) -> Vec<&Entry> {
        let mut newest: Vec<&Entry> = vec![];
        for e in &self.entries {
            match newest.iter().position(|n| n.who.dept == e.who.dept) {
                Some(p) if newest[p].id < e.id => newest[p] = e,
                Some(_) => {}
                None => newest.push(e),
            }
        }
        newest
    }

    /// The lamp of each folder (department): the CI of its newest watch. `none` means unlit.
    #[cfg(test)]
    pub fn lamps(&self) -> Vec<(String, CiState)> {
        self.newest().into_iter().map(|e| (e.who.dept.clone(), e.ci.clone())).collect()
    }

    /// `lamps`, as the `ci-lamps` event sends them, with the folder's working directory, sorted by department.
    pub fn lamp_rows(&self) -> Vec<Lamp> {
        let mut rows: Vec<Lamp> = self
            .newest()
            .into_iter()
            .map(|e| Lamp { dept: e.who.dept.clone(), cwd: e.who.cwd.clone(), state: e.ci.state, branch: e.ci.branch.clone(), sha7: e.ci.sha7.clone(), failed: e.ci.failed.clone() })
            .collect();
        rows.sort_by(|a, b| a.dept.cmp(&b.dept));
        rows
    }

    /// Every session's card line (a session id and its CI), the ones with something to show.
    pub fn cards(&self) -> HashMap<String, CiState> {
        self.entries.iter().filter(|e| e.ci.state != CiStatus::None).filter_map(|e| Some((e.who.session_id.clone()?, e.ci.clone()))).collect()
    }

    /// What `ci_open` may open: each watch's commit, with its session and folder.
    pub fn links(&self) -> Vec<Link> {
        self.entries.iter().map(|e| Link { id: e.id, session_id: e.who.session_id.clone(), dept: e.who.dept.clone(), state: e.ci.state, target: e.target.clone() }).collect()
    }

    /// The time (epoch ms) a rate limit holds every watch until; in the past when none does.
    pub fn paused_until(&self) -> i64 {
        self.paused_until_ms
    }

    /// Watches running now.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.watches.len()
    }
}

// ---- the lamps, the opener and the events -----------------------------------------------------------------------

/// One folder's lamp, as the `ci-lamps` event and the `ci_lamps` command give it. `state` `none`, `timeout` and
/// `error` are unlit; `running` amber, `pass` green, `fail` red.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lamp {
    pub dept: String,
    pub cwd: String,
    pub state: CiStatus,
    pub branch: String,
    pub sha7: String,
    pub failed: Option<String>,
}

/// Whether `next` differs from the lamps last sent; `sent` becomes `next` when it does. The event goes out on a
/// change only, so a count moving from 2/5 to 3/5 (not part of a lamp) sends nothing.
pub fn lamps_changed(sent: &mut Vec<Lamp>, next: &[Lamp]) -> bool {
    if sent.as_slice() == next {
        return false;
    }
    *sent = next.to_vec();
    true
}

/// A watch the opener may name: its session (None for a folder's start check), its folder, its commit.
#[derive(Clone, Debug, PartialEq)]
pub struct Link {
    pub id: u64,
    pub session_id: Option<String>,
    pub dept: String,
    pub state: CiStatus,
    pub target: Target,
}

/// The checks page `ci_open` opens for `who`: a session id (its own watch) or a department name (the newest watch of
/// that folder). Never a URL from the caller: it is built from the watch and checked before it is returned. An unknown
/// name, a watch with nothing to show, or a URL that fails the check is an error, and nothing is opened.
pub fn open_target(links: &[Link], who: &str) -> Result<String, String> {
    let by_session = || links.iter().filter(|l| l.session_id.as_deref() == Some(who)).max_by_key(|l| l.id);
    let by_dept = || links.iter().filter(|l| l.dept == who).max_by_key(|l| l.id);
    let link = by_session().or_else(by_dept).ok_or("no CI watch for that session or folder")?;
    if link.state == CiStatus::None {
        return Err("no CI to show for that folder".into());
    }
    let url = checks_url(&link.target);
    if !valid_checks_url(&url) {
        return Err("not a checks page".into());
    }
    Ok(url)
}

/// The Chronicon event of a verdict: `ci-pass` or `ci-fail` (the branch, the short SHA and the failed check). Only
/// for a watch a session's push started: a folder's start check is the last known state, not news. None for any
/// other ending.
pub fn verdict_event(f: &Finished, now_ms: i64) -> Option<Event> {
    let session_id = f.who.session_id.clone()?;
    let base = format!("{} · {}", f.target.branch, f.target.sha7());
    let (kind, detail) = match &f.ended {
        Ended::Pass => ("ci-pass", base),
        Ended::Fail(check) => ("ci-fail", format!("{base} · {check}")),
        _ => return None,
    };
    Some(Event { ts: now_ms, kind: kind.into(), session_id, name: f.who.name.clone(), dept: f.who.dept.clone(), helper: None, detail: registry::clip(&detail), reset_ms: None, hit_ms: None })
}

// ---- the watcher thread -----------------------------------------------------------------------------------------

/// What the poll loop hands the watcher each tick.
#[derive(Default)]
pub struct Input {
    /// `adm.ci`.
    pub enabled: bool,
    /// Live pushes read this tick.
    pub pushes: Vec<CiPush>,
    /// Folders (department, working directory) seen: each one gets its start check the first time in a run.
    pub folders: Vec<(String, String)>,
}

/// What one step of the worker produced.
pub struct Step {
    /// For the `gh` entry of `integration_status`, in order.
    pub notes: Vec<(status::State, String)>,
    pub finished: Vec<Finished>,
}

/// The state of the watcher thread: the watches, and whether `gh auth status` ran for this time the setting is on.
/// `step` takes the `gh` runner and the clock as arguments, so tests drive it without a thread or a process.
#[derive(Default)]
pub struct Worker {
    watcher: Watcher,
    on: bool,
    /// The rate-limit pause already noted (its end, epoch ms).
    pause_noted: i64,
}

impl Worker {
    /// One round: the hand-in, then every due poll. With `enabled` false no `gh` call is made and every watch is dropped;
    /// turning it on runs `gh auth status` once (never in the settings-save path: this runs on the watcher thread).
    pub fn step(&mut self, gh: &dyn Gh, now_ms: i64, input: Input) -> Step {
        let mut notes = vec![];
        if input.enabled && !self.on {
            notes.push(match auth_status(gh) {
                GhAuth::Ready => (status::State::Ok, "gh ready".to_string()),
                GhAuth::NotFound => (status::State::Warn, "gh not found".to_string()),
                GhAuth::NotLoggedIn => (status::State::Warn, "gh not logged in: run gh auth login".to_string()),
            });
        }
        self.on = input.enabled;
        // a push first: it counts as its folder's start check
        for push in &input.pushes {
            self.watcher.on_push(input.enabled, push, now_ms);
        }
        for (dept, cwd) in &input.folders {
            self.watcher.start_check(input.enabled, dept, cwd, now_ms);
        }
        let finished = self.watcher.tick(gh, now_ms, input.enabled);
        for f in &finished {
            match &f.ended {
                Ended::Skipped(reason) => notes.push((status::State::Warn, format!("CI check skipped: {reason}"))),
                Ended::Error => notes.push((status::State::Warn, "CI check failed: gh gave no usable answer three times in a row".to_string())),
                // gh answered: any earlier complaint is over
                Ended::Pass | Ended::Fail(_) => notes.push((status::State::Ok, "gh ready".to_string())),
                Ended::Timeout | Ended::NoCi => {}
            }
        }
        let until = self.watcher.paused_until();
        if !input.enabled {
            self.pause_noted = 0;
        } else if until > now_ms && until != self.pause_noted {
            self.pause_noted = until;
            notes.push((status::State::Warn, format!("CI checks paused: GitHub rate limit, back in about {} min", (until - now_ms + 59_999) / 60_000)));
        }
        Step { notes, finished }
    }
}

/// What the watcher thread shares with the poll loop and the commands: an inbox it drains, and the view it fills.
/// No lock is held across a `gh` call.
#[derive(Default)]
pub struct Hub {
    inbox: Mutex<Input>,
    wake: Condvar,
    view: Mutex<View>,
}

#[derive(Default)]
struct View {
    cards: HashMap<String, CiState>,
    lamps: Vec<Lamp>,
    links: Vec<Link>,
    verdicts: Vec<Finished>,
    /// The lamps last handed out by `lamps_if_changed`.
    sent: Vec<Lamp>,
}

impl Hub {
    /// The poll loop's hand-in, once per tick. With `enabled` false whatever was waiting is dropped, so nothing from
    /// the time the setting was off ever reaches a `gh` call.
    pub fn submit(&self, enabled: bool, pushes: Vec<CiPush>, folders: Vec<(String, String)>) {
        let mut inbox = crate::lock(&self.inbox);
        inbox.enabled = enabled;
        if enabled {
            inbox.pushes.extend(pushes);
            for (dept, cwd) in folders {
                if !inbox.folders.iter().any(|(d, _)| *d == dept) {
                    inbox.folders.push((dept, cwd));
                }
            }
        } else {
            inbox.pushes.clear();
            inbox.folders.clear();
        }
        drop(inbox);
        self.wake.notify_one();
    }

    /// The card line of a session.
    pub fn card(&self, session_id: &str) -> Option<CiState> {
        crate::lock(&self.view).cards.get(session_id).cloned()
    }

    /// Every folder's lamp now.
    pub fn lamps(&self) -> Vec<Lamp> {
        crate::lock(&self.view).lamps.clone()
    }

    /// The lamps when they differ from the last time this was called, else None (the `ci-lamps` event).
    pub fn lamps_if_changed(&self) -> Option<Vec<Lamp>> {
        let mut v = crate::lock(&self.view);
        let next = v.lamps.clone();
        lamps_changed(&mut v.sent, &next).then_some(next)
    }

    /// The verdicts since the last call, for their Chronicon events.
    pub fn take_verdicts(&self) -> Vec<Finished> {
        std::mem::take(&mut crate::lock(&self.view).verdicts)
    }

    /// The checks URL for a session id or a department name (`open_target`).
    pub fn open_url_for(&self, who: &str) -> Result<String, String> {
        open_target(&crate::lock(&self.view).links, who)
    }

    /// Waits up to a second for the poll loop's hand-in, then takes it.
    fn next(&self) -> Input {
        let mut inbox = crate::lock(&self.inbox);
        if inbox.pushes.is_empty() && inbox.folders.is_empty() {
            inbox = self.wake.wait_timeout(inbox, Duration::from_secs(1)).unwrap_or_else(|e| e.into_inner()).0;
        }
        Input { enabled: inbox.enabled, pushes: std::mem::take(&mut inbox.pushes), folders: std::mem::take(&mut inbox.folders) }
    }

    fn publish(&self, worker: &Worker, finished: Vec<Finished>) {
        let mut v = crate::lock(&self.view);
        v.cards = worker.watcher.cards();
        v.lamps = worker.watcher.lamp_rows();
        v.links = worker.watcher.links();
        v.verdicts.extend(finished);
    }

    /// The watcher thread's loop: it owns the `Watcher`, the clock and every `gh` call (one at a time).
    fn run(&self, gh: &dyn Gh) {
        let mut worker = Worker::default();
        loop {
            let input = self.next();
            // transcripts are untrusted input: a panic is logged and skipped, the watcher goes on
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker.step(gh, crate::now_ms(), input))) {
                Ok(step) => {
                    for (state, message) in step.notes {
                        status::report_change("gh", state, message);
                    }
                    self.publish(&worker, step.finished);
                }
                Err(_) => status::report("gh", status::State::Error, "CI watcher panicked, skipped"),
            }
        }
    }
}

/// Starts the watcher thread on the user's own `gh`. Nothing runs until `Hub::submit` says `adm.ci` is on.
pub fn spawn(hub: Arc<Hub>) {
    std::thread::spawn(move || hub.run(&RealGh));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{cell::RefCell, collections::VecDeque};

    const SHA: &str = "5d6e7f80123456789abcdef0123456789abcdef0";
    const PUSHED: &str = "To github.com:o/r.git\n   1a2b3c4..5d6e7f8  main -> main\n";

    // ---- recorded-shape `gh api` JSON (trimmed to the fields read) ----

    type Runs<'a> = &'a [(&'a str, &'a str, Option<&'a str>)];

    fn runs(list: Runs) -> String {
        let r: Vec<Value> = list.iter().map(|(n, s, c)| json!({"id": 1, "name": n, "status": s, "conclusion": c, "head_sha": SHA})).collect();
        json!({"total_count": r.len(), "check_runs": r}).to_string()
    }

    fn statuses(list: &[(&str, &str)]) -> String {
        let s: Vec<Value> = list.iter().map(|(c, st)| json!({"context": c, "state": st})).collect();
        // GitHub's combined state is "pending" when there are no statuses at all
        json!({"state": "pending", "sha": SHA, "total_count": s.len(), "statuses": s}).to_string()
    }

    const NONE: &[(&str, &str)] = &[];

    fn verdict(r: Runs, s: &[(&str, &str)]) -> (Verdict, u32, u32) {
        let snap = evaluate(&runs(r), &statuses(s)).unwrap();
        (snap.verdict, snap.done, snap.total)
    }

    fn ok(c: &str) -> (&str, &str, Option<&str>) {
        (c, "completed", Some("success"))
    }

    #[test]
    fn pass_when_every_check_passed() {
        assert_eq!(verdict(&[ok("build"), ok("lint")], NONE), (Verdict::Pass, 2, 2));
    }

    #[test]
    fn a_failed_check_fails_at_once_even_while_others_run() {
        let r = [("build", "completed", Some("failure")), ("e2e", "in_progress", None), ("lint", "queued", None)];
        assert_eq!(verdict(&r, NONE), (Verdict::Fail("build".into()), 1, 3));
        for c in ["failure", "timed_out", "cancelled", "action_required", "startup_failure"] {
            assert_eq!(verdict(&[("x", "completed", Some(c))], NONE).0, Verdict::Fail("x".into()), "{c}");
        }
    }

    #[test]
    fn running_counts_done_over_total() {
        let r = [ok("a"), ("b", "in_progress", None), ("c", "queued", None), ("d", "completed", Some("neutral")), ("e", "waiting", None)];
        assert_eq!(verdict(&r, NONE), (Verdict::Running, 2, 5));
    }

    #[test]
    fn no_ci_is_no_check_run_and_no_status() {
        assert_eq!(verdict(&[], NONE), (Verdict::NoCi, 0, 0), "the combined state is `pending` here: it must not read as a status");
    }

    #[test]
    fn statuses_alone_decide() {
        assert_eq!(verdict(&[], &[("ci/jenkins", "success"), ("ci/lint", "success")]), (Verdict::Pass, 2, 2));
        assert_eq!(verdict(&[], &[("ci/jenkins", "pending")]), (Verdict::Running, 0, 1));
        assert_eq!(verdict(&[], &[("ci/jenkins", "failure")]).0, Verdict::Fail("ci/jenkins".into()));
        assert_eq!(verdict(&[], &[("ci/jenkins", "error")]).0, Verdict::Fail("ci/jenkins".into()));
    }

    #[test]
    fn check_runs_and_statuses_mix() {
        assert_eq!(verdict(&[ok("build")], &[("ci/x", "success")]), (Verdict::Pass, 2, 2));
        assert_eq!(verdict(&[ok("build")], &[("ci/x", "pending")]), (Verdict::Running, 1, 2), "a pending status holds the verdict");
        assert_eq!(verdict(&[ok("build")], &[("ci/x", "failure")]).0, Verdict::Fail("ci/x".into()));
        let failed = [("build", "completed", Some("failure"))];
        assert_eq!(verdict(&failed, &[("ci/x", "failure")]).0, Verdict::Fail("build".into()), "the first failed check is named");
    }

    #[test]
    fn a_skipped_or_neutral_check_counts_as_passed() {
        let r = [ok("build"), ("deploy", "completed", Some("skipped")), ("note", "completed", Some("neutral"))];
        assert_eq!(verdict(&r, NONE), (Verdict::Pass, 3, 3));
    }

    #[test]
    fn unreadable_answers_are_errors_not_verdicts() {
        assert!(evaluate("not json", &statuses(&[])).is_err());
        assert!(evaluate(&runs(&[]), "{}").is_err(), "no statuses list");
        assert!(evaluate("{\"message\":\"Not Found\"}", &statuses(&[])).is_err());
    }

    // ---- push output, remote URLs ----

    #[test]
    fn github_remote_urls() {
        let repo = |u: &str| parse_remote_url(u).map(|r| r.slug());
        for u in [
            "git@github.com:o/r.git",
            "github.com:o/r.git",
            "https://github.com/o/r.git",
            "https://github.com/o/r",
            "https://github.com/o/r/",
            "https://user@github.com/o/r.git",
            "ssh://git@github.com/o/r.git",
            "ssh://git@github.com:22/o/r.git",
            "git://github.com/o/r.git",
        ] {
            assert_eq!(repo(u).as_deref(), Some("o/r"), "{u}");
        }
        assert_eq!(repo("git@github.com:Some-Org/my.repo_2.git").as_deref(), Some("Some-Org/my.repo_2"));
        for u in [
            "git@gitlab.com:o/r.git",
            "https://github.example.com/o/r",
            "https://evilgithub.com/o/r",
            "https://github.com.evil.com/o/r",
            "https://github.com/o",
            "https://github.com/o/r/extra",
            "file:///o/r",
            "../r",
            "",
            "git@github.com:o/r s.git",
            "https://github.com/../r",
        ] {
            assert_eq!(repo(u), None, "{u:?}");
        }
    }

    fn pushed(out: &str) -> Option<(Option<String>, String, Option<String>)> {
        parse_push_output(out).map(|p| (p.url, p.branch, p.short))
    }

    #[test]
    fn push_output_ssh_and_https() {
        let ssh = "Enumerating objects: 5, done.\nTo github.com:o/r.git\n   1a2b3c4..5d6e7f8  main -> main\n";
        assert_eq!(pushed(ssh), Some((Some("github.com:o/r.git".into()), "main".into(), Some("5d6e7f8".into()))));
        let https = "remote: Resolving deltas: 100% (1/1), completed.\nTo https://github.com/o/r.git\n   abcdef0..1234567  HEAD -> feat/x\n";
        assert_eq!(pushed(https), Some((Some("https://github.com/o/r.git".into()), "feat/x".into(), Some("1234567".into()))));
    }

    #[test]
    fn push_output_new_branch_forced_and_nothing() {
        let new = "To github.com:o/r.git\n * [new branch]      claude/x -> claude/x\nbranch 'claude/x' set up to track 'origin/claude/x'.\n";
        assert_eq!(pushed(new), Some((Some("github.com:o/r.git".into()), "claude/x".into(), None)));
        let forced = "To github.com:o/r.git\n + 1a2b3c4...5d6e7f8 feat -> feat (forced update)\n";
        assert_eq!(pushed(forced), Some((Some("github.com:o/r.git".into()), "feat".into(), Some("5d6e7f8".into()))));
        assert_eq!(pushed("To x\n   1a2b3c4..5d6e7f8  src -> refs/heads/dst\n").map(|p| p.1).as_deref(), Some("dst"));
        assert_eq!(pushed("Everything up-to-date\n"), None, "up to date");
        assert_eq!(pushed(""), None, "-q: no output");
        assert_eq!(pushed("To github.com:o/r.git\n * [new tag]         v1 -> v1\n"), None, "a tag");
        assert_eq!(pushed("To github.com:o/r.git\n - [deleted]         old\n"), None);
        assert_eq!(pushed("To github.com:o/r.git\n ! [rejected]        main -> main (fetch first)\n"), None);
        assert_eq!(pushed("To github.com:o/r.git\n   1a2b3c4..5d6e7f8  main -> ../../etc\n"), None, "no path tricks");
    }

    #[test]
    fn the_remote_a_command_names() {
        assert_eq!(push_remote("git push").as_deref(), None);
        assert_eq!(push_remote("git push origin main").as_deref(), Some("origin"));
        assert_eq!(push_remote("git push -u upstream HEAD").as_deref(), Some("upstream"));
        assert_eq!(push_remote("git push -o ci.skip origin main").as_deref(), Some("origin"));
        assert_eq!(push_remote("git -c a=b push --force-with-lease fork feat").as_deref(), Some("fork"));
        assert_eq!(push_remote("git push && git status origin").as_deref(), None);
    }

    // ---- ref lookup over a fake .git ----

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-ci-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A repo at `<d>/repo` on `branch`, remote `origin` -> `url`, with a loose remote ref `(branch, sha)` if given.
    fn repo(d: &Path, branch: &str, url: &str, loose: Option<(&str, &str)>) -> PathBuf {
        let r = d.join("repo");
        fs::create_dir_all(r.join(".git/refs/remotes/origin")).unwrap();
        fs::write(r.join(".git/HEAD"), format!("ref: refs/heads/{branch}\n")).unwrap();
        fs::write(r.join(".git/config"), format!("[core]\n\tbare = false\n[remote \"origin\"]\n\turl = {url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch \"{branch}\"]\n\tremote = origin\n\tmerge = refs/heads/{branch}\n")).unwrap();
        if let Some((b, sha)) = loose {
            let p = r.join(".git/refs/remotes/origin").join(b);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, format!("{sha}\n")).unwrap();
        }
        r
    }

    #[test]
    fn ref_lookup_loose_then_packed() {
        let d = temp("refs");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let common = r.join(".git");
        assert_eq!(read_ref(&common, "refs/remotes/origin/main").as_deref(), Some(SHA));
        let other = "f".repeat(40);
        fs::write(common.join("packed-refs"), format!("# pack-refs with: peeled fully-peeled sorted\n{SHA} refs/remotes/origin/dev\n^{SHA}\n{other} refs/remotes/origin/main\n")).unwrap();
        assert_eq!(read_ref(&common, "refs/remotes/origin/dev").as_deref(), Some(SHA), "packed");
        assert_eq!(read_ref(&common, "refs/remotes/origin/main").as_deref(), Some(SHA), "loose wins over packed");
        assert_eq!(read_ref(&common, "refs/remotes/origin/none"), None);
        assert_eq!(read_ref(&common, "refs/remotes/origin/../../HEAD"), None, "no path tricks");
        fs::write(common.join("refs/remotes/origin/bad"), "not a sha\n").unwrap();
        assert_eq!(read_ref(&common, "refs/remotes/origin/bad"), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_push_resolves_to_its_commit() {
        let d = temp("resolve");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let t = resolve_push(&r, "git push", PUSHED).unwrap();
        assert_eq!((t.repo.slug(), t.branch.as_str(), t.sha.as_str(), t.sha7()), ("o/r".to_string(), "main", SHA, "5d6e7f8"));
        fs::create_dir_all(r.join("src/deep")).unwrap();
        assert_eq!(resolve_push(&r.join("src/deep"), "git push origin main", PUSHED), Some(t.clone()), "from a subfolder");
        assert_eq!(resolve_push(&r, "git push", "To github.com:o/r.git\n   1a2b3c4..0000000  main -> main\n"), None, "the remote ref is not the pushed commit");
        assert_eq!(resolve_push(&r, "git push", "Everything up-to-date\n"), None);
        assert_eq!(resolve_push(&r, "git push -q", ""), None);
        assert_eq!(resolve_push(&r, "git push origin main", "   1a2b3c4..5d6e7f8  main -> main\n").map(|t| t.repo.slug()).as_deref(), Some("o/r"), "no To line: the config url");
        let r2 = repo(&temp("resolve2"), "feat", "https://github.com/o/r.git", Some(("feat", SHA)));
        let new = "To https://github.com/o/r.git\n * [new branch]      feat -> feat\n";
        assert_eq!(resolve_push(&r2, "git push -u origin HEAD", new).map(|t| (t.branch, t.sha)), Some(("feat".into(), SHA.into())), "a new branch has no short SHA to check");
        assert_eq!(resolve_push(&r, "git push https://github.com/o/r.git main", PUSHED), None, "a push by URL keeps no remote ref");
        assert_eq!(resolve_push(&r, "git push nowhere main", PUSHED), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_non_github_remote_is_no_watch() {
        let d = temp("gitlab");
        let r = repo(&d, "main", "git@gitlab.com:o/r.git", Some(("main", SHA)));
        assert_eq!(resolve_push(&r, "git push", "To gitlab.com:o/r.git\n   1a2b3c4..5d6e7f8  main -> main\n"), None);
        assert_eq!(resolve_push(&r, "git push", "   1a2b3c4..5d6e7f8  main -> main\n"), None, "the config url is not GitHub either");
        assert_eq!(start_target(&r), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_worktree_finds_the_main_repos_refs_and_config() {
        let d = temp("worktree");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("wt-branch", SHA)));
        let admin = r.join(".git/worktrees/wt");
        fs::create_dir_all(&admin).unwrap();
        fs::write(admin.join("HEAD"), "ref: refs/heads/wt-branch\n").unwrap();
        let wt = d.join("wt");
        fs::create_dir_all(&wt).unwrap();
        fs::write(wt.join(".git"), format!("gitdir: {}\n", admin.display())).unwrap();
        let out = "To github.com:o/r.git\n   1a2b3c4..5d6e7f8  wt-branch -> wt-branch\n";
        let t = resolve_push(&wt, "git push", out).unwrap();
        assert_eq!((t.repo.slug(), t.branch, t.sha), ("o/r".to_string(), "wt-branch".to_string(), SHA.to_string()));
        let s = start_target(&wt).unwrap();
        assert_eq!((s.branch.as_str(), s.sha.as_str()), ("wt-branch", SHA), "the worktree's own HEAD, the main repo's config and refs");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn start_target_cases() {
        let d = temp("start");
        let r = repo(&d, "main", "https://github.com/o/r.git", Some(("main", SHA)));
        let t = start_target(&r).unwrap();
        assert_eq!((t.repo.slug(), t.branch.as_str(), t.sha.as_str()), ("o/r".to_string(), "main", SHA));
        fs::write(r.join(".git/HEAD"), format!("{SHA}\n")).unwrap();
        assert_eq!(start_target(&r), None, "detached HEAD");
        fs::write(r.join(".git/HEAD"), "ref: refs/heads/unpushed\n").unwrap();
        assert_eq!(start_target(&r), None, "no remote ref for that branch");
        assert_eq!(start_target(&d), None, "no repo at all");
        // the branch's own remote, and a packed remote ref
        let cfg = fs::read_to_string(r.join(".git/config")).unwrap();
        fs::write(r.join(".git/config"), format!("{cfg}[remote \"fork\"]\n\turl = git@github.com:me/r.git\n[branch \"feat\"]\n\tremote = fork\n")).unwrap();
        fs::write(r.join(".git/HEAD"), "ref: refs/heads/feat\n").unwrap();
        fs::write(r.join(".git/packed-refs"), format!("{SHA} refs/remotes/fork/feat\n")).unwrap();
        assert_eq!(start_target(&r).map(|t| (t.repo.slug(), t.branch)), Some(("me/r".to_string(), "feat".to_string())));
        let _ = fs::remove_dir_all(&d);
    }

    // ---- the checks URL ----

    #[test]
    fn the_checks_url_is_built_from_the_watch_and_validated() {
        let t = Target { repo: Repo { owner: "o".into(), name: "r.x".into() }, branch: "main".into(), sha: SHA.into() };
        assert_eq!(checks_url(&t), format!("https://github.com/o/r.x/commit/{SHA}/checks"));
        assert!(valid_checks_url(&checks_url(&t)));
        for bad in [
            format!("https://github.com/o/r/commit/{SHA}/checks&calc"),
            format!("https://github.com/o/r/commit/{SHA}/checks%20x"),
            format!("http://github.com/o/r/commit/{SHA}/checks"),
            format!("https://github.com.evil.com/o/r/commit/{SHA}/checks"),
            "https://github.com/o/r/commit/abc/checks".to_string(),
            format!("https://github.com/o/r/commit/{SHA}/checks\n"),
            format!(" https://github.com/o/r/commit/{SHA}/checks"),
        ] {
            assert!(!valid_checks_url(&bad), "{bad:?}");
        }
    }

    // ---- gh errors, candidates ----

    #[test]
    fn gh_failures_are_classified() {
        let c = classify_failure;
        assert_eq!(c(Some(1), "gh: Not Found (HTTP 404)"), GhError::NoAccess);
        assert_eq!(c(Some(1), "gh: Resource not accessible (HTTP 403)"), GhError::NoAccess);
        assert_eq!(c(Some(1), "gh: Bad credentials (HTTP 401)"), GhError::NotLoggedIn);
        assert_eq!(c(Some(4), ""), GhError::NotLoggedIn);
        assert_eq!(c(Some(1), "To get started with GitHub CLI, please run:  gh auth login"), GhError::NotLoggedIn);
        assert_eq!(c(Some(1), "gh: API rate limit exceeded for user (HTTP 403)"), GhError::RateLimit(None), "a 403 that is a rate limit");
        assert_eq!(c(Some(1), "gh: too many requests (HTTP 429)\nx-ratelimit-reset: 1700000000"), GhError::RateLimit(Some(1_700_000_000)));
        assert!(matches!(c(Some(1), "dial tcp: lookup api.github.com: no such host"), GhError::Other(_)));
    }

    #[test]
    fn gh_candidates_start_with_path() {
        let c = candidates();
        assert_eq!(c[0], "gh");
        assert!(c.len() > 1, "install paths follow: {c:?}");
    }

    #[test]
    fn auth_status_names_the_cause() {
        let st = |r: Result<String, GhError>| auth_status(&Stub::new(vec![r]));
        assert_eq!(st(Ok("Logged in".into())), GhAuth::Ready);
        assert_eq!(st(Err(GhError::Missing)), GhAuth::NotFound);
        assert_eq!(st(Err(GhError::Other("x".into()))), GhAuth::NotLoggedIn);
    }

    // ---- the watch state machine, with a fake clock and a recording stub ----

    /// Answers `gh` calls from a script (`default` once it ran dry) and records each call's arguments.
    struct Stub {
        calls: RefCell<Vec<String>>,
        script: RefCell<VecDeque<Result<String, GhError>>>,
        default: Option<Result<String, GhError>>,
    }

    impl Stub {
        fn new(script: Vec<Result<String, GhError>>) -> Self {
            Stub { calls: RefCell::default(), script: RefCell::new(script.into()), default: None }
        }
        /// Every call answered the same way.
        fn always(r: Result<String, GhError>) -> Self {
            Stub { default: Some(r), ..Stub::new(vec![]) }
        }
        fn log(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl Gh for Stub {
        fn run(&self, args: &[&str]) -> Result<String, GhError> {
            self.calls.borrow_mut().push(args.join(" "));
            self.script.borrow_mut().pop_front().or_else(|| self.default.clone()).expect("an unscripted gh call")
        }
    }

    /// One poll's two answers: check-runs, then status.
    fn poll_answers(r: Runs, s: &[(&str, &str)]) -> Vec<Result<String, GhError>> {
        vec![Ok(runs(r)), Ok(statuses(s))]
    }

    /// `n` polls of the same answers.
    fn polls(n: usize, r: Runs, s: &[(&str, &str)]) -> Vec<Result<String, GhError>> {
        (0..n).flat_map(|_| poll_answers(r, s)).collect()
    }

    const T0: i64 = 1_000_000;

    /// A fake repo whose `main` has pushed `SHA`, and the live push record for it.
    fn pushing(name: &str) -> (PathBuf, CiPush) {
        let d = temp(name);
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let push = CiPush { session_id: "s1".into(), name: "terra-77".into(), dept: "Terra".into(), cwd: r.to_string_lossy().into_owned(), command: "git push".into(), output: PUSHED.into() };
        (d, push)
    }

    fn ended(f: Vec<Finished>) -> Vec<Ended> {
        f.into_iter().map(|f| f.ended).collect()
    }

    fn lamp(w: &Watcher) -> Vec<(String, CiStatus)> {
        w.lamps().into_iter().map(|(d, c)| (d, c.state)).collect()
    }

    #[test]
    fn the_first_call_is_20_seconds_after_the_push_then_every_30() {
        let (d, push) = pushing("clock");
        let mut w = Watcher::default();
        assert!(w.on_push(true, &push, T0));
        let gh = Stub::new(polls(3, &[("a", "in_progress", None)], &[]));
        assert!(w.tick(&gh, T0, true).is_empty() && w.tick(&gh, T0 + 19_999, true).is_empty());
        assert!(gh.log().is_empty(), "nothing before 20 s");
        w.tick(&gh, T0 + 20_000, true);
        assert_eq!(gh.log().len(), 2, "check-runs and status");
        assert_eq!(gh.log()[0], format!("api repos/o/r/commits/{SHA}/check-runs?per_page=100"), "the real repo path, never {{owner}}/{{repo}}");
        assert_eq!(gh.log()[1], format!("api repos/o/r/commits/{SHA}/status"));
        w.tick(&gh, T0 + 49_999, true);
        assert_eq!(gh.log().len(), 2, "next poll 30 s later");
        w.tick(&gh, T0 + 50_000, true);
        assert_eq!(gh.log().len(), 4);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn pass_needs_two_polls_that_saw_the_same_checks() {
        let (d, push) = pushing("stable");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let both = [ok("build"), ok("e2e")];
        let gh = Stub::new(
            [
                poll_answers(&[ok("build")], &[]),                                  // 20 s: all passed, but a first look
                poll_answers(&[ok("build"), ("e2e", "queued", None)], &[]),         // 50 s: a workflow registered late
                poll_answers(&both, &[]),                                           // 80 s: all passed, the set as at 50 s
            ]
            .concat(),
        );
        assert!(w.tick(&gh, T0 + 20_000, true).is_empty());
        assert_eq!(w.card("s1").map(|c| (c.state, c.done, c.total)), Some((CiStatus::Running, 1, 1)), "one poll is not a pass");
        assert!(w.tick(&gh, T0 + 50_000, true).is_empty());
        assert_eq!(w.card("s1").map(|c| (c.state, c.done, c.total)), Some((CiStatus::Running, 1, 2)));
        let done = w.tick(&gh, T0 + 80_000, true);
        assert_eq!(done.iter().map(|f| f.ended.clone()).collect::<Vec<_>>(), [Ended::Pass]);
        assert_eq!(w.card("s1").map(|c| (c.state, c.done, c.total)), Some((CiStatus::Pass, 2, 2)));
        assert_eq!(w.len(), 0, "the watch ended");
        assert_eq!((done[0].who.dept.as_str(), done[0].who.name.as_str()), ("Terra", "terra-77"));
        assert_eq!(checks_url(&done[0].target), format!("https://github.com/o/r/commit/{SHA}/checks"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_pass_with_a_changed_set_waits_one_more_poll() {
        let (d, push) = pushing("changed");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let gh = Stub::new([poll_answers(&[ok("a")], &[]), polls(2, &[ok("a"), ok("b")], &[])].concat());
        assert!(w.tick(&gh, T0 + 20_000, true).is_empty());
        assert!(w.tick(&gh, T0 + 50_000, true).is_empty(), "b appeared: not the same set");
        assert_eq!(w.tick(&gh, T0 + 80_000, true).len(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_failure_ends_the_watch_at_the_first_poll_that_sees_it() {
        let (d, push) = pushing("fail");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let gh = Stub::new(poll_answers(&[("build", "completed", Some("failure")), ("e2e", "in_progress", None)], &[]));
        assert_eq!(ended(w.tick(&gh, T0 + 20_000, true)), [Ended::Fail("build".into())]);
        let card = w.card("s1").unwrap();
        assert_eq!((card.state, card.failed.as_deref(), card.branch.as_str(), card.sha7.as_str(), card.repo.as_str()), (CiStatus::Fail, Some("build"), "main", "5d6e7f8", "o/r"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn no_ci_ends_silently_after_three_minutes() {
        let (d, push) = pushing("noci");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let gh = Stub::new(polls(40, &[], &[]));
        for s in [20, 50, 80, 110, 140, 170] {
            assert!(w.tick(&gh, T0 + s * 1000, true).is_empty(), "{s} s: still waiting for a check to register");
            assert_eq!(w.card("s1").map(|c| c.state), Some(CiStatus::Running), "amber while it may still register");
        }
        assert_eq!(ended(w.tick(&gh, T0 + 200_000, true)), [Ended::NoCi], "the first poll after 3 min");
        assert_eq!(w.card("s1"), None, "no card line");
        assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::None)], "the lamp is unlit");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn thirty_minutes_without_a_verdict_is_a_timeout() {
        let (d, push) = pushing("cap");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let gh = Stub::new(polls(100, &[("slow", "in_progress", None)], &[]));
        let mut at = T0 + 20_000;
        while at < T0 + CAP_MS {
            assert!(w.tick(&gh, at, true).is_empty(), "running at {}", at - T0);
            at += 30_000;
        }
        let calls = gh.log().len();
        assert_eq!(ended(w.tick(&gh, T0 + CAP_MS - 1, true)), [], "not yet");
        assert_eq!(ended(w.tick(&gh, T0 + CAP_MS, true)), [Ended::Timeout], "due exactly at the cap");
        assert_eq!(gh.log().len(), calls, "no call to say so");
        assert_eq!(w.card("s1").map(|c| c.state), Some(CiStatus::Timeout));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_new_push_to_the_same_branch_replaces_the_watch() {
        let (d, push) = pushing("replace");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let again = CiPush { session_id: "s2".into(), name: "other".into(), ..push.clone() };
        assert!(w.on_push(true, &again, T0 + 5_000));
        assert_eq!(w.len(), 1, "one watch per repo and branch");
        assert_eq!(w.card("s1"), None, "the replaced push has no line");
        assert!(w.card("s2").is_some());
        w.on_push(true, &push, T0 + 6_000);
        assert_eq!((w.len(), w.card("s2")), (1, None));
        assert!(w.card("s1").is_some());
        let gh = Stub::new(poll_answers(&[ok("a")], &[]));
        w.tick(&gh, T0 + 6_000 + 19_999, true);
        assert!(gh.log().is_empty(), "the new watch starts its own 20 s");
        w.tick(&gh, T0 + 6_000 + 20_000, true);
        assert_eq!(gh.log().len(), 2);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn at_most_eight_watches_a_ninth_drops_the_oldest() {
        let d = temp("eight");
        let r = repo(&d, "b0", "git@github.com:o/r.git", None);
        let mut w = Watcher::default();
        for i in 0..9 {
            let branch = format!("b{i}");
            let sha = format!("{i:x}").repeat(40);
            fs::write(r.join(".git/refs/remotes/origin").join(&branch), format!("{sha}\n")).unwrap();
            let out = format!("To github.com:o/r.git\n   1a2b3c4..{}  {branch} -> {branch}\n", &sha[..7]);
            let push = CiPush { session_id: format!("s{i}"), name: format!("n{i}"), dept: format!("D{i}"), cwd: r.to_string_lossy().into_owned(), command: "git push".into(), output: out };
            assert!(w.on_push(true, &push, T0 + i), "{i}");
            assert_eq!(w.len(), (i as usize + 1).min(MAX_WATCHES));
        }
        assert_eq!(w.card("s0"), None, "the oldest was dropped, its line with it");
        assert!((1..9).all(|i| w.card(&format!("s{i}")).is_some()));
        assert!(w.lamps().iter().all(|(d, _)| d != "D0"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_rate_limit_pauses_every_watch_until_the_reset() {
        let (d, push) = pushing("rate");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let reset = (T0 + 120_000) / 1000;
        let gh = Stub::new([vec![Err(GhError::RateLimit(Some(reset)))], poll_answers(&[("a", "in_progress", None)], &[])].concat());
        assert!(w.tick(&gh, T0 + 20_000, true).is_empty());
        assert_eq!(gh.log().len(), 1, "the call that hit the limit");
        w.tick(&gh, T0 + 50_000, true);
        w.tick(&gh, T0 + 119_999, true);
        assert_eq!(gh.log().len(), 1, "paused until the reset");
        assert_eq!(w.card("s1").map(|c| c.state), Some(CiStatus::Running), "a pause is not a failure");
        w.tick(&gh, T0 + 120_000, true);
        assert_eq!(gh.log().len(), 3, "resumed: both calls");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_rate_limit_without_a_reset_asks_gh_for_it() {
        let (d, push) = pushing("rate2");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let reset = (T0 + 300_000) / 1000;
        let gh = Stub::new(vec![Err(GhError::RateLimit(None)), Ok(json!({"resources": {"core": {"reset": reset}}}).to_string())]);
        w.tick(&gh, T0 + 20_000, true);
        assert_eq!(gh.log()[1], "api rate_limit");
        w.tick(&gh, T0 + 299_999, true);
        assert_eq!(gh.log().len(), 2, "still paused");
        // gh cannot say either: a minute
        let mut w2 = Watcher::default();
        w2.on_push(true, &push, T0);
        let gh2 = Stub::new(vec![Err(GhError::RateLimit(None)), Err(GhError::Other("no".into()))]);
        w2.tick(&gh2, T0 + 20_000, true);
        w2.tick(&gh2, T0 + 20_000 + DEFAULT_PAUSE_MS - 1, true);
        assert_eq!(gh2.log().len(), 2);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn three_failures_in_a_row_end_the_watch_with_error() {
        let (d, push) = pushing("errors");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let boom = || Err(GhError::Other("boom".into()));
        let mut script = vec![boom(), boom()];
        script.extend(poll_answers(&[("a", "in_progress", None)], &[])); // a poll that works resets the count
        script.extend([boom(), boom(), boom()]);
        let gh = Stub::new(script);
        let mut tick = |s: i64| w.tick(&gh, T0 + s * 1000, true);
        assert!(tick(20).is_empty() && tick(50).is_empty(), "two failures");
        assert!(tick(80).is_empty(), "then a good poll");
        assert!(tick(110).is_empty() && tick(140).is_empty());
        assert_eq!(ended(tick(170)), [Ended::Error]);
        assert_eq!(w.card("s1").map(|c| c.state), Some(CiStatus::Error));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn an_unreadable_answer_counts_as_a_failure() {
        let (d, push) = pushing("junk");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let gh = Stub::always(Ok("<html>".into()));
        assert!(w.tick(&gh, T0 + 20_000, true).is_empty() && w.tick(&gh, T0 + 50_000, true).is_empty());
        assert_eq!(ended(w.tick(&gh, T0 + 80_000, true)), [Ended::Error]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn gh_missing_logged_out_or_no_access_ends_the_watch_with_its_reason() {
        for (err, reason) in [(GhError::Missing, "gh not found"), (GhError::NotLoggedIn, "gh not logged in"), (GhError::NoAccess, "no access to o/r")] {
            let (d, push) = pushing("skip");
            let mut w = Watcher::default();
            w.on_push(true, &push, T0);
            let gh = Stub::always(Err(err));
            assert_eq!(ended(w.tick(&gh, T0 + 20_000, true)), [Ended::Skipped(reason.into())]);
            assert_eq!(gh.log().len(), 1, "no retry");
            assert_eq!(w.card("s1"), None, "no card line");
            assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::None)], "the lamp stays unlit");
            let _ = fs::remove_dir_all(&d);
        }
    }

    #[test]
    fn with_ci_off_nothing_starts_and_no_gh_process_is_spawned() {
        let (d, push) = pushing("off");
        let mut w = Watcher::default();
        assert!(!w.on_push(false, &push, T0));
        assert!(!w.start_check(false, "Terra", &push.cwd, T0));
        assert_eq!(w.len(), 0);
        let gh = Stub::always(Err(GhError::Missing));
        for s in [0, 20, 50, 500, 5000] {
            assert!(w.tick(&gh, T0 + s * 1000, false).is_empty());
        }
        assert!(gh.log().is_empty(), "the stub saw no call");
        // turned off mid-run: the watches and lamps go, and no call follows
        assert!(w.on_push(true, &push, T0));
        assert!(w.tick(&gh, T0 + 1000, false).is_empty());
        assert_eq!((w.len(), w.lamps().len(), gh.log().len()), (0, 0, 0));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_push_that_resolves_to_nothing_starts_nothing() {
        let (d, push) = pushing("nothing");
        let mut w = Watcher::default();
        for out in ["Everything up-to-date\n", ""] {
            assert!(!w.on_push(true, &CiPush { output: out.into(), ..push.clone() }, T0));
        }
        assert!(!w.on_push(true, &CiPush { cwd: d.join("nowhere").to_string_lossy().into_owned(), ..push.clone() }, T0));
        assert_eq!(w.len(), 0);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_lamp_is_the_folders_newest_watch() {
        let (d, push) = pushing("lamp");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::Running)]);
        let gh = Stub::new(poll_answers(&[("build", "completed", Some("failure"))], &[]));
        w.tick(&gh, T0 + 20_000, true);
        assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::Fail)], "stays red after the watch ended");
        // another branch of the same folder pushes: it is the folder's newest
        fs::write(Path::new(&push.cwd).join(".git/refs/remotes/origin/dev"), format!("{SHA}\n")).unwrap();
        let dev = CiPush { session_id: "s9".into(), output: "To github.com:o/r.git\n   1a2b3c4..5d6e7f8  dev -> dev\n".into(), ..push.clone() };
        w.on_push(true, &dev, T0 + 100_000);
        assert_eq!(w.lamps().iter().map(|(d, c)| (d.as_str(), c.state, c.branch.as_str())).collect::<Vec<_>>(), [("Terra", CiStatus::Running, "dev")]);
        assert_eq!(w.card("s1").map(|c| c.state), Some(CiStatus::Fail), "the first session keeps its own line");
        let _ = fs::remove_dir_all(&d);
    }

    // ---- the start check ----

    #[test]
    fn one_start_check_per_folder_per_run() {
        let d = temp("sc");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let cwd = r.to_string_lossy().into_owned();
        let mut w = Watcher::default();
        assert!(w.start_check(true, "Terra", &cwd, T0), "first sight: a watch");
        assert!(!w.start_check(true, "Terra", &cwd, T0 + 1), "second sight: none");
        assert_eq!(w.len(), 1);
        let gh = Stub::new(polls(2, &[ok("build")], &[]));
        w.tick(&gh, T0, true);
        assert_eq!(gh.log().len(), 2, "polled at once, no 20 s wait");
        assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::Running)]);
        w.tick(&gh, T0 + 30_000, true);
        assert_eq!(w.lamps().iter().map(|(d, c)| (d.as_str(), c.state, c.sha7.as_str())).collect::<Vec<_>>(), [("Terra", CiStatus::Pass, "5d6e7f8")]);
        assert_eq!(w.card("Terra"), None, "a start check has no session card");
        assert!(!w.start_check(true, "Terra", &cwd, T0 + 60_000), "still once per run after it ended");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn no_start_check_for_a_detached_head_a_missing_remote_ref_or_while_off() {
        let d = temp("sc-none");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let cwd = r.to_string_lossy().into_owned();
        let mut w = Watcher::default();
        assert!(!w.start_check(false, "Off", &cwd, T0), "off");
        assert!(w.start_check(true, "Off", &cwd, T0), "off did not use up the folder's one check");
        fs::write(r.join(".git/HEAD"), format!("{SHA}\n")).unwrap();
        assert!(!w.start_check(true, "Detached", &cwd, T0));
        fs::write(r.join(".git/HEAD"), "ref: refs/heads/local-only\n").unwrap();
        assert!(!w.start_check(true, "NoRemoteRef", &cwd, T0));
        assert!(!w.start_check(true, "NoRepo", &d.to_string_lossy(), T0));
        assert_eq!(w.len(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_start_check_on_a_repo_with_no_ci_stays_unlit_and_ends_silently() {
        let d = temp("sc-noci");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let mut w = Watcher::default();
        w.start_check(true, "Terra", &r.to_string_lossy(), T0);
        let gh = Stub::new(polls(20, &[], &[]));
        w.tick(&gh, T0, true);
        assert_eq!(lamp(&w), [("Terra".to_string(), CiStatus::None)], "no amber for a commit with no CI");
        assert_eq!(ended(w.tick(&gh, T0 + 180_000, true)), [Ended::NoCi]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_start_check_never_replaces_a_watch_and_a_push_counts_as_the_check() {
        let (d, push) = pushing("sc-push");
        let cwd = push.cwd.clone();
        let mut w = Watcher::default();
        assert!(w.on_push(true, &push, T0));
        assert!(!w.start_check(true, "Terra", &cwd, T0 + 1), "a push already looked at the folder");
        let mut w2 = Watcher::default();
        assert!(w2.on_push(true, &CiPush { dept: "Other".into(), ..push.clone() }, T0));
        assert!(!w2.start_check(true, "Terra", &cwd, T0 + 1), "that branch is already watched");
        assert_eq!(w2.len(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    // ---- the watcher thread's worker, the lamps, the opener, the events ----

    fn input(enabled: bool, pushes: Vec<CiPush>, folders: &[(&str, &Path)]) -> Input {
        Input { enabled, pushes, folders: folders.iter().map(|(d, p)| (d.to_string(), p.to_string_lossy().into_owned())).collect() }
    }

    fn cwd_of(push: &CiPush) -> PathBuf {
        PathBuf::from(&push.cwd)
    }

    /// `gh auth status` answers, then every poll finds one check still running.
    fn running() -> Vec<Result<String, GhError>> {
        let mut script = vec![Ok("ok".to_string())];
        script.extend(polls(20, &[("a", "in_progress", None)], &[]));
        script
    }

    #[test]
    fn with_adm_ci_off_the_worker_makes_no_gh_call_at_all() {
        let (d, push) = pushing("worker-off");
        let gh = Stub::new(vec![]); // an unscripted call panics: the stub would also record it
        let mut w = Worker::default();
        let cwd = cwd_of(&push);
        for i in 0..5 {
            let step = w.step(&gh, T0 + i * 60_000, input(false, vec![push.clone()], &[("Terra", &cwd)]));
            assert!(step.notes.is_empty() && step.finished.is_empty());
        }
        assert!(gh.log().is_empty(), "no gh process: {:?}", gh.log());
        assert_eq!(w.watcher.len(), 0);
        assert!(w.watcher.lamp_rows().is_empty() && w.watcher.cards().is_empty());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn turning_it_off_drops_every_watch_and_stops_the_calls() {
        let (d, push) = pushing("worker-off-after");
        let gh = Stub::new(running());
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![push], &[]));
        assert_eq!(w.watcher.len(), 1);
        let before = gh.log().len();
        w.step(&gh, T0 + 20_000, input(false, vec![], &[]));
        w.step(&gh, T0 + 80_000, input(false, vec![], &[]));
        assert_eq!(w.watcher.len(), 0);
        assert!(w.watcher.lamp_rows().is_empty(), "the lamps go dark");
        assert_eq!(gh.log().len(), before, "no call after it is off");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn turning_it_on_runs_gh_auth_status_once_and_records_the_result() {
        let gh = Stub::new(vec![Ok("Logged in".into()), Err(GhError::Missing), Err(GhError::NotLoggedIn)]);
        let mut w = Worker::default();
        let note = |s: Step| s.notes;
        assert_eq!(note(w.step(&gh, T0, input(true, vec![], &[]))), [(status::State::Ok, "gh ready".to_string())]);
        assert!(note(w.step(&gh, T0 + 1000, input(true, vec![], &[]))).is_empty(), "once, not at each step");
        assert_eq!(gh.log(), ["auth status"]);
        w.step(&gh, T0 + 2000, input(false, vec![], &[]));
        assert_eq!(note(w.step(&gh, T0 + 3000, input(true, vec![], &[]))), [(status::State::Warn, "gh not found".to_string())], "on again: once more");
        w.step(&gh, T0 + 4000, input(false, vec![], &[]));
        assert_eq!(note(w.step(&gh, T0 + 5000, input(true, vec![], &[]))), [(status::State::Warn, "gh not logged in: run gh auth login".to_string())]);
        assert_eq!(gh.log(), ["auth status"; 3]);
    }

    #[test]
    fn a_push_handed_in_starts_exactly_one_watch() {
        let (d, push) = pushing("worker-push");
        let gh = Stub::new(running());
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![push.clone()], &[]));
        assert_eq!(w.watcher.len(), 1);
        assert_eq!(gh.log(), ["auth status"], "the first call to GitHub is 20 s after the push");
        w.step(&gh, T0 + 1000, input(true, vec![], &[]));
        assert_eq!(w.watcher.len(), 1, "nothing new, nothing started");
        assert_eq!(w.watcher.card("s1").map(|c| c.state), Some(CiStatus::Running));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_start_check_runs_once_per_folder_per_run() {
        let d = temp("worker-start");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let gh = Stub::new(running());
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![], &[("Terra", &r)]));
        assert_eq!(w.watcher.len(), 1, "first sight of the folder: one watch");
        let calls = gh.log().len();
        assert_eq!(calls, 3, "auth status, then its first poll at once (check-runs and status)");
        for i in 1..4 {
            w.step(&gh, T0 + i * 1000, input(true, vec![], &[("Terra", &r)]));
        }
        assert_eq!(w.watcher.len(), 1, "the same folder again: nothing");
        assert_eq!(gh.log().len(), calls, "and no new call");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_failed_gh_is_recorded_for_the_status_entry_never_as_more() {
        let (d, push) = pushing("worker-skipped");
        let gh = Stub::new(vec![Ok("ok".into()), Err(GhError::NotLoggedIn)]);
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![push], &[]));
        let step = w.step(&gh, T0 + 20_000, input(true, vec![], &[]));
        assert_eq!(step.notes, [(status::State::Warn, "CI check skipped: gh not logged in".to_string())]);
        assert!(matches!(step.finished[0].ended, Ended::Skipped(_)));
        assert!(w.watcher.card("s1").is_none(), "the lamp stays unlit");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_rate_limit_is_noted_once_with_its_pause() {
        let (d, push) = pushing("worker-rate");
        let reset = (T0 / 1000) + 600; // epoch seconds, ten minutes on
        let gh = Stub::new(vec![Ok("ok".into()), Err(GhError::RateLimit(Some(reset)))]);
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![push], &[]));
        let first = w.step(&gh, T0 + 20_000, input(true, vec![], &[])).notes;
        assert_eq!(first.len(), 1);
        assert!(first[0].1.contains("rate limit") && first[0].1.contains("min"), "{first:?}");
        assert!(w.step(&gh, T0 + 21_000, input(true, vec![], &[])).notes.is_empty(), "noted once per pause");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_verdict_comes_out_as_a_finished_watch_and_clears_the_complaint() {
        let (d, push) = pushing("worker-verdict");
        let mut script = vec![Ok("ok".into())];
        script.extend(poll_answers(&[("build", "completed", Some("failure"))], &[]));
        let gh = Stub::new(script);
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![push], &[]));
        let step = w.step(&gh, T0 + 20_000, input(true, vec![], &[]));
        assert_eq!(ended(step.finished), [Ended::Fail("build".into())]);
        assert_eq!(step.notes, [(status::State::Ok, "gh ready".to_string())]);
        assert_eq!(w.watcher.card("s1").map(|c| (c.state, c.failed)), Some((CiStatus::Fail, Some("build".into()))));
        let _ = fs::remove_dir_all(&d);
    }

    fn link(id: u64, session: Option<&str>, dept: &str, state: CiStatus) -> Link {
        let target = Target { repo: Repo { owner: "o".into(), name: "r".into() }, branch: "main".into(), sha: SHA.into() };
        Link { id, session_id: session.map(String::from), dept: dept.into(), state, target }
    }

    #[test]
    fn ci_open_refuses_an_unknown_id_and_never_takes_a_url() {
        let links = [link(1, Some("s1"), "Terra", CiStatus::Pass)];
        for who in ["nope", "", "https://github.com/o/r/commit/x/checks", "s1 ", "terra"] {
            assert!(open_target(&links, who).is_err(), "{who:?}");
        }
        assert!(open_target(&[], "s1").is_err());
    }

    #[test]
    fn ci_open_builds_the_checks_url_from_the_watch() {
        let url = format!("https://github.com/o/r/commit/{SHA}/checks");
        let links = [link(1, Some("s1"), "Terra", CiStatus::Pass), link(2, Some("s2"), "Terra", CiStatus::Fail), link(3, None, "Other", CiStatus::Running)];
        assert_eq!(open_target(&links, "s1").unwrap(), url, "a session id");
        assert_eq!(open_target(&links, "Terra").unwrap(), url, "a department: its newest watch");
        assert!(open_target(&links, "Other").is_ok());
        assert!(valid_checks_url(&open_target(&links, "s2").unwrap()));
    }

    #[test]
    fn ci_open_refuses_a_watch_with_nothing_to_show_and_a_url_that_fails_the_check() {
        assert!(open_target(&[link(1, None, "Terra", CiStatus::None)], "Terra").is_err(), "unlit: no CI found");
        let mut bad = link(1, Some("s1"), "Terra", CiStatus::Pass);
        bad.target.repo.name = "r&calc".into(); // cannot come from parse_remote_url, but the opener must not trust it
        assert!(open_target(&[bad], "s1").is_err(), "no & can reach cmd /c start");
        let mut short = link(1, Some("s1"), "Terra", CiStatus::Pass);
        short.target.sha = "abc".into();
        assert!(open_target(&[short], "s1").is_err());
    }

    fn lamp_of(dept: &str, state: CiStatus) -> Lamp {
        Lamp { dept: dept.into(), cwd: "/w".into(), state, branch: "main".into(), sha7: "5d6e7f8".into(), failed: None }
    }

    #[test]
    fn the_lamps_event_goes_out_only_on_a_change() {
        let mut sent = vec![];
        assert!(!lamps_changed(&mut sent, &[]), "nothing lit, nothing sent");
        let amber = [lamp_of("Terra", CiStatus::Running)];
        assert!(lamps_changed(&mut sent, &amber), "a new lamp");
        assert!(!lamps_changed(&mut sent, &amber), "the same again");
        assert!(lamps_changed(&mut sent, &[lamp_of("Terra", CiStatus::Pass)]), "amber to green");
        let mut red = lamp_of("Terra", CiStatus::Fail);
        assert!(lamps_changed(&mut sent, &[red.clone()]));
        red.failed = Some("build".into());
        assert!(lamps_changed(&mut sent, &[red]), "the failed check changed");
        assert!(lamps_changed(&mut sent, &[]), "the setting off: the lamps go dark, once");
        assert!(!lamps_changed(&mut sent, &[]));
    }

    #[test]
    fn a_count_moving_does_not_change_a_lamp() {
        let (d, push) = pushing("lamp-count");
        let mut script = vec![Ok("ok".into())];
        script.extend(poll_answers(&[ok("a"), ("b", "in_progress", None)], &[]));
        script.extend(poll_answers(&[ok("a"), ok("c"), ("b", "in_progress", None)], &[]));
        let gh = Stub::new(script);
        let (mut w, mut sent) = (Worker::default(), vec![]);
        w.step(&gh, T0, input(true, vec![push], &[]));
        w.step(&gh, T0 + 20_000, input(true, vec![], &[]));
        assert!(lamps_changed(&mut sent, &w.watcher.lamp_rows()));
        w.step(&gh, T0 + 50_000, input(true, vec![], &[]));
        assert_eq!(w.watcher.card("s1").map(|c| (c.done, c.total)), Some((2, 3)), "the card moved");
        assert!(!lamps_changed(&mut sent, &w.watcher.lamp_rows()), "the lamp did not");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_lamp_row_has_the_folder_the_branch_the_short_sha_and_the_failed_check() {
        let (d, push) = pushing("lamp-row");
        let mut w = Watcher::default();
        w.on_push(true, &push, T0);
        let rows = w.lamp_rows();
        assert_eq!(rows, [Lamp { dept: "Terra".into(), cwd: push.cwd.clone(), state: CiStatus::Running, branch: "main".into(), sha7: "5d6e7f8".into(), failed: None }]);
        let json = serde_json::to_value(&rows[0]).unwrap();
        assert_eq!(json, json!({"dept": "Terra", "cwd": push.cwd, "state": "running", "branch": "main", "sha7": "5d6e7f8", "failed": null}));
        let _ = fs::remove_dir_all(&d);
    }

    fn finished(session: Option<&str>, ended: Ended) -> Finished {
        let who = Who { session_id: session.map(String::from), name: "terra-77".into(), dept: "Terra".into(), cwd: "/w".into() };
        Finished { who, target: Target { repo: Repo { owner: "o".into(), name: "r".into() }, branch: "feat/x".into(), sha: SHA.into() }, ended }
    }

    #[test]
    fn a_verdict_is_a_chronicon_event_of_the_pushing_session() {
        let pass = verdict_event(&finished(Some("s1"), Ended::Pass), 7).unwrap();
        assert_eq!((pass.kind.as_str(), pass.session_id.as_str(), pass.name.as_str(), pass.dept.as_str(), pass.ts), ("ci-pass", "s1", "terra-77", "Terra", 7));
        assert_eq!(pass.detail, "feat/x · 5d6e7f8");
        let fail = verdict_event(&finished(Some("s1"), Ended::Fail("build (ubuntu)".into())), 8).unwrap();
        assert_eq!(fail.kind, "ci-fail");
        assert_eq!(fail.detail, "feat/x · 5d6e7f8 · build (ubuntu)", "the branch and the failed check");
        for e in [Ended::Timeout, Ended::Error, Ended::NoCi, Ended::Skipped("gh not found".into())] {
            assert!(verdict_event(&finished(Some("s1"), e.clone()), 1).is_none(), "{e:?}");
        }
        assert!(verdict_event(&finished(None, Ended::Pass), 1).is_none(), "a start check is the last known state, not news");
    }

    #[test]
    fn the_hub_drops_what_waits_when_the_setting_goes_off_and_keeps_one_start_check_per_folder() {
        let (d, push) = pushing("hub");
        let hub = Hub::default();
        let folders = vec![("Terra".to_string(), "/w".to_string())];
        hub.submit(true, vec![push.clone()], folders.clone());
        hub.submit(true, vec![], folders.clone());
        {
            let i = crate::lock(&hub.inbox);
            assert!(i.enabled);
            assert_eq!((i.pushes.len(), i.folders.len()), (1, 1), "the folder waits once");
        }
        hub.submit(false, vec![push], folders);
        let got = hub.next();
        assert!(!got.enabled && got.pushes.is_empty() && got.folders.is_empty(), "nothing from before reaches gh");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_hub_shows_what_the_worker_published() {
        let (d, push) = pushing("hub-view");
        let gh = Stub::new(running());
        let (hub, mut w) = (Hub::default(), Worker::default());
        assert!(hub.card("s1").is_none() && hub.lamps().is_empty() && hub.lamps_if_changed().is_none());
        let step = w.step(&gh, T0, input(true, vec![push], &[]));
        hub.publish(&w, step.finished);
        assert_eq!(hub.card("s1").map(|c| c.state), Some(CiStatus::Running));
        assert_eq!(hub.lamps().len(), 1);
        assert_eq!(hub.lamps_if_changed().map(|l| l.len()), Some(1));
        assert!(hub.lamps_if_changed().is_none(), "sent once");
        assert!(hub.take_verdicts().is_empty());
        assert!(hub.open_url_for("s1").unwrap().ends_with("/checks"));
        assert!(hub.open_url_for("nobody").is_err());
        let _ = fs::remove_dir_all(&d);
    }
}
