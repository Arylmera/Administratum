# Desktop column (O9) — plan
Spec: docs/superpowers/specs/2026-11-08-vertical-strip-design.md (the spec outranks this plan)

Start state (checked 2026-11-08, main 46b2d28): `view.strip` is one boolean (`view.js`, `viewName()` 'strip');
`strip.js stripOf(w)` gives the cast its hall-shaped `H`; `stripwin.js` places the window through `place_strip(height)`
(`strip/mod.rs`, the CSS height kept in `HEIGHT` and replayed by the watcher each second). The tray's strip item emits
`ui-command 'strip'` (`window.rs`), handled by `stripwin.js toggleStrip`. `drawScene` always draws the gate
(`H.gate ?? H.entry`). Art families in `sprites.js PROP_SHEETS` are mandatory sheets; generators are
`tools/<gen>_art.mjs` + `tools/<gen>_art/<world>.mjs`, found by `tools/art_gate.mjs`. Catalog rows are numbered in
order (cell refs), so new rows go last.

Call sites the signature changes break (the only ones, `git grep`): `strip::place_strip` in `main.rs`
`generate_handler!`; `replace(&w, height)`, `HEIGHT` and `place_strip` inside `strip/mod.rs`; `invoke('place_strip')` in
`stripwin.js`. View-name sites: `app.js` boot (`saved === 'strip'`) and `onView`; `settings.js pickView`, `renderSettings`
(`.strip-only`), the `[value="strip"]` unhide; `stripwin.js toggleStrip`; `view.js setView`.

## Vertical slice — one floor, one ride, end to end

**S1 · `ui/lift.js`.** Blocked by: none.
Pure scheduler (`makeLift`, `setStops`, `call`, `cancel`, `retarget`, `step`, `carY`, `doorsOf`, `slotOf`, `lineOf`),
CAP 3, 90 px/s, doors 0.25 s, dwell 0.6 s, SCAN collective control. `step` is event-exact (advances to the next
transition, never a fixed sub-step), so any dt split gives the same events.
Test (`ui/lift.test.mjs`): delivery, 5 callers in two FIFO trips, same-direction pickup, opposite passed, starvation
bound (seeded PRNG), repeat call keeps its place, cancel, retarget, `setStops` lost and moved y, dt 0.05 vs 0.1.
Gate: break FIFO, break CAP → red.

**S2 · `ui/column.js`.** Blocked by: none.
`columnOf`, `layoutColumn`, `columnRoute`, `floorAt`, `maxDeptFloors`, `columnScale` (the one writer of the S/M/L drop
`fit` and `stripwin` both read). Canonical x with the screen edge at 0, right side mirrored.
Test (`ui/column.test.mjs`): floor ys, add/remove moves only the floors below, right mirrors x, one floor per
department, pitch bounds, overflow, routes with one lift waypoint, nap via the recaff, entry off-screen outside.

**S3 · View, settings, markup.** Blocked by: none.
`view.column`, `setView('vstrip')`; `settings.stripSide` ('right' default); Settings: "Desktop column" option and a
"Column side" row; CSS `html.vstrip` (stage pinned to the outer edge, panels beside it).
Test: `view.test.mjs`, `settings.test.mjs`.

**S4 · The cast rides.** Blocked by: S1, S2.
`Cast.lift` when `H.column`; `step` first in `update`; lift waypoints call, queue, board, ride, alight; retarget,
cancel; `floorsKey` change shifts the actors on moved floors; `settle()` on entry; adepts never ride.
Test (`ui/column.test.mjs`): arrive → call → board → alight → sit; a petition mid-ride retargets; a floor move shifts a
seated actor; settle; adepts never call.

**S5 · The window (Rust).** Blocked by: none.
`Side`, `Shape`, `SHAPE: Mutex<Shape>` (replaces `HEIGHT`), `column_rect`, `replace(w, shape)`, `enter`, `place_strip`
= `enter(Bar)`, `place_column`; registered in `main.rs`. Test: `column_rect` both sides, taskbar same/opposite side,
auto-hide side/top/bottom, negative-offset monitor, `Shape` replay; the bar tests unchanged.
Check: `cargo test`, `cargo clippy --tests -- -D warnings`.

**S6 · `stripwin.js` + wiring.** Blocked by: S3, S4, S5.
Enter the column through `place_column`; strip ↔ column switch direct with `ON` still true; `growStrip` widens the
column; tray item to `adm.stripKind`. `app.js` (`columnOf`/`layoutColumn` on `view.column`), `viewport.js fit`,
`overlay.js` (plaque and usage banner y from `H`), `scene.js drawColumnProps` (no gate in the column).
Check: every `node ui/*.test.mjs` (flathall hashes unchanged).

**S7 · Art.** Blocked by: S6.
`tools/lift_art.mjs` + `tools/lift_art/{kit,tier2,cyber,orbital,tower,vault,darwin}.mjs`, 12 frames a world, each a new
design; `'lift'` in `PROP_SHEETS` and the five worlds' `art`; catalog rows after HONOURS (earlier rows unchanged:
`sprite_sheet.mjs --list` before and after). Test (`ui/art.test.mjs`): lift in 6 worlds, same sizes, own silhouette.
Check: `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, galleries regenerated, `node tools/art_gate.mjs`.

**S8 · Docs + proof.** Blocked by: S7.
README (the Desktop column), `docs/DEVELOPMENT.md` (modules, tests); screenshots of the column in the 6 worlds and the
car with riders.

## Milestone check
`cargo test`, `cargo clippy --tests -- -D warnings`, every `node ui/*.test.mjs`, `node tools/art_gate.mjs`.
