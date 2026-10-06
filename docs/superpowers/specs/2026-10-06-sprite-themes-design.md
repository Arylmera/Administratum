# Sprites and themes: review, cost, plan

Date: 2026-10-06. Status: phases 1 to 3 done (themes, picker, chrome, wording, per-theme art, a cyberpunk theme); every sprite and the room's structure are art files with their anchors.

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
3. Maps are hand-edited strings. There is no picture of the whole set, and the art can't be drawn in a pixel editor.
   **Gallery added in phase 1. All sprites are art files now: see "Art files".**
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
- `tools/sprite_sheet.mjs` renders every sprite and variant (65 images) to `docs/sprites/` with a gallery page.

## Art files (common practice)

Text maps in code are typical of tiny projects and game jams. Most 2D pixel-art games keep sprites as image files
drawn in an editor (Aseprite, Piskel), exported as a sprite sheet plus JSON (frame rects, anchors). Palette swaps are
done by remapping an indexed palette at load time, and effects (sparks, smoke, flicker) stay in code. This project
now follows that: `ui/sprites.js` went from 1,286 lines of text maps to about 80 lines that load 13 sheets.

- **Source**: `ui/art/<family>.png`, a sprite sheet, and `ui/art/<family>.json`, Aseprite-style json-hash with frame
  rects and `meta.anchors` (art px from a frame's top-left).
- **Key palette** `ui/art/key.gpl`: one colour per palette slot, to load in the editor. Slots that share a colour
  in Tier II (the rank markers share the robe's reds, the optic shares the phosphor) are nudged by one or two steps
  of blue. They look the same, but the loader can tell them apart, so themes still recolour every slot. The key
  never changes once art depends on it.
- **Loading**: `ui/art.js` reads the sheet at startup, using `ui/png.js` (decodes 8-bit RGBA/RGB and 1–8-bit
  indexed PNGs, with no canvas, so the node tests use it too). Each frame becomes the same text rows the maps use,
  so the sprite cache and themes are unchanged. A pixel outside the key palette, or half transparent, fails loudly
  with the file and pixel.
- **Anchors**: the characters' anchors moved from `actors.js` into their JSON: the scribe's feet, arms and
  scroll (`SCRIBE_AT`), the adept's feet (`ADEPT_AT`), and the Magos's drill-arm pivot, chest screen and optics
  (`MAGOS_AT`). The props' anchors moved from `scene.js` into theirs (`PROP_AT`):
  - desks, lecterns, consoles: screen, test lamp, seal slots, candle, slate, shadow, paper origin and spread,
    background cog, puff
  - cogitator: centre screen, side screens, lamp row, data reels, vents
  - gate: entry point, opening, leaves, slide
  - servo-skull: centre, carried sheet, searchlight

  Effects drawn in code (the held scroll, the Zs) keep their offsets in code.
- **Sheets**, one per discussion family:
  - characters: `scribe` (12 walk frames and the arm), `adept` (walk frames); left frames and the left arm are
    mirrored at load
  - `magos`: the Magos on the throne as two frames, the body and the drill forearm that swings. The code used to cut
    the arm out of a single sprite at "art columns 0..9", so a redraw could not move it; now the arm is its own frame
    with its own anchor
  - props: `workstations`, `cogitator`, `sanctum`, `gate` (with the void beyond it), `refectorium`, `walls`,
    `clutter`, `skull`, `petitions`, `fire`
  - room: `room-floor`, `room-walls`, `room-pipes`, `room-doors` (see "Room tiles")

  `node tools/map_to_art.mjs <family|all>` repacks them, to regroup or add a family.
  - Verification:
  - Every frame loaded from the sheets is identical to the old text map (checked once at conversion).
  - `ui/art.test.mjs` checks:
    - the decoder against every PNG filter, RGB/RGBA and indexed 4/8-bit
    - the key palette: unique colours, every slot present, within 4 steps of Tier II
    - the sheets: every sprite has one, no frame name is defined twice, and the characters' anchors
  - With the lighting layer stubbed out, the original commit and this one render the same hall in the browser,
    apart from time-driven animation (CSS pulses, searchlight, skull bob, cogitator waveform).
- **Editing a sprite**:
  1. Open the PNG in Aseprite with `key.gpl` and draw using only key colours.
  2. Export the PNG (indexed or RGBA, no interlacing).
  3. Run the tests.
  4. Regenerate the gallery.

## Room tiles

The room's structure used to be drawn in code (grate, plates, pipes, flanges, coolant, doors, pillars, beacon). It
is now a tileset with roles, so another setting can skin the same room: carpet for the grate, plaster for the plates,
cable trays for the pipes, wooden doors for the iron ones. `ui/room.js` fills rects with tiles. Each tile's JSON
gives its fill rule (`meta.tiles`):

| Fill | Meaning | Tiles |
|---|---|---|
| `repeat` | tiled both ways from the rect's corner; `top`: a different tile for the first row | `floor`, `wall` / `wall east` / `wall sanctum` (+ their `top`), `wall foot`, `wall dark`, `sanctum passage` |
| `repeat-x` / `repeat-y` | a strip along one axis | `pipe h` / `pipe v`, `channel h` / `channel v` (glowing), `sill`, `wall base`, `sanctum base`, `pillar` |
| `nine` | nine-slice: corners kept, edges and centre repeat (`edge` in art px) | `sanctum floor` (the red floor and its brass border) |
| once | drawn as is, placed by its anchors | the four door frames (open/closed), `fitting h/v/wide`, `pilaster`, `beacon on/off/cage` |

- **Where things go stays in `scene.js`** (the layout): a theme changes what the floor, walls and pipes look like,
  not where the rooms are. A completely different floor plan would be a layout change, outside theming.
- **Glow**: `glow` names an ink colour that the tile glows in; `glowPasses` sets the glow's strength (the coolant
  uses 2).
- **Still drawn in code, as theme colours**: the wall weathering (scratches, cracks, binary cant, grime), shadows,
  the beacon's sweep, and all effects (sparks, smoke, steam, seals, lamps, screens). Each is an `ink` colour, so a
  theme can recolour or remove it, for example by setting `cant` to `rgba(0,0,0,0)`.
- **Palette**: 31 room slots added to `key.gpl` and the theme `px`:
  - floor
  - plates and seams for three walls
  - sanctum
  - pillar
  - copper
  - coolant
  - void
  - beacon

  The plate sheen and the lit rivets are **derived** slots: a theme that recolours a wall gets matching sheen.
- **How they were made**: baked once from the old procedural drawing in Chromium, then mapped to slots. Compared to
  the old code with `drawStatic` called directly (deterministic, with and without bays), everything is pixel-identical
  except three things:
  - the coolant glow, which is close: the old code cast three overlapping glows, the tile casts two passes
  - 2 bolt pixels on each bay pilaster (an antialiased blend, snapped to brass)
  - a sliver of rivets at the very bottom of the bay wall

## Cost of themes, by depth

Estimates are focused work for one developer working with Claude sessions. The art direction (choosing colours,
judging the result) is the user's time and is listed separately.

| Depth | What a theme can change | Remaining dev work | Art / design per theme |
|---|---|---|---|
| **A. Palette theme** | Every colour: robes, brass, stone, screens, lights, departments, the page's chrome; and the wording | Done (phase 2) | ~0.5 day per palette (≈40 px + ≈80 ink + 13 light + 8 sash), iterated with the gallery |
| **B. Sprite overrides** | A, plus redrawn sprites with the **same size and anchors** | Phase 3: ~0.5 day, once (per-theme sheets; the art files are done) | Small decor 15–30 min, furniture 1–2 h, cogitator/gate/Magos 2–4 h each, a character set (4 dirs × 3 frames) 4–6 h. A full re-skin is ≈30–50 h of pixel work |
| **C. New geometry** | B, plus sprites with a new size or new anchor points | Done: characters', props' and room tiles' anchors are in their JSON | as B |
| **D. Another setting** | Also the room's look (floor, walls, pipes, doors), the vocabulary, the effects | Room tiles done. Wording done (phase 2). Left: per-theme effect shapes (sparks, steam) only if needed | as B, plus ~25 room tiles (most are small: a 4×4 floor, a 12×10 plate) |

Recommendation: ship A next (cheap, and the foundation is ready). Then B/D per setting: the art is files and
everything the code needs to know about it (anchors, fill rules) is in their JSON, so a new setting is mostly art.

## Phase 2: themes, picker, chrome and wording (done)

- **Five themes** (`ui/themes.js`, previews compared in the app before choosing):
  - *Tier II* (default)
  - *Forge World*: rust plates, orange plasma, amber screens
  - *Ordo Xenos*: black-green robes, silver, teal, cold light
  - *Night Shift*: muted, softer glows
  - *High Contrast*: black outlines, lighter floor, colour-blind-safe departments, no weathering
- **Picker**:
  - in Settings → Hall → Theme, stored as `adm.theme`, with no Rust change for the setting itself
  - applied before the first draw
  - the remote view keeps its own choice, like scale and lighting
  - Reset returns to Tier II
- **Chrome**: `index.html` has no colour literals left except the startup error box.
  - About 45 CSS variables are named by role in `:root`: header, petitions and alarms, labels, parchment, scroll rods.
    Translucent tints are `color-mix()` of the same variable.
  - A theme's `ui` part overrides any of them. `app.js` applies them and the browser `theme-color`, and clears them when
    switching back.
  - The stale-petition alarm stays red in every theme on purpose.
- **Wording** (`TEXT` in `theme.js`, a theme's `text` part, `t(key, vars)`):
  - rank names, statuses, petitions and questions (singular/plural pairs), the overflow plaque, the empty hall
  - the Chronicon and its event names, the Tithe, Settings labels, and the Windows toasts
  - `index.html` marks its texts with `data-t`, `data-t-title` and `data-t-aria`
  - **Toasts**: `src-tauri/src/toast.rs` holds the toast templates; `app.js` pushes them with `set_toast_text` on start
    and on a theme change. An empty or over-long template keeps Tier II's.
  - Forge World and Ordo Xenos have their own subtitle and motto.
  - For a non-40k setting: a theme with `text: { rank: { high: 'Director', standard: 'Engineer', novice: 'Intern' },
    petitions: ['{n} request', '{n} requests'], status: { napping: 'Idle · in the break room' }, log: { title: 'Logbook' }, … }`.
- **Tests**:
  - every theme's `ui` keys are `:root` variables
  - every text key the page or code asks for exists, and a theme's `text` has no unknown keys
  - plurals, placeholders and the fallback
  - Rust: the toast templates and their fallbacks

## Phase 3: per-theme art (done) and a first non-40k theme

- **Theme art**:
  - A theme lists the art families it redraws (`art: ['walls', …]`). Its sheets live in
    `ui/art/<theme>/<family>.png` + `.json` and hold only the frames it changes, at the default's size. Anchors and
    tile fill rules it lists replace the default's; everything else falls back to the default art.
  - `sprites.js` loads every theme's art at start and refills `MAPS`, `ROOM`, `SCRIBE`, `ADEPT`, `MAGOS` and the
    anchors in place on a theme change. `scene.js` rebuilds the anchors it keeps (desks, paper, skull), and the paper
    piles are laid out again.
  - The gallery renders any theme with its art (`node tools/sprite_sheet.mjs --theme cyber` → `docs/sprites/cyber/`).
  - `tools/sheet_writer.mjs` writes a sheet (shared with `tools/map_to_art.mjs`).
- **Neon Grid** (`cyber`), the first setting that is not the 40k scriptorium:
  - Palette: neon magenta, cyan and violet on blue-black.
    - hooded robes read as black hoodies with neon trim, optics as visors
    - chrome cyan instead of brass, magenta neon tubes for the copper pipes, violet light in the floor channels
    - dark glass panels instead of parchment
  - Wording: Netrunner / Hacker / Script kiddie, requests, the server rack, the lounge, the Netlog, Bandwidth, and
    "Request from …" toasts.
  - Its art (`ui/art/cyber/`) replaces everything that read as 40k:
    - the skull banners → neon signs
    - the censers → neon lanterns
    - the gothic windows → a skyline window
    - the Cog Mechanicus → a hex-chip emblem
    - the servo-skull → a drone
    - the grand gate and its spires → a tagged roll-up shutter between a vertical neon sign and a camera pylon
    - the room doors → sliding doors with hazard tips, a neon seam and a red / cyan status lamp
    - the cogitator's skull → a faceplate
    - the throne's skull → a headrest; the lord desk's purity seals → a holo-chip
    - the desks → battlestations (glass tower with fans, two screens, backlit keyboard, energy drink); the lectern →
      a compact one with a router; the console → a cyberdeck on a pole
    - the candle clusters → neon tubes; the braziers → oil drums
    - the petition scrolls → datapads, the raised scroll → a tablet
    - the commit purity seals → holo-stickers, the wax stamp → a scanner
  - The characters are drawn from scratch (not recoloured 40k shapes):
    - scribes → hackers: spiky hair in the department colour (`y`), a visor in the rank colour (`t`: cyan
      netrunner, magenta hacker, grey shades for the script kiddie), open jacket with neon piping, a bolt on the
      back, jeans and sneakers; the desk arms are sleeves with fingerless gloves
    - adepts → AI daemons: a cyan hologram over a projector puck, the rank in its ring light and chest core
      (gold, magenta, grey)
    - the Magos → the fixer: silver hair, chrome jaw, magenta optics, a trench coat with neon lining, a chest
      implant screen; the swinging limb is a cyber-arm with a folded mantis blade
    - faces and hands use two palette slots added for them, skin `:` and skin shadow `;`
  - The commit seals, the stamp and the raised scroll were code-drawn; they are now art (`ui/art/commits.png`,
    `SCROLL_HELD` in `petitions.png`) so a theme can redraw them, at the same pixels for Tier II.
- **Tests**:
  - a theme's art is only families it declares, at the default's sizes, with known anchors
  - switching swaps the art in and back
  - live, Tier II → Neon Grid → Tier II returns to the same pixels as a fresh Tier II
- **Next art for any setting**:
  1. Discuss it in its issue.
  2. Draw it in Aseprite with `key.gpl`.
  3. Save it under `ui/art/<theme>/`, run the tests and regenerate that theme's gallery.
  4. Open a PR: the PNG diff is the review.

## Discussing sprites

Recommended: **one GitHub issue per sprite or sprite family, backed by the generated gallery.**

- `docs/sprites/README.md` is the visual reference. Every sprite has an id (`COGITATOR`, `SCRIBE.high.left`,
  `WINDOW.night`...) and an anchor, so a comment can link straight to it. Regenerate it with
  `node tools/sprite_sheet.mjs` after any art or palette change.
- `tools/sprites.html` is the live viewer for working sessions: every sprite in every theme side by side, read
  straight from `ui/art/` (no generation step), walk cycles animated, zoom, pixel grid, backgrounds, a filter, and
  "dim same-as-default art" to spot what a theme really changes. Each family links to its issue, each sprite to a
  prefilled new Sprite issue. Serve the repo root (`python -m http.server 8123`) and open
  `http://localhost:8123/tools/sprites.html`; edit an art file, press R. It and the gallery list the same sprites
  (`tools/sprite_catalog.mjs`).
- `.github/ISSUE_TEMPLATE/sprite.yml` ("Sprite" in *New issue*) asks for the sprite id, the theme, the kind of
  change (recolour / same-size redraw / new geometry / new sprite / glitch), the rationale and references. Images
  can be pasted. It applies the `sprite` label, which you need to create once in the repo settings.
- Track them on a pinned "Sprite board" issue, or on a GitHub Project with Proposed → Agreed → In progress → Done.
  Each art PR closes its issue, and the PNG diff in the PR is the review.
- Why issues rather than the alternatives:
  - *GitHub Discussions*: no states, and they don't close from a PR.
  - *A shared web page with comments*: nice on a phone, but it lives outside the repo and isn't tied to commits.
  - *One big thread*: you can't follow a single sprite in it.

Suggested starting set: 18 issues by family, not 96.

| Issue | Sprites |
|---|---|
| Scribe | `SCRIBE.*`, `SCRIBE.sashes`, `ARM`, `ARM_L` |
| Adept | `ADEPT.*` |
| Workstations | `DESK`, `LECTERN`, `CONSOLE` (lit/unlit) |
| Cogitator bank | `COGITATOR` + its animated screens (procedural) |
| Magos | `MAGOS` (body + drill arm) |
| Sanctum | `THRONE`, `LORD_DESK`, `COG_MECH`, `SEAL` |
| Grand gate | `GATE`, `GATE_L`, `GATE_R` + the void (procedural) |
| Refectorium | `RECAFF`, `TABLE`, `BENCH` |
| Walls | `WINDOW` (day/night), `BANNER`, `SHELF`, `GAUGE`, `CENSER` |
| Floor clutter | `PAPER_STACK`, `SCROLL_PILE`, `BOOKS`, `LOOSE_A`, `LOOSE_B`, `CRATE` |
| Servo-skull | `SKULL`, `SKULL.alarm` |
| Petitions | `SCROLL`, `QSCROLL` |
| Fire and light | `BRAZIER`, `CANDLES` |
| Room: floor | `floor`, `channel h/v`, `sanctum floor`, `sanctum passage`, `sill` |
| Room: walls | `wall`, `wall east`, `wall sanctum` (+ tops), `wall foot`, `wall dark`, `wall base`, `sanctum base`, `pillar`, `pilaster` |
| Room: pipes | `pipe h/v`, `fitting h/v/wide` |
| Room: doors and alarm | the four door frames, `beacon on/off/cage` |
| Effects (code) | wall weathering, seals and stamp, test lamp, paper sheets, sparks, smoke, steam |
