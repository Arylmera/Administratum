"""Write the 1024 px source PNG for `cargo tauri icon` (Cog Mechanicus pixel art)."""
import struct
import sys
import zlib

ART = [
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
]
PAL = {'k': (14, 10, 8, 255), 'b': (207, 195, 168, 255), 'm': (90, 94, 99, 255),
       'M': (42, 44, 48, 255), 'o': (124, 255, 158, 255)}
SIZE, SCALE = 1024, 48
w, h = len(ART[0]), len(ART)
ox, oy = (SIZE - w * SCALE) // 2, (SIZE - h * SCALE) // 2

rows = []
for y in range(SIZE):
    row = bytearray([0])
    j = (y - oy) // SCALE
    for x in range(SIZE):
        i = (x - ox) // SCALE
        c = PAL.get(ART[j][i]) if 0 <= i < w and 0 <= j < h else None
        row += bytes(c or (0, 0, 0, 0))
    rows.append(bytes(row))


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))


png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
       + chunk(b'IEND', b''))
with open(sys.argv[1] if len(sys.argv) > 1 else 'icon-src.png', 'wb') as f:
    f.write(png)
