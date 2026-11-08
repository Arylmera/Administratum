# Phone answers: Approve / Deny from the phone page (O1)

**Goal.** Let a paired phone approve or deny a permission prompt while the PC allows remote actions, after it shows
the prompt.

**Size.** Small. The backend exists: `POST /api/answer_petition` (behind `action_gate`, `remote/mod.rs:209`) and
`GET /api/peek_petition` (cookie only, as for the full remote hall today; no server change). The work is in
`ui/mobile.js`, `ui/mobile.html` and their test.

## Builder-check answers

- **Which rows answer.** The card's `answerable` rule (`ui/card.js:175`): an Orca handle with an approve/permission
  `waitingFor`, or an OpenCode session with `opencodeRequest`. Every other waiting row ("input needed"…) stays text.
- **Row identity.** A petition is `id:sinceMs` (the card's `episode`, `card.js:192`): a new prompt in the same
  session closes the open row. The open row survives `roster` re-renders while its key is still listed.
- **Labels.** Fixed *Approve* / *Deny*; the peek's own yes/no labels show as the row's subtitle. OpenCode *Deny* =
  `no` (reject once), as on the card.
- **Peek fails** (**my call**, stricter than the card): the row shows the error and no buttons. The phone is remote,
  so it never answers a prompt it could not show.
- **Tests without a DOM library** (**my call**): split `mobile.js` into exported, injectable render / answer
  functions and test them with the hand stubs the other UI tests use (`ui/flathall.test.mjs:21`). No new
  dependency.

## Decision ledger

1. **Reverses a non-goal.** The 2026-10-17 mobile spec put "answering anything from the phone" out of scope, and
   `ui/mobile.test.mjs` bans the answer calls from `mobile.js`. This feature lifts that for permission prompts only.
2. **Gate.** The buttons exist only while *Allow remote actions* is on (the same probe the Vigil buttons use:
   `POST /api/vigil` with `{}`, 403 when off). A 403 on an answer hides the buttons again, like the Vigil does.
3. **Choices.** Approve and Deny only. *Always* grants a lasting permission and stays on the PC.
4. **Peek first.** A tap on a petition opens it. The page calls `peek_petition` (Orca prompts) and shows the
   question text; the buttons appear only once the peek returns. OpenCode requests show the request the roster
   carries (the same one the card shows) — no peek exists for them.
5. **Questions stay read only.** A `question` petition has no buttons and no text reply.
6. **Server checks unchanged.** The on-screen check in `orca::answer_petition` and the id checks in
   `remote::answer_call` stay the only authority; the page adds no trust.
7. **Text as text.** Server text (the peek's question) is set with `textContent`, never HTML; the ban on
   `innerHTML` / `insertAdjacentHTML` / `outerHTML` in the test stays.

## Design

- **Components.** `mobile.js`: a petition row becomes a button-like row; an open row shows the peek text, then
  *Approve* / *Deny*. One row open at a time.
- **Data flow.** tap → `GET /api/peek_petition?handle=…` → show text + buttons → tap *Approve* →
  `POST /api/answer_petition {handle, choice:"yes"}` (or `{session, request, choice}` for OpenCode) → the roster
  event removes the petition.
- **Failures.** A 400 (`no permission prompt on screen`, the prompt changed or was answered on the PC) shows the
  error text on the row and closes it. A 403 hides every answer button (actions turned off). The petition leaving
  the roster closes its open row.
- **Testing.** `ui/mobile.test.mjs`: the source ban becomes "the answer and peek calls are reached only behind the
  actions flag" (a DOM test with the flag off shows no buttons and makes no call; flag on: tap → peek → approve
  sends the right body). Also: a question petition never shows buttons; Always is never sent. Prove the gate:
  remove the flag check and the test must go red.
- **Docs.** README *Remote view* (the phone page is no longer read only for prompts), `docs/remote-api.md`
  *Phone page*.
