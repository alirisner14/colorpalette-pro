// Palette generation: organic, designer-style palettes built around your color.
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
  hexToOklch, oklchToHex,
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

/* ---------- the organic generator ---------- */

/** Below this OKLCH chroma a color reads as a neutral (cream, taupe, gray, charcoal). */
export const NEUTRAL_C = 0.045;
/** Two colors whose hues are closer than this (degrees) are versions of the same hue. */
export const SAME_HUE = 18;
/** The contrast every palette must have (OKLCH lightness and chroma). */
export const CONTRAST = { darkest: 0.32, lightest: 0.9, bright: 0.13, muted: 0.06, mutedCount: 2 };

const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** Bell-shaped noise in [-1, 1]: mostly small nudges, rarely big ones. */
const gauss = (rng) => (rng() + rng() + rng() - 1.5) / 1.5;
const ok = (l, c, h) => oklchToHex({ l: clamp(l, 0.03, 0.985), c: Math.max(0, c), h: wrapHue(h) });
const sign = (rng) => (rng() < 0.5 ? -1 : 1);

/** The lightness at which a hue can be most vivid, and how vivid that is. */
function brightest(h) {
  let best = { l: 0.7, c: 0 };
  for (let l = 0.5; l <= 0.92; l += 0.03) {
    const c = hexToOklch(oklchToHex({ l, c: 0.4, h })).c;
    if (c > best.c) best = { l, c };
  }
  return best;
}

/** Hue in the middle of the widest empty stretch of the wheel (or anywhere, if there are no hues). */
function emptiestHue(hues, rng) {
  if (!hues.length) return rng() * 360;
  const sorted = [...hues].map(wrapHue).sort((a, b) => a - b);
  let best = { gap: -1, mid: 0 };
  sorted.forEach((h, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
    if (next - h > best.gap) best = { gap: next - h, mid: h + (next - h) / 2 };
  });
  return wrapHue(best.mid);
}

/**
 * Where the anchor hues sit: the harmony's points, each nudged 10–25 degrees one way or the other
 * (never so far that two anchors become the same hue). Harmonies with fewer than three points get
 * a drifted neighbour so there are always three or four anchors.
 */
function anchorHues(own, foundation, rng) {
  const drift = () => sign(rng) * (10 + rng() * 15);
  let offsets;
  if (foundation.id === 'monochrome') {
    const s = sign(rng);
    offsets = [0, s * (22 + rng() * 12), -s * (22 + rng() * 12)];
  } else {
    offsets = foundation.offsets.map((o, i) => (i === 0 ? 0 : o + drift()));
    if (offsets.length < 3) offsets.push(sign(rng) * (30 + rng() * 22));
  }
  const hues = [];
  for (const o of offsets) {
    let h = wrapHue(own.h + o);
    if (hues.some((x) => hueGap(x, h) < SAME_HUE)) h = wrapHue(h + sign(rng) * (SAME_HUE + 6));
    if (!hues.some((x) => hueGap(x, h) < SAME_HUE)) hues.push(h);
  }
  return hues;
}

/**
 * Generate the colors for one palette.
 * @param {string} baseHex your color (always the first color of the result)
 * @param {string} foundationId the backbone harmony; anything else (such as ORGANIC) lets the seed pick one
 * @param {number} count 6–15
 * @param {number} [seed] optional seed for reproducible results
 */
export function generateColors(baseHex, foundationId, count, seed) {
  const base = normalizeHex(baseHex);
  if (!base) throw new Error(`Invalid color: ${baseHex}`);
  const n = clamp(Math.round(count), MIN_COLORS, MAX_COLORS);
  const rng = makeRng(seed ?? hashString(base + foundationId + n));
  const foundation = getHarmony(foundationId)?.offsets ? getHarmony(foundationId) : FOUNDATIONS[Math.floor(rng() * FOUNDATIONS.length)];
  const own = hexToOklch(base);

  // The palette's personality, so no two palettes share one recipe.
  const temper = ['bright', 'dusty', 'mixed'][Math.floor(rng() * 3)];
  const airy = [-0.06, 0, 0.06][Math.floor(rng() * 3)]; // moodier or airier overall
  const tint = [wrapHue(72 + gauss(rng) * 14), wrapHue(250 + gauss(rng) * 20), own.h][Math.floor(rng() * 3)]; // warm, cool or your color
  const charcoal = rng() < 0.55; // the darkest color is a neutral charcoal, or a deep color
  const chroma = () => {
    const bright = temper === 'bright' || (temper === 'mixed' && rng() < 0.5);
    return bright ? 0.13 + rng() * 0.09 : 0.05 + rng() * 0.05;
  };

  // How many of each kind of color.
  const wild = n >= 9 && rng() < 0.6 ? 2 : 1;
  let neutrals = clamp(Math.round(n * (0.2 + rng() * 0.16)), 2, 5);
  const hues = anchorHues(own, foundation, rng).slice(0, Math.max(3, n - wild - neutrals));
  if (hues.length + wild + neutrals > n) neutrals = n - wild - hues.length;
  let room = n - hues.length - wild - neutrals;
  const variations = Math.min(room, (rng() < 0.6 ? 1 : 0) + (n >= 11 && rng() < 0.5 ? 1 : 0));
  const drifts = room - variations;

  /** @type {{ hex: string, l: number, c: number, h: number, kind: string }[]} */
  const picks = [{ hex: base, ...own, kind: 'base' }];
  const add = (l, c, h, kind) => {
    let hex = ok(l, c, h);
    for (let k = 1; k < 8 && !isDistinct(hex, picks.map((p) => p.hex)); k++) hex = ok(l + (k % 2 ? 1 : -1) * 0.05 * Math.ceil(k / 2), c, h);
    const got = hexToOklch(hex);
    picks.push({ hex, l: got.l, c: got.c, h: kind === 'neutral' ? got.h : wrapHue(h), kind });
  };
  const chromaticHues = () => picks.filter((p) => p.c >= NEUTRAL_C || (p.kind !== 'neutral' && p.kind !== 'base')).map((p) => p.h);
  const sameHueCount = (h) => chromaticHues().filter((x) => hueGap(x, h) < SAME_HUE).length;

  // Lightness spread over the colored slots, shuffled so lights and darks land on any hue.
  const slots = hues.length - 1 + drifts;
  const levels = shuffleInPlace(Array.from({ length: slots }, (_, i) => (slots < 2 ? 0.6 : 0.32 + (0.54 * i) / (slots - 1)) + airy), rng);

  // 1. Anchors from the harmony.
  hues.slice(1).forEach((h) => add(levels.pop() + gauss(rng) * 0.03, chroma(), h, 'anchor'));
  // 2. New colors drifting off the anchors, each a hue the palette does not have yet.
  for (let k = 0; k < drifts; k++) {
    let h = null;
    for (let t = 0; t < 40 && h === null; t++) {
      const from = hues[Math.floor(rng() * hues.length)];
      const cand = wrapHue(from + sign(rng) * (28 + rng() * 47) + gauss(rng) * 5);
      if (sameHueCount(cand) === 0) h = cand;
    }
    add(levels.pop() + gauss(rng) * 0.03, chroma(), h ?? emptiestHue(chromaticHues(), rng), 'drift');
  }
  // 3. At most one more version of a hue already used: much lighter or darker, and duller or brighter.
  for (let k = 0; k < variations; k++) {
    const from = shuffleInPlace(picks.filter((p) => p.kind !== 'neutral' && p.c >= NEUTRAL_C && sameHueCount(p.h) === 1), rng)[0];
    if (!from) break;
    const l = from.l > 0.6 ? from.l - 0.3 - rng() * 0.15 : from.l + 0.28 + rng() * 0.12;
    add(l, from.c > 0.1 ? from.c * 0.45 : Math.min(from.c * 2.2 + 0.04, 0.25), from.h + gauss(rng) * 6, 'variation');
  }
  // 4. Wildcards: a vivid pop from the emptiest part of the wheel.
  for (let k = 0; k < wild; k++) {
    const h = wrapHue(emptiestHue(chromaticHues(), rng) + gauss(rng) * 10);
    const peak = brightest(h);
    add(peak.l + gauss(rng) * 0.03, peak.c * (0.84 + rng() * 0.12), h, 'wild'); // bright, a touch short of pure neon
  }
  // 5. Neutrals: a pale cream or mist, perhaps a charcoal, and taupes or grays between.
  const tones = [0.93 + rng() * 0.045];
  if (charcoal) tones.push(0.17 + rng() * 0.1);
  while (tones.length < neutrals) tones.push(0.45 + rng() * 0.33);
  tones.forEach((l, i) => add(l, i === 0 ? 0.012 + rng() * 0.022 : 0.008 + rng() * 0.035, tint + gauss(rng) * 12, 'neutral'));

  capHues(picks, rng);
  enforceContrast(picks, rng);

  // Your color first, then the colors around the wheel from it, with the neutrals tucked in
  // between them (lighter ones first) so palettes don't all end the same way.
  const order = picks.slice(1).filter((p) => p.kind !== 'neutral')
    .sort((a, b) => wrapHue(a.h - own.h) - wrapHue(b.h - own.h));
  picks.filter((p) => p.kind === 'neutral').sort((a, b) => b.l - a.l)
    .forEach((p) => order.splice(Math.floor(rng() * (order.length + 1)), 0, p));
  return [base, ...order.map((p) => p.hex)].slice(0, n);
}

/**
 * No hue in more than two versions: a third version of a hue moves to the emptiest part of the
 * wheel instead (keeping its lightness and intensity). Your own color never moves.
 */
function capHues(picks, rng) {
  const colored = () => picks.filter((p) => hexToOklch(p.hex).c >= NEUTRAL_C);
  for (let round = 0; round < 3; round++) {
    let moved = false;
    for (const p of colored().filter((q) => q.kind !== 'base')) {
      const others = colored().filter((q) => q !== p).map((q) => hexToOklch(q.hex).h);
      const h = hexToOklch(p.hex).h;
      if (others.filter((x) => hueGap(x, h) < SAME_HUE).length < 2) continue;
      const to = emptiestHue(others, rng);
      const hex = ok(p.l, p.c, to);
      Object.assign(p, { hex, h: to, c: hexToOklch(hex).c });
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * Make sure a palette reaches from very dark to very light and from muted to bright, fixing the
 * nearest color if it does not. Your own color is never changed.
 */
function enforceContrast(picks, rng) {
  const editable = picks.filter((p) => p.kind !== 'base');
  const redo = (p, l, c = p.c) => {
    const others = picks.filter((q) => q !== p).map((q) => q.hex);
    let hex = ok(l, c, p.h);
    for (let k = 1; k < 6 && !isDistinct(hex, others); k++) hex = ok(l + (k % 2 ? 1 : -1) * 0.04 * Math.ceil(k / 2), c, p.h);
    Object.assign(p, { hex }, { l: hexToOklch(hex).l, c: hexToOklch(hex).c });
  };
  const ls = () => picks.map((p) => p.l);
  if (Math.min(...ls()) > CONTRAST.darkest) {
    const p = editable.filter((q) => q.kind !== 'wild').sort((a, b) => a.l - b.l)[0];
    redo(p, 0.2 + rng() * 0.08);
  }
  if (Math.max(...ls()) < CONTRAST.lightest) {
    const p = editable.filter((q) => q.kind !== 'wild').sort((a, b) => b.l - a.l)[0];
    redo(p, 0.93 + rng() * 0.04, Math.min(p.c, 0.05));
  }
  if (!picks.some((p) => p.c >= CONTRAST.bright)) {
    const p = editable.find((q) => q.kind === 'wild') ?? editable.sort((a, b) => b.c - a.c)[0];
    const peak = brightest(p.h);
    redo(p, peak.l, peak.c);
  }
  let muted = picks.filter((p) => p.c <= CONTRAST.muted).length;
  for (const p of editable.filter((q) => q.c > CONTRAST.muted && q.kind !== 'wild').sort((a, b) => a.c - b.c)) {
    if (muted >= CONTRAST.mutedCount) break;
    redo(p, p.l, 0.035);
    muted++;
  }
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

// Judged by eye (paletteLikeness), and a palette that keeps half its colors never counts as new.
const LOOKS_NEW = { limit: 0.55, tries: 12, measure: (a, b) => Math.max(paletteLikeness(a, b), paletteSimilarity(a, b) * 1.1) };

/** generateColors that keeps trying new seeds until the result is different from `others`. */
export function generateDistinct(baseHex, foundationId, count, seed, others = [], limits = LOOKS_NEW) {
  return pickDistinct((k) => generateColors(baseHex, foundationId, count, (seed ?? 1) + k * 104729), others, limits);
}

/**
 * Colors for a whole batch. `plan` comes from foundationPlan. Unless `distinct` is switched off
 * (used while a slider is being dragged, so nothing jumps) no palette looks like an earlier one,
 * or like anything in `seen` (such as the batch that "shuffle all" is replacing).
 * @returns {{ harmony: string, foundation: string, base: string, hexes: string[] }[]}
 */
export function generateBatch(plan, baseFor, count, { seedFor, distinct = true, seen = [] } = {}) {
  const others = [...seen];
  return plan.map((step, i) => {
    const { foundation, shown } = typeof step === 'string' ? { foundation: step, shown: true } : step;
    const base = baseFor(i);
    const hexes = distinct
      ? generateDistinct(base, foundation, count, seedFor(i), others)
      : generateColors(base, foundation, count, seedFor(i));
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
