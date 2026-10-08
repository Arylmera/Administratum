# Desktop Strip (the third view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Supersedes `2026-10-07-desktop-strip.md` (written before the two views). Spec:
`docs/superpowers/specs/2026-10-08-desktop-strip-design.md`.

**Goal:** Settings > View gets a third choice, *Strip*: the hall's scribes live in a thin transparent, click-through,
always-on-top window sitting on the Windows taskbar.

**Architecture:** Same process, same `main` window, same backend. `view.js` keeps the projection (`flat | 39`) and
gains a `strip` flag; `adm.view` holds `flat | 39 | strip`. In strip mode the UI swaps the hall geometry for
`stripOf()` (a hall-shaped object, one floor line) and `layoutStrip()` (one row of lecterns), and `drawScene` skips
the room. The backend gets `src-tauri/src/strip/` (shared commands and pure maths in `mod.rs`, OS calls in
`windows.rs`; a later `macos.rs` adds the same functions).

**Tech Stack:** Tauri 2 (`transparent`, `set_ignore_cursor_events`, monitors), `windows-sys` 0.61
(`SHAppBarMessage`, `SHQueryUserNotificationState`, `GetCursorPos`, `ShowWindow`), vanilla ES modules, node test
scripts (`node ui/<x>.test.mjs`, plain `node:assert/strict`).

## Global Constraints

- Flat and 39° views must stay pixel-identical. Every strip change is behind `view.strip` / `hall.strip` or in new code.
- No change to `ui/art/*`. Outlines and shadows are computed from loaded frames.
- The strip never steals focus. It shows without activation; a click on a character focuses only to open a card or panel.
- Clicks pass through everything except hit targets (characters, plaques, labels, the open card or panel, the handle).
  When in doubt, pass the click through.
- The remote view never offers Strip. Non-Windows builds hide Strip (`strip_supported()` is false).
- UI text in English. Code comments match the surrounding style: short, plain, `ponytail:` for deliberate shortcuts.
- Tests: every `node ui/*.test.mjs` green; in `src-tauri`: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
- One commit per task, subject `Desktop strip: <what>`, pushed. The controller rebuilds and reinstalls the NSIS build
  after each task (not the implementer).
- Commit messages via `git commit -F - <<'EOF'` (Bash tool), no backticks inside `-m`.

## Changes from the old plan (decided while re-planning)

- Strip size is a scale (S/M/L = 1.5/2/2.5 CSS px per logical px) over a fixed logical height `STRIP_H = 56`, so the
  geometry and its tests do not depend on the size setting.
- Adepts work at consoles in the same row, right of their department's lecterns (as in the hall's grid), not at
  half scale behind the lectern: no new sprite scaling.
- Outlines: `blit()` draws an outlined copy of each sprite while `outline.on` is set (strip only), cached per sprite canvas.
- Strip routes are one floor line: every point is on it, so a route is a single step. No hop behind lecterns.
- No desk glows in the strip (no lighting pass at all); the cast shadows still use the desk lights.
- When a card or panel opens, the window grows upward to hold it (the scene stays anchored to the bottom).
- Switching to or from the strip clears the cast: everyone walks in again from the gate.

## Files

| File | Responsibility |
|---|---|
| `ui/view.js` | `view.strip`, `setView('strip')`, `hallView(mode)` |
| `ui/strip.js` (new) | `STRIP_H`, `FLOOR`, `stripOf(w)`, `layoutStrip(depts, opt)`, `stripRoute(a, b)` |
| `ui/strip.test.mjs` (new) | Geometry, layout, planLayout + Cast in strip space |
| `ui/outline.js` (new) | `outlineMask(alpha, w, h)` (pure), `outlined(cv)` (cached canvas) |
| `ui/outline.test.mjs` (new) | `outlineMask` tests |
| `ui/layout.js` | `planLayout(..., lay = layoutDepartments)` |
| `ui/actors.js` | `Cast.go` uses `hall.route`; compaction in the strip is a puff |
| `ui/sprites.js` | `blit` draws `outlined(cv)` while `outline.on` |
| `ui/scene.js` | `drawScene` strip branches; `drawStripProps` |
| `ui/app.js` | strip mode: fit, relayout, frame, cast reset, click-through hit test, panel growth |
| `ui/settings.js`, `ui/index.html` | View option *Desktop strip*, Strip size, Strip backdrop, handle menu, CSS |
| `src-tauri/src/strip/mod.rs` (new) | `Rect`, `Edge`, `edge_of`, `strip_rect` (pure, tested); commands; cursor poll; watcher |
| `src-tauri/src/strip/windows.rs` (new) | `taskbar_edge`, `autohide`, `fullscreen`, `cursor`, `show_no_activate` |
| `src-tauri/src/main.rs` | `mod strip;`, commands, tray check item, start the threads |
| `src-tauri/tauri.conf.json` | `"transparent": true` |
| `src-tauri/capabilities/default.json` | window permissions |
| `src-tauri/Cargo.toml` | `windows-sys` feature `Win32_UI_Shell` (`GetCursorPos` and `ShowWindow` are in the already enabled `Win32_UI_WindowsAndMessaging`) |
| `tools/sprites.html` | "strip" toggle: sprites outlined on a light and a dark ground |
| `README.md`, `docs/backlog.md` | Desktop strip section; backlog entry moved to done |

---

## Phase 1: a working strip

### Task 1: transparent window, `strip` in the view state

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `ui/view.js`, `ui/view.test.mjs`, `ui/app.js:20,51`, `ui/index.html` (CSS)

**Interfaces:**
- Produces: `view.strip: boolean`; `setView(mode)` accepts `'flat' | '39' | 'strip'` (strip sets `view.strip = true`,
  `view.mode = 'flat'`); listeners get `(next, prev)` as view *names* (`'flat' | '39' | 'strip'`);
  `viewName()` returns the current name; `hallView(name)` returns `'39'` for `'39'`, else `'flat'`.

- [ ] **Step 1: failing tests** — append to `ui/view.test.mjs`:

```js
import { viewName, hallView } from './view.js';
{
  const seen = [];
  const off = onView((next, prev) => seen.push([next, prev]));
  setView('flat');
  setView('strip');
  assert.equal(view.strip, true);
  assert.equal(view.mode, 'flat'); // the strip draws flat
  assert.equal(viewName(), 'strip');
  setView('39');
  assert.equal(view.strip, false);
  assert.equal(view.mode, '39');
  setView('39'); // no change: no event
  assert.deepEqual(seen.slice(-2), [['strip', 'flat'], ['39', 'strip']]);
  assert.equal(hallView('39'), '39');
  assert.equal(hallView('strip'), 'flat');
  assert.equal(hallView('flat'), 'flat');
  off();
  setView('flat');
}
```

- [ ] **Step 2:** `node ui/view.test.mjs` → FAIL (`viewName` not exported).
- [ ] **Step 3: implement** in `ui/view.js`, replacing `view` and `setView`:

```js
export const view = { mode: 'flat', strip: false };
export const viewName = () => (view.strip ? 'strip' : view.mode);
export const hallView = name => (name === '39' ? '39' : 'flat');
const listeners = new Set();
export const onView = fn => { listeners.add(fn); return () => listeners.delete(fn); };
// mode: 'flat' | '39' | 'strip' (adm.view). The strip is a window mode drawn with the flat projection.
export function setView(mode) {
  const next = mode === 'strip' ? 'strip' : hallView(mode), prev = viewName();
  if (next === prev) return;
  view.strip = next === 'strip';
  view.mode = hallView(next);
  for (const f of listeners) f(next, prev);
}
```

  Check every `onView` listener and `toFloor(..., prev)` caller: `prev` may now be `'strip'`, which `toFloor` must treat
  as flat (`mode === '39'` tests already do). In `app.js:20` keep `setView(store.get('adm.view', 'flat'))` for now but
  map strip away until Task 6 wires it: `setView(hallView(store.get('adm.view', 'flat')))`.
- [ ] **Step 4:** `"transparent": true` on the `main` window in `tauri.conf.json`. In `app.js:51` change the context to
  `canvas.getContext('2d')` (drop `{ alpha: false }`: the strip needs a transparent canvas; the hall's background blit
  still covers every pixel). In `index.html` CSS add:

```css
html.strip, html.strip body { background: transparent; }
html.strip header, html.strip .frame { display: none; }
```

  (use the real selector of the brass frame in `index.html`; check `html`/`body` keep their opaque `--bg` otherwise).
- [ ] **Step 5:** run all `node ui/*.test.mjs` → PASS. Then `cargo tauri dev -- -- --demo` (or `ADMINISTRATUM_DEMO=1`):
  Flat and 39° look as before (no desktop visible at the window edges, no black frame on resize); in devtools
  `document.documentElement.classList.add('strip')` shows the desktop through the empty areas.
- [ ] **Step 6: commit** `Desktop strip: transparent window, strip in the view state`.

### Task 2: backend placement (`strip/` module)

**Files:**
- Create: `src-tauri/src/strip/mod.rs`, `src-tauri/src/strip/windows.rs`
- Modify: `src-tauri/src/main.rs` (`mod strip;`, `generate_handler!`), `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces (commands): `strip_supported() -> bool`; `place_strip(height: f64) -> Result<Option<HallRect>, String>`
  (height in CSS px; returns the hall's rect the first time it leaves the hall, else `None`);
  `place_hall(rect: Option<HallRect>) -> Result<(), String>`; `set_click_through(on: bool) -> Result<(), String>`.
  `HallRect { x: i32, y: i32, w: u32, h: u32 }` (physical px, serde camelCase).
- Produces (Rust, for Tasks 5 and 7): `pub static ON: AtomicBool`, `pub fn last_rect() -> Option<Rect>`,
  `fn replace(window: &WebviewWindow, height_css: f64) -> Result<Rect, String>`.
- OS module contract (`windows.rs` now, `macos.rs` later): `taskbar_edge() -> Option<Edge>`, `autohide() -> bool`,
  `fullscreen() -> bool`, `cursor() -> Option<(i32, i32)>`, `show_no_activate(window: &WebviewWindow)`.

- [ ] **Step 1: failing tests** in `strip/mod.rs`:

```rust
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
```

- [ ] **Step 2:** `cargo test strip` → FAIL (module missing).
- [ ] **Step 3: implement the pure part** (`strip/mod.rs`):

```rust
//! The desktop strip: a thin transparent window on the taskbar. The OS calls live in one file per OS
//! (windows.rs now; macos.rs would add the same functions, the Dock instead of the taskbar).
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use self::windows as os;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge { Bottom, Top, Left, Right }

/// The taskbar's side of a monitor: the side where the work area stops short of the monitor.
pub fn edge_of(mon: Rect, work: Rect) -> Option<Edge> {
    if work.bottom < mon.bottom { Some(Edge::Bottom) }
    else if work.top > mon.top { Some(Edge::Top) }
    else if work.left > mon.left { Some(Edge::Left) }
    else if work.right < mon.right { Some(Edge::Right) }
    else { None }
}

/// The strip's rect, physical px: the work area's width, `h` tall, standing on the work area's bottom (on a bottom
/// taskbar that is the taskbar's top edge). An auto-hidden taskbar: 2 px above the monitor's bottom.
pub fn strip_rect(mon: Rect, work: Rect, autohide: bool, h: i32) -> Rect {
    let bottom = if autohide { mon.bottom - 2 } else { work.bottom };
    Rect { left: work.left, top: bottom - h, right: work.right, bottom }
}
```

  `autohide` here means "auto-hide and the taskbar is at the bottom": the caller passes
  `os::autohide() && edge_of(mon, work).or(os::taskbar_edge()) == Some(Edge::Bottom)`.
- [ ] **Step 4:** `cargo test strip` → PASS.
- [ ] **Step 5: implement `windows.rs`** with `windows-sys` (add `"Win32_UI_Shell"` to the features in `Cargo.toml`):
  - `taskbar_edge()`: `SHAppBarMessage(ABM_GETTASKBARPOS, &mut APPBARDATA { cbSize, .. })`, map `uEdge`
    (`ABE_BOTTOM/TOP/LEFT/RIGHT`) to `Edge`; `None` when it returns 0.
  - `autohide()`: `SHAppBarMessage(ABM_GETSTATE, ..) as u32 & ABS_AUTOHIDE != 0`.
  - `fullscreen()`: `SHQueryUserNotificationState(&mut state)` succeeds and `state` is `QUNS_BUSY`,
    `QUNS_RUNNING_D3D_FULL_SCREEN` or `QUNS_PRESENTATION_MODE`.
  - `cursor()`: `GetCursorPos(&mut POINT)`, `Some((x, y))` on success.
  - `show_no_activate(w)`: `ShowWindow(w.hwnd()?.0 as HWND, SW_SHOWNOACTIVATE)` (Tauri's `show()` activates).
  Every `unsafe` block gets a one-line `// SAFETY:` comment.
- [ ] **Step 6: commands** in `strip/mod.rs`. State: `pub static ON: AtomicBool`, `static RECT: Mutex<Option<Rect>>`,
  `static HEIGHT: Mutex<f64>` (the last CSS height, for the watcher).

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct HallRect { pub x: i32, pub y: i32, pub w: u32, pub h: u32 }

#[tauri::command]
pub fn strip_supported() -> bool { cfg!(windows) }

/// Re-place the strip on the window's current monitor, `height_css` tall. Returns the rect it set.
pub fn replace(w: &tauri::WebviewWindow, height_css: f64) -> Result<Rect, String> {
    let m = w.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let (p, s, wa) = (m.position(), m.size(), m.work_area());
    let mon = Rect { left: p.x, top: p.y, right: p.x + s.width as i32, bottom: p.y + s.height as i32 };
    let work = Rect { left: wa.position.x, top: wa.position.y,
        right: wa.position.x + wa.size.width as i32, bottom: wa.position.y + wa.size.height as i32 };
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
    let hall = if ON.swap(true, Ordering::SeqCst) { None } else {
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

pub fn last_rect() -> Option<Rect> { *RECT.lock().unwrap_or_else(|e| e.into_inner()) }
```

  `autohide()` / `edge_fallback()` are thin wrappers: `os::autohide()` / `os::taskbar_edge()` under `#[cfg(windows)]`,
  `false` / `None` elsewhere. If `Monitor::work_area()` is missing in the pinned Tauri version (check with Context7
  "tauri v2 Monitor work_area"), get `rcWork` from `MonitorFromWindow` + `GetMonitorInfoW` in `windows.rs` instead.
  The hall's default rect `100,100,700,500` is the `tauri.conf.json` size; the position is only used when no rect was saved.
- [ ] **Step 7:** register `strip::strip_supported, strip::place_strip, strip::place_hall, strip::set_click_through` in
  `generate_handler!`. Capabilities: add `"core:window:allow-set-ignore-cursor-events"`,
  `"core:window:allow-set-position"`, `"core:window:allow-set-size"` (commands go through Rust, but the UI's
  Task 6 fallback uses the JS API too).
- [ ] **Step 8:** `cargo fmt --check && cargo clippy -- -D warnings && cargo test` → green. In `cargo tauri dev -- -- --demo`,
  from devtools: `__TAURI__.core.invoke('place_strip', { height: 112 })` puts the window on the taskbar as a 112 CSS px
  bar; `invoke('place_hall', { rect: <the returned rect> })` puts it back with resizing and min size restored.
- [ ] **Step 9: commit** `Desktop strip: place the window above the taskbar`.

### Task 3: strip geometry, layout and the cast in strip space

**Files:**
- Create: `ui/strip.js`, `ui/strip.test.mjs`
- Modify: `ui/layout.js` (`planLayout`), `ui/actors.js` (`Cast.go`, `Cast.compacted`)

**Interfaces:**
- Produces: `STRIP_H = 56`, `FLOOR = 53`; `stripOf(w) -> hall` (same fields the cast and app read from `hallOf()`,
  plus `strip: true`, `route`, `magos`, `cog`, `bench`); `layoutStrip(depts, { size }) -> { blocks, desks, seats,
  consoles, consoleSeats, overflow }` (same shape as `layoutDepartments`); `stripRoute(a, b) -> [{x, y}]`;
  `planLayout(prev, depts, now, grace, size, lay = layoutDepartments)`.

- [ ] **Step 1: failing tests** — `ui/strip.test.mjs`:

```js
import assert from 'node:assert/strict';
import { STRIP_H, FLOOR, stripOf, layoutStrip, stripRoute } from './strip.js';
import { planLayout } from './layout.js';
import { Cast } from './actors.js';

const H = stripOf(800);
assert.equal(H.strip, true);
assert.equal(H.h, STRIP_H);
assert.equal(H.entry.y, FLOOR);
assert.ok(H.entry.x < 0); // off-screen left
// right to left: Magos, queue, bench, cogitator; all on the floor, inside the strip, no overlap between zones
assert.ok(H.magos.x < 800 && H.queue[0].x < H.magos.x);
for (let i = 1; i < H.queue.length; i++) assert.ok(H.queue[i].x < H.queue[i - 1].x);
assert.ok(H.refectory.at(-1).x < H.queue.at(-1).x - 6);
assert.ok(Math.max(...H.cogSpots.map(p => p.x)) < H.recaff.x);
for (const p of [...H.queue, ...H.refectory, ...H.cogSpots, H.recaff]) assert.equal(p.y, FLOOR);
assert.ok(H.x1 < Math.min(...H.cogSpots.map(p => p.x)) - 12);
assert.deepEqual(H.lanes, [FLOOR]);

// route: one step along the floor
assert.deepEqual(stripRoute({ x: 10, y: FLOOR }, { x: 90, y: FLOOR }), [{ x: 90, y: FLOOR }]);
assert.deepEqual(stripRoute({ x: 10, y: FLOOR }, { x: 10, y: FLOOR }), []);

// layout: departments in arrival order, lecterns then consoles, a gap between departments
const size = { w: 800, h: STRIP_H };
const L = layoutStrip([
  { name: 'a', color: '#f00', ids: ['s1', 's2'], helpers: ['h1', 'h2', 'h3'] },
  { name: 'b', color: '#0f0', ids: ['s3'], helpers: [] },
], { size });
assert.equal(L.desks.length, 3);
assert.ok(L.desks.every(d => d.compact)); // lecterns
assert.equal(L.consoles.length, 3);
const xs = [...L.desks.map(d => d.x), ...L.consoles.map(c => c.x)];
assert.equal(new Set(xs).size, xs.length); // no two items at one x
assert.ok(L.desks.find(d => d.id === 's3').x > Math.max(...L.consoles.map(c => c.x))); // b after a's consoles
assert.equal(L.seats.get('s1').y, FLOOR);
assert.equal(L.consoleSeats.get('h1').y, FLOOR);
assert.equal(L.blocks.length, 2);
assert.equal(L.overflow, 0);
assert.ok(L.desks[0].x >= H.x0);

// capacity: past x1 the rest overflows (counted by live scribe)
const many = Array.from({ length: 60 }, (_, i) => ({ name: `d${i}`, color: '#00f', ids: [`x${i}`], helpers: [] }));
const F = layoutStrip(many, { size });
assert.ok(F.overflow > 0);
assert.ok(F.desks.every(d => d.x + 24 <= H.x1 + 1)); // a lectern slot is 26 wide, its desk 2 px in

// planLayout keeps stable slots with the strip's layout
const P1 = planLayout(null, [{ name: 'a', color: '#f00', ids: ['s1', 's2'], helpers: [] }], 0, {}, size, layoutStrip);
const P2 = planLayout(P1, [{ name: 'a', color: '#f00', ids: ['s2'], helpers: [] }], 1000, {}, size, layoutStrip);
assert.equal(P2.desks.find(d => d.id === 's2').x, P1.desks.find(d => d.id === 's2').x); // s1's desk held empty

// the cast walks in from off-screen left along the floor; compaction is a puff
const cast = new Cast();
cast.sync([{ id: 's2', dept: 'a', status: 'busy', sinceMs: 0, context: null }], P2.seats, () => '#f00', P2.consoleSeats, P2.blocks, H);
const a = cast.actors.get('s2');
assert.deepEqual([a.x, a.y], [H.entry.x, H.entry.y]);
assert.deepEqual(a.path, [{ x: P2.seats.get('s2').x, y: FLOOR }]);
a.pose = 'desk';
cast.compacted(a);
assert.ok(a.puff > 0 && !a.burn);
console.log('strip ok');
```

- [ ] **Step 2:** `node ui/strip.test.mjs` → FAIL (module missing).
- [ ] **Step 3: implement `ui/strip.js`:**

```js
// The desktop strip's geometry, logical px: one floor line along a thin bar on the taskbar. stripOf() returns the
// fields the cast and app.js read from hallOf() (layout.js), so the same Cast walks in either. Left to right: the
// gate (off-screen left), the departments' lecterns and consoles, the cogitator, the recaff and bench, the petition
// line and the Magos at the right end (nearest the clock).
export const STRIP_H = 56; // lectern (30) + the scribe's label above it
export const FLOOR = STRIP_H - 3; // feet
const GATE_W = 24, LEC_W = 26, CON_W = 16, GAP = 6;
const RIGHT_W = 220; // cogitator to Magos

export const stripRoute = (a, b) => (a.x === b.x && a.y === b.y ? [] : [{ x: b.x, y: b.y }]); // every point is on the floor

const strips = new Map();
export function stripOf(w) {
  w = Math.round(w);
  let S = strips.get(w);
  if (S) return S;
  if (strips.size > 16) strips.clear();
  const at = x => ({ x, y: FLOOR });
  const magos = at(w - 16), queue = Array.from({ length: 6 }, (_, i) => at(w - 40 - 14 * i));
  const refectory = [w - 150, w - 138, w - 126].map(at), recaff = at(w - 166);
  const cogSpots = [w - 206, w - 194, w - 182].map(at);
  S = {
    strip: true, route: stripRoute, w, h: STRIP_H, baseH: STRIP_H, bays: 0, dy: 0, rows: 1,
    sw: w, rx: w, ox: 0, dx: 0, split: STRIP_H, sd: 0, sb: 0, hy: 0, // roomOf(): everything is 'hall'
    x0: GATE_W, x1: w - RIGHT_W, y0: FLOOR, y1: FLOOR, aisleY: FLOOR, corridorX: w, lanes: [FLOOR],
    entry: at(-10), magos, queue, refectory, recaff, cogSpots,
    cog: { x: w - 210, y: FLOOR - 30 }, bench: { x: w - 156, y: FLOOR - 12 }, // props' top-left, placed in Task 4
  };
  strips.set(w, S);
  return S;
}

// One row: per department its lecterns (desk slots, held empty by planLayout) then its consoles, GAP between
// departments, a mat under each. Same result shape as layoutDepartments(); compact/bays are ignored.
export function layoutStrip(depts, { size } = {}) {
  const { x0, x1 } = stripOf(size.w);
  const blocks = [], desks = [], seats = new Map(), consoles = [], consoleSeats = new Map();
  let x = x0, overflow = 0, full = false;
  for (const d of depts) {
    const helpers = d.helpers ?? [], slotsOf = d.desks ?? d.ids.map(id => ({ key: id, id }));
    const ncons = Math.max(d.cons ?? 0, helpers.length);
    const w = slotsOf.length * LEC_W + ncons * CON_W;
    if (full || x + w > x1 + 1) { full = true; overflow += slotsOf.filter(k => k.id).length; continue; }
    blocks.push({ name: d.name, color: d.color, x, y: FLOOR - 3, w, h: 5 });
    slotsOf.forEach((k, i) => {
      const desk = { ...k, dept: d.name, x: x + i * LEC_W + 2, y: FLOOR - 30, compact: true };
      desks.push(desk);
      if (k.id) seats.set(k.id, { x: desk.x + 11, y: FLOOR });
    });
    helpers.forEach((id, k) => {
      if (id == null) return;
      const con = { id, dept: d.name, x: x + slotsOf.length * LEC_W + k * CON_W + 1, y: FLOOR - 22 };
      consoles.push(con);
      consoleSeats.set(id, { x: con.x + 7, y: FLOOR });
    });
    x += w + GAP;
  }
  return { blocks, desks, seats, consoles, consoleSeats, overflow };
}
```

  Note `d.cons` in the hall counts console *slots* of 4; here one console per helper, so use
  `Math.max(d.cons ?? 0, helpers.length)` as written (a spare console slot stays a little wider, harmless).
- [ ] **Step 4: `planLayout` gets the layout function** (`ui/layout.js`): add a sixth parameter
  `lay = layoutDepartments` and replace every `layoutDepartments(` call inside `planLayout` with `lay(`. Update the
  doc comment: "lay: the layout function (layoutStrip in the desktop strip)".
- [ ] **Step 5: the cast** (`ui/actors.js`):
  - in `go()`: `const H = this.hall, R = H.route ?? route;` and use `R(...)` in both calls.
  - in `compacted(a)`: `if (a.pose !== 'desk' || this.hall.strip) { a.puff = PUFF_S; return; }` (no brazier in the strip).
- [ ] **Step 6:** `node ui/strip.test.mjs` → `strip ok`; all `node ui/*.test.mjs` → green (layout tests unchanged).
- [ ] **Step 7: commit** `Desktop strip: geometry, layout and routes`.

### Task 4: draw the strip

**Files:**
- Create: `ui/outline.js`, `ui/outline.test.mjs`
- Modify: `ui/sprites.js` (`blit`), `ui/scene.js` (`drawScene`, new `drawStripProps`, `staticLights`), `ui/app.js` (strip render path)

**Interfaces:**
- Consumes: `stripOf`, `layoutStrip`, `STRIP_H` (Task 3); `view.strip` (Task 1).
- Produces: `outline = { on: false }` and `outlineMask(alpha, w, h) -> Uint8Array` / `outlined(cv) -> canvas` from
  `ui/outline.js`; in `app.js`: `strip()` (is the strip on), `stripScale()`, `stripCss()` (the strip's CSS height),
  `resetCast()`; `drawScene` reads `layout.hall.strip`.

- [ ] **Step 1: failing test** `ui/outline.test.mjs`:

```js
import assert from 'node:assert/strict';
import { outlineMask } from './outline.js';
// a 1x1 opaque pixel in a 3x3 sprite: the mask is 5x5 (1 px border added), the 4-neighbour ring set, the pixel and
// the diagonals not set
const a = new Uint8ClampedArray(9); a[4] = 255;
const m = outlineMask(a, 3, 3);
assert.equal(m.length, 25);
const on = [...m].flatMap((v, i) => (v ? [[i % 5, Math.floor(i / 5)]] : []));
assert.deepEqual(on, [[2, 1], [1, 2], [3, 2], [2, 3]]);
// faint pixels (alpha < 128: shadows, glows) do not get an outline
const f = new Uint8ClampedArray(9); f[4] = 100;
assert.ok(outlineMask(f, 3, 3).every(v => !v));
console.log('outline ok');
```

- [ ] **Step 2:** `node ui/outline.test.mjs` → FAIL.
- [ ] **Step 3: implement `ui/outline.js`:**

```js
// Strip only: every sprite gets a 1 art px dark outline so it reads on any wallpaper (blit() in sprites.js draws
// outlined(cv) while outline.on). No art change: the outline is computed from each loaded frame, cached per canvas.
import { T, onTheme } from './theme.js';

export const outline = { on: false };

// alpha: the sprite's alpha channel (w x h); returns a (w + 2) x (h + 2) mask: 1 where a transparent pixel touches
// a solid one (alpha >= 128) on a side. Faint pixels neither get nor make an outline.
export function outlineMask(alpha, w, h) {
  const W = w + 2, H = h + 2, m = new Uint8Array(W * H);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x] >= 128;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - 1, sy = y - 1;
    if (!solid(sx, sy) && (solid(sx - 1, sy) || solid(sx + 1, sy) || solid(sx, sy - 1) || solid(sx, sy + 1))) m[y * W + x] = 1;
  }
  return m;
}

let cache = new WeakMap();
onTheme(() => { cache = new WeakMap(); });
// cv with its outline, 1 art px larger on every side (draw it 1 art px up-left of cv's place).
export function outlined(cv) {
  let o = cache.get(cv);
  if (o) return o;
  const { width: w, height: h } = cv, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[4 * i + 3];
  const m = outlineMask(alpha, w, h);
  o = document.createElement('canvas'); o.width = w + 2; o.height = h + 2;
  const g = o.getContext('2d'), img = g.createImageData(w + 2, h + 2), [r, gg, b] = hex(T.ink.outline);
  for (let i = 0; i < m.length; i++) if (m[i]) img.data.set([r, gg, b, 255], 4 * i);
  g.putImageData(img, 0, 0);
  g.drawImage(cv, 1, 1);
  cache.set(cv, o);
  return o;
}
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); // '#rrggbb'
```

  Check `T.ink.outline` is `#rrggbb` in every theme (`node -e` over `THEMES`); if a theme gives another format, convert
  through a 1x1 canvas instead of `hex`.
- [ ] **Step 4:** `blit` in `ui/sprites.js`:

```js
export function blit(g, map, x, y, over) {
  const cv = sprite(map, over);
  if (outline.on) { const o = outlined(cv); g.drawImage(o, x - 1 / RES, y - 1 / RES, o.width / RES, o.height / RES); return; }
  g.drawImage(cv, x, y, cv.width / RES, cv.height / RES);
}
```

  with `import { outline, outlined } from './outline.js';` (check for an import cycle: `outline.js` imports only
  `theme.js`). Run `node ui/outline.test.mjs` → `outline ok`.
- [ ] **Step 5: `drawScene` strip branches** (`ui/scene.js`), hall path unchanged:
  - `drawDoors(g, all)` only when `!H.strip`; `const items = H.strip ? [] : [drawGate(g, all)]`.
  - `drawDecorFrame(...)` only when `!H.strip`; in its place `drawStripProps(g, H, all, now, items)` runs **before**
    `items.sort(...)` (so props depth-sort with actors).
  - `staticLights(H)` returns `[]` when `H.strip` (no room lights).
  - `drawAlarm(g, all, now)` only when `!H.strip` (Task 8 adds the strip's).
  - New `drawStripProps(g, H, actors, now, items)`: pushes items for `MAPS.COGITATOR` at `H.cog`, `MAPS.RECAFF` just
    left of `H.recaff`, `MAPS.BENCH` at `H.bench`, and the Magos at `H.magos` (extract the throne + body + arm blits of
    `drawDecorFrame` into `drawMagos(g, x, y, t)` and call it from both, so the hall's pixels stay identical). Each prop's
    `y` for sorting is its foot line; each gets `contactShadow(g, shadowOf(map, x, y), 0.5)` under it, like desks.
    Adjust the prop x/y in `stripOf` (Task 3 file) so feet stand on `FLOOR`; the test's ordering asserts must still hold.
- [ ] **Step 6: app.js render path** (behind `strip()`; hall code paths unchanged):
  - `const strip = () => viewMode.strip;` `const stripScale = () => ({ S: 1.5, M: 2, L: 2.5 })[settings.stripSize] ?? 2;`
    (Task 6 adds the setting; until then `settings.stripSize` is undefined → 2). `const stripCss = () => Math.round(STRIP_H * stripScale());`
  - `fit()`: when `strip()`: `scale = stripScale()`, `size = { w: Math.floor(innerWidth / scale), h: STRIP_H }`, call
    `relayout()` on change, no pan (`setPan(0, 0)`), the stage pinned to the window's bottom (CSS
    `html.strip #stage { position: fixed; left: 0; bottom: 0; }`), then return.
  - `relayout()` / `onRoster()`: `hall = strip() ? stripOf(size.w) : hallOf(layout.bays ?? 0, size)`; napping spots from
    `(strip() ? stripOf(size.w) : hallOf(0, size)).refectory`; `planLayout(..., size, strip() ? layoutStrip : layoutDepartments)`.
  - `frame()`: when `strip()`: `g.clearRect(0, 0, S.w, S.h)`, no `background()`, no back-wall lag blit;
    `outline.on = true` around `drawScene(...)` (set back to `false` right after, so the sprite viewer and the hall are
    untouched); no `drawLighting`.
  - `resetCast()`: `cast.actors.clear(); cast.naps.clear(); layout = { ...emptyLayout }` (keep `layout.plan`: desk
    keys are geometry-free). In the `onView` listener: if `next === 'strip' || prev === 'strip'`:
    `document.documentElement.classList.toggle('strip', next === 'strip'); resetCast(); for (const k in bg) delete bg[k]; fit(); relayout(); return;`
  - Check: `syncEdges` (edge arrows) and the pan keys do nothing in strip mode (`pannable()` false when the scene fits).
- [ ] **Step 7: verify** in the browser preview (`python -m http.server 8123`, `tools/preview.html` or the app's page
  with a demo roster; see `docs/superpowers/plans/2026-10-07-depth-pass.md` for the preview harness) and in
  `cargo tauri dev -- -- --demo` with `setView('strip')` + `invoke('place_strip', { height: 112 })` from devtools:
  screenshots on a light, a dark and a busy wallpaper; scribes walk in from the left, sit at lecterns, petitioners
  queue by the Magos; Flat and 39° unchanged (screenshot before/after one hall frame, compare).
- [ ] **Step 8:** all node tests green. **Commit** `Desktop strip: drawing`.

### Task 5: click-through except on characters

**Files:**
- Modify: `src-tauri/src/strip/mod.rs` (cursor poll), `src-tauri/src/main.rs` (start it), `ui/app.js` (hit test)

**Interfaces:**
- Consumes: `ON`, `last_rect()`, `os::cursor()` (Task 2); `actorAt(e)` in app.js (takes `{ clientX, clientY }`).
- Produces: event `strip-cursor` with payload `{ x: f64, y: f64 } | null` (CSS px in the window, `null` once when
  the cursor leaves the strip's rect); `pub fn start_cursor_poll(app: AppHandle)`.

- [ ] **Step 1: test the pure part** in `strip/mod.rs`:

```rust
/// The cursor in window CSS px, if it is inside the strip's rect.
pub fn inside(r: Rect, (x, y): (i32, i32), scale: f64) -> Option<(f64, f64)> {
    (x >= r.left && x < r.right && y >= r.top && y < r.bottom)
        .then(|| (f64::from(x - r.left) / scale, f64::from(y - r.top) / scale))
}
#[test]
fn cursor_inside() {
    let r = Rect { left: 100, top: 900, right: 2020, bottom: 1012 };
    assert_eq!(inside(r, (100, 900), 2.0), Some((0.0, 0.0)));
    assert_eq!(inside(r, (300, 1000), 2.0), Some((100.0, 50.0)));
    assert_eq!(inside(r, (300, 1012), 2.0), None);
    assert_eq!(inside(r, (99, 950), 2.0), None);
}
```

  `cargo test strip` → FAIL, implement `inside`, → PASS.
- [ ] **Step 2: the poll thread** (`start_cursor_poll`): loop; when `!ON` sleep 250 ms; else every 50 ms read
  `os::cursor()` and `last_rect()`, scale from `window.scale_factor()`; emit `strip-cursor` with `{x, y}` while inside
  (only when the point moved), and `null` once on leaving. Start it in `main.rs` `setup` (Windows only; elsewhere
  the function is a no-op).
- [ ] **Step 3: the UI** (`app.js`, strip only):

```js
// Desktop strip: the window ignores the cursor except over a hit target; the backend reports the cursor while it
// is over the strip (it gets no pointer events while ignoring them).
let through = null;
const HIT = '.lbl, .plaque, #card, #prefs, #chron, #strip-handle, #strip-menu';
function stripHit(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest(HIT) || !!actorAt({ clientX: x, clientY: y });
}
function setThrough(on) {
  if (on === through) return;
  through = on;
  invoke('set_click_through', { on }).catch(() => {});
}
listen('strip-cursor', ({ payload: p }) => {
  if (!strip()) return;
  if (!p) { mouse = null; setThrough(true); return; }
  mouse = { clientX: p.x, clientY: p.y, pointerType: 'mouse' }; // the hover tip works while clicks pass through
  setThrough(!stripHit(p.x, p.y));
});
```

  Use the real class names of plaques and labels in `index.html`/`app.js` (`.lbl` is the petition label; check the
  plaque's). On entering the strip call `setThrough(true)`; on leaving set `through = null` (Rust `place_hall` already
  turns it off). `actorAt` must accept a plain `{clientX, clientY}` object (check it reads nothing else from the event).
- [ ] **Step 4: verify** (`cargo tauri dev -- -- --demo`, strip placed): desktop icons and windows under the strip get
  clicks; a scribe opens its card; the hover tip follows; the card closes on Escape or a click outside.
- [ ] **Step 5:** `cargo fmt --check && cargo clippy -- -D warnings && cargo test`, node tests. **Commit**
  `Desktop strip: click-through except on characters`.

## Phase 2: daily use

### Task 6: switching (Settings, tray, handle) and panels that grow upward

**Files:**
- Modify: `ui/index.html` (View option, Strip size, handle + menu markup and CSS), `ui/settings.js`, `ui/app.js`,
  `src-tauri/src/main.rs` (tray), `src-tauri/src/strip/mod.rs`

**Interfaces:**
- Consumes: `place_strip`, `place_hall`, `strip_supported` (Task 2); `setThrough`, `stripCss`, `resetCast` (Tasks 4, 5).
- Produces: `adm.view` may be `strip`; `adm.hallView` (`flat | 39`, the view to go back to); `adm.hallRect` (JSON
  `HallRect`); `settings.stripSize` (`S | M | L`, default `M`); tray item id `strip` emitting `ui-command` `"strip"`;
  command `set_strip_menu(on: bool)`.

- [ ] **Step 1: Settings.** In `index.html` add `<option value="strip" class="host-only" hidden>Desktop strip</option>`
  to `select[name=view]` and, in the same section, `<label class="strip-only"><span>Strip size</span><select
  name="stripSize"><option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option></select></label>`.
  In `settings.js`: unhide the option when `invoke('strip_supported')` resolves `true` and not `REMOTE`; `sync()` sets
  `field('view').value = viewName()`; `pickView(mode)`: if leaving the hall for the strip, `store.set('adm.hallView',
  viewMode.mode)`; then `store.set('adm.view', mode); setView(mode)`. `stripSize` is saved in `settings` like the other
  fields and triggers `hooks.rescaled()`.
- [ ] **Step 2: boot.** `app.js:20`: `const saved = store.get('adm.view', 'flat');` then
  `setView(hallView(saved))`, and if `saved === 'strip' && !REMOTE`, `invoke('strip_supported').then(ok => ok && setView('strip'))`.
- [ ] **Step 3: enter / leave** in the `onView` listener (extends Task 4's branch):

```js
async function enterStrip() {
  const r = await invoke('place_strip', { height: stripCss() });
  if (r) store.set('adm.hallRect', JSON.stringify(r));
  setThrough(true);
  invoke('set_strip_menu', { on: true }).catch(() => {});
}
async function leaveStrip() {
  through = null;
  const r = store.get('adm.hallRect');
  await invoke('place_hall', { rect: r ? JSON.parse(r) : null });
  invoke('set_strip_menu', { on: false }).catch(() => {});
}
```

  Call them only when `tauri()` (the browser preview just changes the drawing).
- [ ] **Step 4: tray.** In `build_tray`: `let strip = CheckMenuItem::with_id(app, "strip", "Desktop strip", cfg!(windows), false, None::<&str>)?;`
  between `light` and `login`; keep it in state with a newtype (`struct StripItem(CheckMenuItem<Wry>)`, since
  `CheckMenuItem` is already managed for `login`); menu event `"strip" => emit(app, "ui-command", "strip")`.
  Command `set_strip_menu(on)` sets it checked. UI: the existing `ui-command` listener gets
  `strip: () => { const to = viewMode.strip ? store.get('adm.hallView', 'flat') : 'strip'; if (to === 'strip') store.set('adm.hallView', viewMode.mode); store.set('adm.view', to); setView(to); }`.
- [ ] **Step 5: the handle.** A 12 logical px cog button `#strip-handle` at the strip's left end (CSS-positioned over
  the gate zone, `html.strip` only), toggling `#strip-menu` with four buttons: *Hall view* (switch to
  `adm.hallView`), *Settings* (opens `#prefs`), *Chronicon* (opens `#chron`), *Hide* (the header's hide action).
- [ ] **Step 6: panels grow upward.** In strip mode `#card`, `#prefs`, `#chron`, `#strip-menu` are anchored to the
  stage's top-left, `bottom: <stripCss>px`. A `ResizeObserver` + `MutationObserver` (`hidden`/`class` attributes) on
  them calls `growStrip()`:

```js
let grownTo = 0;
function growStrip() {
  if (!strip() || !tauri()) return;
  const open = [...document.querySelectorAll('#card, #prefs, #chron, #strip-menu')].filter(el => el.offsetParent);
  const h = stripCss() + Math.max(0, ...open.map(el => el.offsetHeight + 8));
  if (h !== grownTo) { grownTo = h; invoke('place_strip', { height: h }).catch(() => {}); }
}
```

  Clicks over an open panel are already kept by `stripHit` (Task 5).
- [ ] **Step 7: verify** in the installed-like run (`cargo tauri dev`): Settings > View > Desktop strip moves the window
  to the taskbar; *Hall view* in the handle menu brings back the old rect and the previous view (39° if it was 39°);
  the tray check follows both ways; restart while in strip mode starts in the strip; the card and Settings open above
  the strip and the window shrinks back when they close; Strip size S/M/L resizes the strip.
- [ ] **Step 8:** tests green. **Commit** `Desktop strip: switch from settings, tray and handle`.

### Task 7: fullscreen apps, monitors and the taskbar

**Files:**
- Modify: `src-tauri/src/strip/mod.rs` (watcher), `src-tauri/src/main.rs` (start it)

**Interfaces:**
- Consumes: `ON`, `HEIGHT`, `replace`, `os::fullscreen`, `os::show_no_activate` (Task 2).
- Produces: `pub fn start_watcher(app: AppHandle)`; events `strip-hide` / `strip-show` (the UI pauses while hidden,
  as when the window is covered).

- [ ] **Step 1: pure decision, tested:**

```rust
#[derive(Debug, PartialEq, Eq)]
pub enum Act { Hide, Show, Stay }
/// hidden_by_us: the watcher hid the strip for a fullscreen app (a user's own Hide is left alone).
pub fn act(fullscreen: bool, visible: bool, hidden_by_us: bool) -> Act {
    match (fullscreen, visible, hidden_by_us) {
        (true, true, _) => Act::Hide,
        (false, false, true) => Act::Show,
        _ => Act::Stay,
    }
}
#[test]
fn fullscreen_hides_and_restores_only_its_own_hide() {
    assert_eq!(act(true, true, false), Act::Hide);
    assert_eq!(act(false, false, true), Act::Show);
    assert_eq!(act(false, false, false), Act::Stay); // the user hid it
    assert_eq!(act(true, false, true), Act::Stay);
    assert_eq!(act(false, true, false), Act::Stay);
}
```

  `cargo test strip` → FAIL → implement → PASS.
- [ ] **Step 2: the watcher thread** (1 s, only while `ON`): `act(os::fullscreen(), window.is_visible(), hidden_by_us)`;
  Hide → `window.hide()`, emit `strip-hide`, `hidden_by_us = true`; Show → `os::show_no_activate(&window)`, emit
  `strip-show`, `hidden_by_us = false`. When visible: `replace(&window, *HEIGHT)` (re-places only when the monitor,
  work area, DPI or taskbar changed: `replace` compares with `RECT`) and `window.set_always_on_top(true)` (Windows
  drops topmost after some fullscreen transitions and Explorer restarts). Errors are logged once, never panic.
- [ ] **Step 3: UI.** `listen('strip-hide', ...)` / `listen('strip-show', ...)` reuse the existing `visible` flag and
  `wake()` (the loop pauses while hidden). Petitions still toast (backend, unchanged).
- [ ] **Step 4: verify:** a fullscreen video or game hides the strip and it comes back after; moving the taskbar to
  the top or changing display scale re-places it; Hide from the handle stays hidden while a fullscreen app comes and goes.
- [ ] **Step 5:** `cargo fmt --check && cargo clippy -- -D warnings && cargo test`. **Commit**
  `Desktop strip: follow fullscreen apps, monitors and the taskbar`.

### Task 8: petitions, alarm and backdrop in the strip

**Files:**
- Modify: `ui/scene.js` (`drawStripAlarm`), `ui/app.js`, `ui/settings.js`, `ui/index.html`

**Interfaces:**
- Consumes: `isStale` (actors.js), `H.magos`, `H.queue` (Task 3), the hall's beacon/skull drawing helpers in `scene.js`.
- Produces: `settings.stripBackdrop: boolean` (default `false`).

- [ ] **Step 1:** in `scene.js` add `drawStripAlarm(g, H, actors, now)`, called from `drawScene` where `drawAlarm`
  runs in the hall, when `H.strip`: if any actor `isStale(a.s)` and in the queue, a red beacon blinks above the Magos
  (the hall beacon's colours and period) and the servo-skull hovers over `H.queue[0]` with its flying shadow
  (reuse the hall's skull sprite and `flyShadow`; extract a shared helper if the hall code inlines it, hall pixels
  unchanged). Returns its lights like `drawAlarm`.
- [ ] **Step 2: backdrop.** Setting *Strip backdrop* (checkbox, `strip-only` row). In `frame()` strip path, after
  `clearRect`: when `settings.stripBackdrop`, `g.fillStyle = hexA(T.ink.backdrop, 0.6); g.fillRect(0, 0, S.w, S.h)`
  (use `hexA` from `theme.js`; check its signature).
- [ ] **Step 3: verify** in demo mode with `staleMin` set to 1: the beacon blinks and the skull hovers over the first
  petitioner; entrances from the left edge and exits back out work; a compaction shows the puff on the lectern; the
  backdrop toggles live.
- [ ] **Step 4:** tests green. **Commit** `Desktop strip: petitions, alarm and backdrop`.

### Task 9: themes, sprite viewer, docs

**Files:**
- Modify: `tools/sprites.html`, `README.md`, `docs/backlog.md`, `docs/superpowers/plans/2026-10-07-desktop-strip.md`
  (one line at the top: "Superseded by 2026-10-08-desktop-strip.md")

- [ ] **Step 1:** check all 13 themes in the strip (demo mode, cycle the theme): outline readable, mats and lecterns
  present (`LECTERN` from `workstations`, the theme's own or the base), Magos, cogitator, bench and recaff drawn.
  Screenshot each; fix any missing prop by falling back to the base frame, never by editing art.
- [ ] **Step 2:** sprite viewer: a "strip" checkbox in `tools/sprites.html` that sets `outline.on` while drawing the
  cells and alternates a light (`#e8e8e8`) and a dark (`#202020`) cell background.
- [ ] **Step 3:** README: a **Desktop strip** paragraph under **Views** (what it shows left to right, click-through,
  the handle, fullscreen hiding, Windows only for now) with a screenshot `docs/img/strip.png`. Backlog: move the strip
  from *Ideas not scheduled* to *Done recently*; add a *Known limits (strip)* list (bottom taskbar only, no macOS yet,
  no desk glows).
- [ ] **Step 4:** `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, all node tests, cargo checks. **Commit**
  `Desktop strip: themes and docs`.
