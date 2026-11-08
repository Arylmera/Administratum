# Hall of Honours (O8)

**Goal.** A plaque in a hall alcove that keeps the past 7 days' honours, per department, drawn in each world's
style.

**Size.** Project, art-heavy.

## Decision ledger (agreed 2026-11-08; builder check applied)

1. **Four marks.** Most commits (purity seals); the longest single task; the most petitions answered within 1 min;
   the busiest day by working time.
2. **Holder.** A department. Each mark shows the department name and the value; the busiest day also its date.
   Ties on any mark: the latest wins. An empty mark shows `—`.
3. **Period.** A rolling 7 days, today included (the Chronicon's retention).
4. **Computed in Rust.** A new command `honours` beside `chronicle/report.rs` reads the 7 day files and returns the
   four marks; the remote view gets a read route `GET /api/honours` (no paths in it).
5. **Longest task.** The Tithe gains `max_turn_ms` per department (`Share`), filled where turn durations are already
   collected (`chronicle/mod.rs:324`). `#[serde(default)]`: an old day file loads unchanged, reads as 0.
6. **Fast answers.** A `petition` → `petition-answered` pair in the same session within 60 s, on poll ticks (± one
   poll). A second `petition` without an answer restarts the clock; a session that leaves while waiting does not
   count.
7. **Art.** A new `HONOURS` family: 6 designs, one per world, new from scratch (never a recoloured 40k plaque), used
   by both views (39° draws the flat frame as a wall decal, `isohall.js:173`). A variant theme with its own art set
   redraws it only if it already redraws its wall hangings; others take its world's design in their palette.
8. **Place (user).** An alcove (40 px wide, `scene.js:46-48, 85-87`). Alcoves exist only in a wide hall, so a narrow
   hall shows no plaque: accepted.
9. **Text.** A DOM overlay like every hall label (`overlay.js`), kept flat (unskewed) in 39°, in the theme's wording
   (each world names the plaque in `themes.js`: *Honours of the Week*, *Leaderboard*, …).
10. **Click.** Opens the Chronicon on its Week tab.
11. **Strip.** Not shown in the desktop strip.

## Design

- **Refresh.** At start, at midnight, and on each new `commit` / `petition-answered` event (UI asks `honours` again).
- **Render.** `scene.js` / `scene39.js` draw the prop in the first alcove when one exists; `overlay.js` places the
  four lines over it.
- **Testing.** `honours` (Rust): ties, an empty week, a 50 s vs 70 s answer, a re-asked petition, a session that
  leaves while waiting, max_turn per dept. Compatibility: a current-format `.tithe.json` fixture (no
  `max_turn_ms`) loads with its totals unchanged. Art: `node ui/art.test.mjs`, `node ui/sprites.test.mjs`,
  `ui/layout.test.mjs` (no queue slot covered), galleries regenerated (`node tools/sprite_sheet.mjs` and `--theme`
  for each theme with its own art). Visual check in `tools/sprites.html` and the hall, every world, both views.
- **Docs.** README *What it shows*, `tools/sprite_catalog.mjs` entry, `docs/sprites/` galleries,
  `docs/remote-api.md` (`/api/honours`).
