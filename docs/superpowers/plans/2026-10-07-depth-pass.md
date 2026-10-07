# Depth Pass ("2.5D", option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-10-07. Spec: `docs/superpowers/specs/2026-10-07-depth-2-5d-design.md`.

**Goal:** Make the hall read as a volume (shadows, ambient occlusion, height-aware light, parallax) without any art
change, behind a "Depth" setting (Off / Subtle / Full, default Subtle) whose Off is pixel-identical to today.

**Architecture:** One new module, `ui/depth.js`, owns every depth effect that is not lighting: the setting, the shadow
geometry (pure, tested in node), the shadow and silhouette stamps (lazy, canvas), the ambient occlusion bands. It knows
nothing about the hall's rooms beyond a `hall` object, so the desktop strip (plan
`2026-10-07-desktop-strip.md`, task 4) reuses its contact shadows, motion cues and lamp cast shadows as they are.
`scene.js` collects floor shadows in a list drawn before the y-sorted items; `lighting.js` takes the light height;
`app.js` adds the depth level to its cache keys and drives the pan parallax.

**Tech Stack:** vanilla ES modules, Canvas 2D, node test scripts (`node ui/<name>.test.mjs`).

## Global Constraints

- `Depth: Off` draws exactly what `main` draws: every depth call is behind `depth.on(<effect>)`.
- No change to `ui/art/*`. Shadows and silhouettes come from the loaded frames.
- Levels: `subtle` = contact shadows, ambient occlusion, motion cues. `full` = those plus cast shadows,
  height-aware lighting, parallax on pan. Depth of view: its own switch, only applies in `full`, off by default.
- Persisted as `adm.depth` (`off` | `subtle` | `full`) and `adm.depthDov` (`1` | `0`); the remote view keeps its own
  (`LOCAL` in `settings.js`).
- Theme colour: `T.light.shadow` (rgb string like `night`), default `'6,4,3'`.
- Budget: 30 fps while anything moves; no gradient built per frame (stamps and cached canvases only).
- Tests: `node ui/*.test.mjs` all green. One commit per task, subject `Depth: <what>`.

## Files

| File | Responsibility |
|---|---|
| `ui/depth.js` (new) | `depth` state + `on(effect)`, `footOf(map)`, `shadowOf(map, x, y)`, `contactShadow(g, e, alpha)`, `silhouette(cv)`, `castShadow(g, cv, box, light, alpha)`, `aoBands(hall)`, `drawAO(g, hall)`, `FLY_H` |
| `ui/depth.test.mjs` (new) | Footprints, ellipse sizes, silhouette cache identity, AO band rects, `off` turns every effect off |
| `ui/scene.js` | Floor shadow pass (actors, furniture, skulls), prop shadows + AO in `drawStatic`, cast shadows, rising puff |
| `ui/actors.js` | `bodyOf(a)` (the body frame and where it is drawn), walk bob |
| `ui/lighting.js` | Light height `z` (flattened holes and glows), beam floor patches, depth of view |
| `ui/app.js` | Depth in the background cache key, `level` passed to the scene, parallax on pan, redraw on a depth change |
| `ui/theme.js`, `ui/theme.test.mjs` | `light.shadow` |
| `ui/settings.js`, `ui/index.html` | Depth select, Depth of view switch |
| `tools/preview.html` (new) | Browser harness: the real `ui/` with a fake backend and a fixed roster, for screenshots |
| `tools/sprites.html` | "Depth" toggle: each prop drawn over its contact shadow |
| `docs/superpowers/plans/2026-10-07-desktop-strip.md` | Task 4 reuses `depth.js` |

## Interfaces (shared by every task)

```js
// ui/depth.js
export const depth = { level: 'subtle', dov: false };
export const on = effect => boolean;        // 'contact' | 'ao' | 'motion' | 'cast' | 'height' | 'parallax' | 'dov'
export const setDepth = (level, dov) => void; // validates, fires onDepth listeners
export const onDepth = fn => unsubscribe;
export const FLY_H = 12;                      // logical px between a flying skull and its shadow
export function footOf(map) -> { x0, w } | null;        // logical px: opaque span of the frame's bottom 3 art rows
export function shadowOf(map, x, y) -> { cx, cy, rx, ry } | null; // the ellipse under a frame blitted at (x, y)
export function contactShadow(g, e, alpha);  // e from shadowOf (or any {cx, cy, rx, ry}); a soft pre-rendered stamp
export function silhouette(cv) -> canvas;    // cv's alpha filled with T.light.shadow, cached per cv (WeakMap)
export function castShadow(g, cv, box, from, alpha); // box {x, y, w, h} where cv is drawn, from {x, y} the light
export function aoBands(hall) -> [{ x, y, w, h, side }]; // side: 'n' 's' 'e' 'w' = where the wall is
export function drawAO(g, hall);
// ui/actors.js
export function bodyOf(a) -> { map, over, x, y }; // the body frame drawActor blits, at its top-left
```

## Task 1: depth.js core, setting, contact shadows and AO (ships "Subtle")

- [ ] `ui/depth.test.mjs`: footprint of a hand-made 6x6 map (`'..##..'` bottom rows -> `{ x0: 1, w: 1 }` at RES 2),
  `null` for an empty map; `shadowOf` centre at the footprint's middle and the frame's bottom, `ry = rx / 3`;
  `aoBands(hallOf(0))` all inside the hall and one `n` band along the scriptorium's wall foot (`y: 40`, `w: sw`);
  `setDepth('off')` -> `on(x)` false for every effect; `setDepth('bogus')` -> `subtle`; `dov` only with `full`;
  `silhouette` cache identity tested through an injected maker (`silhouette.make`).
- [ ] Run it: fails (no module).
- [ ] `ui/depth.js` as in Interfaces. Stamps (`document` only on first use): a 64 px radial ellipse stamp, black to
  transparent, coloured at draw time by `T.light.shadow` (re-made on a theme change).
- [ ] `theme.js`: `LIGHT.shadow = '6,4,3'`; `theme.test.mjs`: `shadow` joins `night`/`beam` as an rgb key.
- [ ] `scene.js drawStatic`: when `on('ao')`, `drawAO` after the floor tiles and before the props; when
  `on('contact')`, a contact shadow under every standing prop (`SHELF CRATE BRAZIER THRONE COGITATOR RECAFF TABLE BENCH
  LORD_DESK PAPER_STACK BOOKS COG_MECH`) before it is blitted, alpha 0.35 by day, 0.2 at night.
- [ ] `scene.js drawScene`: a `floor` list drawn after rugs, doors and paper, before the y-sorted items: the contact
  shadow of every actor (`bodyOf`) and of every desk, lectern and console.
- [ ] `app.js`: background cache key gets `depth.level`; `level` passed to `drawScene` through `view.level`.
- [ ] `settings.js` + `index.html`: "Depth" select (Off / Subtle / Full) in Hall > Choices, "Depth of view" in
  Hall > Switches (disabled unless Full); `adm.depth` / `adm.depthDov`; reset sets `subtle`, no dov.
- [ ] `node ui/depth.test.mjs` and all tests pass; commit `Depth: contact shadows and ambient occlusion`.

## Task 2: motion cues

- [ ] `actors.js`: walking scribes and adepts drawn 0.5 px higher on frame 0 (the passing pose) when `on('motion')`;
  `bodyOf` returns the un-bobbed position so the shadow stays on the floor; the shadow's `rx` loses 0.5 on frames 1-2.
- [ ] `scene.js`: the courier and the hovering servo-skulls (decor, alarm) get a shadow `FLY_H` below them (rx 3).
- [ ] `scene.js puff` and the spark smoke: puffs grow 30 % over their life when `on('motion')`.
- [ ] Commit `Depth: motion cues`.

## Task 3: height-aware lighting and beam floor patches

- [ ] Light `z`: `0` floor (coolant crossings, puffs), `1` desk / standing (default below the wall line), `2` wall
  (y < 44). `lighting.js`: when `on('height')`, holes and glows are ellipses `1, 0.85, 0.7` tall for z 2, 1, 0
  (scaled `drawImage` of the same stamps).
- [ ] Beam floor patch: a beam-coloured soft ellipse where each beam meets the floor (x of the beam's foot, y 112).
- [ ] Commit `Depth: height-aware lights and beam floor patches`.

## Task 4: cast shadows

- [ ] Night (`level.dark >= 0.5`): per actor, the nearest coloured light within `1.2 * r` casts its silhouette:
  flattened to 40 %, skewed away from the light, alpha `0.4 * (1 - d / 1.2r)`. Day: one shared direction (down-right,
  as the beams) at alpha 0.18. Drawn in the floor pass. Strip-ready: the function takes a light list, nothing else.
- [ ] Commit `Depth: cast shadows from lights`.

## Task 5: parallax on pan

- [ ] `app.js`: when `on('parallax')`, a pan step of `d` CSS px adds `-0.08 d` to `lag` (clamped to 1.5 logical px),
  which eases back to 0 (`* 0.85` per 16 ms). While `lag` is not 0, the back wall band (y 0..40) of the cached
  background is drawn again shifted by `lag`, and `busy()` keeps the frame rate. At rest `lag` is exactly 0.
- [ ] The brass frame is the window's edge, not a layer of the scene: it does not move (deviation from the spec,
  noted in the spec).
- [ ] Commit `Depth: parallax on pan`.

## Task 6: depth of view

- [ ] `lighting.js vignette()`: with `on('dov')`, a top-down gradient (8 % black at the top, 0 at the bottom) baked
  into the vignette canvas (key gets the flag), plus a grey layer drawn with `saturation` blend at the same alpha.
- [ ] Commit `Depth: depth of view`.

## Task 7: harness, sprite viewer, strip plan, docs

- [ ] `tools/preview.html`: loads `ui/index.html` with a fake `__TAURI__` and a fixed roster (busy, shell,
  waiting, idle, helpers); query `?depth=&mode=&theme=&bays=` written to localStorage before the app starts.
- [ ] Screenshots: Off / Subtle / Full x day / night x Ordo Administratum, Neon Grid, Vault 111.
- [ ] `tools/sprites.html`: "Depth" toggle draws a contact shadow under each sprite.
- [ ] Desktop strip plan task 4: shadows and motion cues come from `depth.js`; `outline.js` keeps only the outline.
- [ ] README: the Depth setting. Backlog updated. Commit `Depth: harness, viewer and docs`.
