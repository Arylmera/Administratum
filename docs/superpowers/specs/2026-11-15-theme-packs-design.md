# Theme packs

Status: built, in two pull requests in this order: **A. themes as data** (plan
`docs/superpowers/plans/2026-11-15-themes-as-data.md`), then **B. packs from outside** (plan
`docs/superpowers/plans/2026-11-16-theme-packs-from-outside.md`).

## Intent

People who use Administratum want to make their own theme and share it without sending a pull request here. A theme
is already close to a package: a block of colours and wording, and for a full world a folder of art. This design
finishes that separation, so a theme is plain files that can live in any public GitHub repository and be installed
by typing `owner/repo` in Settings.

The distribution stays simple on purpose: no catalogue, no registry, no dependencies between repositories. Whoever
wants variants of someone else's world copies the world into their own repository and adds styles there. That only
works if the worlds this repository ships are in the same format as a pack, which is why part A comes first.

## Goals

- A theme is data: JSON and PNG, nothing executed.
- The themes shipped in the installer and the themes of a pack use one format and one loader.
- A repository is a collection: any number of worlds and styles.
- A style is a recolouring of a world: the world's art, its palette turned by hue bands, its own wording, and a few
  sheets of its own if it wants.
- Install, update and remove from Settings, by `owner/repo`.
- An author can try a pack from a local folder before publishing, and check it with one command.

## Non-goals (this version)

- No in-app catalogue or search.
- No style whose world lives in another repository. Copy the world instead.
- No automatic updates of packs.
- No choosing inside a repository: installing takes all of it; the world and style pickers do the sorting.
- No hot install: a pack appears after a restart.
- No sprite viewer or gallery pointed at a pack (`tools/sprites.html`, `tools/sprite_sheet.mjs` stay on this
  repository's art). Listed under Later.
- No behaviour in a pack. What the code does for one world only (the Arcane Tower's idle familiar,
  `actors.js`) stays code and stays with the shipped worlds.

## Anti-goals

- A pack that can run code, or reach the app's commands. The window runs with `csp: null` and `withGlobalTauri`, so
  code in a theme could answer a petition. A pack is never evaluated, only parsed.
- A broken pack that stops the app from starting, or changes how a shipped theme looks.
- Any visible change to the fourteen shipped themes from part A.

## Constraints found in the code

- `ui/themes.js` registers every theme beyond Ordo Administratum with `defineTheme({...})`. It is not pure data:
  the four accent themes (Corpo Tower, Rain City, Green Code, Sunset Drive) are computed by `accent(NEON, { bands })`
  through `rehue`, and Breaking Bad builds its ranks from constants (`BB`, `bbFace`). No theme in it uses `ink` as a
  function; only the base theme does (`theme.js`, `inkOf`).
- The base theme, Ordo Administratum (`theme.js`: `BASE`, `TEXT`, `LIGHT`, `TIER_II`), is what every theme is laid
  over and where a missing sheet falls back. It stays code.
- `sprites.js` and `faces.js` load the art of every registered theme in a top-level `await` when the module loads.
  The registry must therefore be complete before they run.
- `art.js` `read()` resolves every art file against `./art/`. `loadSheet` already rejects a pixel outside
  `ui/art/key.gpl` and a half-transparent one, naming the file and the pixel.
- A theme with `artOf` draws with another theme's art folder (`sprites.js` `dirOf`). The accents use it.
- `accent()` turns only the values its base theme declares itself, not the base's resolved look. That is enough for
  Neon Grid, which declares nearly everything; it would not be for a world that leans on Ordo Administratum.
- A world's folder also holds `faces.json` / `faces.png` (the 39° volumes, `faces.js`), and a sheet's JSON may replace
  the base's `meta.anchors` and `meta.tiles` (`sprites.js` `sheetOf`). Only `art.test.mjs` checks those today, not
  the app.
- Not every theme value is a colour: `ui['--display']` is a font stack (pinned by `theme.test.mjs` to the two
  bundled families), and `light.night` / `light.beam` are bare `r,g,b` triples.
- The phone keeps its own theme choice (`mobile.js`): the desktop's by default, its own once picked there.
- `BANDS` in `themes.js` names four hue ranges (pink 300 to 345, violet 260 to 300, night 210 to 260, cyan 165 to
  210): they are Neon Grid's. A recolouring of another world needs ranges of its own.
- `WORLDS` (`theme.js`) maps a world id to its name; Settings fills the world picker from it and the style picker
  from the themes of that world.
- The phone view (`mobile.js`) imports the same theme modules, served by the remote server through one closure
  (`remote/app.rs`, `asset`).
- The art generators (`tools/*_art.mjs`) write into `ui/art/<world>/`, and the art gate reruns the gallery for every
  folder under `ui/art/`.
- `reqwest`, `tar` and `flate2` are already in `Cargo.lock` through the updater plugin.
- Settings are stored under `app_config_dir`, the Chronicon under `app_data_dir`.
- Licence: MIT, code and art. Copying a shipped world into a pack is allowed as long as the notice is kept.

## Approaches

Three ways to get a pack into the app were considered.

1. **A folder on disk, filled by the app** (chosen). The backend downloads the repository's archive into
   `<app data>/themes/`, and serves those files to the window and to the phone. Files stay plain and visible; an
   author drops a folder there by hand to try a pack; one read path serves both views. Costs some Rust.
2. **All in the UI.** The page fetches the files from `raw.githubusercontent.com` and keeps them in the webview's
   storage. No Rust, but the state is hidden, the phone has to fetch everything again on its own, and an author
   cannot try a pack without publishing it.
3. **No install in the app.** The user clones a repository into the themes folder. Simplest, but it is not "type
   `owner/repo`". It is in fact the first half of approach 1, which is the order part B is built in.

Christian chose approach 1, in two pull requests.

## The format

One folder per theme, the layout `ui/art/<theme>/` already has, plus a `theme.json`:

```
<theme>/
  theme.json        the theme: colours, wording, what it redraws
  scribe.png        its own art, only the families it redraws,
  scribe.json       only the frames it changes (as today)
  ...
```

The folder's name is the theme's id. `theme.json` holds what a `defineTheme` call holds today, as JSON:

| Key | Meaning |
|---|---|
| `format` | `1` |
| `name` | The style's name in Settings |
| `world`, `worldName` | A world theme: the world's id, and its name when the world is new |
| `base` | A style: the id of the theme it recolours. It takes that theme's world, art and wording, and its whole resolved look |
| `bands` | A style: the hue ranges to turn, each `{ "hue": [from, to], "to": degrees, "sat": factor, "light": shift }`. They turn the base's resolved look (palette, ranks, ink, lights, chrome colours), not only what the base declares. Skin slots (`:` and `;`) are never turned |
| `art` | The art families this folder redraws |
| `px`, `sash`, `rank`, `ink`, `light`, `ui`, `text` | As in `theme.js` today, each only what changes. `ink` is an object, never a function. In a style they are laid over the recoloured base |
| `notes` | Free text for authors (what today's comments say about the art). Never read by the app |

A theme has either `world` or `base`, never both. `base` names a theme that has no `base` itself: a world theme of
the same pack, or any theme shipped in the installer, Ordo Administratum (`tier2`) included.

A theme's folder may also hold `faces.json` / `faces.png`, and its sheets may carry their own anchors and fill
rules, exactly as a shipped world's folder does, so a copied world keeps its 39° art.

A `world` id is the pack's own: two packs that both say `steampunk` are two worlds, each with its `worldName`. The
one exception is the id of a shipped world (`w40k`, `vault`...): a pack's theme that names it joins that world as
one more style, the way the Ordos are styles of Warhammer 40k without being recolourings.

A **pack** is a repository holding such folders at its root, any number of them, plus a `pack.json`
(`{ "format": 1, "name": "..." }`) and a licence file. A style's `base` is a theme of the same pack or a theme
shipped in the installer.

## Part A: themes as data

No visible change. One pull request.

- Each of the fourteen themes of `themes.js` becomes `ui/art/<id>/theme.json`. The accents are written as authored,
  `base` and `bands`, not as their computed result; their `bands` are translated from the four names to hue ranges.
  Breaking Bad's constants are written out as values.
- One recolouring rule for every style: the bands turn the base's resolved look. Where that gives a shipped accent
  a value different from today's (a slot Neon Grid inherits rather than declares), the conversion script writes
  today's value into that accent's `theme.json` as an explicit override, so the four accents come out identical.
- `ui/art/themes.json` lists the shipped theme ids in today's order (the order of the pickers and of the sprite
  viewer's columns). A browser cannot list a folder.
- `themes.js` becomes the loader: it reads the list, reads each `theme.json`, checks it, and registers it. The
  recolouring (`rehue`, `recolour`) moves into it as a function of the data, with ranges instead of names.
- Every module that walks `THEMES` when it loads depends on the loader, so the registry is complete first.
- `art.js` reads a theme's files from that theme's own location rather than from a fixed `./art/<id>/`, so part B
  only has to supply another location.
- `WORLDS` keeps the shipped worlds; a theme's `worldName` adds one.
- Proof of no change: a conversion script (`tools/themes_to_packs.mjs --from <git ref>`) reads the old `themes.js`
  from that ref (`git show`), writes the files, and compares `resolve()` of every theme before and after, key by
  key. A rebase over new theme work reruns it against the new base instead of resolving conflicts by hand. It is a
  one-off, says so in its header, and can be deleted once the pull request is merged. The
  existing tests (theme contrast, flat hall hashes, 39° pixel hashes, art gate) stay green unchanged.
- `README.md`: the trademark notice gains Fallout and Breaking Bad beside Warhammer 40,000. `docs/DEVELOPMENT.md`
  ("Sprites and themes") describes the new files.

## Part B: packs from outside

### What the user sees

```
Settings > Hall
  Theme   [ Fallout          v ]     Style  [ Pink vault v ]

  Added themes
    alice/adm-vault-pink     2 styles                    [Update] [Remove]
    bob/adm-steampunk        1 world, 3 styles           [Update] [Remove]
    my-draft (local folder)  1 world   ! scribe.png, pixel 12,4: not a key.gpl colour

  Add from GitHub   [ owner/repo            ] [Install]
```

- **Install** downloads the repository's default branch, checks it, stores it, and asks for a restart. After the
  restart its worlds and styles are in the pickers like any other.
- **Update** downloads it again and replaces it. **Remove** deletes it. Both by hand, both ask for a restart.
- A theme that fails its check is left out and its reason shown on its pack's line. The other themes of the pack,
  and the app, are unaffected.
- If the active theme is gone at start (pack removed, theme now failing), the app shows Ordo Administratum, as it
  already does for an unknown id.
- The phone offers the same themes as the desktop, packs included, and keeps its own choice as today.

### Where a pack lives

`<app data>/themes/<owner>__<repo>/`, the repository's folders as they are, plus a small file recording the source
(`owner/repo`, when it was installed). A folder there without that file is a local pack: an author's draft, shown
as such, never updated by the app.

A pack's themes get ids prefixed by their pack (`alice/adm-vault-pink:pink`), so two packs, or a pack and the
installer, can hold a theme of the same name. A `base` is looked up in the same pack first, then in the installer.

### Backend

- Commands to list the packs on disk, install one from `owner/repo`, update one, remove one.
- Download: the repository's archive from GitHub over HTTPS, default branch. Limits on the archive's size and file
  count. Only `pack.json`, a licence file, and `<folder>/*.json` and `<folder>/*.png` one level deep are kept; any
  other entry, a link, or a path leaving the folder is dropped. Written to a temporary folder, then renamed into
  place, so a failed install leaves nothing half-written.
- One read path for a pack's files, used by the window and by the remote server (behind its existing auth). It
  serves `.json` and `.png` from inside `themes/` only.

### UI

- The loader of part A also reads the installed packs, after the shipped themes, and never lets a pack's failure
  reach them.
- The check, applied to shipped themes and packs alike: known keys and types; every value is of the kind its key
  takes and nothing else (a hex, `rgb()` / `rgba()` or a bare `r,g,b` triple for a colour; for `ui['--display']`
  one of the bundled font stacks; so no `url()` anywhere); `base` resolves; `art` names known families and every
  sheet passes `loadSheet` with the base frame sizes; face sheets, anchors and fill rules have the shape the
  drawing code reads (what `art.test.mjs` asserts today, moved into code the app, the tool and the test share).
- A second net behind the check: if drawing with a pack's theme throws, the app goes back to Ordo Administratum
  and marks that theme as failing, with the error, on its pack's line.
- A pack's wording is only ever shown as text, never as markup.
- Settings: the "Added themes" list and the install field, with their wording in `TEXT` like the rest.

### For authors

- `node tools/theme_pack.mjs check <folder>`: the same check as the app, from a clone of this repository, on a pack
  or a single theme folder. Exit code and one line per problem.
- `docs/theme-packs.md`: the format, the key palette, the families that can be redrawn and their frame sizes, how to
  try a pack from the local folder, how to publish.
- `docs/theme-pack-template/`: a pack to copy, with one style of a shipped world and one small world, MIT by
  default.

## Left to the builder

- The exact names of commands, files and JSON keys beyond those in the table.
- How the window reads a pack's files (a custom URI scheme or a command returning bytes), as long as there is one
  path and the phone gets the same files.
- The size and count limits of a download.
- Whether `art` could later be derived from the files present instead of listed.

## Carried over from part A

Found while building part A and left for part B, where packs make them matter:

- The check should refuse an `art` name that is not a known family itself (today `sprites.js` does, before any read).
- A colour's components are not range-checked (`rgb(300,0,0)` passes).
- In the browser, an error on a theme's sheet names the file but not the theme's folder.
- A style with its own `art` draws its own sprites but its base's face sheets (`faces.js`); no shipped style has
  any.

## Later

- The sprite viewer and the gallery on a pack.
- Install without restart.
- `owner/repo@tag`.
- A notice when an installed pack has a newer version.

## Pull requests

Both branches are built on `linux` (pull request #28), which already changes `themes.js`, `theme.js`, `settings.js`
and `app.js`. Part A can be offered once #28 is in; part B is built on part A.
