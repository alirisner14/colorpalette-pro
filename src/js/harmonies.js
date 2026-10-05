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
 * Build `n` tones of one hue. The first tone is the anchor itself; the rest
 * fan out lighter and darker, softening saturation as they lighten.
 */
function toneLadder({ h, s, l }, n, rng, taken) {
  const out = [];
  const steps = [0, 0.14, -0.14, 0.27, -0.26, 0.37, -0.36, 0.08, -0.08, 0.21, -0.2, 0.32, -0.31, 0.42, -0.4];
  for (const step of steps) {
    if (out.length >= n) break;
    const nl = clamp(l + step + (rng() - 0.5) * 0.03, 0.1, 0.95);
    const satShift = step > 0 ? -step * 0.45 : -step * 0.15;
    const ns = clamp(s + satShift + (rng() - 0.5) * 0.06, 0, 1);
    const nh = wrapHue(h + (rng() - 0.5) * 6);
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

function randomColors(base, n, rng) {
  const out = [base];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const hex = hslToHex({ h: rng() * 360, s: 0.3 + rng() * 0.62, l: 0.22 + rng() * 0.64 });
    if (isDistinct(hex, out)) out.push(hex);
  }
  return out;
}

const byLightness = (a, b) => hexToHsl(b).l - hexToHsl(a).l;

/**
 * Generate a list of hex colors for a harmony.
 * @param {string} baseHex starting color
 * @param {string} harmonyId one of HARMONIES ids
 * @param {number} count 6–15
 * @param {number} [seed] optional seed for reproducible results
 */
export function generateColors(baseHex, harmonyId, count, seed) {
  const base = normalizeHex(baseHex);
  if (!base) throw new Error(`Invalid color: ${baseHex}`);
  const n = clamp(Math.round(count), MIN_COLORS, MAX_COLORS);
  const harmony = getHarmony(harmonyId);
  if (!harmony) throw new Error(`Unknown harmony: ${harmonyId}`);
  const rng = makeRng(seed ?? hashString(base + harmonyId + n));

  if (!harmony.offsets) return randomColors(base, n, rng);

  const hsl = hexToHsl(base);
  // Grays have no meaningful hue, so give partner hues some color to work with.
  const partnerSat = hsl.s < 0.12 ? 0.5 : hsl.s;
  const sizes = distribute(n, harmony.offsets.length);
  const result = [];
  harmony.offsets.forEach((offset, i) => {
    const anchor = i === 0
      ? hsl
      : { h: wrapHue(hsl.h + offset), s: partnerSat, l: clamp(hsl.l + (rng() - 0.5) * 0.12, 0.2, 0.85) };
    const tones = toneLadder(anchor, sizes[i], rng, result);
    if (i === 0) tones[0] = base; // keep the exact chosen color
    result.push(...tones.sort(byLightness));
  });
  return result.slice(0, n);
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
