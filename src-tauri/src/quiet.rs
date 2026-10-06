//! Quiet hours: a daily window (minutes after midnight, local clock) in which a new petition, question or usage limit
//! neither toasts nor chimes; a petition turning stale still does. The UI owns the setting and pushes it (set_quiet).
use chrono::{Local, Timelike};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};

static ON: AtomicBool = AtomicBool::new(false);
static FROM: AtomicU16 = AtomicU16::new(22 * 60);
static TO: AtomicU16 = AtomicU16::new(8 * 60);

/// Whether `now` lies in [from, to); a window with to < from spans midnight; from == to is never quiet.
pub fn in_window(now: u16, from: u16, to: u16) -> bool {
    if from < to {
        now >= from && now < to
    } else if from > to {
        now >= from || now < to
    } else {
        false
    }
}

/// From the settings panel (set_quiet); out-of-range minutes are clamped to the day's last minute.
pub fn set(enabled: bool, from: u16, to: u16) {
    ON.store(enabled, Ordering::Relaxed);
    FROM.store(from.min(1439), Ordering::Relaxed);
    TO.store(to.min(1439), Ordering::Relaxed);
}

/// Quiet right now, by the PC's clock.
pub fn active() -> bool {
    let n = Local::now();
    ON.load(Ordering::Relaxed) && in_window((n.hour() * 60 + n.minute()) as u16, FROM.load(Ordering::Relaxed), TO.load(Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window() {
        assert!(in_window(600, 540, 1020), "plain window");
        assert!(!in_window(1020, 540, 1020), "end is exclusive");
        assert!(in_window(540, 540, 1020), "start is inclusive");
        assert!(in_window(1380, 1320, 480) && in_window(0, 1320, 480) && in_window(479, 1320, 480), "over midnight");
        assert!(!in_window(480, 1320, 480) && !in_window(720, 1320, 480), "outside the night window");
        assert!(!in_window(600, 600, 600), "from == to is never quiet");
    }
}
