# A new world: Darwin (the infinite monkeys)

Date: 2026-10-16. Status: done (shipped with its own art, Flat and 39°).
2026-10-17: the setting moved from a Victorian study to an expedition camp in the African savanna (operator: "more
wood", as if Darwin had set up his study in the field). The apes are unchanged; every environment family was redrawn
from scratch, Flat and 39°, the palette's free slots retuned (the apes' slots kept), the wording moved outdoors.
Asked for by colleagues. Builds on `2026-10-06-three-worlds-design.md` (one world = one theme entry + its own art,
no engine change) and on the later additions every world now carries (39° view, break-out room, Night Vigil).

Goal: a fifth world, a naturalist's expedition camp in the African savanna in the spirit of *On the Origin of Species*
(first built as a Victorian study, moved to the field on 2026-10-17), where monkeys type on typewriters (the infinite monkey theorem: every session is a monkey that will, eventually, type Shakespeare).

## Decision ledger (confirmed with the operator)

1. **World**: a naturalist's expedition camp in the savanna (was: a Victorian study): raw wood, rough planks, bamboo,
   woven reed and thatch, red earth, field notebooks, lanterns. Monkeys type on typewriters.
2. **Identity**: world id `darwin`, world name `Darwin` (in `WORLDS`); theme id `darwin`, theme name `Darwin`.
   It is the 14th theme: column **N** in the sprite viewer key.
3. **Cast**: every animal a real, wild-looking ape or monkey with real anatomy and proportions, no human clothes
   (operator, after the first build). Scribe = a monkey at a typewriter, rank read by species (novice: a young
   monkey; standard: a dark-brown chimpanzee; high: a ginger orang-utan), within decision 10. Adept = a white-faced
   capuchin carrying typed pages. Magos = an old flanged male orang-utan in a rattan chair, clearly bigger and older than
   the high-rank scribe (not Charles Darwin himself: no caricature of a real person). Skull = a Galápagos finch.
   Watchman = a museum night keeper with a lantern (kept through the move to the camp).
4. **Full scope**: every family Vault 111 ships (list below), Flat and 39°, plus the 39° faces sheet.
5. **Every sprite drawn from scratch** (the operator's rule): the default art gives only frame sizes and anchors,
   never shapes to recolour. Colours in `ui/art/key.gpl` slots only.
6. **Wording**: naturalist and simian, with Shakespeare as the running joke (see Wording). No new mechanic.
7. **Method**: the sprite viewer stays open throughout; tests green; gallery regenerated with `--theme darwin`;
   `CLAUDE.md` and the docs list the new column and theme.
8. **Non-goals**: no new game mechanic, no new animation kind beyond what other worlds have, no random
   "monkey actually types Shakespeare" text generator.
9. **Delivery** (Claude's call, ratified): one theme, built family by family with a viewer screenshot each step.
10. **Ranks are colour only** (operator, after the builder check): a rank is a palette swap over one drawing per
    direction (`T.rank[rank]`, `ui/sprites.js`), so the three species share one ape silhouette and differ by fur
    colour through the robe slots: ginger (orang-utan), dark brown (chimpanzee), pale grey-brown (young monkey).
    Per-rank drawings may come later as a separate engine change.

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

- **Palette**: red earth and ochre, straw and dry-grass golds, raw wood browns (the walnut slots `w W L`, shared with
  the scribes' arms), thatch, woven reed, acacia green (`v c C`), ivory paper, lantern amber; sky blue and golden grass
  by day, a dark starry sky by night in the openings (`ink.windowDay` / `windowNight`); the savanna at dusk beyond the
  gate (`@ $ %`). The apes in dark brown, ginger and pale grey-brown, the Professor in a deeper ginger-red (`V`),
  pink-tan faces and hands: every slot the ape, capuchin, finch, petition, commit, break-out and watchman families
  draw with keeps its colour.
- **Scribe** → a real ape at a typewriter, no clothes, one silhouette for every rank (decision 10): hunched, long
  hairy arms to the knees, heavy brow, muzzle and ears, bare face, hands and feet (`:` `;`); knuckle-walking in
  profile. Fur all over in the robe slots (`r R d`), recoloured per rank. The department colour (`y`) is a small
  ringed tag on the right ankle, seen in every facing. At the desk, hairy arms on the keys in the neutral walnut
  browns (`L w W`), since the engine draws arm frames without rank colours.
- **Adept** → a white-faced capuchin (black cap, cream face ring and throat, dark body, long curled tail) hurrying
  with a sheaf of typed pages; rank colour on a ribbon tied round its tail (`J`, knot `I`).
- **Magos** → the Professor, an old flanged male orang-utan, no clothes: wide grey cheek pads, a throat sac, long
  shaggy ginger-red fur, very long arms, seated in the rattan chair with a typed page on his lap (the chest flicker
  scans it); the swinging limb is his long arm holding a brass magnifying glass (Claude's call: one prop, the quill
  dropped).
- **Sanctum** (the Professor's hut corner): throne → a rattan peacock chair; lord desk → a big plank table on log legs
  with field journals, ink and quill, a map, the brass microscope and a box of pinned beetles (a tin trunk and rope
  under it); Cog → a carved tree-of-life on a sawn log slab hung by a rope; seal → a carved wooden finch token on a
  leather thong.
- **Cogitator** → the camp station: a lashed pole board under a thatch awning: a slate (the screen), a pinned map (the
  wave), bamboo rain gauges (the bars), seven little oil lamps (the lamps), coiled ropes on pegs (the drums), two tin
  stovepipes (the vents), pinned butterflies and feathers, jars and gourds on planks, drying herbs.
- **Workstations**: desk → rough planks on lashed sawhorses with a black typewriter and a hurricane lantern; lectern →
  a sawn stump with the field notebook on a plank book rest and a candle in a bottle; console → a portable typewriter
  on a slatted supply crate; background shell → a globe turning on a wooden tripod.
- **Gate** → a camp gate of lashed log posts under a thatch roof, stick-panel leaves; the void → the savanna at dusk.
- **Walls**: window → an opening between bamboo poles under a rolled reed blind (day: golden grass, acacias, a big sun;
  night: stars and a moon); banner → a map of Africa hung from a stick; tall hanging → a long woven mat on a pole;
  shelf → plank shelves on lashed poles with calabashes, jars and gourds; gauge → a felt water canteen; censer → a
  hurricane lantern on an iron hook.
- **Skull** → a Galápagos finch flying about.
- **Fire**: brazier → a stone-ringed fire pit under a stick tripod with a billy can; candles → a hurricane lantern on an
  upturned crate by an oil can.
- **Petitions**: scroll → a typed page with a question mark; raised scroll → a page held up.
- **Commits**: seal → a page of Shakespeare (a few typed lines and a quill flourish); tag → a specimen label;
  stamp → a brass rubber stamp.
- **Clutter**: paper stack → typed-page tower; scroll pile → crumpled failed pages; books → field journals tied with
  twine; loose → loose typed pages; crate → a wooden supply crate stencilled BEAGLE, straw under its prised lid.
- **Refectorium**: recaff → a hooped water barrel with bananas on its lid and a kettle on three stones; table and
  bench → a plank table of tin plates and enamel mugs, split-log benches on stumps.
- **Room**: floor → packed red earth with dry grass tufts and pebbles; channels → woven reed mats; sanctum floor → an
  ochre kilim; walls → basket-woven reed between bamboo poles under a thatch eave (ochre and red in the Professor's
  hut); pipes → lashed bamboo poles; doors → woven reed sliding screens; beacon → a hand bell on a peg.
- **Break-out room** → the Monkey House: straw on the floor, a bamboo fence, a banana-crate gate.
- **Watchman** → the museum night keeper: peaked cap, long coat, a lantern, a ring of keys.

## Wording

- subtitle `Darwin · Savanna Camp` (was `Darwin · The Study`), motto `To be or not to be… eventually`.
- ranks `Orang-utan` / `Chimpanzee` / `Young monkey`.
- status: busy `Typing`, shell `At the camp board`, idle `Page done, awaiting input`, waiting `Holding up a
  page`, background `Idle · capuchin on errands`, napping `Idle · asleep on the typewriter`.
- petitions `{n} query` / `{n} queries`, `{n} querying`; `petitionLabel` `{name}, query: {want}`.
- modes: candles `Lantern light`; prefs: hall category `Camp`, cog `Stay at the camp board for`.
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
