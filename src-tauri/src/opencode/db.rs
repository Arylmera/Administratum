//! Pure reads over OpenCode 2.x's database (`session_v2`, `session_message`), on a connection opened read-only.
//! Message `data` is untrusted json: a row that does not parse is skipped, never a panic.
use super::OPENCODE_IDLE_MS;
use crate::registry::{clip, Context};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde_json::Value;
use std::{path::Path, time::Duration};

/// A `session_v2` row the hall shows (see `shown_sessions`).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Row {
    pub id: String,
    /// Set for a subagent's session: it is a helper of that parent.
    pub parent_id: Option<String>,
    /// OpenCode's two-word session name ("brave-tiger").
    pub slug: String,
    pub directory: String,
    pub title: Option<String>,
    pub agent: Option<String>,
    /// `model.id` of the session's model json.
    pub model: Option<String>,
    /// The execution claim: set while a run is going (and after a crash), cleared at its end.
    pub time_suspended: Option<i64>,
    pub time_idle: Option<i64>,
}

/// How many of a session's newest rows of one type are looked at for a prompt or a usage before giving up.
const NEWEST: u32 = 50;
const NEWEST_SQL: &str = "SELECT data FROM session_message WHERE session_id = ?1 AND type = ?2 ORDER BY seq DESC LIMIT ?3";
const AFTER_SQL: &str = "SELECT seq, type, data FROM session_message WHERE session_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3";

/// The database at `path`, opened read-only (never `immutable`: OpenCode writes it meanwhile), or None when the
/// file is missing or has no `session_v2` (OpenCode 1.x).
pub fn open(path: &Path) -> Option<Connection> {
    if !path.is_file() {
        return None; // opening would not create it (read-only), but stay off a missing path altogether
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).ok()?;
    conn.busy_timeout(Duration::from_millis(200)).ok()?;
    let v2: Option<i64> = conn.query_row("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'", [], |r| r.get(0)).optional().ok()?;
    v2.map(|_| conn)
}

/// Sessions to show at `now_ms`: running (an execution claim is set) or idle for at most OPENCODE_IDLE_MS, never
/// archived. `time_idle` has no index at v2.0.29: the idle arm scans `session_v2` (one row per session).
pub fn shown_sessions(conn: &Connection, now_ms: i64) -> rusqlite::Result<Vec<Row>> {
    let mut st = conn.prepare_cached(
        "SELECT id, parent_id, slug, directory, title, agent, model, time_suspended, time_idle FROM session_v2
         WHERE time_archived IS NULL AND (time_suspended IS NOT NULL OR time_idle >= ?1)",
    )?;
    let rows = st.query_map([now_ms - OPENCODE_IDLE_MS], |r| {
        let model: Option<String> = r.get(6)?;
        Ok(Row {
            id: r.get(0)?,
            parent_id: r.get(1)?,
            slug: r.get(2)?,
            directory: r.get(3)?,
            title: r.get(4)?,
            agent: r.get(5)?,
            model: model.and_then(|m| serde_json::from_str::<Value>(&m).ok()).and_then(|m| m["id"].as_str().map(str::to_string)),
            time_suspended: r.get(7)?,
            time_idle: r.get(8)?,
        })
    })?;
    rows.collect()
}

/// The newest parseable `data` of type `kind` in session `id` for which `pick` gives a value (index
/// `session_message_session_type_seq_idx`), looking at the NEWEST rows at most.
fn newest<T>(conn: &Connection, id: &str, kind: &str, pick: impl Fn(&Value) -> Option<T>) -> rusqlite::Result<Option<T>> {
    let mut st = conn.prepare_cached(NEWEST_SQL)?;
    let mut rows = st.query(params![id, kind, NEWEST])?;
    while let Some(r) = rows.next()? {
        let data: String = r.get(0)?;
        if let Some(v) = serde_json::from_str::<Value>(&data).ok().as_ref().and_then(&pick) {
            return Ok(Some(v));
        }
    }
    Ok(None)
}

/// The newest prompt's first non-empty line, quoted and clipped like a Claude session's task.
pub fn last_user_text(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    newest(conn, id, "user", |d| {
        let line = d["text"].as_str()?.trim().lines().next()?.trim();
        (!line.is_empty()).then(|| clip(&format!("“{line}”")))
    })
}

/// Model and context of the newest assistant message with a usage: `input + cache.read + cache.write`, the same sum
/// as Claude's `context_of` (OpenCode's own TUI adds output and reasoning).
pub fn last_assistant(conn: &Connection, id: &str) -> rusqlite::Result<Option<Context>> {
    newest(conn, id, "assistant", |d| {
        let t = d.get("tokens")?;
        let n = |v: &Value| v.as_f64().map(|x| x.max(0.0) as u64);
        let tokens = n(&t["input"])? + n(&t["cache"]["read"])? + n(&t["cache"]["write"])?;
        Some(Context { tokens, model: d["model"]["id"].as_str()?.to_string() })
    })
}

/// Up to `limit` messages of session `id` after `seq`, as (seq, type, data), in seq order (index
/// `session_message_session_seq_idx`). The Chronicon's feeder.
pub fn messages_after(conn: &Connection, id: &str, seq: i64, limit: u32) -> rusqlite::Result<Vec<(i64, String, Value)>> {
    let mut st = conn.prepare_cached(AFTER_SQL)?;
    let mut rows = st.query(params![id, seq, limit])?;
    let mut out = vec![];
    while let Some(r) = rows.next()? {
        let data: String = r.get(2)?;
        if let Ok(v) = serde_json::from_str(&data) {
            out.push((r.get(0)?, r.get(1)?, v));
        }
    }
    Ok(out)
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    /// An in-memory database with OpenCode v2.0.29's tables.
    pub fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = OFF;").unwrap(); // rusqlite's bundled SQLite turns them on; `project` is not here
        c.execute_batch(include_str!("testdata/schema.sql")).unwrap();
        c
    }

    /// A session row: `times` = (time_suspended, time_idle, time_archived).
    pub fn add_session(c: &Connection, id: &str, parent: Option<&str>, title: &str, times: (Option<i64>, Option<i64>, Option<i64>)) {
        c.execute(
            "INSERT INTO session_v2 (id, project_id, parent_id, slug, directory, title, version, agent, model, time_created, time_updated, time_suspended, time_idle, time_archived)
             VALUES (?1, 'prj_1', ?2, 'brave-tiger', 'C:\\git\\Terra', ?3, '2.0.29', 'build', '{\"id\":\"claude-sonnet-5\",\"providerID\":\"anthropic\"}', 1, 1, ?4, ?5, ?6)",
            params![id, parent, title, times.0, times.1, times.2],
        )
        .unwrap();
    }

    pub fn add_message(c: &Connection, session: &str, seq: i64, kind: &str, data: &str) {
        c.execute(
            "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?1, ?2, ?3, ?4, ?4, ?4, ?5)",
            params![format!("msg_{session}{seq}"), session, kind, seq, data],
        )
        .unwrap();
    }

    const NOW: i64 = 10_000_000;

    #[test]
    fn shown_sessions_are_running_or_recently_idle_and_never_archived() {
        let c = db();
        add_session(&c, "ses_run", None, "Running", (Some(NOW - 5_000_000), Some(NOW - 6_000_000), None));
        add_session(&c, "ses_idle", None, "Idle", (None, Some(NOW - OPENCODE_IDLE_MS), None));
        add_session(&c, "ses_old", None, "Old", (None, Some(NOW - OPENCODE_IDLE_MS - 1), None));
        add_session(&c, "ses_arch", None, "Archived", (Some(NOW), Some(NOW), Some(NOW)));
        add_session(&c, "ses_never", None, "Never ran", (None, None, None));
        add_session(&c, "ses_kid", Some("ses_run"), "Helper", (Some(NOW), None, None));
        let mut rows = shown_sessions(&c, NOW).unwrap();
        rows.sort_by(|a, b| a.id.cmp(&b.id));
        let ids: Vec<_> = rows.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, ["ses_idle", "ses_kid", "ses_run"]);
        assert_eq!(rows[1].parent_id.as_deref(), Some("ses_run"));
        let run = &rows[2];
        assert_eq!((run.title.as_deref(), run.directory.as_str(), run.agent.as_deref()), (Some("Running"), r"C:\git\Terra", Some("build")));
        assert_eq!(run.slug, "brave-tiger");
        assert_eq!((run.model.as_deref(), run.time_suspended, run.time_idle), (Some("claude-sonnet-5"), Some(NOW - 5_000_000), Some(NOW - 6_000_000)));
    }

    #[test]
    fn last_user_text_is_the_newest_prompt_first_line_clipped() {
        let c = db();
        add_session(&c, "ses_a", None, "A", (Some(NOW), None, None));
        add_message(&c, "ses_a", 1, "user", r#"{"text":"old prompt"}"#);
        add_message(&c, "ses_a", 2, "user", r#"{"text":"\n  fix the card\nand the toast"}"#);
        add_message(&c, "ses_a", 3, "assistant", r#"{"text":"not a prompt"}"#);
        assert_eq!(last_user_text(&c, "ses_a").unwrap().as_deref(), Some("“fix the card”"));
        add_message(&c, "ses_a", 4, "user", &format!(r#"{{"text":"{}"}}"#, "x".repeat(100)));
        assert_eq!(last_user_text(&c, "ses_a").unwrap().map(|t| t.chars().count()), Some(60));
        assert_eq!(last_user_text(&c, "ses_none").unwrap(), None);
    }

    #[test]
    fn last_assistant_gives_model_and_context_of_the_newest_message_with_tokens() {
        let c = db();
        add_session(&c, "ses_a", None, "A", (Some(NOW), None, None));
        assert_eq!(last_assistant(&c, "ses_a").unwrap(), None);
        let usage = |input, read, write| format!(r#"{{"model":{{"id":"claude-opus-5-5","providerID":"anthropic"}},"content":[],"tokens":{{"input":{input},"output":900,"reasoning":50,"cache":{{"read":{read},"write":{write}}}}}}}"#);
        add_message(&c, "ses_a", 1, "assistant", &usage(1, 2, 3));
        add_message(&c, "ses_a", 2, "assistant", &usage(10, 20_000, 300));
        add_message(&c, "ses_a", 3, "assistant", r#"{"model":{"id":"claude-opus-5-5","providerID":"anthropic"},"content":[]}"#); // still streaming
        assert_eq!(last_assistant(&c, "ses_a").unwrap(), Some(Context { tokens: 20_310, model: "claude-opus-5-5".into() }));
    }

    #[test]
    fn messages_after_a_seq_in_order() {
        let c = db();
        add_session(&c, "ses_a", None, "A", (Some(NOW), None, None));
        add_session(&c, "ses_b", None, "B", (Some(NOW), None, None));
        for seq in [3, 1, 2, 4] {
            add_message(&c, "ses_a", seq, if seq % 2 == 1 { "user" } else { "assistant" }, &format!(r#"{{"n":{seq}}}"#));
        }
        add_message(&c, "ses_b", 5, "user", r#"{"n":5}"#);
        let rows = messages_after(&c, "ses_a", 1, 2).unwrap();
        assert_eq!(rows, [(2, "assistant".to_string(), serde_json::json!({"n": 2})), (3, "user".to_string(), serde_json::json!({"n": 3}))]);
        assert!(messages_after(&c, "ses_a", 4, 10).unwrap().is_empty());
    }

    #[test]
    fn malformed_data_is_skipped() {
        let c = db();
        add_session(&c, "ses_a", None, "A", (Some(NOW), None, None));
        add_message(&c, "ses_a", 1, "user", r#"{"text":"good prompt"}"#);
        add_message(&c, "ses_a", 2, "assistant", r#"{"model":{"id":"m","providerID":"p"},"tokens":{"input":5,"output":0,"reasoning":0,"cache":{"read":0,"write":0}}}"#);
        add_message(&c, "ses_a", 3, "user", r#"{"text":"half"#);
        add_message(&c, "ses_a", 4, "assistant", "not json");
        add_message(&c, "ses_a", 5, "user", r#"{"text":42}"#);
        assert_eq!(last_user_text(&c, "ses_a").unwrap().as_deref(), Some("“good prompt”"));
        assert_eq!(last_assistant(&c, "ses_a").unwrap(), Some(Context { tokens: 5, model: "m".into() }));
        let seqs: Vec<_> = messages_after(&c, "ses_a", 0, 10).unwrap().into_iter().map(|r| r.0).collect();
        assert_eq!(seqs, [1, 2, 5]);
        c.execute("UPDATE session_v2 SET model = 'oops' WHERE id = 'ses_a'", []).unwrap();
        assert_eq!(shown_sessions(&c, NOW).unwrap()[0].model, None);
    }

    fn file_db(name: &str, schema: bool) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("adm-opencode-{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let c = Connection::open(&path).unwrap();
        c.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        c.execute_batch(if schema { include_str!("testdata/schema.sql") } else { "CREATE TABLE session (id text);" }).unwrap();
        path
    }

    #[test]
    fn message_reads_go_through_the_v2_indexes() {
        let c = db();
        let plan = |sql: &str, p: &[&dyn rusqlite::ToSql]| -> String {
            let mut st = c.prepare(&format!("EXPLAIN QUERY PLAN {sql}")).unwrap();
            st.query_map(p, |r| r.get::<_, String>(3)).unwrap().map(Result::unwrap).collect::<Vec<_>>().join("; ")
        };
        let by_type = plan(NEWEST_SQL, params!["ses_a", "user", 1]);
        assert!(by_type.contains("session_message_session_type_seq_idx"), "{by_type}");
        let after = plan(AFTER_SQL, params!["ses_a", 1, 1]);
        assert!(after.contains("session_message_session_seq_idx"), "{after}");
    }

    #[test]
    fn open_is_read_only_and_wants_the_v2_schema() {
        assert!(open(&std::env::temp_dir().join("adm-opencode-missing.db")).is_none(), "missing file");
        assert!(open(&file_db("v1", false)).is_none(), "no session_v2: OpenCode 1.x");
        let path = file_db("v2", true);
        let c = open(&path).expect("opens");
        assert_eq!(c.query_row("PRAGMA busy_timeout", [], |r| r.get::<_, i64>(0)).unwrap(), 200);
        assert!(shown_sessions(&c, NOW).unwrap().is_empty());
        let write = c.execute("INSERT INTO session_v2 (id, project_id, slug, directory, version, time_created, time_updated) VALUES ('ses_x', 'p', 's', 'd', 'v', 1, 1)", []);
        assert!(write.is_err(), "the connection cannot write");
        drop(c);
        let _ = std::fs::remove_file(path);
    }
}
