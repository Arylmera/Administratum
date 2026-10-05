# Chronicon, events and Tithe — design

Operator choices: events = git commit/push, tests pass/fail, tool errors, long task done; Chronicon =
today in detail + 7-day summaries, unrolled parchment from the header; Tithe = tokens + working time.

## Backend: incremental transcript reader (src-tauri/src/chronicle.rs, new module)
- For every live session transcript `projects/<slug>/<sessionId>.jsonl` and every subagent transcript
  `.../<sessionId>/subagents/agent-<id>.jsonl`, keep a byte offset; each poll reads only bytes appended
  since (whole lines only; a partial last line waits for the next poll). Read-only.
- Offsets persist in `<app data dir>/chronicon/offsets.json` (map path -> offset). First sight of a
  file with no stored offset: scan it once and process only entries whose `timestamp` is today (local
  date) — earlier days are not reconstructed. A file that shrank (rewritten) restarts at 0 with the
  same today-only rule.
- Event extraction from new entries (pure function, unit tested on real-shape lines):
  - Bash tool_use whose command matches `git commit` (not --dry-run) and whose matching tool_result
    (by tool_use_id) is not an error -> `commit` (detail: first line of the -m message if present, else
    the command clipped). `git push` -> `push` (detail: remote/branch if visible).
  - Bash command matching a test runner (`cargo test`, `npm test`, `npm run test`, `pnpm test`,
    `yarn test`, `pytest`, `vitest`, `jest`, `go test`, `node .*test.*\.mjs`) -> `tests-pass` or
    `tests-fail` from the tool_result `is_error` flag (fail also when the result text contains
    "test result: FAILED" / "failed" counts > 0 for cargo/pytest summaries if is_error is absent).
  - Any other tool_result with is_error true -> `tool-error` (detail: tool name + first line).
  - System `turn_duration` entry with durationMs >= 300000 -> `task-done` (detail: duration).
  - Pairing tool_use -> tool_result may span polls: keep pending tool_use ids per file (bounded map).
- Lifecycle events from the poll loop: `arrived`, `left`, `petition` (opened), `petition-answered`
  (waiting -> other status), `compaction` (compactedAt changed).
- Event JSON (serde camelCase), appended to `<app data dir>/chronicon/YYYY-MM-DD.jsonl` and emitted
  live as Tauri event `chronicle`:
  `{ ts: i64 ms, kind: string, sessionId: string, name: string, dept: string, helper: string|null
     (subagent kind if from a subagent), detail: string }`
- Tithe (per local day), kept in memory, flushed every 30 s and on exit to
  `<app data dir>/chronicon/YYYY-MM-DD.tithe.json`:
  `{ day, tokens: { input, output, cacheRead, cacheWrite }, byProject: { <dept>: {tokens total, busyMs} },
     byModel: { <model>: tokens total }, busyMs, hourly: [24 x { tokens, busyMs }] }`
  Tokens: sum `usage` of NEW assistant entries, deduplicated by `message.id` (Claude Code writes one
  line per content block of the same message — count each message id once, using its last usage).
  Subagent tokens count toward their parent's project. busyMs: per poll tick, +elapsed for each
  session whose status is busy or shell (not idle/waiting/background).
- Retention: delete chronicon files older than 7 days at startup.
- Commands: `chronicle_day(day: String) -> Vec<Event>` (YYYY-MM-DD, validated), `tithe_day(day) ->
  Tithe`, `chronicle_days() -> Vec<{ day, events: u32, tokens: u64, busyMs: u64 }>` (last 7 days).
- Demo mode: synthesise a plausible stream (a commit, a push, tests pass then fail, a tool error, a
  task-done) over the 60 s cycle, and a tithe that grows.

## UI 6: reactions in the scene (scene.js / actors.js / sprites.js)
Driven by the `chronicle` live event (ignore history):
- commit: the scribe stamps a purity seal on a parchment on its desk (seal sprite appears, small red
  wax drop, ~3 s), seal stays on the desk for the session (max 3 visible).
- push: a servo-skull picks the sealed parchment from the desk and flies out through the grand gate.
- tests-pass: green lamp on the desk lights for 20 s; tests-fail: red lamp blinks for 20 s (stays dim
  red until the next pass).
- tool-error: small spark + smoke puff on the desk (1 s).
- task-done: the scribe raises its scroll (1.5 s), tiny gold glint; optional soft chime if not muted.
Adept (helper) events play the reduced version at its console.

## UI 7+8: Chronicon parchment and Tithe (app.js, index.html, new ui/chronicon.js)
- Header: a scroll icon button and a compact Tithe plaque "⛁ 4.2M · 3h12" (tokens today · working
  time); click either to open the Chronicon.
- The parchment unrolls over the scene (animation ~300 ms), closes on click outside / Escape.
  Tabs: Today + the 6 previous days (from chronicle_days). Today: Tithe summary on top (tokens split
  new vs cache, working time, per project bars, per model, 24-hour mini chart of tokens and busy time
  in Tier II style), then the event log newest first (time, icon per kind, name, dept, detail),
  filterable by project. Past days: their summary + log from the stored files.
- Live: new `chronicle` events prepend while open.
Fake harness (scratch fake.js) must stub the three commands and emit `chronicle` events.

## Testing
Rust: unit tests for extraction (each kind, pairing across polls, dedup by message id, today-only
first scan, shrink handling), tithe aggregation, day validation, retention. UI: harness screenshots.
