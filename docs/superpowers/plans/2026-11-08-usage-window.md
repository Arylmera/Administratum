# Usage-window gauge (O6) — plan
Spec: docs/superpowers/specs/2026-11-08-usage-window-design.md (the spec outranks this plan)

Start state (checked 2026-11-08): `Tithe` (`chronicle/mod.rs`) keeps 24 `hourly` shares, no finer time; `load_tithe`
rejects a file unless `hourly.len() == 24`. A `limit` event is `Event::for_session(now, "limit", s, "14:00")`
(`main.rs`), with no reset or hit time. `Limit` (`registry/mod.rs`) has `reset_ms` and `text` only. OpenCode rows
lose `providerID` in `opencode.rs` translation. The plaque (`ui/chronicon.js`) is text only. No `limit` line in the
real day files: the fixture line is written to match `Event`.

## Milestone 1 — the gauge

**S1 · Five-minute buckets.** Blocked by: none.
`Tithe::fine` (288 × fresh tokens, `#[serde(default)]`), filled in `add_tokens` (padded to 288 first, so an old file
loaded as today never panics). `Usage::in_window`: false for an OpenCode row whose `providerID` is not `anthropic`
(the translation keeps `providerID`); such tokens still count in every total.
Test: buckets hold fresh tokens (cache reads out); a non-Anthropic OpenCode row counts in totals, not in `fine`;
a current-format day file (fixture with the real file's shape, names and numbers invented: the repo is public; no `fine`) loads with every total unchanged and takes a token.
Check: `cargo test`.

**S2 · Limit events carry `resetMs` / `hitMs`.** Blocked by: none.
`Limit::hit_ms` (the line's timestamp in `limit_of`); `Event` gains `reset_ms` / `hit_ms`
(`#[serde(default, skip_serializing_if = "Option::is_none")]`); `main.rs` stamps them on each limit event.
Test: `limit_of` gives the hit time; a fixture `limit` line without the fields still parses; other events serialize
unchanged (no `null` keys).
Check: `cargo test`.

**S3 · `window_of` + transport.** Blocked by: S1, S2.
Pure `window_of(days, limits, now) -> Window { start_ms, tokens, ceilings }`; `chronicle::window` reads the kept
days' `fine` and limit events; `tithe_day` adds `window` to today's answer only (never to the saved Tithe);
`remote_tithe` keeps it.
Test (pinned clock): a window opens only after the previous one closed, not on a gap; a reset pins it; no token in
5 h → 0, no start; a ceiling is the sum inside `[reset − 5 h, hit]`, across midnight too; one wave → one ceiling; a
limit without a reset → no ceiling; the remote tithe keeps `window`. Prove each gate by breaking it.
Check: `cargo test`, `cargo clippy -- -D warnings`.

**S4 · UI.** Blocked by: S3.
Plaque bar (fill ∝ tokens / highest ceiling, clamped; a tick per ceiling, the lowest marked; empty frame without
ceilings; tooltip `estimate · this PC`); today's Chronicon line `Window: 2.1M since 13:40 · ceilings 3.4M, 4.0M`.
Styles in `ui/index.html`.
Test (`ui/chronicon.test.mjs`): no ceiling → no ticks; ticks and the low mark; the tooltip carries "estimate"; the
line text; no window → no gauge.
Check: every `node ui/*.test.mjs`.

**S5 · Docs.** Blocked by: S4.
README *Header* and *Chronicon and Tithe*; `docs/remote-api.md` (`window` in the tithe payload); `docs/DEVELOPMENT.md`
(chronicle and chronicon rows).

## Milestone check
`cargo test`, `cargo clippy -- -D warnings`, every `node ui/*.test.mjs`.
