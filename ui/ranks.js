// Ranks: who a session's scribe (or a subagent's adept) is, by its model. Pure, no imports (artcheck.js reads it).
// Rank by model: opus/fable high, haiku novice, anything else (sonnet, unknown) standard. Edit here.
// Its colours (robe, adept) are the theme's T.rank[rank], its name the theme's wording t(`rank.${rank}`).
export const rankOf = model => (/opus|fable/i.test(model ?? '') ? 'high' : /haiku/i.test(model ?? '') ? 'novice' : 'standard');
export const RANKS = ['high', 'standard', 'novice'];
// The character families that may draw a rank its own body: frames '<rank> <frame>' (spec 2026-11-21-rank-art), each
// at the size of its plain frame, used only from the plain frame's own source (sprites.js rankLayer). Never ranked:
// the arms, the scroll and the kind glyphs, laid over any body.
export const RANK_FAMILIES = ['scribe', 'adept', 'scribe39', 'adept39'];
export const ranked = n => !['arm', 'armL', 'scroll'].includes(n) && !n.startsWith('glyph ');
// The rank and the plain frame of a rank frame's name ('high up 0' -> ['high', 'up 0']), or null.
export const rankPart = n => { const i = n.indexOf(' '), r = n.slice(0, i); return i > 0 && RANKS.includes(r) ? [r, n.slice(i + 1)] : null; };
