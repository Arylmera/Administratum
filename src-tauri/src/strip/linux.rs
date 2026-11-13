//! Linux calls for the desktop strip. Under Wayland a window cannot place itself, so the strip is a window of its
//! own (`strip`) in a wlr-layer-shell surface (gtk-layer-shell): the compositor anchors it to a screen edge, above
//! the other windows. A window that was already shown cannot become a layer surface, so only one of the two windows
//! lives at a time: entering the strip opens `strip` and closes the hall's `main`, leaving does the reverse, and the
//! UI starts again in the view it saved (as it does when the app starts in the strip).
use super::{HallRect, Shape, Side};
use gtk::prelude::*;
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

/// The strip window's label (capabilities/default.json lists it beside `main`).
pub const LABEL: &str = "strip";

static SUPPORTED: AtomicBool = AtomicBool::new(false);

/// Asks GTK once, on the main thread (setup), whether the compositor has wlr-layer-shell: Hyprland, Sway, KDE do;
/// GNOME and X11 do not.
pub fn init() {
    SUPPORTED.store(gtk_layer_shell::is_supported(), Ordering::SeqCst);
}

pub fn supported() -> bool {
    SUPPORTED.load(Ordering::SeqCst)
}

/// GTK px per CSS px. WebKitGTK scales its pages by the desktop's font DPI over 96 (`gtk-xft-dpi`, in 1024ths of a
/// dot): at 131 dpi a 256 CSS px column needs a 349 px window. The UI speaks CSS px, GTK and the layer its own.
fn css_px() -> f64 {
    let dpi = gtk::Settings::default().map_or(0, |s| s.gtk_xft_dpi());
    if dpi > 0 {
        f64::from(dpi) / 1024.0 / 96.0
    } else {
        1.0
    }
}

/// Anchors and size for a shape: the bar spans the bottom edge, `h` tall; the column spans its side, `w` wide. Only
/// the short side is asked for: the compositor gives the long one.
fn shape_window(gw: &gtk::ApplicationWindow, shape: Shape) {
    let k = css_px();
    let (anchors, w, h) = match shape {
        Shape::Bar { h } => ([Edge::Bottom, Edge::Left, Edge::Right], -1, (h * k).round() as i32),
        Shape::Column { w, side } => ([Edge::Top, Edge::Bottom, if side == Side::Left { Edge::Left } else { Edge::Right }], (w * k).round() as i32, -1),
    };
    for e in [Edge::Top, Edge::Bottom, Edge::Left, Edge::Right] {
        gw.set_anchor(e, anchors.contains(&e));
    }
    gw.set_size_request(w, h);
    gw.resize(w.max(1), h.max(1)); // a smaller ask (a panel closed): GTK only shrinks a window when told to
}

/// Opens the strip window as `shape` on the hall's monitor, then closes the hall's window.
fn open(app: &tauri::AppHandle, hall: &tauri::WebviewWindow, shape: Shape) -> Result<(), String> {
    let w = tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::App("index.html".into()))
        .title("Administratum")
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    let gw = w.gtk_window().map_err(|e| e.to_string())?;
    gw.init_layer_shell(); // before the window is realized
    // tao gives its window a fixed size; GTK then cannot take the size the layer is configured with, and nothing is
    // painted. Freed here, before the window is shown.
    gw.set_resizable(true);
    gw.set_geometry_hints(None::<&gtk::Widget>, None, gtk::gdk::WindowHints::empty());
    gw.set_namespace("administratum");
    gw.set_layer(Layer::Top);
    gw.set_keyboard_mode(KeyboardMode::OnDemand); // Settings' fields, Escape
    if let Some(m) = hall.gtk_window().ok().and_then(|g| g.window()).and_then(|g| g.display().monitor_at_window(&g)) {
        gw.set_monitor(&m);
    }
    shape_window(&gw, shape);
    w.show().map_err(|e| e.to_string())?;
    hall.destroy().map_err(|e| e.to_string())
}

/// Into the strip as `shape`. From the hall: its rect back (the UI keeps it), the strip window opened in its place.
/// Already the strip window (a resize, the bar <-> column switch): re-shaped, `None`.
pub fn enter(window: &tauri::WebviewWindow, shape: Shape) -> Result<Option<HallRect>, String> {
    let app = window.app_handle().clone();
    let w = window.clone();
    if window.label() == LABEL {
        app.run_on_main_thread(move || {
            if let Ok(gw) = w.gtk_window() {
                shape_window(&gw, shape);
            }
        })
        .map_err(|e| e.to_string())?;
        return Ok(None);
    }
    let (p, s) = (window.outer_position().map_err(|e| e.to_string())?, window.inner_size().map_err(|e| e.to_string())?);
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = open(&app2, &w, shape) {
            eprintln!("strip: {e}");
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(Some(HallRect { x: p.x, y: p.y, w: s.width, h: s.height }))
}

/// Back to the hall: its window opened again as tauri.conf.json describes it (the window-state plugin gives it its
/// last size), then the strip window closed.
pub fn leave(window: &tauri::WebviewWindow) -> Result<(), String> {
    let app = window.app_handle().clone();
    let (app2, w) = (app.clone(), window.clone());
    app.run_on_main_thread(move || {
        let made = app2.config().app.windows.first().ok_or("no window in tauri.conf.json".to_string()).and_then(|c| {
            tauri::WebviewWindowBuilder::from_config(&app2, c).and_then(|b| b.build()).map_err(|e| e.to_string())
        });
        match made {
            Ok(_) => {
                let _ = w.destroy();
            }
            Err(e) => eprintln!("strip: back to the hall: {e}"),
        }
    })
    .map_err(|e| e.to_string())
}

/// The layer surface's input region: the union of `rects` (`[left, top, right, bottom]`, window CSS px, turned into
/// GTK's). Clicks outside it go to the windows under the strip.
pub fn set_hits(window: &tauri::WebviewWindow, rects: Vec<[f64; 4]>) -> Result<(), String> {
    let w = window.clone();
    window
        .app_handle()
        .run_on_main_thread(move || {
            let (region, k) = (gtk::cairo::Region::create(), css_px());
            for [l, t, r, b] in rects {
                let (x, y) = ((l * k).floor() as i32, (t * k).floor() as i32);
                let _ = region.union_rectangle(&gtk::cairo::RectangleInt::new(x, y, (r * k).ceil() as i32 - x, (b * k).ceil() as i32 - y));
            }
            if let Ok(gw) = w.gtk_window() {
                gw.input_shape_combine_region(Some(&region));
            }
        })
        .map_err(|e| e.to_string())
}
