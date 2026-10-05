// Tier II palette and pixel maps (ported from the Claude Design board "Tier II — Data-Shrine").
export const BASE = {
  k: '#0e0a08', g: '#b8742e', G: '#6e3f17', p: '#d6c79f', P: '#a8946a', w: '#4a3020', W: '#2e1c12',
  m: '#5a5e63', M: '#2a2c30', c: '#7cff9e', C: '#16301f', f: '#f0a83c', F: '#ffe6a0', x: '#8e1c16',
  b: '#cfc3a8', B: '#948669', n: '#140c08', u: '#2b3f5e', v: '#2f4a33', r: '#5e1710', d: '#3a0d09',
  a: '#ff3a20', o: '#7cff9e', y: '#d9a84e', s: '#b89a7c', e: '#120c0a',
};
export const SASH = ['#d9a84e', '#5fae7a', '#5a7ec9', '#c46a9a', '#c9b95a', '#6ac9c4', '#c97a4a', '#9a8ad9'];

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

const mirror = map => map.map(row => row.split('').reverse().join(''));
const withFeet = (body, feet) => body.slice(0, -1).concat([feet]);

const SCRIBE_BACK = [
  '....kkkkkkkk....',
  '...kdrrrrrrrrdk.',
  '..kdrrrrrrrrrrdk',
  '..kdrrrrrrrrrrdk',
  '..kdrrrrmMrrrrdk',
  '..kdrrrkookrrrdk',
  '..kdrrrrmMrrrrdk',
  '..kddrrrrMrrrddk',
  '...kddrrrMrrddk.',
  '..kdrrrrrMrrrrdk',
  '..kmrrrrrMrrrrmk',
  '..kdyyyyyyyyyydk',
  '..kdrrrrrrrrrrdk',
  '..kddrrrrrrrrddk',
  '..kdddrrrrrrdddk',
  '...kkkkkkkkkkkk.',
  '....kMMk.kMMk...',
];
const SCRIBE_FRONT = [
  '....kkkkkkkk....',
  '...kdrrrrrrrrdk.',
  '..kdrrrrrrrrrrdk',
  '..kdrrkkkkkkrrdk',
  '..kdrkeeeeeekrdk',
  '..kdrkeoeeoekrdk',
  '..kdrkeeeeeekrdk',
  '..kddrkkkkkkrddk',
  '...kddrrrrrrddk.',
  '..kdrrrrrrrrrrdk',
  '..kmrrrrrrrrrrmk',
  '..kdyyyyyyyyyydk',
  '..kdrrrrrrrrrrdk',
  '..kddrrrrrrrrddk',
  '..kdddrrrrrrdddk',
  '...kkkkkkkkkkkk.',
  '....kMMk.kMMk...',
];
const SCRIBE_SIDE = [
  '.....kkkkkkk....',
  '....kdrrrrrrk...',
  '...kdrrrrrrrrk..',
  '...kdrrrrrkkkk..',
  '...kdrrrrkeeek..',
  '...kdrrrrkeoek..',
  '...kdrrrrkeeek..',
  '...kddrrrrkkk...',
  '....kddrrrrdk...',
  '...kdrrrrrrrdk..',
  '...kdrrrrrrmsk..',
  '...kdyyyyyyydk..',
  '...kdrrrrrrrdk..',
  '...kddrrrrrddk..',
  '...kdddrrrdddk..',
  '....kkkkkkkkk...',
  '....kMMkkMMk....',
];
const FEET = ['....kMMk.kMMk...', '...kMMk....kk...', '....kk....kMMk..'];
const FEET_SIDE = ['....kMMkkMMk....', '...kMMk..kMMk...', '.....kMMMMk.....'];
const RIGHT = FEET_SIDE.map(f => withFeet(SCRIBE_SIDE, f));
export const SCRIBE = {
  up: FEET.map(f => withFeet(SCRIBE_BACK, f)),
  down: FEET.map(f => withFeet(SCRIBE_FRONT, f)),
  right: RIGHT,
  left: RIGHT.map(mirror),
};

const ARM = ['k.k.', 'kmk.', '.mk.', '.km.', '..mk', '..Mk', '.kM.', 'kM..'];

export const MAPS = {
  ARM,
  ARM_L: mirror(ARM),
  CHAIN: ['mkmkmkmkmk'],
  SCROLL: ['kkkkk.', 'kpppPk', 'kpppPk', 'kpxxPk', 'kpxxPk', 'kpppPk', 'kkkkk.'],
  DESK: [
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
  ],
  SHELF: [
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
  ],
  SKULL: ['...kkkk...', '..kbbbbk..', '.kbbbbbbk.', '.kbokbkkbk', '.kbbbBbbbk', '..kbkbkbk.', '...kgggk..', '..kgMMgk..', '...kggk...', '....kk....'],
  COG_MECH: [
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
  ],
  SEAL: ['.kkkk.', 'kxxxxk', 'kxggxk', 'kxxxxk', '.kkkk.', '.kppk.', '.kPpk.', '.kppk.', '.kpPk.', '..kk..'],
  CANDLES: ['..F...F.....', '.fFf.fFf..F.', '..f...f..fFf', '.kpk.kpk..f.', '.kpk.kpk.kpk', '.kPk.kpk.kpk', 'kpPPkkpPkkPk', 'kPPPPPPPPPPk', '.kkkkkkkkkk.'],
  THRONE: [
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
  ],
  LORD_DESK: [
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
  ],
  BRAZIER: ['....F.....', '...fFf....', '..ffFff...', '..kfffk...', '.kgggggk..', '..kGGGk...', '...kgk....', '...kmk....', '...kgk....', '...kgk....', '..kgggk...', '.kgGGGgk..', '.kkkkkkk..'],
  RECAFF: [
    'kkkkkkkkkkkkkkkk', 'kmmmmmmmmmmmmmmk', 'kmGGGGGGGGGGGGmk', 'kmGbbbbbbbbbbGmk', 'kmGGGGGGGGGGGGmk',
    'kmmmmmmmmmmmmmmk', 'kmkkkkkkkkmmmmmk', 'kmkCcCcCCkmammmk', 'kmkcCcCcCkmmmmmk', 'kmkCcCcCCkmommmk',
    'kmkkkkkkkkmmmmmk', 'kmmmmmmmmmmmmmmk', 'kmmmmkkkkkmmmmmk', 'kmmmmkWWWkmmmmmk', 'kmmmmkkkkkmmmmmk',
    'kMMMMMMMMMMMMMMk', 'kMMMMMMMMMMMMMMk', 'kkkkkkkkkkkkkkkk',
  ],
  COGITATOR: [
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
  ],
  WINDOW: [
    '......kkkk......', '....kkuuuukk....', '...kuuuxxuuuk...', '..kuuxxggxxuuk..', '..kuxggggggxuk..',
    '.kuuxggggggxuuk.', '.kkkkkkkkkkkkkk.', '.kuuukuuuukuuuk.', '.kuxukuxxukuxuk.', '.kuxukuggukuxuk.',
    '.kuuukuxxukuuuk.', '.kvvvkuuuukvvvk.', '.kvuvkuvvukvuvk.', '.kvvvkuuuukvvvk.', '.kkkkkkkkkkkkkk.',
    '.kMMMMMMMMMMMMk.', '.kkkkkkkkkkkkkk.',
  ],
  BANNER: [
    'kkkkkkkkkkkk', 'kGggggggggGk', '.kxxxxxxxxk.', '.kxbxbbxbxk.', '.kxxbbbbxxk.', '.kxbbkkbbxk.',
    '.kxxbbbbxxk.', '.kxbxbbxbxk.', '.kxxxxxxxxk.', '.kxxxxxxxxk.', '.kxxxkxxxxk.', '.kxxk.kxxxk.',
    '.kxk...kxxk.', '.kk.....kxk.', '.........kk.',
  ],
  CRATE: [
    '.kPk.kpk.kPk..', 'kpPpkpPpkpPpkk', 'kkkkkkkkkkkkkk', 'kwwwwwwwwwwwwk', 'kWWWWWWWWWWWWk', 'kwkwwwwwwwwkwk',
    'kwwkwwwwwwkwwk', 'kwwwkwwwwkwwwk', 'kwwwwkwwkwwwwk', 'kwwwwwkkwwwwwk', 'kWWWWWWWWWWWWk', 'kkkkkkkkkkkkkk',
  ],
  PAPER_STACK: ['.kkkkkk.', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk', '.kpppPPk', '.kPPPPPk', 'kkkkkkkk', 'kppppPPk', 'kPPPPPPk', 'kppppPPk', 'kkkkkkkk'],
  SCROLL_PILE: ['....kkkk..kkkk....', '...kppPk.kpxPk....', '..kkkkkkkkkkkkkk..', '.kpPppkpPppkpPpk..', '.kkkkkkkkkkkkkkkk.', 'kpPpkpPppkpPppkpPk', 'kkkkkkkkkkkkkkkkkk'],
  BOOKS: ['.kkkkkkk..', '.kxxxxxk..', 'kkkkkkkkk.', 'kuuuuuuuk.', '.kkkkkkkk.', '.kvvvvvvk.', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk'],
  LOOSE_A: ['kkkkk', 'kpppk', 'kpPpk', 'kkkkk'],
  LOOSE_B: ['kkkk', 'kPpk', 'kppk', 'kpPk', 'kkkk'],
  GAUGE: ['.kkkk.', 'kbbbbk', 'kbkxbk', 'kbbkbk', 'kbbbbk', '.kkkk.'],
  VENT: ['kkkkkkkk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kmmmmmmk', 'kMMMMMMk', 'kkkkkkkk'],
  CENSER: ['..k..', '..m..', '..m..', '..m..', '.kgk.', 'kgGgk', 'kGfGk', 'kgGgk', '.kgk.', '..k..'],
};
