// Text widths without a browser, so layouts can be planned (and tested) anywhere.
// Helvetica's published widths are used for body text, and they are exact for the
// PDF output (which uses Helvetica). On screen the app's fonts are within a few
// percent of these, and the layout leaves a little slack for that.

// Widths in 1/1000 em for characters 32..126.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/** Fonts the layouts use: 'display' (rounded headings), 'body', 'mono'. */
const DISPLAY_WIDER = 1.1; // Grandstander is a little wider than Helvetica Bold

function charWidth(code, bold) {
  const table = bold ? HELV_BOLD : HELV;
  if (code >= 32 && code <= 126) return table[code - 32];
  if (code === 160) return table[0];
  return 556; // accented letters and everything else: a typical lowercase width
}

/** Width of `str` in the same units as `size`. */
export function textWidth(str, size, { font = 'body', weight = 400 } = {}) {
  const s = String(str);
  if (font === 'mono') return s.length * 0.6 * size;
  const bold = font === 'display' || weight >= 600;
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0), bold);
  w = (w / 1000) * size;
  return font === 'display' ? w * DISPLAY_WIDER : w;
}

/** The largest size ≤ `size` at which `str` fits in `maxW` (never below `min`). */
export function fitSize(str, size, maxW, { min = 1.2, font = 'body', weight = 400 } = {}) {
  const w = textWidth(str, size, { font, weight });
  if (w <= maxW || w === 0) return size;
  return Math.max(min, size * (maxW / w) * 0.97);
}

/** Shorten `str` with an ellipsis until it fits in `maxW` at `size`. */
export function ellipsize(str, size, maxW, opts = {}) {
  let s = String(str);
  if (textWidth(s, size, opts) <= maxW) return s;
  while (s.length > 1 && textWidth(`${s}…`, size, opts) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Break text into at most `maxLines` lines that each fit in `maxW`. */
export function wrapText(str, size, maxW, { maxLines = 2, ...opts } = {}) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || textWidth(next, size, opts) <= maxW) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = ellipsize(`${lines[maxLines - 1]} …`, size, maxW, opts);
  }
  return lines.map((l) => ellipsize(l, size, maxW, opts));
}
