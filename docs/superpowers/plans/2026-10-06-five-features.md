# Five Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quiet hours, clickable department plaques with the git branch, usage-limit detection, Approve/Deny on
toasts, and a per-session turn summary.

**Architecture:** The Rust backend (`src-tauri/src`) reads Claude Code's files and fires toasts; the web UI
(`ui/*.js`, vanilla ES modules) draws the hall and owns the settings. Each feature adds a small pure function with a
test on the side that owns the data, plus the wiring. Spec: `docs/superpowers/specs/2026-10-06-five-features-design.md`.

**Tech Stack:** Rust (Tauri 2, serde_json, chrono 0.4 with `clock` + `std`), `tauri-winrt-notification` 0.8 (new
direct dependency, already in `Cargo.lock`), vanilla JS with node test scripts (`node ui/*.test.mjs`).

## Global Constraints

- Read-only towards Claude Code: never write under `~/.claude`. The only thing ever typed is the existing single
  option digit (`answer_petition`).
- Order of tasks: 1 quiet hours, 2 plaques, 3 usage limits, 4 toast actions, 5 turn summary. Each task ends green and
  is committed on its own.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml` (run from the repo root). JS tests:
  `node ui/layout.test.mjs && node ui/theme.test.mjs && node ui/sun.test.mjs && node ui/art.test.mjs && node ui/sprites.test.mjs`
  plus any new `ui/*.test.mjs`.
- No new process ever runs through a shell with an interpolated string: `std::process::Command` with separate args.
- Commit messages: plain, no backticks inside a double-quoted `-m`.
- After each task (operator preference): build and reinstall the NSIS installer. In PowerShell, in `src-tauri`:
  `$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\administratum.key"; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cargo tauri build`,
  quit the running app, run `target\release\bundle\nsis\Administratum_<version>_x64-setup.exe /S` (version from
  `src-tauri/Cargo.toml`), relaunch from the Start menu.
- Comment style: match the files (short doc comments saying why; `ponytail:` comments for deliberate ceilings).

## File map

| File | Change |
|---|---|
| `src-tauri/src/quiet.rs` | **new** (Task 1): quiet window rule + state |
| `src-tauri/src/git.rs` | **new** (Task 2): branch from `.git/HEAD` |
| `src-tauri/src/main.rs` | commands `set_quiet`, `open_folder`; `Live` roster state; toasts (Tasks 1-5) |
| `src-tauri/src/registry.rs` | `Session` gains `Default`, `branch`, `limit`, `turn`; `Limit`, `limit_of`, `reset_after`, `TurnSummary`, `Tracker::new_limits` |
| `src-tauri/src/poller.rs` | branch cache, limit expiry (Tasks 2-3) |
| `src-tauri/src/toast.rs` | limit / failed wording, `limit_title`, `hhmm`, toast button helpers (Tasks 3-4) |
| `src-tauri/src/chronicle.rs` | turn tracking per main transcript (Task 5) |
| `src-tauri/src/demo.rs` | `..Default::default()` (Task 2) |
| `src-tauri/Cargo.toml` | `tauri-winrt-notification` (Task 4) |
| `ui/quiet.js`, `ui/quiet.test.mjs` | **new** (Task 1) |
| `ui/settings.js`, `ui/index.html`, `ui/app.js`, `ui/actors.js`, `ui/theme.js` | settings, header moon, plaques, tags, card |
| `README.md` | one block per feature |

---

### Task 1: Quiet hours

**Files:**
- Create: `src-tauri/src/quiet.rs`, `ui/quiet.js`, `ui/quiet.test.mjs`
- Modify: `src-tauri/src/main.rs` (mod list, new command, handler list, poll loop), `ui/settings.js`, `ui/index.html`, `ui/app.js`, `README.md`

**Interfaces:**
- Produces (Rust): `quiet::in_window(now: u16, from: u16, to: u16) -> bool`, `quiet::set(enabled: bool, from: u16, to: u16)`, `quiet::active() -> bool`; command `set_quiet(enabled, from_min, to_min)` (JS args `enabled, fromMin, toMin`).
- Produces (JS): `quiet.js` exports `inWindow(now, from, to)`, `minutesOf('HH:MM') -> number|null`, `hhmmOf(min) -> 'HH:MM'`, `quietAt(q, date)`; `settings.js` exports `quiet = { on, from, to }` (minutes after midnight).
- Later tasks use: `quiet::active()` (Tasks 3, 4) and `quietNow()` in `app.js` (Task 3).

- [ ] **Step 1: Write the failing Rust test**

Create `src-tauri/src/quiet.rs`:

```rust
//! Quiet hours: a daily window (minutes after midnight, local clock) in which a new petition, question or usage limit
//! neither toasts nor chimes; a petition turning stale still does. The UI owns the setting and pushes it (set_quiet).
use chrono::{Local, Timelike};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};

static ON: AtomicBool = AtomicBool::new(false);
static FROM: AtomicU16 = AtomicU16::new(22 * 60);
static TO: AtomicU16 = AtomicU16::new(8 * 60);

/// Whether `now` lies in [from, to); a window with to < from spans midnight; from == to is never quiet.
pub fn in_window(now: u16, from: u16, to: u16) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window() {
        assert!(in_window(600, 540, 1020), "plain window");
        assert!(!in_window(1020, 540, 1020), "end is exclusive");
        assert!(in_window(540, 540, 1020), "start is inclusive");
        assert!(in_window(1380, 1320, 480) && in_window(0, 1320, 480) && in_window(479, 1320, 480), "over midnight");
        assert!(!in_window(480, 1320, 480) && !in_window(720, 1320, 480), "outside the night window");
        assert!(!in_window(600, 600, 600), "from == to is never quiet");
    }
}
```

Add `mod quiet;` to the module list at the top of `src-tauri/src/main.rs` (alphabetical, after `mod poller;`).

- [ ] **Step 2: Run it to see it fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml quiet::`
Expected: FAIL in `window` ("plain window").

- [ ] **Step 3: Implement**

Replace the body of `in_window` and add `set` / `active` below it in `quiet.rs`:

```rust
pub fn in_window(now: u16, from: u16, to: u16) -> bool {
    if from < to {
        now >= from && now < to
    } else if from > to {
        now >= from || now < to
    } else {
        false
    }
}

/// From the settings panel (set_quiet); out-of-range minutes are clamped to the day's last minute.
pub fn set(enabled: bool, from: u16, to: u16) {
    ON.store(enabled, Ordering::Relaxed);
    FROM.store(from.min(1439), Ordering::Relaxed);
    TO.store(to.min(1439), Ordering::Relaxed);
}

/// Quiet right now, by the PC's clock.
pub fn active() -> bool {
    let n = Local::now();
    ON.load(Ordering::Relaxed) && in_window((n.hour() * 60 + n.minute()) as u16, FROM.load(Ordering::Relaxed), TO.load(Ordering::Relaxed))
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml quiet::`
Expected: `test quiet::tests::window ... ok`.

- [ ] **Step 5: Command and toast gating in `main.rs`**

After `set_question_prefs` add:

```rust
/// Quiet hours from the settings panel (quiet.rs): minutes after midnight, local.
#[tauri::command]
fn set_quiet(enabled: bool, from_min: u16, to_min: u16) {
    quiet::set(enabled, from_min, to_min);
}
```

Add `set_quiet` to `tauri::generate_handler![...]` (after `set_question_prefs`).

In `poll_loop`, inside the tick closure, right after `let words = toast::get();` add `let quiet = quiet::active();`.
Wrap the petition toast so it only shows when not quiet (the `emit` stays unconditional):

```rust
            for s in tracker.new_petitions(&roster) {
                if !quiet {
                    let _ = app
                        .notification()
                        .builder()
                        .title(toast::fill(&words.petition, &s.name))
                        .body(format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone())))
                        .show();
                }
                emit(&app, "petition", &s);
            }
```

and change the question toast condition from `if QUESTION_TOAST.load(Ordering::Relaxed) {` to
`if QUESTION_TOAST.load(Ordering::Relaxed) && !quiet {`. The stale toast is unchanged.

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass (count printed, 0 failed).

- [ ] **Step 6: Write the failing JS test**

Create `ui/quiet.test.mjs`:

```js
import assert from 'node:assert/strict';
import { inWindow, minutesOf, hhmmOf, quietAt } from './quiet.js';

assert.equal(inWindow(600, 540, 1020), true);
assert.equal(inWindow(1020, 540, 1020), false);
assert.equal(inWindow(540, 540, 1020), true);
assert.equal(inWindow(0, 1320, 480), true);
assert.equal(inWindow(479, 1320, 480), true);
assert.equal(inWindow(480, 1320, 480), false);
assert.equal(inWindow(600, 600, 600), false);
assert.equal(minutesOf('22:00'), 1320);
assert.equal(minutesOf('8:05'), 485);
assert.equal(minutesOf('24:00'), null);
assert.equal(minutesOf(''), null);
assert.equal(hhmmOf(485), '08:05');
const at = (h, m) => new Date(2026, 9, 6, h, m);
assert.equal(quietAt({ on: true, from: 1320, to: 480 }, at(23, 30)), true);
assert.equal(quietAt({ on: false, from: 1320, to: 480 }, at(23, 30)), false);
assert.equal(quietAt({ on: true, from: 1320, to: 480 }, at(12, 0)), false);
console.log('quiet ok');
```

Run: `node ui/quiet.test.mjs` → FAIL (`Cannot find module ... quiet.js`).

- [ ] **Step 7: Implement `ui/quiet.js`**

```js
// Quiet hours (settings.js: quiet = { on, from, to }, minutes after midnight): the same rule as src-tauri/src/quiet.rs.
// A window whose end is before its start spans midnight; from == to is never quiet.
export const inWindow = (now, from, to) => (from < to ? now >= from && now < to : from > to ? now >= from || now < to : false);
export const minutesOf = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};
export const hhmmOf = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const quietAt = (q, date) => q.on && inWindow(date.getHours() * 60 + date.getMinutes(), q.from, q.to);
```

Run: `node ui/quiet.test.mjs` → `quiet ok`.

- [ ] **Step 8: Settings (`ui/settings.js`, `ui/index.html`)**

In `settings.js`, add the import `import { minutesOf, hhmmOf } from './quiet.js';` and, after the `questions` block:

```js
// Quiet hours (adm.quiet, adm.quietFrom, adm.quietTo; minutes after midnight): read live by app.js (chimes, the header
// moon), pushed to the backend (set_quiet) for its toasts.
const minutes = (v, d) => (v !== '' && Number.isInteger(+v) && +v >= 0 && +v < 1440 ? +v : d);
export const quiet = { on: store.get('adm.quiet', '0') === '1', from: minutes(store.get('adm.quietFrom', '1320'), 1320), to: minutes(store.get('adm.quietTo', '480'), 480) };
const setQuiet = (on, from, to) => {
  Object.assign(quiet, { on, from, to });
  store.set('adm.quiet', on ? '1' : '0'); store.set('adm.quietFrom', String(from)); store.set('adm.quietTo', String(to));
};
```

In `initSettings`:
- next to `pushQuestions`: `const pushQuiet = () => invoke('set_quiet', { enabled: quiet.on, fromMin: quiet.from, toMin: quiet.to }).catch(() => {});`
- in the `else` branch that calls `pushStale(); pushQuestions();`, add `pushQuiet();`
- in `sync`, after the `questionToast` lines:

```js
    field('quietOn').checked = quiet.on;
    for (const k of ['quietFrom', 'quietTo']) {
      if (document.activeElement !== field(k)) field(k).value = hhmmOf(quiet[k === 'quietFrom' ? 'from' : 'to']);
      field(k).disabled = !quiet.on;
    }
```

- in `form.onchange`, before the `login` branch:

```js
    else if (k === 'quietOn' || k === 'quietFrom' || k === 'quietTo') {
      setQuiet(field('quietOn').checked, minutesOf(field('quietFrom').value) ?? quiet.from, minutesOf(field('quietTo').value) ?? quiet.to);
      pushQuiet(); hooks.quieted?.();
    }
```

- in the reset handler, after `setQuestions(true, true);`: `setQuiet(false, 1320, 480);` and add `pushQuiet();` next to `pushQuestions();`, then `hooks.quieted?.();`.
- update the `hooks:` comment above `initSettings` to list `quieted()`.

In `ui/index.html`, in `<section data-cat="petitions">`, after the `Values` fieldset, add:

```html
          <fieldset data-host><legend>Quiet hours</legend>
            <label class="wide"><span>Quiet hours</span><input type="checkbox" name="quietOn"></label>
            <label><span>From</span><input type="time" name="quietFrom"></label>
            <label><span>To</span><input type="time" name="quietTo"></label>
            <p class="hint">No toast or chime in this window, except a petition turning stale.</p>
          </fieldset>
```

- [ ] **Step 9: Chimes and the header moon (`ui/app.js`, `ui/index.html`)**

In `index.html`, just before `<button id="mute" ...>`, add `<span id="quiet" class="quiet" hidden>☾</span>` and in
the `<style>` block, next to the header rules, add
`#quiet { color: var(--light); font-size: 16px; cursor: default; } #quiet[hidden] { display: none; }`.

In `app.js`:
- import: change the settings import to also take `quiet`, and add `import { quietAt, hhmmOf } from './quiet.js';`
- right after `const state = { ... };` add:

```js
// Quiet hours: chimes for new petitions, questions, long tasks and usage limits stay silent (stale ones still chime).
const quietNow = () => quietAt(quiet, new Date());
const quietEl = document.getElementById('quiet');
function renderQuiet() {
  const on = quietNow();
  quietEl.hidden = !on;
  quietEl.title = on ? `Quiet until ${hhmmOf(quiet.to)}` : '';
}
```

- in `renderModes()`, before `renderSettings();`, call `renderQuiet();` (it already runs every minute).
- in the `initSettings({...})` hooks object add `quieted: renderQuiet`.
- in the listeners at the bottom:

```js
  listen('petition', () => quietNow() || chime());
  listen('question', () => quietNow() || chime([880, 1175]));
```

and in the `chronicle` listener change `&& e.payload.kind === 'task-done') chime([1320, 1760]);` to
`&& e.payload.kind === 'task-done' && !quietNow()) chime([1320, 1760]);`.

- [ ] **Step 10: Run every check**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed.
Run: `node ui/quiet.test.mjs && node ui/layout.test.mjs && node ui/theme.test.mjs && node ui/sun.test.mjs` → each prints `... ok`.

- [ ] **Step 11: README**

In `README.md`, in the Settings table, after the `Petition turns stale after` row, add:

```markdown
| Quiet hours | off, 22:00–08:00 | any times | Inside the window no toast and no chime for a new petition, question, long task or usage limit. A petition turning stale still toasts and chimes. A moon in the header shows while it is quiet |
```

- [ ] **Step 12: Commit, build, reinstall**

```bash
git add src-tauri/src/quiet.rs src-tauri/src/main.rs ui/quiet.js ui/quiet.test.mjs ui/settings.js ui/index.html ui/app.js README.md
git commit -m "quiet hours: no toast or chime in a daily window, stale still alerts"
git push
```

Then build and reinstall (Global Constraints). Operator check: set a window that includes now, see the moon, start a
Claude Code permission prompt: no toast, no chime.

---

### Task 2: Clickable department plaque and git branch

**Files:**
- Create: `src-tauri/src/git.rs`
- Modify: `src-tauri/src/registry.rs` (Session derive + field, `tests_session`, test helper `session`), `src-tauri/src/demo.rs`, `src-tauri/src/poller.rs`, `src-tauri/src/main.rs`, `ui/app.js`, `ui/settings.js`, `ui/index.html`, `README.md`

**Interfaces:**
- Produces: `Session` derives `Default`; `Session.branch: Option<String>` (JSON `branch`); `git::parse_head(&str) -> Option<String>`, `git::head_file(&Path) -> Option<PathBuf>`, `git::branch_of(&Path) -> Option<String>`; `main.rs`: `type Live = Mutex<Vec<Session>>` (managed state holding the newest roster), `opener(kind, custom, path) -> Result<(String, Vec<String>), String>`, `split_words(&str) -> Vec<String>`, command `open_folder(path)`.
- Later tasks rely on: `Live` (Task 4), `Session: Default` (Tasks 3, 5: new fields need no edits to the literals).

- [ ] **Step 1: `Session: Default` and the field**

In `registry.rs`, change the derive on `Session` to `#[derive(Serialize, Clone, Debug, PartialEq, Default)]` and add
the last field:

```rust
    /// The git branch of `cwd` (git.rs, refreshed by the poller every few seconds); None outside a repo.
    pub branch: Option<String>,
```

In `scan()`, add `branch: None,` after `question,` in the `Session { ... }` literal (the poller fills it).

Replace `tests_session` with:

```rust
#[cfg(test)]
pub fn tests_session(id: &str) -> Session {
    Session { id: id.into(), pid: 1, name: id.into(), dept: "Terra".into(), cwd: r"C:\git\Terra".into(), status: "idle".into(), task: "—".into(), ..Default::default() }
}
```

In the `tests` module, replace the helper `fn session(...)` body with:

```rust
        Session { id: id.into(), pid, name: id.into(), dept: "Terra".into(), cwd: "C:\\git\\Terra".into(), status: status.into(), since_ms: since, task: "—".into(), ..Default::default() }
```

In `demo.rs`, in `scribe()`, add `..Default::default()` after `question: None,`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed (pure refactor).

- [ ] **Step 2: Write the failing branch tests**

Create `src-tauri/src/git.rs`:

```rust
//! The git branch of a session's working directory, read from `.git/HEAD` without running git.
use std::{
    fs,
    path::{Path, PathBuf},
};

/// `ref: refs/heads/<name>` -> name; a detached HEAD (a bare hex hash) -> its first 7 chars; anything else -> None.
pub fn parse_head(text: &str) -> Option<String> {
    None
}

/// The HEAD file for `dir`: the nearest `.git` at or above it. A `.git` file (a worktree) points to its git dir with
/// `gitdir: <path>`, relative to the folder holding the file unless absolute.
pub fn head_file(dir: &Path) -> Option<PathBuf> {
    None
}

pub fn branch_of(dir: &Path) -> Option<String> {
    parse_head(&fs::read_to_string(head_file(dir)?).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-git-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn head_lines() {
        assert_eq!(parse_head("ref: refs/heads/main\n").as_deref(), Some("main"));
        assert_eq!(parse_head("ref: refs/heads/feat/x").as_deref(), Some("feat/x"));
        assert_eq!(parse_head("0123456789abcdef0123456789abcdef01234567\n").as_deref(), Some("0123456"));
        assert_eq!(parse_head("ref: refs/remotes/origin/main"), None);
        assert_eq!(parse_head("garbage"), None);
        assert_eq!(parse_head(""), None);
    }

    #[test]
    fn repo_subfolder_and_worktree() {
        let d = temp("repo");
        fs::create_dir_all(d.join("repo/.git")).unwrap();
        fs::write(d.join("repo/.git/HEAD"), "ref: refs/heads/dev\n").unwrap();
        fs::create_dir_all(d.join("repo/src/ui")).unwrap();
        assert_eq!(branch_of(&d.join("repo")).as_deref(), Some("dev"));
        assert_eq!(branch_of(&d.join("repo/src/ui")).as_deref(), Some("dev"), "walks up to the repo");

        fs::create_dir_all(d.join("repo/.git/worktrees/wt")).unwrap();
        fs::write(d.join("repo/.git/worktrees/wt/HEAD"), "ref: refs/heads/wt-branch\n").unwrap();
        fs::create_dir_all(d.join("wt")).unwrap();
        let abs = d.join("repo/.git/worktrees/wt");
        fs::write(d.join("wt/.git"), format!("gitdir: {}\n", abs.display())).unwrap();
        assert_eq!(branch_of(&d.join("wt")).as_deref(), Some("wt-branch"), "absolute gitdir");

        fs::create_dir_all(d.join("wt2")).unwrap();
        fs::write(d.join("wt2/.git"), "gitdir: ../repo/.git/worktrees/wt\n").unwrap();
        assert_eq!(branch_of(&d.join("wt2")).as_deref(), Some("wt-branch"), "relative gitdir");

        fs::create_dir_all(d.join("bare/.git")).unwrap();
        assert_eq!(branch_of(&d.join("bare")), None, "no HEAD file");
        let _ = fs::remove_dir_all(&d);
    }
}
```

Add `mod git;` to `main.rs`'s module list (after `mod firewall;`).

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::` → FAIL (`head_lines`, `repo_subfolder_and_worktree`).

Note: `branch_of(d.join("wt"))` also matches if the temp dir itself sits inside a git repo; `std::env::temp_dir()` is
`%TEMP%`, outside any repo.

- [ ] **Step 3: Implement**

```rust
pub fn parse_head(text: &str) -> Option<String> {
    let t = text.trim();
    if let Some(r) = t.strip_prefix("ref:") {
        return r.trim().strip_prefix("refs/heads/").filter(|n| !n.is_empty()).map(str::to_string);
    }
    (t.len() >= 40 && t.chars().all(|c| c.is_ascii_hexdigit())).then(|| t[..7].to_string())
}

pub fn head_file(dir: &Path) -> Option<PathBuf> {
    for d in dir.ancestors() {
        let git = d.join(".git");
        if git.is_dir() {
            return Some(git.join("HEAD"));
        }
        if git.is_file() {
            let text = fs::read_to_string(&git).ok()?;
            let target = text.lines().find_map(|l| l.strip_prefix("gitdir:"))?.trim();
            return Some(d.join(target).join("HEAD")); // join keeps an absolute target as it is
        }
    }
    None
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::` → both ok.

- [ ] **Step 4: The poller fills `branch`**

In `poller.rs`: add `time::{Duration, Instant}` to the `std` import, and `use crate::git;`. Add a field to `Poller`:

```rust
    /// Branch per cwd, re-read from `.git/HEAD` at most every BRANCH_EVERY.
    branches: HashMap<String, (Instant, Option<String>)>,
```

initialise it with `branches: HashMap::new(),` in `new()`, add `branches` to the `let Poller { ... } = self;`
destructuring, add `const BRANCH_EVERY: Duration = Duration::from_secs(5);` at module level, and right after
`registry::track_compaction(prev, &mut roster, now_ms);` add:

```rust
        for s in roster.iter_mut() {
            if !branches.get(&s.cwd).is_some_and(|(at, _)| at.elapsed() < BRANCH_EVERY) {
                branches.insert(s.cwd.clone(), (Instant::now(), git::branch_of(Path::new(&s.cwd))));
            }
            s.branch = branches.get(&s.cwd).and_then(|(_, b)| b.clone());
        }
        branches.retain(|cwd, _| roster.iter().any(|s| &s.cwd == cwd));
```

- [ ] **Step 5: Write the failing opener tests (`main.rs`)**

At the end of `main.rs`'s `mod tests`, add:

```rust
    #[test]
    fn opener_keeps_the_path_one_argument() {
        let p = r"C:\My Projects\x & y";
        assert_eq!(opener("explorer", "", p).unwrap(), ("explorer.exe".to_string(), vec![p.to_string()]));
        assert_eq!(opener("code", "", p).unwrap(), ("code.cmd".to_string(), vec![p.to_string()]));
        assert_eq!(opener("custom", r#""C:\Program Files\Ed\ed.exe" -n {path}"#, p).unwrap(), (r"C:\Program Files\Ed\ed.exe".to_string(), vec!["-n".to_string(), p.to_string()]));
        assert_eq!(opener("custom", "ed --dir={path}", p).unwrap().1, vec![format!("--dir={p}")]);
        assert_eq!(opener("custom", "ed", p).unwrap().1, vec![p.to_string()], "no {path}: appended");
        assert!(opener("custom", "  ", p).is_err());
    }
```

and stub the functions above `fn claude_dir()`:

```rust
fn opener(kind: &str, custom: &str, path: &str) -> Result<(String, Vec<String>), String> {
    Err("todo".into())
}
fn split_words(s: &str) -> Vec<String> {
    vec![]
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml opener` → FAIL.

- [ ] **Step 6: Implement `opener`, `split_words`, `Live`, `open_folder`**

Replace the stubs:

```rust
/// The program and arguments that open a department's folder (Settings: adm.openWith = explorer | code | custom,
/// adm.openCmd). `path` is always one argument: `{path}` in a custom command is replaced inside its word, and
/// appended as the last argument when the command has none. Nothing goes through a shell.
fn opener(kind: &str, custom: &str, path: &str) -> Result<(String, Vec<String>), String> {
    match kind {
        "code" => Ok(("code.cmd".into(), vec![path.into()])),
        "custom" => {
            let words = split_words(custom);
            let (program, rest) = words.split_first().ok_or("no custom command set")?;
            let mut args: Vec<String> = rest.iter().map(|w| w.replace("{path}", path)).collect();
            if !rest.iter().any(|w| w.contains("{path}")) {
                args.push(path.into());
            }
            Ok((program.clone(), args))
        }
        _ => Ok(("explorer.exe".into(), vec![path.into()])),
    }
}

/// Words of a command line; double quotes group (no escapes): `"C:\Program Files\x.exe" -n {path}`.
fn split_words(s: &str) -> Vec<String> {
    let (mut out, mut cur, mut quoted, mut any) = (vec![], String::new(), false, false);
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            c => {
                cur.push(c);
                any = true;
            }
        }
    }
    if any {
        out.push(cur);
    }
    out
}
```

Below `type Chron = Mutex<Chronicle>;` add:

```rust
/// The newest roster, for commands that act on a live session (open_folder, toast buttons).
type Live = Mutex<Vec<Session>>;
```

After `firewall_remove` add:

```rust
/// A department plaque was clicked: open `path` (a live session's cwd, nothing else) with the program chosen in Settings.
#[tauri::command(async)]
fn open_folder(path: String, app: AppHandle, live: State<Live>) -> Result<(), String> {
    if !live.lock().map_err(|_| "roster unavailable")?.iter().any(|s| s.cwd == path) {
        return Err("not a session folder".into());
    }
    let v = settings::load(&settings_path(&app)?);
    let (program, args) = opener(v["adm.openWith"].as_str().unwrap_or("explorer"), v["adm.openCmd"].as_str().unwrap_or(""), &path)?;
    no_window(Command::new(&program)).args(args).spawn().map_err(|e| format!("{program}: {e}"))?;
    Ok(())
}
```

Add `open_folder` to `generate_handler![...]`. In `setup`, right after `app.manage::<Chron>(...)`, add
`app.manage::<Live>(Mutex::new(Vec::new()));`. In `poll_loop`, just before `emit(&app, "roster", &roster);`, add:

```rust
            *app.state::<Live>().lock().unwrap_or_else(|e| e.into_inner()) = roster.clone();
```

The remote view gets no route for it (`remote_backend` is unchanged).

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed.

- [ ] **Step 7: The plaque (`ui/app.js`, `ui/index.html`)**

In `app.js`, above `const plaques = new Map();`, add:

```js
// A department's most recently active session: its cwd is what the plaque opens, its branch what the plaque shows.
const deptHead = name => roster.filter(s => s.dept === name).reduce((p, q) => (!p || q.sinceMs > p.sinceMs ? q : p), null);
const shownBranch = b => (b && b !== 'main' && b !== 'master' ? b : '');
function openDept(name) {
  const s = deptHead(name), el = plaques.get(`b:${name}`);
  if (!s || REMOTE) return;
  invoke('open_folder', { path: s.cwd }).catch(err => {
    if (!el) return;
    el.title = String(err); el.classList.add('err');
    setTimeout(() => { el.title = 'Open the folder'; el.classList.remove('err'); }, 5000);
  });
}
```

Replace `renderPlaques` with:

```js
function renderPlaques(blocks) {
  const want = new Map(blocks.map(b => [`b:${b.name}`, ['plaque', b.name, b.x + 2, b.y + b.h - 7, b.color, b.w - 4, shownBranch(deptHead(b.name)?.branch)]]));
  if (layout.overflow) want.set('overflow', ['plaque', t('overflow', { n: layout.overflow }), 120 + hall.dx, hall.y1 - 10, T.ink.overflowPlaque]);
  if (!roster.length) want.set('empty', ['empty', t('empty'), 0, 120 + (hall.h - SCENE.h) / 2]);
  for (const [k, el] of plaques) if (!want.has(k)) { el.remove(); plaques.delete(k); }
  for (const [k, [cls, text, x, y, color, maxWidth, branch = '']] of want) {
    let el = plaques.get(k);
    if (!el) {
      el = document.createElement('div'); el.className = cls; overlay.appendChild(el); plaques.set(k, el);
      if (k.startsWith('b:') && !REMOTE) { el.classList.add('open'); el.title = 'Open the folder'; el.onclick = () => openDept(k.slice(2)); }
    }
    const css = { left: `${x * scale}px`, top: `${y * scale}px`, maxWidth: maxWidth ? `${maxWidth * scale}px` : '', borderColor: color ?? '', color: color ?? '',
      width: cls === 'empty' ? `${hall.sw * scale}px` : '' }; // the empty hall's notice, centred on the scriptorium
    if (el.dataset.text !== `${text}|${branch}`) {
      el.dataset.text = `${text}|${branch}`;
      const sub = document.createElement('span'); sub.className = 'branch'; sub.textContent = branch;
      el.replaceChildren(text, ...(branch ? [sub] : []));
    }
    for (const p in css) if (el.style[p] !== css[p]) el.style[p] = css[p];
  }
}
```

In `index.html` `<style>`, after the `.plaque` rule, add:

```css
  .plaque.open { pointer-events: auto; cursor: pointer; }
  .plaque.open:hover { filter: brightness(1.25); }
  .plaque.err { border-style: dashed; }
  .plaque .branch { display: block; font-size: .8em; letter-spacing: 1px; text-transform: none; opacity: .85; overflow: hidden; text-overflow: ellipsis; }
```

The global click handler (`addEventListener('click', ...)`) closes the card on a plaque click: that is fine.

- [ ] **Step 8: The opener setting (`ui/index.html`, `ui/settings.js`)**

In `index.html`, in `<section data-cat="system">`, inside the `Choices` fieldset after the idle-frame-rate hint, add:

```html
            <label class="wide host-only"><span>Open departments with</span><select name="openWith"><option value="explorer">Explorer</option><option value="code">VS Code</option><option value="custom">Custom command</option></select></label>
            <label class="wide host-only"><span>Custom command</span><input type="text" name="openCmd" spellcheck="false" placeholder='"C:\Path\app.exe" {path}'></label>
            <p class="hint host-only">A click on a department's plaque opens its folder. {path} is the folder, passed as one argument.</p>
```

In `settings.js`:
- in `sync`, add:

```js
    field('openWith').value = store.get('adm.openWith', 'explorer');
    if (document.activeElement !== field('openCmd')) field('openCmd').value = store.get('adm.openCmd', '');
    field('openCmd').disabled = field('openWith').value !== 'custom';
```

- in `form.onchange`, before the `login` branch: `else if (k === 'openWith' || k === 'openCmd') store.set(`adm.${k}`, el.value);`
- in the reset handler: `store.set('adm.openWith', 'explorer');`

- [ ] **Step 9: Checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed.
Run: `node ui/layout.test.mjs && node ui/theme.test.mjs && node ui/quiet.test.mjs` → each ok.

- [ ] **Step 10: README**

In `README.md`, under `### Characters and the card`, add a bullet:

```markdown
- **Click a department's plaque** to open its folder (the most recently active session's working directory) in
  Explorer, VS Code or a command of your own (Settings > System). A branch other than `main` / `master` shows under
  the department's name, read from `.git/HEAD` (worktrees included).
```

and in the Settings table, after `Pause when hidden or covered`, add:

```markdown
| Open departments with | Explorer | Explorer / VS Code / Custom command | What a plaque click opens the folder with. A custom command gets the folder as one argument (`{path}`, else appended) and never runs through a shell |
```

- [ ] **Step 11: Commit, build, reinstall**

```bash
git add src-tauri/src/git.rs src-tauri/src/registry.rs src-tauri/src/demo.rs src-tauri/src/poller.rs src-tauri/src/main.rs ui/app.js ui/settings.js ui/index.html README.md
git commit -m "plaques: click opens the department folder, branch shown under the name"
git push
```

Build and reinstall. Operator check: a plaque click opens Explorer on the project; a session on a feature branch shows
it under the plaque.

---

### Task 3: Usage limits

**Files:**
- Modify: `src-tauri/src/registry.rs`, `src-tauri/src/poller.rs`, `src-tauri/src/toast.rs`, `src-tauri/src/main.rs`, `ui/theme.js`, `ui/app.js`, `ui/actors.js`, `ui/index.html`, `README.md`

**Interfaces:**
- Consumes: `Session: Default` (Task 2), `quiet::active()` and `quietNow()` (Task 1).
- Produces: `registry::Limit { reset_ms: Option<i64>, text: String }` (JSON `limit: { resetMs, text }`), `registry::limit_of(&str) -> Option<Limit>`, `registry::reset_after(&str, i64) -> Option<i64>`, `Tail.limit`, `Session.limit`, `Tracker::new_limits(&[Session]) -> Vec<Vec<Session>>`; `toast::Text` gains `limit`, `limit_many`, `failed`; `toast::limit_title(&Text, &[&str], &str) -> String`, `toast::hhmm(i64) -> String`; command `set_toast_text` gains `limit, limitMany, failed`; webview event `limit` (payload: wave size); JS `syncTags(tags, cls, textOf, dx, dy)` in `app.js` (reused in Task 5).

- [ ] **Step 1: Write the failing tests (`registry.rs` tests module)**

```rust
    #[test]
    fn usage_limit_lines() {
        use chrono::{Local, TimeZone};
        let at = |h, m| Local.with_ymd_and_hms(2026, 10, 6, h, m, 0).unwrap().timestamp_millis();
        let iso = |ms: i64| chrono::DateTime::from_timestamp_millis(ms).unwrap().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let limit = |text: &str, ms: i64| format!(r#"{{"type":"assistant","timestamp":"{}","message":{{"model":"<synthetic>","content":[{{"type":"text","text":"{text}"}}]}},"error":"rate_limit","isApiErrorMessage":true}}"#, iso(ms));
        let prompt = r#"{"type":"user","message":{"content":"go on"}}"#;
        let result = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"x","content":"ok"}]}}"#;
        let answer = r#"{"type":"assistant","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":"done"}]}}"#;

        let l = limit_of(&limit("You've hit your limit · resets 2pm (Europe/Paris)", at(10, 0))).unwrap();
        assert_eq!(l.reset_ms, Some(at(14, 0)));
        assert_eq!(l.text, "You've hit your limit · resets 2pm (Europe/Paris)");
        assert!(limit_of(&format!("{}\n{result}", limit("resets 2pm", at(10, 0)))).is_some(), "a tool result after it: still limited");
        assert_eq!(limit_of(&format!("{}\n{prompt}", limit("resets 2pm", at(10, 0)))), None, "a prompt after it: lifted");
        assert_eq!(limit_of(&format!("{}\n{answer}", limit("resets 2pm", at(10, 0)))), None, "a normal answer after it");
        assert_eq!(limit_of(answer), None);

        assert_eq!(reset_after("resets 2:30pm (UTC)", at(10, 0)), Some(at(14, 30)));
        assert_eq!(reset_after("resets 12am", at(10, 0)), Some(at(0, 0) + 86_400_000), "midnight: the next day");
        assert_eq!(reset_after("resets 9am", at(10, 0)), Some(at(9, 0) + 86_400_000), "already past today: tomorrow");
        assert_eq!(reset_after("resets 12pm", at(10, 0)), Some(at(12, 0)));
        assert_eq!(reset_after("resets Oct 8, 2pm", at(10, 0)), None, "a date: no countdown");
        assert_eq!(reset_after("no reset here", at(10, 0)), None);
    }

    #[test]
    fn limit_waves_toast_once() {
        let lim = |id: &str, reset: Option<i64>| Session { limit: Some(Limit { reset_ms: reset, text: "x".into() }), ..session(id, 1, "idle", 0) };
        let mut t = Tracker::default();
        let first = t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), session("c", 3, "busy", 0)]);
        assert_eq!(first.len(), 1, "one wave");
        assert_eq!(first[0].iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a", "b"]);
        assert!(t.new_limits(&[lim("a", Some(5)), lim("b", Some(5)), lim("c", Some(5))]).is_empty(), "joining a toasted wave: no toast");
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "a new reset time: a new wave");
        assert!(t.new_limits(&[]).is_empty());
        assert_eq!(t.new_limits(&[lim("a", Some(9))]).len(), 1, "after it ended, the same reset is new again");
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml limit` → compile error (`limit_of`, `Limit` unknown). That is the failing state.

- [ ] **Step 2: Implement in `registry.rs`**

Add `use chrono::{Local, TimeZone};` with the other imports and `BTreeMap` to the `std::collections` import.

After `Context` add:

```rust
/// A usage limit the session is stopped on (`limit_of`): until `reset_ms` when the message names an hour.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limit {
    pub reset_ms: Option<i64>,
    pub text: String,
}
```

Add the field to `Session` (after `branch`):

```rust
    /// Stopped on a subscription usage limit (newest assistant line `"error":"rate_limit"`, no prompt since).
    pub limit: Option<Limit>,
```

After `pending_ask` add:

```rust
/// The usage limit a session is stopped on: its newest assistant line is Claude Code's synthetic
/// `"error":"rate_limit"` message ("You've hit your limit · resets 2pm (Europe/Paris)") and no prompt came after it.
pub fn limit_of(tail: &str) -> Option<Limit> {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let blocks = v["message"]["content"].as_array();
        match v["type"].as_str() {
            Some("assistant") => {
                if v["error"] != "rate_limit" {
                    return None;
                }
                let text = blocks.into_iter().flatten().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join(" ");
                let reset_ms = v["timestamp"].as_str().and_then(iso_utc_ms).and_then(|ts| reset_after(&text, ts));
                return Some(Limit { reset_ms, text: text.chars().take(120).collect() });
            }
            Some("user") if !blocks.is_some_and(|a| a.iter().any(|b| b["type"] == "tool_result")) && v["isMeta"] != true => return None,
            _ => {}
        }
    }
    None
}

/// The local time `resets 2pm` / `resets 2:30pm` / `resets 12am` names, at its first occurrence after `after_ms`.
// ponytail: the zone in parentheses is ignored, the PC's clock is taken as the user's; a date (weekly limit) -> None.
pub fn reset_after(text: &str, after_ms: i64) -> Option<i64> {
    let word = text.split("resets ").nth(1)?.split_whitespace().next()?.to_ascii_lowercase();
    let (clock, pm) = match word.strip_suffix("pm") {
        Some(c) => (c, true),
        None => (word.strip_suffix("am")?, false),
    };
    let (h, m) = match clock.split_once(':') {
        Some((h, m)) => (h.parse::<u32>().ok()?, m.parse::<u32>().ok()?),
        None => (clock.parse::<u32>().ok()?, 0),
    };
    if !(1..=12).contains(&h) || m > 59 {
        return None;
    }
    let after = Local.timestamp_millis_opt(after_ms).single()?;
    let mut at = after.date_naive().and_hms_opt(h % 12 + if pm { 12 } else { 0 }, m, 0)?;
    if at <= after.naive_local() {
        at += chrono::Duration::days(1);
    }
    Some(Local.from_local_datetime(&at).earliest()?.timestamp_millis())
}
```

In `Tail`, add `pub limit: Option<Limit>,` and in `read_tail`'s final `Some(Tail { ... })` add `limit: limit_of(&tail),`.

In `scan()`, next to `let compacted = ...;` add `let limit = tail.as_ref().and_then(|t| t.limit.clone());` and add
`limit,` in the `Session { ... }` literal.

In `Tracker`, add the field `limits: HashSet<String>,` and the method:

```rust
    /// Usage-limit waves seen for the first time, each the sessions sealed until the same reset (the message text when
    /// it names no hour): one toast per wave; a session joining a wave already toasted adds none.
    pub fn new_limits(&mut self, roster: &[Session]) -> Vec<Vec<Session>> {
        let mut waves: BTreeMap<String, Vec<Session>> = BTreeMap::new();
        for s in roster {
            if let Some(l) = &s.limit {
                waves.entry(l.reset_ms.map_or_else(|| l.text.clone(), |r| r.to_string())).or_default().push(s.clone());
            }
        }
        let fresh = waves.iter().filter(|(k, _)| !self.limits.contains(*k)).map(|(_, v)| v.clone()).collect();
        self.limits = waves.into_keys().collect();
        fresh
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed (both new tests ok). If `chrono::Duration` is
reported deprecated, use `chrono::TimeDelta::days(1)`.

- [ ] **Step 3: The poller drops an expired limit**

In `poller.rs`, inside the `for s in roster.iter_mut()` loop added in Task 2, add at its top:

```rust
            if s.limit.as_ref().and_then(|l| l.reset_ms).is_some_and(|r| r <= now_ms) {
                s.limit = None; // the reset hour has passed: the next prompt will go through
            }
```

- [ ] **Step 4: Toast wording (`toast.rs`) with a failing test**

Extend `Text` with three fields and their defaults:

```rust
    pub limit: String,
    pub limit_many: String,
    pub failed: String,
```

```rust
            limit: "{name} sealed until {time}".into(),
            limit_many: "{n} sessions sealed until {time}".into(),
            failed: "{name}: open the terminal".into(),
```

In `set`, add `limit: pick(new.limit, d.limit), limit_many: pick(new.limit_many, d.limit_many), failed: pick(new.failed, d.failed),`.
In the existing `wording` test, the `set(Text { ... })` literal gets `..Text::default()` at its end.

Add the test:

```rust
    #[test]
    fn limit_wording() {
        let t = Text::default();
        assert_eq!(limit_title(&t, &["api"], "14:00"), "api sealed until 14:00");
        assert_eq!(limit_title(&t, &["api", "web", "db"], "14:00"), "3 sessions sealed until 14:00");
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml toast::` → compile error (`limit_title`). Then implement after `fill`:

```rust
/// A usage-limit wave's toast title: `limit` for one session, `limit_many` ({n}) for several; {time} the reset.
pub fn limit_title(t: &Text, names: &[&str], time: &str) -> String {
    let tpl = if names.len() == 1 { &t.limit } else { &t.limit_many };
    tpl.replace("{name}", names.first().copied().unwrap_or("")).replace("{n}", &names.len().to_string()).replace("{time}", time)
}

/// "14:00" in local time.
pub fn hhmm(ms: i64) -> String {
    use chrono::TimeZone;
    chrono::Local.timestamp_millis_opt(ms).single().map(|d| d.format("%H:%M").to_string()).unwrap_or_default()
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml toast::` → ok.

- [ ] **Step 5: `main.rs`: wording command, wave toast, chronicle event**

Replace `set_toast_text` with:

```rust
/// The toasts' wording from the active theme (toast.rs; app.js pushes it on start and on a theme change).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn set_toast_text(petition: String, question: String, stale: String, needed: String, limit: String, limit_many: String, failed: String) {
    toast::set(toast::Text { petition, question, stale, needed, limit, limit_many, failed });
}
```

In `poll_loop`, after the stale-petition loop (where `now_ms` is a local), add:

```rust
            let mut limit_events = vec![];
            for wave in tracker.new_limits(&roster) {
                let reset = wave[0].limit.as_ref().and_then(|l| l.reset_ms);
                let time = reset.map_or_else(|| "later".to_string(), toast::hhmm);
                if !quiet {
                    let names: Vec<&str> = wave.iter().map(|s| s.name.as_str()).collect();
                    let body = if wave.len() == 1 { format!("{} · {}", wave[0].dept, wave[0].limit.as_ref().map_or("", |l| l.text.as_str())) } else { names.join(", ") };
                    let _ = app.notification().builder().title(toast::limit_title(&words, &names, &time)).body(body).show();
                }
                emit(&app, "limit", wave.len());
                for s in &wave {
                    limit_events.push(Event { ts: now_ms, kind: "limit".into(), session_id: s.id.clone(), name: s.name.clone(), dept: s.dept.clone(), helper: None, detail: time.clone() });
                }
            }
```

and inside the chronicle block, right after the `if !first { events.extend(chronicle::lifecycle(...)); }` block (outside
it), add `events.extend(limit_events);`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed; `cargo build --manifest-path src-tauri/Cargo.toml` → no error.

- [ ] **Step 6: UI wording (`ui/theme.js`) and `set_toast_text` (`ui/app.js`)**

In `TEXT` (theme.js):
- after `overflow: ..., empty: ...,` add `limitLabel: 'sealed · resets {time}', limitSealed: 'sealed',`
- in `event`, add `limit: 'Usage limit',`
- in `toast`, add `limit: '{name} sealed until {time}', limitMany: '{n} sessions sealed until {time}', failed: '{name}: open the terminal'`

In `app.js` `applyChrome`, replace the `set_toast_text` call with:

```js
  if (!REMOTE) invoke('set_toast_text', { petition: t('toast.petition'), question: t('toast.question'), stale: t('toast.stale'), needed: t('toast.needed'),
    limit: t('toast.limit'), limitMany: t('toast.limitMany'), failed: t('toast.failed') }).catch(() => {});
```

(`t()` returns an unfilled template: `{name}` / `{n}` / `{time}` stay for the backend to fill.)

- [ ] **Step 7: The sealed tag, card line, nap rule, chime**

In `app.js`, after `syncEdges`'s definition, add:

```js
// Small read-only tags over characters (a sealed scribe; Task 5's sheet count): one element per actor id, kept while
// textOf(actor) is non-empty, placed at the actor's feet + (dx, dy) logical px.
function syncTags(tags, cls, textOf, dx, dy) {
  for (const [id, el] of tags) { const a = cast.actors.get(id); if (!a || !textOf(a)) { el.remove(); tags.delete(id); } }
  for (const a of cast.actors.values()) {
    const text = textOf(a);
    if (!text) continue;
    let el = tags.get(a.id);
    if (!el) { el = document.createElement('div'); el.className = `lbl tag ${cls}`; overlay.appendChild(el); tags.set(a.id, el); }
    if (el.textContent !== text) el.textContent = text;
    setStyle(el, { left: `${(a.x + dx) * scale}px`, top: `${(a.y + dy) * scale}px` });
  }
}
// A scribe stopped on a usage limit (backend `limit`): sealed until the reset hour.
const sealTags = new Map();
const sealText = a => (!a.h && !a.leaving && a.s.limit && !labels.has(a.id)
  ? (a.s.limit.resetMs ? t('limitLabel', { time: hhmm(new Date(a.s.limit.resetMs)) }) : t('limitSealed')) : '');
```

In `frame()`, after `syncLabels();` add `syncTags(sealTags, 'sealed', sealText, 0, -18);`.

In `renderCard`, change the task line to:

```js
  card.querySelector('.task').textContent = s.status === 'waiting' && s.asks ? `Asks to: ${s.asks}` : s.limit ? s.limit.text : s.task;
```

In the listeners at the bottom add `listen('limit', () => quietNow() || chime([520, 390]));`.

In `index.html` `<style>`, after the `.lbl` rules, add:

```css
  .lbl.tag { pointer-events: none; cursor: default; }
  .lbl.sealed { border-width: 3px; border-style: double; }
```

In `actors.js` `napping()`, change the `sleepy` filter to add `&& !s.limit`:

```js
    const sleepy = roster.filter(s => s.status === 'idle' && !s.background && !s.limit && !isQuestion(s) && s.sinceMs && now - s.sinceMs > NAP_MS()).sort((p, q) => p.sinceMs - q.sinceMs);
```

- [ ] **Step 8: Checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed.
Run: `node ui/layout.test.mjs && node ui/theme.test.mjs && node ui/quiet.test.mjs && node ui/sprites.test.mjs` → ok.
If `theme.test.mjs` checks that every theme has the same text keys, the new keys come from `TEXT` through `merge`, so it stays green.

- [ ] **Step 9: README**

In the "What it shows" table, after the `Scribe raises its scroll...` row, add:

```markdown
| Scribe stays at its desk under a `sealed · resets 14:00` tag | The session hit a subscription usage limit. One toast per wave: sessions sealed until the same hour share it. The tag goes at the reset hour or at the next prompt |
```

and add `usage limits` to the Chronicle tab's event list sentence ("It covers commits, pushes, ... and compactions" →
"... compactions and usage limits").

- [ ] **Step 10: Commit, build, reinstall**

```bash
git add src-tauri/src/registry.rs src-tauri/src/poller.rs src-tauri/src/toast.rs src-tauri/src/main.rs ui/theme.js ui/app.js ui/actors.js ui/index.html README.md
git commit -m "usage limits: sealed scribes, one toast per wave, reset countdown"
git push
```

Build and reinstall. The detection is covered by the tests above (a real transcript line's shape); the scene and the
toast are confirmed by the operator on the next real limit. Never write a fake line under `~/.claude` to test it.

---

### Task 4: Approve / Deny on the toast

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/toast.rs`, `src-tauri/src/main.rs`, `README.md`

**Interfaces:**
- Consumes: `Live` (Task 2), `answer_petition(handle, choice)` (existing), `toast::get().failed` (Task 3), `quiet` local in `poll_loop` (Task 1).
- Produces: `toast::action_arg(choice, since_ms, id) -> String`, `toast::parse_action(&str) -> Option<(&str, i64, &str)>`, `toast::has_buttons(&Session) -> bool`, `toast::still_open(&[Session], id, since_ms) -> Option<&str>`; `main.rs`: `petition_toast(app, s, title, body)`, `toast_app_id(app) -> String`.

- [ ] **Step 1: Write the failing tests (`toast.rs`)**

```rust
    #[test]
    fn button_arguments() {
        let a = action_arg("yes", 1700, "4c3c217f-6b90");
        assert_eq!(a, "yes:1700:4c3c217f-6b90");
        assert_eq!(parse_action(&a), Some(("yes", 1700, "4c3c217f-6b90")));
        assert_eq!(parse_action("no:5:abc"), Some(("no", 5, "abc")));
        assert_eq!(parse_action("always:5:abc"), None, "only yes / no from a toast");
        assert_eq!(parse_action("yes:x:abc"), None);
        assert_eq!(parse_action("yes:5:"), None);
        assert_eq!(parse_action("yes:5:a:b"), None);
        assert_eq!(parse_action(""), None);
    }

    #[test]
    fn buttons_only_for_open_orca_permission_prompts() {
        use crate::registry::{tests_session, Session};
        let p = Session { status: "waiting".into(), since_ms: 9, orca: Some("term_ab".into()), waiting_for: Some("approve Bash".into()), ..tests_session("s") };
        assert!(has_buttons(&p));
        assert!(!has_buttons(&Session { orca: None, ..p.clone() }), "not in Orca");
        assert!(!has_buttons(&Session { waiting_for: Some("input needed".into()), ..p.clone() }), "free-text petition");
        let roster = vec![p.clone()];
        assert_eq!(still_open(&roster, "s", 9), Some("term_ab"));
        assert_eq!(still_open(&roster, "s", 8), None, "another episode");
        assert_eq!(still_open(&[Session { status: "busy".into(), ..p.clone() }], "s", 9), None, "already answered");
        assert_eq!(still_open(&[], "s", 9), None, "gone");
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml toast::` → compile error (functions missing).

- [ ] **Step 2: Implement (`toast.rs`)**

Add `use crate::registry::Session;` at the top, then:

```rust
/// A toast button's argument: `<yes|no>:<since_ms>:<session id>` (the episode, so a click on an old toast is ignored).
pub fn action_arg(choice: &str, since_ms: i64, id: &str) -> String {
    format!("{choice}:{since_ms}:{id}")
}

/// `action_arg` back; anything else (another choice, a malformed or empty part) -> None.
pub fn parse_action(arg: &str) -> Option<(&str, i64, &str)> {
    let mut parts = arg.split(':');
    let (choice, since, id) = (parts.next()?, parts.next()?.parse().ok()?, parts.next()?);
    (matches!(choice, "yes" | "no") && !id.is_empty() && parts.next().is_none()).then_some((choice, since, id))
}

/// Whether a petition toast gets Approve / Deny: a permission prompt in an Orca terminal (as the card's `answerable`).
pub fn has_buttons(s: &Session) -> bool {
    s.status == "waiting" && s.orca.is_some() && s.waiting_for.as_deref().is_some_and(|w| {
        let w = w.to_ascii_lowercase();
        w.contains("approve") || w.contains("permission")
    })
}

/// The Orca handle to answer through, only while the toast's petition is still open: same session, same episode,
/// still a permission prompt in Orca. Otherwise (answered in the terminal, gone) None: nothing is typed.
pub fn still_open<'a>(roster: &'a [Session], id: &str, since_ms: i64) -> Option<&'a str> {
    roster.iter().find(|s| s.id == id && s.since_ms == since_ms).filter(|s| has_buttons(s)).and_then(|s| s.orca.as_deref())
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml toast::` → all ok.

- [ ] **Step 3: Dependency**

In `src-tauri/Cargo.toml`, under `[target.'cfg(windows)'.dependencies]`, add `tauri-winrt-notification = "0.8"`.
Run: `cargo build --manifest-path src-tauri/Cargo.toml` → builds (the crate is already in `Cargo.lock` at 0.8.1).

- [ ] **Step 4: `petition_toast` (`main.rs`)**

Above `poll_loop`, add:

```rust
/// The app id toasts show under: the installed app's identifier; PowerShell's in a dev build (the identifier is only
/// registered by the installer), as tauri-plugin-notification does.
#[cfg(windows)]
fn toast_app_id(app: &AppHandle) -> String {
    let dev = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.ends_with(std::path::Path::new("target").join("debug")) || d.ends_with(std::path::Path::new("target").join("release")))).unwrap_or(false);
    if dev { tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string() } else { app.config().identifier.clone() }
}

/// A petition toast. A permission prompt in an Orca terminal gets Approve / Deny: a click answers through
/// `answer_petition` (the same screen check as the card), only while that petition is still open (toast::still_open);
/// a failure shows a plain "open the terminal" toast. Anything else, or a WinRT error: the plugin's plain toast.
fn petition_toast(app: &AppHandle, s: &Session, title: String, body: String) {
    #[cfg(windows)]
    if toast::has_buttons(s) {
        // (a cfg on an `if` statement; if the compiler objects, wrap this `if` in a block: `#[cfg(windows)] { if ... }`)
        let (handle, name) = (app.clone(), s.name.clone());
        let shown = tauri_winrt_notification::Toast::new(&toast_app_id(app))
            .title(&title)
            .text1(&body)
            .add_button("Approve", &toast::action_arg("yes", s.since_ms, &s.id))
            .add_button("Deny", &toast::action_arg("no", s.since_ms, &s.id))
            .on_activated(move |arg| {
                let Some((choice, since, id)) = arg.as_deref().and_then(toast::parse_action) else { return Ok(()) };
                let open = handle.state::<Live>().lock().ok().and_then(|r| toast::still_open(&r, id, since).map(str::to_string));
                if let Some(orca) = open {
                    if answer_petition(orca, choice.to_string()).is_err() {
                        let _ = handle.notification().builder().title(toast::fill(&toast::get().failed, &name)).show();
                    }
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

In `poll_loop`, replace the petition toast (inside `if !quiet`) and the stale toast with:

```rust
            for s in tracker.new_petitions(&roster) {
                if !quiet {
                    let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
                    petition_toast(&app, &s, toast::fill(&words.petition, &s.name), body);
                }
                emit(&app, "petition", &s);
            }
```

```rust
            for s in tracker.stale_petitions(&roster, now_ms + shift) {
                let body = format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| words.needed.clone()));
                petition_toast(&app, &s, toast::fill(&words.stale, &s.name), body);
                emit(&app, "petition-stale", &s);
            }
```

Note: `Live` is filled at the end of each tick (Task 2), so a click reads the roster of the last finished tick: the
toast's own petition is in it. If `on_activated`'s closure type does not infer, write the return as
`Ok::<(), tauri_winrt_notification::Error>(())` (check the crate's `Result` alias in its `lib.rs`).

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed; `cargo build --manifest-path src-tauri/Cargo.toml` → ok.

- [ ] **Step 5: README**

In `### Answering petitions`, after the first paragraph, add:

```markdown
The petition toast itself carries **Approve** and **Deny** for the same prompts (permission, in Orca). A click runs
the same check below. If the petition was already answered in the terminal, nothing is typed. *Always* stays on the
card: on a toast it could be clicked without reading the prompt.
```

- [ ] **Step 6: Commit, build, reinstall, manual check**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/toast.rs src-tauri/src/main.rs README.md
git commit -m "toasts: Approve and Deny on permission petitions in Orca"
git push
```

Build and reinstall (the installed build is needed: the app id is registered by the installer). Operator check, in an
Orca terminal: (1) trigger a permission prompt, click **Approve** on the toast → the prompt is answered; (2) again,
click **Deny** → denied; (3) again, answer in the terminal first, then click the toast's Approve → nothing typed.
Also check a click from the Action Center after the toast has gone there. If (1) does nothing from the Action Center,
note it in the README sentence ("while the toast is on screen").

---

### Task 5: Turn summary

**Files:**
- Modify: `src-tauri/src/registry.rs`, `src-tauri/src/chronicle.rs`, `src-tauri/src/main.rs`, `ui/app.js`, `ui/index.html`, `README.md`

**Interfaces:**
- Consumes: `Session: Default` (Task 2), `syncTags` (Task 3).
- Produces: `registry::TurnSummary { started_ms: Option<i64>, last_ms: Option<i64>, tools: u32, files: Vec<String>, more_files: u32 }` (JSON `turn: { startedMs, lastMs, tools, files, moreFiles }`), `Session.turn`, `chronicle::track_turn(&mut TurnSummary, &str, &str)`, `chronicle::turn_wanted(&str) -> bool`, `Chronicle::turns(&Files) -> HashMap<String, TurnSummary>`.

- [ ] **Step 1: The type (`registry.rs`)**

After `Limit` add:

```rust
/// A session's current (or last) turn, folded from its main transcript by the chronicle (`track_turn`): when its
/// prompt came, the newest assistant line, how many tool calls, the files Edit / Write / MultiEdit / NotebookEdit
/// changed (relative to the cwd when inside it; at most MAX_TURN_FILES, the rest counted in `more_files`).
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnSummary {
    pub started_ms: Option<i64>,
    pub last_ms: Option<i64>,
    pub tools: u32,
    pub files: Vec<String>,
    pub more_files: u32,
}
```

and the `Session` field (after `limit`):

```rust
    /// The current or last turn (chronicle.rs), filled by the poll loop.
    pub turn: Option<TurnSummary>,
```

- [ ] **Step 2: Write the failing tests (`chronicle.rs` tests module)**

```rust
    #[test]
    fn turn_summary() {
        use crate::registry::TurnSummary;
        let cwd = r"C:\git\Terra";
        let lines = [
            r#"{"type":"user","timestamp":"2026-10-06T10:00:00.000Z","message":{"content":"fix the plaque"}}"#,
            r#"{"type":"assistant","timestamp":"2026-10-06T10:00:05.000Z","message":{"content":[{"type":"tool_use","id":"1","name":"Read","input":{"file_path":"C:\\git\\Terra\\ui\\app.js"}},{"type":"tool_use","id":"2","name":"Edit","input":{"file_path":"C:\\git\\Terra\\ui\\app.js"}}]}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:00:06.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"2","content":"ok"}]}}"#,
            r#"{"type":"assistant","timestamp":"2026-10-06T10:01:00.000Z","message":{"content":[{"type":"tool_use","id":"3","name":"Edit","input":{"file_path":"c:/git/terra/ui/app.js"}},{"type":"tool_use","id":"4","name":"Write","input":{"file_path":"D:\\other\\notes.md"}},{"type":"tool_use","id":"5","name":"NotebookEdit","input":{"notebook_path":"C:\\git\\Terra\\nb.ipynb"}}]}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:02:00.000Z","message":{"content":"<command-name>/clear</command-name>"}}"#,
            r#"{"type":"user","timestamp":"2026-10-06T10:02:01.000Z","isMeta":true,"message":{"content":"caveat"}}"#,
        ];
        let mut t = TurnSummary::default();
        for l in lines {
            track_turn(&mut t, l, cwd);
        }
        assert_eq!(t.started_ms, registry::iso_utc_ms("2026-10-06T10:00:00.000Z"));
        assert_eq!(t.last_ms, registry::iso_utc_ms("2026-10-06T10:01:00.000Z"));
        assert_eq!(t.tools, 5);
        assert_eq!(t.files, ["ui/app.js", r"D:\other\notes.md", "nb.ipynb"], "relative inside the cwd, once each, any slash or case");
        assert_eq!(t.more_files, 0);

        track_turn(&mut t, r#"{"type":"user","timestamp":"2026-10-06T11:00:00.000Z","message":{"content":[{"type":"text","text":"next"}]}}"#, cwd);
        assert_eq!((t.tools, t.files.len(), t.started_ms), (0, 0, registry::iso_utc_ms("2026-10-06T11:00:00.000Z")), "a real prompt starts a new turn");

        for i in 0..(MAX_TURN_FILES + 3) {
            track_turn(&mut t, &format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","id":"w{i}","name":"Write","input":{{"file_path":"C:\\git\\Terra\\f{i}.txt"}}}}]}}}}"#), cwd);
        }
        assert_eq!((t.files.len(), t.more_files), (MAX_TURN_FILES, 3));

        assert!(turn_wanted(lines[0]) && turn_wanted(lines[1]));
        assert!(!turn_wanted(r#"{"type":"ai-title","aiTitle":"x"}"#));
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml turn_summary` → compile error (`track_turn` missing).

- [ ] **Step 3: Implement (`chronicle.rs`)**

Import: change `use crate::registry::{self, FileStat, Session};` to `use crate::registry::{self, FileStat, Session, TurnSummary};`.

Add `turn: TurnSummary,` to `Cursor` (it derives `Default`; `TurnSummary` does too). After `extract_line` add:

```rust
pub const MAX_TURN_FILES: usize = 50;
const EDIT_TOOLS: [&str; 4] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

/// Whether `track_turn` can use `line`: a user line (a prompt starts a turn) or one with a tool call.
pub fn turn_wanted(line: &str) -> bool {
    line.contains("\"type\":\"user\"") || line.contains("tool_use")
}

/// Folds one main-transcript line into the session's turn: a real prompt (not tool results, not a meta or
/// local-command line such as `/clear`) starts a new turn; each tool_use counts; an edit adds its file once.
// ponytail: a line with tool calls is parsed again here (extract_line parsed it too); cheap next to the disk read.
pub fn track_turn(turn: &mut TurnSummary, line: &str, cwd: &str) {
    let Ok(v) = serde_json::from_str::<Value>(line) else { return };
    let ts = v["timestamp"].as_str().and_then(registry::iso_utc_ms);
    let content = &v["message"]["content"];
    match v["type"].as_str() {
        Some("user") => {
            let prompt = match content {
                Value::String(s) => !s.contains("<command-name>") && !s.contains("<local-command"),
                Value::Array(a) => !a.iter().any(|b| b["type"] == "tool_result"),
                _ => false,
            };
            if prompt && v["isMeta"] != true {
                *turn = TurnSummary { started_ms: ts, last_ms: ts, ..Default::default() };
            }
        }
        Some("assistant") => {
            turn.last_ms = ts.or(turn.last_ms);
            for b in content.as_array().into_iter().flatten().filter(|b| b["type"] == "tool_use") {
                turn.tools += 1;
                if !b["name"].as_str().is_some_and(|n| EDIT_TOOLS.contains(&n)) {
                    continue;
                }
                let Some(p) = b["input"]["file_path"].as_str().or(b["input"]["notebook_path"].as_str()) else { continue };
                let p = relative(p, cwd);
                // ponytail: past the cap a file edited twice counts twice in more_files; the card only says "+N more".
                if turn.files.contains(&p) {
                    continue;
                }
                if turn.files.len() < MAX_TURN_FILES {
                    turn.files.push(p);
                } else {
                    turn.more_files += 1;
                }
            }
        }
        _ => {}
    }
}

/// `p` relative to `cwd` with forward slashes when inside it (ASCII case and either slash ignored), else `p` as is.
fn relative(p: &str, cwd: &str) -> String {
    let norm = |s: &str| s.replace('/', "\\").to_ascii_lowercase();
    let (np, nc) = (norm(p), norm(cwd.trim_end_matches(['\\', '/'])));
    if np.len() > nc.len() + 1 && np.starts_with(&nc) && np.as_bytes()[nc.len()] == b'\\' {
        p[nc.len() + 1..].replace('\\', "/")
    } else {
        p.to_string()
    }
}
```

In `read_transcripts`, replace the `read_new(...)` closure with:

```rust
                let read = read_new(f, self.offsets.get(&key).copied(), today_start, |line, today_only| {
                    let events = wanted(line);
                    let turn = !*sub && turn_wanted(line);
                    if !events && !turn {
                        return;
                    }
                    if !cursors.contains_key(path) {
                        cursors.insert(path.clone(), (Cursor::default(), sub.then(|| registry::helper_meta(path).agent_type.unwrap_or_else(|| "agent".into()))));
                    }
                    let Some((cur, helper)) = cursors.get_mut(path) else { return };
                    if turn {
                        track_turn(&mut cur.turn, line, &s.cwd);
                    }
                    if events {
                        let src = Src { session_id: &s.id, name: &s.name, dept: &s.dept, helper: helper.as_deref() };
                        extract_line(cur, line, if today_only { today_start } else { i64::MIN }, &src, now_ms, &mut found);
                    }
                });
```

After `read_transcripts`, add:

```rust
    /// Each live session's current turn (from its main transcript's cursor), by session id; none before a first prompt
    /// or tool call has been read.
    pub fn turns(&self, files: &HashMap<String, Vec<(FileStat, bool)>>) -> HashMap<String, TurnSummary> {
        files
            .iter()
            .filter_map(|(id, fs)| {
                let (f, _) = fs.iter().find(|(_, sub)| !sub)?;
                let (cur, _) = self.cursors.get(&f.path)?;
                (cur.turn.started_ms.is_some() || cur.turn.tools > 0).then(|| (id.clone(), cur.turn.clone()))
            })
            .collect()
    }
```

If `iso_utc_ms` is `pub(crate)` the test can still call it (same crate). If `Value` patterns complain about `Value::String(s)`
shadowing, rename to `Value::String(t)`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed (`turn_summary` ok, the existing chronicle tests unchanged).

- [ ] **Step 4: The poll loop attaches it (`main.rs`)**

Change `let roster = if demo { ... }` to `let mut roster = ...`. Before the chronicle block (`{ let now = now_ms; ...`),
add `let mut turns = std::collections::HashMap::new();`. In the non-demo branch, replace
`c.read_transcripts(&roster, &poller.files, now)` with:

```rust
                    let ev = c.read_transcripts(&roster, &poller.files, now);
                    turns = c.turns(&poller.files);
                    ev
```

After the chronicle block closes, add:

```rust
            for s in roster.iter_mut() {
                s.turn = turns.remove(&s.id);
            }
```

(before the `Live` update and `emit(&app, "roster", &roster)` added in Task 2.)

Run: `cargo build --manifest-path src-tauri/Cargo.toml` → ok.

- [ ] **Step 5: Card and desk tag (`ui/index.html`, `ui/app.js`)**

In `index.html`, in `#card`, after `<div class="task"></div>` add:

```html
    <div class="turn" hidden></div>
    <ul class="files" hidden></ul>
```

and in `<style>`:

```css
  #card .turn { color: var(--paper-ink-2); }
  #card .turn[hidden], #card .files[hidden] { display: none; }
  #card .files { margin: 0; padding: 0 0 0 1em; font-family: ui-monospace, Consolas, monospace; font-size: .85em; max-height: 9em; overflow-y: auto; overflow-wrap: anywhere; }
  #card .files .more { padding: 0; background: none; border: none; color: var(--paper-accent); font: inherit; cursor: pointer; text-decoration: underline; }
  .lbl.sheets { font-size: calc(8px * var(--k, 1)); border-color: var(--green); }
```

In `app.js`, after `renderAsks`, add:

```js
// The turn in progress (or the last one, frozen at its newest answer): length, tool calls, files changed (backend `turn`).
const expanded = new Set(); // session ids whose file list is shown in full
const span = ms => { const m = Math.floor(ms / 60000); return m < 1 ? '<1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`; };
const filesOf = tr => (tr ? tr.files.length + tr.moreFiles : 0);
function renderTurn(card, s) {
  const line = card.querySelector('.turn'), list = card.querySelector('.files'), tr = s?.turn;
  line.hidden = !tr;
  list.hidden = !filesOf(tr);
  if (!tr) return;
  const working = ['busy', 'shell', 'waiting'].includes(s.status), n = filesOf(tr);
  const took = tr.startedMs ? `${span((working ? Date.now() : tr.lastMs ?? Date.now()) - tr.startedMs)} · ` : '';
  line.textContent = `Turn · ${took}${tr.tools} tool${tr.tools === 1 ? '' : 's'} · ${n} file${n === 1 ? '' : 's'}`;
  const all = expanded.has(s.id), shown = all ? tr.files : tr.files.slice(0, 8);
  const key = `${s.id}|${all}|${tr.files.join('|')}|${tr.moreFiles}`;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren(...shown.map(f => { const li = document.createElement('li'); li.textContent = f; return li; }));
  const rest = n - shown.length;
  if (rest > 0) {
    const li = document.createElement('li');
    if (all) li.textContent = `+${rest} more`;
    else {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'more'; b.textContent = `+${rest} more`;
      b.onclick = () => { expanded.add(s.id); renderCard(); };
      li.appendChild(b);
    }
    list.appendChild(li);
  }
}
```

In `renderCard`: in the adept branch, after `renderAsks(card, null);` add `renderTurn(card, null);`; in the scribe
branch, after `renderAsks(card, s);` add `renderTurn(card, s);`.

Next to `sealTags` add:

```js
// A working scribe's files changed this turn, by its desk.
const sheetTags = new Map();
const sheetText = a => (!a.h && !a.leaving && a.pose === 'desk' && (a.s.status === 'busy' || a.s.status === 'shell') && filesOf(a.s.turn) ? `✎${filesOf(a.s.turn)}` : '');
```

and in `frame()`, after the `sealTags` call: `syncTags(sheetTags, 'sheets', sheetText, 10, -2);`.

- [ ] **Step 6: Checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml` → 0 failed.
Run: `node ui/layout.test.mjs && node ui/theme.test.mjs && node ui/quiet.test.mjs && node ui/sprites.test.mjs && node ui/art.test.mjs && node ui/sun.test.mjs` → all ok.

- [ ] **Step 7: README**

In `### Characters and the card`, in the bullet describing the card's content, add after "the last task line,":
"the turn (`Turn · 4 min · 23 tools · 5 files`, then the files it changed),". In the "What it shows" table add:

```markdown
| `✎5` by a working scribe's desk | Files the current turn has changed (Edit, Write, MultiEdit, NotebookEdit). The card lists them |
```

- [ ] **Step 8: Commit, build, reinstall**

```bash
git add src-tauri/src/registry.rs src-tauri/src/chronicle.rs src-tauri/src/main.rs ui/app.js ui/index.html README.md
git commit -m "turn summary: length, tool calls and changed files per session"
git push
```

Build and reinstall. Operator check: click a busy scribe → `Turn · …` line and the file list; the `✎N` tag by its desk
while it works.

---

## After the last task

- Update `docs/backlog.md`: add to "Done recently": quiet hours, plaque click + branch, usage limits, toast actions, turn summary.
- Commit and push: `git commit -am "backlog: five features done" && git push`.
