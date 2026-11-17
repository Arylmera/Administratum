//! The desktop strip: a thin transparent window on the taskbar (Windows), above the Dock (macOS) or in a layer
//! surface on the bottom edge (Linux, Wayland). The OS calls live in one file per OS: windows.rs, macos.rs, linux.rs.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;
#[cfg(target_os = "linux")]
use self::linux as os;
#[cfg(target_os = "macos")]
use self::macos as os;
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
#[cfg_attr(target_os = "macos", allow(dead_code))] // macOS: the Dock's own preference (macos.rs), see bar_edge
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

/// The screen edge the desktop column stands on (Settings, `adm.settings.stripSide`).
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    Right,
}
/// What the strip window is: the bar on the taskbar (`h` CSS px tall) or the desktop column (`w` CSS px wide, the work
/// area's full height, on `side`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Shape {
    Bar { h: f64 },
    Column { w: f64, side: Side },
}

/// The column's rect, physical px: the work area's height on the `side` edge, `w` wide. An auto-hidden taskbar
/// (`hide`, its edge) keeps 2 px of the monitor free on its side, so it can still slide in.
pub fn column_rect(mon: Rect, work: Rect, side: Side, hide: Option<Edge>, w: i32) -> Rect {
    let top = if hide == Some(Edge::Top) { mon.top + 2 } else { work.top };
    let bottom = if hide == Some(Edge::Bottom) { mon.bottom - 2 } else { work.bottom };
    match side {
        Side::Left => {
            let left = if hide == Some(Edge::Left) { mon.left + 2 } else { work.left };
            Rect { left, top, right: left + w, bottom }
        }
        Side::Right => {
            let right = if hide == Some(Edge::Right) { mon.right - 2 } else { work.right };
            Rect { left: right - w, top, right, bottom }
        }
    }
}

/// The window's rect for a shape on a monitor, physical px (`scale`: the monitor's factor, CSS to physical).
pub fn rect_of(mon: Rect, work: Rect, hide: Option<Edge>, shape: Shape, scale: f64) -> Rect {
    match shape {
        Shape::Bar { h } => strip_rect(mon, work, hide == Some(Edge::Bottom), (h * scale).round() as i32),
        Shape::Column { w, side } => column_rect(mon, work, side, hide, (w * scale).round() as i32),
    }
}

/// The strip's rect, physical px: the work area's width, `h` tall, standing on the work area's bottom (on a bottom
/// taskbar that is the taskbar's top edge). An auto-hidden taskbar: 2 px above the monitor's bottom.
pub fn strip_rect(mon: Rect, work: Rect, autohide: bool, h: i32) -> Rect {
    let bottom = if autohide { mon.bottom - 2 } else { work.bottom };
    Rect { left: work.left, top: bottom - h, right: work.right, bottom }
}

#[cfg(any(windows, target_os = "macos"))]
fn autohide() -> bool {
    os::autohide()
}
#[cfg(not(any(windows, target_os = "macos")))]
fn autohide() -> bool {
    false
}

/// The side the taskbar is on: where the work area stops short of the monitor, else the shell's own idea.
#[cfg(windows)]
fn bar_edge(mon: Rect, work: Rect) -> Option<Edge> {
    edge_of(mon, work).or_else(os::taskbar_edge)
}
/// The side the Dock is on, from its own preference: on macOS the work area (`visibleFrame`) always stops short of
/// the top (the menu bar), and an auto-hidden Dock may leave no gap.
#[cfg(target_os = "macos")]
fn bar_edge(_mon: Rect, _work: Rect) -> Option<Edge> {
    os::taskbar_edge()
}
#[cfg(not(any(windows, target_os = "macos")))]
fn bar_edge(mon: Rect, work: Rect) -> Option<Edge> {
    edge_of(mon, work)
}

/// The cursor in screen px, the monitors' coordinate space.
#[cfg(windows)]
fn cursor(_app: &tauri::AppHandle) -> Option<(i32, i32)> {
    os::cursor()
}
/// The cursor in screen px through Tauri (`NSEvent.mouseLocation`, flipped to a top-left origin and scaled like the
/// monitor rects; tao scales it by the primary display's factor, so a mixed-DPI multi-display setup may be off).
#[cfg(target_os = "macos")]
fn cursor(app: &tauri::AppHandle) -> Option<(i32, i32)> {
    app.cursor_position().ok().map(|p| (p.x.floor() as i32, p.y.floor() as i32))
}

/// Whether the strip is currently showing in place of the hall window.
pub static ON: AtomicBool = AtomicBool::new(false);
/// The strip's last placed rect, physical px: `None` before the first placement, or once the hall
/// is back.
static RECT: Mutex<Option<Rect>> = Mutex::new(None);
/// The last shape asked for (its CSS size and side), so the watcher can replay the same placement.
static SHAPE: Mutex<Shape> = Mutex::new(Shape::Bar { h: 0.0 });

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

/// Linux: ask once whether the compositor can hold the strip (setup, main thread; linux.rs).
#[cfg(target_os = "linux")]
pub fn init() {
    os::init();
}

#[tauri::command]
pub fn strip_supported() -> bool {
    #[cfg(target_os = "linux")]
    return os::supported(); // only where the compositor has wlr-layer-shell (linux.rs)
    #[cfg(not(target_os = "linux"))]
    cfg!(any(windows, target_os = "macos"))
}

/// Re-place the strip window on its current monitor as `shape`. Returns the rect it set.
/// Safe against a concurrent `place_hall`: every caller that can race with it (the watcher) only
/// ever calls this from the main thread (`run_on_main_thread`), the same thread tauri's own
/// `set_size`/`set_position` apply on, so the two can never interleave their window writes.
/// `current_monitor()` below is a blocking round-trip to the main thread; it runs before the
/// `RECT` lock is taken so a main-thread caller can never deadlock waiting on itself through this lock.
pub fn replace(w: &tauri::WebviewWindow, shape: Shape) -> Result<Rect, String> {
    let m = w.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let (p, s, wa) = (m.position(), m.size(), m.work_area());
    let mon = Rect { left: p.x, top: p.y, right: p.x + s.width as i32, bottom: p.y + s.height as i32 };
    let work = Rect { left: wa.position.x, top: wa.position.y, right: wa.position.x + wa.size.width as i32, bottom: wa.position.y + wa.size.height as i32 };
    let hide = autohide().then(|| bar_edge(mon, work)).flatten();
    let r = rect_of(mon, work, hide, shape, m.scale_factor());
    if *crate::lock(&RECT) != Some(r) {
        w.set_size(tauri::PhysicalSize::new((r.right - r.left) as u32, (r.bottom - r.top) as u32)).map_err(|e| e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(r.left, r.top)).map_err(|e| e.to_string())?;
        *crate::lock(&RECT) = Some(r);
    }
    Ok(r)
}

#[tauri::command]
pub fn place_strip(window: tauri::WebviewWindow, height: f64, base: Option<f64>) -> Result<Option<HallRect>, String> {
    enter(&window, Shape::Bar { h: height }, base.unwrap_or(height))
}

/// The desktop column: `width` CSS px on the `side` edge, the work area's full height. `base` (here and in
/// `place_strip`): the size with no panel open, which is what Linux keeps the other windows off.
#[tauri::command]
pub fn place_column(window: tauri::WebviewWindow, width: f64, side: Side, base: Option<f64>) -> Result<Option<HallRect>, String> {
    enter(&window, Shape::Column { w: width, side }, base.unwrap_or(width))
}

/// Into the strip window as `shape`: the hall's rect the first time (kept by the UI for the way back), `None` while
/// the strip window is already on (a resize, or the bar <-> column switch: never leave then enter).
fn enter(window: &tauri::WebviewWindow, shape: Shape, base: f64) -> Result<Option<HallRect>, String> {
    #[cfg(target_os = "linux")]
    if os::supported() {
        return os::enter(window, shape, base); // a window of its own, in a layer surface
    }
    let _ = base;
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
    *crate::lock(&SHAPE) = shape;
    // Windows 11 draws a 1 px border + shadow around undecorated windows while the shadow is on;
    // off in the strip, where the bar must sit flush against the taskbar. Off before replace(): with the
    // shadow on, the window keeps an invisible resize frame round the size set, which becomes drawn
    // client area once the shadow goes (the strip came out 16 px wider, 9 px taller, over the taskbar).
    let _ = window.set_shadow(false);
    if let Err(e) = replace(window, shape) {
        let _ = window.set_shadow(true); // still the hall
        return Err(e);
    }
    ON.store(true, Ordering::SeqCst);
    // On every Space, not only the one it was placed on (macOS; elsewhere a no-op).
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(true);
    Ok(hall)
}

#[tauri::command]
pub fn place_hall(window: tauri::WebviewWindow, rect: Option<HallRect>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if window.label() == os::LABEL {
        return os::leave(&window); // the hall's own window comes back, this one closes
    }
    // Safe against the watcher re-placing the strip over this: it only touches the window from
    // the main thread (run_on_main_thread), same as the set_size/set_position below, so whichever
    // of the two runs first on that single thread finishes before the other can start.
    ON.store(false, Ordering::SeqCst);
    *crate::lock(&RECT) = None;
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_shadow(true);
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(false);
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window.set_min_size(Some(tauri::LogicalSize::new(360.0, 280.0))).map_err(|e| e.to_string())?; // tauri.conf.json
    let r = rect.unwrap_or(HallRect { x: 100, y: 100, w: 700, h: 500 });
    window.set_size(tauri::PhysicalSize::new(r.w, r.h)).map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(r.x, r.y)).map_err(|e| e.to_string())
}

/// The tray's "Desktop strip" check item (window.rs build_tray); a newtype since the login item is the
/// managed `CheckMenuItem`.
pub struct StripItem(pub tauri::menu::CheckMenuItem<tauri::Wry>);

/// Keeps the tray check in step with the UI's view.
#[tauri::command]
pub fn set_strip_menu(item: tauri::State<StripItem>, on: bool) -> Result<(), String> {
    item.0.set_checked(on).map_err(|e| e.to_string())
}

/// The strip ignores the cursor (`on`) or takes it. Answers true where the window cannot do that from the cursor's
/// place (Linux: under Wayland nobody tells a window where the cursor is outside it): the UI then sends the places
/// that take clicks instead (`set_strip_hits`).
#[tauri::command]
pub fn set_click_through(window: tauri::WebviewWindow, on: bool) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    if window.label() == os::LABEL {
        return Ok(true);
    }
    window.set_ignore_cursor_events(on).map(|()| false).map_err(|e| e.to_string())
}

/// Whether the strip keeps its edge of the screen for itself, the other windows stopping short of it (`on`), or lies
/// over them. Only where the strip is a layer surface (Linux): answers false elsewhere, where it stands on the taskbar
/// or above the Dock, and Settings drops the choice.
#[tauri::command]
pub fn set_strip_reserve(window: tauri::WebviewWindow, on: bool) -> bool {
    #[cfg(target_os = "linux")]
    if os::supported() {
        os::reserve(&window, on);
        return true;
    }
    let _ = (window, on);
    false
}

/// The strip's places that take clicks, `[left, top, right, bottom]` in window CSS px: everywhere else the clicks
/// go to what is under the strip (Linux: the layer surface's input region; elsewhere the cursor poll does it).
#[tauri::command]
pub fn set_strip_hits(window: tauri::WebviewWindow, rects: Vec<[f64; 4]>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if window.label() == os::LABEL {
        return os::set_hits(&window, rects);
    }
    let _ = (window, rects);
    Ok(())
}

/// Prints `msg` through `slot` unless it is the same text as last time through that same slot (a
/// stuck monitor/taskbar query would otherwise spam the console every tick); a success elsewhere
/// resets `slot` so the next failure, even a repeat of an earlier one, logs again. One slot per
/// call site (replace, set_always_on_top) so one succeeding never suppresses the other's own repeat.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))] // the watcher and the cursor poll: Windows and macOS
fn log_once(slot: &Mutex<Option<String>>, msg: String) {
    let mut last = crate::lock(slot);
    if last.as_deref() != Some(msg.as_str()) {
        eprintln!("{msg}");
    }
    *last = Some(msg);
}

#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))] // the watcher and the cursor poll: Windows and macOS
fn clear_log(slot: &Mutex<Option<String>>) {
    *crate::lock(slot) = None;
}

/// Watches (1 s, only while `ON`) for monitor / work area / DPI / taskbar changes: re-places the
/// strip and re-asserts topmost (Windows drops topmost after some fullscreen transitions and
/// Explorer restarts). A fullscreen app does not hide the strip. The window-touching part (re-place,
/// set_always_on_top) runs on the main thread via `run_on_main_thread`, so it can never land out
/// of order with `place_hall`'s own window calls (see `replace`'s doc comment).
#[cfg(any(windows, target_os = "macos"))]
pub fn start_watcher(app: tauri::AppHandle) {
    use tauri::Manager;
    static REPLACE_ERR: Mutex<Option<String>> = Mutex::new(None);
    static TOP_ERR: Mutex<Option<String>> = Mutex::new(None);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            if !ON.load(Ordering::SeqCst) {
                continue;
            }
            let Some(w2) = app.get_webview_window("main") else { continue };
            let _ = app.run_on_main_thread(move || {
                // Re-checked here, on the main thread, right before touching the window: the only
                // place this (and place_hall) ever move it, so this check and the moves below can't
                // be interleaved by place_hall running in between.
                if !ON.load(Ordering::SeqCst) || !w2.is_visible().unwrap_or(false) {
                    return;
                }
                let shape = *crate::lock(&SHAPE);
                match replace(&w2, shape) {
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
#[cfg(not(any(windows, target_os = "macos")))]
pub fn start_watcher(_app: tauri::AppHandle) {}

#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))] // the watcher and the cursor poll: Windows and macOS
pub fn last_rect() -> Option<Rect> {
    *crate::lock(&RECT)
}

/// The cursor in window CSS px, if it is inside the strip's rect.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))] // the watcher and the cursor poll: Windows and macOS
pub fn inside(r: Rect, (x, y): (i32, i32), scale: f64) -> Option<(f64, f64)> {
    (x >= r.left && x < r.right && y >= r.top && y < r.bottom).then(|| (f64::from(x - r.left) / scale, f64::from(y - r.top) / scale))
}

#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))] // the watcher and the cursor poll: Windows and macOS
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
#[cfg(any(windows, target_os = "macos"))]
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
                .and_then(|scale| Some((cursor(&app)?, last_rect()?, scale)))
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
#[cfg(not(any(windows, target_os = "macos")))]
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
    fn column_on_either_edge() {
        // taskbar at the bottom: the column the work area's height, on the chosen edge
        let work = Rect { bottom: 1032, ..MON };
        assert_eq!(column_rect(MON, work, Side::Left, None, 320), Rect { left: 0, top: 0, right: 320, bottom: 1032 });
        assert_eq!(column_rect(MON, work, Side::Right, None, 320), Rect { left: 1600, top: 0, right: 1920, bottom: 1032 });
        // taskbar on the same side: beside it; on the opposite side: flush with the screen edge
        let left_bar = Rect { left: 62, ..MON };
        assert_eq!(column_rect(MON, left_bar, Side::Left, None, 320), Rect { left: 62, top: 0, right: 382, bottom: 1080 });
        assert_eq!(column_rect(MON, left_bar, Side::Right, None, 320), Rect { left: 1600, top: 0, right: 1920, bottom: 1080 });
        let right_bar = Rect { right: 1858, ..MON };
        assert_eq!(column_rect(MON, right_bar, Side::Right, None, 320), Rect { left: 1538, top: 0, right: 1858, bottom: 1080 });
        let top_bar = Rect { top: 48, ..MON };
        assert_eq!(column_rect(MON, top_bar, Side::Left, None, 320), Rect { left: 0, top: 48, right: 320, bottom: 1080 });
    }
    #[test]
    fn column_beside_an_auto_hidden_taskbar() {
        // auto-hide: the work area is the whole monitor; 2 px kept free on the taskbar's own side
        assert_eq!(column_rect(MON, MON, Side::Left, Some(Edge::Left), 320), Rect { left: 2, top: 0, right: 322, bottom: 1080 });
        assert_eq!(column_rect(MON, MON, Side::Right, Some(Edge::Right), 320), Rect { left: 1598, top: 0, right: 1918, bottom: 1080 });
        assert_eq!(column_rect(MON, MON, Side::Right, Some(Edge::Left), 320), Rect { left: 1600, top: 0, right: 1920, bottom: 1080 });
        assert_eq!(column_rect(MON, MON, Side::Left, Some(Edge::Top), 320), Rect { left: 0, top: 2, right: 320, bottom: 1080 });
        assert_eq!(column_rect(MON, MON, Side::Left, Some(Edge::Bottom), 320), Rect { left: 0, top: 0, right: 320, bottom: 1078 });
    }
    #[test]
    fn column_on_a_secondary_monitor() {
        let mon = Rect { left: -2560, top: -200, right: 0, bottom: 1240 };
        let work = Rect { bottom: 1180, ..mon };
        assert_eq!(column_rect(mon, work, Side::Left, None, 384), Rect { left: -2560, top: -200, right: -2176, bottom: 1180 });
        assert_eq!(column_rect(mon, work, Side::Right, None, 384), Rect { left: -384, top: -200, right: 0, bottom: 1180 });
    }
    #[test]
    fn rect_of_each_shape() {
        // the rect the watcher replays for a shape: its CSS size times the monitor's factor
        let work = Rect { bottom: 1032, ..MON };
        let col = Shape::Column { w: 256.0, side: Side::Right };
        assert_eq!(rect_of(MON, work, None, col, 1.25), Rect { left: 1600, top: 0, right: 1920, bottom: 1032 });
        // the bar: as strip_rect, the auto-hide inset only for a bottom taskbar
        assert_eq!(rect_of(MON, work, None, Shape::Bar { h: 56.0 }, 2.0), strip_rect(MON, work, false, 112));
        assert_eq!(rect_of(MON, MON, Some(Edge::Bottom), Shape::Bar { h: 56.0 }, 2.0), strip_rect(MON, MON, true, 112));
        assert_eq!(rect_of(MON, MON, Some(Edge::Left), Shape::Bar { h: 56.0 }, 2.0), strip_rect(MON, MON, false, 112));
    }
    #[test]
    fn side_from_the_ui() {
        assert_eq!(serde_json::from_str::<Side>("\"left\"").unwrap(), Side::Left);
        assert_eq!(serde_json::from_str::<Side>("\"right\"").unwrap(), Side::Right);
        assert!(serde_json::from_str::<Side>("\"up\"").is_err());
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
