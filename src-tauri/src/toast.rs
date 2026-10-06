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
}

impl Default for Text {
    fn default() -> Self {
        Text {
            petition: "Petition from {name}".into(),
            question: "Question from {name}".into(),
            stale: "Petition still waiting: {name}".into(),
            needed: "input needed".into(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wording() {
        assert_eq!(fill(&Text::default().petition, "api"), "Petition from api");
        assert_eq!(fill("{name} needs you", "api"), "api needs you");
        assert_eq!(fill("No placeholder", "api"), "No placeholder");
        set(Text { petition: "Request from {name}".into(), question: "".into(), stale: "x".repeat(MAX + 1), needed: "approval".into() });
        let t = get();
        assert_eq!(t.petition, "Request from {name}");
        assert_eq!(t.question, Text::default().question, "empty keeps Tier II");
        assert_eq!(t.stale, Text::default().stale, "over-long keeps Tier II");
        assert_eq!(t.needed, "approval");
        set(Text::default());
        assert_eq!(get(), Text::default());
    }
}
