# Backlog

Done recently: answer petitions, stale escalation, model ranks, compaction ritual, stable desks, Chronicon + Tithe + scene reactions, space for many agents (compact lecterns, growing hall, pan, edge arrows) (spec: docs/superpowers/specs/2026-10-05-chronicon-design.md); quiet hours, plaque click + branch, usage limits, toast actions, turn summary; Chronicon fixes (push detail from git's output or the branch, offsets saved with the events, a moved session's transcript found once it exists); Depth pass, "2.5D" without new art (shadows, AO, height-aware lights, cast shadows, parallax, depth of view; plan docs/superpowers/plans/2026-10-07-depth-pass.md); Two views, Flat 3/4 and 39° (Settings > View, live), every world's 39° art, tall windows and full-height hangings, 39° background built 2.5x faster, lights at their height in 39° (plan docs/superpowers/plans/2026-10-07-view-39.md).

## Known limits (39° view)
- Effects drawn on a slanted plane (paper on a desk top, stamps and seals on a desk front, the cogitator's screens) are resampled through a transform and look softer than the pixel-exact background
- A scribe eases into its seat (0.3 s) but stands up at once, no eased stand-up
- Every desk-level light shares one height and offset (lighting.js lift39): a candle flame and a slate screen sit a few px either side of it; per-light heights need the light lists (scene.js) to carry them
- At Auto scale the whole projected hall fits the window, bays included: a hall with bays shrinks its pixels rather than panning
- Switching views keeps the floor point at the view's centre; a centre on the back wall band lands near it, not on it
- Small art polish left: the adept39 west turn is weak in the Warhammer and vault art, the magos39 is modest, the gate spire is a ridge, a few small props read as blobs (tower table bowls, vault censer shade, cyber antennas)

## Next
- Subagent liveness: active until the parent transcript holds its completion notification (10 min cap), instead of "transcript touched < 45 s"
- Settings page (gear in the header, parchment panel):
  - Always on top (toggle, applied live via the window API, persisted)
  - Lighting mode, chime on/off, start at login (today in header/tray)
  - Thresholds: stale petition (5 min), idle to Refectorium (2 min), cogitator hold (10 s)
  - Context window per model (200k / 1M)

## Ideas not scheduled
- Desktop strip mode (Desktop Goose style, on the Windows taskbar): plan docs/superpowers/plans/2026-10-07-desktop-strip.md
- Global hotkey to show/hide; petition count badge on the tray icon
- Binharic sound pack per event
- Day/night from real sunrise/sunset
- Bundle the Google Fonts locally (fully offline)
- Other agents (Gemini CLI, Codex…) in the hall: their session files first, an opt-in ACP relay later (notes: docs/superpowers/specs/2026-10-07-other-agents-acp-notes.md)
