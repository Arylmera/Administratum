# Desktop strip: the third view (design)

Date: 2026-10-08. Status: approved. Builds on the plan `docs/superpowers/plans/2026-10-07-desktop-strip.md`
(written before the two views existed); this note records what changes and wins where the two differ.

## Goal

A third way to show the hall, "Desktop Goose" style: the scribes live in a thin transparent, click-through,
always-on-top strip sitting on the taskbar. Windows now; the OS-specific part is isolated so a macOS strip (above
the Dock) only has to add its own implementation later. Both phases of the plan (tasks 1 to 9) are in scope.

## Decisions

### Strip is the third View choice

- Settings > View offers **Flat / 39° / Strip**. `adm.view` holds `flat | 39 | strip` (the plan's
  `adm.view = hall | strip` is dropped: that key already holds the projection).
- Projection and window mode stay separate in code. `view.js` keeps `view.mode` = `flat | 39` (the projection);
  the strip is its own flag (`view.strip`), and the strip always draws with the flat projection.
- Leaving the strip goes back to the view held before it (`adm.hallView` = `flat | 39`), with the hall window's
  saved size and position.
- The remote view never offers Strip (a desktop window feature); a remote device that reads `strip` from its own
  `adm.view` falls back to Flat.
- Tray: a "Desktop strip" check item, toggling between Strip and the saved hall view.
- On a platform without a strip backend (anything but Windows today), Strip is hidden in Settings and the tray.

### Mac-ready backend split

| File | Role |
|---|---|
| `src-tauri/src/strip/mod.rs` | Shared: the `place_strip` and `set_click_through` commands, the 1 s watcher (re-place, fullscreen hide/show, topmost), the 50 ms cursor poll while the cursor is over the strip, the pure rect maths (unit tested), `supported()` for the UI |
| `src-tauri/src/strip/windows.rs` | `taskbar(monitor) -> Option<(Edge, Rect)>` (`SHAppBarMessage(ABM_GETTASKBARPOS)`, work area vs monitor rect on secondary monitors), `fullscreen() -> bool` (`SHQueryUserNotificationState`), `cursor() -> (i32, i32)` (`GetCursorPos`) |
| `src-tauri/src/strip/macos.rs` | Not written now. Would provide the same three functions: `NSScreen.visibleFrame` for the Dock edge, the active app's fullscreen state, `NSEvent.mouseLocation`. Click-through itself is Tauri's `set_ignore_cursor_events` on both OSes |

`mod.rs` picks the OS module with `#[cfg(windows)]`; other targets get a stub where `supported()` is false.

### Everything else: as in the plan

Phase 1 (tasks 1 to 5): transparent window with the hall pixel-identical, placement above the taskbar, strip
geometry and routes (`ui/strip.js`), drawing (outlines from `ui/outline.js`, `ui/depth.js` shadows, no room
lighting), click-through except on characters, plaques, labels and the handle.

Phase 2 (tasks 6 to 9): switching (now through View and the tray item above), fullscreen / monitor / taskbar
changes, entrances, petitions and the compaction puff, all 13 themes, the sprite viewer's strip toggle, README.

The plan's global constraints hold: no change to `ui/art/*`, no focus stealing, pass the click through when in
doubt, one commit per task (`Desktop strip: <what>`), node tests plus `cargo fmt --check`, `clippy`, `test` green.
After each task: rebuild and silently reinstall the NSIS build.

## Out of scope

- The macOS build itself (release spec phase 2) and `strip/macos.rs`.
- A strip on a top, left or right taskbar (falls back to the bottom of the work area, as in the plan).
- A 39° strip.
