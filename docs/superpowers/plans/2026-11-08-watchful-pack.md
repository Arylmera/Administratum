# Watchful pack (O11 – O15): vertical-slice plan

Spec: `docs/superpowers/specs/2026-11-08-watchful-pack-design.md`. One slice per item, in the spec's order; each slice
ends green (cargo test, clippy, node tests). Ideas from my-office (MIT), nothing copied. Nothing is committed here: the
worktree is handed back uncommitted.

## Rulings taken before slice 1
- **O11 source text.** The Orca peek's `question` is the dialog's generic line ("Do you want to proceed?",
  `prompt.rs` tests): it never holds the command. Every surface reads the risk from `s.asks` instead (the pending
  call `"Bash: <command> — <description>"`; for OpenCode `"<action>: <resource>"`, the request's detail), so the label,
  card, phone and toast always agree.
- **O11 one writer.** The patterns live once, in `ui/petition.js` (`RISKS`). `toast.rs` reads that file at compile time
  (`include_str!`) and parses the same lines; a Rust test fails if any line stops parsing or the counts differ. Only the
  regex subset both engines share (no lookaround, `[/]` instead of `\/`), case-insensitive in both.
- **O11 `format`, `sudo`, `dd`.** `format` only with a drive (`format D:`), so "format the code" is not risky; `sudo` and
  `dd if=` as written. Case-insensitive, so `git branch -d` is marked like `-D` (over-warning, never under).
- **O13 window.** Each session keeps the absolute paths it edited in the last 20 min (inclusive: an edit exactly 20 min
  old still counts). The "current or previous turn" clause is covered by the window; turn boundaries are not tracked.
- **O13 paths to the remote view.** Since 0.6.8 the remote view gets no edited-file paths in the Tithe. The new roster
  field and the `conflict` event carry the file's base name only, never the full path (the roster's `turn.files` already
  holds relative names).
- **O14 where.** Masking runs when the strings are serialized (`serialize_with` on the fields), so the WebView, the
  remote view and the Chronicon lines on disk all get the same masked text from one place; the question toast is masked
  where it is built.
- **O15 frames.** No world has a low-candle frame (desks have only the lit and the dimmed palette). Lit and out use them;
  "low" is the lit desk with its light pool scaled down with the time left.

## Slice 1: O11 risky command
Breaks / touches: `petition_buttons` callers (`toast.rs` test_toast, petition_toast, its test); `answer()` callers
(card.js buttons, overlay.js label buttons); `rowState` / `petitionRow` (mobile.js, mobile.test.mjs); `notify` toast body
(main.rs).
- `ui/petition.js`: `RISKS`, `riskOf`, `allowed(choice, risk, where)`, `armStep`.
- card.js: red card + reason, Always hidden, Approve arms then sends; overlay.js: red label, its ✓ goes through `answer`.
- mobile.js: Deny only, `phoneAnswer` refuses `yes`. toast.rs: Deny-only buttons, a `yes` click refused for a risky one.
- Tests: `ui/petition.test.mjs` (keys, near-misses, gates), mobile.test, toast.rs tests.

## Slice 2: O12 loops keyed on the error
Breaks: `Repeat` literal in monitor.rs (outside the write set: `Repeat` keeps its fields); `TurnSummary` literals use
`..Default`; tests `repeat_counts_identical_calls`, `repeat_parallel_calls_count_once`, `polling_tools_never_count`
(rewritten to the new rule).
- `mask.rs`: `volatile()` (timestamps, durations, hex, 4+ digit numbers, temp paths).
- `track_turn`: pending calls by id; a streak grows only on the same call + same masked error; success or an edit clears.

## Slice 3: O13 same file, port in use
Breaks: `sessions.rs` full `Session` literal (new field); `classify` callers; `TurnSummary` gets `port`.
- Chronicle keeps recent edits per session (`absorb`, subagents folded under their parent); pure `conflicts`.
- main.rs: `sameFile` on the roster, one toast + `conflict` event per pair and path (first tick seeds; no toast for
  the break-out room).
- `classify`: `port-in-use` event; `track_turn`: the turn's `portInUse`. card.js line, overlay.js tag (synced from
  `syncLabels`: app.js is outside the write set), the event labels in theme.js `event.*`.

## Slice 4: O14 secrets masked
Breaks: nothing (serialize_with only). Fields: Session task/title/asks/question, Helper task, Limit text, Event
detail; the peeked dialog masked in `prompt.rs` (`Prompt` is not serialized); question toast body.

## Slice 5: O15 cache clock
Breaks: `Tail` literal (tail.rs), `sessions.rs` Session literal (new `cache`).
- tail.rs `cache_of` -> `Session.cache {untilMs, ttlMs}`; scene.js `candleOf` + desk light; scene39.js the same;
  card line.

## Status
All five slices green (handed back uncommitted).

## Docs
README, docs/DEVELOPMENT.md, docs/remote-api.md: new roster fields, events, behaviours.
