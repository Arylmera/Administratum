Superseded by 2026-10-08-desktop-strip.md

# Desktop Strip Mode Implementation Plan (Windows)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-10-07. Status: planned, not started.

**Goal:** A second way to show the hall, "Desktop Goose" style. The window has no frame, no backdrop and no room:
the scribes live in a thin transparent strip that sits right on top of the Windows taskbar. Clicks go through
everywhere except on a character, plaque or label. Hall mode stays the default and is unchanged.

**Why not inside the taskbar:** Windows 11 removed deskbands, and there is no supported way to put a custom
control inside the taskbar. Everything that does this today (Desktop Goose, Bongo Cat, RunCat's overlay mode) is a
topmost, transparent, click-through window placed over or just above the taskbar. This plan does the same.

**Architecture:** Same process, same window (`main`), same backend. A UI setting `adm.view` = `hall` | `strip`
switches the page between the hall (today's `app.js` pipeline) and a strip scene. The backend gets three commands:
place the window on the taskbar edge of a monitor, toggle click-through, and report fullscreen apps. The roster,
petitions, toasts, Chronicon, settings and cards are shared; only the layout, the static background and the
pointer handling differ.

**Tech Stack:** Tauri 2 (`transparent`, `set_ignore_cursor_events`, `Monitor::work_area`), `windows-sys`
(`SHAppBarMessage` for the taskbar edge, `SHQueryUserNotificationState` for fullscreen), vanilla ES modules, node
test scripts.

**Cost estimate:** about 2 to 3 weeks for the whole plan. Phase 1 (tasks 1 to 5) alone gives a usable strip with
walking scribes and petitions in about a week.

## What the strip shows

The strip is `STRIP_H` logical px tall (48 by default, so ~96 CSS px at scale 2) and as wide as the monitor's work
area. It is anchored to the taskbar's edge: on a bottom taskbar it sits just above it, its floor line on the
taskbar's top edge. A top, left or right taskbar is out of scope for v1: the strip then falls back to the bottom of
the work area.

From left to right:

| Zone | Content | Hall equivalent |
|---|---|---|
| Gate (left, 24 px) | Scribes walk in and out from off-screen left | Grand gate |
| Desks (most of the width) | One lectern per session, side by side, grouped by department with a short coloured mat under each group and its name on a small plaque | Departments, desks, rugs |
| Cogitator (one small machine) | Scribes running shell commands stand at it | Cogitator bank |
| Bench | Dozing idle scribes (past `napMin`) | Refectorium |
| Petition line (right end, nearest the clock) | Waiting scribes queue facing right with their scroll and red label; the Magos sits at the far right | Sanctum |

Kept as they are: rank robes, department sashes, paper piles on the lectern (capped lower: the strip has no floor to
spread sheets on), seals, test lamps, sparks, the task-done scroll, compaction puff (no brazier walk in the strip),
labels, the sealed tag, the card on click, the hover tip.

Dropped in the strip: walls, floor tiles, windows, coolant, the room lighting and vignette (the desktop has its own
light), pan and bays (the strip is one row; past capacity the `+N in the stacks` plaque appears at the gate).

Adepts stand behind their parent's lectern at half scale, at most 3 drawn per scribe, then `+N`.

**Legibility on any wallpaper:** every sprite drawn in the strip gets a 1 art px dark outline (an alpha dilation of
each frame, generated at load time) and the depth pass's contact shadow (`ui/depth.js`, already in the hall), so no
art file changes. Depth is always on, in the strip too: contact shadows, motion cues (walk bob, flying skull
shadows) and the shadows cast by the desk lamps and screens (`casterOf` with the strip's lights); the hall-only effects (AO, flat light pools, beams, parallax, depth of view) have nothing to act on there. A setting "Strip backdrop" adds an optional translucent bar behind the strip for
busy wallpapers (off by default).

## Global constraints

- Hall mode must stay pixel-identical. Every strip change is behind `adm.view === 'strip'` or in new files.
- No change to `ui/art/*`. Outlines and shadows are computed from the loaded frames.
- The strip never steals focus: it is shown with `show()` without `set_focus()`, and a click on a character
  focuses the window only when it opens a card or the settings panel.
- Clicks pass through everything except hit targets (characters, plaques, labels, the open card or panel, the
  small handle). When in doubt, pass the click through: the user's desktop must never feel blocked.
- UI text in English. Code comments match the surrounding style (short, plain).
- Tests: `node ui/*.test.mjs` all green; `cargo fmt --check`, `cargo clippy`, `cargo test` in `src-tauri`.
- One commit per task. Commit subject style: `Desktop strip: <what>`.

## Files

| File | Change |
|---|---|
| `src-tauri/src/strip.rs` (new) | Taskbar edge and rect (`SHAppBarMessage(ABM_GETTASKBARPOS)`), monitor work area, fullscreen state (`SHQueryUserNotificationState`), `place_strip`, `set_click_through` commands, a 1 s watcher that re-places the strip and emits `strip-hide` / `strip-show` |
| `src-tauri/src/main.rs` | Register the commands, start the watcher in strip mode, tray item "Hall / Desktop strip", restore the hall window's saved size and position when leaving strip mode |
| `src-tauri/tauri.conf.json` | `"transparent": true` on `main` (the hall keeps an opaque body background, so it looks the same) |
| `src-tauri/capabilities/default.json` | `core:window:allow-set-ignore-cursor-events`, `allow-set-position`, `allow-set-size` |
| `src-tauri/Cargo.toml` | `windows-sys` features `Win32_UI_Shell` |
| `ui/strip.js` (new) | `stripOf(width, roster)`: pure strip geometry (desk slots, cogitator, bench, queue points, gate), the strip's `route()` (a 1D walk along the floor line) |
| `ui/strip.test.mjs` (new) | Geometry tests: no overlap, queue order, capacity and `+N`, department grouping, stable slots when a session leaves (same grace rules as the hall) |
| `ui/outline.js` (new) | `outlined(canvas)`: the frame with a 1 art px dark outline, cached per sprite canvas like `sprite()` (shadows come from `ui/depth.js`) |
| `ui/app.js` | `adm.view` switch: picks hall or strip geometry, background and pointer handling; a transparent body and no header in strip mode; the click-through hit test |
| `ui/actors.js` | `Cast.sync` takes the geometry object (hall or strip) instead of assuming `hallOf`; poses unchanged |
| `ui/scene.js` | `drawScene` gets a `strip` flag: no rugs/doors/gate/decor frame, mats and lectern-only furniture, outlined blits |
| `ui/settings.js`, `ui/index.html` | Settings: View (Hall / Desktop strip), Strip height (S/M/L = 40/48/64), Strip backdrop, Monitor (primary / follow the cursor at start) |
| `README.md` | A "Desktop strip" section |

## Phase 1: a working strip (about 1 week)

### Task 1: transparent window that changes nothing in hall mode

- [ ] Set `"transparent": true` on `main` in `tauri.conf.json`.
- [ ] In `index.html`, make sure `html, body` keep their opaque `--bg` background in hall mode (they do today; check
  there is no gap between the frame and the window edge that would now show the desktop).
- [ ] Add `html.strip { background: transparent }` and `html.strip body { background: none }`, hide the header and
  the brass frame under `html.strip`.
- [ ] Verify: run the app in demo mode (`cargo tauri dev -- -- --demo`, or `ADMINISTRATUM_DEMO=1`), hall mode looks exactly as before; toggling
  `document.documentElement.classList.add('strip')` in devtools shows the desktop through the window.
- [ ] Commit: `Desktop strip: transparent window, hall unchanged`.

### Task 2: place the window on the taskbar

- [ ] `strip.rs`: `taskbar(monitor) -> Option<(Edge, RECT)>` with `SHAppBarMessage(ABM_GETTASKBARPOS)`; on a
  secondary monitor use the work area vs the monitor rect to find the taskbar side (Windows 11 shows a taskbar on
  each monitor; the secondary ones have no appbar of their own).
- [ ] `place_strip(height_css: u32, monitor: Option<String>)`: sets size and position in physical px from the work
  area: x = work.left, width = work.width, y = work.bottom - height (bottom taskbar). Auto-hide taskbar: use the
  monitor bottom minus 2 px so the taskbar can still slide up.
- [ ] Remember the hall window's position and size (`tauri-plugin-window-state` already saves them; save once more
  before switching) and restore them in `place_hall()`.
- [ ] Unit-test the pure part (rect maths for each edge, auto-hide, DPI scale) in `strip.rs`.
- [ ] Commit: `Desktop strip: place the window above the taskbar`.

### Task 3: strip geometry

- [ ] `ui/strip.js`: `stripOf({ w, h }, n)` returns the same shape of points the cast already uses: `entry`
  (off-screen left), `seats` (one lectern every 28 px, 6 px gap between departments), `cogSpots`, `refectory` (bench
  spots), `queue` (right to left from the Magos), `lanes` (a single floor line), `capacity`.
- [ ] `route(from, to)` in strip space: walk along the floor line, with a short hop up when passing behind a lectern.
- [ ] Reuse the grace rules of `planLayout` (an empty slot is held 3 min, a department 5 min) so the strip does not
  reshuffle on a restart.
- [ ] `ui/strip.test.mjs` as listed in Files.
- [ ] Commit: `Desktop strip: geometry and routes`.

### Task 4: draw the strip

- [ ] `ui/outline.js`: dilate each frame's alpha by 1 art px into a dark colour (`T.ink.outline`, which every theme
  already has: `px.k`), draw the frame on top; cache by source canvas (WeakMap).
- [ ] `drawScene(..., { strip: true })`: no static background, mats under department groups, the lectern variant of
  the furniture, the cogitator decor frame alone, the bench, the Magos; everything blitted outlined; under every
  actor and prop the depth pass's floor pass (`ui/depth.js`: `shadowOf` + `contactShadow`, `bobOf` for walkers,
  `castShadow` + `casterOf`), as in the hall.
- [ ] No `drawLighting` in strip mode. Desk lamps and screens still glow (a small additive glow only, no darkness
  layer).
- [ ] `app.js`: in strip mode, `fit()` sizes the scene to the window (one row, no pan, no bays), and skips the
  backdrop.
- [ ] Verify in demo mode with screenshots on a light, a dark and a busy wallpaper.
- [ ] Commit: `Desktop strip: drawing`.

### Task 5: click-through

- [ ] `set_click_through(on: bool)` command (`window.set_ignore_cursor_events(on)`).
- [ ] The problem: once the window ignores the cursor, the page gets no `pointermove` to know when to turn it back
  off. Solution: the backend's watcher polls `GetCursorPos` every 50 ms while in strip mode and emits
  `strip-cursor { x, y }` in window coordinates when the cursor is inside the strip's rect. The UI hit-tests that
  point against characters, plaques, labels and the handle (the same hit boxes as hover today) and calls
  `set_click_through(false)` on a hit, `true` when it leaves.
- [ ] While a card, the settings panel or the Chronicon is open, click-through stays off over its rect, and
  `Escape` or a click outside closes it.
- [ ] Verify: icons and windows under the strip get clicks; a scribe gets its card; the hover tip still works.
- [ ] Commit: `Desktop strip: click-through except on characters`.

## Phase 2: daily use (about 1 week)

### Task 6: switching views

- [ ] Settings: `View` (Hall / Desktop strip), persisted as `adm.view`; tray menu item "Desktop strip" (check item).
- [ ] Switching: save the hall rect, `place_strip`, add `html.strip`, start the watcher; back: stop the watcher,
  `set_click_through(false)`, restore the hall rect, remove the class.
- [ ] A small handle (a cog, 12 px) at the strip's left end opens the menu: Hall view, Settings, Chronicon, Hide.
  Settings and the Chronicon open as they do today, but anchored above the strip (they grow upward).
- [ ] Commit: `Desktop strip: switch from settings and tray`.

### Task 7: fullscreen, sleep and monitor changes

- [ ] Watcher (1 s): `SHQueryUserNotificationState` returns `QUNS_BUSY` / `QUNS_RUNNING_D3D_FULL_SCREEN` /
  `QUNS_PRESENTATION_MODE` -> hide the strip (`strip-hide`, the UI pauses as it does when covered); back to
  `QUNS_ACCEPTS_NOTIFICATIONS` -> show it again without focus.
- [ ] Re-place on `WM_DISPLAYCHANGE` / DPI change / taskbar moved (compare the taskbar rect every tick).
- [ ] Topmost is re-asserted every tick (Windows drops it after some fullscreen transitions and Explorer restarts).
- [ ] Petitions still toast while the strip is hidden (the backend already does it).
- [ ] Commit: `Desktop strip: follow fullscreen apps, monitors and the taskbar`.

### Task 8: the strip's own touches

- [ ] Entering: a scribe walks in from the left edge of the screen; leaving: walks out the same way.
- [ ] A petition: the scribe walks right to the queue; with `staleMin` passed, the Magos's beacon blinks red and
  the servo-skull hovers over the queue (same assets).
- [ ] Compaction: puff on the lectern (no brazier).
- [ ] Optional strip backdrop (setting): a translucent bar in the theme's `--bg` at 60 % behind the strip.
- [ ] Commit: `Desktop strip: entrances, petitions, compaction`.

### Task 9: themes and docs

- [ ] Check all 13 themes in the strip: outline colour readable, mats and lecterns present (`LECTERN` comes from
  `workstations`, the theme's own or the default's).
- [ ] The sprite viewer: a "strip" toggle that draws each sprite outlined on a light and a dark background.
- [ ] README: a "Desktop strip" section with a screenshot; backlog updated.
- [ ] Commit: `Desktop strip: themes and docs`.

## Risks and open questions

- **Click-through polling** costs a 50 ms timer in the backend; it only runs in strip mode and only while the
  cursor is over the strip's rect (a cheap `GetCursorPos` + rect test otherwise).
- **WebView2 transparency** needs `transparent: true` at window creation; it cannot be toggled at runtime. The hall
  stays opaque through CSS. To check early (task 1): no flicker on resize, no black frame on Windows 10.
- **Per-monitor DPI**: the strip's height is set in CSS px and converted with the monitor's scale factor.
- **Small taskbars and vertical taskbars**: v1 supports a bottom taskbar; a side taskbar falls back to the work
  area's bottom edge.
- **Mac later**: the strip's UI part (tasks 3, 4, 8, 9) is portable; the backend part (taskbar rect, fullscreen,
  click-through polling) would be redone with `NSScreen.visibleFrame` and `NSWindow.ignoresMouseEvents`. It only
  makes sense once the app itself runs on macOS.
