import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUNDATIONS, MIN_COLORS, MAX_COLORS, AUTO_PALETTES, NEUTRAL_C, SAME_HUE, CONTRAST, ORGANIC,
  generateColors, generateDistinct, generateBatch, foundationPlan, paletteSimilarity, paletteLikeness, pickDistinct,
} from '../src/js/harmonies.js';
import { normalizeHex, hexToOklch, oklchToHex, deltaE } from '../src/js/color.js';
import { namePalette } from '../src/js/names.js';

const COLORFUL = ['#33ADE8', '#E8498F', '#2BB673', '#FFC75F', '#7C5CFF', '#FF0000', '#7FD1B9'];
const EVERY = [...COLORFUL, '#17213D', '#9AA0A6', '#000000', '#FFFFFF'];
const BACKBONES = [...FOUNDATIONS.map((h) => h.id), ORGANIC];
const stableSeed = (i) => 7919 * (i + 1);
const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Every palette we check: each start color, backbone and size, a few seeds each. */
function* everyPalette(seeds = [3, 41]) {
  for (const base of EVERY) for (const f of BACKBONES) for (const n of [MIN_COLORS, 8, 11, MAX_COLORS]) for (const seed of seeds) {
    yield { base, f, n, seed, colors: generateColors(base, f, n, seed), label: `${base} ${f} x${n} seed ${seed}` };
  }
}

test('every palette has the right number of different colors, starting with your color', () => {
  for (const { base, n, colors, label } of everyPalette()) {
    assert.equal(colors.length, n, label);
    assert.equal(colors[0], normalizeHex(base), label);
    assert.equal(new Set(colors).size, n, label);
    assert.ok(colors.every((c) => /^#[0-9A-F]{6}$/.test(c)), label);
  }
});

test('no hue appears in more than two versions (neutrals aside)', () => {
  for (const { colors, label } of everyPalette()) {
    const hues = colors.map(hexToOklch).filter((c) => c.c >= NEUTRAL_C + 0.01).map((c) => c.h);
    // a tight cluster of three or more would mean "light, medium and dark of the same hue"
    for (const h of hues) {
      const close = hues.filter((x) => hueGap(x, h) < SAME_HUE).length;
      assert.ok(close <= 2, `${label}: ${close} versions of hue ${Math.round(h)}`);
    }
  }
});

test('every palette reaches very dark and very light, muted and bright', () => {
  for (const { colors, label } of everyPalette()) {
    const o = colors.map(hexToOklch);
    assert.ok(Math.min(...o.map((c) => c.l)) <= CONTRAST.darkest + 0.005, `${label}: no very dark color`);
    assert.ok(Math.max(...o.map((c) => c.l)) >= CONTRAST.lightest - 0.005, `${label}: no very light color`);
    assert.ok(o.some((c) => c.c >= CONTRAST.bright - 0.005), `${label}: nothing bright`);
    assert.ok(o.filter((c) => c.c <= CONTRAST.muted + 0.005).length >= CONTRAST.mutedCount, `${label}: not enough muted colors or neutrals`);
  }
});

test('every palette has a vivid wildcard that sits away from the other hues', () => {
  for (const { colors, label } of everyPalette([5])) {
    const o = colors.map(hexToOklch);
    const loud = o.filter((c) => c.c >= CONTRAST.bright - 0.005);
    assert.ok(loud.length >= 1, label);
  }
});

test('anchors drift off their textbook spots instead of landing exactly on them', () => {
  // a triadic backbone on red: the partners land near 120 and 240 degrees away, but not exactly
  let exact = 0, near = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const own = hexToOklch('#FF0000').h;
    const hues = generateColors('#FF0000', 'triadic', 8, seed).map(hexToOklch).filter((c) => c.c > NEUTRAL_C).map((c) => hueGap(c.h, own));
    if (hues.some((g) => Math.abs(g - 120) < 3)) exact++;
    if (hues.some((g) => Math.abs(g - 120) <= 30)) near++;
  }
  assert.ok(near >= 36, `the backbone is still there (${near}/40)`);
  assert.ok(exact <= 8, `too many land exactly on the textbook spot (${exact}/40)`);
});

test('the same start gives the same palette, and a different seed gives a different one', () => {
  for (const f of BACKBONES) {
    assert.deepEqual(generateColors('#33ADE8', f, 8, 5), generateColors('#33ADE8', f, 8, 5), f);
    assert.notDeepEqual(generateColors('#33ADE8', f, 8, 5), generateColors('#33ADE8', f, 8, 6), f);
  }
});

test('the default 14 palettes are 14 different palettes', () => {
  for (const base of EVERY) {
    for (const count of [6, 8, 12, 15]) {
      const batch = generateBatch(foundationPlan('', AUTO_PALETTES, 1), () => base, count, { seedFor: stableSeed });
      assert.equal(batch.length, 14);
      assert.ok(batch.every((b) => b.harmony === ORGANIC), 'no harmony labels unless you lean toward one');
      const lists = batch.map((b) => b.hexes);
      let worst = 0;
      for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) worst = Math.max(worst, paletteSimilarity(lists[i], lists[j]));
      assert.ok(worst <= 0.5, `${base} x${count}: two palettes share ${(worst * 100).toFixed(0)}% of their colors`);
    }
  }
});

test('leaning toward a harmony labels the palettes built on it and keeps the others as surprises', () => {
  const batch = generateBatch(foundationPlan('triadic', 9, 1), () => '#E8498F', 8, { seedFor: stableSeed });
  assert.equal(batch.filter((b) => b.harmony === 'triadic').length, 6);
  assert.equal(batch.filter((b) => b.harmony === ORGANIC).length, 3);
});

test('a batch is repeatable for the same start, and live previews are too', () => {
  const plan = foundationPlan('', AUTO_PALETTES, 1);
  assert.deepEqual(generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed }), generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed }));
  const live = generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed, distinct: false });
  assert.deepEqual(live, generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed, distinct: false }));
});

test('shuffle: the new palette is never a copy of the old one', () => {
  for (const base of EVERY) {
    for (const f of BACKBONES) {
      let prev = generateDistinct(base, f, 8, 99);
      for (let k = 1; k <= 6; k++) {
        const next = generateDistinct(base, f, 8, 99 + k * 7777, [prev]);
        const s = paletteSimilarity(prev, next);
        assert.ok(s < 0.5, `${base} ${f} shuffle ${k}: ${(s * 100).toFixed(0)}% the same`);
        assert.equal(next[0], normalizeHex(base));
        prev = next;
      }
    }
  }
});

test('shuffle all: the new batch does not look like the batch it replaces', () => {
  const plan = foundationPlan('', AUTO_PALETTES, 1);
  for (const base of COLORFUL) {
    const old = generateBatch(plan, () => base, 8, { seedFor: stableSeed }).map((b) => b.hexes);
    const fresh = generateBatch(foundationPlan('', AUTO_PALETTES, 77), () => base, 8, { seedFor: (i) => 31337 * (i + 3), seen: old }).map((b) => b.hexes);
    fresh.forEach((p, i) => assert.ok(paletteSimilarity(p, old[i]) < 0.5, `${base} #${i} kept the same colors`));
    const typical = fresh.reduce((t, p) => t + Math.max(...old.map((o) => paletteLikeness(p, o))), 0) / fresh.length;
    assert.ok(typical < 0.65, `${base}: new palettes look like old ones (${typical.toFixed(2)})`);
  }
});

test('palette names in a batch do not repeat their first or last word', () => {
  for (const base of ['#7FD1B9', '#C77DFF', '#2BB673', '#FF6F91', '#33ADE8']) {
    const taken = new Set();
    generateBatch(foundationPlan('', AUTO_PALETTES, 1), () => base, 8, { seedFor: stableSeed }).forEach((b) => taken.add(namePalette(b.hexes, b.harmony, taken)));
    const names = [...taken];
    assert.equal(names.length, 14);
    assert.ok(new Set(names.map((n) => n.split(' ')[0])).size >= 13, `${base}: ${names.join(', ')}`);
    assert.ok(new Set(names.map((n) => n.split(' ').slice(-1)[0])).size >= 13, `${base}: ${names.join(', ')}`);
  }
});

test('similarity: copies are 1, strangers are 0, and the try-again helper falls back gracefully', () => {
  assert.equal(paletteSimilarity(['#FF0000', '#00FF00'], ['#FF0000', '#00FF00']), 1);
  assert.equal(paletteSimilarity(['#FF0000'], ['#0000FF']), 0);
  assert.equal(paletteSimilarity([], ['#0000FF']), 0);
  // when nothing is different enough it returns the least similar try, never nothing
  const same = ['#FF0000', '#00FF00'];
  const got = pickDistinct(() => same, [same], { tries: 3 });
  assert.deepEqual(got, same);
  let calls = 0;
  const picked = pickDistinct((k) => { calls++; return k < 2 ? same : ['#0000FF', '#FFFF00']; }, [same]);
  assert.deepEqual(picked, ['#0000FF', '#FFFF00']);
  assert.equal(calls, 3);
});

test('OKLCH: converts both ways exactly, and colors a screen cannot show keep their hue and lightness', () => {
  for (const hex of ['#FF0000', '#33ADE8', '#FFFFFF', '#000000', '#7FD1B9', '#FFFF00', '#17213D']) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
  const wild = hexToOklch(oklchToHex({ l: 0.7, c: 0.4, h: 140 })); // far too vivid for a screen
  assert.ok(Math.abs(wild.l - 0.7) < 0.01 && Math.abs(wild.h - 140) < 3, JSON.stringify(wild));
  assert.ok(deltaE('#FF0000', '#FE0000') < 0.01 && deltaE('#FF0000', '#0000FF') > 0.3);
});
