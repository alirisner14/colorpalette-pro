// QR Code generator (byte mode, versions 1–40, error correction L/M/Q/H),
// written from the public ISO/IEC 18004 specification. No dependencies, runs
// offline. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const bit = (x, i) => ((x >>> i) & 1) !== 0;

export function rawModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

export const blockInfo = (ver, ecl) => ({ numBlocks: BLOCKS[ecl][ver], eccPerBlock: ECC_PER_BLOCK[ecl][ver] });

export const dataCodewords = (ver, ecl) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * BLOCKS[ecl][ver];

/** How many bytes of text fit in a version at an error-correction level. */
export function byteCapacity(ver, ecl) {
  return Math.floor((dataCodewords(ver, ecl) * 8 - 4 - (ver <= 9 ? 8 : 16)) / 8);
}

export function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/* ---- Reed–Solomon over GF(256), polynomial 0x11D ---- */

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

export function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

/* ---- building the symbol ---- */

function appendBits(value, length, out) {
  for (let i = length - 1; i >= 0; i--) out.push((value >>> i) & 1);
}

function addEccAndInterleave(data, ver, ecl) {
  const numBlocks = BLOCKS[ecl][ver];
  const blockEccLen = ECC_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(rawModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks = [];
  const div = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(modules, size) {
  let result = 0;
  const rows = modules.map((r) => r.map((v) => (v ? '1' : '0')).join(''));
  const cols = Array.from({ length: size }, (_, x) => modules.map((r) => (r[x] ? '1' : '0')).join(''));
  const finder = /(?=(10111010000|00001011101))/g;
  for (const line of [...rows, ...cols]) {
    // N1: runs of 5 or more of one color
    const runs = line.match(/0+|1+/g);
    for (const run of runs) if (run.length >= 5) result += 3 + (run.length - 5);
    // N3: finder-like patterns
    result += 40 * [...line.matchAll(finder)].length;
  }
  // N2: 2x2 blocks of one color
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
    }
  }
  // N4: balance of dark and light
  let dark = 0;
  for (const r of modules) for (const v of r) if (v) dark++;
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
}

/**
 * Encode text into a QR symbol.
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} ecl error correction level
 * @returns {{ version:number, size:number, mask:number, ecl:string, modules:boolean[][] }}
 */
export function encodeQr(text, ecl = 'M', minVersion = 1) {
  const bytes = new TextEncoder().encode(text);
  let ver = minVersion;
  for (;; ver++) {
    if (ver > 40) throw new Error('That is too much text for one QR code.');
    if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver, ecl) * 8) break;
  }

  const bits = [];
  appendBits(0b0100, 4, bits);
  appendBits(bytes.length, ver <= 9 ? 8 : 16, bits);
  for (const b of bytes) appendBits(b, 8, bits);
  const capacity = dataCodewords(ver, ecl) * 8;
  appendBits(0, Math.min(4, capacity - bits.length), bits);
  appendBits(0, (8 - (bits.length % 8)) % 8, bits);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bits);
  const data = Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => { data[i >>> 3] |= b << (7 - (i & 7)); });

  const codewords = addEccAndInterleave(data, ver, ecl);
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));
  const setFn = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  // timing patterns
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  // finder patterns with their separators
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  // alignment patterns
  const align = alignmentPositions(ver);
  const last = align.length - 1;
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const drawFormat = (mask) => {
    const d = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fb = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(fb, i));
    setFn(8, 7, bit(fb, 6)); setFn(8, 8, bit(fb, 7)); setFn(7, 8, bit(fb, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(fb, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(fb, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(fb, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // reserve the format areas so data skips them

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, bit(vb, i)); setFn(b, a, bit(vb, i));
    }
  }

  // data, in the zig-zag order of the standard
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && k < codewords.length * 8) {
          modules[y][x] = bit(codewords[k >>> 3], 7 - (k & 7));
          k++;
        }
      }
    }
  }

  // choose the mask with the lowest penalty
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFunction[y][x] && MASKS[m](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const score = penalty(modules, size);
    if (score < bestScore) { best = m; bestScore = score; }
    applyMask(m); // undo (XOR is its own inverse)
  }
  applyMask(best);
  drawFormat(best);
  return { version: ver, size, mask: best, ecl, modules };
}

/** The symbol as an SVG string (one path, crisp at any size). */
export function qrToSvg(qr, { scale = 8, margin = 4, dark = '#000000', light = '#FFFFFF', title = '' } = {}) {
  const n = qr.size + margin * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) { x++; continue; }
      let w = 1;
      while (x + w < qr.size && qr.modules[y][x + w]) w++;
      d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w;
    }
  }
  const px = n * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="${title ? title.replace(/[<>&"]/g, '') : 'QR code'}"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

/** Read the 15 format bits back from the symbol (used by tests). */
export function readFormat(qr) {
  const { modules, size } = qr;
  let a = 0;
  for (let i = 0; i <= 5; i++) a |= (modules[i][8] ? 1 : 0) << i;
  a |= (modules[7][8] ? 1 : 0) << 6;
  a |= (modules[8][8] ? 1 : 0) << 7;
  a |= (modules[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) a |= (modules[8][14 - i] ? 1 : 0) << i;
  let b = 0;
  for (let i = 0; i < 8; i++) b |= (modules[8][size - 1 - i] ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) b |= (modules[size - 15 + i][8] ? 1 : 0) << i;
  return { a, b };
}
