use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

mod files;
mod helpers;
mod prompt;
mod tail;
#[cfg(test)]
mod testutil;
mod tracker;

pub use files::{direct_transcript, file_tail, find_transcript, list_subagents, stat, FileStat};
#[cfg(test)]
pub(crate) use files::slug; // only chronicle.rs's tests reach it from outside
pub use helpers::{active_helpers, read_helper, Completions};
pub(crate) use helpers::helper_meta;
pub use prompt::{parse_permission_prompt, valid_claude_web_url, valid_orca_handle, Prompt};
pub use tail::{read_tail, Tail};
pub(crate) use tail::{clip, iso_utc_ms};
use tail::is_shell_call;
pub use tracker::{Tracker, STALE_MS};

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
    /// The current or last turn (chronicle.rs), filled by the poll loop.
    pub turn: Option<TurnSummary>,
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

/// A session's current (or last) turn, folded from its main transcript by the chronicle (`track_turn`): when its
/// prompt came, the newest assistant line, how many tool calls, the files Edit / Write / MultiEdit / NotebookEdit
/// changed (relative to the cwd when inside it; at most MAX_TURN_FILES, the rest counted in `more_files`).
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnSummary {
    pub started_ms: Option<i64>,
    pub last_ms: Option<i64>,
    pub tools: u32,
    pub files: Vec<String>,
    pub more_files: u32,
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

pub fn parse_record(text: &str) -> Option<RawRecord> {
    serde_json::from_str(text).ok()
}

/// The project a session belongs to: its folder's name, or for a linked git worktree (an Orca workspace) the main
/// repo's name, so `workspaces/Geneseed/verification-law` counts as Geneseed.
pub fn dept_of(cwd: &str) -> String {
    if let Some(name) = crate::git::worktree_repo(Path::new(cwd)).and_then(|r| r.file_name()?.to_str().map(str::to_string)) {
        return name;
    }
    folder_of(cwd)
}

fn folder_of(cwd: &str) -> String {
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

pub struct Scan {
    pub sessions: Vec<Session>,
    pub unreadable_pids: Vec<u32>,
}

/// One pass over `~/.claude/sessions`. A file that fails to parse is reported by the pid in its
/// name (only if that pid is still alive) so the caller can keep that session's last known state
/// (Claude Code may be mid-write) without resurrecting a session whose process already died.
/// `alive(pid, procStart)`; `details(session id, cwd)` gives the transcript tail and active helpers.
pub fn scan(dir: &Path, alive: impl Fn(u32, Option<&str>) -> bool, mut details: impl FnMut(&str, &str) -> (Option<Tail>, Vec<Helper>), mut orca_handle: impl FnMut(u32) -> Option<String>) -> Scan {
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
        // Claude Code 2.1.28x writes "busy" through a shell command too: an unanswered Bash/PowerShell call means "shell".
        if status == "busy" && tail.as_ref().and_then(|t| t.asks.as_deref()).is_some_and(is_shell_call) {
            status = "shell".to_string();
        }
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
            name: rec.name.clone().unwrap_or_else(|| folder_of(&rec.cwd)),
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
            turn: None,
        });
    }
    out.sessions.sort_by(|a, b| a.name.cmp(&b.name));
    out
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

/// A plain idle session for other modules' tests.
#[cfg(test)]
pub fn tests_session(id: &str) -> Session {
    Session { id: id.into(), pid: 1, name: id.into(), dept: "Terra".into(), cwd: r"C:\git\Terra".into(), status: "idle".into(), task: "—".into(), ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::testutil::*;

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

    use std::fs;

    fn record(pid: u32, id: &str, name: &str, status: &str) -> String {
        format!(r#"{{"pid":{pid},"sessionId":"{id}","cwd":"C:\\git\\Terra","name":"{name}","status":"{status}","waitingFor":"input needed","statusUpdatedAt":{pid}000}}"#)
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
        fs::write(d.join("10.json"), r#"{"pid":10,"sessionId":"a","cwd":"C:\\git\\Terra","status":"idle","bridgeSessionId":"session_01abc"}"#).unwrap();
        let out = scan(&d, |_, _| true, |_, _| (None, vec![]), |pid| (pid == 10).then(|| "term_abc-123".to_string()));
        assert_eq!(out.sessions[0].orca.as_deref(), Some("term_abc-123"));
        assert_eq!(out.sessions[0].web.as_deref(), Some("https://claude.ai/code/session_01abc"));
    }

    #[test]
    fn scan_fills_compacted_at_from_the_tail() {
        let d = temp_dir("scan-compact");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        let out = scan(&d, |_, _| true, |_, _| (tail_of(COMPACT_TAIL), vec![]), |_| None);
        assert_eq!(out.sessions[0].compacted_at, Some(1775844528679));
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

}
