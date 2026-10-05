# Backlog

## Next
- Space for many agents, step B: compact desks (narrow lecterns, 6 per row) past a threshold; the hall
  grows (extra scriptorium bay) instead of shrinking everything; minimum readable scale; click-and-hold
  drag to pan when the scene exceeds the window (pointer threshold so clicks still select), light
  inertia, double-click recentres, edge arrows / mini-map for off-screen characters (red blink for an
  off-screen petition)
- Compaction ritual (scribe burns its papers at a brazier) — in progress
- Subagent liveness: active until the parent transcript holds its completion notification (10 min cap), instead of "transcript touched < 45 s"
- Settings page (gear in the header, parchment panel):
  - Always on top (toggle, applied live via the window API, persisted)
  - Lighting mode, chime on/off, start at login (today in header/tray)
  - Thresholds: stale petition (5 min), idle to Refectorium (2 min), cogitator hold (10 s)
  - Context window per model (200k / 1M)
- Brainstorm then build: 6 transcript events (commit seal, failing tests lamp, push), 7 Chronicon (daily log), 8 daily token tithe

## Ideas not scheduled
- Global hotkey to show/hide; petition count badge on the tray icon
- Binharic sound pack per event
- Day/night from real sunrise/sunset
- Bundle the Google Fonts locally (fully offline)
