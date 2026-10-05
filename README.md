# Administratum

Desktop widget: every Claude Code session on this PC as a Mechanicus scribe in a pixel-art office.
A scribe that needs you walks to the Sanctum and queues before the Magos; Windows toast + optional chime.

## What you see

- **Scribes** sit at desks grouped by project (department rugs). Working: screen and candle lit.
  Running a shell command: at the cogitator (stays 10 s after the last command). Idle: dozes;
  idle for more than 2 min: walks to the Refectorium for recaff and dozes on a bench.
  Idle with a background shell still running: stays at the desk, a brass cog spins on it.
- **Petitions** (a session waiting for you): the scribe queues in the Sanctum with a sealed scroll,
  compact label with what it wants and how long; toast + chime once per petition.
- **Adepts** are the session's active subagents (transcript touched in the last 45 s); they work at
  consoles in their department (1 desk slot = 4 consoles) and leave when done.
- **Context**: paper piles up on the desk as the session's context grows (desk full at 50 % of the
  window); past that, sheets fall around the desk. Exact numbers in the card.
- **Click** a character: its Orca terminal comes to the front (sessions started in Orca) and its card
  opens (state, task, context, path, "Open in Orca" / "Open on claude.ai"). Hover shows the name.
  Clicking a petition label copies `name path` to the clipboard. Escape closes the card.
- Lighting: Auto (by hour) / Full light / Candles. Tray: show/hide, chime, lighting, start at login, quit.

## Develop

- Run: `cd src-tauri; cargo tauri dev`
- Demo roster (no real sessions needed): set `ADMINISTRATUM_DEMO=1` before `cargo tauri dev`
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml`, `node ui/layout.test.mjs`, `node ui/sprites.test.mjs`
- Install: `cd src-tauri; cargo tauri build`, then run `target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe`

Reads `~/.claude/sessions/*.json`, transcript tails and subagent metadata, read-only; reads the
`ORCA_TERMINAL_HANDLE` environment variable of running `claude.exe` processes.
Spec: `docs/spec.md` · Plan: `docs/plan.md` (v1; master copies in the Terra vault, `Anamnesis/Specs/`).
