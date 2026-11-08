//! The Hall of Honours: four marks over the kept days (today included), each held by a department. Ties: the latest
//! wins: for a count, the department whose last counted event is latest; for a day's value, the later day (and on the
//! same day, the department named last).
use super::{last_days, tithe_of, Event, Tithe, KEEP_DAYS};
use serde::Serialize;
use std::{collections::HashMap, fs, path::Path};

/// A petition answered within this long counts as a fast answer (events are stamped on poll ticks: ± one poll).
pub const FAST_MS: i64 = 60_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    pub dept: String,
    /// A count (commits, fast answers) or ms (longest turn, working time of the busiest day).
    pub value: u64,
    /// The busiest day's date ("YYYY-MM-DD"); none on the other marks.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub day: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Honours {
    /// Most commits (purity seals).
    pub commits: Option<Mark>,
    /// The longest single finished turn.
    pub longest: Option<Mark>,
    /// Most petitions answered within FAST_MS.
    pub fast: Option<Mark>,
    /// The busiest day by working time, with its date.
    pub busiest: Option<Mark>,
}

/// The best (ms, day index, dept) so far of a per-day mark.
type Best<'a> = Option<(u64, usize, &'a str)>;

/// The department with the highest (count, last ts): the latest wins a tie.
fn most(counts: HashMap<&str, (u64, i64)>) -> Option<Mark> {
    counts.into_iter().max_by_key(|&(d, (n, last))| (n, last, d)).map(|(d, (n, _))| Mark { dept: d.into(), value: n, day: None })
}

/// The marks of `days`, oldest first: each day's Tithe and its events in recorded order (one stream across days, so
/// a petition asked before midnight and answered after it still counts).
pub fn honours(days: &[(String, Tithe, Vec<Event>)]) -> Honours {
    let mut commits: HashMap<&str, (u64, i64)> = HashMap::new();
    let mut fast: HashMap<&str, (u64, i64)> = HashMap::new();
    let mut asked: HashMap<&str, i64> = HashMap::new(); // session id -> when its open petition was asked
    let (mut longest, mut busiest): (Best, Best) = (None, None);
    for (i, (_, t, events)) in days.iter().enumerate() {
        for e in events.iter().filter(|e| !e.dept.is_empty()) {
            match e.kind.as_str() {
                "commit" => {
                    let c = commits.entry(&e.dept).or_default();
                    *c = (c.0 + 1, e.ts);
                }
                "petition" => _ = asked.insert(&e.session_id, e.ts), // a second ask without an answer restarts the clock
                // the guard takes the open ask either way: a slow answer closes it too
                "petition-answered" if asked.remove(e.session_id.as_str()).is_some_and(|t0| e.ts - t0 <= FAST_MS) => {
                    let c = fast.entry(&e.dept).or_default();
                    *c = (c.0 + 1, e.ts);
                }
                "left" => _ = asked.remove(e.session_id.as_str()), // left while waiting: never answered
                _ => {}
            }
        }
        // `>=` over name order and oldest-first days: a tie goes to the later day, then the name last in order.
        for (d, s) in &t.by_project {
            if s.max_turn_ms > 0 && longest.is_none_or(|(ms, _, _)| s.max_turn_ms >= ms) {
                longest = Some((s.max_turn_ms, i, d));
            }
            if s.busy_ms > 0 && busiest.is_none_or(|(ms, _, _)| s.busy_ms >= ms) {
                busiest = Some((s.busy_ms, i, d));
            }
        }
    }
    Honours {
        commits: most(commits),
        longest: longest.map(|(ms, _, d)| Mark { dept: d.into(), value: ms, day: None }),
        fast: most(fast),
        busiest: busiest.map(|(ms, i, d)| Mark { dept: d.into(), value: ms, day: Some(days[i].0.clone()) }),
    }
}

/// `day`'s events the marks read; other lines are skipped before parsing.
fn honour_events(dir: &Path, day: &str) -> Vec<Event> {
    let text = fs::read_to_string(dir.join(format!("{day}.jsonl"))).unwrap_or_default();
    let wanted = |l: &&str| ["\"kind\":\"commit\"", "\"kind\":\"petition", "\"kind\":\"left\""].iter().any(|k| l.contains(k));
    text.lines().filter(wanted).filter_map(|l| serde_json::from_str(l).ok()).collect()
}

/// The marks of the kept days at `now_ms` (the live Tithe for today).
pub fn honours_of(dir: &Path, live: &Tithe, now_ms: i64) -> Honours {
    let days: Vec<(String, Tithe, Vec<Event>)> = last_days(now_ms, KEEP_DAYS).into_iter().rev().map(|d| (d.clone(), tithe_of(dir, live, &d), honour_events(dir, &d))).collect();
    honours(&days)
}

#[cfg(test)]
mod tests {
    use super::super::Share;
    use super::*;

    fn ev(kind: &str, session: &str, dept: &str, ts: i64) -> Event {
        Event { ts, kind: kind.into(), session_id: session.into(), name: session.into(), dept: dept.into(), helper: None, detail: String::new(), reset_ms: None, hit_ms: None }
    }

    fn day(name: &str, depts: &[(&str, u64, u64)], events: Vec<Event>) -> (String, Tithe, Vec<Event>) {
        let mut t = Tithe::new(name);
        for &(d, busy_ms, max_turn_ms) in depts {
            t.by_project.insert(d.into(), Share { busy_ms, max_turn_ms, ..Default::default() });
        }
        (name.into(), t, events)
    }

    const S: i64 = 1000;

    #[test]
    fn an_empty_week_has_no_holders() {
        assert_eq!(honours(&[]), Honours::default());
        let quiet = day("2026-11-08", &[("Terra", 0, 0)], vec![ev("arrived", "a", "Terra", 0)]);
        assert_eq!(honours(&[quiet]), Honours::default(), "a department with nothing to its name holds nothing");
        let json = serde_json::to_value(Honours::default()).unwrap();
        assert_eq!(json, serde_json::json!({"commits": null, "longest": null, "fast": null, "busiest": null}));
    }

    #[test]
    fn commits_count_and_the_latest_wins_a_tie() {
        let d = day("2026-11-08", &[], vec![ev("commit", "a", "Terra", 1), ev("commit", "b", "Geneseed", 2), ev("commit", "a", "Terra", 3), ev("commit", "b", "Geneseed", 4)]);
        assert_eq!(honours(&[d]).commits, Some(Mark { dept: "Geneseed".into(), value: 2, day: None }), "2 each: Geneseed's last commit is later");
        let d = day("2026-11-08", &[], vec![ev("commit", "b", "Geneseed", 2), ev("commit", "a", "Terra", 3), ev("commit", "a", "Terra", 4), ev("commit", "b", "Geneseed", 9)]);
        assert_eq!(honours(&[d]).commits.unwrap().dept, "Geneseed");
        let d = day("2026-11-08", &[], vec![ev("commit", "a", "Terra", 1), ev("commit", "a", "Terra", 2), ev("commit", "b", "Geneseed", 9)]);
        assert_eq!(honours(&[d]).commits.unwrap(), Mark { dept: "Terra".into(), value: 2, day: None }, "more beats later");
    }

    #[test]
    fn fast_answers_within_a_minute() {
        let pair = |s: &str, dept: &str, t0: i64, wait: i64| [ev("petition", s, dept, t0), ev("petition-answered", s, dept, t0 + wait)];
        let mut e = vec![];
        e.extend(pair("a", "Terra", 0, 50 * S)); // 50 s: counts
        e.extend(pair("b", "Geneseed", 100 * S, 70 * S)); // 70 s: does not
        let h = honours(&[day("2026-11-08", &[], e)]);
        assert_eq!(h.fast, Some(Mark { dept: "Terra".into(), value: 1, day: None }));
        let only_slow = honours(&[day("2026-11-08", &[], pair("b", "Geneseed", 0, 70 * S).to_vec())]);
        assert_eq!(only_slow.fast, None, "70 s is not fast");
        let edge = honours(&[day("2026-11-08", &[], pair("b", "Geneseed", 0, FAST_MS).to_vec())]);
        assert_eq!(edge.fast.unwrap().value, 1, "exactly 60 s counts");
    }

    #[test]
    fn a_re_asked_petition_restarts_the_clock() {
        // asked at 0, asked again at 100 s, answered at 130 s: 30 s after the second ask
        let e = vec![ev("petition", "a", "Terra", 0), ev("petition", "a", "Terra", 100 * S), ev("petition-answered", "a", "Terra", 130 * S)];
        assert_eq!(honours(&[day("2026-11-08", &[], e)]).fast.unwrap().value, 1);
        // asked at 0, answered at 90 s with no second ask: slow
        let e = vec![ev("petition", "a", "Terra", 0), ev("petition-answered", "a", "Terra", 90 * S)];
        assert_eq!(honours(&[day("2026-11-08", &[], e)]).fast, None);
    }

    #[test]
    fn a_session_that_leaves_while_waiting_does_not_count() {
        // the same id seen again soon after (a resume) with a stale answer must not pair with the old ask
        let e = vec![ev("petition", "a", "Terra", 0), ev("left", "a", "Terra", 10 * S), ev("petition-answered", "a", "Terra", 20 * S)];
        assert_eq!(honours(&[day("2026-11-08", &[], e)]).fast, None);
    }

    #[test]
    fn a_pair_across_midnight_counts() {
        let a = day("2026-11-07", &[], vec![ev("petition", "a", "Terra", 0)]);
        let b = day("2026-11-08", &[], vec![ev("petition-answered", "a", "Terra", 40 * S)]);
        assert_eq!(honours(&[a, b]).fast.unwrap().value, 1);
    }

    #[test]
    fn longest_turn_and_busiest_day_per_department() {
        let a = day("2026-11-06", &[("Terra", 5_000_000, 900_000), ("Geneseed", 2_000_000, 1_200_000)], vec![]);
        let b = day("2026-11-07", &[("Terra", 3_000_000, 600_000), ("Hololith", 7_000_000, 300_000)], vec![]);
        let h = honours(&[a.clone(), b.clone()]);
        assert_eq!(h.longest, Some(Mark { dept: "Geneseed".into(), value: 1_200_000, day: None }));
        assert_eq!(h.busiest, Some(Mark { dept: "Hololith".into(), value: 7_000_000, day: Some("2026-11-07".into()) }));
        // ties: the later day wins
        let c = day("2026-11-08", &[("Terra", 7_000_000, 1_200_000)], vec![]);
        let h = honours(&[a, b, c]);
        assert_eq!(h.longest.unwrap().dept, "Terra");
        assert_eq!(h.busiest, Some(Mark { dept: "Terra".into(), value: 7_000_000, day: Some("2026-11-08".into()) }));
        let json = serde_json::to_value(&h.commits).unwrap();
        assert_eq!(json, serde_json::Value::Null);
    }

    #[test]
    fn honours_of_reads_the_kept_day_files() {
        let d = std::env::temp_dir().join(format!("adm-honours-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        let now = super::super::day_start("2026-11-08").unwrap() + 12 * 3_600_000;
        let lines = [ev("commit", "a", "Terra", now - 86_400_000), ev("arrived", "a", "Terra", now - 86_400_000)].map(|e| serde_json::to_string(&e).unwrap());
        fs::write(d.join("2026-11-07.jsonl"), lines.join("\n") + "\n").unwrap();
        let old = day("2026-10-30", &[("Old", 9_000_000, 9_000_000)], vec![]).1; // past the kept days: never read
        fs::write(d.join("2026-10-30.tithe.json"), serde_json::to_string(&old).unwrap()).unwrap();
        let live = day("2026-11-08", &[("Geneseed", 60_000, 60_000)], vec![]).1;
        let h = honours_of(&d, &live, now);
        assert_eq!(h.commits.unwrap().dept, "Terra");
        assert_eq!(h.busiest, Some(Mark { dept: "Geneseed".into(), value: 60_000, day: Some("2026-11-08".into()) }));
        let _ = fs::remove_dir_all(&d);
    }
}
