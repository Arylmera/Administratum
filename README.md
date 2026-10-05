# Administratum

Desktop widget: every Claude Code session on this PC as a Mechanicus scribe in a pixel-art office.
A scribe that needs you walks to your door and queues; Windows toast + optional chime.

- Run: `cd src-tauri; cargo tauri dev`
- Demo roster (no real sessions needed): set `ADMINISTRATUM_DEMO=1` before `cargo tauri dev`
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml` and `node ui/layout.test.mjs`
- Build installer: `cd src-tauri; cargo tauri build`
- Install: `cd src-tauri; cargo tauri build`, then run `target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe`

Reads `~/.claude/sessions/*.json` and transcript tails, read-only.
Spec: `docs/spec.md` · Plan: `docs/plan.md` (master copies in the Terra vault, `Anamnesis/Specs/`).
