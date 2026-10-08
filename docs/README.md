# Administratum docs

Start with the [project README](../README.md) (what the app does, install, usage, privacy) and
[DEVELOPMENT.md](DEVELOPMENT.md) (architecture, run, tests, art, release).

## Living documents

Kept in step with the code.

| Document | What it is |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer guide: architecture, modules, run, tests, sprites and themes, build, release |
| [remote-api.md](remote-api.md) | The remote view's HTTP API: server limits, pairing and auth, endpoints, events |
| [backlog.md](backlog.md) | What was done recently, known limits, what's next, unscheduled ideas |
| [sprites/](sprites/README.md) | Generated sprite gallery, one page per theme with its own art (`node tools/sprite_sheet.mjs`) |

## Design specs

One per feature, written before it was built. Each describes the intent and the decisions taken; the code may have
moved on since, and the README and DEVELOPMENT.md describe the current behaviour.

| Date | Spec |
|---|---|
| 2026-10-05 | [v1 design spec](spec.md): the original widget |
| 2026-10-05 | [Chronicon, events and Tithe](superpowers/specs/2026-10-05-chronicon-design.md) |
| 2026-10-05 | [Remote view (LAN)](superpowers/specs/2026-10-05-remote-view-design.md) |
| 2026-10-05 | [Resizable hall](superpowers/specs/2026-10-05-resizable-hall-design.md) |
| 2026-10-06 | [Quiet hours, department plaques, usage limits, toast actions, turn summary](superpowers/specs/2026-10-06-five-features-design.md) |
| 2026-10-06 | [Release pipeline and in-app updates](superpowers/specs/2026-10-06-release-and-updates-design.md) |
| 2026-10-06 | [Sprites and themes](superpowers/specs/2026-10-06-sprite-themes-design.md) |
| 2026-10-06 | [Three new worlds: Orbital Station, Arcane Tower, Vault](superpowers/specs/2026-10-06-three-worlds-design.md) |
| 2026-10-07 | [Depth pass ("2.5D")](superpowers/specs/2026-10-07-depth-2-5d-design.md) |
| 2026-10-07 | [Other agents and ACP](superpowers/specs/2026-10-07-other-agents-acp-notes.md) (notes, not scheduled) |
| 2026-10-08 | [Desktop strip](superpowers/specs/2026-10-08-desktop-strip-design.md) |

## Implementation plans

Step-by-step plans the features were built from, kept as a record. Not maintained after the work landed.

| Date | Plan |
|---|---|
| 2026-10-05 | [v1 plan](plan.md), executed with the prompt in [EXECUTE.md](EXECUTE.md) |
| 2026-10-06 | [Five features](superpowers/plans/2026-10-06-five-features.md) |
| 2026-10-06 | [Release and updates, phase 1](superpowers/plans/2026-10-06-release-and-updates-phase1.md) |
| 2026-10-06 | [Three new worlds](superpowers/plans/2026-10-06-three-worlds.md) |
| 2026-10-07 | [Depth pass](superpowers/plans/2026-10-07-depth-pass.md) |
| 2026-10-07 | [Two views, Flat and 39°](superpowers/plans/2026-10-07-view-39.md) |
| 2026-10-07 | [Desktop strip, first plan](superpowers/plans/2026-10-07-desktop-strip.md) (superseded by the next one) |
| 2026-10-08 | [Desktop strip](superpowers/plans/2026-10-08-desktop-strip.md) |
| 2026-10-08 | [Refactor split (registry.rs, app.js)](superpowers/plans/2026-10-08-refactor-split.md) |
