// Studio: printables built from scratch. Pure functions (no DOM): options in, pages (scenes) out.
// Phase 1: DIY blank swatch pages, for swatching the paints, pencils and markers you own.
//
// A printable is made of blocks (a set of 24 pencils, then a set of 36 markers…). Every block has its
// own header (medium, brand, count) and its swatches; blocks are stacked with space between them.
// Write-ins are either filled in now, in the app (and printed), or left as spaces to write in later.
import { S, page } from './scene.js';
import { chipItems, rrectPath, PRINT_SHAPES } from './sheet.js';
import { PAPERS } from './printable.js';
import { textWidth, ellipsize } from './textmetrics.js';
import { APP_NAME } from './meta.js';

/** The usual swatch set sizes, offered as quick picks. */
export const SET_SIZES = [12, 24, 36, 48, 72, 100, 120, 150, 240, 300, 400, 500];
export const BLOCK_MIN = 1;
/** A block is one set of supplies (24 pencils, 150 markers…), so it can be as big as the whole printable. */
export const BLOCK_MAX = 500;
export const TOTAL_MAX = 500;
/** The most swatches one side of a sheet ever holds; bigger sets go over several pages. */
export const PER_PAGE_MAX = 150;
/** The smallest swatch worth painting on (mm). */
export const MIN_CHIP = 10;
export const TEXT_MAX = 40;

const MARGIN = 10; // mm: safe on home printers
const GAP = 2.4; // between swatches
const BLOCK_GAP = 6; // between blocks
const BLOCK_HEAD = 9; // a block's header strip
const FOOTER_H = 5;
const MAX_CHIP = 42;
const LINE = '#9AA3B8';
const INK = '#4B5563';
const SOFT = '#9CA3AF';
const WRITTEN = '#1F2937';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;
const txt = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) : '');

/** A set size as one block (one set of supplies, with one header). */
export function blocksFor(total) {
  return [{ count: clamp(Math.round(Number(total) || 0), 1, TOTAL_MAX) }];
}

/** A tidy block: how many swatches, its shape, its header values and the colors typed in for it. */
function cleanBlock(b, count, shapes) {
  const colors = (Array.isArray(b?.colors) ? b.colors : []).slice(0, count).map((c) => ({ name: txt(c?.name), number: txt(c?.number) }));
  return {
    count,
    shape: shapes.includes(b?.shape) ? b.shape : 'rect',
    medium: txt(b?.medium),
    brand: txt(b?.brand),
    setCount: txt(b?.setCount),
    colors,
  };
}

/** Tidy options from the screen or from saved settings. */
export function normalizeBlank(raw = {}) {
  const shapes = PRINT_SHAPES.map((s) => s.id);
  let sum = 0;
  const blocks = [];
  for (const b of Array.isArray(raw.blocks) ? raw.blocks.slice(0, 40) : []) {
    const count = Math.min(clamp(Math.round(Number(b?.count) || 0), 0, BLOCK_MAX), TOTAL_MAX - sum);
    if (count < BLOCK_MIN) continue;
    blocks.push(cleanBlock(b, count, shapes));
    sum += count;
  }
  const fill = raw.style ?? raw.fill;
  return {
    paper: PAPERS[raw.paper] ? raw.paper : 'letter',
    orient: raw.orient === 'landscape' ? 'landscape' : 'portrait',
    sides: raw.sides === 'double' ? 'double' : 'single',
    shape: shapes.includes(raw.shape) ? raw.shape : (blocks[0]?.shape ?? 'rect'),
    mixShapes: !!raw.mixShapes,
    blocks: blocks.length ? blocks : [cleanBlock({}, 24, shapes)],
    header: { medium: raw.header?.medium !== false, brand: raw.header?.brand !== false, count: !!raw.header?.count },
    info: { name: raw.info?.name !== false, number: !!raw.info?.number },
    infoPos: ['top', 'bottom', 'left', 'right'].includes(raw.infoPos) ? raw.infoPos : 'bottom',
    mode: raw.mode === 'fill' ? 'fill' : 'write',
    style: fill === 'boxes' ? 'boxes' : 'lines',
    numbered: raw.numbered !== false,
    format: raw.format === 'cut' ? 'cut' : 'print',
  };
}

export const totalOf = (o) => o.blocks.reduce((t, b) => t + b.count, 0);
const shapeOf = (o, b) => (o.mixShapes ? b.shape : o.shape);
const headKeys = (o) => ['medium', 'brand', 'count'].filter((k) => o.header[k]);

/* ---------- one swatch: the shape plus its write-ins ---------- */

const FIELD_LABELS = { name: 'Name', number: 'No.' };
const fieldsOf = (o) => ['name', 'number'].filter((k) => o.info[k]);

/** How much room a swatch's write-ins need, for a chip of size s. */
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

/** The height of a stack of segments (block parts) for a chip size and column count. */
function stackHeight(o, segs, s, cols) {
  const c = cellSize(o, s);
  const head = headKeys(o).length ? BLOCK_HEAD : 0;
  const rows = segs.reduce((t, n) => t + Math.ceil(n / cols), 0);
  return rows * c.h + Math.max(0, rows - segs.length) * GAP + segs.length * head + (segs.length - 1) * BLOCK_GAP;
}

/** The biggest chip size that fits `segs` (counts per block part) in a box, and how many columns. */
function fit(o, segs, box) {
  let best = { s: 0, cols: 1 };
  const maxCols = Math.min(40, Math.max(...segs));
  for (let cols = 1; cols <= maxCols; cols++) {
    const colW = (box.w - (cols - 1) * GAP) / cols;
    let lo = 0, hi = MAX_CHIP;
    for (let k = 0; k < 30; k++) {
      const s = (lo + hi) / 2;
      if (cellSize(o, s).w <= colW && stackHeight(o, segs, s, cols) <= box.h) lo = s; else hi = s;
    }
    if (lo > best.s + 0.01) best = { s: lo, cols };
  }
  return best;
}

/** A write-in: a label and a line (or a box), with the value printed on it when one was filled in. */
function writeIn(o, label, value, x, y, w, h, size) {
  const items = [];
  const shown = o.mode === 'fill' ? value : '';
  if (o.style === 'boxes') {
    items.push(S.rect(x, y + 0.3, Math.max(2, w), h - 0.6, { r: 0.8, fill: '#FFFFFF', stroke: LINE, sw: 0.2 }));
    items.push(S.text(label, x + 0.8, y + 0.3 + size * 0.7, { size: size * 0.66, weight: 700, fill: SOFT }));
    if (shown) items.push(S.text(ellipsize(shown, size, w - 1.6, { weight: 700 }), x + 0.8, y + h - 1.1, { size, weight: 700, fill: WRITTEN }));
  } else {
    const lw = textWidth(label, size * 0.85, { weight: 700 }) + 0.8;
    items.push(S.text(label, x, y + h * 0.7, { size: size * 0.85, weight: 700, fill: SOFT }));
    items.push(S.line(x + lw, y + h * 0.8, x + w, y + h * 0.8, { stroke: LINE, sw: 0.25 }));
    if (shown) items.push(S.text(ellipsize(shown, size, w - lw - 0.6, { weight: 700 }), x + lw + 0.4, y + h * 0.7, { size, weight: 700, fill: WRITTEN }));
  }
  return items;
}

/** One swatch at (x, y): the chip and its write-ins. Returns items and its outline for cutting. */
function swatch(o, block, shape, index, inBlock, x, y, s, c) {
  const fields = fieldsOf(o);
  const num = o.numbered ? index + 1 : null;
  const size = clamp(c.row * 0.42, 2, 2.8);
  const given = block.colors[inBlock] ?? {};
  let chip = { x, y, w: s, h: s };
  let label;
  if (o.infoPos === 'top') { chip = { x, y: y + c.lh + 0.8, w: s, h: s }; label = { x, y, w: s }; }
  else if (o.infoPos === 'bottom') label = { x, y: y + s + 0.8, w: s };
  else if (o.infoPos === 'left') { chip = { x: x + c.lw + 1.2, y, w: s, h: s }; label = { x, y: y + (s - Math.max(1, fields.length) * c.row) / 2, w: c.lw }; }
  else label = { x: x + s + 1.2, y: y + (s - Math.max(1, fields.length) * c.row) / 2, w: c.lw };
  const items = [...chipItems(shape, index, chip, { stroke: LINE, sw: 0.3 })];
  const numW = num != null ? textWidth(String(num), size, { weight: 800 }) + 1 : 0;
  if (!fields.length && num != null) {
    items.push(S.text(String(num), label.x + label.w / 2, label.y + c.row * 0.62, { size, weight: 800, anchor: 'middle', fill: INK }));
  } else if (fields.length) {
    if (num != null) items.push(S.text(String(num), label.x, label.y + c.row * 0.7, { size, weight: 800, fill: INK }));
    fields.forEach((f, i) => items.push(...writeIn(o, FIELD_LABELS[f], given[f] ?? '', label.x + numW, label.y + i * c.row, label.w - numW, c.row, size)));
  }
  return { items, cut: rrectPath(x - 0.9, y - 0.9, c.w + 1.8, c.h + 1.8, 1.4) };
}

/* ---------- a block's header: medium, brand, count ---------- */

function blockHeader(o, block, x, y, w, continued) {
  const keys = headKeys(o);
  if (!keys.length) return [];
  const labels = { medium: 'Medium', brand: 'Brand', count: 'Count' };
  const values = { medium: block.medium, brand: block.brand, count: block.setCount };
  const share = { medium: 1.25, brand: 1.25, count: 0.55 };
  const total = keys.reduce((t, k) => t + share[k], 0);
  const gap = 4;
  const items = [];
  let cx = x;
  const tail = continued ? 22 : 0;
  keys.forEach((k) => {
    const fw = ((w - tail - gap * (keys.length - 1)) * share[k]) / total;
    items.push(...writeIn(o, labels[k], values[k], cx, y, fw, BLOCK_HEAD - 2, 3.2));
    cx += fw + gap;
  });
  if (continued) items.push(S.text('(continued)', x + w, y + (BLOCK_HEAD - 2) * 0.7, { size: 2.6, weight: 700, anchor: 'end', fill: SOFT }));
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
  const box = { x: MARGIN, y: MARGIN, w: W - MARGIN * 2, h: H - MARGIN * 2 - FOOTER_H };

  // every swatch in order: which block it is in, and where in that block
  const all = o.blocks.flatMap((b, bi) => Array.from({ length: b.count }, (_, i) => ({ block: bi, inBlock: i })));
  const total = all.length;
  const runs = (list) => list.reduce((acc, it) => {
    if (acc.length && acc[acc.length - 1].block === it.block) acc[acc.length - 1].n++;
    else acc.push({ block: it.block, n: 1, from: it.inBlock });
    return acc;
  }, []);
  const split = (P) => {
    const per = Math.ceil(total / P);
    return Array.from({ length: P }, (_, p) => all.slice(p * per, (p + 1) * per)).filter((pg) => pg.length);
  };

  // as few pages as fit (each side at most PER_PAGE_MAX, chips at least MIN_CHIP); double-sided uses both sides
  const step = o.sides === 'double' ? 2 : 1;
  let parts;
  for (let P = step; ; P += step) {
    parts = split(P);
    const ok = parts.every((pg) => pg.length <= PER_PAGE_MAX && fit(o, runs(pg).map((r) => r.n), box).s >= MIN_CHIP);
    if (ok || P >= 60) break;
  }

  const pages = [];
  let index = 0;
  let smallest = MAX_CHIP;
  const head = headKeys(o).length ? BLOCK_HEAD : 0;
  parts.forEach((pg, p) => {
    const segs = runs(pg);
    const { s, cols } = fit(o, segs.map((r) => r.n), box);
    smallest = Math.min(smallest, s);
    const c = cellSize(o, s);
    const usedW = cols * c.w + (cols - 1) * GAP;
    const x0 = box.x + (box.w - usedW) / 2;
    const items = [];
    const cuts = [];
    let y = box.y;
    segs.forEach((seg, si) => {
      if (si) y += BLOCK_GAP;
      const block = o.blocks[seg.block];
      // the header spans the page (a narrow block still gets room to write its medium and brand)
      items.push(...blockHeader(o, block, box.x, y, box.w, seg.from > 0));
      y += head;
      for (let i = 0; i < seg.n; i++) {
        const col = i % cols;
        if (i && col === 0) y += c.h + GAP;
        const sw = swatch(o, block, shapeOf(o, block), index++, seg.from + i, x0 + col * (c.w + GAP), y, s, c);
        items.push(...sw.items);
        cuts.push(sw.cut);
      }
      y += c.h;
    });
    const side = o.sides === 'double' ? (p % 2 ? 'back' : 'front') : null;
    const sheetNo = Math.floor(p / 2) + 1;
    const label = o.sides === 'double'
      ? `Sheet ${sheetNo} ${side} of ${Math.ceil(parts.length / 2)}`
      : `Page ${p + 1} of ${parts.length}`;
    items.push(S.text(label, MARGIN, H - MARGIN + 0.5, { size: 2.3, weight: 700, fill: SOFT }));
    items.push(S.text(APP_NAME, W - MARGIN, H - MARGIN + 0.5, { size: 2.3, weight: 700, anchor: 'end', fill: SOFT }));
    pages.push(page(r2(W), r2(H), items, { bg: '#FFFFFF', meta: { label, cuts, side, kind: 'blank-page' } }));
  });

  const sheets = o.sides === 'double' ? Math.ceil(pages.length / 2) : pages.length;
  const notes = ['Print at 100% (actual size), not "fit to page".'];
  if (o.sides === 'double') notes.push(`Print double-sided, flipping on the ${landscape ? 'short' : 'long'} edge.`);
  if (pages.length > 1 && o.sides === 'single') notes.push(`${total} swatches need ${pages.length} pages at a size worth painting on.`);
  if (o.format === 'cut') notes.push('The cut file outlines every swatch with its write-ins, for a cutting machine.');
  return { pages, notes, total, perPage: Math.ceil(total / pages.length), sheets, chip: r2(smallest) };
}

/**
 * Read pasted color names and numbers, one color per line: "Name, Number", "Number Name",
 * "Name<tab>Number" or just a name. Returns [{ name, number }].
 */
export function parseColorList(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|\s*[,;|]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [a, b] = parts;
      const looksLikeNumber = (v) => /\d/.test(v) && v.length <= 10;
      return looksLikeNumber(a) && !looksLikeNumber(b) ? { name: txt(b), number: txt(a) } : { name: txt(a), number: txt(b) };
    }
    const m = line.match(/^([A-Za-z]{0,4}[-\s]?\d[\w.-]*)\s+(.+)$/); // "PC924 Crimson Red"
    return m ? { name: txt(m[2]), number: txt(m[1]) } : { name: txt(line), number: '' };
  });
}

export function studioFileName(o) {
  return `${APP_NAME} – Blank swatch pages (${totalOf(normalizeBlank(o))})`;
}
