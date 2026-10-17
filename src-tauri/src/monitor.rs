//! Monitoring: the per-session daily token alert, stuck sessions, and where the day report goes. The rules are pure;
//! the poll loop (main.rs) and the Night Vigil (vigil/app.rs) act on them. The config comes from the saved settings,
//! read at setup and again on every save, so the UI pushes nothing.
use crate::chronicle::{SessionTithe, Tithe};
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

    #[test]
    fn tokens_are_written_short() {
        assert_eq!([fmt_tokens(999), fmt_tokens(1_000), fmt_tokens(12_345), fmt_tokens(5_000_000), fmt_tokens(1_260_000_000)], ["999", "1k", "12.3k", "5M", "1.3B"]);
    }
}
