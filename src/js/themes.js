// Themed random palettes — no starting color needed.
import { clamp, wrapHue, hslToHex, hexToHsl, colorDistance, makeRng } from './color.js';

/**
 * hues: hue ranges [from, to] in degrees (to may exceed 360 to wrap).
 * s/l: saturation and lightness ranges. neutral: share of near-neutral colors.
 */
export const THEMES = [
  { id: 'spring', label: 'Spring Blossoms', emoji: '🌷', hues: [[320, 350], [80, 130], [45, 60], [190, 210]], s: [0.45, 0.8], l: [0.65, 0.86] },
  { id: 'summer', label: 'Summer Splash', emoji: '🏖️', hues: [[180, 205], [40, 55], [5, 20], [325, 345]], s: [0.65, 0.95], l: [0.5, 0.72] },
  { id: 'autumn', label: 'Autumn Harvest', emoji: '🍂', hues: [[15, 40], [40, 55], [0, 12], [70, 90]], s: [0.45, 0.85], l: [0.28, 0.58], neutral: 0.1 },
  { id: 'winter', label: 'Winter Frost', emoji: '❄️', hues: [[195, 230], [250, 275], [170, 190]], s: [0.15, 0.55], l: [0.4, 0.92], neutral: 0.25 },
  { id: 'halloween', label: 'Spooky Halloween', emoji: '🎃', hues: [[22, 34], [270, 290], [95, 115]], s: [0.7, 1], l: [0.3, 0.58], neutral: 0.15, darkNeutral: true },
  { id: 'christmas', label: 'Cozy Christmas', emoji: '🎄', hues: [[350, 365], [125, 150], [42, 50]], s: [0.5, 0.85], l: [0.25, 0.55], neutral: 0.15 },
  { id: 'valentine', label: 'Sweet Valentine', emoji: '💘', hues: [[330, 360], [345, 365], [280, 300]], s: [0.5, 0.9], l: [0.45, 0.85] },
  { id: 'easter', label: 'Easter Egg Hunt', emoji: '🐣', hues: [[270, 290], [50, 60], [140, 165], [190, 210], [330, 350]], s: [0.45, 0.75], l: [0.78, 0.9] },
  { id: 'ocean', label: 'Ocean Breeze', emoji: '🌊', hues: [[175, 230], [35, 45]], s: [0.4, 0.85], l: [0.25, 0.8] },
  { id: 'forest', label: 'Enchanted Forest', emoji: '🌲', hues: [[85, 150], [25, 40]], s: [0.25, 0.65], l: [0.18, 0.55], neutral: 0.1 },
  { id: 'sunset', label: 'Golden Sunset', emoji: '🌅', hues: [[0, 45], [320, 345], [260, 280]], s: [0.6, 0.95], l: [0.4, 0.7] },
  { id: 'tropical', label: 'Tropical Punch', emoji: '🍹', hues: [[340, 360], [20, 45], [90, 130], [170, 190]], s: [0.75, 1], l: [0.45, 0.62] },
  { id: 'candy', label: 'Candy Shop', emoji: '🍭', hues: [[300, 345], [170, 195], [45, 60], [260, 280]], s: [0.6, 0.95], l: [0.68, 0.85] },
  { id: 'pastel', label: 'Pastel Dreams', emoji: '☁️', hues: [[0, 360]], s: [0.35, 0.7], l: [0.8, 0.9] },
  { id: 'neon', label: 'Neon Nights', emoji: '🪩', hues: [[290, 325], [170, 190], [70, 95], [200, 230]], s: [0.9, 1], l: [0.5, 0.6], neutral: 0.12, darkNeutral: true },
  { id: 'retro', label: 'Retro 70s', emoji: '🕺', hues: [[20, 45], [45, 55], [75, 95], [5, 15]], s: [0.45, 0.8], l: [0.35, 0.6] },
  { id: 'boho', label: 'Boho Earth', emoji: '🪴', hues: [[10, 35], [30, 45], [75, 100]], s: [0.2, 0.5], l: [0.35, 0.78], neutral: 0.2 },
  { id: 'cottagecore', label: 'Cottagecore', emoji: '🌼', hues: [[80, 120], [330, 355], [40, 55], [200, 220]], s: [0.2, 0.5], l: [0.6, 0.85] },
  { id: 'desert', label: 'Desert Dunes', emoji: '🏜️', hues: [[15, 45], [180, 200]], s: [0.25, 0.6], l: [0.45, 0.8], neutral: 0.15 },
  { id: 'galaxy', label: 'Cosmic Galaxy', emoji: '🌌', hues: [[230, 300], [300, 330], [180, 200]], s: [0.5, 0.9], l: [0.12, 0.6] },
  { id: 'coffee', label: 'Coffee Shop', emoji: '☕', hues: [[20, 40]], s: [0.2, 0.55], l: [0.15, 0.82], neutral: 0.2 },
  { id: 'jewel', label: 'Jewel Tones', emoji: '💎', hues: [[340, 360], [140, 165], [220, 245], [270, 290], [40, 48]], s: [0.6, 0.9], l: [0.25, 0.42] },
  { id: 'nordic', label: 'Nordic Calm', emoji: '🛋️', hues: [[190, 220], [20, 40], [90, 120]], s: [0.05, 0.3], l: [0.45, 0.92], neutral: 0.35 },
  { id: 'rainbow', label: 'Rainbow Party', emoji: '🌈', hues: [[0, 360]], s: [0.7, 0.95], l: [0.48, 0.62], spread: true },
];

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

const between = (rng, [a, b]) => a + rng() * (b - a);

/**
 * A themed palette. `flavor` varies the mix so a batch isn't samey:
 *  0 balanced (all hue ranges), 1 focus (one or two ranges), 2 tonal (one hue, many values).
 */
export function generateThemeColors(themeId, n, seed = 1, flavor = 0) {
  const t = getTheme(themeId);
  const rng = makeRng(seed);
  let ranges = t.hues.slice();
  if (flavor === 1 && ranges.length > 2) {
    const start = Math.floor(rng() * ranges.length);
    ranges = [ranges[start], ranges[(start + 1) % ranges.length]];
  }
  const tonalHue = between(rng, ranges[Math.floor(rng() * ranges.length)]);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 2000) {
    const i = out.length;
    let h, s, l;
    if (t.neutral && rng() < t.neutral) {
      h = between(rng, ranges[0]);
      s = rng() * 0.12;
      l = t.darkNeutral ? 0.06 + rng() * 0.12 : 0.12 + rng() * 0.8;
    } else if (flavor === 2) {
      h = tonalHue + (rng() - 0.5) * 16;
      s = between(rng, t.s);
      l = clamp(t.l[0] + ((t.l[1] - t.l[0]) * (i + 0.5)) / n + (rng() - 0.5) * 0.08, 0.06, 0.95);
    } else if (t.spread) {
      h = (i / n) * 360 + between(rng, [0, 360 / n]) + seed;
      s = between(rng, t.s);
      l = between(rng, t.l);
    } else {
      h = between(rng, ranges[i % ranges.length]);
      s = between(rng, t.s);
      l = between(rng, t.l);
    }
    const hex = hslToHex({ h: wrapHue(h), s: clamp(s), l: clamp(l) });
    const minDist = guard > 800 ? 10 : 24;
    if (out.every((c) => colorDistance(c, hex) >= minDist)) out.push(hex);
  }
  // Group by hue, then light to dark inside each group, for a tidy chip row.
  return out.sort((a, b) => {
    const A = hexToHsl(a), B = hexToHsl(b);
    const ga = A.s < 0.12 ? 999 : Math.round(A.h / 30), gb = B.s < 0.12 ? 999 : Math.round(B.h / 30);
    return ga - gb || B.l - A.l;
  });
}
