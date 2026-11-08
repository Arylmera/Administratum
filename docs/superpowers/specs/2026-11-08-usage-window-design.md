# Usage-window gauge (O6)

**Goal.** Show the tokens spent in the current 5-hour usage window on this PC, against the levels where past usage
limits hit, labelled as an estimate.

**Size.** Project: Rust (Tithe buckets, limit events, window function) + header plaque + Chronicon line.

## Decision ledger (agreed 2026-11-08; builder check applied)

1. **Estimate, this PC only.** The app cannot see the subscription quota. Use on claude.ai or another machine spends
   the same quota and is invisible. The gauge's tooltip says `estimate · this PC`; it never shows a percent of a real
   quota. Each ceiling tick reads "this PC's share at the hit".
2. **Measure.** The same count as Token alert: new input + output + cache writes (cache reads out). No model
   weighting.
3. **Storage.** The usage `ts` lives only in memory (`chronicle/mod.rs:154`); day files keep 24 hourly buckets. The
   Tithe gains `fine`: 288 five-minute token buckets, saved in each day's `.tithe.json`. Field is
   `#[serde(default)]`; an old file without it (or with an empty list) still loads with every total intact — the
   existing `hourly.len() == 24` check (`mod.rs:712`) must not reject it. Old days give no window share and no
   ceiling.
4. **Window rule.** Fixed length: a window opens at the first token after the previous window closed and closes
   5 h later (buckets: 5-minute precision). A limit with a reset hour pins the current window to
   `[reset − 5 h, reset]`; the first token after the reset opens a new one. Reads today's and yesterday's `fine`.
5. **Limit events.** The `limit` event gains `resetMs` and `hitMs` (the transcript line's time from the tail parse,
   `registry/tail.rs:284`), added fields only, `#[serde(default)]`. One wave (same `resetMs`) gives one ceiling.
   Ceilings come only from limits recorded after this ships; a limit without a reset hour gives none.
6. **Ceilings.** For each such limit in the kept days (7): the tokens in `[resetMs − 5 h, hitMs]` from `fine`.
7. **OpenCode.** Count only rows with `providerID == "anthropic"`; the translation at `chronicle/opencode.rs:93`
   keeps `providerID`.
8. **Where.** A thin bar on the header's Tithe plaque (drawn in `ui/chronicon.js:221`, 30 s poll), a tick per
   ceiling with the lowest marked; empty frame with the count alone while no ceiling is known. One line on today's
   Chronicon tab: `Window: 2.1M since 13:40 · ceilings 3.4M, 4.0M`. Not on the phone page in v1. No toast in v1.
9. **Transport.** `window` is computed for today's live answer only, not saved; the remote copy keeps it (it holds no
   paths).

## Design

- **Backend.** `Tithe::fine` filled beside `hourly` in `add_tokens` (`bucket = minutes_of_day(ts) / 5`). A pure
  `window_of(fine_yesterday, fine_today, limits, now) -> Window { start_ms, tokens, ceilings: Vec<u64> }` in
  `chronicle`. Added to today's tithe answer as `window`; `remote_tithe` (`remote/app.rs:34`) leaves it in.
- **UI.** `ui/chronicon.js`: the bar on the plaque (width ∝ tokens / highest ceiling, clamped), ticks, tooltip; the
  Chronicon line on today's tab.
- **Failures.** No token in 5 h: `0`, no start time. A missing day file: the sum covers what is read; never invent
  a value.
- **Testing.** `window_of` with a pinned clock: a new window opens only after the previous one closed (not on a gap);
  a limit with a reset pins the window; a ceiling equals the sum inside its window; a reset given as a date gives no
  ceiling; one wave → one ceiling; cache reads excluded; OpenCode non-Anthropic rows excluded. Compatibility: a
  current-format `.tithe.json` fixture (no `fine`) loads with its totals unchanged; a current-format `limit` event
  line (no `resetMs`) still parses. UI: no ceiling → no ticks; the tooltip carries "estimate".
- **Docs.** README *Chronicon and Tithe* and *Header*; `docs/remote-api.md` (the tithe payload's `window`).
