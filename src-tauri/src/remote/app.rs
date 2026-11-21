//! The remote view in the app: its settings (`remote.*`), the backend it calls, and the settings panel's commands
//! (remote view and its firewall rule).
#[cfg(windows)]
use crate::firewall;
use crate::{
    chronicle_day, chronicle_days, honours,
    opencode::answer_opencode,
    orca::{answer_petition, peek_petition},
    packs, remote, settings, settings_load, settings_path, status, themes_root, tithe_day,
    vigil::app::vigil_set,
};
use tauri::{AppHandle, Manager};

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

/// A Tithe as the remote (LAN) view gets it. Per-session counts (old sessions' ids included) stay local: the remote
/// reads tokensToday on the roster. So do the edited files' paths; their count stays.
fn remote_tithe(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(o) = v.as_object_mut() {
        o.remove("bySession");
        let drop_files = |s: &mut serde_json::Value| _ = s.as_object_mut().map(|s| s.remove("files"));
        o.get_mut("byProject").and_then(|p| p.as_object_mut()).into_iter().flat_map(|p| p.values_mut()).for_each(drop_files);
        o.get_mut("hourly").and_then(|h| h.as_array_mut()).into_iter().flatten().for_each(drop_files);
    }
    v
}

/// Why a remote answer is refused before it reaches the terminal or OpenCode: a risky petition (`Session.risk`) takes
/// Deny only from a remote client, the toast's rule (`toast::accepts`). The petition is found by its Orca handle or its
/// OpenCode session; one not on the roster is left to the answer's own checks.
fn refused(roster: &[crate::registry::Session], c: &remote::Call) -> Option<String> {
    let (s, choice) = match c {
        remote::Call::AnswerPetition { handle, choice } => (roster.iter().find(|s| s.orca.as_deref() == Some(handle))?, choice),
        remote::Call::AnswerOpenCode { session, choice, .. } => (roster.iter().find(|s| s.id == *session)?, choice),
        _ => return None,
    };
    (s.risk.is_some() && choice != "no").then(|| format!("risky petition ({}): Deny only", s.risk.as_deref().unwrap_or("")))
}

/// The app as the remote view reaches it: the read commands, answer_petition and answer_opencode
/// (gated by the server), the embedded UI files and the theme packs' files (read only). open_session and every
/// settings write stay local.
fn remote_backend(app: &AppHandle) -> remote::Backend {
    fn json<T: serde::Serialize>(r: Result<T, String>) -> Result<serde_json::Value, String> {
        r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    }
    let (a, b) = (app.clone(), app.clone());
    remote::Backend {
        call: Box::new(move |c| {
            // a risky petition: Deny only from a remote client (checked under the roster's lock, answered outside it)
            if let Some(e) = a.state::<crate::Live>().lock().ok().and_then(|r| refused(&r, &c)) {
                return Err(e);
            }
            match c {
                remote::Call::ChronicleDay(day) => json(chronicle_day(day, a.state())),
                remote::Call::TitheDay(day) => json(tithe_day(day, a.state())).map(remote_tithe),
                remote::Call::ChronicleDays => json(chronicle_days(a.state())),
                remote::Call::Honours => json(honours(a.state())),
                remote::Call::SettingsLoad => settings_load(a.clone()).map(|mut v| {
                    // The remote (LAN) view never learns the local "open folder" program/path or the day report's folder.
                    if let Some(o) = v.as_object_mut() {
                        o.retain(|k, _| !k.starts_with("adm.open") && k != "adm.reportDir");
                    }
                    v
                }),
                remote::Call::PeekPetition(handle) => json(peek_petition(handle)),
                remote::Call::ThemePacks => json(Ok(themes_root(&a).map(|root| packs::list(&root)).unwrap_or_default())),
                remote::Call::AnswerPetition { handle, choice } => json(answer_petition(handle, choice)),
                remote::Call::AnswerOpenCode { session, request, choice } => json(answer_opencode(session, request, choice, a.state())),
                remote::Call::Vigil { arm } => {
                    vigil_set(&a, arm);
                    Ok(serde_json::Value::Null)
                }
            }
        }),
        // A pack's file is read from the themes folder by packs::read, its only guard; never an embedded file in its place.
        asset: Box::new(move |p| match p.strip_prefix("themes/") {
            Some(rel) => themes_root(&b).ok().and_then(|root| packs::read(&root, rel)).map(|bytes| (bytes, packs::mime(rel).to_string())),
            None => b.asset_resolver().get(p.to_string()).map(|x| (x.bytes, x.mime_type)),
        }),
    }
}

#[derive(serde::Serialize)]
pub struct RemoteStatus {
    enabled: bool,
    port: u16,
    urls: Vec<String>,
    token_url: String,
    qr_svg: String,
    actions_allowed: bool,
    /// The setting: the LAN view was left on (it may have failed to start, see `error`).
    saved: bool,
    /// The server listens on 127.0.0.1 only (the LAN view is off; `tools/adm.mjs` uses it).
    loopback: bool,
    /// Why the server is not listening as it should, from the status store; None when it is.
    error: Option<String>,
}

/// The settings panel's view of the remote view: whether it is serving, where, and the pairing QR. `enabled` is
/// whether the LAN view is listening now; `saved` is what the setting says, so a view left on that failed to bind
/// reads `saved` without `enabled`, with its `error`.
#[tauri::command(async)]
pub fn remote_status(app: AppHandle) -> Result<RemoteStatus, String> {
    let (saved, port, actions_allowed, token) = remote_conf(&settings_path(&app)?)?;
    let urls: Vec<String> = remote::lan_ipv4().iter().map(|ip| format!("http://{ip}:{port}/")).collect();
    let token_url = urls.first().map(|u| format!("{u}?t={token}")).unwrap_or_default();
    let qr_svg = if token_url.is_empty() { String::new() } else { remote::qr_svg(&token_url) };
    let (running, lan) = (remote::running_port().is_some(), remote::lan_on());
    let error = status::entry(STATUS).filter(|e| e.state == status::State::Error).map(|e| e.message);
    Ok(RemoteStatus { enabled: running && lan, port, urls, token_url, qr_svg, actions_allowed, saved, loopback: running && !lan, error })
}

/// The integration's name in the status store.
const STATUS: &str = "remote";

/// Listen on `port`: on every interface when `lan`, else on 127.0.0.1 only. The outcome goes to the status store.
fn serve(app: &AppHandle, lan: bool, port: u16) -> Result<u16, String> {
    let bound = remote::start(remote::bind_addr(lan, port), remote_backend(app));
    match &bound {
        Ok(p) if lan => status::report(STATUS, status::State::Ok, format!("serving the LAN view on port {p}")),
        Ok(p) => status::report(STATUS, status::State::Ok, format!("listening on 127.0.0.1:{p} only (the LAN view is off)")),
        Err(e) if lan => status::report(STATUS, status::State::Error, format!("the LAN view is on but not running: {e}")),
        Err(e) => status::report(STATUS, status::State::Warn, format!("no local listener: {e}")),
    }
    bound
}

/// Serve the LAN view on `port` (or only on this machine, `enabled` false: the listener stays for `tools/adm.mjs`),
/// and allow remote actions or not. Applies at once; a port that cannot be bound leaves the remote view off and
/// returns the error.
#[tauri::command(async)]
pub fn remote_set(enabled: bool, port: u16, actions_allowed: bool, app: AppHandle) -> Result<RemoteStatus, String> {
    if port < 1024 {
        return Err("port must be between 1024 and 65535".into());
    }
    let path = settings_path(&app)?;
    remote_conf(&path)?; // the token exists before anything can pair
    remote::set_actions(actions_allowed);
    let run = match (enabled, remote::running_port()) {
        (false, Some(p)) if p == port && !remote::lan_on() => Ok(()), // already loopback only
        (false, _) => {
            _ = serve(&app, false, port); // a port taken by another program leaves no local listener, and the LAN view is off all the same
            Ok(())
        }
        (true, Some(p)) if p == port && remote::lan_on() => Ok(()),
        (true, _) => serve(&app, true, port).map(|_| ()),
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
pub fn remote_regenerate_token(app: AppHandle) -> Result<RemoteStatus, String> {
    let token = remote::new_token();
    settings::update(&settings_path(&app)?, |mut v| {
        v["remote.token"] = token.clone().into();
        v
    })?;
    remote::set_token(&token);
    remote_status(app)
}

/// Whether the Windows Firewall lets other devices reach `port` (read-only, unelevated).
#[cfg(windows)]
#[tauri::command(async)]
pub fn firewall_status(port: u16) -> Result<firewall::Status, String> {
    firewall::status(port)
}

/// Replace the remote view's firewall rule with one for this exe on `port` (UAC prompt), then re-read.
#[cfg(windows)]
#[tauri::command(async)]
pub fn firewall_allow(port: u16) -> Result<firewall::Status, String> {
    firewall::allow(port)?;
    firewall::status(port)
}

/// Remove the remote view's firewall rule (UAC prompt); `port` only for the status re-read.
#[cfg(windows)]
#[tauri::command(async)]
pub fn firewall_remove(port: u16) -> Result<firewall::Status, String> {
    firewall::remove()?;
    firewall::status(port)
}

/// At app start: load the saved token (`remote_conf` creates and saves one when there is none, as Regenerate does)
/// and actions policy, and listen: on every interface if the remote view was left on, else on 127.0.0.1 only. A bind
/// that fails is an error entry in the status store.
pub fn start_saved(app: &AppHandle) {
    match settings_path(app).and_then(|p| remote_conf(&p)) {
        Ok((enabled, port, actions, token)) => {
            remote::set_token(&token);
            remote::set_actions(actions);
            let _ = serve(app, enabled, port);
        }
        Err(e) => status::report(STATUS, status::State::Error, format!("remote view settings: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{refused, remote_tithe};
    use crate::{registry::Session, remote::Call};
    use serde_json::json;

    #[test]
    fn a_risky_petition_takes_deny_only_from_a_remote_client() {
        let s = |id: &str, orca: Option<&str>, risk: Option<&str>| Session { orca: orca.map(Into::into), risk: risk.map(Into::into), ..crate::registry::tests_session(id) };
        let roster = [s("a", Some("term_a"), Some("git push --force")), s("b", Some("term_b"), None), s("ses_c", None, Some("rm -r"))];
        let orca = |h: &str, c: &str| Call::AnswerPetition { handle: h.into(), choice: c.into() };
        let oc = |id: &str, c: &str| Call::AnswerOpenCode { session: id.into(), request: "per_1".into(), choice: c.into() };
        for c in ["yes", "always"] {
            assert!(refused(&roster, &orca("term_a", c)).is_some(), "{c} refused on a risky Orca prompt");
            assert!(refused(&roster, &oc("ses_c", c)).is_some(), "{c} refused on a risky OpenCode request");
        }
        assert_eq!(refused(&roster, &orca("term_a", "no")), None, "Deny goes");
        assert_eq!(refused(&roster, &oc("ses_c", "no")), None);
        assert_eq!(refused(&roster, &orca("term_b", "yes")), None, "a safe petition is not refused here");
        assert_eq!(refused(&roster, &orca("term_zz", "yes")), None, "unknown: left to the answer's own checks");
        assert_eq!(refused(&roster, &Call::Honours), None);
    }

    #[test]
    fn the_remote_tithe_carries_no_session_map_and_no_file_paths() {
        let share = json!({"tokens": 5, "busyMs": 1, "turns": 2, "files": ["src/secret.rs"], "moreFiles": 3});
        let v = remote_tithe(json!({
            "day": "2026-10-17", "bySession": {"a": {"name": "terra-1"}},
            "byProject": {"Terra": share.clone()}, "hourly": [share],
            "window": {"startMs": 1, "tokens": 9, "ceilings": [12]},
        }));
        let s = v.to_string();
        assert!(!s.contains("bySession") && !s.contains("secret.rs"), "{s}");
        assert_eq!(v["window"]["ceilings"][0], 12, "the usage window stays (it holds no paths)");
        assert_eq!(v["byProject"]["Terra"]["tokens"], 5, "the counts stay");
        assert_eq!(v["byProject"]["Terra"]["moreFiles"], 3, "a count, not a path");
    }
}
