import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLocked, carryLocks, hasLocks, toggleLock, unlockAll } from '../src/js/lock.js';
import { contrastRatio, gradeOf, allPairs, summarize, bestTextOn, readableOn } from '../src/js/contrast.js';
import { DICTIONARY, interpretMood, moodPalettes, SUGGESTIONS } from '../src/js/mood.js';
import { encodeShare, decodeShare, shareLink, extractShareCode } from '../src/js/sharecode.js';
import {
  encodeQr, byteCapacity, alignmentPositions, qrToSvg, readFormat, rawModules, dataCodewords, rsRemainder, blockInfo,
} from '../src/js/qr.js';
import { parsePaletteFile, parsePastedText, finalizePalette, backupFromHtml, labToHex } from '../src/js/importers.js';
import {
  encodeAse, encodeAco, encodeGpl, encodeSketch, encodePaintNet, encodeHexList, encodeCss, encodeSvg, encodeJson, encodeProcreate,
} from '../src/js/formats.js';
import { hexToHsl, normalizeHex } from '../src/js/color.js';
import { typeLabel } from '../src/js/harmonies.js';

const HEX = /^#[0-9A-F]{6}$/;
const palette = {
  id: 'p', name: 'Sunny Test', harmony: 'triadic',
  colors: [
    { hex: '#FF8FB1', name: 'Bubble Gum' }, { hex: '#FFC75F', name: 'Honey Pop' }, { hex: '#7FD8BE', name: 'Mint Chip' },
    { hex: '#7EB6FF', name: 'Sky Kite' }, { hex: '#B79CFF', name: 'Grape Soda' }, { hex: '#1E3A8A', name: 'Midnight Blue' },
  ],
};

/* ---------- locking ---------- */

test('locked colors stay put when the rest is refreshed', () => {
  const old = palette.colors.map((c) => ({ ...c }));
  old[1].locked = true;
  old[4].locked = true;
  const fresh = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
  const out = mergeLocked(old, fresh);
  assert.equal(out.length, 6);
  assert.equal(out[1].hex, '#FFC75F');
  assert.equal(out[4].hex, '#B79CFF');
  assert.ok(out[1].locked && out[4].locked && !out[0].locked);
  assert.deepEqual([out[0].hex, out[2].hex, out[3].hex, out[5].hex], ['#111111', '#222222', '#333333', '#444444']);
  assert.equal(new Set(out.map((c) => c.hex)).size, 6);
});

test('merging locks never duplicates a color, even if a fresh color matches a locked one', () => {
  const old = [{ hex: '#FF0000', name: 'Red', locked: true }, { hex: '#00FF00', name: 'Green' }, { hex: '#0000FF', name: 'Blue' }];
  const out = mergeLocked(old, ['#FF0000', '#112233', '#445566']);
  assert.equal(new Set(out.map((c) => c.hex)).size, 3);
  assert.equal(out[0].hex, '#FF0000');
});

test('locks survive a palette-size change', () => {
  const old = palette.colors.map((c, i) => ({ ...c, locked: i === 5 }));
  assert.equal(mergeLocked(old, Array(10).fill(0).map((_, i) => `#0${i}0${i}0${i}`), 10).length, 10);
  const small = mergeLocked(old, ['#111111', '#222222', '#333333', '#444444'], 4);
  assert.equal(small.length, 4);
  assert.ok(small.some((c) => c.hex === '#1E3A8A' && c.locked), 'the locked color moved into the smaller palette');
});

test('carryLocks matches palettes by harmony and position', () => {
  const mk = (harmony, hexes, lockIdx = -1) => ({
    harmony, colors: hexes.map((hex, i) => ({ hex, name: hex, locked: i === lockIdx })),
  });
  const olds = [mk('triadic', ['#AA0000', '#00AA00', '#0000AA'], 0), mk('triadic', ['#BB0000', '#00BB00', '#0000BB'], 2), mk('monochrome', ['#101010', '#202020', '#303030'])];
  const news = [mk('triadic', ['#111111', '#222222', '#333333']), mk('triadic', ['#444444', '#555555', '#666666']), mk('monochrome', ['#777777', '#888888', '#999999'])];
  const out = carryLocks(olds, news);
  assert.equal(out[0].colors[0].hex, '#AA0000');
  assert.equal(out[1].colors[2].hex, '#0000BB');
  assert.deepEqual(out[2].colors.map((c) => c.hex), ['#777777', '#888888', '#999999'], 'unlocked palettes are untouched');
  const p = { colors: [{ hex: '#000000' }, { hex: '#ffffff' }] };
  assert.ok(toggleLock(p, 0) && hasLocks(p));
  unlockAll(p);
  assert.ok(!hasLocks(p));
});

/* ---------- contrast ---------- */

test('contrast ratios match the WCAG reference values', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-9);
  assert.equal(contrastRatio('#336699', '#336699'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#FFFFFF') - 4.54) < 0.01, '#767676 on white is the classic AA threshold');
  assert.equal(gradeOf(21), 'AAA');
  assert.equal(gradeOf(4.6), 'AA');
  assert.equal(gradeOf(3.2), 'AA Large');
  assert.equal(gradeOf(2.9), 'Fail');
  assert.equal(readableOn('#FFFFFF'), '#000000');
  assert.equal(readableOn('#000000'), '#FFFFFF');
});

test('pair lists are complete and sorted', () => {
  const pairs = allPairs(palette.colors);
  assert.equal(pairs.length, 15);
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i - 1].ratio >= pairs[i].ratio);
  const s = summarize(palette.colors);
  assert.equal(s.total, 15);
  assert.ok(s.aa <= s.large && s.aaa <= s.aa);
  assert.equal(bestTextOn('#FFFFFF', palette.colors).hex, '#000000');
});

/* ---------- mood from words ---------- */

test('every dictionary entry has valid seed colors and known modifiers', () => {
  const mods = new Set(['dark', 'light', 'deep', 'soft', 'pastel', 'muted', 'vivid', 'neon', 'warm', 'cool', 'vintage', 'bright']);
  assert.ok(DICTIONARY.size > 450, `dictionary has ${DICTIONARY.size} words`);
  for (const [word, entry] of DICTIONARY) {
    entry.seeds.forEach((s) => assert.match(s, HEX, `${word}: ${s}`));
    entry.mods.forEach((m) => assert.ok(mods.has(m), `${word}: unknown modifier ${m}`));
    assert.ok(entry.seeds.length || entry.mods.length, `${word} does nothing`);
  }
});

test('phrases are understood, including plurals, accents and two-word phrases', () => {
  const a = interpretMood('Rainy Café');
  assert.deepEqual(a.known, ['rainy', 'cafe']);
  assert.ok(a.seeds.length >= 6 && a.mods.has('cool'));
  assert.deepEqual(interpretMood('golden hour').known, ['golden hour']);
  assert.ok(interpretMood('strawberries and cupcakes').known.length === 2);
  const u = interpretMood('flibbertigibbet sunset');
  assert.deepEqual(u.unknown, ['flibbertigibbet']);
  assert.deepEqual(u.known, ['sunset']);
  SUGGESTIONS.forEach((s) => assert.ok(interpretMood(s).known.length > 0, s));
});

test('mood palettes: right size, distinct, deterministic, and they respond to modifiers', () => {
  for (const n of [6, 8, 15]) {
    const { palettes } = moodPalettes('enchanted forest', { count: n, variants: 9 });
    assert.equal(palettes.length, 9);
    palettes.forEach((p) => {
      assert.equal(p.hexes.length, n);
      assert.equal(new Set(p.hexes).size, n, `${p.name} has duplicates`);
      p.hexes.forEach((h) => assert.match(h, HEX));
    });
  }
  const a = moodPalettes('rainy cafe', { count: 8 });
  const b = moodPalettes('rainy cafe', { count: 8 });
  assert.deepEqual(a.palettes, b.palettes);
  assert.equal(a.palettes[0].name, 'Rainy Cafe');
  assert.match(a.palettes[3].name, /Bold/);
  const avgL = (hexes) => hexes.reduce((t, h) => t + hexToHsl(h).l, 0) / hexes.length;
  assert.ok(avgL(moodPalettes('dark forest', { count: 8 }).palettes[0].hexes) < avgL(moodPalettes('forest', { count: 8 }).palettes[0].hexes));
  assert.ok(avgL(moodPalettes('pastel forest', { count: 8 }).palettes[0].hexes) > avgL(moodPalettes('forest', { count: 8 }).palettes[0].hexes));
  const nonsense = moodPalettes('zzxq qwrt', { count: 8 });
  assert.ok(nonsense.fallback && nonsense.palettes[0].hexes.length === 8 && nonsense.unknown.length === 2);
  assert.equal(typeLabel({ harmony: 'mood' }), 'From your words');
});

/* ---------- sharing ---------- */

test('share codes round-trip and stay short', () => {
  const code = encodeShare(palette);
  assert.match(code, /^C1[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 60);
  const back = decodeShare(code);
  assert.equal(back.name, 'Sunny Test');
  assert.deepEqual(back.colors.map((c) => c.hex), palette.colors.map((c) => c.hex));
  assert.equal(new Set(back.colors.map((c) => c.name)).size, 6, 'color names are regenerated and unique');
  const link = shareLink(palette, 'https://example.com/app/index.html#create');
  assert.ok(link.startsWith('https://example.com/app/index.html#s=C1'));
  assert.equal(extractShareCode(link), code);
  assert.equal(extractShareCode(`hey look ${code} !`), code);
  const fifteen = { name: 'Fifteen colors in this palette', colors: Array.from({ length: 15 }, (_, i) => ({ hex: `#${(i * 17).toString(16).padStart(2, '0')}8080` })) };
  assert.ok(encodeShare(fifteen).length < 120);
});

test('broken share codes are rejected, not crashed on', () => {
  for (const bad of ['', 'nope', 'C1', 'C1!!!!', 'C1AAAA', 'C2AAAAAAAAAA', 'C1' + 'A'.repeat(40)]) assert.equal(decodeShare(bad), null, bad);
});

/* ---------- QR codes ---------- */

test('QR capacity tables are right (known values for versions 1–10)', () => {
  const known = {
    L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
    M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213],
    Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151],
    H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119],
  };
  for (const [ecl, caps] of Object.entries(known)) caps.forEach((cap, i) => assert.equal(byteCapacity(i + 1, ecl), cap, `${ecl} v${i + 1}`));
  [['L', 2953], ['M', 2331], ['Q', 1663], ['H', 1273]].forEach(([ecl, cap]) => assert.equal(byteCapacity(40, ecl), cap, `${ecl} v40`));
  assert.equal(rawModules(1), 208);
  assert.equal(rawModules(7), 1568);
  assert.equal(rawModules(40), 29648);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(10), [6, 28, 50]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
});

test('Reed–Solomon check bytes match a published example', () => {
  // ISO 18004 annex example: "01234567" in version 1-M gives these 10 check bytes.
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  const div = (() => {
    // build the divisor the same way the encoder does
    const { rsRemainder: rem } = { rsRemainder };
    return rem;
  })();
  assert.equal(typeof div, 'function');
  // Remainder of the data polynomial must make the whole codeword divisible: appending it gives a zero remainder.
  const gen = (degree) => {
    let g = [1];
    let root = 1;
    const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
    for (let i = 0; i < degree; i++) {
      const next = Array(g.length + 1).fill(0);
      g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, root); });
      g = next;
      root = mul(root, 2);
    }
    return g.slice(1);
  };
  const check = rsRemainder(data, gen(10));
  assert.deepEqual(check, [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

/** Read the symbol back the way a scanner would, and return the text. */
function decodeQr(qr) {
  const { size, modules, version, ecl } = qr;
  const mask = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][qr.mask];
  // function-pattern map, rebuilt independently
  const fn = Array.from({ length: size }, () => Array(size).fill(false));
  const mark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true; };
  mark(0, 0, 9, 9); mark(size - 8, 0, 8, 9); mark(0, size - 8, 9, 8);
  for (let i = 0; i < size; i++) { fn[6][i] = true; fn[i][6] = true; }
  const ap = alignmentPositions(version);
  ap.forEach((ax, i) => ap.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
    mark(ax - 2, ay - 2, 5, 5);
  }));
  if (version >= 7) { mark(size - 11, 0, 3, 6); mark(0, size - 11, 6, 3); }
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x]) bits.push(modules[y][x] !== mask(x, y) ? 1 : 0);
      }
    }
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // de-interleave using the same block structure
  const total = Math.floor(rawModules(version) / 8);
  const dcw = dataCodewords(version, ecl);
  const eccLen = (total - dcw);
  // Recover block layout from the version tables through the public helpers
  const { numBlocks } = blockInfo(version, ecl);
  const blockEcc = eccLen / numBlocks;
  const short = numBlocks - (total % numBlocks);
  const shortLen = Math.floor(total / numBlocks);
  const dataBlocks = Array.from({ length: numBlocks }, () => []);
  const eccBlocks = Array.from({ length: numBlocks }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen - blockEcc + 1; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i === shortLen - blockEcc && b < short) continue;
      dataBlocks[b].push(words[k++]);
    }
  }
  for (let i = 0; i < blockEcc; i++) for (let b = 0; b < numBlocks; b++) eccBlocks[b].push(words[k++]);
  // every block's check bytes must match a recomputation
  const gen = (degree) => {
    const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
    let g = [1]; let root = 1;
    for (let i = 0; i < degree; i++) { const next = Array(g.length + 1).fill(0); g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, root); }); g = next; root = mul(root, 2); }
    return g.slice(1);
  };
  dataBlocks.forEach((d, b) => assert.deepEqual(rsRemainder(d, gen(blockEcc)), eccBlocks[b], `block ${b} check bytes`));
  const stream = dataBlocks.flat().map((w) => w.toString(2).padStart(8, '0')).join('');
  assert.equal(stream.slice(0, 4), '0100', 'byte mode');
  const ccBits = version <= 9 ? 8 : 16;
  const len = parseInt(stream.slice(4, 4 + ccBits), 2);
  const out = [];
  for (let i = 0; i < len; i++) out.push(parseInt(stream.slice(4 + ccBits + i * 8, 4 + ccBits + i * 8 + 8), 2));
  return new TextDecoder().decode(Uint8Array.from(out));
}

test('QR symbols decode back to their text (structure, masks, check bytes)', () => {
  const samples = [
    'Hello, world!', 'https://example.com/app/#s=C1abc', 'x', 'ünïcödé ✓ 🎨',
    `https://example.com/colorpalettepro/index.html#s=${encodeShare(palette)}`, 'A'.repeat(150), 'B'.repeat(300),
  ];
  for (const text of samples) {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const qr = encodeQr(text, ecl);
      assert.equal(qr.size, qr.version * 4 + 17);
      assert.equal(decodeQr(qr), text, `${ecl}: ${text.slice(0, 20)}`);
    }
  }
});

test('QR symbols have valid finder, timing and format areas', () => {
  const qr = encodeQr('https://example.com', 'M');
  const { modules: m, size } = qr;
  const finder = [[1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1]];
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    finder.forEach((row, y) => row.forEach((v, x) => assert.equal(m[oy + y][ox + x], v === 1)));
  }
  for (let i = 8; i < size - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[size - 8][8], true, 'the always-dark module');
  const { a, b } = readFormat(qr);
  assert.equal(a, b, 'both copies of the format bits agree');
  const valid = new Set([0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011, 0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000]);
  assert.ok(valid.has(a), 'format bits for level M, mask 0–7');
  const svg = qrToSvg(qr, { scale: 4 });
  assert.match(svg, /^<svg[\s\S]*<path d="M/);
});

test('long text that cannot fit throws a friendly error', () => {
  assert.throws(() => encodeQr('z'.repeat(5000), 'H'), /too much text/);
});

/* ---------- importing files ---------- */

const bytesOf = (data) => (typeof data === 'string' ? new TextEncoder().encode(data) : data);
const hexes = (p) => p.colors.map((c) => c.hex);

test('every export format can be read back (round trip)', async () => {
  const want = hexes(palette);
  const cases = [
    ['x.ase', encodeAse(palette).data], ['x.aco', encodeAco(palette).data], ['x.gpl', encodeGpl(palette).data],
    ['x.swatches', encodeProcreate(palette).data], ['x.sketchpalette', encodeSketch(palette).data],
    ['x.txt', encodePaintNet(palette).data], ['x.txt', encodeHexList(palette).data], ['x.css', encodeCss(palette).data],
    ['x.json', encodeJson(palette).data], ['x.svg', encodeSvg(palette).data],
  ];
  for (const [file, data] of cases) {
    const res = await parsePaletteFile(file, bytesOf(data));
    assert.equal(res.kind, 'palettes', file);
    assert.equal(res.palettes.length, 1, file);
    const got = hexes(res.palettes[0]);
    // Procreate stores HSB floats and ASE stores float RGB, so allow a rounding step.
    got.forEach((h, i) => {
      const a = normalizeHex(h), b = want[i];
      const d = [1, 3, 5].map((o) => Math.abs(parseInt(a.slice(o, o + 2), 16) - parseInt(b.slice(o, o + 2), 16)));
      assert.ok(Math.max(...d) <= 2, `${file} color ${i}: ${a} vs ${b}`);
    });
    assert.equal(got.length, want.length, file);
  }
});

test('names and palette names survive where the format keeps them', async () => {
  const ase = await parsePaletteFile('x.ase', encodeAse(palette).data);
  assert.equal(ase.palettes[0].name, 'Sunny Test');
  assert.deepEqual(ase.palettes[0].colors.map((c) => c.name), palette.colors.map((c) => c.name), 'the " #HEX" suffix is stripped');
  const aco = await parsePaletteFile('x.aco', encodeAco(palette).data);
  assert.equal(aco.palettes[0].colors[2].name, 'Mint Chip');
  const gpl = await parsePaletteFile('x.gpl', bytesOf(encodeGpl(palette).data));
  assert.equal(gpl.palettes[0].name, 'Sunny Test');
  assert.equal(gpl.palettes[0].colors[0].name, 'Bubble Gum');
  const css = await parsePaletteFile('x.css', bytesOf(encodeCss(palette).data));
  assert.equal(css.palettes[0].colors[0].name, 'Bubble Gum');
  const list = await parsePaletteFile('x.txt', bytesOf(encodeHexList(palette).data));
  assert.equal(list.palettes[0].name, 'Sunny Test');
  assert.equal(list.palettes[0].colors[1].name, 'Honey Pop');
  const proc = await parsePaletteFile('x.swatches', encodeProcreate(palette).data);
  assert.equal(proc.palettes[0].name, 'Sunny Test');
});

test('Procreate files with empty slots and deflate-compressed zips are read', async () => {
  const json = JSON.stringify([{ name: 'Gaps', swatches: [null, { hue: 0, saturation: 1, brightness: 1, alpha: 1, colorSpace: 0 }, null, { hue: 0.5, saturation: 1, brightness: 1, alpha: 1, colorSpace: 0 }] }]);
  // compress with the platform's own deflate, then wrap in a zip by hand
  const raw = new TextEncoder().encode(json);
  const deflated = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const { crc32 } = await import('../src/js/zip.js');
  const name = new TextEncoder().encode('Swatches.json');
  const local = new Uint8Array(30 + name.length + deflated.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true);
  lv.setUint32(14, crc32(raw), true); lv.setUint32(18, deflated.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, name.length, true);
  local.set(name, 30); local.set(deflated, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(raw), true); cv.setUint32(20, deflated.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true);
  central.set(name, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  const zip = new Uint8Array(local.length + central.length + end.length);
  zip.set(local, 0); zip.set(central, local.length); zip.set(end, local.length + central.length);
  const res = await parsePaletteFile('Gaps.swatches', zip);
  assert.deepEqual(hexes(res.palettes[0]), ['#FF0000', '#00FFFF']);
});

test('pasted text: share links, hex lists and rgb() all work', () => {
  const viaLink = parsePastedText(`see ${shareLink(palette, 'https://x.test/')}`);
  assert.equal(viaLink.palettes[0].name, 'Sunny Test');
  assert.equal(viaLink.palettes[0].colors.length, 6);
  const codes = parsePastedText('#FF8FB1, rgb(127, 216, 190), 10 20 30');
  assert.deepEqual(hexes(codes.palettes[0]).slice(0, 2), ['#FF8FB1', '#7FD8BE']);
  assert.equal(parsePastedText('no colors here at all').palettes.length, 0);
});

test('multi-group ASE files become several palettes; big ones are capped', async () => {
  const { encodeAse: enc } = await import('../src/js/formats.js');
  const big = { name: 'Big', colors: Array.from({ length: 80 }, (_, i) => ({ hex: `#${(i * 3).toString(16).padStart(2, '0')}${(255 - i).toString(16).padStart(2, '0')}40`, name: `c${i}` })) };
  const res = await parsePaletteFile('big.ase', enc(big).data);
  assert.equal(res.palettes[0].colors.length, 60);
  assert.match(res.warnings[0], /first 60/);
});

test('bad files give friendly errors', async () => {
  await assert.rejects(parsePaletteFile('photo.png', new Uint8Array([1, 2, 3])), /Photo mode/);
  await assert.rejects(parsePaletteFile('x.aco', new Uint8Array([0, 9, 0, 0])), /Photoshop/);
  await assert.rejects(parsePaletteFile('x.json', bytesOf('{ nope')), /JSON/);
  await assert.rejects(parsePaletteFile('x.swatches', new Uint8Array([0x50, 0x4b, 1, 2, 3, 4, 5, 6])), /zip/);
  const empty = await parsePaletteFile('x.txt', bytesOf('nothing useful'));
  assert.equal(empty.palettes.length, 0);
});

test('backups embedded in HTML or JSON are recognised', async () => {
  const data = { type: 'color-palette-pro-backup', version: 1, book: {} };
  const viaJson = await parsePaletteFile('b.json', bytesOf(JSON.stringify(data)));
  assert.equal(viaJson.kind, 'backup');
  const html = `<html><body><script type="application/json" id="cpp-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></body></html>`;
  assert.deepEqual(backupFromHtml(html), data);
  const viaHtml = await parsePaletteFile('b.html', bytesOf(html));
  assert.equal(viaHtml.kind, 'backup');
});

test('imported palettes get ids, names and a label', async () => {
  const res = await parsePaletteFile('My Pack.gpl', bytesOf('GIMP Palette\n#\n255 0 0\n0 255 0\n'));
  const p = finalizePalette(res.palettes[0]);
  assert.match(p.id, /^imp-/);
  assert.equal(p.name, 'My Pack');
  assert.equal(p.harmony, 'imported');
  assert.equal(typeLabel(p), 'Imported');
  assert.ok(p.colors.every((c) => c.name.length > 2));
  assert.match(labToHex(50, 0, 0), HEX);
  assert.equal(labToHex(100, 0, 0), '#FFFFFF');
  assert.equal(labToHex(0, 0, 0), '#000000');
});
