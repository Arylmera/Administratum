# Darwin World Implementation Plan
Spec: `docs/superpowers/specs/2026-10-16-darwin-world-design.md` (outranks this plan where they conflict).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a fifth world, Darwin (`world: 'darwin'`, theme `darwin`, name `Darwin`): a Victorian naturalist's study
where monkeys type on typewriters, at the full depth of Vault 111 (Flat and 39°, break-out room, Night Vigil).

**Architecture:** no engine change. `WORLDS` entry (`ui/theme.js:146`), one `defineTheme` appended after `vault` in
`ui/themes.js`, art in `ui/art/darwin/<family>.png` + `.json`, the Watchman and break-out generators in
`tools/watch_art/darwin.mjs` and `tools/breakout_art/darwin.mjs`.

## Global constraints

The "Global Constraints" and "Shared recipe: drawing an art family" sections of
`docs/superpowers/plans/2026-10-06-three-worlds.md` apply unchanged, with these substitutions:
- theme / world `darwin`, name `Darwin`, world name `Darwin`; commit subjects `Darwin: <what>`.
- generator scripts go in this session's scratchpad (`.../scratchpad/draw/darwin-<family>.mjs`).
- no `Claude-Session` trailer and no attribution lines in commits.
- the Shared recipe's test step also runs `node ui/theme.test.mjs`; its look step also reloads
  `http://localhost:8123/tools/sprites.html` filtered on column N and screenshots it (CLAUDE.md).
- ranks are colour only (spec decision 10): monkey fur in robe slots `r R d`, recoloured in `rank.high.robe` /
  `rank.novice.robe`; spectacles in one slot made transparent for standard and novice.
- every sprite a new design (no recoloured 40k or other-world shape); nothing 40k left in a redrawn family.

## Milestone 1: the theme

### Task 1: theme entry, wording, docs key
Blocked by: none.
**Files:** `ui/theme.js:146`, `ui/themes.js` (append), `ui/theme.test.mjs:71`, `CLAUDE.md:17`,
`docs/DEVELOPMENT.md:167`, `README.md:245,366`, `tools/watch_art.mjs` (`WORLDS`), `tools/breakout_art.mjs` (world list, if it has one).
- [ ] **Spike first (decision 10):** check that a rank override can make a slot transparent (try
  `'rgba(0,0,0,0)'` as the spectacles slot in `rank.novice.robe` on a throwaway frame, render with
  `node tools/sprite_sheet.mjs --theme darwin`). Record `Ruling:` in this file: transparent works, or spectacles dropped.
- [ ] Test first: `ui/theme.test.mjs:71` list gains `'darwin'`; run, expect FAIL.
- [ ] `WORLDS` gains `darwin: 'Darwin'`.
- [ ] `defineTheme({ id: 'darwin', world: 'darwin', name: 'Darwin', art: [], px, sash, rank, ink, light, ui, text })`
  with every key `vault` sets, coloured per the spec's Palette; `--display` a typewriter face already loaded by the
  app (check `index.html` fonts; else `'VT323', monospace`); `text` per the spec's Wording, every key `vault.text` has.
- [ ] Run `node ui/theme.test.mjs && node ui/art.test.mjs && node ui/sprites.test.mjs`: all `ok`.
- [ ] Docs: column key `N Darwin` in CLAUDE.md and DEVELOPMENT.md (confirm with `node tools/sprite_sheet.mjs --list | head -15`);
  README theme lists. Commit + push `Darwin: a naturalist's study theme (palette, chrome, wording)`.

## Milestone 2: Flat art (each task = Shared recipe per family, one commit, push)

### Task 2: `scribe`, `adept` — Blocked by: 1
Monkey at a typewriter (one silhouette, fur in `r R d`, neckerchief `y`, waistcoat/watch chain `t`, spectacles slot);
capuchin with typed pages. Viewer check: all three ranks side by side read as ginger / brown / pale.
### Task 3: `magos`, `sanctum` — Blocked by: 1
Gorilla Professor in a wing chair, swinging arm with a magnifying glass; partners' desk, tree-of-life emblem, finch seal.
- [x] `magos`, `sanctum` drawn and registered; theme, art, sprites tests `ok`.
### Task 4: `workstations`, `cogitator` — Blocked by: 1
Typewriter desk, reading lectern, portable typewriter on a crate; specimen-cabinet wall.
- [x] `workstations`, `cogitator` drawn and registered; theme, art, sprites tests `ok`.
### Task 5: `walls`, `skull`, `gate`, `fire` — Blocked by: 1
Sash window (garden day / moon night), Beagle voyage chart, books and jars, barometer, gas lamp; finch; mahogany
double doors onto a dark corridor; fireplace, oil lamp.
- [x] `walls`, `skull`, `gate`, `fire` drawn and registered; theme, art, sprites tests `ok`.
### Task 6: `clutter`, `petitions`, `commits`, `refectorium` — Blocked by: 1
Typed-page tower, crumpled pages, leather volumes, loose pages, Beagle specimen crate; typed page with `?`, page
held up; page of Shakespeare, specimen label, brass stamp; tea urn with bananas, tea table and Chesterfield bench.
- [x] `clutter`, `petitions`, `commits`, `refectorium` drawn and registered; theme, art, sprites tests `ok`.
### Task 7: room tiles `room-floor`, `room-walls`, `room-doors`, `room-pipes` — Blocked by: 1
Herringbone parquet with runner carpet; panelling under wallpaper; panelled doors; brass gas pipes; brass bell beacon.
- [x] `room-floor`, `room-walls`, `room-doors`, `room-pipes` drawn and registered (default `meta.tiles` copied); theme, art, sprites tests `ok`.

**Milestone 2 check:** all tests `ok`; `node tools/sprite_sheet.mjs --theme darwin`; full column N screenshot in the
viewer; the app in Flat view (`tools/preview.html?theme=darwin&n=12`).

## Milestone 3: 39°, break-out, Night Vigil

### Task 8: `scribe39`, `adept39`, `magos39`, `skull39`, `faces` — Blocked by: 2, 3, 4, 5, 6, 7
Same designs in the 39° sheets; `faces.*` gives the 39° sides and tops of every object the world redraws (follow
`ui/art/vault/faces.json` for which objects). Check: `preview.html?theme=darwin&n=12&view=39`, and the theme shows
in the picker (39° completeness, `checkComplete39`).
### Task 9: `breakout`, `watch`, `watch39` — Blocked by: 1
`tools/breakout_art/darwin.mjs` (the Monkey House: straw floor, bamboo fence, banana-crate gate) and
`tools/watch_art/darwin.mjs` (museum night keeper: peaked cap, long coat, lantern on the `light` anchor, keys;
ring = he rings a hand bell), each modelled on its `vault.mjs` sibling; run both generators.

## Milestone 4: ship

### Task 10: docs, galleries, install — Blocked by: 8, 9
- [ ] `docs/sprites/darwin.md` + gallery PNGs (`node tools/sprite_sheet.mjs --theme darwin`); CLAUDE.md line 29
  and DEVELOPMENT.md:155,179 theme lists gain `darwin`.
- [ ] README worlds table: a `docs/img/world-darwin.png` screenshot of the hall and its caption.
- [ ] Spec status `done`; all tests `ok`; rebuild and silently reinstall the NSIS build; check the theme in the app.

## Worklog
Ruling (Task 1 spike): a transparent rank colour does not work: `rgba(0,0,0,0)` as a rank slot renders as an opaque
near-black pixel in the gallery (`tools/png_write.mjs` `rgba()` parses only `#rrggbb`), and in the app the canvas
skips it, a hole through the face on a one-layer sprite. Spectacles dropped (decision 10).
Done: 1-7 (3-7 art uncommitted, awaiting the parent's commit). Current: Milestone 2 check. Next: 8, 9. Blockers: none. Irreversible: pushes to main (authorised by the repo's commit-and-push law).
