# Themes as Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fourteen themes of `ui/themes.js` become `ui/art/<id>/theme.json` files read by one loader, with no visible change.

**Architecture:** A pure module (`ui/themepack.js`) turns a parsed `theme.json` into the object `defineTheme` takes today, so `theme.js` `resolve()` and everything downstream stay untouched. `ui/themes.js` keeps its name and its role (importing it registers the themes) but becomes a loader with a top-level `await`. A one-off script writes the JSON files from the old `themes.js` and proves every resolved theme is identical.

**Tech Stack:** ES modules without a bundler, Node for tests and tools (plain `assert` scripts, no framework), no new dependency.

**Spec:** `docs/superpowers/specs/2026-11-15-theme-packs-design.md` (part A only; part B gets its own plan).

## Global Constraints

- No visible change to the fourteen shipped themes: `resolve()` of each is deep-equal before and after.
- A theme is never evaluated, only parsed: `JSON.parse`, no `import()` of pack content, no `eval`, no `Function`.
- Ordo Administratum (`tier2`, `ui/theme.js`) stays code and is not converted.
- Order of the shipped themes, exactly: `forge xenos night contrast cyber orbital corpo rain matrix synth tower vault darwin breakingbad`.
- The old band names are these hue ranges: `pink` 300 to 345, `violet` 260 to 300, `night` 210 to 260, `cyan` 165 to 210.
- Skin slots `:` and `;` are never turned by a style.
- No new npm or cargo dependency; no version bump.
- Commits follow the repository's style: one line, "Area: what it does" or a plain sentence, an optional prose body, no attribution trailers. Docs change in the same commit as the code they describe.
- Run from the repository root. Full check before each commit:
  `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done` prints no `FAIL`, and from a clean tree `node tools/art_gate.mjs` passes.

## Review Focus

1. A module that walks `THEMES` at load is imported before `themes.js` (a test or tool importing only `sprites.js`): it must still see all fifteen themes. Test in Task 3.
2. A `theme.json` that is not valid JSON, or an id in `themes.json` with no `theme.json`: the error names the file. Test in Task 3.
3. A style whose `base` is itself a style, or is unknown: refused with a message naming the base. Test in Task 1.
4. A hue range that wraps past 360 (`"hue": [345, 15]`): hues 350 and 5 are inside, 20 is not. Test in Task 1.
5. A style of `tier2`, which has no `theme.json` and whose art is the root of `ui/art/`: it resolves and draws with the base art. Test in Task 1 (resolve) and Task 3 (art root).

## File Structure

| File | Responsibility |
|---|---|
| `ui/themepack.js` (new) | `theme.json` to theme object: the recolouring, the check, the build. Pure, no I/O |
| `ui/themepack.test.mjs` (new) | Its tests |
| `ui/themes.js` (rewritten) | The loader: reads `ui/art/themes.json` and each `theme.json`, checks, registers |
| `ui/themes.test.mjs` (new) | The loader's tests |
| `ui/art.js` (modified) | A sheet is read from a root given by the caller; `readArt` exported |
| `ui/sprites.js`, `ui/faces.js` (modified) | Depend on the loader; pass each theme's art root |
| `ui/art/themes.json` (new) | The shipped theme ids, in order |
| `ui/art/<id>/theme.json` (new, 14) | The themes |
| `tools/themes_to_packs.mjs` (new) | One-off: writes the JSON files from an old `themes.js`, proves equality |
| `README.md`, `docs/DEVELOPMENT.md` | Trademark notice; "Sprites and themes" |

---

### Task 1: `ui/themepack.js`, a theme from its JSON

**Files:**
- Create: `ui/themepack.js`, `ui/themepack.test.mjs`
- Read first: `ui/themes.js:237-259` (`BANDS`, `rehue`, `recolour`, `accent`), `ui/theme.js` `resolve`, `TEXT`, `TIER_II`

**Interfaces:**
- Consumes: `resolve`, `TEXT`, `TIER_II` from `ui/theme.js`.
- Produces:
  - `recolour(value, bands) -> same shape`: `value` is a string, array or plain object; `bands` is `[{ hue: [from, to], to, sat = 1, light = 0 }]`. Every `#rrggbb` and every `r,g,b` triple inside a string whose hue falls in a range is turned to hue `to`, saturation times `sat`, lightness plus `light`; the arithmetic is today's `rehue`, unchanged. A range with `from > to` wraps past 360.
  - `checkTheme(json, { bases }) -> string[]`: the problems, empty when valid. `bases` is the `Set` of ids a style may name (themes that have no `base`).
  - `themeOf(id, json, base) -> object`: what `defineTheme` takes. `base` is the registered base theme object, required when `json.base` is set.
  - `FONTS`: the allowed `--display` values, `["'VT323', monospace", "'Pirata One', serif"]`.

- [ ] **Step 1: Pin today's recolouring.** Before moving anything, compute with the current `rehue` (copy the function into a scratch `node -e`) the result of bands `{ pink: [356, 1, -0.04], night: [0, 0.12] }` on `#ff2bd6`, `#1a1f3a`, `rgba(255,43,214,.5)`, `20,24,60` and `#7cff9e` (out of every range). Use those five outputs as the expected values in Step 2.

- [ ] **Step 2: Write the failing tests** in `ui/themepack.test.mjs`:
  - `recolour` on the five inputs above with `[{ hue: [300, 345], to: 356, sat: 1, light: -0.04 }, { hue: [210, 260], to: 0, sat: 0.12 }]` gives the five pinned outputs; `#7cff9e` is returned unchanged.
  - wrap: with `[{ hue: [345, 15], to: 120 }]`, a colour of hue 350 and one of hue 5 change, one of hue 20 does not.
  - `recolour` keeps the shape of a nested object and of an array.
  - `checkTheme` returns `[]` for `{ format: 1, name: 'X', world: 'w40k', px: { r: '#102030' }, ui: { '--display': FONTS[0], '--bg': '#000000' }, light: { night: '10,20,30' } }`.
  - `checkTheme` returns one problem each, naming the key, for: `format: 2`; no `name`; both `world` and `base`; neither; `base: 'nope'` (message contains `nope`); an unknown top-level key `script`; `px: { rr: '#102030' }`; `px: { r: 'red' }`; `ui: { '--bg': 'url(http://x)' }`; `ui: { '--display': 'Comic Sans' }`; `ink: { brass: 12 }`; `text: { nope: 'x' }` (a key `TEXT` does not have); `bands: [{ hue: [300], to: 10 }]`; `bands` on a theme without `base`.
  - `themeOf('x', { format: 1, name: 'X', world: 'w40k', notes: 'n', px: { r: '#102030' } })` deep-equals `{ id: 'x', name: 'X', world: 'w40k', px: { r: '#102030' } }` (`format`, `notes`, `worldName` are dropped).
  - style of `tier2`: `const s = themeOf('s', { format: 1, name: 'S', base: 'tier2', bands: [{ hue: [0, 20], to: 200 }] }, TIER_II)`; `s.world === 'w40k'`, `s.artOf === 'tier2'`, `resolve(s).px[':']` equals `resolve(TIER_II).px[':']`, `resolve(s).px.x` differs from `resolve(TIER_II).px.x` (`#8e1c16`, hue 3).
  - style overrides win: adding `px: { x: '#123456' }` to that JSON gives `resolve(s).px.x === '#123456'`.

- [ ] **Step 3: Run** `node ui/themepack.test.mjs`. Expected: fails, module not found.

- [ ] **Step 4: Implement `ui/themepack.js`.**
  - `recolour`: move `rehue` and `recolour` from `themes.js`, replacing the lookup by name with a lookup by range.
  - `checkTheme`: allowed keys `format name world worldName base bands art px sash rank ink light ui text notes`. A colour is `#rrggbb`, `#rgb`, `rgb(...)`, `rgba(...)` or `r,g,b`. `px` and the `rank.<high|standard|novice>.<robe|adept>` maps have one-character keys. `ui` keys start with `--`; `--display` is one of `FONTS`, every other value a colour. `text` is checked against `TEXT` recursively: a key must exist there with the same kind (string, array, object).
  - `themeOf`, a world theme: the JSON without `format`, `notes`, `worldName`, plus `id`.
  - `themeOf`, a style: take `r = resolve(base)`; recolour `{ px (without ':' and ';'), rank, ink, light, ui }` of `r` (in `ui`, `--display` is left as it is); lay the JSON's own `px`, `rank`, `ink`, `light`, `ui` over the result, key by key; put the base's `:` and `;` back unless the JSON sets them. Result: `{ id, name, world: base.world, artOf: base.artOf ?? base.id, sash: json.sash ?? base.sash, art: json.art, px, rank, ink, light, ui, text: { ...base.text, ...json.text } }`. `text` is the base's authored text (not the resolved one) under the style's, a shallow merge, as `accent` does today.

- [ ] **Step 5: Run** `node ui/themepack.test.mjs`. Expected: passes, no output or its own ok line.

- [ ] **Step 6: Commit** `ui/themepack.js ui/themepack.test.mjs`: `Theme packs: a theme from its JSON (the recolouring by hue range, the check)`.

---

### Task 2: the conversion script and the fourteen files

**Files:**
- Create: `tools/themes_to_packs.mjs`, `ui/art/themes.json`, `ui/art/<id>/theme.json` for the fourteen ids

**Interfaces:**
- Consumes: `themeOf`, `checkTheme` (Task 1); `resolve`, `THEMES` from `ui/theme.js`.
- Produces: the data files Task 3 loads. `node tools/themes_to_packs.mjs --from <git ref>` writes them and exits 0 only if every theme is identical; `--check` compares without writing.

- [ ] **Step 1: Write `tools/themes_to_packs.mjs`.** Header comment: a one-off for the move of the themes to data files, deletable once merged.
  1. Extract `ui/theme.js`, `ui/themes.js` and `ui/hallplan.js` of `<ref>` (`git show <ref>:<path>`) into a temporary folder.
  2. In the extracted `themes.js`, insert a line at the head of `accent`'s body that pushes `{ id: t.id, base: base.id, bands, text, rest: t }` onto a global array. Fail if the line `function accent(base, { bands, text, ...t }) {` is not found exactly once.
  3. Import the extracted modules: `old = Object.fromEntries(ids.map(id => [id, resolve(THEMES[id])]))`, and the authored objects (`THEMES[id]`, or the recorded arguments for the four accents).
  4. Write each `theme.json`: `format: 1`, `name`, then `world` (a world theme) or `base` and `bands` (an accent; names translated to ranges, `[H, S, L]` to `{ hue, to: H, sat: S, light: L }`), then `art` and the other authored parts, then `notes`: the `//` lines just above the theme's `defineTheme(` or `accent(` call in the source, and the trailing comment of its `art:` line, joined by a space. Two-space indent, keys in that order, a final newline.
  5. For each accent, build it with `themeOf` and compare `resolve()` with `old[id]`; every value that differs is written into that accent's `theme.json` as an override under its own part (`px`, `rank`, `ink`, `light`, `ui`), then rebuilt and compared again. Print the number of overrides per accent.
  6. Write `ui/art/themes.json`: the fourteen ids in the order of the Global Constraints.
  7. Proof: for every id, `checkTheme` returns `[]`, and `resolve(themeOf(...))` deep-equals `old[id]` (`assert.deepStrictEqual`, which covers `px`, `sash`, `rank`, `ink`, `light`, `ui`, `text` with `inRooms`); `world`, `art` and `artOf` of the built object equal the old registered one's. Print one line per theme and a final `14 themes identical`.

- [ ] **Step 2: Run** `node tools/themes_to_packs.mjs --from HEAD`. Expected: ends with `14 themes identical`, exit 0. `git status --short ui/art` shows the fifteen new JSON files and nothing else.

- [ ] **Step 3: Run** `node tools/themes_to_packs.mjs --from HEAD --check`. Expected: same last line, no file written (`git status` unchanged).

- [ ] **Step 4: Commit** the script and the fifteen files: `Theme packs: every theme beyond Ordo Administratum as a theme.json beside its art`. Body: what the files are, that nothing reads them yet, the overrides count per accent.

---

### Task 3: the loader

**Files:**
- Rewrite: `ui/themes.js`
- Modify: `ui/art.js` (`read`, `loadSheet`), `ui/sprites.js:87-103`, `ui/faces.js:44-56`, `docs/DEVELOPMENT.md` ("Sprites and themes", the test table)
- Create: `ui/themes.test.mjs`

**Interfaces:**
- Consumes: `themeOf`, `checkTheme` (Task 1); the files of Task 2; `defineTheme`, `THEMES`, `WORLDS` from `ui/theme.js`.
- Produces:
  - `ui/art.js`: `readArt(name, as, root) -> Promise<Uint8Array | object>` (today's `read`, exported; `root` a URL string, default the `./art/` folder) and `loadSheet(family, root)` with the same optional `root`. A JSON that does not parse throws an error whose message starts with the file's name.
  - `ui/themes.js`: `artRootOf(id) -> string`, the URL of the folder holding the theme's own files: `ui/art/<id>/` for a shipped theme, `ui/art/` for `tier2`. `loadThemes(ids, rootOf) -> Promise<void>` registers the themes of `ids` in order, reading `theme.json` under `rootOf(id)`; a problem throws `Error("theme <id>: <problem>")`. The module ends with `await loadThemes(<ids of themes.json>, artRootOf)`.

- [ ] **Step 1: Write the failing tests** in `ui/themes.test.mjs`:
  - after `await import('./themes.js')`, `Object.keys(THEMES)` equals `['tier2', 'forge', 'xenos', 'night', 'contrast', 'cyber', 'orbital', 'corpo', 'rain', 'matrix', 'synth', 'tower', 'vault', 'darwin', 'breakingbad']`.
  - `THEMES.rain.artOf === 'cyber'` and `THEMES.rain.world === 'cyber'`.
  - in a child process (`node -e`), `await import('./ui/sprites.js')` alone, then `Object.keys((await import('./ui/theme.js')).THEMES).length === 15`.
  - with a temporary folder holding `bad/theme.json` = `{ not json`, `await loadThemes(['bad'], id => <its file URL>)` rejects with a message containing `bad/theme.json`.
  - with a temporary folder where `gone/` has no `theme.json`, it rejects with a message containing `gone`.
  - with `s/theme.json` = `{ "format": 1, "name": "S", "base": "rain" }`, it rejects with a message containing `rain` (a style cannot be a base).
  - `artRootOf('tier2')` ends with `/ui/art/` and `artRootOf('vault')` with `/ui/art/vault/`.

- [ ] **Step 2: Run** `node ui/themes.test.mjs`. Expected: fails (`loadThemes` is not exported).

- [ ] **Step 3: Implement.**
  - `ui/art.js`: export `read` as `readArt` with the `root` parameter; `loadSheet(family, root)` passes it on.
  - `ui/themes.js`: the loader as in Interfaces. `bases` for `checkTheme` is the set of registered ids whose theme has no `artOf` chain to a style, that is every registered theme that was not built from a `base`. A `worldName` on a world theme adds `WORLDS[world]` when that world has no name yet. Nothing of the old file's theme data remains.
  - `ui/sprites.js` and `ui/faces.js`: add `import './themes.js';` and read a theme's own sheets with `loadSheet(family, artRootOf(th.id))` instead of `loadSheet(\`${th.id}/${f}\`)`.
  - `docs/DEVELOPMENT.md`: "Sprites and themes" says where a theme lives now (`ui/art/<id>/theme.json`, the list in `ui/art/themes.json`, `ui/themepack.js`, `ui/themes.js` the loader), how to add a theme (a folder, its id in the list), and that a style is `base` plus `bands`; add `themepack.test.mjs` and `themes.test.mjs` to the test table.

- [ ] **Step 4: Run** `node ui/themes.test.mjs`, then the full check of the Global Constraints. Expected: no `FAIL`; `flathall.test.mjs`, `isohall.test.mjs`, `theme.test.mjs`, `faces.test.mjs`, `art.test.mjs` pass without any change to their expected values.

- [ ] **Step 5: Prove equality against the old code.** Run `node tools/themes_to_packs.mjs --from HEAD~2 --check` (the ref before Task 2, where `themes.js` is still the old one; adjust the ref if the history differs). Expected: `14 themes identical`. Adapt the script's proof so that, when `ui/themes.js` is the loader, it compares `old[id]` with `resolve(THEMES[id])` of the working tree's loader, not only with its own `themeOf` call.

- [ ] **Step 6: Look at it.** Serve the repository root (`python -m http.server 8123`, skip if the port answers) and open `http://localhost:8123/tools/sprites.html` and `http://localhost:8123/tools/preview.html?theme=rain&view=39`. Expected: every column of the viewer is drawn, the Rain City hall is drawn in its amber and teal, no error in the console.

- [ ] **Step 7: Run** `node tools/art_gate.mjs` from a clean tree after committing. Expected: passes (the galleries do not change).

- [ ] **Step 8: Commit**: `Theme packs: themes.js loads the themes from their theme.json files`. Body: what moved where, that the resolved themes are identical (the script's proof), the docs.

---

### Task 4: the trademark notice

**Files:**
- Modify: `README.md:640-641`

- [ ] **Step 1: Replace** the two lines by:

```
Warhammer 40,000 and the Adeptus Mechanicus are trademarks of Games Workshop. Fallout, Vault-Tec, Nuka-Cola and
Pip-Boy are trademarks of Bethesda Softworks, a ZeniMax Media company. Breaking Bad is a trademark of Sony Pictures
Television. Administratum is an unofficial fan project and is not affiliated with or endorsed by any of them.
```

- [ ] **Step 2: Commit**: `README: the trademark notice names Fallout and Breaking Bad too`.
