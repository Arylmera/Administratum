# Break-out room — design

*2026-10-08. Sessions running in a temp folder get their own closed, strongly themed zone of the hall, shown only
while such sessions exist.*

## Why

Throwaway sessions (Geneseed's `tests/skill_triggers.mjs` runs `claude -p` four at a time in
`%TEMP%\gs-triggers-XXXXXX\out`; Claude's scratchpads live in `%TEMP%\claude\…`) show up as ordinary departments
with meaningless names ("out"), crowd the refectory and flood the Chronicon with arrivals and departures. They are
worth seeing (what is running, what it costs), but apart from real work.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How physical | A closed zone inside the scriptorium: its own floor, a fence all round, one real gate, a plaque. Present only while temp sessions exist. |
| 2 | Where | Packed last, after every normal department, starting on a fresh slot row; in the strip, after the normal departments. Overflow takes temp sessions first. |
| 3 | Grouping | Sub-blocks per temp folder inside one fence; the fence carries the theme's room name. |
| 4 | Sub-block name | `Temp\claude\<encoded project>\…` → `<Project> (scratch)`; else the first folder under Temp with a trailing mkdtemp suffix (`-` + 6 alphanumerics) dropped (`gs-triggers`). |
| 5 | Movement | Confined: in and out only through the zone's gate, idle at their own desk; no refectory, no cogitator, no brazier. Only a petition leaves (Magos queue as usual). |
| 6 | Noise | No `arrived` / `left` / `compaction` events, no `stale` / `limit` toasts or chimes. Petitions still log, toast and chime. Tokens still counted, under the sub-block name. |
| 7 | Look | 13 designs, one per theme (table below), each its own drawing; the sign is the plaque text. |
| 8 | Views | Flat and 39°: floor in the rug pass, a low fence all round, the gate in the bottom edge. Strip: floor band, a gate at each end (the strip is one walkway, so everyone heading east passes through; there it is a fenced bay, not a closed room). |
| 9 | Setting to hide | None. |
| 10 | Lifetime | The zone exists while its blocks do: it appears with the first temp block and goes with the last one (empty-block grace as today). |
| 11 | Hall size | Temp blocks count toward compact lecterns and extra bays like any block (accepted; revisit if a test sweep shrinks real desks too often). |

## Detection and naming (Rust, `src-tauri/src/registry/sessions.rs`)

- `temp_dept(cwd, temp_root) -> Option<String>`: `None` unless `cwd` is under `temp_root` (separators normalised,
  case-insensitive). Else, with `s` the first segment under the root:
  - `s` is `claude` and a second segment exists: the project is the last `-`-separated piece of that encoded
    segment → `"<Project> (scratch)"`. Known limit: a project name containing `-` keeps only its last piece.
  - else `s` with a trailing `-` + exactly 6 alphanumerics removed.
- `scan` calls it with `std::env::temp_dir()`; the session record gains `temp: bool`; `dept` is the temp name when
  temp, `dept_of(cwd)` otherwise.

## Noise (`src-tauri/src/chronicle.rs`, `src-tauri/src/main.rs`)

- `chronicle::lifecycle`: no `arrived`, `left`, `compaction` for temp sessions; `petition` / `petition-answered` stay.
- `main.rs` poll loop: stale-petition toasts and their `petition-stale` emit, limit toasts and their `limit` emit
  skip temp sessions. The `limit` Chronicon event stays (it is a record, not a toast).
- Token usage is added as today, keyed by the session's `dept` (the sub-block name).

## Layout (`ui/layout.js`, `ui/strip.js`, `ui/app.js`)

- `app.js` passes `temp` on each department. `planLayout` keeps `p.temp` on its persisted plan and stable-sorts the
  plan normal-first before every packing, so a temp folder that arrived first still packs last.
- Both packers tag each block with `temp`. `layoutDepartments` forces a new slot row before the first temp block
  (unless already at the row start), so the zone never shares a row with a normal block.
- `breakoutOf(blocks, H)` (one place, layout.js): `null` without temp blocks; else the zone rectangle (the temp
  blocks' bounds, padded 2 px, its east edge kept 4 px west of the corridor) and its gate: `inside` on the zone's
  bottom slot-gap lane, `outside` on the first lane below the zone, both at the zone's east column.
- `breakoutOfStrip(blocks)`: the temp blocks' span and a gate at each end.

## Routes (`ui/layout.js` `route`)

- The zone rectangle is solid for every walk that does not start or end inside it (its own lanes included).
- Ending inside: the normal route to `gate.outside`, then `gate.inside`, up the zone's east column to the target's
  lane, along it, up to the seat. Starting inside: the reverse. Both inside: the inner walk only.
- The strip keeps `stripRoute`; its gates are drawn open while anyone stands by them, as the strip's doors.

## Behaviour (`ui/actors.js`)

- `napping` skips temp scribes; `destination` never sends a temp scribe to the cogitator; a compaction is the puff
  (no brazier walk). A petition sends them to the Magos queue as any scribe; answered, they walk back through the gate.

## Drawing

- **Floor**: the theme's breakout floor tile fills the zone rectangle after the rugs (flat), in the floor pass (39°,
  projected).
- **Fence**: about a third of a scribe's height, posts at the corners, rails between, the gate leaf in the bottom
  edge at the east column, drawn open while a walker is within 12 px (the doors' rule). Flat: rails as depth-sorted
  items (back rail behind everyone in the zone, front rail in front). 39°: each rail a thin box textured from its
  flat frame (as the doorways' leaves in scene39.js `doorKit`).
- **Strip**: the floor band under the temp blocks, a gate leaf at each end.
- **Plaques**: one outer plaque with the theme's `breakout` name, one per sub-block as today.

## Art: one `breakout` family per theme

Frames (art px, key palette): `floor` (16×16 tile), `rail` (16×8, tiles along the top and bottom edges), `side`
(4×16, tiles down the east and west edges), `post` (6×14), `gate closed` and `gate open` (16×14). The base family is
`ui/art/breakout.*` (Ordo Administratum); every other theme has `ui/art/<theme id>/breakout.*`. The theme's own
folder wins over the art folder it borrows (`artOf`), so Neon Grid's accents get their own.

| | Theme (id) | Room name | Look |
|---|---|---|---|
| A | Ordo Administratum (tier2) | Menial Pen | grated iron floor, low railing, slate tally board |
| B | Ordo Machinum (forge) | Servitor Pen | hazard-chevron floor, cable fence, cog sigil |
| C | Ordo Xenos (xenos) | Containment Cell | glowing floor grid, stasis-field posts |
| D | Ordo Malleus (night) | Warded Circle | hexagrammic ward on the floor, candle posts |
| E | Ordo Hereticus (contrast) | Penitent Cage | flagstones, iron bars, chained tome |
| F | Neon Grid (cyber) | Sandbox | wireframe floor, laser fence |
| G | Orbital Station (orbital) | Quarantine Bay | airlock hazard stripes, glass partition |
| H | Corpo Tower (corpo) | Temp Pool | grey carpet tiles, glass hot-desk partitions, "TEMPS" lanyard sign |
| I | Rain City (rain) | Back Alley | wet asphalt, chain-link fence, flickering sign |
| J | Green Code (matrix) | The Construct | bare white loading-program void |
| K | Sunset Drive (synth) | Arcade Corner | checkered floor, velvet rope, marquee |
| L | Arcane Tower (tower) | Summoning Circle | chalk circle, rune stones |
| M | Vault 111 (vault) | Test Chamber | Vault-Tec experiment cell, observation-glass fence, "EXPERIMENT IN PROGRESS" |

## Tests

- Rust: `temp_dept` (gs-triggers suffix dropped, scratchpad → `Administratum (scratch)`, outside Temp → `None`, no
  suffix kept whole, case-insensitive root); `lifecycle` quiet for a temp arrival, still a petition.
- `layout.test.mjs`: a temp department that arrived first packs last; the zone starts a fresh row and intersects no
  normal block; the lane above it stays clear; a normal walk never enters the zone; a temp walk passes the gate.
- `strip.test.mjs`: temp blocks after normal ones, the strip zone's span and gates.
- `art.test.mjs` / `sprites.test.mjs`: the `breakout` family complete in every theme; galleries regenerated.

## Build order

Each step ships on its own, followed by a rebuild and silent reinstall of the NSIS build:

1. Detection, naming and noise (Rust).
2. Layout and routes: temp last, fresh row, zone, gate walks; behaviour (confinement).
3. Drawing with the base art (every theme falls back to it).
4. The 12 other themes' art, one theme per task.
