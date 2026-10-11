//! The toasts' wording, from the active theme: the UI pushes it (`set_toast_text`, chrome.js applyChrome) at start and on
//! every theme change, so a setting other than the 40k scriptorium says "Request from …" instead of "Petition from …".
//! Tier II's wording until then.

use crate::{orca::answer_petition, registry::Session, Live};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

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
    *crate::lock(&TEXT) = Some(t);
}

/// The current wording.
pub fn get() -> Text {
    crate::lock(&TEXT).clone().unwrap_or_default()
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
    s.status == "waiting"
        && s.orca.is_some()
        && s.waiting_for.as_deref().is_some_and(|w| {
            let w = w.to_ascii_lowercase();
            w.contains("approve") || w.contains("permission")
        })
}

/// The Orca handle to answer through, only while the toast's petition is still open: same session, same episode,
/// still a permission prompt in Orca. Otherwise (answered in the terminal, gone) None: nothing is typed.
pub fn still_open<'a>(roster: &'a [Session], id: &str, since_ms: i64) -> Option<&'a str> {
    roster.iter().find(|s| s.id == id && s.since_ms == since_ms).filter(|s| has_buttons(s)).and_then(|s| s.orca.as_deref())
}

/// The app id toasts show under: the installed app's identifier; PowerShell's in a dev build (the identifier is only
/// registered by the installer), as tauri-plugin-notification does.
#[cfg(windows)]
fn toast_app_id(app: &AppHandle) -> String {
    let dev = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|d| d.ends_with(std::path::Path::new("target").join("debug")) || d.ends_with(std::path::Path::new("target").join("release"))))
        .unwrap_or(false);
    if dev {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// A toast with buttons: a click calls `on_click` with the button's argument. Off Windows, or on a WinRT error, the
/// plugin's plain toast without them.
pub fn with_buttons(app: &AppHandle, title: &str, body: &str, buttons: &[(&str, &str)], on_click: impl Fn(Option<&str>) + Send + 'static) {
    #[cfg(windows)]
    {
        let toast = buttons.iter().fold(tauri_winrt_notification::Toast::new(&toast_app_id(app)).title(title).text1(body), |t, (label, arg)| t.add_button(label, arg));
        let shown = toast
            .on_activated(move |arg| {
                on_click(arg.as_deref());
                Ok(())
            })
            .show();
        if shown.is_ok() {
            return;
        }
    }
    #[cfg(not(windows))]
    let _ = (buttons, on_click);
    let _ = app.notification().builder().title(title).body(body).show();
}

/// A petition toast. A permission prompt in an Orca terminal gets Approve / Deny: a click answers through
/// `answer_petition` (the same screen check as the card), only while that petition is still open (still_open);
/// a failure shows a plain "open the terminal" toast. Anything else: the plugin's plain toast.
pub fn petition_toast(app: &AppHandle, s: &Session, title: String, body: String) {
    if !has_buttons(s) {
        let _ = app.notification().builder().title(title).body(body).show();
        return;
    }
    let (handle, name) = (app.clone(), s.name.clone());
    let (yes, no) = (action_arg("yes", s.since_ms, &s.id), action_arg("no", s.since_ms, &s.id));
    with_buttons(app, &title, &body, &[("Approve", &yes), ("Deny", &no)], move |arg| {
        let Some((choice, since, id)) = arg.and_then(parse_action) else { return };
        let open = handle.state::<Live>().lock().ok().and_then(|r| still_open(&r, id, since).map(str::to_string));
        if let Some(orca) = open {
            if let Err(e) = answer_petition(orca, choice.to_string()) {
                eprintln!("toast answer: {e}");
                let _ = handle.notification().builder().title(fill(&get().failed, &name)).show();
            }
        }
    });
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
