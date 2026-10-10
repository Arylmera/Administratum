//! Windows OS calls for the desktop strip: taskbar edge/auto-hide state, full-screen detection,
//! cursor position, and showing a window without activating it.
use super::Edge;
use windows_sys::Win32::Foundation::{HWND, POINT};
use windows_sys::Win32::Graphics::Gdi::{MonitorFromWindow, MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTONULL};
use windows_sys::Win32::UI::Shell::{
    SHAppBarMessage, SHQueryUserNotificationState, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_GETSTATE, ABM_GETTASKBARPOS, ABS_AUTOHIDE, APPBARDATA, QUNS_BUSY, QUNS_PRESENTATION_MODE,
    QUNS_RUNNING_D3D_FULL_SCREEN,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetForegroundWindow, ShowWindow, SW_SHOWNOACTIVATE};

/// The edge of the monitor the taskbar sits on, from the shell's own idea of its position
/// (`ABM_GETTASKBARPOS`), not the work area. `None` when the call fails (no taskbar found).
pub fn taskbar_edge() -> Option<Edge> {
    let mut data = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, ..unsafe { std::mem::zeroed() } };
    // SAFETY: APPBARDATA is a plain C struct; SHAppBarMessage only reads cbSize and writes the rest.
    if unsafe { SHAppBarMessage(ABM_GETTASKBARPOS, &mut data) } == 0 {
        return None;
    }
    match data.uEdge {
        ABE_BOTTOM => Some(Edge::Bottom),
        ABE_TOP => Some(Edge::Top),
        ABE_LEFT => Some(Edge::Left),
        ABE_RIGHT => Some(Edge::Right),
        _ => None,
    }
}

/// Whether the taskbar is set to auto-hide.
pub fn autohide() -> bool {
    let mut data = APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, ..unsafe { std::mem::zeroed() } };
    // SAFETY: APPBARDATA is a plain C struct; SHAppBarMessage only reads cbSize here.
    let state = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) };
    (state as u32) & ABS_AUTOHIDE != 0
}

/// Whether something is showing full-screen (a game, a presentation) on `strip`'s own monitor: the
/// strip should not be fighting for the taskbar's spot when the taskbar itself is suppressed. The
/// shell's state is system-wide, so the foreground window (the full-screen app) must also sit on
/// the strip's monitor; a game on another screen leaves the strip alone.
pub fn fullscreen(strip: HWND) -> bool {
    let mut state = 0;
    // SAFETY: a single out-parameter write of a plain enum value; the monitor lookups only read
    // window rects (a stale or null handle gives the nearest monitor or null, never a fault).
    unsafe {
        SHQueryUserNotificationState(&mut state) == 0
            && matches!(state, QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE)
            && MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTONULL) == MonitorFromWindow(strip, MONITOR_DEFAULTTONEAREST)
    }
}

/// The cursor's position in screen px, or `None` if the call fails.
pub fn cursor() -> Option<(i32, i32)> {
    let mut p = POINT { x: 0, y: 0 };
    // SAFETY: a single out-parameter write of a plain POINT.
    if unsafe { GetCursorPos(&mut p) } != 0 {
        Some((p.x, p.y))
    } else {
        None
    }
}

/// Shows `window` without giving it focus: Tauri's own `show()` activates, which would steal
/// focus from whatever the user is doing while the strip appears.
pub fn show_no_activate(window: &tauri::WebviewWindow) {
    if let Ok(h) = window.hwnd() {
        // SAFETY: hwnd came from Tauri's own window; ShowWindow on it is a plain Win32 call.
        unsafe {
            ShowWindow(h.0 as HWND, SW_SHOWNOACTIVATE);
        }
    }
}
