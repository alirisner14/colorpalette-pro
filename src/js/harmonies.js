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
 * Build `n` tones of one hue. The first tone is the anchor itself; the rest
 * fan out lighter and darker, softening saturation as they lighten.
 */
function toneLadder({ h, s, l }, n, rng, taken, { style, drift }) {
  const out = [];
  const steps = [0, 0.14, -0.14, 0.27, -0.26, 0.37, -0.36, 0.08, -0.08, 0.21, -0.2, 0.32, -0.31, 0.42, -0.4];
  const baseSat = clamp(s * style.sat, style.floor, 1);
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
  // Fallback: walk saturation if lightness steps collided.
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const hex = hslToHex({
      h: wrapHue(h + (rng() - 0.5) * 24),
      s: clamp(0.15 + rng() * 0.8),
      l: clamp(0.15 + rng() * 0.78),
    });
    if (isDistinct(hex, [...taken, ...out])) out.push(hex);
  }
  return out;
}

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
 * Generate a list of hex colors for a harmony.
 * @param {string} baseHex starting color (always part of the result)
 * @param {string} harmonyId one of HARMONIES ids
 * @param {number} count 6–15
 * @param {number} [seed] optional seed for reproducible results
 * @param {{ variant?: number }} [opts] `variant` picks one of STYLES; otherwise the seed does
 */
export function generateColors(baseHex, harmonyId, count, seed, { variant } = {}) {
  const base = normalizeHex(baseHex);
  if (!base) throw new Error(`Invalid color: ${baseHex}`);
  const n = clamp(Math.round(count), MIN_COLORS, MAX_COLORS);
  const harmony = getHarmony(harmonyId);
  if (!harmony) throw new Error(`Unknown harmony: ${harmonyId}`);
  const rng = makeRng(seed ?? hashString(base + harmonyId + n));

  const pick = rng();
  const style = STYLES[(variant ?? Math.floor(pick * STYLES.length)) % STYLES.length];
  if (!harmony.offsets) return randomColors(base, n, rng, style);

  const look = { style, drift: (rng() - 0.5) * 56 * style.hue };
  const wander = (3 + rng() * 14) * style.hue; // degrees a partner hue may stray from its textbook spot
  const hsl = hexToHsl(base);
  // Grays have no meaningful hue, so give partner hues some color to work with.
  const partnerSat = hsl.s < 0.12 ? 0.5 : hsl.s;

  const sizes = distribute(n, harmony.offsets.length);
  if (sizes.length > 1 && rng() < 0.6) {
    // Sometimes one hue takes the lead.
    const to = Math.floor(rng() * sizes.length);
    const from = sizes.reduce((best, v, i) => (i !== to && v > (sizes[best] ?? 0) ? i : best), to === 0 ? 1 : 0);
    if (from !== to && sizes[from] > 2) { sizes[from] -= 1; sizes[to] += 1; }
  }

  const result = [];
  harmony.offsets.forEach((offset, i) => {
    const anchor = i === 0
      ? hsl
      : {
        h: wrapHue(hsl.h + offset + (rng() - 0.5) * 2 * wander),
        s: clamp(partnerSat * (0.9 + rng() * 0.2)),
        l: clamp(hsl.l + (rng() - 0.5) * 0.2, 0.2, 0.85),
      };
    const tones = toneLadder(anchor, sizes[i], rng, result, look);
    if (i === 0) tones[0] = base; // keep the exact chosen color
    result.push(...tones.sort(byLightness));
  });
  const colors = result.slice(0, n);
  return style.order === 'light' ? colors.sort(byLightness) : colors;
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
 * Call `make(k)` (k = 0, 1, 2…) until it returns a palette that does not look too much like any
 * of `others` (lists of hex colors). Falls back to the least similar one. Used so shuffles really
 * change and a batch never holds near-copies.
 */
export function pickDistinct(make, others = [], { limit = 0.5, tries = 6 } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (let k = 0; k < tries; k++) {
    const hexes = make(k);
    const score = Math.max(0, ...others.map((o) => paletteSimilarity(hexes, o)));
    if (score < limit) return hexes;
    if (score < bestScore) { best = hexes; bestScore = score; }
  }
  return best;
}

/** generateColors that keeps trying new seeds until the result is different from `others`. */
export function generateDistinct(baseHex, harmonyId, count, seed, opts = {}, others = [], limits) {
  return pickDistinct(
    (k) => (k === 0
      ? generateColors(baseHex, harmonyId, count, seed, opts)
      : generateColors(baseHex, harmonyId, count, (seed ?? 1) + k * 104729)), // later tries are free to take another look
    others,
    limits,
  );
}

/**
 * Colors for a whole batch of harmony palettes. `plan` lists one harmony per palette (see
 * harmonyPlan). Palettes of the same harmony get different looks, and unless `distinct` is
 * switched off (used while a slider is being dragged, so nothing jumps) none is a near-copy of
 * an earlier one. `seen` may hold hex lists that the batch must also differ from.
 * @returns {{ harmony: string, base: string, hexes: string[] }[]}
 */
export function generateBatch(plan, baseFor, count, { seedFor, shift = 0, distinct = true, seen = [] } = {}) {
  const kinds = new Set(plan).size;
  return plan.map((harmony, i) => {
    const base = baseFor(i);
    const opts = { variant: variantFor(harmony, Math.floor(i / kinds), shift) };
    const hexes = distinct
      ? generateDistinct(base, harmony, count, seedFor(i), opts, seen)
      : generateColors(base, harmony, count, seedFor(i), opts);
    seen.push(hexes);
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
