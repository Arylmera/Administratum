//! I6, the CI verdict after a push: the pure core. Push output parsing, GitHub remote URLs, ref lookup read straight
//! from `.git` (git is never run), the verdict over check-runs and statuses, and the watch state machine with an
//! injected clock. The `gh` CLI sits behind the `Gh` trait: `RealGh` runs it like `orca.rs` runs Orca (arguments
//! straight to the process, `no_window`, candidate paths), tests use a stub. No thread, no timer, no UI here: the
//! watcher thread (`Hub`, `Worker`) owns the clock and calls `Watcher::tick`.
use crate::{
    chronicle::{CiPush, Event},
    ci_main::{MainEnded, Mains},
    git, no_window,
    registry::{self, CiState, CiStatus, Session},
    status,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Receiver},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
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
pub(crate) const MAX_FAILURES: u32 = 3;
/// How long a rate limit pauses every watch when `gh` names no reset time.
pub(crate) const DEFAULT_PAUSE_MS: i64 = 60_000;

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
    /// The first 7 characters; the whole `sha` when shorter (empty for a main tracker's ending before any head).
    pub fn sha7(&self) -> &str {
        self.sha.get(..7).unwrap_or(&self.sha)
    }

    /// The real `repos/<owner>/<repo>/commits/<sha>/<what>` path, never the `{owner}/{repo}` placeholders (which
    /// `gh` would fill from its own cwd).
    pub(crate) fn api(&self, what: &str) -> String {
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
    // the configured remote's url, never the transcript's `To` line: that only helped pick the remote above, so crafted
    // output cannot point `gh` at another repository (a url git rewrote, `insteadOf`, is no GitHub url here: no watch)
    let repo = parse_remote_url(remote.1)?;
    let sha = read_ref(&dirs.common, &format!("refs/remotes/{}/{}", remote.0, pushed.branch))?;
    if pushed.short.as_deref().is_some_and(|s| !sha.starts_with(s)) {
        return None;
    }
    Some(Target { repo, branch: pushed.branch, sha })
}

/// A repository and its default branch.
#[derive(Clone, Debug, PartialEq)]
pub struct MainRef {
    pub repo: Repo,
    /// From `refs/remotes/<remote>/HEAD`; None when that file is absent (the caller asks `gh`).
    pub branch: Option<String>,
}

/// The default branch of the repository a folder belongs to: the remote of the current branch (its `branch.<b>.remote`
/// unless that is `.`, else `origin`), the repository from that remote's `url`, the branch from the loose
/// `refs/remotes/<remote>/HEAD` (`ref: refs/remotes/<remote>/<branch>`). None: no git dir, no such remote, not GitHub.
/// Works from a linked worktree (config and refs come from the main repo's `.git`).
pub fn default_branch_of(cwd: &Path) -> Option<MainRef> {
    let dirs = git_dirs(cwd)?;
    let config = read_config(&dirs.common);
    let current = fs::read_to_string(&dirs.head).ok().and_then(|h| h.trim().strip_prefix("ref:")?.trim().strip_prefix("refs/heads/").map(String::from));
    let remote = current.and_then(|b| config_get(&config, &format!("branch \"{b}\""), "remote")).filter(|r| r != ".").unwrap_or_else(|| "origin".into());
    if !valid_ref_name(&remote) {
        return None;
    }
    let repo = parse_remote_url(&config_get(&config, &format!("remote \"{remote}\""), "url")?)?;
    let prefix = format!("refs/remotes/{remote}/");
    let branch = fs::read_to_string(dirs.common.join(&prefix).join("HEAD"))
        .ok()
        .and_then(|t| t.trim().strip_prefix("ref:")?.trim().strip_prefix(prefix.as_str()).map(String::from))
        .filter(|b| valid_ref_name(b));
    Some(MainRef { repo, branch })
}

/// `default_branch` of `gh api repos/<o>/<r>`, if it is a safe ref name.
pub fn parse_default_branch(repo_json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(repo_json).ok()?;
    v.get("default_branch")?.as_str().filter(|b| valid_ref_name(b)).map(String::from)
}

/// The commit a combined status answers for: its `sha`, 40 lowercase hex only.
pub fn status_sha(status_json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(status_json).ok()?;
    v.get("sha")?.as_str().filter(|s| s.len() == 40 && s.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))).map(String::from)
}

/// `repos/<owner>/<repo>/commits/<branch>/<what>`: a call by branch name, GitHub resolves it to the tip. `branch` must
/// have passed `valid_ref_name`.
pub(crate) fn branch_api(repo: &Repo, branch: &str, what: &str) -> String {
    format!("repos/{}/{}/commits/{branch}/{what}", repo.owner, repo.name)
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
    let runs_total = runs["total_count"].as_u64();
    let runs = runs["check_runs"].as_array().ok_or("check-runs: no check_runs list")?;
    // the combined `state` of a commit with no statuses is "pending": only the list is read
    let stats_total = stat["total_count"].as_u64();
    let stats = stat["statuses"].as_array().ok_or("status: no statuses list")?;
    // one page only (`per_page=100`, and the status list's own default): checks beyond it were not seen
    let unseen = runs_total.map_or(0, |n| n.saturating_sub(runs.len() as u64)) + stats_total.map_or(0, |n| n.saturating_sub(stats.len() as u64));
    let all = runs.iter().map(|r| ("run", r["name"].as_str(), run_outcome(r))).chain(stats.iter().map(|s| ("status", s["context"].as_str(), status_outcome(s))));
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
    let total = ids.len() as u32 + unseen.min(u32::MAX as u64 / 2) as u32;
    let verdict = match failed {
        Some(check) => Verdict::Fail(check),
        None if total == 0 => Verdict::NoCi,
        // an incomplete set never passes: `total` counts what was not returned, so `done` stays below it
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

/// A `gh` call that has not ended after this long is killed and counts as a failed call.
const TIMEOUT: Duration = Duration::from_secs(20);
/// The most one pipe is read for: the check-runs of a commit are far smaller, and a runaway must not fill memory.
const MAX_OUTPUT: u64 = 1 << 20;

/// Why one candidate gave nothing.
enum Fail {
    NotStarted,
    TimedOut,
    Io(String),
}

/// The bytes of one pipe (up to `MAX_OUTPUT`), sent when it closes.
fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> Receiver<Vec<u8>> {
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let mut buf = vec![];
        if let Some(p) = pipe {
            let _ = p.take(MAX_OUTPUT).read_to_end(&mut buf);
        }
        let _ = tx.send(buf);
    });
    rx
}

/// `cmd` run to its end with stdin closed, killed when it has not ended after `limit`. Output goes through pipes read
/// on their own threads (a full pipe would stall the child); a pipe a grandchild keeps open is given up on shortly
/// after the child ends.
fn run_bounded(mut cmd: Command, limit: Duration) -> Result<Output, Fail> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|_| Fail::NotStarted)?;
    let (out, err) = (drain(child.stdout.take()), drain(child.stderr.take()));
    let deadline = Instant::now() + limit;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Fail::TimedOut);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(15)),
            Err(e) => return Err(Fail::Io(e.to_string())),
        }
    };
    let grab = |rx: Receiver<Vec<u8>>| rx.recv_timeout(Duration::from_millis(300)).unwrap_or_default();
    Ok(Output { status, stdout: grab(out), stderr: grab(err) })
}

/// `build(exe)` for each of `exes` in turn until one starts, within `limit`. A timeout is a failed call
/// (`GhError::Other`, which the watch counts toward its 3 failures), and the next candidate is not tried.
fn first_of(exes: &[String], build: impl Fn(&str) -> Command, limit: Duration) -> Result<String, GhError> {
    for exe in exes {
        return match run_bounded(build(exe), limit) {
            Ok(out) if out.status.success() => Ok(String::from_utf8_lossy(&out.stdout).into_owned()),
            Ok(out) => Err(classify_failure(out.status.code(), &String::from_utf8_lossy(&out.stderr))),
            Err(Fail::NotStarted) => continue,
            Err(Fail::TimedOut) => Err(GhError::Other(format!("gh did not answer in {} s", limit.as_secs_f32()))),
            Err(Fail::Io(e)) => Err(GhError::Other(registry::clip(&e))),
        };
    }
    Err(GhError::Missing)
}

impl Gh for RealGh {
    fn run(&self, args: &[&str]) -> Result<String, GhError> {
        let _one_at_a_time = crate::lock(&RUNNING);
        first_of(
            &candidates(),
            |exe| {
                let mut cmd = no_window(Command::new(exe));
                cmd.args(args).env("GH_PROMPT_DISABLED", "1");
                cmd
            },
            TIMEOUT,
        )
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

/// Who a watch was started for: the pushing session.
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
    /// A main tracker's good answer after a `Skipped` or `Error`: Settings > Status back to ready. Never a Chronicon
    /// record, and never a push watch's ending.
    Ready,
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
    /// The checks the last poll saw, for the two-stable-polls rule.
    prev_ids: Option<Vec<String>>,
    failures: u32,
}

/// What the card of a session shows; `id` orders them (higher is newer).
struct Entry {
    id: u64,
    who: Who,
    ci: CiState,
    /// The watched commit, for the card's click (`open_target`).
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
}

fn ci_state(t: &Target, state: CiStatus) -> CiState {
    CiState { repo: t.repo.slug(), branch: t.branch.clone(), sha7: t.sha7().into(), state, done: 0, total: 0, failed: None }
}

pub(crate) fn same_branch(a: &Target, b: &Target) -> bool {
    a.repo.slug().eq_ignore_ascii_case(&b.repo.slug()) && a.branch == b.branch
}

/// The core rate limit's reset (epoch seconds), from `gh api rate_limit` (which GitHub does not count).
pub(crate) fn rate_limit_reset(gh: &dyn Gh) -> Option<i64> {
    let v: Value = serde_json::from_str(&gh.run(&["api", "rate_limit"]).ok()?).ok()?;
    v["resources"]["core"]["reset"].as_i64()
}

impl Watcher {
    /// A live push by a session. With `enabled` false: nothing, and no `gh` call ever follows. Returns whether a watch
    /// started.
    pub fn on_push(&mut self, enabled: bool, push: &CiPush, now_ms: i64) -> bool {
        if !enabled {
            return false;
        }
        let Some(target) = resolve_push(Path::new(&push.cwd), &push.command, &push.output) else { return false };
        let who = Who { session_id: Some(push.session_id.clone()), name: push.name.clone(), dept: push.dept.clone(), cwd: push.cwd.clone() };
        self.start(target, who, now_ms);
        true
    }

    fn start(&mut self, target: Target, who: Who, now_ms: i64) {
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
        // running from the push on (a main tracker mirrors it at once), its first call `FIRST_CALL_MS` later
        self.entries.push(Entry { id, who: who.clone(), ci: ci_state(&target, CiStatus::Running), target: target.clone() });
        self.watches.push(Watch { id, who, target, started_ms: now_ms, next_ms: now_ms + FIRST_CALL_MS, prev_ids: None, failures: 0 });
    }

    /// Runs every due poll, one `gh` call at a time, and returns the watches that ended. With `enabled` false every
    /// watch and its lamp are dropped and no call is made. While a rate limit pauses, nothing runs.
    #[cfg(test)]
    pub fn tick(&mut self, gh: &dyn Gh, now_ms: i64, enabled: bool) -> Vec<Finished> {
        self.tick_with(gh, now_ms, enabled, &mut |_| {})
    }

    /// `tick`, calling `after_poll` with the watcher after each poll, so a slow `gh` call does not hold back what the
    /// polls before it learned.
    pub fn tick_with(&mut self, gh: &dyn Gh, now_ms: i64, enabled: bool, after_poll: &mut dyn FnMut(&Watcher)) -> Vec<Finished> {
        if !enabled {
            self.watches.clear();
            self.entries.clear();
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
            after_poll(self);
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
        let stable = w.prev_ids.as_ref() == Some(&snap.ids);
        w.prev_ids = Some(snap.ids.clone());
        let (id, started) = (w.id, w.started_ms);
        match snap.verdict {
            Verdict::Fail(check) => Poll::End(Ended::Fail(check)),
            Verdict::Pass if stable => Poll::End(Ended::Pass),
            Verdict::NoCi if now_ms - started >= NO_CI_MS => Poll::End(Ended::NoCi),
            _ => {
                if let Some(e) = self.entries.iter_mut().find(|e| e.id == id) {
                    e.ci.state = CiStatus::Running;
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
            Ended::NoCi | Ended::Skipped(_) | Ended::Ready => (CiStatus::None, None),
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

    /// The CI of a running watch on `repo`'s `branch`, from the moment its push started it (state `running`, before its
    /// first call), with its commit: a main tracker on that branch shows it, opens that commit, and makes no call of its
    /// own. None once the watch ended.
    pub fn live_on(&self, repo: &Repo, branch: &str) -> Option<(Target, CiState)> {
        let slug = repo.slug();
        let w = self.watches.iter().find(|w| w.target.branch == branch && w.target.repo.slug().eq_ignore_ascii_case(&slug))?;
        self.entries.iter().find(|e| e.id == w.id).map(|e| (w.target.clone(), e.ci.clone()))
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

    /// Holds every watch until `until_ms` (a rate limit a main tracker met); the later of the two pauses wins.
    pub fn pause(&mut self, until_ms: i64) {
        self.paused_until_ms = self.paused_until_ms.max(until_ms);
    }

    /// Watches running now.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.watches.len()
    }
}

// ---- the lamps, the opener and the events -----------------------------------------------------------------------

/// One department's lamp (its main tracker, `ci_main`), as the `ci-lamps` event and the `ci_lamps` command give it. `state` `none`, `timeout` and
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

/// A commit the opener may name: a push watch's (its session) or a main tracker's (no session), its folder, the commit.
#[derive(Clone, Debug, PartialEq)]
pub struct Link {
    pub id: u64,
    pub session_id: Option<String>,
    pub dept: String,
    pub state: CiStatus,
    pub target: Target,
}

/// The checks page `ci_open` opens for `who`: a session id (its own watch) or a department name (its main tracker's
/// commit: only links with no session, so a session's push to another branch never takes the folder's lamp). Never a
/// URL from the caller: it is built from the watch and checked before it is returned. An unknown name, a watch with
/// nothing to show, or a URL that fails the check is an error, and nothing is opened.
pub fn open_target(links: &[Link], who: &str) -> Result<String, String> {
    let by_session = || links.iter().filter(|l| l.session_id.as_deref() == Some(who)).max_by_key(|l| l.id);
    let by_dept = || links.iter().filter(|l| l.session_id.is_none() && l.dept == who).max_by_key(|l| l.id);
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

/// The Chronicon event of a push watch's verdict: `ci-pass` or `ci-fail` (the branch, the short SHA and the failed
/// check), for the pushing session. None for any other ending.
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

/// The Chronicon event of a main tracker's verdict on a new head: `ci-pass` or `ci-fail`, no session (like the vigil
/// event), `name` and `dept` the department, detail `<branch> · <sha7>[ · <check>]`. None for any other ending (a
/// `Skipped` or `Error` may carry no commit at all).
pub fn main_verdict_event(m: &MainEnded, now_ms: i64) -> Option<Event> {
    let (kind, check) = match &m.ended {
        Ended::Pass => ("ci-pass", None),
        Ended::Fail(check) => ("ci-fail", Some(check)),
        _ => return None,
    };
    let base = format!("{} · {}", m.target.branch, m.target.sha7());
    let detail = check.map_or(base.clone(), |c| format!("{base} · {c}"));
    Some(Event { ts: now_ms, kind: kind.into(), session_id: String::new(), name: m.dept.clone(), dept: m.dept.clone(), helper: None, detail: registry::clip(&detail), reset_ms: None, hit_ms: None })
}

/// The departments a scribe of was done this tick: each session of `prev` gone from the roster, or that was working
/// (`busy`, or `shell` in a shell call) and is now `idle`, its department once.
pub fn scribes_done(prev: &[Session], now: &[Session]) -> Vec<String> {
    let mut depts: Vec<String> = vec![];
    for p in prev {
        let working = p.status == "busy" || p.status == "shell";
        let done = now.iter().find(|s| s.id == p.id).is_none_or(|s| working && s.status == "idle");
        if done && !depts.contains(&p.dept) {
            depts.push(p.dept.clone());
        }
    }
    depts
}

// ---- the watcher thread -----------------------------------------------------------------------------------------

/// What the poll loop hands the watcher each tick.
#[derive(Default)]
pub struct Input {
    /// `adm.ci`.
    pub enabled: bool,
    /// Live pushes read this tick.
    pub pushes: Vec<CiPush>,
    /// Folders (department, working directory) seen: each department's main tracker (`ci_main::Mains::see`).
    pub folders: Vec<(String, String)>,
    /// Departments a scribe of was done (`scribes_done`): their tracker checks early.
    pub done: Vec<String>,
}

/// What one step of the worker produced.
pub struct Step {
    /// For the `gh` entry of `integration_status`, in order.
    pub notes: Vec<(status::State, String)>,
    pub finished: Vec<Finished>,
    /// The main trackers' endings: verdicts on new heads, and what Settings > Status names.
    pub mains: Vec<MainEnded>,
}

/// The note an ending leaves for the `gh` entry of Settings > Status, push watch or main tracker alike.
fn note_of(ended: &Ended) -> Option<(status::State, String)> {
    match ended {
        Ended::Skipped(reason) => Some((status::State::Warn, format!("CI check skipped: {reason}"))),
        Ended::Error => Some((status::State::Warn, "CI check failed: gh gave no usable answer three times in a row".to_string())),
        // gh answered: any earlier complaint is over
        Ended::Pass | Ended::Fail(_) | Ended::Ready => Some((status::State::Ok, "gh ready".to_string())),
        Ended::Timeout | Ended::NoCi => None,
    }
}

/// The state of the watcher thread: the push watches, the main trackers, and whether `gh auth status` ran for this
/// time the setting is on. `step` takes the `gh` runner and the clock as arguments, so tests drive it without a thread
/// or a process.
#[derive(Default)]
pub struct Worker {
    watcher: Watcher,
    mains: Mains,
    on: bool,
    /// The rate-limit pause already noted (its end, epoch ms).
    pause_noted: i64,
}

impl Worker {
    /// One round: the hand-in, then every due poll. With `enabled` false no `gh` call is made and every watch and
    /// tracker is dropped; turning it on runs `gh auth status` once (never in the settings-save path: this runs on the
    /// watcher thread).
    #[cfg(test)]
    pub fn step(&mut self, gh: &dyn Gh, now_ms: i64, input: Input) -> Step {
        self.step_with(gh, now_ms, input, &mut |_| {})
    }

    /// `step`, calling `after_poll` with the watches after each push watch's poll (the hub publishes the cards then).
    /// The order: the pushes, the folders seen, the scribes done, the push watches' polls, their endings handed to the
    /// trackers, the trackers' checks (a branch a push watch runs on is mirrored, not polled). One rate-limit pause
    /// holds both.
    pub fn step_with(&mut self, gh: &dyn Gh, now_ms: i64, input: Input, after_poll: &mut dyn FnMut(&Watcher)) -> Step {
        let mut notes = vec![];
        if input.enabled && !self.on {
            notes.push(match auth_status(gh) {
                GhAuth::Ready => (status::State::Ok, "gh ready".to_string()),
                GhAuth::NotFound => (status::State::Warn, "gh not found".to_string()),
                GhAuth::NotLoggedIn => (status::State::Warn, "gh not logged in: run gh auth login".to_string()),
            });
        }
        self.on = input.enabled;
        if !input.enabled {
            self.watcher.tick_with(gh, now_ms, false, after_poll);
            self.mains.clear();
            self.pause_noted = 0;
            return Step { notes, finished: vec![], mains: vec![] };
        }
        for push in &input.pushes {
            self.watcher.on_push(true, push, now_ms);
        }
        for (dept, cwd) in &input.folders {
            self.mains.see(dept, cwd, now_ms);
        }
        for dept in &input.done {
            self.mains.scribe_done(dept, now_ms);
        }
        let finished = self.watcher.tick_with(gh, now_ms, true, after_poll);
        for f in &finished {
            self.mains.adopt(f);
        }
        // a rate limit the push watches met holds the trackers too, and the other way round
        self.mains.pause(self.watcher.paused_until());
        let watcher = &self.watcher;
        let mains = self.mains.tick(gh, now_ms, &|repo, branch| watcher.live_on(repo, branch));
        self.watcher.pause(self.mains.paused_until());
        notes.extend(finished.iter().map(|f| &f.ended).chain(mains.iter().map(|m| &m.ended)).filter_map(note_of));
        let until = self.watcher.paused_until();
        if until > now_ms && until != self.pause_noted {
            self.pause_noted = until;
            notes.push((status::State::Warn, format!("CI checks paused: GitHub rate limit, back in about {} min", (until - now_ms + 59_999) / 60_000)));
        }
        Step { notes, finished, mains }
    }
}

/// What the watcher thread shares with the poll loop and the commands: an inbox it drains, and the view it fills.
/// No lock is held across a `gh` call.
#[derive(Default)]
pub struct Hub {
    /// `adm.ci` as the poll loop last said it, read before every `gh` call: the inbox's own flag is behind a lock the
    /// worker only takes between steps, and a batch of polls must stop the moment the setting goes off.
    on: AtomicBool,
    inbox: Mutex<Input>,
    wake: Condvar,
    view: Mutex<View>,
}

#[derive(Default)]
struct View {
    cards: HashMap<String, CiState>,
    /// The departments' (main) lamps.
    lamps: Vec<Lamp>,
    /// The push watches' commits (a session's card).
    push_links: Vec<Link>,
    /// The main trackers' commits (a department's lamp).
    main_links: Vec<Link>,
    verdicts: Vec<Finished>,
    main_verdicts: Vec<MainEnded>,
}

impl Hub {
    /// The poll loop's hand-in, once per tick. With `enabled` false whatever was waiting is dropped, so nothing from
    /// the time the setting was off ever reaches a `gh` call.
    pub fn submit(&self, enabled: bool, pushes: Vec<CiPush>, folders: Vec<(String, String)>, done: Vec<String>) {
        let mut inbox = crate::lock(&self.inbox);
        inbox.enabled = enabled;
        self.on.store(enabled, Ordering::SeqCst);
        if enabled {
            inbox.pushes.extend(pushes);
            for (dept, cwd) in folders {
                if !inbox.folders.iter().any(|(d, _)| *d == dept) {
                    inbox.folders.push((dept, cwd));
                }
            }
            for dept in done {
                if !inbox.done.contains(&dept) {
                    inbox.done.push(dept);
                }
            }
        } else {
            inbox.pushes.clear();
            inbox.folders.clear();
            inbox.done.clear();
        }
        drop(inbox);
        self.wake.notify_one();
    }

    /// The card line of a session.
    pub fn card(&self, session_id: &str) -> Option<CiState> {
        crate::lock(&self.view).cards.get(session_id).cloned()
    }

    /// Every department's (main) lamp now: the `ci-lamps` event, sent every tick, and the `ci_lamps` command.
    pub fn lamps(&self) -> Vec<Lamp> {
        crate::lock(&self.view).lamps.clone()
    }

    /// The push watches' verdicts since the last call, for their Chronicon events.
    pub fn take_verdicts(&self) -> Vec<Finished> {
        std::mem::take(&mut crate::lock(&self.view).verdicts)
    }

    /// The main trackers' verdicts on new heads since the last call (`main_verdict_event`).
    pub fn take_main_verdicts(&self) -> Vec<MainEnded> {
        std::mem::take(&mut crate::lock(&self.view).main_verdicts)
    }

    /// The checks URL for a session id or a department name (`open_target`).
    pub fn open_url_for(&self, who: &str) -> Result<String, String> {
        let v = crate::lock(&self.view);
        open_target(&[v.push_links.as_slice(), v.main_links.as_slice()].concat(), who)
    }

    /// Waits up to a second for the poll loop's hand-in, then takes it.
    fn next(&self) -> Input {
        let mut inbox = crate::lock(&self.inbox);
        if inbox.pushes.is_empty() && inbox.folders.is_empty() && inbox.done.is_empty() {
            inbox = self.wake.wait_timeout(inbox, Duration::from_secs(1)).unwrap_or_else(|e| e.into_inner()).0;
        }
        Input { enabled: inbox.enabled, pushes: std::mem::take(&mut inbox.pushes), folders: std::mem::take(&mut inbox.folders), done: std::mem::take(&mut inbox.done) }
    }

    /// What the push watches show now: the cards and what `ci_open` may open for a session.
    fn publish_watches(&self, w: &Watcher) {
        let mut v = crate::lock(&self.view);
        v.cards = w.cards();
        v.push_links = w.links();
    }

    /// The end of a step: the watches, the departments' lamps and links, the verdicts for the Chronicon.
    fn publish(&self, worker: &Worker, finished: Vec<Finished>, mains: Vec<MainEnded>) {
        self.publish_watches(&worker.watcher);
        let mut v = crate::lock(&self.view);
        v.lamps = worker.mains.lamp_rows();
        v.main_links = worker.mains.links();
        v.verdicts.extend(finished);
        v.main_verdicts.extend(mains.into_iter().filter(|m| matches!(m.ended, Ended::Pass | Ended::Fail(_))));
    }

    /// A step's result into the view and Settings > Status. The setting went off during the step: what it learned or
    /// complained of is moot, and the trackers go now (their lamps with them); the next step drops the rest.
    fn settle(&self, worker: &mut Worker, step: Step) {
        if !self.on.load(Ordering::SeqCst) {
            worker.mains.clear();
            self.publish(worker, vec![], vec![]);
            return;
        }
        for (state, message) in step.notes {
            // an unchanged message leaves no new line: a tracker's `Skipped` comes back every 5 min while it lasts
            status::report_change("gh", state, message);
        }
        self.publish(worker, step.finished, step.mains);
    }

    /// The watcher thread's loop: it owns the `Worker`, the clock and every `gh` call (one at a time).
    fn run(&self, gh: &dyn Gh) {
        let mut worker = Worker::default();
        loop {
            let input = self.next();
            // transcripts are untrusted input: a panic is logged and skipped, the watcher goes on
            let gated = Gated { inner: gh, on: &self.on };
            let stepped = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker.step_with(&gated, crate::now_ms(), input, &mut |w| self.publish_watches(w))));
            match stepped {
                Ok(step) => self.settle(&mut worker, step),
                Err(_) => status::report("gh", status::State::Error, "CI watcher panicked, skipped"),
            }
        }
    }
}

/// A `gh` runner that refuses every call once the setting is off: no process is spawned for the rest of a batch.
struct Gated<'a> {
    inner: &'a dyn Gh,
    on: &'a AtomicBool,
}

impl Gh for Gated<'_> {
    fn run(&self, args: &[&str]) -> Result<String, GhError> {
        if !self.on.load(Ordering::SeqCst) {
            return Err(GhError::Other("CI checks are off".into()));
        }
        self.inner.run(args)
    }
}

/// Starts the watcher thread on the user's own `gh`. Nothing runs until `Hub::submit` says `adm.ci` is on.
pub fn spawn(hub: Arc<Hub>) {
    std::thread::spawn(move || hub.run(&RealGh));
}

/// Test doubles shared by `ci` and `ci_main`: the recording `gh` stub and a fake `.git` on disk.
#[cfg(test)]
pub(crate) mod testgh {
    use super::*;
    use std::{cell::RefCell, collections::VecDeque};

    /// Answers `gh` calls from a script (`default` once it ran dry) and records each call's arguments.
    pub(crate) struct Stub {
        calls: RefCell<Vec<String>>,
        script: RefCell<VecDeque<Result<String, GhError>>>,
        default: Option<Result<String, GhError>>,
    }

    impl Stub {
        pub(crate) fn new(script: Vec<Result<String, GhError>>) -> Self {
            Stub { calls: RefCell::default(), script: RefCell::new(script.into()), default: None }
        }
        /// Every call answered the same way.
        pub(crate) fn always(r: Result<String, GhError>) -> Self {
            Stub { default: Some(r), ..Stub::new(vec![]) }
        }
        pub(crate) fn log(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl Gh for Stub {
        fn run(&self, args: &[&str]) -> Result<String, GhError> {
            self.calls.borrow_mut().push(args.join(" "));
            self.script.borrow_mut().pop_front().or_else(|| self.default.clone()).expect("an unscripted gh call")
        }
    }

    pub(crate) fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-ci-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A repo at `<d>/repo` on `branch`, remote `origin` -> `url`, with a loose remote ref `(branch, sha)` if given.
    pub(crate) fn repo(d: &Path, branch: &str, url: &str, loose: Option<(&str, &str)>) -> PathBuf {
        let r = d.join("repo");
        fs::create_dir_all(r.join(".git/refs/remotes/origin")).unwrap();
        fs::write(r.join(".git/HEAD"), format!("ref: refs/heads/{branch}\n")).unwrap();
        fs::write(
            r.join(".git/config"),
            format!(
                "[core]\n\tbare = false\n[remote \"origin\"]\n\turl = {url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n[branch \"{branch}\"]\n\tremote = origin\n\tmerge = refs/heads/{branch}\n"
            ),
        )
        .unwrap();
        if let Some((b, sha)) = loose {
            let p = r.join(".git/refs/remotes/origin").join(b);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, format!("{sha}\n")).unwrap();
        }
        r
    }

    pub(crate) fn origin_head(r: &Path, text: &str) {
        fs::write(r.join(".git/refs/remotes/origin/HEAD"), text).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::testgh::*;
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;

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
        let _ = fs::remove_dir_all(&d);
    }

    // ---- the default branch ----

    fn o_r() -> Repo {
        Repo { owner: "o".into(), name: "r".into() }
    }

    #[test]
    fn default_branch_from_origin_head() {
        let d = temp("defbranch");
        let r = repo(&d, "feat", "git@github.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        assert_eq!(default_branch_of(&r), Some(MainRef { repo: o_r(), branch: Some("main".into()) }));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn default_branch_without_origin_head() {
        let d = temp("defnohead");
        let r = repo(&d, "feat", "git@github.com:o/r.git", None);
        let m = default_branch_of(&r).unwrap();
        assert_eq!((m.branch, m.repo.slug()), (None, "o/r".to_string()));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn default_branch_in_a_worktree() {
        let d = temp("defworktree");
        let r = repo(&d, "main", "git@github.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        let admin = r.join(".git/worktrees/wt");
        fs::create_dir_all(&admin).unwrap();
        fs::write(admin.join("HEAD"), "ref: refs/heads/wt-branch\n").unwrap();
        let wt = d.join("wt");
        fs::create_dir_all(&wt).unwrap();
        fs::write(wt.join(".git"), format!("gitdir: {}\n", admin.display())).unwrap();
        assert_eq!(default_branch_of(&wt), Some(MainRef { repo: o_r(), branch: Some("main".into()) }));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn default_branch_not_github() {
        let d = temp("defgitlab");
        let r = repo(&d, "feat", "git@gitlab.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        assert_eq!(default_branch_of(&r), None);
        let _ = fs::remove_dir_all(&d);
        let d = temp("deftricks");
        let r = repo(&d, "feat", "git@github.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/../../etc\n");
        assert_eq!(default_branch_of(&r).map(|m| m.branch), Some(None), "a crafted HEAD names no branch");
        assert_eq!(default_branch_of(&d), None, "no repo at all");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn parse_default_branch_cases() {
        assert_eq!(parse_default_branch(r#"{"default_branch":"trunk"}"#).as_deref(), Some("trunk"));
        assert_eq!(parse_default_branch("{}"), None);
        assert_eq!(parse_default_branch("not json"), None);
        assert_eq!(parse_default_branch(r#"{"default_branch":"a/../b"}"#), None);
    }

    #[test]
    fn status_sha_cases() {
        assert_eq!(status_sha(&format!(r#"{{"sha":"{SHA}","statuses":[]}}"#)).as_deref(), Some(SHA));
        assert_eq!(status_sha(r#"{"sha":"5d6e7f8"}"#), None, "short");
        assert_eq!(status_sha(&format!(r#"{{"sha":"{}"}}"#, SHA.to_uppercase())), None, "uppercase");
        assert_eq!(status_sha(r#"{"statuses":[]}"#), None);
    }

    #[test]
    fn branch_api_path() {
        assert_eq!(branch_api(&o_r(), "main", "status"), "repos/o/r/commits/main/status");
    }

    #[test]
    fn sha7_is_total() {
        let t = |sha: &str| Target { repo: o_r(), branch: "main".into(), sha: sha.into() };
        assert_eq!(t(SHA).sha7(), "5d6e7f8");
        assert_eq!(t("").sha7(), ""); // a main tracker's ending before any head: no commit, no panic
        assert_eq!(t("abc").sha7(), "abc");
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
                poll_answers(&[ok("build")], &[]),                          // 20 s: all passed, but a first look
                poll_answers(&[ok("build"), ("e2e", "queued", None)], &[]), // 50 s: a workflow registered late
                poll_answers(&both, &[]),                                   // 80 s: all passed, the set as at 50 s
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
        assert_eq!(w.live_on(&o_r(), "main"), None, "ended: nothing for a main tracker to mirror");
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
        assert_eq!(w.live_on(&o_r(), "b0"), None, "the dropped watch is not mirrored");
        assert!(w.live_on(&o_r(), "b8").is_some());
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
            assert_eq!(w.live_on(&o_r(), "main"), None, "ended: nothing for a main tracker to mirror");
            let _ = fs::remove_dir_all(&d);
        }
    }

    #[test]
    fn with_ci_off_nothing_starts_and_no_gh_process_is_spawned() {
        let (d, push) = pushing("off");
        let mut w = Watcher::default();
        assert!(!w.on_push(false, &push, T0));
        assert_eq!(w.len(), 0);
        let gh = Stub::always(Err(GhError::Missing));
        for s in [0, 20, 50, 500, 5000] {
            assert!(w.tick(&gh, T0 + s * 1000, false).is_empty());
        }
        assert!(gh.log().is_empty(), "the stub saw no call");
        // turned off mid-run: the watches and lamps go, and no call follows
        assert!(w.on_push(true, &push, T0));
        assert!(w.tick(&gh, T0 + 1000, false).is_empty());
        assert_eq!((w.len(), w.cards().len(), gh.log().len()), (0, 0, 0));
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

    // ---- the watcher thread's worker, the lamps, the opener, the events ----

    fn input(enabled: bool, pushes: Vec<CiPush>, folders: &[(&str, &Path)]) -> Input {
        input_done(enabled, pushes, folders, &[])
    }

    fn input_done(enabled: bool, pushes: Vec<CiPush>, folders: &[(&str, &Path)], done: &[&str]) -> Input {
        let folders = folders.iter().map(|(d, p)| (d.to_string(), p.to_string_lossy().into_owned())).collect();
        Input { enabled, pushes, folders, done: done.iter().map(|d| d.to_string()).collect() }
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
        assert!(w.mains.lamp_rows().is_empty() && w.watcher.cards().is_empty());
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
        assert!(w.watcher.cards().is_empty(), "the cards go dark");
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
        assert!(open_target(&links, "Terra").is_err(), "a department: only its main tracker's link, and Terra has none");
        assert!(open_target(&links, "Other").is_ok(), "Other's is a tracker's (no session)");
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

    // ---- the main trackers wired in: the worker, the hub, the opener, the events ----

    const OLD: &str = "1a2b3c40123456789abcdef0123456789abcdef0";
    const FAILED: Runs<'static> = &[("build", "completed", Some("failure"))];
    const MAIN_STATUS: &str = "api repos/o/r/commits/main/status";

    fn main_runs(sha: &str) -> String {
        format!("api repos/o/r/commits/{sha}/check-runs?per_page=100")
    }

    /// One main tracker check's two answers, in its order: the branch's combined status (naming `sha`), then that
    /// commit's check-runs.
    fn main_poll(sha: &str, r: Runs) -> Vec<Result<String, GhError>> {
        let runs: Vec<Value> = r.iter().map(|(n, s, c)| json!({"id": 1, "name": n, "status": s, "conclusion": c, "head_sha": sha})).collect();
        vec![Ok(json!({"state": "pending", "sha": sha, "total_count": 0, "statuses": []}).to_string()), Ok(json!({"total_count": runs.len(), "check_runs": runs}).to_string())]
    }

    /// A fake repo checked out on `feat` whose default branch is `main` (`origin/HEAD`).
    fn on_feat(name: &str) -> (PathBuf, PathBuf) {
        let d = temp(name);
        let r = repo(&d, "feat", "git@github.com:o/r.git", None);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        (d, r)
    }

    /// A push of `dev` (at `SHA`) by session `s1` of Terra, from `r`.
    fn push_dev(r: &Path) -> CiPush {
        fs::write(r.join(".git/refs/remotes/origin/dev"), format!("{SHA}\n")).unwrap();
        let output = "To github.com:o/r.git\n   1a2b3c4..5d6e7f8  dev -> dev\n".into();
        CiPush { session_id: "s1".into(), name: "terra-77".into(), dept: "Terra".into(), cwd: r.to_string_lossy().into_owned(), command: "git push".into(), output }
    }

    #[test]
    fn worker_feeds_the_trackers() {
        let (d, r) = on_feat("feed");
        let gh = Stub::new([vec![Ok("ok".to_string())], main_poll(OLD, FAILED), main_poll(OLD, FAILED)].concat());
        let mut w = Worker::default();
        let terra = [("Terra", r.as_path())];
        w.step(&gh, T0, input(true, vec![], &terra));
        assert_eq!(gh.log(), ["auth status".to_string(), MAIN_STATUS.into(), main_runs(OLD)], "first sight: the tracker's 2 calls at once");
        for s in [30, 59] {
            w.step(&gh, T0 + s * 1000, input(true, vec![], &terra));
        }
        assert_eq!(gh.log().len(), 3, "a red head is idle: its next check is 5 min away");
        w.step(&gh, T0 + 60_000, input_done(true, vec![], &terra, &["Terra"]));
        assert_eq!(gh.log()[3..], [MAIN_STATUS.to_string(), main_runs(OLD)], "a scribe of Terra done: 2 more at once");
        let rows = w.mains.lamp_rows();
        assert_eq!(rows.iter().map(|l| (l.dept.as_str(), l.state, l.branch.as_str(), l.sha7.as_str())).collect::<Vec<_>>(), [("Terra", CiStatus::Fail, "main", "1a2b3c4")]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_lamp_row_is_the_departments_main_in_the_ci_lamps_shape() {
        let (d, r) = on_feat("lamp-row");
        let gh = Stub::new([vec![Ok("ok".to_string())], main_poll(OLD, FAILED)].concat());
        let (hub, mut w) = (Hub::default(), Worker::default());
        let step = w.step(&gh, T0, input(true, vec![], &[("Terra", &r)]));
        hub.publish(&w, step.finished, step.mains);
        let rows = hub.lamps();
        let cwd = r.to_string_lossy().into_owned();
        assert_eq!(rows, [Lamp { dept: "Terra".into(), cwd: cwd.clone(), state: CiStatus::Fail, branch: "main".into(), sha7: "1a2b3c4".into(), failed: Some("build".into()) }]);
        let json = serde_json::to_value(&rows[0]).unwrap();
        assert_eq!(json, json!({"dept": "Terra", "cwd": cwd, "state": "fail", "branch": "main", "sha7": "1a2b3c4", "failed": "build"}));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_push_to_main_is_one_record() {
        let (d, push) = pushing("one-record");
        let r = cwd_of(&push);
        origin_head(&r, "ref: refs/remotes/origin/main\n");
        let terra = [("Terra", r.as_path())];
        let mut script = vec![Ok("ok".to_string())];
        script.extend(main_poll(OLD, FAILED)); // T0: the tracker's first look, idle after it
        script.extend(polls(2, &[ok("build")], &[])); // the push watch at 80 s and 110 s: a pass
        script.extend(main_poll(SHA, &[ok("build")])); // 181 s: the second early check finds the pushed commit
        let gh = Stub::new(script);
        let (hub, mut w) = (Hub::default(), Worker::default());
        let (mut records, mut main_records) = (0, 0);
        let mut run = |w: &mut Worker, at: i64, input: Input| {
            let step = w.step(&gh, T0 + at * 1000, input);
            hub.publish(w, step.finished, step.mains);
            records += hub.take_verdicts().iter().filter_map(|f| verdict_event(f, T0)).count();
            main_records += hub.take_main_verdicts().len();
            gh.log().len()
        };
        assert_eq!(run(&mut w, 0, input(true, vec![], &terra)), 3);
        run(&mut w, 60, input(true, vec![push], &terra));
        // a scribe done right after its push: the tracker is due, inside the push watch's first 20 s
        run(&mut w, 61, input_done(true, vec![], &terra, &["Terra"]));
        assert_eq!(hub.lamps().iter().map(|l| (l.state, l.sha7.as_str())).collect::<Vec<_>>(), [(CiStatus::Running, "5d6e7f8")], "the department lamp shows the push");
        assert_eq!(run(&mut w, 70, input(true, vec![], &terra)), 3, "no tracker call for the commit the push watch follows");
        assert_eq!(run(&mut w, 80, input(true, vec![], &terra)), 5, "one gh pair a poll, not two");
        assert_eq!(gh.log()[3..], [format!("api repos/o/r/commits/{SHA}/check-runs?per_page=100"), format!("api repos/o/r/commits/{SHA}/status")], "the push watch's");
        assert_eq!(run(&mut w, 110, input(true, vec![], &terra)), 7);
        assert_eq!(hub.lamps()[0].state, CiStatus::Pass);
        assert_eq!(run(&mut w, 181, input(true, vec![], &terra)), 9, "the second early check");
        assert_eq!(gh.log()[7..], [MAIN_STATUS.to_string(), main_runs(SHA)]);
        assert_eq!((records, main_records), (1, 0), "one Chronicon record, the push's");
        assert_eq!(hub.lamps()[0].state, CiStatus::Pass);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_push_watch_is_live_from_its_push_until_it_ends() {
        let (d, push) = pushing("live-on");
        let mut w = Watcher::default();
        assert_eq!(w.live_on(&o_r(), "main"), None);
        w.on_push(true, &push, T0);
        let (target, live) = w.live_on(&Repo { owner: "O".into(), name: "R".into() }, "main").expect("before its first call");
        assert_eq!((live.state, live.sha7.as_str(), target.sha.as_str()), (CiStatus::Running, "5d6e7f8", SHA));
        assert_eq!(w.live_on(&o_r(), "dev"), None, "another branch");
        let gh = Stub::new(poll_answers(FAILED, &[]));
        w.tick(&gh, T0 + 20_000, true);
        assert_eq!(w.live_on(&o_r(), "main"), None, "ended: the tracker takes it by `adopt`");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn off_mid_step_drops_the_trackers() {
        let (d, r) = on_feat("off-mid");
        let hub = Hub::default();
        let stub = Stub::new([vec![Ok("ok".to_string())], main_poll(OLD, FAILED)].concat());
        let gated = Gated { inner: &stub, on: &hub.on };
        let mut w = Worker::default();
        let folders = vec![("Terra".to_string(), r.to_string_lossy().into_owned())];
        hub.submit(true, vec![], folders.clone(), vec![]);
        let step = w.step(&gated, T0, hub.next());
        hub.settle(&mut w, step);
        assert_eq!(hub.lamps().len(), 1);
        assert_eq!(stub.log().len(), 3);
        // the setting goes off after the hand-in was taken: the step still runs with it on, its tracker due
        hub.submit(true, vec![], folders, vec!["Terra".into()]);
        let input = hub.next();
        hub.submit(false, vec![], vec![], vec![]);
        let step = w.step(&gated, T0 + 60_000, input);
        hub.settle(&mut w, step);
        assert!(hub.lamps().is_empty(), "the lamps go with the setting");
        assert!(hub.open_url_for("Terra").is_err());
        assert_eq!(stub.log().len(), 3, "no call reached gh");
        let step = w.step(&gated, T0 + 61_000, Input::default());
        hub.settle(&mut w, step);
        assert!(hub.lamps().is_empty() && w.mains.lamp_rows().is_empty());
        assert_eq!(stub.log().len(), 3);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_folder_lamp_opens_main() {
        let (d, r) = on_feat("opens-main");
        let gh = Stub::new([vec![Ok("ok".to_string())], main_poll(OLD, FAILED)].concat());
        let (hub, mut w) = (Hub::default(), Worker::default());
        let terra = [("Terra", r.as_path())];
        let step = w.step(&gh, T0, input(true, vec![], &terra));
        hub.publish(&w, step.finished, step.mains);
        // later, a session of Terra pushes another branch
        let step = w.step(&gh, T0 + 1000, input(true, vec![push_dev(&r)], &terra));
        hub.publish(&w, step.finished, step.mains);
        assert_eq!(hub.open_url_for("Terra").unwrap(), format!("https://github.com/o/r/commit/{OLD}/checks"), "the folder's lamp: main's head");
        assert_eq!(hub.open_url_for("s1").unwrap(), format!("https://github.com/o/r/commit/{SHA}/checks"), "the session's card: its push");
        let mut later = link(9, Some("s1"), "Terra", CiStatus::Running);
        (later.target.branch, later.target.sha) = ("dev".into(), OLD.into());
        let links = [link(1, None, "Terra", CiStatus::Fail), later];
        assert_eq!(open_target(&links, "Terra").unwrap(), checks_url(&links[0].target), "never a session's link, newer or not");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn one_pause_holds_watches_and_trackers() {
        let (d, r) = on_feat("one-pause");
        let terra = [("Terra", r.as_path())];
        let reset = (T0 + 600_000) / 1000;
        // the push watch meets the limit: the tracker waits
        let gh = Stub::new([vec![Ok("ok".to_string())], main_poll(OLD, FAILED), vec![Err(GhError::RateLimit(Some(reset)))]].concat());
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![], &terra));
        w.step(&gh, T0 + 1000, input(true, vec![push_dev(&r)], &terra));
        let paused = w.step(&gh, T0 + 21_000, input(true, vec![], &terra)).notes;
        assert_eq!(gh.log().len(), 4, "the push watch's call that met the limit");
        assert!(paused.iter().any(|(_, m)| m.contains("rate limit")), "{paused:?}");
        w.step(&gh, T0 + 60_000, input_done(true, vec![], &terra, &["Terra"]));
        assert_eq!(gh.log().len(), 4, "the tracker is held by the same pause");
        assert_eq!(w.mains.lamp_rows()[0].state, CiStatus::None, "unlit while paused");
        // the tracker meets the limit: the push watch waits
        let gh2 = Stub::new(vec![Ok("ok".to_string()), Err(GhError::RateLimit(Some(reset)))]);
        let mut w2 = Worker::default();
        w2.step(&gh2, T0, input(true, vec![push_dev(&r)], &terra));
        assert_eq!(gh2.log(), ["auth status", MAIN_STATUS]);
        w2.step(&gh2, T0 + 21_000, input(true, vec![], &terra));
        assert_eq!(gh2.log().len(), 2, "the push watch is held by the same pause");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_tracker_that_answers_again_clears_its_warning() {
        let (d, r) = on_feat("ready-again");
        let terra = [("Terra", r.as_path())];
        let ready = vec![(status::State::Ok, "gh ready".to_string())];
        // logged out, then logged in: the next good poll on the same head says so, once, and records nothing
        let gh = Stub::new([vec![Ok("ok".to_string()), Err(GhError::NotLoggedIn)], main_poll(OLD, FAILED), main_poll(OLD, FAILED)].concat());
        let mut w = Worker::default();
        assert_eq!(w.step(&gh, T0, input(true, vec![], &terra)).notes[1].0, status::State::Warn);
        let back = w.step(&gh, T0 + crate::ci_main::IDLE_MS, input(true, vec![], &terra));
        assert_eq!(gh.log().len(), 4);
        assert_eq!(back.notes, ready);
        assert!(back.mains.iter().all(|m| main_verdict_event(m, T0).is_none()), "not a Chronicon record: {:?}", back.mains);
        let later = w.step(&gh, T0 + 2 * crate::ci_main::IDLE_MS, input(true, vec![], &terra));
        assert_eq!(gh.log().len(), 6);
        assert!(later.notes.is_empty(), "said once: {:?}", later.notes);
        // three unusable answers, then a good one
        let other = || Err(GhError::Other("boom".into()));
        let gh = Stub::new([vec![Ok("ok".to_string()), other(), other(), other()], main_poll(OLD, FAILED)].concat());
        let mut w = Worker::default();
        w.step(&gh, T0, input(true, vec![], &terra));
        w.step(&gh, T0 + POLL_MS, input(true, vec![], &terra));
        assert_eq!(w.step(&gh, T0 + 2 * POLL_MS, input(true, vec![], &terra)).notes[0].0, status::State::Warn);
        let back = w.step(&gh, T0 + 2 * POLL_MS + crate::ci_main::IDLE_MS, input(true, vec![], &terra));
        assert_eq!(gh.log().len(), 6);
        assert_eq!(back.notes, ready);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_tracker_skip_every_five_minutes_leaves_one_status_line() {
        let (d, r) = on_feat("skip-note");
        let gh = Stub::new(vec![Ok("ok".to_string()), Err(GhError::NotLoggedIn), Err(GhError::NotLoggedIn)]);
        let mut w = Worker::default();
        let terra = [("Terra", r.as_path())];
        let first = w.step(&gh, T0, input(true, vec![], &terra)).notes;
        let skipped = (status::State::Warn, "CI check skipped: gh not logged in".to_string());
        assert_eq!(&first[1..], std::slice::from_ref(&skipped));
        assert!(w.step(&gh, T0 + 60_000, input(true, vec![], &terra)).notes.is_empty());
        let again = w.step(&gh, T0 + crate::ci_main::IDLE_MS, input(true, vec![], &terra)).notes;
        assert_eq!(gh.log().len(), 3, "checked again 5 min later");
        assert_eq!(again, std::slice::from_ref(&skipped), "the same note, word for word");
        // what `Hub::settle` hands it to: an unchanged note leaves the entry (and the log) as it was
        let name = "ci-test-skip-note";
        status::report_change(name, skipped.0, &skipped.1);
        let at = status::entry(name).unwrap().time_ms;
        std::thread::sleep(Duration::from_millis(5));
        status::report_change(name, again[0].0, &again[0].1);
        assert_eq!(status::entry(name).unwrap().time_ms, at, "no second line");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn scribes_done_cases() {
        let s = |id: &str, dept: &str, status: &str| Session { id: id.into(), dept: dept.into(), status: status.into(), ..Default::default() };
        let prev = [
            s("a", "Terra", "busy"),
            s("b", "Mars", "busy"),
            s("c", "Luna", "idle"),
            s("d", "Io", "waiting"),
            s("e", "Terra", "busy"),
            s("f", "Venus", "busy"),
            s("g", "Ceres", "shell"),
            s("h", "Pluto", "waiting"),
            s("i", "Eris", "busy"),
        ];
        let now = [s("a", "Terra", "idle"), s("c", "Luna", "idle"), s("d", "Io", "idle"), s("e", "Terra", "idle"), s("f", "Venus", "busy"), s("g", "Ceres", "idle"), s("i", "Eris", "shell")];
        // a: busy to idle; b: busy to gone; c: idle to idle; d: waiting to idle; e: Terra again; f: still busy;
        // g: shell to idle; h: waiting to gone (any session that leaves the roster); i: busy to shell, still working
        assert_eq!(scribes_done(&prev, &now), ["Terra", "Mars", "Ceres", "Pluto"]);
        assert!(scribes_done(&[], &now).is_empty(), "the first tick");
        assert!(scribes_done(&now, &now).is_empty());
    }

    #[test]
    fn a_main_verdict_is_a_chronicon_event_of_the_department() {
        let target = Target { repo: Repo { owner: "o".into(), name: "r".into() }, branch: "main".into(), sha: SHA.into() };
        let m = |ended: Ended| MainEnded { dept: "Terra".into(), target: target.clone(), ended };
        let pass = main_verdict_event(&m(Ended::Pass), 7).unwrap();
        assert_eq!((pass.kind.as_str(), pass.session_id.as_str(), pass.name.as_str(), pass.dept.as_str(), pass.ts), ("ci-pass", "", "Terra", "Terra", 7));
        assert_eq!(pass.detail, "main · 5d6e7f8");
        let fail = main_verdict_event(&m(Ended::Fail("build (ubuntu)".into())), 8).unwrap();
        assert_eq!((fail.kind.as_str(), fail.detail.as_str()), ("ci-fail", "main · 5d6e7f8 · build (ubuntu)"));
        for e in [Ended::Timeout, Ended::Error, Ended::NoCi, Ended::Skipped("gh not found".into())] {
            assert!(main_verdict_event(&m(e.clone()), 1).is_none(), "{e:?}");
        }
        // an ending before any head: no commit, no event, no panic
        let early = MainEnded { dept: "Terra".into(), target: Target { sha: String::new(), ..target.clone() }, ended: Ended::Skipped("gh not found".into()) };
        assert!(main_verdict_event(&early, 1).is_none());
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
        assert!(verdict_event(&finished(None, Ended::Pass), 1).is_none(), "no session: not a push watch's");
    }

    #[test]
    fn the_hub_drops_what_waits_when_the_setting_goes_off_and_keeps_each_folder_once() {
        let (d, push) = pushing("hub");
        let hub = Hub::default();
        let folders = vec![("Terra".to_string(), "/w".to_string())];
        let done = vec!["Terra".to_string()];
        hub.submit(true, vec![push.clone()], folders.clone(), done.clone());
        hub.submit(true, vec![], folders.clone(), done.clone());
        {
            let i = crate::lock(&hub.inbox);
            assert!(i.enabled);
            assert_eq!((i.pushes.len(), i.folders.len(), i.done.len()), (1, 1, 1), "the folder and its scribe done wait once");
        }
        hub.submit(false, vec![push], folders, done);
        let got = hub.next();
        assert!(!got.enabled && got.pushes.is_empty() && got.folders.is_empty() && got.done.is_empty(), "nothing from before reaches gh");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_hub_shows_what_the_worker_published() {
        let (d, push) = pushing("hub-view");
        let gh = Stub::new(running());
        let (hub, mut w) = (Hub::default(), Worker::default());
        assert!(hub.card("s1").is_none() && hub.lamps().is_empty());
        let step = w.step(&gh, T0, input(true, vec![push], &[]));
        hub.publish(&w, step.finished, step.mains);
        assert_eq!(hub.card("s1").map(|c| c.state), Some(CiStatus::Running));
        assert!(hub.lamps().is_empty(), "a push lights no department lamp of its own: the lamps are the main trackers'");
        assert!(hub.take_verdicts().is_empty() && hub.take_main_verdicts().is_empty());
        assert!(hub.open_url_for("s1").unwrap().ends_with("/checks"));
        assert!(hub.open_url_for("nobody").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    // ---- the bounded run: the test binary stands in for the gh CLI ----

    /// Started with `ADM_FAKE_GH` set (by `fake`), this test plays a fake `gh` and exits; in a normal run the variable
    /// is absent and it does nothing.
    #[test]
    fn fake_gh() {
        use std::io::Write;
        match std::env::var("ADM_FAKE_GH").as_deref() {
            Ok("sleep") => std::thread::sleep(Duration::from_secs(60)),
            Ok("ok") => {
                let _ = std::io::stdout().write_all(b"FAKE-GH-OK\n");
                std::process::exit(0)
            }
            Ok("404") => {
                let _ = std::io::stderr().write_all(b"gh: Not Found (HTTP 404)\n");
                std::process::exit(1)
            }
            _ => {}
        }
    }

    fn fake(mode: &'static str) -> impl Fn(&str) -> Command {
        move |exe| {
            let mut c = Command::new(exe);
            c.args(["--exact", "ci::tests::fake_gh", "--nocapture", "--test-threads=1"]).env("ADM_FAKE_GH", mode);
            c
        }
    }

    fn me() -> String {
        std::env::current_exe().unwrap().to_string_lossy().into_owned()
    }

    #[test]
    fn a_gh_that_hangs_is_killed_and_counts_as_a_failed_call() {
        let started = Instant::now();
        let err = first_of(&[me()], fake("sleep"), Duration::from_millis(400)).unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(5), "returned within the bound, not after the fake's 60 s: {:?}", started.elapsed());
        assert!(matches!(&err, GhError::Other(m) if m.contains("did not answer")), "{err:?}");
        // three such calls in a row end a watch with `error` (Watcher: MAX_FAILURES), as for any other failed call
        assert!(matches!(err, GhError::Other(_)));
    }

    #[test]
    fn the_bounded_run_returns_output_classifies_failures_and_skips_missing_candidates() {
        let nowhere = "this-gh-is-not-installed".to_string();
        assert!(first_of(&[nowhere.clone(), me()], fake("ok"), Duration::from_secs(20)).unwrap().contains("FAKE-GH-OK"));
        assert_eq!(first_of(&[me()], fake("404"), Duration::from_secs(20)).unwrap_err(), GhError::NoAccess);
        assert_eq!(first_of(&[nowhere], fake("ok"), Duration::from_secs(1)).unwrap_err(), GhError::Missing);
        assert_eq!(first_of(&[], fake("ok"), Duration::from_secs(1)).unwrap_err(), GhError::Missing);
    }

    // ---- review fixes: the switch mid-batch, a publish per poll, the repo's source, a truncated list ----

    /// Records each call and flips the switch off during the first one.
    struct Flip<'a> {
        calls: RefCell<Vec<String>>,
        on: &'a AtomicBool,
    }

    impl Gh for Flip<'_> {
        fn run(&self, args: &[&str]) -> Result<String, GhError> {
            self.calls.borrow_mut().push(args.join(" "));
            self.on.store(false, Ordering::SeqCst);
            Ok(runs(&[("a", "in_progress", None)]))
        }
    }

    /// Two watches in two folders of one fake repo, both due at `T0 + 20 s`.
    fn two_watches(name: &str) -> (PathBuf, Watcher) {
        let d = temp(name);
        let r = repo(&d, "b0", "git@github.com:o/r.git", None);
        let mut w = Watcher::default();
        for i in 0..2 {
            let branch = format!("b{i}");
            let sha = format!("{i:x}").repeat(40);
            fs::write(r.join(".git/refs/remotes/origin").join(&branch), format!("{sha}\n")).unwrap();
            let out = format!("To github.com:o/r.git\n   1a2b3c4..{}  {branch} -> {branch}\n", &sha[..7]);
            let push = CiPush { session_id: format!("s{i}"), name: format!("n{i}"), dept: format!("D{i}"), cwd: r.to_string_lossy().into_owned(), command: "git push".into(), output: out };
            assert!(w.on_push(true, &push, T0));
        }
        (d, w)
    }

    #[test]
    fn a_batch_stops_at_the_switch_no_gh_call_after_it_goes_off() {
        let (d, mut w) = two_watches("flip");
        let on = AtomicBool::new(true);
        let flip = Flip { calls: RefCell::default(), on: &on };
        let gated = Gated { inner: &flip, on: &on };
        w.tick(&gated, T0 + 20_000, true);
        assert_eq!(flip.calls.borrow().len(), 1, "the call that flipped it was the last: {:?}", flip.calls.borrow());
        w.tick(&gated, T0 + 50_000, true);
        assert_eq!(flip.calls.borrow().len(), 1, "and none on the next round either");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_hub_gate_follows_submit() {
        let hub = Hub::default();
        let stub = Stub::always(Ok("x".into()));
        let gated = Gated { inner: &stub, on: &hub.on };
        hub.submit(true, vec![], vec![], vec![]);
        assert!(gated.run(&["api", "x"]).is_ok());
        hub.submit(false, vec![], vec![], vec![]);
        assert!(gated.run(&["api", "x"]).is_err());
        assert_eq!(stub.log().len(), 1, "the refused call never reached gh");
    }

    #[test]
    fn the_watches_are_published_after_each_poll() {
        let (d, mut w) = two_watches("per-poll");
        let mut script = poll_answers(&[("a", "in_progress", None)], &[]);
        script.extend(poll_answers(&[("a", "in_progress", None)], &[]));
        let gh = Stub::new(script);
        let mut seen = vec![];
        w.tick_with(&gh, T0 + 20_000, true, &mut |w| seen.push(gh.log().len() + 100 * w.len()));
        assert_eq!(seen, [202, 204], "called after the first poll's two gh calls, then after the second's");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_repo_comes_from_the_configured_remote_not_from_the_push_output() {
        let d = temp("repo-source");
        let r = repo(&d, "main", "git@github.com:o/r.git", Some(("main", SHA)));
        let evil = "To github.com:evil/x.git\n   1a2b3c4..5d6e7f8  main -> main\n";
        for command in ["git push", "git push origin"] {
            let t = resolve_push(&r, command, evil).expect(command);
            assert_eq!(t.repo.slug(), "o/r", "{command}: `To` did not choose the repository");
        }
        assert_eq!(resolve_push(&r, "git push", PUSHED).unwrap().repo.slug(), "o/r");
        // a configured remote that is not GitHub: nothing to watch, whatever the output says
        let g = repo(&d.join("g"), "main", "git@gitlab.com:o/r.git", Some(("main", SHA)));
        assert!(resolve_push(&g, "git push", evil).is_none());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_truncated_check_list_never_passes() {
        let page = |n: usize, total: usize| {
            let r: Vec<Value> = (0..n).map(|i| json!({"name": format!("c{i}"), "status": "completed", "conclusion": "success"})).collect();
            json!({"total_count": total, "check_runs": r}).to_string()
        };
        let snap = evaluate(&page(100, 150), &statuses(&[])).unwrap();
        assert_eq!((snap.verdict, snap.done, snap.total), (Verdict::Running, 100, 150), "50 checks were not seen");
        assert_eq!(evaluate(&page(100, 100), &statuses(&[])).unwrap().verdict, Verdict::Pass, "a full set still passes");
        // statuses are cut too (30 per page by default)
        let st = json!({"state": "success", "total_count": 45, "statuses": [{"context": "ci", "state": "success"}]}).to_string();
        assert_eq!(evaluate(&runs(&[ok("a")]), &st).unwrap().verdict, Verdict::Running);
        // a failure in the page is still a failure
        let bad = json!({"total_count": 150, "check_runs": [{"name": "x", "status": "completed", "conclusion": "failure"}]}).to_string();
        assert_eq!(evaluate(&bad, &statuses(&[])).unwrap().verdict, Verdict::Fail("x".into()));
    }
}
