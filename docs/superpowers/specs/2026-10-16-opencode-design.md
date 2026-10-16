# OpenCode sessions in the hall — design

OpenCode 2.x sessions appear in the hall beside Claude Code's, with status, task, context, subagents, Chronicon
events and Tithe tokens, and their permission prompts can be answered from the card. Target: a macOS work machine
with OpenCode 2.0.x and neither Orca nor Claude Code; it must also run on Windows.

Picks up `2026-10-07-other-agents-acp-notes.md` step 2 ("read their own session files first"), for OpenCode.

## Decisions

- **D1** OpenCode **2.x only** (the `session_v2` schema). Older installs: the OpenCode source stays off, silently.
- **D2** Without Orca or without Claude Code, what needs them is hidden (the card already hides Orca buttons when a
  session has no handle); nothing else changes.
- **D3** New dependency `rusqlite` with `bundled` (accepted 2026-10-16). Nothing else moves to SQLite: the
  Chronicon stays in day files (576 KB over 15 days, measured).
- **D4** Roster membership: a session is shown while it runs or waits on a permission, and for **15 min** after it
  went idle. Nothing on disk says a TUI has a session open, so an idle session cannot be followed longer.
  Added in 0.5.1: an idle session also leaves as soon as no `opencode` TUI (not `serve`) runs in its folder. The
  process table is listed at most every 5 s and only while an idle OpenCode session is shown; cwd and command line
  are read once per pid (measured on Windows: ~700 processes, 13-15 ms per listing after the first, ~380 KB kept).
- **D5** Standalone TUIs (`--standalone`, or the service disabled in config) write no registration and stay
  invisible. Accepted limitation.
- **D6** Polling, not the SSE stream: one read transaction and at most a few loopback GETs per 1 s tick, like the
  Claude side. `/api/event` is volatile (lost on disconnect) and would add a thread for no visible gain.

## What OpenCode 2.x provides (source read at tag v2.0.29, verified on a 2.0.25 install)

Paths are `packages/...` in `anomalyco/opencode`.

| Fact | Where |
|---|---|
| Data dir `$XDG_DATA_HOME` or `~/.local/share` + `/opencode`, state dir `$XDG_STATE_HOME` or `~/.local/state` + `/opencode`, same rule on every OS (Windows: under the home folder, not AppData). `OPENCODE_DB` overrides the DB path. Non-default channels: `opencode-<ch>.db`, `service-<ch>.json` (out of scope: default channel only). | `util/src/global-roots.ts:5-17`, `cli/src/database-path.ts:4-12` |
| New sessions are written to v2 tables only; v1 tables are a one-time migration source. | `core/src/database/v1-migration.bun.ts:534-560` |
| `session_v2`: `parent_id` (subagents, indexed), `directory`, `title`, `model` json `{id,providerID,variant?}`, `time_suspended` (execution claim: set at start, cleared at any end; survives a crash), `time_idle` + `idle_outcome` (`succeeded`/`failed`/`interrupted`), `time_compacting`, `time_archived`. Index on `time_suspended`. | `core/src/session/sql.ts:22-77`, `core/src/session/store.ts:205-226`, `projector.ts:412-439` |
| `session_message`: `session_id`, `type`, `seq` (unique per session), `data` json. Types: user, assistant, synthetic, system, skill, shell, compaction, idle, agent/model/location-switched. Assistant: `model`, `content[]`, `finish`, `tokens{input,output,reasoning,cache{read,write}}`, `error`, `time{created,streamed?,completed?}`. Tool content `{type:"tool", id, name, state{status: streaming/running/completed/error, input, ...}}`. Indexes `(session_id, seq)` unique and `(session_id, type, seq)`. | `core/src/session/sql.ts:79-98`, `schema/src/session-message.ts` |
| Tools: `shell` (input `command`), `edit` (`path`), `write` (`path`), `patch` (`patchText`), `subagent`, `question`, MCP tools `<server>_<tool>`. | `core/src/tool/plugin/*.ts` |
| Pending permissions live **only in the service's memory**. | `core/src/permission.ts:130-144` |
| One shared service per user: the TUI reuses or spawns a detached `opencode serve --service`. It registers in `$STATE/opencode/service.json` = `{id, version, url, pid, password}` (mode 0600), and exits when that file is replaced or deleted. A second `service.json` under the **config** dir is CLI config, not the registration. | `cli/src/services/service-registration.ts:14-66`, `server-connection.ts:44-83` |
| `/api/*` uses HTTP Basic, username `opencode`, password from the registration. | `server/src/auth.ts:20` |
| `GET /api/session/active` → `{data: {ses_…: {type:"running"}}}` (executions of that service). | `server/src/handlers/session.ts:182-186` |
| `GET /api/session/{id}/permission` → `{data: [{id:"per_…", sessionID, action, resources[], save?, metadata?, source?, message?}]}`. | `protocol/openapi.json` |
| `POST /api/session/{sid}/permission/{rid}/reply`, body `{decision: "once"/"always"/"reject", message?}` → 204. A reject also rejects every other pending request of that session; an always approves the other matching ones. (1.x used `reply`.) | `core/src/permission.ts:265-322` |

## Design

### Backend: a second source beside the Claude registry

`src-tauri/src/opencode/` (new module, its own README-level doc comment like `registry/`):

- `db.rs` — pure reads over a `rusqlite::Connection`: the sessions to show (running: `time_suspended` set; or
  `time_idle` within 15 min; never archived), their newest user text (task), newest assistant message (context,
  model, error), child sessions (helpers), and for the Chronicon the messages after a `seq` cursor. Opened
  read-only (`SQLITE_OPEN_READ_ONLY`, `busy_timeout` 200 ms, never `immutable`), **short transactions, never held across ticks**, and only while the database's `-wal` file
  exists: a read-only open of a closed WAL database recreates `-wal`/`-shm` in OpenCode's folder (found in Task 1),
  so a closed OpenCode shows no sessions (a pinned reader blocks OpenCode's WAL checkpoint on a multi-GB DB). Every query goes
  through the indexes above.
- `service.rs` — the registration file and a minimal HTTP/1.1 client on `std::net` (the house style of `remote/`):
  - parse `service.json`; **refuse any `url` whose host is not `127.0.0.1`/`localhost`/`::1`** (config allows a
    remote hostname) and any `version` below 2;
  - liveness: the registration `pid` is alive (sysinfo, as `poller::alive`);
  - `GET /api/session/active`, `GET /api/session/{id}/permission`, `POST .../reply`, 300 ms connect/read timeouts;
  - **never writes or touches the registration file** (that stops the service).
- `mod.rs` — `Source::roster(now_ms) -> Vec<Session>`, memoised like `Poller`: the DB is re-read only when the
  `-wal`/db (len, mtime) changed, the service is asked only while some session is running.

Status of a shown session:

| Status | Rule |
|---|---|
| `waiting` | the service lists a pending permission for it (`waiting_for` = "permission", `asks` = `action` + first resource) |
| `busy` | `time_suspended` set **and** the registration pid alive (and, when the service answers, the id is in `/api/session/active`) |
| `idle` | otherwise, within 15 min of `time_idle` |

A claim (`time_suspended`) with a dead service is a crashed run: shown idle, then dropped after 15 min.

`Session` gains `source: "claude" | "opencode"`, `opencode_request: Option<String>` (the `per_…` id of the
pending permission shown on the card) and, backend only (`serde(skip)`), `opencode_asker`: the session that asked,
a helper's own id when a helper asked, where the reply goes. OpenCode sessions get `pid` = the service pid, `orca`/`web`/`limit` = None;
the only other `pid` consumer is the poller's Orca cache, which never sees them. The password never enters
`Session`, a log line, an error string or the remote view.

Context tokens: `input + cache.read + cache.write` of the newest assistant message with usage, the same sum as
Claude's `context_of`. OpenCode's own TUI adds output and reasoning, so its figure is a little higher.

`dept` and `temp` come from `directory` through the existing `dept_of` / `temp_dept`.

### Chronicon and Tithe

`Chronicle::read_opencode(roster, rows)`: per session a `seq` cursor in its own map (the offset map is keyed and
pruned by file, OpenCode has none), persisted beside the offsets. Assistant `tokens` feed the Tithe under the
session's dept; tool content is mapped to the Claude names `classify` already knows (`shell`→`Bash` with
`command`, `edit`→`Edit`, `write`→`Write`, `patch`→`Edit`) so test runs, commits, pushes and edited files come out
of the same code. A turn's working time is user prompt → `idle` message.

### Petitions

- Card: `answerable` (ui/card.js) accepts an OpenCode session with `opencodeRequest`; the buttons map
  yes/always/no to `once`/`always`/`reject`. The card says that a reject also refuses the session's other pending
  requests.
- New Tauri command `answer_opencode(session, request, choice)`; both ids pass a validator in `prompt.rs`
  (`ses_`/`per_` + `[A-Za-z0-9]`) before they enter a URL path.
- Remote: `/api/answer_petition` takes the same OpenCode target behind the same gates. `tools/adm.mjs` still cannot
  answer petitions.
- Toasts: an OpenCode petition toasts like a Claude one (the tracker works on `Session`); its buttons call the same
  reply.

### Read-only principle

`docs/spec.md` keeps "the registry is the source of truth, read-only, no agent config change". OpenCode's state is
only read; its API is written to **only** when the user clicks an answer, exactly like the Orca keystroke today.

## Verification

- Unit tests on an in-memory SQLite created from the v2.0.29 DDL copied verbatim into
  `src-tauri/src/opencode/testdata/schema.sql` (source cited in its header), and on canned registration files and
  HTTP responses served by a test `TcpListener`.
- End to end on Windows once OpenCode 2.x is installed at home (back up `opencode.db` first), then on the work Mac.

## Out of scope

Non-default channels, standalone TUIs, the SSE stream, OpenCode's `question` tool as a petition, opening an
OpenCode session from the card (no terminal handle without Orca).
