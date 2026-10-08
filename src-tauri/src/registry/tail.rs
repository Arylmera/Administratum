//! What a session's transcript tail says: last task, context, turn state, question, petition, usage limit.
use super::files::{BIG_TAIL_BYTES, TAIL_BYTES};
use super::{Context, Limit};
use chrono::{Local, TimeZone};
use std::collections::HashSet;

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
    let target = ["command", "file_path", "notebook_path", "pattern", "url", "query", "skill", "prompt"].iter().find_map(|k| field(input, k)).or_else(|| first_string(input));
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
        || ["Another Claude session", "[SYSTEM", "Caveat:", "This session is being continued from a previous conversation", "[Request interrupted"].iter().any(|p| t.starts_with(p))
        || (t.starts_with("You have ") && t.contains("orchestration message"))
}

/// Last thing the session did, newest first: a tool call with its target, else the last prompt.
pub fn task_line(tail: &str) -> String {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let content = &v["message"]["content"];
        match v["type"].as_str() {
            Some("assistant") => {
                let tool = content.as_array().and_then(|a| a.iter().rev().find(|b| b["type"] == "tool_use"));
                if let Some(tool) = tool {
                    let name = tool["name"].as_str().unwrap_or("tool");
                    return clip(&match tool_detail(name, &tool["input"]) {
                        Some(d) => format!("{name} · {d}"),
                        None => name.to_string(),
                    });
                }
            }
            Some("user") if v["isMeta"] != true && v["isCompactSummary"] != true => {
                let text =
                    content.as_str().map(str::to_string).or_else(|| content.as_array().and_then(|a| a.iter().find(|b| b["type"] == "text")).and_then(|b| b["text"].as_str()).map(str::to_string));
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
                let pending = blocks.into_iter().flatten().rev().find(|b| b["type"] == "tool_use" && !b["id"].as_str().is_some_and(|id| answered.contains(id)));
                if let Some(b) = pending {
                    return Some(ask_line(b["name"].as_str().unwrap_or("tool"), &b["input"]));
                }
            }
            _ => {}
        }
    }
    None
}

/// Whether a `pending_ask` line is a shell command (Bash/PowerShell).
pub(super) fn is_shell_call(ask: &str) -> bool {
    ["Bash", "PowerShell"].iter().any(|n| ask.strip_prefix(n).is_some_and(|r| r.is_empty() || r.starts_with(':') || r.starts_with(' ')))
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
    Some(Tail {
        task,
        context,
        turn_done: turn_done(&tail),
        compacted_at: compacted_at(&tail),
        title: title_of(&tail),
        asks: pending_ask(&tail),
        question: ends_with_question(&tail),
        limit: limit_of(&tail),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::testutil::*;

    #[test]
    fn task_line_prefers_last_tool_use() {
        let tail = [
            r#"{"type":"user","message":{"content":"fix the hololith page"}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Edit","input":{"file_path":"ui/hololith.html"}}]}}"#,
        ]
        .join("\n");
        assert_eq!(task_line(&tail), "Edit · hololith.html");
    }

    #[test]
    fn task_line_falls_back_to_prompt_and_skips_tool_results() {
        let tail = [
            r#"{"type":"user","message":{"content":"port the Lex index"}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"done"}]}}"#,
            r#"{"type":"user","message":{"content":"<command-name>/clear</command-name>"}}"#,
        ]
        .join("\n");
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
        ]
        .join("\n");
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
        ]
        .join("\n");
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
    fn shell_call_is_bash_or_powershell_only() {
        assert!(is_shell_call("Bash: ls — List files"));
        assert!(is_shell_call("PowerShell: Get-Date"));
        assert!(is_shell_call("Bash"));
        assert!(!is_shell_call("BashOutput: x"));
        assert!(!is_shell_call("Edit: ui/app.js"));
    }

    #[test]
    fn context_of_picks_newest_usage_and_sums_fields() {
        let tail = [
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_creation_input_tokens":350,"cache_read_input_tokens":306393,"output_tokens":365}}}"#,
        ]
        .join("\n");
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
        ]
        .join("\n");
        assert_eq!(context_of(&tail), Some(Context { tokens: 5, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn context_of_missing_fields_treated_as_zero_none_on_empty_or_garbage() {
        assert_eq!(context_of(""), None);
        assert_eq!(context_of("not json\n{"), None);
        let tail = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"output_tokens":1}}}"#;
        assert_eq!(context_of(tail), Some(Context { tokens: 0, model: "claude-opus-5-5".to_string() }));
    }

    #[test]
    fn read_tail_retries_with_bigger_tail_when_newest_line_overflows() {
        // The 64 KB tail holds no whole line (task_line -> "—"); a bigger tail would.
        let tail = read_tail(|n| if n == TAIL_BYTES { Some("x".repeat(70_000)) } else { Some(r#"{"type":"user","message":{"content":"hi"}}"#.to_string()) });
        assert_eq!(tail.unwrap().task, "“hi”");
        assert_eq!(read_tail(|_| None), None, "no transcript");
    }

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
    fn compacted_at_reads_newest_boundary_timestamp_as_ms() {
        assert_eq!(compacted_at(COMPACT_TAIL), Some(1775844528679));
        let two = format!("{COMPACT_TAIL}\n{}", COMPACT_TAIL.replace("2026-04-10T18:08:48.679Z", "2026-04-10T19:00:00Z"));
        assert_eq!(compacted_at(&two), Some(1775847600000), "newest wins, fraction optional");
        assert_eq!(compacted_at(REAL_SHELL_TAIL), None);
        assert_eq!(compacted_at(r#"{"type":"user","message":{"content":"compact_boundary"}}"#), None, "only the system marker counts");
        assert_eq!(compacted_at(r#"{"type":"system","subtype":"compact_boundary","timestamp":"garbage"}"#), None);
    }

    #[test]
    fn usage_limit_lines() {
        use chrono::{Local, TimeZone};
        let at = |h, m| Local.with_ymd_and_hms(2026, 10, 6, h, m, 0).unwrap().timestamp_millis();
        let iso = |ms: i64| chrono::DateTime::from_timestamp_millis(ms).unwrap().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let limit = |text: &str, ms: i64| {
            format!(
                r#"{{"type":"assistant","timestamp":"{}","message":{{"model":"<synthetic>","content":[{{"type":"text","text":"{text}"}}]}},"error":"rate_limit","isApiErrorMessage":true}}"#,
                iso(ms)
            )
        };
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
}
