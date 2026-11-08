# Usage-window gauge (O6)

**Goal.** Show the tokens spent in the current 5-hour usage window on this PC, against the levels where past usage
limits hit, labelled as an estimate.

**Size.** Project: backend sum + header UI + Chronicon line.

## Decision ledger

1. **Estimate, this PC only.** The app cannot see the subscription quota. Use on claude.ai or another machine
   spends the same quota and is invisible. The gauge says `estimate · this PC` (tooltip) and never shows a percent
   of a real quota.
2. **Measure.** The same count as Token alert: new input + output + cache writes (cache reads out). No model
   weighting (Anthropic's weights are unknown).
3. **Precision.** Summed from the usage records' own timestamps (`chronicle` usage lines carry `ts`), not the
   hourly buckets.
4. **Window start.** The first token after a gap of 5 h or more with no token. A limit hit whose message names a
   reset hour fixes the window to `[reset − 5 h, reset]`.
5. **Ceilings.** Each `limit` event in the kept days (7) gives one observed ceiling: the tokens in its window
   `[reset − 5 h, hit time]`. A limit with no reset hour (a date, no hour) gives none.
6. **Where.** A thin bar beside the Tithe plaque in the header, with a tick per ceiling (the lowest one marked),
   and one line in the Chronicon day view (`Window: 2.1M since 13:40 · ceilings 3.4M, 4.0M`). Not on the phone
   page in v1.
7. **No alert in v1.** No toast near a ceiling.
8. **OpenCode.** Its tokens count only if they spend the same quota — **open**: OpenCode can run on other
   providers. **My call for v1:** count Claude Code usage only, plus OpenCode lines whose model is an Anthropic
   model.

## Builder-check corrections (supersede items 3–5 above where they differ)

- **Storage (correction, my call).** The usage `ts` lives only in memory (`chronicle/mod.rs:154`); day files keep
  hourly buckets and the first scan reads today only. So the Tithe gains a 5-minute bucket list (288 slots,
  `fine`) saved in each day file. The window and the ceilings read those buckets across today and the previous
  day files. Old day files without `fine` give no ceiling and no window share.
- **Window rule (correction, my call).** Fixed length, not a gap: a window opens at the first token after the
  previous window closed, and closes 5 h later. A limit with a reset hour pins the current window to
  `[reset − 5 h, reset]`; the first token after the reset opens a new one.
- **Limit events (my call).** The `limit` event gains `resetMs` and `hitMs` (the transcript line's time, from the
  tail parse, `registry/tail.rs:284`), added fields only. One wave gives one ceiling (dedupe on `resetMs`).
  Ceilings come only from limits recorded after this ships.
- **OpenCode (my call).** Count only rows with `providerID == "anthropic"`; the translation at
  `chronicle/opencode.rs:93` keeps `providerID`.
- **Where `window` lives.** Computed for today's live answer only, not saved; the remote copy keeps it (it holds no
  paths). The header plaque is drawn in `ui/chronicon.js:221` (30 s poll), not `chrome.js`.
- **Ceiling label.** Each tick reads "this PC's share at the hit" (R1): with claude.ai or another PC in use, it sits
  above the real limit.

## Design

- **Backend.** A pure function `window_of(usages: &[(ts, tokens)], limits: &[(hit_ts, reset_ts?)], now) ->
  {start, tokens, ceilings: Vec<u64>}` in `chronicle`, fed from the usage lines the chronicle already reads; exposed
  through the existing tithe snapshot (a `window` field) so the remote view gets it with no new route.
- **UI.** `chrome.js` header: the bar (width ∝ tokens / highest ceiling, or empty frame with the count alone when
  no ceiling is known yet). `chronicon.js`: the line on today's tab.
- **Failures.** No usage in 5 h: the bar shows `0` and no start time. Clock change or a missing day file: the sum
  covers what is read; never invent a value.
- **Testing.** `window_of` unit tests with a pinned clock: gap ≥ 5 h starts a new window; a limit with a reset
  pins the window; a ceiling equals the sum inside its window; a reset given as a date gives no ceiling; cache
  reads excluded. UI tests: no ceiling → no ticks; the tooltip carries "estimate".
- **Docs.** README *Chronicon and Tithe* and *Header*; `docs/remote-api.md` if the tithe payload changes.
