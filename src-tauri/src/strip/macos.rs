//! macOS calls for the desktop strip: the Dock's side and auto-hide, from the Dock's own preferences. The cursor
//! comes from Tauri (mod.rs `cursor`), the work area (`visibleFrame`) from the monitor.
use super::Edge;
use std::{
    process::Command,
    sync::Mutex,
    time::{Duration, Instant},
};

/// The Dock's preferences change rarely: read again at most this often (two `defaults` runs), never per tick.
const EVERY: Duration = Duration::from_secs(30);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Dock {
    pub edge: Edge,
    pub autohide: bool,
}

/// `defaults read com.apple.dock <key>`, trimmed; None when the key is unset (the Dock's default applies).
fn read(key: &str) -> Option<String> {
    let out = Command::new("/usr/bin/defaults").args(["read", "com.apple.dock", key]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// The Dock from its `orientation` (bottom when unset) and `autohide` (off when unset) preferences.
pub fn parse(orientation: Option<&str>, autohide: Option<&str>) -> Dock {
    let edge = match orientation {
        Some("left") => Edge::Left,
        Some("right") => Edge::Right,
        _ => Edge::Bottom,
    };
    Dock { edge, autohide: matches!(autohide, Some("1" | "true" | "YES")) }
}

fn dock() -> Dock {
    static CACHE: Mutex<Option<(Instant, Dock)>> = Mutex::new(None);
    let mut cache = crate::lock(&CACHE);
    match *cache {
        Some((at, d)) if at.elapsed() < EVERY => d,
        _ => {
            let d = parse(read("orientation").as_deref(), read("autohide").as_deref());
            *cache = Some((Instant::now(), d));
            d
        }
    }
}

/// The side of the screen the Dock is on. Not from the work area: the menu bar always makes it stop short of the
/// top, and an auto-hidden Dock may leave no gap at all.
pub fn taskbar_edge() -> Option<Edge> {
    Some(dock().edge)
}

/// Whether the Dock hides itself.
pub fn autohide() -> bool {
    dock().autohide
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dock_preferences() {
        assert_eq!(parse(None, None), Dock { edge: Edge::Bottom, autohide: false }, "fresh account: nothing set");
        assert_eq!(parse(Some("left"), Some("1")), Dock { edge: Edge::Left, autohide: true });
        assert_eq!(parse(Some("right"), Some("0")), Dock { edge: Edge::Right, autohide: false });
        assert!(parse(Some("bottom"), Some("true")).autohide);
    }
}
