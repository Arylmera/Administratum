//! Night Vigil: shut the PC down once no session can progress without a human (a permission prompt, a question
//! or a usage limit counts as finished). Pure: the poll loop steps it once per tick and runs the action it returns.
//! Spec: docs/superpowers/specs/2026-10-09-night-vigil-design.md.
use crate::registry::Session;
use std::collections::HashMap;

/// Nothing works and no transcript is written for this long: the countdown starts.
pub const QUIET_MS: i64 = 300_000;
pub const COUNTDOWN_MS: i64 = 120_000;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Phase {
    /// Still advances on its own: a turn, an active helper, a background shell.
    Working,
    /// Stopped on a subscription usage limit. Finished for now; its own phase so "wait until reset" can come later.
    Limit,
    /// Waits on a human: a permission prompt or a closing question.
    Waiting,
    Idle,
}

pub fn phase(s: &Session) -> Phase {
    if !s.helpers.is_empty() || s.background {
        return Phase::Working;
    }
    if s.limit.is_some() {
        return Phase::Limit;
    }
    match s.status.as_str() {
        "busy" | "shell" => Phase::Working,
        "waiting" => Phase::Waiting,
        _ if s.question.is_some() => Phase::Waiting,
        _ => Phase::Idle,
    }
}

/// No session works, and neither a working session (`calm_since`) nor a transcript write (`last_write`) happened
/// in the last `QUIET_MS`.
pub fn vigil_ready(sessions: &[Session], last_write: i64, calm_since: i64, now: i64) -> bool {
    sessions.iter().all(|s| phase(s) != Phase::Working) && now - calm_since.max(last_write) >= QUIET_MS
}

/// The next time the local clock reads `target_min` (minutes after midnight), strictly after this minute.
pub fn deadline_after(now_ms: i64, now_local_min: u16, target_min: u16) -> i64 {
    let delta = (target_min as i64 - now_local_min as i64).rem_euclid(1440);
    let delta = if delta == 0 { 1440 } else { delta };
    now_ms - now_ms.rem_euclid(60_000) + delta * 60_000
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VigilState {
    pub armed: bool,
    /// Ms: when the deadline starts a countdown whatever the sessions do.
    pub deadline: Option<i64>,
    /// Ms: when the running countdown ends.
    pub countdown_end: Option<i64>,
    /// The running countdown came from the deadline: no re-check at its end.
    pub forced: bool,
}

#[derive(Debug, PartialEq)]
pub enum Step {
    Nothing,
    /// A countdown just started (`deadline`: started by the deadline).
    Countdown { deadline: bool },
    /// The countdown stopped: something works again. Still armed.
    Resumed,
    /// Run the shutdown. The vigil is already disarmed. `last`: the session that stopped working last.
    Fire { last: Option<String> },
}

#[derive(Default)]
pub struct Vigil {
    state: VigilState,
    calm_since: i64,
    /// Working sessions at the previous tick: id -> name.
    working: HashMap<String, String>,
    last_done: Option<String>,
}

impl Vigil {
    pub fn state(&self) -> &VigilState {
        &self.state
    }

    /// True if it was not armed yet.
    pub fn arm(&mut self, now: i64, deadline: Option<i64>) -> bool {
        if self.state.armed {
            return false;
        }
        self.state = VigilState { armed: true, deadline, countdown_end: None, forced: false };
        self.calm_since = now;
        true
    }

    /// True if it was armed.
    pub fn cancel(&mut self) -> bool {
        let was = self.state.armed;
        self.state = VigilState::default();
        was
    }

    pub fn step(&mut self, sessions: &[Session], last_write: i64, now: i64) -> Step {
        let working: HashMap<String, String> = sessions.iter().filter(|s| phase(s) == Phase::Working).map(|s| (s.id.clone(), s.name.clone())).collect();
        if let Some(name) = self.working.iter().find(|(id, _)| !working.contains_key(*id)).map(|(_, n)| n.clone()) {
            self.last_done = Some(name);
        }
        let busy = !working.is_empty();
        self.working = working;
        if !self.state.armed {
            return Step::Nothing;
        }
        if busy {
            self.calm_since = now;
        }
        match self.state.countdown_end {
            None => {
                let by_deadline = self.state.deadline.is_some_and(|d| now >= d);
                if by_deadline || vigil_ready(sessions, last_write, self.calm_since, now) {
                    self.state.countdown_end = Some(now + COUNTDOWN_MS);
                    self.state.forced = by_deadline;
                    return Step::Countdown { deadline: by_deadline };
                }
                Step::Nothing
            }
            Some(_) if !self.state.forced && busy => self.resume(now),
            Some(end) if now >= end => {
                if self.state.forced || vigil_ready(sessions, last_write, self.calm_since, now - COUNTDOWN_MS) {
                    self.state = VigilState::default();
                    Step::Fire { last: self.last_done.clone() }
                } else {
                    self.resume(now)
                }
            }
            Some(_) => Step::Nothing,
        }
    }

    fn resume(&mut self, now: i64) -> Step {
        self.state.countdown_end = None;
        self.state.forced = false;
        self.calm_since = now;
        Step::Resumed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{Helper, Limit};

    fn s(id: &str, status: &str) -> Session {
        Session { id: id.into(), name: format!("n-{id}"), status: status.into(), ..Default::default() }
    }
    fn helper() -> Helper {
        Helper { id: "h".into(), kind: "general-purpose".into(), task: "t".into(), model: None, context: None }
    }
    const M: i64 = 60_000;

    #[test]
    fn phases() {
        assert_eq!(phase(&s("a", "idle")), Phase::Idle);
        assert_eq!(phase(&s("a", "waiting")), Phase::Waiting);
        assert_eq!(phase(&Session { question: Some("ok?".into()), ..s("a", "idle") }), Phase::Waiting);
        assert_eq!(phase(&s("a", "busy")), Phase::Working);
        assert_eq!(phase(&s("a", "shell")), Phase::Working);
        assert_eq!(phase(&Session { helpers: vec![helper()], ..s("a", "idle") }), Phase::Working, "busy helper under an idle parent");
        assert_eq!(phase(&Session { background: true, ..s("a", "idle") }), Phase::Working, "background shell");
        let limit = Some(Limit { reset_ms: None, text: "limit".into() });
        assert_eq!(phase(&Session { limit: limit.clone(), ..s("a", "busy") }), Phase::Limit);
        assert_eq!(phase(&Session { limit, helpers: vec![helper()], ..s("a", "idle") }), Phase::Working, "a helper still runs");
    }

    #[test]
    fn ready_needs_the_whole_quiet_window() {
        let idle = [s("a", "idle"), s("b", "waiting")];
        assert!(!vigil_ready(&idle, 0, 0, 5 * M - 1));
        assert!(vigil_ready(&idle, 0, 0, 5 * M));
        assert!(!vigil_ready(&idle, 2 * M, 0, 5 * M), "a transcript write restarts it");
        assert!(!vigil_ready(&idle, 0, 2 * M, 5 * M), "a working tick restarts it");
        assert!(!vigil_ready(&[s("a", "busy")], 0, 0, 60 * M));
        assert!(vigil_ready(&[], 0, 0, 5 * M), "no session at all");
    }

    #[test]
    fn deadline_next_occurrence() {
        // 23:30 local, target 04:00: 4 h 30 later; seconds inside the minute dropped.
        assert_eq!(deadline_after(1_000_000 * M + 15_000, 23 * 60 + 30, 4 * 60), 1_000_000 * M + 270 * M);
        assert_eq!(deadline_after(0, 600, 600), 1440 * M, "this very minute: tomorrow");
        assert_eq!(deadline_after(0, 600, 601), M);
    }

    #[test]
    fn arm_countdown_fire() {
        let mut v = Vigil::default();
        let idle = [s("a", "idle")];
        assert_eq!(v.step(&idle, 0, 0), Step::Nothing, "disarmed");
        assert!(v.arm(0, None));
        assert!(!v.arm(1, None));
        assert_eq!(v.step(&idle, 0, 5 * M - 1), Step::Nothing);
        assert_eq!(v.step(&idle, 0, 5 * M), Step::Countdown { deadline: false });
        assert_eq!(v.state().countdown_end, Some(7 * M));
        assert_eq!(v.step(&idle, 0, 7 * M - 1), Step::Nothing);
        assert_eq!(v.step(&idle, 0, 7 * M), Step::Fire { last: None });
        assert!(!v.state().armed, "fires once");
    }

    #[test]
    fn last_session_to_finish_is_named() {
        let mut v = Vigil::default();
        v.arm(0, None);
        v.step(&[s("a", "busy"), s("b", "busy")], 0, 0);
        v.step(&[s("a", "idle"), s("b", "busy")], 0, M);
        v.step(&[s("a", "idle"), s("b", "idle")], 0, 2 * M);
        assert_eq!(v.step(&[s("a", "idle"), s("b", "idle")], 0, 7 * M), Step::Countdown { deadline: false });
        assert_eq!(v.step(&[s("a", "idle"), s("b", "idle")], 0, 9 * M), Step::Fire { last: Some("n-b".into()) });
    }

    #[test]
    fn countdown_resumes_when_work_comes_back() {
        let mut v = Vigil::default();
        v.arm(0, None);
        v.step(&[s("a", "idle")], 0, 5 * M);
        assert_eq!(v.step(&[s("a", "busy")], 0, 6 * M), Step::Resumed);
        assert!(v.state().armed && v.state().countdown_end.is_none());
        assert_eq!(v.step(&[s("a", "idle")], 0, 10 * M), Step::Nothing, "quiet window restarts from the busy tick");
        assert_eq!(v.step(&[s("a", "idle")], 0, 11 * M), Step::Countdown { deadline: false });
        // A transcript write during the countdown fails the re-check at its end.
        assert_eq!(v.step(&[s("a", "idle")], 12 * M, 13 * M), Step::Resumed);
    }

    #[test]
    fn deadline_forces_a_countdown() {
        let mut v = Vigil::default();
        v.arm(0, Some(30 * M));
        let busy = [s("a", "busy")];
        assert_eq!(v.step(&busy, 0, 29 * M), Step::Nothing);
        assert_eq!(v.step(&busy, 0, 30 * M), Step::Countdown { deadline: true });
        assert_eq!(v.step(&busy, 0, 31 * M), Step::Nothing, "forced: busy does not resume");
        assert_eq!(v.step(&busy, 0, 32 * M), Step::Fire { last: None });
    }

    #[test]
    fn cancel_disarms_even_mid_countdown() {
        let mut v = Vigil::default();
        assert!(!v.cancel());
        v.arm(0, None);
        v.step(&[], 0, 5 * M);
        assert!(v.cancel());
        assert_eq!(v.state(), &VigilState::default());
        assert_eq!(v.step(&[], 0, 7 * M), Step::Nothing);
    }
}
