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

## Design (architect pass 2026-11-08; Rulings reversible unless marked)

Generalises the break-out room: one zone becomes a list of zones. Facts: `settings::validate` (`settings.rs:37`)
allows primitive values only, file capped at 16 KiB; the sash slot `y` of `ui/art/key.gpl` is already recoloured per
department via `blit(..., over)` and the 39° `paint(buf, over)`; `breakoutOf` / `route` / `lanesOf`
(`ui/layout.js:212-260`) handle one zone; the roster merges at `main.rs:388-392`; `regex 1.13.1` is in `Cargo.lock`
as a transitive dependency.

**Matching (Rust).** New `src-tauri/src/rooms.rs`, run once per tick after the roster merge (`main.rs:392`, demo
included):
```rust
pub const MAX_RULES: usize = 6; pub const MAX_PATTERN: usize = 200;
pub struct Rule { pub id: String, pub re: regex::Regex }
pub fn glob_to_regex(glob: &str) -> String;                     // anchored
pub fn compile(pattern: &str) -> Result<regex::Regex, String>;  // glob, or `re:` + regex; Err on empty, > 200, invalid
pub fn rules_from(settings: &serde_json::Value) -> Vec<Rule>;   // parses adm.rooms; skips bad entries; first 6
pub fn norm(cwd: &str) -> String;                               // `\` -> `/`, trailing `/` trimmed
pub fn room_of(cwd: &str, rules: &[Rule]) -> Option<String>;    // first matching rule's id
pub fn assign(roster: &mut [Session], rules: &[Rule]);          // temp sessions get None
pub fn set(rules: Vec<Rule>); pub fn get() -> Arc<Vec<Rule>>;   // compiled at setup and in settings_save (monitor's pattern)
#[tauri::command] fn rooms_test(pattern: String, cwds: Vec<String>) -> Result<Vec<bool>, String>;
```
`RegexBuilder::new(src).case_insensitive(true).size_limit(1 << 20)`. Glob → regex: `**/` → `(?:.*/)?`, trailing
`/**` → `(?:/.*)?` (so `**/git/Terra/**` also matches the Terra folder itself), other `**` → `.*`, `*` → `[^/]*`,
`?` → `[^/]`, the rest escaped; no `[...]` or `{a,b}`. `re:` runs on the normalised path, case-insensitive,
unanchored. Only `cwd` is matched (no worktree main-repo lookup).

**Session field.** `registry::Session` gains `room: Option<String>` (the rule id), set only by `assign`. A department's
room is the lowest-index rule among its live sessions' rooms (computed in `ui/app.js` `onRoster`); a department with
any temp session gets none.

**Settings.** One key `adm.rooms`: a JSON string holding `[{ id, name (≤ 32), pattern (≤ 200), color (#rrggbb) }]`
in rule order, at most 6. `id = 'r' + Date.now().toString(36)`, set once. Reset All leaves it alone. New
`ui/rooms.js`: `MAX_ROOMS`, `roomsOf(text)` (lenient parse, same caps), `rooms.list`, `setRooms(list)`,
`tintOf(color)` (cached `{ y: color }`).

**Layout.** `zoneSequence(depts, rooms)`: per room in rule order its departments, or one placeholder
`{ name: 'room:<id>', room, empty: true, ids: [], desks: [] }`, then the departments without a room; `planLayout`
gains `rooms` (temp still packs last). A placeholder takes one slot, no desk, no rug. A fresh slot row whenever the
zone key (`temp` / room id / null) changes and is not null on either side, so the fence (the zone's bounding box)
never takes in a neighbour. Rooms count toward compact lecterns and bays, placeholders included. In 39° a zone never
straddles the cogitator bank (it starts east of it if it fits in one row, else on row 1; this also fixes the
break-out room). `breakoutOf` becomes `zonesOf(blocks, H)` → `[{ kind: 'temp' | 'room', id, color, empty, x, y, w,
h, gates }]`; `lanesOf(p, blocks, LANES, corridorX, Zs)` lets a walker use its own zone's lane, every other zone is
solid. Call sites `scene.js:219`, `scene39.js:193`, `overlay.js:46` and the tests move to it.

**Strip.** `layoutStrip` uses `zoneSequence`; each room gets a leading cell `{ name: 'room:<id>', room, cell: true,
w: LEC_W }` carrying the plaque, its departments follow; `breakoutOfStrip` becomes `zonesOfStrip(blocks)` (contiguous
blocks by zone key, 4 px pad, a gate at each end).

**Drawing.** Rule colour on key slot `y` via `blit(g, map, x, y, tintOf(color))` / `paint(buf, tintOf(color))`;
`fenceBox` cache key adds the colour. `breakoutFloor` / `breakoutFence` / `stripBreakout` become `zoneFloor` /
`zoneFence` / `stripZone`; frame prefix `BREAKOUT_` for temp, `ENCLAVE_` for rooms. Empty room: floor and fence at
`globalAlpha 0.5`, plaque class `dim`. Hall plaque `r:<id>` under the fence in the rule colour; sub-blocks keep their
own `b:` plaques.

**Settings tab Rooms.** Per rule: name, pattern, colour, ↑ / ↓, ✕, live line; "Add room" disabled at 6; a new rule
takes the first unused `T.sash` colour. Validation through `rooms_test` (debounced 200 ms): Err → red, `title` holds
the message, not saved; a new rule enters `adm.rooms` once its pattern first compiles. Live line at rest: departments
whose sessions carry `room === id`; while typing: the raw hits, `(→ <room>)` when an earlier rule takes one,
`(break-out)` for temp. `hooks` gains `roster()` and `roomsChanged()`. Remote view: every field disabled, live line at
rest only.

**Art.** Family `enclave` (not `ROOM_`, taken by the room tiles): `ENCLAVE_FLOOR, _RAIL, _SIDE, _POST, _GATE,
_GATE_OPEN, _GATE_FRONT, _GATE_FRONT_OPEN`, sizes derived from `BREAKOUT_SIZES` in `layout.js`. Files
`ui/art/enclave.*` (w40k base) and `ui/art/{cyber,orbital,tower,vault,darwin}/enclave.*`; `'enclave'` added to those
themes' `art`, to `PROP_SHEETS` and to `tools/sprite_catalog.mjs` (appended). Generator `tools/enclave_art.mjs` +
`tools/enclave_art/<world>.mjs` on `../breakout_art/kit.mjs`. Each world a new design, `y` is the dyed part: w40k
chapel annex (flagstones, `y` runner, carved balustrade, `y` banners); cyber corporate pod (dark floor, `y` LED trim,
frosted partitions); space lab module (white deck, `y` wayfinding stripe, padded rails); arcane library alcove (oak
boards, `y` rug border, bookcase-end posts, `y` tasselled rope); vault department wing (linoleum, painted `y` floor
line, steel cubicles, `y` placards); darwin specimen gallery (encaustic tiles, `y` border, mahogany rails, `y` velvet).

**Failures.** Invalid pattern: red, the last valid one stays in force. Bad hand-edited entries or corrupt JSON:
dropped, the rest of settings intact. Two rules match: first wins, the live line shows it. One department in two
rooms: lowest rule takes it. Rule deleted or reordered: ids stable, the glide eases the move. Past `MAX_BAYS`:
placeholders not drawn, overflow counts live sessions only. ReDoS: linear-time `regex`, 1 MiB size limit, 200 chars.

**Tests.** Rust `rooms.rs`: glob cases (`**/git/Terra/**` matches the folder, a subfolder and another case, not
`TerraX`; `*` stays in a segment; `.` `+` `(` literal), `re:` (case-insensitive, unanchored, `re:(` Err), empty and
201 chars Err, `rules_from` (bad JSON, bad entries, order, cap), first match wins, temp gets None, OpenCode gets its
room, `rooms_test`, `validate` accepts `adm.rooms`. `layout.test.mjs`: rule order whatever the arrival order;
placeholder survives; fresh rows; zones disjoint; a room scribe crosses its fence only at a gate; a normal walk never
enters a room; reorder moves rooms; deleted rule → normal; temp still last; shrink probe; 39° bank clear.
`strip.test.mjs`, `overlay.test.mjs` (`r:<id>` plaque, `dim`), `settings.test.mjs` (`roomsOf`, an invalid draft never
written), `art.test.mjs` (`ENCLAVE_*` complete in every theme, contains `y`, each world's mask differs from its
`BREAKOUT_*` mask and from the base sheet: a copy or recolour goes red), `sprites.test.mjs`, galleries, `art_gate`.

**Build order.** Rust match + field → layout, zones, routes → Settings tab → drawing with the base art → strip →
the five world sheets.

## O10c — the west wing (user, 2026-11-08; supersedes O10b and the zone placement)

The user tried O10b in the app and asked for "the same walls as elsewhere" and rooms **outside** the scriptorium
(Q28 = west wing). Binding:
1. **Place.** A west wing: a column of real rooms west of the scriptorium, mirror of the Refectorium/Sanctum column
   on the east. Rooms stacked top to bottom in rule order. The wing exists only while at least one rule exists; the
   hall widens by its width then (the scriptorium keeps its own width rules).
2. **Walls and doors.** Exactly the hall's own: the same wall art and thickness as the scriptorium's east wall and
   the east column's rooms, the same doors (each world's existing frames, animated as the Sanctum's and Refectorium's),
   in flat and 39° (cut away low like every inner wall, doorway = posts as the hall's own). Each room has one door in
   the scriptorium's west wall; routing through it like `DOORWAY` in `ui/layout.js`.
3. **Inside.** A room holds the desks (and consoles) of its departments, one sub-block per department; the floor in
   the rule colour (`ENCLAVE_FLOOR`). Scribes behave as everywhere (refectory, cogitator, Sanctum, gate), leaving and
   entering through the room's door.
4. **Size.** A room's height follows what it holds (at least one desk row); an empty room keeps one row, floor dimmed,
   door shut. When the wing is taller than the hall, the hall grows down (bays) as today; rooms count toward compact
   lecterns like any block.
5. **Plaques.** One department in the room: one plaque on the room's top wall with that department's name and branch,
   in the rule colour, and no department plaque inside. Several: the room name on top, department plaques inside.
   Empty: the rule's name, dimmed.
6. **Unchanged.** The break-out room (fenced zone in the scriptorium), the strips (a room is a bay there, as today),
   the column view (no rooms), the Rooms settings tab, rule matching in Rust.
7. **Removed.** Rooms as fenced zones inside the scriptorium (the room path of `zonesOf`). `zoneSequence` keeps its
   placeholders for empty rooms: they hold an empty wing room's place (and the strip's empty bay). The enclave fence
   frames stay generated only if the strip still draws them.
8. **Tests.** Walkers enter and leave rooms only through their doors; doors open while someone is on the frame; walls
   never cover a desk, seat, queue slot or prop; rooms in rule order whatever the arrival order; an empty room keeps
   its place; a live department is never pushed into overflow by an empty room; break-out room and strips unchanged;
   flathall/isohall hashes re-recorded only after looking at the hall (the wing changes the static background).
9. **Full height and centred doors (user, 2026-11-09: "could the rooms take the full height? and the door be in the
   middle").** Supersedes the heights in point 4 and the door places in the plan.
   1. The rooms share the wing's full height, from under the back wall to the hall's floor bottom (the
      scriptorium's own bottom, bays included). Each room gets at least the rows its desks need; the hall's spare
      rows go to the rooms evenly, the last room taking any remainder. No dark band above the first room or below
      the last.
   2. Each room's door is centred vertically on its east wall (the scriptorium's west wall). Inside the room, the
      room's corridor and lanes join the door to its desk lanes. On the hall side, the door's lane joins the
      scriptorium's corridor network as before.
   3. The desks stay packed from the room's top.
   4. Everything else in O10c is unchanged: walls, dividers, plaques, empty rooms, break-out room, strips, column.
   The routing gates hold: walkers cross the west wall only through doors, never walk inside a wall, and a door is
   open while someone is on its frame.
   Decisions made in the implementation:
   - The rooms stay on the scriptorium's slot-row grid. The spare height is shared in whole rows. The last room also
     takes the floor under the last row, down to the hall's bottom.
   - "Centred" means the scriptorium lane whose door centre (the frame is lane - 18 .. lane + 2) is nearest the
     room's vertical middle; on a tie, the lower lane. The error is at most half a row (32 px). A new lane at the
     exact middle would cross the scriptorium's desks, so the door uses an existing lane. Each lane in a room's
     band is a scriptorium lane, so no lane is added. A one-row room has lanes only at its top and bottom, so its
     door is at one of these.
   - The break-out room is packed exactly as before (b8927f1): it starts below the lane under the last room's first
     desk row, the rooms counted on their desk rows alone. Its level and overflow are those of b8927f1 (coordinator
     probe: 1800 cases, overflow and level never higher or lower). The doors give way to it instead (coordinator
     ruling, 2026-11-09): each room's door is the lane nearest its middle that the fence does not take in, else the
     nearest such lane of the room. A door is a layout output (`wing[].door`) that `hallOf` takes.
   - When the even share would leave a room with every lane inside the fence, the share is capped so that every
     room starts above the fence (`wing[].share`). The last room takes the rest. `hallOf` remains the only writer of
     the row split.
   - When a room loses rows under a scribe (the spare rows shared out again), the scribe moves to the room's
     nearest lane. A scribe in the west wall, crossing a door, moves to that door's new hall side (`Cast.resized`).

## O10b — real rooms: walls and a door (user, Q27 = A, 2026-11-08) — superseded by O10c

Supersedes decision 6's fence: a room is a real walled room in the same place (rooms first, rule order, packing,
routes and lanes unchanged).
- **Walls.** The fence (`ENCLAVE_RAIL / _SIDE / _POST`) is replaced by the hall's own interior wall, the one the
  scriptorium and the Sanctum/Refectorium already draw, in each world's existing art (Ruling: no new wall art — each
  world's walls are already its own design). In 39° the room's walls are cut away low like every inner wall, the
  doorway keeping its posts and lintel.
- **Door.** The gate becomes a real door from the existing `room-doors` art of the world (closed / half / open, `halfOf`),
  opening as a scribe approaches and closing behind it, exactly like the Sanctum's doors. One door per lane, on the
  corridor side, where the gate was.
- **Floor and colour.** The room keeps its `ENCLAVE_FLOOR` in the rule colour; the plaque stays on the room's top wall.
  An empty room: floor dimmed, door closed.
- **Break-out room.** Unchanged (fence and gate).
- **Strip.** Unchanged (a bay; the strip has no walls).
- **Tests.** A walker enters and leaves only through the door; the door is open while a walker crosses it and closed
  otherwise; walls never cover a desk, a seat or a queue slot; art: a room draws the world's wall and door frames;
  `flathall` / `isohall` hashes re-recorded only after looking at the hall.

**Accepted by the user (2026-11-08).** The new direct dependency `regex = "1"` (no new crate: 1.13.1 already
locked); capacity: each room owns a full row band, at most 6 rules, empty rooms keep the hall compact or grown.
