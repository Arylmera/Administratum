# Night Vigil — design

*2026-10-09. Brief: `~/.claude/night-vigil-brief.md`. Decisions settled in a grill session the same day.*

## Goal

Arm the vigil in the evening and walk away. The agents carry on as far as they can without a human; once
**nothing can progress without a human any more**, the PC shuts down. Sessions are never `/exit`ed or killed: the
shutdown stops them and each is resumed from its transcript the next morning (losing their SessionEnd hooks is
accepted). Zero tokens: pure state logic, no model call. Arming does not survive an app restart.

A session that waits on a human (a permission prompt, a question) or on the subscription (stopped on `limit`) counts
as finished. Anything that still advances on its own (a turn, a helper, a background shell) blocks the vigil.

## Rule (pure, `src-tauri/src/vigil.rs`)

`phase(&Session) -> Phase`, checked in this order:

| Phase | When |
|---|---|
| `Working` | `helpers` not empty (an active adept, even under an idle parent), or `background` (a shell still running after the turn ended) |
| `Limit` | `limit` is set (the newest assistant line is the `rate_limit` message, `registry/tail.rs::limit_of`) |
| `Working` | status `busy` or `shell` |
| `Waiting` | status `waiting` (permission prompt) or a `question` is set |
| `Idle` | anything else |

`Limit` stays its own phase so a later "wait until reset + 10 min" option needs no redesign; today it counts as
finished. A session whose pid is dead is already absent from the roster (registry liveness check), so orphan
headless transcripts never block. No "busy but silent for N min" safety: the deadline below is the backstop for a
stuck `busy` session or a background shell that never ends (dev server, watcher).

`vigil_ready(sessions, last_write, calm_since, now) -> bool`: true when no session is `Working` **and**
`now - max(calm_since, last_write) >= QUIET_MS` (5 min, a constant, not a setting).

- `calm_since` is set to `now` on arming and on every tick where some session is `Working`. The quiet window
  therefore also serves as the minimum delay after arming.
- `last_write` is the newest mtime among the transcripts and subagent transcripts the poller already stats
  (`poller.files`): no extra scan.

## State machine (`Vigil`, stepped once per tick in `poll_loop`)

```
Disarmed ─arm─▶ Armed{deadline?} ─ready or deadline─▶ Countdown{end = now+120 s, forced} ─end─▶ fire
    ▲               │  ▲                                    │
    └──cancel───────┘  └──resumed (re-check fails, not forced)┘      cancel (any surface) ─▶ Disarmed
```

- **Countdown** is counted by the app (not handed to `shutdown /t 120`). At its end the rule is re-checked: if a
  session went `Working` meanwhile, the countdown stops (`resumed`), `calm_since = now`, the vigil stays armed.
- **Deadline** (`adm.vigilDeadline`, minutes after midnight as a string like `adm.quietFrom`, empty by default): read when arming, it targets the next occurrence
  of that time. When it passes, a countdown starts whatever the sessions do, and is `forced`: no re-check at its end.
- **Fire** is an injected action. Real: record the `fired` event, flush the Chronicon, then
  `shutdown /s /f /t 0 /c "Administratum: Night Vigil"` (`/f` because the decided `/t 120` implied it: no app may veto the shutdown). Tests and demo mode: a no-op (demo's scripted roster goes idle
  and must never shut the PC down).
- **Cancel** from any surface disarms. Cancelling during a countdown also disarms.
- The state (`armed`, `deadline`, `countdown_end`, `forced`) is emitted every tick as event `vigil`, like `roster`,
  so a late-loading webview or remote view always has it. `emit` already publishes to the remote SSE.

The vigil runs while the window is hidden: `poll_loop` is its own thread, independent of the webview.

## Surfaces

- **Tray**: a checkable "Night Vigil" item; unchecking it cancels. Kept in step with the state (like "Start at login").
- **Header button** (moon) in the UI: arms / cancels. The same files serve the remote view, so the phone gets it too.
- **Tauri commands** `vigil_arm`, `vigil_cancel`.
- **Remote**: `POST /api/vigil`, body `{"arm": true|false}`, with exactly the checks of `answer_petition`: remote
  actions allowed in settings (else 403), cookie, `X-Adm: 1`, same origin, JSON content type, size cap. Arming
  remotely uses the same deadline setting. Document it in `docs/remote-api.md`.
- **Settings panel**: one field, the deadline time (empty = none).
- **Toast** when a countdown starts: a WinRT toast with a **Cancel** button (the Approve/Deny mechanism of
  `petition_toast`). It ignores quiet hours: the user armed the vigil. No character on the desktop strip; the toast
  covers a hidden window.

## Chronicon

One event kind, `vigil`, with `detail` one of `armed`, `fired · <name of the last session to finish>`, `deadline`
(the deadline started a countdown), `cancelled`, `resumed`. `fired` is recorded and flushed before `shutdown` runs.
The last session to finish is the one whose phase left `Working` most recently (tracked by the state machine).

## The Watchman (art)

A new character, drawn for each of the five worlds, in both views: families `watch` (Flat) and `watch39` (39°).
Every world gets its own design, never a recolour (house rule):

| World | Watchman |
|---|---|
| Warhammer 40k (base) | An Inquisitor: long coat, rosette, lantern; a curfew bell rings during the countdown |
| Cyberpunk (`cyber`) | A security guard in a jacket, flashlight and walkie-talkie |
| Space (`orbital`) | A night-shift astronaut with a headlamp |
| Fantasy (`tower`) | A cloaked lookout with a lantern and an hourglass |
| Fallout (`vault`) | A Vault-Tec security officer: helmet, baton, flashlight |

Frames: a walk cycle, a standing pose with the light, a ringing / signalling pose. Behaviour (`actors.js`):

- **Armed**: enters through the gate and patrols between the desks, with a light pool (`lighting.js` glows).
- **Countdown**: posts himself at the gate, a label above him shows the seconds left, the ring frame plays every
  30 s.
- **Disarmed / fired**: walks out through the gate.
- Clicking him opens the card with **Cancel**. His name comes from each theme's wording (`t()`).

The art follows the CLAUDE.md sprite workflow: live viewer (`tools/sprites.html`), key palette `ui/art/key.gpl`,
the frames' JSON, `sprite_catalog.mjs`, `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, then the galleries
regenerated (`node tools/sprite_sheet.mjs` and `--theme` for cyber, orbital, tower, vault). Each themed folder lists
`watch`/`watch39` in its theme's `art`. One task per world in the plan.

## Tests

Rust, in `vigil.rs` (the real `shutdown` is never called; the action is injected):

- `phase`: idle, waiting, question, limit, busy, shell, a busy helper under an idle parent, a background shell,
  limit with an active helper (`Working`).
- `vigil_ready`: quiet window not yet elapsed / elapsed, a transcript write restarts it, a `Working` session resets
  `calm_since`, empty roster.
- `step`: arm → countdown → fire; countdown → `resumed` when a session works again; deadline fires a forced
  countdown despite a busy session; cancel during countdown; deadline's next occurrence across midnight.
- `remote.rs`: `/api/vigil` routing and its 403 / 415 cases, like `answer_petition`'s tests.

Node: the existing art and sprite tests cover the new families.

## Known limit

A background subagent stuck in one long tool call (a cargo or NSIS build) writes nothing to its transcript and drops
out of `helpers` after `HELPER_SAFETY_CAP_MS` (10 min); the vigil can then fire ~15 min into that build. Still
stricter than the prototype's window; no fix now.

## Later (not built)

- Generalise to "condition → action" (run a command, notify), shutdown being the first action.
- On `limit`: "wait until reset + 10 min" before counting the session finished.
