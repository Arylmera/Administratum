#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod chronicle;
mod demo;
#[cfg(windows)]
mod firewall;
mod git;
mod mask;
mod monitor;
mod opencode;
mod orca;
mod packs;
mod poller;
mod quiet;
mod registry;
mod remote;
mod rooms;
mod settings;
mod status;
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

/// Tithe (tokens + working time) of one local day; today's is live and carries the usage `window`.
#[tauri::command(async)]
fn tithe_day(day: String, chron: State<Chron>) -> Result<serde_json::Value, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    let (dir, live) = chron.lock().map_err(|_| "chronicle unavailable")?.snapshot();
    Ok(chronicle::tithe_answer(&dir, &live, &day, now_ms()))
}

/// The day report of one local day ("YYYY-MM-DD"), with its markdown (the Chronicon's Copy button).
#[tauri::command(async)]
fn day_report(day: String, chron: State<Chron>) -> Result<serde_json::Value, String> {
    if !chronicle::valid_day(&day) {
        return Err("invalid day".into());
    }
    let (dir, live) = chron.lock().map_err(|_| "chronicle unavailable")?.snapshot();
    let r = chronicle::report(&day, &chronicle::tithe_of(&dir, &live, &day), &chronicle::read_events(&dir, &day));
    Ok(serde_json::json!({ "markdown": r.markdown(), "report": r }))
}

/// The Hall of Honours: the four marks over the kept days (chronicle::honours_of).
#[tauri::command(async)]
fn honours(chron: State<Chron>) -> Result<chronicle::Honours, String> {
    let (dir, live) = chron.lock().map_err(|_| "chronicle unavailable")?.snapshot();
    Ok(chronicle::honours_of(&dir, &live, now_ms()))
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
fn set_toast_text(petition: String, question: String, stale: String, needed: String, limit: String, limit_many: String, failed: String, tokens: Option<String>, stuck: Option<String>) {
    toast::set(toast::Text { petition, question, stale, needed, limit, limit_many, failed, tokens: tokens.unwrap_or_default(), stuck: stuck.unwrap_or_default() });
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

/// Subscription usage as claude-deck last fetched it (~/.claude/claude-deck/usage-last.json: session and weekly
/// percent and resetsAt), for the strip's banner; None when claude-deck isn't installed or the file is unreadable.
#[tauri::command]
fn usage() -> Option<serde_json::Value> {
    std::fs::read_to_string(claude_dir().join("claude-deck").join("usage-last.json")).ok().and_then(|t| serde_json::from_str(&t).ok())
}

/// The header's close button: quits like the tray's Quit.
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

/// The theme packs' folder, `<app data>/themes/` (packs.rs).
fn themes_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("themes"))
}

/// The theme packs in the themes folder, for the UI's `loadPacks` (none when the folder is missing or unreadable).
#[tauri::command(async)]
fn theme_packs(app: AppHandle) -> Vec<packs::Pack> {
    themes_root(&app).map(|root| packs::list(&root)).unwrap_or_default()
}

/// One file of a theme pack, `<dir>/pack.json` or `<dir>/<folder>/<name>.json|png`, as raw bytes; `not found` for
/// anything `packs::read` will not serve (the UI reads that as a missing file).
#[tauri::command(async)]
fn theme_pack_file(path: String, app: AppHandle) -> Result<tauri::ipc::Response, String> {
    packs::read(&themes_root(&app)?, &path).map(tauri::ipc::Response::new).ok_or_else(|| "not found".into())
}

/// The archive of a public GitHub repository's default branch (`packs::archive_url`): HTTPS to codeload.github.com
/// only, no redirect followed, `timeout` in all, reading stopped past `packs::MAX_ARCHIVE` (whatever `Content-Length` says).
async fn download_pack(repo: &str, timeout: Duration) -> Result<Vec<u8>, String> {
    let url = packs::archive_url(repo).ok_or_else(|| format!("not a GitHub repository: {repo}"))?;
    // reqwest is built without a crypto provider (as the updater uses it): install the one the updater installs
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("Administratum/", env!("CARGO_PKG_VERSION"), " (theme packs)"))
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?;
    let mut res = client.get(&url).send().await.map_err(|e| format!("cannot reach GitHub: {e}"))?;
    if let Some(e) = download_refused(res.status().as_u16(), repo) {
        return Err(e);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| format!("the download failed: {e}"))? {
        if bytes.len() + chunk.len() > packs::MAX_ARCHIVE {
            return Err(format!("the archive of {repo} is larger than {} MiB", packs::MAX_ARCHIVE >> 20));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// What an answer other than 2xx means, in our words only (none of GitHub's text): redirects are not followed, so a
/// 3xx is a repository renamed or moved; 403 and 429 a refusal for now; 404 no such public repository.
fn download_refused(status: u16, repo: &str) -> Option<String> {
    match status {
        200..=299 => None,
        300..=399 => Some(format!("the repository {repo} has moved: type its new name")),
        403 | 429 => Some("GitHub refused for now, try again later".into()),
        404 => Some(format!("no public repository {repo}")),
        s => Some(format!("the download of {repo} failed (GitHub answered {s})")),
    }
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Settings > Themes: install the pack of a public GitHub repository `owner/repo` (`packs::install`), or replace it.
/// Host only (not on the remote view), as are the next three.
#[tauri::command]
async fn theme_pack_install(repo: String, app: AppHandle) -> Result<packs::Pack, String> {
    let root = themes_root(&app)?;
    let repo = repo.trim().to_string();
    let archive = download_pack(&repo, PACK_DOWNLOAD).await?;
    tauri::async_runtime::spawn_blocking(move || on_pack_disk(|| packs::install(&root, &repo, &archive, &now_utc()))).await.map_err(|e| e.to_string())?
}

/// One change to the themes folder at a time: the startup toast's Update, Settings' Update, Update all, Install and
/// Remove may be asked for together, and two swaps of one pack would race (`packs::swap` puts the old pack back, but
/// one of them fails and an `.old-*` folder waits for the next start). The downloads run outside it, in parallel.
static PACK_DISK: Mutex<()> = Mutex::new(());
fn on_pack_disk<T>(f: impl FnOnce() -> T) -> T {
    let _held = lock(&PACK_DISK);
    f()
}

/// Install the pack in the folder `dir` again from the repository it came from (`packs::update`); a local pack is
/// refused. The pack as `theme_packs` lists it, plus `changed`: false when the repository holds what is installed
/// (nothing replaced, no restart needed).
#[tauri::command]
async fn theme_pack_update(dir: String, app: AppHandle) -> Result<packs::Updated, String> {
    update_pack(themes_root(&app)?, dir).await
}

/// How long a pack's download may take when asked for in Settings, and in the check at start (per pack).
const PACK_DOWNLOAD: Duration = Duration::from_secs(60);
const PACK_CHECK: Duration = Duration::from_secs(20);

async fn update_pack(root: PathBuf, dir: String) -> Result<packs::Updated, String> {
    let repo = packs::origin(&root, &dir)?;
    let archive = download_pack(&repo, PACK_DOWNLOAD).await?;
    tauri::async_runtime::spawn_blocking(move || on_pack_disk(|| packs::update(&root, &dir, &archive, &now_utc()))).await.map_err(|e| e.to_string())?
}

/// At start, unless the setting `adm.packCheck` is "0": each pack installed from a repository and not installed nor
/// found unchanged in the last `packs::CHECK_EVERY` (`packs::due`) is downloaded again, one after the other
/// (`PACK_CHECK` each), and compared with what is installed (`packs::changed`); nothing is
/// installed. Any error (offline, GitHub refusing, a broken archive) only skips that pack, in the log. When some
/// changed, a toast asks: "Update" installs those packs from the archives just compared (`update_changed`: what the
/// toast announced, not a later push, and no second download); "Later" or a click on the toast does nothing, and the
/// archives are kept with the toast until then. In quiet hours the toast is dropped, as the others are: the next
/// start checks again.
async fn check_packs(app: AppHandle) {
    let Ok(root) = themes_root(&app) else { return };
    let mut found: Vec<packs::Checked> = Vec::new();
    for pack in packs::list(&root) {
        let Some(repo) = pack.repo else { continue };
        // installed or found unchanged under packs::CHECK_EVERY ago: not downloaded again (a restart, the restart after
        // an update)
        if !packs::due(&root, &pack.dir, chrono::Utc::now()) {
            continue;
        }
        let archive = match download_pack(&repo, PACK_CHECK).await {
            Ok(a) => a,
            Err(e) => {
                status::report("packs", status::State::Warn, format!("pack check: {repo}: {e}"));
                continue;
            }
        };
        let (r, d) = (root.clone(), pack.dir.clone());
        // found unchanged: marked checked (packs::mark_checked); a changed pack is not, so the next start asks again
        let compare = move || {
            let c = packs::changed(&r, &d, &archive)?;
            if !c {
                if let Err(e) = packs::mark_checked(&r, &d, &now_utc()) {
                    status::report("packs", status::State::Warn, format!("pack check: {d}: {e}"));
                }
            }
            Ok::<_, String>((c, archive))
        };
        match tauri::async_runtime::spawn_blocking(move || on_pack_disk(compare)).await {
            Ok(Ok((true, archive))) => found.push(packs::Checked { dir: pack.dir, repo, archive }),
            Ok(Ok((false, _))) => {}
            Ok(Err(e)) => status::report("packs", status::State::Warn, format!("pack check: {repo}: {e}")),
            Err(e) => status::report("packs", status::State::Warn, format!("pack check: {repo}: {e}")),
        }
    }
    if found.is_empty() || quiet::active() {
        return;
    }
    let names = found.iter().map(|c| c.repo.as_str()).collect::<Vec<_>>().join(", ");
    let found = std::sync::Arc::new(found);
    let body = format!("{names}: Update installs them and restarts.");
    // macOS shows the buttons as an "Options" menu whose own click reports the first: Later first there, so a
    // stray click never updates and restarts (as `toast::petition_buttons` puts Deny first)
    let buttons = if cfg!(target_os = "macos") { [("Later", "later"), ("Update", "update")] } else { [("Update", "update"), ("Later", "later")] };
    let handle = app.clone();
    toast::with_buttons(&app, "Theme updates available", &body, &buttons, move |arg| {
        if arg == Some("update") {
            tauri::async_runtime::spawn(update_changed(handle.clone(), root.clone(), found.clone()));
        }
    });
}

/// The startup toast's "Update": each pack of `found` installed from the archive the check compared (`packs::apply`),
/// a failure not stopping the rest. All went well and one was replaced: restart at once. One failed: no restart, a
/// toast names the failed repos and why (and says to restart to apply what was replaced).
async fn update_changed(app: AppHandle, root: PathBuf, found: std::sync::Arc<Vec<packs::Checked>>) {
    let applied = tauri::async_runtime::spawn_blocking(move || on_pack_disk(|| packs::apply(&root, &found, &now_utc()))).await;
    let (replaced, failed) = match applied {
        Ok(r) => r,
        Err(e) => (false, vec![("theme packs".to_string(), e.to_string())]),
    };
    for (repo, e) in &failed {
        status::report("packs", status::State::Warn, format!("pack update: {repo}: {e}"));
    }
    match updated(replaced, &failed) {
        Updated::Restart => app.restart(),
        Updated::Failed(body) => {
            let _ = app.notification().builder().title("Theme update failed").body(body).show();
        }
        Updated::Nothing => {}
    }
}

/// What the startup toast's Update does once every pack was tried (`update_changed`).
#[derive(Debug, PartialEq)]
enum Updated {
    /// All went well and one was replaced: restart at once, to load it.
    Restart,
    /// One failed: no restart; the toast's body names each failed repo and why (cut short), and asks for a restart
    /// when the others replaced something.
    Failed(String),
    /// Nothing replaced, nothing failed (the packs were already as checked).
    Nothing,
}
fn updated(replaced: bool, failed: &[(String, String)]) -> Updated {
    if failed.is_empty() {
        return if replaced { Updated::Restart } else { Updated::Nothing };
    }
    let mut body = failed.iter().map(|(repo, e)| format!("{repo}: {}", short(e, 80))).collect::<Vec<_>>().join("; ");
    if replaced {
        body.push_str(". The others are updated: restart to apply them.");
    }
    Updated::Failed(body)
}

/// Remove the pack in the folder `dir` (`packs::remove`); a local pack (a folder made by hand) is refused, never deleted.
#[tauri::command(async)]
fn theme_pack_remove(dir: String, app: AppHandle) -> Result<(), String> {
    let root = themes_root(&app)?;
    on_pack_disk(|| packs::remove(&root, &dir))
}

/// Restart the app (a pack installed, updated or removed is loaded at start).
#[tauri::command]
fn restart(app: AppHandle) {
    app.restart();
}

/// `s` cut to at most `max` characters, the last one an ellipsis when it was cut.
fn short(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        s.chars().take(max.saturating_sub(1)).chain(['…']).collect()
    } else {
        s.to_string()
    }
}

/// The toast of a click that only opens a session's terminal and could not (`open_failed`): (title, body).
fn open_failed_toast(name: &str, error: &str) -> (&'static str, String) {
    let name = short(name.trim(), 60);
    let error = short(error.trim(), 120);
    ("Terminal not opened", if name.is_empty() { error } else { format!("{name}: {error}") })
}

/// A click on a character that shows no card (Settings > Show the card when I click a character, off: card.js `pick`)
/// whose terminal did not open: said in a toast, or the click would seem to do nothing. Host only, as every command
/// outside the remote view's list; the texts come from the page, so they are cut short and shown as text.
#[tauri::command]
fn open_failed(name: String, error: String, app: AppHandle) {
    let (title, body) = open_failed_toast(&name, &error);
    let _ = app.notification().builder().title(title).body(body).show();
}

/// UI settings from the config dir ({} if missing or corrupt); localStorage is only a cache.
/// Never includes the backend's `remote.*` keys (the remote view's token among them).
#[tauri::command(async)]
fn settings_load(app: AppHandle) -> Result<serde_json::Value, String> {
    Ok(settings::public(settings::load(&settings_path(&app)?)))
}

#[tauri::command(async)]
fn settings_save(values: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let path = settings_path(&app)?;
    settings::update(&path, |old| settings::merge_ui(&old, &values))?;
    let saved = settings::load(&path);
    monitor::set(monitor::config_from(&saved));
    rooms::set(rooms::rules_from(&saved));
    Ok(())
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
    let mut progress = UpdateProgress::default();
    let events = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                let _ = events.emit("update-progress", progress.add(chunk, total)); // the PC's own UI only, never the remote view
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

/// The `update-progress` event's payload while the update downloads: bytes so far, and the total when the server
/// said it (None: unknown).
#[derive(serde::Serialize, Clone, Debug, Default, PartialEq)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

impl UpdateProgress {
    /// One more chunk of `chunk` bytes arrived; the payload to emit.
    fn add(&mut self, chunk: usize, total: Option<u64>) -> UpdateProgress {
        self.downloaded += chunk as u64;
        self.total = total;
        self.clone()
    }
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
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["strip"]).build()) // the strip's window (Linux): the compositor places it
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            orca::open_session,
            open_folder,
            orca::peek_petition,
            orca::answer_petition,
            opencode::answer_opencode,
            chronicle_day,
            tithe_day,
            chronicle_days,
            day_report,
            honours,
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
            theme_packs,
            theme_pack_file,
            theme_pack_install,
            theme_pack_update,
            theme_pack_remove,
            restart,
            open_failed,
            rooms::rooms_test,
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
            strip::place_column,
            strip::place_hall,
            strip::set_click_through,
            strip::set_strip_hits,
            strip::set_strip_reserve,
            strip::set_strip_menu,
            window::on_top_supported,
            window::set_chime_menu,
            status::integration_status,
            toast::test_notification
        ])
        .setup(move |app| {
            // No Dock icon or app menu: a widget that lives in the tray (skipTaskbar is ignored on macOS).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // a pack an interrupted install left moved aside is back before the UI lists the packs (single instance:
            // no install is running now)
            if let Ok(root) = themes_root(app.handle()) {
                packs::recover(&root);
            }
            if let Ok(dir) = app.path().app_data_dir() {
                status::init(&dir); // the log file, before the first thing that can fail
            }
            app.manage::<vigil::app::VigilBox>(Mutex::new(vigil::Vigil::default())); // before build_tray: the tray item reads it
            #[cfg(target_os = "linux")]
            strip::init(); // before build_tray: the tray's strip item asks strip_supported
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
            monitor::set(monitor::config_from(&saved));
            rooms::set(rooms::rules_from(&saved));
            #[cfg(not(windows))]
            toast::actions::hook(app.handle()); // before the first toast: toasts shown earlier report no click
            if demo && std::env::var_os("ADMINISTRATUM_TEST_TOAST").is_some() {
                toast::test_toast(app.handle());
            }
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            remote::app::start_saved(app.handle());
            // theme packs changed on GitHub: asked about in a toast, a few seconds after start (check_packs)
            if !demo && saved["adm.packCheck"].as_str() != Some("0") {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_secs(5));
                    tauri::async_runtime::block_on(check_packs(handle));
                });
            }
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

/// One tick's Chronicon events once the sources are read: theirs, then the roster's lifecycle (arrived, left,
/// petitions; not on the first scan, which only backfills today), then the rate-limit notices.
fn tick_events(mut events: Vec<Event>, prev: &[Session], roster: &[Session], first: bool, limits: Vec<Event>, now: i64) -> Vec<Event> {
    if !first {
        events.extend(chronicle::lifecycle(prev, roster, now));
    }
    events.extend(limits);
    events
}

/// The first scan backfills today; only fresh events (under 2 min old) play live in the scene.
fn is_live(e: &Event, now: i64) -> bool {
    now - e.ts < 120_000
}

/// Newest transcript write among the files the poller already stats (subagents included), 0 when none.
fn last_write(files: &poller::Files) -> i64 {
    files.values().flatten().map(|(f, _)| f.mtime_ms).max().unwrap_or(0)
}

fn poll_loop(app: AppHandle, demo: bool) {
    let mut poller = poller::Poller::new(&claude_dir());
    let mut opencode = opencode::Source::new();
    let mut tracker = Tracker::default();
    let mut alerts = monitor::Alerts::default();
    let mut episodes = monitor::Episodes::default();
    let mut prev: Vec<Session> = Vec::new();
    let start = Instant::now();
    let mut first = true;
    let mut first_stuck = true; // like `first`: a session already stuck before this start toasts no more
    let mut seen_pairs = std::collections::HashSet::new(); // (a, b, path key) already toasted: one toast per pair and path
    let mut last_tick = Instant::now();
    let mut last_t = 0;
    let mut tip: Option<usize> = None; // the waiting count the tray tooltip shows
    loop {
        // A panic in one tick (transcripts are untrusted input) is logged and skipped; the next
        // tick runs as usual instead of the widget freezing on stale state.
        let tick = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let now = now_ms();
            let mut roster = if demo {
                demo::roster(start.elapsed().as_secs())
            } else {
                let mut roster = poller.roster(&prev, now);
                let mut theirs = opencode.roster(now);
                registry::track_compaction(&prev, &mut theirs, now); // the poller ran it on Claude's sessions
                roster.extend(theirs);
                roster
            };
            rooms::assign(&mut roster, &rooms::get()); // before anything reads the roster: toasts, the remote view, prev
            opencode_risk(&mut roster);
            let limit_events = notify(&app, &mut tracker, &roster, first, now);
            let mut turns = std::collections::HashMap::new();
            let mut pairs = vec![];
            {
                let elapsed = (last_tick.elapsed().as_millis() as u64).min(5_000); // a sleep/resume gap is not work
                last_tick = Instant::now();
                let chron = app.state::<Chron>();
                let mut c = lock(&chron);
                let events = if demo {
                    let t = start.elapsed().as_secs();
                    for (dept, u) in demo::usage(&roster, now) {
                        c.add_usage(&dept, &u);
                    }
                    c.add_busy(&roster, elapsed, now);
                    let ev = demo::chronicle(last_t, t, &roster, now);
                    last_t = t;
                    ev
                } else {
                    let mut ev = c.read_transcripts(&roster, &poller.files, now);
                    let family = opencode.family();
                    ev.extend(opencode.with_messages(|rows| c.read_opencode(&roster, &family, rows, now)));
                    turns = c.turns(&poller.files);
                    turns.extend(c.opencode_turns());
                    pairs = c.conflicts(&roster, now);
                    ev
                };
                let from_transcripts = !demo && !events.is_empty();
                let events = tick_events(events, &prev, &roster, first, limit_events, now);
                for e in &events {
                    c.record(e);
                    if is_live(e, now) {
                        emit(&app, "chronicle", e);
                    }
                }
                // The first tick seeds the alerts: a session already past the mark before this start toasts no more.
                let over = alerts_after_seed(&mut alerts, c.tithe(), monitor::get().token_alert, first);
                for e in token_alerts(&app, over, now) {
                    c.record(&e);
                    emit(&app, "chronicle", &e);
                }
                c.maybe_flush(now, from_transcripts);
                first = false;
                fill_tokens_today(&mut roster, &c, now);
            }
            let cfg = monitor::get();
            for s in roster.iter_mut() {
                s.turn = turns.remove(&s.id);
                // Newest write among its transcripts, subagents' included: a working subagent is progress.
                let last_write = poller.files.get(&s.id).and_then(|fs| fs.iter().map(|(f, _)| f.mtime_ms).max());
                s.stuck = monitor::stuck_of(s, last_write, &cfg, now);
            }
            let fresh_stuck = episodes_after_seed(&mut episodes, &roster, first_stuck);
            let mut events = stuck_toasts(&app, &fresh_stuck, cfg.stuck_toast, now);
            let fresh_pairs = same_file(&mut roster, &pairs, &mut seen_pairs, first_stuck);
            events.extend(conflict_toasts(&app, &roster, &fresh_pairs, now));
            for e in events {
                lock(&app.state::<Chron>()).record(&e);
                emit(&app, "chronicle", &e);
            }
            first_stuck = false;
            // Night Vigil: the newest transcript write.
            let last_write = last_write(&poller.files);
            vigil::app::tick(&app, &roster, last_write, now, demo);
            lock(&app.state::<Live>()).clone_from(&roster);
            // ponytail: emit every tick (a late-loading webview never misses state); diff if it ever shows in a profile.
            emit(&app, "roster", &roster);
            let waiting = window::waiting_count(&roster);
            if tip != Some(waiting) {
                tip = Some(waiting);
                window::set_tray_tooltip(&app, waiting);
            }
            prev = roster;
        }));
        if tick.is_err() {
            status::report("poll", status::State::Error, "poll tick panicked, skipped");
            app.state::<Chron>().clear_poison(); // keep the Chronicon commands working
            app.state::<vigil::app::VigilBox>().clear_poison();
        }
        thread::sleep(Duration::from_secs(1));
    }
}

/// Sessions newly past the token alert. The first tick only seeds `alerts`: a session already past the mark
/// before this start toasts no more.
fn alerts_after_seed(alerts: &mut monitor::Alerts, tithe: &Tithe, limit: Option<u64>, first: bool) -> Vec<(String, chronicle::SessionTithe)> {
    let over = alerts.over(tithe, limit);
    if first {
        vec![]
    } else {
        over
    }
}

/// Sessions with a new stuck episode. The first tick only seeds `episodes`: a session already stuck before this
/// start toasts no more.
fn episodes_after_seed<'a>(episodes: &mut monitor::Episodes, roster: &'a [Session], first: bool) -> Vec<&'a Session> {
    let fresh = episodes.fresh(roster);
    if first {
        vec![]
    } else {
        fresh
    }
}

/// Each session's tokens of the live day (none after midnight until the new day's first token).
fn fill_tokens_today(roster: &mut [Session], c: &Chronicle, now: i64) {
    for s in roster.iter_mut() {
        s.tokens_today = c.tokens_today(&s.id, now);
    }
}

/// The token alert's toasts (quiet hours respected) and their Chronicon events.
fn token_alerts(app: &AppHandle, over: Vec<(String, chronicle::SessionTithe)>, now_ms: i64) -> Vec<Event> {
    let words = toast::get();
    let quiet = quiet::active();
    over.into_iter()
        .map(|(id, s)| {
            let count = monitor::fmt_tokens(s.fresh);
            if !quiet {
                let title = toast::fill(&words.tokens, &s.name).replace("{count}", &count);
                let _ = app.notification().builder().title(title).body(format!("{} · {count} new tokens today", s.dept)).show();
            }
            Event { ts: now_ms, kind: "token-alert".into(), session_id: id, name: s.name, dept: s.dept, helper: None, detail: count, reset_ms: None, hit_ms: None }
        })
        .collect()
}

/// New stuck episodes: a toast each when wanted (quiet hours respected; never for the break-out room), and their
/// Chronicon events.
fn stuck_toasts(app: &AppHandle, fresh: &[&Session], toast_on: bool, now_ms: i64) -> Vec<Event> {
    let words = toast::get();
    let quiet = quiet::active();
    fresh
        .iter()
        .filter_map(|s| {
            let detail = monitor::stuck_detail(s.stuck.as_ref()?, now_ms);
            if toast_on && !quiet && !s.temp {
                let _ = app.notification().builder().title(toast::fill(&words.stuck, &s.name)).body(format!("{} · {detail}", s.dept)).show();
            }
            Some(Event::for_session(now_ms, "stuck", s, detail))
        })
        .collect()
}

/// Sets each session's `same_file` (its first pair; the file's name, never its path) and returns the pairs not seen
/// before (`seen`: by both ids and the path key). The first tick only seeds `seen`: an overlap from before this start
/// toasts no more.
// ponytail: `seen` keeps every pair of this run (a few bytes each); one toast per pair and path is the rule.
fn same_file<'a>(roster: &mut [Session], pairs: &'a [chronicle::conflict::Pair], seen: &mut std::collections::HashSet<String>, first: bool) -> Vec<&'a chronicle::conflict::Pair> {
    let name = |roster: &[Session], id: &str| roster.iter().find(|s| s.id == id).map(|s| s.name.clone()).unwrap_or_default();
    for p in pairs.iter().rev() {
        // reversed: the first pair of a session is the one it keeps
        let file = chronicle::conflict::file_name(&p.path).to_string();
        let (na, nb) = (name(roster, &p.a), name(roster, &p.b));
        for s in roster.iter_mut() {
            if s.id == p.a {
                s.same_file = Some(registry::SameFile { file: file.clone(), other: nb.clone() });
            } else if s.id == p.b {
                s.same_file = Some(registry::SameFile { file: file.clone(), other: na.clone() });
            }
        }
    }
    let fresh: Vec<_> = pairs.iter().filter(|p| seen.insert(format!("{}\n{}\n{}", p.a, p.b, p.key))).collect();
    if first {
        vec![]
    } else {
        fresh
    }
}

/// New same-file pairs: a toast each (quiet hours respected; never for the break-out room) and a `conflict` event on the first session of the pair.
fn conflict_toasts(app: &AppHandle, roster: &[Session], fresh: &[&chronicle::conflict::Pair], now_ms: i64) -> Vec<Event> {
    let quiet = quiet::active();
    fresh
        .iter()
        .filter_map(|p| {
            let (a, b) = (roster.iter().find(|s| s.id == p.a)?, roster.iter().find(|s| s.id == p.b)?);
            let detail = format!("{} · {}", chronicle::conflict::file_name(&p.path), b.name);
            if !quiet && !a.temp && !b.temp {
                // the break-out room is quiet, as for stuck toasts
                let _ = app.notification().builder().title(format!("{} and {} edit the same file", a.name, b.name)).body(&detail).show();
            }
            Some(Event::for_session(now_ms, "conflict", a, detail))
        })
        .collect()
}

/// This tick's toasts and UI events: new petitions, questions, stale petitions, and usage-limit waves. Returns the
/// waves' Chronicon events. `first`: the app's first tick, whose limits were reached before it started.
fn notify(app: &AppHandle, tracker: &mut Tracker, roster: &[Session], first: bool, now_ms: i64) -> Vec<Event> {
    let words = toast::get();
    let quiet = quiet::active();
    for s in tracker.new_petitions(roster) {
        if !quiet {
            let body = petition_body(&s, &words);
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
            let q = registry::clip_to(&mask::mask(&q), 120);
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
        let body = petition_body(&s, &words);
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
                limit_events.push(limit_event(now_ms, s, time.clone()));
            }
        }
    }
    limit_events
}

/// A petition toast's body: the department, what it waits for, and the reason when its command is risky.
fn petition_body(s: &Session, words: &toast::Text) -> String {
    let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
    s.risk.as_ref().map_or_else(|| body.clone(), |r| format!("{body} · risky: {r}"))
}

/// An OpenCode petition's risk, from its request's detail as OpenCode sends it (the poller fills Claude's from the
/// transcript, registry/tail.rs `pending_risk`).
fn opencode_risk(roster: &mut [Session]) {
    for s in roster.iter_mut().filter(|s| s.source == registry::Agent::OpenCode) {
        // asks is "<action>: <resource>": the resource is the command (a command start for the patterns)
        let command = s.asks.as_deref().filter(|_| s.status == "waiting").map(|a| a.split_once(": ").map_or(a, |(_, r)| r));
        s.risk = command.and_then(registry::risk_of).map(str::to_string);
    }
}

/// A session's `limit` event, with its reset hour and hit time (the usage window's ceilings, chronicle::window_of).
fn limit_event(now_ms: i64, s: &Session, time: String) -> Event {
    let (reset_ms, hit_ms) = s.limit.as_ref().map_or((None, None), |l| (l.reset_ms, l.hit_ms));
    Event { reset_ms, hit_ms, ..Event::for_session(now_ms, "limit", s, time) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use registry::FileStat;

    fn session(id: &str, status: &str) -> Session {
        Session { id: id.into(), name: id.into(), dept: "Terra".into(), status: status.into(), waiting_for: Some("approve Bash".into()), ..Default::default() }
    }
    fn event(ts: i64, kind: &str) -> Event {
        Event { ts, kind: kind.into(), session_id: "s".into(), name: "s".into(), dept: "Terra".into(), helper: None, detail: String::new(), reset_ms: None, hit_ms: None }
    }
    fn kinds(ev: &[Event]) -> Vec<&str> {
        ev.iter().map(|e| e.kind.as_str()).collect()
    }

    #[test]
    fn the_startup_update_restarts_only_when_all_went_well() {
        let f = |r: &str, e: &str| (r.to_string(), e.to_string());
        assert_eq!(updated(true, &[]), Updated::Restart, "one replaced, none failed: restart");
        assert_eq!(updated(false, &[]), Updated::Nothing, "nothing replaced: no restart");
        assert_eq!(updated(false, &[f("a/b", "no public repository a/b")]), Updated::Failed("a/b: no public repository a/b".into()));
        assert_eq!(
            updated(true, &[f("a/b", "x"), f("c/d", "y")]),
            Updated::Failed("a/b: x; c/d: y. The others are updated: restart to apply them.".into()),
            "a failure never restarts; what was replaced waits for a restart"
        );
        let Updated::Failed(body) = updated(false, &[f("a/b", &"e".repeat(200))]) else { panic!() };
        assert_eq!(body.chars().count(), "a/b: ".len() + 80, "a long error cut to 80");
        assert!(body.ends_with('…'));
    }

    #[test]
    fn pack_changes_run_one_at_a_time() {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        static IN: AtomicUsize = AtomicUsize::new(0);
        static MOST: AtomicUsize = AtomicUsize::new(0);
        let runs: Vec<_> = (0..4)
            .map(|_| {
                thread::spawn(|| {
                    on_pack_disk(|| {
                        MOST.fetch_max(IN.fetch_add(1, SeqCst) + 1, SeqCst);
                        thread::sleep(Duration::from_millis(30));
                        IN.fetch_sub(1, SeqCst);
                    })
                })
            })
            .collect();
        for r in runs {
            r.join().unwrap();
        }
        assert_eq!(MOST.load(SeqCst), 1, "never two changes to the themes folder at once");
        assert_eq!(on_pack_disk(|| 7), 7, "the result comes back");
    }

    #[test]
    fn a_terminal_not_opened_is_said_short() {
        assert_eq!(open_failed_toast("Scribe 1", "orca not found"), ("Terminal not opened", "Scribe 1: orca not found".to_string()));
        assert_eq!(open_failed_toast("  ", "orca not found").1, "orca not found", "no name: the error alone");
        let (_, body) = open_failed_toast(&"n".repeat(100), &"e".repeat(500));
        assert_eq!(body.chars().count(), 60 + 2 + 120, "both cut short");
        assert!(body.ends_with('…'));
        assert_eq!(short("abc", 3), "abc");
        assert_eq!(short("abcd", 3), "ab…");
    }

    #[test]
    fn a_download_refused_is_said_in_our_words() {
        assert_eq!(download_refused(200, "a/b"), None);
        assert_eq!(download_refused(301, "a/b").as_deref(), Some("the repository a/b has moved: type its new name"));
        assert_eq!(download_refused(302, "a/b").as_deref(), Some("the repository a/b has moved: type its new name"));
        assert_eq!(download_refused(403, "a/b").as_deref(), Some("GitHub refused for now, try again later"));
        assert_eq!(download_refused(429, "a/b").as_deref(), Some("GitHub refused for now, try again later"));
        assert_eq!(download_refused(404, "a/b").as_deref(), Some("no public repository a/b"));
        assert_eq!(download_refused(500, "a/b").as_deref(), Some("the download of a/b failed (GitHub answered 500)"));
    }

    #[test]
    fn an_opencode_petition_gets_its_risk_from_its_request() {
        let oc = |asks: &str, status: &str| Session { source: registry::Agent::OpenCode, asks: Some(asks.into()), ..session("o", status) };
        let mut roster = [
            oc("bash: git push --force origin main", "waiting"),
            oc("bash: ls", "waiting"),
            oc("bash: rm -rf x", "busy"),
            oc("bash: rm -rf x", "waiting"),
            Session { asks: Some("rm -rf x".into()), risk: Some("kept".into()), ..session("c", "waiting") },
        ];
        opencode_risk(&mut roster);
        let risks: Vec<_> = roster.iter().map(|s| s.risk.as_deref()).collect();
        assert_eq!(risks, [Some("git push --force"), None, None, Some("rm -r"), Some("kept")], "only a waiting OpenCode request, its command after the action; Claude's comes from its transcript");
        assert_eq!(petition_body(&roster[0], &toast::Text::default()), "Terra · approve Bash · risky: git push --force");
    }

    #[test]
    fn same_file_tags_both_sessions_and_toasts_once_per_pair_and_path() {
        use chronicle::conflict::Pair;
        let pair = |a: &str, b: &str, path: &str| Pair { a: a.into(), b: b.into(), path: path.into(), key: path.to_lowercase() };
        let mut roster = [session("a", "busy"), session("b", "busy"), session("c", "idle")];
        let pairs = [pair("a", "b", r"C:\git\Terra\ui\app.js")];
        let mut seen = std::collections::HashSet::new();
        assert!(same_file(&mut roster, &pairs, &mut seen, true).is_empty(), "the first tick seeds");
        assert_eq!(roster[0].same_file, Some(registry::SameFile { file: "app.js".into(), other: "b".into() }), "the name, never the path");
        assert_eq!(roster[1].same_file.as_ref().map(|f| f.other.as_str()), Some("a"));
        assert_eq!(roster[2].same_file, None);
        let more = [pairs[0].clone(), pair("a", "c", r"C:\git\Terra\ui\app.js"), pair("a", "b", r"C:\git\Terra\ui\b.js")];
        let fresh: Vec<_> = same_file(&mut roster, &more, &mut seen, false).into_iter().map(|p| (p.b.as_str(), p.key.as_str())).collect();
        assert_eq!(fresh, [("c", r"c:\git\terra\ui\app.js"), ("b", r"c:\git\terra\ui\b.js")], "a new pair or a new path toasts; a seen one does not");
        assert!(same_file(&mut roster, &more, &mut seen, false).is_empty(), "once each");
    }

    #[test]
    fn a_limit_event_carries_the_reset_and_the_hit() {
        let limit = Some(registry::Limit { reset_ms: Some(9_000), hit_ms: Some(4_000), text: "x".into() });
        let e = limit_event(10, &Session { limit, ..session("a", "idle") }, "14:00".into());
        assert_eq!((e.kind.as_str(), e.ts, e.reset_ms, e.hit_ms, e.detail.as_str()), ("limit", 10, Some(9_000), Some(4_000), "14:00"));
    }

    #[test]
    fn the_first_scan_only_backfills() {
        let roster = [session("a", "waiting")];
        let ev = tick_events(vec![event(1, "commit")], &[], &roster, true, vec![event(2, "limit")], 10);
        assert_eq!(kinds(&ev), ["commit", "limit"]);
    }

    #[test]
    fn later_ticks_add_the_lifecycle_between_sources_and_limits() {
        let prev = [session("a", "busy"), session("gone", "idle")];
        let roster = [session("a", "waiting"), session("b", "busy")];
        let ev = tick_events(vec![event(1, "commit")], &prev, &roster, false, vec![event(2, "limit")], 10);
        assert_eq!(kinds(&ev), ["commit", "petition", "arrived", "left", "limit"]);
        assert!(ev[1..4].iter().all(|e| e.ts == 10), "lifecycle events are stamped now");
        assert_eq!(kinds(&tick_events(vec![], &roster, &roster, false, vec![], 10)), Vec::<&str>::new(), "no change, no event");
    }

    #[test]
    fn only_fresh_events_play_live() {
        let now = 1_000_000;
        assert!(is_live(&event(now, "commit"), now));
        assert!(is_live(&event(now - 119_999, "commit"), now));
        assert!(!is_live(&event(now - 120_000, "commit"), now));
        assert!(!is_live(&event(0, "commit"), now), "a backfilled morning event");
    }

    fn tithe(day: &str, fresh: &[(&str, u64)]) -> Tithe {
        let mut t = Tithe::new(day);
        for (id, n) in fresh {
            t.by_session.insert((*id).into(), chronicle::SessionTithe { name: (*id).into(), dept: "Terra".into(), fresh: *n, total: *n });
        }
        t
    }

    #[test]
    fn the_first_tick_seeds_the_token_alerts() {
        let mut alerts = monitor::Alerts::default();
        let ids = |v: Vec<(String, chronicle::SessionTithe)>| v.into_iter().map(|(id, _)| id).collect::<Vec<_>>();
        let t = tithe("2026-10-17", &[("a", 500), ("b", 10)]);
        assert!(alerts_after_seed(&mut alerts, &t, Some(100), true).is_empty(), "already over at start: no toast");
        assert!(alerts_after_seed(&mut alerts, &t, Some(100), false).is_empty(), "and none on the next tick either");
        let t = tithe("2026-10-17", &[("a", 600), ("b", 150)]);
        assert_eq!(ids(alerts_after_seed(&mut alerts, &t, Some(100), false)), ["b"], "a later crossing toasts");
    }

    #[test]
    fn the_first_tick_seeds_the_stuck_episodes() {
        let mut episodes = monitor::Episodes::default();
        let stuck = Some(registry::Stuck { kind: "silent".into(), since_ms: 5, tool: None, count: 0 });
        let a = Session { stuck: stuck.clone(), ..session("a", "busy") };
        let ids = |v: Vec<&Session>| v.into_iter().map(|s| s.id.clone()).collect::<Vec<_>>();
        assert!(episodes_after_seed(&mut episodes, std::slice::from_ref(&a), true).is_empty(), "already stuck at start: no toast");
        assert!(episodes_after_seed(&mut episodes, std::slice::from_ref(&a), false).is_empty(), "and none on the next tick either");
        let roster = [a, Session { stuck, ..session("b", "busy") }];
        assert_eq!(ids(episodes_after_seed(&mut episodes, &roster, false)), ["b"], "a later episode toasts");
    }

    #[test]
    fn the_roster_gets_each_sessions_tokens_today() {
        let dir = std::env::temp_dir().join(format!("adm-main-tokens-{}", std::process::id()));
        let day_ms = 86_400_000;
        let ts = 1_792_000_000_000; // mid-October 2026; +24 h is always the next local day
        let mut c = Chronicle::open(dir.clone(), ts, true);
        let u = chronicle::Usage { ts, model: "m".into(), tokens: chronicle::Tokens { input: 7, output: 3, cache_read: 0, cache_write: 0 }, in_window: true };
        c.add_session_usage(&session("a", "busy"), &u);
        let mut roster = vec![session("a", "busy"), session("b", "busy")];
        fill_tokens_today(&mut roster, &c, ts);
        assert_eq!((roster[0].tokens_today, roster[1].tokens_today), (Some(10), None), "a session with no token yet has none");
        fill_tokens_today(&mut roster, &c, ts + day_ms);
        assert_eq!(roster[0].tokens_today, None, "after midnight, before the new day's first token");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn last_write_is_the_newest_mtime_or_zero() {
        let f = |mtime_ms| (FileStat { path: "t.jsonl".into(), len: 1, mtime_ms }, false);
        let mut files = poller::Files::new();
        assert_eq!(last_write(&files), 0);
        files.insert("a".into(), vec![f(5), f(30)]);
        files.insert("b".into(), vec![f(20)]);
        files.insert("c".into(), vec![]);
        assert_eq!(last_write(&files), 30);
    }

    #[test]
    fn the_update_progress_payload_adds_up_the_chunks() {
        let mut p = UpdateProgress::default();
        assert_eq!(p.add(1000, Some(4000)), UpdateProgress { downloaded: 1000, total: Some(4000) });
        assert_eq!(p.add(500, Some(4000)), UpdateProgress { downloaded: 1500, total: Some(4000) });
        assert_eq!(p.add(10, None), UpdateProgress { downloaded: 1510, total: None }, "an unknown total stays unknown");
        let j = serde_json::to_value(p.add(0, Some(4000))).unwrap();
        assert_eq!((j["downloaded"].as_u64(), j["total"].as_u64()), (Some(1510), Some(4000)), "the shape the UI reads");
    }
}
