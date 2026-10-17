//! Monitoring: the per-session daily token alert, stuck sessions, and where the day report goes. The rules are pure;
//! the poll loop (main.rs) and the Night Vigil (vigil/app.rs) act on them. The config comes from the saved settings,
//! read at setup and again on every save, so the UI pushes nothing.
use crate::chronicle::{SessionTithe, Tithe};
use crate::registry::{Session, Stuck};
use serde_json::Value;
use std::{collections::HashSet, path::PathBuf, sync::Mutex};

#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    /// New tokens (cache reads left out) one session may use in a day before a toast; None: off.
    pub token_alert: Option<u64>,
    pub stuck: bool,
    pub stuck_toast: bool,
    /// Busy with no transcript write for this long: stuck.
    pub stuck_ms: i64,
    /// This many identical tool calls in a row: stuck.
    pub stuck_repeat: u32,
    /// Where the day report is also written; None unless the user turned it on and named a folder.
    pub report_dir: Option<PathBuf>,
}

/// The config from the saved settings (`adm.*` strings), with defaults and ranges.
pub fn config_from(v: &Value) -> Config {
    let s = |k: &str| v[k].as_str().unwrap_or("").trim();
    let num = |k: &str, default: u32, lo: u32, hi: u32| s(k).parse().map_or(default, |n: u32| n.clamp(lo, hi));
    let dir = s("adm.reportDir");
    Config {
        token_alert: s("adm.tokenAlert").parse().ok().filter(|n| *n > 0),
        stuck: s("adm.stuck") != "0",
        stuck_toast: s("adm.stuckToast") != "0",
        stuck_ms: i64::from(num("adm.stuckMin", 15, 5, 120)) * 60_000,
        stuck_repeat: num("adm.stuckRepeat", 5, 3, 20),
        report_dir: (s("adm.reportOn") == "1" && !dir.is_empty()).then(|| PathBuf::from(dir)),
    }
}

static CONFIG: Mutex<Option<Config>> = Mutex::new(None);

pub fn set(c: Config) {
    *crate::lock(&CONFIG) = Some(c);
}

pub fn get() -> Config {
    crate::lock(&CONFIG).clone().unwrap_or_else(|| config_from(&Value::Null))
}

/// Sessions that passed the token alert today, so each toasts once per day.
#[derive(Default)]
pub struct Alerts {
    seen: HashSet<String>,
}

impl Alerts {
    /// (id, session) pairs of `tithe`'s day newly past `limit` new tokens.
    pub fn over(&mut self, tithe: &Tithe, limit: Option<u64>) -> Vec<(String, SessionTithe)> {
        let Some(limit) = limit else { return vec![] };
        let day = format!("{}:", tithe.day);
        self.seen.retain(|k| k.starts_with(&day));
        tithe.by_session.iter().filter(|(id, s)| s.fresh >= limit && self.seen.insert(format!("{day}{id}"))).map(|(id, s)| (id.clone(), s.clone())).collect()
    }
}

/// Whether `s` is stuck: busy (never at the shell, waiting or idle) and either looping (its last `stuck_repeat`
/// tool calls identical) or silent (no write to its transcripts, subagents' included, for `stuck_ms`). `last_write`:
/// None when it has no transcript files (OpenCode), which never counts as silent.
pub fn stuck_of(s: &Session, last_write: Option<i64>, cfg: &Config, now: i64) -> Option<Stuck> {
    if !cfg.stuck || s.status != "busy" {
        return None;
    }
    let turn = s.turn.as_ref();
    if let Some(r) = turn.and_then(|t| t.repeat.as_ref()).filter(|r| r.count >= cfg.stuck_repeat) {
        let since = turn.and_then(|t| t.started_ms).unwrap_or(0);
        return Some(Stuck { kind: "loop".into(), since_ms: since, tool: Some(r.tool.clone()), count: r.count });
    }
    let w = last_write.filter(|w| *w > 0 && now - w >= cfg.stuck_ms)?;
    Some(Stuck { kind: "silent".into(), since_ms: w, tool: None, count: 0 })
}

/// Stuck episodes (`id:kind:since`) already toasted, so each toasts once.
#[derive(Default)]
pub struct Episodes {
    seen: HashSet<String>,
}

impl Episodes {
    /// The sessions of `roster` whose stuck episode is new.
    pub fn fresh<'a>(&mut self, roster: &'a [Session]) -> Vec<&'a Session> {
        let mut now = HashSet::new();
        let mut out = vec![];
        for s in roster {
            let Some(st) = &s.stuck else { continue };
            let key = format!("{}:{}:{}", s.id, st.kind, st.since_ms);
            if !self.seen.contains(&key) {
                out.push(s);
            }
            now.insert(key);
        }
        self.seen = now;
        out
    }
}

/// What a stuck episode says: "silent 15m" / "loop Bash ×5".
pub fn stuck_detail(st: &Stuck, now: i64) -> String {
    match &st.tool {
        Some(tool) if st.kind == "loop" => format!("loop {tool} ×{}", st.count),
        _ => format!("silent {}m", (now - st.since_ms).max(0) / 60_000),
    }
}

/// 1234567 -> "1.2M", as the Chronicon writes token counts.
pub fn fmt_tokens(n: u64) -> String {
    let short = |v: f64, unit: &str| format!("{}{unit}", format!("{v:.1}").trim_end_matches(".0"));
    match n {
        1_000_000_000.. => short(n as f64 / 1e9, "B"),
        1_000_000.. => short(n as f64 / 1e6, "M"),
        1_000.. => short(n as f64 / 1e3, "k"),
        _ => n.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn config_defaults_and_clamps() {
        let c = config_from(&json!({}));
        assert_eq!(c, Config { token_alert: None, stuck: true, stuck_toast: true, stuck_ms: 900_000, stuck_repeat: 5, report_dir: None });
        assert_eq!(config_from(&Value::Null), c, "no settings file: the same defaults");
        assert_eq!(config_from(&json!({"adm.stuckMin": "1"})).stuck_ms, 300_000);
        assert_eq!(config_from(&json!({"adm.stuckMin": "oops"})).stuck_ms, 900_000);
        assert_eq!(config_from(&json!({"adm.stuckRepeat": "99"})).stuck_repeat, 20);
        assert_eq!(config_from(&json!({"adm.tokenAlert": "5000000"})).token_alert, Some(5_000_000));
        assert_eq!(config_from(&json!({"adm.tokenAlert": "0"})).token_alert, None);
        assert_eq!(config_from(&json!({"adm.tokenAlert": ""})).token_alert, None);
        assert!(!config_from(&json!({"adm.stuck": "0"})).stuck);
        assert_eq!(config_from(&json!({"adm.reportOn": "1", "adm.reportDir": r"D:\x"})).report_dir, Some(PathBuf::from(r"D:\x")));
        assert_eq!(config_from(&json!({"adm.reportOn": "0", "adm.reportDir": r"D:\x"})).report_dir, None, "off: never written");
        assert_eq!(config_from(&json!({"adm.reportOn": "1", "adm.reportDir": " "})).report_dir, None);
    }

    fn tithe(day: &str, fresh: &[(&str, u64)]) -> Tithe {
        let mut t = Tithe::new(day);
        for (id, n) in fresh {
            t.by_session.insert((*id).into(), SessionTithe { name: (*id).into(), dept: "Terra".into(), fresh: *n, total: *n * 10 });
        }
        t
    }

    #[test]
    fn alert_fires_once_per_session_per_day() {
        let mut a = Alerts::default();
        let ids = |v: Vec<(String, SessionTithe)>| v.into_iter().map(|(id, _)| id).collect::<Vec<_>>();
        assert_eq!(ids(a.over(&tithe("2026-10-17", &[("a", 100), ("b", 99)]), Some(100))), ["a"]);
        assert!(a.over(&tithe("2026-10-17", &[("a", 500)]), Some(100)).is_empty(), "same day, same session");
        assert_eq!(ids(a.over(&tithe("2026-10-17", &[("a", 500), ("b", 100)]), Some(100))), ["b"]);
        assert_eq!(ids(a.over(&tithe("2026-10-18", &[("a", 100)]), Some(100))), ["a"], "a new day");
        assert!(a.over(&tithe("2026-10-18", &[("c", 1_000_000)]), None).is_empty(), "off");
    }

    fn busy(status: &str, repeat: u32) -> Session {
        let turn = (repeat > 0).then(|| crate::registry::TurnSummary {
            started_ms: Some(7),
            repeat: Some(crate::registry::Repeat { tool: "Bash".into(), key: "k".into(), count: repeat, msg: "m".into() }),
            ..Default::default()
        });
        Session { status: status.into(), turn, ..crate::registry::tests_session("a") }
    }

    #[test]
    fn stuck_needs_busy() {
        let c = config_from(&json!({}));
        for st in ["shell", "waiting", "idle"] {
            assert_eq!(stuck_of(&busy(st, 9), Some(0), &c, 99_000_000), None, "{st}");
        }
        assert_eq!(stuck_of(&busy("busy", 9), Some(1), &config_from(&json!({"adm.stuck": "0"})), 99_000_000), None, "turned off");
    }

    #[test]
    fn silent_after_the_mark() {
        let c = config_from(&json!({}));
        let w = 1_000_000;
        assert_eq!(stuck_of(&busy("busy", 0), Some(w), &c, w + 899_999), None);
        assert_eq!(stuck_of(&busy("busy", 0), Some(w), &c, w + 900_000), Some(Stuck { kind: "silent".into(), since_ms: w, tool: None, count: 0 }));
        assert_eq!(stuck_of(&busy("busy", 0), None, &c, w * 100), None, "no transcript files (OpenCode): never silent");
    }

    #[test]
    fn loop_wins_over_silent() {
        let c = config_from(&json!({}));
        assert_eq!(stuck_of(&busy("busy", 4), Some(10), &c, 20), None, "4 of 5");
        let st = stuck_of(&busy("busy", 5), Some(1), &c, 99_000_000).unwrap();
        assert_eq!((st.kind.as_str(), st.since_ms, st.tool.as_deref(), st.count), ("loop", 7, Some("Bash"), 5));
        assert_eq!(stuck_detail(&st, 0), "loop Bash ×5");
        assert_eq!(stuck_detail(&Stuck { kind: "silent".into(), since_ms: 0, tool: None, count: 0 }, 960_000), "silent 16m");
    }

    #[test]
    fn one_toast_per_episode() {
        let mut e = Episodes::default();
        let stuck = |since| Session { stuck: Some(Stuck { kind: "silent".into(), since_ms: since, tool: None, count: 0 }), ..crate::registry::tests_session("a") };
        assert_eq!(e.fresh(&[stuck(1)]).len(), 1);
        assert!(e.fresh(&[stuck(1)]).is_empty(), "same episode");
        assert_eq!(e.fresh(&[stuck(2)]).len(), 1, "writes resumed, then a new silence");
        assert!(e.fresh(&[crate::registry::tests_session("a")]).is_empty());
        assert_eq!(e.fresh(&[stuck(2)]).len(), 1, "after it cleared, it is new again");
    }

    #[test]
    fn tokens_are_written_short() {
        assert_eq!([fmt_tokens(999), fmt_tokens(1_000), fmt_tokens(12_345), fmt_tokens(5_000_000), fmt_tokens(1_260_000_000)], ["999", "1k", "12.3k", "5M", "1.3B"]);
    }
}
