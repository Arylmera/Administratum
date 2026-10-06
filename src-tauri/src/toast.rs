//! The toasts' wording, from the active theme: the UI pushes it (`set_toast_text`, app.js applyChrome) at start and on
//! every theme change, so a setting other than the 40k scriptorium says "Request from …" instead of "Petition from …".
//! Tier II's wording until then.

use crate::registry::Session;
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

/// A toast button's argument: `<yes|no>:<since_ms>:<session id>` (the episode, so a click on an old toast is ignored).
pub fn action_arg(choice: &str, since_ms: i64, id: &str) -> String {
    format!("{choice}:{since_ms}:{id}")
}

/// `action_arg` back; anything else (another choice, a malformed or empty part) -> None.
pub fn parse_action(arg: &str) -> Option<(&str, i64, &str)> {
    let mut parts = arg.split(':');
    let (choice, since, id) = (parts.next()?, parts.next()?.parse().ok()?, parts.next()?);
    (matches!(choice, "yes" | "no") && !id.is_empty() && parts.next().is_none()).then_some((choice, since, id))
}

/// Whether a petition toast gets Approve / Deny: a permission prompt in an Orca terminal (as the card's `answerable`).
pub fn has_buttons(s: &Session) -> bool {
    s.status == "waiting" && s.orca.is_some() && s.waiting_for.as_deref().is_some_and(|w| {
        let w = w.to_ascii_lowercase();
        w.contains("approve") || w.contains("permission")
    })
}

/// The Orca handle to answer through, only while the toast's petition is still open: same session, same episode,
/// still a permission prompt in Orca. Otherwise (answered in the terminal, gone) None: nothing is typed.
pub fn still_open<'a>(roster: &'a [Session], id: &str, since_ms: i64) -> Option<&'a str> {
    roster.iter().find(|s| s.id == id && s.since_ms == since_ms).filter(|s| has_buttons(s)).and_then(|s| s.orca.as_deref())
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

    #[test]
    fn button_arguments() {
        let a = action_arg("yes", 1700, "4c3c217f-6b90");
        assert_eq!(a, "yes:1700:4c3c217f-6b90");
        assert_eq!(parse_action(&a), Some(("yes", 1700, "4c3c217f-6b90")));
        assert_eq!(parse_action("no:5:abc"), Some(("no", 5, "abc")));
        assert_eq!(parse_action("always:5:abc"), None, "only yes / no from a toast");
        assert_eq!(parse_action("yes:x:abc"), None);
        assert_eq!(parse_action("yes:5:"), None);
        assert_eq!(parse_action("yes:5:a:b"), None);
        assert_eq!(parse_action(""), None);
    }

    #[test]
    fn buttons_only_for_open_orca_permission_prompts() {
        use crate::registry::{tests_session, Session};
        let p = Session { status: "waiting".into(), since_ms: 9, orca: Some("term_ab".into()), waiting_for: Some("approve Bash".into()), ..tests_session("s") };
        assert!(has_buttons(&p));
        assert!(!has_buttons(&Session { orca: None, ..p.clone() }), "not in Orca");
        assert!(!has_buttons(&Session { waiting_for: Some("input needed".into()), ..p.clone() }), "free-text petition");
        let roster = vec![p.clone()];
        assert_eq!(still_open(&roster, "s", 9), Some("term_ab"));
        assert_eq!(still_open(&roster, "s", 8), None, "another episode");
        assert_eq!(still_open(&[Session { status: "busy".into(), ..p.clone() }], "s", 9), None, "already answered");
        assert_eq!(still_open(&[], "s", 9), None, "gone");
    }
}
