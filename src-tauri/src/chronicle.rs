//! Chronicon: events and Tithe (tokens + working time) read incrementally from Claude Code
//! transcripts. Read-only on `~/.claude`; everything it writes lives in the app data dir.
use crate::registry::{self, FileStat, Session, TurnSummary};
use chrono::{Local, NaiveDate, TimeZone, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub ts: i64,
    pub kind: String,
    pub session_id: String,
    pub name: String,
    pub dept: String,
    /// Subagent kind when the event comes from a subagent transcript.
    pub helper: Option<String>,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

impl Tokens {
    pub fn total(&self) -> u64 {
        self.input + self.output + self.cache_read + self.cache_write
    }
    fn minus(&self, o: &Tokens) -> Tokens {
        Tokens {
            input: self.input.saturating_sub(o.input),
            output: self.output.saturating_sub(o.output),
            cache_read: self.cache_read.saturating_sub(o.cache_read),
            cache_write: self.cache_write.saturating_sub(o.cache_write),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub tokens: u64,
    pub busy_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tithe {
    pub day: String,
    pub tokens: Tokens,
    pub by_project: BTreeMap<String, Share>,
    pub by_model: BTreeMap<String, u64>,
    pub busy_ms: u64,
    pub hourly: Vec<Share>,
}

impl Tithe {
    pub fn new(day: &str) -> Self {
        Tithe { day: day.into(), tokens: Tokens::default(), by_project: BTreeMap::new(), by_model: BTreeMap::new(), busy_ms: 0, hourly: vec![Share::default(); 24] }
    }
    fn add_tokens(&mut self, dept: &str, model: &str, t: &Tokens, hour: usize) {
        let n = t.total();
        self.tokens.input += t.input;
        self.tokens.output += t.output;
        self.tokens.cache_read += t.cache_read;
        self.tokens.cache_write += t.cache_write;
        self.by_project.entry(dept.into()).or_default().tokens += n;
        *self.by_model.entry(model.into()).or_default() += n;
        self.hourly[hour].tokens += n;
    }
    fn add_busy(&mut self, dept: &str, ms: u64, hour: usize) {
        self.busy_ms += ms;
        self.by_project.entry(dept.into()).or_default().busy_ms += ms;
        self.hourly[hour].busy_ms += ms;
    }
}

/// Token delta of one assistant message, at its transcript timestamp.
#[derive(Debug, PartialEq)]
pub struct Usage {
    pub ts: i64,
    pub model: String,
    pub tokens: Tokens,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub day: String,
    pub events: u32,
    pub tokens: u64,
    pub busy_ms: u64,
}

// ---- local time -------------------------------------------------------------------------------

fn local(ms: i64) -> chrono::DateTime<Local> {
    Local.timestamp_millis_opt(ms).earliest().unwrap_or_else(Local::now)
}

/// "YYYY-MM-DD" of `ms` in the system's local timezone.
pub fn day_of(ms: i64) -> String {
    local(ms).format("%Y-%m-%d").to_string()
}

fn hour_of(ms: i64) -> usize {
    local(ms).hour() as usize
}

/// Ms of local midnight starting the day that contains `ms`.
fn midnight_ms(ms: i64) -> i64 {
    let date = local(ms).date_naive();
    Local.from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default()).earliest().map_or(ms, |d| d.timestamp_millis())
}

/// `n` local days ending with the day of `ms`, newest first.
fn last_days(ms: i64, n: u64) -> Vec<String> {
    let today = local(ms).date_naive();
    (0..n).filter_map(|i| today.checked_sub_days(chrono::Days::new(i))).map(|d| d.format("%Y-%m-%d").to_string()).collect()
}

/// A real calendar day written exactly "YYYY-MM-DD" (also keeps command input out of paths).
pub fn valid_day(s: &str) -> bool {
    s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

// ---- extraction (pure) ------------------------------------------------------------------------

struct Pending {
    name: String,
    command: String,
}

/// Per-transcript memory carried between polls.
#[derive(Default)]
pub struct Cursor {
    pending: HashMap<String, Pending>,
    msgs: HashMap<String, Tokens>,
    turn: TurnSummary,
}

// ponytail: both maps are cleared when full; only orphaned tool_uses (interrupted turns) pile up.
const CAP: usize = 256;

pub struct Src<'a> {
    pub session_id: &'a str,
    pub name: &'a str,
    pub dept: &'a str,
    pub helper: Option<&'a str>,
}

const TEST_RUNNERS: [&str; 9] = ["cargo test", "npm test", "npm run test", "pnpm test", "yarn test", "pytest", "vitest", "jest", "go test"];
const TASK_DONE_MS: u64 = 300_000;

/// Working time of one finished main-session turn, stamped at the turn's end.
#[derive(Debug, PartialEq)]
pub struct Turn {
    pub ts: i64,
    pub ms: u64,
}

/// Events, token deltas and turn durations found in transcript lines.
pub type Found = (Vec<Event>, Vec<Usage>, Vec<Turn>);

/// `extract_line` over every line of `text`.
#[cfg(test)]
pub fn extract(cur: &mut Cursor, text: &str, min_ts: i64, src: &Src, now_ms: i64) -> Found {
    let mut out = Found::default();
    for line in text.lines().filter(|l| wanted(l)) {
        extract_line(cur, line, min_ts, src, now_ms, &mut out);
    }
    out
}

/// Whether `extract_line` can find anything in `line`: it must hold one of the keys it acts on.
/// A cheap substring check that spares parsing most lines.
pub fn wanted(line: &str) -> bool {
    ["tool_use", "tool_result", "\"usage\"", "turn_duration"].iter().any(|k| line.contains(k))
}

/// Events, token deltas and turn durations of one whole transcript line, into `out`. Entries
/// stamped before `min_ts` are skipped (first scan: today only); tool_use -> tool_result pairing
/// spans calls via `cur`.
pub fn extract_line(cur: &mut Cursor, line: &str, min_ts: i64, src: &Src, now_ms: i64, out: &mut Found) {
    let (events, usage, turns) = out;
    let Ok(v) = serde_json::from_str::<Value>(line) else { return };
    {
        let ts = v["timestamp"].as_str().and_then(registry::iso_utc_ms);
        if min_ts > i64::MIN && ts.map_or(true, |t| t < min_ts) {
            return;
        }
        let ts = ts.unwrap_or(now_ms);
        let mut emit = |kind: &str, detail: String| {
            events.push(Event { ts, kind: kind.into(), session_id: src.session_id.into(), name: src.name.into(), dept: src.dept.into(), helper: src.helper.map(str::to_string), detail })
        };
        let msg = &v["message"];
        match v["type"].as_str() {
            Some("assistant") => {
                for b in msg["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "tool_use") {
                    if cur.pending.len() >= CAP {
                        cur.pending.clear();
                    }
                    let p = Pending { name: b["name"].as_str().unwrap_or("tool").into(), command: b["input"]["command"].as_str().unwrap_or("").into() };
                    cur.pending.insert(b["id"].as_str().unwrap_or("").into(), p);
                }
                let model = msg["model"].as_str().unwrap_or("");
                let u = &msg["usage"];
                if u.is_null() || model.is_empty() || model == "<synthetic>" {
                    return;
                }
                let f = |k: &str| u[k].as_u64().unwrap_or(0);
                let t = Tokens { input: f("input_tokens"), output: f("output_tokens"), cache_read: f("cache_read_input_tokens"), cache_write: f("cache_creation_input_tokens") };
                // One line per content block of the same message: count each message id once, at its last usage.
                let seen = match msg["id"].as_str() {
                    Some(id) => {
                        if cur.msgs.len() >= CAP && !cur.msgs.contains_key(id) {
                            cur.msgs.clear();
                        }
                        cur.msgs.insert(id.into(), t.clone()).unwrap_or_default()
                    }
                    None => Tokens::default(),
                };
                let d = t.minus(&seen);
                if d.total() > 0 {
                    usage.push(Usage { ts, model: model.into(), tokens: d });
                }
            }
            Some("user") => {
                for b in msg["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "tool_result") {
                    let p = b["tool_use_id"].as_str().and_then(|id| cur.pending.remove(id));
                    for (kind, detail) in classify(p.as_ref(), b) {
                        emit(kind, detail);
                    }
                }
            }
            Some("system") if v["subtype"] == "turn_duration" => {
                let ms = v["durationMs"].as_u64().unwrap_or(0);
                // A subagent's (sidechain) turn runs inside its parent's turn: counting it would double count.
                if src.helper.is_none() && v["isSidechain"] != true {
                    turns.push(Turn { ts, ms });
                }
                if ms >= TASK_DONE_MS {
                    emit("task-done", fmt_duration(ms));
                }
            }
            _ => {}
        }
    }
}

pub const MAX_TURN_FILES: usize = 50;
const EDIT_TOOLS: [&str; 4] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

/// Whether `track_turn` can use `line`: a user line (a prompt starts a turn) or one with a tool call.
pub fn turn_wanted(line: &str) -> bool {
    line.contains("\"type\":\"user\"") || line.contains("tool_use")
}

/// Folds one main-transcript line into the session's turn: a real prompt (not tool results, not a meta or
/// local-command line such as `/clear`) starts a new turn; each tool_use counts; an edit adds its file once.
// ponytail: a line with tool calls is parsed again here (extract_line parsed it too); cheap next to the disk read.
pub fn track_turn(turn: &mut TurnSummary, line: &str, cwd: &str) {
    let Ok(v) = serde_json::from_str::<Value>(line) else { return };
    let ts = v["timestamp"].as_str().and_then(registry::iso_utc_ms);
    let content = &v["message"]["content"];
    match v["type"].as_str() {
        Some("user") => {
            let prompt = match content {
                Value::String(t) => !t.contains("<command-name>") && !t.contains("<local-command"),
                Value::Array(a) => !a.iter().any(|b| b["type"] == "tool_result"),
                _ => false,
            };
            if prompt && v["isMeta"] != true {
                *turn = TurnSummary { started_ms: ts, last_ms: ts, ..Default::default() };
            }
        }
        Some("assistant") => {
            turn.last_ms = ts.or(turn.last_ms);
            for b in content.as_array().into_iter().flatten().filter(|b| b["type"] == "tool_use") {
                turn.tools += 1;
                if !b["name"].as_str().is_some_and(|n| EDIT_TOOLS.contains(&n)) {
                    continue;
                }
                let Some(p) = b["input"]["file_path"].as_str().or(b["input"]["notebook_path"].as_str()) else { continue };
                let p = relative(p, cwd);
                // ponytail: past the cap a file edited twice counts twice in more_files; the card only says "+N more".
                if turn.files.contains(&p) {
                    continue;
                }
                if turn.files.len() < MAX_TURN_FILES {
                    turn.files.push(p);
                } else {
                    turn.more_files += 1;
                }
            }
        }
        _ => {}
    }
}

/// `p` relative to `cwd` with forward slashes when inside it (ASCII case and either slash ignored), else `p` as is.
fn relative(p: &str, cwd: &str) -> String {
    let norm = |s: &str| s.replace('/', "\\").to_ascii_lowercase();
    let (np, nc) = (norm(p), norm(cwd.trim_end_matches(['\\', '/'])));
    if np.len() > nc.len() + 1 && np.starts_with(&nc) && np.as_bytes()[nc.len()] == b'\\' {
        p[nc.len() + 1..].replace('\\', "/")
    } else {
        p.to_string()
    }
}

fn classify(p: Option<&Pending>, b: &Value) -> Vec<(&'static str, String)> {
    let is_error = b["is_error"].as_bool();
    let failed = is_error == Some(true);
    let text = result_text(&b["content"]);
    let (name, cmd) = p.map_or(("tool", ""), |p| (p.name.as_str(), p.command.as_str()));
    if name == "Bash" {
        // Match on the command line itself, not on a heredoc body it feeds (briefs, scripts).
        let head = cmd.split("<<").next().unwrap_or("");
        let mut git = vec![];
        if !failed && head.contains("git commit") && !head.contains("--dry-run") {
            git.push(("commit", commit_message(cmd)));
        }
        if !failed && head.contains("git push") {
            git.push(("push", push_target(head)));
        }
        if !git.is_empty() {
            return git;
        }
        if let Some(runner) = test_runner(head) {
            let fail = is_error.unwrap_or_else(|| says_failed(&text));
            return vec![(if fail { "tests-fail" } else { "tests-pass" }, registry::clip(runner))];
        }
    }
    // A rejected permission prompt is the operator's choice, not an error.
    if failed && !text.contains("doesn't want to proceed") {
        let text = text.replace("<tool_use_error>", "").replace("</tool_use_error>", "");
        let line = text.lines().map(str::trim).filter(|l| !l.is_empty());
        let first = line.clone().find(|l| !l.starts_with("Exit code")).or_else(|| line.clone().next()).unwrap_or("");
        return vec![("tool-error", registry::clip(&format!("{name} · {first}")))];
    }
    vec![]
}

/// tool_result content: a plain string or an array of `{type:"text", text}` blocks.
fn result_text(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}

/// One shell command of `cmd` from `i`: up to the next `&&`, `;`, `|` or newline.
fn segment(cmd: &str, i: usize) -> &str {
    let s = &cmd[i..];
    s[..["&&", ";", "|", "\n"].iter().filter_map(|p| s.find(p)).min().unwrap_or(s.len())].trim()
}

/// The test-runner invocation in `cmd`, if any.
fn test_runner(cmd: &str) -> Option<&str> {
    let mjs = |w: &str| w.contains("test") && w.trim_matches(['"', '\'']).ends_with(".mjs");
    let node = cmd.find("node ").filter(|&i| segment(cmd, i).split_whitespace().any(mjs));
    let i = TEST_RUNNERS.iter().filter_map(|r| cmd.find(r)).chain(node).min()?;
    Some(segment(cmd, i))
}

/// "test result: FAILED" (cargo) or any "<n> failed" with n > 0 (cargo / pytest / jest summaries).
fn says_failed(text: &str) -> bool {
    let words: Vec<&str> = text.split(|c: char| c.is_whitespace() || c == ',' || c == ';').filter(|w| !w.is_empty()).collect();
    text.contains("test result: FAILED") || words.windows(2).any(|w| w[1].starts_with("failed") && w[0].parse::<u64>().is_ok_and(|n| n > 0))
}

/// First line of the commit message: heredoc body (`-F - <<'EOF'`, `-m "$(cat <<'EOF'`) or a
/// quoted/bare `-m` / `-am` / `--message` value; else the command clipped.
fn commit_message(cmd: &str) -> String {
    let after = &cmd[cmd.find("git commit").unwrap_or(0)..];
    let heredoc = || after.find("<<").and_then(|i| after[i..].lines().skip(1).map(str::trim).find(|l| !l.is_empty()));
    let line = match message_flag(after) {
        Some(v) if v.starts_with("$(") => heredoc(),
        Some(v) => v.lines().next().map(str::trim),
        None if after.contains(" -F") => heredoc(),
        None => None,
    };
    registry::clip(line.filter(|l| !l.is_empty()).unwrap_or_else(|| segment(after, 0)))
}

/// Value of the first `-m` / `-qam` (any short-flag group ending in m) / `--message` flag.
fn message_flag(after: &str) -> Option<&str> {
    after.match_indices(" -").find_map(|(i, _)| {
        let rest = &after[i + 2..];
        let (flag, val) = match rest.strip_prefix("-message") {
            Some(v) => ("m", v),
            None => rest.split_at(rest.find(|c: char| !c.is_ascii_alphabetic()).unwrap_or(rest.len())),
        };
        if !flag.ends_with('m') {
            return None;
        }
        let val = val.trim_start_matches(['=', ' ']);
        Some(match val.chars().next() {
            Some(q @ ('"' | '\'')) => val[1..].split(q).next().unwrap_or(""),
            _ => val.split_whitespace().next().unwrap_or(""),
        })
    })
}

/// "origin/main" from `git push [-flags] origin main`, "" when not spelled out.
fn push_target(cmd: &str) -> String {
    let after = &cmd[cmd.find("git push").map_or(0, |i| i + 8)..];
    let seg = after.split(['&', ';', '|', '\n']).next().unwrap_or("");
    seg.split_whitespace().filter(|w| !w.starts_with('-') && !w.contains('>')).take(2).collect::<Vec<_>>().join("/")
}

fn fmt_duration(ms: u64) -> String {
    let s = ms / 1000;
    if s >= 3600 {
        format!("{}h {:02}m", s / 3600, s / 60 % 60)
    } else {
        format!("{}m {:02}s", s / 60, s % 60)
    }
}

/// Lifecycle events between two rosters: arrived, left, petition, petition-answered, compaction.
pub fn lifecycle(prev: &[Session], now: &[Session], now_ms: i64) -> Vec<Event> {
    let ev = |s: &Session, kind: &str, detail: String| Event { ts: now_ms, kind: kind.into(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: None, detail };
    let ask = |s: &Session| s.waiting_for.clone().unwrap_or_else(|| "input needed".into());
    let mut out = vec![];
    for s in now {
        let waiting = s.status == "waiting";
        match prev.iter().find(|p| p.id == s.id) {
            None => {
                out.push(ev(s, "arrived", s.cwd.clone()));
                if waiting {
                    out.push(ev(s, "petition", ask(s)));
                }
            }
            Some(p) => {
                if waiting && (p.status != "waiting" || p.since_ms != s.since_ms) {
                    out.push(ev(s, "petition", ask(s)));
                }
                if p.status == "waiting" && !waiting {
                    out.push(ev(s, "petition-answered", s.status.clone()));
                }
                if s.compacted_at.is_some() && s.compacted_at != p.compacted_at {
                    out.push(ev(s, "compaction", String::new()));
                }
            }
        }
    }
    out.extend(prev.iter().filter(|p| !now.iter().any(|s| s.id == p.id)).map(|p| ev(p, "left", String::new())));
    out
}

// ---- incremental reading ----------------------------------------------------------------------

/// Streams to `line` each whole line appended to `f` since `stored` (a partial last line waits for
/// the next poll), one line in memory at a time, with whether only today's entries count; returns
/// the new offset. No stored offset, or a file that shrank: read from 0, today only. A file first seen and not touched since before
/// `today_start` has nothing of today: jump to its end without reading.
pub fn read_new(f: &FileStat, stored: Option<u64>, today_start: i64, mut line: impl FnMut(&str, bool)) -> Option<u64> {
    let len = f.len;
    let (start, today_only) = match stored {
        Some(o) if o <= len => (o, false),
        _ => (0, true),
    };
    if start == len {
        return None;
    }
    if stored.is_none() && f.mtime_ms < today_start {
        return Some(len);
    }
    let mut file = fs::File::open(&f.path).ok()?;
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut r = BufReader::with_capacity(64 * 1024, file.take(len - start));
    let (mut buf, mut offset) = (Vec::new(), start);
    // A read error ends the chunk at the last whole line handed out; the rest comes next poll.
    while let Ok(n) = r.read_until(b'\n', &mut buf) {
        if n == 0 || buf.last() != Some(&b'\n') {
            break;
        }
        offset += n as u64;
        let text = String::from_utf8_lossy(&buf[..n - 1]);
        line(text.strip_suffix('\r').unwrap_or(&text), today_only);
        buf.clear();
    }
    Some(offset)
}

// ---- persistence ------------------------------------------------------------------------------

const FLUSH_MS: i64 = 30_000;
const KEEP_DAYS: u64 = 7;

pub struct Chronicle {
    dir: PathBuf,
    offsets: HashMap<String, u64>,
    /// Per transcript: pairing state and, for a subagent's, its kind.
    cursors: HashMap<PathBuf, (Cursor, Option<String>)>,
    tithe: Tithe,
    last_flush_ms: i64,
    /// Tithe or offsets changed since the last flush.
    dirty: bool,
}

/// A file untouched since before today needs no offset: first sight skips it to its end anyway.
fn prune_offsets(offsets: &mut HashMap<String, u64>, today_start: i64) {
    offsets.retain(|p, _| registry::stat(Path::new(p)).is_some_and(|f| f.mtime_ms >= today_start));
}

fn write_atomic(path: &Path, text: &str) {
    let tmp = path.with_extension("tmp");
    if fs::write(&tmp, text).is_ok() {
        let _ = fs::rename(&tmp, path);
    }
}

fn load_tithe(dir: &Path, day: &str) -> Option<Tithe> {
    let t: Tithe = serde_json::from_str(&fs::read_to_string(dir.join(format!("{day}.tithe.json"))).ok()?).ok()?;
    (t.hourly.len() == 24).then_some(t)
}

/// Deletes day files (`YYYY-MM-DD.*`) older than the last `KEEP_DAYS` local days.
pub fn retain_days(dir: &Path, now_ms: i64) {
    let Some(cutoff) = last_days(now_ms, KEEP_DAYS).pop() else { return };
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.get(..10).is_some_and(|d| valid_day(d) && d < cutoff.as_str()) {
            let _ = fs::remove_file(e.path());
        }
    }
}

/// Events of `day` in the order they were recorded.
pub fn read_events(dir: &Path, day: &str) -> Vec<Event> {
    fs::read_to_string(dir.join(format!("{day}.jsonl"))).unwrap_or_default().lines().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

impl Chronicle {
    /// Opens (creating) `dir`; `fresh` wipes it first (demo mode keeps its own throwaway dir).
    pub fn open(dir: PathBuf, now_ms: i64, fresh: bool) -> Self {
        if fresh {
            let _ = fs::remove_dir_all(&dir);
        }
        let _ = fs::create_dir_all(&dir);
        retain_days(&dir, now_ms);
        let today_start = midnight_ms(now_ms);
        let mut offsets: HashMap<String, u64> = fs::read_to_string(dir.join("offsets.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        prune_offsets(&mut offsets, today_start);
        let today = day_of(now_ms);
        let tithe = load_tithe(&dir, &today).unwrap_or_else(|| Tithe::new(&today));
        Chronicle { dir, offsets, cursors: HashMap::new(), tithe, last_flush_ms: now_ms, dirty: false }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// New events from every live session transcript and its subagent transcripts (`files`: per
    /// session id, the poller's listing, subagents flagged true); tokens go to the Tithe.
    pub fn read_transcripts(&mut self, roster: &[Session], files: &HashMap<String, Vec<(FileStat, bool)>>, now_ms: i64) -> Vec<Event> {
        let today_start = midnight_ms(now_ms);
        let mut events = vec![];
        let mut seen = HashSet::new();
        for s in roster {
            for (f, sub) in files.get(&s.id).into_iter().flatten() {
                let path = &f.path;
                seen.insert(path.clone());
                let key = path.to_string_lossy().into_owned();
                let cursors = &mut self.cursors;
                let mut found = Found::default();
                let read = read_new(f, self.offsets.get(&key).copied(), today_start, |line, today_only| {
                    let events = wanted(line);
                    let turn = !*sub && turn_wanted(line);
                    if !events && !turn {
                        return;
                    }
                    if !cursors.contains_key(path) {
                        cursors.insert(path.clone(), (Cursor::default(), sub.then(|| registry::helper_meta(path).agent_type.unwrap_or_else(|| "agent".into()))));
                    }
                    let Some((cur, helper)) = cursors.get_mut(path) else { return };
                    if turn {
                        track_turn(&mut cur.turn, line, &s.cwd);
                    }
                    if events {
                        let src = Src { session_id: &s.id, name: &s.name, dept: &s.dept, helper: helper.as_deref() };
                        extract_line(cur, line, if today_only { today_start } else { i64::MIN }, &src, now_ms, &mut found);
                    }
                });
                let Some(offset) = read else { continue };
                if self.offsets.insert(key, offset) != Some(offset) {
                    self.dirty = true;
                }
                let (ev, usage, turns) = found;
                events.extend(ev);
                for u in usage {
                    self.add_usage(&s.dept, &u); // subagent tokens count toward the parent's project
                }
                for t in turns {
                    if let Some(tithe) = self.tithe_at(t.ts) {
                        tithe.add_busy(&s.dept, t.ms, hour_of(t.ts));
                        self.dirty = true;
                    }
                }
            }
        }
        self.cursors.retain(|p, _| seen.contains(p));
        events
    }

    /// Each live session's current turn (from its main transcript's cursor), by session id; none before a first prompt
    /// or tool call has been read.
    pub fn turns(&self, files: &HashMap<String, Vec<(FileStat, bool)>>) -> HashMap<String, TurnSummary> {
        files
            .iter()
            .filter_map(|(id, fs)| {
                let (f, _) = fs.iter().find(|(_, sub)| !sub)?;
                let (cur, _) = self.cursors.get(&f.path)?;
                (cur.turn.started_ms.is_some() || cur.turn.tools > 0).then(|| (id.clone(), cur.turn.clone()))
            })
            .collect()
    }

    /// The Tithe of `ts`'s day, rolling over (flushing the old one, dropping offsets of files
    /// untouched since) when a new day starts; older days are dropped.
    fn tithe_at(&mut self, ts: i64) -> Option<&mut Tithe> {
        let day = day_of(ts);
        if day > self.tithe.day {
            self.flush();
            self.tithe = load_tithe(&self.dir, &day).unwrap_or_else(|| Tithe::new(&day));
            prune_offsets(&mut self.offsets, midnight_ms(ts));
        }
        if day == self.tithe.day {
            Some(&mut self.tithe)
        } else {
            None
        }
    }

    pub fn add_usage(&mut self, dept: &str, u: &Usage) {
        if let Some(t) = self.tithe_at(u.ts) {
            t.add_tokens(dept, &u.model, &u.tokens, hour_of(u.ts));
            self.dirty = true;
        }
    }

    /// Demo only (no transcripts): +`elapsed_ms` of working time for each busy or shell session.
    /// Real working time comes from the transcripts' turn durations.
    pub fn add_busy(&mut self, roster: &[Session], elapsed_ms: u64, now_ms: i64) {
        for s in roster.iter().filter(|s| s.status == "busy" || s.status == "shell") {
            if let Some(t) = self.tithe_at(now_ms) {
                t.add_busy(&s.dept, elapsed_ms, hour_of(now_ms));
                self.dirty = true;
            }
        }
    }

    /// Appends `e` to its day's event file.
    pub fn record(&self, e: &Event) {
        let Ok(line) = serde_json::to_string(e) else { return };
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(self.dir.join(format!("{}.jsonl", day_of(e.ts)))) {
            let _ = writeln!(f, "{line}");
        }
    }

    // ponytail: offsets persist with the tithe every 30 s, and only if either changed; a crash
    // replays at most 30 s of events.
    pub fn maybe_flush(&mut self, now_ms: i64) {
        if self.dirty && now_ms - self.last_flush_ms >= FLUSH_MS {
            self.last_flush_ms = now_ms;
            self.dirty = false;
            self.flush();
        }
    }

    pub fn flush(&self) {
        if let Ok(t) = serde_json::to_string(&self.tithe) {
            write_atomic(&self.dir.join(format!("{}.tithe.json", self.tithe.day)), &t);
        }
        if let Ok(t) = serde_json::to_string(&self.offsets) {
            write_atomic(&self.dir.join("offsets.json"), &t);
        }
    }

    /// The dir and the live Tithe, so day files are read after the lock is released.
    pub fn snapshot(&self) -> (PathBuf, Tithe) {
        (self.dir.clone(), self.tithe.clone())
    }
}

/// Tithe of `day`: the live one (`live`, from `snapshot`) or the one saved in `dir`.
pub fn tithe_of(dir: &Path, live: &Tithe, day: &str) -> Tithe {
    if day == live.day {
        return live.clone();
    }
    load_tithe(dir, day).unwrap_or_else(|| Tithe::new(day))
}

/// Today and the 6 previous days, newest first.
pub fn days(dir: &Path, live: &Tithe, now_ms: i64) -> Vec<DaySummary> {
    last_days(now_ms, KEEP_DAYS)
        .into_iter()
        .map(|day| {
            let t = tithe_of(dir, live, &day);
            let events = fs::read(dir.join(format!("{day}.jsonl"))).map_or(0, |b| b.iter().filter(|&&c| c == b'\n').count() as u32);
            DaySummary { events, tokens: t.tokens.total(), busy_ms: t.busy_ms, day }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn iso(ms: i64) -> String {
        chrono::DateTime::from_timestamp_millis(ms).unwrap().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }

    fn now() -> i64 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
    }

    const SRC: Src = Src { session_id: "s1", name: "terra-77", dept: "Terra", helper: None };

    // Real-shape lines (trimmed): Claude Code 2.1.283 transcripts.
    fn bash_use(id: &str, cmd: &str, ts: i64) -> String {
        serde_json::json!({"type":"assistant","timestamp":iso(ts),"message":{"model":"claude-opus-5-5","id":format!("msg_{id}"),"type":"message","role":"assistant",
            "content":[{"type":"tool_use","id":id,"name":"Bash","input":{"command":cmd,"description":"run"}}]}}).to_string()
    }

    fn result(id: &str, content: Value, is_error: Option<bool>, ts: i64) -> String {
        let mut b = serde_json::json!({"tool_use_id":id,"type":"tool_result","content":content});
        if let Some(e) = is_error {
            b["is_error"] = e.into();
        }
        serde_json::json!({"type":"user","timestamp":iso(ts),"message":{"role":"user","content":[b]},"sessionId":"s1"}).to_string()
    }

    fn run(cur: &mut Cursor, lines: &[String]) -> Vec<Event> {
        extract(cur, &lines.join("\n"), i64::MIN, &SRC, 0).0
    }

    fn kinds(ev: &[Event]) -> Vec<(&str, &str)> {
        ev.iter().map(|e| (e.kind.as_str(), e.detail.as_str())).collect()
    }

    #[test]
    fn commit_pairs_across_polls_and_reads_the_message() {
        let mut cur = Cursor::default();
        let t = 1_791_000_000_000;
        assert!(run(&mut cur, &[bash_use("toolu_1", "git add a && git commit -q -m \"feat: seals\nbody\" -- a", t)]).is_empty(), "waits for its result");
        let ev = run(&mut cur, &[result("toolu_1", "[main 1a2b] feat: seals".into(), Some(false), t + 5)]);
        assert_eq!(kinds(&ev), [("commit", "feat: seals")]);
        assert_eq!(ev[0].ts, t + 5);
        assert_eq!((ev[0].name.as_str(), ev[0].dept.as_str(), ev[0].session_id.as_str(), ev[0].helper.as_ref()), ("terra-77", "Terra", "s1", None));
    }

    #[test]
    fn commit_message_from_heredoc_and_quotes() {
        assert_eq!(commit_message("git commit -F - <<'EOF'\nfix: chain\n\nbody\nEOF"), "fix: chain");
        assert_eq!(commit_message("git commit -m \"$(cat <<'EOF'\ndocs: x\nEOF\n)\""), "docs: x");
        assert_eq!(commit_message("git commit -am 'wip'"), "wip");
        assert_eq!(commit_message("cd x && npm run -s lint && git commit -qam \"printer: GyroidVault\n\nbody\" && git push -q"), "printer: GyroidVault");
        assert_eq!(commit_message("git commit --message=fix && python - <<'EOF'\nx\nEOF"), "fix");
        assert_eq!(commit_message("ssh nas 'cleanup' && git commit --amend --no-edit && git push"), "git commit --amend --no-edit");
    }

    #[test]
    fn failed_or_dry_run_commit_is_not_a_commit() {
        let mut cur = Cursor::default();
        let ev = run(&mut cur, &[bash_use("a", "git commit -m x", 0), result("a", "Exit code 1\nnothing to commit".into(), Some(true), 0)]);
        assert_eq!(kinds(&ev), [("tool-error", "Bash · nothing to commit")]);
        let ev = run(&mut cur, &[bash_use("b", "git commit --dry-run -m x", 0), result("b", "ok".into(), None, 0)]);
        assert!(ev.is_empty());
    }

    #[test]
    fn push_shows_remote_and_branch() {
        let mut cur = Cursor::default();
        let ev = run(&mut cur, &[bash_use("a", "git push -u origin main 2>&1 | tail -2", 0), result("a", "ok".into(), Some(false), 0)]);
        assert_eq!(kinds(&ev), [("push", "origin/main")]);
        let ev = run(&mut cur, &[bash_use("b", "git commit -qm \"x\" && git push -q", 0), result("b", "".into(), Some(false), 0)]);
        assert_eq!(kinds(&ev), [("commit", "x"), ("push", "")], "one command, both events");
        assert_eq!(push_target("git push"), "");
    }

    #[test]
    fn tests_pass_or_fail_from_is_error_or_summary() {
        let mut cur = Cursor::default();
        let cases = [
            ("cargo test --manifest-path src-tauri/Cargo.toml", "test result: ok. 5 passed; 0 failed;", Some(false), "tests-pass"),
            ("cargo test", "Exit code 101\ntest result: FAILED. 4 passed; 1 failed;", Some(true), "tests-fail"),
            ("cargo test", "test result: FAILED. 4 passed; 1 failed;", None, "tests-fail"),
            ("pytest -q", "== 2 failed, 3 passed in 0.4s ==", None, "tests-fail"),
            ("pytest -q", "== 3 passed, 0 failed in 0.4s ==", None, "tests-pass"),
            ("npm run test", "ok", None, "tests-pass"),
            ("node scratch/test-scene.mjs", "ok", None, "tests-pass"),
        ];
        for (i, (cmd, out, err, want)) in cases.iter().enumerate() {
            let id = format!("t{i}");
            let ev = run(&mut cur, &[bash_use(&id, cmd, 0), result(&id, (*out).into(), *err, 0)]);
            assert_eq!(ev.len(), 1, "{cmd}");
            assert_eq!(ev[0].kind, *want, "{cmd} / {out}");
            assert_eq!(ev[0].detail, *cmd);
        }
        let ev = run(&mut cur, &[bash_use("c", "cd x && cargo test 2>&1 | tail -3; echo done", 0), result("c", "ok".into(), Some(false), 0)]);
        assert_eq!(kinds(&ev), [("tests-pass", "cargo test 2>&1")], "detail is the runner invocation");
        let brief = "cat > brief.md <<'EOF'\nrun cargo test then git commit -m x and git push\nEOF";
        assert!(run(&mut cur, &[bash_use("h", brief, 0), result("h", "".into(), Some(false), 0)]).is_empty(), "heredoc body is not a command");
    }

    #[test]
    fn other_errors_are_tool_errors_rejections_and_successes_are_not() {
        let mut cur = Cursor::default();
        let edit = serde_json::json!({"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"tool_use","id":"e1","name":"Edit","input":{"file_path":"a"}}]}}).to_string();
        let blocks = serde_json::json!([{"type":"text","text":"<tool_use_error>String to replace not found</tool_use_error>"}]);
        let ev = run(&mut cur, &[edit, result("e1", blocks, Some(true), 0)]);
        assert_eq!(kinds(&ev), [("tool-error", "Edit · String to replace not found")]);
        let reject = "The user doesn't want to proceed with this tool use. The tool use was rejected.";
        assert!(run(&mut cur, &[bash_use("r", "rm x", 0), result("r", reject.into(), Some(true), 0)]).is_empty());
        assert!(run(&mut cur, &[bash_use("ok", "ls", 0), result("ok", "a\nb".into(), Some(false), 0)]).is_empty());
        let ev = run(&mut cur, &[result("unknown", "boom".into(), Some(true), 0)]);
        assert_eq!(kinds(&ev), [("tool-error", "tool · boom")], "result whose tool_use was never seen");
    }

    #[test]
    fn long_turns_are_task_done() {
        let mut cur = Cursor::default();
        let line = |ms: u64| serde_json::json!({"type":"system","subtype":"turn_duration","durationMs":ms,"messageCount":28,"timestamp":iso(0)}).to_string();
        assert!(run(&mut cur, &[line(299_999)]).is_empty());
        assert_eq!(kinds(&run(&mut cur, &[line(372_000)])), [("task-done", "6m 12s")]);
        assert_eq!(fmt_duration(3_900_000), "1h 05m");
    }

    #[test]
    fn turn_durations_are_working_time_of_main_sessions_only() {
        let line = |ms: u64, side: bool| serde_json::json!({"isSidechain":side,"type":"system","subtype":"turn_duration","durationMs":ms,"timestamp":iso(7_000)}).to_string();
        let text = [line(42_000, false), line(9_000, true)].join("\n");
        let (_, _, turns) = extract(&mut Cursor::default(), &text, i64::MIN, &SRC, 0);
        assert_eq!(turns, [Turn { ts: 7_000, ms: 42_000 }], "a sidechain turn overlaps its parent's");
        let sub = Src { helper: Some("Explore"), ..SRC };
        assert!(extract(&mut Cursor::default(), &line(5_000, false), i64::MIN, &sub, 0).2.is_empty(), "subagent transcript");
    }

    #[test]
    fn usage_counts_each_message_id_once_at_its_last_usage() {
        let mut cur = Cursor::default();
        let line = |id: &str, out: u64| {
            serde_json::json!({"type":"assistant","timestamp":iso(1_791_000_000_000),"message":{"model":"claude-opus-5-5","id":id,
                "usage":{"input_tokens":2,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000,"output_tokens":out}}}).to_string()
        };
        let (_, a, _) = extract(&mut cur, &[line("m1", 5), line("m1", 5)].join("\n"), i64::MIN, &SRC, 0);
        let (_, b, _) = extract(&mut cur, &[line("m1", 589), line("m2", 10)].join("\n"), i64::MIN, &SRC, 0);
        let sum: u64 = a.iter().chain(&b).map(|u| u.tokens.total()).sum();
        assert_eq!(sum, (2 + 100 + 1000 + 589) + (2 + 100 + 1000 + 10));
        assert_eq!(a[0].tokens, Tokens { input: 2, output: 5, cache_read: 1000, cache_write: 100 });
        assert_eq!(b[0].tokens, Tokens { input: 0, output: 584, cache_read: 0, cache_write: 0 });
        let synthetic = r#"{"type":"assistant","message":{"model":"<synthetic>","id":"m3","usage":{"input_tokens":9}}}"#;
        assert!(extract(&mut cur, synthetic, i64::MIN, &SRC, 0).1.is_empty());
    }

    #[test]
    fn first_scan_keeps_only_entries_stamped_today() {
        let mut cur = Cursor::default();
        let today = midnight_ms(now());
        let lines = [bash_use("y", "git push", today - 60_000), result("y", "ok".into(), None, today - 50_000), bash_use("t", "git push", today + 1), result("t", "ok".into(), None, today + 2)];
        let (ev, ..) = extract(&mut cur, &lines.join("\n"), today, &SRC, 0);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].ts, today + 2);
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-chron-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// `read_new` with the streamed lines joined back into one text.
    fn read_text(f: &FileStat, stored: Option<u64>, today_start: i64) -> Option<(String, u64, Option<bool>)> {
        let (mut text, mut today) = (String::new(), None);
        let offset = read_new(f, stored, today_start, |l, t| {
            text.push_str(&format!("{l}\n"));
            today = Some(t);
        })?;
        Some((text, offset, today))
    }

    #[test]
    fn read_new_whole_lines_only_and_restarts_when_the_file_shrinks() {
        let d = temp_dir("read-new");
        let p = d.join("a.jsonl");
        fs::write(&p, "one\ntwo\npart").unwrap();
        let st = || registry::stat(&p).unwrap();
        assert_eq!(read_text(&st(), None, 0).unwrap(), ("one\ntwo\n".into(), 8, Some(true)));
        assert_eq!(read_text(&st(), Some(8), 0).unwrap(), ("".into(), 8, None), "partial line waits");
        fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(b"ial\n").unwrap();
        assert_eq!(read_text(&st(), Some(8), 0).unwrap(), ("partial\n".into(), 16, Some(false)));
        assert!(read_text(&st(), Some(16), 0).is_none(), "nothing new");
        fs::write(&p, "new\r\n").unwrap();
        assert_eq!(read_text(&st(), Some(16), 0).unwrap(), ("new\n".into(), 5, Some(true)), "shrank: from 0, today only; CRLF like lines()");
    }

    #[test]
    fn read_new_skips_a_file_untouched_since_before_today() {
        let d = temp_dir("read-old");
        let p = d.join("old.jsonl");
        fs::write(&p, "old\n").unwrap();
        fs::OpenOptions::new().write(true).open(&p).unwrap().set_modified(SystemTime::now() - Duration::from_secs(3 * 86_400)).unwrap();
        assert_eq!(read_text(&registry::stat(&p).unwrap(), None, midnight_ms(now())).unwrap(), ("".into(), 4, None));
    }

    #[test]
    fn tithe_sums_tokens_by_project_model_hour_and_busy_time() {
        let mut c = Chronicle::open(temp_dir("tithe"), now(), true);
        let ts = now();
        let u = |out| Usage { ts, model: "claude-opus-5-5".into(), tokens: Tokens { input: 1, output: out, cache_read: 10, cache_write: 100 } };
        c.add_usage("Terra", &u(5));
        c.add_usage("Geneseed", &u(6));
        let s = |id: &str, dept: &str, status: &str| Session { dept: dept.into(), status: status.into(), ..crate::registry::tests_session(id) };
        c.add_busy(&[s("a", "Terra", "busy"), s("b", "Terra", "shell"), s("c", "Geneseed", "waiting"), s("d", "Geneseed", "idle")], 1000, ts);
        let t = tithe_of(&c.dir, &c.tithe, &day_of(ts));
        assert_eq!(t.tokens, Tokens { input: 2, output: 11, cache_read: 20, cache_write: 200 });
        assert_eq!(t.by_project["Terra"], Share { tokens: 116, busy_ms: 2000 });
        assert_eq!(t.by_project["Geneseed"], Share { tokens: 117, busy_ms: 0 });
        assert_eq!(t.by_model["claude-opus-5-5"], 233);
        assert_eq!(t.busy_ms, 2000);
        assert_eq!(t.hourly[hour_of(ts)], Share { tokens: 233, busy_ms: 2000 });
        assert_eq!(t.hourly.len(), 24);
        let json = serde_json::to_value(&t).unwrap();
        assert_eq!(json["tokens"]["cacheRead"], 20);
        assert_eq!(json["byProject"]["Terra"]["busyMs"], 2000);
        // Persisted and resumed by the next open of the same day.
        c.flush();
        let again = Chronicle::open(c.dir().to_path_buf(), now(), false);
        assert_eq!(tithe_of(&again.dir, &again.tithe, &day_of(ts)), t);
        assert_eq!(days(&again.dir, &again.tithe, ts)[0], DaySummary { day: day_of(ts), events: 0, tokens: 233, busy_ms: 2000 });
    }

    #[test]
    fn flushes_only_when_something_changed() {
        let d = temp_dir("dirty");
        let t = now();
        let mut c = Chronicle::open(d.clone(), t, true);
        let saved = d.join("offsets.json");
        c.maybe_flush(t + FLUSH_MS);
        assert!(!saved.exists(), "idle: no write");
        c.add_usage("Terra", &Usage { ts: t, model: "m".into(), tokens: Tokens { input: 1, ..Default::default() } });
        c.maybe_flush(t + 2 * FLUSH_MS);
        assert!(saved.exists());
        fs::remove_file(&saved).unwrap();
        c.maybe_flush(t + 3 * FLUSH_MS);
        assert!(!saved.exists(), "clean again after a flush");
    }

    #[test]
    fn day_validation() {
        assert!(valid_day("2026-10-05"));
        for bad in ["2026-13-01", "2026-02-30", "2026-1-05", "../../x", "2026-10-05.jsonl", ""] {
            assert!(!valid_day(bad), "{bad}");
        }
    }

    #[test]
    fn retention_keeps_the_last_seven_days() {
        let d = temp_dir("retain");
        let days = last_days(now(), 9);
        for day in &days {
            fs::write(d.join(format!("{day}.jsonl")), "").unwrap();
            fs::write(d.join(format!("{day}.tithe.json")), "").unwrap();
        }
        fs::write(d.join("offsets.json"), "{}").unwrap();
        retain_days(&d, now());
        for (i, day) in days.iter().enumerate() {
            assert_eq!(d.join(format!("{day}.jsonl")).exists(), i < 7, "{day}");
            assert_eq!(d.join(format!("{day}.tithe.json")).exists(), i < 7, "{day}");
        }
        assert!(d.join("offsets.json").exists());
    }

    #[test]
    fn lifecycle_events_between_rosters() {
        let s = |id: &str, status: &str, since: i64, comp: Option<i64>| Session { status: status.into(), since_ms: since, compacted_at: comp, ..crate::registry::tests_session(id) };
        let prev = [s("a", "busy", 1, None), s("b", "waiting", 1, None), s("gone", "idle", 1, None), s("c", "busy", 1, Some(5))];
        let now = [s("a", "waiting", 2, None), s("b", "busy", 3, None), s("new", "idle", 1, None), s("c", "busy", 1, Some(9))];
        let ev = lifecycle(&prev, &now, 42);
        let got: Vec<(&str, &str)> = ev.iter().map(|e| (e.session_id.as_str(), e.kind.as_str())).collect();
        assert_eq!(got, [("a", "petition"), ("b", "petition-answered"), ("new", "arrived"), ("c", "compaction"), ("gone", "left")]);
        assert!(ev.iter().all(|e| e.ts == 42));
        assert!(lifecycle(&now, &now, 0).is_empty(), "steady roster is quiet");
    }

    #[test]
    fn event_serializes_camel_case() {
        let e = Event { ts: 1, kind: "commit".into(), session_id: "s".into(), name: "n".into(), dept: "d".into(), helper: Some("Explore".into()), detail: "x".into() };
        let j = serde_json::to_value(&e).unwrap();
        assert_eq!(j["sessionId"], "s");
        assert_eq!(j["helper"], "Explore");
    }

    #[test]
    fn turn_summary() {
        use crate::registry::TurnSummary;
        let cwd = r"C:\git\Terra";
        let lines = [
            r#"{"type":"user","timestamp":"2026-10-06T10:00:00.000Z","message":{"content":"fix the plaque"}}"#,
            r#"{"type":"assistant","timestamp":"2026-10-06T10:00:05.000Z","message":{"content":[{"type":"tool_use","id":"1","name":"Read","input":{"file_path":"C:\\git\\Terra\\ui\\app.js"}},{"type":"tool_use","id":"2","name":"Edit","input":{"file_path":"C:\\git\\Terra\\ui\\app.js"}}]}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:00:06.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"2","content":"ok"}]}}"#,
            r#"{"type":"assistant","timestamp":"2026-10-06T10:01:00.000Z","message":{"content":[{"type":"tool_use","id":"3","name":"Edit","input":{"file_path":"c:/git/terra/ui/app.js"}},{"type":"tool_use","id":"4","name":"Write","input":{"file_path":"D:\\other\\notes.md"}},{"type":"tool_use","id":"5","name":"NotebookEdit","input":{"notebook_path":"C:\\git\\Terra\\nb.ipynb"}}]}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:02:00.000Z","message":{"content":"<command-name>/clear</command-name>"}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:02:01.000Z","isMeta":true,"message":{"content":"caveat"}}"#,
        ];
        let mut t = TurnSummary::default();
        for l in lines {
            track_turn(&mut t, l, cwd);
        }
        assert_eq!(t.started_ms, registry::iso_utc_ms("2026-10-06T10:00:00.000Z"));
        assert_eq!(t.last_ms, registry::iso_utc_ms("2026-10-06T10:01:00.000Z"));
        assert_eq!(t.tools, 5);
        assert_eq!(t.files, ["ui/app.js", r"D:\other\notes.md", "nb.ipynb"], "relative inside the cwd, once each, any slash or case");
        assert_eq!(t.more_files, 0);

        track_turn(&mut t, r#"{"type":"user","timestamp":"2026-10-06T11:00:00.000Z","message":{"content":[{"type":"text","text":"next"}]}}"#, cwd);
        assert_eq!((t.tools, t.files.len(), t.started_ms), (0, 0, registry::iso_utc_ms("2026-10-06T11:00:00.000Z")), "a real prompt starts a new turn");

        for i in 0..(MAX_TURN_FILES + 3) {
            track_turn(&mut t, &format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","id":"w{i}","name":"Write","input":{{"file_path":"C:\\git\\Terra\\f{i}.txt"}}}}]}}}}"#), cwd);
        }
        assert_eq!((t.files.len(), t.more_files), (MAX_TURN_FILES, 3));

        assert!(turn_wanted(lines[0]) && turn_wanted(lines[1]));
        assert!(!turn_wanted(r#"{"type":"ai-title","aiTitle":"x"}"#));
    }

    #[test]
    fn chronicle_reads_session_and_subagent_transcripts_incrementally() {
        let root = temp_dir("chronicle");
        let projects = root.join("projects");
        let cwd = r"C:\git\Terra";
        let base = projects.join(registry::slug(cwd));
        let subs = base.join("s1").join("subagents");
        fs::create_dir_all(&subs).unwrap();
        let t = now();
        let turn = |ms: u64| serde_json::json!({"type":"system","subtype":"turn_duration","durationMs":ms,"timestamp":iso(t)}).to_string();
        fs::write(base.join("s1.jsonl"), format!("{}\n{}\n{}\n", bash_use("a", "git push origin main", t), result("a", "ok".into(), Some(false), t), turn(90_000))).unwrap();
        let usage = serde_json::json!({"type":"assistant","timestamp":iso(t),"message":{"model":"claude-haiku-4-5","id":"m1","usage":{"input_tokens":3,"output_tokens":4}}}).to_string();
        fs::write(subs.join("agent-x1.jsonl"), format!("{usage}\n{}\n{}\n", result("q", "boom".into(), Some(true), t), turn(60_000))).unwrap();
        fs::write(subs.join("agent-x1.meta.json"), r#"{"agentType":"Explore"}"#).unwrap();
        let mut c = Chronicle::open(root.join("chronicon"), t, true);
        let s = Session { cwd: cwd.into(), dept: "Terra".into(), name: "terra-77".into(), ..crate::registry::tests_session("s1") };
        let files = |c: &mut Chronicle| {
            let mut v = vec![(registry::stat(&base.join("s1.jsonl")).unwrap(), false)];
            v.extend(registry::list_subagents(&subs).into_iter().map(|f| (f, true)));
            c.read_transcripts(&[s.clone()], &HashMap::from([("s1".to_string(), v)]), t)
        };
        let ev = files(&mut c);
        let got: Vec<(&str, Option<&str>)> = ev.iter().map(|e| (e.kind.as_str(), e.helper.as_deref())).collect();
        assert_eq!(got, [("push", None), ("tool-error", Some("Explore"))]);
        let tithe = tithe_of(&c.dir, &c.tithe, &day_of(t));
        assert_eq!(tithe.by_project["Terra"], Share { tokens: 7, busy_ms: 90_000 }, "subagent tokens go to the parent's project, its turns add no time");
        assert_eq!((tithe.busy_ms, tithe.hourly[hour_of(t)].busy_ms), (90_000, 90_000));
        assert!(files(&mut c).is_empty(), "nothing new");
        for e in &ev {
            c.record(e);
        }
        assert_eq!(read_events(c.dir(), &day_of(t)), ev);
        c.flush();
        let again = Chronicle::open(c.dir().to_path_buf(), t, false);
        assert_eq!(again.offsets.len(), 2, "offsets persisted");
    }
}
