# Monitoring (O1–O3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-session token alerts and a week view (O1), stuck-session detection (O2), and an end-of-day report with an optional markdown capture (O3).

**Architecture:** The chronicle's Tithe gains per-session tokens and per-department turns and files (all `serde(default)`). A new pure module `src-tauri/src/monitor.rs` holds the monitoring config (read from saved settings at setup and again on every `settings_save`, so there is no new push command), the stuck rule and the once-per-episode trackers. `chronicle/report.rs` builds the day report and its markdown. The poll loop calls both; the UI shows the results with existing patterns (`syncTags`, Chronicon sections, Settings rows).

**Tech Stack:** Rust (Tauri 2, serde_json, chrono), plain ES modules, node `assert` tests.

**Spec:** `docs/superpowers/specs/2026-10-17-monitoring-design.md`

## Global Constraints

- No new dependency, no new art. Every new `Tithe` / `Share` / `Session` / `TurnSummary` field is additive with `#[serde(default)]` (or `skip`).
- Never claim to read the subscription quota; thresholds are user token counts.
- Nothing is written outside the app data dir unless `adm.reportOn` is `"1"` and `adm.reportDir` is an existing absolute folder.
- Toasts respect quiet hours (`quiet::active()`); the first tick seeds trackers without toasting.
- Settings keys and defaults: `adm.tokenAlert` "" (off), `adm.stuck` "1", `adm.stuckToast` "1", `adm.stuckMin` "15" (5–120), `adm.stuckRepeat` "5" (3–20), `adm.reportOn` "0", `adm.reportDir` "".
- Theme wording goes into the base `TEXT` in `ui/theme.js` only (other themes inherit).
- Gate before each commit: `cargo test --manifest-path src-tauri/Cargo.toml`; `for t in ui/*.test.mjs; do node "$t" || echo FAIL $t; done`; `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
- One commit per feature (O1, O2, O3), docs/DEVELOPMENT.md updated in the same commit. Never push.

## Review Focus

- A 0.6.5 day file (`*.tithe.json` without the new fields) must load with every value kept — test in Task 1.
- A restart past the token threshold or during a stuck episode must not toast again — tests in Tasks 2 and 5.
- A session whose subagent is writing is not "silent" — test in Task 5.
- `adm.reportDir` relative, missing or a file: error, nothing created — test in Task 8.
- The Vigil armed at 03:59 reports the previous day, at 04:00 the same day — test in Task 9.

---

### Task 1: Per-session tokens in the Tithe

**Files:** Modify `src-tauri/src/chronicle/mod.rs` (Tithe, `absorb`, `add_usage`, both callers, tests).

**Interfaces — Produces:**
- `#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)] pub struct SessionTithe { pub name: String, pub dept: String, pub fresh: u64, pub total: u64 }`
- `Tithe.by_session: BTreeMap<String, SessionTithe>` (`#[serde(default)]`), keyed by session id.
- `Tokens::fresh(&self) -> u64` = input + output + cache_write.
- `Chronicle::add_usage(&mut self, s: &Session, u: &Usage)` (was `dept: &str`); `absorb(&mut self, s: &Session, ...)`. Demo's `add_usage` caller passes the roster session for that dept.

- [ ] Test `old_tithe_files_still_load`: write `{"day":"2026-10-16","tokens":{...},"byProject":{"A":{"tokens":5,"busyMs":2}},"byModel":{},"busyMs":2,"hourly":[24 × {"tokens":0,"busyMs":0}]}` and `load_tithe` returns it with `by_session` empty and every old value equal.
- [ ] Test `usage_counts_per_session`: two `add_usage` for session "a" (dept "T") and one for "b"; `by_session["a"].fresh` = sum of input+output+cache_write, `.total` = sum of totals, name/dept copied.
- [ ] Run: FAIL (no field). Implement. Run `cargo test --manifest-path src-tauri/Cargo.toml chronicle`: PASS.

### Task 2: Monitor config and the token alert

**Files:** Create `src-tauri/src/monitor.rs`; modify `main.rs` (mod, setup, `settings_save`, poll loop), `toast.rs` (`Text.tokens`, `Text.stuck`), `ui/chrome.js`, `ui/theme.js` (`toast.tokens`, `toast.stuck`, `event['token-alert']`, `event.stuck`).

**Interfaces — Produces:**
- `#[derive(Clone, Debug, PartialEq)] pub struct Config { pub token_alert: Option<u64>, pub stuck: bool, pub stuck_toast: bool, pub stuck_ms: i64, pub stuck_repeat: u32, pub report_dir: Option<PathBuf> }`
- `pub fn config_from(v: &serde_json::Value) -> Config` (defaults and clamps from Global Constraints; `token_alert` None when empty, 0 or unparsable; `report_dir` Some only when `adm.reportOn == "1"` and the dir is non-empty).
- `pub fn set(c: Config)`, `pub fn get() -> Config` (a `static Mutex<Option<Config>>`, `get` defaulting to `config_from(&json!({}))`).
- `#[derive(Default)] pub struct Alerts { seen: HashSet<String> }` with `pub fn over(&mut self, tithe: &Tithe, limit: Option<u64>) -> Vec<(String, SessionTithe)>`: (id, session) pairs newly past `limit` on `fresh` (key `day:id`; `seen` keeps only today's keys).
- `toast::Text { tokens, stuck, .. }`; `set_toast_text` gains `tokens: String, stuck: String`.

- [ ] Tests in `monitor.rs`: `config_defaults_and_clamps` (`{}` → None/true/true/900_000/5/None; `"adm.stuckMin":"1"` → 300_000; `"adm.stuckRepeat":"99"` → 20; `"adm.tokenAlert":"5000000"` → Some(5_000_000); `"adm.reportOn":"1","adm.reportDir":"D:\\x"` → Some); `alert_fires_once_per_session_per_day` (over 100 → one; same again → none; new day's tithe → fires again; `None` limit → none).
- [ ] Wire: setup calls `monitor::set(monitor::config_from(&saved))`; `settings_save` re-reads the merged file and sets it. In the poll loop, after the chronicle block: `alerts.over(&c.snapshot().1, cfg.token_alert)` — on `first` discard the result (seed); otherwise toast (`toast::fill(&words.tokens, name)` with `{count}` replaced by the UI's `fmtTok`-like k/M text, body `dept · N new tokens today`, skip when quiet) and record + emit `Event::for_session(now, "token-alert", s, count)`.
- [ ] Gate: PASS.

### Task 3: Week tab and by-session bars (Chronicon) + the alert setting — **commit O1**

**Files:** `ui/chronicon.js`, new `ui/chronicon.test.mjs`, `ui/index.html` (Week tab style if needed, Settings row), `ui/settings.js`, `docs/DEVELOPMENT.md`.

**Interfaces — Produces:** `export function sumTithes(list) -> tithe` in `chronicon.js` (sums `tokens`, `busyMs`, `byProject` (tokens, busyMs), `byModel`, `bySession` (fresh, total); `hourly` dropped), importable by node (keep the module free of top-level DOM use).

- [ ] Test `chronicon.test.mjs`: `sumTithes` of two days adds every field; missing `bySession` (old file) counts as empty; `sumTithes([])` is all zeros.
- [ ] Week tab after the 7 day tabs: seven `tithe_day` calls, `summary` of the sum with *Tokens by day* (7 bars, label weekday) instead of the hourly charts, no event log. Each day and the week get *By session* bars: top 10 by `fresh`, label name, value new tokens.
- [ ] Settings > Petitions group "Monitoring": number input `tokenAlert` (placeholder "off", step 100000) stored raw in `adm.tokenAlert`.
- [ ] DEVELOPMENT.md: `monitor.rs` row, `chronicon.test.mjs` row, Chronicon Week line.
- [ ] Gate; commit `O1: per-session token counts, week view and a per-session daily token alert`.

### Task 4: The repeat run

**Files:** `src-tauri/src/registry/mod.rs` (TurnSummary), `src-tauri/src/chronicle/mod.rs` (`track_turn`).

**Interfaces — Produces:** `TurnSummary.repeat: Option<Repeat>` with `#[serde(skip)]`, `pub struct Repeat { pub tool: String, pub key: String, pub count: u32, pub msg: String }` (registry). `track_turn` updates it: per assistant line, each `tool_use` with key = `name + serde_json::to_string(input)`; same key as the run → `count += 1` unless the block's message id equals `msg` (parallel identical calls count once); different key → new run at 1; a prompt resets to None; `BashOutput`, `TaskOutput`, `KillShell`, and Bash whose `command` trimmed starts with `sleep ` or `watch ` or equals `sleep` reset to None.

- [ ] Tests: `repeat_counts_identical_calls` (3 lines Read{a} → count 3), `repeat_breaks_on_other_input` (Read{a},Read{b} → b,1), `repeat_parallel_counts_once` (one message, two identical blocks → 1), `repeat_resets_on_prompt`, `polling_tools_never_count` (5× BashOutput → None; 5× Bash `sleep 30` → None).
- [ ] cargo test: PASS.

### Task 5: The stuck rule and its toasts

**Files:** `src-tauri/src/monitor.rs`, `src-tauri/src/registry/mod.rs` (`Session.stuck`), `main.rs`.

**Interfaces:**
- Produces `#[derive(Serialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase")] pub struct Stuck { pub kind: String, pub since_ms: i64, pub tool: Option<String>, pub count: u32 }` in registry; `Session.stuck: Option<Stuck>`.
- `pub fn stuck_of(s: &Session, last_write: Option<i64>, cfg: &Config, now: i64) -> Option<Stuck>`: None unless `cfg.stuck` and `s.status == "busy"`; loop first: `s.turn.repeat` count ≥ `stuck_repeat` → kind "loop", since = turn `last_ms` or now; else silent: `last_write` Some and `now - w ≥ stuck_ms` → kind "silent", since = w. OpenCode (no files) passes None.
- `#[derive(Default)] pub struct Episodes { seen: HashSet<String> }`, `pub fn fresh<'a>(&mut self, roster: &'a [Session]) -> Vec<&'a Session>` keyed `id:kind:since`, keeping only current keys.
- Poll loop: per session `last_write` = max mtime of `poller.files[id]` (main + subagents); set `s.stuck` before emitting the roster; `episodes.fresh` on `first` seeds; else toast when `cfg.stuck_toast` and not quiet and not temp, record + emit `stuck` event (detail "silent 15m" / "loop Bash ×5").

- [ ] Tests: `stuck_needs_busy` (shell/waiting/idle → None), `silent_after_the_mark` (14m59 → None, 15m → Some silent since=w), `loop_wins_over_silent`, `no_files_no_silence` (None last_write), `disabled_is_never_stuck`, `one_toast_per_episode` (same since → once; new since → again; seeding).
- [ ] cargo test: PASS.

### Task 6: Stuck in the hall, card and settings — **commit O2**

**Files:** `ui/overlay.js` (`stuckTags`, `stuckText`), `ui/app.js` (`syncTags(stuckTags, 'stuck', stuckText, 0, -18)`), `ui/card.js` (a `.stuck` line), `ui/index.html` (tag style using theme vars, card line, Settings rows), `ui/settings.js`, `ui/theme.js` (`stuckSilent: 'stalled · {min}m'`, `stuckLoop: 'looping · {tool} ×{count}'`), `docs/DEVELOPMENT.md`.

- [ ] `stuckText(a)`: '' for helpers, leaving actors, a sealed (limit) or labelled scribe; else the theme text from `a.s.stuck` (`min` = floor((Date.now()-sinceMs)/60000)).
- [ ] Add a `ui/card.test.mjs` (or overlay test if card's helpers are not importable) assertion: the stuck line text for both kinds.
- [ ] Settings rows: checkbox `stuck`, checkbox `stuckToast` (disabled when off), numbers `stuckMin` (5–120), `stuckRepeat` (3–20), each stored as its own `adm.*` string.
- [ ] DEVELOPMENT.md: stuck in the Events paragraph and the overlay row.
- [ ] Gate; commit `O2: stuck-session detection (silent or looping), tag, card line and toast`.

### Task 7: Turns and files per department per day

**Files:** `src-tauri/src/chronicle/mod.rs`, `chronicle/opencode.rs` if `Found` changes.

**Interfaces — Produces:** `Share.turns: u32`, `Share.files: Vec<String>`, `Share.more_files: u32` (all `serde(default)`, `files` sorted, deduped, cap `MAX_DAY_FILES = 200`). `Found` gains a 4th element `Vec<(i64, String)>` (ts, path as written) filled in `extract_line` from Edit / Write / MultiEdit / NotebookEdit `tool_use` blocks (subagents included); `absorb` relativises to `s.cwd` and adds to that day's tithe; each `Turn` adds `turns += 1`.

- [ ] Tests: `day_counts_turns_and_files` (two turn_duration lines → turns 2; Edit on `<cwd>\src\a.rs` twice → files ["src/a.rs"]), `files_cap_counts_the_rest` (201 distinct → 200 + more_files 1).
- [ ] cargo test: PASS.

### Task 8: The day report and its file

**Files:** Create `src-tauri/src/chronicle/report.rs`; `chronicle/mod.rs` (`mod report; pub use`), `main.rs` (`day_report` command in `generate_handler!`).

**Interfaces — Produces:**
- `#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct DayReport { pub day: String, pub sessions: u32, pub finished: u32, pub long_tasks: u32, pub turns: u32, pub fresh: u64, pub total: u64, pub busy_ms: u64, pub depts: Vec<DeptReport>, pub notable: BTreeMap<String, u32> }`, `DeptReport { name, turns, tokens, busy_ms, files: Vec<String>, more_files }` sorted by tokens desc.
- `pub fn report(day: &str, t: &Tithe, events: &[Event]) -> DayReport`: sessions = distinct non-empty `session_id`; finished = `left` events (lifecycle already omits temp ones); long_tasks = `task-done`; notable counts kinds `commit`, `push`, `tests-fail`, `limit`, `stuck`, `token-alert`.
- `impl DayReport { pub fn markdown(&self) -> String }`: frontmatter `---\ndate: <day>\nsource: Administratum\ntags: [administratum]\n---`, `# Day report — <day>`, a summary line, `## Departments` with one `### <name>` each (turns, tokens, time, file bullets, "+N more"), `## Notable`.
- `pub fn write_capture(dir: &Path, r: &DayReport) -> Result<PathBuf, String>`: error unless `dir.is_absolute() && dir.is_dir()`; writes `<day>-administratum-day.md` via temp + rename.
- Command `day_report(day: String) -> Result<serde_json::Value, String>` returning `{ report, markdown }` (valid_day check, file reads after the lock, like `tithe_day`).

- [ ] Tests: `report_of_a_fixed_day`, `markdown_has_frontmatter_and_sections` (contains `date: 2026-10-16`, `### Terra`, `- src/a.rs`), `capture_refuses_bad_folders` (relative, missing → Err and nothing created), `capture_writes_and_overwrites`.
- [ ] cargo test: PASS.

### Task 9: Report when the Vigil arms and fires

**Files:** `src-tauri/src/vigil/app.rs`, `src-tauri/src/vigil/mod.rs` (pure `report_day`).

**Interfaces — Produces:** `pub fn report_day(now_ms: i64, local_hour: u32) -> String` in `vigil/mod.rs`: `chronicle::day_of(now_ms - 86_400_000)`-style previous day when `local_hour < 4`, else the current day (compute with chrono `Local` date minus one day, not a fixed 24 h). `app.rs` keeps the chosen day in a `static Mutex<Option<String>>` set on arm, reused on `Fire`; on both, if `monitor::get().report_dir` is Some, build the report (flush first) and `write_capture`; a failure is logged with `eprintln!` and recorded as a Chronicon `vigil` event detail `report not written: <err>`.

- [ ] Test `report_day_cutoff_is_4am` (hour 3 → yesterday, hour 4 → today).
- [ ] cargo test: PASS.

### Task 10: Day report in the Chronicon and the capture setting — **commit O3**

**Files:** `ui/chronicon.js`, `ui/index.html` (styles, Settings rows), `ui/settings.js`, `docs/DEVELOPMENT.md`, `docs/README.md` if it lists specs.

- [ ] Each day view: a `<details class="report">` under the stats with the report's lines and a *Copy as markdown* button (the `markdown` field of `day_report`). `invoke('day_report').catch(() => null)`: nothing shown on failure (remote view).
- [ ] Settings rows: checkbox `reportOn` ("Also write the day report to a folder"), text `reportDir` (absolute path, disabled when off), stored as `adm.reportOn` / `adm.reportDir`.
- [ ] DEVELOPMENT.md: `chronicle/report.rs`, the capture, `day_report` command.
- [ ] Full gate; commit `O3: end-of-day report in the Chronicon, built when the Night Vigil arms, optional markdown capture`.
