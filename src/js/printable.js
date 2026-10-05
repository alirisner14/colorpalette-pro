// Printable swatch decks and books. Turns print options + palettes into pages of
// scene items (millimetres) that the print dialog previews live and exports as
// PDF, SVG, PNG or JPG.
import { S, page, fitInto } from './scene.js';
import {
  paletteCells, swatchCells, bladeItems, bookPageItems, HOLE_DIAMETER, PRINT_SHAPES,
} from './sheet.js';
import { buildArtwork, getTemplate, autoTemplate } from './artwork.js';
import { textWidth, fitSize, ellipsize } from './textmetrics.js';
import { APP_NAME } from './meta.js';

export const PAPERS = {
  letter: { w: 215.9, h: 279.4, label: 'US Letter (8.5 × 11 in)' },
  a4: { w: 210, h: 297, label: 'A4 (210 × 297 mm)' },
};
export const MARGIN = 10;

export const KINDS = [
  { id: 'match', label: 'Match my supplies', blurb: 'Your palette colors, each with a blank spot beside it, so you can swatch your own paint, pencils or markers next to the printed color and match them.' },
  { id: 'swatch', label: 'Swatch my supplies', blurb: 'Blank numbered chips to swatch and label what you own. No palettes needed.' },
  { id: 'palettes', label: 'Palette cards', blurb: 'Just your palettes: the colors with their names.' },
];

const KIND_DEFAULTS = {
  match: { showName: true, showColorNames: true, showHex: true, showRgb: true },
  palettes: { showName: true, showColorNames: true, showHex: false, showRgb: false },
  swatch: { showName: true, showColorNames: false, showHex: false, showRgb: false },
};

const BLADE_W = { match: 62, palettes: 46, swatch: 46 };
const ROW_H = { match: 24, palettes: 19, swatch: 21 };

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Fill in missing options and keep every value in range. */
export function normalizePrintOptions(raw = {}) {
  const kind = pick(raw.kind, ['match', 'swatch', 'palettes'], 'match');
  const shapeIds = PRINT_SHAPES.map((s) => s.id);
  const shapes = (Array.isArray(raw.shapes) ? raw.shapes : ['rect']).filter((s) => shapeIds.includes(s));
  const med = raw.medium ?? {};
  return {
    format: pick(raw.format, ['deck', 'book'], 'deck'),
    kind,
    style: pick(raw.style, ['simple', 'custom'], 'simple'),
    paper: pick(raw.paper, Object.keys(PAPERS), 'letter'),
    orient: pick(raw.orient, ['portrait', 'landscape'], 'portrait'),
    shapes: shapes.length ? shapes : ['rect'],
    showName: raw.showName ?? KIND_DEFAULTS[kind].showName,
    showColorNames: raw.showColorNames ?? KIND_DEFAULTS[kind].showColorNames,
    showHex: raw.showHex ?? KIND_DEFAULTS[kind].showHex,
    showRgb: raw.showRgb ?? KIND_DEFAULTS[kind].showRgb,
    perUnit: clampInt(raw.perUnit, 1, 6, 1),
    blank: pick(raw.blank, ['beside', 'back'], 'beside'),
    hole: pick(raw.hole, ['tl', 'tm', 'tr', 'none'], 'tm'),
    holeSize: pick(raw.holeSize, ['s', 'm', 'l'], 'm'),
    guides: raw.guides !== false,
    medium: { medium: String(med.medium ?? '').slice(0, 40), brand: String(med.brand ?? '').slice(0, 40), count: String(med.count ?? '').slice(0, 30), notes: String(med.notes ?? '').slice(0, 60) },
    total: clampInt(raw.total, 1, 400, 24),
    perPage: raw.perPage == null ? null : clampInt(raw.perPage, 1, 60, null),
    artwork: !!raw.artwork,
    artTemplate: raw.artTemplate === 'auto' || !raw.artTemplate ? 'auto' : getTemplate(raw.artTemplate).id,
  };
}

export const defaultPrintOptions = (overrides = {}) => normalizePrintOptions(overrides);

/** The options actually used: "simple" ignores the customizing fields. */
export function effectiveOptions(raw) {
  const o = normalizePrintOptions(raw);
  if (o.style === 'custom') return o;
  return {
    ...o, ...KIND_DEFAULTS[o.kind], shapes: ['rect'], perUnit: 1, blank: 'beside', holeSize: 'm', perPage: null, artwork: false,
  };
}

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const mediumTitle = (m) => [m.medium, m.brand].filter(Boolean).join(' · ') || 'My swatches';
const mediumSub = (m) => [m.count, m.notes].filter(Boolean).join(' · ');

function layoutOptions(o, extra = {}) {
  return {
    shapes: o.shapes, showColorNames: o.showColorNames, showHex: o.showHex, showRgb: o.showRgb,
    hole: o.hole, holeD: HOLE_DIAMETER[o.holeSize], guides: o.guides, ...extra,
  };
}

/* ---------- deck ---------- */

function buildDeck(o, palettes, notes) {
  const paper = PAPERS[o.paper];
  const usableW = paper.w - MARGIN * 2;
  const usableH = paper.h - MARGIN * 2;
  const pairs = o.kind === 'match' && o.blank === 'beside';
  const twoSided = o.kind === 'match' && o.blank === 'back';
  const perUnit = o.kind === 'swatch' ? 1 : o.perUnit;
  const holeD = o.hole === 'none' ? 0 : HOLE_DIAMETER[o.holeSize];
  const inset = holeD ? Math.max(5.5, holeD / 2 + 3.2) : 0;

  // what goes on each blade: a list of units
  let bladeUnits;
  if (o.kind === 'swatch') {
    const per = o.perPage ?? 8;
    const blades = Math.ceil(o.total / per);
    bladeUnits = Array.from({ length: blades }, (_, b) => {
      const start = b * per + 1;
      const count = Math.min(per, o.total - b * per);
      return [{ kind: 'swatch', start, count }];
    });
  } else {
    bladeUnits = chunk(palettes, perUnit).map((group) => group.map((p) => ({ kind: 'palette', p })));
  }
  if (!bladeUnits.length) return [];

  const rowsNeeded = Math.max(...bladeUnits.map((b) => Math.max(...b.map((u) => (u.kind === 'swatch' ? u.count : u.p.colors.length)))));
  const bladeW = Math.min(usableW, BLADE_W[o.kind] * perUnit);
  const bladeH = Math.min(usableH, Math.max(110, (holeD ? inset * 2 : 3) + 8 + rowsNeeded * ROW_H[o.kind] + 4));
  const gap = 4;
  const across = Math.max(1, Math.floor((usableW + gap) / (bladeW + gap)));
  const down = Math.max(1, Math.floor((usableH + gap) / (bladeH + gap)));
  const perSheet = across * down;
  const x0 = (paper.w - (across * bladeW + (across - 1) * gap)) / 2;

  const sheets = chunk(bladeUnits, perSheet);
  const pages = [];
  sheets.forEach((sheet, si) => {
    const sides = twoSided ? ['front', 'back'] : ['front'];
    sides.forEach((side) => {
      const back = side === 'back';
      const items = [];
      const cuts = [];
      sheet.forEach((blade, j) => {
        const row = Math.floor(j / across);
        const col = back ? across - 1 - (j % across) : j % across;
        const box = { x: x0 + col * (bladeW + gap), y: MARGIN + row * (bladeH + gap), w: bladeW, h: bladeH };
        const units = blade.map((u) => {
          if (u.kind === 'swatch') {
            return { spec: { title: o.showName ? mediumTitle(o.medium) : '', cells: swatchCells(u.start, u.count), writeLine: true } };
          }
          return { spec: { title: o.showName ? u.p.name : '', cells: paletteCells(u.p, { pair: pairs, blankOnly: back }) } };
        });
        const res = bladeItems(box, units, layoutOptions(o, { mirror: back }));
        items.push(...res.items);
        cuts.push(...res.cuts);
        res.info.forEach((i) => { if (i.size && i.size < 6) notes.tooSmall = Math.min(notes.tooSmall ?? Infinity, i.size); });
      });
      const label = `Sheet ${si + 1} of ${sheets.length}${twoSided ? ` · ${back ? 'back' : 'front'}` : ''}`;
      pages.push(page(paper.w, paper.h, items, { bg: '#FFFFFF', meta: { label, cuts, kind: 'blade-sheet', side } }));
    });
  });
  return pages;
}

/* ---------- book ---------- */

function pageFooter(w, h, text) {
  return S.text(text, w / 2, h - 5, { size: 2.6, weight: 600, anchor: 'middle', fill: '#9AA3B8' });
}

function artGrid(count, w, h) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return w >= h ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
  const cols = Math.min(count, Math.ceil(Math.sqrt(count * (w / h))));
  return { cols, rows: Math.ceil(count / cols) };
}

/** A page of example artwork, one picture per palette, painted with that palette. */
export function artPageItems(pw, ph, palettes, templateChoice, startIndex = 0, o = {}) {
  const margin = o.margin ?? MARGIN;
  const top = o.top ?? margin;
  const area = { x: margin, y: top, w: pw - margin * 2, h: ph - top - margin - 4 };
  const { cols, rows } = artGrid(palettes.length, area.w, area.h);
  const gap = 5;
  const cw = (area.w - gap * (cols - 1)) / cols;
  const chh = (area.h - gap * (rows - 1)) / rows;
  const items = [];
  palettes.forEach((p, i) => {
    const tpl = templateChoice === 'auto' ? autoTemplate(startIndex + i) : getTemplate(templateChoice);
    const { page: art } = buildArtwork(tpl, { colors: p.colors.map((c) => c.hex) });
    const bx = area.x + (i % cols) * (cw + gap);
    const by = area.y + Math.floor(i / cols) * (chh + gap);
    const label = ellipsize(`${p.name} · ${tpl.name}`, 3.2, cw, { weight: 700 });
    const picture = [
      ...fitInto(art.items, tpl.w, tpl.h, { x: bx, y: by, w: cw, h: chh - 6 }),
      S.text(label, bx + cw / 2, by + chh - 1.5, { size: 3.2, weight: 700, anchor: 'middle', fill: '#4B5563' }),
    ];
    if (o.ui) {
      // on screen a picture is a button that opens the palette in the context studio
      items.push(S.group([S.rect(bx, by, cw, chh, { fill: '#FFFFFF', op: 0.001 }), ...picture], {
        'data-pid': p.id, 'data-action': 'art', class: 'pb art', role: 'button', tabindex: 0, 'aria-label': 'Preview ' + p.name + ' on artwork',
      }));
    } else items.push(...picture);
  });
  return items;
}

function buildBook(o, palettes, notes) {
  const paper = PAPERS[o.paper];
  const landscape = o.orient === 'landscape';
  const PW = landscape ? paper.h : paper.w;
  const PH = landscape ? paper.w : paper.h;
  const pairs = o.kind === 'match' && o.blank === 'beside';
  const twoSided = o.kind === 'match' && o.blank === 'back';
  const pages = [];
  let no = 0;

  const addPage = (items, meta) => {
    no += 1;
    pages.push(page(PW, PH, [...items, pageFooter(PW, PH, `${APP_NAME} · ${no}`)], { bg: '#FFFFFF', meta }));
  };
  const report = (infos) => infos.forEach((i) => { if (i.size && i.size < 6) notes.tooSmall = Math.min(notes.tooSmall ?? Infinity, i.size); });

  if (o.kind === 'swatch') {
    const per = o.perPage ?? 12;
    const sheets = Math.ceil(o.total / per);
    for (let s = 0; s < sheets; s++) {
      const start = s * per + 1;
      const count = Math.min(per, o.total - s * per);
      const head = [S.text(ellipsize(mediumTitle(o.medium), 6, PW - 20, { font: 'display', weight: 800 }), 10, 17, { size: 6, weight: 800, font: 'display', fill: '#1F2937' })];
      const sub = mediumSub(o.medium);
      if (sub) head.push(S.text(ellipsize(sub, 3.4, PW - 20, { weight: 600 }), 10, 23, { size: 3.4, weight: 600, fill: '#4B5563' }));
      const res = bookPageItems(PW, PH, [{ spec: { cells: swatchCells(start, count), writeLine: true } }], {
        ...layoutOptions(o), top: sub ? 28 : 24, footer: true,
      });
      report(res.info);
      addPage([...res.items, ...head], { label: `Page ${no + 1}`, cuts: res.cuts, kind: 'book-page' });
    }
    return pages;
  }

  const groups = chunk(palettes, o.perUnit);
  let artIndex = 0;
  groups.forEach((group) => {
    const sides = twoSided ? ['front', 'back'] : ['front'];
    sides.forEach((side) => {
      const back = side === 'back';
      const units = group.map((p) => ({ spec: { title: o.showName ? p.name : '', cells: paletteCells(p, { pair: pairs, blankOnly: back }) } }));
      const res = bookPageItems(PW, PH, units, layoutOptions(o, { mirror: back, footer: true }));
      report(res.info);
      addPage(res.items, { label: `Page ${no + 1}${twoSided ? ` · ${back ? 'back' : 'front'}` : ''}`, cuts: res.cuts, kind: 'book-page', side });
    });
    if (o.artwork) {
      const items = artPageItems(PW, PH, group, o.artTemplate, artIndex);
      artIndex += group.length;
      addPage(items, { label: `Page ${no + 1} · example artwork`, cuts: [], kind: 'art-page' });
    }
  });
  return pages;
}

/**
 * Build the pages for a print job.
 * @param {object} rawOptions print options (see normalizePrintOptions)
 * @param {{name:string, colors:{hex:string,name:string}[]}[]} palettes chosen palettes
 * @returns {{ pages: object[], notes: string[], options: object }}
 */
export function buildPrint(rawOptions, palettes = []) {
  const o = effectiveOptions(rawOptions);
  const flags = {};
  const usable = o.kind === 'swatch' ? [] : palettes;
  const pages = o.format === 'deck' ? buildDeck(o, usable, flags) : buildBook(o, usable, flags);
  const notes = [];
  if (o.kind !== 'swatch' && !palettes.length) notes.push('Choose at least one palette to print.');
  if (flags.tooSmall) notes.push(`Some chips are only ${flags.tooSmall.toFixed(1)} mm wide. For bigger chips, put fewer palettes on a page or choose a shape with less text.`);
  if (o.kind === 'match' && o.blank === 'back') notes.push('Print double-sided (flip on the long edge). Each blank spot lands behind its color.');
  if (o.format === 'book' && o.artwork && o.kind !== 'swatch' && !(o.kind === 'match' && o.blank === 'back')) notes.push('Print double-sided (flip on the long edge) to put each example artwork on the back of its palette page.');
  return { pages, notes, options: o };
}

/** A page reduced to its cut lines: filled black shapes with the holes cut out, for cutting machines. */
export function cutPage(pg) {
  return { w: pg.w, h: pg.h, bg: null, items: (pg.meta?.cuts ?? []).map((d) => S.path(d, { fill: '#000000', rule: 'evenodd' })) };
}

export function printFileName(o, name = '') {
  const kind = { match: 'Match', swatch: 'Swatch', palettes: 'Palettes' }[o.kind];
  return [APP_NAME, name, `${kind} ${o.format}`].filter(Boolean).join(' – ');
}

export { textWidth, fitSize };
