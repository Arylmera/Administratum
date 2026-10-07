# Backlog

Done recently: answer petitions, stale escalation, model ranks, compaction ritual, stable desks, Chronicon + Tithe + scene reactions, space for many agents (compact lecterns, growing hall, pan, edge arrows) (spec: docs/superpowers/specs/2026-10-05-chronicon-design.md); quiet hours, plaque click + branch, usage limits, toast actions, turn summary; Chronicon fixes (push detail from git's output or the branch, offsets saved with the events, a moved session's transcript found once it exists).

## Next
- Subagent liveness: active until the parent transcript holds its completion notification (10 min cap), instead of "transcript touched < 45 s"
- Settings page (gear in the header, parchment panel):
  - Always on top (toggle, applied live via the window API, persisted)
  - Lighting mode, chime on/off, start at login (today in header/tray)
  - Thresholds: stale petition (5 min), idle to Refectorium (2 min), cogitator hold (10 s)
  - Context window per model (200k / 1M)

## Ideas not scheduled
- Global hotkey to show/hide; petition count badge on the tray icon
- Binharic sound pack per event
- Day/night from real sunrise/sunset
- Bundle the Google Fonts locally (fully offline)
- Other agents (Gemini CLI, Codex…) in the hall: their session files first, an opt-in ACP relay later (notes: docs/superpowers/specs/2026-10-07-other-agents-acp-notes.md)
