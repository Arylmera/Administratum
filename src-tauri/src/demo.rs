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
        helpers: vec![],
        context: Some(Context { tokens, model: model.to_string() }),
        orca: None,
        web: Some(format!("https://claude.ai/code/session_demo_{name}")),
        background: false,
        compacted_at: None,
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
    // ...then compacts at each cycle wrap: back to 50k, with a fresh compaction stamp.
    v[0].compacted_at = Some(epoch);
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
}
