//! The toasts' wording, from the active theme: the UI pushes it (`set_toast_text`, app.js applyChrome) at start and on
//! every theme change, so a setting other than the 40k scriptorium says "Request from …" instead of "Petition from …".
//! Tier II's wording until then.

use std::sync::Mutex;

/// Title templates (`{name}`: the session's name) and the body's fallback when a petition names no tool.
#[derive(Clone, Debug, PartialEq)]
pub struct Text {
    pub petition: String,
    pub question: String,
    pub stale: String,
    pub needed: String,
    pub limit: String,
    pub limit_many: String,
    pub failed: String,
}

impl Default for Text {
    fn default() -> Self {
        Text {
            petition: "Petition from {name}".into(),
            question: "Question from {name}".into(),
            stale: "Petition still waiting: {name}".into(),
            needed: "input needed".into(),
            limit: "{name} sealed until {time}".into(),
            limit_many: "{n} sessions sealed until {time}".into(),
            failed: "{name}: open the terminal".into(),
        }
    }
}

static TEXT: Mutex<Option<Text>> = Mutex::new(None);

/// A template longer than this is cut (the UI's own theme strings; a toast title is one line anyway).
const MAX: usize = 120;

/// Replaces the wording; an empty or over-long field keeps Tier II's for that field.
pub fn set(new: Text) {
    let d = Text::default();
    let pick = |v: String, d: String| if v.trim().is_empty() || v.chars().count() > MAX { d } else { v };
    let t = Text {
        petition: pick(new.petition, d.petition),
        question: pick(new.question, d.question),
        stale: pick(new.stale, d.stale),
        needed: pick(new.needed, d.needed),
        limit: pick(new.limit, d.limit),
        limit_many: pick(new.limit_many, d.limit_many),
        failed: pick(new.failed, d.failed),
    };
    *TEXT.lock().unwrap_or_else(|e| e.into_inner()) = Some(t);
}

/// The current wording.
pub fn get() -> Text {
    TEXT.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or_default()
}

/// `{name}` in a template -> the session's name.
pub fn fill(template: &str, name: &str) -> String {
    template.replace("{name}", name)
}

/// A usage-limit wave's toast title: `limit` for one session, `limit_many` ({n}) for several; {time} the reset.
pub fn limit_title(t: &Text, names: &[&str], time: &str) -> String {
    let tpl = if names.len() == 1 { &t.limit } else { &t.limit_many };
    tpl.replace("{name}", names.first().copied().unwrap_or("")).replace("{n}", &names.len().to_string()).replace("{time}", time)
}

/// "14:00" in local time.
pub fn hhmm(ms: i64) -> String {
    use chrono::TimeZone;
    chrono::Local.timestamp_millis_opt(ms).single().map(|d| d.format("%H:%M").to_string()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wording() {
        assert_eq!(fill(&Text::default().petition, "api"), "Petition from api");
        assert_eq!(fill("{name} needs you", "api"), "api needs you");
        assert_eq!(fill("No placeholder", "api"), "No placeholder");
        set(Text { petition: "Request from {name}".into(), question: "".into(), stale: "x".repeat(MAX + 1), needed: "approval".into(), ..Text::default() });
        let t = get();
        assert_eq!(t.petition, "Request from {name}");
        assert_eq!(t.question, Text::default().question, "empty keeps Tier II");
        assert_eq!(t.stale, Text::default().stale, "over-long keeps Tier II");
        assert_eq!(t.needed, "approval");
        set(Text::default());
        assert_eq!(get(), Text::default());
    }

    #[test]
    fn limit_wording() {
        let t = Text::default();
        assert_eq!(limit_title(&t, &["api"], "14:00"), "api sealed until 14:00");
        assert_eq!(limit_title(&t, &["api", "web", "db"], "14:00"), "3 sessions sealed until 14:00");
    }
}
