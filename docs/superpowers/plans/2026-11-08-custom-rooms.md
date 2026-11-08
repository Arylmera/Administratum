# Custom rooms (O10) — vertical-slice plan

Spec (binding): `docs/superpowers/specs/2026-11-08-custom-rooms-design.md`. Each slice ends green on
`cargo test`, `cargo clippy --tests -- -D warnings` and every `node ui/*.test.mjs`.

## Call sites this change breaks (grepped before the start)

- `Session {` literals without `..Default::default()`: only `src-tauri/src/registry/sessions.rs` (the scan's
  literal) gains `room: None`. Every other literal ends in `..Default::default()` or `..tests_session(..)`.
- `breakoutOf`: `ui/layout.js` (`route`), `ui/scene.js:229`, `ui/scene39.js:193`, `ui/overlay.js:51`,
  `ui/layout.test.mjs:447, 452, 459`.
- `breakoutOfStrip`: `ui/scene.js:229`, `ui/strip.test.mjs:96, 100`.
- `src-tauri/Cargo.lock`: `regex` joins administratum's own dependency list (one line, already locked at 1.13.1).
- `tools/sprite_catalog.mjs`: its generic `MAPS` loop would list `ENCLAVE_*` in the middle; it skips them and the
  family is appended at the end.

## Slices

1. **Rust match + field.** `regex = "1"` in `Cargo.toml`; `src-tauri/src/rooms.rs` (glob, `re:`, `rules_from`,
   `norm`, `room_of`, `assign`, `set`/`get`, `rooms_test`); `Session.room`; `main.rs`: `mod rooms`, rules set at
   setup and in `settings_save`, `assign` once per tick after the roster merge (demo included), `rooms_test`
   registered. Tests in `rooms.rs`.
2. **Layout, zones, routes.** `ui/rooms.js` (`MAX_ROOMS`, `roomsOf`, `rooms`, `setRooms`, `tintOf`); `layout.js`
   `zoneSequence`, `planLayout(…, rooms)`, fresh row on a zone-key change, the placeholder slot, the 39° bank rule,
   `zonesOf`, multi-zone `lanesOf`; `app.js` computes each department's room and passes `rooms.list` (none in the
   column). Tests in `layout.test.mjs`.
3. **Settings tab Rooms.** `index.html` section and tab; `settings.js` rows, `rooms_test` validation (200 ms),
   live line, remote read only; `hooks.roster()`, `hooks.roomsChanged()`. Tests in `settings.test.mjs`.
4. **Drawing with the base art.** `tools/enclave_art.mjs` + `tools/enclave_art/tier2.mjs` (the w40k chapel
   annex) → `ui/art/enclave.*`; `'enclave'` in `PROP_SHEETS`; `scene.js` `zoneFloor` / `zoneFence`, `scene39.js`
   per-zone fences tinted (`fenceBox` key adds the colour); empty room at alpha 0.5; `overlay.js` `r:<id>` plaque,
   `dim`. Tests in `overlay.test.mjs`, `art.test.mjs`, `sprites.test.mjs`.
5. **Strip.** `layoutStrip` leading cell per room, `zonesOfStrip`, `stripZone`. Tests in `strip.test.mjs`.
6. **The five world sheets.** `tools/enclave_art/{cyber,orbital,tower,vault,darwin}.mjs`, `'enclave'` in those
   themes' `art`, `tools/sprite_catalog.mjs` appended, galleries regenerated, `node tools/art_gate.mjs`.
7. **Docs and proof.** `README.md`, `docs/DEVELOPMENT.md`, one note in the break-out spec; screenshots from
   `tools/preview.html` with an injected roster and `adm.rooms` in the page's own storage.

## Column (O9)

The desktop column gets no rooms in this change: `planLayout` is called with no rooms there, so a room's
departments are ordinary floors, in arrival order (spec: one floor per room, later).
