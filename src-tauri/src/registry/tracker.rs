//! Which petitions, questions and usage limits are new this tick: each notifies once per episode.
use super::Session;
use std::collections::{BTreeMap, HashSet};

/// Remembers open petition episodes (`id:since`) so each one notifies exactly once, and once more
/// when it goes stale.
#[derive(Default)]
pub struct Tracker {
    open: HashSet<String>,
    stale: HashSet<String>,
    asked: HashSet<String>,
    limits: HashSet<String>,
}

impl Tracker {
    pub fn new_petitions(&mut self, roster: &[Session]) -> Vec<Session> {
        let mut now = HashSet::new();
        let mut fresh = vec![];
        for s in roster.iter().filter(|s| s.status == "waiting") {
            let key = format!("{}:{}", s.id, s.since_ms);
            if !self.open.contains(&key) {
                fresh.push(s.clone());
            }
            now.insert(key);
        }
        self.open = now;
        fresh
    }

    /// Question episodes (`id:since` of a session with a `question`) seen for the first time.
    pub fn new_questions(&mut self, roster: &[Session]) -> Vec<Session> {
        let mut now = HashSet::new();
        let mut fresh = vec![];
        for s in roster.iter().filter(|s| s.question.is_some()) {
            let key = format!("{}:{}", s.id, s.since_ms);
            if !self.asked.contains(&key) {
                fresh.push(s.clone());
            }
            now.insert(key);
        }
        self.asked = now;
        fresh
    }

    /// Petitions that have just crossed `STALE_MS` of waiting, once per episode (`id:since`).
    /// A petition with no known start (`since_ms == 0`) never escalates.
    pub fn stale_petitions(&mut self, roster: &[Session], now_ms: i64) -> Vec<Session> {
        let waiting: Vec<_> = roster.iter().filter(|s| s.status == "waiting" && s.since_ms > 0).collect();
        let keys: HashSet<String> = waiting.iter().map(|s| format!("{}:{}", s.id, s.since_ms)).collect();
        self.stale.retain(|k| keys.contains(k));
        let mut out = vec![];
        for s in waiting {
            if now_ms - s.since_ms > STALE_MS && self.stale.insert(format!("{}:{}", s.id, s.since_ms)) {
                out.push(s.clone());
            }
        }
        out
    }

    /// Usage-limit waves seen for the first time, each the sessions sealed until the same reset (the message text when
    /// it names no hour): one toast per wave; a session joining a wave already toasted adds none.
    pub fn new_limits(&mut self, roster: &[Session]) -> Vec<Vec<Session>> {
        let mut waves: BTreeMap<String, Vec<Session>> = BTreeMap::new();
        for s in roster {
            if let Some(l) = &s.limit {
                waves.entry(l.reset_ms.map_or_else(|| l.text.clone(), |r| r.to_string())).or_default().push(s.clone());
            }
        }
        let fresh = waves.iter().filter(|(k, _)| !self.limits.contains(*k)).map(|(_, v)| v.clone()).collect();
        self.limits = waves.into_keys().collect();
        fresh
    }
}

pub const STALE_MS: i64 = 5 * 60 * 1000;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::testutil::*;
    use crate::registry::Limit;

    #[test]
    fn tracker_asks_once_per_question_episode() {
        let mut t = Tracker::default();
        let q = |since| Session { question: Some("ok?".into()), ..session("a", 1, "idle", since) };
        assert_eq!(t.new_questions(&[q(100)]).len(), 1);
        assert_eq!(t.new_questions(&[q(100)]).len(), 0, "same episode");
        assert_eq!(t.new_questions(&[session("a", 1, "busy", 200)]).len(), 0);
        assert_eq!(t.new_questions(&[q(300)]).len(), 1, "new episode");
        assert!(t.new_petitions(&[q(300)]).is_empty(), "a question is not a petition");
    }

    #[test]
    fn stale_petition_fires_once_after_five_minutes_per_episode() {
        let mut t = Tracker::default();
        let w = |since| [session("a", 1, "waiting", since)];
        assert!(t.stale_petitions(&w(1_000), 1_000 + 299_000).is_empty(), "not yet");
        assert_eq!(t.stale_petitions(&w(1_000), 1_000 + 301_000).len(), 1, "crossed 5 min");
        assert!(t.stale_petitions(&w(1_000), 1_000 + 900_000).is_empty(), "same episode");
        assert!(t.stale_petitions(&[session("a", 1, "busy", 2_000)], 2_000_000).is_empty());
        assert_eq!(t.stale_petitions(&w(3_000), 3_000 + 400_000).len(), 1, "new episode");
        assert!(t.stale_petitions(&w(0), 9_999_999).is_empty(), "unknown since never escalates");
    }

    #[test]
    fn tracker_fires_once_per_episode_and_again_on_a_new_one() {
        let mut t = Tracker::default();
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 1);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 0, "same episode");
        assert_eq!(t.new_petitions(&[session("a", 1, "busy", 200)]).len(), 0);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 300)]).len(), 1, "new episode");
    }

    #[test]
    fn limit_waves_toast_once() {
        let lim = |id: &str, reset: Option<i64>| Session { limit: Some(Limit { reset_ms: reset, text: "x".into() }), ..session(id, 1, "idle", 0) };
        let mut t = Tracker::default();
        let first = t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), session("c", 3, "busy", 0)]);
        assert_eq!(first.len(), 1, "one wave");
        assert_eq!(first[0].iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert!(t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), lim("c", Some(5))]).is_empty(), "joining a toasted wave: no toast");
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "a new reset time: a new wave");
        assert!(t.new_limits(&[]).is_empty());
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "after it ended, the same reset is new again");
    }
}
