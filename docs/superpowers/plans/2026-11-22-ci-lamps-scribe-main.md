# CI lamps: one per scribe, one for main — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single department CI lamp with a lamp beside each scribe's desk (its own last push) and a
department lamp near the consoles that tracks the default branch (`main`) on GitHub.

**Architecture:** The scribe lamp is UI only: it reads `Session.ci`, already on the `roster`. The department lamp gets
a new backend module `ci_main.rs`: one tracker per department, polled every 5 min, brought forward when a scribe ends
its turn or leaves, switched to the 30-s rhythm while a new head's CI runs, and fed by an I6 push watch when a session
pushes the default branch itself. `ci-lamps` then carries the trackers' lamps and goes out every tick.

**Tech Stack:** Rust (Tauri backend, `gh` CLI), vanilla ES modules (canvas hall), key-palette pixel art.

**Spec:** `docs/superpowers/specs/2026-11-22-ci-lamps-scribe-main-design.md` (and I6:
`docs/superpowers/specs/2026-11-21-ci-verdict-design.md`, whose rules it keeps unless it says otherwise).

## Global Constraints

- No `gh` process and no network call while `adm.ci` is off (every new call goes through the existing `Gated` runner).
- Main tracker: check every `IDLE_MS = 300_000`; while a new head's CI runs, I6's `POLL_MS = 30_000`, `NO_CI_MS =
  180_000`, `CAP_MS = 30 * 60_000`; verdict rules of I6 `evaluate` unchanged (pass needs two polls with the same ids).
- Early check: on a scribe's `busy` → `idle` or its leaving the roster: at once, then again `EARLY_AGAIN_MS = 120_000`
  later; triggers closer than `TRIGGER_GAP_MS = 60_000` in one department make one check; none while at 30 s.
- A department lamp never keeps a stale colour: rate-limit pause, 3 failures in a row, or a `gh` auth/access error
  make it unlit (`none`).
- `gh api` paths are always the real `repos/<owner>/<repo>/...`, never `{owner}/{repo}`.
- The scribe lamp uses the I6 `CILAMP` art (5 x 10 logical); the department lamp a new `CIMAIN` family, larger
  (7 x 14 logical, 14 x 28 art px), lens colours fixed like `LENS`.
- Desktop strip and column: no scribe lamp; the department lamp keeps I6's plaque spot.
- Art changes: run `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, then `node tools/sprite_sheet.mjs` (and
  `--theme <id>` for each world with its own art), with the sprite viewer open (CLAUDE.md).

## Review Focus

- **A session pushes the default branch itself.** The scribe lamp and the department lamp both show that push; the
  tracker makes no own `gh` call for it; the Chronicon gets one record, not two. (Task 2, Task 3 tests.)
- **No `refs/remotes/origin/HEAD` and `gh` missing or logged out.** No department lamp, no panic, one Settings > Status
  note, and no retry storm (the `default_branch` lookup is tried at most once per department per run). (Task 2 test.)
- **Scribes toggling `busy`/`idle` at every turn.** At most one early check a minute per department; a department that
  leaves the roster stops its calls within `GONE_MS = 10_000`. (Task 2 test.)
- **The setting goes off mid-step.** Trackers are dropped, `ci-lamps` sends `[]`, no further `gh` call. (Task 3 test.)
- **A full block whose last slot is a desk or a console.** The department lamp stays clear of every desk, console,
  scribe lamp and lane in every hall plan. (Task 5 layout test.)

---

### Task 1: Default branch and branch-addressed calls (`ci.rs`)

**Files:**
- Modify: `src-tauri/src/ci.rs` (refs section ~line 142-266, `Target` ~205-226)

**Interfaces:**
- Produces:
  - `pub struct MainRef { pub repo: Repo, pub branch: Option<String> }` — `branch` None when `origin/HEAD` is absent.
  - `pub fn default_branch_of(cwd: &Path) -> Option<MainRef>` — remote: `branch.<current>.remote` (not `.`), else
    `origin`; branch from the loose `refs/remotes/<remote>/HEAD` (`ref: refs/remotes/<remote>/<b>`) in the common git
    dir; repo from that remote's `url`. None: no git dir, no such remote, not GitHub. Works from a linked worktree.
  - `pub fn parse_default_branch(repo_json: &str) -> Option<String>` — `default_branch` of `gh api repos/o/r`, checked
    with `valid_ref_name`.
  - `pub fn status_sha(status_json: &str) -> Option<String>` — the combined status's `sha`, 40 lowercase hex only.
  - `pub(crate) fn branch_api(repo: &Repo, branch: &str, what: &str) -> String` → `repos/<o>/<r>/commits/<branch>/<what>`.
  - `Target::api` becomes `pub(crate)`.

- [ ] **Step 1: Write the failing tests** in `ci.rs` `mod tests`, reusing the `repo(d, branch, url, loose)` and
  `temp(name)` helpers:
  - `default_branch_from_origin_head`: write `.git/refs/remotes/origin/HEAD` = `ref: refs/remotes/origin/main\n` on a
    repo checked out on `feat`; assert `default_branch_of(&r) == Some(MainRef { repo: o/r, branch: Some("main") })`.
  - `default_branch_without_origin_head`: same repo, no HEAD file → `branch == None`, `repo.slug() == "o/r"`.
  - `default_branch_in_a_worktree`: the `a_worktree_finds_the_main_repos_refs_and_config` setup plus origin/HEAD in the
    main repo's `.git` → `Some("main")`.
  - `default_branch_not_github`: gitlab url → None. A HEAD file naming `../../etc` → `branch == None`.
  - `parse_default_branch_cases`: `{"default_branch":"trunk"}` → `Some("trunk")`; `{}`, `not json`,
    `{"default_branch":"a/../b"}` → None.
  - `status_sha_cases`: `{"sha":"<SHA>","statuses":[]}` → `Some(SHA)`; a 7-char sha, an uppercase one, no field → None.
  - `branch_api_path`: `branch_api(&Repo{o,r}, "main", "status") == "repos/o/r/commits/main/status"`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test ci::tests::default_branch` (background, it compiles the crate).
  Expected: FAIL, `default_branch_of` not found.
- [ ] **Step 3: Implement** the five items above next to `start_target`, reusing `git_dirs`, `read_config`,
  `config_get`, `parse_remote_url`, `valid_ref_name`.
- [ ] **Step 4: Run** `cargo test ci::` → all pass (66 before + the new ones).
- [ ] **Step 5: Commit** `git add src-tauri/src/ci.rs && git commit -m "I6b: default branch lookup and branch-addressed gh paths"`

### Task 2: The main trackers (`ci_main.rs`)

**Files:**
- Create: `src-tauri/src/ci_main.rs` (declare `mod ci_main;` in `src-tauri/src/main.rs` next to `mod ci;`)
- Modify: `src-tauri/src/ci.rs` — make `Gh`, `GhError`, `CiState`, `CiStatus`, `Lamp`, `Link`, `Ended`, `Finished`,
  `evaluate`, `Snapshot`, `Verdict`, `same_branch`, `rate_limit_reset`, `MAX_FAILURES`, `DEFAULT_PAUSE_MS` reachable
  as `pub(crate)` where not already; move the test `Stub` gh into a `#[cfg(test)] pub(crate) mod testgh` so both
  modules use it.

**Interfaces:**
- Consumes: Task 1's `default_branch_of`, `parse_default_branch`, `status_sha`, `branch_api`, `Target::api`.
- Produces (all in `ci_main`):
  - consts `IDLE_MS`, `EARLY_AGAIN_MS`, `TRIGGER_GAP_MS`, `GONE_MS` (values in Global Constraints).
  - `pub struct MainEnded { pub dept: String, pub target: Target, pub ended: Ended }`
  - `#[derive(Default)] pub struct Mains` with:
    - `pub fn see(&mut self, dept: &str, cwd: &str, now_ms: i64)` — creates the department's tracker on first sight
      (`default_branch_of(cwd)`; None → remember the dept as untracked for the run, never retried), first check due at
      once; on every sight refreshes `last_seen_ms`.
    - `pub fn scribe_done(&mut self, dept: &str, now_ms: i64)` — the early check rule.
    - `pub fn tick(&mut self, gh: &dyn Gh, now_ms: i64, live: &dyn Fn(&Repo, &str) -> Option<CiState>) -> Vec<MainEnded>`
    - `pub fn adopt(&mut self, f: &Finished)` — a push watch on a tracked default branch ended: the tracker takes its
      commit and state, goes back to `IDLE_MS`, records no `MainEnded` (the push already has its Chronicon event).
    - `pub fn lamp_rows(&self) -> Vec<Lamp>` (sorted by dept), `pub fn links(&self) -> Vec<Link>` (`session_id: None`)
    - `pub fn paused_until(&self) -> i64`, `pub fn pause(&mut self, until_ms: i64)`, `pub fn clear(&mut self)`

**Tracker rules (the algorithm the tests pin):**
- A tracker whose `branch` is unknown first calls `gh api repos/<o>/<r>` once; cached per repo slug for the run;
  unparseable or an error → the dept becomes untracked, `MainEnded { ended: Skipped(..) }` for auth/access errors.
- A due tracker (not paused, `now >= next_ms`, seen within `GONE_MS`) whose `live(repo, branch)` is Some mirrors that
  state and makes no call. Otherwise one poll = `gh api branch_api(repo, branch, "status")` (→ `status_sha`), then
  `gh api target.api("check-runs?per_page=100")` on that sha, then `evaluate`.
- New sha: reset `prev_ids`, `seen`, `failures`, `started_ms = now`. State: `Running` while the verdict is Running;
  `Fail` at once (back to idle); `Pass` once stable (back to idle); an unconfirmed Pass on a new head shows `none`;
  `NoCi` after `NO_CI_MS` → `none`, idle; `CAP_MS` → `Timeout`, idle. Running or unconfirmed → next in `POLL_MS`.
- Idle: next = the pending early-again time if any, else `now + IDLE_MS`.
- Errors: as I6 `Watcher::poll` (Missing / NotLoggedIn / NoAccess → `none` + `Skipped`; RateLimit → `pause`, every
  lamp `none` while paused; Other: `failures += 1`, at 3 → `none`, `Error`, idle).
- A verdict reached by the tracker's own polls on a head it had not given one yet → `MainEnded` Pass / Fail.
- A tracker not seen for `GONE_MS` is dropped (lamp and link go).

- [ ] **Step 1: Write the failing tests** in `ci_main.rs` `mod tests` (stub gh, fake clock `T0`, a temp repo with
  `origin/HEAD` → `main`):
  - `first_sight_checks_at_once_then_every_five_minutes`: `see` at T0; `tick(T0)` makes 2 calls; a stable pass needs
    the T0+30 s poll; after the pass the next call is at `+IDLE_MS`, not before.
  - `a_new_head_runs_at_thirty_seconds_until_its_verdict`: status sha changes at the 5-min poll, runs Running →
    lamp `running`, calls at +30 s; a failed run → lamp `fail`, one `MainEnded::Fail("build")`, back to 5 min.
  - `an_old_green_head_is_unlit_until_confirmed`: first poll Pass → lamp `none`; second poll → `pass`.
  - `scribe_done_brings_the_check_forward`: idle at T0+60 s, `scribe_done` → a poll at that tick and at +120 s, then
    +IDLE_MS; a second `scribe_done` 30 s after the first adds no poll; `scribe_done` while at 30 s adds no poll.
  - `a_push_watch_on_main_is_reused`: `live` returns Running for (o/r, main) → no gh call, lamp `running`; `adopt` of a
    `Finished { ended: Pass }` → lamp `pass`, no `MainEnded`, next poll at +IDLE_MS.
  - `no_origin_head_asks_gh_once`: no HEAD file; `repos/o/r` → `{"default_branch":"main"}` once, then polls; with
    `gh` Missing: one `Skipped("gh not found")`, no second lookup on later `see`s.
  - `errors_leave_the_lamp_unlit`: rate limit → `paused_until` set, lamp `none`; three `Other` errors → `Error`, `none`.
  - `a_department_gone_stops_its_calls`: no `see` for `GONE_MS` → tracker dropped, no call, `lamp_rows()` empty.
  - `a_non_github_folder_has_no_tracker`.
- [ ] **Step 2: Run** `cargo test ci_main::` → FAIL (module empty).
- [ ] **Step 3: Implement** `Mains` and its private `Tracker` per the rules above.
- [ ] **Step 4: Run** `cargo test ci_main:: ci::` → all pass.
- [ ] **Step 5: Commit** `git commit -m "I6b: main trackers, one per department, polled every 5 min and early when a scribe is done"`

### Task 3: Wiring, the start check retired, `ci-lamps` every tick

**Files:**
- Modify: `src-tauri/src/ci.rs` (`Input`, `Worker`, `Hub`, `View`, `Watcher`, `open_target`, tests)
- Modify: `src-tauri/src/main.rs:784-811` (hand-in, Chronicon, emit)

**Interfaces:**
- Consumes: Task 2's `Mains`, `MainEnded`.
- Produces:
  - `Input.done: Vec<String>`; `Hub::submit(&self, enabled: bool, pushes: Vec<CiPush>, folders: Vec<(String, String)>, done: Vec<String>)`
    (`next()` also wakes on a non-empty `done`).
  - `pub fn scribes_done(prev: &[Session], now: &[Session]) -> Vec<String>` in `ci.rs`: the dept of each `prev`
    session with `status == "busy"` that is now `"idle"` or absent, deduped.
  - `Watcher::live_on(&self, repo: &Repo, branch: &str) -> Option<CiState>`, `Watcher::pause(&mut self, until_ms: i64)`.
  - `pub fn main_verdict_event(m: &MainEnded, now_ms: i64) -> Option<Event>`: kind `ci-pass` / `ci-fail`,
    `session_id: String::new()`, `name` and `dept` the department, detail `<branch> · <sha7>[ · <check>]` (precedent:
    the vigil event, `vigil/app.rs:70`). `Hub::take_main_verdicts(&self) -> Vec<MainEnded>`.
  - `open_target`: a department name resolves only among links with `session_id == None` (the trackers').
- Removed: `Watcher::start_check`, `Watcher.checked`, `Watch.start_check`, `start_target` if unused after Task 1,
  `lamps_changed`, `Hub::lamps_if_changed`, `View.sent`, `Watcher::lamp_rows`/`lamps`/`newest`, and their tests
  (`start_target_cases`, the `start_check` tests ~1715-1820). Grep each name to zero before the commit.

- [ ] **Step 1: Write the failing tests**:
  - `worker_feeds_the_trackers`: a `Worker::step` with `folders: [("Terra", cwd)]` makes the tracker's 2 calls;
    `done: ["Terra"]` at +60 s makes 2 more.
  - `a_push_to_main_is_one_record`: a live push to `main` + a tracker on `main`: one gh pair a poll (not two), the
    push's `Finished` gives one `verdict_event`, `take_main_verdicts` is empty.
  - `off_mid_step_drops_the_trackers`: `enabled` false → `hub.lamps()` empty, the stub records no call.
  - `the_folder_lamp_opens_main`: `open_target(links, "Terra")` returns the tracker commit's checks URL even when a
    session of Terra pushed another branch later.
  - `scribes_done_cases`: busy→idle, busy→gone, idle→idle (none), waiting→idle (none), two in one dept (one entry).
- [ ] **Step 2: Run** `cargo test ci::` → FAIL.
- [ ] **Step 3: Implement** the wiring: `Worker` owns `mains: Mains`; `step_with` order: pushes → `mains.see` per
  folder → `mains.scribe_done` per done → `watcher.tick_with` → `mains.adopt` per finished → `mains.tick(.., &|r, b|
  watcher.live_on(r, b))`; one shared pause (`max` of both, written back to both); notes for `MainEnded` Skipped /
  Error as for push watches. `View` keeps push links and main links apart; `lamps` = `mains.lamp_rows()`. In
  `main.rs`: pass `ci::scribes_done(&prev, &roster)` to `submit`; extend events with `main_verdict_event`; replace
  the `lamps_if_changed` block by `emit(&app, "ci-lamps", hub.lamps());` every tick.
- [ ] **Step 4: Run** `cargo test` (whole crate, background) → all pass; `cargo build` clean of warnings.
- [ ] **Step 5: Commit** `git commit -m "I6b: wire the main trackers, retire the start check, send ci-lamps every tick"`

### Task 4: The `CIMAIN` art family

**Files:**
- Create: `tools/cimain_art.mjs`, `tools/cimain_art/kit.mjs`, `tools/cimain_art/tier2.mjs` (pattern:
  `tools/cilamp_art.mjs` and its folder), generated `ui/art/cimain.png` + `ui/art/cimain.json`
- Modify: `ui/sprites.js:73` (`PROP_SHEETS` + `'cimain'`), `ui/cilamp.js` (`LENS` + the `CIMAIN.*` lens chars),
  `ui/sprites.test.mjs:18-19` (sizes), `tools/sprite_catalog.mjs:53-55,128,188-189` (ABOUT, skip regex, one row
  after the CILAMP row), `docs/sprites/*.md` (regenerated)

**Interfaces:**
- Produces: frames `CIMAIN.off|amber|amber_dim|green|red`, 14 x 28 art px, anchors `CIMAIN: { foot: [7, 28], lens: [7, 6] }`;
  `LENS['CIMAIN.<lit frame>']` in the same signal colours as the matching `CILAMP` frame; `export const MAIN_SIZE = [7, 14]`
  in `ui/cilamp.js`.

- [ ] **Step 1: Open the sprite viewer** (`python -m http.server 8123` in the background if 8123 does not answer,
  then `http://localhost:8123/tools/sprites.html`, filter `CILAMP`).
- [ ] **Step 2: Add the sizes to `ui/sprites.test.mjs`**; run `node ui/sprites.test.mjs` → FAIL (no `CIMAIN.off`).
- [ ] **Step 3: Draw** the beacon in `tools/cimain_art/tier2.mjs` (a wall lantern or a beacon on a short post, clearly
  not the scribe's signal post; housing and post in the theme's iron slots, lens chars fixed by `LENS`); run
  `node tools/cimain_art.mjs`.
- [ ] **Step 4: Run** `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, `node ui/cilamp.test.mjs` → pass; reload the
  viewer and screenshot the five frames next to `CILAMP`.
- [ ] **Step 5: Regenerate** `node tools/sprite_sheet.mjs` and `--theme <id>` for each folder under `ui/art/` with a
  `theme.json`; commit `git commit -m "I6b: CIMAIN art, the department's main lamp"`

### Task 5: The hall: scribe lamps and the main lamp

**Files:**
- Modify: `ui/cilamp.js`, `ui/layout.js:508-527`, `ui/scene.js:386-391`, `ui/scene39.js:262-270`,
  `ui/overlay.js:250-310,385`, `ui/app.js:386-410`
- Test: `ui/cilamp.test.mjs`, `ui/layout.test.mjs:798-880`, `ui/overlay.test.mjs:239`, `ui/scene39.test.mjs:187-241`

**Interfaces:**
- Consumes: `MAIN_SIZE`, `LENS['CIMAIN.*']` (Task 4); `ci-lamps` now the main lamps (Task 3); `Session.ci` on the roster.
- Produces:
  - `cilamp.js`: `frameOf(state, now = 0, family = 'CILAMP')`; `lampsAt(spots, now)` returns `CIMAIN.*` frames with
    `size: MAIN_SIZE`; `scribeLampsAt(spots, sessions, now)` → for each spot `{ id, dept, x, y }` whose session has a
    `ci` with `state !== 'none'`: `{ ...spot, state, frame: frameOf(state, now), size: LAMP_SIZE }`; `GLOW` gains the
    `CIMAIN.*` frames (radius 16 lit, 9 dim).
  - `layout.js`: `scribeSpots(desks, H)` → `[]` for `H.strip` / `H.column`, else one `{ id: d.id, dept: d.dept,
    x: d.x + (d.compact ? 22 : 32) + 2.5, y: d.y }` per desk with an `id`; `mainSpots(blocks, H, desks)` → one
    `{ dept, x, y }` per non-empty, non-cell block: column and strip as `lampSpots` today, the halls at the block's
    east end on the console side, foot `b.y + 8`, at a spot clear of desks, consoles, scribe spots and lanes.
    `lampSpots` is removed (grep to zero).
  - `overlay.js`: `litLamps()` → `[{ kind: 'main' | 'scribe', who, s, ci, size }]` (`who` the dept or the session
    id, `ci` the lamp entry or `Session.ci`); `lampHit(lit, px, py, at, pad)` uses each item's `size`;
    `lampTip(item)`; `openLamp(who)` (invokes `ci_open { who }`, unchanged backend); lamp keys keyed `${kind}:${who}`.
  - `scene.js` / `scene39.js`: draw `lampsAt(mainSpots(..))` and `scribeLampsAt(scribeSpots(..), roster, now)`, each
    item at its own `size`.

- [ ] **Step 1: Write the failing tests**:
  - `cilamp.test.mjs`: `scribeLampsAt([{id:'s1',dept:'a',x:1,y:2},{id:'s2',dept:'a',x:5,y:2}], [{id:'s1',ci:{state:'fail'}},
    {id:'s2'}], 0)` → one lamp, `s1`, `CILAMP.red`; `state: 'none'` → none; `lampsAt` frames are `CIMAIN.*`;
    the LENS colour test also over `CIMAIN.*`.
  - `layout.test.mjs` (rewrite the `lampSpots` block): one scribe spot per occupied desk, none for free desks, none
    in strip and column; one main spot per department; the existing `clear(...)` check over both lists together in
    the open hall, a wide hall, the rooms plan, the west wing, and a block whose helpers fill its last slots;
    strip and column main spots equal to today's `lampSpots` values.
  - `overlay.test.mjs:239`: the hit test finds a scribe lamp at its desk and the main lamp at its spot; a click on
    each calls `ci_open` with the session id / the dept.
  - `scene39.test.mjs`: with a lamp list and a roster `ci`, both `CIMAIN.red` and `CILAMP.green` sprites are drawn;
    with neither, none.
- [ ] **Step 2: Run** `node ui/cilamp.test.mjs; node ui/layout.test.mjs; node ui/overlay.test.mjs; node ui/scene39.test.mjs` → FAIL.
- [ ] **Step 3: Implement** the interfaces above; `app.js` follows the renamed `openLamp(l.who)`.
- [ ] **Step 4: Run** every `ui/*.test.mjs` → pass. Then run the app (`run` skill) with `adm.ci` on, a department on
  GitHub and one session that pushed: screenshot the open hall, the rooms plan and the 39° view, hover both lamps.
- [ ] **Step 5: Commit** `git commit -m "I6b: a CI lamp per scribe, the main lamp near the consoles"`

### Task 6: Docs

**Files:**
- Modify: `README.md` (What it shows, Settings > CI), `docs/remote-api.md:106-111` (`ci-lamps` = the default branch's
  lamps, sent every tick), `docs/DEVELOPMENT.md` (the `ci_main.rs` module, the lamps), the I6 spec section 5 (a line:
  the lamp part superseded by I6b), the I6b spec section 3 (check-runs are read by the status's `sha`, which replaces
  the `head_sha` filter).

- [ ] **Step 1: Edit** the five places; each names the 5-min check, the early check on a scribe's end, the unlit
  rule, and the scribe lamp's absence in strip and column.
- [ ] **Step 2: Verify** `grep -rn "lampSpots\|start check\|lamps_if_changed" README.md docs/ ui/ src-tauri/src` shows
  only historical plan and spec files.
- [ ] **Step 3: Commit** `git commit -m "I6b: docs for the scribe and main CI lamps"`
