# L1a Reliability Backend Plan

**Goal:** Silent failures get a place to land (a masked rotating log and an `integration_status` store), the Orca CLI and the Night Vigil shutdown stop hanging or failing unseen, and the remote view gets a loopback listener, a gated `peek_petition`, an update progress event and a test-notification command.

**Spec:** `docs/superpowers/specs/2026-11-21-parallel-waves-design.md` (rows F2, F3, F4, F5, F18, F19; section 4 L1a; D1, D5). Backend only: no `ui/` file.

## Items, files, tests

1. **F2 `status.rs` (new).** `Store` (name, state ok/warn/error, last message, time ms), the `integration_status` command, `Log` (std only, `administratum.log` in the app data folder, 1 MiB cap, 3 files). Every stored message and log line, and the stderr copy, passes `mask::mask` first. The 17 non-test `eprintln!` go through `status::report` (store + log + stderr) or `status::note` (log + stderr). Tests: store, rotation (size cap, file count), a token-shaped line written masked, a source scan that no `eprintln!` stays outside `status.rs`, `demo.rs` and test modules.
2. **F3 backend.** `window::tray_tooltip(waiting)` (pure: `Administratum`, `Administratum · 1 waiting`, `· N waiting`), set from the poll loop only when N changes. Test: 0, 1, N.
3. **F4 `orca.rs`.** The runner takes the candidate list and a timeout: `output()` and the switch wait at most about 3 s, then kill and return a timeout error; a non-zero exit returns its stderr; no candidate keeps "orca not found". Tests with a stub program (a sleeper, a non-zero exit, none).
4. **D1.** `orca::open_url` is `pub(crate)`.
5. **F5 backend.** `start_saved` and `remote_set` record the `remote` entry (error on a failed bind). `remote_status` adds `saved` (the setting), `loopback` and `error`, beside `enabled` (actually listening on the LAN).
6. **F18 backend.**
   - Q5: `GET /api/peek_petition` behind the remote-actions gate (`peek_gate`: actions on, `X-Adm: 1`, same origin when the browser says so). Route test.
   - Q6: the server always listens: 0.0.0.0 when the LAN view is on, 127.0.0.1 only when off, same port, same token (`remote_conf` creates and saves it). `bind_addr` pure. Test: no token on loopback is refused. `tools/adm.mjs` drops the "remote view is off" check.
   - `install_update` emits `update-progress` `{downloaded, total}`; `progress_payload` pure and tested.
   - `test_notification` command: one plain toast with fixed text.
   - Night Vigil shutdown: `status()` instead of `spawn()`, the exit checked (`shutdown_failure` pure and tested), a failure recorded in `integration_status` and the log.
7. **F19 `opencode/mod.rs`.** Reproducing test first: a session whose permission was answered at T shows idle since >= T. The idle time comes from `time_idle`, which OpenCode does not move on a Deny; the Source remembers when a petition ended and `build`'s idle `since_ms` takes the later time.

Docs: README (Privacy file table: the log file and the loopback listener; Remote view), `docs/remote-api.md`, `docs/DEVELOPMENT.md` rows.
