# Breaking Bad World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a new world, Breaking Bad (`world: 'breakingbad'`, theme `breakingbad`, name `Breaking Bad`): a flat,
light superlab with hazmat cooks, Gale as the assistant, Heisenberg on the high seat, at the full depth of Darwin
(Flat and 39°, break-out room, Night Vigil, Suzerain).

**Architecture:** no engine change. `WORLDS` entry in `ui/theme.js`, one `defineTheme` appended after `darwin` in
`ui/themes.js`, art in `ui/art/breakingbad/<family>.png` + `.json`, generators in
`tools/watch_art/breakingbad.mjs`, `tools/breakout_art/breakingbad.mjs`, `tools/suzerain_art/breakingbad.mjs`.

**Tech Stack:** plain ES modules, Node test scripts, `tools/sheet_writer.mjs`, the sprite viewer.

**Spec:** `docs/superpowers/specs/2026-11-08-breaking-bad-design.md` (outranks this plan where they conflict).

## Global Constraints

- The "Shared recipe: drawing an art family" of `docs/superpowers/plans/2026-10-06-three-worlds.md` applies, with:
  generator scripts in this session's scratchpad (`<scratchpad>/draw/breakingbad-<family>.mjs`), importing
  `tools/sheet_writer.mjs` by its path in this worktree; the look step reloads `tools/sprites.html` on column O.
- Worktree `/home/chris/orca/workspaces/administratum/theme-new`, branch `theme-new`. **No merges, ever**: history is
  linear, rebased onto `main` later. **No push** unless the user asks.
- Commit subjects `Breaking Bad: <what>`, one line; no Claude trailers, no version bump; docs in the same commit.
- Style: flat fills, one outline colour `k`, no shading, no dithering, no texture. Every shadow slot a family uses
  is set equal to its fill in `px` (e.g. `P` = `p`, `G` = `g`, `W` = `w`, `M` = `m`, `B` = `b`, `Q` = `q`, `R` = `r`, `d` = `r`).
- Room: one-colour floor, one-colour wall, a baseboard; the Br Ba tiles poster is the one decoration.
- Ink texture off: `ink.scratch`, `ink.scratchSheen`, `ink.grime`, `ink.cant` all `'rgba(0,0,0,0)'`.
- Starting palette (spec): outline `#26282b`; wall `#e9edf0`, floor `#c7d0d4`, baseboard `#9aa6ac`; suits yellow
  `#f2c230`, white `#fafafa`, blue (builder picks, a clear mid blue); visor `#2f3a40`; steel `#9aa3a8`; Br Ba green
  `#5f9e5a`; skin `#f0c8a0`; goatee `#7a5230`; blue liquid `#8fd3ff`.
- Wording: the show's language (cook, batch, purity, the lab, Heisenberg). Ranks: high `Cook`, standard `Partner`,
  novice `Assistant`.
- Every sprite a new design; nothing 40k left in a redrawn family. Sizes and anchors as the default art.
- After each art change: `node ui/theme.test.mjs && node ui/art.test.mjs && node ui/sprites.test.mjs`, all `ok`.

## Rank in the visor (decided here, used by Tasks 1 and 2)

Rank is colour only (`T.rank[r].robe` over `px`). The suit is drawn in `r` (flat, `R` = `d` = `r`). The face behind
the visor uses three reserved slots, picked by the builder from key chars `darwin` does not need for this family
(record the choice in this file, Worklog):
- `FACE` (skin), `SPECS` (Walter's glasses and goatee), `HAIR` (Jesse's hair or beanie edge).
- `px`: all three = the visor colour (novice: a dark visor).
- `rank.high.robe`: `r` white; `FACE` skin, `SPECS` dark, `HAIR` skin (bald Walter).
- `rank.standard.robe`: `r` blue; `FACE` skin, `SPECS` skin (no glasses), `HAIR` dark (Jesse).
- `rank.novice.robe`: `r` yellow.
Transparent rank colours do not work (Darwin worklog); never use one.

## Review Focus

- A department colour (`y`, the arm band) on all three suits: no sash may be close to yellow, white or the suit blue.
  Test in Task 1.
- The face reads only walking down or sideways; at the desk (back view) rank must still read by suit colour.
  Checked in Task 2's viewer step on `SCRIBE.high/standard/novice.*`.
- Candles / night mode on a pale room: `light.night` and the glow `light.*` must still dim the hall visibly. Checked
  in the preview at Milestone 2.
- Every `text` key `darwin.text` has must exist for `breakingbad` (no fallback to 40k words). Test in Task 1.
- 39° completeness (`checkComplete39`): the theme only appears in the picker once all 39° families exist (Task 9).

---

## Milestone 1: the theme

### Task 1: theme entry, palette, wording, docs key

**Files:**
- Modify: `ui/theme.js` (`WORLDS`, line ~149), `ui/themes.js` (append after `darwin`), `ui/theme.test.mjs:71` and
  after `:120`, `CLAUDE.md` (cell-ref key), `docs/DEVELOPMENT.md:174`, `tools/watch_art.mjs:8` (`WORLDS`)

**Interfaces:**
- Produces: theme `breakingbad` with `px` incl. the three face slots, `rank.{high,standard,novice}.robe`,
  `rank.*.adept` (Gale's coat trim), `sash`, `ink`, `light`, `ui`, `text`; `art: []` grown by later tasks.

- [ ] **Step 1: Write the failing tests** in `ui/theme.test.mjs`: the theme list at `:71` gains `'breakingbad'`; then
```js
setTheme('breakingbad');
assert.deepEqual(Object.keys(T.text).sort(), Object.keys(THEMES.darwin.text).sort(), 'breakingbad: every text key');
assert.deepEqual(T.text.rank, { high: 'Cook', standard: 'Partner', novice: 'Assistant' });
for (const k of ['scratch', 'scratchSheen', 'grime', 'cant']) assert.equal(T.ink[k], 'rgba(0,0,0,0)', `breakingbad: no ${k}`);
// arm band readable on every suit: each sash differs from every suit colour
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), far = (a, b) => hex(a).reduce((s, v, i) => s + Math.abs(v - hex(b)[i]), 0) > 120;
for (const r of ['high', 'standard', 'novice']) for (const y of T.sash) assert.ok(far(y, T.rank[r].robe.r), `sash ${y} vs ${r} suit`);
```
(adapt to how the file reads `THEMES`/`T`; if `T.text` holds keys beyond the theme's own, compare the theme objects.)
- [ ] **Step 2:** `node ui/theme.test.mjs` → FAIL (unknown theme).
- [ ] **Step 3:** `WORLDS` gains `breakingbad: 'Breaking Bad'`; `defineTheme({ id: 'breakingbad', world: 'breakingbad',
  name: 'Breaking Bad', art: [], px, sash, rank, ink, light, ui, text })` with every key `darwin` sets, values from
  Global Constraints and "Rank in the visor". `ui` light and flat (pale bars, dark ink); `text` drafted in the show's
  language for every key (`subtitle`, `motto`, `breakout`, `watch`, `status`, `petitions`, `log`, `tithe`, `event`,
  `prefs`, `limitLabel`, `toast`…), e.g. motto `Say my name`, breakout `The Yard`, watch name `Mike`.
- [ ] **Step 4:** `node ui/theme.test.mjs && node ui/art.test.mjs && node ui/sprites.test.mjs` → all `ok`.
- [ ] **Step 5:** docs: `node tools/sprite_sheet.mjs --list | head -16` shows column O `Breaking Bad`; CLAUDE.md key
  gains `O Breaking Bad`; DEVELOPMENT.md:174 list gains `breakingbad`.
- [ ] **Step 6: Commit** `Breaking Bad: a flat superlab theme (palette, chrome, wording)`.

## Milestone 2: the look (stop for the user after Task 4)

Each task: the Shared recipe per family, then register in `art`, tests `ok`, viewer screenshot of column O, commit.

### Task 2: `scribe`, `adept`
Hazmat cook: hood, visor with the three face slots, respirator, flat suit in `r`, department arm band `y`; `arm`
frame a gloved arm. Gale: smaller, white lab coat, glasses, dark hair, kind glyph on a coat badge (front and back);
coat trim recoloured by `rank.*.adept`. Viewer: `SCRIBE.high/standard/novice.down` show Walter / Jesse / dark visor,
`.up` shows white / blue / yellow backs.
- [ ] Drawn, registered, tests `ok`, screenshot; commit `Breaking Bad: hazmat cooks and Gale`.

### Task 3: room tiles `room-floor`, `room-walls`, `room-doors`, `room-pipes`
One-colour floor (every floor frame, incl. `floor vent`, `floor bolts`, `sanctum floor`, plain), one-colour wall,
baseboard; plain steel doors; plain grey pipes; beacon a flat red warning light. Copy the default `meta.tiles`.
- [ ] Drawn, registered, tests `ok`, screenshot; commit `Breaking Bad: flat lab room`.

### Task 4: `workstations`, `walls`
DESK: white lab bench, monitor, Erlenmeyer flask of blue liquid; LECTERN: narrow bench with a scale; CONSOLE: Gale's
fume-hood terminal; SHELL_COG: magnetic stirrer. `walls`: the Br Ba poster in one frame; every other wall prop plain
or a flat shape (windows plain frosted glass; `windowDay`/`windowNight` inks set to match).
- [ ] Drawn, registered, tests `ok`, screenshot; commit `Breaking Bad: lab benches and the Br Ba poster`.
- [ ] **Checkpoint:** preview `tools/preview.html?theme=breakingbad&n=12` (Flat) screenshot, day and candles mode.
  **Stop and show the user.** Continue only on their go; fold their changes into Tasks 2–4 first.

## Milestone 3: the rest of the Flat art

### Task 5: `magos`, `sanctum`
Heisenberg seated: pork-pie hat, sunglasses, goatee, dark jacket; the swinging arm holds his hat brim or a phone.
THRONE plain office chair, LORD_DESK steel desk, COG_MECH and SEAL the Br Ba tile.
- [ ] Drawn, registered, tests `ok`; commit `Breaking Bad: Heisenberg's desk`.

### Task 6: `cogitator`, `skull`, `gate`, `fire`
Steel reactor tank with pipes and a gauge; the fly; industrial laundry entrance; Bunsen flames for braziers and candles.
- [ ] Drawn, registered, tests `ok`; commit `Breaking Bad: reactor, fly, laundry gate, Bunsen flames`.

### Task 7: `clutter`, `petitions`, `commits`, `refectorium`
Papers and clipboards; petition a sealed sample bag with a label (question variant: a big `?` on it); commit seal a
Br Ba stamp; refectorium a Los Pollos Hermanos corner (fryer as dispenser, yellow tables and benches).
- [ ] Drawn, registered, tests `ok`; commit `Breaking Bad: lab clutter, sample bags, Los Pollos break room`.

## Milestone 4: 39°, generators

### Task 8: `breakout`, `watch`, `watch39`, `suzerain`
`tools/breakout_art/breakingbad.mjs` (The Yard: flat concrete, chain-link fence, a plain gate),
`tools/watch_art/breakingbad.mjs` (Mike: flat cap, tan jacket, flashlight on the `light` anchor),
`tools/suzerain_art/breakingbad.mjs` (steel platform, a hose for the cable), each modelled on its `darwin.mjs`
sibling and its `kit.mjs`; run `node tools/breakout_art.mjs breakingbad`, `node tools/watch_art.mjs breakingbad`,
the suzerain generator likewise.
- [ ] Generated, registered, tests `ok`; commit `Breaking Bad: the Yard, Mike, the Suzerain platform`.

### Task 9: `scribe39`, `adept39`, `magos39`, `skull39`, `faces`
The same designs in the 39° sheets (face slots identical); `ui/art/breakingbad/faces.*` for every object this world
redraws (follow `ui/art/darwin/faces.json`). `node ui/faces.test.mjs` `ok`;
`tools/preview.html?theme=breakingbad&n=12&view=39` screenshot; the theme now shows in the Settings picker.
- [ ] Drawn, tests `ok` (incl. `faces.test`); commit `Breaking Bad: the 39° view`.

## Milestone 5: ship

### Task 10: docs and galleries
- [ ] `node tools/sprite_sheet.mjs --theme breakingbad` → `docs/sprites/breakingbad.md` + PNGs; README worlds table
  gains `docs/img/world-breakingbad.png` (hall screenshot) and its caption; spec status `done`.
- [ ] All tests `ok` (`node ui/*.test.mjs`); commit `Breaking Bad: galleries and README`.

## Worklog
Face slots: t skin, T Walter's glasses and goatee, z Jesse's hair (rank slots, scribe only); j g G pinned per rank. Generators: <scratchpad>/draw/kit.mjs + breakingbad-*.mjs. Done: none. Current: none. Next: 1. Blockers: none.
