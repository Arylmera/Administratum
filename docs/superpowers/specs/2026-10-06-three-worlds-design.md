# Three new worlds: Orbital Station, Arcane Tower, Vault

Date: 2026-10-06. Status: approved design, not started.
Builds on `2026-10-06-sprite-themes-design.md` (phase 3: per-theme art, Neon Grid). No engine change: each world
is a theme entry plus its own art, exactly like Neon Grid.

## Scope

Three new worlds, each at full depth (like Neon Grid): palette, chrome, wording, toasts, and every art family that
reads as 40k redrawn. Every sprite is a new design for its world (the operator's rule): the default art gives only
frame sizes and anchor points, never shapes to recolour or tweak. The 40k roles become the world's own (the Magos is
the station manager, the cogitator a real space console...), each drawn from that world's references.

| World id (`WORLDS`) | World name | Theme id | Theme name |
|---|---|---|---|
| `space` | Space | `orbital` | Orbital Station |
| `arcane` | Fantasy | `tower` | Arcane Tower |
| `vault` | Fallout | `vault` | Vault 111 |

Each world starts with one style (its theme). More styles per world later are palette-only themes.

## What every world delivers

- `ui/theme.js`: the world in `WORLDS`.
- `ui/themes.js`: one `defineTheme({ id, world, name, art, px, sash, rank, ink, light, ui, text })`, complete in the
  same parts Neon Grid sets (`px` every slot it recolours, `sash` 8 colours, `rank` high/novice, `ink`, `light`,
  `ui` chrome variables including `--display`, `text` every key Neon Grid sets).
- `ui/art/<theme>/<family>.png` + `.json` for these families, every frame at the default's size, anchors kept or
  moved only where the drawing needs it (known anchor names only):
  `walls`, `sanctum`, `skull`, `gate`, `cogitator`, `scribe`, `adept`, `magos`, `workstations`, `fire`,
  `petitions`, `commits`, `clutter`, `refectorium`, `room-doors`, `room-floor`, `room-walls`, `room-pipes`.
  A family may be skipped only if the default art already fits the world after recolouring; the theme's `art` list
  is then shorter and the commit says why.
- Art drawn in `ui/art/key.gpl` colours only (one slot per colour); rank and department variants come from the
  slots (`t T z j J I`, robe `r R d`, sash `y`, skin `:` `;`), as in Neon Grid.
- `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, `node ui/theme.test.mjs` pass; galleries regenerated with
  `node tools/sprite_sheet.mjs --theme <id>`; the theme checked in `tools/sprites.html`.
- English UI text (like Neon Grid).

## Orbital Station (`orbital`)

A space station in orbit: white modules, padded panels, portholes on Earth and stars, blinking status lights.

- **Palette**: off-white and light-grey hull panels, dark-grey padding, safety orange and NASA-blue accents, cyan
  screens, deep-space black-blue through the windows, warm white lights.
- **Scribe** → astronaut in a flight suit (blue or white), mission patch in the department colour (`y`), rank on the
  shoulder (`t`), headset; at the desk, sleeves and gloves.
- **Adept** → a small floating assistant robot (spherical, with a single eye light in the rank colour).
- **Magos** → the station Commander: command chair, flight suit with stripes; the swinging limb is a robotic arm
  (Canadarm-style) or a pointer.
- **Sanctum**: throne → command chair; lord desk → command console; Cog → mission patch emblem; seal → patch.
- **Cogitator** → a big curved screen wall with an orbit trace and Earth, side telemetry panels.
- **Workstations**: desk → console with two screens and a joystick; lectern → a small wall-mounted terminal;
  console → a laptop on a strap-down arm.
- **Gate** → an airlock hatch (round door, hazard stripes), the void → starfield.
- **Walls**: window → porthole (day: Earth limb, night: stars); banner → mission poster; shelf → stowage net with
  bags; gauge → pressure gauge; censer → hanging LED lamp.
- **Skull** → a floating camera drone.
- **Fire**: brazier → air scrubber unit; candles → light strip.
- **Petitions**: scroll → checklist card; raised scroll → a clipboard.
- **Commits**: seal → mission sticker; tag → flight tag; stamp → a stamp-like scanner.
- **Clutter**: paper stack → velcroed checklists; scroll pile → cargo bags; books → manuals; loose → floating
  pages; crate → cargo container.
- **Refectorium**: recaff → food warmer / drink dispenser; table and bench → galley table with foot loops.
- **Room**: floor → grid deck plates; channels → floor light strips; walls → padded white panels with handrails;
  pipes → cable trays and air ducts; doors → sliding module hatches; beacon → rotating warning light.
- **Wording**: subtitle `Low Earth Orbit · Station Deck`, motto `Ad astra`; ranks `Commander` / `Astronaut` /
  `Cadet`; petitions `{n} call` / `{n} calls`, `{n} calling`; log `Flight log`; tithe `Telemetry today: …`;
  napping `Idle · asleep in the bunk`; shell `At the airlock`; toasts `Call from {name}`.

## Arcane Tower (`tower`)

A wizards' tower: stone, wood, gold, violet arcane light, candles.

- **Palette**: night-blue stone, warm wood, gold trim, violet and teal arcane glow, candle orange, parchment.
- **Scribe** → apprentice in a hooded robe (department colour on the sash/stole `y`), embroidered stars in the rank
  colour (`t`), a pointed hood; at the desk, wide sleeves.
- **Adept** → a familiar: a floating will-o'-wisp or owl, rank colour in its glow.
- **Magos** → the Archmage: long beard, pointed hat, star robe on a carved throne; the swinging limb is the arm with
  a staff.
- **Sanctum**: throne → carved high seat; lord desk → a spellbook lectern; Cog → an arcane sigil circle;
  seal → a rune seal.
- **Cogitator** → an orrery / crystal-ball wall: brass armillary, scrying mirrors, glowing runes.
- **Workstations**: desk → writing desk with a spellbook and potion; lectern → a book lectern; console → a crystal
  on a stand.
- **Gate** → a great runic door (stone arch, glowing runes), the void → a swirling portal.
- **Walls**: window → arched window (day: sky, night: moon and stars); banner → heraldic tapestry; shelf → potion
  and book shelf; gauge → hourglass; censer → hanging lantern.
- **Skull** → a floating eye or an owl.
- **Fire**: brazier → cauldron over a fire; candles → candles.
- **Petitions**: scroll → sealed scroll (kept, re-coloured as a letter with a ribbon); raised scroll → an open scroll.
- **Commits**: seal → wax rune seal; tag → bookmark ribbon; stamp → signet ring.
- **Clutter**: paper stack → grimoire pile; scroll pile → scrolls; books → books; loose → loose pages with runes;
  crate → a chest.
- **Refectorium**: recaff → a tea kettle on a stove; table and bench → wooden table and bench.
- **Room**: floor → flagstones; channels → glowing rune lines; walls → stone masonry; pipes → wooden beams;
  doors → arched wooden doors; beacon → a magic crystal that flares.
- **Wording**: subtitle `The Tower · Hall of Apprentices`, motto `Knowledge is power`; ranks `Archmage` /
  `Wizard` / `Apprentice`; petitions `{n} plea` / `{n} pleas`, `{n} pleading`; log `Grimoire`; tithe
  `Mana spent today: …`; napping `Idle · dozing by the fire`; shell `At the scrying orb`; toasts `Plea from {name}`.

## Vault 111 (`vault`)

A Fallout vault, fully in the games' style: Vault-Tec blue and yellow, riveted steel, green Pip-Boy screens.

- **Palette**: Vault-Tec blue and yellow, riveted steel grey, concrete, rust, Pip-Boy green phosphor, Nuka-Cola red,
  warm incandescent light.
- **Scribe** → a Vault Dweller in the blue jumpsuit with the yellow stripe, the vault number `111` on the back,
  a Pip-Boy on the wrist (screen in the rank colour `t`), department colour on the collar/belt (`y`).
- **Adept** → a Mr. Handy-style robot: round body, three eye stalks, thrusters (rank colour on the eyes).
- **Magos** → the Overseer: grey suit over the jumpsuit, at the Overseer's desk; the swinging limb is the arm with
  a clipboard / cigar.
- **Sanctum**: throne → the Overseer's chair; lord desk → the Overseer's terminal desk; Cog → the Vault-Tec gear
  logo with `111`; seal → a Vault Boy thumbs-up badge.
- **Cogitator** → the vault mainframe: tape reels, a big green-phosphor terminal, status lights.
- **Workstations**: desk → a RobCo-style terminal desk; lectern → a wall terminal; console → a Pip-Boy dock.
- **Gate** → the cog-shaped vault door (rolled aside), with the yellow hazard frame; the void → the dark tunnel.
- **Walls**: window → a wasteland viewport (day: dusty sky, night: dark); banner → a Vault-Tec poster; shelf →
  supply shelf with cans; gauge → radiation meter; censer → caged ceiling lamp.
- **Skull** → an Eyebot (floating sphere with a grille and antenna).
- **Fire**: brazier → a barrel fire; candles → a lamp.
- **Petitions**: scroll → a G.O.A.T.-style form; raised scroll → a clipboard.
- **Commits**: seal → a Vault Boy thumbs-up; tag → a bottle cap; stamp → an approval stamp.
- **Clutter**: paper stack → forms; scroll pile → holotapes; books → manuals; loose → loose pages; crate →
  a supply crate / Nuka-Cola crate.
- **Refectorium**: recaff → a Nuka-Cola machine; table and bench → cafeteria table and bench.
- **Room**: floor → riveted steel floor; channels → yellow-lit floor strips; walls → riveted blue-grey panels;
  pipes → industrial pipes; doors → bulkhead doors; beacon → a radiation alarm light.
- **Wording**: subtitle `Vault 111 · Overseer's Office`, motto `Prepare for the future`; ranks `Overseer` /
  `Dweller` / `Newcomer`; petitions `{n} requisition` / `{n} requisitions`, `{n} requisitioning`; log
  `Overseer's log`; tithe `Rations today: …`; napping `Idle · in the bunk`; shell `At the mainframe`;
  toasts `Requisition from {name}`.

## Execution

Subagent-driven development: one implementer subagent per task, each followed by spec and quality review, in
order, on `main`, one commit and push per task. Tasks per world (21 in all):

1. Theme: `WORLDS`, `defineTheme` (palette, rank, sash, ink, light, ui, text), `theme.test` passes.
2. Characters: `scribe`, `adept`.
3. `magos`, `sanctum`.
4. `workstations`, `cogitator`.
5. `walls`, `skull`, `gate`, `fire`.
6. `clutter`, `petitions`, `commits`, `refectorium`.
7. Room tiles: `room-floor`, `room-walls`, `room-doors`, `room-pipes`.

After each world: check it in `tools/sprites.html` and in the app, regenerate its gallery, then rebuild and
silently reinstall the NSIS build.

## Testing

- Existing tests, unchanged: a theme's art is only families it declares, at the default's sizes, with known anchors;
  every text key exists; every `ui` key is a `:root` variable.
- Visual check per task: the implementer renders the family (gallery or viewer screenshot) and looks at it before
  reporting done.
