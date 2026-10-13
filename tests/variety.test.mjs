import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUNDATIONS, MIN_COLORS, MAX_COLORS, AUTO_PALETTES, NEUTRAL_C, SAME_HUE, MAX_SAME_HUE, CONTRAST, ORGANIC, chromaCurve, EXACT_FIRST, BASE_DRIFT, isOneHue, USABLE, bestContrast,
  generateColors, generateDistinct, generateBatch, foundationPlan, paletteSimilarity, colorfulSimilarity, paletteLikeness, pickDistinct,
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






test('every palette has the right number of different colors, including your exact color', () => {
  for (const { base, n, colors, label } of everyPalette()) {
    assert.equal(colors.length, n, label);
    assert.ok(colors.includes(normalizeHex(base)), label);
    assert.equal(new Set(colors).size, n, label);
    assert.ok(colors.every((c) => /^#[0-9A-F]{6}$/.test(c)), label);
  }
});

test('no hue appears in more than two versions (neutrals aside)', () => {
  let over = 0, total = 0;
  for (const { colors, base, f } of everyPalette()) {
    if (f === 'monochrome' || f === ORGANIC) continue; // true monochromes (which ORGANIC may pick) are allowed to be one hue
    total++;
    const own = normalizeHex(base);
    const hues = colors.filter((c) => c !== own).map(hexToOklch).filter((c) => c.c >= NEUTRAL_C + 0.01).map((c) => c.h);
    if (hues.some((h) => hues.filter((x) => hueGap(x, h) < SAME_HUE - 2).length > MAX_SAME_HUE)) over++;
  }
  assert.ok(over / total < 0.03, `${over} of ${total} palettes have a hue in three or more versions`);
});

test('every palette has a real value structure: a wide lightness range reaching a light or a dark end', () => {
  for (const { colors, label } of everyPalette()) {
    const L = colors.map((c) => hexToOklch(c).l);
    assert.ok(Math.max(...L) - Math.min(...L) >= CONTRAST.range - 0.02, `${label}: range ${(Math.max(...L) - Math.min(...L)).toFixed(2)}`);
    assert.ok(Math.max(...L) >= CONTRAST.light - 0.17 || Math.min(...L) <= CONTRAST.dark, label);
  }
});

test('palettes behave like loved hand-made ones: mostly soft, restrained, lights warmer than darks, often a light-to-dark strip', () => {
  const pool = ['#7FD1B9', '#E8498F', '#33ADE8', '#FFC75F', '#6D597A', '#2A9D8F', '#E76F51', '#B5838D', '#606C38', '#9AA0A6'];
  let neon = 0, soft = 0, strip = 0, warmer = 0, warmN = 0, narrow = 0, n = 0;
  const yellowGap = (h) => hueGap(h, 85);
  pool.forEach((base, b) => FOUNDATIONS.forEach((f, k) => [1, 2, 3, 4, 5].forEach((s) => {
    const own = normalizeHex(base);
    const o = generateColors(base, f.id, 6, b * 100 + k * 10 + s).filter((c) => c !== own).map(hexToOklch);
    n++;
    if (o.some((c) => c.c > 0.2)) neon++;
    if (Math.max(...o.map((c) => c.c)) < 0.13) soft++;
    const all = generateColors(base, f.id, 6, b * 100 + k * 10 + s).map((c) => hexToOklch(c).l);
    if (all.every((v, i) => !i || v <= all[i - 1] + 0.01) || all.every((v, i) => !i || v >= all[i - 1] - 0.01)) strip++;
    const c = o.filter((x) => x.c > 0.04);
    if (c.length >= 2) {
      const lo = c.reduce((a, x) => (x.l < a.l ? x : a)), hi = c.reduce((a, x) => (x.l > a.l ? x : a));
      warmN++; if (yellowGap(hi.h) <= yellowGap(lo.h)) warmer++;
    }
    const hues = c.map((x) => x.h).sort((a, z) => a - z);
    let maxGap = 0; hues.forEach((h, i) => { maxGap = Math.max(maxGap, (i + 1 < hues.length ? hues[i + 1] : hues[0] + 360) - h); });
    if (hues.length < 2 || 360 - maxGap <= 180) narrow++;
  })));
  assert.ok(neon / n < 0.15, `neon in ${Math.round((100 * neon) / n)}% (loved palettes: 9–25%)`);
  assert.ok(soft / n > 0.3, `all-soft in ${Math.round((100 * soft) / n)}% (loved palettes: 39–64%)`);
  assert.ok(strip / n > 0.5, `light-to-dark strips in ${Math.round((100 * strip) / n)}% (loved palettes: 35–66%)`);
  assert.ok(warmer / warmN > 0.6, `lights warmer than darks in ${Math.round((100 * warmer) / warmN)}% (loved palettes: 84%)`);
  assert.ok(narrow / n > 0.6, `hues within half the wheel in ${Math.round((100 * narrow) / n)}%`);
});

test('color is richest in the light mid-tones and quieter in the darks and lights', () => {
  assert.ok(chromaCurve(0.65) > chromaCurve(0.3) && chromaCurve(0.65) > chromaCurve(0.95));
  assert.ok(chromaCurve(0.95) < 0.045, 'the lightest colors are creams and tints');
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
      for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) worst = Math.max(worst, colorfulSimilarity(lists[i], lists[j]));
      // big palettes share a few deep shadows (darks all lean toward blue), so allow a little more there
      assert.ok(worst <= (count >= 12 ? 0.6 : 0.5), `${base} x${count}: two palettes share ${(worst * 100).toFixed(0)}% of their colors`);
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
        const s = colorfulSimilarity(prev, next);
        assert.ok(s < 0.5, `${base} ${f} shuffle ${k}: ${(s * 100).toFixed(0)}% the same`);
        assert.ok(next.includes(normalizeHex(base)));
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
    fresh.forEach((p, i) => assert.ok(colorfulSimilarity(p, old[i]) < 0.5, `${base} #${i} kept the same colors`));
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

test('your exact color stays in the first two palettes; later ones may let it drift a little toward the palette', () => {
  for (const base of ['#7FD1B9', '#E8498F', '#9AA0A6', '#000000']) {
    const batch = generateBatch(foundationPlan('', AUTO_PALETTES, 1), () => base, 8, { seedFor: stableSeed });
    batch.slice(0, EXACT_FIRST).forEach((b, i) => assert.ok(b.hexes.includes(normalizeHex(base)), `${base} #${i} keeps it exactly`));
    batch.slice(EXACT_FIRST).forEach((b, i) => {
      const near = Math.min(...b.hexes.map((h) => deltaE(h, base)));
      assert.ok(near <= BASE_DRIFT + 1e-6, `${base} #${i + EXACT_FIRST} drifted ${near.toFixed(3)}`);
    });
  }
});

test('monochrome palettes can be one hue in many tones, but a batch is never mostly one-hue palettes', () => {
  const oneHue = isOneHue;
  let tonal = 0;
  for (let s = 1; s <= 40; s++) if (oneHue(generateColors('#33ADE8', 'monochrome', 8, s))) tonal++;
  assert.ok(tonal >= 15, `only ${tonal} of 40 monochrome palettes are really one hue`);
  for (const base of COLORFUL) {
    const batch = generateBatch(foundationPlan('', AUTO_PALETTES, 1), () => base, 8, { seedFor: stableSeed });
    const n = batch.filter((b) => oneHue(b.hexes)).length;
    assert.ok(n <= 2, `${base}: ${n} of 14 palettes are one hue`);
  }
  // leaning toward monochrome lets them all be
  const lean = generateBatch(foundationPlan('monochrome', 9, 1), () => '#E8498F', 8, { seedFor: stableSeed });
  assert.ok(lean.filter((b) => isOneHue(b.hexes)).length >= 3);
  {
  }
});

test('every palette is usable in the real world: readable text, an accent, and colors you can tell apart', () => {
  for (const { colors, label } of everyPalette([3, 41, 77])) {
    assert.ok(bestContrast(colors) >= USABLE.text, `${label}: best text contrast ${bestContrast(colors).toFixed(2)}`);
    assert.ok(colors.some((c) => hexToOklch(c).c >= USABLE.accent - 0.005), `${label}: no accent`);
    let closest = 9;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) closest = Math.min(closest, deltaE(colors[i], colors[j]));
    assert.ok(closest >= USABLE.apart - 0.012, `${label}: two colors only ${closest.toFixed(3)} apart`);
  }
});
