# Backlog

Done recently: answer petitions, stale escalation, model ranks, compaction ritual, stable desks, Chronicon + Tithe + scene reactions, space for many agents (compact lecterns, growing hall, pan, edge arrows) (spec: docs/superpowers/specs/2026-10-05-chronicon-design.md); quiet hours, plaque click + branch, usage limits, toast actions, turn summary; Chronicon fixes (push detail from git's output or the branch, offsets saved with the events, a moved session's transcript found once it exists); Depth pass, "2.5D" without new art (shadows, AO, height-aware lights, cast shadows, parallax, depth of view; plan docs/superpowers/plans/2026-10-07-depth-pass.md); Two views, Flat 3/4 and 39° (Settings > View, live), every world's 39° art, tall windows and full-height hangings, 39° background built 2.5x faster, lights at their height in 39° (plan docs/superpowers/plans/2026-10-07-view-39.md); Desktop strip, a third view: a thin click-through bar pinned to the Windows taskbar, re-placed on taskbar/monitor/DPI changes, hidden behind fullscreen apps, stale-petition beacon and servo-skull, Strip size and backdrop settings (plan docs/superpowers/plans/2026-10-08-desktop-strip.md); Settings page (always on top, lighting, chime, start at login, thresholds, context window per model); Auto lighting from the real sunrise/sunset (Settings > Location); daylight beams fitted to the window glass, 2.5D Backdrop switch (off: the desktop shows round the hall); Subagent liveness: an adept stays active until the parent transcript holds its completion notification, 10 min of silence as a safety cap, 30 s grace for its final flush (registry/helpers.rs, landed in 7cdc2a3 and 26f6005).

## Known limits (strip)
- Bottom taskbar only: a side or top taskbar puts the strip at the bottom of the work area instead
- No macOS yet (planned: above the Dock)
- No desk glows or lighting pass in the strip (the hall's lighting is skipped there)
- The cogitator (82×50) nearly fills the strip's height and leaves less room for lecterns on narrow screens
- A click on a character needs the cursor to rest there about 50 ms first (the strip polls the cursor to decide click-through)
- Fullscreen detection is system-wide: a fullscreen app on another monitor also hides the strip

## Known limits (39° view)
- Effects drawn on a slanted plane (paper on a desk top, stamps and seals on a desk front, the cogitator's screens) are resampled through a transform and look softer than the pixel-exact background
- A scribe eases into its seat (0.3 s) but stands up at once, no eased stand-up
- Every desk-level light shares one height and offset (lighting.js lift39): a candle flame and a slate screen sit a few px either side of it; per-light heights need the light lists (scene.js) to carry them
- At Auto scale the whole projected hall fits the window, bays included: a hall with bays shrinks its pixels rather than panning
- Switching views keeps the floor point at the view's centre; a centre on the back wall band lands near it, not on it
- Small art polish left: the adept39 west turn is weak in the Warhammer and vault art, the magos39 is modest, the gate spire is a ridge, a few small props read as blobs (tower table bowls, vault censer shade, cyber antennas)

## Next
- (empty)

## Ideas not scheduled
- Global hotkey to show/hide; petition count badge on the tray icon
- Binharic sound pack per event
- Bundle the Google Fonts locally (fully offline)
- Other agents (Gemini CLI, Codex…) in the hall: their session files first, an opt-in ACP relay later (notes: docs/superpowers/specs/2026-10-07-other-agents-acp-notes.md)
