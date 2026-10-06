# Three New Worlds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three full-depth worlds to Administratum: Orbital Station (`orbital`), Arcane Tower (`tower`) and
Vault 111 (`vault`), each with its palette, chrome, wording and its own redrawn art, as Neon Grid (`cyber`) did.

**Architecture:** No engine change. A world is an entry in `WORLDS` (`ui/theme.js`), a `defineTheme` in
`ui/themes.js`, and art sheets in `ui/art/<theme>/<family>.png` + `.json` that hold only the frames the theme
redraws, at the default's size. `ui/sprites.js` loads a theme's art from its `art` list automatically.

**Tech Stack:** Vanilla ES modules, node test scripts (`node ui/*.test.mjs`), PNG sheets written with
`tools/sheet_writer.mjs` (`writeSheet`), Tauri for the installed build.

**Spec:** `docs/superpowers/specs/2026-10-06-three-worlds-design.md` (the per-world mappings live there; every art
task names its section).

## Global Constraints

- Theme ids / world ids / names exactly: `orbital` in world `space` ("Space"), name `Orbital Station`;
  `tower` in world `arcane` ("Fantasy"), name `Arcane Tower`; `vault` in world `vault` ("Fallout"), name `Vault 111`.
- Every art frame keeps the default frame's exact width and height (`ui/art.test.mjs` enforces it).
- Draw only with chars from `ui/art/key.gpl`; `.` is transparent. Never edit `key.gpl`.
- Anchors in a theme JSON: only names that exist in the default family's JSON; copy the default's `meta.tiles`
  unchanged for room families.
- Rank colours come from slots `t T z j J I` (scribe/adept), robe `r R d`, department colour `y`, skin `:` `;`.
  Never hard-code rank or department into fixed colours.
- Characters are drawn from scratch, not recoloured 40k shapes. Nothing 40k (skulls, cogs-with-skull, aquila,
  gothic spires, purity seals) may remain in a family the theme redraws.
- UI text in English. Code comments match the surrounding style (short, plain).
- Never use `ANTHROPIC_API_KEY`. On Windows, run Python with `PYTHONUTF8=1`.
- One commit per task, pushed immediately (`git push`). Commit subject style of the repo:
  `Orbital Station: <what>` / `Arcane Tower: <what>` / `Vault 111: <what>`. Commit via a bash here-doc
  (`git commit -F - <<'EOF'`), no backticks in `-m`. End every commit message with
  `Claude-Session: https://claude.ai/code/session_019A9MhDCtjvGB5sADmrk47Z`.

## Shared recipe: drawing an art family (used by every art task)

1. **Read the default.** Print each default frame of the family as text rows with its size and anchors:
   ```bash
   node -e "import('./ui/sprites.js').then(({ART})=>{const s=ART.base['walls'];for(const[n,f]of Object.entries(s.frames))console.log(n,f[0].length+'x'+f.length,'\n'+f.join('\n'));console.log(JSON.stringify(s.anchors))})"
   ```
   Also read `ui/art/<family>.json` (anchors, `meta.tiles`), and look at the Neon Grid redraw of the same family
   for the level of detail expected: same command with `ART.themed.cyber['walls']`.
   Anchors tell you where the code draws effects on top (screens, lamps, seals, feet, arm pivot): keep those
   features at those coordinates, or move the anchor (same name) to where you draw them.
2. **Write a generator script** in the session scratchpad
   (`C:/Users/guill/AppData/Local/Temp/claude/C--Users-guill-Documents-git-Administratum/a8fa0f08-e275-4b0c-8967-194c1980bfa5/scratchpad/draw/<theme>-<family>.mjs`),
   holding the frames as arrays of strings, and write the sheet:
   ```js
   import { writeSheet } from 'file:///C:/Users/guill/Documents/git/Administratum/tools/sheet_writer.mjs';
   const frames = {
     WINDOW: [
       '....kkkk....',
       // ... one string per row, exactly the default's width, exactly the default's row count
     ],
   };
   const rows = [['WINDOW', 'BANNER', 'SHELF', 'GAUGE', 'CENSER']]; // sheet layout, any grouping
   const anchors = {}; // only what you moved, copied names from ui/art/walls.json meta.anchors
   console.log(writeSheet('orbital/walls', frames, rows, { app: 'orbital theme art', anchors }));
   ```
   Run it with `node <script>`. It throws on a char that is not in the key.
   For characters (`scribe`, `adept`): draw `down 0..2`, `up 0..2`, `right 0..2` (left is mirrored at load);
   walk frames 1 and 2 change only the leg/feet rows. `scribe` also has `arm` (the right arm at the desk;
   the left is mirrored), and its anchors `arm`, `armL`.
3. **Register** the family: append its name to the theme's `art: [...]` in `ui/themes.js` and extend that line's
   trailing comment with what was drawn (as the `cyber` line does).
4. **Test:** `node ui/art.test.mjs && node ui/sprites.test.mjs && node ui/theme.test.mjs` all print their `ok`.
5. **Look at it:** regenerate the gallery `node tools/sprite_sheet.mjs --theme <id>`, then open the PNGs it wrote in
   `docs/sprites/<id>/` for this family with the Read tool (they are images) and check them against the spec
   section. Fix and redo until the drawing reads clearly at 1× as what the spec says. Report what each frame shows.
6. **Commit and push** `ui/art/<id>/<family>.*`, `ui/themes.js`, `docs/sprites/<id>*`.

---

## World 1: Orbital Station (`orbital`)

### Task 1: Orbital Station theme entry

**Files:**
- Modify: `ui/theme.js:138` (`WORLDS`)
- Modify: `ui/themes.js` (append a `defineTheme` after `cyber`)
- Modify: `ui/theme.test.mjs:71` (shipped theme ids)
- Modify: `README.md:150,336,348` and `CLAUDE.md` (theme list and viewer column key)

**Interfaces:**
- Produces: theme `orbital` with `art: []`, which later tasks append to.

- [ ] **Step 1: Update the failing test.** In `ui/theme.test.mjs:71` the expected list becomes
  `['contrast', 'cyber', 'forge', 'night', 'orbital', 'tier2', 'xenos']`.
- [ ] **Step 2: Run** `node ui/theme.test.mjs`. Expected: FAIL (assert deepEqual on the theme ids).
- [ ] **Step 3: Add the world.** `ui/theme.js:138`:
  ```js
  export const WORLDS = { w40k: 'Warhammer 40k', cyber: 'Cyberpunk', space: 'Space' };
  ```
- [ ] **Step 4: Add the theme** at the end of `ui/themes.js`, with the same parts and the same keys as the `cyber`
  entry (`px` with every slot `cyber` sets, `sash` 8 colours, `rank.high`/`rank.novice` with `robe` and `adept`,
  `ink` every key `cyber` sets, `light` every key, `ui` every key, `text` every key), coloured per the spec's
  "Orbital Station" palette:
  - hull panels off-white `#d8dce2` / light grey `#a8aeb8`, padding dark grey `#3a3e46`, outline `#0c0e14`
  - accents safety orange `#ff7a1a` and blue `#2a5ab8`; screens cyan `#5ad8ff` on `#08202c`
  - space through the windows `#050814`, Earth blue `#2a6ad8` / green `#3a8a4a`, warm white lights `#fff0d0`
  - flight suit (robe `r R d`) blue `#2a4a8a` / `#3a62b0` / `#16284e`; skin `:` `#e0a888`, `;` `#9a6450`
  - rank: high gold `#ffc83a` trims, standard orange, novice grey (same structure as `cyber.rank`)
  - `--display`: `"'VT323', monospace"`; `ui` keys: a dark navy chrome, white-grey card instead of dark glass
  - `text` (keys exactly as `cyber.text`):
    ```js
    text: {
      subtitle: 'Low Earth Orbit · Station Deck', motto: 'Ad astra',
      rank: { high: 'Commander', standard: 'Astronaut', novice: 'Cadet' },
      status: { busy: 'Working', shell: 'At the airlock', idle: 'Turn done, awaiting input', waiting: 'Calling the Commander',
        background: 'Idle · bot on task', napping: 'Idle · asleep in the bunk' },
      petitions: ['{n} call', '{n} calls'], petitioning: '{n} calling', petitionLabel: '{name}, call: {want}',
      adeptOf: '{kind} · bot of {owner}', overflow: '+{n} in the hab module', empty: 'No crew aboard',
      modes: { full: 'Cabin lights', candles: 'Night cycle' },
      log: { title: 'Flight log', open: 'Open the flight log', close: 'Close the flight log', silent: 'The flight log is empty: no record could be read for this day.' },
      tithe: { hint: 'Telemetry today: tokens and mission time', day: 'Telemetry today: {tokens} tokens, {time} of mission time' },
      event: { commit: 'Commit uplinked', petition: 'Call', 'petition-answered': 'Call answered', compaction: 'Memory purged' },
      prefs: { chime: 'Call chime', petitions: 'Calls', questions: 'A question at the end of a turn counts as a call',
        stale: 'Call goes stale after', nap: 'Idle to the bunk after', cog: 'Stay at the airlock for',
        pauseHint: 'Near-zero CPU when unseen; calls still alert.',
        cat: { hall: 'Deck', petitions: 'Calls', scribes: 'Crew', system: 'System', remote: 'Remote access' } },
      toast: { petition: 'Call from {name}', stale: 'Call still waiting: {name}' },
    },
    ```
  Head the entry with a 2-line comment like the `cyber` one, and `art: [], // ui/art/orbital/: ` (empty for now).
- [ ] **Step 5: Run** `node ui/theme.test.mjs && node ui/art.test.mjs && node ui/sprites.test.mjs`. Expected: all `ok`.
- [ ] **Step 6: Docs.** README line 150: add `Orbital Station` to the theme list. README line 336: mention the new
  worlds with their art folders. README line 348 and `CLAUDE.md` cell key: append `G Orbital Station`
  (check the real column letter with `node tools/sprite_sheet.mjs --list | head`).
- [ ] **Step 7: Gallery** `node tools/sprite_sheet.mjs --theme orbital`; read 3 of the PNGs to check the palette reads
  as a white station (not 40k reds).
- [ ] **Step 8: Commit and push**: `Orbital Station: a space station theme (palette, chrome, wording)`.

### Task 2: Orbital Station characters (`scribe`, `adept`)

Spec: "Orbital Station" → Scribe, Adept. Follow the shared recipe for families `scribe` then `adept`.
- Scribe: astronaut in a flight suit, mission patch on the chest in `y`, rank trim on shoulder/collar in `t`/`T`,
  headset with mic, face `:`/`;` visible (no helmet), boots; `arm`: suit sleeve with a glove.
- Adept: a small floating sphere robot, single eye light in `J`/`I`, a hover glow under it; walk frames bob 1 px.
- [ ] Draw `scribe` (10 frames), register, test, gallery, look.
- [ ] Draw `adept` (9 frames), register, test, gallery, look.
- [ ] Commit and push: `Orbital Station: astronaut crew and floating helper bots`.

### Task 3: Orbital Station `magos`, `sanctum`

Spec: Magos, Sanctum. Magos `body` = the Commander in a command chair, striped flight suit; `arm` = a robotic arm
(segmented, clamp at the end) swinging from the same pivot anchor. Sanctum: `THRONE` command chair, `LORD_DESK`
command console with screens and switches, `COG_MECH` round mission-patch emblem with a rocket/orbit, `SEAL` a patch.
- [ ] Draw `magos`, register, test, gallery, look.
- [ ] Draw `sanctum`, register, test, gallery, look.
- [ ] Commit and push: `Orbital Station: the Commander, command chair and mission emblem`.

### Task 4: Orbital Station `workstations`, `cogitator`

Spec: Workstations, Cogitator. `DESK` console with two screens and a joystick, `LECTERN` wall terminal, `CONSOLE`
laptop on a strap-down arm; screens stay where the `screen` anchors are (code animates them). `COGITATOR` curved
screen wall with an orbit trace and Earth, telemetry side panels, keeping its screen/lamp/reel/vent anchors.
- [ ] Draw `workstations`, register, test, gallery, look.
- [ ] Draw `cogitator`, register, test, gallery, look.
- [ ] Commit and push: `Orbital Station: flight consoles and the orbit screen wall`.

### Task 5: Orbital Station `walls`, `skull`, `gate`, `fire`

Spec: Walls, Skull, Gate, Fire. `WINDOW` porthole (the theme's `ink.windowDay`/`windowNight` overrides colour
it: Earth limb by day, stars by night; set them in `ui/themes.js` if the default ink does not read right),
`BANNER` mission poster, `SHELF` stowage net with bags, `GAUGE` pressure gauge, `CENSER` hanging LED lamp;
`SKULL` floating camera drone (lens at the `centre` anchor, `searchlight` kept); `GATE` round airlock hatch frame with
hazard stripes, `GATE_L`/`GATE_R` hatch halves, `GATE_VOID` starfield; `BRAZIER` air scrubber unit, `CANDLES` light strip.
- [ ] Draw `walls`, `skull`, `gate`, `fire` (one at a time, test + look after each).
- [ ] Commit and push: `Orbital Station: portholes, camera drone, airlock and scrubbers`.

### Task 6: Orbital Station `clutter`, `petitions`, `commits`, `refectorium`

Spec: Clutter, Petitions, Commits, Refectorium. `PAPER_STACK` velcroed checklists, `SCROLL_PILE` cargo bags,
`BOOKS` manuals, `LOOSE_A`/`LOOSE_B` floating pages, `CRATE` cargo container; `SCROLL` checklist card, `QSCROLL` the
same with a `?`, `SCROLL_HELD` a clipboard; `COMMIT_SEAL` mission sticker, `COMMIT_TAG` blank flight tag,
`COMMIT_STAMP` scanner; `RECAFF` food warmer / drink dispenser, `TABLE` galley table, `BENCH` galley bench with foot loops.
- [ ] Draw the four families (test + look after each).
- [ ] Commit and push: `Orbital Station: cargo, checklists, mission stickers and the galley`.

### Task 7: Orbital Station room tiles, then ship the world

Spec: Room. `room-floor`: `floor` grid deck plates, `channel h/v` floor light strips, `sanctum floor` command deck
(nine-slice, keep `edge`), `sanctum passage`, `sill`. `room-walls`: padded white panels with handrails for `wall`,
`wall east`, `wall sanctum` (+ their `top`), `wall foot`, `wall dark`, `wall base`, `sanctum base`, `pillar`,
`pilaster`, `beacon off/on/cage` a rotating warning light. `room-doors`: sliding module hatches (open/closed for
sanctum and refectory, `door` anchors kept). `room-pipes`: cable trays and air ducts (`pipe h/v`, `fitting h/v/wide`).
Repeating tiles must tile seamlessly: check a gallery image of the tile and its neighbour edges.
- [ ] Draw the four room families (test + look after each).
- [ ] Look at the whole world: serve the repo (`python -m http.server 8123` if the port is free) and screenshot the
  Orbital Station column in `tools/sprites.html`; no frame should still read as 40k.
- [ ] Commit and push: `Orbital Station: deck plates, padded walls, module hatches and ducts`.
- [ ] Rebuild and reinstall: `cd src-tauri && cargo tauri build`, quit the running Administratum, run
  `target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe /S`, relaunch from the Start menu. (Coordinator does
  this, not the subagent.)

---

## World 2: Arcane Tower (`tower`)

### Task 8: Arcane Tower theme entry

**Files:** `ui/theme.js:138`, `ui/themes.js` (append), `ui/theme.test.mjs:71`, `README.md`, `CLAUDE.md`.

- [ ] **Step 1:** test list becomes `['contrast', 'cyber', 'forge', 'night', 'orbital', 'tier2', 'tower', 'xenos']`;
  run `node ui/theme.test.mjs`, expect FAIL.
- [ ] **Step 2:** `WORLDS` gains `arcane: 'Fantasy'`.
- [ ] **Step 3:** `defineTheme({ id: 'tower', world: 'arcane', name: 'Arcane Tower', art: [], ... })` with every part and
  key `cyber` sets, coloured per the spec's "Arcane Tower" palette:
  - stone night-blue `#2a3048` / `#1a1e30` / lit `#3e4664`, outline `#0a0a12`
  - wood `#6a4428` / `#3e2614` / lit `#8a5e38`, gold `#d8a83a` / `#8a6418` / lit `#ffd870`
  - arcane violet `#9a5aff` and teal `#3ad8c8` glows, candle `#ffb050` / core `#fff0b0`, parchment `#e0d0a0`
  - robe (`r R d`) deep violet `#3a2a6a` / `#5a46a0` / `#1e1438`; skin `:` `#e8b890`, `;` `#a06a50`
  - rank: high gold stars, standard silver, novice plain brown
  - `--display`: `"'Pirata One', 'VT323', monospace"`; chrome: dark stone, parchment cards (`--paper` light)
  - `text`:
    ```js
    text: {
      subtitle: 'The Tower · Hall of Apprentices', motto: 'Knowledge is power',
      rank: { high: 'Archmage', standard: 'Wizard', novice: 'Apprentice' },
      status: { busy: 'Scribing spells', shell: 'At the scrying orb', idle: 'Turn done, awaiting input', waiting: 'Pleading to the Archmage',
        background: 'Idle · familiar at work', napping: 'Idle · dozing by the fire' },
      petitions: ['{n} plea', '{n} pleas'], petitioning: '{n} pleading', petitionLabel: '{name}, plea: {want}',
      adeptOf: '{kind} · familiar of {owner}', overflow: '+{n} in the library', empty: 'No apprentices at work',
      modes: { full: 'Daylight', candles: 'Candlelight' },
      log: { title: 'Grimoire', open: 'Open the Grimoire', close: 'Close the Grimoire', silent: 'The Grimoire is blank: no record could be read for this day.' },
      tithe: { hint: 'Mana spent today: tokens and time', day: 'Mana spent today: {tokens} tokens, {time} of study' },
      event: { commit: 'Spell sealed', petition: 'Plea', 'petition-answered': 'Plea answered', compaction: 'Memory distilled' },
      prefs: { chime: 'Plea chime', petitions: 'Pleas', questions: 'A question at the end of a turn counts as a plea',
        stale: 'Plea goes stale after', nap: 'Idle to the fireside after', cog: 'Stay at the scrying orb for',
        pauseHint: 'Near-zero CPU when unseen; pleas still alert.',
        cat: { hall: 'Hall', petitions: 'Pleas', scribes: 'Apprentices', system: 'System', remote: 'Remote access' } },
      toast: { petition: 'Plea from {name}', stale: 'Plea still waiting: {name}' },
    },
    ```
- [ ] **Step 4:** run the three tests, expect `ok`. Docs: README theme list, worlds sentence, cell key letter `H`
  (check with `--list`), CLAUDE.md cell key.
- [ ] **Step 5:** gallery `--theme tower`, look at 3 PNGs. Commit and push:
  `Arcane Tower: a wizards' tower theme (palette, chrome, wording)`.

### Task 9: Arcane Tower characters (`scribe`, `adept`)

Spec: "Arcane Tower" → Scribe, Adept. Scribe: apprentice in a hooded robe (`r R d`), pointed hood, stole in `y`,
embroidered stars in `t`/`T`, face `:`/`;`; `arm`: wide sleeve with a hand holding a quill. Adept: a familiar — a
floating will-o'-wisp with an owl-like face, glow in `J`/`I`; frames bob.
- [ ] Draw `scribe`, then `adept` (register, test, gallery, look after each).
- [ ] Commit and push: `Arcane Tower: hooded apprentices and wisp familiars`.

### Task 10: Arcane Tower `magos`, `sanctum`

Magos `body` the Archmage: long white beard, pointed hat, star robe, on a carved seat; `arm` the arm with a staff
(crystal at its tip). Sanctum: `THRONE` carved high seat, `LORD_DESK` spellbook lectern with an open book,
`COG_MECH` arcane sigil circle, `SEAL` rune seal.
- [ ] Draw `magos`, `sanctum`. Commit and push: `Arcane Tower: the Archmage, high seat and sigil`.

### Task 11: Arcane Tower `workstations`, `cogitator`

`DESK` writing desk with spellbook, quill and potion (the `screen` anchor becomes the glowing book page),
`LECTERN` book lectern, `CONSOLE` crystal on a stand; `COGITATOR` orrery / crystal-ball wall: brass armillary, scrying
mirrors at the screen anchors, glowing runes.
- [ ] Draw both. Commit and push: `Arcane Tower: writing desks and the orrery`.

### Task 12: Arcane Tower `walls`, `skull`, `gate`, `fire`

`WINDOW` arched window (day sky, night moon and stars; adjust `ink.windowDay/windowNight`), `BANNER` heraldic
tapestry, `SHELF` potions and books, `GAUGE` hourglass, `CENSER` hanging lantern; `SKULL` floating eye; `GATE` great
runic stone arch, `GATE_L/R` heavy wooden door leaves, `GATE_VOID` swirling portal; `BRAZIER` cauldron over a fire,
`CANDLES` candles (a tower setting may keep the shape of the default candles but redrawn in its style).
- [ ] Draw the four. Commit and push: `Arcane Tower: arched windows, the eye, the runic door, cauldrons`.

### Task 13: Arcane Tower `clutter`, `petitions`, `commits`, `refectorium`

`PAPER_STACK` grimoire pile, `SCROLL_PILE` scrolls, `BOOKS` books, `LOOSE_A/B` rune pages, `CRATE` a chest;
`SCROLL` letter scroll with a ribbon, `QSCROLL` with a `?`, `SCROLL_HELD` an open scroll; `COMMIT_SEAL` wax rune seal,
`COMMIT_TAG` bookmark ribbon, `COMMIT_STAMP` signet ring; `RECAFF` kettle on a stove, `TABLE` and `BENCH` wood.
- [ ] Draw the four. Commit and push: `Arcane Tower: grimoires, sealed letters, signets and the kitchen`.

### Task 14: Arcane Tower room tiles, then ship the world

`room-floor` flagstones, rune-line channels, a mosaic sanctum floor; `room-walls` stone masonry, a magic crystal
beacon; `room-doors` arched wooden doors; `room-pipes` wooden beams with iron brackets.
- [ ] Draw the four (seamless tiling checked). Whole-world look in `tools/sprites.html`.
- [ ] Commit and push: `Arcane Tower: flagstones, masonry, arched doors and beams`.
- [ ] Coordinator: rebuild and reinstall the NSIS build (as in Task 7).

---

## World 3: Vault 111 (`vault`)

### Task 15: Vault 111 theme entry

**Files:** `ui/theme.js:138`, `ui/themes.js` (append), `ui/theme.test.mjs:71`, `README.md`, `CLAUDE.md`.

- [ ] **Step 1:** test list becomes
  `['contrast', 'cyber', 'forge', 'night', 'orbital', 'tier2', 'tower', 'vault', 'xenos']`; run, expect FAIL.
- [ ] **Step 2:** `WORLDS` gains `vault: 'Fallout'`.
- [ ] **Step 3:** `defineTheme({ id: 'vault', world: 'vault', name: 'Vault 111', art: [], ... })`, every part and
  key `cyber` sets, coloured per the spec's "Vault 111" palette:
  - Vault-Tec blue `#1e4a8a` / `#12305e` / lit `#2e66b8`, yellow `#f2c23a` / `#a07a14` / lit `#ffe07a`
  - steel `#6a7078` / `#3a3e44` / lit `#9aa0a8`, concrete `#5a5a54`, rust `#8a4a24`, outline `#0c0c0c`
  - Pip-Boy green `#5aff7a` on `#0a2a12`, Nuka-Cola red `#d8202a`, incandescent `#ffd890`
  - jumpsuit (`r R d`) the blue, stripe and rank trims the yellow; skin `:` `#e0a888`, `;` `#9a6450`
  - rank: high (Overseer) grey suit trims, standard yellow, novice faded
  - `--display`: `"'VT323', monospace"`; chrome: dark blue bar, green terminal accents, cream cards
  - `text`:
    ```js
    text: {
      subtitle: "Vault 111 · Overseer's Office", motto: 'Prepare for the future',
      rank: { high: 'Overseer', standard: 'Dweller', novice: 'Newcomer' },
      status: { busy: 'On shift', shell: 'At the mainframe', idle: 'Turn done, awaiting input', waiting: 'Requisition filed',
        background: 'Idle · robot on duty', napping: 'Idle · in the bunk' },
      petitions: ['{n} requisition', '{n} requisitions'], petitioning: '{n} requisitioning', petitionLabel: '{name}, requisition: {want}',
      adeptOf: '{kind} · robot of {owner}', overflow: '+{n} in cryo', empty: 'No dwellers on shift',
      modes: { full: 'Day shift', candles: 'Lights out' },
      log: { title: "Overseer's log", open: "Open the Overseer's log", close: "Close the Overseer's log", silent: "The Overseer's log is empty: no record could be read for this day." },
      tithe: { hint: 'Rations today: tokens and shift time', day: 'Rations today: {tokens} tokens, {time} on shift' },
      event: { commit: 'Commit approved', petition: 'Requisition', 'petition-answered': 'Requisition approved', compaction: 'Records archived' },
      prefs: { chime: 'Requisition chime', petitions: 'Requisitions', questions: 'A question at the end of a turn counts as a requisition',
        stale: 'Requisition goes stale after', nap: 'Idle to the bunk after', cog: 'Stay at the mainframe for',
        pauseHint: 'Near-zero CPU when unseen; requisitions still alert.',
        cat: { hall: 'Vault', petitions: 'Requisitions', scribes: 'Dwellers', system: 'System', remote: 'Remote access' } },
      toast: { petition: 'Requisition from {name}', stale: 'Requisition still waiting: {name}' },
    },
    ```
- [ ] **Step 4:** tests `ok`; README theme list, worlds sentence, cell key letter `I`, CLAUDE.md cell key.
- [ ] **Step 5:** gallery `--theme vault`, look at 3 PNGs. Commit and push:
  `Vault 111: a Fallout vault theme (palette, chrome, wording)`.

### Task 16: Vault 111 characters (`scribe`, `adept`)

Scribe: Vault Dweller, blue jumpsuit (`r R d`) with the yellow stripe down the front and the collar, `111` in yellow
on the back (up frames), Pip-Boy on the left wrist with its screen in `t`, belt in `y`, face `:`/`;`, short hair;
`arm`: blue sleeve, glove, Pip-Boy visible. Adept: Mr. Handy-style robot — round body, three eye stalks (eyes in
`J`/`I`), a thruster flame under it; frames bob.
- [ ] Draw `scribe`, `adept`. Commit and push: `Vault 111: vault dwellers and Mr. Handy robots`.

### Task 17: Vault 111 `magos`, `sanctum`

Magos `body` the Overseer: grey suit over the jumpsuit, slick hair, at the desk; `arm` holding a clipboard.
Sanctum: `THRONE` the Overseer's chair, `LORD_DESK` the Overseer's terminal desk, `COG_MECH` the Vault-Tec gear
logo with `111`, `SEAL` a Vault Boy-style thumbs-up badge.
- [ ] Draw both. Commit and push: `Vault 111: the Overseer, his desk and the vault emblem`.

### Task 18: Vault 111 `workstations`, `cogitator`

`DESK` RobCo-style green terminal desk, `LECTERN` wall terminal, `CONSOLE` Pip-Boy dock; `COGITATOR` the vault
mainframe: tape reels at the reel anchors, a big green terminal at the screen anchor, status lights.
- [ ] Draw both. Commit and push: `Vault 111: terminals and the vault mainframe`.

### Task 19: Vault 111 `walls`, `skull`, `gate`, `fire`

`WINDOW` a wasteland viewport (day dusty sky, night dark; adjust `ink.windowDay/windowNight`), `BANNER` Vault-Tec
poster, `SHELF` supply shelf with cans, `GAUGE` radiation meter, `CENSER` caged ceiling lamp; `SKULL` an Eyebot
(sphere, grille, antenna); `GATE` the yellow hazard frame, `GATE_L/R` the cog-shaped vault door halves (each half of
the gear), `GATE_VOID` the dark tunnel; `BRAZIER` barrel fire, `CANDLES` a lamp.
- [ ] Draw the four. Commit and push: `Vault 111: viewports, Eyebot, the cog door and barrel fires`.

### Task 20: Vault 111 `clutter`, `petitions`, `commits`, `refectorium`

`PAPER_STACK` forms, `SCROLL_PILE` holotapes, `BOOKS` manuals, `LOOSE_A/B` loose pages, `CRATE` Nuka-Cola crate;
`SCROLL` G.O.A.T. form, `QSCROLL` with a `?`, `SCROLL_HELD` a clipboard; `COMMIT_SEAL` thumbs-up sticker,
`COMMIT_TAG` a bottle cap, `COMMIT_STAMP` approval stamp; `RECAFF` Nuka-Cola machine, `TABLE`/`BENCH` cafeteria.
- [ ] Draw the four. Commit and push: `Vault 111: forms, holotapes, bottle caps and the Nuka-Cola machine`.

### Task 21: Vault 111 room tiles, then ship the world

`room-floor` riveted steel, yellow-lit floor strips, a sanctum floor with the Vault-Tec gear; `room-walls`
riveted blue-grey panels, a radiation alarm beacon; `room-doors` bulkhead doors; `room-pipes` industrial pipes with
valves.
- [ ] Draw the four (seamless tiling checked). Whole-world look in `tools/sprites.html`.
- [ ] Commit and push: `Vault 111: riveted floors and walls, bulkheads and pipes`.
- [ ] Update the spec status line (`docs/superpowers/specs/2026-10-06-three-worlds-design.md`) to "done".
- [ ] Coordinator: rebuild and reinstall the NSIS build.
