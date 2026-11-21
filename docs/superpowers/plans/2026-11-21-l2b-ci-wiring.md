# L2b: wiring I6 (CI verdict) into the app

Spec: `docs/superpowers/specs/2026-11-21-ci-verdict-design.md` (amended: no toast, a lamp per folder, a start check
per folder). Joint spec: `2026-11-21-parallel-waves-design.md`, lane L2b, decisions D1, D6, D7. The pure core is
`ci.rs` (L1c). This lane adds the thread, the roster and lamps, the Chronicon events and the opener. No UI file.

## Items

1. **Watcher thread** (`ci.rs`). A `Hub` (shared inbox, shared view, a condvar) and a `Worker` (owns the `Watcher`).
   The thread loops: wait up to 1 s for the poll loop's hand-in, then `Worker::step(gh, now, input)`, then publish.
   `step` is pure over its inputs (the `Gh` stub and a clock value), so tests drive it without a thread:
   - off: `tick(.., false)` drops every watch, no `gh` call; on (false to true): `gh auth status` once, on the
     thread, as the `gh` entry of `integration_status` (`gh ready`, `gh not found`, `gh not logged in: run gh auth
     login`); a skipped watch (not found, not logged in, 401/403/404), an `error` end and a rate-limit pause are
     recorded in the same entry, never a toast. A verdict clears it back to `gh ready` (`report_change`).
   - the poll loop only calls `Hub::submit(enabled, pushes, folders)`, reads `card`, `lamps`, `take_verdicts`.
2. **Roster and lamps.** `Session.ci` from `Hub::card(id)` each tick. `Lamp { dept, cwd, state, branch, sha7,
   failed }` (camelCase). `ci-lamps` emitted through `emit` only when `lamps_changed` says so; `ci_lamps` command
   returns the current list. `Watcher::lamp_rows` (the cwd comes from the watch), `Watcher::cards`,
   `Watcher::paused_until` are small additions to the core.
3. **Chronicon events.** `verdict_event(finished, now)`: `ci-pass` / `ci-fail`, detail `branch · sha7` (and the
   failed check). Only for a watch a session's push started; a folder's start check is the last known state, not
   news. Written in the poll loop beside `stuck` / `conflict`.
4. **`ci_open`.** `open_target(id, lamps/cards) -> Result<String url>`: pure decision from a department name or a
   session id to the checks URL (`checks_url`, then `valid_checks_url`); the command then calls `orca::open_url`.
   The worker publishes each watch's `Target` for that. Unknown id or an invalid URL: an error, nothing opened.
5. **Tests** (`ci.rs`): off means zero `gh` calls (also through `Worker::step`); one push starts one watch; the start
   check once per folder per run; `ci_open`'s decision refuses an unknown id; `lamps_changed`; the `gh` entry notes;
   `verdict_event`; `Hub::submit` drops everything while off.
6. **Docs.** README (What it shows, Settings, Privacy and safety and its file table), `docs/remote-api.md`
   (`ci-lamps`, the `ci` field), `docs/DEVELOPMENT.md` (`ci.rs`, `main.rs`, `monitor.rs` rows).

## Files

`src-tauri/src/ci.rs`, `src-tauri/src/main.rs`, `README.md`, `docs/remote-api.md`, `docs/DEVELOPMENT.md`, this plan.
`remote/mod.rs` needs nothing: `emit` already mirrors the event. `chronicle/report.rs` `NOTABLE` should list the two
new kinds so the day report counts them: outside this lane's write set, reported to the integrator.
