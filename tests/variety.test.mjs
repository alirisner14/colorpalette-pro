import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HARMONIES, STYLES, RECIPES, recipeFor, paletteLikeness, MIN_COLORS, MAX_COLORS, generateColors, generateDistinct, generateBatch, harmonyPlan, variantFor, paletteSimilarity, pickDistinct,
} from '../src/js/harmonies.js';
import { normalizeHex, colorDistance, hexToOklch, oklchToHex, deltaE } from '../src/js/color.js';
import { namePalette } from '../src/js/names.js';

const COLORFUL = ['#33ADE8', '#E8498F', '#2BB673', '#FFC75F', '#7C5CFF', '#FF0000'];
const EVERY = [...COLORFUL, '#17213D', '#9AA0A6', '#000000', '#FFFFFF'];
const stableSeed = (i) => 7919 * (i + 1);

/** The most alike any two palettes of a batch are (0 = nothing in common, 1 = copies). */
function worstPair(lists) {
  let worst = 0;
  for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) worst = Math.max(worst, paletteSimilarity(lists[i], lists[j]));
  return worst;
}

test('every look of every harmony still has the right number of different colors, including your color', () => {
  for (const base of EVERY) {
    for (const h of HARMONIES) {
      for (let v = 0; v < STYLES.length; v++) {
        for (const n of [MIN_COLORS, 9, MAX_COLORS]) {
          const colors = generateColors(base, h.id, n, 1234 + v, { variant: v });
          const label = `${base} ${h.id} ${STYLES[v].id} x${n}`;
          assert.equal(colors.length, n, label);
          assert.ok(colors.every((c) => /^#[0-9A-F]{6}$/.test(c)), label);
          assert.ok(colors.includes(normalizeHex(base)), `${label} keeps ${base}`);
          assert.equal(new Set(colors).size, n, `${label} has repeats`);
        }
      }
    }
  }
});

test('the same start gives the same palette, and a different seed gives a different one', () => {
  for (const h of HARMONIES) {
    assert.deepEqual(generateColors('#33ADE8', h.id, 8, 5), generateColors('#33ADE8', h.id, 8, 5), h.id);
    assert.deepEqual(generateColors('#33ADE8', h.id, 8, 5, { variant: 2 }), generateColors('#33ADE8', h.id, 8, 5, { variant: 2 }), h.id);
    assert.notDeepEqual(generateColors('#33ADE8', h.id, 8, 5), generateColors('#33ADE8', h.id, 8, 6), h.id);
  }
});

test('looks: a batch starts classic, and no harmony repeats a look', () => {
  for (const h of HARMONIES) assert.equal(variantFor(h.id, 0), 0, `${h.id} starts classic`);
  const L = STYLES.length;
  for (const h of HARMONIES) {
    assert.equal(new Set(Array.from({ length: L }, (_, r) => variantFor(h.id, r))).size, L, `${h.id} steady rounds`);
    for (const shift of [1, 2, 3, 5, 7]) {
      assert.equal(new Set(Array.from({ length: L }, (_, r) => variantFor(h.id, r, shift))).size, L, `${h.id} shift ${shift}`);
    }
  }
  // the second palette of each harmony takes a different look from its neighbors' second palettes, too
  assert.equal(new Set(HARMONIES.map((h) => variantFor(h.id, 1))).size, HARMONIES.length);
});

test('the default 14 palettes are 14 different palettes, not 7 and their copies', () => {
  const plan = harmonyPlan([], 0);
  assert.equal(plan.length, 14);
  for (const base of EVERY) {
    for (const count of [6, 8, 12, 15]) {
      const batch = generateBatch(plan, () => base, count, { seedFor: stableSeed });
      assert.equal(batch.length, 14);
      const lists = batch.map((b) => b.hexes);
      const limit = COLORFUL.includes(base) ? 0.6 : 0.7; // grays and near-black have little to vary
      assert.ok(worstPair(lists) <= limit, `${base} x${count}: two palettes are ${(worstPair(lists) * 100).toFixed(0)}% alike`);
      // each pair of the same harmony in particular
      for (let i = 0; i < 7; i++) assert.ok(paletteSimilarity(lists[i], lists[i + 7]) <= limit, `${base} x${count} ${plan[i]}`);
    }
  }
});

test('a batch is repeatable for the same start, and every palette keeps your color', () => {
  const plan = harmonyPlan([], 0);
  const a = generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed });
  const b = generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed });
  assert.deepEqual(a, b);
  const live = generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed, distinct: false });
  assert.deepEqual(live, generateBatch(plan, () => '#E8498F', 8, { seedFor: stableSeed, distinct: false }));
  for (const p of [...a, ...live]) assert.ok(p.hexes.includes('#E8498F'), p.harmony);
});

test('shuffle: the new palette is never a copy of the old one', () => {
  for (const base of EVERY) {
    for (const h of HARMONIES) {
      let prev = generateDistinct(base, h.id, 8, 99);
      for (let k = 1; k <= 8; k++) {
        const next = generateDistinct(base, h.id, 8, 99 + k * 7777, {}, [prev]);
        const s = paletteSimilarity(prev, next);
        const limit = COLORFUL.includes(base) ? 0.6 : 0.8;
        assert.ok(s <= limit, `${base} ${h.id} shuffle ${k}: ${(s * 100).toFixed(0)}% alike`);
        assert.ok(next.includes(normalizeHex(base)) || h.id === 'random' || next.some((c) => colorDistance(c, base) < 1), `${base} ${h.id} keeps your color`);
        prev = next;
      }
    }
  }
});

test('every recipe of every harmony gives the right number of different colors, including your color', () => {
  for (const base of EVERY) {
    for (const h of HARMONIES) {
      for (const recipe of RECIPES) {
        for (const n of [MIN_COLORS, 9, MAX_COLORS]) {
          for (const variant of [0, 3, 5]) {
            const colors = generateColors(base, h.id, n, 77 + n, { variant, recipe });
            const label = `${base} ${h.id} ${recipe} v${variant} x${n}`;
            assert.equal(colors.length, n, label);
            assert.equal(new Set(colors).size, n, label);
            assert.ok(colors.includes(normalizeHex(base)), label);
          }
        }
      }
    }
  }
});

test('a batch deals out different recipes: neighbours and same-harmony pairs never share one', () => {
  const plan = harmonyPlan([], 0);
  for (const offset of [0, 1, 2, 3, 4]) {
    for (let i = 1; i < plan.length; i++) {
      assert.notEqual(recipeFor(i, offset), recipeFor(i - 1, offset));
      if (i >= 7) assert.notEqual(recipeFor(i, offset), recipeFor(i - 7, offset));
    }
  }
});

test('shuffle all: the new batch does not look like the batch it replaces', () => {
  const plan = harmonyPlan([], 0);
  for (const base of COLORFUL) {
    const old = generateBatch(plan, () => base, 8, { seedFor: stableSeed }).map((b) => b.hexes);
    const fresh = generateBatch(plan, () => base, 8, { seedFor: (i) => 31337 * (i + 3), shift: 3, offset: 2, seen: old }).map((b) => b.hexes);
    fresh.forEach((p, i) => assert.ok(paletteSimilarity(p, old[i]) < 0.5, `${base} #${i} kept the same colors`));
    const typical = fresh.reduce((t, p) => t + Math.max(...old.map((o) => paletteLikeness(p, o))), 0) / fresh.length;
    assert.ok(typical < 0.6, `${base}: new palettes look like old ones (${typical.toFixed(2)})`);
  }
});

test('palette names in a batch do not repeat their first or last word', () => {
  const plan = harmonyPlan([], 0);
  for (const base of ['#7FD1B9', '#C77DFF', '#2BB673', '#FF6F91', '#33ADE8']) {
    const taken = new Set();
    generateBatch(plan, () => base, 8, { seedFor: stableSeed }).forEach((b) => taken.add(namePalette(b.hexes, b.harmony, taken)));
    const names = [...taken];
    assert.equal(names.length, 14);
    const firsts = names.map((n) => n.split(' ')[0]);
    const lasts = names.map((n) => n.split(' ').slice(-1)[0]);
    assert.ok(new Set(firsts).size >= 13, `${base}: ${names.join(', ')}`);
    assert.ok(new Set(lasts).size >= 13, `${base}: ${names.join(', ')}`);
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

test('random palettes spread their hues with the golden ratio: no clumps, and a new spread every time', () => {
  const gaps = [];
  const firsts = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const colors = generateColors('#33ADE8', 'random', 6, seed);
    const hues = colors.map(hexToOklch).filter((c) => c.c > 0.04).map((c) => c.h).sort((a, b) => a - b);
    let min = 360;
    hues.forEach((h, i) => { min = Math.min(min, i ? h - hues[i - 1] : h + 360 - hues[hues.length - 1]); });
    gaps.push(min);
    firsts.add(Math.round(hexToOklch(colors[1]).h / 30));
  }
  const avg = gaps.reduce((t, g) => t + g, 0) / gaps.length;
  assert.ok(avg > 18, `hues clump: the closest two are only ${avg.toFixed(1)} degrees apart on average`);
  assert.ok(firsts.size >= 8, 'the spread starts somewhere different each time');
});

test('partner hues keep the perceived lightness of your color (OKLCH), give or take a little', () => {
  for (const base of ['#33ADE8', '#E8498F', '#2BB673']) {
    const own = hexToOklch(base).l;
    for (let seed = 1; seed <= 20; seed++) {
      // the mosaic and tiers recipes reach far; the classic ladder keeps each hue's middle tone near yours
      const colors = generateColors(base, 'complementary', 6, seed, { variant: 0, recipe: 'ladder' });
      const partner = colors.slice(1).map(hexToOklch).filter((c) => Math.abs(((c.h - hexToOklch(base).h + 540) % 360) - 180) < 40);
      assert.ok(partner.some((c) => Math.abs(c.l - own) < 0.12), `${base} seed ${seed}`);
    }
  }
});
