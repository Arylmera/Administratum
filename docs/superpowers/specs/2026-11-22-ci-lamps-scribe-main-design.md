# CI lamps: one per scribe, one for main (I6b)

The I6 lamp (`2026-11-21-ci-verdict-design.md`) becomes two lamps: a small one beside each scribe's desk, the CI of
that session's own last push, and a department lamp beside the consoles, the CI of the repository's default branch
(`main`). The single department lamp of I6, which followed the newest push of any branch, goes.

Status: draft, 2026-11-22. From the user's answer: "dans la version OpenSpace et la version room on aurait également à
côté de la console, en plus de la lampe de chacun des scribes, une lampe générique [...] cette lampe globale".

## Intent

Today one lamp stands beside a department's first desk and shows the CI of the newest push made from that folder,
whatever the branch. With sessions working in worktrees, that is a `claude/*` branch: the lamp says nothing about
`main`, and it cannot say which scribe's push it shows. The user wants to read two things in the hall at a glance:

- Is my push green? One lamp per scribe, at its desk.
- Is `main` green? One lamp per department (folder), at a fixed spot near its consoles.

**Goals**
- Each session that pushed shows its push's CI on a lamp beside its own desk, in every hall plan.
- Each department whose folder has a GitHub remote shows the CI of the default branch's head commit, kept current
  when `main` moves on GitHub (a merged PR), not only when a session pushes it.
- The phone's remote view shows both lamps, including when it connects after the last change (fixes I6 finding F1).

**Non-goals**
- PR status, reviews, mergeability (unchanged from I6).
- Branches other than the default one at department level.
- Lamps for sessions that never pushed in this run.

**Anti-goals** (a failure even if it works)
- Any network call or `gh` process while `adm.ci` is off.
- An unlit lamp at every desk: a scribe with nothing to show draws no lamp.
- A department lamp whose state silently goes stale: when the main poll cannot run, the lamp goes unlit, it does not
  keep its last colour.

## Design

### 1. Setting

No new switch: `adm.ci` (Settings > Petitions > Monitoring) turns on both lamps. The main poll interval is a constant
(section 3), not a setting.

### 2. The scribe lamp

- **State:** the session's own CI, the `Session.ci` the roster already carries (`registry/mod.rs` `Session.ci`, filled
  in `main.rs` from `hub.card`). No backend change: the data exists, the card already shows it as a text line.
- **When drawn:** only while the session has a `ci` (it pushed in this run and that push has a state other than
  `none`). It stays until the session's next push replaces it or the session ends, like the card line. A session that
  ends mid-CI takes its lamp with its desk; its verdict still reaches the Chronicon.
- **Frames:** the I6 `CILAMP` family and its rules, unchanged (`ui/cilamp.js` `frameOf`, `LENS`, the glow): amber
  blinking while running, green, red, unlit (`off`) after `timeout` or `error`.
- **Where:** beside each scribe's desk, in the gap after it, the spot I6 used for the first desk only
  (`layout.js` `lampSpots`: `d.x + (d.compact ? 22 : 32) + 2.5`, foot at the block top + 8), now for every desk. Open
  hall, rooms plan, west wing rooms, break-out room; flat 3/4 and 39°.
- **Desktop strip and column:** no scribe lamp (no room beside a lectern); the card line carries the session's CI
  there, as today.
- **Hover and click:** the tip `<branch> · <sha7> · <state>`; the click opens that push's checks page
  (`ci_open` with the session id, already supported by `open_target`).

### 3. The department lamp (main)

**What it follows.** The head commit of the repository's default branch:

1. The branch: `refs/remotes/<remote>/HEAD` (a symbolic ref file, `ref: refs/remotes/origin/main`) in the common git
   dir, the remote being the one of the folder's current branch, else `origin`. When that file is absent (a repo not
   created by `git clone`): one `gh api repos/<owner>/<repo>` call, its `default_branch`, cached for the run.
2. The repository: the remote's `url` in `.git/config`, as I6. Not GitHub, or no remote: no department lamp.

This replaces I6's start check (section 2 of that spec), which looked at the folder's checked-out branch: that branch
is now the scribe's business.

**How it stays current.** A main tracker per department, apart from the push watches (it does not count in their cap
of 8):

- On first sight of the department in a run, and then every **5 min** while the department is in the roster, the
  tracker reads the branch's head and its CI from GitHub by branch name:
  `repos/<owner>/<repo>/commits/<branch>/check-runs?per_page=100` and `repos/<owner>/<repo>/commits/<branch>/status`.
  The combined status answer names the head `sha`; the check-runs are then read by that `sha` (`commits/<sha>/check-runs`), which replaces a `head_sha` filter on the by-branch answer.
- A new head SHA starts a fresh verdict for that commit (amber while it runs); polling then follows I6's rhythm
  (every 30 s) until a verdict, the no-CI end (3 min) or the cap (30 min), and falls back to the 5-min check.
- Verdict rules: I6 section 4, unchanged (early fail, pass after two polls that saw the same checks).
- **Early check when a scribe is done** (the user's answer, 2026-11-22: a scribe that leaves or ends its work
  usually means `main` is about to change, a PR merged). When a session of the department leaves the roster, or its
  turn ends (its roster `status` goes from `busy` to `idle`), the tracker checks at once and once more 2 min later (a merge
  that waits on CI lands a little after the turn), then falls back to the 5-min rhythm. Several such triggers in the
  same department within a minute make one check, not several. The trigger only brings the next check forward: it
  never adds a call while a verdict is already being polled at 30 s.
- A live push to the default branch from a session (an ordinary I6 watch on the same repo and branch) also moves the
  department lamp: the tracker takes that watch's state instead of polling the same commit twice.
- A department that leaves the roster stops its tracker; its lamp goes with its block.
- Rate limit: the I6 pause applies to trackers too. While paused, or after 3 failures in a row, or on a `gh`
  auth/access error, the lamp is unlit (anti-goal: no stale colour) and Settings > Status names the cause as in I6.

**Budget.** One department costs 2 calls every 5 min when idle (24 an hour), more only while a new head's CI runs.
Ten departments stay far under `gh`'s 5000 calls an hour.

**Where it stands.** At a fixed spot of the department's block on the console side, the same whether or not the
department has adepts (consoles exist only for reserved adept slots, so a console's own position cannot anchor it):
the block's far end from its plaque, its foot on the line the desks start at, clear of the lanes. Open hall, rooms
plan, west wing rooms, break-out room; flat 3/4 and 39°. Desktop strip and column: the spot I6 uses today (the plaque
cell), now showing main. Exact pixel spots: with the live sprite viewer open (CLAUDE.md).

**Art.** A new family `CIMAIN`, larger than the scribe's `CILAMP` so the two never read as the same thing (a beacon
or a wall lantern; the builder draws it), frames `off`, `amber`, `amber_dim`, `green`, `red`, flat and 39°, in the base
art; a world redraws it in its own style under `ui/art/<theme>/cimain.*`, packs included. Its lens colours are fixed
like `CILAMP`'s (`LENS`), the housing follows the theme.

**Hover and click.** The tip `main · <sha7> · <state>` (the real branch name); the click opens that commit's checks
page (`ci_open` with the department name, already supported by `open_target`, now resolving to the tracker's commit).

**Chronicon.** A verdict on a new main head records `ci-pass` / `ci-fail` as I6 does, once per commit; a commit
already given a verdict by a session's push is not recorded twice.

### 4. Events and the remote view

- `ci-lamps` keeps its shape and now carries the department (main) lamps only: `[{dept, cwd, state, branch, sha7,
  failed}]`.
- It is emitted on every poll tick, like `roster` (`main.rs`, the "ponytail: emit every tick" precedent), so a remote
  client that connects after the last change gets the lamps within a second. This fixes F1: today the event goes out
  on change only, `remote::publish` keeps no last frame, and the remote view has no `ci_lamps` command.
- The scribe lamps need no event: `Session.ci` rides on `roster`.

## Where it lives

- `src-tauri/src/ci.rs`: the default-branch lookup (`refs/remotes/<remote>/HEAD`, the `default_branch` fallback), the
  main tracker state machine (5-min check, hand-over to the 30-s rhythm, reuse of a same-branch push watch), the lamp
  rows built from trackers instead of `newest()`; the start check retired.
- `src-tauri/src/main.rs`: `ci-lamps` emitted every tick.
- `ui/cilamp.js`: the department list (main) and the scribe lamps from `Session.ci`.
- `ui/layout.js`: `lampSpots` split into the scribe spots (every desk) and the department spot (console side).
- `ui/scene.js`, `ui/scene39.js`, `ui/overlay.js`: drawing, hover, click for both kinds.
- Art: `ui/art/cimain.*`, its generator next to `tools/cilamp_art/`, `ui/sprites.js` `PROP_SHEETS`,
  `tools/sprite_catalog.mjs`, the committed galleries (`node tools/sprite_sheet.mjs`, `--theme` per world with art).
- Docs in the same change: README (What it shows, Settings), `docs/remote-api.md` (`ci-lamps` now main only, sent
  every tick), `docs/DEVELOPMENT.md`, the I6 spec's section 5 marked as superseded by this one.

## Tests

- Default branch: `refs/remotes/origin/HEAD` present (loose), absent (the `gh` fallback, called once per run), a
  worktree (the main repo's common dir), a non-GitHub remote (no tracker).
- Tracker with a fake clock and a stubbed `gh`: first check on first sight, then every 5 min; a new head SHA starts a
  verdict and switches to 30 s; the verdict returns it to 5 min; a session leaving or going idle brings a check forward
  (now and at +2 min), two triggers within a minute make one check, a trigger during the 30-s rhythm adds no call; a session's push to `main` is reused (no duplicate
  calls, one Chronicon record); a rate limit and 3 failures leave the lamp unlit; a department leaving the roster
  stops its calls; `adm.ci` off spawns no `gh` (the stub records calls).
- Check-runs of another `head_sha` than the status's `sha` are not counted.
- `ui/cilamp.test.mjs`: scribe lamps only for sessions with a `ci`, none for `none`; the department lamp from the event.
- `ui/layout.test.mjs`: one scribe spot per desk, in every hall plan; the department spot fixed with and without
  adept consoles, clear of desks, consoles and lanes; strip and column unchanged.
- Remote: a client that subscribes after the last change receives `ci-lamps` within one tick.
- Art: `node ui/art.test.mjs`, `node ui/sprites.test.mjs` with the new family.

## Left to the builder

- The `CIMAIN` look per world and its exact size; the exact department spot per hall plan and view, with the sprite
  viewer open.
- Theme wording for the main lamp's tip.
- Whether the tracker shares the watch thread's queue or keeps its own list in `Watcher`; calls stay serialized.
