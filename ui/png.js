// PNG decoder for the art files: 8-bit RGBA / RGB, and indexed (1-8 bit) as Aseprite exports in indexed mode.
// No canvas, so the same code runs in the webview and in the node tests (DecompressionStream is in both).
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// bytes: Uint8Array of a .png file -> { w, h, rgba: Uint8Array (w * h * 4) }
export async function decodePng(bytes) {
  if (!SIG.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), idat = [];
  let w, h, depth, type, palette = null, trns = null;
  for (let p = 8; p < bytes.length;) {
    const len = dv.getUint32(p), name = String.fromCharCode(...bytes.subarray(p + 4, p + 8)), data = bytes.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = data[8]; type = data[9];
      if (data[12]) throw new Error('interlaced PNG: export without interlacing');
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  const channels = { 6: 4, 2: 3, 3: 1 }[type];
  if (!channels || (type !== 3 && depth !== 8)) throw new Error(`PNG colour type ${type} / ${depth} bit: save as 8-bit RGBA, RGB or indexed`);
  const bits = channels * depth, bpp = Math.max(1, bits / 8), stride = Math.ceil(w * bits / 8);
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((o, d) => (joined.set(d, o), o + d.length), 0);
  const raw = await inflate(joined), px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) { // undo the per-row filters
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0, b = y ? px[row - stride + i] : 0, c = y && i >= bpp ? px[row - stride + i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[row + i] = (src[i] + pred) & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, s = y * stride;
    if (type === 6) rgba.set(px.subarray(s + x * 4, s + x * 4 + 4), o);
    else if (type === 2) { rgba.set(px.subarray(s + x * 3, s + x * 3 + 3), o); rgba[o + 3] = 255; }
    else {
      const i = (px[s + ((x * depth) >> 3)] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1);
      rgba.set(palette.subarray(i * 3, i * 3 + 3), o); rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
    }
  }
  return { w, h, rgba };
}
