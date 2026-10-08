# Developing Administratum

How the app is built, how to run and test it, how the art works, and how a release ships. For what the app does,
see the [README](../README.md). For the other documents in `docs/`, see the [docs index](README.md).

---

## Architecture

Administratum is a Tauri 2 app. The backend is Rust (`src-tauri/`). The UI is plain ES modules served from `ui/`
as they are: no npm, no bundler, no build step. The same `ui/` files also serve the remote view over HTTP.

```
 ~/.claude/sessions/*.json ─┐                       ┌─ roster, petition, chronicle events ─▶ ui/ (WebView2)
 ~/.claude/projects/*.jsonl ┼─▶ poller (1 s) ─▶ main ┤
 claude.exe env (Orca)  ────┘        │               └─ same events over HTTP/SSE ─▶ remote view (LAN browser)
                                     ▼
                       chronicle ─▶ %APPDATA%\com.arylmera.administratum\chronicon\
```

### Backend (`src-tauri/src/`)

| Module | Job |
|---|---|
| `main.rs` | Window, tray, plugins (notification, window-state, autostart, updater), the 1 s poll loop, every Tauri command (listed in `generate_handler!`) |
| `poller.rs` | Builds the live roster each tick: liveness of each session pid via Win32, the Orca handle per pid, transcript location, memoised tails and subagents |
| `registry/` | Pure reading of Claude Code's files, no side effects. `sessions.rs` the session records, `tail.rs` a transcript tail (task, context, turn, question, petition, usage limit), `helpers.rs` subagents, `tracker.rs` what is new this tick (one notification per episode), `files.rs` file access, `prompt.rs` the permission-prompt parser and the validators for what goes to Orca or a shell |
| `chronicle.rs` | Incremental transcript reader: Chronicon events, the token and working-time Tithe, day files, retention |
| `toast.rs` | Toast wording, pushed by the UI from the active theme |
| `quiet.rs` | Quiet hours, the same rule as `ui/quiet.js` |
| `git.rs` | A working directory's branch, read from `.git/HEAD` (git is never run) |
| `settings.rs` | `settings.json`: load, shape checks, atomic save |
| `remote.rs` | The LAN remote view: HTTP server, pairing token, policy. Its API: [remote-api.md](remote-api.md) |
| `firewall.rs` | The Windows Firewall rule for the remote view (read unelevated, changed through one UAC prompt) |
| `strip/` | The desktop strip window: placement on the taskbar, click-through. OS calls in `windows.rs` |
| `demo.rs` | A scripted 60 s roster, events and usage for demo mode |

**Events.** Each second the poll loop emits `roster` (every session with its status, petition, task, context,
subagents, Orca handle, claude.ai URL, compaction time), `petition` and `petition-stale` (these also fire the
toasts), and `chronicle` for each new event. Events older than 2 min are recorded but not played in the scene. The
UI fetches Chronicon history on demand through the `chronicle_*` commands.

**One door to the backend.** `ui/bridge.js` gives the UI `invoke` and `listen`. Inside the app they go to Tauri;
in a LAN browser (`window.ADM_REMOTE`, set by `/remote.js`) they go over HTTP and one shared `EventSource`. Callers
do not know which.

### UI (`ui/`)

| Module | Job |
|---|---|
| `index.html` | Markup and styles: header, card, Chronicon and Settings panels |
| `app.js` | Wiring: roster → layout → cast, render loop, scale and pan, petition labels, header buttons, chime |
| `bridge.js` | `invoke` / `listen`, to Tauri or to the remote server |
| `card.js` | The selected character's card, and answering permission petitions |
| `chrome.js` | The page follows the theme: CSS colours, marked texts, toast wording |
| `settings.js` | Settings panel and the persisted store (`settings.json`, localStorage as cache) |
| `panel.js` | Open/close behaviour shared by the parchment panels |
| `chronicon.js` | Chronicon: day tabs, Tithe charts, event log |
| `layout.js` | Hall geometry: department blocks, desks and lecterns, consoles, bays, routes, light phases |
| `actors.js` | Scribes and adepts: destinations, walking, napping, compaction ritual, chronicle reactions |
| `glide.js` | Furniture easing to its new place when the hall reflows |
| `scene.js` | Canvas drawing of the flat hall: the static background and each frame |
| `view.js` | The view switch: Flat (identity) or the 39° projection |
| `iso.js`, `isohall.js`, `scene39.js` | The 39° view: z-buffer engine, its static hall, its per-frame layer |
| `faces.js` | Face sheets: one art source split into faces, drawn flat or built into 39° volumes |
| `depth.js` | Shadows, cast shadows and ambient occlusion computed from the sprites |
| `lighting.js`, `sun.js` | Darkness, light pools and glows; sunrise and sunset (NOAA) for *Auto* lighting |
| `strip.js`, `stripwin.js`, `outline.js` | Desktop strip: its geometry, its window, the 1 px outline around sprites |
| `sprites.js`, `art.js`, `png.js` | Sprite loading: art files (PNG + JSON) into palette rows, PNG decoder |
| `room.js`, `wallart.js` | The room from tiles (fill rules), the back wall's window and hangings |
| `theme.js`, `themes.js` | Themes: every colour and the wording; `setTheme`, `t()` |
| `quiet.js` | Quiet hours, the same rule as `quiet.rs` |

---

## Run

Requires the Rust toolchain and the Tauri CLI (`cargo install tauri-cli --version "^2"`).

```sh
cd src-tauri
cargo tauri dev
```

To get a demo roster with no real sessions (scribes arriving, working, shelling, petitioning, compacting, with
adepts and Chronicon events), set `ADMINISTRATUM_DEMO=1` before `cargo tauri dev`, or pass `--demo` to the binary:

```powershell
$env:ADMINISTRATUM_DEMO = 1; cargo tauri dev
```

To look at the hall in a browser without the backend (a fixed roster of scribes, adepts and petitions), serve the
repo root and open the preview. Query parameters: `mode` (auto, full, candles), `theme` (a theme id), `n` (scribes,
1 to 40), `view` (flat, 39), `scale`.

```sh
python -m http.server 8123        # from the repo root
# http://localhost:8123/tools/preview.html?mode=candles&theme=vault&n=12&view=39
```

---

## Tests

```sh
cargo test --manifest-path src-tauri/Cargo.toml   # every backend module has its own tests
for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done
```

The node checks are plain `assert` scripts with no framework. One file per module:

| File | Checks |
|---|---|
| `layout.test.mjs` | Layout, routes, stable desks, compact lecterns and bays |
| `sprites.test.mjs` | Sprite sizes, palette chars, symmetry |
| `art.test.mjs` | Art files: PNG decoder, key palette, sheets |
| `theme.test.mjs` | Themes: complete palettes, runtime switch |
| `sun.test.mjs` | Sun times and *Auto* phases |
| `quiet.test.mjs` | Quiet hours, windows across midnight |
| `depth.test.mjs` | Footprints, shadows, cast lights, AO bands |
| `lighting.test.mjs` | Flat lighting unchanged, 39° light heights |
| `view.test.mjs` | Flat identity, 39° projection, scene size, inverse |
| `iso.test.mjs` | 39° z-buffer: projection, boxes, decals, outline, depth sort |
| `faces.test.mjs` | Face sheets: flat frames rebuilt exactly, 39° volumes |
| `flathall.test.mjs` | Flat hall: the static background's draw calls (hashes) |
| `isohall.test.mjs` | 39° hall: room plan, prop placement, render (pixel hashes) |
| `scene39.test.mjs` | 39° dynamic layer: depth order, seats, hit tests, gate |
| `strip.test.mjs` | Strip geometry |
| `outline.test.mjs` | Strip sprite outline |

---

## Sprites and themes

Sprites and the room's tiles (floor, walls, pipes, doors) are art files in `ui/art/`: one PNG sheet per family,
drawn in the key palette `ui/art/key.gpl` (one character per colour slot; load it in Aseprite or Piskel), plus a
JSON file with the frames, anchors and the tiles' fill rules. Colours are never in the art: every colour (the art's,
the ones drawn in code, the page's chrome) and the wording come from the active theme.

- `ui/theme.js` holds the base theme (Ordo Administratum) and `WORLDS`; `ui/themes.js` holds every other theme,
  each with only what it changes.
- A theme belongs to a **world** (Warhammer 40k, Cyberpunk, Space, Fantasy, Fallout). Settings picks the world, then
  one of its themes as the **style**.
- A theme with its own art lists the families it redraws in its `art` field; the files sit in `ui/art/<theme>/`
  (`cyber`, `orbital`, `tower`, `vault`). Every other family falls back to the base art.

**Live viewer.** Every sprite of every theme side by side, read straight from `ui/art/`, walk cycles animated,
zoom, pixel grid, backgrounds and a filter:

```sh
python -m http.server 8123        # from the repo root
# http://localhost:8123/tools/sprites.html   (edit an art file, press R)
```

Cells are named like a spreadsheet: the column is the theme (A Ordo Administratum, B Ordo Machinum, C Ordo Xenos,
D Ordo Malleus, E Ordo Hereticus, F Neon Grid, G Orbital Station, H Corpo Tower, I Rain City, J Green Code,
K Sunset Drive, L Arcane Tower, M Vault 111), the row is the sprite's number. `F52` is the Neon Grid shelf, and
`sprites.html#F52` jumps to it. `node tools/sprite_sheet.mjs --list` prints the key. The *depth* switch draws each
sprite over the contact shadow it gets in the hall.

**After an art change:**

```sh
node ui/art.test.mjs && node ui/sprites.test.mjs
node tools/sprite_sheet.mjs                     # regenerates docs/sprites/
node tools/sprite_sheet.mjs --theme cyber       # and orbital, tower, vault: each theme with its own art
```

`docs/sprites/` is the committed gallery used to discuss sprites one by one: one GitHub issue per family (Sprite
board), each sprite linking to a prefilled new issue. Design notes:
[sprite themes](superpowers/specs/2026-10-06-sprite-themes-design.md).

**Tools** (`tools/`): `sprites.html` the live viewer, `preview.html` the backend-free hall, `sprite_catalog.mjs` the
sprite list shared by both and by the gallery, `sprite_sheet.mjs` the gallery generator, `iso.html` / `iso.mjs` the
39° projection trial, `faces.mjs` / `iso_art.mjs` / `map_to_art.mjs` / `sheet_writer.mjs` / `png_write.mjs` art
conversion helpers, `make_icon.py` the app icon.

---

## Build the installer

```powershell
cd src-tauri
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\administratum.key"; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cargo tauri build
```

Bundles are signed for the updater, so the key file must exist (see below). The output is
`src-tauri/target/release/bundle/nsis/Administratum_<version>_x64-setup.exe` and its `.sig`. Install it silently
with `/S` (to `%LOCALAPPDATA%\Administratum`). The release profile uses LTO, `opt-level = "s"` and stripped
symbols.

## Releasing

Bump `version` in `src-tauri/Cargo.toml` and push to `main`. The `release` workflow tags `v<version>`, builds the
signed installer on Windows, and publishes a GitHub Release with `latest.json`, which installed copies read to offer
the update. A version with a `-` (`0.3.0-rc1`) becomes a pre-release that the updater never offers. To rebuild an
existing tag: Actions > release > Run workflow, with the tag. A second workflow, `fmt`, checks `cargo fmt`.

The updater key: the private key is in `~/.tauri/administratum.key` (back it up: losing it means installed copies
can no longer update), its contents in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, its public key in
`tauri.conf.json`.

---

## Repository layout

```
src-tauri/            Rust backend, tauri.conf.json, capabilities, icons, NSIS hooks
  src/                main, poller, chronicle, remote, firewall, settings, toast, quiet, git, demo
  src/registry/       pure parsing of Claude Code's session files and transcripts
  src/strip/          the desktop strip window (Windows calls in windows.rs)
ui/                   the frontend, served as-is (ES modules, no build) + its *.test.mjs checks
  art/                sprite sheets (PNG + JSON) in the key palette; ui/art/<theme>/ for a theme's own art
  fonts/              bundled WOFF2 fonts and their OFL licences
tools/                sprite viewer, hall preview, gallery generator, art helpers, icon script
docs/                 user and developer docs, specs and plans, sprite gallery, README images
.github/workflows/    release (tag, build, publish) and fmt
```
