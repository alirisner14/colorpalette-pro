import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHex, hexToHsl, hslToHex, hexToHsv, hsvToHex, normalizeHex, readableText, parseColorCodes } from '../src/js/color.js';
import { HARMONIES, MIN_COLORS, MAX_COLORS, generateColors, distribute, swapOptions, harmonyPlan, typeLabel } from '../src/js/harmonies.js';
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

test('complementary palette contains a hue roughly opposite the base', () => {
  const colors = generateColors('#FF0000', 'complementary', 8, 1);
  const hues = colors.map((c) => hexToHsl(c).h);
  assert.ok(hues.some((h) => Math.abs(h - 180) < 15));
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

test('harmony plan gives 2 of each type by default, or round-robins a set total', () => {
  const auto = harmonyPlan();
  assert.equal(auto.length, HARMONIES.length * 2);
  HARMONIES.forEach((h) => assert.equal(auto.filter((x) => x === h.id).length, 2));
  assert.deepEqual(harmonyPlan(['triadic', 'monochrome']), ['triadic', 'monochrome', 'triadic', 'monochrome']);
  assert.deepEqual(harmonyPlan(['analogous'], 3), ['analogous', 'analogous', 'analogous']);
  assert.equal(harmonyPlan([], 5).length, 5);
  assert.ok(!HARMONIES.some((h) => h.id === 'split-analogous'));
});

test('type labels cover harmonies, themes, photos and handmade palettes', () => {
  assert.equal(typeLabel({ harmony: 'triadic' }), 'Triadic');
  assert.equal(typeLabel({ harmony: 'theme:ocean' }), 'Ocean Breeze');
  assert.equal(typeLabel({ harmony: 'photo-pure' }), 'Straight from your photo');
  assert.equal(typeLabel({ harmony: 'custom' }), 'Handmade');
});

test('pasted HEX and RGB codes are parsed', () => {
  assert.deepEqual(
    parseColorCodes('#FF8FB1, #abc and bad fed' + String.fromCharCode(10) + 'rgb(127, 216, 190)' + String.fromCharCode(10) + '10, 20, 30; 33ade8'),
    ['#FF8FB1', '#AABBCC', '#7FD8BE', '#0A141E', '#33ADE8'],
  );
  assert.deepEqual(parseColorCodes('nothing here'), []);
});
