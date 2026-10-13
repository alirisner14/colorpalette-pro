// Studio: printables built from scratch. Pure functions (no DOM): options in, pages (scenes) out.
// Phase 1: DIY blank swatch pages, for swatching the paints, pencils and markers you own.
import { S, page } from './scene.js';
import { chipItems, rrectPath, PRINT_SHAPES } from './sheet.js';
import { PAPERS } from './printable.js';
import { textWidth } from './textmetrics.js';
import { APP_NAME } from './meta.js';

/** The usual swatch set sizes, offered as quick picks. */
export const SET_SIZES = [12, 24, 36, 48, 72, 100, 120, 150, 240, 300, 400, 500];
export const BLOCK_MIN = 1;
export const BLOCK_MAX = 72;
export const TOTAL_MAX = 500;
/** The most swatches one side of a sheet ever holds; bigger sets go over several pages. */
export const PER_PAGE_MAX = 150;
/** The smallest swatch worth painting on (mm). */
export const MIN_CHIP = 10;

const MARGIN = 10; // mm: safe on home printers
const GAP = 2.4; // between swatches
const BLOCK_GAP = 4.5; // between blocks
const HEADER_H = 12;
const FOOTER_H = 5;
const MAX_CHIP = 42;
const LINE = '#9AA3B8';
const INK = '#4B5563';
const SOFT = '#9CA3AF';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

/** Split a set size into blocks of at most BLOCK_MAX (e.g. 150 → 50 + 50 + 50). */
export function blocksFor(total, shape = 'rect') {
  const t = clamp(Math.round(Number(total) || 0), 1, TOTAL_MAX);
  if (t <= BLOCK_MAX) return [{ count: t, shape }];
  const k = Math.ceil(t / 60);
  return Array.from({ length: k }, (_, i) => ({ count: Math.floor(t / k) + (i < t % k ? 1 : 0), shape }));
}

/** Tidy options from the screen or from saved settings. */
export function normalizeBlank(raw = {}) {
  const shapes = PRINT_SHAPES.map((s) => s.id);
  let sum = 0;
  const blocks = [];
  for (const b of Array.isArray(raw.blocks) ? raw.blocks.slice(0, 40) : []) {
    const count = Math.min(clamp(Math.round(Number(b?.count) || 0), 0, BLOCK_MAX), TOTAL_MAX - sum);
    if (count < BLOCK_MIN) continue;
    blocks.push({ count, shape: shapes.includes(b?.shape) ? b.shape : 'rect' });
    sum += count;
  }
  return {
    paper: PAPERS[raw.paper] ? raw.paper : 'letter',
    orient: raw.orient === 'landscape' ? 'landscape' : 'portrait',
    sides: raw.sides === 'double' ? 'double' : 'single',
    blocks: blocks.length ? blocks : [{ count: 24, shape: 'rect' }],
    header: { medium: raw.header?.medium !== false, brand: raw.header?.brand !== false, count: !!raw.header?.count },
    info: { name: raw.info?.name !== false, number: !!raw.info?.number },
    infoPos: ['top', 'bottom', 'left', 'right'].includes(raw.infoPos) ? raw.infoPos : 'bottom',
    fill: raw.fill === 'boxes' ? 'boxes' : 'lines',
    numbered: raw.numbered !== false,
    format: raw.format === 'cut' ? 'cut' : 'print',
  };
}

export const totalOf = (o) => o.blocks.reduce((t, b) => t + b.count, 0);

/* ---------- one swatch: the shape plus its write-in fields ---------- */

const FIELD_LABELS = { name: 'Name', number: 'No.' };
const fieldsOf = (o) => ['name', 'number'].filter((k) => o.info[k]);

/** How much room a swatch's fields need, for a chip of size s. */
function cellSize(o, s) {
  const fields = fieldsOf(o);
  const side = o.infoPos === 'left' || o.infoPos === 'right';
  const row = clamp(s * 0.24, 5, 7); // one write-in row: tall enough to write in by hand
  if (side) {
    const lw = fields.length ? Math.max(20, s * 1.2) : (o.numbered ? 5 : 0); // room to write a color name
    return { w: s + lw + (lw ? 1.2 : 0), h: s, row, lw, lh: 0 };
  }
  const lh = fields.length ? fields.length * row + 0.6 : (o.numbered ? row * 0.8 : 0);
  return { w: s, h: s + lh + (lh ? 0.8 : 0), row, lw: 0, lh };
}

/** The biggest chip size that fits `segments` (counts per block) in a box, and how many columns. */
function fit(o, segments, box) {
  let best = { s: 0, cols: 1 };
  const maxCols = Math.min(40, Math.max(...segments));
  for (let cols = 1; cols <= maxCols; cols++) {
    // widest chip for this many columns
    const colW = (box.w - (cols - 1) * GAP) / cols;
    let lo = 0, hi = MAX_CHIP;
    for (let k = 0; k < 30; k++) {
      const s = (lo + hi) / 2;
      const c = cellSize(o, s);
      const rows = segments.reduce((t, n) => t + Math.ceil(n / cols), 0);
      const h = rows * c.h + (rows - 1) * GAP + (segments.length - 1) * BLOCK_GAP;
      if (c.w <= colW && h <= box.h) lo = s; else hi = s;
    }
    if (lo > best.s + 0.01) best = { s: lo, cols };
  }
  return best;
}

function fieldItems(o, x, y, w, fields, num, row, size) {
  const items = [];
  let first = true;
  const numW = num != null ? textWidth(String(num), size, { weight: 800 }) + 1 : 0;
  if (!fields.length && num != null) {
    items.push(S.text(String(num), x + w / 2, y + row * 0.62, { size, weight: 800, anchor: 'middle', fill: INK }));
    return items;
  }
  fields.forEach((f, i) => {
    const ry = y + i * row;
    const fx = x + numW; // every row lines up after the swatch number
    if (first && num != null) items.push(S.text(String(num), x, ry + row * 0.68, { size, weight: 800, fill: INK }));
    first = false;
    const label = FIELD_LABELS[f];
    if (o.fill === 'boxes') {
      items.push(S.rect(fx, ry + 0.35, Math.max(2, x + w - fx), row - 0.7, { r: 0.8, fill: '#FFFFFF', stroke: LINE, sw: 0.2 }));
      items.push(S.text(label, fx + 0.8, ry + 0.35 + size * 0.75, { size: size * 0.72, weight: 700, fill: SOFT }));
    } else {
      const lw = textWidth(label, size * 0.85, { weight: 700 }) + 0.8;
      items.push(S.text(label, fx, ry + row * 0.68, { size: size * 0.85, weight: 700, fill: SOFT }));
      items.push(S.line(fx + lw, ry + row * 0.78, x + w, ry + row * 0.78, { stroke: LINE, sw: 0.25 }));
    }
  });
  return items;
}

/** One swatch at (x, y): the chip and its fields. Returns items and its outline for cutting. */
function swatch(o, shape, index, x, y, s, c) {
  const fields = fieldsOf(o);
  const num = o.numbered ? index + 1 : null;
  const size = clamp(c.row * 0.42, 2, 2.8);
  let chip = { x, y, w: s, h: s };
  let label = null;
  if (o.infoPos === 'top') { chip = { x, y: y + c.lh + 0.8, w: s, h: s }; label = { x, y, w: s }; }
  else if (o.infoPos === 'bottom') label = { x, y: y + s + 0.8, w: s };
  else if (o.infoPos === 'left') { chip = { x: x + c.lw + 1.2, y, w: s, h: s }; label = { x, y: y + (s - Math.max(1, fields.length) * c.row) / 2, w: c.lw }; }
  else label = { x: x + s + 1.2, y: y + (s - Math.max(1, fields.length) * c.row) / 2, w: c.lw };
  const items = [...chipItems(shape, index, chip, { stroke: LINE, sw: 0.3 })];
  if (label && (fields.length || num != null)) items.push(...fieldItems(o, label.x, label.y, label.w, fields, num, c.row, size));
  return { items, cut: rrectPath(x - 0.9, y - 0.9, c.w + 1.8, c.h + 1.8, 1.4) };
}

/* ---------- the page header: medium, brand, count ---------- */

function headerItems(o, x, y, w) {
  const keys = ['medium', 'brand', 'count'].filter((k) => o.header[k]);
  if (!keys.length) return [];
  const labels = { medium: 'Medium', brand: 'Brand', count: 'Count' };
  const share = { medium: 1.25, brand: 1.25, count: 0.6 };
  const total = keys.reduce((t, k) => t + share[k], 0);
  const gap = 5;
  const items = [];
  let cx = x;
  keys.forEach((k) => {
    const fw = ((w - gap * (keys.length - 1)) * share[k]) / total;
    if (o.fill === 'boxes') {
      items.push(S.rect(cx, y, fw, HEADER_H - 3, { r: 1.4, fill: '#FFFFFF', stroke: LINE, sw: 0.3 }));
      items.push(S.text(labels[k], cx + 1.6, y + 3.2, { size: 2.4, weight: 800, fill: SOFT }));
    } else {
      const lw = textWidth(labels[k], 3.4, { weight: 800 }) + 1.5;
      items.push(S.text(labels[k], cx, y + 6.4, { size: 3.4, weight: 800, fill: INK }));
      items.push(S.line(cx + lw, y + 7, cx + fw, y + 7, { stroke: LINE, sw: 0.3 }));
    }
    cx += fw + gap;
  });
  return items;
}

/* ---------- the whole printable ---------- */

/**
 * Blank swatch pages.
 * @returns {{ pages: object[], notes: string[], total: number, perPage: number, sheets: number, chip: number }}
 */
export function buildBlankPages(raw) {
  const o = normalizeBlank(raw);
  const paper = PAPERS[o.paper];
  const landscape = o.orient === 'landscape';
  const W = landscape ? paper.h : paper.w;
  const H = landscape ? paper.w : paper.h;
  const headerH = ['medium', 'brand', 'count'].some((k) => o.header[k]) ? HEADER_H : 0;
  const box = { x: MARGIN, y: MARGIN + headerH, w: W - MARGIN * 2, h: H - MARGIN * 2 - headerH - FOOTER_H };

  // every swatch in order, with the block (and so the shape) it belongs to
  const all = o.blocks.flatMap((b, bi) => Array.from({ length: b.count }, () => ({ block: bi, shape: b.shape })));
  const total = all.length;
  const runs = (list) => list.reduce((acc, it) => {
    if (acc.length && acc[acc.length - 1].block === it.block) acc[acc.length - 1].n++;
    else acc.push({ block: it.block, n: 1 });
    return acc;
  }, []);
  const split = (P) => {
    const per = Math.ceil(total / P);
    return Array.from({ length: P }, (_, p) => all.slice(p * per, (p + 1) * per)).filter((pg) => pg.length);
  };

  // as few pages as fit (each side at most PER_PAGE_MAX, chips at least MIN_CHIP); double-sided uses both sides
  let P = o.sides === 'double' ? 2 : 1;
  let parts;
  for (;; P += o.sides === 'double' ? 2 : 1) {
    parts = split(P);
    const ok = parts.every((pg) => pg.length <= PER_PAGE_MAX && fit(o, runs(pg).map((r) => r.n), box).s >= MIN_CHIP);
    if (ok || P >= 60) break;
  }

  const pages = [];
  let index = 0;
  let smallest = MAX_CHIP;
  parts.forEach((pg, p) => {
    const segs = runs(pg);
    const { s, cols } = fit(o, segs.map((r) => r.n), box);
    smallest = Math.min(smallest, s);
    const c = cellSize(o, s);
    const usedW = cols * c.w + (cols - 1) * GAP;
    const x0 = box.x + (box.w - usedW) / 2;
    const items = [...headerItems(o, MARGIN, MARGIN, W - MARGIN * 2)];
    const cuts = [];
    let y = box.y;
    let k = 0;
    segs.forEach((seg, si) => {
      if (si) y += BLOCK_GAP;
      for (let i = 0; i < seg.n; i++) {
        const col = i % cols;
        if (i && col === 0) y += c.h + GAP;
        const it = pg[k++];
        const sw = swatch(o, it.shape, index++, x0 + col * (c.w + GAP), y, s, c);
        items.push(...sw.items);
        cuts.push(sw.cut);
      }
      y += c.h + GAP;
    });
    const side = o.sides === 'double' ? (p % 2 ? 'back' : 'front') : null;
    const sheetNo = o.sides === 'double' ? Math.floor(p / 2) + 1 : p + 1;
    const label = `${o.sides === 'double' ? `Sheet ${sheetNo} ${side}` : `Page ${p + 1}`} of ${o.sides === 'double' ? Math.ceil(parts.length / 2) : parts.length}`;
    items.push(S.text(label, MARGIN, H - MARGIN + 0.5, { size: 2.3, weight: 700, fill: SOFT }));
    items.push(S.text(APP_NAME, W - MARGIN, H - MARGIN + 0.5, { size: 2.3, weight: 700, anchor: 'end', fill: SOFT }));
    pages.push(page(r2(W), r2(H), items, { bg: '#FFFFFF', meta: { label, cuts, side, kind: 'blank-page' } }));
  });

  const sheets = o.sides === 'double' ? Math.ceil(pages.length / 2) : pages.length;
  const notes = ['Print at 100% (actual size), not "fit to page".'];
  if (o.sides === 'double') notes.push(`Print double-sided, flipping on the ${landscape ? 'short' : 'long'} edge.`);
  if (pages.length > 1 && o.sides === 'single') notes.push(`${total} swatches need ${pages.length} pages at a size worth painting on.`);
  if (o.format === 'cut') notes.push('The cut file outlines every swatch with its labels, for a cutting machine’s print-then-cut.');
  return { pages, notes, total, perPage: Math.ceil(total / pages.length), sheets, chip: r2(smallest) };
}

export function studioFileName(o) {
  const total = totalOf(normalizeBlank(o));
  return `${APP_NAME} – Blank swatch pages (${total})`;
}
