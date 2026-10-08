//! Test fixtures shared by the registry modules' tests.
use super::{read_tail, Context, Session, Tail};
use std::{fs, path::PathBuf};

pub(super) fn tool(name: &str, id: &str, input: &str) -> String {
    format!(r#"{{"type":"assistant","message":{{"model":"claude-opus-5-5","content":[{{"type":"tool_use","id":"{id}","name":"{name}","input":{input}}}]}}}}"#)
}

pub(super) fn tail_of(s: &str) -> Option<Tail> {
    read_tail(|_| Some(s.to_string()))
}

pub(super) fn temp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("adm-test-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

pub(super) fn session(id: &str, pid: u32, status: &str, since: i64) -> Session {
    Session { id: id.into(), pid, name: id.into(), dept: "Terra".into(), cwd: "C:\\git\\Terra".into(), status: status.into(), since_ms: since, task: "—".into(), ..Default::default() }
}

pub(super) const REAL_SHELL_TAIL: &str = concat!(
    r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"go"}}]}}"#,
    "\n",
    r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"done"}]}}"#,
    "\n",
    r#"{"type":"assistant","message":{"content":[{"type":"text","text":"all set"}]}}"#,
    "\n",
    r#"{"type":"system","subtype":"stop_hook_summary","hookCount":2}"#,
    "\n",
    r#"{"type":"system","subtype":"turn_duration","durationMs":19925}"#,
    "\n",
    r#"{"type":"last-prompt","lastPrompt":"go quand tu les as"}"#,
    "\n",
    r#"{"type":"ai-title","aiTitle":"Public APIs repo integration"}"#,
    "\n",
    r#"{"type":"mode","mode":"normal"}"#,
    "\n",
    r#"{"type":"permission-mode","permissionMode":"bypassPermissions"}"#,
    "\n",
    r#"{"type":"bridge-session","bridgeSessionId":"cse_018oaCXrud1SYhmpzjVcGZDY"}"#,
    "\n",
    r#"{"type":"system","subtype":"away_summary","content":"on nettoie GyroidVault"}"#,
);

/// A finished turn whose closing assistant entries say `texts` (one text block each, as Claude Code writes them).
pub(super) fn turn_ending(texts: &[&str]) -> String {
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

// Shape of a real Claude Code compaction marker (trimmed), followed by the summary turn.
pub(super) const COMPACT_TAIL: &str = concat!(
    r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":900000}}}"#,
    "\n",
    r#"{"parentUuid":null,"isSidechain":false,"type":"system","subtype":"compact_boundary","content":"Conversation compacted","isMeta":false,"timestamp":"2026-04-10T18:08:48.679Z","level":"info","compactMetadata":{"trigger":"auto","preTokens":178595}}"#,
    "\n",
    r#"{"type":"user","message":{"role":"user","content":"This session is being continued from a previous conversation"}}"#,
);

pub(super) fn with_ctx(id: &str, tokens: u64, compacted_at: Option<i64>) -> Session {
    Session { context: Some(Context { tokens, model: "m".into() }), compacted_at, ..session(id, 1, "busy", 0) }
}
