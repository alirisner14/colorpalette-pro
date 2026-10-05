// WCAG color contrast. Pure math, no DOM.
import { luminance, hexToRgb } from './color.js';

/** Contrast ratio between two colors, 1 (identical) to 21 (black on white). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const GRADES = ['AAA', 'AA', 'AA Large', 'Fail'];

/** WCAG 2.x level for normal-size text, with "AA Large" meaning large text only. */
export function gradeOf(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

export const gradeHint = {
  AAA: 'Great for any text',
  AA: 'Good for body text',
  'AA Large': 'Big or bold text only',
  Fail: 'Hard to read as text',
};

/** Every distinct pair of colors, best contrast first. */
export function allPairs(colors) {
  const out = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = contrastRatio(colors[i].hex, colors[j].hex);
      out.push({ i, j, a: colors[i], b: colors[j], ratio, grade: gradeOf(ratio) });
    }
  }
  return out.sort((x, y) => y.ratio - x.ratio);
}

export function summarize(colors) {
  const pairs = allPairs(colors);
  const count = (g) => pairs.filter((p) => p.grade === g).length;
  return {
    pairs,
    total: pairs.length,
    aaa: count('AAA'),
    aa: count('AA') + count('AAA'),
    large: pairs.filter((p) => p.ratio >= 3).length,
    fail: count('Fail'),
  };
}

/** The best text color for a background: black, white or any palette color. */
export function bestTextOn(bgHex, palette = []) {
  const candidates = ['#FFFFFF', '#000000', ...palette.map((c) => c.hex).filter((h) => h !== bgHex)];
  let best = { hex: '#FFFFFF', ratio: 0 };
  for (const hex of candidates) {
    const ratio = contrastRatio(bgHex, hex);
    if (ratio > best.ratio) best = { hex, ratio };
  }
  return best;
}

/** Which of black / white reads better on a background (for labels over color). */
export function readableOn(hex) {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#000000') ? '#FFFFFF' : '#000000';
}

export const ratioText = (r) => `${r.toFixed(r >= 10 ? 1 : 2)}:1`;
export { hexToRgb };
