//! The remote view in the app: its settings (`remote.*`), the backend it calls, and the settings panel's commands
//! (remote view and its firewall rule).
#[cfg(windows)]
use crate::firewall;
use crate::{
    chronicle_day, chronicle_days,
    opencode::answer_opencode,
    orca::{answer_petition, peek_petition},
    remote, settings, settings_load, settings_path, tithe_day,
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

/// The app as the remote view reaches it: the read commands, answer_petition and answer_opencode
/// (gated by the server), and the embedded UI files. open_session and every settings write stay local.
fn remote_backend(app: &AppHandle) -> remote::Backend {
    fn json<T: serde::Serialize>(r: Result<T, String>) -> Result<serde_json::Value, String> {
        r.and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    }
    let (a, b) = (app.clone(), app.clone());
    remote::Backend {
        call: Box::new(move |c| match c {
            remote::Call::ChronicleDay(day) => json(chronicle_day(day, a.state())),
            remote::Call::TitheDay(day) => json(tithe_day(day, a.state())).map(remote_tithe),
            remote::Call::ChronicleDays => json(chronicle_days(a.state())),
            remote::Call::SettingsLoad => settings_load(a.clone()).map(|mut v| {
                // The remote (LAN) view never learns the local "open folder" program/path or the day report's folder.
                if let Some(o) = v.as_object_mut() {
                    o.retain(|k, _| !k.starts_with("adm.open") && k != "adm.reportDir");
                }
                v
            }),
            remote::Call::PeekPetition(handle) => json(peek_petition(handle)),
            remote::Call::AnswerPetition { handle, choice } => json(answer_petition(handle, choice)),
            remote::Call::AnswerOpenCode { session, request, choice } => json(answer_opencode(session, request, choice, a.state())),
            remote::Call::Vigil { arm } => {
                vigil_set(&a, arm);
                Ok(serde_json::Value::Null)
            }
        }),
        asset: Box::new(move |p| b.asset_resolver().get(p.to_string()).map(|x| (x.bytes, x.mime_type))),
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
}

/// The settings panel's view of the remote view: whether it is serving, where, and the pairing QR.
#[tauri::command(async)]
pub fn remote_status(app: AppHandle) -> Result<RemoteStatus, String> {
    let (_, port, actions_allowed, token) = remote_conf(&settings_path(&app)?)?;
    let urls: Vec<String> = remote::lan_ipv4().iter().map(|ip| format!("http://{ip}:{port}/")).collect();
    let token_url = urls.first().map(|u| format!("{u}?t={token}")).unwrap_or_default();
    let qr_svg = if token_url.is_empty() { String::new() } else { remote::qr_svg(&token_url) };
    Ok(RemoteStatus { enabled: remote::running_port().is_some(), port, urls, token_url, qr_svg, actions_allowed })
}

/// Serve (or stop serving) on `port`, and allow remote actions or not. Applies at once; a port
/// that cannot be bound leaves the remote view off and returns the error.
#[tauri::command(async)]
pub fn remote_set(enabled: bool, port: u16, actions_allowed: bool, app: AppHandle) -> Result<RemoteStatus, String> {
    if port < 1024 {
        return Err("port must be between 1024 and 65535".into());
    }
    let path = settings_path(&app)?;
    remote_conf(&path)?; // the token exists before anything can pair
    remote::set_actions(actions_allowed);
    let run = match (enabled, remote::running_port()) {
        (false, _) => {
            remote::stop();
            Ok(())
        }
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

/// At app start: load the saved token and actions policy, and serve if the remote view was left on.
pub fn start_saved(app: &AppHandle) {
    if let Ok((enabled, port, actions, token)) = settings_path(app).and_then(|p| remote_conf(&p)) {
        remote::set_token(&token);
        remote::set_actions(actions);
        if enabled {
            if let Err(e) = remote::start(std::net::SocketAddr::from(([0, 0, 0, 0], port)), remote_backend(app)) {
                eprintln!("remote view: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::remote_tithe;
    use serde_json::json;

    #[test]
    fn the_remote_tithe_carries_no_session_map_and_no_file_paths() {
        let share = json!({"tokens": 5, "busyMs": 1, "turns": 2, "files": ["src/secret.rs"], "moreFiles": 3});
        let v = remote_tithe(json!({
            "day": "2026-10-17", "bySession": {"a": {"name": "terra-1"}},
            "byProject": {"Terra": share.clone()}, "hourly": [share],
        }));
        let s = v.to_string();
        assert!(!s.contains("bySession") && !s.contains("secret.rs"), "{s}");
        assert_eq!(v["byProject"]["Terra"]["tokens"], 5, "the counts stay");
        assert_eq!(v["byProject"]["Terra"]["moreFiles"], 3, "a count, not a path");
    }
}
