//! The Night Vigil in the app: arming (tray, commands, toast, remote), its Chronicon events, its toast, the shutdown.
use crate::{chronicle, chronicle::Event, emit, monitor, now_ms, registry::Session, settings, settings_path, status, toast, vigil, Chron};
use std::{process::Command, sync::Mutex};
use tauri::{menu::CheckMenuItem, AppHandle, Manager};

pub type VigilBox = Mutex<vigil::Vigil>;
pub struct VigilItem(pub CheckMenuItem<tauri::Wry>);

/// The deadline (`adm.vigilDeadline`, minutes after midnight; empty or unparsable: none), as a time after `now`.
fn vigil_deadline(v: &serde_json::Value, now: i64) -> Option<i64> {
    use chrono::Timelike;
    let target: u16 = v["adm.vigilDeadline"].as_str()?.parse().ok().filter(|m| *m < 1440)?;
    let n = chrono::Local::now();
    Some(vigil::deadline_after(now, (n.hour() * 60 + n.minute()) as u16, target))
}

/// Arm or cancel the Night Vigil (tray, commands, toast, remote). Records the Chronicon event and syncs the tray.
pub fn vigil_set(app: &AppHandle, arm: bool) {
    let now = now_ms();
    let changed = {
        let vigil = app.state::<VigilBox>();
        let mut v = crate::lock(&vigil);
        if arm {
            let saved = settings_path(app).map(|p| settings::load(&p)).unwrap_or_default();
            v.arm(now, vigil_deadline(&saved, now))
        } else {
            v.cancel()
        }
    };
    if changed {
        vigil_event(app, now, if arm { "armed" } else { "cancelled" });
        if arm {
            use chrono::Timelike;
            let n = chrono::Local::now();
            *crate::lock(&REPORT_DAY) = Some(vigil::report_day(n.date_naive(), n.hour()));
            capture(app, now);
        }
    }
    if let Some(item) = app.try_state::<VigilItem>() {
        let _ = item.0.set_checked(arm);
    }
}

/// The day the end-of-day report covers, fixed when the vigil arms (`report_day`) and reused when it fires.
static REPORT_DAY: Mutex<Option<String>> = Mutex::new(None);

/// Writes the day report into the folder the user chose, only when they turned it on (monitor.rs `report_dir`).
/// A failure is logged and recorded in the Chronicon; nothing else is written anywhere.
fn capture(app: &AppHandle, now: i64) {
    let (Some(dir), Some(day)) = (monitor::get().report_dir, crate::lock(&REPORT_DAY).clone()) else { return };
    let chron = app.state::<Chron>();
    let (cdir, live) = {
        let c = crate::lock(&chron);
        c.flush();
        c.snapshot()
    };
    let r = chronicle::report(&day, &chronicle::tithe_of(&cdir, &live, &day), &chronicle::read_events(&cdir, &day));
    if let Err(e) = chronicle::write_capture(&dir, &r) {
        status::report("vigil", status::State::Warn, format!("day report: {e}"));
        vigil_event(app, now, &report_failed_detail(&e));
    }
}

/// The Chronicon event for a failed report. Events reach paired remote devices, so it must carry no folder path.
fn report_failed_detail(_e: &str) -> String {
    "report not written (folder missing or not writable)".into()
}

fn vigil_event(app: &AppHandle, now: i64, detail: &str) {
    let e = Event { ts: now, kind: "vigil".into(), session_id: String::new(), name: String::new(), dept: String::new(), helper: None, detail: detail.into(), reset_ms: None, hit_ms: None };
    crate::lock(&app.state::<Chron>()).record(&e);
    emit(app, "chronicle", &e);
}

#[tauri::command]
pub fn vigil_arm(app: AppHandle) {
    vigil_set(&app, true);
}

#[tauri::command]
pub fn vigil_cancel(app: AppHandle) {
    vigil_set(&app, false);
}

/// The command that shuts the machine down.
fn shutdown_command() -> Command {
    #[cfg(windows)]
    let mut cmd = crate::no_window(Command::new("shutdown"));
    #[cfg(windows)]
    cmd.args(["/s", "/f", "/t", "0", "/c", "Administratum: Night Vigil"]);
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("/usr/bin/osascript");
    #[cfg(target_os = "macos")]
    cmd.args(["-e", r#"tell application "System Events" to shut down"#]);
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut cmd = Command::new("systemctl");
    #[cfg(not(any(windows, target_os = "macos")))]
    cmd.arg("poweroff");
    cmd
}

/// Why the shutdown command did not do its job: it did not start, or it exited with a failure. None when it ran well.
fn shutdown_failure(result: std::io::Result<std::process::ExitStatus>) -> Option<String> {
    match result {
        Ok(s) if s.success() => None,
        Ok(s) => Some(format!("the shutdown command exited with {s}")),
        Err(e) => Some(e.to_string()),
    }
}

/// The real shutdown. Never called in demo mode or from a test. On macOS through System Events: the first time,
/// macOS asks for the Automation permission, and an app may still veto the shutdown (unsaved work). The command's
/// exit is waited for off the poll thread (macOS may wait on that dialog); a failure is recorded in the status
/// store and the log, and in the Chronicon, so the morning does not show a PC that was meant to be off and is not.
fn shutdown_now(app: AppHandle) {
    std::thread::spawn(move || match shutdown_failure(shutdown_command().status()) {
        None => status::report("vigil", status::State::Ok, "shutdown requested"),
        Some(e) => {
            status::report("vigil", status::State::Error, format!("shutdown failed: {e}"));
            vigil_event(&app, now_ms(), "shutdown failed");
        }
    });
}

/// The countdown toast with a Cancel button. Ignores quiet hours.
fn vigil_toast(app: &AppHandle, deadline: bool) {
    let title = if deadline { "Night Vigil: deadline reached" } else { "Night Vigil: all sessions are done" };
    let handle = app.clone();
    toast::with_buttons(app, title, "The PC shuts down in 2 minutes.", &[("Cancel", "vigil-cancel")], move |arg| {
        if arg == Some("vigil-cancel") {
            vigil_set(&handle, false);
        }
    });
}

/// One poll tick of the Night Vigil: step it with the roster and the newest transcript write, run what it returns
/// (Chronicon event, countdown toast, the shutdown), then emit its state to the UI.
pub fn tick(app: &AppHandle, roster: &[Session], last_write: i64, now_ms: i64, demo: bool) {
    let step = crate::lock(&app.state::<VigilBox>()).step(roster, last_write, now_ms);
    match step {
        vigil::Step::Countdown { deadline } => {
            if deadline {
                vigil_event(app, now_ms, "deadline");
            }
            vigil_toast(app, deadline);
        }
        vigil::Step::Resumed => vigil_event(app, now_ms, "resumed"),
        vigil::Step::Fire { last } => {
            vigil_event(app, now_ms, &last.map_or_else(|| "fired".to_string(), |n| format!("fired · {n}")));
            capture(app, now_ms); // flushes the chronicle too
            crate::lock(&app.state::<Chron>()).flush();
            if let Some(item) = app.try_state::<VigilItem>() {
                let _ = item.0.set_checked(false);
            }
            if demo {
                status::note("vigil", "demo mode, no shutdown");
            } else {
                shutdown_now(app.clone());
            }
        }
        vigil::Step::Nothing => {}
    }
    let vigil_state = crate::lock(&app.state::<VigilBox>()).state().clone();
    emit(app, "vigil", vigil_state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vigil_deadline_reads_the_setting() {
        assert_eq!(vigil_deadline(&serde_json::json!({}), 0), None);
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": ""}), 0), None);
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "1440"}), 0), None);
        assert!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "240"}), 0).is_some_and(|d| d > 0 && d <= 1440 * 60_000));
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "oops"}), 0), None);
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "-5"}), 0), None);
    }

    fn exit(code: i32) -> std::process::ExitStatus {
        #[cfg(windows)]
        {
            std::os::windows::process::ExitStatusExt::from_raw(code as u32)
        }
        #[cfg(unix)]
        {
            std::os::unix::process::ExitStatusExt::from_raw(code << 8)
        }
    }

    #[test]
    fn a_shutdown_that_did_not_work_is_a_failure() {
        assert_eq!(shutdown_failure(Ok(exit(0))), None);
        let failed = shutdown_failure(Ok(exit(5))).expect("a non-zero exit fails");
        assert!(failed.contains("exited with") && failed.contains('5'), "{failed}");
        let missing = shutdown_failure(Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no such command"))).expect("a command that did not start fails");
        assert_eq!(missing, "no such command");
    }

    #[test]
    fn report_failure_event_leaks_no_path() {
        let e = r"not an existing absolute folder: C:\Users\secret\reports"; // write_capture's error
        let d = report_failed_detail(e);
        assert!(!d.contains("secret"), "{d}");
    }
}
