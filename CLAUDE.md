# Administratum — notes for Claude

## Working on sprites, animations, characters

Whenever a task touches the art (sprites, room tiles, characters, animations, a theme's palette or its own art),
open the live sprite viewer first and keep it open, so the discussion is about what is actually drawn:

1. Serve the repo root in the background: `python -m http.server 8123` (skip if port 8123 already answers).
2. Open `http://localhost:8123/tools/sprites.html` in the browser (Claude in Chrome); filter, zoom, screenshot.
3. After editing an art file, reload the page and look again before calling it done.

References the user may give:
- **Cell refs** like `C12`: column = theme in `THEMES` order (A Ordo Administratum, B Ordo Machinum, C Ordo Xenos,
  D Ordo Malleus, E Ordo Hereticus, F Neon Grid, G Orbital Station), row = sprite number. `node tools/sprite_sheet.mjs --list` prints the key;
  `sprites.html#C12` jumps to and outlines the cell.
- **Sprite ids** like `SCRIBE.high.left`, `WINDOW.night`, `ROOM.floor` (the viewer and `docs/sprites/` galleries).

Where things live:
- Art: `ui/art/<family>.png` + `.json` (frames, anchors, tile fill rules), drawn in the key palette
  `ui/art/key.gpl` (one char per colour slot). A theme's own art: `ui/art/<theme>/<family>.*`, holding only the
  frames it redraws, listed in the theme's `art` in `ui/themes.js`.
- Colours per theme: `ui/theme.js` (Ordo Administratum, `BASE`) and `ui/themes.js`.
- Sprite list shared by the viewer and the gallery: `tools/sprite_catalog.mjs`.
- To read a sprite as text rows: `node -e "import('./ui/sprites.js').then(m => console.log(m.MAPS.SHELF.join('\n')))"`.
- After an art change: run `node ui/art.test.mjs` and `node ui/sprites.test.mjs`, then regenerate the committed
  galleries with `node tools/sprite_sheet.mjs` (and `--theme cyber`).
- Discussion: one GitHub issue per family (Sprite board #3); design note
  `docs/superpowers/specs/2026-10-06-sprite-themes-design.md`.
