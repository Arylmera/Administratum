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
| `main.rs` | Plugins (notification, window-state, autostart, updater), setup, the 1 s poll loop and its toasts, the small commands (among them `platform`: the OS, `windows` / `macos`, so Settings hides what is Windows-only); every Tauri command is listed in its `generate_handler!`. Crate-wide helpers: `lock`, `no_window`, `emit`, `now_ms` `install_update` emits `update-progress` (`{downloaded, total}`) while it downloads; the poll loop sets the tray tooltip (`window::tray_tooltip`) when the waiting count changes. The poll loop hands the CI watcher (`ci.rs`) each tick's live pushes (`Chronicle::take_ci`), the folders seen and `Config.ci` (never in demo), fills `Session.ci` from its cards, writes its verdict events (a main verdict has an empty session id) and emits `ci-lamps` (the departments' main lamps) every tick; `ci_lamps` and `ci_open` are the commands (`ci_open` takes a session id or a department, never a URL, then `orca::open_url`). |
| `window.rs` | The main window: tray icon and menu, show / hide, the watcher that tells the UI when the window is seen, whether it can stay on top (`on_top_supported`: not under Wayland, where Settings hides the choice) The tray's tooltip is `Administratum · N waiting` (`tray_tooltip`, `waiting_count`; plain at 0). |
| `orca.rs` | Orca's CLI: switch to a session's terminal, read and answer its permission dialog; `open_session` also opens a claude.ai session in the browser (`web:`) or the Claude desktop app (`app:`, `claude://code/<id>`) Each CLI call (switch, read, send) runs through `run`: about 3 s, then killed; a non-zero exit is an error with its masked stderr; no candidate stays `orca not found`. `open_url` is `pub(crate)` (the CI lamp's opener). |
| `poller.rs` | Builds the live roster each tick: liveness of each session pid via Win32, the Orca handle per pid, transcript location, memoised tails and subagents |
| `registry/` | Pure reading of Claude Code's files, no side effects. `sessions.rs` the session records, `tail.rs` a transcript tail (task, context, turn, question, petition, usage limit), `helpers.rs` subagents, `tracker.rs` what is new this tick (one notification per episode), `files.rs` file access, `prompt.rs` the permission-prompt parser and the validators for what goes to Orca or a shell, `risk.rs` the risky-command list (`risk_of`, read once by `tail::pending_risk` from the raw command of every unanswered call of the pending message, sent as `Session.risk`; main.rs fills OpenCode's from its request); `Session.ci` (`CiState`, `CiStatus`) is the CI verdict of the session's latest live push, filled by the CI watcher (`ci.rs`), `null` until then |
| `opencode/` | OpenCode 2.x, a second source beside `registry/`. `db.rs` reads its SQLite database read-only (only while its `-wal` exists, so no file is created in OpenCode's folder; one short transaction per read), `service.rs` its service registration (`~/.local/state/opencode/service.json`, loopback URLs and version 2+ only, the password never leaves the module) and a small `std::net` client for `/api/session/active`, pending permissions and replies, `mod.rs` the sessions it adds to the roster (running, waiting, idle while a TUI runs in its folder, 15 min at most), the rows the Chronicon reads, and `answer_opencode` An idle session is idle since the later of OpenCode's idle time and the end of its last petition (`idle_after_answer`). |
| `chronicle/` | Incremental transcript reader: Chronicon events, the token and working-time Tithe (per department, model, hour and session (a session's total is on the roster as `tokensToday`, card.js lineage), and per department its turns, longest turn (`max_turn_ms`) and edited files; fields added later are `serde(default)` so older day files still load), day files, retention; the usage window (`fine`: 288 five-minute buckets of new Anthropic tokens per day; `day_fine` places them at their real times across DST changes, `fineSince` marks a day file that predates them; `window_of`, pure, with ceilings from the `limit` events' `resetMs` / `hitMs`, kept only over complete kept days; `tithe_answer` adds `window` to today's `tithe_day` only); `opencode.rs` turns OpenCode rows into transcript lines; `conflict.rs` two live sessions on one file (the absolute paths each edited in the last 20 min, a subagent's under its parent; `pairs`, Windows paths compared case-insensitively; main.rs sets `sameFile`, one toast and a `conflict` event per pair and path, the first tick seeding) and `port_in_use` (a `port-in-use` event and the turn's `portInUse`); `honours.rs` the Hall of Honours (`honours` command: the four marks over the kept days, pure `honours` over day Tithes and events); `report.rs` the end-of-day report (`day_report` command), its markdown, and `write_capture`, the only write outside the app data dir (only with `adm.reportOn` and an existing absolute `adm.reportDir`); `classify` also keeps a `CiPush` side record (session, dept, cwd, push command line and output) for a live `git push` only (never on backfill, a failed call or `git -C`), collected on the cursor and taken by `Chronicle::take_ci` for the CI watcher; never serialized |
| `monitor.rs` | Monitoring rules, pure: the config (`adm.tokenAlert`, ... read from `settings.json` at setup and after each `settings_save`, so the UI pushes nothing) and the per-session daily token alert (new tokens, cache reads left out; one toast and a `token-alert` event per session per day, seeded on the first tick). The app cannot see the subscription quota: the threshold is a count the user picks. Stuck sessions (`stuck_of`): busy (never at the shell) and either silent (no write to its transcripts, subagents' included, for `adm.stuckMin`, default 15 min; OpenCode sessions have no files and are never silent) or looping (`adm.stuckRepeat`, default 5, identical tool calls in a row that each got the same error, its volatile parts masked (`mask::volatile`), counted by `chronicle::track_turn`; a success or an edit ends the run; polling tools and bare `sleep` / `watch` never count); one toast and a `stuck` event per episode. `adm.ci` (default off, `"1"` turns it on) is `Config.ci`: the switch of the CI verdict (`ci.rs`; the poll loop hands it to the watcher thread each tick, so a save takes effect at once and turning it off stops every watch); I6 has no toast |
| `ci_main.rs` | The department lamp (I6b), pure core with an injected clock and `gh`, driven by the same watcher thread. One tracker per department of the GitHub default branch (`refs/remotes/<remote>/HEAD`, else one `gh api repos/<owner>/<repo>` cached): a check every 5 min (`IDLE_MS`) reads `commits/<branch>/status` (its `sha` names the head) then `commits/<sha>/check-runs`; an early check at once and again 2 min later when a scribe goes busy to idle or leaves the roster (triggers within a minute make one, none while a head is polled at 30 s); a new head is polled every 30 s until its verdict (I6 rules); a live push watch on the same branch is mirrored (`live`, `adopt`). The lamp is unlit during a rate-limit pause, after 3 failures or on a `gh` auth/access error. A verdict on a new head is a `ci-pass` / `ci-fail` event once per commit |
| `ci.rs` | The CI verdict after a push (I6), pure core. Parses a push's output (`To <url>`, `<old>..<new>  src -> dst`, new branch, forced; an up-to-date or quiet push gives nothing) and GitHub remote URLs (`owner/repo`, anything else none); finds the pushed commit by reading `refs/remotes/<remote>/<branch>` (loose, then `packed-refs`) and `.git/config` directly, worktrees through `git::worktree_repo`, checked against the short SHA; `default_branch_of` reads a repo's default branch from `refs/remotes/<remote>/HEAD`. `evaluate` is the verdict over `check-runs` and `status` JSON (fail at once, pass when every check is `success`, `neutral` or `skipped`, running done/total, where an unknown conclusion such as `stale` stays running, no CI). `Watcher` is the state machine with an injected clock (epoch ms, `tick`): first call 20 s after a push, then 30 s, no CI after 3 min ends silently, 30 min cap is `timeout`, a new push to the same repo and branch replaces the watch, at most 8 (a ninth drops the oldest), a rate limit pauses all until the reset, 3 failed polls in a row is `error`, `card` gives the card line of a session (the scribe lamp reads it as `Session.ci`); the department lamps come from `ci_main.rs`. `gh` is behind the `Gh` trait; `RealGh` runs `gh api repos/<owner>/<repo>/...` (the real path) with arguments direct, `no_window`, from candidate paths, one call at a time; tests use a recording stub. `checks_url` / `valid_checks_url` build and check the commit's checks page for the opener. Nothing runs while `adm.ci` is off. The watcher thread: `Hub` is what it shares with the poll loop (an inbox the loop fills with `submit(enabled, pushes, folders, done)`, a view it reads: `card`, `lamps`, `take_verdicts`, `open_url_for`); `Worker::step(gh, now, input)` is one round, pure over the runner and the clock (off: no `gh` call and every watch dropped; on: `gh auth status` once, then its result, each skipped or failed watch and each rate-limit pause as notes for the `gh` entry of `integration_status`, never a toast); `spawn` starts the thread, which owns the `Watcher`, the clock and the serialized `gh` calls. `Lamp` is the `ci-lamps` shape (sent every tick), `open_target` the pure id-to-URL decision of `ci_open` (a session id or a department, never a URL; `checks_url`, then `valid_checks_url`), `verdict_event` the `ci-pass` / `ci-fail` Chronicon event (a session's push, or a main head with an empty session id) |
| `toast.rs` | Toast wording, pushed by the UI from the active theme; toasts with buttons (petitions, Night Vigil). Windows: tauri-winrt-notification. macOS and Linux: tauri-plugin-notification's actions (`toast::actions`, one `on_action` handler registered at setup, routed by toast id; on macOS two buttons become an *Options* menu whose own button reports the first, so a petition lists Deny first there; only the bundled app has the right notification identity, `tauri dev` posts as Terminal; on Linux the buttons are D-Bus actions, drawn only by a notification server that draws actions). A toast with buttons that cannot be shown falls back to the plain one. In demo mode, `ADMINISTRATUM_TEST_TOAST=1` fires one test toast with buttons whose click is only logged (`test toast click: ...` on stderr) `test_notification`: one plain toast with fixed text, for Settings > Status. |
| `status.rs` | Where failures land. `integration_status` (a command): one entry per integration (name, state ok / warn / error, last message, time), recorded with `report` (store, log and stderr) or `note` (log and stderr); a rotating `administratum.log` in the app data folder (std only, 1 MiB, 3 files). Every message and line is masked (`mask::mask`) first. A test fails when an `eprintln!` stays outside this file, `demo.rs` and the test modules |
| `quiet.rs` | Quiet hours, the same rule as `ui/quiet.js` |
| `mask.rs` | Pure text rewrites. `mask`: secret-shaped strings (API keys, GitHub / Slack tokens, AWS key ids, private key blocks, JWTs, `password=` / `token=` / `secret=` / `api_key=` values, Bearer tokens) become `•••`; applied by `serialize_with` (`mask::ser`, `ser_opt`) on the roster's texts and `Event.detail`, so the WebView, the remote view and new Chronicon lines get the same masked text, and in `prompt.rs` on the peeked dialog. `volatile`: the parts of an error that change between runs (timestamps, durations, hex, 4+ digit numbers, temp paths) as `#`, for the loop rule |
| `git.rs` | A working directory's branch, read from `.git/HEAD` (git is never run) |
| `settings.rs` | `settings.json`: load, shape checks, atomic save; readers of saved `adm.*` values the backend needs (quiet hours, open-folder program) |
| `rooms.rs` | Custom rooms: `adm.rooms` rules (glob or `re:` regex, first match wins) compiled at setup and after each `settings_save`; `assign` sets each session's `room` once per tick after the roster merge (never for a temp session); `rooms_test` checks a pattern for the Settings tab |
| `packs.rs` | Theme packs, the folders of `<app data>/themes/`, untrusted: `list` (`theme_packs`: each plain-named folder, its `id` the repo its `pack-source.json` names, lower-cased (`repo` as typed), else `local/<folder>` (so is the second of two folders naming one repo), its theme folders those holding a `theme.json`) and `read` (`theme_pack_file`, raw bytes; the remote view's `/themes/<rel>`), the only guard on paths: `<dir>/pack.json` or `<dir>/<folder>/<name>.json\|png`, plain segments, a regular file of at most 2 MiB whose canonical path is again such a path inside the root (a link out is refused); `pack-source.json` is never served. Installing, host only (main.rs downloads `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`, HTTPS, no redirect, 60 s, at most 20 MiB read, an answer other than 2xx said in its own words (`download_refused`: moved, refused for now, no such repository, the status), then calls these pure functions): `repo_ok` (GitHub's `owner/repo` shape, the owner `local` refused, also by `list`), `unpack` (one top folder; keeps `pack.json`, a licence and `<folder>/<name>.json\|png` one level deep, regular files only, written by hand create-new, never `tar`'s unpack; 2000 files, 2 MiB each, 50 MiB in all kept, 200 MiB or 100000 entries read, a long name or PAX header at most 64 KiB, a GNU sparse entry or a PAX `size` refused so both passes walk the same entries; an error without a `theme.json`), `install` (`theme_pack_install`: into a `.tmp-*` folder with `pack-source.json`, swapped into the lower-cased `<owner>__<repo>` (a local pack of that name refused, untouched), the old one moved aside to `.old-*` and put back on a failure; a failure leaves the folder as it was; work entries of a crashed run older than ten minutes swept, and all of them at the app's start by `recover`, which puts back a pack left moved aside), `update` (`theme_pack_update`, the repo from `origin`; a local pack refused; a hand-made folder moves to the canonical one, removed unless `same_folder` finds it is that folder under another name: by device and inode on Unix, canonical path elsewhere), `remove` (`theme_pack_remove`; a local pack refused: the app never deletes one); `restart` restarts the app |
| `remote/` | The LAN remote view. `mod.rs` the HTTP server, pairing token and policy, with no Tauri in it; `app.rs` its settings, the backend it calls and the settings panel's commands (remote view, firewall rule). Its API: [remote-api.md](remote-api.md) The server always listens: on every interface while the LAN view is on, on 127.0.0.1 only while it is off (same port, same pairing token; `tools/adm.mjs` uses it). `peek_petition` is behind the remote actions gate. |
| `firewall.rs` | The Windows Firewall rule for the remote view (read unelevated, changed through one UAC prompt) |
| `strip/` | The desktop strip window: placement on the taskbar or above the Dock, or as the desktop column on a screen edge (`Shape`: `Bar` or `Column`, `place_strip` / `place_column`, `column_rect`; the watcher replays the last shape each second), click-through. Windows: a `WH_MOUSE_LL` hook on its own thread (`windows.rs` `ensure_hook`, set on the first `set_click_through`, idle while `ON` is false) decides `WS_EX_TRANSPARENT` on each mouse event (a second thread applies it: a style change waits on the main thread, which the hook must never do) from the hit rects the UI sends (`set_strip_hits`, every 40 ms while they change; `over_hit`, `pass_through`: a press decides, then the state holds until the buttons are up), so a click needs no dwell; macOS keeps the 50 ms cursor poll. OS calls in `windows.rs`, `macos.rs` (the Dock's side and auto-hide, read from its `defaults` at most every 30 s) and `linux.rs`. Linux: Wayland lets no window place itself, so the strip is a second window, `strip`, in a wlr-layer-shell surface (gtk-layer-shell) the compositor anchors to the edge; a shown window cannot become a layer surface, so entering opens `strip` and closes `main`, leaving does the reverse, and the UI starts again in its saved view. tao's fixed window size is freed before the window is shown, or the surface stays black. The UI's sizes and rects are CSS px, turned into GTK px there (WebKitGTK scales its pages by the font DPI over 96). No cursor poll there: `set_click_through` answers true and the UI sends the rects that take clicks (`set_strip_hits`, every 200 ms while they change), which become the surface's input region. Settings' *Keep windows off the strip* (`set_strip_reserve`, false and the row removed on the other OSes) gives the layer an exclusive zone of the strip's size with no panel open (`base`, sent with `place_strip` / `place_column`). The column's height there is the window's own (`colHeight`), the screen's numbers not being CSS px. `strip_supported` is true only where `gtk_layer_shell::is_supported()` is (not GNOME, not X11): elsewhere Settings removes the strip and the column (WebKitGTK's list shows a hidden option) Its failures go to `status.rs`. |
| `demo.rs` | A scripted 60 s roster, events and usage for demo mode |
| `vigil/` | Night Vigil. `mod.rs` the pure rule (arms once every session is stuck on a human, the 120 s countdown) and `report_day` (armed before 04:00: the day before); `app.rs` arming, its tick, toast and Chronicon events, the day report capture on arm and on fire, the shutdown itself The shutdown command's exit is waited for off the poll thread; a failure goes to `status.rs` and the Chronicon. |

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
| `index.html` | Markup: header, card, Chronicon and Settings panels (the styles are in `css/`) |
| `css/base.css` | Font faces, the chrome colours (`:root`, one variable per role, set per theme by `chrome.js`), the scales (`--sp-` / `--spe-` spacing, `--fs-` / `--fse-` type, `--r-` radius, `--z-` layers; px steps named by their pixels, em steps by hundredths of an em), the one focus ring (`--focus`; a parchment surface rebinds it to `--focus-paper`), shared `:disabled` / `:active`, the emphasis token (`--em`, `.em`, `.em-alert`, `.em-soft`: VT323 has one weight, so never bold or italic) and the shared `.panel` shell. Both pages link it |
| `css/hall.css`, `css/panels.css`, `css/mobile.css` | The hall (header, plaques, labels, tags, card, edge arrows, tip, strip rules), the Chronicon and Settings, the phone page. Linked in this order, so the cascade is the old single stylesheet's; a new length uses a token (`css.test.mjs` fails on a raw one) |
| `dom.js`, `format.js` | `el(tag, cls, text)`; `ago`, `hhmm`, `hhmmLocale`, `statusOf`. The shared forms of helpers written two or three times; the callers move onto them with the lanes that own their files |
| `app.js` | Wiring: roster → layout → cast, render loop, hit tests (`actorAt`, `lampAt` for the lit CI lamps, its rect also passes clicks through in the strip), header buttons, chime |
| `viewport.js` | The view: scale and scene size for the window, pan (drag, glide, coast, arrow keys), parallax lag. 39° at Auto: shrinks to fit, never below the flat Auto scale (the flat view's wing and rooms-plan floors included) or `READABLE` (2), whichever is lower, so a big window shows the whole hall and a hall bigger still pans (`viewport.test.mjs`) |
| `overlay.js` | DOM over the canvas, synced each frame: plaques, the Hall of Honours' marks over its plaque, petition labels (a risky one armed by its first Approve click wears the `armed` class and the `petition.armed` text for 5 s; Approve / Deny at least 24 px), a focusable button over each live scribe (`syncScribeKeys`: Enter or Space opens its card), tags (a sealed or stuck scribe, its sheets), edge arrows, hover tip; the CI lamps' hover and click (`litLamps` the lit lamps on `scribeSpots` and `mainSpots`, `lampHit` the pure hit test, `lampTip` the card's CI line for a lamp, `openLamp` calls `ci_open` with the department, `syncLampKeys` a focusable button per lit lamp; an unlit lamp has none of them) |
| `bridge.js` | `invoke` / `listen`, to Tauri or to the remote server (a 403 on an answer, the vigil or the peek is `remote actions disabled`) |
| `card.js` | The selected character's card (`pick`: a click; `cardOnPick`, whether it shows, *Show the card when I click a character*; *Open in Orca* hidden when the click opened the terminal, back if it failed; with no card for the click, a failure is a toast, `open_failed`), and answering permission petitions (a risky one: red, no *Always*, *Approve* armed by a first click, sent by a second within 5 s; the buttons run Approve, Deny, Always, so Always is never next to Approve; a refused remote peek shows the *Remote actions are disabled* note and no button); a Suzerain's lineage (`lineageOf`); the watch lines (`same file`, a port in use, the cache clock); a failed open from the card (the terminal, *Open on claude.ai*, the checks page) is its error line `.open-err` (the links close the card, so a failure shows it again; cleared on the next action or pick); the CI line (`ciLine(ci)`, words `ci.*`, `''` for no `ci` or `none`): a button `.ci-line` that calls `ci_open` with the session id (plain text in the remote view) |
| `petition.js` | Pure: which petitions can be answered and how; `riskOfPetition` (the backend's `risk` field), `allowed` (which answers each surface offers; a remote client gets the phone's rule), `armStep` (the two-click Approve: 400 ms to 5 s apart, a double-click holds) |
| `mobile.html` / `mobile.js` | The remote view's phone page (index.html's head redirects a narrow remote screen to it, `/?hall` stays): petitions (Approve / Deny on a shown permission prompt while remote actions are allowed), Night Vigil, sessions, today's totals |
| `chrome.js` | The page follows the theme: CSS colours, marked texts, toast wording |
| `settings.js` | Settings panel and the persisted store (`settings.json`, localStorage as cache); the Themes tab (`initPacks`, host only: the backend's packs joined with `PACKS`, install by `owner/repo` (`repoOf`, the backend's pattern, a GitHub address or a trailing `.git` taken too), a success said on the line with its theme count, Update and Remove for an installed pack only (a local one gets a hint), *Restart to apply*); Settings > Status (`initStatus`, host only: `integration_status` read when the tab or panel opens and every 4 s while open, a mark plus the state's word, the message and `ago`; the same read fills the `gh` line under the `adm.ci` switch); a refused `settings_save` on the `.save-err` line; `remote_status` failing keeps the remote tab (`.rv-err`) and its `saved` / `loopback` / `error` states show on `.rv-state`; `update-progress` on the update line; *Send a test notification* (`test_notification`) |
| `panel.js` | Open/close behaviour shared by the parchment panels: a focus trap while open (`aria-modal` on the dialogs), Esc closing and returning focus to the opener, and `tablist` (arrow keys, Home / End, roving `tabindex`, optionally selecting on the move) for the Chronicon's day tabs and Settings' categories |
| `chronicon.js` | Chronicon: day tabs and a Week tab (the last 7 days added up, `sumTithes`), Tithe charts, the top sessions by new tokens, the folded day report, event log; the plaque's usage-window bar (`windowGauge`) and today's window line (`windowLine`); `openWeek` (the Hall of Honours' click); a rejected `chronicle_day` / `tithe_day` is an error state with its message (`log.error`), distinct from the silent and empty-day states; the `ci-pass` / `ci-fail` kinds have their icon and `event.*` wording |
| `layout.js` | Hall geometry: department blocks, desks and lecterns, consoles, bays, routes, light phases; `zoneSequence` (custom rooms in rule order, the open hall, the break-out room), the west wing (`hallOf(bays, size, wing)`: the hall moved east by `wx`, `hall.base` the hall without it, `hall.rooms` each room's rect, lanes, corridor and door, geometry only: the rooms share the wing's full height, each its desk rows plus an even share of the spare rows, the last down to the hall's bottom, its door on the lane nearest its middle, or the layout's `wing[].door` clear of the break-out room's fence (`wing[].share` caps the share then); `wingZones` adds each room's colour and emptiness from the layout; `layoutDepartments` packs room departments there and returns `wing`), `zonesOf` (the break-out room's fence and gates); `scribeSpots(blocks, H, desks)` where each scribe's CI lamp stands (beside its desk, inside the room's top line in the rooms plan; none in strip and column) and `mainSpots(blocks, H, desks)` the department lamp's fixed spot (the block's east end, behind a console when one overlaps it; the rooms plan: the block's `mainAt`, a column in the room's `COMPUTER_W` strip beside its computer; strip and column: the plaque row) |
| `hallplan.js` | The hall plan in force (`settings.hallPlan`): `open`, the open space, or `rooms`, the rooms round the Sanctum (`layout.js` `mirrorHall`, `packMirror`, `mirrorRoute`; `actors.js` `asleep` and the room computers, drawn by `scene.js` `drawComputers` and `scene39.js` as `ROOMCOG`; `theme.js` `inRooms` words). Everything else follows `hall.sanct` |
| `rooms.js` | Custom rooms in force (`adm.rooms`): `roomsOf` (the lenient parse, `rooms.rs`'s caps), `setRooms`, `tintOf` (a rule's colour on the sash slot `y`) |
| `actors.js` | Scribes and adepts: destinations, walking, napping, compaction ritual, chronicle reactions, interactions (a finished adept's report, a forked child's order, the Magos's greeting) |
| `gestures.js` | Pure: a seated scribe's optional gesture (`gestureOf`: think, wonder, stretch, their timings, a beat per scribe from its id), the frame names (`up think`... flat, `N think`... 2.5D); `actors.js` `gestureNow` asks it. The stretch only after a turn ends (`Cast.sync` sets `a.turnEnded` on busy or shell to idle, `Cast.update` spends it as the scribe dozes off at its desk: `a.dozeAt`), never on a pose change; the puzzled wonder once per tool error at the desk (`chronicle`: `a.puzzleAt`) |
| `glide.js` | Furniture easing to its new place when the hall reflows |
| `scene.js` | Canvas drawing of the flat hall: the static background and each frame; `candleOf` the cache clock of a desk (no world has a low-candle frame: "low" is the lit desk with a smaller light pool), shared with `scene39.js`; with a west wing, the hall drawn moved east and `drawWing` (its walls, floors, the west wall; its doors in `drawDoors`) |
| `view.js` | The view switch: Flat (identity) or the 39° projection; the strip kinds (`view.strip`, `view.column`) |
| `iso.js`, `isohall.js`, `scene39.js` | The 39° view: z-buffer engine, its static hall (with a west wing, `wingPlan`: the hall's plan moved east, the wing's floor and walls, the west wall's doorways), its per-frame layer |
| `faces.js` | Face sheets: one art source split into faces, drawn flat or built into 39° volumes |
| `liveliness.js` | Pure: a busy scribe's typing arms (`typing`) and its desk screen (`screenRows`, by the kind of tool its task line names, `workKind`; `isGlass`: only where the world's desk art has a screen), and a window beam's movement (`beamLife`, drawn by `lighting.js`) |
| `ambience.js` | The room's air, both views: the floor channels' pulses (`flowLights`, lights), the sparks over the braziers (`drawAmbience`, after the lighting) |
| `mood.js` | The hall's mood, eased: working sessions and stale petitions (`moodOf`, `stepMood`) set the pulses' and the Magos's pace and shift the darkness a little (`moodLevel`) |
| `backwall.js` | The back wall's slow life over the cached background: the cloud's light on the window glass (`drawClouds`) |
| `depth.js` | Shadows, cast shadows and ambient occlusion computed from the sprites |
| `lighting.js`, `sun.js` | Darkness, light pools and glows; sunrise and sunset (NOAA) for *Auto* lighting. In the 39° view a desk-level light may carry its own `h` (glow height) and `d` (px south of its flat point), else `lift39` (18, 10); `scene.js` sets them on the candle (20), slate (16), console screen (7) and flying skull (12) |
| `strip.js`, `stripwin.js`, `outline.js` | Desktop strip: its geometry, its window (the bar or the column, `adm.stripKind`), the 1 px outline around sprites |
| `column.js`, `lift.js` | Desktop column: its floors, layout and routes (a cross-floor walk has one lift waypoint); the lift, a pure SCAN scheduler (FIFO calls, 3 riders, event-exact `step`) the cast rides (`actors.js`) |
| `sprites.js`, `art.js`, `png.js` | Sprite loading: art files (PNG + JSON) into palette rows, PNG decoder. At start only the base art, the active theme's and the packs' load; another theme's loads when `theme.js` `switchTheme` asks (the old theme stays until it is in), and `loadAllArt()` loads every world (the art tools, the gallery, the tests that visit every theme). `faces.js` follows the same split |
| `room.js`, `wallart.js` | The room from tiles (fill rules), the back wall's window and hangings |
| `theme.js`, `themes.js`, `themepack.js`, `artcheck.js` | Themes: every colour and the wording; `setTheme`, `t()`; the loader of the themes' `theme.json` files and of the packs (`loadPacks`, `PACKS` and its warnings, `guarded`; at start the backend's packs, `readPack`), their check and recolouring; the shape of a theme's sheets |
| `quiet.js` | Quiet hours, the same rule as `quiet.rs` |
| `vigil.js` | Night Vigil state (armed, deadline, countdown) as the backend emits it, and the 30 s bell rule |
| `cilamp.js` | The CI lamps (I6), state only: the `ci-lamps` event and one `ci_lamps` at start (through `bridge.js`, so the remote view has it), `frameOf(state, now)` (running: `CILAMP.amber` / `CILAMP.amber_dim`, one blink a second; pass green; fail red; else off), `lampsAt(spots, now)` joins `layout.js` `mainSpots` with the list (the scribe lamps come from each session's `ci`); `LENS` the lens's fixed signal colours (a `blit` palette override, so no theme recolours them); `lampLights` the glow of a lit lens (without it the lens vanishes under the night layer); empty list, nothing drawn. `scene.js` (flat, strip and column) and `scene39.js` (an upright billboard) draw it; art families `CILAMP` (a scribe's, `ui/art/cilamp.*`) and `CIMAIN` (the department's, larger, 7 x 14; `ui/art/cimain.*`), `tools/cilamp_art.mjs`, base art only. The lens differs by state in shape as well as colour (pass a bright check, fail a dark X, unlit flat dark glass, running the round glinting lens): `tools/cilamp_art/kit.mjs` `LENS_ROWS`, `tools/cimain_art/kit.mjs` `INNER`; `cilamp.test.mjs` checks pass and fail differ in shape and in grayscale for every sheet |

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
1 to 40), `view` (flat, 39), `scale`, `temp=1` (temp sessions), `orca=1` (every session in an Orca terminal: the
card answers petitions, a click takes the Orca path).

```sh
python -m http.server 8123        # from the repo root
# http://localhost:8123/tools/preview.html?mode=candles&theme=vault&n=12&view=39
```

Where a frame's time goes: `tools/perf_profile.mjs` loads the preview in a headless Chromium over CDP and prints the
main thread's load, the CPU profile's self time by function and by module, and the canvas's native calls charged to
their JS caller; `--ops` also times each large draw (a quarter of the canvas or more) by caller and blend mode, `--skip
'lighting.js:156,...'` leaves those draws out (an experiment), `--q 'theme=vault'` adds to the preview's query. It runs
without a GPU: the canvas rasters on the CPU, and the full-canvas compositing passes do not show on the main thread.
Compare runs of 20 s or more, alternated, without `--ops` (it costs about 30 ms/s itself).

```sh
node tools/perf_profile.mjs --port 8123 [--view 39|flat] [--plan rooms|open] [--n 28] [--seconds 20] [--ops]
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
| `hallplan.test.mjs` | The hall plan: the switch, the rooms plan's geometry, places, walks, props, shells at the room's computer, naps at the desk, words |
| `layout.test.mjs` | Layout, routes, stable desks, compact lecterns and bays |
| `sprites.test.mjs` | Sprite sizes, palette chars, symmetry |
| `art.test.mjs` | Art files: PNG decoder, key palette, sheets; each world's Hall of Honours plaque is its own silhouette, never the base one; each world's lift its own frames at the base sizes |
| `themepack.test.mjs` | A theme from its JSON: the recolouring by hue range, the check and its refusals (unknown keys, colour forms, worlds, the wording a pack cannot set: `LOCKED`), the built theme of a world and of a style (its recoloured rank with its own keys over it, its text laid over its base's) |
| `themes.test.mjs` | The loader: the shipped themes in order, a style's art and world, `sprites.js` alone brings them, an unknown art family refused before any read, each theme's folder (where it was loaded from), every theme folder listed in `themes.json` and every listed id on disk, a broken theme refused naming it and the cause (not JSON, no file, a style as a base). Packs, over an in-memory reader: a style of a shipped world, a pack's own world and its style in either order, a broken theme left out with its reason while the rest of its pack and every shipped theme stay as they were, a base in another pack refused, a theme rewording a locked text refused, a folder that is not a plain name never read, hostile packs and readers never throwing; a dropped world takes its styles; `guarded` falls back from a pack's theme and rethrows under a shipped one; in a child process, a pack's sheets and faces checked as `sprites.js` and `faces.js` load them (a frame this version does not know left out with a warning, the theme kept; a known frame at another size, or a fill rule naming an unknown frame, refused; a pixel off the palette, an unknown family, an unknown face kind, a faces.json without its PNG), and a style's own faces; on a small heap, hostile files a few bytes each refused before they allocate (a frame rect outside its image or of zero width, too many frames, a second IHDR, an indexed PNG of depth 255 or without PLTE, no IDAT, an IDAT inflating past its header); at start, on the fake backend, a listed pack's theme registered after the shipped ones, a file the backend will not serve read as ENOENT, and a list call that rejects, hangs past 10 s or answers nonsense, or a read that hangs, leaving the shipped themes as they are |
| `theme.test.mjs` | Themes: complete palettes, runtime switch; chrome contrast in every theme (each foreground over the fill it sits on, text >= 4.5, icons and borders >= 3; the focus ring on every surface it is drawn on, `--paper-ink-2`, the Chronicon's chart colours and the phone's `--dim` too, and a deliberately low fixture must turn the check red; a light-chrome theme sets `--on-blood` / `--ink-on-blood` / `--pink-on-blood` / `--green-on-blood` for text on `--blood`, `--flame-on-wax` for the alarm, `--honours-ink` for the Hall of Honours words, whose plaque fields it is checked against), with the shortfalls already shipped listed and asserted still failing |
| `css.test.mjs` | The stylesheets: no raw padding / margin / gap / font-size / radius / z-index length outside the token block, one `:focus-visible` rule drawn on `--focus`, no bold or italic, the `.panel` shell written once, the pages' `<link>` order |
| `dom.test.mjs`, `format.test.mjs` | `el`; `ago` (a pinned clock), `hhmm`, `hhmmLocale`, `statusOf` |
| `sun.test.mjs` | Sun times and *Auto* phases |
| `quiet.test.mjs` | Quiet hours, windows across midnight |
| `depth.test.mjs` | Footprints, shadows, cast lights, AO bands |
| `lighting.test.mjs` | Flat lighting unchanged, 39° light heights |
| `view.test.mjs` | Flat identity, 39° projection, scene size, inverse |
| `iso.test.mjs` | 39° z-buffer: projection, boxes, decals, outline, depth sort |
| `lazyart.test.mjs` | Lazy theme art: with a counting `fetch` stub, the start asks for the base sheets and the active theme's only; a switch waits for the new theme's sheets (the old theme stays meanwhile) and asks for those only; a switch back asks for nothing; the last of two overlapping switches wins; `loadAllArt()` loads every theme |
| `faces.test.mjs` | Face sheets: flat frames rebuilt exactly, 39° volumes |
| `flathall.test.mjs` | Flat hall: the static background's draw calls (hashes) |
| `isohall.test.mjs` | 39° hall: room plan, prop placement, render (pixel hashes) |
| `scene39.test.mjs` | 39° dynamic layer: depth order, seats, hit tests, gate |
| `strip.test.mjs` | Strip geometry |
| `lift.test.mjs` | The lift: delivery, FIFO trips at CAP, same-way pickup, starvation bound, repeat calls, cancel, retarget, new stops, the same events for any dt split |
| `column.test.mjs` | Column geometry (floor ys, floors moving, the right side mirrored, pitch, overflow, routes, the scale drop) and the cast in it (riding, a petition mid-ride, a floor move, settle, adepts never ride) |
| `outline.test.mjs` | Strip sprite outline |
| `vigil.test.mjs` | Night Vigil state, seconds left, the 30 s bell rule |
| `rankart.test.mjs` | Rank art: the rank layer (a rank's own frame, the plain one where it drew none, left mirrored, its gestures only with its own seat, 39°), the same-source rule, per-rank anchors, the actors' body, feet and glyph at their rank, the viewer's rank rows; no shipped world outside the 40k Ordos with a rank frame |
| `interact.test.mjs` | Interactions: a finished adept's report (once, over resyncs, never stuck), a forked child's order, the Magos's greeting |
| `liveliness.test.mjs` | Liveliness at the desk: the typing arms, the desk screen, which worlds have glass, the wiring and the Off setting |
| `ambience.test.mjs` | Ambience: pulses on the channels' lines and faded at the walls, sparks in bounds and faded at both ends, drawn only where they belong, the setting's amounts |
| `mood.test.mjs` | Mood: its target from the roster, the easing at any frame rate, the clocks, the light within bounds, nothing when off |
| `backwall.test.mjs` | Back wall: the clouds, and which worlds have a sky |
| `gestures.test.mjs` | Scribe gestures: the chooser (think and wonder recur at their pace, each scribe out of step, the stretch, the puzzled wonder after a tool error, nothing away from the desk or for a frame the world lacks), every shipped world without them, a pack's gesture frames accepted at the seated size and the warning for one without its seated frame, the frame replacing `up 0` / `N 0`; over `Cast.sync` / `update`: no stretch for a scribe first seen idle, on arriving, after `settle` or a reset, or on a walk back while idle; once at a turn's end, at the desk or on sitting after walking back; one wonder per tool error at the desk |
| `chronicon.test.mjs` | Chronicon: header plaque, day tabs, summary (totals, bars, hourly), log filter, live rows, stale replies dropped; `openWeek` (open or closed panel, an open that fails); the Week tab's sum of day Tithes, older day files included; the day report without its frontmatter, present or absent; the by-session bars; the usage-window bar (no window, empty frame, ticks with the lowest marked, clamped fill, "estimate" tooltip) and today's window line; the empty-day box (`log.empty`), event icons coloured by `--chart-*` classes (no hex in the markup, the cache bar hatched), the day tabs moved by the arrow keys |
| `overlay.test.mjs` | Tags over characters: the stuck tag yields to the sealed tag and to a petition label; the same-file tag yields to them all; a risky petition through `card.js` `answer` (no *Always*, two clicks within 5 s); a click whose terminal does not open (the card up with the card on a click, else the `open_failed` toast); the Hall of Honours: when it is asked again, its lines and dashes |
| `bridge.test.mjs` | A 403 on `peek_petition` rejects with `remote actions disabled`, and the remote card then shows that note and no answer button |
| `card.test.mjs` | Answerable petitions (Orca prompt, OpenCode request) and the answer command each one calls; the watch lines; the cache clock (`scene.js` `candleOf`: lit, low, out per time left over the TTL, only idle scribes at a desk); whether a click shows the card (`cardOnPick`: the setting, a petition to answer, no terminal, the remote view) |
| `petition.test.mjs` | The risk is the backend's field; the gates: no *Always*, the phone's Deny only, the two-click window and its double-click hold (the risky commands themselves: `registry/risk.rs` tests) |
| `panel.test.mjs` | The parchment panels' behaviour on a small page: the focus trap (Tab and Shift+Tab wrap, disabled / hidden fields skipped), Esc and the close button returning focus to the opener that opened the panel, and `tablist` (arrows, Home / End, wrap, roving `tabindex`, select on move) |
| `settings.test.mjs` | Settings panel (host): saved values clamped, pushes to the backend, scale slider, location, quiet hours, remote view, firewall, token regeneration, updates, categories, Monitoring fields, the card on a click, reset; Added themes (the rows, a problem shown as text, a name refused before any call, a refusal, update, remove, install with its buttons greyed, restart) and a pack's world and style in the pickers; Reset to defaults arming on the first click; every setting key with exactly one control in the shipped markup; the categories as a tab list moved by the arrow keys |
| `mobile.test.mjs` | The remote view's phone page (`mobile.js`), on a hand-made DOM: petitions longest waiting first; the roster's order, forked children under their parent; the Night Vigil in words; Approve / Deny only while remote actions are on and on a shown permission prompt (never *Always*), Orca's prompt read again before answering, a 403 turning the buttons off, stale peeks dropped; a risky prompt: its reason in red, Deny only; rows rebuilt only on a change; server text shown as text; the empty line with no petition (`mobile.empty`), the risky class on a risky row, 44 px targets |

---

## Sprites and themes

Sprites and the room's tiles (floor, walls, pipes, doors) are art files in `ui/art/`: one PNG sheet per family,
drawn in the key palette `ui/art/key.gpl` (one character per colour slot; load it in Aseprite or Piskel), plus a
JSON file with the frames, anchors and the tiles' fill rules. Colours are never in the art: every colour (the art's,
the ones drawn in code, the page's chrome) and the wording come from the active theme. A rank (`ui/ranks.js`) may
draw its own body: frames `<rank> <frame>` in the scribe and adept sheets, used only from the plain frame's own source
(`ui/sprites.js` `rankLayer`; format in [theme-packs.md](theme-packs.md), "Ranks").

- `ui/theme.js` holds the base theme (Ordo Administratum) and `WORLDS`, in code. Every other theme is data: a folder
  `ui/art/<id>/` with its `theme.json` (only what it changes) beside its own art, and its id in the ordered list
  `ui/art/themes.json`. `ui/themes.js` loads them in that order, `ui/themepack.js` checks each file and builds the
  theme from it. A theme is parsed (`JSON.parse`), never evaluated; a file that fails the check stops the load with
  `theme <id>: <problem>`.
- To add a theme: make its folder with a `theme.json` (`format: 1`, `name`, then `world` or `base`, and the parts it
  changes: `px`, `rank`, `ink`, `light`, `ui`, `text`, `sash`, `art`, `notes` for the comments), and put its id in
  `ui/art/themes.json`, after its base if it has one. A world theme naming a new world brings its `worldName`.
  `px`, `rank` and `sash` colours are `#rrggbb`; `px`, `ink` and `light` take only the keys Ordo Administratum has.
- A **style** names a `base` (a world theme, or `tier2`) and `bands`: hue ranges, each `{ hue: [from, to], to, sat,
  light }` (degrees; a range with from > to wraps past 360), turning every colour of the base's whole resolved look
  whose hue falls in it to hue `to`, saturation x `sat`, lightness + `light`. Greys and colours outside every band
  keep theirs, and so do skin (`:` `;`), the sashes and the base's art (`artOf`) and wording, so the alarm red and the
  gold rank trim stay. Then the style's own parts lay over the result. Its `text` lays over its base's authored text
  section by section, a shallow merge: a style that sets one key of `prefs` replaces the base's whole `prefs`. The
  four Neon Grid styles (Corpo Tower, Rain City, Green Code, Sunset Drive) recolour its pink neon, violet coolant,
  night-blue walls and cyan chrome this way; each carries a few explicit `px` and `ink` overrides (the blended plate
  sheens, `lampDead`) so it comes out exactly as it did when an accent recoloured only what Neon Grid declared.
- A theme belongs to a **world** (Warhammer 40k, Cyberpunk, Space, Fantasy, Fallout). Settings picks the world, then
  one of its themes as the **style**.
- A theme with its own art lists the families it redraws in its `art` field (a name that is not a known family is
  refused before any file is read); the files sit beside its `theme.json` in `ui/art/<theme>/`. Every other family
  falls back to the base art. A style with its own art and a `faces.json` draws its own face sheets, else its base's.
- **Packs**: themes from outside, folders the backend lists (`<app data>/themes/`). `themes.js` `loadPacks(packs,
  read)` registers them after the shipped themes, before `sprites.js` and `faces.js` load the art: each pack's theme
  is `<pack>:<folder>` (`alice/p:pink`), its world `<pack>:<world>` unless it names a shipped world, which it joins
  (`themepack.js` `scoped`). Those ids are registry keys only: a pack's files are read through its `read(dir,
  '<folder>/<file>')`, the folder a plain name, never a path built from an id (`artRootOf` of a pack's theme is that
  reader; `art.js` takes a folder URL or a reader). A pack's world themes register first, then its styles; a style's
  base is a world of the same pack or a shipped one. Its sheets and faces are checked against the default
  (`artcheck.js`), its PNGs at most 2048 px a side (one IHDR, first; never inflated past what it holds), its frame
  rects whole numbers inside their image, at least 1x1, at most 1024 frames and 2048² px in all. Forward compatibility:
  a frame name this version does not know (a pack drawn for a newer app, or a typo) is left out of the sheet before
  the check (`artcheck.js` `knownFrames`), with a warning in `PACKS` (`warnTheme`; Added themes and `theme_pack.mjs
  check` show it, the latter exit 0); the theme loads without it. Its rect and pixels are still read and count toward
  the limits, it can be named by nothing (a fill rule naming it is refused), and the shipped art stays strict
  (`checkSheet` alone, `art.test.mjs`). Any problem (bad JSON, a failing check, a missing file, a reader
  that rejects) leaves that theme out with its reason in `PACKS` (`dropTheme`; a dropped world takes its styles), and
  never stops the app or changes a shipped theme; a shipped theme's failure still throws. The second net: the frame
  functions of `app.js` and `mobile.js` run in `guarded`, so a draw that throws under a pack's theme leaves it out
  and goes back to Ordo Administratum. An error on a sheet names `<theme folder>/<file>`. At start, `themes.js` ends
  by loading the packs the backend lists (`theme_packs`), read with `readPack` (`theme_pack_file` on the host, the
  asset route `/themes/<dir>/<path>` on the phone; a file the backend will not serve is ENOENT); every call is bounded
  by 10 s, and a failed list starts the app with the shipped themes only (no backend, as in the tools and tests: no
  packs). For authors: [theme-packs.md](theme-packs.md) (the guide, its families table generated by
  `node tools/theme_pack.mjs families`), [theme-pack-template/](theme-pack-template/), and `node tools/theme_pack.mjs
  check <folder>`, which loads a pack through `loadPacks` with a file-system reader, then `sprites.js` and `faces.js`,
  so a pack that passes is one the app loads; it also warns about what the installer would drop.
- A scribe's arms (`actors.js` `drawCarried`): a world's own body has them, so it draws none separately; the 40k robe
  has none, so the base art draws two mechadendrites over the desk (`arm`, mirrored for the left), never lent to a
  world's own scribe. A finished long turn raises the scroll, the mechadendrites with it (`liftOf`).
- A scribe's gestures at its desk (`gestures.js`, [theme-packs.md](theme-packs.md#gestures)): optional frames of the
  scribe sheets, `up think` / `wonder` / `stretch` instead of `up 0`, `N ...` instead of `N 0`. `sprites.js` takes a
  flat one only from the sheet that draws the world's `up 0` (`SCRIBE.gesture`, `SCRIBE39.gesture`); `artcheck.js`
  accepts them in a pack's sheet at the seated frame's size, and `gestureWarnings`
  (a `theme_pack.mjs check` warning) names one in a sheet without its own seated frame. Drawn as the body, they take
  no arms overlay, no Zs and no pipe. In the viewer and `--list`, a sprite only other worlds draw gets a row after
  column A's list. The 40k robe's are generated (`tools/gesture_art.mjs scribe` and `scribe39`: the seated frame, hood
  and arms moved, for the plain body and each rank; `rank_art.mjs` runs it).

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
node tools/sprite_sheet.mjs --theme cyber       # and each other theme with its own art folder under ui/art/
node tools/art_gate.mjs                         # or all of it at once: fails on whatever is still stale (CI runs it)
```

`docs/sprites/` is the committed gallery used to discuss sprites one by one: one GitHub issue per family (Sprite
board), each sprite linking to a prefilled new issue. Design notes:
[sprite themes](superpowers/specs/2026-10-06-sprite-themes-design.md).

**Tools** (`tools/`): `sprites.html` the live viewer, `preview.html` the backend-free hall, `sprite_catalog.mjs` the
sprite list shared by both and by the gallery, `sprite_sheet.mjs` the gallery generator, `breakout_art.mjs` / `enclave_art.mjs` /
`watch_art.mjs` / `suzerain_art.mjs` / `honours_art.mjs` / `lift_art.mjs` / `cilamp_art.mjs` / `roomcog_art.mjs` (one module per theme or world under `breakout_art/`, `enclave_art/` (on `breakout_art/kit.mjs`), `watch_art/`,
`suzerain_art/`, `honours_art/`, `lift_art/`, `cilamp_art/` (the CI lamp: `tier2` only, every world uses it) and `roomcog_art/` (the rooms plan's room computer, `ROOMCOG` lit and `ROOMCOG.off`: every world its own; `all` writes the 14), each with a shared `kit.mjs` of the drawing helpers; `honours_art/kit.mjs` also holds the plaque's text anchors) the generators of the break-out room, custom room, Watchman, Suzerain (dais and link), Hall of Honours plaque, desktop column lift and room computer art, `theme_pack.mjs` the theme pack check and the guide's families table, `map_to_art.mjs` / `sheet_writer.mjs` (`sizedSheet`, the sheet writer of the break-out and Suzerain generators) / `png_write.mjs` art conversion helpers, `adm.mjs` the
command-line client of the running app, `perf_profile.mjs` where a frame's time goes (below), `make_icon.py` the app icon.

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
