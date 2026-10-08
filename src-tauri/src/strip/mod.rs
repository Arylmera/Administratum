//! The desktop strip: a thin transparent window on the taskbar. The OS calls live in one file per OS
//! (windows.rs now; macos.rs would add the same functions, the Dock instead of the taskbar).
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use self::windows as os;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge {
    Bottom,
    Top,
    Left,
    Right,
}

/// The taskbar's side of a monitor: the side where the work area stops short of the monitor.
pub fn edge_of(mon: Rect, work: Rect) -> Option<Edge> {
    if work.bottom < mon.bottom {
        Some(Edge::Bottom)
    } else if work.top > mon.top {
        Some(Edge::Top)
    } else if work.left > mon.left {
        Some(Edge::Left)
    } else if work.right < mon.right {
        Some(Edge::Right)
    } else {
        None
    }
}

/// The strip's rect, physical px: the work area's width, `h` tall, standing on the work area's bottom (on a bottom
/// taskbar that is the taskbar's top edge). An auto-hidden taskbar: 2 px above the monitor's bottom.
pub fn strip_rect(mon: Rect, work: Rect, autohide: bool, h: i32) -> Rect {
    let bottom = if autohide { mon.bottom - 2 } else { work.bottom };
    Rect { left: work.left, top: bottom - h, right: work.right, bottom }
}

#[cfg(windows)]
fn autohide() -> bool {
    os::autohide()
}
#[cfg(not(windows))]
fn autohide() -> bool {
    false
}

#[cfg(windows)]
fn edge_fallback() -> Option<Edge> {
    os::taskbar_edge()
}
#[cfg(not(windows))]
fn edge_fallback() -> Option<Edge> {
    None
}

/// Whether the strip is currently showing in place of the hall window.
pub static ON: AtomicBool = AtomicBool::new(false);
/// The strip's last placed rect, physical px: `None` before the first placement, or once the hall
/// is back.
static RECT: Mutex<Option<Rect>> = Mutex::new(None);
/// The last CSS height asked for, so a monitor-change watcher (Task 7) can replay the same placement.
static HEIGHT: Mutex<f64> = Mutex::new(0.0);

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct HallRect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

#[tauri::command]
pub fn strip_supported() -> bool {
    cfg!(windows)
}

/// Re-place the strip on the window's current monitor, `height_css` tall. Returns the rect it set.
pub fn replace(w: &tauri::WebviewWindow, height_css: f64) -> Result<Rect, String> {
    let m = w.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let (p, s, wa) = (m.position(), m.size(), m.work_area());
    let mon = Rect { left: p.x, top: p.y, right: p.x + s.width as i32, bottom: p.y + s.height as i32 };
    let work = Rect { left: wa.position.x, top: wa.position.y, right: wa.position.x + wa.size.width as i32, bottom: wa.position.y + wa.size.height as i32 };
    let bottom_bar = edge_of(mon, work).or_else(edge_fallback) == Some(Edge::Bottom);
    let r = strip_rect(mon, work, autohide() && bottom_bar, (height_css * m.scale_factor()).round() as i32);
    if *RECT.lock().unwrap_or_else(|e| e.into_inner()) != Some(r) {
        w.set_size(tauri::PhysicalSize::new((r.right - r.left) as u32, (r.bottom - r.top) as u32)).map_err(|e| e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(r.left, r.top)).map_err(|e| e.to_string())?;
        *RECT.lock().unwrap_or_else(|e| e.into_inner()) = Some(r);
    }
    Ok(r)
}

#[tauri::command]
pub fn place_strip(window: tauri::WebviewWindow, height: f64) -> Result<Option<HallRect>, String> {
    let hall = if ON.swap(true, Ordering::SeqCst) {
        None
    } else {
        let (p, s) = (window.outer_position().map_err(|e| e.to_string())?, window.outer_size().map_err(|e| e.to_string())?);
        window.set_min_size(None::<tauri::Size>).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        Some(HallRect { x: p.x, y: p.y, w: s.width, h: s.height })
    };
    *HEIGHT.lock().unwrap_or_else(|e| e.into_inner()) = height;
    replace(&window, height)?;
    Ok(hall)
}

#[tauri::command]
pub fn place_hall(window: tauri::WebviewWindow, rect: Option<HallRect>) -> Result<(), String> {
    ON.store(false, Ordering::SeqCst);
    *RECT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let _ = window.set_ignore_cursor_events(false);
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(tauri::LogicalSize::new(360.0, 280.0))).map_err(|e| e.to_string())?; // tauri.conf.json
    let r = rect.unwrap_or(HallRect { x: 100, y: 100, w: 700, h: 500 });
    window.set_size(tauri::PhysicalSize::new(r.w, r.h)).map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(r.x, r.y)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_click_through(window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(on).map_err(|e| e.to_string())
}

// ponytail: not called yet, Task 7's monitor-change watcher reads the strip's last rect.
#[allow(dead_code)]
pub fn last_rect() -> Option<Rect> {
    *RECT.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    const MON: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
    #[test]
    fn edge_from_the_work_area() {
        assert_eq!(edge_of(MON, Rect { bottom: 1032, ..MON }), Some(Edge::Bottom));
        assert_eq!(edge_of(MON, Rect { top: 48, ..MON }), Some(Edge::Top));
        assert_eq!(edge_of(MON, Rect { left: 62, ..MON }), Some(Edge::Left));
        assert_eq!(edge_of(MON, Rect { right: 1858, ..MON }), Some(Edge::Right));
        assert_eq!(edge_of(MON, MON), None); // auto-hide, or no taskbar on this monitor
    }
    #[test]
    fn strip_sits_on_the_taskbar() {
        let work = Rect { bottom: 1032, ..MON };
        assert_eq!(strip_rect(MON, work, false, 112), Rect { left: 0, top: 920, right: 1920, bottom: 1032 });
        // side or top taskbar: the bottom of the work area
        let side = Rect { left: 62, ..MON };
        assert_eq!(strip_rect(MON, side, false, 112), Rect { left: 62, top: 968, right: 1920, bottom: 1080 });
        // auto-hide bottom taskbar: 2 px up so it can still slide in
        assert_eq!(strip_rect(MON, MON, true, 112), Rect { left: 0, top: 966, right: 1920, bottom: 1078 });
    }
    #[test]
    fn secondary_monitor_offsets() {
        let mon = Rect { left: 1920, top: -200, right: 4480, bottom: 1240 };
        let work = Rect { bottom: 1180, ..mon };
        assert_eq!(strip_rect(mon, work, false, 150), Rect { left: 1920, top: 1030, right: 4480, bottom: 1180 });
    }
}
