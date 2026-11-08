# Hall of Honours (O8)

**Goal.** A wall plaque in the hall that keeps the past 7 days' honours, per department, drawn in each world's
style.

**Size.** Project, art-heavy.

## Decision ledger

1. **Four marks.** Most commits (purity seals), the longest single task (turn duration), the most petitions
   answered within 1 min, and the busiest day by working time.
2. **Holder.** A department (a session ends; a department stays). Each mark shows the department name and the value.
3. **Period.** A rolling 7 days, today included: the Chronicon's retention.
4. **Art.** A new `HONOURS` family: a new design for each world, flat and 39° (12 drawings), drawn from scratch per
   the "new worlds, new designs" rule — never a recoloured 40k plaque. The text is drawn by code over the art.
5. **Click.** A click on the plaque opens the Chronicon's Week tab.
6. **Place.** **Open — my call for v1:** on a back wall free of queue slots (`layout.test.mjs` rules), a
   `propsOf` slot in place of one hanging, in both views; the exact slot is chosen while drawing.
7. **Strip view.** Not shown in the desktop strip (no room).

## Builder-check corrections (supersede the ledger and design where they differ)

- **Computed in Rust (reverses my JS call).** The UI fetches events for one day only, so one new backend command
  `honours` beside `report.rs` reads the 7 day files and returns the four marks; the remote view gets a read route.
- **Longest task (my call).** No per-turn max exists today (`task-done` fires only ≥ 5 min, with a text detail).
  The Tithe gains `max_turn_ms` per department (added field; old files read as 0).
- **Fast answers (my call).** A `petition` → `petition-answered` pair in the same session within 60 s, measured on
  poll ticks (± one poll accepted). A second `petition` without an answer restarts the clock; a session that leaves
  while waiting does not count. Tests use 50 s vs 70 s, not 59 vs 61.
- **Busiest day (my call).** One record: department, date, working time. Ties on any mark: the latest wins.
- **Drawings (answered by the shared face-based art).** 6 designs, one per world, used by both views (39° draws the
  flat frame as a wall decal, `isohall.js:173`). A variant theme with its own art set redraws it only if it already
  redraws its wall hangings; others take its world's design in their palette.
- **Text.** DOM overlay like every hall label (`overlay.js`), kept flat (unskewed) in 39°.
- **Size and slot (user, 2026-11-08).** An alcove (40 px wide, `scene.js:46-48, 85-87`). Alcoves exist only in a
  wide hall, so a narrow hall shows no plaque: accepted. The Chronicon's Week tab stays the way in there.

## Design

- **Data.** A pure function `honours(days: &[DayEvents + Tithe]) -> [Mark; 4]` (JS, from the Chronicon day data the
  UI already fetches; or Rust beside `report.rs` if the remote view needs it — **my call: JS**, the remote hall
  fetches the same days). Commits: `commit` events by dept. Longest task: the longest turn (the `long` task event's
  duration, or the turn data in the day report). Fast answers: `petition` → `petition-answered` pairs per session
  under 60 s. Busiest day: max `busy_ms` per dept per day.
- **Refresh.** Recomputed at start, at midnight, and on each new `commit` / `petition-answered` event.
- **Render.** `scene.js` / `scene39.js` draw the prop; a text pass writes the four lines in the theme's wording
  (each world names the marks: *Honours of the Week* / *Leaderboard* / …, in `themes.js`). Empty marks show `—`.
- **Testing.** `honours` unit tests (ties broken by the latest event, empty week, a 59 s vs 61 s answer). Art:
  `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, the galleries regenerated, `layout.test.mjs` (no queue slot
  covered). Look at it in `tools/sprites.html` and the hall for every world, both views.
- **Docs.** README *What it shows*, `tools/sprite_catalog.mjs` entry, `docs/sprites/` galleries.
