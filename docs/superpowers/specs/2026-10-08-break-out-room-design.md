# Break-out room — design

*2026-10-08. Sessions running in a temp folder get their own fenced, strongly themed zone of the hall, shown only
while such sessions exist.*

## Why

Throwaway sessions (Geneseed's `tests/skill_triggers.mjs` runs `claude -p` four at a time in
`%TEMP%\gs-triggers-XXXXXX\out`; Claude's scratchpads live in `%TEMP%\claude\…`) show up as ordinary departments
with meaningless names ("out"), crowd the refectory and flood the Chronicon with arrivals and departures. They are
worth seeing (what is running, what it costs), but apart from real work.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How physical | A fenced zone inside the scriptorium (floor, low fence, gate, plaque), not a walled room. Present only while temp sessions exist. |
| 2 | Where | Packed last, after every normal department, in the hall and in the strip. Overflow takes temp sessions first. |
| 3 | Grouping | Sub-blocks per temp folder inside one fence; the fence carries the world's room name. |
| 4 | Sub-block name | `Temp\claude\<encoded project>\…` → `<Project> (scratch)`; else the first folder under Temp with a trailing mkdtemp suffix (`-` + 6 chars) dropped (`gs-triggers`). |
| 5 | Movement | Confined: in by the hall gate and the zone gate, idle at their own desk; no refectory, no cogitator. Only a petition leaves (Magos queue as usual). |
| 6 | Noise | No `arrived` / `left` / `compaction` events, no `stale` / `limit` toasts. Petitions still log and toast. Tokens still counted, under the sub-block name. |
| 7 | Look | One room concept per world (table below); the sign is the plaque text, not a sprite. |
| 8 | Views | Floor in the rug pass (39° projects it); low face-based fence in Flat and 39°; strip: floor band, end posts, gate on the left end. |
| 9 | Setting to hide | None. |
| 10 | Lifetime | The zone exists while its blocks do: appears with the first temp desk, fades out with the last one's empty-desk grace and the blocks' glide. |

## Detection and naming (Rust, `registry/sessions.rs`)

- `is_temp(cwd)`: `cwd` is under `std::env::temp_dir()` (compare normalised, case-insensitive on Windows).
- `temp_dept(cwd)`: the relative path under the temp dir, first segment `s`:
  - `s == "claude"` and a second segment exists: the project is the last `-`-separated piece of that encoded
    segment → `"<Project> (scratch)"`. Known limit: a project name containing `-` keeps only its last piece.
  - else `s` with a trailing `-` + exactly 6 alphanumerics removed.
- The session record gains `temp: bool`; `dept` is `temp_dept(cwd)` when temp, `dept_of(cwd)` otherwise.

## Layout (`ui/layout.js`, `ui/strip.js`)

- Departments are ordered normal first, temp last (stable within each group), before either packer runs.
- The packers return, beside `blocks`, a `zone`: the bounding rectangle of the temp blocks (padded for the fence),
  with its gate point on the corridor side (hall) or left end (strip); `null` without temp blocks.
- Consoles (subagents) stay in their parent's block, so they are fenced in too.
- Overflow already drops whatever does not fit from the end, so temp departments go first.

## Behaviour (`ui/actors.js`)

- Routes into a temp desk pass the zone gate. Idle temp scribes stay seated (existing seated frames); they never
  take refectory or cogitator spots.
- A petition sends them to the Magos queue as any scribe; answered, they walk back through the zone gate.

## Noise (`src-tauri/src/chronicle.rs`, toasts in `ui/`)

- Skip `arrived`, `left`, `compaction` for temp sessions; keep `petition` / `petition-answered`.
- Toasts: only petitions for temp sessions.
- Token usage is added as today, keyed by the sub-block name.

## Drawing

- **Floor**: the world's `zone` floor tile fills the zone rectangle in the rug pass (`drawRugs`), so the 39° view
  gets it projected.
- **Fence**: low (about a third of a scribe's height) posts and rails around the rectangle, the gate opening on the
  corridor side. In 39° the rails are face-based items depth-sorted with the other props. A low fence hides no
  scribe and no paper pile.
- **Strip**: the floor band under the zone's lecterns, a post at each end, the gate at the left end.
- **Plaques**: one outer plaque with the world's room name (a `zone` string per theme in `ui/themes.js`, base in
  `ui/theme.js`), one per sub-block as today.
- **Lifetime**: floor, fence and outer plaque fade with the blocks' glide; nothing is drawn when `zone` is `null`.

## Art: one `zone` family per world

Frames: floor tile, post, rail, gate. Every world's frames are a new design (no recolour of the 40k art).

| | World | Room name | Look |
|---|---|---|---|
| A | Ordo Administratum | Menial Pen | grated iron floor, low railing, slate tally board |
| B | Ordo Machinum | Servitor Pen | hazard-chevron floor, cable fence, cog sigil |
| C | Ordo Xenos | Containment Cell | glowing floor grid, stasis-field posts |
| D | Ordo Malleus | Warded Circle | hexagrammic ward on the floor, candle posts |
| E | Ordo Hereticus | Penitent Cage | flagstones, iron bars, chained tome |
| F | Neon Grid | Sandbox | wireframe floor, laser fence |
| G | Orbital Station | Quarantine Bay | airlock hazard stripes, glass partition |
| H | Corpo Tower | Temp Pool | grey carpet tiles, glass hot-desk partitions, "TEMPS" lanyard sign |
| I | Rain City | Back Alley | wet asphalt, chain-link fence, flickering sign |
| J | Green Code | The Construct | bare white loading-program void |
| K | Sunset Drive | Arcade Corner | checkered floor, velvet rope, marquee |
| L | Arcane Tower | Summoning Circle | chalk circle, rune stones |
| M | Vault 111 | Test Chamber | Vault-Tec experiment cell, observation-glass fence, "EXPERIMENT IN PROGRESS" |

## Tests

- Rust: `is_temp` / `temp_dept` — gs-triggers path (suffix dropped), scratchpad path (`Administratum (scratch)`),
  a path outside Temp unchanged, a temp folder without suffix kept whole.
- `layout.test.mjs`, `strip.test.mjs`: temp blocks packed after normal ones; overflow drops them first; `zone` is
  their padded bounds, `null` without them.
- Chronicle: a temp session's arrival emits nothing, its petition still does.
- `art.test.mjs`, `sprites.test.mjs`: the `zone` family exists in every world; galleries regenerated.

## Build order

Each step ships on its own:

1. Detection, naming and noise (Rust).
2. Layout: temp last, `zone` rectangle.
3. Behaviour: confinement.
4. Drawing with placeholder art (one shared `zone` family).
5. The 13 worlds' `zone` art.
