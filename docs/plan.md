---
tags:
  - plan
  - administratum
  - claude-code
status: ready
date: 2026-10-05
spec: docs/spec.md
---

# Administratum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 desktop widget that renders every local Claude Code session as a Mechanicus scribe in a top-down pixel-art office (Tier II) and raises a toast + chime when one needs the operator.

**Architecture:** A Rust backend polls `~/.claude/sessions/*.json` once a second, filters dead pids, reads each transcript tail for a task line, and emits the roster to the webview; it also fires one Windows toast per petition episode. A plain-JS frontend (ES modules, no build step) draws a 346×226 logical canvas scaled by an integer factor: static room, dynamic department desks, walking scribes, lighting (auto/full/candles), DOM labels and a detail card.

**Tech Stack:** Rust 1.95, Tauri 2 (`tray-icon`), `tauri-plugin-notification` 2, `tauri-plugin-window-state` 2, `tauri-plugin-autostart` 2, `serde`/`serde_json` 1, `sysinfo` 0.37; vanilla JS + Canvas 2D; Node 22 for the layout self-check.

## Global Constraints

- Repo: `C:\Users\guill\Documents\git\Administratum`, GitHub `Arylmera/Administratum`, **private**. Commit straight to `main`.
- Commits: plain messages, **no** `Co-Authored-By` / `Claude-Session` trailers, no backticks in `-m`.
- Read-only towards Claude Code: never write anything under `~/.claude`. No hooks, no config changes.
- No npm build: Tauri serves `ui/` as-is (`build.frontendDist: "../ui"`). No frontend framework, no frontend test framework.
- Logical scene size **346×226**, integer CSS scale, `image-rendering: pixelated`, 30 fps cap.
- Tier II art and palette only (robe `#5e1710` / `#3a0d09`, green phosphor `#7cff9e`).
- Petition toast fires **once per episode** keyed `sessionId:statusUpdatedAt`.
- Lighting modes `auto` (default) / `full` / `candles`; auto: 08–18 day, 06–08 & 18–21 dusk, else night. Persisted in `localStorage` (`adm.mode`, `adm.muted`), every access in try/catch.
- Commands handed to the operator run in PowerShell: no `$(...)`, no `<`, no `\"` nesting.

## File map

| Path | Responsibility |
|---|---|
| `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json` | Tauri app shell |
| `src-tauri/src/registry.rs` | Pure registry logic: parse, liveness filter, task line, merge, petition tracker (+ unit tests) |
| `src-tauri/src/demo.rs` | Scripted roster for `--demo` / `ADMINISTRATUM_DEMO=1` (+ unit test) |
| `src-tauri/src/main.rs` | Poll loop, emit, toast, tray, plugins |
| `tools/make_icon.py` | Generates the Cog Mechanicus source PNG for `cargo tauri icon` |
| `ui/index.html` | Header, stage, card, CSS |
| `ui/sprites.js` | Palette, pixel maps, cached sprite canvases |
| `ui/layout.js` | Pure geometry: department layout, waypoints, routes, lighting levels |
| `ui/layout.test.mjs` | Node `assert` self-check for `layout.js` |
| `ui/scene.js` | Static room drawing, desks, rugs, static lights |
| `ui/lighting.js` | Darkness layer with light holes, glows, beams, vignette |
| `ui/actors.js` | Scribe simulation: destinations, walking, drawing |
| `ui/app.js` | Wiring: Tauri events, header, labels, card, chime, loop |

---

### Task 1: Scaffold the repo and a window that opens

**Files:**
- Create: `.gitignore`, `README.md`, `tools/make_icon.py`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `ui/index.html`, `ui/package.json`

**Interfaces:**
- Produces: a Tauri app with window label `main`, `withGlobalTauri: true`, frontend in `ui/`.

- [x] **Step 1: Work in the existing clone**

The private repo `Arylmera/Administratum` already exists and is cloned; it holds this plan (`docs/plan.md`) and the spec (`docs/spec.md`).

```powershell
Set-Location C:\Users\guill\Documents\git\Administratum
git switch main
git pull
```

- [x] **Step 2: Write `.gitignore`**

```gitignore
src-tauri/target/
src-tauri/gen/
icon-src.png
```

- [x] **Step 3: Write `src-tauri/Cargo.toml`**

```toml
[package]
name = "administratum"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-notification = "2"
tauri-plugin-window-state = "2"
tauri-plugin-autostart = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sysinfo = "0.37"
```

- [x] **Step 4: Write `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [x] **Step 5: Write `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Administratum",
  "version": "0.1.0",
  "identifier": "com.arylmera.administratum",
  "build": { "frontendDist": "../ui" },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "main",
        "title": "Administratum",
        "width": 700,
        "height": 500,
        "minWidth": 360,
        "minHeight": 280,
        "decorations": false,
        "alwaysOnTop": true,
        "resizable": true,
        "skipTaskbar": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"]
  }
}
```

- [x] **Step 6: Write `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-hide",
    "notification:default"
  ]
}
```

- [x] **Step 7: Write a minimal `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Administratum");
}
```

- [x] **Step 8: Write a placeholder `ui/index.html` and `ui/package.json`**

`ui/index.html`:

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Administratum</title></head>
<body style="margin:0;background:#060404;color:#d6c79f;font-family:monospace">Administratum</body>
</html>
```

`ui/package.json` (lets Node treat `ui/*.js` as ES modules for the self-check; Tauri ignores it):

```json
{ "type": "module" }
```

- [x] **Step 9: Write `tools/make_icon.py` (Cog Mechanicus, stdlib only)**

```python
"""Write the 1024 px source PNG for `cargo tauri icon` (Cog Mechanicus pixel art)."""
import struct
import sys
import zlib

ART = [
    '.......kkkkkk.......',
    '....kk.kbbbbk.kk....',
    '...kbbkkbbbbkkbbk...',
    '...kbbbbbbbbbbbbk...',
    '.kkkbbbkkkkkkbbbkkk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbkbbbbbmmmkbbbbk',
    '.kbbbkbkkbbmMmkbbbk.',
    '..kbbkbkkbbmomkbbk..',
    '..kbbkbbbbbmmmkbbk..',
    '.kbbbkbbkbbmMmkbbbk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbbkbkbkmkkbbbbbk',
    '.kkkbbbkkkkkkbbbkkk.',
    '...kbbbbbbbbbbbbk...',
    '...kbbkkbbbbkkbbk...',
    '....kk.kbbbbk.kk....',
    '.......kkkkkk.......',
]
PAL = {'k': (14, 10, 8, 255), 'b': (207, 195, 168, 255), 'm': (90, 94, 99, 255),
       'M': (42, 44, 48, 255), 'o': (124, 255, 158, 255)}
SIZE, SCALE = 1024, 48
w, h = len(ART[0]), len(ART)
ox, oy = (SIZE - w * SCALE) // 2, (SIZE - h * SCALE) // 2

rows = []
for y in range(SIZE):
    row = bytearray([0])
    j = (y - oy) // SCALE
    for x in range(SIZE):
        i = (x - ox) // SCALE
        c = PAL.get(ART[j][i]) if 0 <= i < w and 0 <= j < h else None
        row += bytes(c or (0, 0, 0, 0))
    rows.append(bytes(row))


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
       + chunk(b'IEND', b''))
with open(sys.argv[1] if len(sys.argv) > 1 else 'icon-src.png', 'wb') as f:
    f.write(png)
```

- [x] **Step 10: Generate icons**

```powershell
python tools/make_icon.py icon-src.png
Set-Location src-tauri
cargo tauri icon ..\icon-src.png
Set-Location ..
```

Expected: `src-tauri/icons/` holds `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico` (plus others).

- [x] **Step 11: Run it**

```powershell
Set-Location src-tauri
cargo tauri dev
```

Expected: first build takes a few minutes, then a frameless always-on-top 700×500 window shows "Administratum". Close it with Alt+F4.

- [x] **Step 12: Write `README.md`**

```markdown
# Administratum

Desktop widget: every Claude Code session on this PC as a Mechanicus scribe in a pixel-art office.
A scribe that needs you walks to your door and queues; Windows toast + optional chime.

- Run: `cd src-tauri; cargo tauri dev`
- Demo roster (no real sessions needed): set `ADMINISTRATUM_DEMO=1` before `cargo tauri dev`
- Tests: `cargo test --manifest-path src-tauri/Cargo.toml` and `node ui/layout.test.mjs`
- Build installer: `cd src-tauri; cargo tauri build`

Reads `~/.claude/sessions/*.json` and transcript tails, read-only.
Spec: `docs/spec.md` · Plan: `docs/plan.md` (master copies in the Terra vault, `Anamnesis/Specs/`).
```

- [x] **Step 13: Commit and push**

```powershell
git add .gitignore README.md tools src-tauri ui
git commit -m "scaffold: Tauri 2 window, icons, README"
git push
```

---

### Task 2: Registry parsing and task line

**Files:**
- Create: `src-tauri/src/registry.rs`
- Modify: `src-tauri/src/main.rs` (add `mod registry;`)

**Interfaces:**
- Produces:
  - `pub struct RawRecord { pid: u32, session_id: String, cwd: String, name: Option<String>, status: Option<String>, waiting_for: Option<String>, status_updated_at: Option<i64> }`
  - `pub struct Session { id, pid, name, dept, cwd, status, waiting_for: Option<String>, since_ms: i64, task }` — serialised camelCase (`waitingFor`, `sinceMs`)
  - `pub fn parse_record(text: &str) -> Option<RawRecord>`
  - `pub fn dept_of(cwd: &str) -> String`
  - `pub fn normalize_status(s: Option<&str>) -> &'static str` → `busy|shell|waiting|idle`
  - `pub fn task_line(tail: &str) -> String`

- [x] **Step 1: Write the failing tests** — create `src-tauri/src/registry.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const LIVE: &str = r#"{"pid":43976,"sessionId":"63d0cfff","cwd":"C:\\Users\\guill\\Documents\\git\\Geneseed","name":"geneseed-51","status":"waiting","waitingFor":"approve Bash","statusUpdatedAt":1791186419659,"kind":"interactive"}"#;

    #[test]
    fn parse_record_reads_live_fields() {
        let r = parse_record(LIVE).expect("parses");
        assert_eq!(r.pid, 43976);
        assert_eq!(r.session_id, "63d0cfff");
        assert_eq!(r.name.as_deref(), Some("geneseed-51"));
        assert_eq!(r.waiting_for.as_deref(), Some("approve Bash"));
        assert_eq!(r.status_updated_at, Some(1791186419659));
    }

    #[test]
    fn parse_record_rejects_half_written_file() {
        assert!(parse_record(r#"{"pid":43976,"sessionId":"63d0"#).is_none());
    }

    #[test]
    fn dept_is_last_path_segment() {
        assert_eq!(dept_of(r"C:\Users\guill\Documents\git\Terra"), "Terra");
        assert_eq!(dept_of(r"C:\Users\guill\Documents\git\Terra\"), "Terra");
        assert_eq!(dept_of("/home/x/Token-Dashboard"), "Token-Dashboard");
    }

    #[test]
    fn unknown_status_is_idle() {
        assert_eq!(normalize_status(Some("busy")), "busy");
        assert_eq!(normalize_status(Some("shell")), "shell");
        assert_eq!(normalize_status(Some("waiting")), "waiting");
        assert_eq!(normalize_status(Some("compacting")), "idle");
        assert_eq!(normalize_status(None), "idle");
    }

    #[test]
    fn task_line_prefers_last_tool_use() {
        let tail = [
            r#"{"type":"user","message":{"content":"fix the hololith page"}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Edit","input":{"file_path":"ui/hololith.html"}}]}}"#,
        ].join("\n");
        assert_eq!(task_line(&tail), "Edit · ui/hololith.html");
    }

    #[test]
    fn task_line_falls_back_to_prompt_and_skips_tool_results() {
        let tail = [
            r#"{"type":"user","message":{"content":"port the Lex index"}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"done"}]}}"#,
            r#"{"type":"user","message":{"content":"<command-name>/clear</command-name>"}}"#,
        ].join("\n");
        assert_eq!(task_line(&tail), "“port the Lex index”");
    }

    #[test]
    fn task_line_clips_long_details_and_handles_empty() {
        let long = "x".repeat(200);
        let tail = format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","name":"Bash","input":{{"command":"{long}"}}}}]}}}}"#);
        let line = task_line(&tail);
        assert_eq!(line.chars().count(), 60);
        assert!(line.ends_with('…'));
        assert_eq!(task_line(""), "—");
        assert_eq!(task_line("not json\n{"), "—");
    }
}
```

And add `mod registry;` as the first line after the `#![cfg_attr...]` line of `src-tauri/src/main.rs`.

- [x] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry`
Expected: compile errors `cannot find function parse_record` (and the others).

- [x] **Step 3: Implement** — insert above the test module in `registry.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawRecord {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub status: Option<String>,
    pub waiting_for: Option<String>,
    pub status_updated_at: Option<i64>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub pid: u32,
    pub name: String,
    pub dept: String,
    pub cwd: String,
    pub status: String,
    pub waiting_for: Option<String>,
    pub since_ms: i64,
    pub task: String,
}

pub fn parse_record(text: &str) -> Option<RawRecord> {
    serde_json::from_str(text).ok()
}

pub fn dept_of(cwd: &str) -> String {
    let trimmed = cwd.trim_end_matches(['\\', '/']);
    trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed).to_string()
}

pub fn normalize_status(s: Option<&str>) -> &'static str {
    match s {
        Some("busy") => "busy",
        Some("shell") => "shell",
        Some("waiting") => "waiting",
        _ => "idle",
    }
}

fn clip(s: &str) -> String {
    if s.chars().count() <= 60 {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(59).collect::<String>())
    }
}

/// Last thing the session did, newest first: a tool call with its target, else the last prompt.
pub fn task_line(tail: &str) -> String {
    for line in tail.lines().rev() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        let content = &v["message"]["content"];
        match v["type"].as_str() {
            Some("assistant") => {
                let tool = content
                    .as_array()
                    .and_then(|a| a.iter().rev().find(|b| b["type"] == "tool_use"));
                if let Some(tool) = tool {
                    let input = &tool["input"];
                    let detail = ["file_path", "command", "pattern", "url", "query", "description"]
                        .iter()
                        .find_map(|k| input[*k].as_str())
                        .unwrap_or("");
                    let name = tool["name"].as_str().unwrap_or("tool");
                    return clip(&if detail.is_empty() { name.to_string() } else { format!("{name} · {detail}") });
                }
            }
            Some("user") => {
                let text = content.as_str().map(str::to_string).or_else(|| {
                    content
                        .as_array()
                        .and_then(|a| a.iter().find(|b| b["type"] == "text"))
                        .and_then(|b| b["text"].as_str())
                        .map(str::to_string)
                });
                if let Some(t) = text {
                    let t = t.trim();
                    if !t.is_empty() && !t.starts_with('<') {
                        return clip(&format!("“{}”", t.lines().next().unwrap_or(t)));
                    }
                }
            }
            _ => {}
        }
    }
    "—".to_string()
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry`
Expected: `7 passed` (dead-code warnings are fine at this stage).

- [x] **Step 5: Commit**

```powershell
git add src-tauri/src/registry.rs src-tauri/src/main.rs
git commit -m "registry: parse session records and derive task line"
```

---

### Task 3: Directory scan, merge and petition tracker

**Files:**
- Modify: `src-tauri/src/registry.rs`

**Interfaces:**
- Consumes: `parse_record`, `dept_of`, `normalize_status`, `task_line`, `Session` (Task 2).
- Produces:
  - `pub struct Scan { pub sessions: Vec<Session>, pub unreadable_pids: Vec<u32> }`
  - `pub fn scan(dir: &Path, alive: impl Fn(u32) -> bool, transcript: impl Fn(&str) -> Option<String>) -> Scan`
  - `pub fn read_transcript_tail(projects: &Path, session_id: &str) -> Option<String>`
  - `pub fn merge(prev: &[Session], scan: Scan) -> Vec<Session>` — sorted by `name`
  - `#[derive(Default)] pub struct Tracker` with `pub fn new_petitions(&mut self, roster: &[Session]) -> Vec<Session>`

- [x] **Step 1: Write the failing tests** — append inside `mod tests`:

```rust
    use std::{fs, path::PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adm-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn record(pid: u32, id: &str, name: &str, status: &str) -> String {
        format!(r#"{{"pid":{pid},"sessionId":"{id}","cwd":"C:\\git\\Terra","name":"{name}","status":"{status}","waitingFor":"input needed","statusUpdatedAt":{pid}000}}"#)
    }

    fn session(id: &str, pid: u32, status: &str, since: i64) -> Session {
        Session { id: id.into(), pid, name: id.into(), dept: "Terra".into(), cwd: "C:\\git\\Terra".into(),
                  status: status.into(), waiting_for: None, since_ms: since, task: "—".into() }
    }

    #[test]
    fn scan_keeps_live_skips_dead_and_reports_unreadable() {
        let d = temp_dir("scan");
        fs::write(d.join("10.json"), record(10, "a", "terra-b", "busy")).unwrap();
        fs::write(d.join("11.json"), record(11, "b", "terra-a", "waiting")).unwrap();
        fs::write(d.join("12.json"), record(12, "c", "dead", "idle")).unwrap();
        fs::write(d.join("13.json"), r#"{"pid":13,"sess"#).unwrap();
        fs::write(d.join("10.key"), "not a record").unwrap();
        let out = scan(&d, |pid| pid != 12, |id| (id == "a").then(|| r#"{"type":"user","message":{"content":"hello"}}"#.to_string()));
        let names: Vec<_> = out.sessions.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["terra-a", "terra-b"]);
        assert_eq!(out.unreadable_pids, [13]);
        let a = &out.sessions[0];
        assert_eq!(a.dept, "Terra");
        assert_eq!(a.waiting_for.as_deref(), Some("input needed"));
        assert_eq!(a.since_ms, 11000);
        assert_eq!(out.sessions[1].task, "“hello”");
        assert_eq!(out.sessions[1].waiting_for, None, "waitingFor only kept while waiting");
    }

    #[test]
    fn scan_of_missing_dir_is_empty() {
        let out = scan(&std::env::temp_dir().join("adm-does-not-exist"), |_| true, |_| None);
        assert!(out.sessions.is_empty() && out.unreadable_pids.is_empty());
    }

    #[test]
    fn transcript_tail_found_in_any_project_and_cut_to_whole_lines() {
        let d = temp_dir("projects");
        fs::create_dir_all(d.join("C--git-Terra")).unwrap();
        let line = r#"{"type":"user","message":{"content":"x"}}"#;
        let big = std::iter::repeat(line).take(3000).collect::<Vec<_>>().join("\n");
        fs::write(d.join("C--git-Terra").join("abc.jsonl"), &big).unwrap();
        let tail = read_transcript_tail(&d, "abc").expect("found");
        assert!(tail.len() <= 65536);
        assert!(tail.lines().all(|l| l == line), "first partial line dropped");
        assert!(read_transcript_tail(&d, "nope").is_none());
    }

    #[test]
    fn merge_keeps_previous_state_for_unreadable_file() {
        let prev = vec![session("x", 13, "busy", 1)];
        let merged = merge(&prev, Scan { sessions: vec![session("y", 10, "idle", 2)], unreadable_pids: vec![13, 99] });
        let ids: Vec<_> = merged.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["x", "y"]);
    }

    #[test]
    fn tracker_fires_once_per_episode_and_again_on_a_new_one() {
        let mut t = Tracker::default();
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 1);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 100)]).len(), 0, "same episode");
        assert_eq!(t.new_petitions(&[session("a", 1, "busy", 200)]).len(), 0);
        assert_eq!(t.new_petitions(&[session("a", 1, "waiting", 300)]).len(), 1, "new episode");
    }
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry`
Expected: compile errors for `scan`, `Scan`, `read_transcript_tail`, `merge`, `Tracker`.

- [x] **Step 3: Implement** — change the `use` line at the top of `registry.rs` to:

```rust
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};
```

and add below `task_line`:

```rust
pub struct Scan {
    pub sessions: Vec<Session>,
    pub unreadable_pids: Vec<u32>,
}

/// One pass over `~/.claude/sessions`. A file that fails to parse is reported by the pid in its
/// name so the caller can keep that session's last known state (Claude Code may be mid-write).
pub fn scan(dir: &Path, alive: impl Fn(u32) -> bool, transcript: impl Fn(&str) -> Option<String>) -> Scan {
    let mut out = Scan { sessions: vec![], unreadable_pids: vec![] };
    let Ok(entries) = fs::read_dir(dir) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let stem_pid = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u32>().ok());
        let Some(rec) = fs::read_to_string(&path).ok().and_then(|t| parse_record(&t)) else {
            if let Some(pid) = stem_pid {
                out.unreadable_pids.push(pid);
            }
            continue;
        };
        if !alive(rec.pid) {
            continue;
        }
        let status = normalize_status(rec.status.as_deref()).to_string();
        out.sessions.push(Session {
            task: transcript(&rec.session_id).map(|t| task_line(&t)).unwrap_or_else(|| "—".into()),
            dept: dept_of(&rec.cwd),
            name: rec.name.clone().unwrap_or_else(|| dept_of(&rec.cwd)),
            id: rec.session_id,
            pid: rec.pid,
            cwd: rec.cwd,
            waiting_for: if status == "waiting" { rec.waiting_for } else { None },
            since_ms: rec.status_updated_at.unwrap_or(0),
            status,
        });
    }
    out.sessions.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

const TAIL_BYTES: u64 = 65536;

/// Last 64 KB of `<projects>/<any>/<session_id>.jsonl`, cut to whole lines.
pub fn read_transcript_tail(projects: &Path, session_id: &str) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let file = format!("{session_id}.jsonl");
    let path = fs::read_dir(projects).ok()?.flatten().map(|e| e.path().join(&file)).find(|p| p.is_file())?;
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(TAIL_BYTES))).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    Some(if len > TAIL_BYTES { text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or_default() } else { text })
}

pub fn merge(prev: &[Session], scan: Scan) -> Vec<Session> {
    let mut out = scan.sessions;
    for pid in scan.unreadable_pids {
        if let Some(p) = prev.iter().find(|s| s.pid == pid) {
            out.push(p.clone());
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Remembers open petition episodes (`id:since`) so each one notifies exactly once.
#[derive(Default)]
pub struct Tracker {
    open: HashSet<String>,
}

impl Tracker {
    pub fn new_petitions(&mut self, roster: &[Session]) -> Vec<Session> {
        let mut now = HashSet::new();
        let mut fresh = vec![];
        for s in roster.iter().filter(|s| s.status == "waiting") {
            let key = format!("{}:{}", s.id, s.since_ms);
            if !self.open.contains(&key) {
                fresh.push(s.clone());
            }
            now.insert(key);
        }
        self.open = now;
        fresh
    }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml registry`
Expected: `12 passed`.

- [x] **Step 5: Commit**

```powershell
git add src-tauri/src/registry.rs
git commit -m "registry: scan sessions dir, merge unreadable files, petition tracker"
```

---

### Task 4: Demo roster, poll loop, toast and tray

**Files:**
- Create: `src-tauri/src/demo.rs`
- Modify: `src-tauri/src/main.rs` (full rewrite)

**Interfaces:**
- Consumes: `registry::{scan, merge, read_transcript_tail, Session, Tracker}` (Tasks 2–3).
- Produces (events to the webview):
  - `roster` — `Session[]` every second: `{ id, pid, name, dept, cwd, status, waitingFor, sinceMs, task }`
  - `petition` — one `Session` per new petition episode
  - `ui-command` — `"mute"` or `"light"` from the tray
- `pub fn demo::roster(t_secs: u64) -> Vec<Session>`

- [x] **Step 1: Write the failing test** — create `src-tauri/src/demo.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_cycles_through_petitions_and_arrivals() {
        let at = |t, name: &str| roster(t).into_iter().find(|s| s.name == name);
        assert_eq!(at(5, "geneseed-51").unwrap().status, "idle");
        assert_eq!(at(15, "geneseed-51").unwrap().status, "waiting");
        assert_eq!(at(26, "token-dashboard-af").unwrap().status, "waiting");
        assert_eq!(at(22, "terra-77").unwrap().status, "shell");
        assert!(at(10, "drop-pod-1").is_none());
        assert!(at(50, "drop-pod-1").is_some());
        let first = at(15, "geneseed-51").unwrap().since_ms;
        let next = at(75, "geneseed-51").unwrap().since_ms;
        assert_ne!(first, next, "each cycle is a new petition episode");
    }
}
```

and add `mod demo;` next to `mod registry;` in `main.rs`.

- [x] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml demo`
Expected: compile error `cannot find function roster`.

- [x] **Step 3: Implement `demo.rs`** — insert above the test module:

```rust
use crate::registry::Session;

fn scribe(name: &str, dept: &str, status: &str, waiting_for: Option<&str>, since_ms: i64, task: &str) -> Session {
    Session {
        id: name.into(),
        pid: 0,
        name: name.into(),
        dept: dept.into(),
        cwd: format!("C:\\Users\\guill\\Documents\\git\\{dept}"),
        status: status.into(),
        waiting_for: if status == "waiting" { waiting_for.map(str::to_string) } else { None },
        since_ms,
        task: task.into(),
    }
}

/// A 60 s scripted day in the office: work, shell, two petitions, an arrival.
pub fn roster(t: u64) -> Vec<Session> {
    let phase = t % 60;
    let epoch = ((t / 60) * 60 * 1000) as i64;
    let mut v = vec![
        scribe("terra-77", "Terra", if (20..30).contains(&phase) { "shell" } else { "busy" }, None, epoch, "Edit · Hera/NAS/Reference/Hololith.md"),
        scribe("terra-27", "Terra", "idle", None, epoch, "“home command playlist names”"),
        scribe("geneseed-51", "Geneseed", if (10..40).contains(&phase) { "waiting" } else { "idle" }, Some("approve Bash"), epoch + 10_000, "Bash · cargo test"),
        scribe("token-dashboard-af", "Token-Dashboard", if phase >= 25 { "waiting" } else { "busy" }, Some("input needed"), epoch + 25_000, "Edit · app.js"),
    ];
    if phase >= 45 {
        v.push(scribe("drop-pod-1", "Drop-Pod", "busy", None, epoch + 45_000, "Write · README.md"));
    }
    v
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml demo`
Expected: `1 passed`.

- [x] **Step 5: Rewrite `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod demo;
mod registry;

use registry::{Session, Tracker};
use std::{path::PathBuf, thread, time::{Duration, Instant}};
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

fn claude_dir() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()).join(".claude")
}

fn main() {
    let demo = std::env::args().any(|a| a == "--demo") || std::env::var("ADMINISTRATUM_DEMO").is_ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(move |app| {
            build_tray(app)?;
            let handle = app.handle().clone();
            thread::spawn(move || poll_loop(handle, demo));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Administratum");
}

fn poll_loop(app: AppHandle, demo: bool) {
    let dir = claude_dir();
    let mut sys = System::new();
    let mut tracker = Tracker::default();
    let mut prev: Vec<Session> = Vec::new();
    let start = Instant::now();
    loop {
        let roster = if demo {
            demo::roster(start.elapsed().as_secs())
        } else {
            sys.refresh_processes(ProcessesToUpdate::All, true);
            let alive = |pid: u32| {
                sys.process(Pid::from_u32(pid))
                    .map(|p| p.name().to_string_lossy().eq_ignore_ascii_case("claude.exe"))
                    .unwrap_or(false)
            };
            let scanned = registry::scan(&dir.join("sessions"), alive, |id| {
                registry::read_transcript_tail(&dir.join("projects"), id)
            });
            registry::merge(&prev, scanned)
        };
        for s in tracker.new_petitions(&roster) {
            let _ = app
                .notification()
                .builder()
                .title(format!("Petition from {}", s.name))
                .body(format!("{} · {}", s.dept, s.waiting_for.clone().unwrap_or_else(|| "input needed".into())))
                .show();
            let _ = app.emit("petition", &s);
        }
        // ponytail: emit every tick (a late-loading webview never misses state); diff if it ever shows in a profile.
        let _ = app.emit("roster", &roster);
        prev = roster;
        thread::sleep(Duration::from_secs(1));
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show / hide", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "Toggle chime", true, None::<&str>)?;
    let light = MenuItem::with_id(app, "light", "Cycle lighting", true, None::<&str>)?;
    let login_on = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(app, "login", "Start at login", true, login_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &mute, &light, &login, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("bundle icon").clone())
        .tooltip("Administratum")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => toggle_window(app),
            "mute" => {
                let _ = app.emit("ui-command", "mute");
            }
            "light" => {
                let _ = app.emit("ui-command", "light");
            }
            "login" => {
                let al = app.autolaunch();
                let _ = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
```

- [x] **Step 6: Build and run all Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `13 passed`, no errors. If `sysinfo`'s API differs from `refresh_processes(ProcessesToUpdate::All, true)` / `process(Pid::from_u32(..))` / `name() -> &OsStr`, pin `sysinfo = "0.37"` exactly or adapt to the installed version's docs.

- [x] **Step 7: Smoke-test toast and tray in demo mode**

```powershell
Set-Location src-tauri
$env:ADMINISTRATUM_DEMO = '1'
cargo tauri dev
```

Expected: within ~10 s a Windows toast "Petition from geneseed-51 — Geneseed · approve Bash", ~25 s a second for token-dashboard-af; no repeat toasts for the same petition during the minute. Tray icon menu: Show/hide hides and restores the window; Quit exits. Then `Remove-Item Env:ADMINISTRATUM_DEMO`.

- [x] **Step 8: Commit**

```powershell
git add src-tauri/src/demo.rs src-tauri/src/main.rs
git commit -m "backend: poll loop, roster events, petition toast, tray, demo roster"
```

---

### Task 5: Geometry module with self-check

**Files:**
- Create: `ui/layout.js`, `ui/layout.test.mjs`

**Interfaces:**
- Produces:
  - `SCENE {w:346,h:226}`, `HALL {x0,x1,y0,y1}`, `AISLE_Y`, `ENTRY`, `DOOR_OUT`, `DOOR_IN`, `COG_SPOTS[]`, `QUEUE_SLOTS[]` — all `{x,y}` are a scribe's **feet** point
  - `layoutDepartments(depts: {name, color, ids: string[]}[]) -> { blocks: {name,color,x,y,w,h}[], desks: {id,dept,x,y}[], seats: Map<id,{x,y}>, overflow: number }`
  - `route(a:{x,y}, b:{x,y}) -> {x,y}[]` (waypoints, last = `b`)
  - `phaseOf(hour) -> 'day'|'dusk'|'night'`
  - `lightLevel(mode, hour) -> { phase, dark, glow, beams }`

- [ ] **Step 1: Write the failing self-check** — `ui/layout.test.mjs`:

```js
import assert from 'node:assert/strict';
import { layoutDepartments, route, phaseOf, lightLevel, QUEUE_SLOTS, DOOR_OUT, DOOR_IN, AISLE_Y, HALL } from './layout.js';

const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i}`);

// one department of six: two rows, six distinct desks, block inside the hall
let L = layoutDepartments([{ name: 'Terra', color: '#d9a84e', ids: ids('t', 6) }]);
assert.equal(L.desks.length, 6);
assert.equal(new Set(L.desks.map(d => `${d.x},${d.y}`)).size, 6);
assert.equal(L.blocks[0].h, 2 * 64 - 8);
assert.equal(L.overflow, 0);
assert.deepEqual(L.seats.get('t-0'), { x: L.desks[0].x + 16, y: L.desks[0].y + 30 });

// many departments overflow instead of drawing outside the hall
L = layoutDepartments(ids('d', 12).map(n => ({ name: n, color: '#ffffff', ids: [n] })));
assert.ok(L.overflow > 0);
for (const b of L.blocks) assert.ok(b.y + b.h <= HALL.y1 && b.x + b.w <= HALL.x1 + 1);
assert.equal(L.desks.length + L.overflow, 12);

// desk to queue goes through both door points; queue to queue inside the office goes straight
const r = route({ x: 24, y: 96 }, QUEUE_SLOTS[0]);
assert.deepEqual(r.at(-1), QUEUE_SLOTS[0]);
assert.ok(r.some(p => p.x === DOOR_OUT.x && p.y === DOOR_OUT.y));
assert.ok(r.some(p => p.x === DOOR_IN.x && p.y === DOOR_IN.y));
assert.equal(route(QUEUE_SLOTS[1], QUEUE_SLOTS[0]).length, 1);
assert.ok(route({ x: 24, y: 96 }, { x: 72, y: 96 }).every(p => p.y === AISLE_Y || p.x === 72));

// lighting phases and modes
assert.equal(phaseOf(5), 'night');
assert.equal(phaseOf(6), 'dusk');
assert.equal(phaseOf(8), 'day');
assert.equal(phaseOf(17), 'day');
assert.equal(phaseOf(18), 'dusk');
assert.equal(phaseOf(21), 'night');
assert.equal(lightLevel('full', 23).phase, 'day');
assert.equal(lightLevel('candles', 12).phase, 'night');
assert.equal(lightLevel('auto', 12).beams, true);
assert.ok(lightLevel('full', 12).dark > 0, 'Tier II keeps a darkness floor in full light');

console.log('layout ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node ui/layout.test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `./layout.js`.

- [ ] **Step 3: Implement `ui/layout.js`**

```js
// Pure scene geometry, in logical pixels. Every {x, y} point is a scribe's feet.
export const SCENE = { w: 346, h: 226 };
export const HALL = { x0: 3, x1: 197, y0: 58, y1: 196 };
export const AISLE_Y = 206;
export const ENTRY = { x: 8, y: 224 };
export const DOOR_OUT = { x: 190, y: 172 };
export const DOOR_IN = { x: 214, y: 172 };
export const COG_SPOTS = [{ x: 160, y: 58 }, { x: 172, y: 58 }, { x: 184, y: 58 }];
export const QUEUE_SLOTS = [
  { x: 276, y: 187 }, { x: 248, y: 189 }, { x: 220, y: 189 }, { x: 186, y: 213 },
  { x: 158, y: 217 }, { x: 130, y: 217 }, { x: 102, y: 217 }, { x: 74, y: 217 },
];

const SLOT_W = 48;
const SLOT_H = 64;
const COLS = 4;

// ponytail: departments that no longer fit are counted in `overflow` (shown as a plaque), not shrunk.
export function layoutDepartments(depts) {
  const blocks = [];
  const desks = [];
  const seats = new Map();
  let x = HALL.x0, y = HALL.y0, rowH = 0, overflow = 0, full = false;
  for (const d of depts) {
    const n = d.ids.length;
    const cols = Math.min(COLS, n);
    const rows = Math.ceil(n / COLS);
    const w = cols * SLOT_W + 2;
    const h = rows * SLOT_H - 8;
    if (!full && x + w > HALL.x1 + 1) { x = HALL.x0; y += rowH + 8; rowH = 0; }
    if (full || y + h > HALL.y1) { full = true; overflow += n; continue; }
    blocks.push({ name: d.name, color: d.color, x, y, w, h });
    d.ids.forEach((id, i) => {
      const desk = { id, dept: d.name, x: x + 5 + (i % COLS) * SLOT_W, y: y + 8 + Math.floor(i / COLS) * SLOT_H };
      desks.push(desk);
      seats.set(id, { x: desk.x + 16, y: desk.y + 30 });
    });
    x += w + 4;
    rowH = Math.max(rowH, h);
  }
  return { blocks, desks, seats, overflow };
}

const inOffice = p => p.x > 200;

export function route(a, b) {
  if (inOffice(a) && inOffice(b)) return [{ x: b.x, y: b.y }];
  const pts = [];
  if (inOffice(a)) pts.push(DOOR_IN, DOOR_OUT, { x: DOOR_OUT.x, y: AISLE_Y });
  else pts.push({ x: a.x, y: AISLE_Y });
  if (inOffice(b)) pts.push({ x: DOOR_OUT.x, y: AISLE_Y }, DOOR_OUT, DOOR_IN, b);
  else pts.push({ x: b.x, y: AISLE_Y }, b);
  return pts.map(p => ({ x: p.x, y: p.y }));
}

export function phaseOf(hour) {
  if (hour >= 8 && hour < 18) return 'day';
  if ((hour >= 6 && hour < 8) || (hour >= 18 && hour < 21)) return 'dusk';
  return 'night';
}

export function lightLevel(mode, hour) {
  const phase = mode === 'full' ? 'day' : mode === 'candles' ? 'night' : phaseOf(hour);
  return {
    phase,
    dark: { day: 0.18, dusk: 0.5, night: 0.78 }[phase],
    glow: { day: 0.45, dusk: 0.8, night: 1 }[phase],
    beams: phase === 'day',
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node ui/layout.test.mjs`
Expected: `layout ok`.

- [ ] **Step 5: Commit**

```powershell
git add ui/layout.js ui/layout.test.mjs
git commit -m "ui: scene geometry, routes and lighting levels with self-check"
```

---

### Task 6: Sprites, static room, lighting and the page shell

**Files:**
- Create: `ui/sprites.js`, `ui/scene.js`, `ui/lighting.js`, `ui/app.js`
- Modify: `ui/index.html` (full rewrite)

**Interfaces:**
- Consumes: `SCENE`, `lightLevel` (Task 5).
- Produces:
  - `sprites.js`: `BASE`, `SASH: string[]`, `MAPS` (all decor maps), `SCRIBE = { up, down, left, right }` (3 frames each), `sprite(map, overrides?) -> HTMLCanvasElement` (cached; an override set to `null` makes that palette char transparent)
  - `scene.js`: `drawStatic(g, daylight)`, `drawRugs(g, blocks)`, `deskDrawable(desk, busy) -> {y, draw(g)}`, `deskLight(desk, busy) -> light`, `drawDecorFrame(g, t)`, `STATIC_LIGHTS: light[]`, `AMBER`, `GREEN`, `RED` — `light = {x, y, r, color?, flicker?}`
  - `lighting.js`: `drawLighting(g, lights, level, t)`
  - `app.js` (this task): draws background + lighting in a loop with the header mode switch working.

- [ ] **Step 1: Write `ui/sprites.js`**

```js
// Tier II palette and pixel maps (ported from the Claude Design board "Tier II — Data-Shrine").
export const BASE = {
  k: '#0e0a08', g: '#b8742e', G: '#6e3f17', p: '#d6c79f', P: '#a8946a', w: '#4a3020', W: '#2e1c12',
  m: '#5a5e63', M: '#2a2c30', c: '#7cff9e', C: '#16301f', f: '#f0a83c', F: '#ffe6a0', x: '#8e1c16',
  b: '#cfc3a8', B: '#948669', n: '#140c08', u: '#2b3f5e', v: '#2f4a33', r: '#5e1710', d: '#3a0d09',
  a: '#ff3a20', o: '#7cff9e', y: '#d9a84e', s: '#b89a7c', e: '#120c0a',
};
export const SASH = ['#d9a84e', '#5fae7a', '#5a7ec9', '#c46a9a', '#c9b95a', '#6ac9c4', '#c97a4a', '#9a8ad9'];

const cache = new WeakMap();
export function sprite(map, over = {}) {
  let byMap = cache.get(map);
  if (!byMap) { byMap = new Map(); cache.set(map, byMap); }
  const key = JSON.stringify(over);
  let cv = byMap.get(key);
  if (!cv) {
    const pal = { ...BASE, ...over };
    cv = document.createElement('canvas');
    cv.width = Math.max(...map.map(r => r.length));
    cv.height = map.length;
    const g = cv.getContext('2d');
    map.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) { g.fillStyle = col; g.fillRect(i, j, 1, 1); }
      }
    });
    byMap.set(key, cv);
  }
  return cv;
}

const mirror = map => map.map(row => row.split('').reverse().join(''));
const withFeet = (body, feet) => body.slice(0, -1).concat([feet]);

const SCRIBE_BACK = [
  '....kkkkkkkk....',
  '...kdrrrrrrrrdk.',
  '..kdrrrrrrrrrrdk',
  '..kdrrrrrrrrrrdk',
  '..kdrrrrmMrrrrdk',
  '..kdrrrkookrrrdk',
  '..kdrrrrmMrrrrdk',
  '..kddrrrrMrrrddk',
  '...kddrrrMrrddk.',
  '..kdrrrrrMrrrrdk',
  '..kmrrrrrMrrrrmk',
  '..kdyyyyyyyyyydk',
  '..kdrrrrrrrrrrdk',
  '..kddrrrrrrrrddk',
  '..kdddrrrrrrdddk',
  '...kkkkkkkkkkkk.',
  '....kMMk.kMMk...',
];
const SCRIBE_FRONT = [
  '....kkkkkkkk....',
  '...kdrrrrrrrrdk.',
  '..kdrrrrrrrrrrdk',
  '..kdrrkkkkkkrrdk',
  '..kdrkeeeeeekrdk',
  '..kdrkeoeeoekrdk',
  '..kdrkeeeeeekrdk',
  '..kddrkkkkkkrddk',
  '...kddrrrrrrddk.',
  '..kdrrrrrrrrrrdk',
  '..kmrrrrrrrrrrmk',
  '..kdyyyyyyyyyydk',
  '..kdrrrrrrrrrrdk',
  '..kddrrrrrrrrddk',
  '..kdddrrrrrrdddk',
  '...kkkkkkkkkkkk.',
  '....kMMk.kMMk...',
];
const SCRIBE_SIDE = [
  '.....kkkkkkk....',
  '....kdrrrrrrk...',
  '...kdrrrrrrrrk..',
  '...kdrrrrrkkkk..',
  '...kdrrrrkeeek..',
  '...kdrrrrkeoek..',
  '...kdrrrrkeeek..',
  '...kddrrrrkkk...',
  '....kddrrrrdk...',
  '...kdrrrrrrrdk..',
  '...kdrrrrrrmsk..',
  '...kdyyyyyyydk..',
  '...kdrrrrrrrdk..',
  '...kddrrrrrddk..',
  '...kdddrrrdddk..',
  '....kkkkkkkkk...',
  '....kMMkkMMk....',
];
const FEET = ['....kMMk.kMMk...', '...kMMk....kk...', '....kk....kMMk..'];
const FEET_SIDE = ['....kMMkkMMk....', '...kMMk..kMMk...', '.....kMMMMk.....'];
const RIGHT = FEET_SIDE.map(f => withFeet(SCRIBE_SIDE, f));
export const SCRIBE = {
  up: FEET.map(f => withFeet(SCRIBE_BACK, f)),
  down: FEET.map(f => withFeet(SCRIBE_FRONT, f)),
  right: RIGHT,
  left: RIGHT.map(mirror),
};

const ARM = ['k.k.', 'kmk.', '.mk.', '.km.', '..mk', '..Mk', '.kM.', 'kM..'];

export const MAPS = {
  ARM,
  ARM_L: mirror(ARM),
  CHAIN: ['mkmkmkmkmk'],
  SCROLL: ['kkkkk.', 'kpppPk', 'kpppPk', 'kpxxPk', 'kpxxPk', 'kpppPk', 'kkkkk.'],
  DESK: [
    '......kkkkkkkkkkkk.......f......',
    '......kGggggggggGk......fFf.....',
    '......kgkkkkkkkkgk.......f......',
    '......kgkCCCCCCkgk......kpk.....',
    '..kkk.kgkCccccCkgk......kpkp....',
    '.kppPkkgkCcCCcCkgk......kpkp....',
    '.kPPPkkgkCccCCCkgk......kpkpP...',
    '.kppPkkgkkkkkkkkgk......kPkPP...',
    '.kPPPkkGggggggggGk.....kkkkkkk..',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kwwwwwwwwwkMMkwwwwwwwPpppwwwwwwk',
    'kwpPpwwwwwwwwwwwwwwwwPpppwwwwwwk',
    'kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWggWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kMk..........................kMk',
    'kkk..........................kkk',
  ],
  SHELF: [
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkpPpPnxxnuunppPnvvnxxnpPpPnkWk',
    'kWkpPpPnxxnuunppPnvvnxxnpPpPnkWk',
    'kWkpPpPnxxnuunpPppnvvnxxpPpPnkWk',
    'kWkpPpPnxxnuunPpPpnvvnxxpPpPnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ],
  SKULL: ['...kkkk...', '..kbbbbk..', '.kbbbbbbk.', '.kbokbkkbk', '.kbbbBbbbk', '..kbkbkbk.', '...kgggk..', '..kgMMgk..', '...kggk...', '....kk....'],
  COG_MECH: [
    '.......kkkkkk.......',
    '....kk.kbbbbk.kk....',
    '...kbbkkbbbbkkbbk...',
    '...kbbbbbbbbbbbbk...',
    '.kkkbbbkkkkkkbbbkkk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbkbbbbbmmmkbbbbk',
    '.kbbbkbkkbbmMmkbbbk.',
    '..kbbkbkkbbmomkbbk..',
    '..kbbkbbbbbmmmkbbk..',
    '.kbbbkbbkbbmMmkbbbk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbbkbkbkmkkbbbbbk',
    '.kkkbbbkkkkkkbbbkkk.',
    '...kbbbbbbbbbbbbk...',
    '...kbbkkbbbbkkbbk...',
    '....kk.kbbbbk.kk....',
    '.......kkkkkk.......',
  ],
  SEAL: ['.kkkk.', 'kxxxxk', 'kxggxk', 'kxxxxk', '.kkkk.', '.kppk.', '.kPpk.', '.kppk.', '.kpPk.', '..kk..'],
  CANDLES: ['..F...F.....', '.fFf.fFf..F.', '..f...f..fFf', '.kpk.kpk..f.', '.kpk.kpk.kpk', '.kPk.kpk.kpk', 'kpPPkkpPkkPk', 'kPPPPPPPPPPk', '.kkkkkkkkkk.'],
  THRONE: [
    '......kkkkkkkk......',
    '.....kmmmmmmmmk.....',
    '....kmMkmmmmkMmk....',
    '....kgxxxxxxxxgk....',
    '....kgxxbbbbxxgk....',
    '....kgxbbkkbbxgk....',
    '....kgxxbbbbxxgk....',
    '....kgxxxxxxxxgk....',
    '....kgxxxxxxxxgk....',
    '.kmkkgxxxxxxxxgkkmk.',
    '.kmgggggggggggggggmk',
    '..kgxxxxxxxxxxxxxgk.',
    '..kgxxxxxxxxxxxxxgk.',
    '..kgggggggggggggggk.',
    '..kMk...........kMk.',
    '..kkk...........kkk.',
  ],
  LORD_DESK: [
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kwwwwwppppPwwwwkCCCCCkwwwwwwppPwwwwwwkMkwwwk',
    'kwwwwwppxpPwwwwkCccCCkwwwwwwppPwwwwwwkkwwwwk',
    'kwwwwwppppPwwwwkkkkkkkwwwwwwppPwwwwwwwwwwwwk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kWWWWWWWWWWWWWWWWWWkbbbkWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWkbbkbbkWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWkbbbkWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ],
  BRAZIER: ['....F.....', '...fFf....', '..ffFff...', '..kfffk...', '.kgggggk..', '..kGGGk...', '...kgk....', '...kmk....', '...kgk....', '...kgk....', '..kgggk...', '.kgGGGgk..', '.kkkkkkk..'],
  RECAFF: [
    'kkkkkkkkkkkkkkkk', 'kmmmmmmmmmmmmmmk', 'kmGGGGGGGGGGGGmk', 'kmGbbbbbbbbbbGmk', 'kmGGGGGGGGGGGGmk',
    'kmmmmmmmmmmmmmmk', 'kmkkkkkkkkmmmmmk', 'kmkCcCcCCkmammmk', 'kmkcCcCcCkmmmmmk', 'kmkCcCcCCkmommmk',
    'kmkkkkkkkkmmmmmk', 'kmmmmmmmmmmmmmmk', 'kmmmmkkkkkmmmmmk', 'kmmmmkWWWkmmmmmk', 'kmmmmkkkkkmmmmmk',
    'kMMMMMMMMMMMMMMk', 'kMMMMMMMMMMMMMMk', 'kkkkkkkkkkkkkkkk',
  ],
  COGITATOR: [
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kGggggggggggggggggggggggggggggggggggggGk',
    'kgkkkkkkkkkgkkkkkkkkkgkkkkkkkkkgkkkkkkgk',
    'kgkCCCCCCCkgkCCCCCCCkgkCCCCCCCkgmmmmmmgk',
    'kgkCcccccCkgkCccCccCkgkCcccCCCkgmamommgk',
    'kgkCcCCccCkgkCcccccCkgkCccccCCkgmmmmmmgk',
    'kgkCccCccCkgkCCcccCCkgkCcCcccCkgmomamMgk',
    'kgkCCCCCCCkgkCCCCCCCkgkCCCCCCCkgmmmmmmgk',
    'kgkkkkkkkkkgkkkkkkkkkgkkkkkkkkkgkkkkkkgk',
    'kGggggggggggggggggggggggggggggggggggggGk',
    'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
    'kMmkmkmkmkmMMMMMMMMggggMMMMMMMkmkmkmkmMk',
    'kMmmmmmmmmmMMMMMMMgGkkGgMMMMMMmmmmmmmmMk',
    'kMMMMMMMMMMMMMMMMMMggggMMMMMMMMMMMMMMMMk',
    'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ],
  WINDOW: [
    '......kkkk......', '....kkuuuukk....', '...kuuuxxuuuk...', '..kuuxxggxxuuk..', '..kuxggggggxuk..',
    '.kuuxggggggxuuk.', '.kkkkkkkkkkkkkk.', '.kuuukuuuukuuuk.', '.kuxukuxxukuxuk.', '.kuxukuggukuxuk.',
    '.kuuukuxxukuuuk.', '.kvvvkuuuukvvvk.', '.kvuvkuvvukvuvk.', '.kvvvkuuuukvvvk.', '.kkkkkkkkkkkkkk.',
    '.kMMMMMMMMMMMMk.', '.kkkkkkkkkkkkkk.',
  ],
  BANNER: [
    'kkkkkkkkkkkk', 'kGggggggggGk', '.kxxxxxxxxk.', '.kxbxbbxbxk.', '.kxxbbbbxxk.', '.kxbbkkbbxk.',
    '.kxxbbbbxxk.', '.kxbxbbxbxk.', '.kxxxxxxxxk.', '.kxxxxxxxxk.', '.kxxxkxxxxk.', '.kxxk.kxxxk.',
    '.kxk...kxxk.', '.kk.....kxk.', '.........kk.',
  ],
  CRATE: [
    '.kPk.kpk.kPk..', 'kpPpkpPpkpPpkk', 'kkkkkkkkkkkkkk', 'kwwwwwwwwwwwwk', 'kWWWWWWWWWWWWk', 'kwkwwwwwwwwkwk',
    'kwwkwwwwwwkwwk', 'kwwwkwwwwkwwwk', 'kwwwwkwwkwwwwk', 'kwwwwwkkwwwwwk', 'kWWWWWWWWWWWWk', 'kkkkkkkkkkkkkk',
  ],
  PAPER_STACK: ['.kkkkkk.', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk', '.kpppPPk', '.kPPPPPk', 'kkkkkkkk', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk'],
  SCROLL_PILE: ['....kkkk..kkkk....', '...kppPk.kpxPk....', '..kkkkkkkkkkkkkk..', '.kpPppkpPppkpPpk..', '.kkkkkkkkkkkkkkkk.', 'kpPpkpPppkpPppkpPk', 'kkkkkkkkkkkkkkkkkk'],
  BOOKS: ['.kkkkkkk..', '.kxxxxxk..', 'kkkkkkkkk.', 'kuuuuuuuk.', '.kkkkkkkk.', '.kvvvvvvk.', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk'],
  LOOSE_A: ['kkkkk', 'kpppk', 'kpPpk', 'kkkkk'],
  LOOSE_B: ['kkkk', 'kPpk', 'kppk', 'kpPk', 'kkkk'],
  GAUGE: ['.kkkk.', 'kbbbbk', 'kbkxbk', 'kbbkbk', 'kbbbbk', '.kkkk.'],
  VENT: ['kkkkkkkk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kkkkkkkk'],
  CENSER: ['..k..', '..m..', '..m..', '..m..', '.kgk.', 'kgGgk', 'kGfGk', 'kgGgk', '.kgk.', '..k..'],
};
```

- [ ] **Step 2: Write `ui/scene.js`**

```js
import { sprite, MAPS } from './sprites.js';

export const AMBER = 'rgba(240,168,60,.26)';
export const GREEN = 'rgba(124,255,158,.16)';
export const RED = 'rgba(200,40,28,.22)';

const WIN_DAY = { u: '#6a8fb0', v: '#8aa86a', g: '#e0b85a', x: '#b8423a' };
const WIN_NIGHT = { u: '#3a2236', v: '#36401f', g: '#7a5a28' };
const BIN = '0100000101110110011001010010000001001111011011010110111001101001';

function grate(g, x, y, w, h) {
  g.fillStyle = '#2b2d30'; g.fillRect(x, y, w, h);
  g.fillStyle = '#141516';
  for (let i = x; i < x + w; i += 4) g.fillRect(i, y, 1, h);
  for (let j = y; j < y + h; j += 4) g.fillRect(x, j, w, 1);
}
function plates(g, x, y, w, h, base, line) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.fillStyle = line;
  for (let j = y + 9; j < y + h; j += 10) g.fillRect(x, j, w, 1);
}
function pipeH(g, x, y, w) { g.fillStyle = '#c8853a'; g.fillRect(x, y, w, 1); g.fillStyle = '#8a4f22'; g.fillRect(x, y + 1, w, 2); }
function pipeV(g, x, y, h) { g.fillStyle = '#c8853a'; g.fillRect(x, y, 1, h); g.fillStyle = '#8a4f22'; g.fillRect(x + 1, y, 2, h); }
function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
function put(g, map, x, y, over) { g.drawImage(sprite(map, over), x, y); }

const DECOR = [
  ['SHELF', 6, 19], ['PAPER_STACK', 10, 8], ['PAPER_STACK', 18, 10], ['SCROLL_PILE', 22, 13],
  ['SHELF', 40, 19], ['BOOKS', 44, 11], ['PAPER_STACK', 58, 8], ['LOOSE_A', 66, 15],
  ['BANNER', 98, 10], ['COGITATOR', 152, 24], ['GAUGE', 132, 26], ['GAUGE', 132, 33], ['VENT', 186, 14],
  ['RECAFF', 214, 22], ['SHELF', 236, 19], ['PAPER_STACK', 240, 8], ['BOOKS', 250, 11], ['PAPER_STACK', 260, 9],
  ['BANNER', 274, 10], ['CRATE', 318, 28], ['CRATE', 320, 80], ['PAPER_STACK', 300, 58], ['PAPER_STACK', 307, 62],
  ['SCROLL_PILE', 256, 84], ['LOOSE_B', 236, 64], ['LOOSE_A', 280, 74],
  ['COG_MECH', 267, 110], ['BANNER', 236, 112], ['BANNER', 306, 112], ['THRONE', 268, 128],
  ['CANDLES', 250, 136], ['CANDLES', 292, 136], ['PAPER_STACK', 246, 140], ['PAPER_STACK', 300, 142],
  ['LORD_DESK', 254, 150], ['SEAL', 260, 162], ['SEAL', 286, 162],
  ['BOOKS', 220, 172], ['SCROLL_PILE', 306, 200], ['LOOSE_A', 244, 206], ['LOOSE_B', 300, 214], ['PAPER_STACK', 326, 178],
  ['BRAZIER', 224, 196], ['BRAZIER', 320, 196], ['CENSER', 94, 7], ['CENSER', 196, 60],
  ['CRATE', 172, 206], ['BRAZIER', 6, 196], ['CANDLES', 186, 46],
];
const CLUTTER = [
  ['SCROLL_PILE', 58, 98], ['PAPER_STACK', 92, 92], ['PAPER_STACK', 99, 95], ['LOOSE_A', 46, 104], ['LOOSE_B', 140, 104],
  ['SCROLL_PILE', 160, 98], ['LOOSE_A', 190, 92], ['PAPER_STACK', 54, 132], ['PAPER_STACK', 61, 136], ['BOOKS', 76, 140],
  ['LOOSE_B', 8, 160], ['SCROLL_PILE', 150, 140], ['PAPER_STACK', 176, 128], ['LOOSE_A', 104, 160], ['SCROLL_PILE', 30, 188],
  ['PAPER_STACK', 64, 196], ['PAPER_STACK', 71, 200], ['BOOKS', 96, 206], ['LOOSE_A', 120, 190], ['LOOSE_B', 134, 212],
  ['SCROLL_PILE', 140, 196], ['LOOSE_A', 186, 186], ['LOOSE_B', 196, 172],
];

export function drawStatic(g, daylight) {
  plates(g, 0, 0, 200, 40, '#2a2a2c', '#18191b'); rect(g, 0, 36, 200, 4, '#140f0c');
  grate(g, 0, 40, 200, 186);
  plates(g, 208, 0, 138, 40, '#2c2c2e', '#18191b'); rect(g, 208, 36, 138, 4, '#140f0c');
  grate(g, 208, 40, 138, 60);
  rect(g, 208, 100, 138, 10, '#100b08');
  plates(g, 208, 110, 138, 30, '#301612', '#1e0c09'); rect(g, 208, 136, 138, 4, '#100b08');
  rect(g, 208, 140, 138, 86, '#3a110e');
  g.strokeStyle = '#6e3f17'; g.lineWidth = 1; g.strokeRect(214.5, 146.5, 125, 73);
  rect(g, 200, 0, 8, 150, '#100b08'); rect(g, 200, 186, 8, 40, '#100b08'); rect(g, 200, 150, 8, 36, '#3a110e');

  g.save(); g.shadowColor = '#3aa864'; g.shadowBlur = 4;
  rect(g, 0, 116, 200, 2, '#3aa864'); rect(g, 0, 182, 200, 2, '#3aa864'); rect(g, 98, 40, 2, 186, '#3aa864');
  g.restore();

  pipeH(g, 0, 4, 200); pipeH(g, 208, 4, 138);
  [20, 64, 110, 150, 190, 230, 280, 330].forEach(x => rect(g, x, 3, 3, 5, '#6e3f17'));
  pipeV(g, 203, 0, 150); pipeV(g, 203, 186, 40);
  [36, 74, 112].forEach(y => rect(g, 202, y, 5, 3, '#6e3f17'));
  pipeV(g, 144, 7, 29); pipeV(g, 194, 7, 29);
  [8, 26, 50, 74, 96, 128, 150, 172, 196, 220].forEach((x, i) => {
    const h = 10 + (i * 7) % 18;
    rect(g, x, 7, 1, h, '#0e0a08'); rect(g, x + 1, 7 + h - 1, 2, 1, '#0e0a08');
  });
  g.fillStyle = 'rgba(124,255,158,.32)';
  [[2, 32, 198], [74, 38, 198], [210, 32, 344], [210, 105, 344]].forEach(([x, y, end]) => {
    for (let i = 0; i < BIN.length && x + i * 2 < end; i++) if (BIN[i] === '1') g.fillRect(x + i * 2, y, 1, 1);
  });
  [[60, 104, 14, 1], [73, 104, 1, 6], [120, 204, 1, 12]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, '#0e0a08'));
  [[30, 120, 18, 8], [146, 186, 8, 6], [270, 196, 14, 6]].forEach(([x, y, w, h]) => rect(g, x, y, w, h, 'rgba(10,6,4,.35)'));

  const win = daylight ? WIN_DAY : WIN_NIGHT;
  [78, 114, 292].forEach(x => put(g, MAPS.WINDOW, x, 10, win));
  [210, 334].forEach(x => {
    rect(g, x, 108, 10, 118, '#1c1d20'); rect(g, x + 9, 108, 1, 118, '#0e0a08');
    pipeV(g, x + 3, 108, 118);
    [124, 160, 196].forEach(y => put(g, MAPS.GAUGE, x + 2, y));
  });
  rect(g, 254, 163, 44, 3, 'rgba(0,0,0,.45)');
  for (const [name, x, y] of DECOR) put(g, MAPS[name], x, y);
  for (const [name, x, y] of CLUTTER) put(g, MAPS[name], x, y);
}

const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export function drawRugs(g, blocks) {
  for (const b of blocks) {
    g.fillStyle = hexA(b.color, 0.07); g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = hexA(b.color, 0.3); g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  }
}

export function deskDrawable(desk, busy) {
  return {
    y: desk.y + 21,
    draw(g) {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(desk.x + 1, desk.y + 21, 30, 2);
      g.drawImage(sprite(MAPS.DESK, busy ? {} : { f: null, F: null, c: '#2e6b47' }), desk.x, desk.y);
    },
  };
}

export function deskLight(desk, busy) {
  return busy
    ? { x: desk.x + 25, y: desk.y + 1, r: 22, color: AMBER, flicker: true }
    : { x: desk.x + 13, y: desk.y + 5, r: 10, color: GREEN };
}

export function drawDecorFrame(g, t) {
  g.drawImage(sprite(MAPS.SKULL), 244, 50 + Math.round(2 * Math.sin(t * 4)));
}

export const STATIC_LIGHTS = [
  { x: 86, y: 22, r: 22 }, { x: 122, y: 22, r: 22 }, { x: 300, y: 22, r: 22 },
  { x: 172, y: 30, r: 30, color: GREEN }, { x: 222, y: 30, r: 14, color: GREEN }, { x: 248, y: 56, r: 12, color: GREEN },
  { x: 256, y: 138, r: 20, color: AMBER, flicker: true }, { x: 298, y: 138, r: 20, color: AMBER, flicker: true },
  { x: 274, y: 153, r: 14, color: GREEN },
  { x: 228, y: 197, r: 26, color: AMBER, flicker: true }, { x: 324, y: 197, r: 26, color: AMBER, flicker: true },
  { x: 10, y: 197, r: 26, color: AMBER, flicker: true }, { x: 276, y: 186, r: 26, color: RED },
  { x: 192, y: 50, r: 14, color: AMBER, flicker: true },
  { x: 96, y: 14, r: 10, color: AMBER, flicker: true }, { x: 198, y: 67, r: 10, color: AMBER, flicker: true },
  { x: 50, y: 117, r: 14 }, { x: 150, y: 117, r: 14 }, { x: 99, y: 150, r: 14 }, { x: 50, y: 183, r: 14 }, { x: 150, y: 183, r: 14 },
];
```

- [ ] **Step 3: Write `ui/lighting.js`**

```js
let layer = null;

// Darkness with light holes (destination-out), then additive glows, beams by day, vignette.
export function drawLighting(g, lights, level, t) {
  const w = g.canvas.width, h = g.canvas.height;
  if (level.beams) {
    for (const bx of [74, 110, 288]) {
      const grad = g.createLinearGradient(0, 26, 0, 116);
      grad.addColorStop(0, 'rgba(235,220,180,.16)');
      grad.addColorStop(1, 'rgba(235,220,180,0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(bx + 9, 26); g.lineTo(bx + 21, 26); g.lineTo(bx + 30, 116); g.lineTo(bx, 116); g.closePath(); g.fill();
    }
  }
  if (!layer) { layer = document.createElement('canvas'); layer.width = w; layer.height = h; }
  const d = layer.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, w, h);
  d.fillStyle = `rgba(6,4,3,${level.dark})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = l.r * (l.flicker ? 0.94 + 0.06 * Math.sin(t * 9 + l.x) : 1);
    const grad = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = grad;
    d.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.drawImage(layer, 0, 0);

  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = level.glow;
  for (const l of lights) {
    if (!l.color) continue;
    const r = l.r * (l.flicker ? 0.9 + 0.1 * Math.sin(t * 7 + l.y) : 1);
    const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    grad.addColorStop(0, l.color);
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
  }
  g.restore();

  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${level.beams ? 0.35 : 0.7})`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}
```

- [ ] **Step 4: Rewrite `ui/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Administratum</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Pirata+One&family=Pixelify+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --ink: #d6c79f; --dim: #8a7a5c; --bg: #060404; --bar: #120d0a; --red: #a0221a; --pink: #ff7a66; --green: #7cff9e; --copper: #b8742e; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font-family: 'Pixelify Sans', monospace; overflow: hidden; user-select: none; }
  header { height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 12px; background: var(--bar); border-bottom: 2px solid #4e110c; }
  header h1 { margin: 0; font: 400 22px/1 'Pirata One', serif; }
  .tier { display: flex; flex-direction: column; font-size: 10px; color: var(--green); }
  .tier .motto { color: var(--dim); letter-spacing: 2px; text-transform: uppercase; }
  .grow { flex: 1; align-self: stretch; }
  #modes { display: flex; border: 1px solid #3a2a1e; border-radius: 3px; overflow: hidden; }
  #modes button { padding: 5px 8px; background: #1a120e; color: var(--dim); border: none; font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; }
  #modes button[aria-pressed="true"] { background: #4e110c; color: #f3e6c4; }
  .count { padding: 3px 8px; border: 1px solid #3a2a1e; border-radius: 3px; font-size: 11px; color: var(--dim); white-space: nowrap; }
  .count.on { border-color: var(--red); color: var(--pink); font-weight: 600; animation: pulse 1.8s ease-in-out infinite; }
  .icon { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 4px; color: var(--copper); cursor: pointer; padding: 0; }
  .icon:hover, #modes button:hover { filter: brightness(1.3); }
  #mute .off { display: none; } #mute.muted .on { display: none; } #mute.muted .off { display: block; }
  button:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  #stage { position: relative; margin: 0 auto; width: fit-content; }
  #scene { display: block; image-rendering: pixelated; }
  #overlay { position: absolute; inset: 0; pointer-events: none; }
  .lbl { position: absolute; transform: translate(-50%, -100%); pointer-events: auto; display: flex; flex-direction: column; align-items: center; padding: 1px 5px; background: rgba(14,10,8,.9); border: 1px solid #3a2a1e; border-radius: 2px; color: var(--ink); font: inherit; font-size: 11px; line-height: 1.15; white-space: nowrap; cursor: pointer; }
  .lbl.sel { border-color: var(--green); background: #3a1410; }
  .lbl.petition { background: #1e0a08; border-color: var(--red); animation: pulse 1.8s ease-in-out infinite; }
  .lbl .sub { color: var(--pink); }
  .lbl .zz { color: #a89a7c; }
  .plaque { position: absolute; padding: 1px 6px; background: #140d09; border: 2px solid; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; white-space: nowrap; }
  .empty { position: absolute; left: 0; width: 57%; text-align: center; color: var(--dim); font-size: 14px; }
  #card { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); width: min(300px, 80%); padding: 8px 12px; background: #cdbb8f; color: #1a120c; border: 2px solid #6e3f17; border-radius: 2px; box-shadow: 0 4px 0 #0e0a08; font-size: 12px; display: flex; flex-direction: column; gap: 3px; }
  #card[hidden] { display: none; }
  #card .name { font-size: 14px; font-weight: 600; }
  #card .meta, #card .path { color: #5a3c16; }
  @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(160,30,22,0); } 50% { box-shadow: 0 0 12px 2px rgba(190,40,28,.8); } }
  @media (max-width: 760px) { .tier { display: none; } }
</style>
</head>
<body>
<header data-tauri-drag-region>
  <svg width="20" height="20" viewBox="0 0 18 18" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="7" y="0" width="4" height="2" fill="#cfc3a8"></rect><rect x="7" y="16" width="4" height="2" fill="#cfc3a8"></rect>
    <rect x="0" y="7" width="2" height="4" fill="#cfc3a8"></rect><rect x="16" y="7" width="2" height="4" fill="#cfc3a8"></rect>
    <rect x="3" y="3" width="12" height="12" fill="#cfc3a8"></rect><rect x="5" y="5" width="8" height="8" fill="#120d0a"></rect>
    <rect x="6" y="6" width="3" height="6" fill="#cfc3a8"></rect><rect x="9" y="6" width="3" height="6" fill="#6a6f76"></rect>
    <rect x="10" y="8" width="1" height="1" fill="#7cff9e"></rect>
  </svg>
  <h1 data-tauri-drag-region>Administratum</h1>
  <div class="tier" data-tauri-drag-region><span>II · Data-Shrine of the Cult Mechanicus</span><span class="motto">Knowledge is power, guard it well</span></div>
  <div class="grow" data-tauri-drag-region></div>
  <div id="modes" role="group" aria-label="Lighting">
    <button data-mode="auto" aria-pressed="false">Auto</button>
    <button data-mode="full" aria-pressed="false">Full light</button>
    <button data-mode="candles" aria-pressed="false">Candles</button>
  </div>
  <div id="count" class="count">0 petitions</div>
  <button id="mute" class="icon" aria-label="Mute chime">
    <svg class="on" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
    <svg class="off" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-9.33-5"></path><path d="M6 6v2c0 7-3 9-3 9h13"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
  </button>
  <button id="hide" class="icon" aria-label="Hide to tray">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
  </button>
</header>
<main id="stage">
  <canvas id="scene"></canvas>
  <div id="overlay"></div>
  <div id="card" hidden>
    <div class="name"></div>
    <div class="meta"></div>
    <div class="task"></div>
    <div class="path"></div>
  </div>
</main>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write the first `ui/app.js` (room + lighting + header modes)**

```js
import { SCENE, lightLevel } from './layout.js';
import { drawStatic, drawDecorFrame, STATIC_LIGHTS } from './scene.js';
import { drawLighting } from './lighting.js';

const MODES = ['auto', 'full', 'candles'];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: keep in memory */ } },
};
export const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
canvas.width = SCENE.w;
canvas.height = SCENE.h;
const overlay = document.getElementById('overlay');
export let scale = 2;

const bg = {};
function background(day) {
  const k = day ? 'day' : 'night';
  if (!bg[k]) {
    const c = document.createElement('canvas');
    c.width = SCENE.w; c.height = SCENE.h;
    drawStatic(c.getContext('2d'), day);
    bg[k] = c;
  }
  return bg[k];
}

function renderModes() {
  const hour = new Date().getHours();
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    if (b.dataset.mode === 'auto') b.textContent = `Auto · ${String(hour).padStart(2, '0')}h ${lightLevel('auto', hour).phase}`;
  }
}
function setMode(m) { state.mode = m; store.set('adm.mode', m); renderModes(); }
export function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

export function fit() {
  const head = document.querySelector('header').offsetHeight;
  scale = Math.max(1, Math.floor(Math.min(innerWidth / SCENE.w, (innerHeight - head) / SCENE.h)));
  for (const el of [canvas, overlay]) { el.style.width = `${SCENE.w * scale}px`; el.style.height = `${SCENE.h * scale}px`; }
}
addEventListener('resize', fit);

export const hooks = { beforeLights: () => [], afterFrame: () => {}, update: () => {} };
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (acc < 1 / 30) return;
  const dt = acc; acc = 0;
  hooks.update(dt);
  const level = lightLevel(state.mode, new Date().getHours());
  g.drawImage(background(level.beams), 0, 0);
  const extra = hooks.beforeLights(g);
  drawDecorFrame(g, now / 1000);
  drawLighting(g, STATIC_LIGHTS.concat(extra), level, now / 1000);
  hooks.afterFrame();
}

renderModes();
setInterval(renderModes, 60_000);
fit();
requestAnimationFrame(frame);
```

- [ ] **Step 6: Run and check the room by eye**

```powershell
Set-Location src-tauri
cargo tauri dev
```

Expected: the Tier II room fills the window at integer scale: grate floor with green coolant lines, shelves with paper towers, windows, cogitator bank, refectorium, Sanctum with Cog Mechanicus/throne/lord desk/braziers, servo-skull bobbing. Mode switch: **Full light** = bright windows + light shafts; **Candles** = dark with light pools; **Auto** label shows the hour and phase. Switch survives a restart (localStorage). Compare against the Claude Design board "Tier II".

- [ ] **Step 7: Commit**

```powershell
git add ui
git commit -m "ui: Tier II room, sprites, lighting modes, page shell"
```

---

### Task 7: Scribes — departments, desks, walking, labels, card, chime

**Files:**
- Create: `ui/actors.js`
- Modify: `ui/app.js` (append the wiring below)

**Interfaces:**
- Consumes: `layoutDepartments`, `route`, `QUEUE_SLOTS`, `COG_SPOTS`, `ENTRY` (Task 5); `SCRIBE`, `MAPS`, `sprite`, `SASH` (Task 6); `drawRugs`, `deskDrawable`, `deskLight` (Task 6); `hooks`, `state`, `scale`, `cycleMode`, `fit` from `app.js`; Tauri events `roster`, `petition`, `ui-command` (Task 4).
- Produces: `class Cast { actors: Map<id, Actor>; sync(roster, seats, colorOf); update(dt); drawActor(g, a) }` where `Actor = { id, s: Session, x, y, path, target, destKey, dir, t, pose: 'walk'|'desk'|'cog'|'queue'|'gone', leaving, sash }`.

- [ ] **Step 1: Write `ui/actors.js`**

```js
import { SCRIBE, MAPS, sprite } from './sprites.js';
import { route, QUEUE_SLOTS, COG_SPOTS, ENTRY } from './layout.js';

const SPEED = 40; // logical px per second

export class Cast {
  constructor() { this.actors = new Map(); }

  sync(roster, seats, colorOf) {
    const live = new Set(roster.map(s => s.id));
    for (const s of roster) {
      const a = this.actors.get(s.id);
      if (a) { a.s = s; a.leaving = false; a.sash = colorOf(s.dept); }
      else this.actors.set(s.id, { id: s.id, s, x: ENTRY.x, y: ENTRY.y, path: [], target: null, destKey: '', dir: 'up', t: 0, pose: 'walk', leaving: false, sash: colorOf(s.dept) });
    }
    for (const a of this.actors.values()) if (!live.has(a.id)) a.leaving = true;
    const waiting = roster.filter(s => s.status === 'waiting').sort((p, q) => p.sinceMs - q.sinceMs).map(s => s.id);
    const shell = roster.filter(s => s.status === 'shell').map(s => s.id);
    for (const a of this.actors.values()) {
      const d = this.destination(a, seats, waiting, shell);
      const key = `${d.x},${d.y},${d.pose}`;
      if (key !== a.destKey) {
        a.destKey = key;
        a.target = d;
        a.path = route({ x: a.x, y: a.y }, d);
        a.pose = 'walk';
      }
    }
  }

  destination(a, seats, waiting, shell) {
    if (a.leaving) return { ...ENTRY, pose: 'gone' };
    if (a.s.status === 'waiting') return { ...QUEUE_SLOTS[Math.min(waiting.indexOf(a.id), QUEUE_SLOTS.length - 1)], pose: 'queue' };
    if (a.s.status === 'shell') return { ...COG_SPOTS[shell.indexOf(a.id) % COG_SPOTS.length], pose: 'cog' };
    const seat = seats.get(a.id);
    return seat ? { x: seat.x, y: seat.y, pose: 'desk' } : { ...ENTRY, pose: 'gone' };
  }

  update(dt) {
    for (const a of [...this.actors.values()]) {
      a.t += dt;
      let step = SPEED * dt;
      while (step > 0 && a.path.length) {
        const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
        if (dist > 0) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (dist <= step) { a.x = p.x; a.y = p.y; a.path.shift(); step -= dist; }
        else { a.x += (dx / dist) * step; a.y += (dy / dist) * step; step = 0; }
      }
      if (!a.path.length && a.pose === 'walk' && a.target) {
        a.pose = a.target.pose;
        if (a.pose === 'gone') this.actors.delete(a.id);
      }
    }
  }

  // Sprite top-left is (feet.x - 8, feet.y - 17); offsets match the Tier II board.
  drawActor(g, a) {
    const over = { y: a.sash };
    const fx = Math.round(a.x) - 8, fy = Math.round(a.y) - 17;
    if (a.pose === 'walk') {
      g.drawImage(sprite(SCRIBE[a.dir][Math.floor(a.t * 8) % 3], over), fx, fy);
      if (a.target?.pose === 'queue') g.drawImage(sprite(MAPS.SCROLL), fx + 14, fy + 8);
      return;
    }
    if (a.pose === 'desk') {
      g.fillStyle = '#14100c'; g.fillRect(fx + 7, 7, 1, fy - 7);
      g.fillStyle = '#1e2124'; g.fillRect(fx + 9, 7, 1, fy - 6);
    }
    g.drawImage(sprite(SCRIBE.up[0], over), fx, fy);
    g.drawImage(sprite(MAPS.ARM), fx + 14, fy + 2);
    g.drawImage(sprite(MAPS.ARM_L), fx - 4, fy + 2);
    if (a.pose === 'desk') g.drawImage(sprite(MAPS.CHAIN), fx - 6, fy + 15);
    if (a.pose === 'queue') g.drawImage(sprite(MAPS.SCROLL), fx + 14, fy + 8);
  }
}
```

- [ ] **Step 2: Append the wiring to `ui/app.js`**

Add these imports at the top of `app.js` (next to the existing ones):

```js
import { layoutDepartments } from './layout.js';
import { drawRugs, deskDrawable, deskLight } from './scene.js';
import { SASH } from './sprites.js';
import { Cast } from './actors.js';
```

Append at the end of `app.js`:

```js
const STATUS_TEXT = { busy: 'Writing', shell: 'At the cogitator', idle: 'Turn done, awaiting orders', waiting: 'Petition at your door' };
const cast = new Cast();
const deptOrder = [];
let layout = { blocks: [], desks: [], seats: new Map(), overflow: 0 };
let roster = [];
let sel = null;
const colorOf = dept => SASH[deptOrder.indexOf(dept) % SASH.length];
const ago = ms => {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? '<1m' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

function onRoster(next) {
  roster = next;
  for (const s of roster) if (!deptOrder.includes(s.dept)) deptOrder.push(s.dept);
  const depts = deptOrder
    .map(name => ({ name, color: colorOf(name), ids: roster.filter(s => s.dept === name).map(s => s.id) }))
    .filter(d => d.ids.length);
  layout = layoutDepartments(depts);
  // ponytail: sessions past the hall's capacity are not drawn; toast + counter still cover their petitions.
  cast.sync(roster.filter(s => layout.seats.has(s.id)), layout.seats, colorOf);
  const n = roster.filter(s => s.status === 'waiting').length;
  const count = document.getElementById('count');
  count.textContent = `${n} petition${n === 1 ? '' : 's'}`;
  count.classList.toggle('on', n > 0);
  renderPlaques();
  renderCard();
}

function renderPlaques() {
  for (const el of overlay.querySelectorAll('.plaque, .empty')) el.remove();
  const add = (cls, text, x, y, color) => {
    const el = document.createElement('div');
    el.className = cls; el.textContent = text;
    el.style.left = `${x * scale}px`; el.style.top = `${y * scale}px`;
    if (color) { el.style.borderColor = color; el.style.color = color; }
    overlay.appendChild(el);
  };
  for (const b of layout.blocks) add('plaque', b.name, b.x + 2, b.y + b.h - 7, b.color);
  if (layout.overflow) add('plaque', `+${layout.overflow} in the stacks`, 120, 186, '#8a7a5c');
  if (!roster.length) add('empty', 'No scribes on duty', 0, 120);
}

function renderCard() {
  const card = document.getElementById('card');
  const s = roster.find(r => r.id === sel);
  card.hidden = !s;
  if (!s) return;
  card.querySelector('.name').textContent = `${s.name} · ${s.dept}`;
  card.querySelector('.meta').textContent = `${STATUS_TEXT[s.status] ?? s.status}${s.waitingFor ? ` (${s.waitingFor})` : ''} · ${ago(s.sinceMs)}`;
  card.querySelector('.task').textContent = s.task;
  card.querySelector('.path').textContent = s.cwd;
}

function select(id) {
  sel = sel === id ? null : id;
  const s = roster.find(r => r.id === id);
  if (sel && s?.status === 'waiting') navigator.clipboard?.writeText(`${s.name} ${s.cwd}`).catch(() => {});
  renderCard();
}

const labels = new Map();
function syncLabels() {
  for (const [id, el] of labels) if (!cast.actors.has(id)) { el.remove(); labels.delete(id); }
  for (const a of cast.actors.values()) {
    let el = labels.get(a.id);
    if (!el) {
      el = document.createElement('button');
      el.className = 'lbl';
      el.onclick = () => select(a.id);
      overlay.appendChild(el);
      labels.set(a.id, el);
    }
    const petition = a.s.status === 'waiting' && a.pose === 'queue';
    const dozing = a.pose === 'desk' && a.s.status === 'idle';
    const want = a.s.waitingFor ?? 'input needed';
    const key = [a.s.name, petition, dozing, want, sel === a.id, petition ? ago(a.s.sinceMs) : ''].join('|');
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.classList.toggle('petition', petition);
      el.classList.toggle('sel', sel === a.id);
      el.replaceChildren();
      const line = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; el.appendChild(s); };
      if (dozing) line('zz', 'z z');
      line('', a.s.name);
      if (petition) line('sub', `${want} · ${ago(a.s.sinceMs)}`);
      el.setAttribute('aria-label', petition ? `${a.s.name}, petition: ${want}` : a.s.name);
    }
    el.style.left = `${a.x * scale}px`;
    el.style.top = `${(a.y - 18) * scale}px`;
  }
}

let audio = null;
function chime() {
  if (state.muted) return;
  try {
    audio ??= new AudioContext();
    const t0 = audio.currentTime;
    [660, 990].forEach((f, i) => {
      const o = audio.createOscillator(), v = audio.createGain(), at = t0 + i * 0.18;
      o.type = 'sine'; o.frequency.value = f;
      v.gain.setValueAtTime(0, at);
      v.gain.linearRampToValueAtTime(0.18, at + 0.02);
      v.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      o.connect(v).connect(audio.destination);
      o.start(at); o.stop(at + 0.55);
    });
  } catch { /* no audio device: the toast still fires */ }
}

const muteBtn = document.getElementById('mute');
function renderMute() { muteBtn.classList.toggle('muted', state.muted); muteBtn.setAttribute('aria-label', state.muted ? 'Unmute chime' : 'Mute chime'); }
function toggleMute() { state.muted = !state.muted; store.set('adm.muted', state.muted ? '1' : '0'); renderMute(); }
muteBtn.onclick = toggleMute;
renderMute();

hooks.update = dt => cast.update(dt);
hooks.beforeLights = gg => {
  drawRugs(gg, layout.blocks);
  const items = [], lights = [];
  for (const d of layout.desks) {
    const a = cast.actors.get(d.id);
    const busy = !!a && a.pose === 'desk' && a.s.status === 'busy';
    items.push(deskDrawable(d, busy));
    lights.push(deskLight(d, busy));
  }
  for (const a of cast.actors.values()) items.push({ y: a.y, draw: g2 => cast.drawActor(g2, a) });
  items.sort((p, q) => p.y - q.y).forEach(it => it.draw(gg));
  return lights;
};
hooks.afterFrame = syncLabels;
addEventListener('resize', renderPlaques);

const T = window.__TAURI__;
if (T) {
  T.event.listen('roster', e => onRoster(e.payload));
  T.event.listen('petition', () => chime());
  T.event.listen('ui-command', e => (e.payload === 'mute' ? toggleMute() : cycleMode()));
  document.getElementById('hide').onclick = () => T.window.getCurrentWindow().hide();
}
```

Note: `store` must be visible here — it is declared at the top of `app.js` in Task 6 (same module), so no change is needed.

- [ ] **Step 3: Re-run the geometry self-check (unchanged contract)**

Run: `node ui/layout.test.mjs`
Expected: `layout ok`.

- [ ] **Step 4: Run in demo mode and walk through the script**

```powershell
Set-Location src-tauri
$env:ADMINISTRATUM_DEMO = '1'
cargo tauri dev
```

Expected, against the 60 s demo cycle:
- At start all four scribes walk in from the bottom-left and sit: Terra rug (gold) with 2 desks, Geneseed (green), Token-Dashboard (blue); plaques under each rug.
- terra-77: candle and screen lit, ceiling cables into the hood, chained.
- terra-27 dozes (`z z` above the label).
- t≈10 s geneseed-51 walks down the aisle, through the door, to the front of your desk with a sealed scroll; red pulsing label "approve Bash · <1m"; toast + chime; header shows "1 petition".
- t≈20 s terra-77 walks to the cogitator bank; t≈30 s back to its desk.
- t≈25 s token-dashboard-af queues second; t≈40 s geneseed-51 walks back and the queue steps forward.
- t≈45 s drop-pod-1 arrives with a new rug colour; at the cycle end it walks out.
- Clicking a label shows the parchment card; clicking a petitioner also copies its name and path. If the first chime is silent, click the window once (WebView autoplay policy) and wait for the next petition.

Then `Remove-Item Env:ADMINISTRATUM_DEMO`.

- [ ] **Step 5: Run against the real sessions**

```powershell
Set-Location src-tauri
cargo tauri dev
```

Expected: one scribe per running Claude Code session (compare with `Get-ChildItem $HOME\.claude\sessions\*.json`), departments named after their project folders, task lines matching what each session last did. In another terminal, trigger a permission prompt in any session: that scribe queues and a toast fires once.

- [ ] **Step 6: Commit**

```powershell
git add ui/actors.js ui/app.js
git commit -m "ui: scribes walk between desk, cogitator and petition queue; labels, card, chime"
```

---

### Task 8: Release build and vault card

**Files:**
- Modify: `README.md` (install line)
- Create (Terra vault, via the `artisan` Legatus per Lex IV): `Armoury/Projects/Administratum.md`

- [ ] **Step 1: Build the installer**

```powershell
Set-Location src-tauri
cargo tauri build
```

Expected: `src-tauri/target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe`.

- [ ] **Step 2: Install and smoke-test the release build**

Run the installer, start Administratum from the Start menu. Expected: no console window, tray icon present, toasts show "Administratum" as the app name, tray "Start at login" toggles and survives a re-login.

- [ ] **Step 3: Add the install line to `README.md`** (under the Run bullets)

```markdown
- Install: `cd src-tauri; cargo tauri build`, then run `target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe`
```

- [ ] **Step 4: Commit and push**

```powershell
git add README.md
git commit -m "docs: release build and install"
git push
```

- [ ] **Step 5: Hololith card in the Terra vault**

Dispatch the `artisan` Legatus to create `Armoury/Projects/Administratum.md` with a `hololith` frontmatter block in the same shape as the other cards in `Armoury/Projects/` (repo `Arylmera/Administratum`, host: this PC, no NAS service), linking the spec and this plan. Commit and push in Terra.
