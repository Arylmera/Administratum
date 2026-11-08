# Phone answers (O1) — plan
Spec: docs/superpowers/specs/2026-11-08-phone-answers-design.md (the spec outranks this plan)

Start state (checked 2026-11-08): `ui/mobile.js` renders petitions as text inside a non-exported `start()`;
`ui/mobile.test.mjs:31` bans `answer_petition`, `answer_opencode`, `peek_petition`, `remoteActions` and the HTML
setters from its source. `answerable` / `answerCall` live in `ui/card.js:175-180`. Backend unchanged.

## Milestone 1 — answer from the phone

**S1 · Prefactor: share the answer rule.** Blocked by: none.
Move `answerable` and `answerCall` from `ui/card.js` to a new `ui/petition.js` (pure: no DOM, no imports); `card.js` re-imports them. Behaviour unchanged.
Check: `node ui/card.test.mjs && node ui/mobile.test.mjs` green.

**S2 · Pure petition-row logic in `mobile.js`.** Blocked by: S1.
Export from `mobile.js`:
- `rowKey(s)` = `${s.id}:${s.sinceMs}`.
- `rowState(s, { actions, peek })` → `{ buttons: boolean, text, error }`: buttons only when `actions &&
  answerable(s)` and, for an Orca prompt, the peek returned ok (OpenCode: no peek, buttons at once). Peek failed →
  `error` set, no buttons.
- `phoneAnswer(s, choice, invoke)`: `choice ∈ {'yes','no'}` only (throws on `'always'`), calls
  `invoke(...answerCall(s, choice))`.
Test (`ui/mobile.test.mjs`): actions off → no buttons; a question / "input needed" row → no buttons; Orca row before
peek → no buttons, after ok peek → buttons, after failed peek → error and no buttons; OpenCode row → buttons; a new
`sinceMs` is a new key; `phoneAnswer(s,'always')` throws; `'no'` on OpenCode sends `answer_opencode … choice:'no'`.
Replace the source ban with: `innerHTML` / `insertAdjacentHTML` / `outerHTML` still banned; `answer_*` and
`peek_petition` appear only via `answerCall` / one `peek_petition` call. Prove the gate: drop the `actions` check in
`rowState` → the test goes red.
Check: `node ui/mobile.test.mjs`.

**S3 · Wire the page.** Blocked by: S2.
In `start()`: one open row (`openKey`), kept across `roster` events while its key is listed, closed otherwise. Tap a
row → for Orca `invoke('peek_petition', {handle})`, store the result per key; render with `rowState`. Buttons
*Approve* / *Deny*, peek labels as subtitle, all text through `textContent`. On reply: 400 → row error, row closed;
`'remote actions disabled'` → `actions = false` (as the Vigil button), re-render. Styles in `ui/mobile.html`.
Check: `node ui/mobile.test.mjs`; then the real app: remote view on, actions on, phone width (built-in browser,
mobile preset) on `http://127.0.0.1:7770/mobile.html`, a real Orca permission prompt approved and one denied; actions
off → no buttons.

**S4 · Docs.** Blocked by: S3.
README *Remote view* (phone page answers prompts when actions are allowed; Always stays on the PC);
`docs/remote-api.md` *Phone page* (the read-only line and the test description); `mobile.js` header comment.
Check: `grep -n "read only" README.md docs/remote-api.md ui/mobile.js` shows no stale claim.

## Milestone check
`node ui/mobile.test.mjs && node ui/card.test.mjs` plus every `ui/*.test.mjs`, `cargo test` (unchanged backend,
sanity), then rebuild and silent-install the NSIS build (standing rule) and check on the phone.
