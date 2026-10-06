//! The live roster, polled once a second. Per-tick work is kept to a few stats: liveness probes
//! only the pids named in `~/.claude/sessions` (no whole-system process snapshot), and transcript
//! tails and helpers are re-read only when their file's (len, mtime) changed.
use crate::git;
use crate::registry::{self, FileStat, Helper, Session, Tail};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// Branch per cwd is re-read from `.git/HEAD` at most this often.
const BRANCH_EVERY: Duration = Duration::from_secs(5);


/// Transcript files per live session id: the main one (false) and its subagents' (true).
pub type Files = HashMap<String, Vec<(FileStat, bool)>>;

type Memo<T> = HashMap<PathBuf, (u64, i64, T)>;

pub struct Poller {
    sessions: PathBuf,
    projects: PathBuf,
    sys: System,
    completions: registry::Completions,
    /// Orca terminal handle per pid: environ() is only ever read for a pid not seen yet.
    orca_cache: HashMap<u32, Option<String>>,
    /// Session id -> transcript found by the all-projects scan, done once per id when the direct
    /// slug path misses. ponytail: a miss is cached for the session's life; a transcript that later
    /// appears outside the direct path is not found (the direct path is still checked every tick).
    found: HashMap<String, Option<PathBuf>>,
    tails: Memo<Option<Tail>>,
    helpers: Memo<Helper>,
    /// Branch per cwd, re-read from `.git/HEAD` at most every BRANCH_EVERY.
    branches: HashMap<String, (Instant, Option<String>)>,
    /// This tick's transcript files, for the chronicle.
    pub files: Files,
}

impl Poller {
    pub fn new(claude_dir: &Path) -> Self {
        Poller {
            sessions: claude_dir.join("sessions"),
            projects: claude_dir.join("projects"),
            sys: System::new(),
            completions: registry::Completions::default(),
            orca_cache: HashMap::new(),
            found: HashMap::new(),
            tails: HashMap::new(),
            helpers: HashMap::new(),
            branches: HashMap::new(),
            files: HashMap::new(),
        }
    }

    pub fn roster(&mut self, prev: &[Session], now_ms: i64) -> Vec<Session> {
        let Poller { sessions, projects, sys, completions, orca_cache, found, tails, helpers, branches, files } = self;
        files.clear();
        let scanned = registry::scan(
            sessions,
            alive,
            |id, cwd| {
                let (main, subs) = locate(projects, found, id, cwd);
                let tail = main.as_ref().and_then(|m| memo(tails, m, || registry::read_tail(|n| registry::file_tail(&m.path, n))));
                let empty = HashMap::new();
                let completed = main.as_ref().map_or(&empty, |m| completions.scan(id, m));
                let hs = registry::active_helpers(&subs, now_ms, completed, |f, hid| memo(helpers, f, || registry::read_helper(f, hid)));
                files.insert(id.to_string(), main.into_iter().map(|m| (m, false)).chain(subs.into_iter().map(|f| (f, true))).collect());
                (tail, hs)
            },
            |pid| orca_handle(sys, orca_cache, pid),
        );
        let mut roster = registry::merge(prev, scanned);
        registry::track_compaction(prev, &mut roster, now_ms);
        for s in roster.iter_mut() {
            if !branches.get(&s.cwd).is_some_and(|(at, _)| at.elapsed() < BRANCH_EVERY) {
                branches.insert(s.cwd.clone(), (Instant::now(), git::branch_of(Path::new(&s.cwd))));
            }
            s.branch = branches.get(&s.cwd).and_then(|(_, b)| b.clone());
        }
        branches.retain(|cwd, _| roster.iter().any(|s| &s.cwd == cwd));
        // Sessions carried over from the last tick (record mid-write) still get their files listed.
        for s in &roster {
            if !files.contains_key(&s.id) {
                let (main, subs) = locate(projects, found, &s.id, &s.cwd);
                files.insert(s.id.clone(), main.into_iter().map(|m| (m, false)).chain(subs.into_iter().map(|f| (f, true))).collect());
            }
        }
        // Everything cached is evicted with its session or file.
        let ids: HashSet<String> = roster.iter().map(|s| s.id.clone()).collect();
        let pids: HashSet<u32> = roster.iter().map(|s| s.pid).collect();
        let paths: HashSet<&PathBuf> = files.values().flatten().map(|(f, _)| &f.path).collect();
        let mains: HashSet<String> = files.values().flatten().filter(|(_, sub)| !sub).map(|(f, _)| f.path.to_string_lossy().into_owned()).collect();
        orca_cache.retain(|pid, _| pids.contains(pid));
        found.retain(|id, _| ids.contains(id));
        tails.retain(|p, _| paths.contains(p));
        helpers.retain(|p, _| paths.contains(p));
        completions.retain(&ids, &mains);
        roster
    }
}

/// A session's transcript (direct slug path, else the cached all-projects scan) and its subagents.
fn locate(projects: &Path, found: &mut HashMap<String, Option<PathBuf>>, id: &str, cwd: &str) -> (Option<FileStat>, Vec<FileStat>) {
    let direct = registry::direct_transcript(projects, id, cwd);
    let main = registry::stat(&direct).or_else(|| found.entry(id.to_string()).or_insert_with(|| registry::find_transcript(projects, id)).as_deref().and_then(registry::stat));
    // `<project>/<id>.jsonl` keeps its subagents in `<project>/<id>/subagents`.
    let dir = main.as_ref().map_or(direct, |m| m.path.clone()).with_extension("").join("subagents");
    (main, registry::list_subagents(&dir))
}

/// `read()` once per (len, mtime) of `f`; the cached value otherwise.
fn memo<T: Clone>(m: &mut Memo<T>, f: &FileStat, read: impl FnOnce() -> T) -> T {
    if let Some((len, mtime, v)) = m.get(&f.path) {
        if (*len, *mtime) == (f.len, f.mtime_ms) {
            return v.clone();
        }
    }
    let v = read();
    m.insert(f.path.clone(), (f.len, f.mtime_ms, v.clone()));
    v
}

fn orca_handle(sys: &mut System, cache: &mut HashMap<u32, Option<String>>, pid: u32) -> Option<String> {
    if let Some(cached) = cache.get(&pid) {
        return cached.clone();
    }
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true, ProcessRefreshKind::nothing().with_environ(UpdateKind::Always));
    let handle = sys.process(Pid::from_u32(pid)).and_then(|p| p.environ().iter().find_map(|e| e.to_str()?.strip_prefix("ORCA_TERMINAL_HANDLE=").map(str::to_string)));
    cache.insert(pid, handle.clone());
    handle
}

/// An executable path (or bare name) that is Claude Code's `claude.exe`.
fn is_claude_image(path: &str) -> bool {
    path.rsplit(['\\', '/']).next().is_some_and(|n| n.eq_ignore_ascii_case("claude.exe"))
}

/// The session record's `procStart` (FILETIME, decimal) against the process's creation time: a
/// mismatch means the pid was reused. No or unreadable `procStart`: trust the name check alone.
fn same_start(proc_start: Option<&str>, created: u64) -> bool {
    proc_start.and_then(|s| s.parse::<u64>().ok()).map_or(true, |s| s == created)
}

/// Whether `pid` is a running `claude.exe` started at `proc_start`: one process handle, no snapshot.
#[cfg(windows)]
pub fn alive(pid: u32, proc_start: Option<&str>) -> bool {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, STILL_ACTIVE},
        System::Threading::{GetExitCodeProcess, GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
    };
    // SAFETY: plain Win32 calls on a handle opened and closed here; every out-pointer is a live local.
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return false;
        }
        let mut code = 0u32;
        let mut name = [0u16; 1024];
        let mut len = name.len() as u32;
        let zero = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
        let ok = GetExitCodeProcess(h, &mut code) != 0
            && code == STILL_ACTIVE as u32
            && QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, name.as_mut_ptr(), &mut len) != 0
            && is_claude_image(&String::from_utf16_lossy(&name[..len as usize]))
            && GetProcessTimes(h, &mut created, &mut exited, &mut kernel, &mut user) != 0
            && same_start(proc_start, (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime));
        CloseHandle(h);
        ok
    }
}

/// ponytail: non-Windows is a dev build only: a one-pid sysinfo refresh, no pid-reuse guard.
#[cfg(not(windows))]
pub fn alive(pid: u32, _proc_start: Option<&str>) -> bool {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true, ProcessRefreshKind::nothing());
    sys.process(Pid::from_u32(pid)).is_some_and(|p| is_claude_image(&p.name().to_string_lossy()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_image_by_file_name() {
        assert!(is_claude_image(r"C:\Users\x\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"));
        assert!(is_claude_image("CLAUDE.EXE"));
        assert!(!is_claude_image(r"C:\x\notclaude.exe"));
        assert!(!is_claude_image(r"C:\claude.exe\node.exe"));
    }

    #[test]
    fn proc_start_guards_pid_reuse() {
        assert!(same_start(Some("134356821919957930"), 134356821919957930));
        assert!(!same_start(Some("134356821919957930"), 134356821919957931), "same pid, another process");
        assert!(same_start(None, 1), "older records have no procStart");
        assert!(same_start(Some("garbage"), 1));
    }

    #[test]
    fn this_test_process_is_not_a_claude_session() {
        assert!(!alive(std::process::id(), None), "not claude.exe");
        assert!(!alive(u32::MAX - 3, None), "no such pid");
    }

    #[test]
    fn memo_rereads_only_when_len_or_mtime_change() {
        let mut m = Memo::new();
        let f = FileStat { path: "a".into(), len: 1, mtime_ms: 1 };
        let mut reads = 0;
        for f in [f.clone(), f.clone(), FileStat { len: 2, ..f.clone() }, FileStat { mtime_ms: 2, len: 2, ..f }] {
            memo(&mut m, &f, || reads += 1);
        }
        assert_eq!(reads, 3);
    }

    #[test]
    fn locate_scans_other_projects_once_per_session() {
        let d = std::env::temp_dir().join(format!("adm-poller-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let moved = d.join("C--elsewhere");
        std::fs::create_dir_all(moved.join("s1").join("subagents")).unwrap();
        std::fs::write(moved.join("s1.jsonl"), "{}\n").unwrap();
        std::fs::write(moved.join("s1").join("subagents").join("agent-a.jsonl"), "{}\n").unwrap();
        let mut found = HashMap::new();
        let (main, subs) = locate(&d, &mut found, "s1", r"C:\moved");
        assert_eq!(main.map(|m| m.path), Some(moved.join("s1.jsonl")));
        assert_eq!(subs.len(), 1, "subagents next to the transcript found");
        std::fs::remove_dir_all(&moved).unwrap();
        std::fs::create_dir_all(d.join("C--other")).unwrap();
        std::fs::write(d.join("C--other").join("s1.jsonl"), "{}\n").unwrap();
        assert!(locate(&d, &mut found, "s1", r"C:\moved").0.is_none(), "cached path, no second scan");
        let (none, _) = locate(&d, &mut found, "s2", r"C:\x");
        assert!(none.is_none() && found["s2"].is_none());
    }
}
