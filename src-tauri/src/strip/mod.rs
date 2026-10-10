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

/// The hall window's saved placement, physical px: `x`/`y` are `outer_position` (screen
/// coordinates, no frame involved), `w`/`h` are `inner_size` (what `set_size` restores).
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
/// Safe against a concurrent `place_hall`: every caller that can race with it (the watcher) only
/// ever calls this from the main thread (`run_on_main_thread`), the same thread tauri's own
/// `set_size`/`set_position` apply on, so the two can never interleave their window writes.
/// `current_monitor()` below is a blocking round-trip to the main thread; it runs before the
/// `RECT` lock is taken so a main-thread caller can never deadlock waiting on itself through this lock.
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
    // ON only once the strip is placed: a failure below leaves the hall's state (and its rect, captured
    // again on the next try) as it was.
    let hall = if ON.load(Ordering::SeqCst) {
        None
    } else {
        // inner: set_size restores the inner size; the outer one carries Windows' invisible frame
        let (p, s) = (window.outer_position().map_err(|e| e.to_string())?, window.inner_size().map_err(|e| e.to_string())?);
        window.set_min_size(None::<tauri::Size>).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        Some(HallRect { x: p.x, y: p.y, w: s.width, h: s.height })
    };
    *HEIGHT.lock().unwrap_or_else(|e| e.into_inner()) = height;
    // Windows 11 draws a 1 px border + shadow around undecorated windows while the shadow is on;
    // off in the strip, where the bar must sit flush against the taskbar. Off before replace(): with the
    // shadow on, the window keeps an invisible resize frame round the size set, which becomes drawn
    // client area once the shadow goes (the strip came out 16 px wider, 9 px taller, over the taskbar).
    let _ = window.set_shadow(false);
    if let Err(e) = replace(&window, height) {
        let _ = window.set_shadow(true); // still the hall
        return Err(e);
    }
    ON.store(true, Ordering::SeqCst);
    Ok(hall)
}

#[tauri::command]
pub fn place_hall(window: tauri::WebviewWindow, rect: Option<HallRect>) -> Result<(), String> {
    // Safe against the watcher re-placing the strip over this: it only touches the window from
    // the main thread (run_on_main_thread), same as the set_size/set_position below, so whichever
    // of the two runs first on that single thread finishes before the other can start.
    ON.store(false, Ordering::SeqCst);
    *RECT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_shadow(true);
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(tauri::LogicalSize::new(360.0, 280.0))).map_err(|e| e.to_string())?; // tauri.conf.json
    let r = rect.unwrap_or(HallRect { x: 100, y: 100, w: 700, h: 500 });
    window.set_size(tauri::PhysicalSize::new(r.w, r.h)).map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(r.x, r.y)).map_err(|e| e.to_string())
}

/// The tray's "Desktop strip" check item (main.rs build_tray); a newtype since the login item is the
/// managed `CheckMenuItem`.
pub struct StripItem(pub tauri::menu::CheckMenuItem<tauri::Wry>);

/// Keeps the tray check in step with the UI's view.
#[tauri::command]
pub fn set_strip_menu(item: tauri::State<StripItem>, on: bool) -> Result<(), String> {
    item.0.set_checked(on).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_click_through(window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(on).map_err(|e| e.to_string())
}

#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
#[derive(Debug, PartialEq, Eq)]
pub enum Act {
    Hide,
    Show,
    Stay,
}

/// hidden_by_us: the watcher hid the strip for a fullscreen app (a user's own Hide is left alone).
#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
pub fn act(fullscreen: bool, visible: bool, hidden_by_us: bool) -> Act {
    match (fullscreen, visible, hidden_by_us) {
        (true, true, _) => Act::Hide,
        (false, false, true) => Act::Show,
        _ => Act::Stay,
    }
}

/// Prints `msg` through `slot` unless it is the same text as last time through that same slot (a
/// stuck monitor/taskbar query would otherwise spam the console every tick); a success elsewhere
/// resets `slot` so the next failure, even a repeat of an earlier one, logs again. One slot per
/// call site (hide, replace, set_always_on_top) so one succeeding never suppresses the other's own repeat.
#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
fn log_once(slot: &Mutex<Option<String>>, msg: String) {
    let mut last = slot.lock().unwrap_or_else(|e| e.into_inner());
    if last.as_deref() != Some(msg.as_str()) {
        eprintln!("{msg}");
    }
    *last = Some(msg);
}

#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
fn clear_log(slot: &Mutex<Option<String>>) {
    *slot.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Watches (1 s, only while `ON`) for a fullscreen app covering the taskbar, and for monitor /
/// work area / DPI / taskbar changes: hides the strip for the former (and shows it again without
/// stealing focus), re-places and re-asserts topmost for the latter (Windows drops topmost after
/// some fullscreen transitions and Explorer restarts). The window-touching part (re-place,
/// set_always_on_top) runs on the main thread via `run_on_main_thread`, so it can never land out
/// of order with `place_hall`'s own window calls (see `replace`'s doc comment).
#[cfg(windows)]
pub fn start_watcher(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    static REPLACE_ERR: Mutex<Option<String>> = Mutex::new(None);
    static TOP_ERR: Mutex<Option<String>> = Mutex::new(None);
    static HIDE_ERR: Mutex<Option<String>> = Mutex::new(None);
    std::thread::spawn(move || {
        let mut hidden_by_us = false;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if !ON.load(Ordering::SeqCst) {
                hidden_by_us = false; // the strip is off: nothing of ours left hidden to restore
                continue;
            }
            let Some(w) = app.get_webview_window("main") else { continue };
            let visible = w.is_visible().unwrap_or(true);
            if visible {
                hidden_by_us = false; // seen visible by any means: no longer "hidden by us"
            }
            let full = w.hwnd().is_ok_and(|h| os::fullscreen(h.0 as windows_sys::Win32::Foundation::HWND));
            match act(full, visible, hidden_by_us) {
                Act::Hide => match w.hide() {
                    Ok(()) => {
                        let _ = app.emit("strip-hide", ());
                        hidden_by_us = true;
                        clear_log(&HIDE_ERR);
                    }
                    // not hidden: hidden_by_us stays false (already cleared above since visible)
                    Err(e) => log_once(&HIDE_ERR, format!("strip watcher hide: {e}")),
                },
                Act::Show => {
                    os::show_no_activate(&w);
                    let _ = app.emit("strip-show", ());
                    hidden_by_us = false;
                }
                Act::Stay => {}
            }
            let w2 = w.clone();
            let _ = app.run_on_main_thread(move || {
                // Re-checked here, on the main thread, right before touching the window: the only
                // place this (and place_hall) ever move it, so this check and the moves below can't
                // be interleaved by place_hall running in between.
                if !ON.load(Ordering::SeqCst) || !w2.is_visible().unwrap_or(false) {
                    return;
                }
                let height = *HEIGHT.lock().unwrap_or_else(|e| e.into_inner());
                match replace(&w2, height) {
                    Ok(_) => clear_log(&REPLACE_ERR),
                    Err(e) => log_once(&REPLACE_ERR, format!("strip watcher replace: {e}")),
                }
                match w2.set_always_on_top(true) {
                    Ok(()) => clear_log(&TOP_ERR),
                    Err(e) => log_once(&TOP_ERR, format!("strip watcher topmost: {e}")),
                }
            });
        }
    });
}
#[cfg(not(windows))]
pub fn start_watcher(_app: tauri::AppHandle) {}

#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
pub fn last_rect() -> Option<Rect> {
    *RECT.lock().unwrap_or_else(|e| e.into_inner())
}

/// The cursor in window CSS px, if it is inside the strip's rect.
#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
pub fn inside(r: Rect, (x, y): (i32, i32), scale: f64) -> Option<(f64, f64)> {
    (x >= r.left && x < r.right && y >= r.top && y < r.bottom).then(|| (f64::from(x - r.left) / scale, f64::from(y - r.top) / scale))
}

#[cfg_attr(not(windows), allow(dead_code))] // the watcher and the cursor poll are Windows-only
#[derive(serde::Serialize, Clone, Copy, PartialEq)]
struct CursorPos {
    x: f64,
    y: f64,
}

/// Poll the cursor and tell the UI where it is over the strip, so the window can ignore clicks
/// everywhere except over a character, label or plaque (the UI has no pointer events to hit-test
/// while the window ignores the cursor). 250 ms between polls while the strip is off (cheap
/// idling); 50 ms while it is on. Emits `strip-cursor` with `{x, y}` (window CSS px) only when the
/// in-strip point changes, and `null` once when the cursor leaves the strip (or the strip goes
/// off while the cursor was still inside it).
#[cfg(windows)]
pub fn start_cursor_poll(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    std::thread::spawn(move || {
        let mut last: Option<CursorPos> = None;
        loop {
            let p = ON
                .load(Ordering::SeqCst)
                .then(|| app.get_webview_window("main"))
                .flatten()
                .and_then(|w| w.scale_factor().ok())
                .and_then(|scale| Some((os::cursor()?, last_rect()?, scale)))
                .and_then(|(c, r, scale)| inside(r, c, scale))
                .map(|(x, y)| CursorPos { x, y });
            if p != last {
                let _ = app.emit("strip-cursor", p);
                last = p;
            }
            std::thread::sleep(std::time::Duration::from_millis(if ON.load(Ordering::SeqCst) { 50 } else { 250 }));
        }
    });
}
#[cfg(not(windows))]
pub fn start_cursor_poll(_app: tauri::AppHandle) {}

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
    #[test]
    fn fullscreen_hides_and_restores_only_its_own_hide() {
        assert_eq!(act(true, true, false), Act::Hide);
        assert_eq!(act(false, false, true), Act::Show);
        assert_eq!(act(false, false, false), Act::Stay); // the user hid it
        assert_eq!(act(true, false, true), Act::Stay);
        assert_eq!(act(false, true, false), Act::Stay);
    }
    #[test]
    fn cursor_inside() {
        let r = Rect { left: 100, top: 900, right: 2020, bottom: 1012 };
        assert_eq!(inside(r, (100, 900), 2.0), Some((0.0, 0.0)));
        assert_eq!(inside(r, (300, 1000), 2.0), Some((100.0, 50.0)));
        assert_eq!(inside(r, (300, 1012), 2.0), None);
        assert_eq!(inside(r, (99, 950), 2.0), None);
    }
}
