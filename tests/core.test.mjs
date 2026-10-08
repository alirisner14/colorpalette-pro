import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHex, hexToHsl, hslToHex, hexToHsv, hsvToHex, normalizeHex, readableText, parseColorCodes } from '../src/js/color.js';
import { HARMONIES, FOUNDATIONS, AUTO_PALETTES, MIN_COLORS, MAX_COLORS, generateColors, distribute, swapOptions, foundationPlan, typeLabel } from '../src/js/harmonies.js';
import { hexToOklch } from '../src/js/color.js';
import { nameColor, nameColors, namePalette, hueFamily } from '../src/js/names.js';
import { SHAPES } from '../src/js/shapes.js';
import { createZip, crc32 } from '../src/js/zip.js';
import { safeFileName } from '../src/js/export.js';
import { procreateJson } from '../src/js/formats.js';

const HEX = /^#[0-9A-F]{6}$/;

test('color conversions round-trip', () => {
  for (const hex of ['#33ADE8', '#000000', '#FFFFFF', '#FF0000', '#7F3FBF', '#123456']) {
    assert.equal(rgbToHex(hexToRgb(hex)), hex);
    assert.equal(hslToHex(hexToHsl(hex)), hex);
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  }
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('nope'), null);
  assert.equal(readableText('#FFFFFF'), '#1E1E2A');
  assert.equal(readableText('#000000'), '#FFFFFF');
});

test('distribute splits evenly with extras first', () => {
  assert.deepEqual(distribute(8, 3), [3, 3, 2]);
  assert.deepEqual(distribute(15, 4), [4, 4, 4, 3]);
});

test('every harmony yields exactly N unique colors for N = 6..15', () => {
  for (const base of ['#33ADE8', '#808080', '#000000', '#FFFFFF', '#FF6F91']) {
    for (const h of HARMONIES) {
      for (let n = MIN_COLORS; n <= MAX_COLORS; n++) {
        const colors = generateColors(base, h.id, n, 42);
        assert.equal(colors.length, n, `${h.id} ${base} n=${n}`);
        assert.equal(new Set(colors).size, n, `duplicates in ${h.id} ${base} n=${n}`);
        colors.forEach((c) => assert.match(c, HEX));
        assert.ok(colors.includes(base), `${h.id} keeps the base color`);
      }
    }
  }
});

test('generation is reproducible with a seed', () => {
  assert.deepEqual(generateColors('#33ADE8', 'random', 9, 7), generateColors('#33ADE8', 'random', 9, 7));
});

test('a complementary backbone puts a color roughly opposite yours (drifted, not exact)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const own = hexToOklch('#FF0000').h;
    const hues = generateColors('#FF0000', 'complementary', 8, seed).map(hexToOklch).filter((c) => c.c > 0.045).map((c) => c.h);
    assert.ok(hues.some((h) => Math.abs(((h - own + 540) % 360) - 180) > 150), `seed ${seed}`);
  }
});

test('swap options exclude the current palette', () => {
  const existing = ['#33ADE8', '#FFFFFF'];
  const opts = swapOptions('#33ADE8', existing, 3);
  assert.ok(opts.length >= 6);
  opts.forEach((o) => { assert.match(o, HEX); assert.ok(!existing.includes(o)); });
});

test('color names are cute, stable and unique within a palette', () => {
  assert.equal(nameColor('#33ADE8'), nameColor('#33ADE8'));
  const colors = generateColors('#33ADE8', 'monochrome', 15, 3);
  const names = nameColors(colors);
  assert.equal(new Set(names).size, names.length);
  names.forEach((n) => assert.ok(n.length > 3));
  // Even identical colors get distinct names.
  const same = nameColors(['#FF0000', '#FF0000', '#FF0000']);
  assert.equal(new Set(same).size, 3);
});

test('hue families match obvious colors', () => {
  assert.equal(hueFamily('#FF0000'), 'red');
  assert.equal(hueFamily('#FFFF00'), 'yellow');
  assert.equal(hueFamily('#0000FF'), 'blue');
  assert.equal(hueFamily('#FFFFFF'), 'white');
  assert.equal(hueFamily('#111111'), 'black');
  assert.equal(hueFamily('#6B4423'), 'brown');
});

test('palette names avoid taken names', () => {
  const colors = generateColors('#FF6F91', 'analogous', 8, 1);
  const first = namePalette(colors, 'analogous');
  const second = namePalette(colors, 'analogous', new Set([first]));
  assert.notEqual(first, second);
});

test('every swatch shape produces a path', () => {
  for (const s of SHAPES) {
    if (!s.path) continue;
    for (let i = 0; i < 3; i++) assert.match(s.path(i), /^M[\d. L]+(C[\d. ]+)*.*Z$/);
  }
});

test('zip writer produces a valid single-file archive', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
  const zip = createZip([{ name: 'Swatches.json', data: '[]' }]);
  const v = new DataView(zip.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(zip.length - 22, true), 0x06054b50);
});

test('swatches JSON follows the Procreate layout', () => {
  const json = JSON.parse(procreateJson({ name: 'Test', colors: [{ hex: '#FF0000' }, { hex: '#00FF00' }] }));
  assert.equal(json[0].name, 'Test');
  assert.deepEqual(json[0].swatches[0], { hue: 0, saturation: 1, brightness: 1, alpha: 1, colorSpace: 0 });
  assert.ok(Math.abs(json[0].swatches[1].hue - 1 / 3) < 1e-9);
});

test('file names are sanitized', () => {
  assert.equal(safeFileName('Sunny: Day/Night?'), 'Sunny DayNight');
  assert.equal(safeFileName('Kite   Disco'), 'Kite Disco', 'only whitespace is collapsed');
  assert.equal(safeFileName('Sassy Sunset: Skies\\Hills'), 'Sassy Sunset SkiesHills', 'the letter s is left alone');
  assert.equal(safeFileName(''), 'palette');
});

test('the plan deals every backbone out when nothing is chosen, and leans two in three when one is', () => {
  const auto = foundationPlan('', AUTO_PALETTES, 1);
  assert.equal(auto.length, 14);
  assert.ok(auto.every((p) => !p.shown), 'no labels unless you choose a harmony');
  FOUNDATIONS.forEach((h) => assert.ok(auto.filter((p) => p.foundation === h.id).length >= 2, h.id));
  for (let i = 1; i < auto.length; i++) assert.notEqual(auto[i].foundation, auto[i - 1].foundation);
  assert.deepEqual(foundationPlan('', 14, 1), auto, 'the same seed gives the same plan');
  const lean = foundationPlan('triadic', 9, 2);
  assert.equal(lean.filter((p) => p.foundation === 'triadic' && p.shown).length, 6);
  assert.equal(lean.filter((p) => !p.shown && p.foundation !== 'triadic').length, 3, 'a lean is a preference, not a filter');
  assert.equal(foundationPlan('', 5, 1).length, 5);
  assert.ok(foundationPlan('random', 6, 1).every((p) => !p.shown), 'random is not something to lean toward');
});

test('type labels cover harmonies, themes, photos and handmade palettes', () => {
  assert.equal(typeLabel({ harmony: 'triadic' }), 'Triadic');
  assert.equal(typeLabel({ harmony: 'theme:ocean' }), 'Ocean Breeze');
  assert.equal(typeLabel({ harmony: 'photo-pure' }), 'Straight from your photo');
  assert.equal(typeLabel({ harmony: 'custom' }), 'Handmade');
  assert.equal(typeLabel({ harmony: 'organic' }), '', 'everyday palettes have no label');
  assert.equal(typeLabel({ harmony: 'random' }), 'Random', 'palettes saved by older versions keep theirs');
});

test('pasted HEX and RGB codes are parsed', () => {
  assert.deepEqual(
    parseColorCodes('#FF8FB1, #abc and bad fed' + String.fromCharCode(10) + 'rgb(127, 216, 190)' + String.fromCharCode(10) + '10, 20, 30; 33ade8'),
    ['#FF8FB1', '#AABBCC', '#7FD8BE', '#0A141E', '#33ADE8'],
  );
  assert.deepEqual(parseColorCodes('nothing here'), []);
});
