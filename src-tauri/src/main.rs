#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod demo;
mod registry;

use registry::{Session, Tracker};
use std::{path::PathBuf, thread, time::{Duration, Instant, SystemTime}};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

fn claude_dir() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join(".claude")
}

fn main() {
    let demo = std::env::args().any(|a| a == "--demo") || std::env::var("ADMINISTRATUM_DEMO").is_ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(move |app| {
            build_tray(app)?;
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Administratum");
}

fn poll_loop(app: AppHandle, demo: bool) {
    let dir = claude_dir();
    let mut sys = System::new();
    let mut tracker = Tracker::default();
    let mut prev: Vec<Session> = Vec::new();
    let start = Instant::now();
    loop {
        let roster = if demo {
            demo::roster(start.elapsed().as_secs())
        } else {
            // We only need liveness + name, not the CPU/mem/disk/exe sampling `refresh_processes` does by default.
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
            let alive = |pid: u32| {
                sys.process(Pid::from_u32(pid))
                    .map(|p| p.name().to_string_lossy().eq_ignore_ascii_case("claude.exe"))
                    .unwrap_or(false)
            };
            let scanned = registry::scan(
                &dir.join("sessions"),
                alive,
                |id, cwd, tail| registry::read_transcript_tail(&dir.join("projects"), id, cwd, tail),
                |id, cwd| registry::active_helpers(&dir.join("projects").join(registry::slug(cwd)).join(id).join("subagents"), SystemTime::now()),
            );
            registry::merge(&prev, scanned)
        };
        for s in tracker.new_petitions(&roster) {
            let _ = app
                .notification()
                .builder()
                .title(format!("Petition from {}", s.name))
                .body(format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| "input needed".into())))
                .show();
            let _ = app.emit("petition", &s);
        }
        // ponytail: emit every tick (a late-loading webview never misses state); diff if it ever shows in a profile.
        let _ = app.emit("roster", &roster);
        prev = roster;
        thread::sleep(Duration::from_secs(1));
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            let _ = app.emit("visible", false);
        } else {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = app.emit("visible", true);
        }
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show / hide", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "Toggle chime", true, None::<&str>)?;
    let light = MenuItem::with_id(app, "light", "Cycle lighting", true, None::<&str>)?;
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(app, "login", "Start at login", true, login_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mute, &light, &login, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Administratum")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => toggle_window(app),
            "mute" => {
                let _ = app.emit("ui-command", "mute");
            }
            "light" => {
                let _ = app.emit("ui-command", "light");
            }
            "login" => {
                let al = app.autolaunch();
                let _ = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
