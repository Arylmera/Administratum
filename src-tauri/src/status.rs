//! Where failures land: a store with one entry per integration (the Settings > Status tab reads it through
//! `integration_status`) and a rotating log file in the app data folder. A release build has no console, so every
//! line the backend used to print goes through here. Every stored message and every line written (file and stderr)
//! passes `mask::mask` first: an error from a child process or a URL may carry a token.
use crate::mask::mask;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fmt::Display,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

/// The log file's name in the app data folder; its older copies are `administratum.log.1`, `.2`.
pub const LOG_NAME: &str = "administratum.log";
/// A log file is rotated before it would pass this size.
pub const LOG_CAP: u64 = 1024 * 1024;
/// Files kept: the current log and its older copies.
pub const LOG_FILES: usize = 3;
/// A stored message or log line is cut to this many characters.
const MAX_MESSAGE: usize = 400;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Ok,
    Warn,
    Error,
}

impl State {
    fn word(self) -> &'static str {
        match self {
            State::Ok => "ok",
            State::Warn => "warn",
            State::Error => "error",
        }
    }
}

/// One integration's last known state.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub state: State,
    /// Masked and clipped.
    pub message: String,
    pub time_ms: i64,
}

/// `text` masked, on one line, clipped to `MAX_MESSAGE` characters.
fn clean(text: &str) -> String {
    let one: String = mask(text).chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let one = one.trim();
    if one.chars().count() > MAX_MESSAGE {
        format!("{}…", one.chars().take(MAX_MESSAGE).collect::<String>())
    } else {
        one.to_string()
    }
}

/// The entries, one per integration name (the newest report wins).
#[derive(Default)]
pub struct Store(BTreeMap<String, Entry>);

impl Store {
    pub fn set(&mut self, name: &str, state: State, message: &str, now_ms: i64) {
        self.0.insert(name.to_string(), Entry { name: name.to_string(), state, message: clean(message), time_ms: now_ms });
    }

    pub fn entries(&self) -> Vec<Entry> {
        self.0.values().cloned().collect()
    }
}

/// A rotating log: `path`, then `path.1` (older) to `path.{keep-1}`; the current file is rotated before a line
/// would take it past `cap` bytes.
pub struct Log {
    path: PathBuf,
    cap: u64,
    keep: usize,
}

impl Log {
    pub fn new(path: PathBuf, cap: u64, keep: usize) -> Self {
        Log { path, cap, keep: keep.max(1) }
    }

    fn numbered(&self, n: usize) -> PathBuf {
        let mut s = self.path.clone().into_os_string();
        s.push(format!(".{n}"));
        PathBuf::from(s)
    }

    fn rotate(&self) -> std::io::Result<()> {
        if self.keep == 1 {
            return fs::remove_file(&self.path);
        }
        let _ = fs::remove_file(self.numbered(self.keep - 1));
        for n in (1..self.keep - 1).rev() {
            let from = self.numbered(n);
            if from.exists() {
                fs::rename(from, self.numbered(n + 1))?;
            }
        }
        fs::rename(&self.path, self.numbered(1))
    }

    /// Append `line` (a newline is added). The line is masked here too, so no caller can skip it.
    pub fn write(&self, line: &str) -> std::io::Result<()> {
        let text = format!("{}\n", clean(line));
        let size = fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        if size > 0 && size + text.len() as u64 > self.cap {
            self.rotate()?;
        }
        fs::OpenOptions::new().create(true).append(true).open(&self.path)?.write_all(text.as_bytes())
    }
}

/// One log line: `2026-11-21T10:00:00Z remote error: cannot listen on port 7770`.
fn line(now_ms: i64, name: &str, state: &str, message: &str) -> String {
    let at = chrono::DateTime::from_timestamp_millis(now_ms).map(|t| t.format("%Y-%m-%dT%H:%M:%SZ").to_string()).unwrap_or_default();
    format!("{at} {name} {state}: {message}")
}

static STORE: Mutex<Option<Store>> = Mutex::new(None);
static LOG: OnceLock<Log> = OnceLock::new();

/// Start writing the log file in `dir` (the app data folder). Before this, lines only go to the store and stderr.
pub fn init(dir: &Path) {
    let _ = fs::create_dir_all(dir);
    let _ = LOG.set(Log::new(dir.join(LOG_NAME), LOG_CAP, LOG_FILES));
}

/// A line to the log file and stderr (dev mode still sees it), masked; the store is not touched.
pub fn note(name: &str, message: impl Display) {
    emit(name, "info", &message.to_string());
}

/// Record `name`'s state and message, and log it.
pub fn report(name: &str, state: State, message: impl Display) {
    let message = message.to_string();
    crate::lock(&STORE).get_or_insert_with(Store::default).set(name, state, &message, crate::now_ms());
    emit(name, state.word(), &message);
}

fn emit(name: &str, state: &str, message: &str) {
    let masked = clean(&line(crate::now_ms(), name, state, message));
    eprintln!("{masked}");
    if let Some(log) = LOG.get() {
        let _ = log.write(&masked);
    }
}

/// Like `report`, but nothing happens when the entry already holds this state and message: a call that fails every
/// few seconds leaves one line, not thousands.
pub fn report_change(name: &str, state: State, message: impl Display) {
    let message = message.to_string();
    let same = crate::lock(&STORE).as_ref().and_then(|s| s.0.get(name)).is_some_and(|e| e.state == state && e.message == clean(&message));
    if !same {
        report(name, state, message);
    }
}

/// `name`'s entry, if it ever reported.
pub fn entry(name: &str) -> Option<Entry> {
    crate::lock(&STORE).as_ref().and_then(|s| s.0.get(name).cloned())
}

/// Settings > Status: every integration's last known state.
#[tauri::command]
pub fn integration_status() -> Vec<Entry> {
    crate::lock(&STORE).as_ref().map(Store::entries).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-status-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn the_store_keeps_one_entry_per_integration_newest_report_wins() {
        let mut s = Store::default();
        s.set("remote", State::Error, "cannot listen on port 7770", 10);
        s.set("orca", State::Ok, "answered", 11);
        s.set("remote", State::Ok, "serving", 12);
        let e = s.entries();
        assert_eq!(e.iter().map(|e| (e.name.as_str(), e.state, e.message.as_str(), e.time_ms)).collect::<Vec<_>>(), [("orca", State::Ok, "answered", 11), ("remote", State::Ok, "serving", 12)]);
        let j = serde_json::to_value(&e[0]).unwrap();
        assert_eq!((j["state"].as_str(), j["timeMs"].as_i64()), (Some("ok"), Some(11)));
    }

    #[test]
    fn a_message_is_masked_on_one_line_and_clipped() {
        let mut s = Store::default();
        s.set("pack", State::Warn, "fetch failed\nAuthorization: Bearer abcdef0123456789xyzQ\r\n", 1);
        assert_eq!(s.entries()[0].message, "fetch failed Authorization: Bearer •••");
        s.set("pack", State::Warn, &"x".repeat(1000), 2);
        assert_eq!(s.entries()[0].message.chars().count(), MAX_MESSAGE + 1);
    }

    #[test]
    fn a_token_shaped_string_is_written_masked() {
        let d = dir("masked");
        let log = Log::new(d.join(LOG_NAME), LOG_CAP, LOG_FILES);
        log.write(&line(0, "pack", "error", "download failed: https://x?api_key=XyZ1234567890abcd and ghp_0123456789abcdefghijABCDEFGHIJ")).unwrap();
        let text = fs::read_to_string(d.join(LOG_NAME)).unwrap();
        assert!(text.starts_with("1970-01-01T00:00:00Z pack error: "), "{text}");
        assert!(text.contains("api_key=•••") && !text.contains("XyZ1234567890abcd") && !text.contains("ghp_0123"), "{text}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn the_log_rotates_at_the_cap_and_keeps_a_fixed_count_of_files() {
        let d = dir("rotate");
        let log = Log::new(d.join(LOG_NAME), 100, 3);
        let names = || {
            let mut n: Vec<_> = fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            n.sort();
            n
        };
        for i in 0..20 {
            log.write(&format!("line number {i:02} {}", "x".repeat(30))).unwrap();
            for f in names() {
                assert!(fs::metadata(d.join(&f)).unwrap().len() <= 100, "{f} over the cap");
            }
        }
        assert_eq!(names(), [LOG_NAME, "administratum.log.1", "administratum.log.2"], "three files, never a fourth");
        let newest = fs::read_to_string(d.join(LOG_NAME)).unwrap();
        let older = fs::read_to_string(d.join("administratum.log.1")).unwrap();
        assert!(newest.contains("line number 19") && !older.contains("line number 19"), "newest in the current file");
        let oldest = fs::read_to_string(d.join("administratum.log.2")).unwrap();
        assert!(older.contains("line number 1") && !oldest.contains("line number 19") && !oldest.contains("line number 00"), "the oldest lines are gone");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn report_change_stays_quiet_when_nothing_changed() {
        report_change("status-test-c", State::Warn, "orca did not answer");
        let first = entry("status-test-c").expect("stored").time_ms;
        std::thread::sleep(std::time::Duration::from_millis(5));
        report_change("status-test-c", State::Warn, "orca did not answer");
        assert_eq!(entry("status-test-c").unwrap().time_ms, first, "the same state and message: untouched");
        report_change("status-test-c", State::Ok, "answers");
        assert_eq!(entry("status-test-c").unwrap().state, State::Ok);
        assert!(entry("status-test-never").is_none());
    }

    #[test]
    fn a_single_file_log_keeps_one_file() {
        let d = dir("one");
        let log = Log::new(d.join(LOG_NAME), 50, 1);
        for i in 0..5 {
            log.write(&format!("line {i} {}", "y".repeat(30))).unwrap();
        }
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn report_stores_and_note_does_not() {
        report("status-test-a", State::Error, "boom ghp_0123456789abcdefghijABCDEFGHIJ");
        note("status-test-b", "only a line");
        let all = integration_status();
        let a = all.iter().find(|e| e.name == "status-test-a").expect("stored");
        assert_eq!((a.state, a.message.as_str()), (State::Error, "boom •••"));
        assert!(a.time_ms > 0);
        assert!(all.iter().all(|e| e.name != "status-test-b"));
    }

    /// No `eprintln!` stays in the backend outside this file, `demo.rs` and the test modules: in a release build
    /// it goes nowhere. Use `status::report` or `status::note`.
    #[test]
    fn no_eprintln_outside_status_demo_and_tests() {
        fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
            for e in fs::read_dir(dir).unwrap().flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(&p, out);
                } else if p.extension().is_some_and(|x| x == "rs") {
                    out.push(p);
                }
            }
        }
        let mut files = vec![];
        walk(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), &mut files);
        assert!(files.len() > 20, "the scan found the sources");
        let mut found = vec![];
        for f in files {
            let name = f.file_name().unwrap().to_string_lossy().into_owned();
            if name == "status.rs" || name == "demo.rs" {
                continue;
            }
            let text = fs::read_to_string(&f).unwrap().replace("\r\n", "\n");
            let code = text.split("\n#[cfg(test)]\nmod tests").next().unwrap_or_default();
            for (n, l) in code.lines().enumerate() {
                if l.contains("eprintln!") && !l.trim_start().starts_with("//") {
                    found.push(format!("{}:{}", f.display(), n + 1));
                }
            }
        }
        assert!(found.is_empty(), "eprintln! outside status.rs: {found:?}");
    }
}
