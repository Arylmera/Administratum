use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawRecord {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub status: Option<String>,
    pub waiting_for: Option<String>,
    pub status_updated_at: Option<i64>,
    pub bridge_session_id: Option<String>,
    /// Process creation time as a Windows FILETIME (100 ns ticks since 1601), in decimal.
    pub proc_start: Option<String>,
}

/// A transcript file with the size and mtime one stat (or directory listing) gave.
#[derive(Clone, Debug, PartialEq)]
pub struct FileStat {
    pub path: PathBuf,
    pub len: u64,
    pub mtime_ms: i64,
}

fn mtime_ms(m: &fs::Metadata) -> i64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(i64::MAX, |d| d.as_millis() as i64)
}

/// One stat of a regular file.
pub fn stat(path: &Path) -> Option<FileStat> {
    let m = fs::metadata(path).ok().filter(|m| m.is_file())?;
    Some(FileStat { path: path.to_path_buf(), len: m.len(), mtime_ms: mtime_ms(&m) })
}

/// Every `agent-<id>.jsonl` in a session's `subagents` dir, sorted by path; sizes come from the
/// listing itself (free on Windows), no stat per file.
pub fn list_subagents(dir: &Path) -> Vec<FileStat> {
    let mut out: Vec<FileStat> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_name().to_str().is_some_and(|n| n.starts_with("agent-") && n.ends_with(".jsonl")))
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some(FileStat { path: e.path(), len: m.len(), mtime_ms: mtime_ms(&m) })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub pid: u32,
    pub name: String,
    pub dept: String,
    pub cwd: String,
    pub status: String,
    pub waiting_for: Option<String>,
    pub since_ms: i64,
    pub task: String,
    /// Claude Code's generated session title (newest `ai-title` in the tail).
    pub title: Option<String>,
    /// While waiting: the pending tool call the petition is about (see `pending_ask`).
    pub asks: Option<String>,
    pub helpers: Vec<Helper>,
    pub context: Option<Context>,
    pub orca: Option<String>,
    pub web: Option<String>,
    pub background: bool,
    /// Ms timestamp of the newest context compaction seen (see `compacted_at`, `track_compaction`).
    pub compacted_at: Option<i64>,
    /// The closing question of a finished turn (`ends_with_question`), only while idle in the foreground.
    pub question: Option<String>,
    /// The git branch of `cwd` (git.rs, refreshed by the poller every few seconds); None outside a repo.
    pub branch: Option<String>,
    /// Stopped on a subscription usage limit (newest assistant line `"error":"rate_limit"`, no prompt since).
    pub limit: Option<Limit>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Helper {
    pub id: String,
    pub kind: String,
    pub task: String,
    pub model: Option<String>,
    pub context: Option<Context>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub tokens: u64,
    pub model: String,
}

/// A usage limit the session is stopped on (`limit_of`): until `reset_ms` when the message names an hour.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limit {
    pub reset_ms: Option<i64>,
    pub text: String,
}

/// Current context size of the newest assistant transcript line that has a usage object:
/// input + cache_creation_input + cache_read_input tokens, paired with its model. Scans
/// newest-first like `task_line`; skips lines with no usage or a synthetic model.
pub fn context_of(tail: &str) -> Option<Context> {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        if v["type"] != "assistant" {
            continue;
        }
        let model = v["message"]["model"].as_str().unwrap_or("");
        if model.is_empty() || model == "<synthetic>" {
            continue;
        }
        let usage = &v["message"]["usage"];
        if usage.is_null() {
            continue;
        }
        let field = |k: &str| usage[k].as_u64().unwrap_or(0);
        let tokens = field("input_tokens") + field("cache_creation_input_tokens") + field("cache_read_input_tokens");
        return Some(Context { tokens, model: model.to_string() });
    }
    None
}

/// Ms timestamp of the newest `{"type":"system","subtype":"compact_boundary","timestamp":"<ISO>"}`
/// line in `tail` (Claude Code writes one each time it compacts the context).
pub fn compacted_at(tail: &str) -> Option<i64> {
    tail.lines().rev().filter(|l| l.contains("compact_boundary")).find_map(|line| {
        let v = serde_json::from_str::<serde_json::Value>(line).ok()?;
        if v["type"] != "system" || v["subtype"] != "compact_boundary" {
            return None;
        }
        iso_utc_ms(v["timestamp"].as_str()?)
    })
}

/// "2026-04-10T18:08:48.679Z" -> Unix ms. ponytail: only the UTC "Z" form Claude Code writes, no offsets.
pub(crate) fn iso_utc_ms(s: &str) -> Option<i64> {
    let s = s.strip_suffix('Z')?;
    let (date, time) = s.split_once('T')?;
    let mut d = date.splitn(3, '-').map(|n| n.parse::<i64>().ok());
    let (y, m, day) = (d.next()??, d.next()??, d.next()??);
    let (hms, frac) = time.split_once('.').unwrap_or((time, "0"));
    let mut t = hms.splitn(3, ':').map(|n| n.parse::<i64>().ok());
    let (hh, mm, ss) = (t.next()??, t.next()??, t.next()??);
    let ms = format!("{frac:0<3}").get(..3)?.parse::<i64>().ok()?;
    // days since 1970-01-01 (Howard Hinnant's days_from_civil)
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
    Some(((days * 24 + hh) * 60 + mm) * 60_000 + ss * 1000 + ms)
}

/// Keeps each session's newest compaction time across polls (the boundary line soon scrolls out of
/// the transcript tail), and stamps `now_ms` when the context falls by more than 40% with no
/// compaction seen in the last minute (fallback when the marker is missed).
pub fn track_compaction(prev: &[Session], roster: &mut [Session], now_ms: i64) {
    for s in roster.iter_mut() {
        let Some(p) = prev.iter().find(|p| p.id == s.id) else { continue };
        if s.compacted_at > p.compacted_at {
            continue; // a fresh marker
        }
        s.compacted_at = p.compacted_at;
        let dropped = matches!((&p.context, &s.context), (Some(a), Some(b)) if b.tokens * 10 < a.tokens * 6);
        if dropped && p.compacted_at.map_or(true, |t| now_ms - t > 60_000) {
            s.compacted_at = Some(now_ms);
        }
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HelperMeta {
    pub agent_type: Option<String>,
    description: Option<String>,
    model: Option<String>,
}

/// The sidecar `agent-<id>.meta.json` of a subagent transcript (defaults if missing or corrupt).
pub(crate) fn helper_meta(transcript: &Path) -> HelperMeta {
    fs::read_to_string(transcript.with_extension("meta.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// Safety cap: a subagent whose own transcript hasn't been written to in this long is inactive
/// no matter what (e.g. it crashed before a completion notification ever landed).
const HELPER_SAFETY_CAP_MS: i64 = 600_000;
const RESUME_GRACE_MS: i64 = 30_000;

fn agent_id(f: &FileStat) -> Option<&str> {
    f.path.file_name()?.to_str()?.strip_prefix("agent-")?.strip_suffix(".jsonl")
}

/// Active subagents for one session among `subs` (see `list_subagents`), sorted by id for stable
/// output. A helper is active unless either (a) its own transcript hasn't been written to in
/// `HELPER_SAFETY_CAP_MS`, or (b) `completed` (agent id -> completion ms, from the parent
/// transcript's `<task-notification>` lines, see `parse_completions`) has an entry for it whose
/// timestamp is at or after its transcript's last write — a write after that timestamp (a resume)
/// makes it active again. `read` builds the helper of an active one (`read_helper`, or a memo of it).
pub fn active_helpers(subs: &[FileStat], now_ms: i64, completed: &HashMap<String, i64>, mut read: impl FnMut(&FileStat, &str) -> Helper) -> Vec<Helper> {
    let mut out = vec![];
    for f in subs {
        let Some(id) = agent_id(f) else { continue };
        if now_ms - f.mtime_ms >= HELPER_SAFETY_CAP_MS {
            continue;
        }
        // The agent's last flush can land a moment after its notification; only a write well after it is a resume.
        if completed.get(id).is_some_and(|&done| f.mtime_ms <= done + RESUME_GRACE_MS) {
            continue;
        }
        out.push(read(f, id));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// A subagent's meta (missing/unparseable: defaults) and its context from its own transcript tail.
pub fn read_helper(f: &FileStat, id: &str) -> Helper {
    let meta = helper_meta(&f.path);
    Helper {
        id: id.to_string(),
        kind: meta.agent_type.unwrap_or_else(|| "agent".to_string()),
        task: meta.description.map(|d| clip(&d)).unwrap_or_default(),
        model: meta.model,
        context: file_tail(&f.path, TAIL_BYTES).and_then(|t| context_of(&t)),
    }
}

/// `<task-id>...</task-id>` ids with `<status>completed</status>` in Claude Code's
/// `<task-notification>` lines (parent-transcript `queue-operation` entries written when a
/// background subagent stops), paired with that line's own timestamp in ms. A later notification
/// for the same id (a resume, then another stop) simply appears again; the caller keeps the newest.
pub fn parse_completions(text: &str) -> Vec<(String, i64)> {
    let tag = |s: &str, name: &str| -> Option<String> {
        let open = format!("<{name}>");
        let start = s.find(&open)? + open.len();
        let end = s[start..].find(&format!("</{name}>"))? + start;
        Some(s[start..end].to_string())
    };
    text.lines()
        .filter(|l| l.contains("<task-notification>"))
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter_map(|v| {
            let content = v["content"].as_str()?;
            if !content.contains("<status>completed</status>") {
                return None;
            }
            let id = tag(content, "task-id")?;
            let ts = v["timestamp"].as_str().and_then(iso_utc_ms).unwrap_or(0);
            Some((id, ts))
        })
        .collect()
}

/// Whole lines appended to `path` since byte offset `stored`; no stored offset starts at the
/// current end (skips history — a helper that already completed before this reader first saw its
/// session will show inactive once its transcript goes stale past the safety cap anyway).
fn tail_appended(path: &Path, len: u64, stored: Option<u64>) -> (String, u64) {
    use std::io::{Read, Seek, SeekFrom};
    // First sight: look back a few MB so subagents that finished just before the widget started
    // (still inside the 10 min cap) are not shown as active.
    let first = stored.is_none();
    let start = stored.map_or(len.saturating_sub(FIRST_SIGHT_BYTES), |s| s.min(len));
    if start == len {
        return (String::new(), len);
    }
    let Ok(mut f) = fs::File::open(path) else { return (String::new(), start) };
    if f.seek(SeekFrom::Start(start)).is_err() {
        return (String::new(), start);
    }
    let mut buf = Vec::new();
    if f.take(len - start).read_to_end(&mut buf).is_err() {
        return (String::new(), start);
    }
    let cut = buf.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    // A look-back that starts mid-file begins mid-line: drop that partial first line.
    let skip = if first && start > 0 { buf[..cut].iter().position(|&b| b == b'\n').map_or(cut, |i| i + 1) } else { 0 };
    (String::from_utf8_lossy(&buf[skip..cut]).into_owned(), start + cut as u64)
}
const FIRST_SIGHT_BYTES: u64 = 4 << 20;

/// Incrementally tracks, per session, which of its subagents the parent transcript has reported
/// completed (agent id -> completion ms). Byte offsets keep each parent transcript from being
/// rescanned; feed the result straight into `active_helpers`.
#[derive(Default)]
pub struct Completions {
    offsets: HashMap<String, u64>,
    by_session: HashMap<String, HashMap<String, i64>>,
}

impl Completions {
    pub fn scan(&mut self, session_id: &str, parent: &FileStat) -> &HashMap<String, i64> {
        let key = parent.path.to_string_lossy().into_owned();
        let (text, offset) = tail_appended(&parent.path, parent.len, self.offsets.get(&key).copied());
        self.offsets.insert(key, offset);
        if !text.is_empty() {
            let map = self.by_session.entry(session_id.to_string()).or_default();
            for (id, ts) in parse_completions(&text) {
                map.insert(id, ts);
            }
        }
        self.by_session.entry(session_id.to_string()).or_default()
    }

    /// Forgets sessions and parent transcripts that are no longer live.
    pub fn retain(&mut self, live_ids: &HashSet<String>, live_paths: &HashSet<String>) {
        self.by_session.retain(|id, _| live_ids.contains(id));
        self.offsets.retain(|p, _| live_paths.contains(p));
    }
}

/// Whether the newest assistant/user/system entry in `tail` shows the turn has concluded.
/// Scans newest-first; a `system` entry whose subtype isn't "turn_duration" or
/// "stop_hook_summary" (e.g. the metadata-ish "away_summary") is noise and is skipped, same as
/// non-assistant/user/system lines (last-prompt, ai-title, mode, ...). The first assistant/user
/// message found means the turn is still in progress (e.g. a pending tool_use) -> false.
pub fn turn_done(tail: &str) -> bool {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        match v["type"].as_str() {
            Some("assistant") | Some("user") => return false,
            Some("system") => match v["subtype"].as_str() {
                Some("turn_duration") | Some("stop_hook_summary") => return true,
                _ => continue,
            },
            _ => continue,
        }
    }
    false
}

/// The question a finished turn ends on: the newest assistant entry with text (tool_use-only
/// entries skipped, stopping at the turn's prompt), its fenced code, inline code and URLs removed,
/// last non-empty paragraph, if it holds a '?' (or '？'). Clipped to 200 chars.
// ponytail: a heuristic; a closing statement that merely quotes a '?' still counts.
pub fn ends_with_question(tail: &str) -> Option<String> {
    if !turn_done(tail) {
        return None;
    }
    let mut text = None;
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let content = &v["message"]["content"];
        match v["type"].as_str() {
            Some("assistant") => {
                let parts: Vec<&str> = content.as_array().into_iter().flatten().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect();
                if !parts.is_empty() {
                    text = Some(parts.join("\n\n"));
                    break;
                }
            }
            // A real prompt (not a tool result) opens the turn: no assistant text in it.
            Some("user") if !content.as_array().is_some_and(|a| a.iter().any(|b| b["type"] == "tool_result")) => return None,
            _ => {}
        }
    }
    let mut fenced = false;
    let mut kept = String::new();
    for line in text?.lines() {
        let t = line.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if !fenced {
            // Odd segments between backticks are inline code.
            let prose: String = line.split('`').step_by(2).collect::<Vec<_>>().join("");
            kept.push_str(&prose.split(' ').filter(|w| !w.contains("://")).collect::<Vec<_>>().join(" "));
        }
        kept.push('\n');
    }
    let last = kept.split("\n\n").map(str::trim).filter(|p| !p.is_empty()).last()?;
    if !last.contains(['?', '？']) {
        return None;
    }
    Some(if last.chars().count() <= 200 { last.to_string() } else { format!("{}…", last.chars().take(199).collect::<String>()) })
}

pub fn parse_record(text: &str) -> Option<RawRecord> {
    serde_json::from_str(text).ok()
}

pub fn dept_of(cwd: &str) -> String {
    let trimmed = cwd.trim_end_matches(['\\', '/']);
    trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed).to_string()
}

pub fn normalize_status(s: Option<&str>) -> &'static str {
    match s {
        Some("busy") => "busy",
        Some("shell") => "shell",
        Some("waiting") => "waiting",
        _ => "idle",
    }
}

pub(crate) fn clip(s: &str) -> String {
    clip_to(s, 60)
}

fn clip_to(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(n - 1).collect::<String>())
    }
}

/// First non-empty line of the string field `k`, trimmed.
fn field<'a>(input: &'a serde_json::Value, k: &str) -> Option<&'a str> {
    input[k].as_str().and_then(|t| t.trim().lines().next()).map(str::trim).filter(|t| !t.is_empty())
}

/// First non-empty string input of a tool (serde_json keeps keys sorted, so this is stable).
fn first_string(input: &serde_json::Value) -> Option<&str> {
    input.as_object()?.keys().find_map(|k| field(input, k))
}

fn basename(p: &str) -> &str {
    let t = p.trim_end_matches(['/', '\\']);
    t.rsplit(['/', '\\']).next().unwrap_or(t)
}

fn host(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    rest.split(['/', '?', '#']).next().unwrap_or(rest)
}

/// Short human detail for the task line: the call's own description where it has one, a file's
/// name rather than its path, a fetch's host.
fn tool_detail<'a>(name: &str, input: &'a serde_json::Value) -> Option<&'a str> {
    match name {
        "Bash" | "PowerShell" | "Agent" | "Task" => field(input, "description").or_else(|| field(input, "command")).or_else(|| field(input, "prompt")),
        "Edit" | "MultiEdit" | "Write" | "Read" | "NotebookEdit" => field(input, "file_path").or_else(|| field(input, "notebook_path")).map(basename),
        "Grep" | "Glob" => field(input, "pattern"),
        "WebFetch" => field(input, "url").map(host),
        "WebSearch" => field(input, "query"),
        "Skill" => field(input, "skill"),
        _ => None,
    }
    .or_else(|| first_string(input))
}

/// What a pending tool call asks permission for: "<Tool>: <command or file> — <description>".
fn ask_line(name: &str, input: &serde_json::Value) -> String {
    let target = ["command", "file_path", "notebook_path", "pattern", "url", "query", "skill", "prompt"]
        .iter()
        .find_map(|k| field(input, k))
        .or_else(|| first_string(input));
    let mut out = match target {
        Some(t) => format!("{name}: {t}"),
        None => name.to_string(),
    };
    if let Some(d) = field(input, "description").filter(|d| Some(*d) != target) {
        out = format!("{out} — {d}");
    }
    clip_to(&out, 140)
}

/// User lines that are not the operator's own prompt: harness notices, other sessions' messages,
/// command echoes (`<command-…>`, `<local-command-…>`, `<task-notification>`, `<system-reminder>`).
fn injected(t: &str) -> bool {
    t.starts_with('<')
        || ["Another Claude session", "[SYSTEM", "Caveat:", "This session is being continued from a previous conversation", "[Request interrupted"]
            .iter()
            .any(|p| t.starts_with(p))
        || (t.starts_with("You have ") && t.contains("orchestration message"))
}

/// Last thing the session did, newest first: a tool call with its target, else the last prompt.
pub fn task_line(tail: &str) -> String {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let content = &v["message"]["content"];
        match v["type"].as_str() {
            Some("assistant") => {
                let tool = content
                    .as_array()
                    .and_then(|a| a.iter().rev().find(|b| b["type"] == "tool_use"));
                if let Some(tool) = tool {
                    let name = tool["name"].as_str().unwrap_or("tool");
                    return clip(&match tool_detail(name, &tool["input"]) {
                        Some(d) => format!("{name} · {d}"),
                        None => name.to_string(),
                    });
                }
            }
            Some("user") if v["isMeta"] != true && v["isCompactSummary"] != true => {
                let text = content.as_str().map(str::to_string).or_else(|| {
                    content
                        .as_array()
                        .and_then(|a| a.iter().find(|b| b["type"] == "text"))
                        .and_then(|b| b["text"].as_str())
                        .map(str::to_string)
                });
                if let Some(t) = text {
                    let t = t.trim();
                    if !t.is_empty() && !injected(t) {
                        return clip(&format!("“{}”", t.lines().next().unwrap_or(t)));
                    }
                }
            }
            _ => {}
        }
    }
    "—".to_string()
}

/// Newest `{"type":"ai-title","aiTitle":...}` in the tail (Claude Code's generated session title).
pub fn title_of(tail: &str) -> Option<String> {
    tail.lines().rev().filter(|l| l.contains("\"ai-title\"")).find_map(|line| {
        let v = serde_json::from_str::<serde_json::Value>(line).ok()?;
        if v["type"] != "ai-title" {
            return None;
        }
        field(&v, "aiTitle").map(str::to_string)
    })
}

/// The newest tool call of the current turn still without a tool_result (by id): what a waiting
/// session asks permission for. Scans newest-first back to the last real prompt.
pub fn pending_ask(tail: &str) -> Option<String> {
    let mut answered: HashSet<String> = HashSet::new();
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let blocks = v["message"]["content"].as_array();
        match v["type"].as_str() {
            Some("user") => {
                let results: Vec<_> = blocks.into_iter().flatten().filter(|b| b["type"] == "tool_result").collect();
                if results.is_empty() && v["isMeta"] != true {
                    return None; // a prompt: the turn began here
                }
                answered.extend(results.iter().filter_map(|b| b["tool_use_id"].as_str().map(str::to_string)));
            }
            Some("assistant") => {
                let pending = blocks.into_iter().flatten().rev().find(|b| {
                    b["type"] == "tool_use" && !b["id"].as_str().is_some_and(|id| answered.contains(id))
                });
                if let Some(b) = pending {
                    return Some(ask_line(b["name"].as_str().unwrap_or("tool"), &b["input"]));
                }
            }
            _ => {}
        }
    }
    None
}

/// The usage limit a session is stopped on: its newest assistant line is Claude Code's synthetic
/// `"error":"rate_limit"` message ("You've hit your limit · resets 2pm (Europe/Paris)") and no prompt came after it.
pub fn limit_of(tail: &str) -> Option<Limit> {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let blocks = v["message"]["content"].as_array();
        match v["type"].as_str() {
            Some("assistant") => {
                if v["error"] != "rate_limit" {
                    return None;
                }
                let text = blocks.into_iter().flatten().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join(" ");
                let reset_ms = v["timestamp"].as_str().and_then(iso_utc_ms).and_then(|ts| reset_after(&text, ts));
                return Some(Limit { reset_ms, text: text.chars().take(120).collect() });
            }
            Some("user") if !blocks.is_some_and(|a| a.iter().any(|b| b["type"] == "tool_result")) && v["isMeta"] != true => return None,
            _ => {}
        }
    }
    None
}

/// The local time `resets 2pm` / `resets 2:30pm` / `resets 12am` names, at its first occurrence after `after_ms`.
// ponytail: the zone in parentheses is ignored, the PC's clock is taken as the user's; a date (weekly limit) -> None.
pub fn reset_after(text: &str, after_ms: i64) -> Option<i64> {
    let word = text.split("resets ").nth(1)?.split_whitespace().next()?.to_ascii_lowercase();
    let (clock, pm) = match word.strip_suffix("pm") {
        Some(c) => (c, true),
        None => (word.strip_suffix("am")?, false),
    };
    let (h, m) = match clock.split_once(':') {
        Some((h, m)) => (h.parse::<u32>().ok()?, m.parse::<u32>().ok()?),
        None => (clock.parse::<u32>().ok()?, 0),
    };
    if !(1..=12).contains(&h) || m > 59 {
        return None;
    }
    let after = Local.timestamp_millis_opt(after_ms).single()?;
    let mut at = after.date_naive().and_hms_opt(h % 12 + if pm { 12 } else { 0 }, m, 0)?;
    if at <= after.naive_local() {
        at += chrono::TimeDelta::days(1);
    }
    Some(Local.from_local_datetime(&at).earliest()?.timestamp_millis())
}

pub struct Scan {
    pub sessions: Vec<Session>,
    pub unreadable_pids: Vec<u32>,
}

/// What a session's transcript tail says: last task, context size, whether the turn has concluded,
/// newest compaction.
#[derive(Clone, Debug, PartialEq)]
pub struct Tail {
    pub task: String,
    pub context: Option<Context>,
    pub turn_done: bool,
    pub compacted_at: Option<i64>,
    pub title: Option<String>,
    pub asks: Option<String>,
    pub question: Option<String>,
    pub limit: Option<Limit>,
}

/// The `Tail` of a transcript, `read(n)` giving its last `n` bytes (None: no transcript). When
/// the newest line doesn't fit in the small tail, retries once with a bigger one.
pub fn read_tail(read: impl Fn(u64) -> Option<String>) -> Option<Tail> {
    let small = read(TAIL_BYTES)?;
    let mut task = task_line(&small);
    let mut context = context_of(&small);
    let mut tail = small;
    if task == "—" || context.is_none() {
        if let Some(bigger) = read(BIG_TAIL_BYTES) {
            if task == "—" {
                task = task_line(&bigger);
            }
            if context.is_none() {
                context = context_of(&bigger);
            }
            tail = bigger;
        }
    }
    Some(Tail { task, context, turn_done: turn_done(&tail), compacted_at: compacted_at(&tail), title: title_of(&tail), asks: pending_ask(&tail), question: ends_with_question(&tail), limit: limit_of(&tail) })
}

/// One pass over `~/.claude/sessions`. A file that fails to parse is reported by the pid in its
/// name (only if that pid is still alive) so the caller can keep that session's last known state
/// (Claude Code may be mid-write) without resurrecting a session whose process already died.
/// `alive(pid, procStart)`; `details(session id, cwd)` gives the transcript tail and active helpers.
pub fn scan(
    dir: &Path,
    alive: impl Fn(u32, Option<&str>) -> bool,
    mut details: impl FnMut(&str, &str) -> (Option<Tail>, Vec<Helper>),
    mut orca_handle: impl FnMut(u32) -> Option<String>,
) -> Scan {
    let mut out = Scan { sessions: vec![], unreadable_pids: vec![] };
    let Ok(entries) = fs::read_dir(dir) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let stem_pid = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u32>().ok());
        let Some(rec) = fs::read_to_string(&path).ok().and_then(|t| parse_record(&t)) else {
            if let Some(pid) = stem_pid {
                if alive(pid, None) {
                    out.unreadable_pids.push(pid);
                }
            }
            continue;
        };
        if !alive(rec.pid, rec.proc_start.as_deref()) {
            continue;
        }
        let mut status = normalize_status(rec.status.as_deref()).to_string();
        let (tail, helper_list) = details(&rec.session_id, &rec.cwd);
        let background = status == "shell" && tail.as_ref().is_some_and(|t| t.turn_done);
        let compacted = tail.as_ref().and_then(|t| t.compacted_at);
        let limit = tail.as_ref().and_then(|t| t.limit.clone());
        if background {
            status = "idle".to_string();
        }
        let question = tail.as_ref().and_then(|t| t.question.clone()).filter(|_| status == "idle" && !background);
        let (task, context, title, asks) = tail.map_or_else(|| ("—".to_string(), None, None, None), |t| (t.task, t.context, t.title, t.asks));
        let orca = orca_handle(rec.pid);
        let web = rec.bridge_session_id.map(|id| format!("https://claude.ai/code/{id}"));
        out.sessions.push(Session {
            task,
            title,
            asks: if status == "waiting" { asks } else { None },
            dept: dept_of(&rec.cwd),
            name: rec.name.clone().unwrap_or_else(|| dept_of(&rec.cwd)),
            id: rec.session_id,
            pid: rec.pid,
            cwd: rec.cwd,
            waiting_for: if status == "waiting" { rec.waiting_for } else { None },
            since_ms: rec.status_updated_at.unwrap_or(0),
            status,
            helpers: helper_list,
            context,
            orca,
            web,
            background,
            compacted_at: compacted,
            question,
            branch: None,
            limit,
        });
    }
    out.sessions.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

const TAIL_BYTES: u64 = 65536;
const BIG_TAIL_BYTES: u64 = 512 * 1024;

/// `cwd` turned into the project-folder slug Claude Code uses under `~/.claude/projects`:
/// every non-alphanumeric-ASCII char becomes `-` (e.g. `C:\Users\x\git\Foo` -> `C--Users-x-git-Foo`).
pub(crate) fn slug(cwd: &str) -> String {
    cwd.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// `<projects>/<slug(cwd)>/<session_id>.jsonl`, where Claude Code writes a session's transcript.
pub fn direct_transcript(projects: &Path, session_id: &str, cwd: &str) -> PathBuf {
    projects.join(slug(cwd)).join(format!("{session_id}.jsonl"))
}

/// `<session_id>.jsonl` in any project folder: one stat per folder, for when the direct slug
/// path misses (e.g. cwd changed since the session started). The caller caches the answer.
pub fn find_transcript(projects: &Path, session_id: &str) -> Option<PathBuf> {
    let file = format!("{session_id}.jsonl");
    fs::read_dir(projects).ok()?.flatten().map(|e| e.path().join(&file)).find(|p| p.is_file())
}

/// Last `tail_bytes` of `path`, cut to whole lines (the first partial line is dropped).
pub fn file_tail(path: &Path, tail_bytes: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(tail_bytes))).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    Some(if len > tail_bytes { text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or_default() } else { text })
}

/// Only a well-formed Orca terminal handle may be passed to `orca terminal switch`.
pub fn valid_orca_handle(handle: &str) -> bool {
    handle.strip_prefix("term_").is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_hexdigit() || c == '-'))
}

/// Only a claude.ai code-session URL may be opened via the shell.
pub fn valid_claude_web_url(url: &str) -> bool {
    // The id is passed through `cmd /c start`, so only allow characters cmd can't interpret (& | ^ < > etc.).
    url.strip_prefix("https://claude.ai/code/")
        .is_some_and(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

pub fn merge(prev: &[Session], scan: Scan) -> Vec<Session> {
    let mut out = scan.sessions;
    for pid in scan.unreadable_pids {
        if let Some(p) = prev.iter().find(|s| s.pid == pid) {
            out.push(p.clone());
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Remembers open petition episodes (`id:since`) so each one notifies exactly once, and once more
/// when it goes stale.
#[derive(Default)]
pub struct Tracker {
    open: HashSet<String>,
    stale: HashSet<String>,
    asked: HashSet<String>,
    limits: HashSet<String>,
}

impl Tracker {
    pub fn new_petitions(&mut self, roster: &[Session]) -> Vec<Session> {
        let mut now = HashSet::new();
        let mut fresh = vec![];
        for s in roster.iter().filter(|s| s.status == "waiting") {
            let key = format!("{}:{}", s.id, s.since_ms);
            if !self.open.contains(&key) {
                fresh.push(s.clone());
            }
            now.insert(key);
        }
        self.open = now;
        fresh
    }

    /// Question episodes (`id:since` of a session with a `question`) seen for the first time.
    pub fn new_questions(&mut self, roster: &[Session]) -> Vec<Session> {
        let mut now = HashSet::new();
        let mut fresh = vec![];
        for s in roster.iter().filter(|s| s.question.is_some()) {
            let key = format!("{}:{}", s.id, s.since_ms);
            if !self.asked.contains(&key) {
                fresh.push(s.clone());
            }
            now.insert(key);
        }
        self.asked = now;
        fresh
    }

    /// Petitions that have just crossed `STALE_MS` of waiting, once per episode (`id:since`).
    /// A petition with no known start (`since_ms == 0`) never escalates.
    pub fn stale_petitions(&mut self, roster: &[Session], now_ms: i64) -> Vec<Session> {
        let waiting: Vec<_> = roster.iter().filter(|s| s.status == "waiting" && s.since_ms > 0).collect();
        let keys: HashSet<String> = waiting.iter().map(|s| format!("{}:{}", s.id, s.since_ms)).collect();
        self.stale.retain(|k| keys.contains(k));
        let mut out = vec![];
        for s in waiting {
            if now_ms - s.since_ms > STALE_MS && self.stale.insert(format!("{}:{}", s.id, s.since_ms)) {
                out.push(s.clone());
            }
        }
        out
    }

    /// Usage-limit waves seen for the first time, each the sessions sealed until the same reset (the message text when
    /// it names no hour): one toast per wave; a session joining a wave already toasted adds none.
    pub fn new_limits(&mut self, roster: &[Session]) -> Vec<Vec<Session>> {
        let mut waves: BTreeMap<String, Vec<Session>> = BTreeMap::new();
        for s in roster {
            if let Some(l) = &s.limit {
                waves.entry(l.reset_ms.map_or_else(|| l.text.clone(), |r| r.to_string())).or_default().push(s.clone());
            }
        }
        let fresh = waves.iter().filter(|(k, _)| !self.limits.contains(*k)).map(|(_, v)| v.clone()).collect();
        self.limits = waves.into_keys().collect();
        fresh
    }
}

pub const STALE_MS: i64 = 5 * 60 * 1000;

/// A Claude Code permission dialog: its question line, every numbered option with its label, and
/// the option numbers of plain "Yes", the first "Yes, ..." (don't ask again / allow all edits) if
/// offered (never "switch to auto mode"), and the "No" option.
#[derive(Debug, PartialEq)]
pub struct Prompt {
    pub question: String,
    pub options: Vec<(u8, String)>,
    pub yes: u8,
    pub always: Option<u8>,
    pub no: u8,
}

/// The permission dialog at the bottom of a rendered terminal screen, if that's what it shows.
/// The screen is untrusted: only the question and option labels/numbers come out of it (labels are
/// for display only), and only when the last "Do you want" line is followed (within 3 lines) by options numbered 1, 2, ... starting with a plain
/// "Yes" and including a "No", with nothing but a short footer under them (no input box, no rule):
/// a dialog that scrolled up under later output doesn't count.
pub fn parse_permission_prompt(screen: &str) -> Option<Prompt> {
    // Box borders and the selection cursor are decoration.
    let lines: Vec<&str> = screen.lines().map(|l| l.trim().trim_matches('│').trim()).collect();
    let q = lines.iter().rposition(|l| l.starts_with("Do you want"))?;
    let option = |l: &str| -> Option<(u8, String)> {
        let (n, label) = l.trim_start_matches('❯').trim_start().split_once(". ")?;
        let n: u8 = n.parse().ok().filter(|n| (1..=9).contains(n))?;
        Some((n, label.trim().to_string()))
    };
    let first = (q + 1..lines.len().min(q + 4)).find(|&i| option(lines[i]).is_some())?;
    let mut opts: Vec<(u8, String)> = vec![];
    let mut end = first;
    while end < lines.len() && !lines[end].is_empty() {
        match option(lines[end]) {
            Some((n, label)) if n as usize == opts.len() + 1 => opts.push((n, label)),
            Some(_) => return None, // out of sequence
            None if opts.is_empty() => return None,
            // A footer or box border right under the last option ends the list.
            None if lines[end].starts_with("Esc to") || !lines[end].chars().any(char::is_alphanumeric) => break,
            None => {
                // a wrapped option label
                let last = &mut opts.last_mut()?.1;
                last.push(' ');
                last.push_str(lines[end]);
            }
        }
        end += 1;
    }
    let footer: Vec<&str> = lines[end..].iter().copied().filter(|l| !l.is_empty()).collect();
    // The input box (a "─" rule, a "❯" line) under the options means the dialog is gone.
    if footer.len() > 3 || footer.iter().any(|l| l.starts_with('❯') || l.chars().all(|c| c == '─')) {
        return None;
    }
    let find = |pred: &dyn Fn(&str) -> bool| opts.iter().find(|(_, l)| pred(l)).map(|(n, _)| *n);
    let yes = find(&|l| l == "Yes").filter(|&n| n == 1)?;
    let (always, no) = (find(&|l| l.starts_with("Yes,") && !l.contains("auto mode")), find(&|l| l.starts_with("No"))?);
    Some(Prompt { question: lines[q].to_string(), options: opts, yes, always, no })
}

/// A plain idle session for other modules' tests.
#[cfg(test)]
pub fn tests_session(id: &str) -> Session {
    Session { id: id.into(), pid: 1, name: id.into(), dept: "Terra".into(), cwd: r"C:\git\Terra".into(), status: "idle".into(), task: "—".into(), ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIVE: &str = r#"{"pid":43976,"sessionId":"63d0cfff","cwd":"C:\\Users\\guill\\Documents\\git\\Geneseed","name":"geneseed-51","status":"waiting","waitingFor":"approve Bash","statusUpdatedAt":1791186419659,"kind":"interactive"}"#;

    #[test]
    fn parse_record_reads_live_fields() {
        let r = parse_record(LIVE).expect("parses");
        assert_eq!(r.pid, 43976);
        assert_eq!(r.session_id, "63d0cfff");
        assert_eq!(r.name.as_deref(), Some("geneseed-51"));
        assert_eq!(r.waiting_for.as_deref(), Some("approve Bash"));
        assert_eq!(r.status_updated_at, Some(1791186419659));
    }

    #[test]
    fn parse_record_rejects_half_written_file() {
        assert!(parse_record(r#"{"pid":43976,"sessionId":"63d0"#).is_none());
    }

    #[test]
    fn dept_is_last_path_segment() {
        assert_eq!(dept_of(r"C:\Users\guill\Documents\git\Terra"), "Terra");
        assert_eq!(dept_of(r"C:\Users\guill\Documents\git\Terra\"), "Terra");
        assert_eq!(dept_of("/home/x/Token-Dashboard"), "Token-Dashboard");
    }

    #[test]
    fn unknown_status_is_idle() {
        assert_eq!(normalize_status(Some("busy")), "busy");
        assert_eq!(normalize_status(Some("shell")), "shell");
        assert_eq!(normalize_status(Some("waiting")), "waiting");
        assert_eq!(normalize_status(Some("compacting")), "idle");
        assert_eq!(normalize_status(None), "idle");
    }

    #[test]
    fn task_line_prefers_last_tool_use() {
        let tail = [
            r#"{"type":"user","message":{"content":"fix the hololith page"}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Edit","input":{"file_path":"ui/hololith.html"}}]}}"#,
        ].join("\n");
        assert_eq!(task_line(&tail), "Edit · hololith.html");
    }

    #[test]
    fn task_line_falls_back_to_prompt_and_skips_tool_results() {
        let tail = [
            r#"{"type":"user","message":{"content":"port the Lex index"}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"done"}]}}"#,
            r#"{"type":"user","message":{"content":"<command-name>/clear</command-name>"}}"#,
        ].join("\n");
        assert_eq!(task_line(&tail), "“port the Lex index”");
    }

    #[test]
    fn task_line_clips_long_details_and_handles_empty() {
        let long = "x".repeat(200);
        let tail = format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","name":"Bash","input":{{"command":"{long}"}}}}]}}}}"#);
        let line = task_line(&tail);
        assert_eq!(line.chars().count(), 60);
        assert!(line.ends_with('…'));
        assert_eq!(task_line(""), "—");
        assert_eq!(task_line("not json\n{"), "—");
    }

    fn tool(name: &str, id: &str, input: &str) -> String {
        format!(r#"{{"type":"assistant","message":{{"model":"claude-opus-5-5","content":[{{"type":"tool_use","id":"{id}","name":"{name}","input":{input}}}]}}}}"#)
    }

    #[test]
    fn task_line_prefers_description_then_first_command_line() {
        let described = tool("Bash", "t1", r#"{"command":"PYTHONUTF8=1 python - <<'EOF'\np='README.md'\nEOF","description":"Rewrite the README intro"}"#);
        assert_eq!(task_line(&described), "Bash · Rewrite the README intro");
        let bare = tool("PowerShell", "t1", r#"{"command":"\n  Get-ChildItem ui\n  Get-Date"}"#);
        assert_eq!(task_line(&bare), "PowerShell · Get-ChildItem ui");
        let agent = tool("Agent", "t1", r#"{"description":"Find card code","prompt":"Search the ui folder...","subagent_type":"Explore"}"#);
        assert_eq!(task_line(&agent), "Agent · Find card code");
    }

    #[test]
    fn task_line_names_file_pattern_host_query_skill() {
        assert_eq!(task_line(&tool("Edit", "t", r#"{"file_path":"C:\\Users\\guill\\Documents\\git\\Administratum\\ui\\app.js","old_string":"a","new_string":"b"}"#)), "Edit · app.js");
        assert_eq!(task_line(&tool("Read", "t", r#"{"file_path":"/home/x/src/main.rs"}"#)), "Read · main.rs");
        assert_eq!(task_line(&tool("NotebookEdit", "t", r#"{"notebook_path":"C:\\n\\eda.ipynb","new_source":"x"}"#)), "NotebookEdit · eda.ipynb");
        assert_eq!(task_line(&tool("Grep", "t", r#"{"pattern":"fn task_line","path":"src-tauri"}"#)), "Grep · fn task_line");
        assert_eq!(task_line(&tool("WebFetch", "t", r#"{"url":"https://docs.rs/serde_json/latest/serde_json/","prompt":"read"}"#)), "WebFetch · docs.rs");
        assert_eq!(task_line(&tool("WebSearch", "t", r#"{"query":"tauri 2 tray icon"}"#)), "WebSearch · tauri 2 tray icon");
        assert_eq!(task_line(&tool("Skill", "t", r#"{"skill":"commit","args":"-m x"}"#)), "Skill · commit");
        assert_eq!(task_line(&tool("mcp__notion__search", "t", r#"{"limit":5,"query":"  \n roadmap"}"#)), "mcp__notion__search · roadmap");
        assert_eq!(task_line(&tool("TodoWrite", "t", r#"{"todos":[]}"#)), "TodoWrite");
    }

    #[test]
    fn task_line_skips_injected_user_lines() {
        let tail = [
            r#"{"type":"user","message":{"role":"user","content":"tidy the card text"},"uuid":"u1"}"#,
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":[{"type":"text","text":"Another Claude session sent a message:\n\nhello"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":"Another Claude session sent a message: hi"}}"#,
            r#"{"type":"user","message":{"role":"user","content":"<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>"}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>\nnote\n</system-reminder>"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":"[SYSTEM NOTICE] context low"}}"#,
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>"}}"#,
            r#"{"type":"user","message":{"role":"user","content":"Caveat: The messages below were generated locally."}}"#,
            r#"{"type":"user","message":{"role":"user","content":"<command-name>/model</command-name>"}}"#,
            r#"{"type":"user","message":{"role":"user","content":"<local-command-stdout>Set model to opus</local-command-stdout>"}}"#,
            r#"{"type":"user","isCompactSummary":true,"message":{"role":"user","content":"This session is being continued from a previous conversation that ran out of context."}}"#,
            r#"{"type":"user","message":{"role":"user","content":"This session is being continued from a previous conversation that ran out of context."}}"#,
            r#"{"type":"user","message":{"role":"user","content":"You have 1 orchestration message waiting."}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":"ok"}]}}"#,
        ].join("\n");
        assert_eq!(task_line(&tail), "“tidy the card text”");
    }

    #[test]
    fn title_is_newest_ai_title() {
        let tail = [
            r#"{"type":"ai-title","aiTitle":"Revue du projet","sessionId":"s"}"#,
            r#"{"type":"user","message":{"content":"go"}}"#,
            r#"{"type":"ai-title","aiTitle":"Card text from the Magos","sessionId":"s"}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}"#,
        ].join("\n");
        assert_eq!(title_of(&tail).as_deref(), Some("Card text from the Magos"));
        assert_eq!(title_of(r#"{"type":"user","message":{"content":"ai-title"}}"#), None);
    }

    #[test]
    fn pending_ask_is_unanswered_tool_use() {
        let bash = tool("Bash", "toolu_2", r#"{"command":"echo hello > .superpowers/sdd/permtest.txt","description":"Writing hello to a test file"}"#);
        let tail = [
            r#"{"type":"user","message":{"content":"write the test file"}}"#.to_string(),
            tool("Read", "toolu_1", r#"{"file_path":"C:\\x\\README.md"}"#),
            r#"{"type":"user","message":{"content":[{"tool_use_id":"toolu_1","type":"tool_result","content":"..."}]}}"#.to_string(),
            bash.clone(),
        ].join("\n");
        assert_eq!(pending_ask(&tail).as_deref(), Some("Bash: echo hello > .superpowers/sdd/permtest.txt — Writing hello to a test file"));
        let answered = format!("{tail}\n{}", r#"{"type":"user","message":{"content":[{"tool_use_id":"toolu_2","type":"tool_result","content":""}]}}"#);
        assert_eq!(pending_ask(&answered), None, "every call answered");
        let stale = format!("{bash}\n{}", r#"{"type":"user","message":{"content":"next question"}}"#);
        assert_eq!(pending_ask(&stale), None, "a call before the latest prompt is not this petition");
        let edit = tool("Edit", "toolu_3", r#"{"file_path":"C:\\git\\ui\\app.js","old_string":"a","new_string":"b"}"#);
        assert_eq!(pending_ask(&edit).as_deref(), Some(r"Edit: C:\git\ui\app.js"));
        let long = tool("Bash", "toolu_4", &format!(r#"{{"command":"{}"}}"#, "y".repeat(300)));
        assert_eq!(pending_ask(&long).unwrap().chars().count(), 140);
    }

    #[test]
    fn scan_sets_title_always_and_asks_only_while_waiting() {
        let d = temp_dir("scan-asks");
        fs::write(d.join("10.json"), record(10, "a", "terra-a", "waiting")).unwrap();
        fs::write(d.join("11.json"), record(11, "b", "terra-b", "busy")).unwrap();
        let t = [r#"{"type":"ai-title","aiTitle":"Fix the card"}"#.to_string(), tool("Bash", "x", r#"{"command":"ls","description":"List files"}"#)].join("\n");
        let out = scan(&d, |_, _| true, |_, _| (tail_of(&t), vec![]), |_| None);
        assert_eq!(out.sessions[0].asks.as_deref(), Some("Bash: ls — List files"));
        assert_eq!(out.sessions[0].title.as_deref(), Some("Fix the card"));
        assert_eq!(out.sessions[1].asks, None);
        assert_eq!(out.sessions[1].title.as_deref(), Some("Fix the card"));
    }

    #[test]
    fn context_of_picks_newest_usage_and_sums_fields() {
        let tail = [
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_creation_input_tokens":350,"cache_read_input_tokens":306393,"output_tokens":365}}}"#,
        ].join("\n");
        let c = context_of(&tail).expect("has usage");
        assert_eq!(c.tokens, 2 + 350 + 306393);
        assert_eq!(c.model, "claude-opus-5-5");
    }

    #[test]
    fn context_of_skips_synthetic_and_usageless_lines() {
        let tail = [
            r#"{"type":"user","message":{"content":"hi"}}"#,
            r#"{"type":"assistant","message":{"model":"<synthetic>","usage":{"input_tokens":9}}}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":5,"output_tokens":1}}}"#,
        ].join("\n");
        assert_eq!(context_of(&tail), Some(Context { tokens: 5, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn context_of_missing_fields_treated_as_zero_none_on_empty_or_garbage() {
        assert_eq!(context_of(""), None);
        assert_eq!(context_of("not json\n{"), None);
        let tail = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"output_tokens":1}}}"#;
        assert_eq!(context_of(tail), Some(Context { tokens: 0, model: "claude-opus-5-5".to_string() }));
    }

    use std::{fs, io::Write, path::PathBuf, time::{Duration, SystemTime}};

    fn tail_of(s: &str) -> Option<Tail> {
        read_tail(|_| Some(s.to_string()))
    }

    fn helpers_in(d: &Path, now: SystemTime, completed: &HashMap<String, i64>) -> Vec<Helper> {
        active_helpers(&list_subagents(d), now.duration_since(UNIX_EPOCH).unwrap().as_millis() as i64, completed, read_helper)
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn record(pid: u32, id: &str, name: &str, status: &str) -> String {
        format!(r#"{{"pid":{pid},"sessionId":"{id}","cwd":"C:\\git\\Terra","name":"{name}","status":"{status}","waitingFor":"input needed","statusUpdatedAt":{pid}000}}"#)
    }

    fn session(id: &str, pid: u32, status: &str, since: i64) -> Session {
        Session { id: id.into(), pid, name: id.into(), dept: "Terra".into(), cwd: "C:\\git\\Terra".into(), status: status.into(), since_ms: since, task: "—".into(), ..Default::default() }
    }

    #[test]
    fn scan_keeps_live_skips_dead_and_reports_unreadable() {
        let d = temp_dir("scan");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        fs::write(d.join("11.json"), record(11, "b", "terra-a", "waiting")).unwrap();
        fs::write(d.join("12.json"), record(12, "c", "dead", "idle")).unwrap();
        fs::write(d.join("13.json"), r#"{"pid":13,"sess"#).unwrap();
        fs::write(d.join("10.key"), "not a record").unwrap();
        let out = scan(&d, |pid, _| pid != 12, |id, _| ((id == "a").then(|| tail_of(r#"{"type":"user","message":{"content":"hello"}}"#)).flatten(), vec![]), |_| None);
        let names: Vec<_> = out.sessions.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["terra-a", "terra-b"]);
        assert_eq!(out.unreadable_pids, [13]);
        let a = &out.sessions[0];
        assert_eq!(a.dept, "Terra");
        assert_eq!(a.waiting_for.as_deref(), Some("input needed"));
        assert_eq!(a.since_ms, 11000);
        assert_eq!(out.sessions[1].task, "“hello”");
        assert_eq!(out.sessions[1].waiting_for, None, "waitingFor only kept while waiting");
    }

    #[test]
    fn scan_of_missing_dir_is_empty() {
        let out = scan(&std::env::temp_dir().join("adm-does-not-exist"), |_, _| true, |_, _| (None, vec![]), |_| None);
        assert!(out.sessions.is_empty() && out.unreadable_pids.is_empty());
    }

    #[test]
    fn scan_skips_unreadable_pid_if_dead() {
        let d = temp_dir("scan-dead-unreadable");
        fs::write(d.join("13.json"), r#"{"pid":13,"sess"#).unwrap();
        let out = scan(&d, |pid, _| pid != 13, |_, _| (None, vec![]), |_| None);
        assert!(out.unreadable_pids.is_empty(), "dead pid's malformed file is not carried forward");
    }

    #[test]
    fn transcript_direct_slug_path() {
        let cwd = r"C:\Users\guill\Documents\git\Administratum";
        assert_eq!(direct_transcript(Path::new("p"), "abc", cwd), Path::new("p").join("C--Users-guill-Documents-git-Administratum").join("abc.jsonl"));
    }

    #[test]
    fn transcript_found_in_any_project_and_tail_cut_to_whole_lines() {
        let d = temp_dir("projects");
        fs::create_dir_all(d.join("C--git-Terra")).unwrap();
        let line = r#"{"type":"user","message":{"content":"x"}}"#;
        let big = std::iter::repeat(line).take(3000).collect::<Vec<_>>().join("\n");
        fs::write(d.join("C--git-Terra").join("abc.jsonl"), &big).unwrap();
        let path = find_transcript(&d, "abc").expect("found via fallback scan");
        let tail = file_tail(&path, 65536).unwrap();
        assert!(tail.len() <= 65536);
        assert!(tail.lines().all(|l| l == line), "first partial line dropped");
        assert!(find_transcript(&d, "nope").is_none());
    }

    #[test]
    fn read_tail_retries_with_bigger_tail_when_newest_line_overflows() {
        // The 64 KB tail holds no whole line (task_line -> "—"); a bigger tail would.
        let tail = read_tail(|n| if n == TAIL_BYTES { Some("x".repeat(70_000)) } else { Some(r#"{"type":"user","message":{"content":"hi"}}"#.to_string()) });
        assert_eq!(tail.unwrap().task, "“hi”");
        assert_eq!(read_tail(|_| None), None, "no transcript");
    }

    #[test]
    fn scan_fills_session_context_from_the_same_tail() {
        let d = temp_dir("scan-context");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        let tail = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}"#;
        let out = scan(&d, |_, _| true, |_, _| (tail_of(tail), vec![]), |_| None);
        assert_eq!(out.sessions[0].context, Some(Context { tokens: 5, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn session_serializes_context_as_camel_case() {
        let s = Session { context: Some(Context { tokens: 42, model: "claude-opus-5-5".into() }), ..session("a", 1, "idle", 0) };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["context"]["tokens"], 42);
        assert_eq!(json["context"]["model"], "claude-opus-5-5");
    }

    #[test]
    fn merge_keeps_previous_state_for_unreadable_file() {
        let prev = vec![session("x", 13, "busy", 1)];
        let merged = merge(&prev, Scan { sessions: vec![session("y", 10, "idle", 2)], unreadable_pids: vec![13, 99] });
        let ids: Vec<_> = merged.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["x", "y"]);
    }

    #[test]
    fn active_helpers_keeps_fresh_skips_stale_reads_meta() {
        let d = temp_dir("helpers-fresh-stale");
        fs::write(d.join("agent-fresh1.jsonl"), "{}").unwrap();
        fs::write(
            d.join("agent-fresh1.meta.json"),
            r#"{"agentType":"general-purpose","description":"HD phase 2a: redraw sprites","toolUseId":"toolu_x","spawnDepth":1,"requestShape":"background","requestNonInteractive":true,"model":"opus"}"#,
        ).unwrap();
        fs::write(d.join("agent-stale1.jsonl"), "{}").unwrap();
        let now = SystemTime::now();
        // No completion either: a 2 min write gap is well inside a long cargo build, still active.
        fs::OpenOptions::new().write(true).open(d.join("agent-stale1.jsonl")).unwrap().set_modified(now - Duration::from_secs(120)).unwrap();

        let out = helpers_in(&d, now, &HashMap::new());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].id, "fresh1");
        assert_eq!(out[0].kind, "general-purpose");
        assert_eq!(out[0].task, "HD phase 2a: redraw sprites");
        assert_eq!(out[0].model.as_deref(), Some("opus"));
    }

    #[test]
    fn active_helpers_missing_or_invalid_meta_yields_defaults() {
        let d = temp_dir("helpers-no-meta");
        fs::write(d.join("agent-bare.jsonl"), "{}").unwrap();
        fs::write(d.join("agent-broken.jsonl"), "{}").unwrap();
        fs::write(d.join("agent-broken.meta.json"), "not json").unwrap();

        let out = helpers_in(&d, SystemTime::now(), &HashMap::new());
        let ids: Vec<_> = out.iter().map(|h| h.id.as_str()).collect();
        assert_eq!(ids, ["bare", "broken"]);
        for h in &out {
            assert_eq!(h.kind, "agent");
            assert_eq!(h.task, "");
            assert_eq!(h.model, None);
            assert_eq!(h.context, None, "empty transcript has no usage line");
        }
    }

    #[test]
    fn active_helpers_reads_context_from_its_own_transcript_tail() {
        let d = temp_dir("helpers-context");
        let tail = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":1,"cache_creation_input_tokens":2,"cache_read_input_tokens":3}}}"#;
        fs::write(d.join("agent-c1.jsonl"), tail).unwrap();
        let out = helpers_in(&d, SystemTime::now(), &HashMap::new());
        assert_eq!(out[0].context, Some(Context { tokens: 6, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn active_helpers_of_missing_dir_is_empty() {
        let out = helpers_in(&std::env::temp_dir().join("adm-helpers-does-not-exist"), SystemTime::now(), &HashMap::new());
        assert!(out.is_empty());
    }

    fn write_with_age(path: &std::path::PathBuf, age_secs: u64, now: SystemTime) {
        fs::write(path, "{}").unwrap();
        fs::OpenOptions::new().write(true).open(path).unwrap().set_modified(now - Duration::from_secs(age_secs)).unwrap();
    }

    fn ms_ago(now: SystemTime, secs: u64) -> i64 {
        (now - Duration::from_secs(secs)).duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
    }

    #[test]
    fn active_helpers_long_running_command_stays_active_with_no_completion() {
        // A 2-minute cargo build writes nothing meanwhile; under the old 45s rule it would vanish.
        let d = temp_dir("helpers-long-running");
        let now = SystemTime::now();
        write_with_age(&d.join("agent-build.jsonl"), 180, now);
        let out = helpers_in(&d, now, &HashMap::new());
        assert_eq!(out.len(), 1, "still active: no completion seen, well under the 10 min cap");
    }

    #[test]
    fn active_helpers_inactive_once_its_completion_line_is_seen() {
        let d = temp_dir("helpers-completed");
        let now = SystemTime::now();
        write_with_age(&d.join("agent-done.jsonl"), 60, now);
        let completed = HashMap::from([("done".to_string(), ms_ago(now, 10))]); // completed after the last write
        assert!(helpers_in(&d, now, &completed).is_empty());
    }

    #[test]
    fn active_helpers_active_again_once_written_after_its_completion() {
        let d = temp_dir("helpers-resumed");
        let now = SystemTime::now();
        write_with_age(&d.join("agent-resumed.jsonl"), 10, now); // last write is AFTER the completion below
        let completed = HashMap::from([("resumed".to_string(), ms_ago(now, 60))]);
        assert_eq!(helpers_in(&d, now, &completed).len(), 1, "a later write means it was resumed");
        // Real case: the final flush lands ~150 ms after the completion notification.
        let flushed = HashMap::from([("resumed".to_string(), ms_ago(now, 10) - 150)]);
        assert!(helpers_in(&d, now, &flushed).is_empty(), "a flush right after completion is not a resume");
    }

    #[test]
    fn active_helpers_inactive_past_the_safety_cap_with_no_completion() {
        let d = temp_dir("helpers-cap");
        let now = SystemTime::now();
        write_with_age(&d.join("agent-orphan.jsonl"), 601, now);
        assert!(helpers_in(&d, now, &HashMap::new()).is_empty(), "10 minutes of silence and no completion: give up on it");
    }

    #[test]
    fn parse_completions_reads_task_notification_lines() {
        // Shape of a real queue-operation line Claude Code appends to the parent transcript.
        let line = r#"{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-05T18:37:26.560Z","sessionId":"s1","content":"<task-notification>\n<task-id>a2b38a7028506bf3e</task-id>\n<tool-use-id>toolu_015q</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>"}"#;
        let out = parse_completions(line);
        assert_eq!(out, [("a2b38a7028506bf3e".to_string(), iso_utc_ms("2026-10-05T18:37:26.560Z").unwrap())]);
        assert!(parse_completions("not json\n{").is_empty());
        let in_progress = line.replace("completed", "in_progress");
        assert!(parse_completions(&in_progress).is_empty(), "only a completed status counts");
    }

    #[test]
    fn completions_scan_is_incremental_and_merges_across_polls() {
        let d = temp_dir("completions-scan");
        let p = d.join("parent.jsonl");
        let line = |id: &str, ts: &str| format!(r#"{{"type":"queue-operation","timestamp":"{ts}","content":"<task-notification>\n<task-id>{id}</task-id>\n<status>completed</status>\n</task-notification>"}}"#);
        fs::write(&p, format!("{}\n", line("old", "2026-10-05T17:00:00.000Z"))).unwrap(); // already there before tracking starts
        let mut c = Completions::default();
        assert_eq!(c.scan("s1", &stat(&p).unwrap()).len(), 1, "first sight looks back: a subagent that finished just before startup counts");
        fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(format!("{}\n", line("a1", "2026-10-05T18:00:00.000Z")).as_bytes()).unwrap();
        assert_eq!(c.scan("s1", &stat(&p).unwrap()).len(), 2);
        fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(format!("{}\n", line("a2", "2026-10-05T18:05:00.000Z")).as_bytes()).unwrap();
        let after = c.scan("s1", &stat(&p).unwrap());
        assert_eq!(after.len(), 3, "merged with the earlier poll's result, not replaced");
        assert!(c.scan("s2", &stat(&p).unwrap()).is_empty(), "offset is per path, not per session: s1 already consumed the file, so s2's own map stays empty");
    }

    const REAL_SHELL_TAIL: &str = concat!(
        r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"go"}}]}}"#, "\n",
        r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"done"}]}}"#, "\n",
        r#"{"type":"assistant","message":{"content":[{"type":"text","text":"all set"}]}}"#, "\n",
        r#"{"type":"system","subtype":"stop_hook_summary","hookCount":2}"#, "\n",
        r#"{"type":"system","subtype":"turn_duration","durationMs":19925}"#, "\n",
        r#"{"type":"last-prompt","lastPrompt":"go quand tu les as"}"#, "\n",
        r#"{"type":"ai-title","aiTitle":"Public APIs repo integration"}"#, "\n",
        r#"{"type":"mode","mode":"normal"}"#, "\n",
        r#"{"type":"permission-mode","permissionMode":"bypassPermissions"}"#, "\n",
        r#"{"type":"bridge-session","bridgeSessionId":"cse_018oaCXrud1SYhmpzjVcGZDY"}"#, "\n",
        r#"{"type":"system","subtype":"away_summary","content":"on nettoie GyroidVault"}"#,
    );

    #[test]
    fn turn_done_true_on_real_shaped_tail_with_trailing_noise() {
        assert!(turn_done(REAL_SHELL_TAIL), "turn_duration precedes trailing away_summary noise");
    }

    #[test]
    fn turn_done_false_when_tail_ends_in_pending_tool_use() {
        let tail = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"go"}}]}}"#;
        assert!(!turn_done(tail));
        assert!(!turn_done(""), "unknown -> false");
    }

    /// A finished turn whose closing assistant entries say `texts` (one text block each, as Claude Code writes them).
    fn turn_ending(texts: &[&str]) -> String {
        let mut lines = vec![
            r#"{"type":"user","message":{"role":"user","content":"rename the playlists"}}"#.to_string(),
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"rooms.md"}}]}}"#.to_string(),
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"..."}]}}"#.to_string(),
        ];
        for t in texts {
            lines.push(serde_json::json!({"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":t}]}}).to_string());
        }
        lines.push(r#"{"type":"system","subtype":"stop_hook_summary","hookCount":1}"#.into());
        lines.push(r#"{"type":"system","subtype":"turn_duration","durationMs":8123}"#.into());
        lines.push(r#"{"type":"last-prompt","lastPrompt":"rename the playlists"}"#.into());
        lines.join("\n")
    }

    #[test]
    fn question_at_the_end_of_a_turn() {
        let tail = turn_ending(&["I read rooms.md: 6 rooms, 4 playlists.\n\nShould I rename the playlists to match the rooms, or keep the old names?"]);
        assert_eq!(ends_with_question(&tail).as_deref(), Some("Should I rename the playlists to match the rooms, or keep the old names?"));
        let fw = turn_ending(&["プレイリストの名前を変えますか？"]);
        assert_eq!(ends_with_question(&fw).as_deref(), Some("プレイリストの名前を変えますか？"), "full-width mark");
    }

    #[test]
    fn question_only_inside_code_is_none() {
        let tail = turn_ending(&["Done. The regex is now:\n\n```\n^a?b$\n```\n\nIt matches `ab?` too and see https://x.io/a?b=1 for details."]);
        assert_eq!(ends_with_question(&tail), None);
        let fenced_last = turn_ending(&["Added the check:\n\n```rust\nlet x = y?;\n```"]);
        assert_eq!(ends_with_question(&fenced_last), None, "the last paragraph is code");
    }

    #[test]
    fn question_earlier_but_closing_statement_is_none() {
        let tail = turn_ending(&["Why did it fail? The path was wrong.\n\nFixed and committed."]);
        assert_eq!(ends_with_question(&tail), None);
    }

    #[test]
    fn question_uses_newest_text_entry_and_skips_tool_use_only_entries() {
        let mut tail = turn_ending(&["Earlier: want me to push?", "Pushed. All green."]);
        assert_eq!(ends_with_question(&tail), None, "newest text entry wins");
        tail = turn_ending(&["Want me to open the PR too?"]);
        let tool_only = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t","name":"TodoWrite","input":{}}]}}"#;
        let tail = tail.replacen(r#"{"type":"system","subtype":"stop_hook_summary""#, &format!("{tool_only}\n{{\"type\":\"system\",\"subtype\":\"stop_hook_summary\""), 1);
        assert_eq!(ends_with_question(&tail).as_deref(), Some("Want me to open the PR too?"));
    }

    #[test]
    fn question_none_while_the_turn_runs_or_without_text() {
        let running = turn_ending(&["Shall I go on?"]).lines().take(4).collect::<Vec<_>>().join("\n");
        assert_eq!(ends_with_question(&running), None, "no turn_duration yet");
        assert_eq!(ends_with_question(""), None);
        let long = format!("{}?", "x".repeat(300));
        assert_eq!(ends_with_question(&turn_ending(&[&long])).map(|q| q.chars().count()), Some(200), "clipped");
    }

    #[test]
    fn scan_sets_question_only_for_a_foreground_idle_session() {
        let d = temp_dir("scan-question");
        fs::write(d.join("10.json"), record(10, "a", "idle-one", "idle")).unwrap();
        fs::write(d.join("11.json"), record(11, "b", "shell-one", "shell")).unwrap();
        fs::write(d.join("12.json"), record(12, "c", "busy-one", "busy")).unwrap();
        let tail = turn_ending(&["Keep the old names?"]);
        let out = scan(&d, |_, _| true, |_, _| (tail_of(&tail), vec![]), |_| None);
        let q: Vec<_> = out.sessions.iter().map(|s| (s.name.as_str(), s.question.is_some())).collect();
        assert_eq!(q, [("busy-one", false), ("idle-one", true), ("shell-one", false)]);
        assert_eq!(serde_json::to_value(&out.sessions[1]).unwrap()["question"], "Keep the old names?");
    }

    #[test]
    fn tracker_asks_once_per_question_episode() {
        let mut t = Tracker::default();
        let q = |since| Session { question: Some("ok?".into()), ..session("a", 1, "idle", since) };
        assert_eq!(t.new_questions(&[q(100)]).len(), 1);
        assert_eq!(t.new_questions(&[q(100)]).len(), 0, "same episode");
        assert_eq!(t.new_questions(&[session("a", 1, "busy", 200)]).len(), 0);
        assert_eq!(t.new_questions(&[q(300)]).len(), 1, "new episode");
        assert!(t.new_petitions(&[q(300)]).is_empty(), "a question is not a petition");
    }

    #[test]
    fn scan_turns_finished_shell_into_idle_background() {
        let d = temp_dir("scan-shell-background");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "shell")).unwrap();
        let out = scan(&d, |_, _| true, |_, _| (tail_of(REAL_SHELL_TAIL), vec![]), |_| None);
        assert_eq!(out.sessions[0].status, "idle");
        assert!(out.sessions[0].background);
    }

    #[test]
    fn scan_fills_orca_handle_and_web_url() {
        let d = temp_dir("scan-orca-web");
        fs::write(
            d.join("10.json"),
            r#"{"pid":10,"sessionId":"a","cwd":"C:\\git\\Terra","status":"idle","bridgeSessionId":"session_01abc"}"#,
        ).unwrap();
        let out = scan(&d, |_, _| true, |_, _| (None, vec![]), |pid| (pid == 10).then(|| "term_abc-123".to_string()));
        assert_eq!(out.sessions[0].orca.as_deref(), Some("term_abc-123"));
        assert_eq!(out.sessions[0].web.as_deref(), Some("https://claude.ai/code/session_01abc"));
    }

    #[test]
    fn orca_handle_validator() {
        assert!(valid_orca_handle("term_52bf64c5-bacc-4925-bec7-04935a104ae1"));
        assert!(!valid_orca_handle("term_"));
        assert!(!valid_orca_handle("not_a_handle"));
        assert!(!valid_orca_handle("term_abc; rm -rf /"));
    }

    #[test]
    fn claude_web_url_validator() {
        assert!(valid_claude_web_url("https://claude.ai/code/session_01abc"));
        assert!(!valid_claude_web_url("https://claude.ai/code/"));
        assert!(!valid_claude_web_url("https://evil.example.com/code/x"));
        assert!(!valid_claude_web_url("javascript:alert(1)"));
        assert!(!valid_claude_web_url("https://claude.ai/code/x&calc"));
        assert!(!valid_claude_web_url("https://claude.ai/code/x|whoami"));
    }

    // Claude Code permission dialogs as `orca terminal read --screen` renders them (trailing spaces trimmed).
    const BASH_PROMPT: &str = "● Bash(cargo test)\n\
  ⎿  Running…\n\
\n\
────────────────────────────────────────────────────────────────────\n\
 Bash command\n\
\n\
   cargo test --manifest-path src-tauri/Cargo.toml\n\
   Run the Rust tests\n\
\n\
 Do you want to proceed?\n\
 ❯ 1. Yes\n\
   2. Yes, and don't ask again for cargo test commands in\n\
   C:\\Users\\guill\\Documents\\git\\Administratum\n\
   3. No, and tell Claude what to do differently (esc)\n\
\n";

    const EDIT_PROMPT: &str = "────────────────────────────────────────────────\n\
 Edit file\n\
╭──────────────────────────────────────────────╮\n\
│ ui/app.js                                    │\n\
│  12 - const a = 1;                           │\n\
│  12 + const a = 2;                           │\n\
╰──────────────────────────────────────────────╯\n\
 Do you want to make this edit to app.js?\n\
 ❯ 1. Yes\n\
   2. Yes, allow all edits during this session (shift+tab)\n\
   3. No, and tell Claude what to do differently (esc)\n\
\n\
 Esc to cancel";

    const WRITE_PROMPT: &str = "│ Create file                              │\n\
│ notes.md                                 │\n\
│ Do you want to create notes.md?          │\n\
│ ❯ 1. Yes                                 │\n\
│   2. No, and tell Claude what to do differently (esc) │\n\
╰──────────────────────────────────────────╯";

    const NO_PROMPT: &str = "● Done.\n\
✻ Churned for 23s\n\
────────────────────────────────────────\n\
❯\n\
────────────────────────────────────────\n\
  ⏵⏵ auto mode on (shift+tab to cycle)";

    #[test]
    fn prompt_bash_maps_yes_always_no() {
        let p = parse_permission_prompt(BASH_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 3));
        assert_eq!(p.question, "Do you want to proceed?");
        assert_eq!(p.options[1], (2, "Yes, and don't ask again for cargo test commands in C:\\Users\\guill\\Documents\\git\\Administratum".into()), "wrapped label joined");
        assert_eq!(p.options[2], (3, "No, and tell Claude what to do differently (esc)".into()));
    }

    #[test]
    fn prompt_edit_inside_box_and_footer() {
        let p = parse_permission_prompt(EDIT_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 3));
        assert_eq!(p.question, "Do you want to make this edit to app.js?");
        assert_eq!(p.options[1].1, "Yes, allow all edits during this session (shift+tab)");
    }

    #[test]
    fn prompt_write_without_always_option() {
        let p = parse_permission_prompt(WRITE_PROMPT).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, None, 2));
        assert_eq!(p.question, "Do you want to create notes.md?");
        assert_eq!(p.options, [(1, "Yes".into()), (2, "No, and tell Claude what to do differently (esc)".into())]);
    }

    #[test]
    fn prompt_absent_is_none() {
        assert_eq!(parse_permission_prompt(NO_PROMPT), None);
        assert_eq!(parse_permission_prompt(""), None);
    }

    #[test]
    fn prompt_in_scrollback_is_none() {
        let screen = format!("{BASH_PROMPT}● Bash(cargo test)\n  ⎿  ok\n{NO_PROMPT}");
        assert_eq!(parse_permission_prompt(&screen), None);
        // A few lines of output under it and the input box frame: still scrollback.
        let screen = format!("{BASH_PROMPT}● ok\n────────");
        assert_eq!(parse_permission_prompt(&screen), None);
    }

    #[test]
    fn prompt_rejects_odd_option_lists() {
        // Must start at 1 with plain "Yes", count up, and offer a "No".
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and don't ask again\n"), None, "no No option");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Sure\n   2. No\n"), None, "no plain Yes");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n ❯ 1. Yes\n   3. No\n"), None, "gap in numbering");
        assert_eq!(parse_permission_prompt(" Do you want to proceed?\n\n\n\n\n ❯ 1. Yes\n   2. No\n"), None, "options too far from question");
    }

    #[test]
    fn prompt_uses_the_last_question_on_screen() {
        // Untrusted text above (e.g. a printed file) mimicking a dialog does not win over the real one below.
        let fake = " Do you want to proceed?\n ❯ 1. Yes\n   2. No\n";
        let screen = format!("{fake}{EDIT_PROMPT}");
        assert_eq!(parse_permission_prompt(&screen), parse_permission_prompt(EDIT_PROMPT));
    }

    #[test]
    fn stale_petition_fires_once_after_five_minutes_per_episode() {
        let mut t = Tracker::default();
        let w = |since| [session("a", 1, "waiting", since)];
        assert!(t.stale_petitions(&w(1_000), 1_000 + 299_000).is_empty(), "not yet");
        assert_eq!(t.stale_petitions(&w(1_000), 1_000 + 301_000).len(), 1, "crossed 5 min");
        assert!(t.stale_petitions(&w(1_000), 1_000 + 900_000).is_empty(), "same episode");
        assert!(t.stale_petitions(&[session("a", 1, "busy", 2_000)], 2_000_000).is_empty());
        assert_eq!(t.stale_petitions(&w(3_000), 3_000 + 400_000).len(), 1, "new episode");
        assert!(t.stale_petitions(&w(0), 9_999_999).is_empty(), "unknown since never escalates");
    }

    // Shape of a real Claude Code compaction marker (trimmed), followed by the summary turn.
    const COMPACT_TAIL: &str = concat!(
        r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":900000}}}"#, "\n",
        r#"{"parentUuid":null,"isSidechain":false,"type":"system","subtype":"compact_boundary","content":"Conversation compacted","isMeta":false,"timestamp":"2026-04-10T18:08:48.679Z","level":"info","compactMetadata":{"trigger":"auto","preTokens":178595}}"#, "\n",
        r#"{"type":"user","message":{"role":"user","content":"This session is being continued from a previous conversation"}}"#,
    );

    #[test]
    fn compacted_at_reads_newest_boundary_timestamp_as_ms() {
        assert_eq!(compacted_at(COMPACT_TAIL), Some(1775844528679));
        let two = format!("{COMPACT_TAIL}\n{}", COMPACT_TAIL.replace("2026-04-10T18:08:48.679Z", "2026-04-10T19:00:00Z"));
        assert_eq!(compacted_at(&two), Some(1775847600000), "newest wins, fraction optional");
        assert_eq!(compacted_at(REAL_SHELL_TAIL), None);
        assert_eq!(compacted_at(r#"{"type":"user","message":{"content":"compact_boundary"}}"#), None, "only the system marker counts");
        assert_eq!(compacted_at(r#"{"type":"system","subtype":"compact_boundary","timestamp":"garbage"}"#), None);
    }

    #[test]
    fn scan_fills_compacted_at_from_the_tail() {
        let d = temp_dir("scan-compact");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        let out = scan(&d, |_, _| true, |_, _| (tail_of(COMPACT_TAIL), vec![]), |_| None);
        assert_eq!(out.sessions[0].compacted_at, Some(1775844528679));
    }

    fn with_ctx(id: &str, tokens: u64, compacted_at: Option<i64>) -> Session {
        Session { context: Some(Context { tokens, model: "m".into() }), compacted_at, ..session(id, 1, "busy", 0) }
    }

    #[test]
    fn track_compaction_carries_marker_and_falls_back_to_a_token_drop() {
        // the marker scrolled out of the tail: keep the last one seen
        let mut r = vec![with_ctx("a", 500_000, None)];
        track_compaction(&[with_ctx("a", 500_000, Some(7))], &mut r, 1_000_000);
        assert_eq!(r[0].compacted_at, Some(7));
        // no marker, context fell by more than 40%: stamp now
        let mut r = vec![with_ctx("a", 200_000, None)];
        track_compaction(&[with_ctx("a", 500_000, None)], &mut r, 1_000_000);
        assert_eq!(r[0].compacted_at, Some(1_000_000));
        // a 30% drop is just noise
        let mut r = vec![with_ctx("a", 350_000, None)];
        track_compaction(&[with_ctx("a", 500_000, None)], &mut r, 1_000_000);
        assert_eq!(r[0].compacted_at, None);
        // a fresh marker wins over the drop (no second stamp)
        let mut r = vec![with_ctx("a", 50_000, Some(990_000))];
        track_compaction(&[with_ctx("a", 500_000, Some(7))], &mut r, 1_000_000);
        assert_eq!(r[0].compacted_at, Some(990_000));
        // marker seen first, the drop lands a few polls later: same compaction, not a new one
        let mut r = vec![with_ctx("a", 50_000, Some(990_000))];
        track_compaction(&[with_ctx("a", 500_000, Some(990_000))], &mut r, 1_000_000);
        assert_eq!(r[0].compacted_at, Some(990_000));
    }

    #[test]
    fn session_serializes_compacted_at_as_camel_case() {
        let json = serde_json::to_value(with_ctx("a", 1, Some(5))).unwrap();
        assert_eq!(json["compactedAt"], 5);
    }

    #[test]
    fn tracker_fires_once_per_episode_and_again_on_a_new_one() {
        let mut t = Tracker::default();
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 1);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 0, "same episode");
        assert_eq!(t.new_petitions(&[session("a", 1, "busy", 200)]).len(), 0);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 300)]).len(), 1, "new episode");
    }

    #[test]
    fn usage_limit_lines() {
        use chrono::{Local, TimeZone};
        let at = |h, m| Local.with_ymd_and_hms(2026, 10, 6, h, m, 0).unwrap().timestamp_millis();
        let iso = |ms: i64| chrono::DateTime::from_timestamp_millis(ms).unwrap().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let limit = |text: &str, ms: i64| format!(r#"{{"type":"assistant","timestamp":"{}","message":{{"model":"<synthetic>","content":[{{"type":"text","text":"{text}"}}]}},"error":"rate_limit","isApiErrorMessage":true}}"#, iso(ms));
        let prompt = r#"{"type":"user","message":{"content":"go on"}}"#;
        let result = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"x","content":"ok"}]}}"#;
        let answer = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":"done"}]}}"#;

        let l = limit_of(&limit("You've hit your limit · resets 2pm (Europe/Paris)", at(10, 0))).unwrap();
        assert_eq!(l.reset_ms, Some(at(14, 0)));
        assert_eq!(l.text, "You've hit your limit · resets 2pm (Europe/Paris)");
        assert!(limit_of(&format!("{}\n{result}", limit("resets 2pm", at(10, 0)))).is_some(), "a tool result after it: still limited");
        assert_eq!(limit_of(&format!("{}\n{prompt}", limit("resets 2pm", at(10, 0)))), None, "a prompt after it: lifted");
        assert_eq!(limit_of(&format!("{}\n{answer}", limit("resets 2pm", at(10, 0)))), None, "a normal answer after it");
        assert_eq!(limit_of(answer), None);

        assert_eq!(reset_after("resets 2:30pm (UTC)", at(10, 0)), Some(at(14, 30)));
        assert_eq!(reset_after("resets 12am", at(10, 0)), Some(at(0, 0) + 86_400_000), "midnight: the next day");
        assert_eq!(reset_after("resets 9am", at(10, 0)), Some(at(9, 0) + 86_400_000), "already past today: tomorrow");
        assert_eq!(reset_after("resets 12pm", at(10, 0)), Some(at(12, 0)));
        assert_eq!(reset_after("resets Oct 8, 2pm", at(10, 0)), None, "a date: no countdown");
        assert_eq!(reset_after("no reset here", at(10, 0)), None);
    }

    #[test]
    fn limit_waves_toast_once() {
        let lim = |id: &str, reset: Option<i64>| Session { limit: Some(Limit { reset_ms: reset, text: "x".into() }), ..session(id, 1, "idle", 0) };
        let mut t = Tracker::default();
        let first = t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), session("c", 3, "busy", 0)]);
        assert_eq!(first.len(), 1, "one wave");
        assert_eq!(first[0].iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert!(t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), lim("c", Some(5))]).is_empty(), "joining a toasted wave: no toast");
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "a new reset time: a new wave");
        assert!(t.new_limits(&[]).is_empty());
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "after it ended, the same reset is new again");
    }

    #[test]
    fn permission_prompt_real_bash_screen_2_1_283() {
        // Captured from a live Claude Code v2.1.283 Bash prompt (4 options, auto-mode upsell).
        let screen = "❯ Run this exact Bash command\n  ⎿  $ echo hello > x.txt\n────────────\n Bash command\n Tip: auto mode handles these prompts for you\n   echo hello > x.txt\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and always allow access to C:\\x from this project\n   3. Yes, and switch to auto mode · auto mode handles these prompts for you\n   4. No\n Esc to cancel · Tab to amend\n";
        let p = parse_permission_prompt(screen).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 4));
        assert_eq!(p.question, "Do you want to proceed?");
        assert_eq!(p.options[1].1, "Yes, and always allow access to C:\\x from this project");
        assert!(p.options[2].1.starts_with("Yes, and switch to auto mode"));
        assert_eq!(p.options[3], (4, "No".into()));
        let auto_only = " Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and switch to auto mode\n   3. No\n";
        assert_eq!(parse_permission_prompt(auto_only).expect("prompt").always, None, "auto mode is never 'always'");
    }
}
