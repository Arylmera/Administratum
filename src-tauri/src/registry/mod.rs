//! The roster's data: what Claude Code's session files and transcripts say, read without side effects.
use serde::Serialize;

mod files;
mod helpers;
mod prompt;
mod sessions;
mod tail;
#[cfg(test)]
mod testutil;
mod tracker;

#[cfg(test)]
pub(crate) use files::slug; // only chronicle.rs's tests reach it from outside
pub use files::{direct_transcript, file_tail, find_transcript, list_subagents, stat, FileStat};
pub(crate) use helpers::helper_meta;
pub use helpers::{active_helpers, read_helper, Completions};
pub use prompt::{parse_permission_prompt, valid_claude_web_url, valid_orca_handle, Prompt};
pub use sessions::{merge, scan, track_compaction};
pub(crate) use tail::{clip, iso_utc_ms};
pub use tail::{read_tail, Tail};
pub use tracker::{Tracker, STALE_MS};

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub pid: u32,
    pub name: String,
    pub dept: String,
    /// Its cwd is under the temp folder: it sits in the break-out room and `dept` is the temp folder's name (temp_dept).
    pub temp: bool,
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

/// A plain idle session for other modules' tests.
#[cfg(test)]
pub fn tests_session(id: &str) -> Session {
    Session { id: id.into(), pid: 1, name: id.into(), dept: "Terra".into(), cwd: r"C:\git\Terra".into(), status: "idle".into(), task: "—".into(), ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::testutil::*;
    use super::*;

    #[test]
    fn session_serializes_context_as_camel_case() {
        let s = Session { context: Some(Context { tokens: 42, model: "claude-opus-5-5".into() }), ..session("a", 1, "idle", 0) };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["context"]["tokens"], 42);
        assert_eq!(json["context"]["model"], "claude-opus-5-5");
    }

    #[test]
    fn session_serializes_compacted_at_as_camel_case() {
        let json = serde_json::to_value(with_ctx("a", 1, Some(5))).unwrap();
        assert_eq!(json["compactedAt"], 5);
    }
}
