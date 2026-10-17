# Mobile remote page (O4) and Suzerain lineage (O5)

**Goal:** a phone on the LAN gets a light, readable page instead of the full hall; a Suzerain's card shows its
lineage as a small tree with each child's state and the lineage's tokens spent today.

## Decision ledger (ratified 2026-10-17)

- **D1** A phone that opens the remote view (`/`, narrow screen) lands on the mobile page, which links to the
  full hall. Desktop browsers keep the hall.
- **D2** Lineage tokens = **today's real spend** (Chronicon Tithe), summed over parent + live children.
- **D3** The tree lives in the **card** (the existing kin lines grow into it). No new panel.
- **D4** The mobile page wears the **active world's palette** and the pixel font; plain list layout.
- **D5** Petitions are **read-only** on the mobile page, whatever the remote-actions setting. Only Night Vigil
  arm/cancel is offered, and only while remote actions are allowed (the server's existing gate).
- **D6** *(my call)* No server change for O4: the page is one more embedded `ui/` asset, served through the
  existing asset route, so it gets the existing peer check, Host check, pairing cookie and headers unchanged.
  Listening address and `allowed_peer` untouched.
- **D7** *(my call)* "Narrow" = `matchMedia('(max-width: 640px)')`. `/?hall` skips the redirect (the page's
  "Full hall" link), so a phone can still open the hall.
- **D8** *(my call)* Per-session tokens ride on the roster (`Session.tokensToday`), not a new endpoint: the card
  and the mobile page get them over the stream they already read.

## O5 — backend: tokens per session

- `chronicle::Tithe` gains `by_session: BTreeMap<String, u64>` (`#[serde(default)]`: old day files load).
  `add_tokens` adds each usage's total under the session id that produced it. Subagent and OpenCode-helper
  tokens count for their hall session (same rule as `by_project`). Demo usage counts under the demo session.
- The live Tithe resets at midnight (existing roll-over), so the map holds today's sessions only; it is never
  read for past days by the UI.
- Poll loop (main.rs, where `s.turn` is filled): `s.tokens_today = tithe.by_session.get(&s.id).copied()`.
  `Session.tokens_today: Option<u64>`, serialised `tokensToday`.

## O5 — card

- `kinOf` (card.js) unchanged. New pure helper `lineageOf(s, roster)` -> `{ root, children, tokens }`:
  `root` is the Suzerain (s itself, or s's live parent); `children` its live children; `tokens` the sum of
  `tokensToday` over root + children (missing counts 0). Immediate links only, as in the Suzerain design.
- Rendering, in `.kin`: on a Suzerain's card, one row per child: name button (selects it), its status word
  (the same `status.*` texts the card uses), its tokens today. Then "Lineage today: <n> tokens" (`kM` format).
  On a child's card: "Summoned by <parent>" as now, plus the same lineage total line.
  Labels through `t()` (TEXT in theme.js; themes inherit unless they override).
- Hall art unchanged.

## O4 — mobile page

- Files: `ui/mobile.html`, `ui/mobile.js` (DOM + wiring), `ui/mobile.test.mjs` for pure helpers kept in
  `ui/mobile.js`'s data part (or a tiny `ui/mobilemodel.js` if DOM imports make it untestable in node).
- Redirect: an inline script in `index.html`'s head (runs after the injected `/remote.js`):
  `ADM_REMOTE && narrow && !?hall` -> `location.replace('/mobile.html')`. The local app (no ADM_REMOTE) never
  redirects.
- Data, all existing remote endpoints through `bridge.js`:
  - `roster` and `vigil` events on `/events` (live, every second).
  - `chronicle_days` on load and every 60 s: today's tokens, busy time and event count in one call (built
    with this instead of `tithe_day` + `chronicle_day`).
  - `settings_load` once: `adm.theme`, applied with `setTheme` + `applyChrome`.
- Sections, top to bottom:
  1. Header: title, link "Full hall" (`/?hall`), reconnecting badge (bridge.js's existing one).
  2. **Petitions** (only when some): each waiting session's name, what it waits for (`waitingFor`), what it
     asks (`asks` or `question`), how long. Text only, no buttons, no `peek_petition` call.
  3. **Night Vigil**: armed or off, deadline / countdown. Arm or Cancel button only when `remoteActions()`
     says actions are allowed (probed on load and every 10 s at most, a 403 hides it).
  4. **Sessions**: one row per session, sorted waiting first, then busy, then the rest: name, department,
     status word, since, tokens today; Suzerain children indented under their parent.
  5. **Today**: tokens, working time, events (Chronicon totals).
- Every server string goes into the DOM by `textContent` only (no `innerHTML` with data).
- Not paired: bridge.js already reloads on 401, which shows the server's "scan the QR code" page.

## Security (O4)

- No new route, no new action, no change to auth, peer check, Host check, body limits or bind address.
- Read-only petitions: the page holds no call to `answer_petition` / `answer_opencode` (a test greps the
  file for it).
- Vigil: the existing `POST /api/vigil` behind `remote.actions`, `X-Adm`, same-origin and JSON checks.
- Review: the security agent reviews the whole diff before done.

## Testing

- Rust: `Tithe.by_session` filled per session (main + subagent count for the same id), an old Tithe without
  the field still loads, the roll-over clears it.
- UI node tests: `lineageOf` (Suzerain, child, orphan, missing tokens); mobile helpers (sort order, petitions
  list, totals format); no answer call in `mobile.js`.
- Manual: the mobile page in the browser pane at phone width against the demo or real app.

## Docs

`docs/remote-api.md` (mobile page, redirect), README remote section, `docs/DEVELOPMENT.md` module notes,
README card lines for the lineage.

## Out of scope

Past days' per-session tokens, a lineage overview panel, answering anything from the phone, push notifications.
