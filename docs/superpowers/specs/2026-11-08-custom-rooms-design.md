# Custom rooms (O10) — decisions

**Goal.** User rules map a folder pattern to a named room: a fenced zone with a fixed place in the hall that groups
every department whose sessions work under that pattern.

**Status.** Decisions agreed one by one with the user (grill, 2026-11-08). Design and builder check pending. Scheduled last, after O9 (user).
Builds on the break-out room (`docs/superpowers/specs/2026-10-08-break-out-room-design.md`, `temp_dept` in
`src-tauri/src/registry/sessions.rs`).

## Decision ledger

1. **Purpose (Q17).** Group a work domain (several repos under one name) and give it a fixed place on screen.
2. **Always present (Q18).** A room stays in the hall while its rule exists, empty and dimly lit when no session
   matches. Its place never moves for lack of sessions.
3. **Place (Q19).** Rooms first, in rule order, before ordinary departments. A placement grid may come later.
4. **Rule syntax (Q20).** A glob, case-insensitive, `\` and `/` equivalent (`**/git/Terra/**`); a `re:` prefix
   makes it a regex. First matching rule wins.
5. **Contents (Q21).** One sub-block per department inside the room's fence; each keeps its rug, plaque and branch;
   the room's own plaque carries the room name.
6. **Look (Q22).** The break-out room's construction (floor, fence, gate, plaque), a new design per world (6),
   distinct from the break-out room; each rule has a colour (Settings) tinting its floor and plaque.
7. **Behaviour (Q23).** Normal: refectory, cogitator, brazier, Sanctum, gate in and out, every usual event and
   toast. A folder both under `%TEMP%` and matched by a rule goes to the break-out room.
8. **Editing (Q24).** A new Settings tab *Rooms*: per rule name, pattern, colour, ↑ / ↓ order, delete; a live line
   lists the sessions matching now; an invalid pattern shows red and is not saved. Stored in `settings.json`; the
   remote view shows it read only.
9. **Views (Q25).** Flat and 39°: a fenced zone with its gate. Horizontal strip: a bay in the rule's colour, in rule
   order first, with its plaque. Vertical strip (O9): one floor per room, later. Chronicon: nothing new for now.
