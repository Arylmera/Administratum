# L4a: Settings > Status, F5 errors, F18 UI, the I6 switch

Lane L4a of wave W4. UI only; no change under `src-tauri/`.

## Items

1. **F3 UI.** A Status category (`index.html` tab and section, `settings.js` `initStatus`): every `integration_status`
   entry as name, a mark plus the state's word, the message and `ago`; read when the tab or panel opens and every 4 s
   while the panel is open; an empty list says so. Host only.
2. **F5.** A refused `settings_save` shows on `.save-err` until the next good save. `remote_status` failing keeps the
   remote category and shows the error; `saved`, `loopback` and `error` show on `.rv-state`. Chronicon: a rejected
   `chronicle_day` / `tithe_day` shows `log.error`, not the empty day.
3. **F18.** `update-progress` on the update line (percent, else bytes); a *Send a test notification* button.
4. **I6.** The `adm.ci` switch (in `MONITOR`) and the `gh` line, read from the `gh` entry of `integration_status`.
5. **Text keys.** `ci.*`, `event.ci-pass` / `event.ci-fail` (with icons), `log.error`, `prefs.*` in `theme.js`; five worlds
   reword the CI events and the Status tab.
6. **Layout (coordinator's addition).** `panels.css`: a select never truncates; a label keeps its longest word clear of
   its field.
7. **Docs.** README Settings, `docs/DEVELOPMENT.md`, `docs/theme-packs.md`.

## Tests

`settings.test.mjs` (status rows, error mark, empty, refresh; the `adm.ci` switch and gh line; save error; remote states;
update progress; test notification), `chronicon.test.mjs` (error state, CI kinds), `theme.test.mjs` (ci placeholders,
keys asked for by `settings.js`), `css.test.mjs` (select and label rules).
