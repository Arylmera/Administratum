//! Windows OS calls for the desktop strip: taskbar edge/auto-hide state and cursor position.
use super::Edge;
use std::sync::atomic::{AtomicIsize, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::Thread;
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_GETSTATE, ABM_GETTASKBARPOS, ABS_AUTOHIDE, APPBARDATA};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetCursorPos, GetMessageW, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowsHookExW, GWL_EXSTYLE, HC_ACTION, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_RBUTTONDOWN, WM_RBUTTONUP, WS_EX_TRANSPARENT,
};

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

/// The strip's window, and the places on it that take clicks (window CSS px) with the monitor's scale: what the mouse
/// hook tests (the UI sends them: `set_strip_hits`).
static HWND: AtomicIsize = AtomicIsize::new(0);
static HITS: Mutex<(Vec<[f64; 4]>, f64)> = Mutex::new((Vec::new(), 1.0));
/// The buttons held (bit 0 left, 1 right, 2 middle).
static HELD: AtomicU8 = AtomicU8::new(0);
/// What the hook wants the window to be (0 nothing new, 1 take clicks, 2 click-through), applied by `FLIPPER`.
static WANT: AtomicU8 = AtomicU8::new(0);
/// The thread that applies `WANT`: a style change sends WM_STYLECHANGING/CHANGED to the window's own (main) thread and
/// waits for it, so the hook never makes it itself (a busy main thread would stall every mouse in the system).
static FLIPPER: OnceLock<Thread> = OnceLock::new();

/// The strip's window, set by `set_click_through` before the hook decides anything for it.
pub fn set_window(hwnd: isize) {
    HWND.store(hwnd, Ordering::Relaxed);
}
pub fn set_hits(hwnd: isize, rects: Vec<[f64; 4]>, scale: f64) {
    HWND.store(hwnd, Ordering::Relaxed);
    *crate::lock(&HITS) = (rects, scale);
}

/// Installs the low-level mouse hook (once, on a thread of its own with the message loop it needs) and the thread
/// that applies its decisions. It decides the strip's click-through on each mouse move, so the window is set before
/// the click that follows, with no poll in between. False if it could not be set. Idle (a few loads) while the strip
/// is off.
pub fn ensure_hook() -> bool {
    static HOOK: OnceLock<bool> = OnceLock::new();
    *HOOK.get_or_init(|| {
        let flipper = std::thread::spawn(|| loop {
            std::thread::park();
            apply(WANT.swap(0, Ordering::SeqCst));
        });
        let _ = FLIPPER.set(flipper.thread().clone());
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            // SAFETY: a plain hook install (no module: a low-level hook of this process) and its message loop.
            unsafe {
                let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), std::ptr::null_mut(), 0);
                let _ = tx.send(!hook.is_null());
                if hook.is_null() {
                    return;
                }
                let mut msg: MSG = std::mem::zeroed();
                while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
            }
        });
        rx.recv().unwrap_or(false)
    })
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for HC_ACTION, lParam points to a MSLLHOOKSTRUCT.
        let pt = unsafe { (*(lparam as *const MSLLHOOKSTRUCT)).pt };
        on_mouse(wparam as u32, (pt.x, pt.y));
    }
    // SAFETY: passes the hook's own arguments on.
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

/// One mouse event: the window takes it or ignores it, by where the cursor is. A press decides before it is held.
fn on_mouse(msg: u32, p: (i32, i32)) {
    let bit = match msg {
        WM_LBUTTONDOWN | WM_LBUTTONUP => 1,
        WM_RBUTTONDOWN | WM_RBUTTONUP => 2,
        WM_MBUTTONDOWN | WM_MBUTTONUP => 4,
        _ => 0,
    };
    let up = matches!(msg, WM_LBUTTONUP | WM_RBUTTONUP | WM_MBUTTONUP);
    if up {
        HELD.fetch_and(!bit, Ordering::Relaxed);
        return;
    }
    let hwnd = HWND.load(Ordering::Relaxed);
    if hwnd != 0 && super::ON.load(Ordering::SeqCst) {
        if let (Some(r), Ok(hits)) = (super::last_rect(), HITS.try_lock()) {
            let held = bit == 0 && HELD.load(Ordering::Relaxed) != 0;
            let now = style(hwnd) & WS_EX_TRANSPARENT as isize != 0;
            let want = super::pass_through(held, now, super::over_hit(r, &hits.0, p, hits.1));
            if want != now {
                WANT.store(if want { 2 } else { 1 }, Ordering::SeqCst);
                if let Some(t) = FLIPPER.get() {
                    t.unpark(); // never blocks
                }
            }
        }
    }
    HELD.fetch_or(bit, Ordering::Relaxed);
}

/// On the flipper thread: the strip window's click-through bit set (2) or cleared (1), only while the strip is on.
fn apply(want: u8) {
    let hwnd = HWND.load(Ordering::Relaxed);
    if want == 0 || hwnd == 0 || !super::ON.load(Ordering::SeqCst) {
        return;
    }
    let (s, t) = (style(hwnd), WS_EX_TRANSPARENT as isize);
    let next = if want == 2 { s | t } else { s & !t };
    if next != s {
        // SAFETY: the strip's own window; one extended-style bit (what tao's set_ignore_cursor_events sets). This thread
        // may wait on the main thread here; the hook does not.
        unsafe { SetWindowLongPtrW(hwnd as _, GWL_EXSTYLE, next) };
    }
    // the strip left meanwhile (place_hall cleared the bit after our ON check): the hall takes clicks again
    if !super::ON.load(Ordering::SeqCst) {
        // SAFETY: as above, clearing the bit only.
        unsafe { SetWindowLongPtrW(hwnd as _, GWL_EXSTYLE, style(hwnd) & !t) };
    }
}

fn style(hwnd: isize) -> isize {
    // SAFETY: a read of a window's extended style.
    unsafe { GetWindowLongPtrW(hwnd as _, GWL_EXSTYLE) }
}
