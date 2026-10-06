# Quiet hours, department plaques, usage limits, toast actions, turn summary — design (operator-approved)

Five small, independent features. One spec, one section each; each ships and commits on its own, in this order:
**4 → 5 → 3 → 1 → 2** (simplest first). Everything stays read-only towards Claude Code: the only thing ever typed
anywhere is the existing single option digit into an Orca terminal.

Dropped: a todo/progress display from `TodoWrite` / `TaskCreate`. Claude Code 2.1.283 no longer writes them (newest
`~/.claude/tasks` file 2026-09-05, none in the last days' transcripts). The turn summary (section 2) replaces it.

---

## 4. Quiet hours

**Settings** (Notifications group): `Quiet hours` toggle (default off), `From` / `To` as `HH:MM` (defaults 22:00 / 08:00).
A window whose end is before its start spans midnight. `From == To` means never quiet.

**Effect while inside the window:** no toast and no chime for a new petition, a question, a long task done or a usage
limit (section 3). The **stale** escalation still toasts and chimes. The scene is unchanged. A small moon glyph sits next
to the mute bell in the header while quiet is in effect (tooltip: `Quiet until 08:00`).

**Wiring.** The UI owns the setting (settings.json like the others) and pushes it to the backend with a new command
`set_quiet(enabled: bool, from_min: u16, to_min: u16)` (minutes after midnight), on load and on change, like
`set_question_prefs`. The backend keeps it in atomics and checks `quiet::active(now_local_min)` before each non-stale toast.
The UI checks the same rule before `chime()` for the same events. One pure function per side:
`in_window(now, from, to) -> bool`.

**Tests:** Rust `in_window` (plain window, window over midnight, `from == to`, edges inclusive start / exclusive end);
JS the same cases in a small `quiet.test.mjs`.

---

## 5. Clickable department plaque and git branch

**Click.** Clicking a department plaque opens the working directory of that department's most recently active session
(highest `since_ms` among its scribes). New command `open_folder(path: String)`:
- The path must equal the `cwd` of a session in the current roster (no arbitrary paths from the UI).
- Settings → `Open departments with`: `Explorer` (default) / `VS Code` / `Custom`. Custom is a program path plus
  arguments where `{path}` is replaced by the cwd **as one argument**. It is run with `std::process::Command`, with no
  shell and no string interpolation into a command line. Explorer: `explorer.exe <path>`. VS Code: `code <path>`
  (resolved on `PATH`). A failure shows its message in the plaque's tooltip for 5 s, no toast.
- The remote view never offers this action. Its plaques are not clickable, and the remote API has no route for it.

**Branch.** Read without running git: `<cwd>/.git/HEAD`. If `.git` is a file (worktree), follow its `gitdir: <path>`
line and read `HEAD` there. `ref: refs/heads/<name>` → `<name>`; a bare hash → the first 7 chars (detached). Anything
else, missing or unreadable → no branch. Walk up parent directories to find `.git` (the cwd may be a subfolder), at most
to the drive root. Cached per cwd, re-read at most every 5 s.

New field `Session.branch: Option<String>`. The plaque shows it under the department name in a smaller line, only when it
is not `main` or `master`. If a department's scribes are on different branches, the most recent session's wins.

**Tests:** Rust branch parsing (`ref:` line, detached hash, worktree `gitdir:` file, relative `gitdir`, missing `.git`,
garbage) on temp dirs; `open_folder` rejects a path not in the roster; custom command splitting keeps `{path}` as one argument.

---

## 3. Usage limits

**Source (verified in real transcripts).** When a subscription limit is hit, Claude Code appends:

```json
{"type":"assistant","message":{"model":"<synthetic>","content":[{"type":"text","text":"You've hit your limit · resets 2pm (Europe/Paris)"}], ...},"error":"rate_limit","isApiErrorMessage":true, ...}
```

**Detection** in `registry::read_tail`: new `limit_of(tail) -> Option<Limit>`. It takes the newest line with
`"error":"rate_limit"` that is **not followed by a real user prompt** (a `user` line that is not only `tool_result`s). Then:
- `text`: the message text, cut to 120 chars.
- `reset_ms`: parsed from `resets H[:MM](am|pm)` as **local** time, at its next occurrence after the line's timestamp.
  The timezone in parentheses is ignored (`chrono` has no tz database here; the user's clock is assumed to match).
  A text that doesn't match the pattern (e.g. a date for a weekly limit) gives `reset_ms: None`.
- The limit is dropped once `now > reset_ms`.

(`context_of` already skips `<synthetic>` lines, so the limit line does not reset the context fill.)

New field `Session.limit: Option<Limit { reset_ms: Option<i64>, text: String }>`.

**Scene.** A limited scribe stays at its desk (it does not go to the Refectorium while sealed) under a small overlay
tag `sealed · resets 14:00`, drawn like the petition labels so it works in every theme without new art (wording keys
`limitLabel` with `{time}`, and `limitSealed` when there is no reset time). The card's task line shows the full `text`.

**Notification.** One toast and one chime per **wave**: the tracker gathers sessions that became limited until the same reset and sends one toast. One session: `{name} sealed until 14:00`. Several: `6 sessions sealed until 14:00`. A wave is
the set of sessions sealed until the same reset time: a session joining a wave already toasted adds no toast. Quiet hours
mute it. Theme wording keys `toast.limit` and `toast.limitMany`, pushed with the other toast strings.
Chronicon event `limit` (department, reset time).

**Tests:** Rust `limit_of` (limit line alone, followed by a tool result → still limited, followed by a prompt →
none, `2pm`, `2:30pm`, `12am`, unparseable text), next-occurrence logic across midnight, `context_of` ignoring
`<synthetic>`, wave grouping in the tracker.

---

## 1. Toast actions (Approve / Deny)

**When.** A new petition toast gets two buttons, **Approve** and **Deny**, only if the petition is a permission prompt
(`waiting_for` starts with `approve`) **and** the session has an Orca handle. Otherwise the toast stays as today.
*Always* is left to the card: on a toast it can be clicked without reading the prompt. Stale toasts get the same buttons
under the same rule.

**How.** Add `tauri-winrt-notification` (already in `Cargo.lock` through the notification plugin) as a direct
dependency. Petition and stale toasts are built with it: `add_button("Approve", "yes:<sessionId>")`,
`add_button("Deny", "no:<sessionId>")`, and `on_activated` receives the argument. Use the same app user model id as the
plugin so the toast still shows as Administratum. Other toasts stay on the plugin.

**On click** (`on_activated`, off the UI thread):
1. Parse `yes|no:<sessionId>`. Anything else → ignore.
2. Look the session up in the **current** roster (shared with the poll loop). If it is gone, no longer petitioning, or
   its handle changed → do nothing (the user already answered in the terminal).
3. Call the existing `answer_petition(handle, choice)`. Its screen check stays the safety: only the digit is typed, and
   only if the dialog is at the bottom of the screen.
4. On error, show a plain toast `{name}: open the terminal` (theme wording key `toast.failed`), no buttons.

The button labels are plain `Approve` / `Deny` in every theme. In a dev build (exe under `target/debug` or
`target/release`) toasts use PowerShell's app id, like the notification plugin does.

A click on the toast body (not a button) keeps today's behaviour.

**Tests:** Rust argument parsing (valid, unknown choice, empty id, extra colons), the "still petitioning with the same
handle" guard against a roster, and the rule deciding whether a toast gets buttons. The WinRT call itself is checked by
hand: approve and deny a real prompt in an Orca terminal from the toast, and click after already answering (nothing typed).

---

## 2. Turn summary

**What.** For each session, the current (or last) turn: when it started, how many tool calls it made, which files it
changed.

**Where it is computed.** In `chronicle.rs`, which already reads each transcript's appended bytes every tick. Per
session, a `TurnSummary { started_ms, last_ms, tools: u32, files: Vec<String> (≤ 50, insertion order), more_files: u32 }`:
- A real user prompt (a `user` line that is not only `tool_result`s, and not a `<command-name>` / local-command line)
  starts a new turn: reset, `started_ms` = its timestamp.
- Each `tool_use` block in an assistant line → `tools += 1`.
- `Edit`, `Write`, `MultiEdit`, `NotebookEdit` → their `file_path` / `notebook_path` is added if new (path made
  relative to the session cwd when inside it; otherwise kept absolute).
- Subagent transcripts are not counted (the parent's `Agent` call counts as one tool).

The chronicle's read offsets are persisted, so after a restart the turn in progress counts only from the restart (no
start time until the next prompt). On first sight of a transcript only today's bytes are read. That is acceptable.
The poll loop copies it into the new `Session.turn: Option<TurnSummary>` (`TurnSummary` also carries `last_ms`, the newest
assistant line, to freeze the duration once idle). It is not persisted.

**Scene.** While the session is busy or in the shell, at its desk, with at least one file changed, a tiny overlay tag
`✎5` sits by the desk (same mechanism as the sealed tag, no new art). It is hidden when idle.

**Card.** One line `Turn: 4 min · 23 tools · 5 files`. The duration runs live while busy, and is frozen at the last
assistant line once idle. Then the file list, monospace, at most 8 shown with `+N more`, and a click expands it. An adept's
card shows nothing new.

**Tests:** Rust on JSONL fixtures: prompt resets, tool_result user lines don't, local-command lines (`/clear`) don't start a turn,
duplicates counted once, cap at 50 with
`more_files`, relative paths, appended-bytes split mid-turn across two reads.

---

## Out of scope

- Answering free-text petitions or questions from a toast.
- Quiet hours per department, or different windows on weekends.
- Showing the branch on the remote view (it gets `Session.branch` in the roster JSON, but no new UI).
- A weekly-limit countdown when Claude Code prints a date instead of an hour (the text is shown as is).
