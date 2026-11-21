# L2a: CSS foundation (F9 to F13)

**Goal:** the styles leave `ui/index.html` and `ui/mobile.html` for `ui/css/*.css`, then gain tokens, one focus ring,
an emphasis token, one `.panel` shell, contrast checks, and two helper modules the later lanes move onto.

## Steps (one commit each, the move first so a look regression bisects)

1. **The move, no visual change.** `ui/css/base.css` (font faces, `:root` chrome colours, the page-wide button focus
   rule), `hall.css` (header, plaques, labels, tags, card, edge arrows, tip, tithe plaque, strip rules, the closing
   media rules), `panels.css` (Chronicon, Settings), `mobile.css` (the phone page, self-contained). Plain `<link>` tags
   in the old order. Font URLs become `../fonts/`. Rules keep their relative order wherever two rules can both match.
   The remote view serves `css/base.css` through `remote/mod.rs` `asset_path` (plain segments) and the embedded asset
   resolver's mime (read, not edited).
2. **F9 tokens.** `--sp-*`, `--fs-*`, `--r-*`, `--z-*` in `base.css` `:root`, built from the values in use; the four
   files use them. `ui/css.test.mjs` fails on a raw length for padding, margin, gap, font-size, border-radius, z-index
   outside the token block (exceptions documented in the test).
3. **F10.** `--focus` (chrome) and `--focus-paper` (parchment, bound to `--focus` inside the panels and `#card`): one
   `:focus-visible` rule set; shared `:disabled` and `:active`. `theme.test.mjs`: every surface, at least 3:1, every theme.
4. **F11.** `--em` and a `.em` class (colour, letter-spacing, underline) replace bold and italic.
5. **F12.** One `.panel` shell rule set; `ui/dom.js` (`el`), `ui/format.js` (`ago`, `hhmm`, `hhmmLocale`, `statusOf`) with
   tests. No caller is edited (decision D3).
6. **F13.** `theme.test.mjs`: `--paper-ink-2`, the focus pairs, `--chart-*`, the phone's `--dim`. `--chart-*` tokens for
   the colours `chronicon.js` `PAL` draws; a fixture with a low pair turns the check red.
7. **Packs and docs.** An old pack without the new keys loads (the defaults live in `base.css` `:root`);
   `docs/theme-packs.md` lists the keys; `docs/DEVELOPMENT.md` UI rows.

## Tests

`css.test.mjs`, `dom.test.mjs`, `format.test.mjs` (new), `theme.test.mjs`, `themepack.test.mjs` extended.
The look is a manual check after the merge (three themes and the phone page).
