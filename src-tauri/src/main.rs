#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod chronicle;
mod demo;
mod firewall;
mod git;
mod poller;
mod quiet;
mod registry;
mod remote;
mod settings;
mod strip;
mod toast;

use chronicle::{Chronicle, DaySummary, Event, Tithe};
use registry::{Session, Tracker};
use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicI64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
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
        let fallback = std::env::var("LOCALAPPDATA").map(|l| format!("{l}\\Programs\\orca\\resources\\bin\\orca.exe")).map_err(|_| "orca not found".to_string())?;
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

/// The Claude Code permission dialog on Orca terminal `handle`'s rendered screen (read only).
fn read_prompt(handle: &str) -> Result<registry::Prompt, String> {
    if !registry::valid_orca_handle(handle) {
        return Err("invalid orca handle".into());
    }
    let out = orca(&["terminal", "read", "--terminal", handle, "--screen", "--json"], |c| c.output())?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| "unreadable terminal".to_string())?;
    let term = &v["result"]["terminal"];
    if v["ok"] != true || term["source"] != "screen" {
        return Err("terminal screen unavailable".into());
    }
    let screen = term["tail"].as_array().map(|l| l.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    registry::parse_permission_prompt(&screen).ok_or_else(|| "no permission prompt on screen".into())
}

#[derive(serde::Serialize)]
struct Peek {
    question: String,
    yes: String,
    always: Option<String>,
    no: String,
}

/// What the permission dialog in Orca terminal `handle` offers, for the card's buttons: its
/// question and the labels of the Yes / Always / No options. Never types anything. The labels
/// come from the screen (untrusted) and are only ever shown as text.
#[tauri::command(async)]
fn peek_petition(handle: String) -> Result<Peek, String> {
    let p = read_prompt(&handle)?;
    let label = |n: u8| p.options[n as usize - 1].1.clone(); // options are numbered 1, 2, ... by the parser
    Ok(Peek { question: p.question.clone(), yes: label(p.yes), always: p.always.map(label), no: label(p.no) })
}

/// Answer the Claude Code permission dialog in Orca terminal `handle`: "yes", "always" or "no".
/// Types exactly one option digit, and only after the rendered screen shows that dialog at its
/// bottom (see `registry::parse_permission_prompt`); nothing read from the screen is ever sent
/// except that digit. Errors are fixed strings. Runs off the main thread (async).
#[tauri::command(async)]
fn answer_petition(handle: String, choice: String) -> Result<(), String> {
    let p = read_prompt(&handle)?;
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
/// The newest roster, for commands that act on a live session (open_folder, toast buttons).
type Live = Mutex<Vec<Session>>;

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

/// A petition toast. A permission prompt in an Orca terminal gets Approve / Deny: a click answers through
/// `answer_petition` (the same screen check as the card), only while that petition is still open (toast::still_open);
/// a failure shows a plain "open the terminal" toast. Anything else, or a WinRT error: the plugin's plain toast.
fn petition_toast(app: &AppHandle, s: &Session, title: String, body: String) {
    #[cfg(windows)]
    if toast::has_buttons(s) {
        let (handle, name) = (app.clone(), s.name.clone());
        let shown = tauri_winrt_notification::Toast::new(&toast_app_id(app))
            .title(&title)
            .text1(&body)
            .add_button("Approve", &toast::action_arg("yes", s.since_ms, &s.id))
            .add_button("Deny", &toast::action_arg("no", s.since_ms, &s.id))
            .on_activated(move |arg| {
                let Some((choice, since, id)) = arg.as_deref().and_then(toast::parse_action) else { return Ok(()) };
                let open = handle.state::<Live>().lock().ok().and_then(|r| toast::still_open(&r, id, since).map(str::to_string));
                if let Some(orca) = open {
                    if let Err(e) = answer_petition(orca, choice.to_string()) {
                        eprintln!("toast answer: {e}");
                        let _ = handle.notification().builder().title(toast::fill(&toast::get().failed, &name)).show();
                    }
                }
                Ok(())
            })
            .show();
        if shown.is_ok() {
            return;
        }
    }
    let _ = app.notification().builder().title(title).body(body).show();
}

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

/// The toasts' wording from the active theme (toast.rs; app.js pushes it on start and on a theme change).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn set_toast_text(petition: String, question: String, stale: String, needed: String, limit: String, limit_many: String, failed: String) {
    toast::set(toast::Text { petition, question, stale, needed, limit, limit_many, failed });
}

/// "Add a desktop icon" in the settings: the installer no longer makes one (src-tauri/installer-hooks.nsh).
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

/// Remote view settings, from `remote.*` in settings.json; creates and saves the token on first use.
fn remote_conf(path: &std::path::Path) -> Result<(bool, u16, bool, String), String> {
    let mut out = (false, remote::DEFAULT_PORT, false, String::new());
    settings::update(path, |mut v| {
        if !v["remote.token"].as_str().is_some_and(remote::valid_token) {
            v["remote.token"] = remote::new_token().into();
        }
        out = (
            v["remote.enabled"].as_bool().unwrap_or(false),
            v["remote.port"].as_u64().and_then(|p| u16::try_from(p).ok()).filter(|&p| p >= 1024).unwrap_or(remote::DEFAULT_PORT),
            v["remote.actions"].as_bool().unwrap_or(false),
            v["remote.token"].as_str().unwrap_or_default().to_string(),
        );
        v
    })?;
    Ok(out)
}

/// The app as the remote view reaches it: the read commands, answer_petition (gated by the
/// server), and the embedded UI files. open_session and every settings write stay local.
fn remote_backend(app: &AppHandle) -> remote::Backend {
    fn json<T: serde::Serialize>(r: Result<T, String>) -> Result<serde_json::Value, String> {
        r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    }
    let (a, b) = (app.clone(), app.clone());
    remote::Backend {
        call: Box::new(move |c| match c {
            remote::Call::ChronicleDay(day) => json(chronicle_day(day, a.state())),
            remote::Call::TitheDay(day) => json(tithe_day(day, a.state())),
            remote::Call::ChronicleDays => json(chronicle_days(a.state())),
            remote::Call::SettingsLoad => settings_load(a.clone()).map(|mut v| {
                // The remote (LAN) view never learns the local "open folder" program/path; the local UI keeps them.
                if let Some(o) = v.as_object_mut() {
                    o.retain(|k, _| !k.starts_with("adm.open"));
                }
                v
            }),
            remote::Call::PeekPetition(handle) => json(peek_petition(handle)),
            remote::Call::AnswerPetition { handle, choice } => json(answer_petition(handle, choice)),
        }),
        asset: Box::new(move |p| b.asset_resolver().get(p.to_string()).map(|x| (x.bytes, x.mime_type))),
    }
}

#[derive(serde::Serialize)]
struct RemoteStatus {
    enabled: bool,
    port: u16,
    urls: Vec<String>,
    token_url: String,
    qr_svg: String,
    actions_allowed: bool,
}

/// The settings panel's view of the remote view: whether it is serving, where, and the pairing QR.
#[tauri::command(async)]
fn remote_status(app: AppHandle) -> Result<RemoteStatus, String> {
    let (_, port, actions_allowed, token) = remote_conf(&settings_path(&app)?)?;
    let urls: Vec<String> = remote::lan_ipv4().iter().map(|ip| format!("http://{ip}:{port}/")).collect();
    let token_url = urls.first().map(|u| format!("{u}?t={token}")).unwrap_or_default();
    let qr_svg = if token_url.is_empty() { String::new() } else { remote::qr_svg(&token_url) };
    Ok(RemoteStatus { enabled: remote::running_port().is_some(), port, urls, token_url, qr_svg, actions_allowed })
}

/// Serve (or stop serving) on `port`, and allow remote actions or not. Applies at once; a port
/// that cannot be bound leaves the remote view off and returns the error.
#[tauri::command(async)]
fn remote_set(enabled: bool, port: u16, actions_allowed: bool, app: AppHandle) -> Result<RemoteStatus, String> {
    if port < 1024 {
        return Err("port must be between 1024 and 65535".into());
    }
    let path = settings_path(&app)?;
    remote_conf(&path)?; // the token exists before anything can pair
    remote::set_actions(actions_allowed);
    let run = match (enabled, remote::running_port()) {
        (false, _) => Ok(remote::stop()),
        (true, Some(p)) if p == port => Ok(()),
        (true, _) => remote::start(std::net::SocketAddr::from(([0, 0, 0, 0], port)), remote_backend(&app)).map(|_| ()),
    };
    let on = enabled && run.is_ok();
    settings::update(&path, |mut v| {
        v["remote.enabled"] = on.into();
        v["remote.port"] = port.into();
        v["remote.actions"] = actions_allowed.into();
        v
    })?;
    run?;
    remote_status(app)
}

/// A new token: every paired device must scan the new QR code; open streams end now.
#[tauri::command(async)]
fn remote_regenerate_token(app: AppHandle) -> Result<RemoteStatus, String> {
    let token = remote::new_token();
    settings::update(&settings_path(&app)?, |mut v| {
        v["remote.token"] = token.clone().into();
        v
    })?;
    remote::set_token(&token);
    remote_status(app)
}

/// Whether the Windows Firewall lets other devices reach `port` (read-only, unelevated).
#[tauri::command(async)]
fn firewall_status(port: u16) -> Result<firewall::Status, String> {
    firewall::status(port)
}

/// Replace the remote view's firewall rule with one for this exe on `port` (UAC prompt), then re-read.
#[tauri::command(async)]
fn firewall_allow(port: u16) -> Result<firewall::Status, String> {
    firewall::allow(port)?;
    firewall::status(port)
}

/// Remove the remote view's firewall rule (UAC prompt); `port` only for the status re-read.
#[tauri::command(async)]
fn firewall_remove(port: u16) -> Result<firewall::Status, String> {
    firewall::remove()?;
    firewall::status(port)
}

/// The program and arguments that open a department's folder (Settings: adm.openWith = explorer | code | custom,
/// adm.openCmd). `path` is always one argument: `{path}` in a custom command is replaced inside its word, and
/// appended as the last argument when the command has none. Nothing goes through a shell.
fn opener(kind: &str, custom: &str, path: &str) -> Result<(String, Vec<String>), String> {
    match kind {
        "code" => Ok(("code.cmd".into(), vec![path.into()])),
        "custom" => {
            let words = split_words(custom);
            let (program, rest) = words.split_first().ok_or("no custom command set")?;
            let mut args: Vec<String> = rest.iter().map(|w| w.replace("{path}", path)).collect();
            if !rest.iter().any(|w| w.contains("{path}")) {
                args.push(path.into());
            }
            Ok((program.clone(), args))
        }
        _ => Ok(("explorer.exe".into(), vec![path.into()])),
    }
}

/// Words of a command line; double quotes group (no escapes): `"C:\Program Files\x.exe" -n {path}`.
fn split_words(s: &str) -> Vec<String> {
    let (mut out, mut cur, mut quoted, mut any) = (vec![], String::new(), false, false);
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            c => {
                cur.push(c);
                any = true;
            }
        }
    }
    if any {
        out.push(cur);
    }
    out
}

/// A department plaque was clicked: open `path` (a live session's cwd, nothing else) with the program chosen in Settings.
#[tauri::command(async)]
fn open_folder(path: String, app: AppHandle, live: State<Live>) -> Result<(), String> {
    if !live.lock().map_err(|_| "roster unavailable")?.iter().any(|s| s.cwd == path) {
        return Err("not a session folder".into());
    }
    let v = settings::load(&settings_path(&app)?);
    let (program, args) = opener(v["adm.openWith"].as_str().unwrap_or("explorer"), v["adm.openCmd"].as_str().unwrap_or(""), &path)?;
    no_window(Command::new(&program)).args(args).spawn().map_err(|e| format!("{program}: {e}"))?;
    Ok(())
}

/// Quiet-hours settings as saved by the UI (adm.quiet/"1", adm.quietFrom/adm.quietTo, minutes after
/// midnight as strings): defaults to off, 1320 (22:00), 480 (8:00) on a missing or unparsable value.
fn quiet_from_settings(v: &serde_json::Value) -> (bool, u16, u16) {
    let num = |key: &str, default: u16| v[key].as_str().and_then(|s| s.parse().ok()).unwrap_or(default);
    (v["adm.quiet"].as_str() == Some("1"), num("adm.quietFrom", 1320), num("adm.quietTo", 480))
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_session,
            open_folder,
            peek_petition,
            answer_petition,
            chronicle_day,
            tithe_day,
            chronicle_days,
            set_stale_minutes,
            set_question_prefs,
            set_quiet,
            set_toast_text,
            start_at_login,
            desktop_shortcut,
            settings_load,
            settings_save,
            remote_status,
            remote_set,
            remote_regenerate_token,
            firewall_status,
            firewall_allow,
            firewall_remove,
            check_update,
            install_update,
            strip::strip_supported,
            strip::place_strip,
            strip::place_hall,
            strip::set_click_through,
            strip::set_strip_menu
        ])
        .setup(move |app| {
            build_tray(app)?;
            // Demo mode keeps a throwaway chronicle of its own, wiped at each start.
            let dir = app.path().app_data_dir()?.join(if demo { "chronicon-demo" } else { "chronicon" });
            app.manage::<Chron>(Mutex::new(Chronicle::open(dir, now_ms(), demo)));
            app.manage::<Live>(Mutex::new(Vec::new()));
            // Apply quiet hours before the poll thread's first tick, so a restart during the
            // night window does not toast until the webview gets around to pushing set_quiet.
            let saved = settings_path(app.handle()).map(|p| settings::load(&p)).unwrap_or_default();
            let (on, from, to) = quiet_from_settings(&saved);
            quiet::set(on, from, to);
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            if let Ok((enabled, port, actions, token)) = settings_path(app.handle()).and_then(|p| remote_conf(&p)) {
                remote::set_token(&token);
                remote::set_actions(actions);
                if enabled {
                    if let Err(e) = remote::start(std::net::SocketAddr::from(([0, 0, 0, 0], port)), remote_backend(app.handle())) {
                        eprintln!("remote view: {e}");
                    }
                }
            }
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                thread::spawn(move || watch_visibility(handle));
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
            let words = toast::get();
            let quiet = quiet::active();
            for s in tracker.new_petitions(&roster) {
                if !quiet {
                    let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
                    petition_toast(&app, &s, toast::fill(&words.petition, &s.name), body);
                }
                emit(&app, "petition", &s);
            }
            // Questions never go stale: one toast (if wanted) and one chime per episode.
            for s in tracker.new_questions(&roster) {
                if !QUESTIONS.load(Ordering::Relaxed) {
                    continue;
                }
                if QUESTION_TOAST.load(Ordering::Relaxed) && !quiet {
                    let q = s.question.clone().unwrap_or_default();
                    let q = if q.chars().count() > 120 { format!("{}…", q.chars().take(119).collect::<String>()) } else { q };
                    let _ = app.notification().builder().title(toast::fill(&words.question, &s.name)).body(format!("{} · {q}", s.dept)).show();
                }
                emit(&app, "question", &s);
            }
            let now_ms = now_ms();
            // ponytail: the tracker compares against registry::STALE_MS; shifting "now" applies the user's mark.
            let shift = registry::STALE_MS - STALE_MS.load(Ordering::Relaxed);
            for s in tracker.stale_petitions(&roster, now_ms + shift) {
                let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
                petition_toast(&app, &s, toast::fill(&words.stale, &s.name), body);
                emit(&app, "petition-stale", &s);
            }
            let mut limit_events = vec![];
            if first {
                // A session already sealed before this app start is not a new wave: seed the tracker,
                // but skip the toast, the chime event and the Chronicon record for it.
                tracker.new_limits(&roster);
            } else {
                for wave in tracker.new_limits(&roster) {
                    let reset = wave[0].limit.as_ref().and_then(|l| l.reset_ms);
                    let time = reset.map_or_else(|| "later".to_string(), toast::hhmm);
                    if !quiet {
                        let names: Vec<&str> = wave.iter().map(|s| s.name.as_str()).collect();
                        let body = if wave.len() == 1 { format!("{} · {}", wave[0].dept, wave[0].limit.as_ref().map_or("", |l| l.text.as_str())) } else { names.join(", ") };
                        let _ = app.notification().builder().title(toast::limit_title(&words, &names, &time)).body(body).show();
                    }
                    emit(&app, "limit", wave.len());
                    for s in &wave {
                        limit_events.push(Event { ts: now_ms, kind: "limit".into(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: None, detail: time.clone() });
                    }
                }
            }
            let mut turns = std::collections::HashMap::new();
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
            *app.state::<Live>().lock().unwrap_or_else(|e| e.into_inner()) = roster.clone();
            // ponytail: emit every tick (a late-loading webview never misses state); diff if it ever shows in a profile.
            emit(&app, "roster", &roster);
            prev = roster;
        }));
        if tick.is_err() {
            eprintln!("poll tick panicked, skipped");
            app.state::<Chron>().clear_poison(); // keep the Chronicon commands working
        }
        thread::sleep(Duration::from_secs(1));
    }
}

/// 5x5 points spread over a rect (left, top, right, bottom), each at the centre of its cell.
fn sample_grid(l: i32, t: i32, r: i32, b: i32) -> impl Iterator<Item = (i32, i32)> {
    (0..25).map(move |i| (l + (r - l) * (2 * (i % 5) + 1) / 10, t + (b - t) * (2 * (i / 5) + 1) / 10))
}

/// Can the user see any of the main window? False when minimised, hidden (tray) or covered: none
/// of 25 points over the client area hit-tests to it (WindowFromPoint skips hidden and cloaked
/// windows, and finds the WebView2 child, whose root is ours).
// ponytail: sampling, so a sliver showing between grid points counts as covered; walk the Z-order if that matters.
#[cfg(windows)]
fn on_screen(hwnd: windows_sys::Win32::Foundation::HWND) -> bool {
    use windows_sys::Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::ClientToScreen,
        UI::WindowsAndMessaging::{GetAncestor, GetClientRect, IsIconic, IsWindowVisible, WindowFromPoint, GA_ROOT},
    };
    // SAFETY: plain Win32 queries on a window handle; a stale handle only makes them fail.
    unsafe {
        if IsIconic(hwnd) != 0 || IsWindowVisible(hwnd) == 0 {
            return false;
        }
        let mut rc = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        let mut o = POINT { x: 0, y: 0 };
        if GetClientRect(hwnd, &mut rc) == 0 || ClientToScreen(hwnd, &mut o) == 0 {
            return true; // unknown: keep drawing
        }
        sample_grid(o.x, o.y, o.x + rc.right, o.y + rc.bottom).any(|(x, y)| {
            let at = WindowFromPoint(POINT { x, y });
            !at.is_null() && GetAncestor(at, GA_ROOT) == hwnd
        })
    }
}

/// Every 2 s, tell the UI (`visible`) when the main window becomes seen or unseen; the UI stops
/// drawing while unseen if its "Pause when hidden or covered" setting is on.
#[cfg(windows)]
fn watch_visibility(app: AppHandle) {
    let Some(hwnd) = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as usize) else { return };
    let mut last = true;
    loop {
        thread::sleep(Duration::from_secs(2));
        let now = on_screen(hwnd as windows_sys::Win32::Foundation::HWND);
        if now != last {
            last = now;
            let _ = app.emit("visible", now);
        }
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
    let strip = CheckMenuItem::with_id(app, "strip", "Desktop strip", cfg!(windows), false, None::<&str>)?;
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(app, "login", "Start at login", true, login_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mute, &light, &strip, &login, &quit])?;
    app.manage(login);
    app.manage(strip::StripItem(strip));
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Administratum")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => toggle_window(app),
            "mute" => {
                emit(app, "ui-command", "mute");
            }
            "light" => {
                emit(app, "ui-command", "light");
            }
            "strip" => {
                emit(app, "ui-command", "strip");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_grid_stays_inside_and_spans_the_rect() {
        let pts: Vec<_> = super::sample_grid(100, 50, 600, 450).collect();
        assert_eq!(pts.len(), 25);
        assert!(pts.iter().all(|&(x, y)| (100..600).contains(&x) && (50..450).contains(&y)));
        assert_eq!((pts[0], pts[24]), ((150, 90), (550, 410)));
    }

    #[test]
    fn quiet_from_settings_defaults_and_parses() {
        assert_eq!(quiet_from_settings(&serde_json::json!({})), (false, 1320, 480), "missing keys: off, defaults");
        assert_eq!(quiet_from_settings(&serde_json::json!({"adm.quiet": "1", "adm.quietFrom": "60", "adm.quietTo": "120"})), (true, 60, 120));
        assert_eq!(quiet_from_settings(&serde_json::json!({"adm.quiet": "0", "adm.quietFrom": "oops"})), (false, 1320, 480), "unparsable falls back");
    }

    #[test]
    fn opener_keeps_the_path_one_argument() {
        let p = r"C:\My Projects\x & y";
        assert_eq!(opener("explorer", "", p).unwrap(), ("explorer.exe".to_string(), vec![p.to_string()]));
        assert_eq!(opener("code", "", p).unwrap(), ("code.cmd".to_string(), vec![p.to_string()]));
        assert_eq!(opener("custom", r#""C:\Program Files\Ed\ed.exe" -n {path}"#, p).unwrap(), (r"C:\Program Files\Ed\ed.exe".to_string(), vec!["-n".to_string(), p.to_string()]));
        assert_eq!(opener("custom", "ed --dir={path}", p).unwrap().1, vec![format!("--dir={p}")]);
        assert_eq!(opener("custom", "ed", p).unwrap().1, vec![p.to_string()], "no {{path}}: appended");
        assert!(opener("custom", "  ", p).is_err());
    }
}
