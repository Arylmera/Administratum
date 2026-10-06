use crate::chronicle::{Event, Tokens, Usage};
use crate::registry::{Context, Helper, Session};
use std::{sync::OnceLock, time::{SystemTime, UNIX_EPOCH}};

/// Wall-clock ms at the first demo tick, so `sinceMs` reads as a real timestamp in the UI.
fn start_ms() -> i64 {
    static START: OnceLock<i64> = OnceLock::new();
    *START.get_or_init(|| SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64))
}

// One model per rank (opus/fable high, sonnet standard, haiku novice) so the demo shows all three.
const OPUS: &str = "claude-opus-5-5";
const SONNET: &str = "claude-sonnet-5";
const HAIKU: &str = "claude-haiku-4-5-20251001";

fn scribe(name: &str, dept: &str, status: &str, waiting_for: Option<&str>, since_ms: i64, task: &str, tokens: u64, model: &str) -> Session {
    Session {
        id: name.into(),
        pid: 0,
        name: name.into(),
        dept: dept.into(),
        cwd: format!("C:\\Users\\guill\\Documents\\git\\{dept}"),
        status: status.into(),
        waiting_for: if status == "waiting" { waiting_for.map(str::to_string) } else { None },
        since_ms,
        task: task.into(),
        title: None,
        asks: None,
        helpers: vec![],
        context: Some(Context { tokens, model: model.to_string() }),
        orca: None,
        web: Some(format!("https://claude.ai/code/session_demo_{name}")),
        background: false,
        compacted_at: None,
        question: None,
        ..Default::default()
    }
}

fn helper(id: &str, kind: &str, task: &str, tokens: u64, model: &str) -> Helper {
    let alias = ["opus", "sonnet", "haiku"].into_iter().find(|a| model.contains(a)).map(str::to_string);
    Helper { id: id.into(), kind: kind.into(), task: task.into(), model: alias, context: Some(Context { tokens, model: model.to_string() }) }
}

/// A 60 s scripted day in the office: work, shell, two petitions, an arrival.
pub fn roster(t: u64) -> Vec<Session> {
    let phase = t % 60;
    let epoch = start_ms() + ((t / 60) * 60 * 1000) as i64;
    // terra-77's context climbs the whole cycle so the UI shows every stage, light to blown-out.
    let terra_77_tokens = 50_000 + phase * ((950_000 - 50_000) / 60);
    let mut v = vec![
        scribe("terra-77", "Terra", if (20..30).contains(&phase) { "shell" } else { "busy" }, None, epoch, "Edit · Hera/NAS/Reference/Hololith.md", terra_77_tokens, OPUS),
        scribe("terra-27", "Terra", "idle", None, epoch, "“home command playlist names”", 120_000, SONNET),
        scribe("geneseed-51", "Geneseed", if (10..40).contains(&phase) { "waiting" } else { "idle" }, Some("approve Bash"), epoch + 10_000, "Bash · cargo test", 400_000, HAIKU),
        scribe("token-dashboard-af", "Token-Dashboard", if phase >= 25 { "waiting" } else { "busy" }, Some("input needed"), epoch + 25_000, "Edit · app.js", 520_000, SONNET),
    ];
    v[0].title = Some("Hololith: link the NAS services".into());
    v[2].title = Some("Permission test for the SDD loop".into());
    if v[2].status == "waiting" {
        v[2].asks = Some("Bash: echo hello > .superpowers/sdd/permtest.txt — Writing hello to a test file".into());
    }
    // ...then compacts at each cycle wrap: back to 50k, with a fresh compaction stamp.
    v[0].compacted_at = Some(epoch);
    // terra-27 ends its turn on a question for the second half of the cycle.
    if phase >= 30 {
        v[1].since_ms = epoch + 30_000;
        v[1].question = Some("Shall I rename the playlists to match the new rooms, or keep the old names as aliases?".into());
    }
    if phase >= 45 {
        v.push(scribe("drop-pod-1", "Drop-Pod", "busy", None, epoch + 45_000, "Write · README.md", 20_000, HAIKU));
    }
    if (0..20).contains(&phase) {
        v[0].helpers = vec![
            helper("a1", "general-purpose", "Implement Task 3", 30_000, OPUS),
            helper("a2", "Explore", "find callers", 80_000, SONNET),
        ];
    }
    if (30..50).contains(&phase) {
        v[3].helpers = vec![helper("b1", "general-purpose", "", 55_000, HAIKU)];
    }
    v
}

/// Chronicon beats over the 60 s cycle: (phase, kind, scribe, helper kind, detail).
const BEATS: [(u64, &str, &str, Option<&str>, &str); 8] = [
    (5, "commit", "terra-77", None, "hololith: link NAS services"),
    (8, "push", "terra-77", None, "origin/main"),
    (14, "tests-pass", "token-dashboard-af", None, "npm test"),
    (17, "tool-error", "terra-77", Some("Explore"), "Grep · No matches found"),
    (22, "tests-fail", "token-dashboard-af", None, "npm test"),
    (33, "tool-error", "terra-77", None, "Bash · /usr/bin/bash: line 1: hololith: command not found"),
    (42, "task-done", "terra-77", None, "6m 12s"),
    (52, "tests-pass", "drop-pod-1", None, "cargo test"),
];

/// Scripted events for the elapsed seconds `from` (exclusive) ..= `to`, from scribes on `roster`.
pub fn chronicle(from: u64, to: u64, roster: &[Session], now_ms: i64) -> Vec<Event> {
    let mut out = vec![];
    for t in from.max(to.saturating_sub(60)) + 1..=to {
        for (_, kind, name, helper, detail) in BEATS.iter().filter(|b| b.0 == t % 60) {
            let Some(s) = roster.iter().find(|s| s.name == *name) else { continue };
            out.push(Event { ts: now_ms, kind: kind.to_string(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: helper.map(str::to_string), detail: detail.to_string() });
        }
    }
    out
}

/// One tick of token spend for every working scribe, so the demo Tithe grows.
pub fn usage(roster: &[Session], now_ms: i64) -> Vec<(String, Usage)> {
    roster
        .iter()
        .filter(|s| s.status == "busy" || s.status == "shell")
        .map(|s| {
            let model = s.context.as_ref().map_or(OPUS.to_string(), |c| c.model.clone());
            (s.dept.clone(), Usage { ts: now_ms, model, tokens: Tokens { input: 300, output: 900, cache_read: 45_000, cache_write: 2_500 } })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_cycles_through_petitions_and_arrivals() {
        let at = |t, name: &str| roster(t).into_iter().find(|s| s.name == name);
        assert_eq!(at(5, "geneseed-51").unwrap().status, "idle");
        assert_eq!(at(15, "geneseed-51").unwrap().status, "waiting");
        assert_eq!(at(26, "token-dashboard-af").unwrap().status, "waiting");
        assert_eq!(at(22, "terra-77").unwrap().status, "shell");
        assert!(at(10, "drop-pod-1").is_none());
        assert!(at(50, "drop-pod-1").is_some());
        let first = at(15, "geneseed-51").unwrap().since_ms;
        let next = at(75, "geneseed-51").unwrap().since_ms;
        assert_ne!(first, next, "each cycle is a new petition episode");
    }

    #[test]
    fn demo_contexts_are_present_and_terra_77_grows_over_the_cycle() {
        let at = |t, name: &str| roster(t).into_iter().find(|s| s.name == name).unwrap();
        for s in roster(10) {
            assert!(s.context.is_some(), "{} missing context", s.name);
        }
        let early = at(0, "terra-77").context.unwrap().tokens;
        let late = at(59, "terra-77").context.unwrap().tokens;
        assert!(early < late, "terra-77 context should grow over the cycle");
        assert_eq!(at(0, "terra-77").context.unwrap().model, "claude-opus-5-5");
    }

    #[test]
    fn demo_terra_77_compacts_once_per_cycle() {
        let at = |t, name: &str| roster(t).into_iter().find(|s| s.name == name).unwrap();
        assert_eq!(at(10, "terra-77").compacted_at, at(59, "terra-77").compacted_at, "steady within a cycle");
        assert_ne!(at(59, "terra-77").compacted_at, at(60, "terra-77").compacted_at, "new compaction at the wrap");
        assert!(at(60, "terra-77").context.unwrap().tokens < at(59, "terra-77").context.unwrap().tokens / 2);
    }

    #[test]
    fn demo_gives_helpers_to_scribes_during_their_phase() {
        let at = |t, name: &str| roster(t).into_iter().find(|s| s.name == name).unwrap();
        assert_eq!(at(10, "terra-77").helpers.len(), 2);
        assert!(at(25, "terra-77").helpers.is_empty());
        assert_eq!(at(35, "token-dashboard-af").helpers.len(), 1);
        assert!(at(10, "token-dashboard-af").helpers.is_empty());
    }

    #[test]
    fn demo_chronicle_plays_every_kind_once_per_cycle() {
        let mut kinds = vec![];
        for t in 1..=60 {
            for e in chronicle(t - 1, t, &roster(t), 7) {
                kinds.push(e.kind);
            }
        }
        kinds.sort();
        assert_eq!(kinds, ["commit", "push", "task-done", "tests-fail", "tests-pass", "tests-pass", "tool-error", "tool-error"]);
        assert_eq!(chronicle(16, 17, &roster(17), 7)[0].helper.as_deref(), Some("Explore"));
        assert_eq!(chronicle(3, 9, &roster(9), 7).len(), 2, "a skipped second still plays its beat");
        assert!(chronicle(9, 9, &roster(9), 7).is_empty());
    }

    #[test]
    fn demo_usage_comes_from_working_scribes() {
        let u = usage(&roster(5), 7);
        assert!(u.iter().any(|(dept, _)| dept == "Terra"));
        assert!(u.iter().all(|(dept, _)| dept != "Geneseed"), "idle/waiting scribes spend nothing");
    }
}
