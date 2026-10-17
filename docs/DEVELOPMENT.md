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
 claude.exe env (Orca)  ────┤        │               └─ same events over HTTP/SSE ─▶ remote view (LAN browser)
 ~/.local/share/opencode/opencode.db + its loopback service (OpenCode 2.x) ┘
                                     ▼
                       chronicle ─▶ %APPDATA%\com.arylmera.administratum\chronicon\
```

### Backend (`src-tauri/src/`)

| Module | Job |
|---|---|
| `main.rs` | Plugins (notification, window-state, autostart, updater), setup, the 1 s poll loop and its toasts, the small commands (among them `platform`: the OS, `windows` / `macos`, so Settings hides what is Windows-only); every Tauri command is listed in its `generate_handler!`. Crate-wide helpers: `lock`, `no_window`, `emit`, `now_ms` |
| `window.rs` | The main window: tray icon and menu, show / hide, the watcher that tells the UI when the window is seen |
| `orca.rs` | Orca's CLI: switch to a session's terminal, read and answer its permission dialog |
| `poller.rs` | Builds the live roster each tick: liveness of each session pid via Win32, the Orca handle per pid, transcript location, memoised tails and subagents |
| `registry/` | Pure reading of Claude Code's files, no side effects. `sessions.rs` the session records, `tail.rs` a transcript tail (task, context, turn, question, petition, usage limit), `helpers.rs` subagents, `tracker.rs` what is new this tick (one notification per episode), `files.rs` file access, `prompt.rs` the permission-prompt parser and the validators for what goes to Orca or a shell |
| `opencode/` | OpenCode 2.x, a second source beside `registry/`. `db.rs` reads its SQLite database read-only (only while its `-wal` exists, so no file is created in OpenCode's folder; one short transaction per read), `service.rs` its service registration (`~/.local/state/opencode/service.json`, loopback URLs and version 2+ only, the password never leaves the module) and a small `std::net` client for `/api/session/active`, pending permissions and replies, `mod.rs` the sessions it adds to the roster (running, waiting, idle while a TUI runs in its folder, 15 min at most), the rows the Chronicon reads, and `answer_opencode` |
| `chronicle.rs` | Incremental transcript reader: Chronicon events, the token and working-time Tithe, day files, retention |
| `toast.rs` | Toast wording, pushed by the UI from the active theme; toasts with buttons (petitions, Night Vigil). Windows: tauri-winrt-notification. macOS: tauri-plugin-notification's actions (`toast::mac`, one `on_action` handler registered at setup, routed by toast id; two buttons become an *Options* menu whose own button reports the first, so a petition lists Deny first; only the bundled app has the right notification identity, `tauri dev` posts as Terminal). A toast with buttons that cannot be shown falls back to the plain one. In demo mode, `ADMINISTRATUM_TEST_TOAST=1` fires one test toast with buttons whose click is only logged (`test toast click: ...` on stderr) |
| `quiet.rs` | Quiet hours, the same rule as `ui/quiet.js` |
| `git.rs` | A working directory's branch, read from `.git/HEAD` (git is never run) |
| `settings.rs` | `settings.json`: load, shape checks, atomic save; readers of saved `adm.*` values the backend needs (quiet hours, open-folder program) |
| `remote/` | The LAN remote view. `mod.rs` the HTTP server, pairing token and policy, with no Tauri in it; `app.rs` its settings, the backend it calls and the settings panel's commands (remote view, firewall rule). Its API: [remote-api.md](remote-api.md) |
| `firewall.rs` | The Windows Firewall rule for the remote view (read unelevated, changed through one UAC prompt) |
| `strip/` | The desktop strip window: placement on the taskbar or above the Dock, click-through. OS calls in `windows.rs` and `macos.rs` (the Dock's side and auto-hide, read from its `defaults` at most every 30 s) |
| `demo.rs` | A scripted 60 s roster, events and usage for demo mode |
| `vigil/` | Night Vigil. `mod.rs` the pure rule (arms once every session is stuck on a human, the 120 s countdown); `app.rs` arming, its tick, toast and Chronicon events, the shutdown itself |

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
| `app.js` | Wiring: roster → layout → cast, render loop, hit test, header buttons, chime |
| `viewport.js` | The view: scale and scene size for the window, pan (drag, glide, coast, arrow keys), parallax lag |
| `overlay.js` | DOM over the canvas, synced each frame: plaques, petition labels, tags, edge arrows, hover tip |
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
| `vigil.js` | Night Vigil state (armed, deadline, countdown) as the backend emits it, and the 30 s bell rule |

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
| `vigil.test.mjs` | Night Vigil state, seconds left, the 30 s bell rule |
| `card.test.mjs` | Answerable petitions (Orca prompt, OpenCode request) and the answer command each one calls |

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
  (`cyber`, `orbital`, `tower`, `vault`, `darwin`). Every other family falls back to the base art.
- A scribe's arms (`actors.js` `drawCarried`): a world's own body has them, so it draws none separately; the 40k robe
  has none, so the base art draws two mechadendrites over the desk (`arm`, mirrored for the left), never lent to a
  world's own scribe. A finished long turn raises the scroll, the mechadendrites with it (`liftOf`).

**Live viewer.** Every sprite of every theme side by side, read straight from `ui/art/`, walk cycles animated,
zoom, pixel grid, backgrounds and a filter:

```sh
python -m http.server 8123        # from the repo root
# http://localhost:8123/tools/sprites.html   (edit an art file, press R)
```

Cells are named like a spreadsheet: the column is the theme (A Ordo Administratum, B Ordo Machinum, C Ordo Xenos,
D Ordo Malleus, E Ordo Hereticus, F Neon Grid, G Orbital Station, H Corpo Tower, I Rain City, J Green Code,
K Sunset Drive, L Arcane Tower, M Vault 111, N Darwin), the row is the sprite's number. `F79` is the Neon Grid shelf, and
`sprites.html#F79` jumps to it. `node tools/sprite_sheet.mjs --list` prints the key. Rows are numbered over the default
theme's list, so a ref means the same sprite in every column; a sprite the hall never draws in a world (a frame the
default art lends but the world's own art lacks: `HANGING_B`, `SHELF_B`, a door's half frame...) shows there as an
empty "not in this world" cell, and its theme gallery leaves it out. The *depth* switch draws each
sprite over the contact shadow it gets in the hall.

**After an art change:**

```sh
node ui/art.test.mjs && node ui/sprites.test.mjs
node tools/sprite_sheet.mjs                     # regenerates docs/sprites/
node tools/sprite_sheet.mjs --theme cyber       # and orbital, tower, vault, darwin: each theme with its own art
```

`docs/sprites/` is the committed gallery used to discuss sprites one by one: one GitHub issue per family (Sprite
board), each sprite linking to a prefilled new issue. Design notes:
[sprite themes](superpowers/specs/2026-10-06-sprite-themes-design.md).

**Tools** (`tools/`): `sprites.html` the live viewer, `preview.html` the backend-free hall, `sprite_catalog.mjs` the
sprite list shared by both and by the gallery, `sprite_sheet.mjs` the gallery generator, `breakout_art.mjs` /
`watch_art.mjs` (one module per theme or world under `breakout_art/` and `watch_art/`) the generators of the
break-out room and Watchman art, `map_to_art.mjs` / `sheet_writer.mjs` / `png_write.mjs` art conversion helpers, `adm.mjs` the
command-line client of the running app, `make_icon.py` the app icon.

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

Bump `version` in `src-tauri/Cargo.toml` and push to `main`. The `release` workflow tags `v<version>` and builds
three legs: the signed NSIS installer on Windows, and on macOS a DMG plus a signed updater archive for each arch
(`Administratum_<version>_aarch64.dmg`, `Administratum_<version>_x64.dmg`, `Administratum_aarch64.app.tar.gz`,
`Administratum_x64.app.tar.gz`). It then publishes a GitHub Release with `latest.json` (`windows-x86_64`,
`darwin-aarch64`, `darwin-x86_64`), which installed copies read to offer the update. Every leg must succeed: a
missing artifact or `.sig` fails the release, Windows included. A version with a `-` (`0.3.0-rc1`) becomes a
pre-release that the updater never offers. To rebuild an existing tag: Actions > release > Run workflow, with the
tag. A second workflow, `fmt`, checks `cargo fmt`.

Homebrew: after a release, the `homebrew` job hashes both DMGs, writes the version and hashes into the cask template
`Casks/administratum.rb`, and pushes it to the tap `Arylmera/homebrew-administratum`. It needs the repository secret
`HOMEBREW_TAP_TOKEN` (a token with write access to the tap) and skips cleanly without it; it skips `-` tags, and
its failure never fails the release. Install: `brew install --cask arylmera/administratum/administratum`. The app is
not notarized; the cask removes the quarantine flag after install, so Gatekeeper does not call it damaged.

The updater key: the private key is in `~/.tauri/administratum.key` (back it up: losing it means installed copies
can no longer update), its contents in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, its public key in
`tauri.conf.json`.

---

## Repository layout

```
src-tauri/            Rust backend, tauri.conf.json, capabilities, icons, NSIS hooks
  src/                main, poller, chronicle, remote, firewall, settings, toast, quiet, git, demo
  src/registry/       pure parsing of Claude Code's session files and transcripts
  src/strip/          the desktop strip window (OS calls in windows.rs, macos.rs)
ui/                   the frontend, served as-is (ES modules, no build) + its *.test.mjs checks
  art/                sprite sheets (PNG + JSON) in the key palette; ui/art/<theme>/ for a theme's own art
  fonts/              bundled WOFF2 fonts and their OFL licences
tools/                sprite viewer, hall preview, gallery generator, art helpers, icon script
docs/                 user and developer docs, specs and plans, sprite gallery, README images
Casks/                the Homebrew cask template the release workflow pushes to the tap
.github/workflows/    release (tag, build, publish, homebrew) and fmt
```
