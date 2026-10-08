# Break-out Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions whose working directory is under the temp folder sit in a closed, per-theme "break-out room" of
the hall: their own sub-blocks, fenced, entered by a gate, quiet in the Chronicon and toasts.

**Architecture:** Rust tags each session `temp` and names its department after its temp folder. The JS layout packs
temp departments last on a fresh slot row; one pure function (`breakoutOf`) derives the fenced rectangle and its
gates from the blocks, used by routing (the rectangle is solid to everyone else), drawing (flat, 39°, strip) and the
plaques. Art is a new `breakout` family, one sheet per theme.

**Tech Stack:** Rust (Tauri backend, `cargo test`), plain ES modules in `ui/` with `node` assert tests, PNG sheets in
the key palette (`ui/art/key.gpl`) written by `tools/sheet_writer.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-08-break-out-room-design.md`.

## Global Constraints

- A session is temp when its cwd is under `std::env::temp_dir()` (separators normalised, case-insensitive).
- Temp sub-block name: `Temp\claude\<encoded project>\…` → `"<Project> (scratch)"` (last `-` piece of the encoded
  segment); else the first folder under Temp, minus a trailing `-` + 6 alphanumerics holding a digit or both cases.
- Temp sessions: no `arrived` / `left` / `compaction` events; no stale-petition or limit toast or emit. Petitions
  (toast, chime, event) and token counting unchanged.
- Temp scribes: never nap in the refectory, never walk to the cogitator, compaction is the puff (no brazier).
- The zone is solid to every walk end outside it; walks from or to inside it use only its lanes and cross the fence
  at a gate (east side, one per zone lane).
- Frame contract, art px (`BREAKOUT_SIZES`): `BREAKOUT_FLOOR` 16×16, `BREAKOUT_RAIL` 16×10, `BREAKOUT_SIDE` 4×16,
  `BREAKOUT_POST` 6×14, `BREAKOUT_GATE` 4×16, `BREAKOUT_GATE_OPEN` 16×10, `BREAKOUT_GATE_FRONT` 16×20,
  `BREAKOUT_GATE_FRONT_OPEN` 16×20.
- Every theme's art is its own new design (never a recolour of the 40k art); a theme's own folder wins over the
  folder it borrows (`artOf`).
- Code style: match the surrounding code (dense one-line comments, `ponytail:` comments for deliberate shortcuts).
- After each task: commit and push (`git push`). After Tasks 2, 6, 9 and each art task: rebuild and silently
  reinstall the NSIS build (see "Rebuild and reinstall" at the end).
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml` and `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`.

## File Structure

| File | Change |
|---|---|
| `src-tauri/src/registry/sessions.rs` | `temp_dept()`, `scan` sets `temp` and the temp `dept` |
| `src-tauri/src/registry/mod.rs` | `Session.temp` |
| `src-tauri/src/chronicle.rs` | `lifecycle` quiet for temp sessions |
| `src-tauri/src/main.rs` | stale and limit toasts/emits skip temp sessions |
| `ui/layout.js` | `planLayout` temp-last order, forced row, `temp` on blocks, `breakoutOf`, solid zone in `route`, `BREAKOUT_SIZES` |
| `ui/strip.js` | `temp` on blocks, room for the last gate, `breakoutOfStrip` |
| `ui/actors.js` | confinement (nap, cogitator, compaction) |
| `ui/app.js` | `temp` on departments, the zone's outer plaque |
| `ui/sprites.js` | `breakout` prop family, theme's own folder first |
| `ui/scene.js` | `breakoutFloor`, `breakoutFence`, `stripBreakout` |
| `ui/scene39.js` | floor and fence in 39° |
| `ui/theme.js`, `ui/themes.js` | `breakout` room name per theme; `art: ['breakout']` per theme |
| `tools/breakout_art.mjs`, `tools/breakout_art/<id>.mjs` | the art generator and one frame file per theme |
| `tools/sprite_catalog.mjs` | descriptions and the theme-own source of the new frames |
| `ui/art/breakout.*`, `ui/art/<id>/breakout.*` | the sheets |
| tests | `sessions.rs`, `chronicle.rs`, `ui/layout.test.mjs`, `ui/strip.test.mjs`, `ui/art.test.mjs` |

---

### Task 1: Temp detection and naming (Rust)

**Files:**
- Modify: `src-tauri/src/registry/mod.rs` (struct `Session`)
- Modify: `src-tauri/src/registry/sessions.rs` (new `temp_dept`, `scan`, tests)

**Interfaces:**
- Produces: `pub fn temp_dept(cwd: &str, root: &str) -> Option<String>` in `registry::sessions`;
  `Session.temp: bool`, serialised as `temp` (the frontend reads `s.temp`); a temp session's `dept` is the temp name.

- [ ] **Step 1: Write the failing test** — add to the `tests` module of `sessions.rs`, after `dept_is_last_path_segment`:

```rust
    #[test]
    fn temp_dept_names_the_break_out_room() {
        let root = r"C:\Users\guill\AppData\Local\Temp";
        assert_eq!(temp_dept(r"C:\Users\guill\AppData\Local\Temp\gs-triggers-PV9zh9\out", root).as_deref(), Some("gs-triggers"));
        assert_eq!(
            temp_dept(r"C:\Users\guill\AppData\Local\Temp\claude\C--Users-guill-Documents-git-Administratum\5704\scratchpad", root).as_deref(),
            Some("Administratum (scratch)")
        );
        // no random suffix (no digit, one case): kept whole; separators and case don't matter, nor a trailing slash
        assert_eq!(temp_dept("c:/users/guill/appdata/local/temp/build-output", r"C:\Users\guill\AppData\Local\Temp\").as_deref(), Some("build-output"));
        assert_eq!(temp_dept(r"C:\Users\guill\AppData\Local\Temp\claude", root).as_deref(), Some("claude"));
        assert_eq!(temp_dept(r"C:\Users\guill\Documents\git\Terra", root), None);
        assert_eq!(temp_dept(root, root), None);
        assert_eq!(temp_dept(r"C:\Users\guill\AppData\Local\TempX\a", root), None);
        assert_eq!(temp_dept("/tmp/gs-triggers-a1b2c3/out", "/tmp").as_deref(), Some("gs-triggers"));
    }
```

- [ ] **Step 2: Run it, expect a compile failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml temp_dept`
Expected: FAIL, `cannot find function temp_dept`.

- [ ] **Step 3: Implement** — in `sessions.rs`, after `folder_of`:

```rust
/// The break-out room's name for a session under the temp folder `root` (std::env::temp_dir()), else None: Claude's
/// scratch `<root>\claude\<encoded project>\…` is "<Project> (scratch)" (the encoded path's last `-` piece: a project
/// named with a `-` keeps only its tail), any other its first folder under `root`, a mkdtemp suffix dropped.
pub fn temp_dept(cwd: &str, root: &str) -> Option<String> {
    let (cwd, root) = (cwd.replace('/', "\\"), root.replace('/', "\\"));
    let root = root.trim_end_matches('\\');
    if !cwd.get(..root.len())?.eq_ignore_ascii_case(root) {
        return None;
    }
    let mut segs = cwd[root.len()..].strip_prefix('\\')?.split('\\').filter(|s| !s.is_empty());
    let first = segs.next()?;
    if first.eq_ignore_ascii_case("claude") {
        if let Some(enc) = segs.next() {
            return Some(format!("{} (scratch)", enc.rsplit('-').next().unwrap_or(enc)));
        }
    }
    // mkdtemp's 6 random characters: alphanumeric, with a digit or both cases (so "build-output" stays whole)
    let random = |t: &str| {
        t.len() == 6
            && t.chars().all(|c| c.is_ascii_alphanumeric())
            && (t.chars().any(|c| c.is_ascii_digit()) || (t.chars().any(|c| c.is_ascii_uppercase()) && t.chars().any(|c| c.is_ascii_lowercase())))
    };
    Some(match first.rsplit_once('-') {
        Some((head, tail)) if !head.is_empty() && random(tail) => head,
        _ => first,
    }
    .to_string())
}
```

In `mod.rs`, struct `Session`, after `pub dept: String,`:

```rust
    /// Its cwd is under the temp folder: it sits in the break-out room and `dept` is the temp folder's name (temp_dept).
    pub temp: bool,
```

In `scan` (`sessions.rs`), before the `for entry in entries.flatten()` loop:

```rust
    let temp_root = std::env::temp_dir().to_string_lossy().into_owned();
```

and in the `out.sessions.push(Session { … })` literal replace `dept: dept_of(&rec.cwd),` with:

```rust
            dept: temp_dept(&rec.cwd, &temp_root).unwrap_or_else(|| dept_of(&rec.cwd)),
            temp: temp_dept(&rec.cwd, &temp_root).is_some(),
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass (other `Session` literals use `..Default::default()`; if one does not compile, add `temp: false`).

- [ ] **Step 5: Format, commit, push**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/registry/sessions.rs src-tauri/src/registry/mod.rs
git commit -m "Break-out room: temp-folder sessions tagged temp, named after their temp folder"
git push
```

---

### Task 2: The quiet room (Rust)

**Files:**
- Modify: `src-tauri/src/chronicle.rs` (`lifecycle`, test `lifecycle_events_between_rosters`)
- Modify: `src-tauri/src/main.rs` (poll loop: stale petitions, limit waves)

**Interfaces:**
- Consumes: `Session.temp` (Task 1).

- [ ] **Step 1: Write the failing test** — in `chronicle.rs`, add after `lifecycle_events_between_rosters`:

```rust
    #[test]
    fn lifecycle_is_quiet_for_the_break_out_room() {
        let s = |id: &str, status: &str, comp: Option<i64>| Session { status: status.into(), compacted_at: comp, temp: true, ..crate::registry::tests_session(id) };
        let prev = [s("old", "idle", None), s("c", "busy", Some(1))];
        let now = [s("c", "busy", Some(2)), s("new", "waiting", None)];
        let got: Vec<(String, String)> = lifecycle(&prev, &now, 1).into_iter().map(|e| (e.session_id, e.kind)).collect();
        assert_eq!(got, [("new".to_string(), "petition".to_string())], "a temp petition still logs; arrivals, departures, compactions don't");
    }
```

- [ ] **Step 2: Run it, expect failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml lifecycle_is_quiet`
Expected: FAIL (arrived, compaction and left events present).

- [ ] **Step 3: Implement** — in `lifecycle`, three guards:

```rust
            None => {
                if !s.temp {
                    out.push(ev(s, "arrived", s.cwd.clone()));
                }
                if waiting {
                    out.push(ev(s, "petition", ask(s)));
                }
            }
```

```rust
                if !s.temp && s.compacted_at.is_some() && s.compacted_at != p.compacted_at {
                    out.push(ev(s, "compaction", String::new()));
                }
```

```rust
    out.extend(prev.iter().filter(|p| !p.temp && !now.iter().any(|s| s.id == p.id)).map(|p| ev(p, "left", String::new())));
```

Update the doc comment above `lifecycle` to end: `… compaction (none of arrived, left, compaction for the break-out room's temp sessions).`

In `main.rs` `poll_loop`, the stale loop becomes:

```rust
            for s in tracker.stale_petitions(&roster, now_ms + shift) {
                if s.temp {
                    continue; // the break-out room is quiet: a temp petition toasts once, never as stale
                }
                let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
                petition_toast(&app, &s, toast::fill(&words.stale, &s.name), body);
                emit(&app, "petition-stale", &s);
            }
```

and the body of `for wave in tracker.new_limits(&roster) {` becomes:

```rust
                    let reset = wave[0].limit.as_ref().and_then(|l| l.reset_ms);
                    let time = reset.map_or_else(|| "later".to_string(), toast::hhmm);
                    let loud: Vec<&Session> = wave.iter().filter(|s| !s.temp).collect(); // the break-out room seals in silence
                    if !quiet && !loud.is_empty() {
                        let names: Vec<&str> = loud.iter().map(|s| s.name.as_str()).collect();
                        let body = if loud.len() == 1 { format!("{} · {}", loud[0].dept, loud[0].limit.as_ref().map_or("", |l| l.text.as_str())) } else { names.join(", ") };
                        let _ = app.notification().builder().title(toast::limit_title(&words, &names, &time)).body(body).show();
                    }
                    if !loud.is_empty() {
                        emit(&app, "limit", loud.len());
                    }
                    for s in &wave {
                        limit_events.push(Event { ts: now_ms, kind: "limit".into(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: None, detail: time.clone() });
                    }
```

(If `wave` holds `&Session` rather than `Session`, use `.copied()` before `.filter`; keep the type the compiler wants.)

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass.

- [ ] **Step 5: Format, commit, push, rebuild and reinstall**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/chronicle.rs src-tauri/src/main.rs
git commit -m "Break-out room: no arrivals, departures, compactions, stale or limit toasts for temp sessions"
git push
```

Then "Rebuild and reinstall". Check in the installed app that a temp session (for example run
`claude -p "say hi"` from a folder under `%TEMP%`) shows under its temp folder's name, not "out".

---

### Task 3: Temp departments pack last on a fresh row; the zone

**Files:**
- Modify: `ui/layout.js` (`layoutDepartments`, `planLayout`, new `breakoutOf`)
- Modify: `ui/app.js` (`onRoster`: `temp` on each department)
- Test: `ui/layout.test.mjs`

**Interfaces:**
- Consumes: `s.temp` on roster sessions (Task 1).
- Produces: departments may carry `temp: true`; blocks of temp departments carry `temp: true` (others no key);
  `export function breakoutOf(blocks, H)` → `null` or `{ x, y, w, h, gates: [{ x, y }] }` (logical px; `gates` one per
  walk lane inside the zone, `x` its east edge).

- [ ] **Step 1: Write the failing test** — append to `ui/layout.test.mjs` (add `breakoutOf` to the import from
  `./layout.js`):

```js
// break-out room: a temp department that arrived first still packs last, on a fresh row, fenced off
{
  const dept = (name, n, temp) => ({ name, color: '#ffffff', ids: ids(name, n), ...(temp && { temp }) });
  let P = planLayout(null, [dept('out', 2, true)], 0);
  P = planLayout(P, [dept('out', 2, true), dept('Terra', 3)], 1);
  assert.deepEqual(P.blocks.map(b => [b.name, !!b.temp]), [['Terra', false], ['out', true]]);
  const [terra, out] = P.blocks, H0 = hallOf(P.bays);
  assert.equal(out.x, terra.x); // a fresh row, not beside Terra
  assert.ok(out.y > terra.y);
  const Z = breakoutOf(P.blocks, H0);
  assert.ok(terra.y + terra.h < Z.y && H0.lanes.some(l => l > terra.y + terra.h && l < Z.y)); // Terra's lane stays outside
  assert.ok(Z.x <= out.x && Z.y > out.y - 1 && Z.x + Z.w < H0.corridorX && Z.y + Z.h < H0.aisleY);
  assert.deepEqual(Z.gates, H0.lanes.filter(l => l > Z.y && l < Z.y + Z.h).map(y => ({ x: Z.x + Z.w, y })));
  assert.equal(Z.gates.length, 1);
  assert.equal(breakoutOf([terra], H0), null);
}
```

- [ ] **Step 2: Run it, expect failure**

Run: `node ui/layout.test.mjs`
Expected: FAIL (`breakoutOf` is not exported).

- [ ] **Step 3: Implement**

In `layoutDepartments`: declare `inZone` with the other loop state:

```js
  let x = x0, y = y0, rowH = 0, overflow = 0, full = false, inZone = false;
```

then, inside the loop right after `const h = rows * SLOT_H - 8;` (before the `clearCog` line):

```js
    // the break-out room (temp departments, packed last by planLayout) starts on a row of its own
    if (d.temp && !inZone) { inZone = true; if (x > x0) { x = x0; y += (rowH || SLOT_H - 8) + 8; rowH = 0; } }
```

and the block push becomes:

```js
    blocks.push({ name: d.name, color: d.color, x, y, w, h, ...(d.temp && { temp: true }) });
```

In `planLayout`, inside `for (const p of plan) {` after `p.color = d?.color ?? p.color;`:

```js
    p.temp = d?.temp ?? p.temp ?? false;
```

and right after `plan = plan.filter(p => p.emptySince == null || now - p.emptySince < deptG);`:

```js
  plan.sort((p, q) => p.temp - q.temp); // stable: arrival order, the break-out room's departments last
```

Add after `planLayout` (before `roomOf`):

```js
// The break-out room: the rectangle fencing the temp blocks (packed last, from a fresh row) and its gates, null without
// any. West and top 2 px inside the blocks (the lane above stays outside), east 2 px out but west of the corridor,
// bottom 6 px under the last row so its lane is inside. A gate where each lane inside it meets the east (corridor) side.
export function breakoutOf(blocks, H) {
  const tb = blocks.filter(b => b.temp);
  if (!tb.length || H.strip) return null;
  const x = Math.min(...tb.map(b => b.x)) - 2, y = Math.min(...tb.map(b => b.y)) + 2;
  const x1 = Math.min(Math.max(...tb.map(b => b.x + b.w)) + 2, H.corridorX - 1), y1 = Math.max(...tb.map(b => b.y + b.h)) + 6;
  return { x, y, w: x1 - x, h: y1 - y, gates: H.lanes.filter(l => l > y && l < y1).map(l => ({ x: x1, y: l })) };
}
```

In `ui/app.js` `onRoster`, the department map gains `temp`:

```js
    .map(name => ({ name, color: colorOf(name), temp: roster.some(s => s.dept === name && s.temp), ids: roster.filter(s => s.dept === name && !napping.has(s.id)).map(s => s.id), helpers: consolesOf(name) }))
```

- [ ] **Step 4: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line (no existing layout changes without temp departments).

- [ ] **Step 5: Commit, push**

```bash
git add ui/layout.js ui/app.js ui/layout.test.mjs
git commit -m "Break-out room: temp departments packed last on a row of their own; breakoutOf"
git push
```

---

### Task 4: Routes: the zone is closed, its gates the only way in

**Files:**
- Modify: `ui/layout.js` (`crosses`, `lanesOf` callers in `route`)
- Test: `ui/layout.test.mjs`

**Interfaces:**
- Consumes: `breakoutOf` (Task 3).
- Produces: `route(a, b, blocks, H)` unchanged in signature; blocks with `temp` now fence the zone.

- [ ] **Step 1: Write the failing test** — append inside a new block in `ui/layout.test.mjs`:

```js
// break-out room walks: nobody else ever sets foot in it; its scribes cross the fence only at a gate
{
  const dept = (name, n, temp) => ({ name, color: '#ffffff', ids: ids(name, n), ...(temp && { temp }) });
  const P = planLayout(planLayout(null, [dept('out', 2, true)], 0), [dept('out', 2, true), dept('Terra', 3)], 1);
  const H0 = hallOf(P.bays), Z = breakoutOf(P.blocks, H0);
  const inZ = p => p.x > Z.x && p.x < Z.x + Z.w && p.y > Z.y && p.y < Z.y + Z.h;
  const walk = (a, path) => { // every point along the path, 1 px apart
    const pts = [a];
    for (const q of path) { const p = pts.at(-1), n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)); for (let i = 1; i <= n; i++) pts.push({ x: p.x + (q.x - p.x) * i / n, y: p.y + (q.y - p.y) * i / n }); }
    return pts;
  };
  const tSeat = P.seats.get('Terra-0'), oSeat = P.seats.get('out-1');
  for (const [a, b] of [[ENTRY, tSeat], [tSeat, QUEUE_SLOTS[0]], [tSeat, REFECTORY_SPOTS[0]], [tSeat, COG_SPOTS[0]]])
    assert.ok(!walk(a, route(a, b, P.blocks, H0)).some(inZ), `${a.x},${a.y} -> ${b.x},${b.y} enters the zone`);
  for (const [a, b] of [[ENTRY, oSeat], [oSeat, QUEUE_SLOTS[0]], [oSeat, ENTRY]]) {
    const pts = walk(a, route(a, b, P.blocks, H0));
    let crossings = 0;
    for (let i = 1; i < pts.length; i++) if (inZ(pts[i]) !== inZ(pts[i - 1])) {
      crossings++;
      assert.ok(Z.gates.some(q => Math.abs(pts[i].y - q.y) < 1 && Math.abs(pts[i].x - q.x) <= 1), `fence crossed at ${pts[i].x},${pts[i].y}`);
    }
    assert.equal(crossings, 1);
  }
}
```

- [ ] **Step 2: Run it, expect failure**

Run: `node ui/layout.test.mjs`
Expected: FAIL — a temp walk leaves through the bottom fence to the aisle, or a crossing away from a gate.

- [ ] **Step 3: Implement** — in `ui/layout.js`:

`crosses` learns solid rectangles:

```js
// A block is solid row by row: the 8 px gap under each of its slot rows holds a lane and is open. A `solid` one (the
// break-out room, to anyone outside it) is solid all through.
const crosses = (x, y0, y1, blocks) => blocks.some(b => x > b.x && x < b.x + b.w && (b.solid ? y0 < b.y + b.h && y1 > b.y :
  Array.from({ length: (b.h + 8) / SLOT_H }, (_, k) => b.y + k * SLOT_H).some(ry => y0 < ry + SLOT_H - 8 && y1 > ry)));
```

`lanesOf` gains the zone:

```js
// Lanes a hall point can step onto straight up or down without walking through a department block.
// Going down, the stretch to the first lane below is always clear (it's the point's own slot gap).
// Z (breakoutOf): a point inside the break-out room takes only its own lane in there (it leaves along it, through
// that lane's gate); a point outside sees the room as solid, so never steps onto one of its lanes.
function lanesOf(p, blocks, LANES, corridorX, Z) {
  if (p.x === corridorX) return [p.y];
  const inside = Z && p.x > Z.x && p.x < Z.x + Z.w && p.y > Z.y && p.y < Z.y + Z.h;
  const B = Z && !inside ? blocks.concat({ ...Z, solid: true }) : blocks;
  const first = LANES.find(y => y >= p.y);
  const out = LANES.filter(y => (y < p.y ? !crosses(p.x, y, p.y, B) : !crosses(p.x, first, y, B)));
  return inside ? out.filter(y => y > Z.y && y < Z.y + Z.h).slice(0, 1) : out;
}
```

In `route`, compute the zone once and pass it to both `lanesOf` calls:

```js
  const Z = breakoutOf(blocks, H);
  let best = null;
  for (const la of lanesOf(p, blocks, LANES, CORRIDOR_X, Z)) for (const lb of lanesOf(q, blocks, LANES, CORRIDOR_X, Z)) {
```

(`breakoutOf` is defined above `route` in the same module; `H.strip` never reaches `route`, the strip uses
`stripRoute`.)

- [ ] **Step 4: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line.

- [ ] **Step 5: Commit, push**

```bash
git add ui/layout.js ui/layout.test.mjs
git commit -m "Break-out room: the zone is solid to other walkers, its scribes go through its gates"
git push
```

---

### Task 5: The strip's break-out bay

**Files:**
- Modify: `ui/strip.js` (`layoutStrip`, new `breakoutOfStrip`)
- Test: `ui/strip.test.mjs`

**Interfaces:**
- Consumes: `planLayout` temp ordering (Task 3).
- Produces: strip blocks carry `temp: true`; `export function breakoutOfStrip(blocks)` → `null` or
  `{ x, y, w, h, gates: [{ x }, { x }] }` (gates at the bay's two ends).

- [ ] **Step 1: Write the failing test** — append to `ui/strip.test.mjs` (add `breakoutOfStrip` to the import from
  `./strip.js`):

```js
// the break-out bay: temp departments after the others, a floor band with a gate at each end, clear of the cogitator door
{
  const P = planLayout(null, [{ name: 'out', color: '#fff', ids: ['o1', 'o2'], temp: true }, { name: 'Terra', color: '#fff', ids: ['t1'] }], 0, {}, { w: 800, h: STRIP_H }, layoutStrip);
  assert.deepEqual(P.blocks.map(b => [b.name, !!b.temp]), [['Terra', false], ['out', true]]);
  const [terra, out] = P.blocks, Z = breakoutOfStrip(P.blocks), dCog = stripOf(800).doors[1];
  assert.ok(Z.x < out.x && Z.x + Z.w > out.x + out.w && Z.x > terra.x + terra.w);
  assert.deepEqual(Z.gates.map(g => g.x), [Z.x, Z.x + Z.w]);
  assert.ok(Z.x + Z.w + 4 <= dCog.x); // the east gate (8 wide, centred on its x) stays off the door
  assert.equal(breakoutOfStrip([terra]), null);
}
```

- [ ] **Step 2: Run it, expect failure**

Run: `node ui/strip.test.mjs`
Expected: FAIL (`breakoutOfStrip` not exported).

- [ ] **Step 3: Implement** — in `ui/strip.js` `layoutStrip`, the fit check keeps room for the bay's east gate and the
  block push tags temp:

```js
    if (full || x + w + (d.temp ? 12 : 0) > x1 + 1) { full = true; overflow += slotsOf.filter(k => k.id).length; continue; } // a temp block keeps room for the bay's east gate
    blocks.push({ name: d.name, color: d.color, x, y: FLOOR - 3, w, h: 5, ...(d.temp && { temp: true }) });
```

Add at the end of the file:

```js
// The break-out bay: the temp blocks' span (packed last by planLayout), 4 px either side, a gate at each end. The strip
// is one walkway, so everyone heading east goes through it: a fenced bay, not a closed room (no routing change).
export function breakoutOfStrip(blocks) {
  const tb = blocks.filter(b => b.temp);
  if (!tb.length) return null;
  const x = Math.min(...tb.map(b => b.x)) - 4, x1 = Math.max(...tb.map(b => b.x + b.w)) + 4;
  return { x, y: FLOOR - 3, w: x1 - x, h: 5, gates: [{ x }, { x: x1 }] };
}
```

- [ ] **Step 4: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line. If `Z.x + Z.w + 4 <= dCog.x` fails, raise the `12` reserve until it holds and say so in the commit.

- [ ] **Step 5: Commit, push**

```bash
git add ui/strip.js ui/strip.test.mjs
git commit -m "Break-out room: the strip's bay, temp blocks last with a gate at each end"
git push
```

---

### Task 6: Confinement

**Files:**
- Modify: `ui/actors.js` (`napping`, `destination`, `compacted`)
- Test: `ui/strip.test.mjs` (it already builds a `Cast`)

**Interfaces:**
- Consumes: `s.temp` on sessions.

- [ ] **Step 1: Write the failing test** — append to `ui/strip.test.mjs`:

```js
// break-out room scribes stay in: no refectory nap, no cogitator, a compaction is a puff (no brazier walk)
{
  const c = new Cast(), now = 10 ** 13, s = (id, temp) => ({ id, status: 'idle', sinceMs: 1, ...(temp && { temp }) });
  assert.deepEqual([...c.napping([s('t', true), s('n')], [{ x: 0, y: 0 }, { x: 1, y: 0 }], now)], ['n']);
  const a = { id: 't', s: { id: 't', status: 'shell', temp: true } };
  assert.equal(c.destination(a, new Map([['t', { x: 50, y: 60 }]]), [], ['t']).pose, 'desk');
  const b = { id: 'b', pose: 'desk', x: 50, y: 60, s: { id: 'b', temp: true } };
  c.compacted(b);
  assert.ok(b.puff > 0 && !b.burn);
}
```

- [ ] **Step 2: Run it, expect failure**

Run: `node ui/strip.test.mjs`
Expected: FAIL (`['t', 'n']` naps, or pose `cog`, or a `burn`).

- [ ] **Step 3: Implement** — in `ui/actors.js`:

`napping`'s `sleepy` filter gains `!s.temp`:

```js
    const sleepy = roster.filter(s => s.status === 'idle' && !s.temp && !s.background && !s.limit && !isQuestion(s) && s.sinceMs && now - s.sinceMs > NAP_MS()).sort((p, q) => p.sinceMs - q.sinceMs); // the break-out room dozes at its desks
```

`destination`'s cogitator line:

```js
    if (shell.includes(a.id) && !a.s.temp) return { ...COG_SPOTS[shell.indexOf(a.id) % COG_SPOTS.length], pose: 'cog' }; // the break-out room runs its shells at its desks
```

`compacted`'s first line:

```js
    if (a.pose !== 'desk' || this.hall.strip || a.s.temp) { a.puff = PUFF_S; return; } // no brazier in the strip, none for the break-out room
```

- [ ] **Step 4: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line.

- [ ] **Step 5: Commit, push, rebuild and reinstall**

```bash
git add ui/actors.js ui/strip.test.mjs
git commit -m "Break-out room: its scribes stay in (no nap, no cogitator, no brazier)"
git push
```

Then "Rebuild and reinstall". With a temp session running, check that its desk sits on a row of its own below the
others and that its scribe walks in along its lane from the corridor (no fence drawn yet).

---

### Task 7: The base art, the family, the room names

**Files:**
- Create: `tools/breakout_art.mjs`, `tools/breakout_art/tier2.mjs`, `ui/art/breakout.png`, `ui/art/breakout.json`
- Modify: `ui/layout.js` (`BREAKOUT_SIZES`), `ui/sprites.js` (family; theme's own folder first),
  `tools/sprite_catalog.mjs` (descriptions, source), `ui/theme.js` and `ui/themes.js` (`breakout` name per theme)
- Test: `ui/art.test.mjs`

**Interfaces:**
- Produces: `export const BREAKOUT_SIZES` in `ui/layout.js` (name → `[w, h]` art px); `MAPS.BREAKOUT_*` for the
  active theme; `t('breakout')` the active theme's room name.

- [ ] **Step 1: Write the failing test** — append to `ui/art.test.mjs` (add `import { BREAKOUT_SIZES } from './layout.js';`
  and `t` to the import from `./theme.js`):

```js
// the break-out room: every theme draws all of its frames, at the contract's sizes, and names its room
for (const id of Object.keys(THEMES)) {
  setTheme(id);
  for (const [n, [w, h]] of Object.entries(BREAKOUT_SIZES)) {
    assert.ok(MAPS[n], `${id}: ${n}`);
    assert.deepEqual([Math.max(...MAPS[n].map(r => r.length)), MAPS[n].length], [w, h], `${id}: ${n} size`);
  }
  assert.ok(t('breakout') && t('breakout') !== 'breakout', `${id}: room name`);
}
setTheme('tier2');
```

- [ ] **Step 2: Run it, expect failure**

Run: `node ui/art.test.mjs`
Expected: FAIL (`BREAKOUT_SIZES` not exported).

- [ ] **Step 3: Implement**

`ui/layout.js`, next to `breakoutOf`:

```js
// The break-out room's art contract (ui/art/breakout.*, ui/art/<theme>/breakout.*), art px: the floor tile; the rail,
// front-facing, tiled along the top and bottom edges (every rail face in 39°); the side, the east and west edges seen
// from above; the post (corners, beside each gate); a closed gate in the east side seen from above and its leaf swung
// open; the front-facing gate, closed and open (the strip's, and the 39° closed leaf).
export const BREAKOUT_SIZES = {
  BREAKOUT_FLOOR: [16, 16], BREAKOUT_RAIL: [16, 10], BREAKOUT_SIDE: [4, 16], BREAKOUT_POST: [6, 14],
  BREAKOUT_GATE: [4, 16], BREAKOUT_GATE_OPEN: [16, 10], BREAKOUT_GATE_FRONT: [16, 20], BREAKOUT_GATE_FRONT_OPEN: [16, 20],
};
```

`tools/breakout_art.mjs`:

```js
// Writes a theme's break-out room sheet: node tools/breakout_art.mjs <theme id>. Its frames come from
// tools/breakout_art/<id>.mjs (default export: () => { name: rows of key.gpl chars }); tier2's is the base family
// (ui/art/breakout.*), every other theme's ui/art/<id>/breakout.*. Sizes: ui/layout.js BREAKOUT_SIZES.
import { writeSheet } from './sheet_writer.mjs';
import { BREAKOUT_SIZES } from '../ui/layout.js';

const id = process.argv[2] ?? 'tier2';
const frames = (await import(`./breakout_art/${id}.mjs`)).default();
for (const [n, [w, h]] of Object.entries(BREAKOUT_SIZES)) {
  const f = frames[n];
  if (!f || f.length !== h || f.some(r => r.length !== w)) throw new Error(`${id} ${n}: want ${w}x${h}`);
}
writeSheet(id === 'tier2' ? 'breakout' : `${id}/breakout`, frames, [Object.keys(BREAKOUT_SIZES)]);
```

`tools/breakout_art/tier2.mjs` (Ordo Administratum, Menial Pen):

```js
// Ordo Administratum's Menial Pen: a grated iron floor, a low brass-capped rail on iron balusters, a red-latched gate
// with a slate tally board.
const row = (w, f) => Array.from({ length: w }, (_, x) => f(x)).join('');
const grid = (w, h, f) => Array.from({ length: h }, (_, y) => row(w, x => f(x, y)));
const edge = (x, w) => x === 0 || x === w - 1;

export default () => {
  const rail = grid(16, 10, (x, y) => (y < 2 ? 'g' : y === 2 ? 'G' : y === 9 ? 'k' : y === 8 ? 'M' : x % 4 === 1 ? 'm' : x % 4 === 2 ? 'M' : '.'));
  const frame = (x, y) => (y < 2 ? 'g' : y === 2 ? 'G' : x < 2 || x > 13 ? (edge(x, 16) ? 'k' : 'm') : null);
  return {
    BREAKOUT_FLOOR: grid(16, 16, (x, y) => (x % 4 === 0 || y % 4 === 0 ? 'm' : 'M')),
    BREAKOUT_RAIL: rail,
    BREAKOUT_SIDE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y % 4 === 3 ? 'G' : 'g')),
    BREAKOUT_POST: grid(6, 14, (x, y) => (y === 0 ? (edge(x, 6) ? '.' : 'k') : edge(x, 6) ? 'k' : y < 3 ? 'g' : y === 13 ? 'M' : x < 3 ? 'm' : 'M')),
    BREAKOUT_GATE: grid(4, 16, (x, y) => (edge(x, 4) ? 'k' : y === 7 || y === 8 ? 'x' : y % 4 === 3 ? 'G' : 'g')),
    BREAKOUT_GATE_OPEN: rail.map((r, y) => (y === 5 ? row(16, x => (x % 4 === 1 ? 'm' : 'x')) : r)),
    BREAKOUT_GATE_FRONT: grid(16, 20, (x, y) => frame(x, y) ?? (y >= 6 && y <= 11 && x >= 4 && x <= 11
      ? (y === 6 || y === 11 || x === 4 || x === 11 ? 'k' : y > 7 && y < 10 && (x + y) % 3 === 0 ? 'p' : 'n')
      : x % 3 === 1 ? 'm' : '.')),
    BREAKOUT_GATE_FRONT_OPEN: grid(16, 20, (x, y) => frame(x, y) ?? '.'),
  };
};
```

Run: `node tools/breakout_art.mjs tier2` → writes `ui/art/breakout.png` and `ui/art/breakout.json`.

`ui/sprites.js`:
- `PROP_SHEETS` gains `'breakout'` at the end.
- `sheetOf` reads the theme's own folder first:

```js
// The sheet of a family as the theme sees it: the default with the theme's frames, anchors and tiles laid over (its
// own folder's first, else the folder it borrows, artOf).
function sheetOf(id, f) {
  const o = themed[id]?.[f] ?? themed[dirOf(id)]?.[f], d = base[f];
```

- in `useArt`, `src` follows the same order:

```js
  const dir = dirOf(id), src = (f, n) => (themed[id]?.[f]?.frames[n] ? `${id}/${f}` : themed[dir]?.[f]?.frames[n] ? `${dir}/${f}` : f);
```

`tools/sprite_catalog.mjs`: in `catalog()`,
`srcOf = f => (ART.themed[theme.id]?.[f] ? `${theme.id}/${f}` : ART.themed[dir]?.[f] ? `${dir}/${f}` : f)`, and
`ABOUT` gains:

```js
  BREAKOUT_FLOOR: 'Break-out room floor tile (temp-folder sessions)', BREAKOUT_RAIL: 'Break-out room rail, front and back edges',
  BREAKOUT_SIDE: 'Break-out room side rail, seen from above', BREAKOUT_POST: 'Break-out room post: corners and beside each gate',
  BREAKOUT_GATE: 'Break-out room gate, closed, in the side', BREAKOUT_GATE_OPEN: 'Break-out room gate leaf, swung open',
  BREAKOUT_GATE_FRONT: 'Break-out room gate facing the viewer (strip, 39° view)', BREAKOUT_GATE_FRONT_OPEN: 'Break-out room gate facing the viewer, open',
```

Room names: in `ui/theme.js` `TEXT` (beside `overflow`): `breakout: 'Menial Pen',`. In `ui/themes.js` add a
`breakout` key to each theme's `text` object: forge `'Servitor Pen'`, xenos `'Containment Cell'`, night
`'Warded Circle'`, contrast `'Penitent Cage'`, cyber `'Sandbox'`, orbital `'Quarantine Bay'`, corpo `'Temp Pool'`,
rain `'Back Alley'`, matrix `'The Construct'`, synth `'Arcade Corner'`, tower `'Summoning Circle'`, vault
`'Test Chamber'`. (The four accents' `text` objects are merged over Neon Grid's by `accent`.) If `t()` does not reach
a theme's `text` for a key the Ordo themes lack, read `t` in `ui/theme.js` and add the key where it reads it.

- [ ] **Step 4: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line (every theme falls back to the base frames).

- [ ] **Step 5: Commit, push**

```bash
git add tools/breakout_art.mjs tools/breakout_art/tier2.mjs ui/art/breakout.png ui/art/breakout.json ui/layout.js ui/sprites.js tools/sprite_catalog.mjs ui/theme.js ui/themes.js ui/art.test.mjs
git commit -m "Break-out room: the breakout art family (Menial Pen), room names per theme, a theme's own folder first"
git push
```

---

### Task 8: Drawing: flat hall, strip, plaque

**Files:**
- Modify: `ui/scene.js` (`drawScene`, new `breakoutFloor`, `breakoutFence`, `stripBreakout`, export list)
- Modify: `ui/app.js` (`renderPlaques`)

**Interfaces:**
- Consumes: `breakoutOf`, `breakoutOfStrip`, `MAPS.BREAKOUT_*`, `t('breakout')`.
- Produces: `export function breakoutFloor(g, Z)` (the floor tile over Z's rectangle, flat coords; reused by 39°).

- [ ] **Step 1: Implement** — in `ui/scene.js` (import `breakoutOf` from `./layout.js` and `breakoutOfStrip` from
  `./strip.js` alongside the existing imports):

```js
// ---- the break-out room (layout.js breakoutOf, strip.js breakoutOfStrip) ------------------------------------------
const clipped = (g, x, y, w, h, draw) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); draw(g); g.restore(); };
const artW = map => map[0].length / RES, artH = map => map.length / RES;
// Its floor: the theme's tile over the rectangle, under the departments' rugs (they stay, one per temp folder).
export function breakoutFloor(g, Z) {
  const F = MAPS.BREAKOUT_FLOOR;
  clipped(g, Z.x, Z.y, Z.w, Z.h, g2 => { for (let y = Z.y; y < Z.y + Z.h; y += artH(F)) for (let x = Z.x; x < Z.x + Z.w; x += artW(F)) blit(g2, F, x, y); });
}
// Its fence, depth sorted with everyone (items: { y, draw }): rails along the top and bottom, sides down the west and
// east edges, the east one broken at each gate (a lane meets the corridor there), posts at the corners and either side
// of each gate; a gate open while anyone is within 12 px (as the doors).
function breakoutFence(Z, actors, items) {
  const { BREAKOUT_RAIL: R, BREAKOUT_SIDE: SD, BREAKOUT_POST: P, BREAKOUT_GATE: G, BREAKOUT_GATE_OPEN: GO } = MAPS;
  const x1 = Z.x + Z.w, y1 = Z.y + Z.h;
  const rail = y => items.push({ y, draw: g2 => clipped(g2, Z.x, y - artH(R), Z.w, artH(R), g3 => { for (let x = Z.x; x < x1; x += artW(R)) blit(g3, R, x, y - artH(R)); }) });
  const side = (x, ya, yb) => { for (let y = ya; y < yb; y += artH(SD)) { const h = Math.min(artH(SD), yb - y), top = y; items.push({ y: top + h, draw: g2 => clipped(g2, x - artW(SD) / 2, top, artW(SD), h, g3 => blit(g3, SD, x - artW(SD) / 2, top)) }); } };
  const post = (x, y) => items.push({ y, draw: g2 => blit(g2, P, x - artW(P) / 2, y - artH(P)) });
  rail(Z.y); rail(y1);
  side(Z.x, Z.y, y1);
  let y = Z.y;
  for (const q of Z.gates) {
    side(x1, y, q.y - 4);
    const open = near(actors, x1 - 4, q.y - 4, x1 + 4, q.y + 4);
    items.push({ y: q.y + 4, draw: g2 => (open ? blit(g2, GO, x1 - artW(GO), q.y - 4 - artH(GO)) : blit(g2, G, x1 - artW(G) / 2, q.y - 4)) });
    post(x1, q.y - 4); post(x1, q.y + 4);
    y = q.y + 4;
  }
  side(x1, y, y1);
  for (const [px, py] of [[Z.x, Z.y], [x1, Z.y], [Z.x, y1], [x1, y1]]) post(px, py);
}
// The strip's bay: a gate leaf facing the viewer at each end (open while anyone is by it).
function stripBreakout(Z, actors, items) {
  const foot = FLOOR - 1;
  for (const { x } of Z.gates) {
    const map = near(actors, x - 4, FLOOR, x + 4, FLOOR) ? MAPS.BREAKOUT_GATE_FRONT_OPEN : MAPS.BREAKOUT_GATE_FRONT;
    items.push({ y: foot, draw: g2 => blit(g2, map, x - artW(map) / 2, foot - artH(map)) });
  }
}
```

(`near` is defined further down the file as a `const`: move it above this section, or the calls fail at draw time
with a temporal-dead-zone error only if executed before its line; `drawScene` runs after module load, so leaving it
in place is fine. `FLOOR` must be imported from `./strip.js` if scene.js does not already import it — check the
existing `drawStripProps`, which uses it.)

In `drawScene`, the start becomes:

```js
  const all = [...actors.values()];
  const Z = H.strip ? breakoutOfStrip(layout.blocks) : breakoutOf(layout.blocks, H);
  if (Z) breakoutFloor(g, Z);
  drawRugs(g, layout.blocks);
  if (!H.strip) drawDoors(g, all);
  const items = [drawGate(g, all)], lights = [], over = [], floor = [];
  if (Z) (H.strip ? stripBreakout : breakoutFence)(Z, all, items);
```

(keep the existing comment on the `items` line). Add `breakoutFloor` to the export list at the end of the file.

In `ui/app.js` `renderPlaques`, after the `overflow` line (import `breakoutOf` from `./layout.js`):

```js
  const Z = !strip() && breakoutOf(blocks, hall); // the break-out room's name under its fence (the strip has no room for it)
  if (Z) want.set('breakout', ['plaque breakout', t('breakout'), ...at(Z.x + 2, Z.y + Z.h + 1), undefined, Z.w - 4]);
```

- [ ] **Step 2: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line (scenes without temp blocks draw exactly as before, so pixel-hash tests hold).

- [ ] **Step 3: Look at it** — serve the repo (`python -m http.server 8123` if 8123 does not answer), open
  `http://localhost:8123/tools/preview.html` (or the running app with a temp session) in the Flat view and the strip,
  with at least one temp session and one normal one. Check: the fence closes the zone, the gate opens as a scribe
  walks through it, nobody else crosses the fence, the "Menial Pen" plaque sits under the zone. Fix offsets that look
  wrong (rail feet, post centring) in place.

- [ ] **Step 4: Commit, push**

```bash
git add ui/scene.js ui/app.js
git commit -m "Break-out room: floor, fence and gates in the flat hall, gates in the strip, the room's plaque"
git push
```

---

### Task 9: Drawing: the 39° view

**Files:**
- Modify: `ui/scene39.js` (`drawScene39`, new fence kit)

**Interfaces:**
- Consumes: `breakoutOf`, `S.breakoutFloor`, `S.near`, `MAPS.BREAKOUT_RAIL`, `MAPS.BREAKOUT_GATE_FRONT`.

- [ ] **Step 1: Implement** — in `ui/scene39.js` (import `breakoutOf` with `WALL` from `./layout.js`), after `doorKit`:

```js
// The break-out room's fence (layout.js breakoutOf): every rail a thin box (2 art px) standing on the floor, every face
// textured from the flat BREAKOUT_RAIL frame tiled along it (r down from the top, as IsoBuf.box); the east side broken
// at each gate, a closed gate a box textured from BREAKOUT_GATE_FRONT, an open one the gap. Baked per axis, length
// and frame, once per theme.
let fences = new Map();
onTheme(() => { fences = new Map(); });
function fenceBox(axis, len, frame) {
  const key = `${axis}:${len}:${frame}`;
  if (fences.has(key)) return fences.get(key);
  const f = MAPS[frame], R = f.length, C = f[0].length, [u1, v1] = axis === 'u' ? [len, 2] : [2, len];
  const tex = (i, r, Zh) => f[Math.min(R - 1, fl(r * R / Zh))][i % C];
  const buf = bake(box(0, u1, 0, v1, 0, R), b => b.box({ u0: 0, u1, v0: 0, v1, z0: 0, z1: R, id: 1,
    front: (i, r, U, Zh) => tex(i, r, Zh), side: (j, r, J, Zh) => tex(j, r, Zh), top: i => f[0][i % C] }));
  const k = { buf, cv: paint(buf) };
  fences.set(key, k);
  return k;
}
function fenceItems(Z, actors) {
  const out = [], U = x => Math.round(2 * x), V = y => Math.round(2 * (y - WALL));
  const add = (axis, x, y, len, frame = 'BREAKOUT_RAIL') => {
    if (len <= 0) return;
    const k = fenceBox(axis, len, frame), u0 = U(x), v0 = axis === 'u' ? V(y) - 2 : V(y);
    out.push({ foot: axis === 'u' ? { u0, u1: u0 + len, v0, v1: v0 + 2 } : { u0, u1: u0 + 2, v0, v1: v0 + len }, draw: g2 => drawBuf(g2, k.buf, k.cv, u0, v0) });
  };
  const x1 = Z.x + Z.w, y1 = Z.y + Z.h, L = U(x1) - U(Z.x);
  add('u', Z.x, Z.y, L); add('u', Z.x, y1, L);
  add('v', Z.x, Z.y, V(y1) - V(Z.y));
  let y = Z.y;
  for (const q of Z.gates) {
    add('v', x1, y, V(q.y - 4) - V(y));
    if (!S.near(actors, x1 - 4, q.y - 4, x1 + 4, q.y + 4)) add('v', x1, q.y - 4, V(q.y + 4) - V(q.y - 4), 'BREAKOUT_GATE_FRONT');
    y = q.y + 4;
  }
  add('v', x1, y, V(y1) - V(y));
  return out;
}
```

In `drawScene39`, replace `floor.push(g2 => S.drawRugs(g2, layout.blocks));` with:

```js
  const Z = breakoutOf(layout.blocks, H);
  if (Z) floor.push(g2 => S.breakoutFloor(g2, Z)); // under the rugs, as in the flat view
  floor.push(g2 => S.drawRugs(g2, layout.blocks));
```

and before `items.push(...gateItems(all, dt), magos(t, dt));` add:

```js
  if (Z) items.push(...fenceItems(Z, all));
```

- [ ] **Step 2: Run the tests**

Run: `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`
Expected: no FAIL line.

- [ ] **Step 3: Look at it** — in the 39° view with a temp session: rails stand upright (not lying flat, not upside
  down: if the rail art shows inverted, flip `r` to `Zh - 1 - r` in `tex`), the east side opens as a scribe passes,
  scribes in front of the front rail draw over it and those behind under it. Fix in place.

- [ ] **Step 4: Regenerate galleries, commit, push, rebuild and reinstall**

```bash
node tools/sprite_sheet.mjs
git add ui/scene39.js docs/sprites
git commit -m "Break-out room: floor and fence in the 39° view"
git push
```

Then "Rebuild and reinstall" and check all three views in the installed app.

---

### Task 10: One theme's art (repeat for each of the 12 other themes)

One task per theme, in this order, each its own commit. Every design is new: draw the theme's room from its own
world, never a recolour of the Menial Pen.

| Theme id | Room | Look | Where its `art` list goes |
|---|---|---|---|
| forge | Servitor Pen | hazard-chevron floor, cable fence, cog sigil on the gate | new `art: ['breakout']` in its `defineTheme` |
| xenos | Containment Cell | glowing floor grid, stasis-field posts, field rails | new `art: ['breakout']` |
| night | Warded Circle | hexagrammic ward inlaid in the floor, candle posts | new `art: ['breakout']` |
| contrast | Penitent Cage | flagstones, iron bars, a chained tome on the gate | new `art: ['breakout']` |
| cyber | Sandbox | wireframe floor, laser-beam rails between emitter posts | append `'breakout'` to its `art` |
| orbital | Quarantine Bay | airlock hazard stripes, glass partition rails | append `'breakout'` |
| corpo | Temp Pool | grey carpet tiles, glass hot-desk partitions, "TEMPS" lanyard sign on the gate | new `art: ['breakout']` in its `accent(NEON, …)` |
| rain | Back Alley | wet asphalt, chain-link fence, flickering sign | new `art: ['breakout']` in its `accent` |
| matrix | The Construct | bare white loading-program void floor, white rails | new `art: ['breakout']` in its `accent` |
| synth | Arcade Corner | checkered floor, velvet rope on brass stanchions, marquee gate | new `art: ['breakout']` in its `accent` |
| tower | Summoning Circle | chalk circle on flagstones, rune-stone posts | append `'breakout'` |
| vault | Test Chamber | Vault-Tec experiment cell, observation-glass rails, "EXPERIMENT IN PROGRESS" gate | append `'breakout'` |

**Files (per theme `<id>`):**
- Create: `tools/breakout_art/<id>.mjs`, `ui/art/<id>/breakout.png`, `ui/art/<id>/breakout.json`
- Modify: `ui/themes.js` (the theme's `art`), `docs/sprites/` (its gallery)

**Interfaces:**
- Consumes: `BREAKOUT_SIZES` (Task 7, exact frame names and sizes), the key palette `ui/art/key.gpl` (one char per
  slot; the theme recolours slots, so pick slots whose colour in this theme gives the look: open
  `tools/sprites.html` on the theme to see its palette).

- [ ] **Step 1: Open the viewer** — `python -m http.server 8123` (skip if it answers), open
  `http://localhost:8123/tools/sprites.html`, filter `BREAKOUT`, select the theme. It shows the base frames now.

- [ ] **Step 2: Draw** — write `tools/breakout_art/<id>.mjs` exporting `default () => ({ BREAKOUT_FLOOR: rows, … })`
  with all eight frames at their contract sizes (same structure as `tools/breakout_art/tier2.mjs`: functions of
  `(x, y)` or literal row arrays). Keep each frame's role: the rail's top rows are its cap, the side frame is that rail
  seen from above, the gate frames show a closed leaf and an open doorway, posts read at 3×7 logical px.

- [ ] **Step 3: Write the sheet and list it**

Run: `node tools/breakout_art.mjs <id>` → `ui/art/<id>/breakout.png` + `.json`. Add `'breakout'` to the theme's
`art` as in the table.

- [ ] **Step 4: Test and look**

Run: `node ui/art.test.mjs && node ui/sprites.test.mjs`
Expected: both pass. Reload the viewer and check every frame on the theme; then the app (or `tools/preview.html`) in
the Flat, 39° and strip views with a temp session. Redraw until it reads as the table's look.

- [ ] **Step 5: Gallery, commit, push, rebuild and reinstall**

```bash
node tools/sprite_sheet.mjs --theme <id>
git add tools/breakout_art/<id>.mjs ui/art/<id>/breakout.png ui/art/<id>/breakout.json ui/themes.js docs/sprites
git commit -m "Break-out room: <Room> for <Theme name>"
git push
```

Then "Rebuild and reinstall".

---

## Rebuild and reinstall

PowerShell, from the repo root (the operator tests the installed build):

```powershell
cd src-tauri
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\administratum.key"; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cargo tauri build
$v = (Select-String -Path Cargo.toml -Pattern '^version = "(.+)"').Matches[0].Groups[1].Value
Get-Process Administratum -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -Wait "target\release\bundle\nsis\Administratum_${v}_x64-setup.exe" -ArgumentList '/S'
Start-Process "$env:LOCALAPPDATA\Administratum\Administratum.exe"
```

## Open points

- Temp blocks count toward compact lecterns and extra bays like any block (spec decision 11); revisit if a test sweep
  shrinks real desks too often (compute the level without temp blocks).
- With more than one zone row, there is one gate per row on the corridor side.
