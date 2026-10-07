# Depth pass ("2.5D", option A): design

Date: 2026-10-07. Status: spec, not started.

## Goal

Make the hall read as a volume instead of a flat picture, **without redrawing any art**. The view stays the
current 3/4 top-down pixel art; what changes is how it is lit, shadowed and layered. Every effect is a setting
("Depth": Off / Subtle / Full, default Subtle) and Off is pixel-identical to today.

Rejected alternatives (cost note of 2026-10-07): B, 2D sprites in a three.js room (4 to 8 weeks, every theme's room
rebuilt in 3D); C, true isometric pixel art (2 to 4 months, all ~430 frames redrawn with 4 directions). Option A
keeps all of `ui/art/*`, the layout, the routes and the tests.

**Cost estimate:** 1 to 2 weeks.

## What we have to work with

- `drawScene` (`ui/scene.js`) already y-sorts furniture and actors (`items.sort((p, q) => p.y - q.y)`), so draw
  order is depth-correct. Nothing knows the *height* of anything, though.
- The room's structure is a cached background canvas per size and day/night (`background()` in `app.js`,
  `drawStatic`): walls 0..40 px at the top, floor below. That cache is where most static depth can be baked for free.
- `drawLighting` (`ui/lighting.js`) does a darkness layer with light holes, additive glows, day beams and a
  vignette. Light positions are known (`staticLights`, desk and console lights, fires).
- Every frame's anchors are known (`feet`, desk `screen`, `lamp`...), so a sprite's footprint is known.

## The effects

Each effect lists what it does, where it lives, and its cost per frame. The budget is the current one: 30 fps
while anything moves, an idle rate otherwise, on a 700x500 window at scale ~1.9.

### 1. Contact shadows (Subtle and Full)

A soft dark ellipse under every actor and every standing prop (desk, lectern, console, shelf, crate, brazier,
throne, cogitator). Width from the frame's opaque width at its bottom rows, height a third of it, alpha 0.35 by day,
0.2 at night (darkness already covers the floor).

- Props: baked into the static background (`drawStatic`), so zero per-frame cost.
- Actors: one pre-rendered ellipse stamp per size (like `lighting.js` stamps), drawn under the actor in its
  y-sorted item. A walking scribe's shadow squashes by 1 px on the step frames.
- Theme: the shadow colour is a new `T.light.shadow` (rgb), defaulting to the night tint.

### 2. Directional cast shadows from lights (Full)

At night, each light that already makes a hole in the darkness (candles, braziers, screens) casts a short skewed
shadow from actors standing within its radius: the actor's silhouette (its frame, filled with the shadow colour),
flattened to 40 % height and skewed away from the light, alpha falling with distance. Only the nearest light per
actor casts, to keep it to one extra blit per actor. By day, the window beams cast one shared direction (down and
slightly right, matching the beam geometry in `drawLighting`).

- Silhouettes: cached per sprite canvas (a WeakMap, like the paper caches), drawn with `setTransform` skew.
- Cost: one extra `drawImage` per actor in light, at most ~40 per frame in a full hall.

### 3. Wall and floor ambient occlusion (Subtle and Full)

A dark gradient band where the floor meets every wall (8 px, the "wall foot" lines), in the corners of each room,
under the back wall's shelves and alcoves, and where desks meet their rug. It makes the walls stand up from the
floor. Baked once into the static background per size: zero per-frame cost.

### 4. Height-aware lighting (Full)

Today a light is a flat disc on the picture. With a height, a light at desk height lights the floor around the desk
more than the back wall, and a window beam fades with depth into the room.

- Each light in `staticLights` / `deskLight` / fires gets `z` (0 floor, 1 desk, 2 wall).
- The darkness hole and glow become an ellipse flattened 0.7 vertically for floor-level lights (it lies on the
  floor in perspective), a disc for wall lights.
- The day beams get a floor-hit patch: a brighter trapezoid where each beam meets the floor, matching its x.

Changes are in `lighting.js` only; the stamps stay pre-rendered, the ellipse is a scaled `drawImage`.

### 5. Layered parallax on pan (Full)

When the hall is larger than the window (bays, a small window) and the user pans, the back wall (y < 40) moves
at 0.92 of the floor's speed and the foreground frame (the brass frame drawn by `index.html`) at 1.04. Three layers:
back wall canvas, floor and everything on it, the frame. The static background is split into two cached canvases
(wall band, floor) to allow it.

- Only during pan; at rest everything is aligned exactly as today (offset 0), so no seam can show.
- As built (2026-10-07): only the back wall trails (a lag of at most 1.5 logical px that eases back to 0). The brass
  frame is the window's edge, not a layer of the scene, so it stays put.
- Cost: one extra `drawImage` of a cached canvas.

### 6. Depth of view (Full, off by default even in Full)

A very light darkening and desaturation toward the top of the scene (the far end), 0 at the bottom aisle, 8 % at the
back wall, baked into the vignette canvas (`vignette()` in `lighting.js`, already cached per size and phase).

### 7. Small motion cues (Subtle and Full)

- Walking scribes bob 0.5 logical px (1 art px) on the step frames, the shadow staying on the floor.
- Servo-skull and courier: their shadow on the floor under them, offset by their flight height, so they read as
  flying, not as sliding on the floor.
- The compaction puff and sparks rise with a slight scale-up (closer to the eye).

## Settings

`Depth` in the settings panel, persisted as `adm.depth` (`off` | `subtle` | `full`), applied live (drop the
background and vignette caches, as a theme change does through `onTheme`). Default `subtle`: contact shadows,
ambient occlusion, motion cues. The remote view (`bridge.js`) keeps its own choice, like the scale.

## Files

| File | Change |
|---|---|
| `ui/depth.js` (new) | Shadow stamps, silhouette cache, `castShadow(g, actor, light)`, AO bands for `drawStatic`, the depth setting's reader |
| `ui/scene.js` | Contact shadows in the y-sorted items; cast shadows; AO and prop shadows in `drawStatic` |
| `ui/lighting.js` | Light `z`, floor-ellipse holes and glows, beam floor patches, depth-of-view in `vignette()` |
| `ui/app.js` | Two background canvases (wall band, floor) and the pan parallax; cache drop on depth change |
| `ui/actors.js` | Walk bob; flying height for the skull and courier |
| `ui/theme.js` | `light.shadow` (default from `light.night`); themes may override |
| `ui/settings.js`, `ui/index.html` | The Depth setting |
| `ui/depth.test.mjs` (new) | Shadow ellipse size from a frame, silhouette cache identity, AO band rects per hall size, `off` draws nothing |
| `tools/sprites.html` | A "depth" toggle showing each prop with its contact shadow |

## Verification

- **Off is unchanged:** the headless-Chromium harness used for the theme refactor (frozen clock, seeded randomness,
  fixed roster) compares `depth=off` to `main`: pixel-identical outside the known animation noise.
- **Subtle and Full:** harness screenshots of the demo roster at day, dusk and night, in 3 themes (Ordo
  Administratum, Neon Grid, Vault 111), and in a hall with 2 bays panned halfway (parallax).
- **Performance:** frame time in Full with 30 scribes and 60 adepts stays under 8 ms on the harness machine (today's
  baseline to be measured first); idle rate unchanged.
- `node ui/*.test.mjs` all green.

## Order of work

1. Contact shadows + AO baked in the background (the biggest effect for the least work; ships `subtle`).
2. Motion cues.
3. Height-aware lighting and beam floor patches.
4. Cast shadows from lights.
5. Parallax on pan.
6. Depth of view.

Each step is one commit (`Depth: <what>`), behind the setting, and can ship alone.

## Out of scope

- Any art change (new frames, normal maps, height maps). If a later pass wants per-pixel lighting, a height map per
  family drawn in `key.gpl` would be the next step; it is not needed for this spec.
- The desktop strip (`docs/superpowers/plans/2026-10-07-desktop-strip.md`) has no room; it only uses effect 1
  (contact shadows), which it already plans.
