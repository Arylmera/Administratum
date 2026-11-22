# L4b: the card's open errors and the CI line, the lamp's tip and click

Items (joint spec F5 card part, I6 section 5):

1. **F5.** A failed open from the card (Open in Orca, Open on claude.ai / in Claude, the terminal a pick opens) shows its
   error on the card, in a line styled `#card .open-err` (the `--wax` token, as `.err`). Cleared on the next action or pick.
   `card.js`: `showOpenErr(id, err)` selects the card and renders it, `clearOpenErr()` runs at the start of each action and
   in `select`. The links close the card on click (`closeCard`), so a failure reopens it on the same session.
2. **I6 card line.** `card.js` `ciLine(ci)` (empty for null / `none`, else `t('ci.<state>', { branch, sha, done, total,
   check })`; lane L4a adds the keys) and `renderCi`: one `button.ci-line` (title `ci.open`) that calls `ci_open` with the
   session id and shows a rejection like item 1. The remote view gets the line as plain text (no command there).
3. **Lamp tip and click.** `overlay.js`: `lampHit` (pure geometry over `layout.js` `lampSpots` and the lit lamps of
   `cilamp.js`), `lampTip` (the same line, the lamp joined to its session's `ci` for done / total), `openLamp(dept)`
   (`ci_open` with the department; a failure shows in the tip for 5 s), `syncLampKeys` (one focusable button per lit lamp),
   and `syncHover` shows the tip on a lamp when no character is under the pointer. `app.js`: `lampAt(e)` (canvas
   coordinates through `at`, so flat and 39 degrees alike) passed to `initOverlay`, the canvas click, the strip's
   click-through rects.

Lit = running, pass, fail (the unlit frame has no tip and no key).

Files: `ui/card.js`, `ui/overlay.js`, `ui/app.js`, `ui/css/hall.css`, `ui/card.test.mjs`, `ui/overlay.test.mjs`,
`docs/DEVELOPMENT.md`.

Tests: `card.test.mjs` (the line per state, the click, no line for null / none, a rejected open on the card);
`overlay.test.mjs` (tip text, click with the department, nothing for an unlit lamp, the keys).
