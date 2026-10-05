#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod chronicle;
mod demo;
mod registry;

use chronicle::{Chronicle, DaySummary, Event, Tithe};
use registry::{Session, Tracker};
use std::{
    collections::HashMap,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicI64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, State,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn no_window(mut cmd: Command) -> Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Run `orca <args>` through `run` (spawn or output): "orca" on PATH first, the known install
/// path if that's not resolvable. Args go straight to the process, never through a shell.
fn orca<T>(args: &[&str], run: impl Fn(&mut Command) -> std::io::Result<T>) -> Result<T, String> {
    let with = |exe: String| {
        let mut cmd = no_window(Command::new(exe));
        cmd.args(args);
        run(&mut cmd)
    };
    with("orca".into()).or_else(|_| {
        let fallback = std::env::var("LOCALAPPDATA")
            .map(|l| format!("{l}\\Programs\\orca\\resources\\bin\\orca.exe"))
            .map_err(|_| "orca not found".to_string())?;
        with(fallback).map_err(|e| e.to_string())
    })
}

/// Switch Orca's foreground terminal to `handle`, or open `url` in the default browser. `target`
/// is "orca:<handle>" or "web:<url>"; both branches validate before touching the shell so a
/// malformed roster entry can never inject arguments.
#[tauri::command]
fn open_session(target: String) -> Result<(), String> {
    if let Some(handle) = target.strip_prefix("orca:") {
        if !registry::valid_orca_handle(handle) {
            return Err("invalid orca handle".into());
        }
        orca(&["terminal", "switch", "--terminal", handle], |c| c.spawn())?;
        Ok(())
    } else if let Some(url) = target.strip_prefix("web:") {
        if !registry::valid_claude_web_url(url) {
            return Err("invalid claude.ai url".into());
        }
        no_window(Command::new("cmd")).args(["/c", "start", "", url]).spawn().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("unknown target kind".into())
    }
}

/// Answer the Claude Code permission dialog in Orca terminal `handle`: "yes", "always" or "no".
/// Types exactly one option digit, and only after the rendered screen shows that dialog at its
/// bottom (see `registry::parse_permission_prompt`); nothing read from the screen is ever sent
/// or echoed back except that digit. Errors are fixed strings. Runs off the main thread (async).
#[tauri::command(async)]
fn answer_petition(handle: String, choice: String) -> Result<(), String> {
    if !registry::valid_orca_handle(&handle) {
        return Err("invalid orca handle".into());
    }
    let out = orca(&["terminal", "read", "--terminal", &handle, "--screen", "--json"], |c| c.output())?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| "unreadable terminal".to_string())?;
    let term = &v["result"]["terminal"];
    if v["ok"] != true || term["source"] != "screen" {
        return Err("terminal screen unavailable".into());
    }
    let screen = term["tail"].as_array().map(|l| l.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    let p = registry::parse_permission_prompt(&screen).ok_or("no permission prompt on screen")?;
    let n = match choice.as_str() {
        "yes" => p.yes,
        "always" => p.always.ok_or("this prompt has no 'always' option")?,
        "no" => p.no,
        _ => return Err("unknown choice".into()),
    };
    let key = char::from(b'0' + n).to_string(); // 1..=9, guaranteed by the parser
    let sent = orca(&["terminal", "send", "--terminal", &handle, "--text", &key, "--json"], |c| c.output())?;
    if !sent.status.success() {
        return Err("orca could not type into the terminal".into());
    }
    Ok(())
}

type Chron = Mutex<Chronicle>;

fn now_ms() -> i64 {
    SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

/// Chronicon events of one local day ("YYYY-MM-DD"), oldest first.
#[tauri::command]
fn chronicle_day(day: String, chron: State<Chron>) -> Result<Vec<Event>, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    let dir = chron.lock().map_err(|_| "chronicle unavailable")?.dir().to_path_buf();
    Ok(chronicle::read_events(&dir, &day))
}

/// Tithe (tokens + working time) of one local day; today's is live.
#[tauri::command]
fn tithe_day(day: String, chron: State<Chron>) -> Result<Tithe, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    Ok(chron.lock().map_err(|_| "chronicle unavailable")?.tithe_of(&day))
}

/// Today and the 6 previous days, newest first.
#[tauri::command]
fn chronicle_days(chron: State<Chron>) -> Result<Vec<DaySummary>, String> {
    Ok(chron.lock().map_err(|_| "chronicle unavailable")?.days(now_ms()))
}

/// Stale-petition mark in ms, set from the settings panel (default `registry::STALE_MS`).
static STALE_MS: AtomicI64 = AtomicI64::new(registry::STALE_MS);

#[tauri::command]
fn set_stale_minutes(minutes: u32) {
    STALE_MS.store(i64::from(minutes.clamp(1, 120)) * 60_000, Ordering::Relaxed);
}

/// "Start at login": `enable` = None reads it. Keeps the tray check item in step.
#[tauri::command]
fn start_at_login(enable: Option<bool>, app: AppHandle, login: State<CheckMenuItem<tauri::Wry>>) -> Result<bool, String> {
    let al = app.autolaunch();
    match enable {
        Some(true) => al.enable(),
        Some(false) => al.disable(),
        None => Ok(()),
    }
    .map_err(|e| e.to_string())?;
    let on = al.is_enabled().map_err(|e| e.to_string())?;
    let _ = login.set_checked(on);
    Ok(on)
}

fn claude_dir() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join(".claude")
}

fn main() {
    let demo = std::env::args().any(|a| a == "--demo") || std::env::var("ADMINISTRATUM_DEMO").is_ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![open_session, answer_petition, chronicle_day, tithe_day, chronicle_days, set_stale_minutes, start_at_login])
        .setup(move |app| {
            build_tray(app)?;
            // Demo mode keeps a throwaway chronicle of its own, wiped at each start.
            let dir = app.path().app_data_dir()?.join(if demo { "chronicon-demo" } else { "chronicon" });
            app.manage::<Chron>(Mutex::new(Chronicle::open(dir, now_ms(), demo)));
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Administratum")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Ok(c) = app.state::<Chron>().lock() {
                    c.flush();
                }
            }
        });
}

fn poll_loop(app: AppHandle, demo: bool) {
    let dir = claude_dir();
    let mut sys = System::new();
    let mut tracker = Tracker::default();
    let mut prev: Vec<Session> = Vec::new();
    let start = Instant::now();
    let projects = dir.join("projects");
    let mut first = true;
    let mut last_tick = Instant::now();
    let mut last_t = 0;
    // Orca terminal handle per pid, cached: environ() is only ever refreshed for a pid we haven't
    // seen yet (never for the whole process list every tick). Evicted when a pid disappears.
    let mut orca_cache: HashMap<u32, Option<String>> = HashMap::new();
    loop {
        let roster = if demo {
            demo::roster(start.elapsed().as_secs())
        } else {
            // We only need liveness + name, not the CPU/mem/disk/exe sampling `refresh_processes` does by default.
            sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
            let alive_pids: std::collections::HashSet<u32> = sys
                .processes()
                .iter()
                .filter(|(_, p)| p.name().to_string_lossy().eq_ignore_ascii_case("claude.exe"))
                .map(|(pid, _)| pid.as_u32())
                .collect();
            let alive = |pid: u32| alive_pids.contains(&pid);
            orca_cache.retain(|&pid, _| alive(pid));
            let orca_handle = |pid: u32| -> Option<String> {
                if let Some(cached) = orca_cache.get(&pid) {
                    return cached.clone();
                }
                sys.refresh_processes_specifics(
                    ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
                    true,
                    ProcessRefreshKind::nothing().with_environ(UpdateKind::Always),
                );
                let handle = sys.process(Pid::from_u32(pid)).and_then(|p| {
                    p.environ().iter().find_map(|e| e.to_str()?.strip_prefix("ORCA_TERMINAL_HANDLE=").map(str::to_string))
                });
                orca_cache.insert(pid, handle.clone());
                handle
            };
            let scanned = registry::scan(
                &dir.join("sessions"),
                alive,
                |id, cwd, tail| registry::read_transcript_tail(&dir.join("projects"), id, cwd, tail),
                |id, cwd| registry::active_helpers(&dir.join("projects").join(registry::slug(cwd)).join(id).join("subagents"), SystemTime::now()),
                orca_handle,
            );
            let mut roster = registry::merge(&prev, scanned);
            let now_ms = now_ms();
            registry::track_compaction(&prev, &mut roster, now_ms);
            roster
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
        let now_ms = now_ms();
        // ponytail: the tracker compares against registry::STALE_MS; shifting "now" applies the user's mark.
        let shift = registry::STALE_MS - STALE_MS.load(Ordering::Relaxed);
        for s in tracker.stale_petitions(&roster, now_ms + shift) {
            let _ = app
                .notification()
                .builder()
                .title(format!("Petition still waiting: {}", s.name))
                .body(format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| "input needed".into())))
                .show();
            let _ = app.emit("petition-stale", &s);
        }
        {
            let now = now_ms;
            let elapsed = (last_tick.elapsed().as_millis() as u64).min(5_000); // a sleep/resume gap is not work
            last_tick = Instant::now();
            let chron = app.state::<Chron>();
            let mut c = chron.lock().unwrap_or_else(|e| e.into_inner());
            let mut events = if demo {
                let t = start.elapsed().as_secs();
                for (dept, u) in demo::usage(&roster, now) {
                    c.add_usage(&dept, &u);
                }
                let ev = demo::chronicle(last_t, t, &roster, now);
                last_t = t;
                ev
            } else {
                c.read_transcripts(&projects, &roster, now)
            };
            if !first {
                events.extend(chronicle::lifecycle(&prev, &roster, now));
            }
            c.add_busy(&roster, elapsed, now);
            for e in &events {
                c.record(e);
                // The first scan backfills today; only fresh events play live in the scene.
                if now - e.ts < 120_000 {
                    let _ = app.emit("chronicle", e);
                }
            }
            c.maybe_flush(now);
            first = false;
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
    app.manage(login);
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
                let on = al.is_enabled().unwrap_or(false);
                let _ = app.state::<CheckMenuItem<tauri::Wry>>().set_checked(on);
                let _ = app.emit("autostart", on);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
