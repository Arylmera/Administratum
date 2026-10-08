//! Subagents: which are active, what each is, and which the parent transcript reports completed.
use super::files::{file_tail, FileStat, TAIL_BYTES};
use super::tail::{clip, context_of, iso_utc_ms};
use super::Helper;
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::files::{list_subagents, stat};
    use crate::registry::testutil::*;
    use crate::registry::Context;
    use std::{
        fs,
        io::Write,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    fn helpers_in(d: &Path, now: SystemTime, completed: &HashMap<String, i64>) -> Vec<Helper> {
        active_helpers(&list_subagents(d), now.duration_since(UNIX_EPOCH).unwrap().as_millis() as i64, completed, read_helper)
    }

    fn write_with_age(path: &std::path::PathBuf, age_secs: u64, now: SystemTime) {
        fs::write(path, "{}").unwrap();
        fs::OpenOptions::new().write(true).open(path).unwrap().set_modified(now - Duration::from_secs(age_secs)).unwrap();
    }

    fn ms_ago(now: SystemTime, secs: u64) -> i64 {
        (now - Duration::from_secs(secs)).duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
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
        let line = |id: &str, ts: &str| {
            format!(r#"{{"type":"queue-operation","timestamp":"{ts}","content":"<task-notification>\n<task-id>{id}</task-id>\n<status>completed</status>\n</task-notification>"}}"#)
        };
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
}
