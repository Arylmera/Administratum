# Hall plan: open space or rooms around the Sanctum

Status: built (2026-11-14) on `salle-au-centre`; the Later list is open.

Decided with Christian on 2026-11-14. Turns his personal mirror hall (branch `zones-au-centre`, spec
`2026-11-12-sanctum-au-coeur-design.md` on that branch) into an **option beside Guillaume's hall**, so it can be offered
upstream. The 2026-11-12 spec stays the description of what the second plan looks like and how it behaves; this note
only fixes what the toggle adds.

## Intent

Two ways of organising the work, chosen by the user:

- **Open space** (Guillaume's hall, the default): one big scriptorium where the departments sit side by side, the
  shared cogitator bank and refectory, the Sanctum on the right; custom rooms, if any, as the west wing.
- **Rooms** (Christian's): only confined spaces. Each work domain is a room where its scribes work, sleep at their own
  desk and run their shells at the room's computer; departments matching no rule share one more room; the Sanctum is
  a full-height open column in the middle, every room one step from it. A scribe leaves its room only to queue for a
  question, or to arrive and leave by the gate.

## Goals

1. One setting, **Settings → Rooms → Hall plan: Open space | Rooms**, stored as `hallPlan` in `adm.settings` (`'open'` default,
   `'rooms'`; read through `ui/hallplan.js`), applied live (no restart), in both views (flat and 39°) and every world.
2. **One toggle carries geometry and behaviour together** (Christian's ruling): under *Rooms*, everything the
   2026-11-12 spec describes (mirror plan, rooms on the floor grid with their colour and name, a computer per room,
   shell at the room's computer, nap at one's own desk with the `💤 12 min` tag, no refectory, no shared cogitator
   bank, no west wing, the open Sanctum column with its rail); under *Open space*, none of it.
3. **Open space is Guillaume's hall, pixel for pixel**: the committed flat and 39° background hashes
   (`flathall.test.mjs`, `isohall.test.mjs`) and every existing test stay unchanged with `hallPlan = 'open'`.
4. **No floor channels through the rooms** (Guillaume's remark, 2026-11-14): on `zones-au-centre` the open space's
   floor channels still run across the whole hall over the room tint (`scene.js` `drawStatic`: a `channel h` under each
   slot row, a `channel v` every 200 px from `channelsOf`), with the coolant floor lights at their crossings, so lines
   cut through the rooms at about a fifth from each side and between the rows. Under *Rooms* a room's floor is its
   tint and nothing else: no channel inside a room and no light pool at a channel crossing (flat and 39°). Open space
   keeps its channels.
5. *Rooms* has its own recorded hashes and tests (layout of the places, routes stay in their corridor, nappers keep
   their desk, the shell goes to the room's computer), recorded only after the hall has been looked at.

## Non-goals

- New pixel art (the computer and the Sanctum reuse each world's frames, as on `zones-au-centre`).
- The desktop strip and column views: unchanged in both plans.
- Changing Guillaume's open space in any way, even where *Rooms* does better.

## Constraints

- Branch `salle-au-centre` on top of `linux` (PR #28: the Linux port and strip). Guillaume asked for one PR with
  everything, so when the toggle is done the branch replaces `linux` (a fast-forward push) and PR #28 carries the Linux
  port, the two 39° fixes and the hall plan. History linear, rebase only; Guillaume's commit style, no version bump,
  docs in the same commit.
- The work exists on `zones-au-centre`; port it commit by commit where it applies, each change gated on the plan.
  The Breaking Bad 39° gate fix and the Hall of Honours 39° text fix are already on the branch (from `fixes`).
- Nothing personal in code: zone names and colours come from the user's rules (Settings → Rooms), as today.
- The rule cap rises from 6 to 8 (`MAX_RULES` in `src-tauri/src/rooms.rs`, `MAX_ROOMS` in `ui/rooms.js`), for both plans
  (*Rooms* needs up to 7; the west wing is unharmed by a higher cap).
- Christian's own build = this branch; `zones-au-centre` retires once the toggle works.

## Left to the builder

- The English name of the room for departments matching no rule (Christian calls it *Hors zones*), through the
  theme wording like the other hall labels. Claude's call: `Elsewhere`.
- Where in `layout.js` / `actors.js` the plan is read (one `hallPlan()` accessor, not scattered checks).
- What happens to scribes mid-walk when the plan is switched (a rebuild like a window resize is enough).

## Later (one at a time)

- Done 2026-11-14: a room's name small in its cell's bottom right corner (no desk stands on it); a department's plaque
  may run past its block, to the next block on its row or its room's edge (`overlay.js` `plaqueRoom`).
- Further polish Christian and Guillaume point out, each its own small change.
