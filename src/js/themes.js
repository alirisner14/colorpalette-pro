// Themed random palettes — no starting color needed.
import { wrapHue, hslToHex, hexToHsl, hexToOklch, oklchToHex, makeRng } from './color.js';
import { generateColors } from './harmonies.js';

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
 * A theme as a recipe for the palette generator: which hue families to use (a different mix each
 * time), how light and how dark, how colorful and how many neutrals. Everything else (the lightness
 * steps, warm lights and cool darks, which family takes which step, the order) varies per palette,
 * so shuffling a theme gives really different palettes that still feel like that theme.
 */
export function themeLook(t, rng) {
  const okHue = (h) => hexToOklch(hslToHex({ h: wrapHue(h), s: 0.7, l: 0.55 })).h;
  const ranges = [...t.hues];
  for (let i = ranges.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranges[i], ranges[j]] = [ranges[j], ranges[i]]; }
  let families;
  if (t.spread) {
    const start = rng() * 360;
    families = Array.from({ length: 4 + Math.floor(rng() * 3) }, (_, i) => okHue(start + i * 137.5)); // golden-angle rainbow
  } else if (ranges.length === 1 && ranges[0][1] - ranges[0][0] >= 300) {
    // any hue at all (pastels): one hue (all blush), two neighbours (mint and sky) or a soft rainbow
    const start = rng() * 360;
    const shape = rng();
    if (shape < 0.3) families = [okHue(start)];
    else if (shape < 0.65) families = [okHue(start), okHue(start + (35 + rng() * 30) * (rng() < 0.5 ? -1 : 1))];
    else families = Array.from({ length: 3 }, (_, i) => okHue(start + i * (100 + rng() * 60)));
  } else {
    // one to three of the theme's hue groups; themes built on many hues (neon, candy, tropical) use at least two
    const least = ranges.length >= 4 ? 2 : 1;
    const k = Math.min(ranges.length, least + Math.floor(rng() * (4 - least)));
    families = ranges.slice(0, Math.max(1, k)).map((r) => okHue(between(rng, r)));
  }
  // translate the theme's lightness and saturation into OKLCH, sampled over its own hues
  const sample = (l) => t.hues.map((r) => hexToOklch(hslToHex({ h: wrapHue((r[0] + r[1]) / 2), s: (t.s[0] + t.s[1]) / 2, l })));
  const loL = Math.min(...sample(t.l[0]).map((c) => c.l));
  const hiL = Math.max(...sample(t.l[1]).map((c) => c.l));
  const mid = sample((t.l[0] + t.l[1]) / 2);
  const chroma = mid.reduce((sum, c) => sum + c.c, 0) / mid.length;
  const width = hiL - loL;
  return {
    families,
    tonal: true,
    // some palettes sit high in the theme (latte), some low (dark roast); tints keep some color near the top
    top: [Math.min(Math.min(0.94, hiL + 0.02), Math.max(loL + 0.15, Math.min(0.92, hiL - 0.03) - Math.min(0.14, width * 0.35))), Math.min(0.94, hiL + 0.02)],
    range: [Math.max(0.08, width * 0.6), Math.max(0.1, width + 0.04)],
    mood: [0.6, 1.45], // from chalky to sweet
    chroma,
    neutral: t.neutral ?? 0.08,
    // light, narrow themes (pastels) stay soft, with one dark (charcoal, brown or jewel) for text
    darkNeutral: !!t.darkNeutral || (loL > 0.6 && width < 0.25),
    accent: !(loL > 0.6 && width < 0.25),
  };
}

/** A themed palette: a color from the theme to start from, then the generator with the theme's recipe. */
export function generateThemeColors(themeId, n, seed = 1) {
  const t = getTheme(themeId);
  const rng = makeRng(seed);
  const look = themeLook(t, rng);
  const mid = (t.l[0] + t.l[1]) / 2;
  const start = oklchToHex({ l: hexToOklch(hslToHex({ h: 0, s: 0, l: mid })).l, c: look.chroma, h: look.families[0] });
  return generateColors(start, 'organic', n, Math.floor(rng() * 2 ** 31), { look });
}

/** Group by hue, then light to dark inside each group, for a tidy row of chips. */
export function tidy(hexes) {
  return [...hexes].sort((a, b) => {
    const A = hexToHsl(a), B = hexToHsl(b);
    const ga = A.s < 0.12 ? 999 : Math.round(A.h / 30), gb = B.s < 0.12 ? 999 : Math.round(B.h / 30);
    return ga - gb || B.l - A.l;
  });
}
