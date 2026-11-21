# CI verdict after a push (I6)

After a session pushes, Administratum asks GitHub for the CI result of the pushed commit and tells the user the
verdict, so they know whether CI passes without opening GitHub. Opt-in, through the user's own `gh` CLI.

Status: draft. Amended 2026-11-21 with the user's answer (joint spec
`2026-11-21-parallel-waves-design.md`, Q2): no toast; the verdict is a lamp drawn in each theme's own art, one per
folder (department), in every hall plan and view.

## Intent

The user pushes from many sessions and looks at the hall only now and then. Today the hall shows the push (the
servo-skull flies a seal out of the gate) and then nothing: to learn whether CI passed, the user opens GitHub. This
feature closes that gap. The user wants it in the hall, not as a notification: a lamp in the theme's own design, one
per folder, green, amber or red.

**Goals**
- A verdict (pass / fail) for each push a live session makes to a GitHub repository, shown by the lamp of that
  session's folder, without the user doing anything after turning the feature on.
- The state also on the card of the pushing session while CI runs and after.

**Non-goals**
- PR status, reviews, mergeability. The unit is the pushed commit, not the PR: a push to a branch with no PR also
  gets a verdict.
- GitLab, Bitbucket, other forges. A non-GitHub remote is ignored, silently.
- Re-running, cancelling or opening a fix for a failed run.
- Pushes made outside a Claude Code / OpenCode session (from the user's own terminal).

**Anti-goals** (a failure even if it works)
- Any network call or any `gh` process while the feature is off. Off is the default.
- The app storing, reading or logging a GitHub token. Authentication is `gh`'s own.
- Constant polling of GitHub: calls happen only after a push and only while that push's CI runs.
- Breaking the "read-only towards Claude Code" stance: nothing is sent to a session.
- A toast for a CI verdict (the user's choice).

## Constraints

- README > Privacy and safety states that git is never run and lists every network call. This feature adds a child
  process (`gh`) that makes network calls to GitHub with the user's credentials. The Privacy section and its file
  table must say so in the same change, and say it happens only when the setting is on.
- `gh` is run like `orca` (`src-tauri/src/orca.rs`): arguments straight to the process, never through a shell, through
  `no_window`, from a list of candidate paths (an app started from Finder or the Dock lacks the shell's `PATH`).
- The GitHub API is rationed (5000 requests/h for an authenticated user). `gh` calls are serialized: one at a time,
  app-wide.
- Windows, macOS and Linux.

## Approaches

| | Approach | Gains | Costs |
|---|---|---|---|
| **Chosen** | `gh` CLI: `gh api repos/{owner}/{repo}/commits/{sha}/check-runs` and `.../status` | The user's existing `gh` login; private repos work; the app holds no secret | Needs `gh` installed and logged in; a new child process to declare |
| Set aside | Direct HTTPS to the GitHub REST API | No `gh` dependency | Without a token: public repos only, 60 requests/h. With a token: the app stores a secret, more surface and more UI |

The user chose `gh`, opt-in.

## Design

### 1. Setting

- `adm.ci`, default `"0"` (off). In Settings > Petitions > Monitoring, next to the stuck-session settings
  (`ui/settings.js` `MONITOR`). No toast switch: I6 has no toast.
- Read by `monitor::config_from` like the other `adm.*` keys (new `Config` fields), so a save takes effect at once.
- When turned on, the app runs `gh auth status` once and shows the result under the switch: `gh ready`,
  `gh not found`, or `gh not logged in: run gh auth login`. No other UI for `gh`.

### 2. What starts a watch

The chronicle already emits a `push` event for a successful `git push` in a session's Bash call (`chronicle/mod.rs`,
`classify_call` / `push_target`). That `Event` carries only `remote/branch` and is serialized to day files and the
remote view, so it is **not** widened. Instead `classify_call` also hands out a side record, `CiPush` (session id,
name, dept, the session's `cwd`, the push command line and its raw output), collected next to `Found` and drained by
the CI watcher; it is never serialized and never leaves the backend.

A watch starts on a **live** push only, when `adm.ci` is on. Live means the line was read on a pass that is not the
first read of that transcript: `read_new`'s `today_only` flag false for Claude Code, `OcCursor.backfill` false for
OpenCode (the same rule that already gates `Src.branch`). A push found while backfilling at app start starts nothing.
A `git -C <dir> push` starts nothing either (the existing push detection already treats its repo as unknown).

From the push, the watch needs `owner/repo`, the branch, and the full commit SHA:

- **Repository:** the `To <url>` line of the push output when present (`github.com:owner/repo.git`,
  `https://github.com/owner/repo(.git)`); else the remote's `url` in the repo's `.git/config` (read directly,
  following a worktree to its main repo as `git::worktree_repo` does). Not github.com: no watch.
- **Branch and SHA:** the `<old>..<new>  <src> -> <dst>` line of the push output gives the destination branch and the
  short new SHA. The full SHA comes from `refs/remotes/<remote>/<dst>` (loose ref file, then `packed-refs`), which
  git updates on a successful push, checked to start with the short SHA. The repo is found from the session's `cwd`
  (`git::head_file` walk, worktrees through `git::worktree_repo`). If the output carries no such line (an up-to-date
  push, `-q`): no watch, silently; the README says a quiet push gets no verdict.
- A new push to the same repo and branch replaces that branch's watch. At most 8 watches live at once; a ninth drops
  the oldest.

### 3. Polling

- First call 20 s after the push (CI needs a moment to register), then every 30 s.
- Each poll: `check-runs` (`?per_page=100`) and the legacy combined `status`. Both are needed: Actions reports
  check-runs, some external CIs report statuses only.
- **No CI:** no check-run and no status after 3 min: the watch ends silently (the repo has no CI for that branch).
- **Cap:** 30 min after the push with no verdict: the watch ends with the state `timeout`.
- App quit ends all watches; they do not survive a restart.

### 4. Verdict

Over every check-run and status of the commit:

- **fail** as soon as any one is completed with `failure`, `timed_out`, `cancelled`, `action_required` or
  `startup_failure` (a status: `failure` or `error`). The verdict goes out at once, the watch ends: the user wants to
  know early, not after the slow jobs.
- **pass** when every check-run is completed with `success`, `neutral` or `skipped`, every status is `success`, and
  two consecutive polls saw the same set of checks (a workflow that registers late, after the first finished, must not
  get a pass too early; it costs one poll, 30 s).
- **running** otherwise: `done/total` counted for display.

### 5. What the user sees

- **A session that ends mid-CI:** the watch keeps the session's name, dept and folder from the push, so the lamp and
  the Chronicon event still change; only the card line is gone with the card.
- **Card** of the pushing session: one line `CI · <branch> · <sha7> · running 3/5` / `passed` / `failed: <check>` /
  `no verdict after 30 min`. It stays until the session's next push or the session ends.
- **Card** line click: opens the commit's checks page on GitHub
  (`https://github.com/<owner>/<repo>/commit/<sha>/checks`). The backend builds the URL itself from the watch (never
  from UI input) and checks it against `^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/[0-9a-f]{40}/checks$`
  before it calls `orca.rs` `open_url` (made `pub(crate)`; no `&` or `%` can reach `cmd /c start`).
- **The lamp, one per folder.** The unit is the department (one working folder, the dept key the roster already
  groups by). Its state is the verdict of that folder's latest live push: amber while CI runs, green after a pass, red
  after a fail; unlit when no push was seen since the app started, after `timeout`, `error` or no CI. The state stays
  until that folder's next push or the app quits. Where it stands follows the hall in force:
  - open hall: in each department's zone, on its block (beside the plaque or on the back wall above it);
  - rooms plan and custom rooms: in each room, one lamp per department the room holds;
  - Flat 3/4 and 39°: the same lamp, its 39° volume built like the other props;
  - desktop strip and column: on each department's plaque cell.
  The lamp is **theme art**, not a code-drawn dot: a new art family (`CILAMP`, frames `off`, `amber`, `green`, `red`,
  flat and 39°) in the base art, which every world uses until it redraws it in its own style
  (`ui/art/<theme>/cilamp.*`), theme packs included. Amber blinks while running (frame swap). A hover or a click on
  the lamp shows `<branch> · <sha7> · <state>`.
- **Chronicon:** events `ci-pass` / `ci-fail` with the branch and the failed check name, so the day's record and the
  day report carry them.
- **Remote view:** the card line, read-only.

### 6. Errors

- `gh` not found, not logged in, or a 401/403/404 from the API (no access to that repo): the watch ends, the lamp
  stays unlit, and the `gh` entry of Settings > Status (`integration_status`) names the cause
  (`CI check skipped: gh not logged in`). The Settings line shows the same. No toast.
- A rate-limit answer (403/429 with a rate-limit message): every watch pauses until the reset time `gh` reports,
  then resumes.
- Any other failure of a `gh` call: retry at the next poll; after 3 failures in a row the watch ends with the state
  `error` on the card.
- `gh` output is parsed as JSON only; nothing from it is passed to a shell or logged beyond the check names shown.

## Where it lives

- `src-tauri/src/ci.rs` (new): the pure parts (push output parsing, remote URL parsing, ref lookup, the verdict over
  check-runs + statuses, the watch state machine with an injected clock), and the `gh` runner (candidates, serialized
  calls).
- The poll loop in `main.rs` drives the watches on its own tick; `Session` (or the card's data) gets an additive
  `ci: Option<CiState>`.
- UI: `ui/settings.js` (the switch and the `gh` line), the card line, the lamp in `ui/scene.js` / `ui/scene39.js` /
  the strip and column, its art family under `ui/art/`, the theme text entries.
- Docs in the same change: README (What it shows table, Settings, Privacy and safety + its file table),
  `docs/remote-api.md` if the remote payload grows.

## Tests

- Unit tests over recorded `gh api` JSON: pass, early fail, running, no CI, statuses only, mixed check-runs and
  statuses, a skipped check.
- Push output parsing: ssh and https `To` lines, `main -> main`, `HEAD -> feat/x`, a new branch (`* [new branch]`),
  an up-to-date push, a forced push (`+`).
- Ref lookup: loose ref, `packed-refs`, a worktree.
- Watch state machine with a fake clock and a stubbed runner: first call at 20 s, the 3-min no-CI end, the 30-min
  cap, replace-on-new-push, the 8-watch limit, rate-limit pause, 3-failure end.
- The off switch: with `adm.ci` off, a push starts nothing and no `gh` process is spawned (the stub records calls).

## Left to the builder

- Exact candidate paths for `gh` per OS (Windows `Program Files\GitHub CLI\gh.exe`, Homebrew paths on macOS,
  `/usr/bin/gh` on Linux, plus `PATH`).
- The lamp's pixel size and its exact spot in each zone and view; drawn with the live sprite viewer open (CLAUDE.md).
- The CI watcher runs on its own thread (decided): it owns the timer and the serialized `gh` calls, the poll loop only
  hands it `CiPush` records and reads its states. `gh auth status` on enabling also runs there, never in the
  settings-save path. Its channel and locking are the builder's.
- `gh api` gets the real `repos/<owner>/<repo>/...` path, never the `{owner}/{repo}` placeholders (which `gh` would
  fill from its own cwd).
- Theme wording for the card line, the lamp's tip and the Settings line, per world.
