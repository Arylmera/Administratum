# Darwin: the Victorian laboratory

Replaces the savanna camp (2026-10-16 design, `7439e18`). Decided with the user on 2026-10-17:

- **Setting:** Darwin's own laboratory, around 1860: oak benches, brass microscopes, glass specimen jars, distilling
  apparatus, gas lamps, black-and-white floor tiles, sash windows onto an English garden. Not a savanna, not a modern
  lab, not steampunk (the 40k Mechanicus already owns the machinery look).
- **Scribes:** real chimpanzees, bare (the user's earlier rule: never dressed), working at the lab benches. They
  wear a **lab collar with a numbered tag** in the department colour (`y`), readable front, back and side; it
  replaces the arm ribbon. Arms hang at their sides at the bench (the hall's rule since 0.6.2).
- **Adepts:** the white-faced capuchins, recast as **lab assistants**: a small apron, test tubes or a sample tray;
  the subagent kind glyph on the apron or an ID badge, front and back.
- **The Magos:** **Charles Darwin himself**, checking the work at his desk: an old man, white beard, bald crown,
  black frock coat, a magnifying glass and a notebook, in a leather armchair. Not an ape.
- **Kept as they are:** the Watchman (museum night keeper), the flying finch (`skull`), the page props that already
  read Victorian (typed pages, query marks, the Shakespeare commit page, the brass stamp).

## Art, by family

| Family | Lab design |
| --- | --- |
| scribe, scribe39 | the chimps, collar and numbered tag (`y`) instead of the arm ribbon |
| adept, adept39 | capuchin assistants: apron, test tubes; kind glyph on the apron/badge |
| magos, magos39 | Darwin in his armchair, magnifying glass in hand |
| sanctum | his armchair (THRONE), his desk with manuscript and specimens (LORD_DESK), a brass medallion with his "I think" tree sketch (COG_MECH), wax seals |
| workstations | DESK: oak lab bench with a brass microscope, a typewriter and glassware; LECTERN: a narrow specimen bench; CONSOLE: the assistant's sample stand; SHELL_COG: something turning on the bench (a specimen carousel or a hand centrifuge) |
| cogitator | the back-wall apparatus: distilling train, retorts, gauges, a cabinet of specimen jars |
| walls | sash windows (English garden by day, moon by night), specimen shelves of jars, anatomical and evolution charts as hangings |
| room-floor, room-walls, room-doors, room-pipes | black-and-white tiles; green-painted plaster over a tiled dado; oak doors with frosted glass; brass gas pipes; a gas lamp for the beacon |
| gate, fire, clutter, petitions, commits, refectorium | the lab's double doors; a Bunsen burner and an oil-lamp cluster; papers, journals, the BEAGLE crate; a tea table with a kettle and benches |
| breakout | the Monkey House as the lab's cage room (`tools/breakout_art/darwin.mjs`) |
| faces | the 39° volumes of all the furniture above, built last |

## Palette

Starts from the 2026-10-16 study palette (`f0cdb3d`: walnut, brass, specimen glass, gaslight, ivory pages), adjusted
for the lab. Each art group may retune only the slots it owns and reports every change; the coordinator merges them.
