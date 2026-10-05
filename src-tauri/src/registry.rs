use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path, time::SystemTime};

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
}

#[derive(Serialize, Clone, Debug, PartialEq)]
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
    pub helpers: Vec<Helper>,
    pub context: Option<Context>,
    pub orca: Option<String>,
    pub web: Option<String>,
    pub background: bool,
    /// Ms timestamp of the newest context compaction seen (see `compacted_at`, `track_compaction`).
    pub compacted_at: Option<i64>,
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
struct HelperMeta {
    agent_type: Option<String>,
    description: Option<String>,
    model: Option<String>,
}

const HELPER_ACTIVE_SECS: u64 = 45;

/// Active subagents for one session: every `agent-<id>.jsonl` in `dir` whose transcript was
/// modified less than `HELPER_ACTIVE_SECS` ago, newest-activity-irrelevant — sorted by id for
/// stable output. A missing/unparseable sidecar `.meta.json` still yields a helper with defaults.
pub fn active_helpers(dir: &Path, now: SystemTime) -> Vec<Helper> {
    let Ok(entries) = fs::read_dir(dir) else { return vec![] };
    let mut out = vec![];
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        if path.extension().and_then(|x| x.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(id) = stem.strip_prefix("agent-") else { continue };
        let Ok(meta) = entry.metadata() else { continue };
        let Ok(modified) = meta.modified() else { continue };
        let age = now.duration_since(modified).unwrap_or_default();
        if age.as_secs() >= HELPER_ACTIVE_SECS {
            continue;
        }
        let meta: HelperMeta = fs::read_to_string(dir.join(format!("agent-{id}.meta.json")))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        let context = file_tail(&path, TAIL_BYTES).and_then(|t| context_of(&t));
        out.push(Helper {
            id: id.to_string(),
            kind: meta.agent_type.unwrap_or_else(|| "agent".to_string()),
            task: meta.description.map(|d| clip(&d)).unwrap_or_default(),
            model: meta.model,
            context,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
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
    if s.chars().count() <= 60 {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(59).collect::<String>())
    }
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
                    let input = &tool["input"];
                    let detail = ["file_path", "command", "pattern", "url", "query", "description"]
                        .iter()
                        .find_map(|k| input[*k].as_str())
                        .unwrap_or("");
                    let name = tool["name"].as_str().unwrap_or("tool");
                    return clip(&if detail.is_empty() { name.to_string() } else { format!("{name} · {detail}") });
                }
            }
            Some("user") => {
                let text = content.as_str().map(str::to_string).or_else(|| {
                    content
                        .as_array()
                        .and_then(|a| a.iter().find(|b| b["type"] == "text"))
                        .and_then(|b| b["text"].as_str())
                        .map(str::to_string)
                });
                if let Some(t) = text {
                    let t = t.trim();
                    if !t.is_empty() && !t.starts_with('<') {
                        return clip(&format!("“{}”", t.lines().next().unwrap_or(t)));
                    }
                }
            }
            _ => {}
        }
    }
    "—".to_string()
}

pub struct Scan {
    pub sessions: Vec<Session>,
    pub unreadable_pids: Vec<u32>,
}

/// One pass over `~/.claude/sessions`. A file that fails to parse is reported by the pid in its
/// name (only if that pid is still alive) so the caller can keep that session's last known state
/// (Claude Code may be mid-write) without resurrecting a session whose process already died.
pub fn scan(
    dir: &Path,
    alive: impl Fn(u32) -> bool,
    transcript: impl Fn(&str, &str, u64) -> Option<String>,
    helpers: impl Fn(&str, &str) -> Vec<Helper>,
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
                if alive(pid) {
                    out.unreadable_pids.push(pid);
                }
            }
            continue;
        };
        if !alive(rec.pid) {
            continue;
        }
        let mut status = normalize_status(rec.status.as_deref()).to_string();
        let small_tail = transcript(&rec.session_id, &rec.cwd, TAIL_BYTES);
        let mut task = small_tail.as_deref().map(task_line).unwrap_or_else(|| "—".into());
        let mut context = small_tail.as_deref().and_then(context_of);
        let mut tail_for_background = small_tail.clone();
        if small_tail.is_some() && (task == "—" || context.is_none()) {
            // The newest line didn't fit in the small tail; retry once with a bigger one
            // (no transcript at all: a bigger tail won't find one either, skip the second lookup).
            if let Some(bigger) = transcript(&rec.session_id, &rec.cwd, BIG_TAIL_BYTES) {
                if task == "—" {
                    task = task_line(&bigger);
                }
                if context.is_none() {
                    context = context_of(&bigger);
                }
                tail_for_background = Some(bigger);
            }
        }
        let background = status == "shell" && tail_for_background.as_deref().is_some_and(turn_done);
        let compacted = tail_for_background.as_deref().and_then(compacted_at);
        if background {
            status = "idle".to_string();
        }
        let helper_list = helpers(&rec.session_id, &rec.cwd);
        let orca = orca_handle(rec.pid);
        let web = rec.bridge_session_id.map(|id| format!("https://claude.ai/code/{id}"));
        out.sessions.push(Session {
            task,
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

/// Last `tail_bytes` of `<projects>/<slug(cwd)>/<session_id>.jsonl`, cut to whole lines. Tries
/// the direct slug path first (one stat, no directory scan); falls back to scanning every
/// project folder only if that misses (e.g. cwd changed since the session started).
pub fn read_transcript_tail(projects: &Path, session_id: &str, cwd: &str, tail_bytes: u64) -> Option<String> {
    let file = format!("{session_id}.jsonl");
    let direct = projects.join(slug(cwd)).join(&file);
    let path = if direct.is_file() {
        direct
    } else {
        fs::read_dir(projects).ok()?.flatten().map(|e| e.path().join(&file)).find(|p| p.is_file())?
    };
    file_tail(&path, tail_bytes)
}

/// Last `tail_bytes` of `path`, cut to whole lines (the first partial line is dropped).
fn file_tail(path: &Path, tail_bytes: u64) -> Option<String> {
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
}

pub const STALE_MS: i64 = 5 * 60 * 1000;

/// Option numbers of a Claude Code permission dialog: plain "Yes", the first "Yes, ..." (don't ask
/// again / allow all edits) if offered, and the "No" option.
#[derive(Debug, PartialEq)]
pub struct Prompt {
    pub yes: u8,
    pub always: Option<u8>,
    pub no: u8,
}

/// The permission dialog at the bottom of a rendered terminal screen, if that's what it shows.
/// The screen is untrusted: only option numbers come out of it, and only when the last "Do you
/// want" line is followed (within 3 lines) by options numbered 1, 2, ... starting with a plain
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
            None => {} // a wrapped option label
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
    Some(Prompt { yes, always: find(&|l| l.starts_with("Yes,")), no: find(&|l| l.starts_with("No"))? })
}

/// A plain idle session for other modules' tests.
#[cfg(test)]
pub fn tests_session(id: &str) -> Session {
    Session { id: id.into(), pid: 1, name: id.into(), dept: "Terra".into(), cwd: r"C:\git\Terra".into(), status: "idle".into(), waiting_for: None,
              since_ms: 0, task: "—".into(), helpers: vec![], context: None, orca: None, web: None, background: false, compacted_at: None }
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
        assert_eq!(task_line(&tail), "Edit · ui/hololith.html");
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

    use std::{fs, path::PathBuf, time::Duration};

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
        Session { id: id.into(), pid, name: id.into(), dept: "Terra".into(), cwd: "C:\\git\\Terra".into(),
                  status: status.into(), waiting_for: None, since_ms: since, task: "—".into(), helpers: vec![], context: None, orca: None, web: None, background: false, compacted_at: None }
    }

    #[test]
    fn scan_keeps_live_skips_dead_and_reports_unreadable() {
        let d = temp_dir("scan");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        fs::write(d.join("11.json"), record(11, "b", "terra-a", "waiting")).unwrap();
        fs::write(d.join("12.json"), record(12, "c", "dead", "idle")).unwrap();
        fs::write(d.join("13.json"), r#"{"pid":13,"sess"#).unwrap();
        fs::write(d.join("10.key"), "not a record").unwrap();
        let out = scan(&d, |pid| pid != 12, |id, _cwd, _tail| (id == "a").then(|| r#"{"type":"user","message":{"content":"hello"}}"#.to_string()), |_, _| vec![], |_| None);
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
        let out = scan(&std::env::temp_dir().join("adm-does-not-exist"), |_| true, |_, _, _| None, |_, _| vec![], |_| None);
        assert!(out.sessions.is_empty() && out.unreadable_pids.is_empty());
    }

    #[test]
    fn scan_skips_unreadable_pid_if_dead() {
        let d = temp_dir("scan-dead-unreadable");
        fs::write(d.join("13.json"), r#"{"pid":13,"sess"#).unwrap();
        let out = scan(&d, |pid| pid != 13, |_, _, _| None, |_, _| vec![], |_| None);
        assert!(out.unreadable_pids.is_empty(), "dead pid's malformed file is not carried forward");
    }

    #[test]
    fn transcript_tail_prefers_direct_slug_path() {
        let d = temp_dir("projects-direct");
        let cwd = r"C:\Users\guill\Documents\git\Administratum";
        fs::create_dir_all(d.join("C--Users-guill-Documents-git-Administratum")).unwrap();
        fs::write(d.join("C--Users-guill-Documents-git-Administratum").join("abc.jsonl"), r#"{"type":"user","message":{"content":"x"}}"#).unwrap();
        let tail = read_transcript_tail(&d, "abc", cwd, 65536).expect("found via direct slug path, no scan needed");
        assert!(tail.contains("\"x\""));
    }

    #[test]
    fn transcript_tail_found_in_any_project_and_cut_to_whole_lines() {
        let d = temp_dir("projects");
        fs::create_dir_all(d.join("C--git-Terra")).unwrap();
        let line = r#"{"type":"user","message":{"content":"x"}}"#;
        let big = std::iter::repeat(line).take(3000).collect::<Vec<_>>().join("\n");
        fs::write(d.join("C--git-Terra").join("abc.jsonl"), &big).unwrap();
        let tail = read_transcript_tail(&d, "abc", "some-other-cwd", 65536).expect("found via fallback scan");
        assert!(tail.len() <= 65536);
        assert!(tail.lines().all(|l| l == line), "first partial line dropped");
        assert!(read_transcript_tail(&d, "nope", "some-other-cwd", 65536).is_none());
    }

    #[test]
    fn scan_retries_with_bigger_tail_when_newest_line_overflows() {
        let d = temp_dir("scan-retry-tail");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        // The 64 KB tail holds no whole line (task_line -> "—"); a bigger tail would.
        let out = scan(&d, |_| true, |_, _, tail| if tail == TAIL_BYTES { Some("x".repeat(70_000)) } else { Some(r#"{"type":"user","message":{"content":"hi"}}"#.to_string()) }, |_, _| vec![], |_| None);
        assert_eq!(out.sessions[0].task, "“hi”");
    }

    #[test]
    fn scan_fills_session_context_from_the_same_tail() {
        let d = temp_dir("scan-context");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        let tail = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}"#;
        let out = scan(&d, |_| true, |_, _, _| Some(tail.to_string()), |_, _| vec![], |_| None);
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
        fs::OpenOptions::new().write(true).open(d.join("agent-stale1.jsonl")).unwrap().set_modified(now - Duration::from_secs(120)).unwrap();

        let out = active_helpers(&d, now);
        assert_eq!(out.len(), 1);
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

        let out = active_helpers(&d, SystemTime::now());
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
        let out = active_helpers(&d, SystemTime::now());
        assert_eq!(out[0].context, Some(Context { tokens: 6, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn active_helpers_of_missing_dir_is_empty() {
        let out = active_helpers(&std::env::temp_dir().join("adm-helpers-does-not-exist"), SystemTime::now());
        assert!(out.is_empty());
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

    #[test]
    fn scan_turns_finished_shell_into_idle_background() {
        let d = temp_dir("scan-shell-background");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "shell")).unwrap();
        let out = scan(&d, |_| true, |_, _, _| Some(REAL_SHELL_TAIL.to_string()), |_, _| vec![], |_| None);
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
        let out = scan(&d, |_| true, |_, _, _| None, |_, _| vec![], |pid| (pid == 10).then(|| "term_abc-123".to_string()));
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
        assert_eq!(parse_permission_prompt(BASH_PROMPT), Some(Prompt { yes: 1, always: Some(2), no: 3 }));
    }

    #[test]
    fn prompt_edit_inside_box_and_footer() {
        assert_eq!(parse_permission_prompt(EDIT_PROMPT), Some(Prompt { yes: 1, always: Some(2), no: 3 }));
    }

    #[test]
    fn prompt_write_without_always_option() {
        assert_eq!(parse_permission_prompt(WRITE_PROMPT), Some(Prompt { yes: 1, always: None, no: 2 }));
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
        assert_eq!(parse_permission_prompt(&screen), Some(Prompt { yes: 1, always: Some(2), no: 3 }));
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
        let out = scan(&d, |_| true, |_, _, _| Some(COMPACT_TAIL.to_string()), |_, _| vec![], |_| None);
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
    fn permission_prompt_real_bash_screen_2_1_283() {
        // Captured from a live Claude Code v2.1.283 Bash prompt (4 options, auto-mode upsell).
        let screen = "❯ Run this exact Bash command\n  ⎿  $ echo hello > x.txt\n────────────\n Bash command\n Tip: auto mode handles these prompts for you\n   echo hello > x.txt\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and always allow access to C:\\x from this project\n   3. Yes, and switch to auto mode · auto mode handles these prompts for you\n   4. No\n Esc to cancel · Tab to amend\n";
        let p = parse_permission_prompt(screen).expect("prompt");
        assert_eq!((p.yes, p.always, p.no), (1, Some(2), 4));
    }
}
