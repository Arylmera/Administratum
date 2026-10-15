#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod chronicle;
mod demo;
#[cfg(windows)]
mod firewall;
mod git;
mod orca;
mod poller;
mod quiet;
mod registry;
mod remote;
mod settings;
mod strip;
mod toast;
mod vigil;
mod window;

use chronicle::{Chronicle, DaySummary, Event, Tithe};
use registry::{Session, Tracker};
use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicI64, Ordering},
        Mutex, MutexGuard,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
use tauri::{menu::CheckMenuItem, AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Lock a mutex, poisoned or not: a panic elsewhere (a poll tick on untrusted input) must not wedge the app.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg_attr(not(windows), allow(unused_mut))]
fn no_window(mut cmd: Command) -> Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

type Chron = Mutex<Chronicle>;
/// The newest roster, for commands that act on a live session (open_folder, toast buttons).
type Live = Mutex<Vec<Session>>;

fn now_ms() -> i64 {
    SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

// Commands below that touch the disk run off the main thread (async) and read files only after
// releasing the chronicle lock, so neither the UI nor the poll loop waits on them.

/// Chronicon events of one local day ("YYYY-MM-DD"), oldest first.
#[tauri::command(async)]
fn chronicle_day(day: String, chron: State<Chron>) -> Result<Vec<Event>, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    let dir = chron.lock().map_err(|_| "chronicle unavailable")?.dir().to_path_buf();
    Ok(chronicle::read_events(&dir, &day))
}

/// Tithe (tokens + working time) of one local day; today's is live.
#[tauri::command(async)]
fn tithe_day(day: String, chron: State<Chron>) -> Result<Tithe, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    let (dir, live) = chron.lock().map_err(|_| "chronicle unavailable")?.snapshot();
    Ok(chronicle::tithe_of(&dir, &live, &day))
}

/// Today and the 6 previous days, newest first.
#[tauri::command(async)]
fn chronicle_days(chron: State<Chron>) -> Result<Vec<DaySummary>, String> {
    let (dir, live) = chron.lock().map_err(|_| "chronicle unavailable")?.snapshot();
    Ok(chronicle::days(&dir, &live, now_ms()))
}

/// Stale-petition mark in ms, set from the settings panel (default `registry::STALE_MS`).
static STALE_MS: AtomicI64 = AtomicI64::new(registry::STALE_MS);

#[tauri::command]
fn set_stale_minutes(minutes: u32) {
    STALE_MS.store(i64::from(minutes.clamp(1, 120)) * 60_000, Ordering::Relaxed);
}

/// Question petitions (a turn ending on a question) from the settings panel: shown at all, and toasted.
static QUESTIONS: AtomicBool = AtomicBool::new(true);
static QUESTION_TOAST: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_question_prefs(enabled: bool, toast: bool) {
    QUESTIONS.store(enabled, Ordering::Relaxed);
    QUESTION_TOAST.store(toast, Ordering::Relaxed);
}

/// Quiet hours from the settings panel (quiet.rs): minutes after midnight, local.
#[tauri::command]
fn set_quiet(enabled: bool, from_min: u16, to_min: u16) {
    quiet::set(enabled, from_min, to_min);
}

/// The toasts' wording from the active theme (toast.rs; chrome.js pushes it on start and on a theme change).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn set_toast_text(petition: String, question: String, stale: String, needed: String, limit: String, limit_many: String, failed: String) {
    toast::set(toast::Text { petition, question, stale, needed, limit, limit_many, failed });
}

/// "Add a desktop icon" in the settings: the installer no longer makes one (src-tauri/installer-hooks.nsh). Windows only.
#[cfg(windows)]
#[tauri::command(async)]
fn desktop_shortcut() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = firewall::valid_exe(&exe)?;
    let out = firewall::powershell(&format!(
        "$ErrorActionPreference = 'Stop'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\Administratum.lnk')
$s.TargetPath = '{exe}'
$s.Save()"
    ))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// The header's close button: quits like the tray's Quit.
/// Subscription usage as claude-deck last fetched it (~/.claude/claude-deck/usage-last.json: session and weekly
/// percent and resetsAt), for the strip's banner; None when claude-deck isn't installed or the file is unreadable.
#[tauri::command]
fn usage() -> Option<serde_json::Value> {
    std::fs::read_to_string(claude_dir().join("claude-deck").join("usage-last.json")).ok().and_then(|t| serde_json::from_str(&t).ok())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
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

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

/// UI settings from the config dir ({} if missing or corrupt); localStorage is only a cache.
/// Never includes the backend's `remote.*` keys (the remote view's token among them).
#[tauri::command(async)]
fn settings_load(app: AppHandle) -> Result<serde_json::Value, String> {
    Ok(settings::public(settings::load(&settings_path(&app)?)))
}

#[tauri::command(async)]
fn settings_save(values: serde_json::Value, app: AppHandle) -> Result<(), String> {
    settings::update(&settings_path(&app)?, |old| settings::merge_ui(&old, &values))
}

/// Settings > System > Updates: the installed version and the newer one on GitHub Releases, if any.
#[derive(serde::Serialize)]
struct UpdateInfo {
    current: String,
    available: Option<String>,
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(UpdateInfo { current: app.package_info().version.to_string(), available: update.map(|u| u.version) })
}

/// Download, verify (the plugin checks the signature against tauri.conf.json's pubkey), install, restart.
/// On Windows the NSIS installer (passive) closes the app itself before the restart line.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let update = update.ok_or("already up to date")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}

/// Emit to the webview, and mirror to the remote view's `/events` clients.
fn emit<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    remote::publish(event, &payload);
    let _ = app.emit(event, payload);
}

/// A department plaque was clicked: open `path` (a live session's cwd, nothing else) with the program chosen in Settings.
#[tauri::command(async)]
fn open_folder(path: String, app: AppHandle, live: State<Live>) -> Result<(), String> {
    if !live.lock().map_err(|_| "roster unavailable")?.iter().any(|s| s.cwd == path) {
        return Err("not a session folder".into());
    }
    let v = settings::load(&settings_path(&app)?);
    let (program, args) = settings::opener(v["adm.openWith"].as_str().unwrap_or("explorer"), v["adm.openCmd"].as_str().unwrap_or(""), &path)?;
    no_window(Command::new(&program)).args(args).spawn().map_err(|e| format!("{program}: {e}"))?;
    Ok(())
}

fn claude_dir() -> PathBuf {
    std::env::home_dir().unwrap_or_default().join(".claude")
}

/// The OS the backend runs on (`std::env::consts::OS`: windows, macos, linux), so the settings can hide what only
/// works on Windows (firewall rule, desktop icon) and name the file manager.
#[tauri::command]
fn platform() -> &'static str {
    std::env::consts::OS
}

fn main() {
    let demo = std::env::args().any(|a| a == "--demo") || std::env::var("ADMINISTRATUM_DEMO").is_ok();
    tauri::Builder::default()
        // First: a second launch just raises the running window, then exits.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| window::reveal(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            orca::open_session,
            open_folder,
            orca::peek_petition,
            orca::answer_petition,
            chronicle_day,
            tithe_day,
            chronicle_days,
            set_stale_minutes,
            set_question_prefs,
            set_quiet,
            set_toast_text,
            start_at_login,
            vigil::app::vigil_arm,
            vigil::app::vigil_cancel,
            usage,
            quit,
            platform,
            #[cfg(windows)]
            desktop_shortcut,
            settings_load,
            settings_save,
            remote::app::remote_status,
            remote::app::remote_set,
            remote::app::remote_regenerate_token,
            #[cfg(windows)]
            remote::app::firewall_status,
            #[cfg(windows)]
            remote::app::firewall_allow,
            #[cfg(windows)]
            remote::app::firewall_remove,
            check_update,
            install_update,
            strip::strip_supported,
            strip::place_strip,
            strip::place_hall,
            strip::set_click_through,
            strip::set_strip_menu,
            window::set_chime_menu
        ])
        .setup(move |app| {
            // No Dock icon or app menu: a widget that lives in the tray (skipTaskbar is ignored on macOS).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.manage::<vigil::app::VigilBox>(Mutex::new(vigil::Vigil::default())); // before build_tray: the tray item reads it
            window::build_tray(app)?;
            // Demo mode keeps a throwaway chronicle of its own, wiped at each start.
            let dir = app.path().app_data_dir()?.join(if demo { "chronicon-demo" } else { "chronicon" });
            app.manage::<Chron>(Mutex::new(Chronicle::open(dir, now_ms(), demo)));
            app.manage::<Live>(Mutex::new(Vec::new()));
            // Apply quiet hours before the poll thread's first tick, so a restart during the
            // night window does not toast until the webview gets around to pushing set_quiet.
            let saved = settings_path(app.handle()).map(|p| settings::load(&p)).unwrap_or_default();
            let (on, from, to) = settings::quiet_from_settings(&saved);
            quiet::set(on, from, to);
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            remote::app::start_saved(app.handle());
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                thread::spawn(move || window::watch_visibility(handle));
            }
            strip::start_cursor_poll(app.handle().clone());
            strip::start_watcher(app.handle().clone());
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
    let mut poller = poller::Poller::new(&claude_dir());
    let mut tracker = Tracker::default();
    let mut prev: Vec<Session> = Vec::new();
    let start = Instant::now();
    let mut first = true;
    let mut last_tick = Instant::now();
    let mut last_t = 0;
    loop {
        // A panic in one tick (transcripts are untrusted input) is logged and skipped; the next
        // tick runs as usual instead of the widget freezing on stale state.
        let tick = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut roster = if demo { demo::roster(start.elapsed().as_secs()) } else { poller.roster(&prev, now_ms()) };
            let now_ms = now_ms();
            let limit_events = notify(&app, &mut tracker, &roster, first, now_ms);
            let mut turns = std::collections::HashMap::new();
            {
                let now = now_ms;
                let elapsed = (last_tick.elapsed().as_millis() as u64).min(5_000); // a sleep/resume gap is not work
                last_tick = Instant::now();
                let chron = app.state::<Chron>();
                let mut c = lock(&chron);
                let mut events = if demo {
                    let t = start.elapsed().as_secs();
                    for (dept, u) in demo::usage(&roster, now) {
                        c.add_usage(&dept, &u);
                    }
                    c.add_busy(&roster, elapsed, now);
                    let ev = demo::chronicle(last_t, t, &roster, now);
                    last_t = t;
                    ev
                } else {
                    let ev = c.read_transcripts(&roster, &poller.files, now);
                    turns = c.turns(&poller.files);
                    ev
                };
                let from_transcripts = !demo && !events.is_empty();
                if !first {
                    events.extend(chronicle::lifecycle(&prev, &roster, now));
                }
                events.extend(limit_events);
                for e in &events {
                    c.record(e);
                    // The first scan backfills today; only fresh events play live in the scene.
                    if now - e.ts < 120_000 {
                        emit(&app, "chronicle", e);
                    }
                }
                c.maybe_flush(now, from_transcripts);
                first = false;
            }
            for s in roster.iter_mut() {
                s.turn = turns.remove(&s.id);
            }
            // Night Vigil: newest transcript write among the files the poller already stats (subagents included).
            let last_write = poller.files.values().flatten().map(|(f, _)| f.mtime_ms).max().unwrap_or(0);
            vigil::app::tick(&app, &roster, last_write, now_ms, demo);
            *lock(&app.state::<Live>()) = roster.clone();
            // ponytail: emit every tick (a late-loading webview never misses state); diff if it ever shows in a profile.
            emit(&app, "roster", &roster);
            prev = roster;
        }));
        if tick.is_err() {
            eprintln!("poll tick panicked, skipped");
            app.state::<Chron>().clear_poison(); // keep the Chronicon commands working
            app.state::<vigil::app::VigilBox>().clear_poison();
        }
        thread::sleep(Duration::from_secs(1));
    }
}

/// This tick's toasts and UI events: new petitions, questions, stale petitions, and usage-limit waves. Returns the
/// waves' Chronicon events. `first`: the app's first tick, whose limits were reached before it started.
fn notify(app: &AppHandle, tracker: &mut Tracker, roster: &[Session], first: bool, now_ms: i64) -> Vec<Event> {
    let words = toast::get();
    let quiet = quiet::active();
    for s in tracker.new_petitions(roster) {
        if !quiet {
            let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
            toast::petition_toast(app, &s, toast::fill(&words.petition, &s.name), body);
        }
        emit(app, "petition", &s);
    }
    // Questions never go stale: one toast (if wanted) and one chime per episode.
    for s in tracker.new_questions(roster) {
        if !QUESTIONS.load(Ordering::Relaxed) {
            continue;
        }
        if QUESTION_TOAST.load(Ordering::Relaxed) && !quiet {
            let q = s.question.clone().unwrap_or_default();
            let q = if q.chars().count() > 120 { format!("{}…", q.chars().take(119).collect::<String>()) } else { q };
            let _ = app.notification().builder().title(toast::fill(&words.question, &s.name)).body(format!("{} · {q}", s.dept)).show();
        }
        emit(app, "question", &s);
    }
    // ponytail: the tracker compares against registry::STALE_MS; shifting "now" applies the user's mark.
    let shift = registry::STALE_MS - STALE_MS.load(Ordering::Relaxed);
    for s in tracker.stale_petitions(roster, now_ms + shift) {
        if s.temp {
            continue; // the break-out room is quiet: a temp petition toasts once, never as stale
        }
        let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
        toast::petition_toast(app, &s, toast::fill(&words.stale, &s.name), body);
        emit(app, "petition-stale", &s);
    }
    let mut limit_events = vec![];
    if first {
        // A session already sealed before this app start is not a new wave: seed the tracker,
        // but skip the toast, the chime event and the Chronicon record for it.
        tracker.new_limits(roster);
    } else {
        for wave in tracker.new_limits(roster) {
            let reset = wave[0].limit.as_ref().and_then(|l| l.reset_ms);
            let time = reset.map_or_else(|| "later".to_string(), toast::hhmm);
            let loud: Vec<&Session> = wave.iter().filter(|s| !s.temp).collect(); // the break-out room seals in silence
            if !quiet && !loud.is_empty() {
                let names: Vec<&str> = loud.iter().map(|s| s.name.as_str()).collect();
                let body = if loud.len() == 1 { format!("{} · {}", loud[0].dept, loud[0].limit.as_ref().map_or("", |l| l.text.as_str())) } else { names.join(", ") };
                let _ = app.notification().builder().title(toast::limit_title(&words, &names, &time)).body(body).show();
            }
            if !loud.is_empty() {
                emit(app, "limit", loud.len());
            }
            for s in &wave {
                limit_events.push(Event { ts: now_ms, kind: "limit".into(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: None, detail: time.clone() });
            }
        }
    }
    limit_events
}
