//! OpenCode rows (`session_message`) turned into the Claude transcript lines the rest of the chronicle reads.
use super::{add_file, extract_line, track_turn, turn_wanted, wanted, Cursor, Found, Src};
use serde_json::Value;

/// An OpenCode `session_message` row: (seq, type, data).
pub type Msg = (i64, String, Value);

/// How many rows of one OpenCode session are read per poll.
pub const OPENCODE_BATCH: u32 = 500;

/// Per OpenCode session memory carried between polls: a transcript's pairing and turn state, the open turn's first
/// prompt, and whether its first read (today's rows only, like a transcript's first scan) is still going.
#[derive(Default)]
pub struct OcCursor {
    pub(super) cur: Cursor,
    pub(super) open: Option<i64>,
    pub(super) backfill: bool,
    /// A hall session's own log, not a helper's: its turn is the card's.
    pub(super) main: bool,
}

fn ms_of(v: &Value) -> Option<i64> {
    v.as_f64().map(|x| x as i64)
}

fn iso_of(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms).unwrap_or_default().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// The paths of an OpenCode `patch` (`*** Add File: <path>`, `Update`, `Delete`; tool/patch.txt).
fn patch_files(text: &str) -> Vec<&str> {
    text.lines().filter_map(|l| ["*** Add File: ", "*** Update File: ", "*** Delete File: "].iter().find_map(|p| l.strip_prefix(p)).map(str::trim)).collect()
}

/// Whether OpenCode is done writing a row: it rewrites an assistant row (same seq) until `time.completed`, a shell
/// or compaction row while `running`. Its own projector copies a session by the same rule (session/projector.ts).
fn finished(kind: &str, d: &Value) -> bool {
    match kind {
        "assistant" => !d["time"]["completed"].is_null(),
        "shell" | "compaction" => d["status"] != "running",
        _ => true,
    }
}

/// One OpenCode row as the Claude transcript lines `extract_line` and `track_turn` read, so events come from the
/// same code: the turn's first prompt (OpenCode's turn runs to its `idle` row, prompts steered in meanwhile
/// included), an assistant message with its usage and tool calls (`shell` -> Bash, `edit` / `patch` -> Edit,
/// `write` -> Write) and then their results, and at `idle` the turn's duration.
fn claude_lines(st: &mut OcCursor, kind: &str, d: &Value) -> Vec<String> {
    use serde_json::json;
    let Some(created) = ms_of(&d["time"]["created"]) else { return vec![] };
    match kind {
        "user" if st.open.is_none() => {
            st.open = Some(created);
            vec![json!({"type": "user", "timestamp": iso_of(created), "message": {"content": d["text"].as_str().unwrap_or("")}}).to_string()]
        }
        "idle" => st
            .open
            .take()
            .map(|start| json!({"type": "system", "subtype": "turn_duration", "durationMs": created.saturating_sub(start).max(0), "timestamp": iso_of(created)}).to_string())
            .into_iter()
            .collect(),
        "assistant" => {
            let ts = iso_of(ms_of(&d["time"]["completed"]).unwrap_or(created));
            let (mut uses, mut results) = (vec![], vec![]);
            for t in d["content"].as_array().into_iter().flatten().filter(|c| c["type"] == "tool") {
                let (id, s, input) = (t["id"].as_str().unwrap_or(""), &t["state"], &t["state"]["input"]);
                let (name, input) = match t["name"].as_str().unwrap_or("tool") {
                    "shell" => ("Bash", json!({"command": input["command"]})),
                    "edit" => ("Edit", json!({"file_path": input["path"]})),
                    "write" => ("Write", json!({"file_path": input["path"]})),
                    "patch" => ("Edit", json!({"file_path": patch_files(input["patchText"].as_str().unwrap_or("")).first()})),
                    n => (n, input.clone()),
                };
                uses.push(json!({"type": "tool_use", "id": id, "name": name, "input": input}));
                // No result: still running, declined by the operator or cut off by an interruption (`aborted`,
                // runner/step.ts), or a shell moved to the background (its outcome is never this tool's).
                let done = s["status"] == "completed" || s["status"] == "error";
                if !done || s["error"]["type"] == "aborted" || s["metadata"]["status"] == "running" {
                    continue;
                }
                let mut text: Vec<&str> = s["error"]["message"].as_str().into_iter().collect();
                text.extend(s["content"].as_array().into_iter().flatten().filter_map(|c| c["text"].as_str()));
                // A failing shell command still completes: its exit code says (shell/result.ts metadata).
                let is_error = if s["status"] == "error" { Some(true) } else { ms_of(&s["metadata"]["exit"]).map(|e| e != 0) };
                results.push(json!({"type": "tool_result", "tool_use_id": id, "content": text.join("\n"), "is_error": is_error}));
            }
            let n = |v: &Value| ms_of(v).unwrap_or(0).max(0);
            let t = &d["tokens"];
            let usage = t.is_object().then(|| {
                json!({"input_tokens": n(&t["input"]), "output_tokens": n(&t["output"]).saturating_add(n(&t["reasoning"])), "cache_read_input_tokens": n(&t["cache"]["read"]), "cache_creation_input_tokens": n(&t["cache"]["write"])})
            });
            let mut out = vec![json!({"type": "assistant", "timestamp": ts, "message": {"id": d["id"], "model": d["model"]["id"], "content": uses, "usage": usage}}).to_string()];
            if !results.is_empty() {
                out.push(json!({"type": "user", "timestamp": ts, "message": {"content": results}}).to_string());
            }
            out
        }
        _ => vec![],
    }
}

/// Folds an OpenCode session's rows after seq `after` into `out` (events, usage, turns) and its card's turn, like
/// transcript lines; returns the seq to read after next time. A row OpenCode is still rewriting (`finished`) stops
/// the read before it, so its tokens count once and no tool result is missed; unless an `idle` row follows it in the
/// batch: the turn is over and that row will never finish (a crash).
// shortcut: an unfinished row with no idle within OPENCODE_BATCH rows after it holds the session back until one comes.
pub fn feed_opencode(st: &mut OcCursor, rows: &[Msg], after: i64, min_ts: i64, src: &Src, cwd: &str, out: &mut Found) -> i64 {
    let mut next = after;
    for (i, (seq, kind, d)) in rows.iter().enumerate() {
        if !finished(kind, d) && !rows[i + 1..].iter().any(|(_, k, _)| k == "idle") {
            break;
        }
        next = *seq;
        for line in claude_lines(st, kind, d) {
            if st.main && turn_wanted(&line) {
                track_turn(&mut st.cur.turn, &line, cwd);
            }
            if wanted(&line) {
                extract_line(&mut st.cur, &line, min_ts, src, 0, out); // every line carries its timestamp: no "now" needed
            }
        }
        if st.main && kind == "assistant" {
            // track_turn saw a patch's first file; the others are the turn's too
            let patches = d["content"].as_array().into_iter().flatten().filter(|t| t["type"] == "tool" && t["name"] == "patch");
            for p in patches.flat_map(|t| patch_files(t["state"]["input"]["patchText"].as_str().unwrap_or("")).into_iter().skip(1)) {
                add_file(&mut st.cur.turn, p, cwd);
            }
        }
    }
    next
}
