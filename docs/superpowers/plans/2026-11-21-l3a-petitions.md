# L3a: petitions (F6, F7, F15 scribes, F12 for card.js and app.js, the peek refusal)

**Goal:** a risky Approve shows that it is armed, the Approve / Deny targets are big enough and Always is away from
Approve, scribes can be reached by keyboard, `card.js` and `app.js` use the shared helpers, and a remote peek refused
by the PC says so.

## Items

1. **F6.** `overlay.js` `syncLabels`: an armed risky label gets class `armed` and its sub line reads `t('petition.armed')`
   (the key is added to `theme.js` `TEXT` by L3b in the same wave); the Approve button gets the same class. `isArmed`
   (card.js, `armStep`) goes false after `ARM_MS`, and the per-frame sync drops the class. Styled in `css/hall.css`
   (flame border, the existing `alarm` blink, off under reduced motion).
2. **F7.** `css/hall.css`: the label's Approve / Deny buttons get a 24 px minimum size (`--sp-24`) in a row, so the
   label grows wider instead of taller. `card.js` `renderAnswer` puts the card's buttons in the order Approve, Deny,
   Always (the markup in `index.html`, not ours, has Always in the middle).
3. **F15 scribes.** `overlay.js` `syncScribeKeys` (called each frame by `app.js` beside `syncLabels`): one transparent
   `button.scribe-key` per live scribe without a petition label (that one has its own button), placed over the scribe,
   `aria-label` = name, status. Order: petitioners first, then by name. A click (Enter / Space on a native button)
   calls `pick`. The ring is the shared `:focus-visible` rule.
4. **F12.** `card.js` drops its `ago` and `statusOf` for `format.js`'s; `overlay.js` imports `ago` from there too;
   `app.js` drops its `hhmm` for `hhmmLocale`. Neither file had its own `el`.
5. **Peek refusal.** `bridge.js`: a 403 on `peek_petition` rejects with `remote actions disabled`. `card.js` `peek`
   turns that into the actions-off state, so the card shows the "Remote actions are disabled on the PC" note and no
   answer buttons.

## Tests

`overlay.test.mjs` (armed class and text, cleared after the window with the fake clock; each scribe has a focusable
button, a click on it opens the card, a petitioner has none of its own), `card.test.mjs` (Always is not next to Approve
in DOM order), `bridge.test.mjs` (new: a 403 peek rejects with the sentence; the card then shows the note and no
buttons). The look and the 24 px targets are a manual check in `tools/preview.html?orca=1&n=12` at scale 1 and 2.
