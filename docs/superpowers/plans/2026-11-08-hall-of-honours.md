# Hall of Honours (O8) — plan
Spec: docs/superpowers/specs/2026-11-08-hall-of-honours-design.md (the spec outranks this plan)

Start state (checked 2026-11-08): `Share` (`chronicle/mod.rs`) has `tokens`, `busy_ms`, `turns`, `files`,
`more_files`; turn durations reach `absorb` as `Turn { ts, ms }` and add to `busy_ms` and `turns`, nothing keeps the
longest. Day files: `<day>.tithe.json` and `<day>.jsonl` (events: `commit`, `petition`, `petition-answered`, `left`,
...), 7 days kept. Alcoves (`scene.js alcoves`) exist only once the scriptorium is wide enough (dx ≥ 40 or room east of
the cogitator bank); alcove 0 is a window slot (window + hanging). A wall prop listed in `hung()` is a decal in 39°
(`isohall.js placeProps`). Art generators: `tools/<gen>_art.mjs` + `tools/<gen>_art/<world>.mjs` (`tier2` the base
sheet), picked up by `tools/art_gate.mjs` by existing.

## Vertical slice — one plaque, end to end

**S1 · `max_turn_ms`.** Blocked by: none.
`Share::max_turn_ms` (`#[serde(default, skip_serializing_if)]`), the max of the department's finished turns, set in
`absorb` where `turns` is counted. Test: the max kept per department; the 2026-11-08 fixture (no `max_turn_ms`) loads
with every total unchanged and reads 0.
Check: `cargo test`.

**S2 · `honours` (Rust).** Blocked by: S1.
`chronicle/honours.rs`: pure `honours(days: &[(day, Tithe, events)]) -> Honours { commits, longest, fast, busiest }`,
each `Option<Mark { dept, value, day? }>`; `honours_of(dir, live, now)` reads the 7 kept days (oldest first, one event
stream so a pair across midnight counts). Fast answer: `petition` → `petition-answered`, same session, ≤ 60 s; a new
`petition` restarts the clock, `left` drops it. Ties: the latest wins (rules in the module doc). Command `honours`
(`main.rs`), remote route `GET /api/honours` (`remote/mod.rs` `Call::Honours`, `remote/app.rs`); no paths in it.
Test: ties, an empty week, 50 s vs 70 s, a re-asked petition, a session that leaves while waiting, max turn per dept,
the route.
Check: `cargo test`, `cargo clippy --tests -- -D warnings`.

**S3 · `HONOURS` art.** Blocked by: none.
`tools/honours_art.mjs` + `tools/honours_art/{kit,tier2,cyber,orbital,tower,vault,darwin}.mjs`: 6 designs drawn from
scratch; `ui/art/honours.*` and `ui/art/<world>/honours.*`; `honours` in the five worlds' `art`, in `PROP_SHEETS`;
catalog row appended. Test (`ui/art.test.mjs`): each world's HONOURS mask differs from the base sheet's.
Check: `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, galleries regenerated.

**S4 · The plaque in the hall.** Blocked by: S2, S3.
`propsOf`: alcove 0 holds `HONOURS` instead of its window and hanging; `hung()` lists it (39° decal). `overlay.js`: the
title and four lines over it, flat in 39° too, click → `openWeek()` (`chronicon.js`). Refresh at start, at midnight, on
`commit` / `petition-answered` / `task-done` (a long turn moves the longest task and the busiest day). Not in the strip. Styles in `index.html`; `honours` in `bridge.js` GETS; the wording
per world (`themes.js`, base in `theme.js` TEXT: needs the caller's approval).
Test: `layout.test.mjs` (no queue slot covered: existing loop over every hall size), overlay text and dashes.
Check: every `node ui/*.test.mjs`.

**S5 · Docs + proof.** Blocked by: S4.
README *What it shows*, `docs/remote-api.md`, `docs/DEVELOPMENT.md`; screenshots per world, flat and 39°.

## Milestone check
`cargo test`, `cargo clippy --tests -- -D warnings`, every `node ui/*.test.mjs`, `node tools/art_gate.mjs`.
