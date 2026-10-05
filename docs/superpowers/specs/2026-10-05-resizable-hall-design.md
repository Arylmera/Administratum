# Resizable hall — design (operator-approved)

Goal: the window decides the room, the Scale setting decides the pixel size.

- **Scale setting** (Settings → Window): Auto / 1.5x / 2x / 2.5x / 3x (CSS px per logical px).
  Auto = the scale that reproduces today's look at the default 700x500 window (≈2x), then kept
  fixed while the window is resized (recomputed only when the user changes the setting). Persisted
  (adm.scale). Changing it re-lays out the scene with the usual glide.
- **Dynamic scene size**: logical W = floor(windowWidth / scale), H = floor((windowHeight - header) /
  scale), never below today's minimum 346x226. Cap W at ~1.6x the base width (ultra-wide windows get
  pixel scale instead of absurd aisles). Below the minimum, keep the minimum and pan (existing pan).
- **Left room (Scriptorium)** grows in width and height: more desks per row, more rows; cogitator bank
  stays centred on its back wall; grand gate stays centred in its bottom wall; aisles/lanes/corridor
  follow; repeated wall decor (shelves, windows, banners, pipes) tiles along the longer walls instead
  of fixed positions; floor grate/coolant channels tile to size.
- **Right rooms** keep a fixed width, anchored to the right edge, and grow **vertically** with H:
  Refectorium ≈ 40 %, Sanctum ≈ 60 % of the right column height. The Refectorium gains benches and
  refectory spots as it grows; the Sanctum gains queue length (more QUEUE_SLOTS in front of the
  Magos's desk). Doors between rooms stay valid (routes through the corridor).
- **Agent pressure tiers** unchanged in spirit: room available in the window first; when it's full:
  compact lecterns, then bays that extend the scene beyond the window (pan); shrink back with the
  existing grace periods.
- **Resize**: recompute on the fly (debounced ~150 ms); desks glide to their new places and scribes
  walk; no desk changes owner unless needed. Static background cache and lighting layer rebuilt.
- **Code**: layout.js takes the scene size {w, h} as input (no fixed geometry constants for room
  positions); right rooms positioned from w; queue slots, refectory spots, routes, lanes derived;
  scene.js draws the static room in sections that tile to size. Tests: layouts at minimum, 1080p,
  ultra-wide and tall windows — valid axis-aligned routes, no furniture overlap, stable desks across
  a resize, queue/refectory capacity grows with height.
