# Night Vigil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tray-armed mode that shuts the PC down once no Claude Code session can progress without a human, with a
120 s cancellable countdown played by a new Watchman character.

**Architecture:** A pure module `src-tauri/src/vigil.rs` (phase of a session, readiness rule, state machine) is
stepped once per tick inside the existing `poll_loop` in `main.rs`, which already has the roster and the transcript
mtimes. The state goes out every tick as event `vigil` (local UI + remote SSE through `emit`). The shutdown is an
injected action. The UI draws the Watchman (new art families `watch` / `watch39`, five worlds) and offers arm/cancel.

**Tech Stack:** Rust (Tauri 2, `tauri_winrt_notification`, `chrono`), plain ES modules (no build), node `assert` tests.

Spec: `docs/superpowers/specs/2026-10-09-night-vigil-design.md`.

## Global Constraints

- Quiet window `QUIET_MS = 300_000` (5 min), countdown `COUNTDOWN_MS = 120_000`: constants, not settings.
- Shutdown command, verbatim: `shutdown /s /t 0 /c "Administratum: Night Vigil"`. Never run by a test; demo mode
  (`--demo` / `ADMINISTRATUM_DEMO`) never runs it.
- Arming does not persist across an app restart.
- Deadline setting key: `adm.vigilDeadline`, minutes after midnight as a string (like `adm.quietFrom`), `""` = none.
- Chronicon event kind `vigil`; `detail` one of `armed`, `fired · <name>` (or `fired` when no name), `deadline`,
  `cancelled`, `resumed`.
- Remote endpoint `POST /api/vigil`, body `{"arm": true|false}`, same gates as `/api/answer_petition`.
- New worlds' art is drawn from scratch, never a recolour of the 40k sprite (house rule).
- Work on `main`. Another session is live in this checkout: `git add` only the paths your task names, never
  `git add -A` / `git add .`, never touch other uncommitted files. Commit and push after each task.
- Windows: set `PYTHONUTF8=1` for any Python; node scripts run as is.
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml` and `for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`.

---

### Task 1: `vigil.rs`, the pure core

**Files:**
- Create: `src-tauri/src/vigil.rs`
- Modify: `src-tauri/src/main.rs` (add `mod vigil;` next to the other `mod` lines at the top)

**Interfaces:**
- Consumes: `crate::registry::Session` (fields `status: String`, `helpers: Vec<Helper>`, `background: bool`,
  `limit: Option<Limit>`, `question: Option<String>`, `id`, `name`; derives `Default`).
- Produces:
  - `pub const QUIET_MS: i64`, `pub const COUNTDOWN_MS: i64`
  - `pub enum Phase { Working, Limit, Waiting, Idle }`, `pub fn phase(s: &Session) -> Phase`
  - `pub fn vigil_ready(sessions: &[Session], last_write: i64, calm_since: i64, now: i64) -> bool`
  - `pub fn deadline_after(now_ms: i64, now_local_min: u16, target_min: u16) -> i64`
  - `pub struct VigilState { armed: bool, deadline: Option<i64>, countdown_end: Option<i64>, forced: bool }`
    (`Serialize`, camelCase, `Clone`, `Default`, `PartialEq`, `Debug`)
  - `pub enum Step { Nothing, Countdown { deadline: bool }, Resumed, Fire { last: Option<String> } }`
  - `pub struct Vigil` with `pub fn arm(&mut self, now: i64, deadline: Option<i64>) -> bool`,
    `pub fn cancel(&mut self) -> bool`, `pub fn step(&mut self, sessions: &[Session], last_write: i64, now: i64) -> Step`,
    `pub fn state(&self) -> &VigilState`

- [ ] **Step 1: Write the module with its tests**

`src-tauri/src/vigil.rs`:

```rust
//! Night Vigil: shut the PC down once no session can progress without a human (a permission prompt, a question
//! or a usage limit counts as finished). Pure: the poll loop steps it once per tick and runs the action it returns.
//! Spec: docs/superpowers/specs/2026-10-09-night-vigil-design.md.
use crate::registry::Session;
use serde::Serialize;
use std::collections::HashMap;

/// Nothing works and no transcript is written for this long: the countdown starts.
pub const QUIET_MS: i64 = 300_000;
pub const COUNTDOWN_MS: i64 = 120_000;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Phase {
    /// Still advances on its own: a turn, an active helper, a background shell.
    Working,
    /// Stopped on a subscription usage limit. Finished for now; its own phase so "wait until reset" can come later.
    Limit,
    /// Waits on a human: a permission prompt or a closing question.
    Waiting,
    Idle,
}

pub fn phase(s: &Session) -> Phase {
    if !s.helpers.is_empty() || s.background {
        return Phase::Working;
    }
    if s.limit.is_some() {
        return Phase::Limit;
    }
    match s.status.as_str() {
        "busy" | "shell" => Phase::Working,
        "waiting" => Phase::Waiting,
        _ if s.question.is_some() => Phase::Waiting,
        _ => Phase::Idle,
    }
}

/// No session works, and neither a working session (`calm_since`) nor a transcript write (`last_write`) happened
/// in the last `QUIET_MS`.
pub fn vigil_ready(sessions: &[Session], last_write: i64, calm_since: i64, now: i64) -> bool {
    sessions.iter().all(|s| phase(s) != Phase::Working) && now - calm_since.max(last_write) >= QUIET_MS
}

/// The next time the local clock reads `target_min` (minutes after midnight), strictly after this minute.
pub fn deadline_after(now_ms: i64, now_local_min: u16, target_min: u16) -> i64 {
    let delta = (target_min as i64 - now_local_min as i64).rem_euclid(1440);
    let delta = if delta == 0 { 1440 } else { delta };
    now_ms - now_ms.rem_euclid(60_000) + delta * 60_000
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VigilState {
    pub armed: bool,
    /// Ms: when the deadline starts a countdown whatever the sessions do.
    pub deadline: Option<i64>,
    /// Ms: when the running countdown ends.
    pub countdown_end: Option<i64>,
    /// The running countdown came from the deadline: no re-check at its end.
    pub forced: bool,
}

#[derive(Debug, PartialEq)]
pub enum Step {
    Nothing,
    /// A countdown just started (`deadline`: started by the deadline).
    Countdown { deadline: bool },
    /// The countdown stopped: something works again. Still armed.
    Resumed,
    /// Run the shutdown. The vigil is already disarmed. `last`: the session that stopped working last.
    Fire { last: Option<String> },
}

#[derive(Default)]
pub struct Vigil {
    state: VigilState,
    calm_since: i64,
    /// Working sessions at the previous tick: id -> name.
    working: HashMap<String, String>,
    last_done: Option<String>,
}

impl Vigil {
    pub fn state(&self) -> &VigilState {
        &self.state
    }

    /// True if it was not armed yet.
    pub fn arm(&mut self, now: i64, deadline: Option<i64>) -> bool {
        if self.state.armed {
            return false;
        }
        self.state = VigilState { armed: true, deadline, countdown_end: None, forced: false };
        self.calm_since = now;
        true
    }

    /// True if it was armed.
    pub fn cancel(&mut self) -> bool {
        let was = self.state.armed;
        self.state = VigilState::default();
        was
    }

    pub fn step(&mut self, sessions: &[Session], last_write: i64, now: i64) -> Step {
        let working: HashMap<String, String> = sessions.iter().filter(|s| phase(s) == Phase::Working).map(|s| (s.id.clone(), s.name.clone())).collect();
        if let Some(name) = self.working.iter().find(|(id, _)| !working.contains_key(*id)).map(|(_, n)| n.clone()) {
            self.last_done = Some(name);
        }
        let busy = !working.is_empty();
        self.working = working;
        if !self.state.armed {
            return Step::Nothing;
        }
        if busy {
            self.calm_since = now;
        }
        match self.state.countdown_end {
            None => {
                let by_deadline = self.state.deadline.is_some_and(|d| now >= d);
                if by_deadline || vigil_ready(sessions, last_write, self.calm_since, now) {
                    self.state.countdown_end = Some(now + COUNTDOWN_MS);
                    self.state.forced = by_deadline;
                    return Step::Countdown { deadline: by_deadline };
                }
                Step::Nothing
            }
            Some(_) if !self.state.forced && busy => self.resume(now),
            Some(end) if now >= end => {
                if self.state.forced || vigil_ready(sessions, last_write, self.calm_since, now - COUNTDOWN_MS) {
                    self.state = VigilState::default();
                    Step::Fire { last: self.last_done.clone() }
                } else {
                    self.resume(now)
                }
            }
            Some(_) => Step::Nothing,
        }
    }

    fn resume(&mut self, now: i64) -> Step {
        self.state.countdown_end = None;
        self.state.forced = false;
        self.calm_since = now;
        Step::Resumed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{Helper, Limit};

    fn s(id: &str, status: &str) -> Session {
        Session { id: id.into(), name: format!("n-{id}"), status: status.into(), ..Default::default() }
    }
    fn helper() -> Helper {
        Helper { id: "h".into(), kind: "general-purpose".into(), task: "t".into(), model: None, context: None }
    }
    const M: i64 = 60_000;

    #[test]
    fn phases() {
        assert_eq!(phase(&s("a", "idle")), Phase::Idle);
        assert_eq!(phase(&s("a", "waiting")), Phase::Waiting);
        assert_eq!(phase(&Session { question: Some("ok?".into()), ..s("a", "idle") }), Phase::Waiting);
        assert_eq!(phase(&s("a", "busy")), Phase::Working);
        assert_eq!(phase(&s("a", "shell")), Phase::Working);
        assert_eq!(phase(&Session { helpers: vec![helper()], ..s("a", "idle") }), Phase::Working, "busy helper under an idle parent");
        assert_eq!(phase(&Session { background: true, ..s("a", "idle") }), Phase::Working, "background shell");
        let limit = Some(Limit { reset_ms: None, text: "limit".into() });
        assert_eq!(phase(&Session { limit: limit.clone(), ..s("a", "busy") }), Phase::Limit);
        assert_eq!(phase(&Session { limit, helpers: vec![helper()], ..s("a", "idle") }), Phase::Working, "a helper still runs");
    }

    #[test]
    fn ready_needs_the_whole_quiet_window() {
        let idle = [s("a", "idle"), s("b", "waiting")];
        assert!(!vigil_ready(&idle, 0, 0, 5 * M - 1));
        assert!(vigil_ready(&idle, 0, 0, 5 * M));
        assert!(!vigil_ready(&idle, 2 * M, 0, 5 * M), "a transcript write restarts it");
        assert!(!vigil_ready(&idle, 0, 2 * M, 5 * M), "a working tick restarts it");
        assert!(!vigil_ready(&[s("a", "busy")], 0, 0, 60 * M));
        assert!(vigil_ready(&[], 0, 0, 5 * M), "no session at all");
    }

    #[test]
    fn deadline_next_occurrence() {
        // 23:30 local, target 04:00: 4 h 30 later; seconds inside the minute dropped.
        assert_eq!(deadline_after(1_000_000 * M + 15_000, 23 * 60 + 30, 4 * 60), 1_000_000 * M + 270 * M);
        assert_eq!(deadline_after(0, 600, 600), 1440 * M, "this very minute: tomorrow");
        assert_eq!(deadline_after(0, 600, 601), M);
    }

    #[test]
    fn arm_countdown_fire() {
        let mut v = Vigil::default();
        let idle = [s("a", "idle")];
        assert_eq!(v.step(&idle, 0, 0), Step::Nothing, "disarmed");
        assert!(v.arm(0, None));
        assert!(!v.arm(1, None));
        assert_eq!(v.step(&idle, 0, 5 * M - 1), Step::Nothing);
        assert_eq!(v.step(&idle, 0, 5 * M), Step::Countdown { deadline: false });
        assert_eq!(v.state().countdown_end, Some(7 * M));
        assert_eq!(v.step(&idle, 0, 7 * M - 1), Step::Nothing);
        assert_eq!(v.step(&idle, 0, 7 * M), Step::Fire { last: None });
        assert!(!v.state().armed, "fires once");
    }

    #[test]
    fn last_session_to_finish_is_named() {
        let mut v = Vigil::default();
        v.arm(0, None);
        v.step(&[s("a", "busy"), s("b", "busy")], 0, 0);
        v.step(&[s("a", "idle"), s("b", "busy")], 0, M);
        v.step(&[s("a", "idle"), s("b", "idle")], 0, 2 * M);
        assert_eq!(v.step(&[s("a", "idle"), s("b", "idle")], 0, 7 * M), Step::Countdown { deadline: false });
        assert_eq!(v.step(&[s("a", "idle"), s("b", "idle")], 0, 9 * M), Step::Fire { last: Some("n-b".into()) });
    }

    #[test]
    fn countdown_resumes_when_work_comes_back() {
        let mut v = Vigil::default();
        v.arm(0, None);
        v.step(&[s("a", "idle")], 0, 5 * M);
        assert_eq!(v.step(&[s("a", "busy")], 0, 6 * M), Step::Resumed);
        assert!(v.state().armed && v.state().countdown_end.is_none());
        assert_eq!(v.step(&[s("a", "idle")], 0, 10 * M), Step::Nothing, "quiet window restarts from the busy tick");
        assert_eq!(v.step(&[s("a", "idle")], 0, 11 * M), Step::Countdown { deadline: false });
        // A transcript write during the countdown fails the re-check at its end.
        assert_eq!(v.step(&[s("a", "idle")], 12 * M, 13 * M), Step::Resumed);
    }

    #[test]
    fn deadline_forces_a_countdown() {
        let mut v = Vigil::default();
        v.arm(0, Some(30 * M));
        let busy = [s("a", "busy")];
        assert_eq!(v.step(&busy, 0, 29 * M), Step::Nothing);
        assert_eq!(v.step(&busy, 0, 30 * M), Step::Countdown { deadline: true });
        assert_eq!(v.step(&busy, 0, 31 * M), Step::Nothing, "forced: busy does not resume");
        assert_eq!(v.step(&busy, 0, 32 * M), Step::Fire { last: None });
    }

    #[test]
    fn cancel_disarms_even_mid_countdown() {
        let mut v = Vigil::default();
        assert!(!v.cancel());
        v.arm(0, None);
        v.step(&[], 0, 5 * M);
        assert!(v.cancel());
        assert_eq!(v.state(), &VigilState::default());
        assert_eq!(v.step(&[], 0, 7 * M), Step::Nothing);
    }
}
```

Note on the end-of-countdown re-check: `vigil_ready(..., now - COUNTDOWN_MS)` asks "was the window still quiet
counting up to when the countdown began, and has nothing been written since". Since the countdown only starts once
the window is quiet, this is equivalent to: no write and no working tick during the countdown. In
`countdown_resumes_when_work_comes_back` the write at 12 M (countdown 11 M → 13 M) makes `13M - 2M - 12M < 5M`, so
it resumes. Keep it.

Check `Helper`'s fields against `src-tauri/src/registry/mod.rs` (`id, kind, task, model, context` at the time of
writing) and `Limit { reset_ms, text }`; adjust the test constructors if a field was added (use `..Default::default()`
only if the struct derives `Default`).

- [ ] **Step 2: Register the module.** In `src-tauri/src/main.rs`, add `mod vigil;` in the block of `mod` lines
  near the top (alphabetical position). Task 2 uses every item; until then `cargo test` may warn about dead code,
  which is fine.

- [ ] **Step 3: Run the tests.**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml vigil`
  Expected: 8 tests pass.

- [ ] **Step 4: Mutation check (test-gates).** Temporarily swap the first two `if` blocks in `phase` (limit before
  helpers) and confirm `phases` fails; temporarily drop `.max(last_write)` and confirm
  `ready_needs_the_whole_quiet_window` fails. Revert both.

- [ ] **Step 5: Commit.**
```bash
git add src-tauri/src/vigil.rs src-tauri/src/main.rs
git commit -m "Night Vigil: pure readiness rule and state machine"
git push
```

---

### Task 2: Wire the vigil into the app (poll loop, shutdown, toast, tray, commands, Chronicon)

**Files:**
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Consumes: Task 1's `vigil::{Vigil, Step, deadline_after}`; existing `emit`, `Chron`, `chronicle::Event`,
  `settings::load`, `settings_path`, `toast_app_id`, `no_window`, `Live`, `poller.files` (`poller::Files =
  HashMap<String, Vec<(FileStat, bool)>>`, `FileStat { path, len, mtime_ms }`).
- Produces:
  - Managed state `type VigilBox = Mutex<vigil::Vigil>` (`app.manage(VigilBox::default())`).
  - Tauri commands `vigil_arm()` and `vigil_cancel()` (no args, return `()`), registered in `generate_handler!`.
  - Event `vigil`, payload `VigilState` (camelCase: `armed`, `deadline`, `countdownEnd`, `forced`), every tick.
  - `fn vigil_set(app: &AppHandle, arm: bool)`: the one place arming/cancelling happens (commands, tray, toast,
    remote all call it).

- [ ] **Step 1: Shared arm/cancel.** Add near the other commands:

```rust
type VigilBox = Mutex<vigil::Vigil>;

/// The deadline (`adm.vigilDeadline`, minutes after midnight; empty or unparsable: none), as a time after `now`.
fn vigil_deadline(v: &serde_json::Value, now: i64) -> Option<i64> {
    let target: u16 = v["adm.vigilDeadline"].as_str()?.parse().ok().filter(|m| *m < 1440)?;
    let n = chrono::Local::now();
    Some(vigil::deadline_after(now, (n.hour() * 60 + n.minute()) as u16, target))
}

/// Arm or cancel the Night Vigil (tray, commands, toast, remote). Records the Chronicon event and syncs the tray.
fn vigil_set(app: &AppHandle, arm: bool) {
    let now = now_ms();
    let changed = {
        let mut v = app.state::<VigilBox>().lock().unwrap_or_else(|e| e.into_inner());
        if arm {
            let saved = settings_path(app).map(|p| settings::load(&p)).unwrap_or_default();
            v.arm(now, vigil_deadline(&saved, now))
        } else {
            v.cancel()
        }
    };
    if changed {
        vigil_event(app, now, if arm { "armed" } else { "cancelled" });
    }
    if let Some(item) = app.try_state::<VigilItem>() {
        let _ = item.0.set_checked(arm);
    }
}

fn vigil_event(app: &AppHandle, now: i64, detail: &str) {
    let e = Event { ts: now, kind: "vigil".into(), session_id: String::new(), name: String::new(), dept: String::new(), helper: None, detail: detail.into() };
    let chron = app.state::<Chron>();
    let c = chron.lock().unwrap_or_else(|e| e.into_inner());
    c.record(&e);
    emit(app, "chronicle", &e);
}

#[tauri::command]
fn vigil_arm(app: AppHandle) {
    vigil_set(&app, true);
}

#[tauri::command]
fn vigil_cancel(app: AppHandle) {
    vigil_set(&app, false);
}
```

`use chrono::Timelike;` is needed for `hour()`/`minute()` (check `quiet.rs` for how it imports them). Add
`vigil_arm, vigil_cancel` to `generate_handler!`. In `.setup`, before `thread::spawn(move || poll_loop(...))`, add
`app.manage::<VigilBox>(Mutex::new(vigil::Vigil::default()));`.

- [ ] **Step 2: The shutdown action and the countdown toast.**

```rust
/// The real shutdown. Never called in demo mode or from a test.
fn shutdown_now() {
    if let Err(e) = no_window(Command::new("shutdown")).args(["/s", "/t", "0", "/c", "Administratum: Night Vigil"]).spawn() {
        eprintln!("night vigil: shutdown: {e}");
    }
}

/// The countdown toast with a Cancel button (same WinRT path as petition_toast). Ignores quiet hours.
fn vigil_toast(app: &AppHandle, deadline: bool) {
    let title = if deadline { "Night Vigil: deadline reached" } else { "Night Vigil: all sessions are done" };
    let body = "The PC shuts down in 2 minutes.";
    #[cfg(windows)]
    {
        let handle = app.clone();
        let shown = tauri_winrt_notification::Toast::new(&toast_app_id(app))
            .title(title)
            .text1(body)
            .add_button("Cancel", "vigil-cancel")
            .on_activated(move |arg| {
                if arg.as_deref() == Some("vigil-cancel") {
                    vigil_set(&handle, false);
                }
                Ok(())
            })
            .show();
        if shown.is_ok() {
            return;
        }
    }
    let _ = app.notification().builder().title(title).body(body).show();
}
```

Check `petition_toast` (`main.rs`, around line 157) for the exact `on_activated` argument type and copy its shape.
If clicking the toast body (not the button) passes `None`, do nothing.

- [ ] **Step 3: Step the vigil in `poll_loop`.** Inside the tick closure, after the Chronicon block (where `turns`
  is filled and before `*app.state::<Live>()...`), add:

```rust
            // Night Vigil: newest transcript write among the files the poller already stats (subagents included).
            let last_write = poller.files.values().flatten().map(|(f, _)| f.mtime_ms).max().unwrap_or(0);
            let step = app.state::<VigilBox>().lock().unwrap_or_else(|e| e.into_inner()).step(&roster, last_write, now_ms);
            match step {
                vigil::Step::Countdown { deadline } => {
                    if deadline {
                        vigil_event(&app, now_ms, "deadline");
                    }
                    vigil_toast(&app, deadline);
                }
                vigil::Step::Resumed => vigil_event(&app, now_ms, "resumed"),
                vigil::Step::Fire { last } => {
                    vigil_event(&app, now_ms, &last.map_or_else(|| "fired".to_string(), |n| format!("fired · {n}")));
                    app.state::<Chron>().lock().unwrap_or_else(|e| e.into_inner()).flush();
                    if let Some(item) = app.try_state::<VigilItem>() {
                        let _ = item.0.set_checked(false);
                    }
                    if demo {
                        eprintln!("night vigil: demo mode, no shutdown");
                    } else {
                        shutdown_now();
                    }
                }
                vigil::Step::Nothing => {}
            }
            emit(&app, "vigil", app.state::<VigilBox>().lock().unwrap_or_else(|e| e.into_inner()).state().clone());
```

In demo mode `poller.files` is empty (`last_write` = 0): fine. Check the exact name of the `now` variable in that
scope (`now_ms` is shadowed as a local `let now_ms = now_ms();` earlier in the closure) and that `demo` is
reachable inside the closure (it is a `poll_loop` parameter, `Copy`).

- [ ] **Step 4: Tray item.** In `build_tray`, add a check item before `quit`, manage it, and handle it:

```rust
pub struct VigilItem(CheckMenuItem<tauri::Wry>);
// in build_tray:
let vigil = CheckMenuItem::with_id(app, "vigil", "Night Vigil", true, false, None::<&str>)?;
// add &vigil to Menu::with_items before &quit
app.manage(VigilItem(vigil));
// in on_menu_event:
"vigil" => {
    let armed = app.state::<VigilBox>().lock().map(|v| v.state().armed).unwrap_or(false);
    vigil_set(app, !armed);
}
```

`build_tray` runs before `app.manage::<VigilBox>` in `.setup` today: move the `VigilBox` manage call above
`build_tray(app)?`. A `CheckMenuItem` toggles its own check on click; `vigil_set` then sets it to the real state.

- [ ] **Step 5: Test the deadline parsing.** Add to `main.rs`'s `mod tests`:

```rust
    #[test]
    fn vigil_deadline_reads_the_setting() {
        assert_eq!(vigil_deadline(&serde_json::json!({}), 0), None);
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": ""}), 0), None);
        assert_eq!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "1440"}), 0), None);
        assert!(vigil_deadline(&serde_json::json!({"adm.vigilDeadline": "240"}), 0).is_some_and(|d| d > 0 && d <= 1440 * 60_000));
    }
```

- [ ] **Step 6: Build and test.**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass. `cargo clippy --manifest-path src-tauri/Cargo.toml`
  → no new warnings.

- [ ] **Step 7: Demo smoke test.** `cd src-tauri && $env:ADMINISTRATUM_DEMO=1; cargo tauri dev` (PowerShell). Arm
  from the tray. Confirm the `vigil` event arrives in the webview console (`listen` in devtools) and that arming
  records an `armed` event in the Chronicon. Demo never shuts down (`eprintln!` instead). Quit.

- [ ] **Step 8: Commit.**
```bash
git add src-tauri/src/main.rs
git commit -m "Night Vigil: step it in the poll loop, tray item, toast, commands, Chronicon events"
git push
```

---

### Task 3: Remote arm / cancel

**Files:**
- Modify: `src-tauri/src/remote.rs`, `src-tauri/src/main.rs` (`remote_backend`), `ui/bridge.js`, `docs/remote-api.md`

**Interfaces:**
- Consumes: Task 2's `vigil_set(app, arm)`.
- Produces: `Call::Vigil { arm: bool }`, `Route::Vigil`, `POST /api/vigil`; in `bridge.js`, remote `invoke('vigil_arm')`
  / `invoke('vigil_cancel')` post `{"arm": true|false}` and reject with `'remote actions disabled'` on 403 (as
  `answer_petition` does).

- [ ] **Step 1: Failing routing test.** In `remote.rs` tests, next to the `answer_petition` POST tests (`fn post`),
  add a `post_to(url, headers, actions)` helper (or generalise `post`) and assert for `/api/vigil` exactly what the
  existing tests assert for `/api/answer_petition`: `Route::Vigil` with good headers and actions on; 403 with
  actions off, without `x-adm`, with a foreign origin; 415 without JSON content type. Also
  `get("/api/vigil", &a)` → `Route::Status(404)` (GET not allowed).
  Run: `cargo test --manifest-path src-tauri/Cargo.toml remote` → FAIL (no `Route::Vigil`).

- [ ] **Step 2: Route it.** Factor the gate of the `("POST", "/api/answer_petition")` arm into
  `fn action_gate(req: &Req, actions: bool) -> Option<u16>` (None = passed, Some(403|415)) and use it for both:

```rust
        ("POST", "/api/answer_petition") => action_gate(req, actions).map_or(Route::Answer, Route::Status),
        ("POST", "/api/vigil") => action_gate(req, actions).map_or(Route::Vigil, Route::Status),
```

Add `Vigil` to `enum Route` and `Vigil { arm: bool }` to `enum Call`. In `handle`, add the `Route::Vigil` arm like
`Route::Answer`: read the body with the same `read_body(..., MAX_BODY)`, parse `#[derive(Deserialize)] struct
Arm { arm: bool }`, then `json(&mut w, (backend.call)(Call::Vigil { arm: a.arm }))`; 400 on a bad body.

- [ ] **Step 3: Backend call.** In `main.rs`'s `remote_backend`, add the `Call::Vigil { arm }` arm: `vigil_set(&app, arm);
  Ok(Value::Null)`. Keep the existing pattern for how it captures the `AppHandle`.

- [ ] **Step 4: Bridge.** In `ui/bridge.js`, where remote `answer_petition` is mapped to `post(...)`, add:

```js
  if (name === 'vigil_arm' || name === 'vigil_cancel') return post('vigil', { arm: name === 'vigil_arm' }).then(r => (r.status === 403 ? Promise.reject('remote actions disabled') : reply(r)));
```

Check `post`'s signature in `bridge.js` and match it (it may take the command name and build `/api/<name>`).

- [ ] **Step 5: Docs.** In `docs/remote-api.md`, section "Action endpoint (POST)", add `POST /api/vigil`, body
  `{"arm": true|false}`, same checks, result 200 `null`, and a `fetch` example.

- [ ] **Step 6: Tests pass.** `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.

- [ ] **Step 7: Commit.**
```bash
git add src-tauri/src/remote.rs src-tauri/src/main.rs ui/bridge.js docs/remote-api.md
git commit -m "Night Vigil: arm and cancel from the remote view"
git push
```

---

### Task 4: The Watchman's base art (40k Inquisitor), flat and 39°, and its loading

**Files:**
- Create: `tools/watch_art.mjs`, `tools/watch_art/base.mjs`, `ui/art/watch.png`, `ui/art/watch.json`,
  `ui/art/watch39.png`, `ui/art/watch39.json`
- Modify: `ui/sprites.js`, `tools/sprite_catalog.mjs`, `ui/sprites.test.mjs` / `ui/art.test.mjs` (only if they list
  families explicitly), regenerated galleries under `docs/sprites/`

**Interfaces:**
- Produces (in `ui/sprites.js`): `export const WATCH = {}, WATCH_AT = {}` (flat: `up`/`down`/`right`/`left` arrays of
  3 frames, `left` mirrored from `right`, plus `ring`); `export const WATCH39 = {}, WATCH39_AT = {}` (`E`/`W`/`S`/`N`
  arrays of 3 frames, plus `ring`). Anchors (logical px): `feet` (the actor's floor point), `light` (the lantern's
  centre, where the glow is drawn).
- Frame contract: flat `watch` frames `up 0..2`, `down 0..2`, `right 0..2`, `ring`, each **32×36 art px** (16×18
  logical, a head taller than the scribe's 32×34: an authority figure). `watch39`: `REQ39.watch39 = { frames:
  [...WALK39, 'ring'], anchors: ['feet', 'light'] }`, same frame size.

**Before drawing (CLAUDE.md, mandatory):** serve the repo root (`python -m http.server 8123` in the background, skip
if it answers) and open `http://localhost:8123/tools/sprites.html` in Chrome (Claude in Chrome). Look at `SCRIBE`,
`ADEPT`, `MAGOS`, `SCRIBE39` for scale, outline and shading conventions. Keep it open; reload after each art write.

- [ ] **Step 1: Art tool.** `tools/watch_art.mjs`, following `tools/breakout_art.mjs`: `node tools/watch_art.mjs
  <world>` where world is `base`, `cyber`, `orbital`, `tower` or `vault`; imports `tools/watch_art/<world>.mjs`
  (default export `() => ({ flat: { 'up 0': rows, ... , ring: rows }, iso: { 'E 0': rows, ..., ring: rows }, flatAnchors:
  { feet: [x, y], light: [x, y] }, isoAnchors: { feet, light } })`), checks every frame is 36 rows of 32 chars from
  `ui/art/key.gpl` (or `.`), then calls `writeSheet` (`tools/sheet_writer.mjs`) for `watch` and `watch39` (base) or
  `<world>/watch` and `<world>/watch39`. Pass anchors through `writeSheet`'s `meta` the way
  `tools/map_to_art.mjs` passes them (read `sheet_writer.mjs` for the exact `meta.anchors` shape: art px).

- [ ] **Step 2: Draw the Inquisitor** in `tools/watch_art/base.mjs`, in the key palette (one char per slot, `.`
  transparent, `k` outline): wide-brimmed hat or hood, long dark coat (`n`/`e`/`M`), red trim (`x`), the Inquisitorial
  rosette in brass (`g`/`h`) on the chest, a lantern held out in one hand (`f`/`F` flame, brass cage). Walk cycle:
  frame 0 standing, 1 and 2 a foot forward (as the scribe). `ring`: the free hand raised ringing a hand bell (brass).
  39° frames: E/W/S/N each drawn (no mirroring), following `tools/iso_art.mjs`'s scribe for the diagonal facing.
  Run `node tools/watch_art.mjs base`.

- [ ] **Step 3: Load it.** In `ui/sprites.js`: add `'watch'` to `FAMILIES` (required base family), and `watch39` to
  `FAMILIES39`, `REQ39`, `BUILD39` (`watch39: sheet => ({ ...walker39(sheet), ring: sheet.frames.ring })`),
  `EXPORT39`; declare `WATCH`, `WATCH_AT`, `WATCH39`, `WATCH39_AT`; in `useArt`, `refill(WATCH, { ...walker(S.watch),
  ring: S.watch.frames.ring }); refill(WATCH_AT, anchorsOf(S.watch));`.

- [ ] **Step 4: Catalog.** In `tools/sprite_catalog.mjs`, list `WATCH` with the flat characters and `WATCH39` in
  `CH39`, the way `ADEPT`/`ADEPT39` are listed, so the viewer and galleries show them.

- [ ] **Step 5: Tests.** Run `node ui/art.test.mjs` and `node ui/sprites.test.mjs`. If either lists characters
  explicitly (sizes, symmetry checks), add `watch` / `watch39` beside `adept` / `adept39`. Expected: PASS. Then make
  one deliberate break (a wrong-size frame in `base.mjs`) and confirm `watch_art.mjs` throws, then revert.

- [ ] **Step 6: Galleries.** `node tools/sprite_sheet.mjs`. Look at the Watchman in the viewer at zoom 4 in Flat
  and 39°, in two 40k themes (A and E). Screenshot for the reviewer.

- [ ] **Step 7: Commit.**
```bash
git add tools/watch_art.mjs tools/watch_art/base.mjs ui/art/watch.png ui/art/watch.json ui/art/watch39.png ui/art/watch39.json ui/sprites.js tools/sprite_catalog.mjs docs/sprites
git commit -m "Night Vigil: the Watchman (Inquisitor), flat and 39°"
git push
```
(Add `ui/art.test.mjs` / `ui/sprites.test.mjs` only if Step 5 changed them.)

---

### Task 5: The Watchman in the hall, the header button, the deadline setting

**Files:**
- Create: `ui/vigil.js`, `ui/vigil.test.mjs`
- Modify: `ui/app.js`, `ui/actors.js`, `ui/scene.js`, `ui/scene39.js`, `ui/card.js`, `ui/index.html`,
  `ui/settings.js`, `ui/theme.js`, `ui/themes.js`

**Interfaces:**
- Consumes: event `vigil` (`{ armed, deadline, countdownEnd, forced }`), commands `vigil_arm` / `vigil_cancel`
  (through `bridge.js`'s `invoke`), `WATCH`/`WATCH_AT`/`WATCH39`/`WATCH39_AT` (Task 4).
- Produces: `ui/vigil.js` exports `export const vigil = { armed: false, deadline: null, countdownEnd: null, forced: false }`,
  `export function onVigil(state)` (updates `vigil` in place), `export function secondsLeft(now) -> number | null`
  (whole seconds to `countdownEnd`, never negative; null when no countdown), `export function bellDue(prevS, s) ->
  boolean` (true when the countdown crosses a 30 s mark: 120→90→60→30→0).

- [ ] **Step 1: Pure helpers with a test.** `ui/vigil.test.mjs` (plain `assert`, like the other `*.test.mjs`):

```js
import assert from 'node:assert/strict';
import { vigil, onVigil, secondsLeft, bellDue } from './vigil.js';

onVigil({ armed: true, deadline: null, countdownEnd: 10_000, forced: false });
assert.equal(vigil.armed, true);
assert.equal(secondsLeft(0), 10);
assert.equal(secondsLeft(9_001), 1);
assert.equal(secondsLeft(20_000), 0);
onVigil({ armed: true, deadline: null, countdownEnd: null, forced: false });
assert.equal(secondsLeft(0), null);
assert.equal(bellDue(91, 90), true);
assert.equal(bellDue(90, 89), false);
assert.equal(bellDue(1, 0), true);
assert.equal(bellDue(null, 120), false);
console.log('vigil ok');
```

`ui/vigil.js`:

```js
// Night Vigil state, as the backend emits it every tick (event 'vigil'): armed, deadline, countdownEnd (ms), forced.
export const vigil = { armed: false, deadline: null, countdownEnd: null, forced: false };
export function onVigil(s) { Object.assign(vigil, s); }
export const secondsLeft = now => (vigil.countdownEnd == null ? null : Math.max(0, Math.ceil((vigil.countdownEnd - now) / 1000)));
// The bell rings each time the countdown crosses a 30 s mark (120, 90, 60, 30, 0).
export const bellDue = (prev, s) => prev != null && s != null && Math.ceil(s / 30) < Math.ceil(prev / 30);
```

Run `node ui/vigil.test.mjs` → `vigil ok`.

- [ ] **Step 2: Wiring and header button.** In `app.js`: `listen('vigil', e => onVigil(e.payload))`. In
  `index.html`, add a header icon button (moon), styled like the existing header `.icon` buttons, `title` = theme
  wording; `aria-pressed` follows `vigil.armed`. Click → `invoke(vigil.armed ? 'vigil_cancel' : 'vigil_arm')`. In the
  remote view, show it only while remote actions are allowed (reuse `card.js`'s `remoteActions()` probe pattern), and on
  a `'remote actions disabled'` rejection hide it.

- [ ] **Step 3: The Watchman actor.** In `actors.js`, a single non-session actor (`id: 'watch'`), added in `Cast.sync`
  when `vigil.armed` (walks in through `hall.entry` like a new scribe), removed (walks out, then dropped) when
  disarmed. While armed and no countdown: patrols, picking a random desk/lectern seat from `seats` as its next
  destination with the same `route()` walking as scribes, pausing ~3 s at each. During a countdown: destination =
  the gate (just inside `hall.entry`), facing down. Its draw record mirrors the adept's (`actors.js` ~line 199 for flat,
  ~line 214 for 39°) but with `WATCH`/`WATCH_AT` and `WATCH39`/`WATCH39_AT`; when `bellDue(prev, now)` fires it shows
  the `ring` frame for 1 s and `app.js` plays `chime([660, 660, 660])` unless muted. If `WATCH39` is empty (a theme
  without a 39° file yet), fall back to the flat frames like the adept does.

- [ ] **Step 4: Light and label.** The lantern: a light pool at `WATCH_AT.light` using the existing glow mechanism
  of `lighting.js` (find how braziers/candles register glows, register one for the Watchman). During a countdown, a
  label above him (the petition label style in `app.js`) shows `secondsLeft(Date.now())` + `s`.

- [ ] **Step 5: Card with Cancel.** Clicking the Watchman (hit-test like a scribe's) opens the card (`card.js`) with
  his name (theme wording), the state line (`Armed` / `Deadline HH:MM` / `Shutdown in N s`) and a **Cancel** button →
  `invoke('vigil_cancel')`. In the remote view the button follows the same `actions` flag as the petition buttons.

- [ ] **Step 6: Wording.** Add `watch` wording (the character's name and the button title) to the base theme in
  `ui/theme.js` and to each world's themes in `ui/themes.js`: 40k themes "Inquisitor", cyber "Night Guard", orbital
  "Night Shift", tower "Lookout", vault "Vault Security". `node ui/theme.test.mjs` must still pass (complete
  wording per theme).

- [ ] **Step 7: Deadline setting.** In `settings.js` + the Settings panel in `index.html`: one `<input type="time">`
  "Night Vigil deadline", empty = none, stored as `adm.vigilDeadline` (minutes after midnight as a string, `''` when
  cleared), following the quiet-hours fields' pattern (`adm.quietFrom`).

- [ ] **Step 8: Check it.** Run every node test (`for t in ui/*.test.mjs; do node "$t" || echo "FAIL $t"; done`) and
  `cargo test`. Then `cd src-tauri; $env:ADMINISTRATUM_DEMO=1; cargo tauri dev`: arm from the header button, watch
  the Inquisitor walk in and patrol, in Flat and 39°; the demo roster goes quiet → countdown at the gate, label, bell
  every 30 s, toast with Cancel; Cancel from the card disarms (he walks out, tray unchecked). Screenshot each.

- [ ] **Step 9: Commit.**
```bash
git add ui/vigil.js ui/vigil.test.mjs ui/app.js ui/actors.js ui/scene.js ui/scene39.js ui/card.js ui/index.html ui/settings.js ui/theme.js ui/themes.js
git commit -m "Night Vigil: the Watchman patrols the hall, countdown at the gate, header button, deadline setting"
git push
```

---

### Tasks 6–9: The Watchman for each other world (one task each)

Same steps for each world `W` in **cyber**, **orbital**, **tower**, **vault**, one task and one commit per world:

| Task | World | Design (drawn from scratch, never the Inquisitor recoloured) |
|---|---|---|
| 6 | `cyber` | A security guard in a jacket and cap, flashlight held out (the light), walkie-talkie on the chest. `ring`: talks into the walkie-talkie, hand raised. |
| 7 | `orbital` | A night-shift astronaut in the station's flight suit, headlamp on (the light at the head). `ring`: taps a wrist panel, arm raised. |
| 8 | `tower` | A cloaked lookout with a hooded lantern on a pole and an hourglass on the belt. `ring`: holds up the hourglass. |
| 9 | `vault` | A Vault-Tec security officer: blue jumpsuit, riot helmet, baton on the belt, flashlight. `ring`: blows a whistle, hand raised. |

**Files (per world W):** Create `tools/watch_art/W.mjs`, `ui/art/W/watch.png|json`, `ui/art/W/watch39.png|json`;
modify `ui/themes.js` (add `'watch', 'watch39'` to that world's theme `art` list: `cyber` line ~88, `orbital` ~159,
`tower` ~291, `vault` ~363, and extend its trailing comment), regenerated `docs/sprites/` gallery for W.

- [ ] **Step 1:** Open the live viewer filtered to W's theme; study its scribe/adept/magos for that world's
  proportions, palette slots and outline style.
- [ ] **Step 2:** Draw `tools/watch_art/W.mjs` with the frame contract of Task 4 (32×36 art px, `up/down/right 0..2`
  + `ring` flat; `E/W/S/N 0..2` + `ring` 39°; anchors `feet`, `light`). Run `node tools/watch_art.mjs W`.
- [ ] **Step 3:** Add `'watch', 'watch39'` to the theme's `art` list in `ui/themes.js`.
- [ ] **Step 4:** `node ui/art.test.mjs`, `node ui/sprites.test.mjs` → PASS. `node tools/sprite_sheet.mjs --theme W`.
- [ ] **Step 5:** Reload the viewer; look at the Watchman in Flat and 39° next to that world's scribe; screenshot.
- [ ] **Step 6: Commit.**
```bash
git add tools/watch_art/W.mjs ui/art/W/watch.png ui/art/W/watch.json ui/art/W/watch39.png ui/art/W/watch39.json ui/themes.js docs/sprites
git commit -m "Night Vigil: the Watchman for <world name>"
git push
```

---

### Task 10: Docs and final check

**Files:** Modify `docs/DEVELOPMENT.md` (module table: `vigil.rs`, `vigil.js`; tests table: `vigil.test.mjs`),
`README.md` (one short paragraph: what Night Vigil does, how to arm it, that sessions are not closed and resume next
morning).

- [ ] **Step 1:** Write both doc changes.
- [ ] **Step 2:** Full test run: `cargo test --manifest-path src-tauri/Cargo.toml` and every `ui/*.test.mjs`.
- [ ] **Step 3:** Rebuild and silent-install the NSIS build (house rule after each step: see the project memory
  `reinstall-after-each-step`), launch the installed app, arm the vigil with a real session busy, confirm it does
  **not** count down while the session works; cancel. Do not let it shut the PC down.
- [ ] **Step 4: Commit.**
```bash
git add docs/DEVELOPMENT.md README.md
git commit -m "Night Vigil: docs"
git push
```
