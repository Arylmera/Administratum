# Sprites and themes: review, cost, plan

Date: 2026-10-06. Status: phase 1 done (this branch), phases 2 to 4 proposed.

## How sprites work today

- **Pixel maps as strings** (`ui/sprites.js`). Each sprite is an array of rows; each char is a palette entry, `.` is
  transparent. Maps are "HD": 2 art px per logical px (`RES = 2`). There are 33 decor maps (`MAPS`) and two
  characters with 4 directions × 3 walk frames (`SCRIBE`, `ADEPT`). Left frames are mirrors of right frames, and walk
  frames swap only the feet rows.
- **One palette, one char per colour.** 38 chars are in use (`BASE`). Some are *materials* (brass `g/G/h`, iron
  `m/M/l`, parchment `p/P`). Others are *slots* that variants recolour: robe `r/R/d`, sash `y`, and the rank markers
  `t T z j J I`, which are robe-coloured by default and gilded for a Magos.
- **Variants are palette overrides**, not new art: rank (`RANK`), department sash (`SASH`), lit/unlit desk, day/night
  window, red-eyed skull. `sprite(map, over)` rasterises once per (map, override) and caches the canvas.
- **About half of what you see is not a sprite.** `scene.js` draws the floor grate, wall plates, pipes, flanges,
  coolant, doors, gate void, beacon, seals, stamp, test lamps, paper piles, sparks, smoke and the animated cogitator
  screens with `fillRect`. Before this branch that was 206 hex and 27 `rgba()` literals. `actors.js` (held scroll,
  Zs), `lighting.js` (night tint, beams) and `app.js` (backdrop tile) had more.
- **Code depends on the art's geometry**: feet at `(x-8, y-17)`, the arm at `fx+14`, the Magos's drill arm in art
  columns 0..9, desk screen/lamp/seal offsets (`DESK_AT`...), the cogitator screens at `149,15.5`..., the gate opening
  `16×22` at `+8,+5`. `sprites.test.mjs` pins every map's size.

### Strengths
- Palette-indexed art makes recolouring nearly free, and the sprite cache makes variants cheap at runtime.
- No image assets or build step. Maps diff well in git, and the tests check dimensions, chars and symmetry.

### Weak spots (for theming and for working on the art)
1. Colours in the procedural drawing were hard-coded, and most duplicated palette entries by value
   (122 of the 206 hex literals in `scene.js`). Recolouring brass meant editing dozens of lines. **Fixed in phase 1.**
2. Nothing could change the palette at runtime: the caches (sprites, static background, paper piles, lights, robes)
   had no invalidation. **Fixed in phase 1.**
3. Maps are hand-edited strings. There is no picture of the whole set and no import from a pixel editor.
   **Gallery added in phase 1. Import tool in phase 3.**
4. The single-char palette is nearly full: 13 letters left (`A D E H K N S U V X Y Z i`), plus digits and symbols.
   That is fine for palette themes, but new materials will need digits or a second scheme.
5. The HTML chrome (`index.html` CSS: 143 hex / 18 rgba, only 8 CSS variables; `chronicon.js` icon palette) is
   outside the canvas and outside the theme. **Phase 2.**
6. The setting is baked into text (Magos, Tech-priest, petitions, "in the stacks", the header subtitle). This
   matters only for a non-40k theme. **Phase 4.**

## Phase 1: theme foundation (done, this branch)

- `ui/theme.js` holds every colour the hall is drawn with, split into `px` (map palette), `sash`, `rank`, `ink`
  (named colours drawn in code) and `light` (glows, night tint, window beams). `ink` entries made of the same
  material as a map char are derived from `px`, so a theme that changes brass in `px` changes the pipes too.
  A theme lists only what it changes from Tier II (`defineTheme`, `resolve`).
- `setTheme(id)` switches at runtime. `onTheme` listeners drop the caches, and `themed()` rebuilds override objects
  once per theme so the sprite cache can still find them by identity.
- `scene.js`, `actors.js`, `lighting.js` and `app.js` have no colour literals left. The default theme reproduces the
  old values exactly.
- Verification:
  - `ui/theme.test.mjs` checks completeness for every registered theme, inheritance, and the runtime switch.
  - A headless-Chromium harness (frozen clock, seeded randomness, mocked backend with a fixed roster) compared the
    app before and after the refactor. It is **pixel-identical** outside animation noise (light flicker, cogitator
    screens, bobbing skulls), which covers about 92 % of each frame.
  - The harness also switched to an inverted-colour theme and back. Everything on the canvas recoloured, and the
    return trip matched the baseline.
- `tools/sprite_sheet.mjs` renders every sprite and variant (64 images) to `docs/sprites/` with a gallery page.

## Cost of themes, by depth

Estimates are focused work for one developer working with Claude sessions. The art direction (choosing colours,
judging the result) is the user's time and is listed separately.

| Depth | What a theme can change | Remaining dev work | Art / design per theme |
|---|---|---|---|
| **A. Palette theme** | Every colour: robes, brass, stone, screens, lights, departments | Phase 2: ~0.5–1 day, once | ~0.5 day per palette (≈40 px + ≈80 ink + 13 light + 8 sash), iterated with the gallery |
| **B. Sprite overrides** | A, plus redrawn sprites with the **same size and anchors** | Phase 3: ~1–1.5 days, once | Small decor 15–30 min, furniture 1–2 h, cogitator/gate/Magos 2–4 h each, a character set (4 dirs × 3 frames) 4–6 h. A full re-skin is ≈30–50 h of pixel work |
| **C. New geometry** | B, plus sprites with a new size or new anchor points | +1–2 days, once (move hard-coded offsets into per-sprite metadata) | as B |
| **D. Another setting** | Also the procedural pieces' shapes, the animations and the vocabulary | +3–5 days (theme-provided draw hooks or maps for pipes/grate/doors/beacon; theme text) | as B, plus the procedural art |

Recommendation: ship A next (cheap, and the foundation is ready). Do B one sprite at a time through the discussion
issues. Leave C and D until a concrete theme needs them.

## Phase 2: first alternative palette + picker (proposed)

1. **Picker**: an "Appearance" row in Settings with a theme dropdown, stored as `adm.theme`. `settings.js` already
   persists any `adm.*` key to `settings.json`, so the Rust side needs no change. Apply `setTheme` before the first
   static draw. The remote view inherits the PC's theme. (~1–2 h)
2. **HTML chrome**: move the `index.html` colours to CSS variables, add a `ui` part to themes (applied with
   `documentElement.style.setProperty`), and move `chronicon.js` `PAL` into the theme. (~2–3 h)
3. **Palette tooling**: export a theme's `px` as a GIMP/Aseprite `.gpl` palette from `tools/sprite_sheet.mjs`, and
   render the gallery for any theme (`--theme <id>` already works). (~30 min)
4. **A first palette**, chosen by you. Candidates that reuse the art as is:
   - *Forge World* (cooler iron, orange plasma)
   - *Ordo Xenos* (green/black)
   - *Night shift* (low-glare, dim)
   - *High contrast* (accessibility: stronger outlines, colour-blind-safe sash set)

## Phase 3: per-theme sprite art (proposed)

1. Themes get `maps: { NAME: [...rows] }` overrides (and `scribe` / `adept` frame sets). `MAPS` becomes a stable
   object refilled on a theme change, like `T.ink`. The drawing code already reads `MAPS.X` at draw time.
   Tests require an override to keep the original size unless the sprite declares new anchors (phase C).
2. `tools/png_to_map.mjs`: import a PNG drawn in Aseprite/Piskel with the exported palette and turn it into map rows
   (nearest palette colour, error on unknown colours). That removes hand-typing strings and makes outside art usable.
3. Per sprite, the work is: discuss it in its issue, draw it, import it, regenerate the gallery, and open a PR. Because
   the PNGs are committed, the PR shows the before/after as a GitHub image diff.

## Discussing sprites

Recommended: **one GitHub issue per sprite or sprite family, backed by the generated gallery.**

- `docs/sprites/README.md` is the visual reference. Every sprite has an id (`COGITATOR`, `SCRIBE.high.left`,
  `WINDOW.night`...) and an anchor, so a comment can link straight to it. Regenerate it with
  `node tools/sprite_sheet.mjs` after any art or palette change.
- `.github/ISSUE_TEMPLATE/sprite.yml` ("Sprite" in *New issue*) asks for the sprite id, the theme, the kind of
  change (recolour / same-size redraw / new geometry / new sprite / glitch), the rationale and references. Images
  can be pasted. It applies the `sprite` label, which you need to create once in the repo settings.
- Track them on a pinned "Sprite board" issue, or on a GitHub Project with Proposed → Agreed → In progress → Done.
  Each art PR closes its issue, and the PNG diff in the PR is the review.
- Why issues rather than the alternatives:
  - *GitHub Discussions*: no states, and they don't close from a PR.
  - *A shared web page with comments*: nice on a phone, but it lives outside the repo and isn't tied to commits.
  - *One big thread*: you can't follow a single sprite in it.

Suggested starting set: 13 issues by family, not 64.

| Issue | Sprites |
|---|---|
| Scribe | `SCRIBE.*`, `SCRIBE.sashes`, `ARM`, `ARM_L` |
| Adept | `ADEPT.*` |
| Workstations | `DESK`, `LECTERN`, `CONSOLE` (lit/unlit) |
| Cogitator bank | `COGITATOR` + its animated screens (procedural) |
| Sanctum | `THRONE`, `MAGOS`, `LORD_DESK`, `COG_MECH`, `SEAL` |
| Grand gate | `GATE`, `GATE_L`, `GATE_R` + the void (procedural) |
| Refectorium | `RECAFF`, `TABLE`, `BENCH` |
| Walls | `WINDOW` (day/night), `BANNER`, `SHELF`, `GAUGE`, `CENSER` |
| Floor clutter | `PAPER_STACK`, `SCROLL_PILE`, `BOOKS`, `LOOSE_A`, `LOOSE_B`, `CRATE` |
| Servo-skull | `SKULL`, `SKULL.alarm` |
| Petitions | `SCROLL`, `QSCROLL` |
| Fire and light | `BRAZIER`, `CANDLES` |
| Procedural art | grate, plates, pipes, coolant, doors, beacon, seals/stamp, test lamp, paper sheets, sparks |
