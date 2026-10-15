//! The main window: the tray icon and its menu, show / hide, and the watcher that tells the UI when the window is seen.
use crate::{
    strip,
    vigil::app::{vigil_set, VigilBox, VigilItem},
};
#[cfg(windows)]
use std::{thread, time::Duration};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

/// 5x5 points spread over a rect (left, top, right, bottom), each at the centre of its cell.
#[cfg_attr(not(windows), allow(dead_code))] // on_screen is Windows-only
fn sample_grid(l: i32, t: i32, r: i32, b: i32) -> impl Iterator<Item = (i32, i32)> {
    (0..25).map(move |i| (l + (r - l) * (2 * (i % 5) + 1) / 10, t + (b - t) * (2 * (i / 5) + 1) / 10))
}

/// Can the user see any of the main window? False when minimised, hidden (tray) or covered: none
/// of 25 points over the client area hit-tests to it (WindowFromPoint skips hidden and cloaked
/// windows, and finds the WebView2 child, whose root is ours).
///
/// `grid`: the strip is click-through (WS_EX_TRANSPARENT|WS_EX_LAYERED via
/// `set_ignore_cursor_events`), so `WindowFromPoint` never resolves to it and the grid always
/// reports "covered" there; skip it while the strip is on and rely on minimised/visible only.
// ponytail: sampling, so a sliver showing between grid points counts as covered; walk the Z-order if that matters.
#[cfg(windows)]
fn on_screen(hwnd: windows_sys::Win32::Foundation::HWND, grid: bool) -> bool {
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
        if !grid {
            return true;
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
pub fn watch_visibility(app: AppHandle) {
    let Some(hwnd) = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as usize) else { return };
    let mut last = true;
    loop {
        thread::sleep(Duration::from_secs(2));
        let now = on_screen(hwnd as windows_sys::Win32::Foundation::HWND, !strip::ON.load(std::sync::atomic::Ordering::SeqCst));
        if now != last {
            last = now;
            let _ = app.emit("visible", now);
        }
    }
}

/// Can the user see the main window right now? A minimised, hidden or covered window is not seen.
fn seen(w: &tauri::WebviewWindow) -> bool {
    #[cfg(windows)]
    return w.hwnd().map(|h| on_screen(h.0 as _, !strip::ON.load(std::sync::atomic::Ordering::SeqCst))).unwrap_or(false);
    #[cfg(not(windows))]
    return w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
}

/// Bring the main window to the front: un-minimise, show, focus. Also what a second launch does.
pub fn reveal(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit("visible", true);
    }
}

/// Tray "Show / hide": hide only a window the user can see; a minimised or covered one comes to the front.
fn toggle_window(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(w) if seen(&w) => {
            let _ = w.hide();
            let _ = app.emit("visible", false);
        }
        Some(_) => reveal(app),
        None => {}
    }
}

/// The tray's "Chime" check item; a newtype since the login item is the managed `CheckMenuItem`.
pub struct ChimeItem(CheckMenuItem<tauri::Wry>);

/// Keeps the tray check in step with the UI's mute (the header bell, Settings or the tray itself).
#[tauri::command]
pub fn set_chime_menu(item: tauri::State<ChimeItem>, on: bool) -> Result<(), String> {
    item.0.set_checked(on).map_err(|e| e.to_string())
}

pub fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show / hide", true, None::<&str>)?;
    let mute = CheckMenuItem::with_id(app, "mute", "Chime", true, true, None::<&str>)?; // the UI sets it (set_chime_menu)
    let light = MenuItem::with_id(app, "light", "Cycle lighting", true, None::<&str>)?;
    let strip = CheckMenuItem::with_id(app, "strip", "Desktop strip", cfg!(windows), false, None::<&str>)?;
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(app, "login", "Start at login", true, login_on, None::<&str>)?;
    let vigil = CheckMenuItem::with_id(app, "vigil", "Night Vigil", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mute, &light, &strip, &login, &vigil, &quit])?;
    app.manage(login);
    app.manage(VigilItem(vigil));
    app.manage(ChimeItem(mute.clone()));
    app.manage(strip::StripItem(strip));
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Administratum")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => toggle_window(app),
            "mute" => {
                let _ = app.emit("ui-command", "mute"); // the PC's own UI only, never the remote view
            }
            "light" => {
                let _ = app.emit("ui-command", "light"); // the PC's own UI only, never the remote view
            }
            "strip" => {
                let _ = app.emit("ui-command", "strip"); // the PC's own UI only, never the remote view
            }
            "login" => {
                let al = app.autolaunch();
                let _ = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
                let on = al.is_enabled().unwrap_or(false);
                let _ = app.state::<CheckMenuItem<tauri::Wry>>().set_checked(on);
                let _ = app.emit("autostart", on);
            }
            "vigil" => {
                let armed = crate::lock(&app.state::<VigilBox>()).state().armed;
                vigil_set(app, !armed);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn sample_grid_stays_inside_and_spans_the_rect() {
        let pts: Vec<_> = super::sample_grid(100, 50, 600, 450).collect();
        assert_eq!(pts.len(), 25);
        assert!(pts.iter().all(|&(x, y)| (100..600).contains(&x) && (50..450).contains(&y)));
        assert_eq!((pts[0], pts[24]), ((150, 90), (550, 410)));
    }
}
