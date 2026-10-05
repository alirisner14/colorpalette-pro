// Layout engine for swatch cards: palette "blocks" (chips with names and codes),
// deck blades, and book pages. Everything is built as scene items (scene.js) in
// millimetres, so the same layout drives the on-screen book, the live preview
// in the print dialog, and the PDF / SVG / PNG / JPG files.
import { S } from './scene.js';
import { SHAPES } from './shapes.js';
import { textWidth, fitSize, ellipsize } from './textmetrics.js';
import { rgbString } from './color.js';

const INK = '#1F2937';
const SOFT = '#4B5563';
const LINE = '#9AA3B8';
const GUIDE = '#B9BFCC';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;

/* ---------- shapes ---------- */

export const PRINT_SHAPES = [
  { id: 'rect', label: 'Squares & rectangles' },
  ...SHAPES.filter((s) => s.path).map(({ id, label, path }) => ({ id, label, path })),
];
export const getPrintShape = (id) => PRINT_SHAPES.find((s) => s.id === id) ?? PRINT_SHAPES[0];

/** Path data for a rounded rectangle (absolute coordinates, curves only). */
export function rrectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const k = 0.5523 * r;
  return `M${r2(x + r)} ${r2(y)} L${r2(x + w - r)} ${r2(y)} C${r2(x + w - r + k)} ${r2(y)} ${r2(x + w)} ${r2(y + r - k)} ${r2(x + w)} ${r2(y + r)} `
    + `L${r2(x + w)} ${r2(y + h - r)} C${r2(x + w)} ${r2(y + h - r + k)} ${r2(x + w - r + k)} ${r2(y + h)} ${r2(x + w - r)} ${r2(y + h)} `
    + `L${r2(x + r)} ${r2(y + h)} C${r2(x + r - k)} ${r2(y + h)} ${r2(x)} ${r2(y + h - r + k)} ${r2(x)} ${r2(y + h - r)} `
    + `L${r2(x)} ${r2(y + r)} C${r2(x)} ${r2(y + r - k)} ${r2(x + r - k)} ${r2(y)} ${r2(x + r)} ${r2(y)} Z`;
}

export function circlePath(cx, cy, r) {
  const k = 0.5523 * r;
  return `M${r2(cx + r)} ${r2(cy)} C${r2(cx + r)} ${r2(cy + k)} ${r2(cx + k)} ${r2(cy + r)} ${r2(cx)} ${r2(cy + r)} `
    + `C${r2(cx - k)} ${r2(cy + r)} ${r2(cx - r)} ${r2(cy + k)} ${r2(cx - r)} ${r2(cy)} `
    + `C${r2(cx - r)} ${r2(cy - k)} ${r2(cx - k)} ${r2(cy - r)} ${r2(cx)} ${r2(cy - r)} `
    + `C${r2(cx + k)} ${r2(cy - r)} ${r2(cx + r)} ${r2(cy - k)} ${r2(cx + r)} ${r2(cy)} Z`;
}

/** One chip: a color swatch, or a blank white one to swatch your own supplies on. */
export function chipItems(shapeId, index, { x, y, w, h }, { fill = null, stroke = null, sw = 0.25, dash = undefined } = {}) {
  const shape = getPrintShape(shapeId);
  const style = { fill: fill ?? '#FFFFFF', stroke: stroke ?? undefined, sw, dash };
  if (shape.id === 'rect') return [S.rect(x, y, w, h, { r: Math.min(2.2, Math.min(w, h) * 0.1), ...style })];
  const s = Math.min(w, h);
  return [S.path(shape.path(index), { tx: x + (w - s) / 2, ty: y + (h - s) / 2, s: s / 100, ...style })];
}

/* ---------- cells: what goes in a block ---------- */

/** Cells for a palette's colors. `pair` adds a blank chip beside each color; `blankOnly` draws only blanks. */
export function paletteCells(palette, { pair = false, blankOnly = false } = {}) {
  return palette.colors.map((c) => ({
    fill: blankOnly ? null : c.hex, blank: blankOnly, pair, name: c.name, hex: c.hex, rgb: rgbString(c.hex),
  }));
}

/** Numbered blank chips for swatching your own pens, paints or pencils. */
export function swatchCells(start, count) {
  return Array.from({ length: count }, (_, i) => ({ fill: null, blank: true, pair: false, num: start + i, name: '', hex: '', rgb: '' }));
}

/* ---------- one block ---------- */

function captionLines(cell, cap) {
  const out = [];
  if (cap.name && cell.name) out.push([cell.name, 700, INK]);
  if (cap.hex && cell.hex) out.push([cell.hex, 600, SOFT]);
  if (cap.rgb && cell.rgb) out.push([`RGB ${cell.rgb}`, 600, SOFT]);
  return out;
}

/** The size (in mm) a chip would have, given the room it has. */
function chipSizeOf(isRect, w, h) {
  if (isRect) return Math.sqrt(Math.min(w, h * 2.3) * Math.min(h, w * 2.3));
  return Math.min(w, h);
}

function evalCandidate(cw, ch, place, ctx) {
  const { anyPair, isRect, maxLines, maxEm, writeLine } = ctx;
  const g2 = Math.max(0.8, cw * 0.025);
  const lines = Math.max(maxLines, writeLine ? 1 : 0);
  if (!lines) {
    const chipW = anyPair ? (cw - g2) / 2 : cw;
    return { place: 'none', chipW, chipH: ch, fs: 0, g2, size: chipSizeOf(isRect, chipW, ch), tight: false };
  }
  if (place === 'below') {
    const fs = clamp(Math.min(cw * 0.11, (cw * 0.96) / Math.max(maxEm, 0.01)), 1.1, 3.4);
    const capH = lines * fs * 1.32 + fs * 0.6;
    const chipH = ch - capH;
    const chipW = anyPair ? (cw - g2) / 2 : cw;
    if (chipH < 3 || chipW < 3) return null;
    return { place, chipW, chipH, fs, capH, g2, size: chipSizeOf(isRect, chipW, chipH), tight: fs < 1.6 };
  }
  let best = null;
  for (const fr of [0.5, 0.42]) {
    const chipsW = cw * fr;
    const textW = cw - chipsW - g2 * 1.4;
    let fs = clamp(Math.min(ch * 0.26, textW / Math.max(maxEm, 0.01)), 1.1, 3.4);
    if (lines * fs * 1.32 > ch) fs = ch / (lines * 1.32);
    const chipW = anyPair ? (chipsW - g2) / 2 : chipsW;
    if (chipW < 3 || ch < 3 || textW < 4) continue;
    const c = { place, chipW, chipH: ch, fs, g2, chipsW, textW, size: chipSizeOf(isRect, chipW, ch), tight: fs < 1.6 };
    if (!best || c.size > best.size) best = c;
  }
  return best;
}

/**
 * Lay a block of chips out in a box and fill it as well as it can: it tries
 * every number of columns, and puts captions below or beside the chips,
 * keeping the chips as big as possible while the text stays readable.
 *
 * @param {{x,y,w,h}} box
 * @param {{ title?: string, cells: object[], writeLine?: boolean }} spec
 * @param {object} o shapes[], showColorNames, showHex, showRgb, mirror, titleIndentLeft/Right, minTop
 * @returns {{ items: object[], info: { cols, rows, place, size, tight, minFont, empty } }}
 */
export function layoutBlock(box, spec, o = {}) {
  const { cells, title = '', writeLine = false } = spec;
  const shapes = o.shapes?.length ? o.shapes : ['rect'];
  const cap = { name: !!o.showColorNames, hex: !!o.showHex, rgb: !!o.showRgb };
  const items = [];
  const pad = clamp(Math.min(box.w, box.h) * 0.025, 1, 3.5);

  // title
  let titleH = 0;
  if (title || o.reserveTitle) {
    const ts = clamp(Math.min(box.w * 0.075, 6.5), 2.8, 6.5);
    const maxW = box.w - pad * 2 - (o.titleIndentLeft ?? 0) - (o.titleIndentRight ?? 0);
    const size = title ? fitSize(title, ts, maxW, { min: 2, font: 'display', weight: 800 }) : ts;
    if (title) {
      const text = ellipsize(title, size, maxW, { font: 'display', weight: 800 });
      const indent = o.titleIndentLeft ?? 0;
      // The title row is as tall as the biggest title would be and the text sits in its middle,
      // so neighbors with longer (smaller) titles still line up with each other.
      items.push(S.text(text, box.x + pad + indent, box.y + pad + ts * 0.62 + size * 0.34, { size, weight: 800, font: 'display', fill: INK }));
    }
    titleH = ts * 1.7 + pad * 0.4;
  }

  const top = Math.max(box.y + pad + titleH, o.minTop ?? 0);
  const area = { x: box.x + pad, y: top, w: box.w - pad * 2, h: box.y + box.h - pad - top };
  const n = cells.length;
  if (!n || area.w < 4 || area.h < 4) return { items, info: { cols: 0, rows: 0, place: 'none', size: 0, tight: false, minFont: 0, empty: true } };

  const isRect = shapes.length === 1 && shapes[0] === 'rect';
  const anyPair = cells.some((c) => c.pair);
  const lineSets = cells.map((c) => captionLines(c, cap));
  const maxLines = Math.max(0, ...lineSets.map((l) => l.length));
  const maxEm = Math.max(0.01, ...lineSets.flatMap((l) => l.map(([s, wt]) => textWidth(s, 1, { weight: wt }))));
  const ctx = { anyPair, isRect, maxLines, maxEm, writeLine };
  const bars = isRect && !maxLines && !anyPair && !writeLine; // plain color bars touch each other
  const strip = bars && !o.cols; // ...and with no say in the matter they run in one row

  let best = null;
  for (let cols = 1; cols <= Math.min(n, 12); cols++) {
    if (o.cols && cols !== o.cols) continue;
    if (strip && cols !== n) continue;
    const rows = Math.ceil(n / cols);
    const gap = bars ? 0 : clamp(area.w * 0.018, 1.1, 3);
    const cw = (area.w - gap * (cols - 1)) / cols;
    const ch = (area.h - gap * (rows - 1)) / rows;
    if (cw < 2 || ch < 2) continue;
    for (const place of (maxLines || writeLine) ? (o.place ? [o.place] : ['below', 'right']) : ['none']) {
      const c = evalCandidate(cw, ch, place, ctx);
      if (!c) continue;
      const cand = { ...c, cols, rows, gap, cw, ch };
      const better = !best
        || (best.tight && !cand.tight)
        || (best.tight === cand.tight && cand.size > best.size * (cand.place === 'below' ? 1.0 : 1.03));
      if (better) best = cand;
    }
  }
  if (!best) return { items, info: { cols: 0, rows: 0, place: 'none', size: 0, tight: true, minFont: 0, empty: true } };

  const { cols, gap, cw, ch, place, chipW, chipH, fs, g2 } = best;
  const lh = fs * 1.32;
  cells.forEach((cell, i) => {
    const row = Math.floor(i / cols);
    const col = o.mirror ? cols - 1 - (i % cols) : i % cols;
    const cx0 = area.x + col * (cw + gap);
    const cy0 = area.y + row * (ch + gap);
    const shapeId = shapes[i % shapes.length];
    const lines = lineSets[i];
    const hasText = lines.length || writeLine;

    // chip box(es): rect chips fill their space (within sensible proportions), others are square
    const effW = isRect ? Math.min(chipW, chipH * 2.6) : Math.min(chipW, chipH);
    const effH = isRect ? (bars && o.fillBars ? chipH : Math.min(chipH, chipW * 2.3)) : Math.min(chipW, chipH);
    const groupW = cell.pair ? effW * 2 + g2 : effW;
    const strokeColor = cell.blank ? LINE : '#00000026';
    let gx;
    let gy;
    if (place === 'right') { gx = cx0; gy = cy0 + (ch - effH) / 2; }
    else {
      const groupH = effH + (hasText ? best.capH ?? 0 : 0);
      gx = cx0 + (cw - groupW) / 2;
      gy = cy0 + Math.max(0, (ch - groupH) / 2);
      if (bars) { gx = cx0; gy = cy0; }
    }
    const chips = [];
    if (cell.pair) {
      chips.push(...chipItems(shapeId, i, { x: gx, y: gy, w: effW, h: effH }, { fill: cell.fill, stroke: '#00000026', sw: 0.2 }));
      chips.push(...chipItems(shapeId, i, { x: gx + effW + g2, y: gy, w: effW, h: effH }, { fill: null, stroke: LINE, sw: 0.3 }));
    } else {
      chips.push(...chipItems(shapeId, i, { x: gx, y: gy, w: effW, h: effH }, { fill: cell.fill, stroke: strokeColor, sw: cell.blank ? 0.3 : 0.2 }));
    }
    items.push(...chips);
    if (cell.num != null) {
      const ns = clamp(Math.min(effW, effH) * 0.2, 1.6, 3.6);
      items.push(S.text(String(cell.num), gx + effW * 0.12 + 0.4, gy + ns + effH * 0.08, { size: ns, weight: 700, fill: LINE }));
    }

    if (!hasText) return;
    if (place === 'right') {
      const tx = cx0 + best.chipsW + g2 * 1.4;
      const count = Math.max(lines.length, writeLine ? 1 : 0);
      let y0 = cy0 + ch / 2 - (count * lh) / 2 + fs * 0.95;
      for (const [text, weight, fill] of lines) {
        const size = fitSize(text, fs, best.textW, { min: 1, weight });
        items.push(S.text(text, tx, y0, { size, weight, fill }));
        y0 += lh;
      }
      if (writeLine) items.push(S.line(tx, y0 - lh * 0.2, tx + best.textW, y0 - lh * 0.2, { stroke: LINE, sw: 0.25 }));
    } else {
      const midX = cx0 + cw / 2;
      let y0 = gy + effH + fs * 1.15;
      for (const [text, weight, fill] of lines) {
        const size = fitSize(text, fs, cw * 0.96, { min: 1, weight });
        items.push(S.text(text, midX, y0, { size, weight, fill, anchor: 'middle' }));
        y0 += lh;
      }
      if (writeLine) items.push(S.line(cx0 + cw * 0.04, y0 - lh * 0.45, cx0 + cw * 0.96, y0 - lh * 0.45, { stroke: LINE, sw: 0.25 }));
    }
  });

  return { items, info: { cols, rows: best.rows, place, size: best.size, tight: best.tight, minFont: fs, empty: false } };
}

/** The round "..." button on a card of the on-screen book or deck (opens the card's menu). */
export function moreButton(cx, cy, r, pid, label = 'Options') {
  const dot = r * 0.19;
  const gap = r * 0.52;
  return S.group([
    S.circle(cx, cy, r, { fill: '#FFFFFF', stroke: '#0000002E', sw: 0.25 }),
    S.circle(cx - gap, cy, dot, { fill: INK }),
    S.circle(cx, cy, dot, { fill: INK }),
    S.circle(cx + gap, cy, dot, { fill: INK }),
  ], { 'data-action': 'card-menu', 'data-pid': pid, class: 'pb-more', role: 'button', tabindex: 0, 'aria-label': label });
}

/**
 * When several blocks share a blade or page they should look alike: use the caption
 * style (below or beside) that suits the fullest one, so neighbors match.
 */
function sharedPlace(units, box, o) {
  const fullest = units.reduce((a, u) => (u.spec.cells.length > a.spec.cells.length ? u : a), units[0]);
  const p = layoutBlock(box, fullest.spec, o).info.place;
  return p === 'below' || p === 'right' ? p : undefined;
}

/* ---------- a deck blade ---------- */

export const HOLE_DIAMETER = { s: 3.2, m: 6.35, l: 9.5 };

/**
 * A blade (one card of a fan deck): a rounded strip with a punch hole, holding
 * one or more blocks side by side. `units` are { spec, pid? } for layoutBlock.
 * Returns the items plus `cuts`, the outline (with the hole) for cutting machines.
 */
export function bladeItems(box, units, o = {}) {
  const { x, y, w, h } = box;
  const holeD = o.hole === 'none' ? 0 : (o.holeD ?? HOLE_DIAMETER.m);
  const R = holeD / 2;
  const inset = holeD ? Math.max(5.5, R + 3.2) : 0;
  const swap = { tl: 'tr', tr: 'tl' };
  const pos = o.mirror ? (swap[o.hole] ?? o.hole) : (o.hole ?? 'tm');
  const hx = pos === 'tl' ? x + inset : pos === 'tr' ? x + w - inset : x + w / 2;
  const hy = y + inset;
  const radius = o.radius ?? Math.min(4, w * 0.08);
  const outline = rrectPath(x, y, w, h, radius);
  const body = holeD ? `${outline} ${circlePath(hx, hy, R)}` : outline;
  const guide = o.guides === false ? undefined : GUIDE;
  const items = [S.path(body, { fill: '#FFFFFF', rule: 'evenodd', stroke: guide, sw: 0.25 })];
  if (holeD && guide) items.push(S.circle(hx, hy, R + 1.1, { fill: 'none', stroke: guide, sw: 0.2, dash: [0.8, 0.8] }));

  const corner = pos === 'tl' || pos === 'tr';
  const contentTop = holeD ? y + inset * 2 : y + 2.5;
  const padX = 2;
  const gap = 1.4;
  const n = Math.max(1, units.length, o.slots ?? 0);
  const unitW = (w - padX * 2 - gap * (n - 1)) / n;
  const info = [];
  const ui = !!o.ui;
  const oUi = ui ? { ...o, reserveTitle: true, titleIndentRight: 8.4, fillBars: true } : o;
  const boxOf = (i) => {
    const by = corner ? y + 1.2 : contentTop - 1.5;
    return { x: x + padX + i * (unitW + gap), y: by, w: unitW, h: y + h - by - 1.6 };
  };
  const sizing = o.gridSpec ? [...units, { spec: o.gridSpec }] : units;
  const place = n > 1 && sizing.length ? sharedPlace(sizing, boxOf(0), { ...oUi, cols: 1, minTop: contentTop }) : undefined;
  units.forEach((u, i) => {
    const ux = x + padX + i * (unitW + gap);
    const by = corner ? y + 1.2 : contentTop - 1.5;
    const blockBox = { x: ux, y: by, w: unitW, h: y + h - by - 1.6 };
    const indentL = pos === 'tl' && i === 0 ? holeD + inset * 0.9 : 0;
    const indentR = pos === 'tr' && i === n - 1 ? holeD + inset * 0.9 : 0;
    const res = layoutBlock(blockBox, u.spec, { ...oUi, cols: 1, place, titleIndentLeft: indentL, titleIndentRight: Math.max(indentR, oUi.titleIndentRight ?? 0), minTop: contentTop });
    info.push(res.info);
    if (u.pid) {
      // on screen, the whole block is a tap target (a white patch, invisible on the white blade, fills the gaps)
      const hit = ui ? [S.rect(blockBox.x, blockBox.y, blockBox.w, blockBox.h, { fill: '#FFFFFF' })] : [];
      const more = ui && o.more !== false ? [moreButton(blockBox.x + blockBox.w - 4.6, blockBox.y + 4.8, 3.4, u.pid, 'Options for ' + (u.label ?? 'palette'))] : [];
      items.push(S.group([...hit, ...res.items, ...more], { 'data-pid': u.pid, class: 'pb', role: 'button', tabindex: 0, 'aria-label': u.label ?? 'Open palette' }));
    } else items.push(S.group(res.items));
  });
  return { items, cuts: [body], info };
}

/* ---------- a book page ---------- */

/** The (columns, rows) that give the biggest chips for `count` blocks in an area. */
export function bestGrid(count, area, gap, sampleSpec, o) {
  let best = { cols: 1, rows: count, size: -1 };
  for (let cols = 1; cols <= Math.min(count, 6); cols++) {
    const rows = Math.ceil(count / cols);
    const bw = (area.w - gap * (cols - 1)) / cols;
    const bh = (area.h - gap * (rows - 1)) / rows;
    const res = layoutBlock({ x: 0, y: 0, w: bw, h: bh }, sampleSpec, o);
    const size = res.info.empty ? 0 : (res.info.tight ? res.info.size * 0.5 : res.info.size);
    if (size > best.size * 1.02) best = { cols, rows, size };
  }
  return best;
}

/**
 * Place blocks on a page. `units` are { spec, pid?, label? }.
 * o: margin, top (content may not start above this), hole ('tl'|'tm'|'tr'|'none'), holeD,
 *    mirror, ui (wrap each block in a card with a hit group), guides
 */
export function bookPageItems(pageW, pageH, units, o = {}) {
  const margin = o.margin ?? 10;
  const holeD = o.hole && o.hole !== 'none' ? (o.holeD ?? HOLE_DIAMETER.m) : 0;
  const inset = holeD ? Math.max(6, holeD / 2 + 3.5) : 0;
  const swap = { tl: 'tr', tr: 'tl' };
  const pos = o.mirror ? (swap[o.hole] ?? o.hole) : o.hole;
  const items = [];
  const cuts = [];
  if (holeD) {
    const hx = pos === 'tl' ? inset + 4 : pos === 'tr' ? pageW - inset - 4 : pageW / 2;
    const hy = inset;
    items.push(S.circle(hx, hy, holeD / 2, { fill: '#FFFFFF', stroke: o.guides === false ? undefined : GUIDE, sw: 0.25, dash: [0.8, 0.8] }));
    cuts.push(circlePath(hx, hy, holeD / 2));
  }
  const top = Math.max(o.top ?? margin, holeD ? inset * 2 + 2 : 0);
  const area = { x: margin, y: top, w: pageW - margin * 2, h: pageH - top - margin - (o.footer ? 4 : 0) };
  const gap = o.gap ?? 4;
  const n = units.length;
  const boxes = [];
  let info = [];
  // on screen every card keeps a title row free, for its "..." button
  const lo = o.ui ? { ...o, reserveTitle: true, titleIndentRight: 8.4, fillBars: true } : o;
  if (n) {
    const slots = Math.max(n, o.slots ?? 0);
    const grid = bestGrid(slots, area, gap, o.gridSpec ?? units[0].spec, lo);
    const bw = (area.w - gap * (grid.cols - 1)) / grid.cols;
    const bh = (area.h - gap * (grid.rows - 1)) / grid.rows;
    const place = slots > 1 ? sharedPlace(o.gridSpec ? [...units, { spec: o.gridSpec }] : units, { x: 0, y: 0, w: bw, h: bh }, lo) : undefined;
    units.forEach((u, i) => {
      const row = Math.floor(i / grid.cols);
      const col = o.mirror ? grid.cols - 1 - (i % grid.cols) : i % grid.cols;
      const box = { x: area.x + col * (bw + gap), y: area.y + row * (bh + gap), w: bw, h: bh };
      const res = layoutBlock(box, u.spec, { ...lo, place });
      info.push(res.info);
      boxes.push({ pid: u.pid, ...box });
      if (o.ui) {
        const card = S.rect(box.x, box.y, box.w, box.h, { r: 3, fill: '#FFFFFF', stroke: '#0000001F', sw: 0.3 });
        const more = o.more !== false ? [moreButton(box.x + box.w - 4.8, box.y + 4.8, 3.4, u.pid, 'Options for ' + (u.label ?? 'palette'))] : [];
        items.push(S.group([card, ...res.items, ...more], { 'data-pid': u.pid, class: 'pb', role: 'button', tabindex: 0, 'aria-label': u.label ?? 'Open palette' }));
      } else {
        items.push(...res.items);
      }
    });
  }
  return { items, cuts, info, area, boxes };
}
