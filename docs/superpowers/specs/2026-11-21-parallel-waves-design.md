# Parallel waves: UX and integration fixes with the CI verdict and orders to a scribe

Date: 2026-11-21. Status: draft, for the user's approval. Nothing in it is approved for build.

## Intent

An audit of Administratum's interfaces, design and integrations found 18 problems (F1 to F18). A second session
designs two new features: I6, the CI verdict after a push (spec written, not approved), and I2, orders to a scribe
(an idea only). Both sets of work touch the same files, `ui/index.html` above all. This spec puts them into one
plan of waves. Each wave has lanes that run at the same time in separate worktrees. Each file has exactly one
writer per wave.

**Goals**
- Every F-item and feature has one line of scope and one check that proves it, which can fail.
- One file-ownership matrix: rows are files, columns are waves, each cell names the one lane that writes it.
- Waves in order, with their dependencies, merge order and the proof after each merge.

**Non-goals**
- The design of each item beyond what the lanes need to stay apart. Each lane gets its own plan
  (`docs/superpowers/plans/`) before it is built.
- Approval of I6 or I2. Those stay with the user (questions Q1 to Q4).

## Sources

- The audit findings F1 to F18 (in the session "Administratum interfaces et intégrations"), checked again here
  against the tree at `fe4b411`. Corrections are in the scope table.
- I6: `docs/superpowers/specs/2026-11-21-ci-verdict-design.md`. Committed with this spec (Q1). This spec cites it by section (§1 Setting ... §6 Errors, "Where it lives").
- I2: the feature session's hand-over (raw idea, constraints, open questions), recorded in section "I2 sketch".

## 1. Scope

Each item, its acceptance check, and its lane. A check marked *manual* cannot be proved by a node or Rust test: the
user checks it in the named view. Every other check is a test that must be red before the change and green after.

| Code | Item | Acceptance check | Lane |
|---|---|---|---|
| F1 | Startup loads every theme's art eagerly (`ui/sprites.js:96`, `ui/faces.js:66`, about 445 requests). Load the active theme's art first, other themes on demand (theme switch, the preview, the tools) | `sprites.test.mjs` / `faces.test.mjs`: a counting `fetch` stub asserts that importing the modules with theme X active asks only for the base sheets and X's own; a switch to Y then asks for Y's. The art tools (`tools/sprite_sheet.mjs` and the five others that import these modules) get an explicit load-all call, and `node tools/art_gate.mjs` stays green | L1b |
| F2 | The release build has no console; 17 non-test `eprintln!` lines go nowhere (not 18: `main.rs:315,325,333,334,364,748`, `opencode/mod.rs:263` (its `log`, which `:243` calls), `remote/app.rs:191`, `strip/linux.rs:125,149`, `strip/mod.rs:314`, `toast.rs:167,232,278,301`, `vigil/app.rs:59,95,130`). Add a new `status.rs`: an `integration_status` store (one entry per integration: name, state, last message, time) and a rotating log in the app data folder. Every line passes through `mask::mask` before it is stored or written | `cargo test`: store and rotation unit tests (size cap, file count cap); a test that a line with a token-shaped string is written masked; a grep test (or clippy `print_stderr` lint on the crate) proves no `eprintln!` stays outside tests and the demo path | L1a |
| F3 | No health view; the tray tooltip is fixed (`window.rs:132`). Backend: the `integration_status` command, and the tooltip `Administratum · N waiting`. UI: a Settings > Status tab that lists the entries | Backend: `cargo test` on the tooltip text function (0, 1, N waiting). UI: `settings.test.mjs` renders the Status tab from a stubbed `integration_status` answer, an error entry included | L1a (backend), L4a (UI) |
| F4 | Orca CLI calls have no timeout (`orca.rs:82,124`, `output()`); a switch is `spawn()` only (`orca.rs:60`); `orca not found` is overwritten by the next candidate's error (`orca.rs:28-35`). Add a timeout of about 3 s with a kill, check the exit status, keep the clear message | `cargo test` with a fake `orca` binary (a test helper that sleeps past the timeout, one that exits non-zero, none on the path): each returns its own error within the timeout | L1a |
| F5 | Silent failures: `settings_save` only does `console.warn` (`settings.js:20`); a Chronicon load error looks like an empty day (`chronicon.js:302-325`); the remote view saved on but not running (`remote/app.rs:185-193`); the remote category hidden on error (`settings.js:257`); a card open failure goes only to the console (`card.js:278-294`). Show each one inline, and record the backend ones in `integration_status` | `settings.test.mjs`: a rejected `settings_save` shows the error line; a rejected `remote_status` keeps the category and shows the error. `chronicon.test.mjs`: a rejected load shows an error state, not the empty day. `card.test.mjs`: a rejected open shows the error on the card. `cargo test`: a failed bind sets the remote entry to error | L1a (backend), L4a, L4b |
| F6 | A risky petition's Approve on the hall label arms with no visible sign (`overlay.js:196-205`) | `overlay.test.mjs`: after the first click the label carries an armed class and an armed text; after 5 s it clears | L3a |
| F7 | Approve / Deny targets are about 8 to 16 px (`index.html:120`); *Always* sits next to *Approve* on the card | `overlay.test.mjs` / `card.test.mjs`: *Always* is not adjacent to *Approve* in DOM order. Size: *manual*, in `tools/preview.html?n=12` at scale 1 and 2, targets at least 24 px | L3a |
| F8 | *Reset to defaults* is one click (`settings.js:608`), while *Regenerate* takes two | `settings.test.mjs`: one click arms, a second within the window resets, a single click resets nothing | L3b |
| F9 | No spacing, font-size, radius or z-index tokens (about 31 paddings, 18 font sizes) | A node check (`ui/css.test.mjs`, new) that reads the CSS files and fails on a raw `px` value for padding, margin, gap, font-size, border-radius or z-index outside the token block | L2a |
| F10 | Three focus rings (`index.html:67,214,331`; `mobile.html:42`), the green one on parchment about 1.5:1; no shared `:disabled` / `:active` | `css.test.mjs`: one `:focus-visible` rule set, built on a `--focus` token; `theme.test.mjs`: `--focus` against every surface it is drawn on, at least 3:1, every theme | L2a |
| F11 | `font-synthesis: none` with single-weight VT323 makes bold and italic dead; emphasis is by colour only; mobile differs | `css.test.mjs`: no `font-weight: bold` / `font-style: italic` without the emphasis token; *manual*: the card and Settings in the preview, on the PC and in the phone page | L2a |
| F12 | Panel CSS duplicated and drifted (`#chron` / `#prefs` shells, `index.html:198-204` vs `:277-281`; the two blocks run to `:263` and `:331`); helpers duplicated: `ago` (`card.js:25`, `mobile.js:81`), `statusOf` (`card.js:22`, `mobile.js:82`), `hhmm` (`app.js:173`, `chronicon.js:12`, `mobile.js:74`), `el` / `h` (`chronicon.js:89`, `settings.js:353`, `mobile.js:86`). L2a writes one `.panel` rule set and new `ui/dom.js` + `ui/format.js` with tests; each later lane moves its own files onto them | `format.test.mjs` / `dom.test.mjs` (new). After W3 and W4: a grep check in `css.test.mjs` (or a new small test) that each helper has one definition in `ui/` | L2a, then L3a, L3b, L4b move their files |
| F13 | The contrast test misses `--paper-ink-2`, the focus rings, the chart colours and the mobile `--dim` | `theme.test.mjs`: the new pairs, every theme; a deliberately low pair in a fixture turns it red | L2a |
| F14 | Settings is grouped by control type; "Theme" and "Style" confuse; selects truncate at 800 px | `settings.test.mjs`: every setting key still has exactly one control after the regroup (the list from `MONITOR` and the other defaults). Labels and width: *manual*, Settings at an 800 px window | L3b |
| F15 | Keyboard and ARIA: scribes are not reachable by keyboard; no focus trap and no `aria-modal` on the panels; tabs without arrow keys | `panel.test.mjs` (new): Tab cycles inside an open panel, Esc closes and gives focus back; tab lists move on arrow keys. `overlay.test.mjs`: each scribe has a focusable element, Enter opens its card | L3a (scribes), L3b (panels, tabs) |
| F16 | The Chronicon empty state is weak; new / cache drawn red / green; hardcoded `PAL` (`chronicon.js:17`) | `chronicon.test.mjs`: an empty day shows the empty state text; chart colours come from the theme's `--chart-*` tokens (the test switches theme and sees other colours) | L3b |
| F17 | Mobile: no empty state, the risky Approve unstyled, 40 px targets | `mobile.test.mjs`: no petition shows the empty state; a risky petition gets the risky class. Target size: *manual*, `/?` phone page at 375 px | L3b |
| F18 | `adm.mjs` forces the LAN listener; `peek_petition` is open without the actions gate (`remote/mod.rs:212`); no update progress; no test-notification button; the vigil shutdown exit is not checked (`vigil/app.rs:87-96`, `spawn()` only) | `cargo test`: shutdown waits for the exit status and records a failure; the route test for `peek_petition` matches the gate the user picks (Q5); `node tools/adm.mjs` on loopback (Q6). Update progress and the test-notification button: backend event and command tested in `cargo test`, the UI in L4a | L1a, L4a |
| F19 | (Optional, small) After a Deny on an OpenCode petition the idle line said "idle since 22:43:05", earlier than the petition (22:43:12). Likely the idle time comes from the last row before the permission, in `opencode/mod.rs` | `cargo test` in `opencode/mod.rs`: a session with a permission answered at T shows idle since >= T | L1a |
| I6 | CI verdict after a push (I6 spec, all sections) | The I6 spec's "Tests" section, unchanged, split by lane: L1c the pure parts, L2b the watcher thread, the off switch and the opener check, L4a and L4b the UI | L1c, L2b, L4a, L4b |
| I2 | Orders to a scribe: from an idle session's card, send a follow-up prompt to its terminal | Not designed. Checks come with its own spec (section "I2 sketch") | W5 |

## 2. Rules for the lanes

1. **One writer per file per wave.** The matrix names it. A lane that needs a change in a file it does not own
   stops and asks the integrator; it never edits it.
2. **Shared files and their integrator.** The integrator is the parent session that starts the lanes and merges
   them: the session that wrote this spec (Q9: every lane runs from it, each in its own worktree). It alone merges a lane
   into the joint branch (rule R1: a lane never pushes and never merges outside its worktree).
   - `src-tauri/src/main.rs`: one owner lane per wave (the matrix). Another lane may add only **append lines**: a
     `mod x;` line and its own entries at the end of `generate_handler!`. Nothing else. The integrator resolves the
     append conflicts at merge.
   - `ui/index.html`: one owner lane per wave. No other lane edits it, not even to append. A lane that needs a
     new element builds it from JS.
   - `ui/theme.js` `TEXT` and `BASE`, the 13 `ui/art/<theme>/theme.json` files, `ui/themepack.js` `LOCKED`: one
     owner lane per wave. A lane that needs a new key asks the owner lane of that wave, or waits for a wave where
     it owns it.
   - `README.md`, `docs/DEVELOPMENT.md`, `docs/remote-api.md`, `docs/theme-packs.md`: each lane edits only the
     rows and sections of what it changes (documentation in the same change). The integrator resolves the
     conflicts in merge order. PR Arylmera/Administratum#39 (README, OpenCode 2.3.2) merges before W1 starts or is
     rebased onto by the first lane to merge.
3. **The CSS split.** W2 moves the styles out of `index.html` and `mobile.html` into files by owner, so the later
   lanes do not collide in one stylesheet: `ui/css/base.css` (tokens, type, focus, buttons, `.panel`),
   `ui/css/hall.css` (header, plaques, labels, card), `ui/css/panels.css` (Chronicon, Settings),
   `ui/css/mobile.css`. Plain `<link>` tags; no build step. `tauri.conf.json` sets `csp: null`, and the remote view
   serves the embedded `ui/` files by path with their mime (`remote/mod.rs` `asset`, subfolders such as `ui/art/`
   already work), so no backend change is expected. L2a proves it with one request for `/css/base.css` through the
   remote view; if a backend change turns out to be needed, L2a stops and asks (`remote/mod.rs` is L2b's in W2).
4. **New dependencies.** None are planned. The rotating log (F2) and the timeout (F4) are written with `std`.
   A lane that finds it needs a crate stops and asks.
5. **Proof after each merge into the joint branch**, from the repo root:

   ```sh
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done
   node tools/art_gate.mjs   # from a clean tree
   ```

   A lane runs the same four in its worktree before it hands its branch back. Windows-only code
   (`#[cfg(windows)]`) is built only on Windows: a lane that touches it runs the Rust proof on this PC.

## 3. File-ownership matrix

Lane names: **L1a** reliability backend, **L1b** startup, **L1c** I6 core, **L2a** CSS foundation, **L2b** I6
wiring, **L3a** petitions, **L3b** panels, **L4a** Settings and Status (and every I6 word),
**L4b** card and plaques (and the I6 card line and lamp), **L5** I2. `+` means append lines only (rule 2). `—` means no writer in that wave.

### Backend (`src-tauri/`)

| File | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|
| `src/main.rs` | L1a (+ L1c) | L2b | — | — | L5 |
| `src/status.rs` (new) | L1a | — | — | — | — |
| `src/ci.rs` (new) | L1c | L2b | — | — | — |
| `src/orca.rs` | L1a | — | — | — | L5 |
| `src/window.rs` | L1a | — | — | — | — |
| `src/toast.rs` | L1a | L2b | — | — | — |
| `src/remote/app.rs` | L1a | — | — | — | L5 |
| `src/remote/mod.rs` | L1a | L2b | — | — | L5 |
| `src/vigil/app.rs` | L1a | — | — | — | — |
| `src/opencode/mod.rs` | L1a | — | — | — | L5 |
| `src/opencode/service.rs` | — | — | — | — | L5 |
| `src/strip/mod.rs`, `src/strip/linux.rs` | L1a | — | — | — | — |
| `src/chronicle/mod.rs` | L1c | — | — | — | L5 |
| `src/monitor.rs` | L1c | — | — | — | — |
| `src/registry/mod.rs` | L1c | — | — | — | — |

### UI (`ui/`)

| File | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|
| `index.html` | — | L2a | L3b | L4a | — |
| `mobile.html` | — | L2a | L3b | — | — |
| `css/base.css` (new) | — | L2a | — | — | — |
| `css/hall.css` (new) | — | L2a | L3a | L4b | L5 |
| `css/panels.css` (new) | — | L2a | L3b | L4a | — |
| `css/mobile.css` (new) | — | L2a | L3b | — | — |
| `dom.js`, `format.js` (new) | — | L2a | — | — | — |
| `sprites.js`, `faces.js`, `themes.js` | L1b | — | — | — | — |
| `app.js` | L1b | — | L3a | — | — |
| `overlay.js` | — | — | L3a | L4b | — |
| `petition.js` | — | — | L3a | — | — |
| `card.js` | — | — | L3a | L4b | L5 |
| `settings.js` | — | — | L3b | L4a | — |
| `chronicon.js`, `panel.js` | — | — | L3b | L4a | — |
| `mobile.js` | — | — | L3b | — | L5 |
| `chrome.js` | — | — | — | L4a | — |
| `theme.js` | — | L2a | L3b | L4a | L5 |
| `art/<theme>/theme.json` (13), `themepack.js` | — | L2a | L3b | L4a | L5 |

### Tests, tools, docs

| File | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|
| `sprites.test.mjs`, `faces.test.mjs`, `themes.test.mjs` | L1b | — | — | — | — |
| `css.test.mjs`, `format.test.mjs`, `dom.test.mjs` (new) | — | L2a | — | — | — |
| `theme.test.mjs`, `themepack.test.mjs` | — | L2a | L3b | L4a | — |
| `overlay.test.mjs` | — | — | L3a | L4b | — |
| `petition.test.mjs` | — | — | L3a | — | — |
| `card.test.mjs` | — | — | L3a | L4b | L5 |
| `settings.test.mjs`, `chronicon.test.mjs`, `panel.test.mjs` (new) | — | — | L3b | L4a | — |
| `mobile.test.mjs` | — | — | L3b | — | L5 |
| `tools/adm.mjs` | L1a | — | — | — | — |
| `tools/sprite_sheet.mjs`, `sprite_catalog.mjs`, `theme_pack.mjs`, `honours_art.mjs`, `map_to_art.mjs`, `rank_art.mjs` | L1b | — | — | — | — |
| `README.md`, `docs/DEVELOPMENT.md` | sections, integrator | sections, integrator | sections, integrator | sections, integrator | sections, integrator |
| `docs/remote-api.md` | L1a | L2b | — | — | L5 |
| `docs/theme-packs.md` | — | L2a | L3b | L4a | — |
| `docs/superpowers/specs/2026-10-17-monitoring-design.md` (anti-goal) | — | — | — | — | L5 |

## 4. Waves

```
W1  L1a reliability backend ─┐
    L1b startup              ├─▶ W2  L2a CSS foundation ─┐
    L1c I6 core (if Q2) ─────┘       L2b I6 wiring ──────┤
                                                         ├─▶ W3  L3a petitions ─┐
                                                         └─▶     L3b panels ────┴─▶ W4  L4a Settings + Status ─┐
                                                                                        L4b card + plaques ────┴─▶ W5 L5 I2 (if Q3)
```

### W1: backend and startup (three lanes)

Depends on nothing (PR Arylmera/Administratum#39 merged first or rebased onto).

- **L1a reliability backend.** F2, F3 backend, F4, F5 backend (the remote entry), F18 backend, F19.
  `status.rs` with `integration_status`; every `eprintln!` routed to it; the tooltip; Orca timeout and exit
  status; the vigil shutdown exit; the update progress event and the test-notification command; the
  `adm.mjs` listener and the `peek_petition` gate as the user decided (Q5, Q6: both yes). It also makes `orca.rs`
  `open_url` `pub(crate)`, for I6's opener (decision D1 below). README: Privacy file table (the log file),
  Remote view (Q5 and Q6 change its behaviour); `docs/remote-api.md`.
- **L1b startup.** F1. Active theme first, others on demand; a load-all for the tools and the preview. It
  does not touch `app.js` `hhmm`: `format.js` exists only from W2, so F12 for `app.js` goes to L3a.
- **L1c I6 core.** Only if the user approves I6 (Q2). The I6 spec's pure parts: push output parsing, remote URL,
  ref lookup, verdict, the watch state machine with an injected clock, the `gh` runner behind a trait (stubbed in
  tests); the `CiPush` side record from `chronicle/mod.rs` `classify_call`; `monitor.rs` `Config` fields `ci`,
  `ciToast`; `registry/mod.rs` `Session.ci: Option<CiState>` (additive, `serde(default)`). In `main.rs`: the
  `mod ci;` append line only. No thread, no toast, no UI.

Merge order: L1a, then L1b, then L1c (L1c's `main.rs` line is the only append). Proof after each.

### W2: CSS foundation and I6 wiring (two lanes)

Depends on W1 merged.

- **L2a CSS foundation.** F9, F10, F11, F12 (CSS and the two new helper modules only), F13. Owns `index.html`
  and `mobile.html` to move the styles into `ui/css/*.css` with no visual change, then adds the tokens, one
  focus ring, `:disabled` / `:active`, the emphasis token, the `.panel` rule set. Adds `--focus`, `--chart-*`
  and any new token in `theme.js` `BASE` and the 13 `theme.json` files; `themepack.js` accepts the new keys
  (an old pack without them falls back to `BASE`). *Manual* check after merge: the sprite viewer is not
  concerned; the preview at `tools/preview.html` in three themes (`tier2`, `vault`, `contrast`) and the phone
  page look the same as before, except the focus ring.
- **L2b I6 wiring.** Only with Q2. The watcher thread in `ci.rs`; its start, its channel and the `Session.ci`
  merge in `main.rs`; the CI toasts in `toast.rs` with built-in English wording until L4a pushes the theme's
  (the same path as the other toasts, `set_toast_text`); the checks-URL check, then `orca::open_url`; the `gh`
  state as one `integration_status` entry (Q7: yes); the remote payload in `remote/mod.rs` if it needs more than
  the roster already carries; `docs/remote-api.md`; README Privacy and its file table (the `gh` process and its
  network calls, only when `adm.ci` is on).

Merge order: L2a, then L2b. Proof after each.

### W3: petitions and panels (two lanes)

Depends on W2 merged (tokens, CSS files, `dom.js`, `format.js`).

- **L3a petitions.** F6, F7, F15 (scribes reachable by keyboard), F12 for `app.js` and `card.js` helpers.
  Owns `overlay.js`, `petition.js`, `card.js` (petition part), `app.js`, `css/hall.css`.
- **L3b panels.** F8, F14, F15 (focus trap, `aria-modal`, arrow keys on tabs), F16, F17, F12 for `settings.js`,
  `chronicon.js`, `mobile.js`. Owns `index.html` (the Settings regroup, dialog attributes) and `mobile.html`,
  `css/panels.css`, `css/mobile.css`, and `theme.js` / the `theme.json` files in W3: the text keys F14, F16 and F17
  need (Settings labels are `data-t` keys filled by `chrome.js`), and the keys L3a hands it for F6 (the armed text)
  and F8 is L3b's (the reset label). Uses the `--chart-*` tokens from L2a.
Merge order: L3a, then L3b. Proof after each. *Manual* after W3: the preview with `orca=1` (petitions),
Settings at 800 px, the phone page at 375 px.

### W4: Settings and Status, card and plaques (two lanes)

Depends on W1 (the `integration_status` command) and W3 merged.

- **L4a Settings and Status.** F3 UI (the Status tab), F5 for `settings.js` and `chronicon.js`, F18 UI (the
  update progress, the test-notification button), I6's two switches and `gh` line (I6 spec §1). Owns
  `index.html`, `settings.js`, `chronicon.js`, `panel.js`, `css/panels.css`, `theme.js` and the `theme.json`
  files (the Status tab's words and, with Q2, every I6 key: toasts, card line, lamp title, switches, `gh` line,
  Chronicon `ci-pass` / `ci-fail`, with the themes' rewording), `chrome.js` (it pushes the CI toast wording).
  README Settings section.
- **L4b card and plaques.** F5 for the card (an open failure shown on the card); with Q2, I6's card line and the
  plaque lamp (I6 spec §5). Plaques are DOM drawn by `overlay.js` in every view, the strip and the column
  included, so the lamp is a styled element there, not canvas art. Owns `card.js`, `overlay.js`, `css/hall.css`.
  Its words are L4a's keys: L4b codes against the key names agreed in the plan and merges after L4a.

Merge order: L4a, then L4b. Proof after each.

### W5: I2 orders to a scribe

Depends on W4 merged, on the user's answers to Q3 and Q8, and on I2's own spec written and approved. One lane,
L5, because I2 touches `orca.rs`, `card.js`, the remote API and the Privacy text together. A W5 with I2 not
approved is empty.

## 5. Decisions taken in this spec

- **D1 The GitHub checks opener.** The feature session proposed a second opener in `ci.rs` to avoid touching
  `orca.rs`. Not taken (the feature session handed I6 over and stopped; it has not confirmed this): two copies of the `cmd /c start` path would drift (one writer per value). L1a makes
  `orca.rs` `open_url` `pub(crate)`; `ci.rs` builds the URL from the watch, checks it against the I6 spec's
  pattern, and calls it. No UI input reaches it. Cheap to reverse.
- **D2 I6 is split by file, not by feature.** Its core runs in W1 next to the UX backend, its wiring in W2, its
  UI in W3 and W4, inside the lanes that own those files. The alternative, one I6 lane after all UX waves, is
  simpler to follow but delays I6 to the end and makes it touch every file again.
- **D3 Late-wave helpers move with their file.** L2a only creates `dom.js` and `format.js`; each lane that owns a
  file with a duplicate moves it. Otherwise L2a would write five files that W3 and W4 own.
- **D4 `index.html` has no append rule.** It is too dense for a mechanical merge; one owner per wave, and other
  lanes build elements from JS.
- **D5 The log is masked.** Every `integration_status` message and log line goes through `mask::mask`. This is a
  requirement of F2, not an option.
- **D6 The plaque lamp is DOM.** Plaques are drawn by `overlay.js`, so I6's lamp goes with the lane that owns
  `overlay.js` in W4 (L4b), not into the canvas scenes. No `scene.js` / `scene39.js` / strip change.

## 6. I2 sketch (not a design)

From the feature session's hand-over. What: from an idle session's card, type a follow-up prompt and send it to
that session's terminal; maybe also from the phone. Existing path: `orca.rs` `answer_petition` already runs
`orca terminal send --terminal <handle> --text <key> --json` with arguments direct, no shell. Only sessions with an
Orca handle qualify; an OpenCode session could go through its loopback service, which already sends petition
answers.

Constraints it breaks today, which the user must change on purpose:
- The monitoring spec's anti-goal "Never answer or interrupt a session".
- README Privacy: nothing read from the screen is ever sent. I2 would send free text the app did not read from a
  prompt.
- `tools/adm.mjs` cannot answer petitions; it must not send orders either.

Its own spec must answer Q8 before it is written.

## 7. Risks

- **R1 The CSS move changes the look.** Moving styles out of `index.html` can change cascade order. L2a moves
  first with no other change, checks the preview in three themes and the phone page, then adds tokens.
- **R2 `art_gate` and F1.** The tools import `sprites.js` / `faces.js` and expect every world loaded. If L1b's
  load-all misses one, the gate goes red (good) or a gallery silently loses a theme. L1b runs the gate and
  diffs `docs/sprites/` before it hands back.
- **R3 Theme packs.** New tokens (L2a) and text keys (L3b, L4a) must not break a pack that lacks them:
  `themepack.js` fills them from `BASE` / `TEXT`, and `node tools/theme_pack.mjs check` stays green on the
  template pack.
- **R4 The append rule on `main.rs` hides a real conflict.** Two lanes that both append to `generate_handler!`
  conflict textually at the same line. The integrator keeps both entries; if a lane changed anything else in
  `main.rs`, the merge is refused and returned to that lane.
- **R5 Long lanes block a wave.** L2a and L3b are the largest. A wave waits for its slowest lane; a lane that
  stalls can be cut at a merge point (for L2a: the move, then the tokens).

## 8. Questions for the user

- **Q1** The I6 spec sits uncommitted in the main checkout. Who commits it, and on which branch: with this spec
  (→ recommended), or in its own PR first? **Answered: committed with this spec.**
- **Q2** Approve I6 as specified? Without it, L1c and L2b drop out and L4a / L4b lose their I6 parts; the
  waves stay valid.
- **Q3** Go on with I2? If yes, write its spec after W4 (→ recommended), not now.
- **Q4** Keep all four UX workstreams, or drop some F-items? F19 is optional.
- **Q5** `peek_petition` over the remote API: move it behind the "remote actions" gate (→ recommended: it shows the
  prompt's text, which is more than the roster shows), or leave it open to any paired client? This changes what a
  phone with view-only access can see. **Answered: yes, behind the gate.**
- **Q6** `tools/adm.mjs` forces the LAN listener. Let the remote server also listen on loopback so `adm.mjs` works
  with the LAN view off (→ recommended), or keep one LAN listener? **Answered: yes, loopback too.**
- **Q7** I6's `gh` state: also an entry in the Status tab through `integration_status` (→ recommended, one place
  for every integration's health), with the I6 spec's line under the switch kept, or only that line? **Answered: yes, also in the Status tab.**
- **Q8** For I2: why do you want it (card only, or the phone too)? Idle sessions only, or queue text for a busy
  one? Multi-line text and Enter? A confirm step? A length limit and masking of what is typed? A Chronicon record
  of each order? **Pending: the user asked for the I2 design first.**
- **Q9** Who runs the lanes: the session "Administratum interfaces et intégrations" as integrator, each lane a
  worktree side session (→ recommended), or another split? **Answered: this spec's session integrates; every lane runs from it in its own worktree.**
