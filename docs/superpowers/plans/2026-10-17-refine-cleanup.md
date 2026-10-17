# Refine, refactor and clean up — whole repo

Behaviour-preserving cleanup pass over `src-tauri/`, `ui/` and `tools/`, chosen from a read-only audit (2026-10-17)
and approved by the user as tasks A1–A10. No spec: the requirement is "same behaviour, less code / clearer code".

## Global Constraints

- **Behaviour-preserving only.** Nothing observable may change: Tauri command names, the remote HTTP API, on-disk
  formats (chronicle JSON, settings), rendered pixels (the node tests hash draw calls and pixels), generated art
  bytes (`ui/art/**`, `docs/sprites/**`). If a refactor cannot be done without such a change, skip that item and
  say so in the report.
- **Where:** the worktree `C:\Users\guill\Documents\git\Administratum-refine`, branch `refine/cleanup`. One commit
  per task (or a few focused ones). Never push, never merge, never touch the main checkout
  `C:\Users\guill\Documents\git\Administratum`.
- **Cargo target dir:** `export CARGO_TARGET_DIR=C:/Users/guill/Documents/git/Administratum/src-tauri/target`
  before any cargo command (reuses the built dependencies).
- **Gate — every task, from the worktree root in Git Bash, all must pass:**
  ```sh
  cargo test --manifest-path src-tauri/Cargo.toml
  for t in ui/*.test.mjs; do node "$t" >/dev/null || echo "FAIL $t"; done
  cargo fmt --manifest-path src-tauri/Cargo.toml --check
  cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets 2>&1 | grep -c '^warning'
  ```
  Baseline: 196 Rust tests pass (2 ignored), all 18 node suites pass, fmt clean, clippy count 5. The clippy count
  may never rise above the previous task's count.
- **Art gate — any task touching `tools/` or `ui/` modules the generators import:**
  ```sh
  for w in base cyber orbital tower vault darwin; do node tools/watch_art.mjs $w >/dev/null; done
  for id in contrast corpo cyber darwin forge matrix night orbital rain synth tier2 tower vault xenos; do node tools/breakout_art.mjs $id >/dev/null; done
  for id in tier2 cyber orbital tower vault darwin; do node tools/suzerain_art.mjs $id >/dev/null; done
  node tools/sprite_sheet.mjs >/dev/null; for t in cyber orbital tower vault darwin; do node tools/sprite_sheet.mjs --theme $t >/dev/null; done
  git status --porcelain ui/art docs/sprites   # must print nothing
  ```
  Proven byte-stable at baseline.
- **Before deleting or merging anything,** grep the whole repo (`git grep -nw <name>`), including `tools/*.html`,
  tests, and Tauri `invoke('…')` / `generate_handler!` names.
- **Style:** match the surrounding code — naming, comment density (sparse, one-line "why" comments), module layout.
  No new dependencies. Smallest diff that does the job; no reformatting of untouched code.
- **Docs in step:** if a task moves a module or adds a shared helper module, update the module map in
  `docs/DEVELOPMENT.md` and, where it lists paths, `CLAUDE.md` "Where things live", in the same commit.

---

### Task 1: Rust hygiene (A1)

Mechanical cleanups, one commit:

- `src-tauri/src/chronicle.rs` ~206-267: `extract_line` wraps its whole body in a leftover bare `{ … }` block.
  Remove the braces and dedent (rustfmt reflows).
- `src-tauri/src/main.rs` ~140: the doc line "The header's close button: quits like the tray's Quit." sits above
  `usage`; it belongs to `quit` (~148). Move it.
- `src-tauri/src/main.rs` ~347-357 (`poll_loop`): `now_ms()` is called three times, then shadowed by a local
  `now_ms`, then aliased `let now = now_ms;`. Take `let now = now_ms();` once at the top of the tick and use it
  everywhere in the tick (`poller.roster`, `opencode.roster`, `track_compaction`, …); drop the alias.
- `src-tauri/src/opencode/mod.rs` ~245-246: `let tuis = self.tui_folders().clone()` copies a HashSet every tick
  only to pass it to `keep_idle`; pass `Some(self.tui_folders())` (adjust the borrow if needed without cloning).
  ~142 `scan_tuis`: test the process name first and build the command-line `Vec<String>` only on a match.
- Clippy hygiene: run `cargo clippy --all-targets` and fix every warning it reports (expected: unused `Read`
  import in `registry/files.rs` ~85, redundant trailing `continue`s in `registry/tail.rs` ~74-76, redundant closures
  such as `unwrap_or_else(|e| e.into_inner())` in `main.rs` ~42 and others in `opencode/mod.rs`, `orca.rs`,
  `git.rs`, `chronicle.rs`, `registry/files.rs`; `*lock(..) = roster.clone()` → `clone_from` at `main.rs` ~400).
  Code under `cfg(target_os = "macos")` cannot be compiled here — leave it untouched.

Done when: the gate passes and the clippy count is as low as these fixes make it (record the new count).

### Task 2: chronicle helpers (A2)

In `src-tauri/src/chronicle.rs` (and `registry/mod.rs` for `TurnSummary`):

- `read_transcripts` (~814-824) and `read_opencode` (~868-878) fold a `Found` identically: extend events,
  `add_usage` per usage, `tithe_at` + `add_busy` + mark dirty per turn. Extract one method
  (e.g. `fn absorb(&mut self, dept: &str, found: Found, events: &mut Vec<Event>)`) and call it from both. Read both
  bodies in full first; if they differ in any detail, keep the difference as a parameter, never drop it.
- `Chronicle::open` (~765, ~767) reads JSON with `read_to_string().ok().and_then(from_str).unwrap_or_default()`
  twice; `flush` (~944-952) writes three files with `if let Ok(t) = to_string(..) { write_atomic(..) }`. Add
  `fn load_json<T: DeserializeOwned + Default>(p: &Path) -> T` and `fn save_json<T: Serialize>(p: &Path, v: &T)`
  (private to the module) and use them. Keep the exact serializer (`to_string` vs `to_string_pretty`) per file.
- The predicate `cur.turn.started_ms.is_some() || cur.turn.tools > 0` appears twice (~839, ~886): add
  `TurnSummary::started(&self) -> bool` next to `TurnSummary` and call it.
- `Event { ts, kind, session_id, name, dept, helper, detail }` built from a `Session` at `chronicle.rs` ~631 and
  `main.rs` ~467 (identical shape): add `Event::for_session(ts, kind, &Session, detail)` (or the closest shape both
  sites fit) and use it there. Leave the other `Event` literals (vigil/app.rs, demo.rs, chronicle.rs ~213) alone.

Done when: the gate passes; chronicle tests unchanged and green.

### Task 3: backend shared helpers (A3)

- `registry/tail.rs` ~126 and `main.rs` ~433 hand-write "truncate to N chars plus …", which is `clip_to`
  (`registry/tail.rs` ~133). Make `clip_to` `pub(crate)`, re-export it from `registry`, and use it at both sites
  (limits 200 and 120 respectively). Check the ellipsis character and char-vs-byte counting match exactly before
  replacing; if they differ, leave that site.
- `poller.rs` ~76 and ~94 build the same
  `main.into_iter().map(|m| (m,false)).chain(subs.into_iter().map(|f| (f,true))).collect()`: add
  `fn listing(main: Option<FileStat>, subs: Vec<FileStat>) -> Vec<(FileStat, bool)>` and use it at both.
- `opencode/mod.rs` ~148-152 (`db_path`) and `opencode/service.rs` ~50-53 (`registration_path`) both apply "env var
  if non-empty, else `~/.local/<sub>`". Add one `fn xdg_dir(var: &str, sub: &str) -> PathBuf` in `opencode/mod.rs`
  and use it from both. Leave `main.rs` ~228 `home_dir` as is unless a shared `home()` falls out naturally.
- `remote/mod.rs` ~400, 413, 425, 437, 447: `respond(&mut w, code, TEXT, status_text(code).as_bytes(), &[])` five
  times → `fn respond_status(w, code)`. The `Answer` and `Vigil` arms (~435, ~444) repeat
  `read_body(&mut r, header(&head.headers, "content-length"), MAX_BODY)` → a small `body_of(&mut r, &head)`.
- The helper-kind default literal `"agent"` at `opencode/mod.rs` ~75 and ~293, `chronicle.rs` ~798,
  `registry/helpers.rs` ~62 → `pub const DEFAULT_HELPER_KIND: &str = "agent"` in `registry`, used at all four.

Done when: the gate passes. Note in the report which sites, if any, you left because they were not identical.

### Task 4: split chronicle.rs (A4)

`src-tauri/src/chronicle.rs` (~1600 lines) has a section headed "OpenCode messages (pure)" (~497-626): `Msg`,
`OcCursor`, `ms_of`, `iso_of`, `patch_files`, `finished`, `claude_lines`, `feed_opencode` (verify the exact list —
earlier tasks moved lines).

- Move the file to `src-tauri/src/chronicle/mod.rs` with `git mv` (keeps history), then move that section verbatim
  into `src-tauri/src/chronicle/opencode.rs`, declared `mod opencode;` with a `use opencode::{…}` /
  `pub(crate) use` as needed so every existing path (`crate::chronicle::…`, the tests' `super::*`) still resolves.
  A child module sees the parent's private items through `super::`.
- Pure move: no logic edits, no renames. Tests stay where they are unless they are only about the moved items
  (then they may move with them, unchanged).
- Update the backend module map in `docs/DEVELOPMENT.md` (and any other doc that names `chronicle.rs` as a path:
  `git grep -n 'chronicle.rs'`).

Done when: the gate passes and `git log --follow src-tauri/src/chronicle/mod.rs` shows the old history.

### Task 5: UI shared geometry (A5)

- `half`, `rect` (and `fl` = `Math.floor`) are defined byte-for-byte in `ui/scene39.js` ~20-22, `ui/actors.js`
  ~325, `ui/scene.js` ~18-19. Export them once from a module all three can import without an import cycle
  (`actors.js` cannot import `scene.js`; `sprites.js` or `depth.js` are candidates — check each module's imports
  first) and delete the local copies.
- `ui/scene39.js` ~105, 151, 376, 393, 439 inline `Math.round(2*x)` / `Math.round(2*(y-WALL))`, already named
  `fx`/`fy` in `ui/isohall.js` ~21 (and `U`/`V` at scene39 ~151). Export `fx`/`fy` from `isohall.js` and use them.
  Keep the unrounded `2*(y-WALL)` forms (~39, ~109) as they are.
- `ui/scene39.js` ~393 uses `264 + H.ox` / `120 + H.sd`, duplicating `const MAG = {x:264, y:120}` in `ui/scene.js`
  ~817. Export `MAG` (scene.js has an export block near its end) and use it.
- Hex → `[r,g,b]` is parsed in `ui/isohall.js` ~225 and `ui/scene39.js` ~63-64 (memoised), and again inside
  `hexA` in `ui/theme.js` ~186. Export one memoised `rgb` from `theme.js` and use it in both; `hexA` may use it
  only if its output string is identical.

Run the art gate too (generators import ui modules). Done when: gate + art gate pass (the pixel/draw-call hashes
in `flathall`, `isohall`, `scene39` tests prove no visual change).

### Task 6: one buffer-blend loop (A6)

`ui/isohall.js` ~231-239 and `ui/scene39.js` ~66-79 both paint a char buffer into `ImageData`, blending each pixel
toward `T.light.shadow` by an alpha (isohall: `shade[i]` and per-id glass colours; scene39: `face == 2 ? 0.2 : 0`).
Extract one helper (e.g. `blendInto(D, i, rgb, a, shadowRGB)` in the module that best fits — likely next to the
shared `rgb` from Task 5) and call it from both loops. Keep the arithmetic order and rounding exactly (the hashes
are byte-exact); it is a hot loop, so no per-pixel allocation.

Done when: gate + art gate pass.

### Task 7: searchlight cone (A7)

The alarm searchlight cone (composite `'lighter'`, `hexA(searchlight, 0.1 + 0.04*sin(8t))`, a 4-point fill to
`who.x ± 8`, `who.y + 1`) is duplicated in `ui/scene.js` ~1014-1021 (`drawAlarm`) and `ui/scene39.js` ~442-450
(`alarm()`).

1. First check whether any test draws it (a stale petitioner / alarm state in `flathall.test.mjs` or
   `scene39.test.mjs`). If neither does, add one characterization test that renders the alarm in both views and
   asserts its draw-call/pixel hash (follow the existing hash-test pattern in that file), run it green on the
   unchanged code, commit it alone.
2. Then extract `searchlight(g, t, bx, by, fx, fy)` (or the parameter list both sites actually need) in `scene.js`,
   export it, and call it from both.

Done when: gate passes, including the new test.

### Task 8: UI tidy (A8)

- Drop the `export` keyword (keep the definitions) on these, confirmed used only inside their own file:
  `fmtTok`, `fmtDur`, `dayKey` (`ui/chronicon.js` ~8-10), `isPetitioner` (`ui/actors.js` ~20), `widened`
  (`ui/scene.js` ~837), `PARALLAX` (`ui/viewport.js` ~34, inside a multi-const export line: split it). Re-grep each
  first.
- `String(n).padStart(2, '0')` appears ~7 times (`ui/chronicon.js` ~9-10, ~150, ~157; `ui/card.js` ~129;
  `ui/quiet.js` ~8; `ui/app.js` ~155). Add one `pad2` in the module that suits the existing imports (check for
  cycles; do not create a new module if an existing one fits) and use it. Do NOT merge the three different
  minutes formatters — their outputs differ.
- `ui/scene.js` ~878 comment says the strip alarm's returned lights "feed nothing yet (the strip has no lighting
  pass)". Check in `ui/app.js` whether lights are drawn in strip mode (`back` / `drawLighting`). Fix the comment only
  if it is wrong; otherwise leave it.

Done when: gate + art gate pass.

### Task 9: tools kits (A9)

- `tools/breakout_art/*.mjs` (14 files): the same `row`, `grid`, `edge` helpers are pasted at the top of each. Add
  `tools/breakout_art/kit.mjs` exporting them; import everywhere; delete the copies. Do not reuse
  `tools/suzerain_art/kit.mjs` as is (its `row` adds `?? '.'`, the breakout one does not).
- `tools/watch_art/{base,cyber,darwin,orbital,tower,vault}.mjs`: `stamp` is identical in all six; `frame` in five
  (base differs only by a parameter name — include it if the body is identical); `rev` in the five non-base files;
  `put` in cyber, darwin, orbital, vault. Add `tools/watch_art/kit.mjs` exporting those and import them. Leave `sym`
  (differs per world), `zipAt` and `noArm` alone.
- The watch frame size 32×36 is a literal in `tools/watch_art.mjs` ~7 (and `32 - n` in darwin's `shift`). The
  suzerain and breakout sizes live in `ui/layout.js` (`SUZERAIN_SIZES`, `BREAKOUT_SIZES`). Add the watch size there
  in the same style (check no equivalent exists) and use it in `watch_art.mjs` and `shift`.
- `tools/sheet_writer.mjs` ~30: the sheet wrap width `512` is a bare literal (also in the ~21 comment) → `SHEET_W`.
- `tools/breakout_art.mjs` and `tools/suzerain_art.mjs` are the same script with names swapped. Add
  `sizedSheet(name, sizes)` (or similar) to `tools/sheet_writer.mjs` holding the size-check loop and the
  `writeSheet` call; both CLIs call it. Keep every error message text identical.

Done when: gate + art gate pass (art gate is the proof: byte-identical output).

### Task 10: docs sync (A10)

- `docs/DEVELOPMENT.md` ~181-193 and `CLAUDE.md` list `--theme cyber, orbital, tower, vault, darwin` as "each
  theme with its own art". Check which themes really have their own folder under `ui/art/` and which have their
  own gallery under `docs/sprites/`, then make both lists match reality (they may already be right: accent themes
  reuse the base art — verify before editing).
- Make the tools paragraph in `docs/DEVELOPMENT.md` mention the shared kits (`tools/breakout_art/kit.mjs`,
  `tools/watch_art/kit.mjs`, `tools/suzerain_art/kit.mjs`) and `sizedSheet`, if Task 9 added them.
- Check the backend module map still matches `src-tauri/src/` after Tasks 2-4.

Docs only. Done when: the docs match the tree, and the gate still passes.
