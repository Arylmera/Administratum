---
tags:
  - spec
  - administratum
  - claude-code
status: draft
date: 2026-10-05
---

# Administratum — design spec

A desktop widget that shows every Claude Code session running on this PC as a Mechanicus
scribe in a top-down pixel-art office, and calls the operator when one of them needs an answer.

Visual reference: Claude Design canvas *Administratum*, board **Tier II — Data-Shrine of the
Cult Mechanicus** (https://claude.ai/artifact/4jTYvAhhQAgdfBcntm1vvV). The board's sprite maps
and palette are the starting art for the app.

## Goal and scope

- Show all local Claude Code sessions (Orca panes, plain terminals, IDE), independent of Orca.
- Show where each one works (project) and what it is doing (state + last task line).
- Make a session that is blocked on the operator impossible to miss: queue at the operator's
  office, Windows toast, optional chime.

Out of scope: answering a petition from the widget (Claude Code exposes no channel for it),
sessions on other machines, the NAS / Hololith, any write into `~/.claude`.

## Data source

Claude Code keeps one live record per running session in `~/.claude/sessions/<pid>.json`
(verified on v2.1.283). Fields used:

| Field | Use |
|---|---|
| `pid`, `procStart` | liveness: process exists and is `claude.exe` (guards pid reuse) |
| `sessionId` | identity; transcript path `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` |
| `cwd` | department = last path segment |
| `name` | scribe name (`terra-77`) |
| `status` | `busy`, `shell`, `idle`, `waiting` |
| `waitingFor` | petition text (`approve Bash`, `input needed`, `dialog open`) |
| `statusUpdatedAt` | time in state; petition episode key |

Task line: tail of the transcript (last user prompt or last tool name + target), read from the
end of the file only. Unreadable → `—`.

The registry is the only source of truth. Read-only. No hooks, no Claude Code config change.

## Architecture

Own repo `Arylmera/Administratum` (private), Tauri 2, no npm build: Tauri serves a plain `ui/`.

| Path | Job |
|---|---|
| `src-tauri/src/registry.rs` | Pure functions: parse records, filter dead pids, tail transcript, diff old/new roster → events (`arrived`, `left`, `state_changed`, `petition_opened`, `petition_closed`) |
| `src-tauri/src/main.rs` | Window, tray, 1 s poll (no file watcher: six small files a second is nothing), emit `roster` to UI, fire toast |
| `ui/index.html`, `ui/scene.js` | Canvas 2D scene: tile map, layout, actors, lighting, labels, card |
| `ui/sprites.js` | Pixel maps (string rows + palette chars, same format as the mockup) and walk frames |

Rendering: logical canvas 346×226 px, integer scale (2 or 3, by window size), `image-rendering:
pixelated`, 30 fps cap, paused when the window is hidden.

## The scene (Tier II)

- **Scriptorium** (left): iron grate floor with glowing green coolant channels, archive shelves
  overflowing with paper, gothic windows, Cog Mechanicus banners, copper pipes, cables from the
  ceiling, hanging incense censers, binary cant on the walls, cogitator bank on the back wall.
  Paper towers, scroll piles, books and loose sheets everywhere (an unsorted library).
- **Departments**: one rug block per project, sash and rug colour from a fixed palette assigned
  in order of first appearance; desks laid out 4 per row; blocks flow left-to-right, top-to-bottom.
  Beyond the room's capacity the extra sessions are not drawn and a plaque shows `+N in the stacks`;
  their petitions still toast and count in the header.
- **Refectorium "Sacred Oils"** (top right): recaff dispenser, crates, servo-skull. Decor.
- **Sanctum of the Magos** (bottom right): the operator's office. Cog Mechanicus, throne,
  desk with data screen, purity seals, braziers. The petition queue forms in front of the desk
  and extends out through the door into the scriptorium.

Scribes: Mars-red tech-priest robes, department sash, green optic, two mechadendrites, chained
to the desk, ceiling cable into the hood while working.

| Registry status | Scribe | Alert |
|---|---|---|
| `busy` | at desk, candle lit, screen lit | none |
| `shell` | walks to the cogitator bank and works there | none |
| `idle` | at desk, candle out, dozes (`z z`) | none |
| `waiting` | unchains, walks desk → door → end of queue, holds a sealed scroll; label shows `waitingFor` + wait time | toast + chime + header counter pulses |
| new session | enters from the door, takes a free desk in its department | none |
| session gone | gathers papers, walks out | none |

Walking: 4-direction sprites, 3 frames each, A* not needed: fixed waypoints (desk → aisle →
door → queue slot). Queue order = time the petition opened; when the head leaves the queue the
others step forward.

## Lighting

Header switch, persisted per viewer: **Auto** (default), **Full light**, **Candles**.

- Auto: 08–18 h day, 06–08 h and 18–21 h dusk, otherwise night.
- Day: bright stained glass, light shafts, light shadow. Night: darkness with pools of light
  around candles, braziers, censers, cogitator screens and coolant channels. Dusk in between.
- Tier II keeps a darkness floor even at full light.

## Window and interaction

- Desktop widget: frameless, always-on-top, draggable header, resizable in integer scale steps,
  position and size remembered. Tray icon: show/hide, mute chime, lighting mode, quit. Start at
  login only if enabled from the tray.
- Click a scribe's label: parchment card with name, department, state + time in state, task line,
  project path.
- Click a petitioner: also copies `name` and project path to the clipboard (to find the pane).

## Alerts

- Toast (Windows, via `tauri-plugin-notification`): "Petition from `<name>`" /
  "`<department>` · `<waitingFor>`". Fires once per petition episode, keyed on
  `sessionId + statusUpdatedAt` at the transition into `waiting`.
- Chime: synthesised with WebAudio, once per episode, mutable from header and tray.
- No re-toast while the same scribe stays in the queue.

## Error handling

| Case | Behaviour |
|---|---|
| JSON half-written / malformed | skip that file this tick, keep last known state |
| pid dead or not `claude.exe` | scribe leaves |
| sessions folder missing / empty | office lit, empty, "No scribes on duty" |
| transcript unreadable | task line `—` |
| unknown `status` value | treated as `idle` |

## Testing

- Rust unit tests on `registry.rs` with fixture records: parse, dead-pid filter, malformed file
  recovery, petition fires once per episode, queue ordering.
- `--demo` flag replays a scripted roster (arrive, work, shell, petition, answered, leave) for
  visual checks without real sessions.
- No frontend test framework.

## Follow-ups (not in v1)

- `Armoury/Projects/Administratum.md` card for the Hololith once the repo exists.
- Tier III elements (alarm beacon) as an option if petitions prove easy to miss.
