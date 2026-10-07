// Palette generation from a base color using classic color harmonies.
import { getTheme } from './themes.js';
import {
  clamp, wrapHue, hexToHsl, hslToHex, normalizeHex, colorDistance, makeRng, hashString,
} from './color.js';

export const MIN_COLORS = 6;
export const MAX_COLORS = 15;

export const HARMONIES = [
  { id: 'complementary', label: 'Complementary', blurb: 'Opposites attract — your color and its partner across the wheel.', offsets: [0, 180] },
  { id: 'analogous', label: 'Analogous', blurb: 'Next-door neighbors on the color wheel for easy harmony.', offsets: [0, -30, 30] },
  { id: 'triadic', label: 'Triadic', blurb: 'Three hues evenly spaced for a balanced, playful mix.', offsets: [0, 120, 240] },
  { id: 'tetradic', label: 'Tetradic', blurb: 'Two complementary pairs forming a rectangle on the wheel.', offsets: [0, 60, 180, 240] },
  { id: 'split-complementary', label: 'Split Complementary', blurb: 'Your color plus the two hues beside its complement.', offsets: [0, 150, 210] },
  { id: 'monochrome', label: 'Monochrome', blurb: 'One hue, many moods — tints, tones and shades.', offsets: [0] },
  { id: 'random', label: 'Random', blurb: 'A happy accident built around your color.', offsets: null },
];

export const getHarmony = (id) => HARMONIES.find((h) => h.id === id);

/** Human label for any palette's origin: a harmony, a theme, a photo or handmade. */
export function typeLabel(p) {
  const id = p.harmony || '';
  if (id.startsWith('theme:')) return getTheme(id.slice(6)).label;
  if (id === 'photo-pure') return 'Straight from your photo';
  if (id === 'custom') return 'Handmade';
  if (id === 'imported') return 'Imported';
  if (id === 'mood') return 'From your words';
  return getHarmony(id)?.label ?? 'Palette';
}

export const PER_TYPE_DEFAULT = 2;
export const MAX_PALETTES = 40;

/**
 * Which harmony each palette in a batch uses. No filter means every type.
 * `total` 0 (auto) gives PER_TYPE_DEFAULT of each; otherwise round-robin.
 */
export function harmonyPlan(filter = [], total = 0) {
  const ids = filter.length ? HARMONIES.filter((h) => filter.includes(h.id)).map((h) => h.id) : HARMONIES.map((h) => h.id);
  const n = total > 0 ? Math.min(total, MAX_PALETTES) : ids.length * PER_TYPE_DEFAULT;
  return Array.from({ length: n }, (_, i) => ids[i % ids.length]);
}

/** Split `total` into `parts` buckets, giving extras to the earliest buckets. */
export function distribute(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

const MIN_DISTANCE = 22;

function isDistinct(hex, list) {
  return list.every((c) => colorDistance(c, hex) >= MIN_DISTANCE);
}

/**
 * The looks a palette can take. Every harmony is shown in several of them, so a batch
 * (and every shuffle) gives palettes that really differ instead of near-copies.
 *   spread  how far the tones fan out lighter and darker
 *   lift    pushes the tones lighter (+) or darker (-)
 *   sat     scales saturation, never below `floor`
 *   hue     how freely partner hues wander and how much tones drift in hue
 *   order   'grouped' keeps each hue together; 'light' runs the whole palette light to dark
 */
export const STYLES = [
  { id: 'classic', spread: 1, lift: 0, sat: 1, floor: 0, hue: 0.5, order: 'grouped' },
  { id: 'soft', spread: 0.85, lift: 0.17, sat: 0.72, floor: 0.12, hue: 1, order: 'grouped' },
  { id: 'deep', spread: 0.95, lift: -0.13, sat: 1.1, floor: 0.2, hue: 1, order: 'grouped' },
  { id: 'muted', spread: 1.05, lift: 0.02, sat: 0.5, floor: 0.08, hue: 1, order: 'grouped' },
  { id: 'vivid', spread: 0.8, lift: 0, sat: 1.35, floor: 0.6, hue: 1, order: 'grouped' },
  { id: 'airy', spread: 1.3, lift: 0.1, sat: 0.85, floor: 0.1, hue: 1.2, order: 'light' },
  { id: 'dusk', spread: 1.15, lift: -0.08, sat: 0.78, floor: 0.1, hue: 1.2, order: 'grouped' },
  { id: 'contrast', spread: 1.4, lift: 0, sat: 1.05, floor: 0.2, hue: 1, order: 'light' },
];

/**
 * How a palette is put together. Each one gives a really different kind of palette from the
 * same harmony, so a batch is not a row of "two shades of this, three shades of that".
 *   ladder    each hue in a few tones, lighter and darker
 *   blend     a smooth walk around the wheel from hue to hue, like a gradient
 *   mosaic    the hues mixed together, each at its own lightness
 *   accent    mostly soft neutrals tinted with your color, with a few bright accents
 *   tiers     a row of pale tints over a row of rich, deep colors
 */
export const RECIPES = ['ladder', 'blend', 'mosaic', 'accent', 'tiers'];

/**
 * Which look palette number `round` of a harmony gets in a batch. With no `shift` the first of
 * each harmony is the classic look and the later ones take different looks, so the same
 * start gives the same batch. A `shift` (for "shuffle all") turns the whole set to new looks.
 */
export function variantFor(harmonyId, round, shift = 0) {
  const L = STYLES.length;
  const at = Math.max(0, HARMONIES.findIndex((h) => h.id === harmonyId));
  if (shift) return (shift + 3 * round + at) % L; // 3 and 8 share no factor, so rounds never repeat a look
  return round === 0 ? 0 : 1 + ((round - 1 + at) % (L - 1));
}

/**
 * Which recipe palette `i` of a batch uses. Neighbours always differ, and so do two palettes of
 * the same harmony (with 7 harmonies they are 7 apart, and 7 is not a multiple of 5).
 */
export const recipeFor = (i, offset = 0) => RECIPES[(i + offset) % RECIPES.length];

const satOf = (s, style) => clamp(s * style.sat, style.floor, 1);
/** The lightest and darkest a palette of this look reaches. */
const lightRange = (style) => [clamp(0.5 + style.lift - 0.33 * style.spread, 0.1, 0.5), clamp(0.52 + style.lift + 0.36 * style.spread, 0.6, 0.94)];
const spreadOver = (n, lo, hi) => Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : hi - ((hi - lo) * i) / (n - 1)));
function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** ladder: each hue fans out lighter and darker, softening saturation as it lightens. */
function toneLadder({ h, s, l }, n, rng, taken, { style, drift }) {
  const out = [];
  const steps = [0, 0.14, -0.14, 0.27, -0.26, 0.37, -0.36, 0.08, -0.08, 0.21, -0.2, 0.32, -0.31, 0.42, -0.4];
  const baseSat = satOf(s, style);
  const centre = clamp(l + style.lift, 0.2, 0.8);
  for (const step of steps) {
    if (out.length >= n) break;
    const st = step * style.spread;
    const nl = clamp(centre + st + (rng() - 0.5) * 0.03, 0.1, 0.95);
    const satShift = st > 0 ? -st * 0.45 : -st * 0.15;
    const ns = clamp(baseSat + satShift + (rng() - 0.5) * 0.06, style.floor * 0.5, 1);
    const nh = wrapHue(h + drift * st + (rng() - 0.5) * 6); // lighter tones lean one way, darker the other
    const hex = hslToHex({ h: nh, s: ns, l: nl });
    if (isDistinct(hex, [...taken, ...out])) out.push(hex);
  }
  return out;
}

function ladder(anchors, n, rng, style) {
  const look = { style, drift: (rng() - 0.5) * 56 * style.hue };
  const sizes = distribute(n, anchors.length);
  if (sizes.length > 1 && rng() < 0.6) {
    // Sometimes one hue takes the lead.
    const to = Math.floor(rng() * sizes.length);
    const from = sizes.reduce((best, v, i) => (i !== to && v > (sizes[best] ?? 0) ? i : best), to === 0 ? 1 : 0);
    if (from !== to && sizes[from] > 2) { sizes[from] -= 1; sizes[to] += 1; }
  }
  const out = [];
  anchors.forEach((a, i) => out.push(...toneLadder(a, sizes[i], rng, out, look).sort(byLightness)));
  return out;
}

/** blend: walk around the wheel through every hue of the harmony, light at one end and deep at the other. */
function blend(anchors, n, rng, style) {
  const [base] = anchors;
  const dir = rng() < 0.5 ? 1 : -1;
  let offs = anchors.map((a) => wrapHue((a.h - base.h) * dir)).sort((a, b) => a - b);
  let reach = offs[offs.length - 1];
  if (reach < 30) reach = 30 + rng() * 40 * style.hue; // one hue (monochrome): drift to a neighbour instead
  const [lo, hi] = lightRange(style);
  const shape = Math.floor(rng() * 3); // light to dark, dark to light, or deep in the middle
  const s0 = satOf(anchors.reduce((t, a) => t + a.s, 0) / anchors.length, style);
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const k = shape === 0 ? t : shape === 1 ? 1 - t : 1 - Math.abs(t * 2 - 1);
    return hslToHex({
      h: wrapHue(base.h + dir * reach * t),
      s: clamp(s0 * (0.82 + 0.3 * Math.sin(t * Math.PI)) + (rng() - 0.5) * 0.06, style.floor * 0.5, 1),
      l: clamp(hi - (hi - lo) * k + (rng() - 0.5) * 0.04, 0.08, 0.95),
    });
  });
}

/** mosaic: the hues mixed together, every color at a different lightness. */
function mosaic(anchors, n, rng, style) {
  const [lo, hi] = lightRange(style);
  const levels = shuffleInPlace(spreadOver(n, lo, hi), rng);
  const start = Math.floor(rng() * anchors.length);
  const out = Array.from({ length: n }, (_, i) => {
    const a = anchors[(start + i) % anchors.length];
    return hslToHex({
      h: wrapHue(a.h + (rng() - 0.5) * 22 * style.hue),
      s: clamp(satOf(a.s, style) * (0.65 + rng() * 0.5), style.floor * 0.5, 1),
      l: levels[i],
    });
  });
  return style.order === 'light' ? out.sort(byLightness) : out;
}

/** accent: soft neutrals tinted toward your color (warm or cool), lit up by a few bright accents. */
function accent(anchors, n, rng, style) {
  const [base] = anchors;
  const accents = Math.max(2, Math.min(anchors.length + 1, Math.round(n * 0.38)));
  const lean = rng() < 0.5 ? 40 : 220; // creams and tans, or cool grays
  const tintHue = wrapHue(base.h + (wrapHue(lean - base.h + 180) - 180) * (0.25 + rng() * 0.5));
  const neutrals = spreadOver(n - accents, 0.12 + Math.max(0, -style.lift) * 0.3, 0.95).map((l) => hslToHex({
    h: wrapHue(tintHue + (rng() - 0.5) * 16),
    s: clamp(0.05 + rng() * 0.16 + (l > 0.85 ? 0.15 : 0), 0, 0.4),
    l: clamp(l + (rng() - 0.5) * 0.03, 0.06, 0.96),
  }));
  const pops = Array.from({ length: accents }, (_, i) => {
    const a = anchors[i % anchors.length];
    return hslToHex({
      h: wrapHue(a.h + (i >= anchors.length ? 14 : 0)),
      s: clamp(Math.max(satOf(a.s, style), 0.55), 0, 1),
      l: clamp(0.5 + style.lift * 0.6 + (i >= anchors.length ? -0.16 : (rng() - 0.5) * 0.12), 0.25, 0.75),
    });
  });
  return [...neutrals, ...pops];
}

/** tiers: a row of pale tints of every hue above a row of deep, rich versions. */
function tiers(anchors, n, rng, style) {
  const pale = Math.ceil(n / 2);
  const row = (count, light) => Array.from({ length: count }, (_, i) => {
    const a = anchors[i % anchors.length];
    const lap = Math.floor(i / anchors.length);
    return hslToHex({
      h: wrapHue(a.h + lap * 18 * (light ? 1 : -1) + (rng() - 0.5) * 8 * style.hue),
      s: light ? clamp(satOf(a.s, style) * 0.55 + 0.15, 0.2, 0.75) : clamp(satOf(a.s, style) * 1.05, style.floor, 1),
      l: light ? clamp(0.86 - lap * 0.06 + style.lift * 0.3 + (rng() - 0.5) * 0.04, 0.7, 0.95) : clamp(0.36 + lap * 0.1 + style.lift * 0.5 + (rng() - 0.5) * 0.05, 0.14, 0.55),
    });
  });
  return [...row(pale, true), ...row(n - pale, false)];
}

const RECIPE_FNS = { ladder, blend, mosaic, accent, tiers };

function randomColors(base, n, rng, style) {
  const out = [base];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const hex = hslToHex({
      h: rng() * 360,
      s: clamp((0.3 + rng() * 0.62) * style.sat, Math.max(0.1, style.floor * 0.6), 1),
      l: clamp(0.22 + rng() * 0.64 + style.lift * 0.8, 0.12, 0.92),
    });
    if (isDistinct(hex, out)) out.push(hex);
  }
  return out;
}

const byLightness = (a, b) => hexToHsl(b).l - hexToHsl(a).l;

/**
 * Make sure a recipe's colors hold your exact color and `n` clearly different colors: your color
 * replaces the closest one, near-twins are dropped, and any gaps are filled from the harmony's hues.
 */
function finish(list, base, n, anchors, rng) {
  let at = 0;
  list.forEach((c, i) => { if (colorDistance(c, base) < colorDistance(list[at], base)) at = i; });
  const withBase = list.map((c, i) => (i === at ? base : c));
  const out = [];
  withBase.forEach((c) => { if (c === base || isDistinct(c, out.filter((x) => x !== base).concat(base))) out.push(c); });
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const a = anchors[guard % anchors.length];
    const hex = hslToHex({
      h: wrapHue(a.h + (rng() - 0.5) * 30),
      s: clamp(0.15 + rng() * 0.8),
      l: clamp(0.12 + rng() * 0.82),
    });
    if (isDistinct(hex, out)) out.push(hex);
  }
  return out.slice(0, n);
}

/**
 * Generate a list of hex colors for a harmony.
 * @param {string} baseHex starting color (always part of the result)
 * @param {string} harmonyId one of HARMONIES ids
 * @param {number} count 6–15
 * @param {number} [seed] optional seed for reproducible results
 * @param {{ variant?: number, recipe?: string }} [opts] `variant` picks one of STYLES and `recipe`
 *   one of RECIPES; otherwise the seed picks them
 */
export function generateColors(baseHex, harmonyId, count, seed, { variant, recipe } = {}) {
  const base = normalizeHex(baseHex);
  if (!base) throw new Error(`Invalid color: ${baseHex}`);
  const n = clamp(Math.round(count), MIN_COLORS, MAX_COLORS);
  const harmony = getHarmony(harmonyId);
  if (!harmony) throw new Error(`Unknown harmony: ${harmonyId}`);
  const rng = makeRng(seed ?? hashString(base + harmonyId + n));

  const style = STYLES[(variant ?? Math.floor(rng() * STYLES.length)) % STYLES.length];
  const how = RECIPES.includes(recipe) ? recipe : RECIPES[Math.floor(rng() * RECIPES.length)];
  if (!harmony.offsets) return randomColors(base, n, rng, style);

  const wander = (3 + rng() * 14) * style.hue; // degrees a partner hue may stray from its textbook spot
  const hsl = hexToHsl(base);
  // Grays have no meaningful hue, so give partner hues some color to work with.
  const partnerSat = hsl.s < 0.12 ? 0.5 : hsl.s;
  const anchors = harmony.offsets.map((offset, i) => (i === 0
    ? hsl
    : {
      h: wrapHue(hsl.h + offset + (rng() - 0.5) * 2 * wander),
      s: clamp(partnerSat * (0.9 + rng() * 0.2)),
      l: clamp(hsl.l + (rng() - 0.5) * 0.2, 0.2, 0.85),
    }));
  const colors = finish(RECIPE_FNS[how](anchors, n, rng, style), base, n, anchors, rng);
  return style.order === 'light' && how !== 'tiers' && how !== 'accent' ? colors.sort(byLightness) : colors;
}

/**
 * How alike two palettes look, from 0 (nothing in common) to 1 (every color has a twin in
 * the other). Colors closer than `reach` count as twins.
 */
export function paletteSimilarity(a, b, reach = 30) {
  if (!a.length || !b.length) return 0;
  const share = (x, y) => x.filter((c) => y.some((d) => colorDistance(c, d) < reach)).length / x.length;
  return Math.max(share(a, b), share(b, a));
}

/**
 * How alike two palettes look to a person: colors only roughly the same still count, and two
 * palettes with the same overall lightness and color mix count as alike even when no single
 * color matches.
 */
export function paletteLikeness(a, b) {
  if (!a.length || !b.length) return 0;
  const near = paletteSimilarity(a, b, 62);
  const profile = (list) => {
    const hsl = list.map(hexToHsl);
    const L = hsl.map((c) => c.l).sort((x, y) => x - y);
    const avgS = hsl.reduce((t, c) => t + c.s, 0) / hsl.length;
    return { lo: L[0], hi: L[L.length - 1], mid: L[Math.floor(L.length / 2)], avgS };
  };
  const p = profile(a), q = profile(b);
  const gap = Math.abs(p.lo - q.lo) + Math.abs(p.hi - q.hi) + Math.abs(p.mid - q.mid) + Math.abs(p.avgS - q.avgS);
  const shape = clamp(1 - gap / 0.45);
  return near * 0.75 + shape * 0.25;
}

/**
 * Call `make(k)` (k = 0, 1, 2…) until it returns a palette that does not look too much like any
 * of `others` (lists of hex colors). Falls back to the least similar one. Used so shuffles really
 * change and a batch never holds near-copies.
 */
export function pickDistinct(make, others = [], { limit = 0.5, tries = 6, measure = paletteSimilarity } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (let k = 0; k < tries; k++) {
    const hexes = make(k);
    const score = Math.max(0, ...others.map((o) => measure(hexes, o)));
    if (score < limit) return hexes;
    if (score < bestScore) { best = hexes; bestScore = score; }
  }
  return best;
}

/** How strict a harmony palette must be about looking different from the others. */
const LOOKS_NEW = { limit: 0.55, tries: 12, measure: paletteLikeness };

/** generateColors that keeps trying new seeds until the result is different from `others`. */
export function generateDistinct(baseHex, harmonyId, count, seed, opts = {}, others = [], limits = LOOKS_NEW) {
  return pickDistinct(
    (k) => (k === 0
      ? generateColors(baseHex, harmonyId, count, seed, opts)
      : generateColors(baseHex, harmonyId, count, (seed ?? 1) + k * 104729, { recipe: k < 4 ? opts.recipe : undefined })), // later tries are free to take another look
    others,
    limits,
  );
}

/**
 * Colors for a whole batch of harmony palettes. `plan` lists one harmony per palette (see
 * harmonyPlan). Palettes get different recipes and looks, and unless `distinct` is switched off
 * (used while a slider is being dragged, so nothing jumps) none looks like an earlier one.
 * `seen` may hold hex lists that the batch must also differ from (such as the batch that "shuffle
 * all" is replacing). `offset` turns the recipes so a shuffle deals them out differently.
 * @returns {{ harmony: string, base: string, hexes: string[] }[]}
 */
export function generateBatch(plan, baseFor, count, { seedFor, shift = 0, offset = 0, distinct = true, seen = [] } = {}) {
  const kinds = new Set(plan).size;
  const others = [...seen];
  return plan.map((harmony, i) => {
    const base = baseFor(i);
    const opts = { variant: variantFor(harmony, Math.floor(i / kinds), shift), recipe: recipeFor(i, offset) };
    const hexes = distinct
      ? generateDistinct(base, harmony, count, seedFor(i), opts, others)
      : generateColors(base, harmony, count, seedFor(i), opts);
    others.push(hexes);
    return { harmony, base, hexes };
  });
}

/** Suggestions for swapping a single color out of a palette. */
export function swapOptions(hex, existing = [], seed = Date.now()) {
  const rng = makeRng(seed);
  const { h, s, l } = hexToHsl(hex);
  const raw = [
    { h, s, l: l + 0.12 }, { h, s, l: l - 0.12 },
    { h, s: s + 0.2, l }, { h, s: s - 0.25, l },
    { h: h + 15, s, l }, { h: h - 15, s, l },
    { h: h + 35, s, l }, { h: h - 35, s, l },
    { h: h + 180, s, l },
    { h: rng() * 360, s: 0.35 + rng() * 0.55, l: 0.3 + rng() * 0.55 },
    { h: rng() * 360, s: 0.35 + rng() * 0.55, l: 0.3 + rng() * 0.55 },
  ];
  const out = [];
  for (const c of raw) {
    const cand = hslToHex({ h: wrapHue(c.h), s: clamp(c.s), l: clamp(c.l, 0.06, 0.96) });
    if (cand !== hex && !existing.includes(cand) && isDistinct(cand, out)) out.push(cand);
  }
  return out;
}
