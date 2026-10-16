# A new world: Darwin (the infinite monkeys)

Date: 2026-10-16. Status: design approved, not started.
Asked for by colleagues. Builds on `2026-10-06-three-worlds-design.md` (one world = one theme entry + its own art,
no engine change) and on the later additions every world now carries (39° view, break-out room, Night Vigil).

Goal: a fifth world, a Victorian naturalist's study in the spirit of *On the Origin of Species*, where monkeys type
on typewriters (the infinite monkey theorem: every session is a monkey that will, eventually, type Shakespeare).

## Decision ledger (confirmed with the operator)

1. **World**: a Victorian naturalist's study: dark wood panelling, brass, specimen cabinets, field notebooks,
   globes, engravings. Monkeys type on typewriters.
2. **Identity**: world id `darwin`, world name `Darwin` (in `WORLDS`); theme id `darwin`, theme name `Darwin`.
   It is the 14th theme: column **N** in the sprite viewer key.
3. **Cast**: scribe = a monkey at a typewriter, rank read by species and dress (novice: a young monkey; standard: a
   chimpanzee in a waistcoat; high: an orang-utan with spectacles), within decision 10. Adept = a capuchin monkey carrying typed pages.
   Magos = an old gorilla in a frock coat in a wing chair (not Charles Darwin himself: no caricature of a real
   person). Skull = a Galápagos finch. Watchman = a museum night keeper with a lantern.
4. **Full scope**: every family Vault 111 ships (list below), Flat and 39°, plus the 39° faces sheet.
5. **Every sprite drawn from scratch** (the operator's rule): the default art gives only frame sizes and anchors,
   never shapes to recolour. Colours in `ui/art/key.gpl` slots only.
6. **Wording**: Victorian and simian, with Shakespeare as the running joke (see Wording). No new mechanic.
7. **Method**: the sprite viewer stays open throughout; tests green; gallery regenerated with `--theme darwin`;
   `CLAUDE.md` and the docs list the new column and theme.
8. **Non-goals**: no new game mechanic, no new animation kind beyond what other worlds have, no random
   "monkey actually types Shakespeare" text generator.
9. **Delivery** (Claude's call, ratified): one theme, built family by family with a viewer screenshot each step.
10. **Ranks are colour only** (operator, after the builder check): a rank is a palette swap over one drawing per
    direction (`T.rank[rank]`, `ui/sprites.js`), so the three species share one monkey silhouette and differ by fur
    and clothing colour through the rank slots: ginger (orang-utan), brown (chimpanzee), pale grey-brown (young
    monkey). The high rank's spectacles sit in a slot made transparent for the other ranks; if a transparent rank
    colour does not work, the spectacles are dropped (no engine change). Per-rank drawings may come later as a
    separate engine change.

## What the world delivers

Same contract as `2026-10-06-three-worlds-design.md` § "What every world delivers", plus what came after it:

- `ui/theme.js`: `darwin: 'Darwin'` in `WORLDS`.
- `ui/themes.js`: one `defineTheme({ id: 'darwin', world: 'darwin', name: 'Darwin', art, px, sash, rank, ink, light,
  ui, text })`, every part as complete as Vault 111's (including `text.watch` and `text.breakout`).
- `ui/art/darwin/<family>.png` + `.json` for: `walls`, `sanctum`, `skull`, `gate`, `cogitator`, `scribe`, `adept`,
  `magos`, `workstations`, `fire`, `petitions`, `commits`, `clutter`, `refectorium`, `room-doors`, `room-floor`,
  `room-walls`, `room-pipes`, `scribe39`, `adept39`, `magos39`, `skull39`, `breakout`, `watch`, `watch39`, and
  `faces.*` (the 39° object sides).
- `tools/watch_art/darwin.mjs` and the `tools/breakout_art/` entry, following the existing per-world generators.
- `tools/sprite_catalog.mjs` / `tools/sprite_sheet.mjs`: the new column N (if the key is not derived from `THEMES`).
- `docs/sprites/darwin.md` gallery; `README.md` worlds table with a `docs/img/world-darwin.png` shot;
  `docs/DEVELOPMENT.md` and `CLAUDE.md` theme lists.

## Darwin (`darwin`)

- **Palette**: dark walnut and mahogany panelling, green baize, brass and tarnished gold, ivory paper and aged
  parchment, ink black, bottle-green specimen glass, gas-lamp amber; the monkeys in warm browns, ginger (orang-utan)
  and charcoal (gorilla), pink-tan faces and hands.
- **Scribe** → a monkey at a typewriter, one silhouette for every rank (decision 10). Fur in the robe slots
  (`r R d`), recoloured per rank; department colour (`y`) on a neckerchief; rank colour (`t`) on the waistcoat
  and watch chain (bare-looking for the novice); spectacles in a slot transparent except for high. At the desk, long arms on the keys.
- **Adept** → a capuchin monkey hurrying with a sheaf of typed pages (rank colour on its little fez or collar).
- **Magos** → the old gorilla, the Professor: frock coat, cravat, in a wing chair; the swinging limb is an arm with
  a magnifying glass (Claude's call: one prop, the quill dropped).
- **Sanctum**: throne → leather wing chair; lord desk → a big partners' desk with a microscope and a skull
  specimen; Cog → an evolutionary tree emblem (the "I think" sketch); seal → a finch-stamped wax seal.
- **Cogitator** → a wall of specimen cabinets: butterflies under glass, jars, a branching tree-of-life chart.
- **Workstations**: desk → a writing desk with a black typewriter and a paper stack; lectern → a standing reading
  lectern with an open notebook; console → a portable typewriter on a crate.
- **Gate** → double mahogany doors of the study; the void → a dark museum corridor.
- **Walls**: window → a tall sash window (day: an English garden / Down House lawn, night: moon over trees);
  banner → a framed chart of the Beagle's voyage; shelf → books and specimen jars; gauge → a barometer; censer →
  a gas lamp.
- **Skull** → a Galápagos finch flying about.
- **Fire**: brazier → a fireplace with a brass fender; candles → an oil lamp.
- **Petitions**: scroll → a typed page with a question mark; raised scroll → a page held up.
- **Commits**: seal → a page of Shakespeare (a few typed lines and a quill flourish); tag → a specimen label;
  stamp → a brass rubber stamp.
- **Clutter**: paper stack → typed-page tower; scroll pile → crumpled failed pages; books → leather volumes;
  loose → loose typed pages; crate → a specimen crate (HMS Beagle stencil).
- **Refectorium**: recaff → a tea urn with a banana bowl; table and bench → a tea table and a Chesterfield bench.
- **Room**: floor → parquet herringbone; channels → a runner carpet; walls → wood panelling with wallpaper above;
  pipes → brass gas pipes; doors → panelled doors; beacon → a brass bell that rings.
- **Break-out room** → the Monkey House: straw on the floor, a bamboo fence, a banana-crate gate.
- **Watchman** → the museum night keeper: peaked cap, long coat, a lantern, a ring of keys.

## Wording

- subtitle `Darwin · The Study`, motto `To be or not to be… eventually`.
- ranks `Orang-utan` / `Chimpanzee` / `Young monkey`.
- status: busy `Typing`, shell `At the specimen cabinet`, idle `Page done, awaiting input`, waiting `Holding up a
  page`, background `Idle · capuchin on errands`, napping `Idle · asleep on the typewriter`.
- petitions `{n} query` / `{n} queries`, `{n} querying`; `petitionLabel` `{name}, query: {want}`.
- `adeptOf` `{kind} · capuchin of {owner}`; overflow `+{n} in the monkey house`; empty `No monkeys at the keys`.
- log `Field notebook`; tithe `Typed today: {tokens} tokens, {time} at the keys`.
- event commit `A page of Shakespeare`, petition `Query`, petition-answered `Query answered`, compaction
  `Pages bound`, limit `Out of bananas`.
- `limitLabel` `out of bananas · back at {time}`, toast limit `{name} out of bananas until {time}`.
- watch `Night Keeper`, breakout `Monkey House`.
- Remaining keys follow the same pattern; every key Vault 111 sets is set.

## Execution

Same order as the three worlds (tasks 1–7), then: 8. `scribe39`, `adept39`, `magos39`, `skull39`, `faces`;
9. `breakout`, `watch`, `watch39`; 10. docs, galleries, README shot. Each task: implementer, then spec and quality
review, viewer screenshot before reporting done; after the world: check in the app, rebuild and silently reinstall
the NSIS build.

## Testing

- Existing tests, unchanged: `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, `node ui/theme.test.mjs`
  (art only declared families, default sizes, known anchors; every text key; every `ui` key a `:root` variable;
  39° completeness).
- Visual check per task in `tools/sprites.html#N…`.
