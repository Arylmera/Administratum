# Vertical desktop strip with an elevator (O9) — decisions so far

**Goal.** A 4th View: a narrow, transparent, click-through column on the left or right screen edge, floors stacked
top to bottom, one elevator carrying scribes between floors.

**Status.** Decisions only; design and builder check pending. Scheduled after O6 and O8.

## Decision ledger

1. **Floors.** Top: the Sanctum (Magos, petition queue). Then one floor per department (lecterns, adepts). Bottom:
   the cogitator and the refectory (recaff, bench).
2. **Side (user, Q14).** Chosen in Settings: left or right. No automatic placement from the taskbar edge.
3. **Elevator (user, Q15).** One shared car; scribes queue in front of it; it takes several at once when many wait.
4. **Art.** Shaft, car and floor slab, a new design per world (6), never a recoloured 40k one.
5. **Keeps.** The horizontal strip stays as it is; the vertical strip is a separate View choice.
6. **Order (user, Q16).** After O6 and O8.

## Design (architect pass 2026-11-08; Rulings are the agent's or mine, all reversible)

**View.** `adm.view = 'vstrip'` ("Desktop column"): `view.strip` stays true (every strip behaviour comes free:
puff instead of burn, no Watchman, outlines, no lighting, click-through) plus `view.column`. Horizontal strip
untouched. Art loader: a theme uses its own folder, then its `artOf` folder, then base (`ui/sprites.js:91,103`), so
6 lift files cover every theme.

**Files.** New `ui/column.js` (geometry, layout, route; the counterpart of `strip.js`) and `ui/lift.js` (pure
scheduler, no `Date.now`, no `Math.random`). Changed: `ui/view.js`, `ui/actors.js`, `ui/app.js` (the
`stripOf`/`layoutStrip` sites and the world-switch test, on `view.column`), `ui/viewport.js` (`fit`),
`ui/stripwin.js`, `ui/settings.js` (`stripSide`), `ui/scene.js` (`drawColumnProps`; strip alarm and gate take the
floor y from `H`), `ui/overlay.js` (plaque and usage-banner y from `H`), `ui/index.html`, `ui/themes.js` (`'lift'`
in the `art` list of cyber, orbital, tower, vault, darwin), art `ui/art/lift.*` and
`ui/art/{cyber,orbital,tower,vault,darwin}/lift.*`, `tools/sprite_catalog.mjs` (lift rows appended at the end, so
cell refs keep their numbers), `src-tauri/src/strip/mod.rs`.

```js
// ui/column.js
export const COL_W = 128, FH = 44, TOP = 14, SHAFT_W = 28, SLAB_H = 6, MIN_FLOORS = 4;
export function columnOf(size, floors = [], side = 'right')   // -> H (hall-shaped), cached by size.h, side, floors
export function layoutColumn(depts, { size, side })            // -> { blocks, desks, seats, consoles, consoleSeats, overflow, floors }
export function columnRoute(a, b, blocks, H)                   // a cross-floor walk includes one { x, y, lift: { from, to } }
export const floorAt = (H, y) => /* floor key at that foot y, or null */;
export const maxDeptFloors = h => Math.floor((h - TOP) / FH) - 3;
// ui/lift.js
export const CAP = 3, SPEED_PX = 90, DOOR_S = 0.25, DWELL_S = 0.6;
export function makeLift(stops /* Map<key,y> */, at)  // -> L
export function setStops(L, stops)                     // -> [{ type: 'lost', id }]
export function call(L, id, from, to)                  // idempotent per id: keeps its FIFO number, updates `to`
export function cancel(L, id)                          // -> boolean (waiting calls only)
export function retarget(L, id, to)
export function step(L, dt)                            // -> [{ type: 'board' | 'alight', id, key }]
export const carY = L => L.y, doorsOf = L => L.doors;
export const slotOf = (L, id) => /* 0..CAP-1 or -1 */, lineOf = (L, id) => /* place in its floor's line or -1 */;
```
```rust
// strip/mod.rs
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)] #[serde(rename_all = "lowercase")]
pub enum Side { Left, Right }
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Shape { Bar { h: f64 }, Column { w: f64, side: Side } }  // replaces the HEIGHT static (SHAPE: Mutex<Shape>)
pub fn column_rect(mon: Rect, work: Rect, side: Side, hide: Option<Edge>, w: i32) -> Rect;
pub fn replace(w: &tauri::WebviewWindow, shape: Shape) -> Result<Rect, String>;
fn enter(window: &tauri::WebviewWindow, shape: Shape) -> Result<Option<HallRect>, String>; // place_strip(h) = enter(Bar { h })
#[tauri::command] pub fn place_column(window: tauri::WebviewWindow, width: f64, side: Side) -> Result<Option<HallRect>, String>;
```

**Layout.** Logical px, `w = COL_W`, `h = floor(innerHeight / scale)`; the window is the full work-area height, so
`h` is constant. Canonical layout has the screen edge at x = 0 and the shaft on the inner side
(`x` in `[COL_W − SHAFT_W, COL_W]`); the right side mirrors every x (`x' = COL_W − x`, rects `COL_W − x − w`),
sprites never mirrored. Floors are keys with a foot y: `sanctum` at `TOP + FH`; `d:<name>` per department in
`deptOrder`, department k at `TOP + (k + 2)·FH`; `cog` at `h − FH`; `ref` at `h` (entry floor). A new department
appends below the last (no floor moves); a removed one lifts the floors below by FH; the gap above `cog` is empty
shaft.
- Sanctum: throne and Magos at x ≈ 12, 4 queue slots x = 34, 50, 66, 82, extra petitioners stack on the last; the O6
  banner over the Magos.
- Department: lecterns front row, pitch `min(24, 96/n)`, at least 16; consoles a back row 6 px higher, pitch
  `min(16, 96/n)`, at least 10; plaque on the slab under the floor line.
- Cog: the 82 px bank at x 8..90, 3 `cogSpots`. Ref: strip handle x 2..14, recaff at 18, one bench widened to 58 px
  (x 38..96) with 3 nap spots; entry `(−10, h)` off-screen past the edge; no gate.
- Sizes (existing `stripScale`): S 1.5 → 192 CSS wide, floor 66; M 2 → 256, 88; L 2.5 → 320, 110. At 1080p / 125 %
  (about 816 CSS of work area): S 9, M 5, L 4 department floors.
- `H` carries `strip: true, column: true, route: columnRoute, w, h, baseH: h, floors, floorsKey, stops`,
  `landing(key)` (shaft door, x = 100 canonical), `entry, magos, queue, refectory, recaff, cog, cogSpots, benches,
  benchW`, and the zero fields `stripOf` sets for `roomOf`. The refectory depends only on `h`, so napping still runs
  before the layout.

**Elevator.** One car, CAP 3, 90 px/s, doors 0.25 s, dwell 0.6 s, position in pixel y over named stops. A call gets
FIFO number `n` on its first call; a repeat keeps `n`. SCAN collective control: idle → go to the lowest-`n` call;
moving → stop at the nearest stop ahead where a rider alights, or a same-direction call waits, or any call waits with
nothing further ahead; dwell → alight, then board in `n` order up to CAP if the call's direction matches the next
direction (or the car has none); calls arriving during dwell also board. No starvation (served within 2 sweeps); the
same calls and total dt give the same event order for any dt split up to 0.1 s.

**Cast.** `Cast.lift = makeLift(H.stops, 'ref')` when `H.column`, rebuilt on entry. `columnRoute`: same floor →
`[b]`; other floor → `[landing(from), { ...landing(to), lift }, b]`; a nap passes the recaff on `ref`. `update(dt)`
runs `step` first: `board` → `a.ride = 'in'`; `alight` → `ride = null`, placed on the landing, path shifted. At a lift
waypoint: `call`, `ride = 'wait'`, walk to the line spot `landing.x − 4 − 10·lineOf` and stand; riding: x = car
centre + `[−5, 0, 5][slotOf]`, `y = carY`, frame `SCRIBE.down[0]`. A new destination while waiting: same floor →
`cancel` and walk; other floor → `call` again (keeps its place). While riding → `retarget`. When `floorsKey` changes:
`setStops` (`lost` → snap to destination); non-riding actors on a moved floor shift with it (never a lift trip).
Adepts never ride: they appear and leave at their owner's floor landing. On entry to the column the cast snaps to its
destinations (`settle`); only later arrivals ride. Walk speed: SPEED (80).

**Window.** `hide = autohide().then(|| bar_edge(mon, work)).flatten()`; `column_rect`: top `work.top`
(`mon.top + 2` if hide = Top), bottom `work.bottom` (`mon.bottom − 2` if Bottom); Left: left `work.left`
(`mon.left + 2` if Left), right = left + w; Right: right `work.right` (`mon.right − 2` if Right), left = right − w;
`w = round(width_css · scale_factor)`. The watcher replays `*SHAPE` each second (monitor, DPI and taskbar changes
follow). The strip ↔ column switch goes direct with `ON` still true (returns `None`, `adm.hallRect` untouched); never
leave then enter.

**Click-through and panels.** As the horizontal strip: only `HIT` selectors and actors (riders included) catch the
cursor; shaft, car, slabs, props and the panel margin are click-through. The stage pins to the outer edge
(`html.vstrip #stage`, `.right`); panels open beside the column at `top: 8px`; `growStrip` widens the window by the
open panel's width + 8, height unchanged.

**Art.** Family `lift`, flat only (strips never draw 39°): `SHAFT` 56×16 (vertical tile), `SHAFT_TOP` 56×12,
`SHAFT_PIT` 56×8, `CABLE` 2×4 (vertical tile), `CAR_BACK` 52×40, `CAR_FRONT.shut/.half/.open` 52×40 (mostly
transparent), `SLAB` 16×12 (horizontal tile), `SLAB_L` / `SLAB_R` 8×12, `LAMP.off/.on` 6×6. 12 frames × 6 worlds,
each a new design: w40k gothic cage, cyber neon glass tube, orbital station tube, tower wooden platform on chains,
vault freight cage with hazard stripes, Darwin Victorian brass cage. Everything else reuses existing frames.

**Failures.** Short screen: `fit` drops L → M → S until MIN_FLOORS fit. Tall screen: empty shaft accepted. Many
departments: past `maxDeptFloors` (and scribes past 6 lecterns) are overflow, hidden and counted; no scrolling.
Auto-hidden taskbar on the chosen side: 2 px inset. O10: a room becomes an `r:<rule>` floor.

**Rulings (mine, on the architect's open questions).**
- Ruling: petitioners from overflow departments still queue in the Sanctum — the petition is what the column is for —
  cost if wrong: a busier queue.
- Ruling: 256 CSS px at M — the cogitator and 4 lecterns need it — cost if wrong: a narrower cogitator in every theme.
- Ruling: the tray's strip item goes to the last strip kind used (`adm.stripKind`, default `'strip'`) — one tray
  item — cost if wrong: a second item.
- Ruling: snap on entry; adepts never ride; `stripSide` default `'right'` (desktop icons sit on the left).
- Ruling: no break-out bay in the column (plaque only); the handle on the ref floor at the outer corner.

**Tests.** `ui/lift.test.mjs`: delivery; 5 callers → two FIFO trips; same-direction pickup, opposite passed;
starvation bound with a seeded PRNG; a repeat call keeps its place; cancel, retarget; `setStops` lost and moved y;
determinism over dt 0.05 vs 0.1; gate: break FIFO or CAP → red. `ui/column.test.mjs`: floor ys; add/remove moves only
the floors below; right mirrors x; one floor per department, pitch bounds, overflow; routes; nap via the recaff; entry
off-screen on the outer side. Cast tests in the `strip.test.mjs` style: arrive → call → board → alight → sit; a
petition retargets mid-ride; a floor move shifts seated actors; settle; adepts never call. `view.test.mjs` (`vstrip`
sets strip and column), `settings.test.mjs` (`stripSide`), Rust `column_rect` (both sides, taskbar same/opposite
side, auto-hide side/top/bottom, negative-offset monitor, `Shape` replay; bar tests still pass), `art.test.mjs` +
`sprites.test.mjs` (lift in 6 worlds, same frame sizes and anchors).

**Build order.** lift.js → column.js → view/settings/index → actors.js → strip/mod.rs → stripwin.js + CSS →
app/viewport/overlay/scene wiring → art, themes, catalog, galleries → README, DEVELOPMENT.md. Rebase on O6 and O8
first (the overlay banner moves).
