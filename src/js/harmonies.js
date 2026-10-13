// Palette generation: designer-style palettes built around your color.
//
// A harmony (complementary, triadic…) is only the backbone: it places the first 3–4 colors,
// each nudged off its textbook spot the way a designer reaches for a warmer yellow or a cooler
// blue. The rest of the palette is new colors that drift away from those anchors, soft neutrals
// (creams, taupes, charcoals) and one or two wildcard pops that break the rule on purpose. No hue
// appears in more than two versions, and every palette must reach from very dark to very light
// and from muted to bright. Everything is worked out in OKLCH (see color.js) so it matches how
// eyes see color.
import { getTheme } from './themes.js';
import {
  clamp, wrapHue, hexToHsl, hslToHex, normalizeHex, colorDistance, makeRng, hashString,
  hexToOklch, oklchToHex, deltaE,
} from './color.js';

export const MIN_COLORS = 6;
export const MAX_COLORS = 15;

export const HARMONIES = [
  { id: 'complementary', label: 'Complementary', blurb: 'Opposites attract — your color and its partner across the wheel.', offsets: [0, 180] },
  { id: 'analogous', label: 'Analogous', blurb: 'Next-door neighbors on the color wheel for easy harmony.', offsets: [0, -30, 30] },
  { id: 'triadic', label: 'Triadic', blurb: 'Three hues evenly spaced for a balanced, playful mix.', offsets: [0, 120, 240] },
  { id: 'tetradic', label: 'Tetradic', blurb: 'Two complementary pairs forming a rectangle on the wheel.', offsets: [0, 60, 180, 240] },
  { id: 'split-complementary', label: 'Split Complementary', blurb: 'Your color plus the two hues beside its complement.', offsets: [0, 150, 210] },
  { id: 'monochrome', label: 'Monochrome', blurb: 'One hue, many moods: close neighbors of your color with neutrals and a pop.', offsets: [0] },
  // Only for palettes saved by older versions; new palettes are never labelled "Random".
  { id: 'random', label: 'Random', blurb: 'A happy accident built around your color.', offsets: null },
];

/** The harmonies that can be a palette's backbone (and that you can lean toward). */
export const FOUNDATIONS = HARMONIES.filter((h) => h.offsets);
/** The `harmony` of a palette built on a hidden backbone: no label is shown for it. */
export const ORGANIC = 'organic';

export const getHarmony = (id) => HARMONIES.find((h) => h.id === id);

/**
 * Human label for any palette's origin: a harmony, a theme, a photo or handmade. Everyday
 * palettes (ORGANIC) have no label, so this returns ''.
 */
export function typeLabel(p) {
  const id = p.harmony || '';
  if (id === ORGANIC) return '';
  if (id.startsWith('theme:')) return getTheme(id.slice(6)).label;
  if (id === 'photo-pure') return 'Straight from your photo';
  if (id === 'custom') return 'Handmade';
  if (id === 'imported') return 'Imported';
  if (id === 'mood') return 'From your words';
  return getHarmony(id)?.label ?? 'Palette';
}

export const AUTO_PALETTES = 14;
export const MAX_PALETTES = 40;

/** Split `total` into `parts` buckets, giving extras to the earliest buckets. */
export function distribute(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Which backbone each palette of a batch is built on. With no `lean` every backbone is dealt out
 * in a shuffled order and none is shown. Leaning toward a harmony is a preference, not a filter:
 * two palettes in every three use it (and say so), and the rest stay a surprise.
 * @returns {{ foundation: string, shown: boolean }[]}
 */
export function foundationPlan(lean = '', total = AUTO_PALETTES, seed = 1) {
  const n = clamp(Math.round(total), 0, MAX_PALETTES);
  const rng = makeRng(seed);
  const ids = FOUNDATIONS.map((h) => h.id);
  const want = ids.includes(lean) ? lean : '';
  const others = ids.filter((id) => id !== want);
  let deck = [];
  let last = '';
  const draw = () => {
    if (!deck.length) {
      deck = shuffleInPlace([...others], rng);
      if (deck[deck.length - 1] === last && deck.length > 1) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    last = deck.pop();
    return last;
  };
  return Array.from({ length: n }, (_, i) => (want && i % 3 !== 2 ? { foundation: want, shown: true } : { foundation: draw(), shown: false }));
}

const MIN_DISTANCE = 22;

function isDistinct(hex, list) {
  return list.every((c) => colorDistance(c, hex) >= MIN_DISTANCE);
}

/* ---------- the generator ----------
   Modelled on how loved, hand-made palettes behave (measured across about 1,400 palettes from two
   popular palette sites; see docs/PALETTE-RESEARCH.md):
   - restraint: usually 1–3 hue families within a fairly narrow arc of the wheel, not the whole wheel
   - a value structure first: a run of lightness steps, usually ending in a light cream or tint
   - painterly hue shifting: lighter colors lean toward warm yellow, darker ones toward cool blue
   - chroma follows lightness: richest in the light mid-tones, quieter in the darks and the lights
   - mostly soft colors, with a brighter accent only sometimes
   - a light-to-dark order most of the time, like a paint strip */

/** Below this OKLCH chroma a color reads as a neutral (cream, taupe, gray, charcoal). */
export const NEUTRAL_C = 0.045;
/** Two colors whose hues are closer than this (degrees) count as versions of the same hue. */
export const SAME_HUE = 15;
/** How many palettes at the top of a batch (and shuffles of one palette) keep your exact color. */
export const EXACT_FIRST = 2;
/** How far (OKLCH distance) your color may drift in the other palettes. */
export const BASE_DRIFT = 0.075;
/** The most versions of one hue a palette may hold. */
export const MAX_SAME_HUE = 2;
/** Every palette spans at least this much lightness (OKLCH) and reaches a light or a dark end. */
export const CONTRAST = { range: 0.3, light: 0.85, dark: 0.3 };

const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** Bell-shaped noise in [-1, 1]: mostly small nudges, rarely big ones. */
const gauss = (rng) => (rng() + rng() + rng() - 1.5) / 1.5;
const ok = (l, c, h) => oklchToHex({ l: clamp(l, 0.03, 0.985), c: Math.max(0, c), h: wrapHue(h) });
const sign = (rng) => (rng() < 0.5 ? -1 : 1);
const pick = (rng, weighted) => {
  let t = rng() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of weighted) { t -= w; if (t <= 0) return v; }
  return weighted[weighted.length - 1][0];
};
/** Turn hue `h` toward `target` by up to `amount` degrees along the shorter way round. */
const turnToward = (h, target, amount) => {
  const d = ((target - h + 540) % 360) - 180;
  return wrapHue(h + Math.sign(d) * Math.min(Math.abs(d), amount));
};

/** How colorful a color of lightness `l` usually is: richest in the light mid-tones. */
export function chromaCurve(l) {
  const spread = l < 0.64 ? 0.33 : 0.22;
  return 0.02 + 0.115 * Math.exp(-(((l - 0.64) / spread) ** 2));
}

/**
 * The hue families of a palette: your color's, plus partners placed by the backbone harmony
 * (drifted 5–20 degrees). Most palettes use one to three families.
 */
function familyHues(own, foundation, n, rng, tonal = true) {
  const drift = () => sign(rng) * (5 + rng() * 15);
  const partners = foundation.offsets.slice(1).map((o) => wrapHue(own.h + o + drift()));
  if (foundation.id === 'monochrome') {
    const home = wrapHue(own.h + gauss(rng) * 10);
    const near = wrapHue(home + sign(rng) * (25 + rng() * 15));
    return rng() < 0.4 || !tonal ? [home, near] : [home];
  }
  const extra = n >= 10 ? 1 : 0;
  const want = pick(rng, [[1, 0.25], [2, 0.45], [3, 0.3]]) + extra;
  shuffleInPlace(partners, rng);
  // your color's family centres a little to one side of it, so palettes from the same color differ
  const home = wrapHue(own.h + gauss(rng) * 16);
  return [home, ...partners].slice(0, Math.max(1, Math.min(want, partners.length + 1)));
}

/** WCAG contrast ratio between two colors (1–21). */
function contrastOf(a, b) {
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The usability every palette is held to (see makeUsable). */
// A palette is a guide (people pick their own shades for body text), so these are gentle floors:
// a 3:1 pair is enough for headings, shapes and icons; most palettes reach 4.5:1 on their own.
export const USABLE = { text: 3, accent: 0.07, apart: 0.035 };

/** The best text contrast between any two colors of a palette. */
export function bestContrast(hexes) {
  let best = 1;
  for (let i = 0; i < hexes.length; i++) for (let j = i + 1; j < hexes.length; j++) best = Math.max(best, contrastOf(hexes[i], hexes[j]));
  return best;
}

/**
 * Hold a palette to real-world use, nudging colors (never your own) when it falls short:
 * - text: some pair reads clearly (3:1, enough for headings and shapes), for websites and brand decks
 * - accent: at least one color with some real color, for logos and calls to action
 * - apart: no two colors so close they are hard to tell apart, for coloring pages and charts
 */
function makeUsable(hexes, picks, at, { text = true, accent = true } = {}) {
  const others = () => hexes.map((_, i) => i).filter((i) => i !== at);
  const set = (i, l, c, h) => { picks[i] = { ...picks[i], l, c, h }; hexes[i] = ok(l, c, h); };
  if (text) {
    for (let k = 0; k < 8 && bestContrast(hexes) < USABLE.text; k++) {
      const L = hexes.map((x) => hexToOklch(x).l);
      const dark = others().sort((a, b) => L[a] - L[b])[0];
      const light = others().sort((a, b) => L[b] - L[a])[0];
      // deepen the darkest color first (the usual fix); lighten the lightest if the dark is already deep
      if (L[dark] > 0.2) set(dark, Math.max(0.16, L[dark] - 0.06), Math.min(picks[dark].c, 0.12), picks[dark].h);
      else set(light, Math.min(0.97, L[light] + 0.04), Math.min(picks[light].c, 0.05), picks[light].h);
    }
  }
  if (accent && !hexes.some((x) => hexToOklch(x).c >= USABLE.accent)) {
    const byMid = (list) => list.sort((a, b) => Math.abs(picks[a].l - 0.62) - Math.abs(picks[b].l - 0.62))[0];
    // a colored step if there is one; otherwise (a gray start, lots of neutrals) the most mid-tone neutral
    const mid = byMid(others().filter((i) => picks[i].kind !== 'neutral')) ?? byMid(others().filter((i) => picks[i].l > 0.3 && picks[i].l < 0.9));
    if (mid !== undefined) {
      // some hues can't be that colorful at every lightness on a screen: try the nearest lightness that can
      const p = picks[mid];
      const tries = [0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2].map((d) => clamp(p.l + d, 0.3, 0.9));
      const l = tries.find((x) => hexToOklch(ok(x, USABLE.accent + 0.03, p.h)).c >= USABLE.accent) ?? p.l;
      set(mid, l, USABLE.accent + 0.03, p.h);
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    for (const i of others()) {
      for (const j of hexes.keys()) {
        if (i === j || deltaE(hexes[i], hexes[j]) >= USABLE.apart) continue;
        const p = picks[i];
        // step away from its twin (lighter if it is the lighter one, darker if darker), within bounds
        let dir = hexToOklch(hexes[i]).l >= hexToOklch(hexes[j]).l ? 1 : -1;
        if ((dir > 0 && p.l > 0.93) || (dir < 0 && p.l < 0.14)) dir = -dir;
        // light tints have no room to move in lightness, and a crowded palette may have none left:
        // turn the hue instead
        if (p.l > 0.82 || pass >= 3) set(i, p.l, Math.max(p.c, 0.03), wrapHue(p.h + (i % 2 ? 1 : -1) * 30));
        else set(i, clamp(p.l + dir * 0.045, 0.1, 0.97), p.c, p.h);
      }
    }
  }
}

/** Whether all the colorful colors of a palette are one hue (a true monochrome). */
export function isOneHue(hexes) {
  const hues = hexes.map(hexToOklch).filter((c) => c.c >= NEUTRAL_C).map((c) => c.h);
  return hues.every((h) => hueGap(h, hues[0]) < 30);
}

/**
 * Generate the colors for one palette.
 * @param {string} baseHex your color (always part of the result)
 * @param {string} foundationId the backbone harmony; anything else (such as ORGANIC) lets the seed pick one
 * @param {number} count 6–15
 * @param {number} [seed] optional seed for reproducible results
 * @param {{ exact?: boolean, tonal?: boolean }} [opts] `exact: false` lets your color drift a little
 *   toward the rest of the palette (at most BASE_DRIFT away) when that sits better; otherwise it stays
 *   exact. `tonal: false` turns a monochrome into a near-monochrome (one hue and a close neighbor).
 *   `look` (used by themes) overrides the palette's character: { families: OKLCH hues, top: [lo, hi],
 *   range: [lo, hi], mood: [lo, hi], chroma: typical chroma, neutral: share, darkNeutral: boolean }.
 */
export function generateColors(baseHex, foundationId, count, seed, { exact = true, tonal: allowTonal = true, look = null } = {}) {
  const base = normalizeHex(baseHex);
  if (!base) throw new Error(`Invalid color: ${baseHex}`);
  const n = clamp(Math.round(count), MIN_COLORS, MAX_COLORS);
  const rng = makeRng(seed ?? hashString(base + foundationId + n));
  const foundation = getHarmony(foundationId)?.offsets ? getHarmony(foundationId) : FOUNDATIONS[Math.floor(rng() * FOUNDATIONS.length)];
  const own = hexToOklch(base);
  // A gray, white or black start has no hue of its own: borrow a warm or a seeded one.
  const seedHue = own.c < 0.03 ? { ...own, h: pick(rng, [[70, 0.4], [rng() * 360, 0.6]]) } : own;
  const families = look?.families?.length ? look.families : familyHues(seedHue, foundation, n, rng, allowTonal);
  // A true monochrome: one hue in many tones (the hue limit is lifted, and the warm/cool drift is gentler).
  const tonal = (look ? look.tonal : foundation.id === 'monochrome') && families.length === 1;
  const span = ([lo, hi]) => lo + rng() * (hi - lo);

  // 1. The value structure: a run of lightness steps, usually ending in a light tint or cream.
  const moody = rng() < 0.18;
  let top = moody ? 0.7 + rng() * 0.14 : pick(rng, [[0.91 + rng() * 0.06, 0.78], [0.8 + rng() * 0.09, 0.22]]);
  const deep = !moody && rng() < 0.22; // sometimes the strip runs all the way down to an ink
  let range = clamp(0.32 + rng() * 0.3 + (n - 5) * 0.012 + (deep ? 0.2 : 0), CONTRAST.range + 0.02, top - 0.1);
  if (look) { top = clamp(span(look.top), 0.3, 0.97); range = clamp(span(look.range), 0.08, top - 0.06); } // a theme sets its own light and dark
  const levels = Array.from({ length: n }, (_, i) => top - (range * i) / (n - 1) + (i && i < n - 1 ? gauss(rng) * (range / (n - 1)) * 0.3 : 0));
  if (look?.darkNeutral) levels[n - 1] = 0.2 + rng() * 0.07; // a soft charcoal, not pure black

  // 2. The palette's character.
  const mood = look ? span(look.mood) : clamp(0.55 + rng() * 0.75 + (own.c - 0.1) * 1.5, 0.45, 1.5); // how colorful overall
  const shift = (14 + rng() * 34) * (tonal ? 0.45 : 1); // how strongly lights warm up and darks cool down
  let neutralShare = pick(rng, [[0, 0.35], [0.12 + rng() * 0.18, 0.5], [0.38 + rng() * 0.12, 0.15]]);
  if (look) neutralShare = clamp(look.neutral * (0.5 + rng()), 0, 0.5) + (look.darkNeutral ? 1 / n : 0);
  const neutrals = new Set();
  const nNeutral = Math.round(n * neutralShare);
  // neutrals sit at the ends first (a cream at the top, a charcoal or ink at the bottom), then between
  const ends = [...(look?.darkNeutral ? [n - 1] : []), 0, n - 1, 1, n - 2, ...shuffleInPlace(Array.from({ length: n }, (_, i) => i), rng)];
  for (const i of ends) { if (neutrals.size >= nNeutral) break; neutrals.add(i); }

  // 3. Which family each step belongs to: your color's family takes most; partners take the
  //    light mid-tones, where color is richest, so they read as accents.
  const fam = Array(n).fill(0);
  if (families.length > 1) {
    const mid = shuffleInPlace(Array.from({ length: n }, (_, i) => i).filter((i) => !neutrals.has(i)), rng)
      .sort((a, b) => Math.abs(levels[a] - 0.68) - Math.abs(levels[b] - 0.68));
    const partnerSlots = clamp(Math.round(n * (0.25 + rng() * 0.25)), families.length - 1, n - 2);
    // warmer partner families take the lighter of those steps, cooler ones the darker
    const warmth = (h) => Math.cos(((h - 70) * Math.PI) / 180);
    const partners = families.map((h, f) => f).slice(1).sort((a, b) => warmth(families[b]) - warmth(families[a]));
    const chosen = mid.slice(0, partnerSlots).sort((a, b) => levels[a] - levels[b]).reverse();
    chosen.forEach((i, k) => { fam[i] = partners[Math.floor((k * partners.length) / chosen.length)]; });
  }
  const pop = rng() < 0.35 && look?.accent !== false; // sometimes one accent is allowed to sing (never in pastels)

  const picks = levels.map((l, i) => {
    const h0 = families[fam[i]] + gauss(rng) * 4;
    const t = (l - 0.6) / 0.35;
    const h = turnToward(h0, t > 0 ? 85 : 265, Math.abs(t) * shift); // painterly temperature shift
    if (look?.darkNeutral && i === n - 1) {
      // the theme's dark: a charcoal, a deep brown or a deep jewel tone of the palette, for text
      const kind = pick(rng, [['charcoal', 0.4], ['brown', 0.35], ['jewel', 0.25]]);
      if (kind === 'charcoal') return { l, c: 0.01 + rng() * 0.012, h, kind: 'neutral' };
      if (kind === 'brown') return { l: l + 0.04, c: 0.04 + rng() * 0.025, h: 50 + gauss(rng) * 10, kind: 'neutral' };
      return { l: l + 0.08, c: 0.08 + rng() * 0.04, h: families[Math.floor(rng() * families.length)], kind: 'neutral' };
    }
    if (neutrals.has(i)) {
      const warmCream = l > 0.8 && rng() < 0.7;
      return { l, c: 0.008 + rng() * 0.025, h: warmCream ? 75 + gauss(rng) * 12 : h, kind: 'neutral' };
    }
    const curve = chromaCurve(l) * mood * (0.8 + rng() * 0.4);
    // a theme keeps its own intensity (pastels stay sweet, jewels stay rich) with the curve as a guide
    const w = look ? clamp(look.chroma / 0.13, 0.6, 0.92) : 0; // vivid themes lean on their own intensity more
    const c = look ? curve * (1 - w) + look.chroma * mood * (0.75 + rng() * 0.5) * w : curve;
    return { l, c, h, kind: fam[i] ? 'partner' : 'main' };
  });
  if (pop) {
    const p = picks.filter((q) => q.kind === 'partner').sort((a, b) => Math.abs(a.l - 0.66) - Math.abs(b.l - 0.66))[0]
      ?? picks.filter((q) => q.kind === 'main').sort((a, b) => Math.abs(a.l - 0.66) - Math.abs(b.l - 0.66))[0];
    if (p) p.c = Math.max(p.c, 0.16 + rng() * 0.06);
  }

  // 4. Your color takes the step closest to it: exactly, or drifted part of the way toward that step.
  let at = 0;
  picks.forEach((p, i) => { if (Math.abs(p.l - own.l) + (p.kind === 'main' ? 0 : 0.05) < Math.abs(picks[at].l - own.l) + (picks[at].kind === 'main' ? 0 : 0.05)) at = i; });
  const mine = exact ? own : {
    l: own.l + clamp(picks[at].l - own.l, -0.05, 0.05),
    c: Math.max(0, own.c + clamp(picks[at].c - own.c, -0.05, 0.02)), // calmer more often than louder
    h: own.c < 0.03 ? own.h : turnToward(own.h, picks[at].h, 10),
  };
  let yours = exact ? base : ok(mine.l, mine.c, mine.h);
  for (let k = 0; k < 6 && !exact && deltaE(yours, base) > BASE_DRIFT; k++) {
    // too far: pull it back halfway toward your color
    Object.assign(mine, { l: (mine.l + own.l) / 2, c: (mine.c + own.c) / 2, h: turnToward(mine.h, own.h, hueGap(mine.h, own.h) / 2) });
    yours = ok(mine.l, mine.c, mine.h);
  }
  if (!exact && deltaE(yours, base) > BASE_DRIFT) yours = base;
  const hexes = picks.map((p, i) => (i === at ? yours : ok(p.l, p.c, p.h)));
  picks[at] = { ...mine, kind: 'base' };

  // 5. Keep every color clearly different, and no hue in more than three versions.
  // (a few passes, since moving one color can crowd one that was already checked)
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) {
    if (i === at) continue;
    const p = picks[i];
    for (let k = 1; k < 10; k++) {
      const others = hexes.filter((_, j) => j !== i);
      const crowd = !tonal && p.kind !== 'neutral' && hexes.filter((x, j) => j !== i && hexToOklch(x).c >= NEUTRAL_C && hueGap(hexToOklch(x).h, p.h) < SAME_HUE).length >= MAX_SAME_HUE;
      if (isDistinct(hexes[i], others) && !crowd) break;
      // a crowded hue moves the painterly way: lighter colors warmer, darker colors cooler
      if (crowd && k >= 6) { p.kind = 'neutral'; p.c = 0.012 + rng() * 0.022; } // no room left: let it rest as a neutral
      else if (crowd) p.h = k < 4 ? turnToward(p.h, p.l > 0.6 ? 85 : 265, SAME_HUE + 3) : wrapHue(p.h + sign(rng) * (SAME_HUE + 3));
      else if (k < 5) p.l = clamp(p.l + (p.l > 0.88 || k % 2 ? -1 : 1) * 0.035 * Math.ceil(k / 2), 0.08, 0.97);
      // still a twin (often near white, where lightness has no room): give it a hue and a touch of color
      else { p.h = wrapHue(p.h + sign(rng) * 28); p.c = Math.max(p.c, 0.05); }
      hexes[i] = ok(p.l, p.c, p.h);
    }
  }

  // 6. Make sure it works in the real world (a website, a brand deck, a room, a coloring page).
  // pastel themes keep their softness: their readable color is the dark one above, not a loud accent
  makeUsable(hexes, picks, at, { text: true, accent: !look || look.accent !== false });

  // 7. Order: most often a light-to-dark strip (either way round), otherwise grouped by family.
  const order = Array.from({ length: n }, (_, i) => i);
  const style = pick(rng, [['down', 0.38], ['up', 0.26], ['grouped', 0.36]]);
  const L = hexes.map((x) => hexToOklch(x).l);
  if (style === 'down') order.sort((a, b) => L[b] - L[a]);
  else if (style === 'up') order.sort((a, b) => L[a] - L[b]);
  else order.sort((a, b) => fam[a] - fam[b] || L[b] - L[a]);
  return order.map((i) => hexes[i]);
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
 * palettes with the same overall mix (how light, how colorful, how many neutrals) count as alike
 * even when no single color matches.
 */
export function paletteLikeness(a, b) {
  if (!a.length || !b.length) return 0;
  const near = paletteSimilarity(a, b, 62);
  const profile = (list) => {
    const ok3 = list.map(hexToOklch);
    const L = ok3.map((c) => c.l).sort((x, y) => x - y);
    const q = (f) => L[Math.min(L.length - 1, Math.floor(f * L.length))];
    return {
      q1: q(0.25), mid: q(0.5), q3: q(0.75),
      avgC: ok3.reduce((t, c) => t + c.c, 0) / ok3.length,
      quiet: ok3.filter((c) => c.c < NEUTRAL_C).length / ok3.length,
    };
  };
  const p = profile(a), r = profile(b);
  const gap = Math.abs(p.q1 - r.q1) + Math.abs(p.mid - r.mid) + Math.abs(p.q3 - r.q3) + Math.abs(p.avgC - r.avgC) * 3 + Math.abs(p.quiet - r.quiet);
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

/**
 * paletteSimilarity counting only the colorful colors: sharing a cream or a charcoal (as loved
 * palettes often do) doesn't make two palettes copies.
 */
export function colorfulSimilarity(a, b) {
  const colorful = (list) => list.filter((h) => hexToOklch(h).c >= NEUTRAL_C);
  const x = colorful(a), y = colorful(b);
  return x.length >= 2 && y.length >= 2 ? paletteSimilarity(x, y) : paletteSimilarity(a, b);
}

// Judged by eye (paletteLikeness), and a palette that keeps half its colors never counts as new.
const LOOKS_NEW = { limit: 0.55, tries: 12, measure: (a, b) => Math.max(paletteLikeness(a, b), colorfulSimilarity(a, b) * 1.1) };

/** generateColors that keeps trying new seeds until the result is different from `others`. */
export function generateDistinct(baseHex, foundationId, count, seed, others = [], limits = LOOKS_NEW, opts = {}) {
  return pickDistinct((k) => generateColors(baseHex, foundationId, count, (seed ?? 1) + k * 104729, opts), others, limits);
}

/**
 * Colors for a whole batch. `plan` comes from foundationPlan. Unless `distinct` is switched off
 * (used while a slider is being dragged, so nothing jumps) no palette looks like an earlier one,
 * or like anything in `seen` (such as the batch that "shuffle all" is replacing).
 * @returns {{ harmony: string, foundation: string, base: string, hexes: string[] }[]}
 */
export function generateBatch(plan, baseFor, count, { seedFor, distinct = true, seen = [], exactFirst = EXACT_FIRST } = {}) {
  const others = [...seen];
  let tonals = 0;
  return plan.map((step, i) => {
    const { foundation, shown } = typeof step === 'string' ? { foundation: step, shown: true } : step;
    const base = baseFor(i);
    // one true one-hue palette per batch, unless you lean toward monochrome
    const opts = { exact: i < exactFirst, tonal: shown || tonals === 0 };
    const hexes = distinct
      ? generateDistinct(base, foundation, count, seedFor(i), others, LOOKS_NEW, opts)
      : generateColors(base, foundation, count, seedFor(i), opts);
    if (isOneHue(hexes)) tonals++;
    others.push(hexes);
    return { harmony: shown ? foundation : ORGANIC, foundation, base, hexes };
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
