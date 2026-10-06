# Administratum

A Windows desktop widget that shows every Claude Code session on your PC as a tech-priest scribe in a pixel-art
Mechanicus scriptorium, and calls you when one of them needs an answer.

![The hall: departments of scribes at their desks, adepts at their consoles, a petition queued before the Magos](docs/img/hall.png)

Administratum watches Claude Code's own session files and never writes to them. A session waiting on you
walks to the Sanctum and queues before the Magos. You get a Windows toast and an optional chime, and for
permission prompts in Orca terminals you can approve or deny from the widget itself.

---

## What it shows

Each running Claude Code session is a **scribe**. Each project (the last segment of the session's working
directory) is a **department**, a coloured rug with its name on a plaque. A session's active subagents are its
**adepts**.

| You see | It means |
|---|---|
| Scribe at its desk, screen and candle lit | Session is working (`busy`) |
| Scribe at the cogitator bank (back wall) | Session is running a shell command. It stays there 10 s after the last one so quick Bash calls don't send it back and forth |
| Scribe dozing at the desk (`z z`), candle out | Turn done, waiting for your next prompt (`idle`) |
| Small brass cog turning on the desk corner | Idle, but a background shell it started is still running. The scribe stays at its desk |
| Scribe at the recaff dispenser, then asleep on a Refectorium bench | Idle for more than 2 min with no background shell. If every bench is taken, it dozes at its desk |
| Scribe queued in the Sanctum holding a sealed scroll, red label above it | **Petition**: the session is waiting on you. The label says what it wants (`approve Bash`, `input needed`...) and for how long |
| Beacon on the Sanctum wall sweeping red, servo-skull hovering by the petitioner, header counter flashing | The petition has waited past the stale mark (5 min). You get a second toast and a different chime |
| Small grey figures at consoles in the department | **Adepts**: the session's active subagents, four consoles per desk slot. One leaves when the parent transcript reports it completed, or when its own transcript has been quiet for 10 min |
| Paper piled on the desk | The session's context. The desk is full at 50 % of the model's window. Past that, sheets fall around the desk and spread over the department floor. Red sheets from 90 % |
| Scribe carrying its pile to a brazier at the gate and burning it | **Compaction**: the session's context was compacted. If the scribe is away from its desk, the pile goes up in a puff instead |
| Gilded robe / plain red robe / faded robe | **Model rank**: Opus or Fable = *Magos*, Sonnet and others = *Tech-priest*, Haiku = *Novice*. Adepts carry the same marks |
| Scribe walking in through the grand gate / gathering papers and walking out | Session started / session ended |
| Purity seal stamped on a parchment on the desk (up to 3 stay) | A `git commit` succeeded |
| Servo-skull picks up a seal and flies out of the gate | A `git push` |
| Green lamp on the desk (20 s) / blinking red lamp | Test run passed / failed (`cargo test`, `npm test`, `npm run test`, `pnpm test`, `yarn test`, `pytest`, `vitest`, `jest`, `go test`) |
| Spark and smoke puff on the desk | A tool call returned an error |
| Scribe raises its scroll, gold glint, soft chime | A turn that took 5 min or more finished |
| Scribe stays at its desk under a `sealed · resets 14:00` tag | The session hit a subscription usage limit. One toast per wave: sessions sealed until the same hour share it. The tag goes at the reset hour or at the next prompt |

Adepts play a smaller version of these reactions at their console.

**Space.** A scribe keeps its desk. An empty desk is held 3 min for a newcomer from the same department, and
an empty department block stays 5 min, so a short restart doesn't reshuffle the hall. When the hall is full, desks
turn into compact lecterns (6 per row instead of 4). If that is still not enough, the hall grows downward by up to
6 bays. Only past that point does a `+N in the stacks` plaque appear. Their petitions still toast and count in the
header. The hall shrinks back once it has had room to spare for a minute.

**Lighting.** *Auto* follows the clock: day 08–18 h, dusk 06–08 h and 18–21 h, night otherwise. If you set a
latitude and longitude in Settings, *Auto* follows the real sun instead: civil dawn and dusk plus the half hour of
low sun count as dusk. The *Auto* button's tooltip then shows today's sunrise and sunset. *Full light* and
*Candles* pin the day or night look. At night the hall is dark, apart from pools of light around the candles,
braziers, screens and coolant channels.

**Header.** From left to right: lighting switch, petition counter, Tithe plaque (`⛁ tokens · working time`
today), Chronicon, Settings, mute chime, hide to tray. To move the window, drag the header.

---

## Install

### Requirements

- Windows 10 or 11 (tested on Windows 11). Other platforms are not supported.
- Microsoft Edge WebView2 Runtime. It ships with Windows 11. On Windows 10 the installer fetches it if it is missing.
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (tested with 2.1.283).
- Optional: Orca (tested with 1.4.220), needed to jump to a session's terminal and to answer
  petitions from the widget. The `orca` CLI must be on `PATH`, or installed at
  `%LOCALAPPDATA%\Programs\orca\resources\bin\orca.exe`.

### Installer

Download Administratum_<version>_x64-setup.exe from the [latest release](https://github.com/Arylmera/Administratum/releases/latest). Windows SmartScreen may say "unknown publisher" (the installer is not code-signed): More info > Run anyway. Later versions install from Settings > System > Updates.

Run the setup. On first launch the widget opens as a frameless, always-on-top 700 × 500 window with no taskbar
button. It lives in the system tray. Its position and size are remembered between runs.

To launch it at sign-in, turn on **Start at login** from the tray menu or from Settings. This is off by default.

---

## Usage

### Characters and the card

- **Hover** a character to see its name.
- **Click** a scribe or adept to open its card. If the session runs in an Orca terminal, that terminal is also
  brought to the front. Click again, press **Escape**, or click elsewhere to close the card.
- The card shows the scribe's name and department, state and time in state, context (`184k / 200k (92%)`),
  model and rank, the last task line, and the project path. An adept's card shows its subagent type, its owner,
  model, context and task.
- **Open in Orca** switches Orca to the session's terminal. It is shown only for sessions started inside Orca,
  which Administratum detects from the `ORCA_TERMINAL_HANDLE` variable of the `claude.exe` process.
- **Open on claude.ai** opens the session's `https://claude.ai/code/...` page in your default browser. It is shown
  only when the session record carries a claude.ai session id.
- Clicking a petitioner also copies `name path` to the clipboard, so you can find the pane yourself.
- **Click a department's plaque** to open its folder (the most recently active session's working directory) in
  Explorer, VS Code or a command of your own (Settings > System). A branch other than `main` / `master` shows under
  the department's name, read from `.git/HEAD` (worktrees included).

### Answering petitions

![A scribe's card with Approve, Always and Deny](docs/img/card.png)

When a petition is a **permission prompt** (`approve ...`) in an **Orca** terminal, the widget can answer it.
Use **✓ / ✗** on the queue label, or **Approve / Always / Deny** on the card. *Always* picks the prompt's first
"Yes, ..." option (don't ask again / allow all edits). If the prompt has no such option, it returns an error.

The petition toast itself carries **Approve** and **Deny** for the same prompts (permission, in Orca). A click runs
the same check below. If the petition was already answered in the terminal, nothing is typed. *Always* stays on the
card: on a toast it could be clicked without reading the prompt.

What happens when you click:

1. The backend runs `orca terminal read --terminal <handle> --screen --json` to read the terminal as currently
   rendered.
2. It checks that the screen really ends with a Claude Code permission dialog. That means the last
   `Do you want ...` line, followed by options numbered from 1, starting with a plain `Yes` and including a
   `No`, with nothing under them but a short footer. A dialog that has scrolled up under later output, or an
   input box below the options, does not count.
3. Only then does it run `orca terminal send --terminal <handle> --text <digit>`, typing the **single option
   digit** for your choice.

Nothing read from the screen is sent anywhere or shown back. Only that one digit is typed. If the check fails,
nothing is typed and the card says *No permission prompt visible — open the terminal*. Free-text petitions
(`input needed`, open dialogs) can't be answered from the widget. Use **Open in Orca** for those.

### Chronicon and Tithe

![The Chronicon: today's tithe, per-department and per-model bars, hourly charts and the event log](docs/img/chronicon.png)

To unroll the Chronicon, click the scroll icon or the Tithe plaque in the header. It has one tab per day: today
and the 6 previous days. Each day shows:

- **Tithe**: tokens (new input/output vs. cache), working time (time sessions spent busy or in a shell),
  event count, tokens and time per department and per model, and 24-hour charts of tokens and working minutes.
- **Chronicle**: the event log, newest first. It covers commits, pushes, test passes and failures, tool errors,
  long tasks finished, arrivals, departures, petitions opened and answered, compactions and usage limits. You can filter it
  by department. While the Chronicon is open, new events appear at the top.

Tokens are counted once per assistant message. Subagent tokens count toward the parent's project. On first sight
of a transcript, only today's entries are read. Earlier days are not reconstructed.

To close the Chronicon, click ✕, press **Escape**, or click outside it.

### Settings

![The settings panel](docs/img/settings.png)

Open Settings with the gear in the header. Changes apply immediately.

| Setting | Default | Range | Effect |
|---|---|---|---|
| Always on top | on | — | Keeps the window above others |
| Start at login | off | — | Registers the app to start at sign-in (same as the tray item) |
| Lighting | Auto | Auto / Full light / Candles | Same as the header switch |
| Theme | Ordo Administratum | Ordo Administratum / Ordo Machinum / Ordo Xenos / Ordo Malleus / Ordo Hereticus / Neon Grid / Corpo Tower / Rain City / Green Code / Sunset Drive / Orbital Station | Colours of the hall and the window, the wording, and some art (Neon Grid is a cyberpunk den and Orbital Station a space station, not 40k; the remote view keeps its own) |
| Petition chime | on | — | Chime on a new petition, a stale one, and a long task done (the header bell toggles it too) |
| Petition turns stale after | 5 min | 1–120 | Stale escalation: beacon, servo-skull, second toast |
| Quiet hours | off, 22:00–08:00 | any times | Inside the window no toast and no chime for a new petition, question, long task or usage limit. A petition turning stale still toasts and chimes. A moon in the header shows while it is quiet |
| Idle to the Refectorium after | 2 min | 1–120 | How long a scribe stays idle at its desk before it goes to nap |
| Stay at the cogitator for | 10 s | 0–120 | How long a scribe stays at the cogitator after its last shell command |
| Context window: Haiku | 200 k tokens | 8–10 000 | Window used for the context fill of Haiku sessions |
| Context window: Other models | 1000 k tokens | 8–10 000 | Window for every other model |
| Latitude / Longitude | empty | ±90 / ±180 | Where *Auto* lighting takes its sun (south and west are negative). Empty = fixed hours |
| Idle frame rate | 12 fps | 6 / 8 / 12 / 30 | Redraw rate while nothing moves (anything walking or animating always runs at 30 fps). Lower = less CPU/GPU |
| Pause when hidden or covered | on | — | Stops drawing while the window is minimised, hidden to the tray or fully covered (checked every 2 s); toasts still fire |
| Open departments with | Explorer | Explorer / VS Code / Custom command | What a plaque click opens the folder with. A custom command gets the folder as one argument (`{path}`, else appended) and never runs through a shell |

**Reset to defaults** restores every value above except *Start at login*.

### Tray menu

| Item | Action |
|---|---|
| Show / hide | Toggle the window (the header's `–` button also hides it) |
| Toggle chime | Mute / unmute |
| Cycle lighting | Auto → Full light → Candles |
| Start at login | Checkbox, kept in sync with Settings |
| Quit | Exit Administratum |

### Keyboard and panning

When the window is too small to show the whole hall at a readable size, the view pans:

- **Drag** the scene (click, hold and move more than a few pixels). Let go while moving and the view coasts.
- **Arrow keys** pan in steps.
- **Double-click** the scene to recentre it.
- An **arrow on an edge** of the view counts the characters beyond that edge. It blinks red if one of them is
  petitioning. Click it to glide to that petitioner, or to the nearest character if none is petitioning.
- **Escape** closes the card, the Chronicon or Settings.

---

## Privacy and safety

**Read-only towards Claude Code.** Administratum never writes to `~/.claude`, never changes Claude Code's
configuration, and installs no hooks. It reads:

| What | Why |
|---|---|
| `~/.claude/sessions/*.json` | The live session list: name, working directory, status, what a petition waits for |
| `~/.claude/projects/<project>/<sessionId>.jsonl` | The tail for the task line, context size, model and compaction marker. Appended bytes for Chronicon events and token usage |
| `.../<sessionId>/subagents/agent-*.jsonl` and `agent-*.meta.json` | Active subagents: type, task, model, context |
| `ORCA_TERMINAL_HANDLE` in the environment of running `claude.exe` processes | Which Orca terminal a session lives in. Read once per process |
| Process name and start time of each session's pid | Whether the session is still alive (guards against pid reuse) |

**What it writes, and where.** Everything goes under `%APPDATA%\com.arylmera.administratum\`:

| Path | Content |
|---|---|
| `settings.json` | UI settings (the table above). The WebView's local storage holds only a cache |
| `chronicon\YYYY-MM-DD.jsonl` | That day's events: time, kind, session name, department, short detail (commit subject, test command, tool name...) |
| `chronicon\YYYY-MM-DD.tithe.json` | That day's token and working-time totals |
| `chronicon\offsets.json` | How far each transcript has been read |

Chronicon files older than 7 days are deleted at startup. Demo mode uses a separate `chronicon-demo\` folder,
which is wiped at each start.

**Nothing leaves the machine.** There is no telemetry, no update check and no network call. The only outbound
action is opening a `https://claude.ai/code/<id>` link in your browser when you click *Open on claude.ai*. That
URL is validated (fixed prefix, id limited to letters, digits, `_` and `-`) before it is passed to the shell.

**Answering petitions.** This is the only action that affects a session, and it only types one digit into an
Orca terminal after you click. The safeguards:

- The terminal handle is validated (`term_` followed by hex digits and dashes).
- Arguments go straight to the `orca` process, never through a shell.
- The digit is typed only after the rendered screen has been checked as described [above](#answering-petitions).
- Screen contents are never echoed, logged or sent.
- Errors are fixed strings.

---

## Performance

Measured on Windows 11 with a release build at rest:

- Backend: about **0.1 % CPU**. It polls once a second, checks liveness with one Win32 process handle per
  session pid, re-reads a transcript tail only when the file's size or modification time changed, and streams
  appended transcript lines from a stored offset.
- Rendering: about **7–8 % of one core** for the WebView2 canvas. The scene draws at 30 fps while anything
  moves and 12 fps at rest, and stops drawing while the window is hidden.
- Installer: about **1.9 MB**.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| No toasts for petitions | Windows notifications are off for Administratum, or Focus / Do not disturb is on. Check *Settings → System → Notifications* |
| "No scribes on duty" while sessions are running | Administratum reads `%USERPROFILE%\.claude\sessions\`. Check that folder exists and holds `<pid>.json` files while Claude Code runs. Sessions of another Windows user or on another machine are not seen |
| No **Open in Orca** button, or ✓ / ✗ missing on a petition | The session was not started in an Orca terminal (no `ORCA_TERMINAL_HANDLE`), or the `orca` CLI is not found. Answer buttons also appear only for permission prompts, not free-text questions |
| "No permission prompt visible — open the terminal" | The dialog is no longer at the bottom of the terminal screen (answered elsewhere, scrolled, or a different prompt). Use **Open in Orca** |
| Settings and Chronicon history gone after reinstalling | The uninstaller was run with its *delete the application data* option, which removes `%APPDATA%\com.arylmera.administratum`. A normal uninstall or reinstall keeps them |
| Context fill looks wrong | Set the context window for the model family in Settings (for example 200 k for a 200 k-window model) |
| Remote view: the iPad / phone page stays blank or never loads | The Windows Firewall drops the connection. Open **Settings → Remote view → Allow this port** (Windows asks for administrator permission); the line under the port says whether the rule is in place. If it says your network is *Public*, mark it *Private* (`Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private`, admin PowerShell). Fallback, by hand in an admin PowerShell: `New-NetFirewallRule -DisplayName "Administratum remote view" -Direction Inbound -Program "$env:LOCALAPPDATA\Administratum\administratum.exe" -Protocol TCP -LocalPort 7770 -RemoteAddress LocalSubnet -Action Allow -Profile Private`. Use the `192.168.x.x` address, not a virtual adapter's (`172.x` WSL/Hyper-V) |
| Remote view: a red box at the bottom of the page | The page reports its own JavaScript errors there (remote browsers have no console); it includes the browser version |

---

## Development

### Architecture

Administratum is a Tauri 2 app with a Rust backend. The UI is plain ES modules served from `ui/` as they are,
with no npm and no build step.

**Backend** (`src-tauri/src/`):

| Module | Job |
|---|---|
| `main.rs` | Window, tray, plugins (notification, window-state, autostart), the 1 s poll loop, Tauri commands: `open_session`, `answer_petition`, `chronicle_day`, `tithe_day`, `chronicle_days`, `set_stale_minutes`, `start_at_login`, `settings_load`, `settings_save` |
| `poller.rs` | Builds the live roster each tick: liveness via Win32, Orca handle per pid, transcript location, memoised tails and subagents |
| `registry.rs` | Pure functions: parse session records, task line, context, compaction, active subagents, petition tracking (new / stale once per episode), validators, the permission-prompt parser |
| `chronicle.rs` | Incremental transcript reader: event extraction, token and working-time Tithe, day files, retention |
| `settings.rs` | `settings.json` load, validation and atomic save |
| `demo.rs` | Scripted 60 s roster, events and usage for demo mode |

**Data flow.** Each second the poll loop emits:

- `roster`: every session with its status, petition, task, context, helpers, Orca handle, claude.ai URL and
  compaction time. It is emitted every tick.
- `petition` and `petition-stale`: these also fire the toasts.
- `chronicle`: each new event. Events older than 2 min are recorded but not played in the scene.

The UI turns the roster into the scene and fetches Chronicon history on demand through the `chronicle_*`
commands.

**UI** (`ui/`):

| Module | Job |
|---|---|
| `index.html` | Markup and styles (header, card, Chronicon and Settings panels) |
| `app.js` | Wiring: roster → layout → cast, render loop, pan, card, petition labels, answering, chime |
| `layout.js` | Hall geometry: department blocks, desks and lecterns, consoles, bays, routes, light phases |
| `actors.js` | Scribes and adepts: destinations, walking, napping, compaction ritual, chronicle reactions |
| `scene.js` | Canvas drawing of the static hall and each frame (furniture, paper, effects, beacon, servo-skull) |
| `sprites.js` | Loads the art files (`ui/art/`), sprite cache, model ranks |
| `art.js`, `png.js` | Art file loader (sheet + JSON → palette rows) and PNG decoder |
| `room.js` | The room's structure from tiles (fill rules: repeat, strips, nine-slice) |
| `theme.js`, `themes.js` | Themes: every colour (art, code, chrome) and the wording; `setTheme`, `t()` |
| `lighting.js` | Darkness, light pools and glows from pre-rendered stamps |
| `sun.js` | Sunrise, sunset and civil twilight (NOAA formulas) for *Auto* lighting |
| `chronicon.js` | Chronicon parchment: tabs, Tithe charts, event log |
| `settings.js` | Settings panel and persisted store |
| `panel.js` | Shared open/close behaviour of the parchment panels |

### Run

```sh
cd src-tauri
cargo tauri dev
```

To get a demo roster with no real sessions (scribes arriving, working, shelling, petitioning, compacting, with
adepts and Chronicon events), set `ADMINISTRATUM_DEMO=1` before `cargo tauri dev`, or pass `--demo` to the binary:

```powershell
$env:ADMINISTRATUM_DEMO = 1; cargo tauri dev
```

Requires the Rust toolchain and the Tauri CLI (`cargo install tauri-cli --version "^2"`).

### Tests

```sh
cargo test --manifest-path src-tauri/Cargo.toml   # registry, poller, chronicle, settings, demo
node ui/layout.test.mjs                           # layout, routes, stable desks, compact/bays
node ui/sprites.test.mjs                          # sprite sizes, palette chars, symmetry
node ui/theme.test.mjs                            # themes: complete palettes, runtime switch
node ui/art.test.mjs                              # art files: PNG decoder, key palette, sheets
node ui/sun.test.mjs                              # sun times and Auto phases
```

The node self-checks are plain `assert` scripts with no test framework.

### Sprites and themes

Sprites and the room's tiles (floor, walls, pipes, doors) are art files in `ui/art/`: one PNG sheet per family,
drawn in the key palette `ui/art/key.gpl` (load it in Aseprite or Piskel), plus JSON frames, anchors and the tiles'
fill rules. Every colour (the art's, the ones drawn in code, the page's chrome) and the wording come from the
active theme: `ui/theme.js` (Ordo Administratum) and `ui/themes.js` (Ordo Machinum, Ordo Xenos, Ordo Malleus, Ordo Hereticus,
Neon Grid, a cyberpunk den with its own art in `ui/art/cyber/` and three accents of it (Corpo Tower, Rain City, Green Code, Sunset Drive: same art, recoloured), and Orbital Station, a space station with its own art in
`ui/art/orbital/`), picked in Settings → Hall → Theme. `node tools/sprite_sheet.mjs` renders every sprite to [`docs/sprites/`](docs/sprites/README.md),
the gallery used to discuss them one by one (a **Sprite** issue each).

To work on the art, use the live viewer: every sprite in every theme side by side, read straight from `ui/art/`,
walk cycles animated, zoom, pixel grid, backgrounds and a filter. Serve the repo root and open it:

```sh
python -m http.server 8123        # from the repo root
# http://localhost:8123/tools/sprites.html   (edit an art file, press R)
```

Cells are named like a spreadsheet so a sprite in a theme is one short reference: the column is the theme
(A Ordo Administratum, B Ordo Machinum, C Ordo Xenos, D Ordo Malleus, E Ordo Hereticus, F Neon Grid, G Orbital Station, H Corpo Tower, I Rain City, J Green Code, K Sunset Drive), the row is the sprite's number,
so `F52` is the Neon Grid shelf. `#F52` in the URL jumps to it; `node tools/sprite_sheet.mjs --list` prints the key.
Each family links to its discussion issue, each sprite to a prefilled new Sprite issue. Design and roadmap:
[`docs/superpowers/specs/2026-10-06-sprite-themes-design.md`](docs/superpowers/specs/2026-10-06-sprite-themes-design.md).

### Build the installer

```powershell
cd src-tauri
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\administratum.key"; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cargo tauri build
```

Bundles are signed for the updater: the key file must exist (see Releasing). The output is
src-tauri/target/release/bundle/nsis/Administratum_<version>_x64-setup.exe and its .sig. The release profile
uses LTO, `opt-level = "s"` and stripped symbols.

### Releasing

Bump `version` in `src-tauri/Cargo.toml` and push to `main`. The `release` workflow tags `v<version>`, builds the
signed installer on Windows, and publishes a GitHub Release with `latest.json`, which installed copies read to
offer the update. A version with a `-` (`0.3.0-rc1`) becomes a pre-release that the updater never offers. To
rebuild an existing tag: Actions > release > Run workflow, with the tag.

The updater key: private key in `~/.tauri/administratum.key` (back it up; losing it means installed copies can no
longer update), its contents in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, its public key in
`tauri.conf.json`.

### Repository layout

```
src-tauri/          Rust backend, tauri.conf.json, capabilities, icons
  src/              main, poller, registry, chronicle, settings, demo
ui/                 the frontend, served as-is (ES modules, no build)
  fonts/            bundled WOFF2 fonts and their OFL licences
docs/               v1 spec and plan, backlog, Chronicon design, README images
tools/make_icon.py  generates the app icon
```

---

## Licenses

**Administratum**: [MIT](LICENSE), © 2026 Guillaume Lemer (Arylmera). The licence covers this project's code and art only.

**Fonts** (bundled in `ui/fonts/`, under the SIL Open Font License 1.1):

| Font | Files | Licence |
|---|---|---|
| Pirata One, © 2012 Rodrigo Fuenzalida, Nicolas Massi | `pirata-one-latin.woff2` | `OFL-PirataOne.txt` |
| VT323, © 2011 The VT323 Project Authors | `vt323-latin.woff2`, `vt323-latin-ext.woff2` | `OFL-VT323.txt` |

Warhammer 40,000 and the Adeptus Mechanicus are trademarks of Games Workshop. Administratum is an unofficial fan
project and is not affiliated with or endorsed by Games Workshop.
