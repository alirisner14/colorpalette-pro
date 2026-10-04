import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAse, encodeAco, encodeGpl, encodeSketch, encodePaintNet, encodeCss, encodeSvg, encodeJson, encodeProcreate, FORMATS } from '../src/js/formats.js';
import { kmeans, extractPhotoColors, samplePixels } from '../src/js/photo.js';
import { THEMES, generateThemeColors } from '../src/js/themes.js';
import {
  emptyBook, normalizeBook, addPalette, removePalette, movePalette, addSection, deleteSection, moveSection,
  autoSortByColor, paginate, sectionOf, renameSection,
} from '../src/js/book.js';
import { hexToRgb, hexToHsl } from '../src/js/color.js';

const palette = {
  id: 'p1', name: 'Test Palette', harmony: 'triadic',
  colors: [{ hex: '#FF0000', name: 'Cherry Pop' }, { hex: '#00FF00', name: 'Kiwi' }, { hex: '#0000FF', name: 'Ocean' }],
};
const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

test('ASE: header, block count, group + color blocks, float RGB', () => {
  const { data } = encodeAse(palette);
  const v = view(data);
  assert.equal(String.fromCharCode(...data.slice(0, 4)), 'ASEF');
  assert.equal(v.getUint16(4), 1);
  assert.equal(v.getUint32(8), palette.colors.length + 2); // group start + colors + group end
  let p = 12;
  const types = [];
  let firstRgb = null;
  for (let i = 0; i < v.getUint32(8); i++) {
    const type = v.getUint16(p);
    const len = v.getUint32(p + 2);
    types.push(type);
    if (type === 1 && !firstRgb) {
      const nameLen = v.getUint16(p + 6);
      const q = p + 8 + nameLen * 2;
      assert.equal(String.fromCharCode(...data.slice(q, q + 4)), 'RGB ');
      firstRgb = [v.getFloat32(q + 4), v.getFloat32(q + 8), v.getFloat32(q + 12)];
    }
    p += 6 + len;
  }
  assert.equal(p, data.length);
  assert.deepEqual(types, [0xc001, 1, 1, 1, 0xc002]);
  assert.deepEqual(firstRgb, [1, 0, 0]);
});

test('ACO: v1 then v2 sections with names', () => {
  const { data } = encodeAco(palette);
  const v = view(data);
  assert.equal(v.getUint16(0), 1);
  assert.equal(v.getUint16(2), 3);
  assert.equal(v.getUint16(6), 65535); // red channel of the first color
  const v2 = 4 + 3 * 10;
  assert.equal(v.getUint16(v2), 2);
  assert.equal(v.getUint16(v2 + 2), 3);
  assert.equal(v.getUint32(v2 + 4 + 10), 'Cherry Pop'.length + 1);
});

test('text formats', () => {
  const gpl = encodeGpl(palette).data;
  assert.match(gpl, /^GIMP Palette\nName: Test Palette\n/);
  assert.match(gpl, /255\s+0\s+0\tCherry Pop/);
  const sketch = JSON.parse(encodeSketch(palette).data);
  assert.deepEqual(sketch.colors[2], { name: 'Ocean', red: 0, green: 0, blue: 1, alpha: 1 });
  assert.match(encodePaintNet(palette).data, /FFFF0000\r\nFF00FF00/);
  assert.match(encodeCss(palette).data, /--cherry-pop: #ff0000;/);
  assert.match(encodeSvg(palette).data, /^<svg[\s\S]*fill="#0000FF"[\s\S]*<\/svg>$/);
  assert.equal(JSON.parse(encodeJson(palette).data).colors[1].hex, '#00FF00');
  assert.equal(encodeProcreate(palette).ext, 'swatches');
});

test('names cannot inject markup into SVG or break out of a CSS comment', () => {
  const evil = { ...palette, name: 'a</text><script>x</script>*/', colors: [{ hex: '#000000', name: '<b>&' }] };
  assert.ok(!encodeSvg(evil).data.includes('<script>'));
  assert.ok(!encodeCss(evil).data.split('\n')[0].slice(2, -2).includes('*/'));
});

test('every export format is wired to an encoder or image renderer', () => {
  FORMATS.forEach((f) => assert.ok(f.encode || f.image, f.id));
  FORMATS.filter((f) => f.encode).forEach((f) => assert.ok(f.encode(palette).data.length > 0, f.id));
});

function fakePhoto(colors, perColor = 200) {
  const px = new Uint8ClampedArray(colors.length * perColor * 4);
  colors.forEach((hex, ci) => {
    const { r, g, b } = hexToRgb(hex);
    for (let i = 0; i < perColor; i++) {
      const o = (ci * perColor + i) * 4;
      // A little noise, like a real photo.
      px[o] = Math.min(255, r + (i % 3)); px[o + 1] = Math.min(255, g + (i % 2)); px[o + 2] = b; px[o + 3] = 255;
    }
  });
  return px;
}

test('photo extraction only returns colors that exist in the photo', () => {
  const pixels = samplePixels(fakePhoto(['#E63946', '#F1FAEE', '#A8DADC', '#457B9D', '#1D3557']));
  const present = new Set(pixels.map(([r, g, b]) => `${r},${g},${b}`));
  const colors = extractPhotoColors(pixels, 5, 3);
  assert.equal(colors.length, 5);
  colors.forEach((hex) => {
    const { r, g, b } = hexToRgb(hex);
    assert.ok(present.has(`${r},${g},${b}`), `${hex} is a real pixel`);
  });
  assert.equal(kmeans([], 4).length, 0);
});

test('photo extraction copes with a one-color image', () => {
  const colors = extractPhotoColors(samplePixels(fakePhoto(['#336699'], 50)), 8, 1);
  assert.ok(colors.length >= 1 && colors.length <= 8);
});

test('themes produce N distinct colors', () => {
  for (const t of THEMES) {
    for (const flavor of [0, 1, 2]) {
      const colors = generateThemeColors(t.id, 10, 42, flavor);
      assert.equal(colors.length, 10, `${t.id}/${flavor}`);
      assert.equal(new Set(colors).size, 10);
    }
  }
  generateThemeColors('pastel', 8, 5, 0).forEach((hex) => assert.ok(hexToHsl(hex).l > 0.75, `${hex} is pastel`));
});

test('book: add, move within and across tabs, remove', () => {
  const book = emptyBook();
  const mk = (id) => ({ ...palette, id });
  ['a', 'b', 'c', 'd'].forEach((id) => addPalette(book, mk(id)));
  assert.deepEqual(book.sections[0].ids, ['d', 'c', 'b', 'a']); // newest first
  movePalette(book, 'd', book.sections[0].id, 4);
  assert.deepEqual(book.sections[0].ids, ['c', 'b', 'a', 'd']);
  movePalette(book, 'a', book.sections[0].id, 0);
  assert.deepEqual(book.sections[0].ids, ['a', 'c', 'b', 'd']);
  const spring = addSection(book, 'Spring');
  movePalette(book, 'c', spring.id);
  assert.equal(sectionOf(book, 'c').name, 'Spring');
  renameSection(book, spring.id, 'Spring 🌷', '#FF8FB1');
  assert.equal(sectionOf(book, 'c').color, '#FF8FB1');
  removePalette(book, 'b');
  assert.ok(!book.palettes.b);
  assert.deepEqual(book.sections[0].ids, ['a', 'd']);
  moveSection(book, spring.id, -1);
  assert.equal(book.sections[0].id, spring.id);
  deleteSection(book, spring.id);
  assert.equal(book.sections.length, 1);
  assert.ok(book.sections[0].ids.includes('c'));
  deleteSection(book, book.sections[0].id); // the last tab stays
  assert.equal(book.sections.length, 1);
});

test('book: saved palettes are copies, not live references', () => {
  const book = emptyBook();
  const p = { ...palette, id: 'x', colors: palette.colors.map((c) => ({ ...c })) };
  addPalette(book, p);
  p.colors[0].hex = '#123456';
  assert.equal(book.palettes.x.colors[0].hex, '#FF0000');
});

test('book: migration from v1 favorites and repair of broken data', () => {
  const legacy = [{ ...palette, id: 'old1' }, { ...palette, id: 'old2' }];
  assert.deepEqual(normalizeBook(null, legacy).sections[0].ids, ['old1', 'old2']);
  const broken = { sections: [{ id: 's', name: 'S', ids: ['ghost', 'old1', 'old1'] }], palettes: { old1: legacy[0], orphan: legacy[1] } };
  assert.deepEqual(normalizeBook(broken).sections[0].ids, ['old1', 'orphan']);
});

test('book: pagination starts each tab on a new page', () => {
  const book = emptyBook();
  for (let i = 0; i < 7; i++) addPalette(book, { ...palette, id: `p${i}` });
  addSection(book, 'Empty');
  const pages = paginate(book, 4);
  assert.deepEqual(pages.map((p) => p.ids.length), [4, 3, 0]);
  assert.equal(pages[1].offset, 4);
});

test('book: auto-sort groups palettes by main color', () => {
  const book = emptyBook();
  addPalette(book, { ...palette, id: 'r', colors: [{ hex: '#FF0000', name: 'a' }, { hex: '#EE1111', name: 'b' }] });
  addPalette(book, { ...palette, id: 'g', colors: [{ hex: '#22AA22', name: 'a' }, { hex: '#118811', name: 'b' }] });
  autoSortByColor(book);
  assert.deepEqual(book.sections.map((s) => s.name), ['Reds', 'Greens']);
});

test('every published legal document renders without publisher notes or leftovers', async () => {
  const { DOCS, renderMarkdown, publicText } = await import('../src/js/legal.js');
  const { readFileSync } = await import('node:fs');
  for (const [id, doc] of Object.entries(DOCS)) {
    const md = readFileSync(new URL(`../${doc.file}`, import.meta.url), 'utf8');
    const html = renderMarkdown(publicText(md));
    assert.match(html, /^<h1/, id);
    assert.ok(!/\*\*|Easy-dlp|yt-dlp|SmartScreen|Microsoft Store|\[[A-Z ]{3,}\]/.test(html), `${id} has leftovers`);
  }
});
