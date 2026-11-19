# Making a theme pack

A guide for anyone who uses Administratum and wants to make a theme of their own: new colours for a world the app
ships, or a world of your own. You need a text editor, and for your own art a pixel editor. No programming.

**Contents:** [What a pack is](#what-a-pack-is) · [Your first style in five minutes](#your-first-style-in-five-minutes) ·
[The theme.json keys](#the-themejson-keys) · [A world of your own](#a-world-of-your-own) ·
[Drawing art](#drawing-art) · [Checking a pack](#checking-a-pack) · [Publishing](#publishing) ·
[What a pack cannot do](#what-a-pack-cannot-do)

---

## What a pack is

A **pack** is a folder holding one or more themes, each in a folder of its own. A theme is one of two kinds:

- A **style** takes a theme that exists and recolours it: Rain City is Neon Grid with its pink turned to amber. It
  keeps that theme's world, art and wording, and can change any of them. No drawing needed.
- A **world theme** starts from the default hall and says everything it changes: colours, wording, art. A theme can
  join a world the app ships (as the Ordos join Warhammer 40k) or start a new one, which then appears in the Theme
  list beside Fallout and the others.

To vary an existing world, copy its folder from `ui/art/<id>/` in the
[Administratum repository](https://github.com/Arylmera/Administratum) into your pack and change what you like.

A pack looks like this (the template, [`docs/theme-pack-template/`](theme-pack-template/), is one to copy):

```
my-pack/
  pack.json          { "format": 1, "name": "My pack" }
  LICENSE            the terms others may use your work under
  vault-pink/        a style
    theme.json
  workshop/          a world theme with one sheet of its own art
    theme.json
    breakout.json
    breakout.png
```

For a real pack holding a full world, see [`ChristianLemer/adm-themes`](https://github.com/ChristianLemer/adm-themes):
its `breakingbad/` folder is Breaking Bad, a world the app used to ship, with every sheet of its own art. Install it by
that name.

A theme folder's name is its theme's id inside the pack. Every name in a pack, folders and files, takes letters,
digits, `-`, `_` and `.` only, not starting with `.`; a folder's name does not end with `.`, and no name is one
Windows keeps for a device (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, with any extension). A
theme folder named otherwise is not read (one ending in `.` or named for a device is read from a local folder, but
the installer drops it), and other files named otherwise are left out by the installer: the check names both. `pack.json`'s `name` is informational: the app shows the repository's `owner/repo`, not that name.

---

## Your first style in five minutes

1. Find the app's themes folder:

   | OS | Folder |
   |---|---|
   | Linux | `~/.local/share/com.arylmera.administratum/themes/` (or `$XDG_DATA_HOME/com.arylmera.administratum/themes/`) |
   | macOS | `~/Library/Application Support/com.arylmera.administratum/themes/` |
   | Windows | `%APPDATA%\com.arylmera.administratum\themes\` |

   The app creates `themes` the first time you install a pack from GitHub. If it is not there yet, create it
   yourself: the folder above it is already there (the Chronicon lives in it).

2. In `themes`, make a folder for your pack, `my-pack`, and in it a folder `vault-pink`.

3. In `vault-pink`, save this as `theme.json`:

   ```json
   {
     "format": 1,
     "name": "Pink Vault",
     "base": "vault",
     "bands": [
       { "hue": [110, 170], "to": 330, "sat": 1 },
       { "hue": [195, 250], "to": 290, "sat": 0.8 }
     ],
     "text": { "motto": "Prepare for the future, in pink" }
   }
   ```

   `base` says which theme to recolour (Vault 111). Each band takes the colours whose hue falls in a range and turns
   them to another hue: here the Pip-Boy green (hues 110 to 170) becomes pink (330), and the Vault-Tec blue (195 to
   250) becomes plum (290). Hues are degrees on the colour wheel: red 0, yellow 60, green 120, cyan 180, blue 240,
   magenta 300.

4. Quit Administratum (tray → *Quit*) and start it again. Packs are read when the app starts, never while it runs.

5. Settings → Hall: in the Theme list pick *Fallout*, in the Style list *Pink Vault*. Under **Added themes**,
   `my-pack` is listed as a local folder with its theme count. If a theme did not load, its reason is on that line.

Change a number, restart, look again. That is the whole loop.

---

## The theme.json keys

Every key but `format`, `name` and one of `world` / `base` is optional: a theme says only what it changes.

| Key | Meaning |
|---|---|
| `format` | `1` |
| `name` | The theme's name in Settings |
| `world`, `worldName` | A world theme: the world's id, and its name when the world is new. An id the app ships (below) joins that world |
| `base` | A style: the theme it recolours, a folder of the same pack or a theme the app ships (below). It takes that theme's world, art and wording, and its whole look |
| `bands` | A style: the hue ranges to turn, each `{ "hue": [from, to], "to": degrees, "sat": factor, "light": shift }`. Hues are degrees, 0 to 360: `[from, to]` takes the hues from `from` up to, not including, `to`, and `to` is the hue they turn to. `sat` multiplies the saturation, 0 to 10 (default 1), `light` adds to the lightness, -1 to 1 (default 0). A range whose `from` is above its `to` wraps past red (`[345, 15]`). Greys, skin tones, the department sashes and the art are never turned |
| `art` | The art families this folder redraws (see [Drawing art](#drawing-art)) |
| `px` | The art's colours, one per palette slot: `{ "c": "#5aff7a" }`. `#rrggbb` |
| `sash` | The department colours, a list of `#rrggbb` |
| `rank` | Per model rank (`high`, `standard`, `novice`): `robe` and `adept` colours by slot |
| `ink` | Colours drawn by the app rather than the art (screens, coolant, lamps), by name |
| `light` | The light pools and glows, by name |
| `ui` | The colours of the panels around the hall, by CSS name (`"--green": "#ffb347"`); `--display` picks one of the bundled fonts, `"'VT323', monospace"` or `"'Pirata One', serif"` |
| `text` | The wording: `subtitle`, `motto`, the names of rooms and characters, the notifications... |
| `notes` | Free text for you and other authors. The app never reads it |

A colour is `#rrggbb`, `rgb(r, g, b)`, `rgba(r, g, b, a)` or `r,g,b`; `px`, `sash` and `rank` take `#rrggbb` only. In a
style, every part you give is laid over the recoloured base.

The names `px`, `ink`, `light` and `text` accept are the app's own: an unknown one is refused, by name. To see them
all with their values, open a world theme of the Administratum repository: `ui/art/vault/theme.json` has a full set
of wording, `ui/art/forge/theme.json` a short world. `ui/theme.js` holds the defaults (Ordo Administratum) they all start from.

**A style** (the template's `vault-pink/theme.json`):

```json
{
  "format": 1,
  "name": "Pink Vault",
  "base": "vault",
  "bands": [
    { "hue": [110, 170], "to": 330, "sat": 1 },
    { "hue": [195, 250], "to": 290, "sat": 0.8 },
    { "hue": [35, 65], "to": 20, "sat": 0.9, "light": 0.02 }
  ],
  "text": { "subtitle": "Pink Vault · Overseer's Office", "motto": "Prepare for the future, in pink" }
}
```

**A world theme** (the template's `workshop/theme.json`, shortened). Its `art` lists `breakout`, so `breakout.png` and
`breakout.json` must sit beside it, as in the template; without them, leave `art` out:

```json
{
  "format": 1,
  "name": "Workshop",
  "world": "workshop",
  "worldName": "Workshop",
  "art": ["breakout"],
  "px": { "1": "#3a2c20", "2": "#241a12", "c": "#e0a040" },
  "text": { "subtitle": "Workshop · Benches and sawdust", "motto": "Measure twice, cut once", "breakout": "Tool Shed" }
}
```

**The themes the app ships**, by the id `base` and `world` name them:

| Id | Theme | World (`world` id) | Can be a `base` |
|---|---|---|---|
| `tier2` | Ordo Administratum | Warhammer 40k (`w40k`) | yes |
| `forge` | Ordo Machinum | Warhammer 40k (`w40k`) | yes |
| `xenos` | Ordo Xenos | Warhammer 40k (`w40k`) | yes |
| `night` | Ordo Malleus | Warhammer 40k (`w40k`) | yes |
| `contrast` | Ordo Hereticus | Warhammer 40k (`w40k`) | yes |
| `cyber` | Neon Grid | Cyberpunk (`cyber`) | yes |
| `corpo` | Corpo Tower | Cyberpunk (`cyber`) | no, a style itself |
| `rain` | Rain City | Cyberpunk (`cyber`) | no, a style itself |
| `matrix` | Green Code | Cyberpunk (`cyber`) | no, a style itself |
| `synth` | Sunset Drive | Cyberpunk (`cyber`) | no, a style itself |
| `orbital` | Orbital Station | Space (`space`) | yes |
| `tower` | Arcane Tower | Fantasy (`arcane`) | yes |
| `vault` | Vault 111 | Fallout (`vault`) | yes |
| `darwin` | Darwin | Darwin (`darwin`) | yes |

A style's base may also be a world theme of the same pack, by its folder name. Your pack's world and theme ids are
your pack's own: two packs that both say `steampunk` make two worlds, and neither can touch the other. In the app, a
theme's full id is `<pack>:<folder>`, the pack being `owner/repo` for one installed from GitHub, lower-cased whatever
case it was typed in (`Alice/Themes` and `alice/themes` are one pack, `alice/themes:pink`), or `local/<folder>` for a
folder you put there yourself. Settings remembers the theme picked by that id.

---

## A world of your own

A world theme with a new `world` id and its `worldName` adds a world to the Theme list. It starts from the default
hall, Ordo Administratum: its characters and furniture, its wording. Everything you do not redraw or rename stays
Warhammer. The template's `workshop` changes the colours, a few words and one sheet of art, the break-out room's;
copy it to start.

To build on a world the app ships instead, copy its folder from `ui/art/<id>/` (all its art, its `theme.json`) into
your pack under a new folder name and edit from there. Keep its `world` to add your theme to that world as one more
style, or give it a new `world` and `worldName` to make it a world of its own.

---

## Drawing art

The art is PNG sheets drawn in a fixed palette, the **key palette** `ui/art/key.gpl` (load it in Aseprite, Piskel or
GIMP). Each of its colours is a slot, named by one character: `c` phosphor, `w` wood, `m` iron... The art never
holds real colours: the theme's `px` says what colour each slot is, so the same drawing serves every theme.

- Draw with the key palette's exact colours only. Every pixel is one of them, or fully transparent. Anything else
  (a blended edge, a half-transparent pixel) is refused, with the file and the pixel's position.
- A sheet is a family's `<family>.png` with its `<family>.json` (Aseprite's "JSON hash" export: the rectangle of each
  frame in the PNG). Put both in the theme's folder and add the family to `art`.
- A sheet holds only the frames you redraw, each named and sized as the default art's (the table below). Every frame
  you leave out stays the default one.
- A frame name this version of the app does not know is ignored, with a warning: the theme still loads, without that
  frame. So a pack drawn for a newer Administratum, whose sheets carry frames added since, still works in an older
  one (the older one just does not show them). The same goes for a misspelt name, so read the warnings: the check
  below lists them. Everything else stays a refusal: a known frame at another size, a fill rule or anchor naming a
  frame or key the default lacks, a pixel off the palette, the limits.
- The `.json` may also carry `meta.anchors` (where a character holds its scroll, where a light sits) and, for the
  room's tiles, `meta.tiles` (how a tile fills: `repeat`, `nine`...), each with the default's shape. The simplest
  start is the default's own file: `ui/art/<family>.json`, or the same family in a world's folder.
- The 2.5D view's furniture is cut from the flat frames by `faces.json` / `faces.png`. A world copied from
  `ui/art/<id>/` brings its own; a new world uses the default ones.

To see every sprite as the app draws it, serve a clone of the Administratum repository (`python -m http.server 8123`
at its root) and open `http://localhost:8123/tools/sprites.html`, or browse the gallery in [`docs/sprites/`](sprites/README.md).
`node tools/sprite_sheet.mjs --list` names every sprite and its family. The viewer shows the shipped themes only;
your own you see in the app.

**The families and their frames**, from the default art. Regenerate this table with
`node tools/theme_pack.mjs families`. A frame you redraw keeps the size given here (width x height, in art pixels);
the families marked 2.5D are the characters of the 2.5D view. The frames listed as optional are the scribe's
gestures (below): the default art does not draw them.

| Family | Frames (name width x height, in art pixels) |
|---|---|
| `scribe` | `down 0` 32x34, `down 1` 32x34, `down 2` 32x34, `up 0` 32x34, `up 1` 32x34, `up 2` 32x34, `right 0` 32x34, `right 1` 32x34, `right 2` 32x34, `arm` 8x16; optional: `up think` 32x34, `up wonder` 32x34, `up stretch` 32x34 |
| `adept` | `down 0` 24x28, `down 1` 24x28, `down 2` 24x28, `up 0` 24x28, `up 1` 24x28, `up 2` 24x28, `right 0` 24x28, `right 1` 24x28, `right 2` 24x28, `glyph explore` 10x5, `glyph plan` 10x5, `glyph general` 10x5, `glyph custom` 10x5 |
| `magos` | `body` 48x48, `arm` 10x48, `claw` 6x3 |
| `watch` | `down 0` 32x36, `down 1` 32x36, `down 2` 32x36, `up 0` 32x36, `up 1` 32x36, `up 2` 32x36, `right 0` 32x36, `right 1` 32x36, `right 2` 32x36, `ring` 32x36 |
| `workstations` | `DESK` 64x42, `LECTERN` 44x42, `CONSOLE` 28x20, `SHELL_COG_0` 12x12, `SHELL_COG_1` 12x12, `SHELL_COG_2` 12x12, `SHELL_COG_3` 12x12, `SHELL_COG_4` 12x12, `SHELL_COG_5` 12x12, `SHELL_COG_6` 12x12, `SHELL_COG_7` 12x12, `SHELL_COG_8` 12x12, `SHELL_COG_9` 12x12, `SHELL_COG_10` 12x12, `SHELL_COG_11` 12x12, `SHELL_COG_12` 12x12, `SHELL_COG_13` 12x12, `SHELL_COG_14` 12x12, `SHELL_COG_15` 12x12 |
| `cogitator` | `COGITATOR` 164x100 |
| `sanctum` | `THRONE` 40x40, `LORD_DESK` 88x26, `COG_MECH` 40x36, `SEAL` 12x20 |
| `gate` | `GATE` 64x60, `GATE_L` 16x44, `GATE_R` 16x44, `GATE_VOID` 32x44 |
| `refectorium` | `RECAFF` 32x36, `TABLE` 92x16, `BENCH` 92x8, `DOZE_Z` 7x7 |
| `walls` | `WINDOW` 32x34, `BANNER` 24x30, `SHELF` 64x42, `GAUGE` 12x12, `CENSER` 10x20, `WINDOW_TALL` 36x84, `HANGING` 26x100, `HANGING_B` 26x100, `SHELF_B` 64x42 |
| `clutter` | `PAPER_STACK` 16x24, `SCROLL_PILE` 36x14, `BOOKS` 20x18, `LOOSE_A` 10x8, `LOOSE_B` 8x10, `CRATE` 28x24 |
| `skull` | `SKULL` 20x20 |
| `petitions` | `SCROLL` 12x14, `QSCROLL` 12x14, `SCROLL_HELD` 28x14 |
| `fire` | `BRAZIER` 20x26, `CANDLES` 24x18, `BRAZIER_FIRE_1` 10x9, `BRAZIER_FIRE_2` 10x9, `CANDLES_FIRE_1` 24x8, `CANDLES_FIRE_2` 24x8 |
| `commits` | `COMMIT_SEAL` 8x15, `COMMIT_TAG` 8x15, `COMMIT_STAMP` 8x12 |
| `breakout` | `BREAKOUT_FLOOR` 16x16, `BREAKOUT_RAIL` 16x10, `BREAKOUT_SIDE` 4x16, `BREAKOUT_POST` 6x14, `BREAKOUT_GATE` 4x16, `BREAKOUT_GATE_OPEN` 16x10, `BREAKOUT_GATE_FRONT` 16x20, `BREAKOUT_GATE_FRONT_OPEN` 16x20 |
| `suzerain` | `DAIS` 80x54, `DAIS_C` 60x54, `LINK_H` 8x6, `LINK_V` 6x8, `LINK_END` 10x8 |
| `honours` | `HONOURS` 72x96 |
| `lift` | `SHAFT` 56x16, `SHAFT_TOP` 56x12, `SHAFT_PIT` 56x8, `CABLE` 2x4, `CAR_BACK` 52x40, `CAR_FRONT.shut` 52x40, `CAR_FRONT.half` 52x40, `CAR_FRONT.open` 52x40, `SLAB` 16x12, `SLAB_L` 8x12, `SLAB_R` 8x12, `LAMP.off` 6x6, `LAMP.on` 6x6 |
| `enclave` | `ENCLAVE_FLOOR` 16x16, `ENCLAVE_RAIL` 16x10, `ENCLAVE_SIDE` 4x16, `ENCLAVE_POST` 6x14, `ENCLAVE_GATE` 4x16, `ENCLAVE_GATE_OPEN` 16x10, `ENCLAVE_GATE_FRONT` 16x20, `ENCLAVE_GATE_FRONT_OPEN` 16x20 |
| `room-floor` | `floor` 8x8, `channel h` 8x4, `channel v` 4x8, `sanctum passage` 4x4, `sill` 24x4, `floor vent` 8x8, `floor bolts` 8x8, `sanctum floor` 40x40 |
| `room-walls` | `wall top` 24x20, `wall` 24x20, `wall east top` 24x20, `wall east` 24x20, `wall sanctum top` 24x20, `wall sanctum` 24x20, `wall foot` 4x4, `wall dark` 4x4, `wall base` 4x6, `sanctum base` 4x6, `pillar` 20x8, `pilaster` 8x39, `beacon off` 14x20, `beacon on` 14x20, `beacon cage` 14x20 |
| `room-pipes` | `pipe h` 8x6, `pipe v` 6x8, `fitting h` 6x10, `fitting v` 10x6, `fitting wide` 20x4 |
| `room-doors` | `door sanctum closed` 20x80, `door sanctum half` 20x80, `door sanctum open` 20x80, `door refectory closed` 20x48, `door refectory half` 20x48, `door refectory open` 20x48 |
| `scribe39` (2.5D) | `E 0` 32x34, `E 1` 32x34, `E 2` 32x34, `W 0` 32x34, `W 1` 32x34, `W 2` 32x34, `S 0` 32x34, `S 1` 32x34, `S 2` 32x34, `N 0` 32x34, `N 1` 32x34, `N 2` 32x34, `arm` 10x16, `armL` 8x16, `scroll` 10x14; optional: `N think` 32x34, `N wonder` 32x34, `N stretch` 32x34 |
| `adept39` (2.5D) | `E 0` 24x28, `E 1` 24x28, `E 2` 24x28, `W 0` 24x28, `W 1` 24x28, `W 2` 24x28, `S 0` 24x28, `S 1` 24x28, `S 2` 24x28, `N 0` 24x28, `N 1` 24x28, `N 2` 24x28, `glyph explore` 10x5, `glyph plan` 10x5, `glyph general` 10x5, `glyph custom` 10x5 |
| `magos39` (2.5D) | `body` 48x48, `arm` 10x48, `claw` 6x3 |
| `skull39` (2.5D) | `skull` 20x20 |
| `watch39` (2.5D) | `E 0` 32x36, `E 1` 32x36, `E 2` 32x36, `W 0` 32x36, `W 1` 32x36, `W 2` 32x36, `S 0` 32x36, `S 1` 32x36, `S 2` 32x36, `N 0` 32x36, `N 1` 32x36, `N 2` 32x36, `ring` 32x36 |

### Gestures

A scribe sitting at its desk can move a little, if your world draws it. Three optional frames, a closed list, each
with one meaning in every world. Draw any of them, or none: a gesture your world does not draw is simply not played,
and the scribe keeps its seated frame.

| Gesture | Flat (`scribe`) | 2.5D (`scribe39`) | When the app plays it |
|---|---|---|---|
| think | `up think` | `N think` | The session is working (`busy`) and the scribe is at its desk: every 8 to 15 s, for 2.5 s |
| wonder | `up wonder` | `N wonder` | Puzzled, at its desk: once after a tool error (just after the sparks on its screen), for 2 s; and while its turn's question waits at the desk (when questions do not queue in the Sanctum), every 10 to 15 s, for 2 s |
| stretch | `up stretch` | `N stretch` | Once, when its turn ends (busy, then idle) and it dozes off at its desk, for 2 s, before the Zs. Never just for sitting down |

- Each is the scribe seen from behind at its desk, the size of the frame it replaces (`up 0` flat, `N 0` 2.5D) with the
  feet at the same place: draw it over a copy of that frame.
- Each scribe keeps its own beat, so a department never thinks in unison.
- A gesture frame is the whole scribe: the arms the default robe lays over a seated scribe and the dozing Zs are not
  drawn over it. The ranks recolour it like every scribe frame.
- They go in the sheet that holds your own scribe (`up 0` flat; the 2.5D sheet is always whole), with `scribe` (or
  `scribe39`) in `art`. A gesture is played only with the body it was drawn for: one in a sheet without your own
  `up 0` (or `N 0`) is never seen, and `node tools/theme_pack.mjs check` warns about it.

---

## Checking a pack

From a clone of the Administratum repository (`git clone https://github.com/Arylmera/Administratum`), with
[Node.js](https://nodejs.org) 22 or later:

```sh
node tools/theme_pack.mjs check path/to/my-pack            # every theme of the pack
node tools/theme_pack.mjs check path/to/my-pack/vault-pink # one theme, in its pack
```

It loads the pack the way the app does, with the same checks, art included, and prints one line per problem, then a
count:

```
workshop: workshop/theme.json: px.r: not a #rrggbb colour
1 theme ok, 1 with problems
```

It ends with exit code 0 only when there is none. Lines starting `warning:` name the files the installer would leave
out (a `.js`, a file two folders deep, a file over 2 MiB), a missing `pack.json` or licence, and a frame this version
of the app does not know (`is not a frame this version of the app knows: ignored`: a frame of a newer version, or a
typo). They do not fail the check, but those files will not reach anyone who installs the pack, and those frames are
not drawn by this version. The app says the same under Settings > Added themes, on the pack's line.

---

## Publishing

1. Put the pack in a **public GitHub repository**: `pack.json`, the licence and the theme folders at its root. The
   template's `README.md` is a start for yours.
2. Add a **licence** file (`LICENSE`, `LICENSE.md` or `LICENSE.txt`) saying what others may do with your work. The
   template is MIT, with your name to fill in. Art you copied from Administratum stays MIT, © 2026 Guillaume Lemer
   (Arylmera): keep its line in your licence.
3. Run the check one last time and push.

Others install it from Settings → Hall → **Added themes**: type `owner/repo`, *Install*, then *Restart to apply*. The
app downloads the repository's default branch as it is at that moment. There is no catalogue of packs: share your `owner/repo`
yourself.

When you publish a change, others get it in one of three ways, all from GitHub, all followed by a restart:

- *Update* on your pack's line in Settings → Hall → **Added themes**.
- *Update all* under the list, for every pack installed from GitHub, one after the other. A pack that fails is
  reported; the others carry on. If one changed and none failed, the app restarts at once.
- The startup check, on by default (*Check added themes for updates at startup*). A few seconds after start, the app
  downloads each pack from GitHub and compares it with the installed one; it installs nothing. If at least one
  changed, a toast names them: *Update* updates those packs and restarts, *Later* (or ignoring the toast) leaves
  everything as it is. A pack it cannot reach is skipped without a word.

A download identical to the installed pack replaces nothing: the folder and its install date stay. A local pack is
never checked nor updated.

Once your local draft is published and you install it from GitHub, its themes' ids change from
`local/<folder>:<theme>` to `owner/repo:<theme>`: pick the theme again in Settings, and delete the draft folder yourself,
or you have two copies.

A local pack, a folder you put in the themes folder yourself, has no *Remove* button in Settings, and the app never
deletes it: to remove a draft, delete its folder yourself, then restart. *Remove* is for packs installed from GitHub.

---

## What a pack cannot do

- **Run code.** A pack is data: JSON parsed, PNG decoded, nothing evaluated. The installer keeps only `pack.json`, a
  licence, and `.json` and `.png` files one folder deep; the rest of the repository is left behind.
- **Change behaviour.** A theme changes colours, wording and pixel art. Where characters walk, what the hall shows and
  when, the rooms' layout: those are the app's, the same for every theme.
- **Reword what keeps you safe.** A pack's `text` may not set `risky` (the warning on a risky command), `rejectAll`
  (what *Deny* also refuses), `toast.failed` (an answer not sent) nor anything under `prefs.packs` (this list's own
  buttons and lines): a theme that does is left out, with its reason. A world may reword the Night Vigil button's
  tooltip (`watch.button`), since it names the world's watchman.
- **Depend on another pack.** A style's base is a theme of its own pack or one the app ships.
- **Apply without a restart.** Install, update, remove, or a change in a local folder: all take effect at the next
  start.
- **Be larger than** 2000 files, 50 MiB unpacked, 20 MiB as GitHub's archive; a file over 2 MiB is left out. A PNG is
  at most 2048 px a side, a sheet at most 1024 frames.

A theme that fails its check is left out, with its reason on its pack's line in Settings; the other themes of the
pack, and the app, carry on. If a theme fails while the hall is drawn, the app goes back to Ordo Administratum and
marks that theme as failing.
