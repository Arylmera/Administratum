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

**Open for the user.** The new direct dependency `regex = "1"` (no new crate: 1.13.1 already locked); capacity
(each room owns a full row band, so at most 6 rules, and empty rooms keep the hall compact or grown).
