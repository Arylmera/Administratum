use crate::registry::Session;
use std::{sync::OnceLock, time::{SystemTime, UNIX_EPOCH}};

/// Wall-clock ms at the first demo tick, so `sinceMs` reads as a real timestamp in the UI.
fn start_ms() -> i64 {
    static START: OnceLock<i64> = OnceLock::new();
    *START.get_or_init(|| SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64))
}

fn scribe(name: &str, dept: &str, status: &str, waiting_for: Option<&str>, since_ms: i64, task: &str) -> Session {
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
    }
}

/// A 60 s scripted day in the office: work, shell, two petitions, an arrival.
pub fn roster(t: u64) -> Vec<Session> {
    let phase = t % 60;
    let epoch = start_ms() + ((t / 60) * 60 * 1000) as i64;
    let mut v = vec![
        scribe("terra-77", "Terra", if (20..30).contains(&phase) { "shell" } else { "busy" }, None, epoch, "Edit · Hera/NAS/Reference/Hololith.md"),
        scribe("terra-27", "Terra", "idle", None, epoch, "“home command playlist names”"),
        scribe("geneseed-51", "Geneseed", if (10..40).contains(&phase) { "waiting" } else { "idle" }, Some("approve Bash"), epoch + 10_000, "Bash · cargo test"),
        scribe("token-dashboard-af", "Token-Dashboard", if phase >= 25 { "waiting" } else { "busy" }, Some("input needed"), epoch + 25_000, "Edit · app.js"),
    ];
    if phase >= 45 {
        v.push(scribe("drop-pod-1", "Drop-Pod", "busy", None, epoch + 45_000, "Write · README.md"));
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
}
