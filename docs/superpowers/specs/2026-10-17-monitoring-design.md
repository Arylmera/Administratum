# Monitoring: token alerts, stuck sessions, day report (O1–O3)

Three monitoring features built on what the chronicle and the poll loop already read. No new dependency, no new art.

## Intent

The user runs many Claude Code / OpenCode sessions at once and looks at the hall only now and then. Three things go
unnoticed today: a session burning far more tokens than usual, a session that has quietly stopped making progress,
and what the day actually produced. Each feature answers one of these with data the app already reads.

**Anti-goals.** Never claim to know the Anthropic subscription quota: the app cannot see it, so token thresholds
are plain user-set counts. Never write outside the app data dir unless the user turned the report capture on and
named the folder. Never answer or interrupt a session.

## What exists, and what does not

- The Tithe (`chronicle/mod.rs`) counts tokens per department, per model and per hour; nothing per session.
- `TurnSummary` is the *current* turn only, in memory: no per-day turn count or file list is stored.
- The registry `Tracker` holds petition / question / limit episodes. It knows nothing about the last tool call or its
  input, and `Session` has no last-write field. (The brief assumed it did; the repeat rule and the silence rule are
  new, built on the chronicle cursor and the poller's file stats.)

## Shared change: the Tithe grows, old files still load

New fields on `Tithe` and `Share`, every one `#[serde(default)]`, so a day file written by 0.6.5 loads unchanged
(a failed load would make `open` start a blank Tithe and the next flush would overwrite the day). A test loads a
0.6.5-shaped JSON and checks nothing is lost.

- `Share.turns: u32`: finished main-session turns (the `turn_duration` lines already counted for busy time).
- `Share.files: Vec<String>`: files changed by Edit / Write / MultiEdit / NotebookEdit (subagents included), sorted,
  deduplicated, capped at 200 per department (the rest counted in `more_files: u32`). Paths relative to the session's
  cwd when inside it (the existing `relative`).
- `Tithe.by_session: BTreeMap<id, SessionTithe>` with `name`, `dept`, `fresh` (input + output + cache write) and
  `total`. Subagent tokens count toward their parent session, as they already count toward its department.
- `Tithe.fresh: u64` is not added: the UI derives "new" tokens from `tokens` as it already does.

`absorb` takes the session (id, dept, cwd) instead of only the dept. OpenCode goes through the same path.

## O1 — Token use and alerts

**Chronicon.** The day tabs get one more tab at the end, **Week**: the last 7 days (rolling, the same 7 days the
Chronicon keeps), summed in the UI from seven `tithe_day` calls (no new command, so the remote view gets it for
free). It shows the same stats row and new/cache bar, *By department* and *By model* bars, and a 7-bar chart *Tokens
by day* in place of the hourly charts. Each day view also gets a *By session* bar list (top 10 by new tokens), so the
session behind a spike is visible.

**Alert.** Setting *Alert when one session passes N new tokens in a day* (`adm.tokenAlert`, a count; empty = off,
the default). Compared against `by_session[id].fresh` of today. One toast per session per day, wording from the
theme (`toast.tokens`: "{name} passed {count} tokens today"), respecting quiet hours, plus a Chronicon event
`token-alert`. On the app's first tick the alert set is seeded without toasting (as usage limits are), so a restart
does not re-toast. The threshold is read from saved settings at setup and pushed by the UI on change
(`set_monitor`, the `set_stale_minutes` pattern).

## O2 — Stuck-session detection

A session is **stuck** while its status is `busy` (never `shell`, `waiting`, `idle`) and either:

- **Silent:** no write to any of its transcript files (main and subagents, the same max mtime the Night Vigil uses)
  for `adm.stuckMin` minutes (default 15, range 5–120).
- **Looping:** its last `adm.stuckRepeat` tool calls (default 5, range 3–20) are the same tool with identical input
  (tool name + the input JSON, compared as serialized). The run resets on a new prompt or any different call.
  Parallel identical calls in one message count once. Polling tools never count: `BashOutput`, `TaskOutput`,
  `KillShell`, and a Bash command that is a bare `sleep` / `watch`.

The repeat run is kept in the chronicle `Cursor` next to the turn (`track_turn`), so it costs no extra parse.
OpenCode sessions have no transcript files: the silence rule skips them; the repeat rule works through the same
feed. Default on (`adm.stuck`, "1"), with its own toast switch (`adm.stuckToast`, on).

`Session` gets an additive `stuck: Option<Stuck>` (`kind`: `"silent"` | `"loop"`, `sinceMs`, `tool`, `count`),
computed in the poll loop by a pure function. The flag clears by itself when writes resume or the run breaks.

**Shown:**
- Hall: a tag over the scribe through the existing `syncTags` (like the usage-limit seal), the theme's wording:
  `stuckSilent` "stalled · {min}m", `stuckLoop` "looping · {tool} ×{count}". Theme colours, every world, no art.
- Card: one line under the task with the same text.
- Toast: one per episode (key: id + kind + `sinceMs`), theme wording `toast.stuck`, quiet hours respected, and a
  Chronicon event `stuck`.

## O3 — End-of-day report

A pure `chronicle::report(day, tithe, events) -> DayReport` and `DayReport::markdown()` in Rust: one writer for both
the panel and the file. New command `day_report(day)`.

Contents:
- **Sessions:** distinct sessions seen that day; sessions finished = non-temp `left` events; long tasks done
  (`task-done` events).
- **Turns:** total and per department.
- **Files touched:** per department, the list (capped, "+N more").
- **Tokens:** new and total, per department; working time per department.
- Notable events: commits, pushes, failed tests, usage limits, stuck episodes, token alerts (counts).

**Chronicon:** each day view opens with a *Day report* section (collapsed `<details>` under the stats), and a *Copy
as markdown* button. The remote view calls `day_report` through `invoke(...).catch()`: without a remote route it
shows nothing rather than failing (adding the route belongs with the remote work in O4–O5).

**When it is built:** on demand (opening a day), and when the Night Vigil arms (and again when it fires, so the file
holds the whole evening).

**Capture file (optional, off by default).** Settings: *Also write the day report to a folder* (`adm.reportOn`) and
the folder (`adm.reportDir`, a text field: no dialog plugin is installed). Written only when the switch is on, only
into an absolute folder that already exists (never created), as `YYYY-MM-DD-administratum-day.md`, atomically
(temp + rename), overwriting the same day's file so a re-arm is idempotent. Plain markdown with a minimal neutral
frontmatter (`date`, `source: Administratum`, `tags: [administratum]`), readable by Obsidian and by people without
any particular vault setup (the user's call: the project is shared). The remote view cannot change these settings
(it can only load them), but it can arm the Vigil, which writes the file when the switch is on.

## Settings (Settings > Notifications, one group "Monitoring")

| Key | Default | Meaning |
|---|---|---|
| `adm.tokenAlert` | empty (off) | new tokens per session per day before a toast |
| `adm.stuck` / `adm.stuckToast` | on / on | flag stuck sessions / toast them |
| `adm.stuckMin` | 15 | minutes busy with no transcript write |
| `adm.stuckRepeat` | 5 | identical tool calls in a row |
| `adm.reportOn` / `adm.reportDir` | off / empty | write the day report to that folder |

## Tests

Rust next to each module: the Tithe back-compat load, per-session and per-department accumulation, the repeat run
(reset, parallel calls, polling tools excluded), the stuck rule (each status, both kinds, OpenCode skip), episode
keys toasting once, alert seeding on the first tick, the report from a fixed day, its markdown, and the file writer
(off: nothing written; missing folder: error, nothing created; on: the file, overwritten on a second run). UI: a
`chronicon.test.mjs` for the week sum and a check that the new theme keys exist in every theme.

## Report day (user's decision)

The Night Vigil armed between 00:00 and 04:00 reports on the previous day; from 04:00, on the current day.

## Calls made without the user

- Week = rolling 7 days, not since Monday (the Chronicon keeps exactly 7 days).
- The alert compares new tokens of one session in one calendar day; it does not reset when a session restarts.
- Stuck tags instead of a new pose (user's choice), so the sprite gate does not apply.
- Report frontmatter is neutral, not the Anamnesis inbox shape.
- A long silent call is accepted as a possible "stalled": a running shell command already has its own status
  (`shell`), excluded; anything else silent for 15 min (a hung MCP or web call, a frozen turn) is what the flag is for.
- The report day is fixed when the Vigil arms and reused when it fires, so a Vigil armed at 23:00 that fires at
  06:00 rewrites the evening's file, not a new one.
