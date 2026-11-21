# Rank art — a drawing and a colour per rank

Date: 2026-11-21. Status: draft, for the user's approval.

## Intent

A session's rank (`rankOf`: Opus/Fable = high, Haiku = novice, others = standard) must be readable at a glance,
**from behind** (the scribe at its desk, the view seen most), the way the Breaking Bad and Pelion packs already do it.
Today, in the 40k worlds, the rank is two small gilt details (hood rim, cog) and three near-identical dark reds
(`ui/theme.js` `TIER_II.rank`); the gold band people notice is the department sash (`y`), not the rank.

The user's brief for each rank:

| Rank | Character | Read |
| --- | --- | --- |
| novice (Haiku) | a low-level machine agent | iron and grey, dull, an optic glow, no ornament |
| standard (Sonnet) | a classic agent, clean and normal | the Ordo's robe, plain and neat, no gilt |
| high (Opus/Fable) | very pompous, rich colours, ornate | deep rich robe, gilt everywhere, a mantle or stole, ornaments |

## Goals

- Each rank has its own **drawing** (silhouette and details), not only its own colours.
- Each rank has its own **colour**, distinct from the other two at a glance, front, back and side.
- Scribes **and** adepts, in **both views** (Flat 3/4 and 39°).
- Theme packs can ship their own rank frames.

## Non-goals

- No change to `rankOf` or to the rank names.
- No redraw of the non-40k worlds in this project (they keep their frames through the fallback).
- No change to the department sash: it keeps meaning the department.

## Anti-goals

- A rank that reads only by a few pixels of trim (today's problem).
- Ranks that make the five Ordos look the same at the standard rank.
- A world that looks different after this change without having drawn anything (the fallback must be exact).

## Constraints

- Shared face-based art, views Flat + 39° only (project memory).
- Art drawn in the key palette `ui/art/key.gpl`; a new palette slot goes into `key.gpl` and `BASE` together.
- Theme packs are untrusted: their sheets go through `ui/artcheck.js` (`knownFrames`, `checkSheet`).
- The rank palette (`T.rank[r].robe` / `.adept`) keeps being laid over whatever frame is drawn.

## Approaches

| | Approach | Trade-off | Verdict |
| --- | --- | --- | --- |
| O5 | Rank-prefixed frames in the same sheet (`high up 0`, `novice N 1`), lookup `<rank> <frame>` then `<frame>` | sheets grow ~3x; no new family, fallback per frame, packs and themes work through the existing per-frame lookup | **picked by the user** |
| O6 | One sheet per rank (`scribe-high.png`) | own anchors per rank, but 8 new families to wire into the catalogue, artcheck, themepack and the "complete 39° sheet" rule | set aside |
| — | Overlay layers over the shared body | can only add pixels, cannot change the silhouette the novice machine needs | dropped |

## Design

### Engine (`ui/sprites.js`, `ui/actors.js`)

- Families `scribe`, `scribe39`, `adept`, `adept39` accept optional frames named `<rank> <frame>`, `<rank>` one of
  `RANKS` (`high`, `standard`, `novice`), `<frame>` any frame the family already knows, gestures included
  (`high up think`, `novice N stretch`).
- Lookup, per drawn frame: `<rank> <frame>` from the **same source** as `<frame>` (see the calls below), else `<frame>`
  as `useArt`'s `src` resolves it today.
- The **own-body rule** extends to ranks: a rank's gesture, arm, scroll or kind glyph is used only with the body it was
  drawn for (the same source and the same rank as that rank's seated / `down 0` frame); otherwise the plain one, under
  the same rule as today.
- The exports gain a per-rank layer, e.g. `SCRIBE.rank.high.up[0]`, filled only where a rank frame exists, so
  `bodyOf` / `bodyOf39` pick `SCRIBE.rank[r]?.[dir]?.[i] ?? SCRIBE[dir][i]`. Left still mirrors right in the flat view.
- **Anchors:** `meta.anchors` may hold an optional object per rank (`"high": { "arm": [27, 18] }`), only keys the base
  anchors know, laid over the base anchors for that rank.
- 39° families: rank frames are optional; a sheet stays "complete" by today's rule, rank frames are never required.

### Checks (`ui/artcheck.js`, `ui/themepack.js`)

- `knownAs` accepts `<rank> <frame>` for these four families when `<frame>` is known, held to the size of `<frame>`.
- Rank anchors checked with `shape` against the base anchors.
- A rank gesture without its rank seated frame in the same sheet: a warning, as `gestureWarnings` does today.

### Art (base 40k art, shared by Ordos A–E)

- `ui/art/scribe.png` + `scribe39.png`: `high *` and `novice *` frames, every direction and walk frame, plus the
  gestures. Standard keeps the current frames (no `standard *` frames needed).
- `ui/art/adept.png` + `adept39.png`: the same for adepts.
- novice: a servitor-like machine agent — metal plates, a cable or tube, a visible optic, a plainer, narrower form.
- high: a fuller robe with a mantle or stole, gilt hem and hood, ornaments (seals, chains, a larger cog), visibly
  "pompous" from behind.

### Colours (`ui/theme.js` `TIER_II.rank` and the Ordo themes B–E)

- **standard** keeps each Ordo's robe colour (Ordo identity lives on the most common rank).
- **novice** and **high** take the same look in every 40k Ordo: novice iron / grey, high a rich deep robe (crimson or
  purple) with heavy gilt, overriding each Ordo's `rank.high` / `rank.novice`.
- New palette slots only if the drawings need colours no slot carries (jewels, a second trim).

### Tools and docs

- `tools/sprite_catalog.mjs`: the `SCRIBE.<rank>.*` / `ADEPT.<rank>.*` rows show the rank frames, not only the rank
  palette; the galleries in `docs/sprites/` regenerated.
- `docs/theme-packs.md` and `docs/theme-pack-template/README.md`: the rank-frame naming, fallback and anchor rule.
- `docs/DEVELOPMENT.md`: one line where the art model is described.

## Proof

- `ui/sprites.test.mjs`: a rank frame is picked when present, the plain frame otherwise; a themed rank frame beats the
  base's; the own-body rule for rank gestures; per-rank anchors.
- `ui/artcheck.test.mjs`: rank frames known, wrong size refused, unknown rank refused, rank anchors checked.
- A gate that fails both ways: every non-40k theme renders exactly as before (sprite cache rows identical), and the
  40k themes' high and novice rows differ from standard.
- `node ui/art.test.mjs`, `node ui/sprites.test.mjs`, the whole suite; galleries regenerated; checked in the live
  sprite viewer, then in the installed app.

## Calls settled after the builder check (Claude's calls, the user may overturn them)

- **Same source.** A rank frame is used only when it comes from the same source (theme, `artOf` or base) as the plain
  frame it replaces. A theme with its own scribe or adept never picks up the base's rank frames. So only the themes
  that draw the base scribe and adept (Ordos A–E) change; every other world is the "exact fallback" gate.
- **Sash stays on every rank.** Every rank body keeps a `y` area, readable front, back and side: the novice machine
  as a band or a painted plate, high under its mantle. High's gilt uses the brass and rank slots (`g G h t T z j`),
  never `y`, and sits on the hood, the hem and the ornaments, away from the sash. Sash 0 (gold) stays as it is.
- **Standard is today's art.** Standard has no gilt today (the hood rim and cog take the robe colour, `plain`). The
  brass buckle stays. Standard is not redrawn.
- **Colours.** High and novice get one shared look, written in `TIER_II.rank` and in the `rank` of Xenos
  (`ui/art/xenos/theme.json`) and Malleus (`ui/art/night/theme.json`), which set their own today. Machinum and
  Hereticus set none and inherit. The theme tests that pin those colours are updated with them.
- **Stages.** 1) engine, checks, docs and tests, with no visible change; 2) the art, family by family (scribe,
  adept, then scribe39 and adept39), each shown to the user in the sprite viewer before the next one. Rank frames
  are optional, so each stage ships on its own.
- **Mixed sets are allowed.** A rank can be drawn in one view and not in the other, or without its gestures: the
  plain frame fills the gap. `node tools/theme_pack.mjs check` warns when a rank has frames in one view only. For the
  base 40k art, this project draws every frame of high and novice, in both views.
- **Arms and scroll stay shared.** The 40k mechadendrites, the scroll and the kind glyphs stay single frames.
  Per-rank anchors (`meta.anchors.<rank>`) can move them on a rank's body; no per-rank arm frames in this project.

## Left to the builder

- The exact pixel designs (reviewed by the user in the sprite viewer before they are final).
- The exact high and novice hex colours, within the read above.
- The export shape for the per-rank layer, if a cleaner one fits `refill`.
- Whether the father's packs are told through Synedrium once the format ships (the user decides when).
