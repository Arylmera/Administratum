# Breaking Bad: the flat superlab

Status: done (2026-11-08), plan `docs/superpowers/plans/2026-11-08-breaking-bad-world.md`.

A new world for a team that calls itself Breaking Bad, decided with the user on 2026-11-08. It is shown on office
screens in a corporate setting: funny, a little, but readable at a glance and never embarrassing.

## Intent

- **Flat, simple art.** The existing worlds are dense pixel art: shading pairs, textures, patterned floors. This one
  is the opposite: flat fills, one outline colour, no shading, no dithering, no texture. Each sprite keeps only what
  is needed to recognise it. Ligne claire was the starting reference, not a requirement.
- **Same layout.** Sprite sizes, anchors and the scene layout do not change; only what is drawn inside them does.
- **Breaking Bad, recognisable.** Explicit nods are welcome (the team is really called Breaking Bad): hazmat suits,
  Walter, Jesse, Heisenberg, the Br/Ba element tiles. Real-show characters follow the repo's precedent (Warhammer
  40k, Fallout's Vault Boy and Overseer).
- **Anti-goals:** a busy screen; patterned backgrounds (no grid, no tile joints, no floor texture). The show's own
  iconography and vocabulary are in (the user's choice): the blue flask, the sample bag, "cook", "batch", "purity".
- **Wording:** the whole `text` block (subtitle, motto, statuses, petitions, log, toasts, rank names, breakout name)
  speaks the show's language: cook, batch, purity, the lab, Heisenberg. The builder drafts it; the user reviews it in
  the app.

The style was chosen from sketches (`.superpowers/brainstorm/`, `style-v1.html`): characters A, B, D and the flat
clean room.

## Rules of the style

- One outline colour (`k`) around every shape, and between colour areas where it helps reading.
- Flat fills: a shape is one colour. Shadow slots (`P`, `G`, `W`, `M`, `d`, `B`, `Q`…) are not drawn as shading;
  where the key palette forces a shadow slot, the theme sets it equal to its fill.
- No background pattern: the floor is one colour, the wall is one colour, with a baseboard line between them.
- The room has one decoration that says which world it is: the **Br Ba element tiles** poster (two green squares,
  white letters) on the back wall.
- Light and clean: pale wall, light grey floor, white benches. The yellow, blue and white suits stand out against it.

## Cast

| Role (app) | What it shows | Breaking Bad |
| --- | --- | --- |
| scribe, scribe39 | a Claude Code session | a cook in a **hazmat suit**: hood, dark visor, respirator |
| adept, adept39 | a subagent, smaller, at a console | **Gale**, the lab assistant: white lab coat, glasses, dark hair |
| magos, magos39 | the boss on the high seat, receives petitions | **Heisenberg**: black pork-pie hat, sunglasses, dark jacket, goatee |

**Rank** (`rankOf`: Opus/Fable = high, Haiku = novice, others = standard) shows as suit colour **and** who is inside.
Rank is colour only in the code (`T.rank[r].robe` laid over the palette, `actors.js` `robeOf`; there are no per-rank
frames, `SCRIBE.high.*` is only a viewer id). So the scribe frames draw the visor's face pixels (skin, glasses,
goatee, hair) in palette characters reserved for them, and each rank's `robe` maps them to face colours or to the
visor colour. No change to shared code: the user chose the world first; real per-rank drawings are a separate engine feature,
proposed upstream later, after which only scribe and scribe39 get redrawn. The face only shows walking down or sideways; at the desk the
scribe is seen from behind, so the suit colour carries the rank there.

| Rank | Suit | Inside the visor |
| --- | --- | --- |
| high (Opus, Fable) | white | Walter: glasses and goatee visible through the visor |
| standard (Sonnet, others) | blue | Jesse: a younger face, short hair or beanie under the hood |
| novice (Haiku) | yellow | anonymous: the visor stays dark |

Rank names (`text.rank`): Heisenberg is the boss, so high = **Cook**, standard = **Partner**, novice = **Assistant**
(Claude's call, the user may rename).

The department colour (`y`, the sash in other worlds) becomes a band on the suit's arm or a colour strip on the
respirator, readable front, back and side.

## Art, by family

Supporting roles are Claude's guesses, accepted by default; the user may veto any of them on review.

| Family | Superlab design |
| --- | --- |
| scribe, scribe39 | the hazmat cooks, three ranks as above |
| adept, adept39 | Gale in his lab coat; `rank.adept` tints the coat trim per rank; the subagent kind glyph on a coat badge, front and back |
| magos, magos39 | Heisenberg seated |
| sanctum | his plain office chair (THRONE), a steel desk (LORD_DESK), the Br Ba tile as the seal (COG_MECH, SEAL) |
| workstations | DESK: white lab bench with a monitor and an Erlenmeyer flask of blue liquid; LECTERN: a narrow bench with a scale; CONSOLE: the assistant's fume-hood terminal; SHELL_COG: a magnetic stirrer turning |
| cogitator | the back-wall apparatus: a large steel reactor tank with a couple of pipes and a gauge, all flat |
| walls | the Br Ba poster (the room's one decoration); windows and hangings drawn as plain flat shapes or not at all |
| room-floor, room-walls, room-doors, room-pipes | one-colour floor (no grid), one-colour wall with a baseboard, plain steel doors, plain pipes; the beacon is a flat red warning light |
| gate | the industrial laundry entrance (the superlab's hidden way in) |
| fire | a Bunsen burner flame for the braziers and candles |
| clutter, petitions, commits | papers and clipboards; the petition is a sealed sample bag with a label; the commit seal a Br Ba stamp |
| skull, skull39 | **the fly** (the lab-contaminant fly), for the servo-skull |
| watch, watch39 | **Mike** as the night watchman: flat cap, tan jacket, flashlight |
| refectorium | a Los Pollos Hermanos corner: a fryer for the dispenser, yellow tables and benches |
| breakout | a fenced yard (to be designed with the breakout generator, `tools/breakout_art/`) |
| suzerain | a steel platform and a hose for the cable |
| faces | the 39° volumes of all the furniture above, built last |

## Palette

Few colours, all flat. Starting values from the sketch (`style-v1.html`), to be tuned in the viewer:

| Use | Colour |
| --- | --- |
| outline | `#26282b` |
| wall / floor / baseboard | `#e9edf0` / `#c7d0d4` / `#9aa6ac` |
| hazmat yellow / blue / white | `#f2c230` / blue to pick / `#fafafa` |
| visor, steel dark | `#2f3a40` |
| steel, bench top | `#9aa3a8` |
| Br Ba green | `#5f9e5a` |
| skin / goatee | `#f0c8a0` / `#7a5230` |
| blue liquid | `#8fd3ff` |

## Constraints

- A new world (`world: 'breakingbad'`) defined with `defineTheme` in `ui/themes.js`, its art in
  `ui/art/breakingbad/`, the full family list in `art` like `vault` and `darwin` (`faces` is not in that list:
  `ui/faces.js` loads `ui/art/<id>/faces.*` by itself). The world also gets an entry in `WORLDS` in `ui/theme.js`
  (the Settings picker). It adds a column O to the cell refs: CLAUDE.md's key and `docs/sprites/` follow.
- Texture drawn by code must go too: set `ink.scratch`, `scratchSheen`, `grime` and `cant` transparent (`scene.js`).
  The additive glows (`lighting.js`) will read weakly on a pale room; tune while building.
- Branch `theme-new` (to be renamed), rebased onto `main` before it goes upstream; no merges.
- Upstream conventions: one-line commit subjects, docs in the same commit as the code, no version bump.
- After each art change: `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, regenerate `docs/sprites/` with
  `node tools/sprite_sheet.mjs --theme breakingbad`, and look at it in `tools/sprites.html`.

## Left to the builder

- The exact blue suit colour and every tuned palette value.
- How Jesse's face reads at 32×34 through a visor.
- The order of families, except: scribe, room and workstations come first, then **work stops for the user's review**
  in the viewer before the other families (Claude's call).

## Later

- Per-rank drawings in the engine (each rank may have its own frames, falling back to the shared ones): its own
  branch and PR, for every world.
- A Game of Thrones world, after this one.
