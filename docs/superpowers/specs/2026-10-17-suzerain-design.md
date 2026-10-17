# Suzerain: sessions that run real child sessions

**Goal:** show at a glance which session coordinates which, when Claude Code desktop forks real child
sessions (`mcp__ccd_session__start_session`), and set that parent apart from a scribe that only has subagents.

## Facts (verified on disk, Claude Code 2.1.299, 2026-10-17)

- A child started by `start_session` is a full session: its own `~/.claude/sessions/<pid>.json`
  (`entrypoint: claude-desktop`, no parent field) and its own `<uuid>.jsonl` beside the parent's.
- The child's transcript **opens with a copy of the parent's history**, every copied line still stamped
  with the parent's `sessionId`; the child's own lines follow under its own id. The copied part ends with the
  parent's `mcp__ccd_session__start_session` tool_use(s). The copy can be large (~800 KB seen).
- *(inferred, no real grandchild seen yet)* A grandchild's copy holds the grandparent's lines, then the parent's: the parent is the `sessionId` of the
  **last** foreign line before the first own line, not the first.
- The parent's transcript gets a tool_result `Started session "<title>" (session_id: local_<uuid>, name: ...)`.
- The Chronicon already skips the copied lines (commit 8cdafe3).

## Decision ledger (ratified 2026-10-17)

- **D1** Goal: see who coordinates whom.
- **D2** Only a session with at least one **live forked child** becomes **Suzerain**. Plain subagents stay
  adepts as before; Orca workers and worktrees unchanged.
- **D3** Suzerain look: its desk stands on a **dais with a banner**, a new prop drawn per world; the scribe
  sprite is unchanged.
- **D4** Recursive: a child that forks is a Suzerain too. One tier only, whatever the depth.
- **D5** Children sit in the parent's department, whatever their own `cwd`.
- **D6** The parent drops the rank when its last live child ends; an orphaned child is a plain scribe.
- **D7** Cards: the parent's lists its children (click selects one); the child's shows "summoned by <parent>"
  (click selects the parent).
- **D8** A child keeps its own petitions and queues at the Sanctum itself.
- **D9** Out of scope: Orca workers, OpenCode forks (`fork_session_id`), CLI `--fork-session`.
- **D10** *(my call)* The link is read from the **child's head**: last foreign `sessionId` before its own
  lines, accepted only if that copied part holds a `mcp__ccd_session__start_session` tool_use. This keeps a
  CLI `--fork-session` (no such call) out, per D9, and needs no parent-side scan.
- **D11** Token double count fixed first (done, 8cdafe3).
- **D12** *(my call)* Adjacency (D5) is best effort: children join the parent's department and take desks in
  arrival order, which puts them next to the parent when they are spawned together. No desk reshuffle.
- **D14** *(my call)* A child seated in its root's department also counts its Chronicon tokens there
  (`add_usage` uses `dept`): one tree, one project.
- **D13** *(my call)* Dais art: one base design (all Ordo worlds) plus one per world that owns its furniture:
  cyber (Neon Grid, and the corpo/rain/matrix/synth worlds that use its art), orbital, tower, vault, darwin.
  Six designs, each new (never a recolour), in Flat and 39°.

## Design

### Backend (src-tauri)

- `registry`: new `fork_parent(path, own_id) -> Option<String>`. Streams the transcript from the start line by
  line; returns `None` at once when the first line carrying a `sessionId` is the session's own (every normal
  session: one line read). Otherwise remembers the last foreign `sessionId` and whether a
  `mcp__ccd_session__start_session` tool_use was seen, stops at the first own line, and returns the parent
  only if the call was seen. Read cap 16 MB, then `None`.
- The head never changes: the poller memoises the **raw parent id** per session id once the scan reached the
  first own line or the cap (dropped with the session). A file that ends inside the copy (still being
  written) is not memoised and is read again next poll. Liveness is checked every tick, apart from the memo.
- "Live" = present in this poll's session list (the existing registry scan); no new liveness signal.
- `Session` gains `parent: Option<String>` (serialised, `null` when none). After the scan, the poller keeps
  `parent` only if that id is a live session (D6), then sets each child's `dept` to its root ancestor's
  `dept` (D5), following `parent` links with a depth cap of 8 against cycles.
- Cards link the **immediate** parent and children only, not the whole chain.
- Desk order is the hall's existing first-seen order (`ui/layout.js` `planLayout`), unchanged.
- World variants follow the existing mechanism: a `dais` entry in each theme's `art` list in `ui/themes.js`
  (themes without it use the base art); no world mapping in code.

### UI

- Derived per tick: `children(id)` = live sessions whose `parent` is `id`; Suzerain = `children` not empty.
- Hall (Flat and 39°): a Suzerain's desk slot draws the `DAIS` prop under and behind its desk, before the desk
  and the scribe. Same slot size: nothing moves. Removed the tick it loses its last child.
- Card: a "Children" line listing each child's name (click: `select(child)`); a child's card shows
  "summoned by <parent name>" (click: `select(parent)`). Labels via `t()` in every locale.
- Remote (phone/tablet) view shares the UI: nothing extra.

### Art

- New family `dais` (`ui/art/dais.png` + `.json`): frames `DAIS` (Flat) and `DAIS39` (39°), anchored to the
  desk slot; drawn in `key.gpl`. World variants in `ui/art/<world>/dais.*`, listed in each theme's `art`.
- `tools/sprite_catalog.mjs`: catalogue entry and `ABOUT` text; galleries regenerated.

### Failure modes

- Transcript missing or unreadable: no parent, plain scribe.
- Parent not live (closed, or not yet seen): child is a plain scribe; becomes linked when the parent appears.
- Huge prefix: capped read, once per session.
- Format change by Claude Code (tool renamed, prefix dropped): no Suzerain, nothing else breaks.

### Testing

- Rust: `fork_parent` on a normal transcript, a fork (start_session in the copy), a grandchild (two foreign
  ids, the last wins), a CLI-style fork (no start_session: `None`); poller: orphan dropped, dept inherited
  from the root, cycle capped.
- UI: `children`/Suzerain derivation test; art tests (`ui/art.test.mjs`, `ui/sprites.test.mjs`) cover the new
  family; visual check in `tools/sprites.html` per world.

### Docs

README "What it shows" table: the dais row, children's card lines; DEVELOPMENT.md module notes.
