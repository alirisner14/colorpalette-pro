// Color math utilities. All hue values are degrees [0, 360); s/l/v are [0, 1].

export const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export const wrapHue = (h) => ((h % 360) + 360) % 360;

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const to = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function normalizeHex(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb) : null;
}

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }) {
  h = wrapHue(h); s = clamp(s); l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return hslToRgb({ h, s: sl, l });
}

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));
export const hexToHsv = (hex) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv) => rgbToHex(hsvToRgb(hsv));

/** WCAG relative luminance. */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Black or white text, whichever contrasts better against `hex`. */
export function readableText(hex) {
  const L = luminance(hex);
  return (1.05 / (L + 0.05)) > ((L + 0.05) / 0.05) ? '#FFFFFF' : '#1E1E2A';
}

export function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

/** Simple perceptual-ish distance in RGB (weighted). */
export function colorDistance(a, b) {
  const x = hexToRgb(a), y = hexToRgb(b);
  const rm = (x.r + y.r) / 2;
  const dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/* ---------- OKLab / OKLCH (Björn Ottosson, 2020) ----------
   A perceptually even color space: the same step in lightness looks like the same step for
   every hue, and turning the hue keeps a color's perceived lightness and intensity. l is [0, 1],
   c (chroma) is about [0, 0.37] for screen colors, h is degrees. */

const toLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { l: L, c: Math.hypot(A, Bb), h: wrapHue((Math.atan2(Bb, A) * 180) / Math.PI) };
}

function oklchToLinear({ l, c, h }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/**
 * An OKLCH color as hex. Colors a screen cannot show keep their lightness and hue and lose just
 * enough chroma to fit, so they never shift to a different-looking color.
 */
export function oklchToHex({ l, c, h }) {
  const L = clamp(l, 0, 1);
  let lo = 0, hi = Math.max(0, c);
  let rgb = oklchToLinear({ l: L, c: hi, h });
  if (!inGamut(rgb)) {
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l: L, c: mid, h }))) lo = mid; else hi = mid;
    }
    rgb = oklchToLinear({ l: L, c: lo, h });
  }
  const [r, g, b] = rgb.map(fromLinear);
  return rgbToHex({ r, g, b });
}

/** Perceived difference between two colors (OKLab distance; about 0.02 is just noticeable). */
export function deltaE(a, b) {
  const p = hexToOklch(a), q = hexToOklch(b);
  const pa = p.c * Math.cos((p.h * Math.PI) / 180), pb = p.c * Math.sin((p.h * Math.PI) / 180);
  const qa = q.c * Math.cos((q.h * Math.PI) / 180), qb = q.c * Math.sin((q.h * Math.PI) / 180);
  return Math.hypot(p.l - q.l, pa - qa, pb - qb);
}

/** Golden-ratio step in degrees: hues taken this far apart never clump, however many there are. */
export const GOLDEN_ANGLE = 0.6180339887 * 360;

/** Deterministic 32-bit string hash (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) so palettes can be reproduced. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Read HEX (#abc, abcdef) and rgb()/"r, g, b" codes out of any pasted text. */
export function parseColorCodes(text) {
  const out = [];
  const re = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})[^)]*\)|(?:^|[\s;])(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?=$|[\s;])|#([0-9a-f]{3})\b|#?\b([0-9a-f]{6})\b/gim;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] || m[4]) {
      const [r, g, b] = (m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]]).map(Number);
      if (r <= 255 && g <= 255 && b <= 255) out.push(rgbToHex({ r, g, b }));
    } else {
      out.push(normalizeHex(m[7] || m[8]));
    }
  }
  return [...new Set(out.filter(Boolean))];
}
