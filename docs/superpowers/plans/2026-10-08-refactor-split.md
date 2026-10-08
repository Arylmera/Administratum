# Refactor Split (registry.rs, app.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split two oversized files by responsibility with no change in behaviour:
`src-tauri/src/registry.rs` (1778 lines) becomes the `src-tauri/src/registry/` module directory, and cohesive
chunks of `ui/app.js` (967 lines) move into their own ES modules. The frame loop, boot, view fitting/pan, and the
overlay sync (plaques, labels, tags, edges, hover) stay in `app.js`.

**Architecture:**
- **Rust:** `registry/mod.rs` keeps the shared data types (`Session`, `Helper`, `Context`, `Limit`,
  `TurnSummary`), `tests_session`, and a re-export list. The re-export list means every path other modules use
  today (`registry::scan`, `registry::Tracker`, `crate::registry::{self, FileStat, …}`, `registry::clip`, …) still
  resolves unchanged. `src-tauri/src/strip/mod.rs` already uses this layout.
- **JS:** new modules never import `app.js`, and nothing runs when they are imported. Each module that needs
  app state exports an `init…(hooks)` function, and `app.js` calls it at the spot where the code used to run. This
  is the existing `initSettings(hooks)` / `initChronicon(colorOf)` pattern. Keeping that spot keeps the order in
  which `onTheme`, `onView`, `click` and `keydown` listeners are registered.

**Tech Stack:** Rust 2021 (Tauri 2 backend). Vanilla ES modules with no bundler. Node test scripts
(`node ui/<x>.test.mjs`, `node:assert/strict`).

---

## Global Constraints

- **Behaviour-preserving.** Make no functional change. Move code verbatim, comments included. The only edits
  allowed inside moved code are:
  - visibility (`pub(super)`, `pub(crate)`);
  - `use`/`import` lines;
  - the explicit state interface each task describes.
- **No renamed public items** unless a task says so. Every existing path into `registry` keeps working.
- **All existing tests pass unchanged**, apart from import paths. The one allowed exception is the file list in
  `ui/theme.test.mjs` line 103, which gains the new UI modules (Tasks 6 and 9). It scans source files for
  `t('…')` keys. If a file that calls `t()` is missing from that list, the check quietly covers fewer keys and still
  passes.
- **Gates.** These run after every task and all must hold:
  - `for t in ui/*.test.mjs; do node $t || echo "FAIL $t"; done` prints no `FAIL`.
  - `cd src-tauri && cargo build`: **zero warnings**. The baseline at 07884c5 is 0, and leftover imports after a
    split show up as warnings.
  - `cd src-tauri && cargo test`: all pass, and `cargo test --no-run 2>&1 | grep -c '^warning'` stays **0**
    (the baseline at 07884c5).
  - **Test count unchanged.** `cargo test -- --list 2>/dev/null | grep -c ': test$'` stays **133** (the baseline
    at 07884c5). On its own, `cargo test registry:: -- --list 2>/dev/null | grep -c ': test$'` stays **65**. A
    test lost in a move would still leave the suite green; this count catches it.
- **Comments.** Style and density match the surrounding code: terse one-line `//` comments that say *why*.
  - Each new Rust file opens with one `//!` line saying what it holds, like `toast.rs` and `strip/mod.rs`.
  - Each new JS file opens with one `//` line, like `chronicon.js`.
  - Comments elsewhere that name a moved function by file ("app.js growStrip") are updated to the new file.
- **No new dependencies. English only** in code and docs.
- **Line numbers** below refer to the files at commit `07884c5`. After the first move they shift, so find items
  by name. `git show 07884c5:src-tauri/src/registry.rs` and `git show 07884c5:ui/app.js` show the originals.
- **One commit per task** (Task 1 makes two). Do not squash the rename in Task 1 into anything else: a pure
  rename keeps `git blame`.

---

## Part A: `registry.rs` into `registry/`

Final layout (each line gives the items it holds):

| File | Holds |
|---|---|
| `registry/mod.rs` | `Session`, `Helper`, `Context`, `Limit`, `TurnSummary`, `tests_session`, `mod` lines, re-exports; serialisation tests |
| `registry/files.rs` | `FileStat`, `stat`, `list_subagents`, transcript paths (`slug`, `direct_transcript`, `find_transcript`), `file_tail`, tail sizes |
| `registry/tail.rs` | what a transcript tail says: `Tail`, `read_tail`, `task_line`, `context_of`, `compacted_at`, `turn_done`, `ends_with_question`, `pending_ask`, `title_of`, `limit_of`, `reset_after`, `iso_utc_ms`, `clip` and its helpers |
| `registry/helpers.rs` | subagents: `HelperMeta`, `helper_meta`, `read_helper`, `active_helpers`, `parse_completions`, `Completions`, `tail_appended` |
| `registry/sessions.rs` | `~/.claude/sessions` records: `RawRecord`, `parse_record`, `dept_of`, `folder_of`, `normalize_status`, `Scan`, `scan`, `merge`, `track_compaction` |
| `registry/tracker.rs` | `Tracker`, `STALE_MS` |
| `registry/prompt.rs` | what may come from or go to a terminal/shell: `Prompt`, `parse_permission_prompt`, `valid_orca_handle`, `valid_claude_web_url` |
| `registry/testutil.rs` | `#[cfg(test)]` fixtures shared across these modules' tests |

The final re-export block in `mod.rs` (built up one task at a time):

```rust
mod files;
mod helpers;
mod prompt;
mod sessions;
mod tail;
#[cfg(test)]
mod testutil;
mod tracker;

pub use files::{direct_transcript, file_tail, find_transcript, list_subagents, stat, FileStat};
#[cfg(test)]
pub(crate) use files::slug; // only chronicle.rs's tests reach it from outside
pub use helpers::{active_helpers, read_helper, Completions};
pub(crate) use helpers::helper_meta;
pub use prompt::{parse_permission_prompt, valid_claude_web_url, valid_orca_handle, Prompt};
pub use sessions::{merge, scan, track_compaction};
pub use tail::{read_tail, Tail};
pub(crate) use tail::{clip, iso_utc_ms};
pub use tracker::{Tracker, STALE_MS};
```

Every name in that block is used outside `registry` today, as `grep -rn "registry::" src-tauri/src` shows
(`main.rs`, `poller.rs`, `chronicle.rs`, `demo.rs`, `toast.rs`; `remote.rs` uses none).
- If a re-export still warns "unused import" in `cargo build`, gate it with `#[cfg(test)]` when only tests use it
  (as with `slug`), or drop it if nothing uses it. Never add `#[allow]`.
- Re-exports match the item's own visibility: `pub(crate)` items get `pub(crate) use`.
- Sibling modules import from the defining sibling (`use super::files::{file_tail, TAIL_BYTES};`), not through
  `mod.rs`'s re-exports, so each file's dependencies are visible at its top.

Rules for every Rust task:
- An item that moves out of `mod.rs` and is still used by `mod.rs` or a sibling becomes `pub(super)` if it was
  private. The ones that need it are listed per task. Private items that stay inside one file keep their
  visibility.
- Structs with private fields move together with their `impl` (`Tracker`, `Completions`) and with every function
  that reads those fields. `HelperMeta`'s private `description` and `model` are read by `read_helper`, so these
  three go together.
- A test moves into a `#[cfg(test)] mod tests { use super::*; use crate::registry::testutil::*; … }` at the end of
  the file holding the code it tests. Test bodies are unchanged. Test-only helpers used by one file move with its
  tests.
- After each task, trim `mod.rs`'s top-level `use` lines and the test module's `use std::{…}` to what is still
  used. This is where the warnings come from.

### Task 1: `registry/` directory, shared test fixtures, `prompt.rs`, `tracker.rs`

**Files:**
- Rename: `src-tauri/src/registry.rs` to `src-tauri/src/registry/mod.rs`
- Create: `src-tauri/src/registry/testutil.rs`, `src-tauri/src/registry/prompt.rs`, `src-tauri/src/registry/tracker.rs`
- Modify: `src-tauri/src/registry/mod.rs`

**Steps:**
- [ ] **Baseline.** In `src-tauri`, confirm the numbers from Global Constraints still hold before touching
  anything:
  - `cargo test -- --list 2>/dev/null | grep -c ': test$'` is 133
  - `cargo test registry:: -- --list 2>/dev/null | grep -c ': test$'` is 65
  - `cargo test --no-run 2>&1 | grep -c '^warning'` is 0
  - `cargo build 2>&1 | grep -c '^warning'` is 0
- [ ] `git mv src-tauri/src/registry.rs src-tauri/src/registry/mod.rs`. Make no other change. Run `cargo build`
  and `cargo test` (`main.rs`'s `mod registry;` resolves the directory as is). Commit:
  `Refactor: registry.rs becomes registry/mod.rs (rename only)`.
- [ ] **`testutil.rs`** (`//! Test fixtures shared by the registry modules' tests.`). Move these out of
  `mod tests` and make each one `pub(super)`:

  | Item | Original lines |
  |---|---|
  | `tool` | 1000-1002 |
  | `tail_of` | 1143-1145 |
  | `temp_dir` | 1151-1156 |
  | `session` | 1162-1164 |
  | `REAL_SHELL_TAIL` | 1384-1406 |
  | `turn_ending`, with its `///` line | 1420-1434 |
  | `COMPACT_TAIL`, with its comment line | 1651-1658 |
  | `with_ctx` | 1678-1680 |

  - Imports: `use super::{read_tail, Context, Session, Tail}; use std::{fs, path::PathBuf};`.
  - Add `#[cfg(test)] mod testutil;` to `mod.rs`.
  - In `mod tests`, add `use super::testutil::*;` and trim its `use std::{…}`. For example, `PathBuf` is then
    unused there.
  - `record` (1158-1160), `helpers_in` (1147-1149), `write_with_age` and `ms_ago` (1307-1314) stay local. Each
    is used by one future module's tests only.
- [ ] **`prompt.rs`** (`//! What a terminal screen may be read as, and what may be handed to the shell or Orca.`).
  - Move `valid_orca_handle` and `valid_claude_web_url` (775-784), `Prompt` (869-879) and
    `parse_permission_prompt` (880-923). Nothing to import.
  - Tests move into `prompt.rs`'s own `mod tests`: `orca_handle_validator` (1519-1525),
    `claude_web_url_validator` (1527-1535), the four screen consts `BASH_PROMPT`, `EDIT_PROMPT`, `WRITE_PROMPT`
    and `NO_PROMPT` with their comment (1537-1580), `prompt_*` (1582-1637), and
    `permission_prompt_real_bash_screen_2_1_283` (1765-1777).
  - In `mod.rs`: `mod prompt;` and
    `pub use prompt::{parse_permission_prompt, valid_claude_web_url, valid_orca_handle, Prompt};`.
- [ ] **`tracker.rs`** (`//! Which petitions, questions and usage limits are new this tick: each notifies once per episode.`).
  - Move `Tracker` with its doc comment and `impl` (797-865), and `STALE_MS` (867).
  - Imports: `use super::Session; use std::collections::{BTreeMap, HashSet};`.
  - Tests: `tracker_asks_once_per_question_episode` (1490-1499), `stale_petition_fires_once_after_five_minutes_per_episode`
    (1639-1649), `tracker_fires_once_per_episode_and_again_on_a_new_one` (1712-1719), `limit_waves_toast_once`
    (1752-1763). They use `session` from `testutil`. `limit_waves_toast_once` also needs `Limit`, which
    `tracker.rs` does not import: add `use crate::registry::Limit;` to its tests module.
  - In `mod.rs`: `mod tracker; pub use tracker::{Tracker, STALE_MS};`, and drop `BTreeMap` from the top `use`.
- [ ] Run the gates. The test count is unchanged: the tests now list as `registry::prompt::tests::…`,
  `registry::tracker::tests::…`, and so on.
- [ ] Commit: `Refactor: registry test fixtures, prompt.rs and tracker.rs split out`.

**Callers:** none change. `main.rs` keeps `use registry::{Session, Tracker}`, `registry::valid_orca_handle`,
`registry::Prompt`, `registry::parse_permission_prompt` and `registry::STALE_MS`.

### Task 2: `registry/files.rs`

**Files:** Create `src-tauri/src/registry/files.rs`. Modify `registry/mod.rs`.

- [ ] Create `files.rs` (`//! Transcript files: one stat, the subagents listing, where a session's transcript lives, its last bytes.`).
  Move these items:

  | Item | Original lines |
  |---|---|
  | `FileStat` | 25-31 |
  | `mtime_ms` (stays private) | 33-35 |
  | `stat` | 37-41 |
  | `list_subagents` | 43-58 |
  | `TAIL_BYTES`, `BIG_TAIL_BYTES` (become `pub(super)`: `read_tail` and `read_helper` still use them) | 742-743 |
  | `slug` (stays `pub(crate)`) | 745-749 |
  | `direct_transcript` | 751-754 |
  | `find_transcript` | 756-761 |
  | `file_tail` | 763-773 |

  - Imports: `use std::{fs, path::{Path, PathBuf}, time::UNIX_EPOCH};`.
- [ ] Tests into `files.rs`: `transcript_direct_slug_path` (1200-1204) and
  `transcript_found_in_any_project_and_tail_cut_to_whole_lines` (1206-1218). They use `temp_dir` from `testutil`.
- [ ] `mod.rs`:
  - `mod files;`
  - `pub use files::{direct_transcript, file_tail, find_transcript, list_subagents, stat, FileStat};`
  - `#[cfg(test)] pub(crate) use files::slug;`. Check whether `cargo build` warns without the cfg. If it doesn't,
    keep it plain `pub(crate) use`.
  - `use files::{BIG_TAIL_BYTES, TAIL_BYTES};` for the code still in `mod.rs` (`read_tail`, `read_helper`).
  - Trim `UNIX_EPOCH` and `PathBuf` from the top `use` once unused. The tests module still needs `UNIX_EPOCH`
    (`helpers_in`, `ms_ago`, until Task 4), so give it its own `use std::time::UNIX_EPOCH;` when the top import
    goes.
- [ ] Run the gates (count unchanged). Commit: `Refactor: registry/files.rs (transcript paths, stat, tail bytes)`.

**Callers:** `poller.rs` (`registry::stat`, `file_tail`, `direct_transcript`, `find_transcript`, `list_subagents`,
`FileStat`) and `chronicle.rs` (`registry::{self, FileStat}`, `registry::stat`, `registry::slug` in tests) are
unchanged.

### Task 3: `registry/tail.rs`

**Files:** Create `src-tauri/src/registry/tail.rs`. Modify `registry/mod.rs`.

- [ ] Create `tail.rs` (`//! What a session's transcript tail says: last task, context, turn state, question, petition, usage limit.`).
  Move these items:

  | Items | Original lines |
  |---|---|
  | `context_of`, `compacted_at`, `iso_utc_ms` (stays `pub(crate)`) | 131-184 |
  | `turn_done`, `ends_with_question` | 343-408 |
  | `clip` (stays `pub(crate)`), `clip_to`, `field`, `first_string`, `basename`, `host`, `tool_detail`, `ask_line`, `injected`, `task_line`, `title_of`, `pending_ask` | 437-573 |
  | `is_shell_call` (becomes `pub(super)`: `scan` uses it) | 575-578 |
  | `limit_of`, `reset_after` | 580-623 |
  | `Tail`, `read_tail` | 630-672 |

  - Imports: `use super::files::{BIG_TAIL_BYTES, TAIL_BYTES}; use super::{Context, Limit}; use chrono::{Local, TimeZone}; use std::collections::HashSet;`
    (`HashSet` is for `pending_ask`).
- [ ] Tests into `tail.rs`:

  | Tests | Original lines |
  |---|---|
  | `task_line_*` (6 tests) | 968-998, 1004-1047 |
  | `title_is_newest_ai_title` | 1049-1060 |
  | `pending_ask_is_unanswered_tool_use` | 1062-1081 |
  | `shell_call_is_bash_or_powershell_only` | 1083-1090 |
  | `context_of_*` (3) | 1105-1134 |
  | `read_tail_retries_with_bigger_tail_when_newest_line_overflows` | 1220-1226 |
  | `turn_done_*` (2) | 1408-1418 |
  | `question_*` (5) | 1436-1475 |
  | `compacted_at_reads_newest_boundary_timestamp_as_ms` | 1660-1668 |
  | `usage_limit_lines` | 1721-1750 |

  - Fixtures come from `testutil`: `tool`, `turn_ending`, `REAL_SHELL_TAIL`, `COMPACT_TAIL`.
- [ ] `mod.rs`:
  - `mod tail;`
  - `pub use tail::{read_tail, Tail};`
  - `pub(crate) use tail::{clip, iso_utc_ms};`
  - `use tail::{context_of, is_shell_call};` for what is still in `mod.rs` (`read_helper`, `scan`;
    `parse_completions` needs `iso_utc_ms`, which the `pub(crate) use` already brings into scope).
  - Drop `chrono` from the top `use`.
- [ ] Run the gates (count unchanged). Commit: `Refactor: registry/tail.rs (what a transcript tail says)`.

**Callers:** `poller.rs` (`registry::read_tail`, `Tail`) and `chronicle.rs` (`registry::iso_utc_ms`,
`registry::clip`) are unchanged.

### Task 4: `registry/helpers.rs`

**Files:** Create `src-tauri/src/registry/helpers.rs`. Modify `registry/mod.rs`.

- [ ] Create `helpers.rs` (`//! Subagents: which are active, what each is, and which the parent transcript reports completed.`).
  Move lines 203-341 as one block:
  - `HelperMeta` (stays `pub(crate)`, private fields kept)
  - `helper_meta` (stays `pub(crate)`)
  - `HELPER_SAFETY_CAP_MS`, `RESUME_GRACE_MS`, `agent_id`, `active_helpers`, `read_helper`, `parse_completions`,
    `tail_appended`, `FIRST_SIGHT_BYTES`
  - `Completions` with its `impl`

  Imports: `use super::files::{file_tail, FileStat, TAIL_BYTES}; use super::tail::{clip, context_of, iso_utc_ms}; use super::Helper; use serde::Deserialize; use std::{collections::{HashMap, HashSet}, fs, path::Path};`.
- [ ] Tests into `helpers.rs`:
  - `helpers_in` (1147-1149), `write_with_age` and `ms_ago` (1307-1314), now private to these tests.
  - `active_helpers_*` (1253-1353; 8 tests), `parse_completions_reads_task_notification_lines` (1355-1364),
    `completions_scan_is_incremental_and_merges_across_polls` (1366-1382).
  - Test imports: `use super::*; use crate::registry::testutil::*; use crate::registry::files::{list_subagents, stat}; use std::{fs, io::Write, time::{Duration, SystemTime, UNIX_EPOCH}};`.
- [ ] `mod.rs`:
  - `mod helpers;`
  - `pub use helpers::{active_helpers, read_helper, Completions};`
  - `pub(crate) use helpers::helper_meta;`
  - Trim the top `use` (`HashMap`, `fs`, `Deserialize` if no longer used there).
- [ ] Run the gates (count unchanged). Commit: `Refactor: registry/helpers.rs (subagents and completions)`.

**Callers:** `poller.rs` (`registry::Completions`, `active_helpers`, `read_helper`) and `chronicle.rs`
(`registry::helper_meta(path).agent_type`) are unchanged.

### Task 5: `registry/sessions.rs`, `mod.rs` in its final shape

**Files:** Create `src-tauri/src/registry/sessions.rs`. Modify `registry/mod.rs`.

- [ ] Create `sessions.rs` (`//! One pass over ~/.claude/sessions into the roster, merged with the last tick's.`).
  Move these items:

  | Item | Original lines |
  |---|---|
  | `RawRecord` (stays `pub`, not re-exported: nobody outside uses it) | 10-23 |
  | `track_compaction` | 186-201 |
  | `parse_record`, `dept_of`, `folder_of` (private), `normalize_status` | 410-435 |
  | `Scan` | 625-628 |
  | `scan` | 674-740 |
  | `merge` | 786-795 |

  - Imports: `use super::tail::{is_shell_call, Tail}; use super::{Helper, Session}; use serde::Deserialize; use std::{fs, path::Path};`.
- [ ] Tests into `sessions.rs`:

  | Tests | Original lines |
  |---|---|
  | `LIVE` const | 935 |
  | `parse_record_*` (2), `dept_is_last_path_segment`, `unknown_status_is_idle` | 937-966 |
  | `scan_sets_title_always_and_asks_only_while_waiting` | 1092-1103 |
  | `record` helper | 1158-1160 |
  | `scan_keeps_live_…`, `scan_of_missing_dir_is_empty`, `scan_skips_unreadable_pid_if_dead` | 1166-1198 |
  | `scan_fills_session_context_from_the_same_tail` | 1228-1235 |
  | `merge_keeps_previous_state_for_unreadable_file` | 1245-1251 |
  | `scan_sets_question_only_for_a_foreground_idle_session` | 1477-1488 |
  | `scan_turns_finished_shell_into_idle_background`, `scan_fills_orca_handle_and_web_url` | 1501-1517 |
  | `scan_fills_compacted_at_from_the_tail` | 1670-1676 |
  | `track_compaction_carries_marker_and_falls_back_to_a_token_drop` | 1682-1704 |

  - Fixtures come from `testutil`: `tool`, `tail_of`, `temp_dir`, `session`, `turn_ending`, `REAL_SHELL_TAIL`,
    `COMPACT_TAIL`, `with_ctx`. The tests also use `Context` (`use crate::registry::Context;`) and `std::fs`.
- [ ] `mod.rs` now holds only the following. Its only top-level import left should be `use serde::Serialize;`.
  - the five types (60-129), with their doc comments;
  - `tests_session` (925-929, unchanged, `#[cfg(test)] pub`: `chronicle.rs` and `toast.rs` tests call it);
  - the final `mod` and re-export block shown at the top of Part A;
  - `mod tests` with only `session_serializes_context_as_camel_case` (1237-1243) and
    `session_serializes_compacted_at_as_camel_case` (1706-1710). They use `session` and `with_ctx` from
    `testutil`.
  - Add one `//!` line at the top of `mod.rs`: `//! The roster's data: what Claude Code's session files and transcripts say, read without side effects.`
- [ ] Run the gates. `cargo test registry:: -- --list | grep -c ': test$'` is still 65, and the crate total equals
  the Task 1 baseline. `wc -l src-tauri/src/registry/*.rs`: no file is over about 700 lines (`tail.rs`, the
  largest, is about 350 lines of code plus its tests).
- [ ] Commit: `Refactor: registry/sessions.rs; registry/mod.rs keeps the types and re-exports`.

**Callers:** `poller.rs` (`registry::scan`, `merge`, `track_compaction`) is unchanged. Comments: the
`src-tauri/src/registry.rs` mentions are all in `.superpowers/sdd/` history files. Leave them alone.

---

## Part B: `ui/app.js` into modules

`app.js` module-level mutable state, and which code shares it. This decides every cut:

| State (line) | Written by | Read by |
|---|---|---|
| `chromeSet` (29) | `applyChrome` | `applyChrome` only. Moves with it (Task 6). |
| `scale`, `size`, `hall`, `viewW/H`, `pan`, `lag`, `viewCentre`, `autoScale` | `fit`, `applySize`, `relayout`, `onRoster`, pan code | frame, every overlay sync, `actorAt`, `centreFloor`. Stays: too widely shared. |
| `through`, `grownTo`, `bootStrip`, `switching` (108, 121-122, 148) | strip window code only | strip window code only. Moves (Task 8). |
| `hallFloor`, `refloor` (184) | `onView`, `resize` | view fitting. Stays. |
| `mouse` (867) | `onView`, `strip-cursor` listener, `pointermove`, `pointerleave` | `syncHover`. Stays, so the `strip-cursor` listener stays in `app.js`. |
| `tweens` (519) | `tween`, `glide`, `resetCast` (`clear`) | `gliding`, `pose`. Moves (Task 7), with `clearGlides()` for `resetCast`. |
| `layout` (474) | `onRoster`, `resetCast` | frame, `glide`, `renderPlaques`, `relayout`. Stays; passed to `glide(layout, now)`. |
| `roster` (483) | `onRoster` | `onRoster`, `consolesOf`, `deptHead`, `relayout`, `renderPlaques`, card code. Stays; the card reads it through a getter hook. |
| `sel` (484) | `renderCard`, `answer`, `select`, `closeCard` (all card code) | card code, `syncLabels`, `syncHover`. Moves (Task 9) as `export let sel`, a live binding `app.js` only reads. |
| `actions`, `probed`, `answerErr`, `answering`, `peeked`, `expanded` | card code | card code. Moves (Task 9). |
| `level`, `sun`, `sunDay`, `state`, `audio` | modes, sun, mute, chime | frame (`level`), `initSettings` hooks (`state`, `sunDay`). Stays (see "Not extracted"). |

**Not extracted, and why:**
- **Plaques, labels, tags, edges, hover** (`renderPlaques`, `syncLabels`, `syncTags`, `syncEdges`, `syncHover`,
  `actorAt`). Every one reads `scale`, `at()`, `feet()`, `pan`, `viewW/H`, `hall`, `layout` and `cast`. Several of
  those are reassigned `let`s in `fit` and `onRoster`. A module would need about eight getters, which adds coupling
  rather than removing it.
- **Pan and fit.** This is the core view state above.
- **Light modes and sun** (207-235). `level` is read by the frame, `state` is shared with mute and the
  `initSettings` hooks, and `hhmm` is shared with `sealText`. The gain is small.
- **Chime and mute** (913-944). A clean leaf, but its mute check reads `state.muted`, which is shared with
  `initSettings`. It is 30 lines, so leave it.

Rules for every JS task:
- Nothing runs when a new module is imported. It exports functions, and `app.js` calls them where the moved
  code used to run.
- **Free-identifier check (mechanical).** Before running anything, list every identifier the moved code uses.
  Confirm each one is defined in the new file, imported at its top, or a browser global. A missing import inside
  a function body only throws when that function runs, and no node test imports `app.js`. Then confirm `app.js`
  no longer references a moved name except through its new import, and drop imports `app.js` no longer uses.
- **Text-key count.** Count the `t('…')` keys across the scanned files. It must be **21** before and after,
  with the new file added to `ui/theme.test.mjs`'s list where the task says so:
  `node -e "const fs=require('fs');const s=new Set();for(const f of process.argv.slice(1))for(const m of fs.readFileSync('ui/'+f,'utf8').matchAll(/\b(?:t|say)\('([a-zA-Z.-]+)'/g))s.add(m[1]);console.log(s.size)" app.js chronicon.js <new files…>`
- **Browser check** after each task (see "Manual check" at the end): no console errors at boot, and the moved
  feature exercised.

### Task 6: `ui/chrome.js`: the page follows the theme

**Files:** Create `ui/chrome.js`. Modify `ui/app.js`, `ui/theme.test.mjs` (line 103 list), and comments in
`ui/index.html:21`, `ui/theme.js:79` and `:96`, `src-tauri/src/toast.rs:1` and `src-tauri/src/main.rs:243`
("app.js applyChrome", "applied by app.js", "(app.js)" become chrome.js).

- [ ] Create `ui/chrome.js` (`// The page's chrome follows the theme: CSS colours, marked texts, toast wording, the riveted backdrop.`).
  Move:
  - `chromeSet` and `applyChrome` (app.js 27-42, with the comment at 27-28);
  - `backdrop` (376-384, with the comment at 376).
- [ ] Exports: `applyChrome`, `backdrop`. Imports: `import { T, t } from './theme.js'; import { invoke, REMOTE } from './bridge.js';`.
- [ ] `app.js`:
  - `import { applyChrome, backdrop } from './chrome.js';`
  - Keep `applyChrome(); onTheme(applyChrome);` at 43-44 and `backdrop(); onTheme(backdrop);` at 385-386
    exactly where they are. This keeps the `onTheme` listener order and keeps `backdrop()` running after
    `setTheme(saved)`.
- [ ] Shared state: `chromeSet` is private to `chrome.js`. Nothing else crosses the boundary.
- [ ] `ui/theme.test.mjs` line 103: `['app.js', 'chrome.js', 'chronicon.js']`. Key count still 21.
- [ ] Run the gates and the browser check: the theme switch in Settings recolours the chrome and the backdrop
  tile, and the header texts change wording (e.g. theme `xenos`).
- [ ] Commit: `Refactor: chrome.js (theme chrome and backdrop out of app.js)`.

### Task 7: `ui/glide.js`: reflow tweens

**Files:** Create `ui/glide.js`. Modify `ui/app.js`.

- [ ] Create `ui/glide.js` (`// Reflows glide: rugs, desks and consoles ease to their new place over GLIDE_MS.`).
  Move app.js 516-544 verbatim: the comment, `GLIDE_MS`, `tweens`, `ease`, `XYWH`, `same`, `tween`, `pose`,
  `gliding`, `glide`.
- [ ] Interface:
  - `export function glide(layout, now)`. The single change in moved code: `layout` becomes a parameter instead
    of the `app.js` module `let`.
  - `export const gliding`.
  - `export const clearGlides = () => tweens.clear();`.
  - No imports.
- [ ] `app.js`:
  - `import { glide, gliding, clearGlides } from './glide.js';`
  - `resetCast` (476-479): `tweens.clear()` becomes `clearGlides()`.
  - `frame` (442): `glide(now)` becomes `glide(layout, now)`.
  - `busy` keeps `gliding(now)`.
- [ ] Shared state: `tweens` is private to `glide.js`, and its one outside writer (`resetCast`) goes through
  `clearGlides`.
- [ ] Run the gates and the browser check: with `tools/preview.html`, change `n` or resize the window. Desks glide
  to their new places instead of jumping.
- [ ] Commit: `Refactor: glide.js (reflow tweens out of app.js)`.

### Task 8: `ui/stripwin.js`: the desktop strip's window

`ui/strip.js` is pure geometry with no imports, and `ui/strip.test.mjs` runs it under node. It must not gain DOM or
Tauri code, so the window side goes into a new `ui/stripwin.js`.

**Files:** Create `ui/stripwin.js`. Modify `ui/app.js`, and comments in `ui/index.html:71` ("app.js growStrip")
and `ui/settings.js:40` ("app.js stripScale"), `:60` ("app.js calls this"), `:111` ("app.js toggleStrip").

- [ ] Create `ui/stripwin.js` (`// The desktop strip's window: on/off the taskbar, its height, click-through, the handle's menu.`).
  Move these from `app.js` (`strip()` at line 67 stays in `app.js`, which still uses it widely; `stripwin.js`
  defines its own one-line `const strip = () => viewMode.strip;`):

  | Item | Original lines |
  |---|---|
  | `stripScale`, `stripCss` | 68-69 |
  | `through`, `HIT`, `stripHit`, `setThrough`, with the comment | 106-118 |
  | `grownTo`, `bootStrip`, `placeStrip`, `enterStrip`, `leaveStrip`, with the comments | 119-145 |
  | the `switching` chain and its comment | 146-148 |
  | `growStrip` and its comment | 149-156 |
  | the observer block, into `initStripWin` | 157-161 |
  | `toggleStrip` | 162-167 |
  | the handle and menu: `stripMenu`, `stripHandle` (looked up in `initStripWin`), `showMenu`, `stripHandle.onclick`, `stripMenu.onclick`, and the window `click`/`keydown` listeners that close the menu; the wiring goes into `initStripWin` | 168-180 |
  | from line 967, the browser-only removal of the menu's hide entry, into `initStripWin` as `if (!tauri()) stripMenu.querySelector('[data-act="hide"]').remove(); // no window to hide in a browser` | 967 |

- [ ] Interface:
  - `export function initStripWin({ actorAt, fromStrip })`. It stores `actorAt` for `stripHit`, sets
    `bootStrip = fromStrip`, looks up `stripMenu` and `stripHandle`, wires the observers, handle, menu and the two
    window listeners, and removes the hide entry outside Tauri.
  - `export function switchStrip(on)`. It replaces the inline chain in `onView`:
    `switching = switching.then(() => (on ? enterStrip() : leaveStrip())).catch(err => console.warn('strip switch', err));`.
    The chain stays private, so "a leave queued behind an enter" ordering is unchanged.
  - Also exported: `stripScale`, `stripHit`, `setThrough`, `growStrip`, `toggleStrip`, `showMenu`.
- [ ] Imports: `import { STRIP_H } from './strip.js'; import { settings, store, applyTop } from './settings.js'; import { view as viewMode, setView } from './view.js'; import { invoke, tauri } from './bridge.js';`.
- [ ] `app.js`:
  - `import { initStripWin, switchStrip, stripScale, stripHit, setThrough, growStrip, toggleStrip, showMenu } from './stripwin.js';`
  - Where the strip block was (after `background()`, about line 106), call
    `initStripWin({ actorAt, fromStrip: saved === 'strip' });`. `actorAt` is a hoisted function declaration, and
    this keeps the window `click`/`keydown` listener order ahead of the card's.
  - `onView` (192): `if (tauri()) switchStrip(mode === 'strip');`. Keep `showMenu(false)` at 193.
  - `fit` keeps `stripScale()`; `syncHover` keeps `setThrough(!stripHit(…))`.
  - The `strip-cursor` listener (858-863) stays in `app.js`, because it writes `mouse`. It calls the imported
    `setThrough` and `stripHit`.
  - The `rescaled` hook keeps `growStrip()`, and the `ui-command` map keeps `toggleStrip`.
  - Line 967 becomes `else hideBtn.remove();`.
  - Drop `applyTop` from the `settings.js` import if unused.
- [ ] Shared state: `through`, `grownTo`, `bootStrip`, `switching`, `stripMenu`, `stripHandle` and the stored
  `actorAt` are private to `stripwin.js`. `mouse` stays in `app.js`. No `app.js` `let` is assigned from
  `stripwin.js`.
- [ ] Run the gates and the browser check (hall views only: at `:8123`, `tauri()` is false and the strip is never
  entered). Then the **installed-app check** in "Manual check": enter and leave the strip, click-through, growing.
- [ ] Commit: `Refactor: stripwin.js (the strip's window out of app.js; strip.js stays pure)`.

### Task 9: `ui/card.js`: the selected character's card and petition answers

**Files:** Create `ui/card.js`. Modify `ui/app.js`, `ui/theme.test.mjs` (line 103 list), and the comment at
`ui/settings.js:54` ("app.js (context windows)" becomes card.js).

- [ ] Create `ui/card.js` (`// The selected character's card: status, context, turn, links, and answering permission petitions.`).
  Move from `app.js`:

  | Items | Original lines |
  |---|---|
  | `windowOf`, `fillOf`, `kM`, `contextLine`, `modelName`, `rankLine` | 463-469 |
  | `sel` | 484 |
  | `ago` | 486-490 |
  | `renderCard`, `renderAsks`; `expanded`, `span`, `filesOf`, `renderTurn` | 597-672 |
  | `answerable`, `actions`, `probed`, `probeActions`, `canAnswer`, `episode`, `answerErr`, `answering`, `answer`, `peeked`, `peek`, `renderAnswer` | 674-728 |
  | `renderLinks`, `select` | 730-744 |
  | `ownerOf`, `openTarget`, `pick`, `closeCard` | 892-903 |

- [ ] Interface:
  - `export let sel = null;`. Every writer (`renderCard`, `answer`, `select`, `closeCard`) moves here, so `app.js`
    reads it through the ES live binding and never assigns it. That would be a TypeError, and the free-identifier
    check catches it.
  - `export function initCard({ cast, roster })`. `roster` is a getter, `() => roster`, because `app.js`
    reassigns its `roster` in `onRoster`. The moved code's four `roster` reads (`renderCard` twice, `select`,
    `ownerOf`) become `rosterOf()`, where `rosterOf` is the stored getter. That is the only change inside moved
    code.
  - Also exported: `fillOf` (the frame passes it to `drawScene`), `ago` and `canAnswer` and `answer` and `pick`
    (`syncLabels`), `filesOf` (`sheetText`), `renderCard`, `answerable`, `probeActions` (`onRoster`), `closeCard`
    (canvas click, the outside-click listener, Escape).
  - Private: `select`, `openTarget`, `ownerOf`, `peek`, the `render*` helpers, and the formatting helpers.
- [ ] Imports: `import { T, t } from './theme.js'; import { rankOf } from './sprites.js'; import { isQuestion } from './actors.js'; import { settings } from './settings.js'; import { invoke, REMOTE, remoteActions } from './bridge.js';`.
- [ ] `app.js`:
  - `import { initCard, sel, fillOf, ago, filesOf, renderCard, answerable, probeActions, canAnswer, answer, pick, closeCard } from './card.js';`
  - Call `initCard({ cast, roster: () => roster });` right after `let roster = [];` (483). `cast` is declared at
    471, and no `renderCard` can run before then: the first `onRoster` comes from `fit()` at 948, a roster event,
    or the async `strip_supported` reply.
  - Drop `rankOf` and `remoteActions` from the imports. Keep `isQuestion`, `isStale`, `settings` (the frame's
    `stripBackdrop`) and `hhmm` (`sealText`, `sunLine`).
- [ ] `ui/theme.test.mjs` line 103: `['app.js', 'chrome.js', 'card.js', 'chronicon.js']`. Key count still 21.
- [ ] Run the gates and the browser check with `tools/preview.html?n=12`:
  - click a scribe: the card opens with name, status, context and turn line;
  - click an adept: the "adept of" card;
  - the petition labels show for waiting scribes, and clicking one selects it (`sel` outline on the label);
  - click outside or press Escape: the card closes;
  - repeat once with `&view=39`.
- [ ] Commit: `Refactor: card.js (card and petition answers out of app.js)`.

---

## scene.js: no split

`ui/scene.js` (911 lines) has no clean cut worth making now:
- **Effects** (`bundle`, `flare`, `puff`, `seal`, `stamp`, `courier`, `spark`, `glint`, 440-622) read the
  per-frame `H` (`courier` uses `H.entry`) and the theme-rebuilt `SK`. A module would need a getter back into
  `scene.js`, which makes a circular import.
- **Paper piles** (`deskFill`, `pileOf`, `paperTop`, `paperFloor`, `prunePiles`, 192-201, 312-438) are the only
  near-clean cut. That module would rebuild `PAPER` and clear `piles` in its own `onTheme`, and `beginFrame`
  would call its exported `prunePiles`. But `lastFill` is shared between `deskFill` and `prunePiles`, `fromArt`
  sets `PAPER` along with the other anchors, and `scene39.js` reaches all of it through `import * as S`, so it
  would need `export { … } from` re-exports (the `wallart` re-export at line 60 is the precedent).
- About 250 lines would move for one module boundary and a second `onTheme` ordering to keep straight. Revisit it
  only if the paper code grows.

---

## Manual check

For every JS task (6-9), check the browser:
- Serve the repo root in the background: `python -m http.server 8123` (skip it if port 8123 already answers).
- Open `http://localhost:8123/ui/index.html` (empty hall). It boots with **no console errors**, and the
  `window.ADM_BOOTED` watchdog in `index.html` shows no error box.
- Open `http://localhost:8123/tools/preview.html?n=12`. It has a fake backend and a roster every second, with
  waiting scribes and adepts. Exercise what the task moved:
  - theme switch (Task 6);
  - reflow glide (Task 7);
  - card, petition labels, select and close (Task 9);
  - also once with `&view=39`.
- Neither page can enter the strip:
  - In `ui/index.html`, `tauri()` is false.
  - `preview.html` installs a fake `window.__TAURI__`, so `tauri()` is truthy there. But its backend rejects
    `strip_supported`, so Settings > View never shows Strip (`settings.js:129`).
  - Because of the fake backend, the hide-entry removal from Task 8 does not run in `preview.html`. It does run in
    `ui/index.html`: the handle menu's Hide entry must be gone there.

**Task 8 needs the installed app.** Build and reinstall it the repo's usual way:
1. In `src-tauri`: `cargo tauri build` with the signing key env vars.
2. Quit the running app.
3. Run `target/release/bundle/nsis/Administratum_<version>_x64-setup.exe /S`.
4. Relaunch the app.

Then check the strip:
- Tray check item into the strip: the window lands on the taskbar.
- Hover: empty strip clicks pass through to the taskbar, and a scribe, label or plaque takes the click.
- Open a card or the handle's menu: the window grows upward, then shrinks when it closes.
- Handle menu, then Hall view: back to the old hall rect and view.
- Switch back and forth quickly a few times: no stuck size, and the menu state is right.
- Restart while in the strip: it comes back in the strip, and leaving it restores the last hall rect, not the
  strip's.

Rust tasks (1-5) need no UI check, but finish with one `cargo build` of the full app.
