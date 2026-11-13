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
| `window.rs` | The main window: tray icon and menu, show / hide, the watcher that tells the UI when the window is seen, whether it can stay on top (`on_top_supported`: not under Wayland, where Settings hides the choice) |
| `orca.rs` | Orca's CLI: switch to a session's terminal, read and answer its permission dialog |
| `poller.rs` | Builds the live roster each tick: liveness of each session pid via Win32, the Orca handle per pid, transcript location, memoised tails and subagents |
| `registry/` | Pure reading of Claude Code's files, no side effects. `sessions.rs` the session records, `tail.rs` a transcript tail (task, context, turn, question, petition, usage limit), `helpers.rs` subagents, `tracker.rs` what is new this tick (one notification per episode), `files.rs` file access, `prompt.rs` the permission-prompt parser and the validators for what goes to Orca or a shell, `risk.rs` the risky-command list (`risk_of`, read once by `tail::pending_risk` from the raw command of every unanswered call of the pending message, sent as `Session.risk`; main.rs fills OpenCode's from its request) |
| `opencode/` | OpenCode 2.x, a second source beside `registry/`. `db.rs` reads its SQLite database read-only (only while its `-wal` exists, so no file is created in OpenCode's folder; one short transaction per read), `service.rs` its service registration (`~/.local/state/opencode/service.json`, loopback URLs and version 2+ only, the password never leaves the module) and a small `std::net` client for `/api/session/active`, pending permissions and replies, `mod.rs` the sessions it adds to the roster (running, waiting, idle while a TUI runs in its folder, 15 min at most), the rows the Chronicon reads, and `answer_opencode` |
| `chronicle/` | Incremental transcript reader: Chronicon events, the token and working-time Tithe (per department, model, hour and session (a session's total is on the roster as `tokensToday`, card.js lineage), and per department its turns, longest turn (`max_turn_ms`) and edited files; fields added later are `serde(default)` so older day files still load), day files, retention; the usage window (`fine`: 288 five-minute buckets of new Anthropic tokens per day; `day_fine` places them at their real times across DST changes, `fineSince` marks a day file that predates them; `window_of`, pure, with ceilings from the `limit` events' `resetMs` / `hitMs`, kept only over complete kept days; `tithe_answer` adds `window` to today's `tithe_day` only); `opencode.rs` turns OpenCode rows into transcript lines; `conflict.rs` two live sessions on one file (the absolute paths each edited in the last 20 min, a subagent's under its parent; `pairs`, Windows paths compared case-insensitively; main.rs sets `sameFile`, one toast and a `conflict` event per pair and path, the first tick seeding) and `port_in_use` (a `port-in-use` event and the turn's `portInUse`); `honours.rs` the Hall of Honours (`honours` command: the four marks over the kept days, pure `honours` over day Tithes and events); `report.rs` the end-of-day report (`day_report` command), its markdown, and `write_capture`, the only write outside the app data dir (only with `adm.reportOn` and an existing absolute `adm.reportDir`) |
| `monitor.rs` | Monitoring rules, pure: the config (`adm.tokenAlert`, ... read from `settings.json` at setup and after each `settings_save`, so the UI pushes nothing) and the per-session daily token alert (new tokens, cache reads left out; one toast and a `token-alert` event per session per day, seeded on the first tick). The app cannot see the subscription quota: the threshold is a count the user picks. Stuck sessions (`stuck_of`): busy (never at the shell) and either silent (no write to its transcripts, subagents' included, for `adm.stuckMin`, default 15 min; OpenCode sessions have no files and are never silent) or looping (`adm.stuckRepeat`, default 5, identical tool calls in a row that each got the same error, its volatile parts masked (`mask::volatile`), counted by `chronicle::track_turn`; a success or an edit ends the run; polling tools and bare `sleep` / `watch` never count); one toast and a `stuck` event per episode |
| `toast.rs` | Toast wording, pushed by the UI from the active theme; toasts with buttons (petitions, Night Vigil). Windows: tauri-winrt-notification. macOS and Linux: tauri-plugin-notification's actions (`toast::actions`, one `on_action` handler registered at setup, routed by toast id; on macOS two buttons become an *Options* menu whose own button reports the first, so a petition lists Deny first there; only the bundled app has the right notification identity, `tauri dev` posts as Terminal; on Linux the buttons are D-Bus actions, drawn only by a notification server that draws actions). A toast with buttons that cannot be shown falls back to the plain one. In demo mode, `ADMINISTRATUM_TEST_TOAST=1` fires one test toast with buttons whose click is only logged (`test toast click: ...` on stderr) |
| `quiet.rs` | Quiet hours, the same rule as `ui/quiet.js` |
| `mask.rs` | Pure text rewrites. `mask`: secret-shaped strings (API keys, GitHub / Slack tokens, AWS key ids, private key blocks, JWTs, `password=` / `token=` / `secret=` / `api_key=` values, Bearer tokens) become `•••`; applied by `serialize_with` (`mask::ser`, `ser_opt`) on the roster's texts and `Event.detail`, so the WebView, the remote view and new Chronicon lines get the same masked text, and in `prompt.rs` on the peeked dialog. `volatile`: the parts of an error that change between runs (timestamps, durations, hex, 4+ digit numbers, temp paths) as `#`, for the loop rule |
| `git.rs` | A working directory's branch, read from `.git/HEAD` (git is never run) |
| `settings.rs` | `settings.json`: load, shape checks, atomic save; readers of saved `adm.*` values the backend needs (quiet hours, open-folder program) |
| `rooms.rs` | Custom rooms: `adm.rooms` rules (glob or `re:` regex, first match wins) compiled at setup and after each `settings_save`; `assign` sets each session's `room` once per tick after the roster merge (never for a temp session); `rooms_test` checks a pattern for the Settings tab |
| `remote/` | The LAN remote view. `mod.rs` the HTTP server, pairing token and policy, with no Tauri in it; `app.rs` its settings, the backend it calls and the settings panel's commands (remote view, firewall rule). Its API: [remote-api.md](remote-api.md) |
| `firewall.rs` | The Windows Firewall rule for the remote view (read unelevated, changed through one UAC prompt) |
| `strip/` | The desktop strip window: placement on the taskbar or above the Dock, or as the desktop column on a screen edge (`Shape`: `Bar` or `Column`, `place_strip` / `place_column`, `column_rect`; the watcher replays the last shape each second), click-through. OS calls in `windows.rs`, `macos.rs` (the Dock's side and auto-hide, read from its `defaults` at most every 30 s) and `linux.rs`. Linux: Wayland lets no window place itself, so the strip is a second window, `strip`, in a wlr-layer-shell surface (gtk-layer-shell) the compositor anchors to the edge; a shown window cannot become a layer surface, so entering opens `strip` and closes `main`, leaving does the reverse, and the UI starts again in its saved view. tao's fixed window size is freed before the window is shown, or the surface stays black. The UI's sizes and rects are CSS px, turned into GTK px there (WebKitGTK scales its pages by the font DPI over 96). No cursor poll there: `set_click_through` answers true and the UI sends the rects that take clicks (`set_strip_hits`, every 200 ms while they change), which become the surface's input region. Settings' *Keep windows off the strip* (`set_strip_reserve`, false and the row removed on the other OSes) gives the layer an exclusive zone of the strip's size with no panel open (`base`, sent with `place_strip` / `place_column`). The column's height there is the window's own (`colHeight`), the screen's numbers not being CSS px. `strip_supported` is true only where `gtk_layer_shell::is_supported()` is (not GNOME, not X11): elsewhere Settings removes the strip and the column (WebKitGTK's list shows a hidden option) |
| `demo.rs` | A scripted 60 s roster, events and usage for demo mode |
| `vigil/` | Night Vigil. `mod.rs` the pure rule (arms once every session is stuck on a human, the 120 s countdown) and `report_day` (armed before 04:00: the day before); `app.rs` arming, its tick, toast and Chronicon events, the day report capture on arm and on fire, the shutdown itself |

**Events.** Each second the poll loop emits `roster` (every session with its status, petition, task, context,
subagents, Orca handle, claude.ai URL, compaction time, `stuck`, `room`: the custom room its cwd falls in, `sameFile`: another live session on one of its files, `cache`: its
prompt cache clock), `petition` and `petition-stale` (these also fire the
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
| `overlay.js` | DOM over the canvas, synced each frame: plaques, the Hall of Honours' marks over its plaque, petition labels, tags (a sealed or stuck scribe, its sheets), edge arrows, hover tip |
| `bridge.js` | `invoke` / `listen`, to Tauri or to the remote server |
| `card.js` | The selected character's card, and answering permission petitions (a risky one: red, no *Always*, *Approve* armed by a first click, sent by a second within 5 s); a Suzerain's lineage (`lineageOf`); the watch lines (`same file`, a port in use, the cache clock) |
| `petition.js` | Pure: which petitions can be answered and how; `riskOfPetition` (the backend's `risk` field), `allowed` (which answers each surface offers; a remote client gets the phone's rule), `armStep` (the two-click Approve: 400 ms to 5 s apart, a double-click holds) |
| `mobile.html` / `mobile.js` | The remote view's phone page (index.html's head redirects a narrow remote screen to it, `/?hall` stays): petitions (Approve / Deny on a shown permission prompt while remote actions are allowed), Night Vigil, sessions, today's totals |
| `chrome.js` | The page follows the theme: CSS colours, marked texts, toast wording |
| `settings.js` | Settings panel and the persisted store (`settings.json`, localStorage as cache) |
| `panel.js` | Open/close behaviour shared by the parchment panels |
| `chronicon.js` | Chronicon: day tabs and a Week tab (the last 7 days added up, `sumTithes`), Tithe charts, the top sessions by new tokens, the folded day report, event log; the plaque's usage-window bar (`windowGauge`) and today's window line (`windowLine`); `openWeek` (the Hall of Honours' click) |
| `layout.js` | Hall geometry: department blocks, desks and lecterns, consoles, bays, routes, light phases; `zoneSequence` (custom rooms in rule order, the open hall, the break-out room), the west wing (`hallOf(bays, size, wing)`: the hall moved east by `wx`, `hall.base` the hall without it, `hall.rooms` each room's rect, lanes, corridor and door, geometry only: the rooms share the wing's full height, each its desk rows plus an even share of the spare rows, the last down to the hall's bottom, its door on the lane nearest its middle, or the layout's `wing[].door` clear of the break-out room's fence (`wing[].share` caps the share then); `wingZones` adds each room's colour and emptiness from the layout; `layoutDepartments` packs room departments there and returns `wing`), `zonesOf` (the break-out room's fence and gates) |
| `rooms.js` | Custom rooms in force (`adm.rooms`): `roomsOf` (the lenient parse, `rooms.rs`'s caps), `setRooms`, `tintOf` (a rule's colour on the sash slot `y`) |
| `actors.js` | Scribes and adepts: destinations, walking, napping, compaction ritual, chronicle reactions |
| `glide.js` | Furniture easing to its new place when the hall reflows |
| `scene.js` | Canvas drawing of the flat hall: the static background and each frame; `candleOf` the cache clock of a desk (no world has a low-candle frame: "low" is the lit desk with a smaller light pool), shared with `scene39.js`; with a west wing, the hall drawn moved east and `drawWing` (its walls, floors, the west wall; its doors in `drawDoors`) |
| `view.js` | The view switch: Flat (identity) or the 39° projection; the strip kinds (`view.strip`, `view.column`) |
| `iso.js`, `isohall.js`, `scene39.js` | The 39° view: z-buffer engine, its static hall (with a west wing, `wingPlan`: the hall's plan moved east, the wing's floor and walls, the west wall's doorways), its per-frame layer |
| `faces.js` | Face sheets: one art source split into faces, drawn flat or built into 39° volumes |
| `depth.js` | Shadows, cast shadows and ambient occlusion computed from the sprites |
| `lighting.js`, `sun.js` | Darkness, light pools and glows; sunrise and sunset (NOAA) for *Auto* lighting |
| `strip.js`, `stripwin.js`, `outline.js` | Desktop strip: its geometry, its window (the bar or the column, `adm.stripKind`), the 1 px outline around sprites |
| `column.js`, `lift.js` | Desktop column: its floors, layout and routes (a cross-floor walk has one lift waypoint); the lift, a pure SCAN scheduler (FIFO calls, 3 riders, event-exact `step`) the cast rides (`actors.js`) |
| `sprites.js`, `art.js`, `png.js` | Sprite loading: art files (PNG + JSON) into palette rows, PNG decoder |
| `room.js`, `wallart.js` | The room from tiles (fill rules), the back wall's window and hangings |
| `theme.js`, `themes.js` | Themes: every colour and the wording; `setTheme`, `t()` |
| `quiet.js` | Quiet hours, the same rule as `quiet.rs` |
| `vigil.js` | Night Vigil state (armed, deadline, countdown) as the backend emits it, and the 30 s bell rule |

---

## Run

Requires the Rust toolchain and the Tauri CLI (`cargo install tauri-cli --version "^2"`). On Linux, also the Tauri
system libraries: on Debian or Ubuntu the `apt-get install` line of `.github/workflows/check.yml`, on Arch
`webkit2gtk-4.1 libayatana-appindicator librsvg xdotool openssl gtk-layer-shell`.

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
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done
node tools/art_gate.mjs                           # from a clean tree: every art sheet and gallery is current
```

CI runs all four on every push and PR (`.github/workflows/check.yml`; `cargo fmt --check` is `fmt.yml`). The Rust tests
and clippy run twice, on Ubuntu and on `windows-latest` (the `#[cfg(windows)]` code is only built there); the node
checks and the art gate run on Ubuntu only. The art gate
reruns every generator (each `tools/<gen>_art.mjs` that has a `tools/<gen>_art/` folder, found by listing `tools/`, so a new
one joins the gate by existing: one run per world module in that folder) and
`sprite_sheet.mjs` (the default theme, plus `--theme` for every folder under `ui/art/`), then fails if
`git status --porcelain ui/art docs/sprites` is not empty: commit the regenerated files with the art change.

The node checks are plain `assert` scripts with no framework. The panel tests (settings, Chronicon) run on
`ui/testdom.mjs`: a minimal DOM parsed from the real `ui/index.html`, fake timers and clock (UTC), and a fake backend
that records every `invoke`. Import the module under test after `install()`, since `settings.js` reads the backend
when it loads. One file per module:

| File | Checks |
|---|---|
| `layout.test.mjs` | Layout, routes, stable desks, compact lecterns and bays |
| `sprites.test.mjs` | Sprite sizes, palette chars, symmetry |
| `art.test.mjs` | Art files: PNG decoder, key palette, sheets; each world's Hall of Honours plaque is its own silhouette, never the base one; each world's lift its own frames at the base sizes |
| `theme.test.mjs` | Themes: complete palettes, runtime switch; chrome contrast in every theme (each foreground over the fill it sits on, text >= 4.5, icons and borders >= 3; a light-chrome theme sets `--on-blood` / `--ink-on-blood` / `--pink-on-blood` / `--green-on-blood` for text on `--blood`, `--flame-on-wax` for the alarm, `--honours-ink` for the Hall of Honours words, whose plaque fields it is checked against), with the shortfalls already shipped listed and asserted still failing |
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
| `lift.test.mjs` | The lift: delivery, FIFO trips at CAP, same-way pickup, starvation bound, repeat calls, cancel, retarget, new stops, the same events for any dt split |
| `column.test.mjs` | Column geometry (floor ys, floors moving, the right side mirrored, pitch, overflow, routes, the scale drop) and the cast in it (riding, a petition mid-ride, a floor move, settle, adepts never ride) |
| `outline.test.mjs` | Strip sprite outline |
| `vigil.test.mjs` | Night Vigil state, seconds left, the 30 s bell rule |
| `chronicon.test.mjs` | The Week tab's sum of day Tithes, older day files included; the day report without its frontmatter, present or absent; the by-session bars; the usage-window bar (no window, empty frame, ticks with the lowest marked, clamped fill, "estimate" tooltip) and today's window line |
| `overlay.test.mjs` | Tags over characters: the stuck tag yields to the sealed tag and to a petition label; the same-file tag yields to them all; a risky petition through `card.js` `answer` (no *Always*, two clicks within 5 s); the Hall of Honours: when it is asked again, its lines and dashes |
| `card.test.mjs` | Answerable petitions (Orca prompt, OpenCode request) and the answer command each one calls; the watch lines; the cache clock (`scene.js` `candleOf`: lit, low, out per time left over the TTL, only idle scribes at a desk) |
| `petition.test.mjs` | The risk is the backend's field; the gates: no *Always*, the phone's Deny only, the two-click window and its double-click hold (the risky commands themselves: `registry/risk.rs` tests) |
| `settings.test.mjs` | Settings panel (host): saved values clamped, pushes to the backend, scale slider, location, quiet hours, remote view, firewall, token regeneration, updates, categories, Monitoring fields, reset |
| `chronicon.test.mjs` | Chronicon: header plaque, day tabs, summary (totals, bars, hourly), log filter, live rows, stale replies dropped; `openWeek` (open or closed panel, an open that fails) |

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
  (`cyber`, `orbital`, `tower`, `vault`, `darwin`, `breakingbad`). Every other family falls back to the base art.
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
K Sunset Drive, L Arcane Tower, M Vault 111, N Darwin, O Breaking Bad), the row is the sprite's number. `F79` is the Neon Grid shelf, and
`sprites.html#F79` jumps to it. `node tools/sprite_sheet.mjs --list` prints the key. Rows are numbered over the default
theme's list, so a ref means the same sprite in every column; a sprite the hall never draws in a world (a frame the
default art lends but the world's own art lacks: `HANGING_B`, `SHELF_B`, a door's half frame...) shows there as an
empty "not in this world" cell, and its theme gallery leaves it out. The *depth* switch draws each
sprite over the contact shadow it gets in the hall.

**After an art change:**

```sh
node ui/art.test.mjs && node ui/sprites.test.mjs
node tools/sprite_sheet.mjs                     # regenerates docs/sprites/
node tools/sprite_sheet.mjs --theme cyber       # and each other theme with its own art folder under ui/art/
node tools/art_gate.mjs                         # or all of it at once: fails on whatever is still stale (CI runs it)
```

`docs/sprites/` is the committed gallery used to discuss sprites one by one: one GitHub issue per family (Sprite
board), each sprite linking to a prefilled new issue. Design notes:
[sprite themes](superpowers/specs/2026-10-06-sprite-themes-design.md).

**Tools** (`tools/`): `sprites.html` the live viewer, `preview.html` the backend-free hall, `sprite_catalog.mjs` the
sprite list shared by both and by the gallery, `sprite_sheet.mjs` the gallery generator, `breakout_art.mjs` / `enclave_art.mjs` /
`watch_art.mjs` / `suzerain_art.mjs` / `honours_art.mjs` / `lift_art.mjs` (one module per theme or world under `breakout_art/`, `enclave_art/` (on `breakout_art/kit.mjs`), `watch_art/`,
`suzerain_art/`, `honours_art/` and `lift_art/`, each with a shared `kit.mjs` of the drawing helpers; `honours_art/kit.mjs` also holds the plaque's text anchors) the generators of the break-out room, custom room, Watchman, Suzerain (dais and link), Hall of Honours plaque and desktop column lift art, `map_to_art.mjs` / `sheet_writer.mjs` (`sizedSheet`, the sheet writer of the break-out and Suzerain generators) / `png_write.mjs` art conversion helpers, `adm.mjs` the
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

On Linux the same `cargo tauri build` (with the Tauri system libraries, as in `check.yml`) makes
`bundle/appimage/Administratum_<version>_amd64.AppImage` and `bundle/deb/Administratum_<version>_amd64.deb`, each
with its `.sig`.

## Releasing

Bump `version` in `src-tauri/Cargo.toml` and push to `main`. The `release` workflow tags `v<version>` and builds
four legs: the signed NSIS installer on Windows, on macOS a DMG plus a signed updater archive for each arch
(`Administratum_<version>_aarch64.dmg`, `Administratum_<version>_x64.dmg`, `Administratum_aarch64.app.tar.gz`,
`Administratum_x64.app.tar.gz`), and on Linux (Ubuntu 22.04, so the bundles run on systems as old as it) the signed
AppImage and .deb. It then publishes a GitHub Release with `latest.json` (`windows-x86_64`, `darwin-aarch64`,
`darwin-x86_64`, `linux-x86_64` and `linux-x86_64-appimage` for the AppImage, `linux-x86_64-deb`), which installed
copies read to offer the update. Every leg must succeed: a
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
  src/strip/          the desktop strip window (OS calls in windows.rs, macos.rs, linux.rs)
ui/                   the frontend, served as-is (ES modules, no build) + its *.test.mjs checks
  art/                sprite sheets (PNG + JSON) in the key palette; ui/art/<theme>/ for a theme's own art
  fonts/              bundled WOFF2 fonts and their OFL licences
tools/                sprite viewer, hall preview, gallery generator, art helpers, icon script
docs/                 user and developer docs, specs and plans, sprite gallery, README images
Casks/                the Homebrew cask template the release workflow pushes to the tap
.github/workflows/    release (tag, build, publish, homebrew) and fmt
```
