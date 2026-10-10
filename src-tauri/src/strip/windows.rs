//! Windows OS calls for the desktop strip: taskbar edge/auto-hide state and cursor position.
use super::Edge;
use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_GETSTATE, ABM_GETTASKBARPOS, ABS_AUTOHIDE, APPBARDATA};
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

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
