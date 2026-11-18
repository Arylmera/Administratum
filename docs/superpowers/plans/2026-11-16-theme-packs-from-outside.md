# Theme Packs from Outside Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public GitHub repository of themes is installed by typing `owner/repo` in Settings, and its worlds and styles appear in the pickers after a restart.

**Architecture:** Packs are plain folders under `<app data>/themes/`. A small Rust module (`packs.rs`) lists them, serves their `.json` and `.png` files, and installs one by downloading the repository's archive; the window reads a pack's files through a command, the phone through the remote server's asset route. The loader of part A (`ui/themes.js`) reads the packs after the shipped themes, through the same `themepack.js`, and never lets a pack's failure reach a shipped theme or the app's start.

**Tech Stack:** ES modules without a bundler, Node `assert` tests on `ui/testdom.mjs`; Rust with Tauri 2, `reqwest`, `tar`, `flate2` (all three already in `Cargo.lock` through the updater plugin).

**Spec:** `docs/superpowers/specs/2026-11-15-theme-packs-design.md` (part B, and "Carried over from part A").

## Global Constraints

- A pack is never evaluated, only parsed: `JSON.parse` and the PNG decoder; no `import()`, `eval`, `Function`, no markup built from a pack's text (`textContent` only, never `innerHTML`).
- A pack's failure never stops the app from starting and never changes a shipped theme. A shipped theme's failure still throws, as today.
- Installing takes the whole repository; no dependency between packs; no automatic update; a pack appears after a restart.
- Only the host installs, updates or removes. The phone lists and reads; the remote server gets no route that writes.
- The only network host is `codeload.github.com`, over HTTPS.
- Files kept from an archive, and files served from `themes/`: `pack.json`, a licence file (`LICENSE`, `LICENSE.md`, `LICENSE.txt`), and `<folder>/<name>.json` / `<folder>/<name>.png` exactly one level deep. Regular files only; a link, a path with `..` or a leading `.`, or anything else is dropped.
- Limits: archive at most 20 MiB downloaded; at most 2000 files kept; each at most 2 MiB; 50 MiB unpacked in all.
- `owner/repo` matches `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$`, and `repo` is neither `.` nor `..`.
- Ids: a pack is `owner/repo` (installed) or `local/<folder>` (a folder dropped by hand). A pack's theme is `<pack>:<folder>`. A pack's world is `<pack>:<world>`, unless `<world>` is a shipped world's id, which it then joins.
- No new crate in `Cargo.lock`: `reqwest`, `tar`, `flate2` become direct dependencies at the versions already locked. No version bump.
- Wording shown to the user lives in `TEXT` (`ui/theme.js`), like the rest of the panel.
- Commits: one line, "Area: what it does" (area `Theme packs:`), an optional prose body, no attribution trailers. Docs change in the same commit as the code they describe.
- Full check before each commit, from the repository root: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done` prints no `FAIL`; for a Rust task also `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; from a clean tree `node tools/art_gate.mjs` passes.

## Review Focus

1. A pack whose `theme.json` is valid but whose sheet is broken (a pixel outside the key palette, a frame of the wrong size, a malformed anchor): the app starts, that theme is absent, its reason is shown on its pack's line. Tests in Tasks 2 and 3.
2. The active theme is a pack's and the pack is gone or now failing at start: the hall shows Ordo Administratum, no error. Test in Task 3.
3. An archive with a hostile entry (`../x`, an absolute path, a symlink, a 3 MiB file, a file two levels deep, a `.js`): nothing of it reaches the disk, the rest installs. Test in Task 5.
4. Install over a pack that exists (update) failing halfway: the old pack is still there, whole. Test in Task 5.
5. A request for `themes/<pack>/../../settings.json` or for a `.js` under `themes/`, from the window or from the phone: refused. Test in Task 4.

## File Structure

| File | Responsibility |
|---|---|
| `ui/themepack.js` (modified) | The check gains `families` and colour ranges; `scoped(pack, id, json)` gives a pack's theme its ids |
| `ui/artcheck.js` (new) | The shape of a theme's sheets: frames, sizes, anchors, fill rules, face objects. Pure |
| `ui/themes.js` (modified) | `loadPacks(packs, read)`: registers pack themes, records problems; `PACKS` for the panel |
| `ui/sprites.js`, `ui/faces.js`, `ui/art.js` (modified) | A pack theme's art is read through its pack's reader and checked; a failure drops the theme |
| `ui/app.js`, `ui/mobile.js` (modified) | The second net: a draw that throws under a pack's theme falls back |
| `ui/settings.js`, `ui/index.html`, `ui/theme.js` (modified) | "Added themes": the list, install, update, remove, restart |
| `src-tauri/src/packs.rs` (new) | The themes folder: list, read one file, install from an archive, remove. No Tauri types in its core |
| `src-tauri/src/main.rs`, `remote/mod.rs`, `remote/app.rs`, `Cargo.toml` (modified) | The commands, the phone's list route and asset path, the direct dependencies |
| `tools/theme_pack.mjs` (new) | `check <folder>` for authors |
| `docs/theme-packs.md`, `docs/theme-pack-template/` (new) | The author's guide and a pack to copy |

---

### Task 1: the check, ready for packs

**Files:** modify `ui/themepack.js`, `ui/themepack.test.mjs`.

**Interfaces:**
- Produces:
  - `checkTheme(json, { bases, worlds, families })`: with `families` (a `Set` or array) given, every `art` entry must be one of them; without it, as today.
  - `scoped(pack, id, json) -> { id, json }`: `id` becomes `` `${pack}:${id}` ``; `json.base` becomes `` `${pack}:${base}` `` when `opts.own` has it, else stays (a shipped theme); `json.world` becomes `` `${pack}:${world}` `` unless it is a shipped world. Signature: `scoped(pack, id, json, { own, shipped })` with `own` the pack's theme folders and `shipped` the shipped world ids. The input is not mutated.

- [ ] **Step 1: Write the failing tests:**
  - `checkTheme({ format: 1, name: 'X', world: 'w40k', art: ['scribe', '../x'] }, { families: ['scribe'] })` returns one problem naming `../x`; without `families` it returns `[]`.
  - a colour component out of range is refused: `px` cannot hold it (hex only), so test `ui: { '--bg': 'rgb(300,0,0)' }`, `ui: { '--bg': 'rgba(0,0,0,2)' }` and `light: { night: '10,20,999' }`: one problem each. `rgba(255,170,80,.38)` and `10,20,30` pass.
  - `scoped('alice/p', 'pink', { format: 1, name: 'P', base: 'vault' }, { own: ['pink'], shipped: ['w40k', 'vault'] })` gives id `alice/p:pink` and `base: 'vault'`.
  - `scoped('alice/p', 'rose', { ..., base: 'steam' }, { own: ['steam', 'rose'], shipped: [...] })` gives `base: 'alice/p:steam'`.
  - `scoped('alice/p', 'steam', { ..., world: 'steampunk', worldName: 'Steampunk' }, ...)` gives `world: 'alice/p:steampunk'`; with `world: 'w40k'` it stays `w40k`.
- [ ] **Step 2: Run** `node ui/themepack.test.mjs`: fails.
- [ ] **Step 3: Implement.** Colour components: 0 to 255, alpha 0 to 1.
- [ ] **Step 4: Run** the test, then the full check: `node tools/themes_to_packs.mjs --from <the last commit before the loader> --check` still ends with `14 themes identical`.
- [ ] **Step 5: Commit**: `Theme packs: the check knows the art families and a colour's range; a pack's ids`.

---

### Task 2: the shape of a theme's sheets

**Files:** create `ui/artcheck.js`, `ui/artcheck.test.mjs`; modify `ui/art.test.mjs:117-125` and the face checks of `ui/faces.test.mjs` to call it.

**Interfaces:**
- Consumes: sheets as `loadSheet` returns them (`{ frames, anchors, tiles, meta }`).
- Produces:
  - `checkSheet(family, own, base) -> string[]`: every frame of `own` is a frame of `base` at the same size; every anchor key exists in `base`'s anchor of that name and has its shape (a pair of numbers where the base has one, an object of the same keys otherwise); every fill rule (`tiles`) has the keys and kinds the base's rule of that name has, and names only frames that exist. Messages start with `` `${family}: ` ``.
  - `checkFaces(own, base, frames) -> string[]`: `own` and `base` are `meta.objects`; each object of `own` has a known `kind` (the kinds `faces.js` builds), numeric rects of four numbers inside its frame, and names only face frames that exist in `frames`.

- [ ] **Step 1: Read** `ui/sprites.js` `sheetOf` and `ui/faces.js` (the header comment lists the object fields and kinds) to take the exact shapes; list them at the top of `artcheck.js`.
- [ ] **Step 2: Write the failing tests** in `ui/artcheck.test.mjs`, on small hand-built sheets: a clean one gives `[]`; one problem each for an unknown frame, a frame one pixel wider, an anchor key the base lacks, an anchor that is a string, a fill rule naming a missing frame, a face object of kind `sphere`, a rect of three numbers. Then: every shipped theme's sheets and faces pass (`ART.themed`, `FACES.worlds` against `ART.base`, `FACES.base`).
- [ ] **Step 3: Run**: fails. **Step 4: Implement.** **Step 5:** replace the equivalent asserts in `art.test.mjs` and `faces.test.mjs` by a call asserting `[]`, keeping their messages' content.
- [ ] **Step 6: Run** the full check. **Step 7: Commit**: `Theme packs: the shape of a theme's sheets, checked by code the tests share`.

---

### Task 3: packs in the loader

**Files:** modify `ui/themes.js`, `ui/art.js`, `ui/sprites.js`, `ui/faces.js`, `ui/app.js`, `ui/mobile.js`, `ui/themes.test.mjs`.

**Interfaces:**
- Consumes: `scoped`, `checkTheme`, `themeOf` (Task 1); `checkSheet`, `checkFaces` (Task 2).
- Produces:
  - `readArt(name, as, root)` and `loadSheet(family, root)` accept, as `root`, a function `name => Promise<Uint8Array>` besides a URL string.
  - `loadPacks(packs, read) -> Promise<void>`: `packs` is `[{ id, dir, themes: [folder] }]`, `read(dir, path) -> Promise<Uint8Array>` (path is `<folder>/<file>`). Registers each valid theme as `<pack id>:<folder>` in the pack's listed order, world themes before styles. Never throws.
  - `PACKS`: `Map<pack id, { dir, themes: [{ id, name, world, style: boolean }], problems: [{ theme, message }] }>`, filled by `loadPacks`, extended by `dropTheme`.
  - `dropTheme(id, message)`: removes a pack's theme from `THEMES` and records the problem; a no-op with a thrown error for a shipped id.
  - `guarded(draw) -> draw`: wraps a frame function; if it throws while `T.id` is a pack's theme, it calls `dropTheme`, `setTheme('tier2')`, and does not rethrow; otherwise rethrows.

- [ ] **Step 1: Write the failing tests** in `ui/themes.test.mjs`, with an in-memory `read` over a map of files:
  - a pack `{ id: 'alice/p', dir: 'alice__p', themes: ['pink'] }` with `pink/theme.json` = a style of `vault`: `THEMES['alice/p:pink']` exists, its `world` is `vault`, `PACKS.get('alice/p').problems` is empty.
  - a pack with a world `steam` (`world: 'steampunk'`, `worldName: 'Steampunk'`) and a style `rose` of it: both registered, `WORLDS['alice/p:steampunk'] === 'Steampunk'`, `THEMES['alice/p:rose'].world === 'alice/p:steampunk'`, whichever order `themes` lists them in.
  - `bad/theme.json` = `{ not json`: no `alice/p:bad` in `THEMES`, one problem `{ theme: 'bad', message }` whose message names `bad/theme.json`; the pack's other theme is registered; the fifteen shipped themes are untouched (same keys, `resolve()` of `vault` deep-equal to before).
  - a theme whose `base` is another pack's theme: refused, the message names the base.
  - a style whose `art` lists `breakout` with a `breakout.json` holding a frame the base lacks: after the art is loaded (`await import('./sprites.js')` in a child process with a pack injected), the theme is gone and the problem names `breakout`.
  - `guarded`: with `T.id` a pack theme, a draw that throws leaves `T.id === 'tier2'`, records a problem, returns without throwing; with `T.id === 'vault'` it rethrows.
- [ ] **Step 2: Run**: fails.
- [ ] **Step 3: Implement.** In `sprites.js` and `faces.js`, a pack theme's sheets are read with its pack's reader, checked with `checkSheet` / `checkFaces`, and any error or problem calls `dropTheme` instead of throwing; shipped themes keep throwing. A style with its own `art` gets its own faces when it has a `faces.json`, else its base's (the carried-over item). An error on a sheet names `<theme>/<file>` (the carried-over item).
- [ ] **Step 4: Wrap** the frame functions of `app.js` and `mobile.js` in `guarded`.
- [ ] **Step 5: Run** the full check; the flat and 39° hashes are unchanged.
- [ ] **Step 6: Commit**: `Theme packs: the loader takes packs, a broken one is left out with its reason`.

---

### Task 4: the themes folder, listed and served

**Files:** create `src-tauri/src/packs.rs`; modify `src-tauri/src/main.rs`, `src-tauri/src/remote/mod.rs`, `src-tauri/src/remote/app.rs`, `ui/themes.js`, `ui/bridge.js`, `docs/remote-api.md`.

**Interfaces:**
- Produces (Rust, in `packs.rs`, no Tauri types):
  - `pub struct Pack { pub id: String, pub dir: String, pub repo: Option<String>, pub installed: Option<String>, pub themes: Vec<String> }` (serde `Serialize`).
  - `pub fn list(root: &Path) -> Vec<Pack>`: each folder of `root` whose name is a plain segment; `repo` and `installed` from its `pack-source.json` when present (then `id` is the repo), else `id` is `local/<dir>`; `themes` are its sub-folders holding a `theme.json`, sorted. A missing `root` gives an empty list.
  - `pub fn read(root: &Path, rel: &str) -> Option<Vec<u8>>`: `rel` is `<dir>/pack.json` or `<dir>/<folder>/<name>.json|png`; every segment plain (letters, digits, `.`, `-`, `_`, no leading `.`); the canonical path stays inside `root`; a regular file of at most 2 MiB.
- Commands: `theme_packs() -> Vec<Pack>`, `theme_pack_file(path: String) -> tauri::ipc::Response` (the bytes, or an error). Root: `app.path().app_data_dir()?.join("themes")`.
- Phone: `GET /api/theme_packs` (read-only call, behind the existing auth) and the asset route serves `themes/<rel>` through `packs::read` before the embedded assets.
- UI: at the end of `ui/themes.js`, after the shipped themes: `const packs = await invoke('theme_packs').catch(() => [])`, then `await loadPacks(packs, read)` with `read` = the command on the host, `fetch('/themes/<dir>/<path>')` on the phone. No backend (the tools, the tests): no packs.

- [ ] **Step 1: Write the failing Rust tests** in `packs.rs` on a temp folder: `list` (an installed pack with its source file, a local one, a folder without themes, a `.hidden` folder ignored, a missing root); `read` returns the bytes of `p/pink/theme.json` and of `p/pack.json`, and `None` for `p/../x`, `/etc/passwd`, `p/pink/x.js`, `p/a/b/c.json`, `p/.git/config`, a symlink pointing outside, a 3 MiB file, `pack-source.json`'s neighbour `p/pack-source.json` (not served).
- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml packs`: fails. **Step 3: Implement.**
- [ ] **Step 4: Write the failing remote tests** in `remote/mod.rs`: `get("/api/theme_packs", &authed)` routes to the new call; `get("/themes/p/pink/theme.json", &authed)` routes to an asset; unauthenticated, both are refused like the other routes; `POST /api/theme_packs` is a 404 or 405.
- [ ] **Step 5: Implement** the route, the asset path, the two commands and their registration; `docs/remote-api.md` lists the route.
- [ ] **Step 6: Write the failing UI test** in `ui/themes.test.mjs` (child process on `ui/testdom.mjs` with `replies.theme_packs` and `replies.theme_pack_file`): the pack's theme is registered after `import('./themes.js')`; with `theme_packs` rejecting, the shipped fifteen load and nothing throws.
- [ ] **Step 7: Run** the full check (UI, cargo test, clippy). **Step 8: Commit**: `Theme packs: packs in the themes folder are listed, served and loaded`.

---

### Task 5: install, update, remove

**Files:** modify `src-tauri/src/packs.rs`, `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`.

**Interfaces:**
- Produces (Rust):
  - `pub fn repo_ok(repo: &str) -> bool` (the pattern of the Global Constraints).
  - `pub fn unpack(archive: &[u8], dest: &Path) -> Result<usize, String>`: a gzip tar whose entries sit under one top folder (GitHub's `<repo>-<sha>/`); keeps only what the Global Constraints allow, within the limits; returns the number of files written; an error if no `<folder>/theme.json` was kept (`"no theme in this repository"`).
  - `pub fn install(root: &Path, repo: &str, archive: &[u8], now: &str) -> Result<Pack, String>`: unpacks into a temporary folder inside `root`, writes `pack-source.json` (`{ "repo", "installed" }`), then swaps it into `<owner>__<repo>` (the old folder moved aside first, deleted after; put back if the swap fails). The temporary folders start with `.` so `list` never shows them.
  - `pub fn remove(root: &Path, dir: &str) -> Result<(), String>`: `dir` a plain segment inside `root`.
- Commands (host only, async): `theme_pack_install(repo) -> Pack` downloads `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD` with `reqwest` (stop reading past 20 MiB; a 404 says `"no public repository <repo>"`), then `install`; `theme_pack_update(dir) -> Pack` reads the repo from the pack's source file and installs again (a local pack is refused); `theme_pack_remove(dir)`; `restart()` restarts the app.

- [ ] **Step 1: Write the failing Rust tests**, building archives in memory with `tar` and `flate2`:
  - a clean archive (`r-abc/pack.json`, `r-abc/LICENSE`, `r-abc/pink/theme.json`, `r-abc/pink/breakout.png`) installs: the four files are there, `pack-source.json` holds the repo, `list` shows the pack with `themes: ["pink"]`.
  - hostile entries are dropped and the rest installs: `r-abc/../evil.json`, `/abs.json`, a symlink `r-abc/pink/link.json`, `r-abc/pink/big.png` of 3 MiB, `r-abc/a/b/deep.json`, `r-abc/pink/run.js`, `r-abc/.github/x.json`; none of them exists anywhere under the temp root afterwards.
  - an archive without any `theme.json`: an error, nothing left in `root` (no pack, no temporary folder).
  - more than 2000 files, or more than 50 MiB unpacked: an error, nothing left.
  - update: installing a second archive over the pack replaces it whole (a file only in the first archive is gone).
  - update that fails (second archive has no theme): the first pack is intact.
  - `repo_ok`: `alice/adm-themes`, `a/b.c_d-e` pass; `alice`, `alice/..`, `../x`, `a/b/c`, `a b/c`, `-a/b`, a 40-letter owner fail.
  - `remove("p")` deletes it; `remove("../x")` and `remove(".tmp")` are refused.
- [ ] **Step 2: Run**: fails. **Step 3: Implement**; add `reqwest`, `tar`, `flate2` to `Cargo.toml` at the locked versions, with the TLS feature the updater already pulls in.
- [ ] **Step 4: Check** `git diff src-tauri/Cargo.lock`: only the `administratum` package's dependency list changed, no new `[[package]]`.
- [ ] **Step 5: Run** cargo test and clippy. **Step 6: Commit**: `Theme packs: a repository is installed, updated and removed (commands)`.

---

### Task 6: "Added themes" in Settings

**Files:** modify `ui/index.html` (section `data-cat="hall"`, after the first fieldset), `ui/settings.js`, `ui/theme.js` (`TEXT.prefs.packs`), `ui/settings.test.mjs`, `README.md` (the Settings table and a short "Themes from others" paragraph).

**Interfaces:**
- Consumes: `PACKS` (Task 3); commands `theme_packs`, `theme_pack_install`, `theme_pack_update`, `theme_pack_remove`, `restart` (Tasks 4, 5).
- Produces: `initPacks(form)` in `ui/settings.js`, called from `initSettings`. The fieldset is `data-host` (the phone does not show it).

Wording (`TEXT.prefs.packs`): `title: 'Added themes'`, `add: 'Add from GitHub'`, `placeholder: 'owner/repo'`, `install: 'Install'`, `update: 'Update'`, `remove: 'Remove'`, `local: 'local folder'`, `count: ['{n} theme', '{n} themes']`, `restart: 'Restart to apply'`, `none: 'None yet.'`, `installing: 'Downloading…'`, `bad: 'Not a repository name: owner/repo'`.

- [ ] **Step 1: Write the failing tests** in `ui/settings.test.mjs`:
  - with `replies.theme_packs` = one installed pack and one local pack, the list has two rows: the repo with its theme count and *Update*, *Remove*; the local one tagged `local folder`, with no *Update*.
  - a pack with a problem in `PACKS` shows the theme and the message on its row, as text (a message containing `<b>` shows the characters, `row.querySelector('b') === null`).
  - typing `alice/adm-themes` and clicking *Install* invokes `theme_pack_install` with `{ repo: 'alice/adm-themes' }`, shows `Downloading…`, then the new row and a *Restart to apply* button; clicking it invokes `restart`.
  - typing `nope` shows `Not a repository name: owner/repo` and invokes nothing.
  - an install that rejects with `no public repository x/y` shows that text and re-enables the button.
  - *Remove* invokes `theme_pack_remove` with the pack's `dir`, drops the row, shows *Restart to apply*.
- [ ] **Step 2: Run**: fails. **Step 3: Implement**, in the style of `initUpdates`.
- [ ] **Step 4: World picker**: a pack's world appears in the world list with its name; a pack's style of a shipped world appears among that world's styles. Assert both in `settings.test.mjs` with a pack registered before `initSettings`.
- [ ] **Step 5: Run** the full check. **Step 6: Look at it**: serve the repository root and open `http://localhost:8123/tools/preview.html`, open Settings > Hall: the fieldset is drawn in the panel's style in two worlds (Ordo Administratum and one light-chrome world, Breaking Bad).
- [ ] **Step 7: Commit**: `Theme packs: Added themes in Settings, install by owner/repo`.

---

### Task 7: the author's kit

**Files:** create `tools/theme_pack.mjs`, `docs/theme-packs.md`, `docs/theme-pack-template/` (`pack.json`, `LICENSE`, `README.md`, `vault-pink/theme.json`, `workshop/theme.json`, `workshop/breakout.json`, `workshop/breakout.png`); modify `docs/DEVELOPMENT.md`, `docs/README.md`, `ui/themes.test.mjs`.

**Interfaces:**
- Consumes: `loadPacks`, `PACKS` (Task 3), the sheet checks (Task 2).
- Produces: `node tools/theme_pack.mjs check <folder>`: `<folder>` is a pack (holds theme folders) or one theme folder (its parent is then the pack). It loads the pack exactly as the app does, with a reader on the file system, loads its art, and prints one line per problem (`<theme>: <message>`), then `<n> themes ok, <m> with problems`. Exit code 0 only when there is no problem. It also reports what the installer would drop (a file two levels deep, a `.js`, a file over 2 MiB) as warnings.

- [ ] **Step 1: Build the template.** `vault-pink`: a style of `vault` (`base`, two or three `bands`, its own `name`, `subtitle`, `motto`). `workshop`: a small world (`world: "workshop"`, `worldName: "Workshop"`, a short `px`, a few `text` keys) that redraws one family, `breakout`, copied from `ui/art/forge/breakout.*` so the sheet is valid art in the key palette. `LICENSE`: MIT with a placeholder holder and a line saying the art copied from Administratum is © Guillaume Lemer, MIT. `README.md`: what the pack is and how to install it.
- [ ] **Step 2: Write the failing test** in `ui/themes.test.mjs`: in a child process, `node tools/theme_pack.mjs check docs/theme-pack-template` exits 0 and prints `2 themes ok, 0 with problems`; on a copy with `"px": { "r": "red" }` in `workshop/theme.json` it exits 1 and prints a line starting with `workshop:`.
- [ ] **Step 3: Implement** the tool. **Step 4: Run** the test and the full check.
- [ ] **Step 5: Write `docs/theme-packs.md`**: what a pack is (a collection, worlds and styles, copy a world to vary it); the `theme.json` keys (the spec's table) with one example of each kind; the key palette (`ui/art/key.gpl`) and how to draw a sheet; the families and their frame sizes (generated list: `node tools/sprite_sheet.mjs --list`); trying a pack from the local folder (its path on Linux, macOS, Windows) and the restart; `tools/theme_pack.mjs check`; publishing (a public repository, a licence); what a pack cannot do (no code, no behaviour, limits). Link it from `docs/README.md` and `docs/DEVELOPMENT.md`.
- [ ] **Step 6: Commit**: `Theme packs: the author's guide, a template and the pack check`.

---

### Task 8: the whole path, once

No new code: a run of the real thing, recorded in the pull request.

- [ ] **Step 1:** copy `docs/theme-pack-template` into the app's themes folder as a local pack, start the app (`cargo run` in `src-tauri`, or an unbundled build under a throwaway identifier so it runs beside an installed app), pick the *Workshop* world and the pink Vault style, in Flat and 39°.
- [ ] **Step 2:** break the pack (a pixel outside the palette in `workshop/breakout.png`), restart: the app starts, *Workshop* is absent, Settings shows the reason.
- [ ] **Step 3:** install a real public repository holding the template by `owner/repo` (needs one to exist: ask the user for the repository to use, or to create it), restart, pick a theme, update, remove.
- [ ] **Step 4:** the phone view lists and draws a pack's theme (remote view on, the page opened in a desktop browser is enough).
- [ ] **Step 5:** write what was run and seen, and what was not (macOS, Windows, a real phone), in the pull request's Testing section.
