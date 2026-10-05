// Tier II palette and pixel maps (ported from the Claude Design board "Tier II — Data-Shrine").
export const BASE = {
  k: '#0e0a08', g: '#b8742e', G: '#6e3f17', p: '#d6c79f', P: '#a8946a', w: '#4a3020', W: '#2e1c12',
  m: '#5a5e63', M: '#2a2c30', c: '#7cff9e', C: '#16301f', f: '#f0a83c', F: '#ffe6a0', x: '#8e1c16',
  b: '#cfc3a8', B: '#948669', n: '#140c08', u: '#2b3f5e', v: '#2f4a33', r: '#5e1710', d: '#3a0d09',
  a: '#ff3a20', o: '#7cff9e', y: '#d9a84e', s: '#b89a7c', e: '#120c0a',
  // HD mid-tones/highlights: robe lit, brass lit, iron lit, optic glint, wood lit
  R: '#8c2c1c', h: '#e8b45a', l: '#8a9096', O: '#e6ffee', L: '#6a4630',
};
export const SASH = ['#d9a84e', '#5fae7a', '#5a7ec9', '#c46a9a', '#c9b95a', '#6ac9c4', '#c97a4a', '#9a8ad9'];

export const RES = 2; // art pixels per logical pixel
// Nearest-neighbour 2x upscale of a hand-written map: each char doubles horizontally, each row doubles vertically.
// Phase 1 only (keeps the low-res maps as source); phase 2 can skip `up` for HD-native maps.
const up = map => map.flatMap(row => { const r = row.split('').map(c => c + c).join(''); return [r, r]; });

const cache = new WeakMap();
export function sprite(map, over = {}) {
  let byMap = cache.get(map);
  if (!byMap) { byMap = new Map(); cache.set(map, byMap); }
  const key = JSON.stringify(over);
  let cv = byMap.get(key);
  if (!cv) {
    const pal = { ...BASE, ...over };
    cv = document.createElement('canvas');
    cv.width = Math.max(...map.map(r => r.length));
    cv.height = map.length;
    const g = cv.getContext('2d');
    map.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) { g.fillStyle = col; g.fillRect(i, j, 1, 1); }
      }
    });
    byMap.set(key, cv);
  }
  return cv;
}

// Draws sprite(map, over) at logical (x, y); the HD sprite canvas is downscaled back to logical size.
export function blit(g, map, x, y, over) {
  const cv = sprite(map, over);
  g.drawImage(cv, x, y, cv.width / RES, cv.height / RES);
}

const mirror = map => map.map(row => row.split('').reverse().join(''));
const withFeet = (body, feet) => body.slice(0, -feet.length).concat(feet);

const SCRIBE_BACK = [
  '............kkkkkkkkkkkk........',
  '..........kkRRRRrrrrrrrrkk......',
  '........kkRRRrrrrrrrrrrrrdkk....',
  '.......kRRrrrrrrrrrrrrrrrrrdk...',
  '......kRrrrrrrrrrrrrrrrrrrrrdk..',
  '.....kRrrrrrrrrrrrrrrrrrrrrrrdk.',
  '....kRrrrrrrrrrrrrrrrrrrrrrrrddk',
  '....kRrrrrrrrrrrrrrrrrrrrrrrrddk',
  '....kRrrrrrrrrrkkkkkkrrrrrrrrddk',
  '....kRrrrrrrrrklmmmmMkrrrrrrrddk',
  '....kRrrrrrrrrkmkOokMkrrrrrrrddk',
  '....kRrrrrrrrrkmkookMkrrrrrrrddk',
  '....kRrrrrrrrrkMmmmMMkrrrrrrrddk',
  '....kRrrrrrrrrrkkkkkkrrrrrrrrddk',
  '....kRrrrrrrrrrrklMkrrrrrrrrrddk',
  '....kdRrrrrrrrrrkmMkrrrrrrrrdddk',
  '.....kdRrrrrrrrrkMMkrrrrrrrrddk.',
  '......kddrrrrrrrklMkrrrrrrrddk..',
  '....kkRrddddddddkmMkddddddddddkk',
  '....kRrrrrrrrrrrkMMkrrrrrrrrrddk',
  '....kRlmrrrrrrrrklMkrrrrrrrrlmdk',
  '....kRmMrrrrrrrrkmMkrrrrrrrrmMdk',
  '....kyyyyyyyyyyyyyyyyyyyyyyyyyyk',
  '....kyyyyyyyyyyyyyyyyyyyyyyyyyyk',
  '....kRrrrrrrrrrrrrrrrrrrrrrrdddk',
  '....kRrrrrrrrrrrrdrrrrrrdrrrdddk',
  '....kRrrrrrrrrrrRdrrrrrRdrrddddk',
  '....kdRrrrrrrrrrRdrrrrrRdrrddddk',
  '....kdRrrrrrrrrrRdrrrrrRdrdddddk',
  '....kddrrrrrrrrrRdrrrrrRdrdddddk',
  '.....kGgGgGgGgGgGgGgGgGgGgGgGk..',
  '......kkkkkkkkkkkkkkkkkkkkkkkk..',
  '.........klmmmmMk..klmmmmMk.....',
  '..........kkkkkk....kkkkkk......',
];
const SCRIBE_FRONT = [
  '............kkkkkkkkkkkk........',
  '..........kkRRRRrrrrrrrrkk......',
  '........kkRRRrrrrrrrrrrrrdkk....',
  '.......kRRrrrrrrrrrrrrrrrrrdk...',
  '......kRrrrrrrrrrrrrrrrrrrrrdk..',
  '.....kRrrrrrrrrrrrrrrrrrrrrrrdk.',
  '....kRrrrrrrRRRRRRRRRRRRrrrrrddk',
  '....kRrrrrRkkkkkkkkkkkkkkdrrrddk',
  '....kRrrrRkeeeeeeeeeeeeeekdrrddk',
  '....kRrrrRkeeeeeeeeeeeeeekdrrddk',
  '....kRrrrRkeeeOoeeeeOoeeekdrrddk',
  '....kRrrrRkeeeooeeeeooeeekdrrddk',
  '....kRrrrRkeeeeeeeeeeeeeekdrrddk',
  '....kRrrrRkeeeemMmMmMeeeekdrrddk',
  '....kRrrrRkeeeeeeeeeeeeeekdrrddk',
  '....kdRrrrRkkkkkkkkkkkkkkdrrdddk',
  '.....kdRrrrrrrrrrrrrrrrrrrrrddk.',
  '......kddrrrrrrrrrrrrrrrrrrddk..',
  '....kkRrddddddddddddddddddddddkk',
  '....kRrrrrrrrrrrrrrrrrrrrrrrrddk',
  '....kRlmrrrrrrrrrrrrrrrrrrrrlmdk',
  '....kRmMrrkyykrrrrrrrrrrrrrrmMdk',
  '....kyyyyyyyyyyyyyyyyyyyyyyyyyyk',
  '....kyyyyyyyyyyyyyyyyyyyyyyyyyyk',
  '....kRrrrkyyykrrrrrrrrrrrrrrdddk',
  '....kRrrrkykykrrrdrrrrrrdrrrdddk',
  '....kRrrrkykykrrRdrrrrrRdrrddddk',
  '....kdRrrrkrkrrrRdrrrrrRdrrddddk',
  '....kdRrrrrrrrrrRdrrrrrRdrdddddk',
  '....kddrrrrrrrrrRdrrrrrRdrdddddk',
  '.....kGgGgGgGgGgGgGgGgGgGgGgGk..',
  '......kkkkkkkkkkkkkkkkkkkkkkkk..',
  '.........klmmmmMk..klmmmmMk.....',
  '..........kkkkkk....kkkkkk......',
];
const SCRIBE_SIDE = [
  '............kkkkkkkkk...........',
  '..........kkRRRRrrrrkk..........',
  '........kkRRRrrrrrrrrrkk........',
  '.......kRRrrrrrrrrrrrrrrk.......',
  '......kRrrrrrrrrrrrrrrrrrk......',
  '......kRrrrrrrrrrrrrrrrrrrk.....',
  '......kRrrrrrrrrrrrRRRRRRRRk....',
  '......kRrrrrrrrrrRkkkkkkkkkk....',
  '......kRrrrrrrrrrRkeeeeeeeek....',
  '......kRrrrrrrrrrrkeeeeeeeek....',
  '......kRrrrrrrrrrrkeeeOoeeek....',
  '......kRrrrrrrrrrrkeeeooeeek....',
  '......kRrrrrrrrrrrkeeeeeeeek....',
  '......kRrrrrrrrrrrkeeeemMmMk....',
  '......kRrrrrrrrrrrkeeeeeeeek....',
  '......kdRrrrrrrrrrkkkkkkkkk.....',
  '.......kdRrrrrrrrrrrrrrrdk......',
  '........kddrrrrrrrrrrrrdk.......',
  '......kkRrdddddddddddddddkkk....',
  '......kRrrrrrrrrrrrrrrrrrddk....',
  '......kRrrrrrrrrrrrrdlmsssk.....',
  '......kRrrrrrrrrrrrrdmMssBk.....',
  '......kyyyyyyyyyyyyyyyyyyyyk....',
  '......kyyyyyyyyyyyyyyyyyyyyk....',
  '......kRrrrrrrrrrrrrrrrrrddk....',
  '......kRrrrrRdrrrrrRdrrrrddk....',
  '......kRrrrrRdrrrrrRdrrrdddk....',
  '......kdRrrrRdrrrrrRdrrrdddk....',
  '......kddRrrRdrrrrrRdrrddddk....',
  '......kddRrrRdrrrrrRdrrddddk....',
  '.......kGgGgGgGgGgGgGgGgGgk.....',
  '........kkkkkkkkkkkkkkkkkk......',
  '........klmmmMMkklmmmMMk........',
  '.........kkkkkk..kkkkkk.........',
];
// Walk cycle: each frame swaps the 2 HD feet rows under the hem.
const FEET = [
  ['.........klmmmmMk..klmmmmMk.....', '..........kkkkkk....kkkkkk......'],
  ['......klmmmmMk........kkkk......', '.......kkkkkk...................'],
  ['........kkkk........klmmmmMk....', '.....................kkkkkk.....'],
];
const FEET_SIDE = [
  ['........klmmmMMkklmmmMMk........', '.........kkkkkk..kkkkkk.........'],
  ['......klmmmMMk....klmmmMMk......', '.......kkkkkk......kkkkkk.......'],
  ['..........klmmmmmmmMMk..........', '...........kkkkkkkkkk...........'],
];
const RIGHT = FEET_SIDE.map(f => withFeet(SCRIBE_SIDE, f));
export const SCRIBE = {
  up: FEET.map(f => withFeet(SCRIBE_BACK, f)),
  down: FEET.map(f => withFeet(SCRIBE_FRONT, f)),
  right: RIGHT,
  left: RIGHT.map(mirror),
};

const ARM = [
  '.k..k...',
  'kl.kl...',
  'kl.km...',
  '.kkkMk..',
  '.klmMk..',
  '.kkkkk..',
  '..klMk..',
  '..kmMk..',
  '...kkkk.',
  '...klMk.',
  '...kmMk.',
  '..kkkkk.',
  '..klMk..',
  '.kmMk...',
  '.kkkk...',
  'klMk....',
];

export const MAPS = {
  ARM,
  ARM_L: mirror(ARM),
  CHAIN: ['lmmk'.repeat(5), 'mMMk'.repeat(5)],
  SCROLL: [
    '.kkkkkkkkk..',
    'kbppppppPPk.',
    'kkkkkkkkkkk.',
    '.kpppppppPk.',
    '.kpPPPPPpPk.',
    '.kpppppppPk.',
    '.kpPPPkxxkk.',
    '.kppppxaxkk.',
    '.kpPPPkxxkk.',
    '.kpppppppPk.',
    '.kpPPPPppPk.',
    'kkkkkkkkkkk.',
    'kbppppppPPk.',
    '.kkkkkkkkk..',
  ],
  DESK: up([
    '......kkkkkkkkkkkk.......f......',
    '......kGggggggggGk......fFf.....',
    '......kgkkkkkkkkgk.......f......',
    '......kgkCCCCCCkgk......kpk.....',
    '..kkk.kgkCccccCkgk......kpkp....',
    '.kppPkkgkCcCCcCkgk......kpkp....',
    '.kPPPkkgkCccCCCkgk......kpkpP...',
    '.kppPkkgkkkkkkkkgk......kPkPP...',
    '.kPPPkkGggggggggGk.....kkkkkkk..',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kwwwwwwwwwkMMkwwwwwwwPpppwwwwwwk',
    'kwpPpwwwwwwwwwwwwwwwwPpppwwwwwwk',
    'kwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWggWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kMk..........................kMk',
    'kkk..........................kkk',
  ]),
  SHELF: up([
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkpPpPnxxnuunppPnvvnxxnpPpPnkWk',
    'kWkpPpPnxxnuunppPnvvnxxnpPpPnkWk',
    'kWkpPpPnxxnuunpPppnvvnxxpPpPnkWk',
    'kWkpPpPnxxnuunPpPpnvvnxxpPpPnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWkuunppppnxxnvvnPpPpnuunxxnnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kWkkkkkkkkkkkkkkkkkkkkkkkkkkkkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWkxxnvvnpPpPnnuunxxnppppnvvnkWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ]),
  SKULL: up(['...kkkk...', '..kbbbbk..', '.kbbbbbbk.', '.kbokbkkbk', '.kbbbBbbbk', '..kbkbkbk.', '...kgggk..', '..kgMMgk..', '...kggk...', '....kk....']),
  COG_MECH: up([
    '.......kkkkkk.......',
    '....kk.kbbbbk.kk....',
    '...kbbkkbbbbkkbbk...',
    '...kbbbbbbbbbbbbk...',
    '.kkkbbbkkkkkkbbbkkk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbkbbbbbmmmkbbbbk',
    '.kbbbkbkkbbmMmkbbbk.',
    '..kbbkbkkbbmomkbbk..',
    '..kbbkbbbbbmmmkbbk..',
    '.kbbbkbbkbbmMmkbbbk.',
    'kbbbbbkbbbbmmkbbbbbk',
    'kbbbbbkbkbkmkkbbbbbk',
    '.kkkbbbkkkkkkbbbkkk.',
    '...kbbbbbbbbbbbbk...',
    '...kbbkkbbbbkkbbk...',
    '....kk.kbbbbk.kk....',
    '.......kkkkkk.......',
  ]),
  SEAL: up(['.kkkk.', 'kxxxxk', 'kxggxk', 'kxxxxk', '.kkkk.', '.kppk.', '.kPpk.', '.kppk.', '.kpPk.', '..kk..']),
  CANDLES: up(['..F...F.....', '.fFf.fFf..F.', '..f...f..fFf', '.kpk.kpk..f.', '.kpk.kpk.kpk', '.kPk.kpk.kpk', 'kpPPkkpPkkPk', 'kPPPPPPPPPPk', '.kkkkkkkkkk.']),
  THRONE: up([
    '......kkkkkkkk......',
    '.....kmmmmmmmmk.....',
    '....kmMkmmmmkMmk....',
    '....kgxxxxxxxxgk....',
    '....kgxxbbbbxxgk....',
    '....kgxbbkkbbxgk....',
    '....kgxxbbbbxxgk....',
    '....kgxxxxxxxxgk....',
    '....kgxxxxxxxxgk....',
    '.kmkkgxxxxxxxxgkkmk.',
    '.kmgggggggggggggggmk',
    '..kgxxxxxxxxxxxxxgk.',
    '..kgxxxxxxxxxxxxxgk.',
    '..kgggggggggggggggk.',
    '..kMk...........kMk.',
    '..kkk...........kkk.',
  ]),
  LORD_DESK: up([
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kwwwwwppppPwwwwkCCCCCkwwwwwwppPwwwwwwkMkwwwk',
    'kwwwwwppxpPwwwwkCccCCkwwwwwwppPwwwwwwkkwwwwk',
    'kwwwwwppppPwwwwkkkkkkkwwwwwwppPwwwwwwwwwwwwk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kWWWWWWWWWWWWWWWWWWkbbbkWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWkbbkbbkWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWkbbbkWWWWWWWWWWWWWWWWWWWk',
    'kWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWk',
    'kggggggggggggggggggggggggggggggggggggggggggk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ]),
  BRAZIER: up(['....F.....', '...fFf....', '..ffFff...', '..kfffk...', '.kgggggk..', '..kGGGk...', '...kgk....', '...kmk....', '...kgk....', '...kgk....', '..kgggk...', '.kgGGGgk..', '.kkkkkkk..']),
  RECAFF: up([
    'kkkkkkkkkkkkkkkk', 'kmmmmmmmmmmmmmmk', 'kmGGGGGGGGGGGGmk', 'kmGbbbbbbbbbbGmk', 'kmGGGGGGGGGGGGmk',
    'kmmmmmmmmmmmmmmk', 'kmkkkkkkkkmmmmmk', 'kmkCcCcCCkmammmk', 'kmkcCcCcCkmmmmmk', 'kmkCcCcCCkmommmk',
    'kmkkkkkkkkmmmmmk', 'kmmmmmmmmmmmmmmk', 'kmmmmkkkkkmmmmmk', 'kmmmmkWWWkmmmmmk', 'kmmmmkkkkkmmmmmk',
    'kMMMMMMMMMMMMMMk', 'kMMMMMMMMMMMMMMk', 'kkkkkkkkkkkkkkkk',
  ]),
  COGITATOR: up([
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'kGggggggggggggggggggggggggggggggggggggGk',
    'kgkkkkkkkkkgkkkkkkkkkgkkkkkkkkkgkkkkkkgk',
    'kgkCCCCCCCkgkCCCCCCCkgkCCCCCCCkgmmmmmmgk',
    'kgkCcccccCkgkCccCccCkgkCcccCCCkgmamommgk',
    'kgkCcCCccCkgkCcccccCkgkCccccCCkgmmmmmmgk',
    'kgkCccCccCkgkCCcccCCkgkCcCcccCkgmomamMgk',
    'kgkCCCCCCCkgkCCCCCCCkgkCCCCCCCkgmmmmmmgk',
    'kgkkkkkkkkkgkkkkkkkkkgkkkkkkkkkgkkkkkkgk',
    'kGggggggggggggggggggggggggggggggggggggGk',
    'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
    'kMmkmkmkmkmMMMMMMMMggggMMMMMMMkmkmkmkmMk',
    'kMmmmmmmmmmMMMMMMMgGkkGgMMMMMMmmmmmmmmMk',
    'kMMMMMMMMMMMMMMMMMMggggMMMMMMMMMMMMMMMMk',
    'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ]),
  WINDOW: up([
    '......kkkk......', '....kkuuuukk....', '...kuuuxxuuuk...', '..kuuxxggxxuuk..', '..kuxggggggxuk..',
    '.kuuxggggggxuuk.', '.kkkkkkkkkkkkkk.', '.kuuukuuuukuuuk.', '.kuxukuxxukuxuk.', '.kuxukuggukuxuk.',
    '.kuuukuxxukuuuk.', '.kvvvkuuuukvvvk.', '.kvuvkuvvukvuvk.', '.kvvvkuuuukvvvk.', '.kkkkkkkkkkkkkk.',
    '.kMMMMMMMMMMMMk.', '.kkkkkkkkkkkkkk.',
  ]),
  BANNER: up([
    'kkkkkkkkkkkk', 'kGggggggggGk', '.kxxxxxxxxk.', '.kxbxbbxbxk.', '.kxxbbbbxxk.', '.kxbbkkbbxk.',
    '.kxxbbbbxxk.', '.kxbxbbxbxk.', '.kxxxxxxxxk.', '.kxxxxxxxxk.', '.kxxxkxxxxk.', '.kxxk.kxxxk.',
    '.kxk...kxxk.', '.kk.....kxk.', '.........kk.',
  ]),
  CRATE: up([
    '.kPk.kpk.kPk..', 'kpPpkpPpkpPpkk', 'kkkkkkkkkkkkkk', 'kwwwwwwwwwwwwk', 'kWWWWWWWWWWWWk', 'kwkwwwwwwwwkwk',
    'kwwkwwwwwwkwwk', 'kwwwkwwwwkwwwk', 'kwwwwkwwkwwwwk', 'kwwwwwkkwwwwwk', 'kWWWWWWWWWWWWk', 'kkkkkkkkkkkkkk',
  ]),
  PAPER_STACK: up(['.kkkkkk.', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk', '.kpppPPk', '.kPPPPPk', 'kkkkkkkk', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk']),
  SCROLL_PILE: up(['....kkkk..kkkk....', '...kppPk.kpxPk....', '..kkkkkkkkkkkkkk..', '.kpPppkpPppkpPpk..', '.kkkkkkkkkkkkkkkk.', 'kpPpkpPppkpPppkpPk', 'kkkkkkkkkkkkkkkkkk']),
  BOOKS: up(['.kkkkkkk..', '.kxxxxxk..', 'kkkkkkkkk.', 'kuuuuuuuk.', '.kkkkkkkk.', '.kvvvvvvk.', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk']),
  LOOSE_A: up(['kkkkk', 'kpppk', 'kpPpk', 'kkkkk']),
  LOOSE_B: up(['kkkk', 'kPpk', 'kppk', 'kpPk', 'kkkk']),
  GAUGE: up(['.kkkk.', 'kbbbbk', 'kbkxbk', 'kbbkbk', 'kbbbbk', '.kkkk.']),
  VENT: up(['kkkkkkkk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kkkkkkkk']),
  CENSER: up(['..k..', '..m..', '..m..', '..m..', '.kgk.', 'kgGgk', 'kGfGk', 'kgGgk', '.kgk.', '..k..']),
};
