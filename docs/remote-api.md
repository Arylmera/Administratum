# Remote view: HTTP API

Backend for the LAN remote view (design: `docs/superpowers/specs/2026-10-05-remote-view-design.md`).
Command-line client on the same PC: `tools/adm.mjs` (status, vigil, chronicle; no petitions).
Code: `src-tauri/src/remote/mod.rs` (server, policy, tests) and `src-tauri/src/remote/app.rs` (the `remote_*` commands and the backend the server calls).

## Tauri commands (local settings panel only)

| Command | Args (JS, camelCase) | Returns |
|---|---|---|
| `remote_status` | none | `RemoteStatus` |
| `remote_set` | `{ enabled, port, actionsAllowed }` | `RemoteStatus`, or an error string (port < 1024, port in use: the view is then left off) |
| `remote_regenerate_token` | none | `RemoteStatus` (every paired device is cut off, open event streams end) |

```json
RemoteStatus = {
  "enabled": true,              // actually serving right now
  "port": 7770,
  "urls": ["http://192.168.1.5:7770/"],      // empty when the PC has no private IPv4
  "token_url": "http://192.168.1.5:7770/?t=<32 hex>",  // "" when urls is empty
  "qr_svg": "<?xml ...><svg ...>...</svg>",  // QR of token_url; "" when token_url is ""
  "actions_allowed": false
}
```

Applied at once (start, stop, port change), no restart. Stored in `settings.json` as `remote.enabled`,
`remote.port`, `remote.actions`, `remote.token`. Those `remote.*` keys never appear in `settings_load`
(local or remote) and `settings_save` cannot change or drop them. The remote `settings_load` also leaves out
`adm.open*` (the program that opens a folder) and `adm.reportDir` (the day report's folder).

## Server

- `http://0.0.0.0:<port>`, only while enabled. Plain HTTP/1.1, one request per connection (`Connection: close`).
- Peer must be loopback, private or link-local (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, ::1,
  fc00::/7, fe80::/10, IPv4-mapped judged as IPv4); anything else is closed unanswered.
- `Host` must be an IP literal or `localhost` (optional port), else 403 (DNS rebinding).
- Limits: head 8 KiB (431), body 1 KiB (413), no chunked bodies (411), 10 s read/write timeout,
  64 connections, 16 event streams (503 past it).
- Every response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Adm-Remote: 1`.

## Pairing and auth

1. Any URL with `?t=<token>`: valid -> 200, a tiny page that meta-refreshes to `/`, + `Set-Cookie: adm_t=<token>; Path=/; HttpOnly;
   SameSite=Strict; Max-Age=31536000` (the token leaves the address bar; a page-initiated reload, not a
   303, so the Strict cookie is sent even when the QR link was opened from another app). Invalid -> 401.
2. Every other request needs that cookie. Missing or wrong -> `401` with a small HTML "scan the QR code"
   page (the frontend should treat 401 on fetch/EventSource as "not paired", e.g. reload to show it).
3. After a token regeneration every old cookie gets 401 and open `/events` streams are closed.

## Remote flag

- `GET /` (and any HTML asset) gets `<script src="/remote.js"></script>` inserted right after `<head>`.
- `GET /remote.js` is `window.ADM_REMOTE = true;` so the UI knows it is remote before `app.js` runs.
  (`X-Adm-Remote: 1` is also on every response.)

## Phone page

`GET /mobile.html` (with `mobile.js`): an ordinary embedded file, so the same pairing and checks. `index.html`
redirects there (`location.replace`) when it runs remote (`window.ADM_REMOTE`) on a screen 640 px wide or less,
unless the URL has `?hall` (the page's "Full hall" link). It reads `settings_load`, `chronicle_days` and the
`roster` / `vigil` events. It probes whether actions are allowed with `POST /api/vigil` and an empty body `{}`
(403 when not allowed, else 400, never acting); only then does it show Arm / Cancel and answer permission
petitions. A tap on an Orca permission petition calls `peek_petition` and shows the question; Approve / Deny
(`answer_petition` with `yes` / `no`) appear only once the peek returns, and a failed peek shows its error and no
buttons. A tap on Approve / Deny reads the prompt again and answers only if its question is still the one shown;
otherwise nothing is sent and the row shows the new prompt with "The prompt changed". An OpenCode request gets Approve / Deny at once (no peek). The page never sends `always` and never answers a
question petition. A 403 on an answer hides the buttons; a 400 shows the error on the row. `ui/mobile.test.mjs`
checks these rules, and that the source writes no server text as HTML.

## Static files

`GET /<path>`: the app's embedded `ui/` files (Tauri asset resolver), with their mime type. Paths are
plain names only (`[A-Za-z0-9._-]` segments, no `..`, no leading dot, no `%` escapes, no `\`); anything
else is 404. Unknown names fall back to `index.html` (Tauri's resolver behaviour).

## Read endpoints (GET, cookie)

Same results as the Tauri commands of the same name. 200 + JSON on success; 400 +
`{"error": "<message>"}` when the command fails; 400 (text) when a required parameter is missing.
Query values are percent-decoded.

| Endpoint | Tauri equivalent |
|---|---|
| `GET /api/chronicle_day?day=YYYY-MM-DD` | `chronicle_day` -> `Event[]` |
| `GET /api/tithe_day?day=YYYY-MM-DD` | `tithe_day` -> `Tithe`, without `bySession` (per-session counts stay local; the roster carries `tokensToday`) and without the edited files' paths (`files`; the `moreFiles` count stays). A department's `maxTurnMs` is its longest finished turn that day (absent when 0, as in day files from 0.6.8 and before). Today's answer also has `window` (`{startMs, tokens, ceilings}`: the usage window's new tokens on this PC since `startMs`, null when no token came in 5 h or the window began before the buckets were complete, and this PC's share at each past limit hit, lowest first; computed, not saved, an estimate); `fine` holds the day's 288 five-minute token buckets, `fineSince` (only on a day file that predates them) when they became complete. Known limit: `window` comes only when `day` is the PC's own local today, so a remote client in another time zone asks with its own date near midnight and gets no window |
| `GET /api/chronicle_days` | `chronicle_days` -> `DaySummary[]` |
| `GET /api/honours` | `honours` -> `{commits, longest, fast, busiest}`, the Hall of Honours over the kept 7 days: each `{dept, value}` or null (`value`: a count for `commits` and `fast`, ms for `longest`; `busiest` also has `day`, `YYYY-MM-DD`, its `value` that day's working time in ms). Department names only, no paths |
| `GET /api/settings_load` | `settings_load` -> object (read only; there is no remote save) |
| `GET /api/peek_petition?handle=term_...` | `peek_petition` -> `{question, yes, always, no}` |

Not exposed: `open_session`, `settings_save`, `set_*`, `start_at_login`, the `remote_*` commands.

## Action endpoint (POST)

`POST /api/answer_petition`, body `{"handle": "term_...", "choice": "yes" | "always" | "no"}` for a Claude Code
prompt in an Orca terminal (same on-screen safety check as the Tauri command), or
`{"session": "ses_...", "request": "per_...", "choice": "yes" | "always" | "no"}` for an OpenCode permission
request (`answer_opencode`: only the request the session's card shows; yes / always / no reply once / always /
reject, and a reject also refuses that session's other pending requests). Required, in this order:

- remote actions allowed in settings, else 403;
- cookie (else 401), header `X-Adm: 1`, `Origin` equal to `http://<Host>`, and `Sec-Fetch-Site`
  absent or `same-origin`, else 403;
- `Content-Type: application/json`, else 415; `Content-Length` <= 1024, else 413; valid JSON with `choice` and
  either `handle` or both `session` and `request` (ids `ses_` / `per_` + 1 to 64 letters or digits), else 400.

Result: 200 `null`, or 400 `{"error": "..."}` (e.g. "no permission prompt on screen", "no permission request
pending").

```js
fetch('/api/answer_petition', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Adm': '1' },
  body: JSON.stringify({ handle, choice }) })
```

`POST /api/vigil`, body `{"arm": true | false}`: arms or cancels the Night Vigil. Same checks as
`/api/answer_petition` above. Result: 200 `null`.

```js
fetch('/api/vigil', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Adm': '1' },
  body: JSON.stringify({ arm: true }) })
```

## Live events: `GET /events` (SSE, cookie)

`Content-Type: text/event-stream`. Starts with `retry: 3000`. Each Tauri event becomes one named SSE
event whose `data` is the exact JSON payload the webview receives:

```
event: roster
data: [{"name":"...", ...}]

```

| SSE event | payload |
|---|---|
| `roster` | `Session[]`, every second |
| `petition` | `Session` (new petition) |
| `petition-stale` | `Session` |
| `question` | `Session` |
| `chronicle` | `Event` |
| `ui-command` | `"mute"` or `"light"` (tray) |

Comment lines (`: hb` every 15 s, `: hi` occasionally) are heartbeats; EventSource ignores them.
Each client has a 64-event buffer; a client that falls behind is disconnected (the server closes the
stream) and EventSource reconnects. The server also closes every stream on stop and on a token change.

```js
const es = new EventSource('/events');
es.addEventListener('roster', e => onRoster(JSON.parse(e.data)));
```

## Cost

Off: no socket, no thread; each emit costs one uncontended lock on an empty client list.
On with no clients: one thread blocked in `accept`, no timers, no wakeups. Per event stream: one
thread asleep between events, the event serialized once for all clients.
