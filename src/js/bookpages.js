// The swatch book and swatch deck as scenes: a cover and pages for the book, a
// cover and blades for the deck. Pure functions with no DOM, so the screen, the
// live preview in "Customize", the HTML backup and the tests all draw the very
// same thing (the layout engine in sheet.js does the fitting).
//
// Planning is cheap (which palettes go on which page); building a page's scene
// is the heavier part, so the screen only builds the pages it is showing.
import { S, page } from './scene.js';
import { paginate, getSection, TAB_COLORS } from './book.js';
import { paletteCells, bookPageItems, bladeItems, HOLE_DIAMETER } from './sheet.js';
import { artPageItems } from './printable.js';
import { coverScene } from './cover.js';
import { showFor } from './bookopts.js';
import { ellipsize, wrapText, textWidth } from './textmetrics.js';
import { generateColors, ORGANIC } from './harmonies.js';
import { nameColors } from './names.js';

/** Page sizes in layout units (about millimetres). The screen scales them to fit. */
export const BOOK_PAGE = { portrait: { w: 100, h: 140 }, landscape: { w: 140, h: 100 } };
export const BLADE = { h: 150, perPalette: 46, maxW: 160 };
export const bladeSize = (perBlade) => ({ w: Math.min(BLADE.maxW, BLADE.perPalette * perBlade), h: BLADE.h });
export const bookPageSize = (orient) => BOOK_PAGE[orient === 'landscape' ? 'landscape' : 'portrait'];

const INK = '#1F2937';
const SOFT = '#4B5563';
const MARGIN = 5;
const HEADER = 10;

/** The first palette's colors, for the little dots on the cover. */
export function coverDots(book) {
  for (const s of book.sections) {
    const p = book.palettes[s.ids[0]];
    if (p) return p.colors.map((c) => c.hex).slice(0, 8);
  }
  return [];
}

/** The spec of the biggest palette in the book. Grids are sized for it, so every page and blade looks alike. */
function biggestSpec(book, showName) {
  let big = null;
  for (const p of Object.values(book.palettes)) if (!big || p.colors.length > big.colors.length) big = p;
  return big ? { title: showName ? big.name : '', cells: paletteCells(big) } : undefined;
}

const unitFor = (book, id, showName) => {
  const p = book.palettes[id];
  return { pid: id, label: p.name, spec: { title: showName ? p.name : '', cells: paletteCells(p) } };
};

function message(w, y, lines, size = 3.6) {
  return lines.map((l, i) => S.text(l, w / 2, y + i * size * 1.5, { size, weight: 700, anchor: 'middle', fill: SOFT }));
}

/* ---------- the book ---------- */

/**
 * Which pages the book has: the cover, then each tab's pages (and an example
 * artwork page after each, if that is switched on).
 * @returns {{ kind: 'cover'|'tab'|'art', sectionId?: string, ids: string[], no?: number }[]}
 */
export function planPages(book, opts) {
  const o = opts.book;
  const out = [];
  if (opts.covers.book.on) out.push({ kind: 'cover', ids: [] });
  let art = 0;
  for (const p of paginate(book, o.perPage)) {
    out.push({ kind: 'tab', ...p });
    if (o.artwork && p.ids.length) {
      out.push({ kind: 'art', sectionId: p.sectionId, ids: p.ids, offset: p.offset, pageInSection: p.pageInSection, pagesInSection: p.pagesInSection, artStart: art });
      art += p.ids.length;
    }
  }
  let n = 0;
  out.forEach((d) => { if (d.kind !== 'cover') d.no = ++n; });
  return out;
}

function pageHeader(w, section, label, counter) {
  const items = [];
  const y = MARGIN + 4;
  items.push(S.circle(MARGIN + 2.6, y - 1, 2.6, { fill: section.color, stroke: '#00000026', sw: 0.3 }));
  const counterW = counter ? textWidth(counter, 3, { weight: 700 }) + 2 : 0;
  const maxW = w - MARGIN * 2 - 7 - 11 - counterW;
  const size = 5.4;
  items.push(S.text(ellipsize(label, size, maxW, { font: 'display', weight: 800 }), MARGIN + 7, y, { size, weight: 800, font: 'display', fill: INK }));
  if (counter) items.push(S.text(counter, w - MARGIN - 11, y, { size: 3, weight: 700, anchor: 'end', fill: '#8790A8' }));
  return items;
}

/**
 * The scene for one planned page.
 * @param {object} desc an entry of planPages()
 * @param {{ book: object, opts: object, coverImage?: string|null, more?: boolean }} ctx `more: false` leaves out the "..." buttons (for the static backup)
 */
export function pageScene(desc, { book, opts, coverImage = null, more = true }) {
  const o = opts.book;
  const { w, h } = bookPageSize(o.orient);
  if (desc.kind === 'cover') {
    return coverScene(w, h, opts.covers.book, { image: coverImage, dots: coverDots(book), spine: true });
  }
  const s = getSection(book, desc.sectionId) ?? book.sections[0];
  const counter = desc.pagesInSection > 1 ? `${desc.pageInSection + 1} / ${desc.pagesInSection}` : '';
  const items = pageHeader(w, s, desc.kind === 'art' ? `${s.name} · artwork` : s.name, counter);
  const top = MARGIN + HEADER;

  if (desc.kind === 'art') {
    const palettes = desc.ids.map((id) => book.palettes[id]).filter(Boolean);
    items.push(...artPageItems(w, h, palettes, o.artTemplate, desc.artStart ?? 0, { margin: MARGIN, top, ui: more }));
  } else if (!desc.ids.length) {
    items.push(...message(w, h * 0.42, ['This tab is empty.', '', ...wrapText('Press and hold a palette, then drop it on this tab. Or open a palette’s ⋯ menu and choose Move to tab.', 3.4, w - 24, { maxLines: 4, weight: 700 })]));
  } else {
    const units = desc.ids.map((id) => unitFor(book, id, o.showName));
    const res = bookPageItems(w, h, units, {
      ...showFor(opts, 'book'), hole: 'none', margin: MARGIN, top, footer: true, gap: 3, ui: true, more, slots: o.perPage, gridSpec: biggestSpec(book, o.showName),
    });
    items.push(...res.items);
  }
  items.push(S.text(String(desc.no), w / 2, h - 2.8, { size: 2.8, weight: 700, anchor: 'middle', fill: '#A3A9B8' }));
  return page(w, h, items, { bg: null, meta: { kind: desc.kind, no: desc.no, sectionId: desc.sectionId } });
}

/* ---------- the deck ---------- */

/** Which blades the deck has: the cover (if on), then each tab's blades. */
export function planBlades(book, opts) {
  const out = [];
  if (opts.covers.deck.on) out.push({ kind: 'cover', ids: [] });
  for (const p of paginate(book, opts.deck.perBlade)) out.push({ kind: 'blade', ...p });
  return out;
}

export function bladeScene(desc, { book, opts, coverImage = null, more = true }) {
  const { w, h } = bladeSize(opts.deck.perBlade);
  if (desc.kind === 'cover') {
    const pivot = bladePivot(opts.deck.perBlade);
    return coverScene(w, h, opts.covers.deck, { image: coverImage, dots: coverDots(book), hole: { x: pivot.x, y: pivot.y, r: HOLE_DIAMETER.m / 2 } });
  }
  const units = desc.ids.map((id) => unitFor(book, id, opts.deck.showName));
  const res = bladeItems({ x: 0, y: 0, w, h }, units, {
    ...showFor(opts, 'deck'), hole: 'tm', holeD: HOLE_DIAMETER.m, guides: false, ui: true, more, slots: opts.deck.perBlade,
  });
  const items = [...res.items];
  if (!units.length) items.push(...message(w, h * 0.4, wrapText('This tab is empty. Move a palette here.', 3.4, w - 12, { maxLines: 4, weight: 700 })));
  return page(w, h, items, { bg: null, meta: { kind: 'blade', sectionId: desc.sectionId } });
}

/** Where the punch hole (the pivot the blades swing on) is, in layout units from the blade's top-left. */
export function bladePivot(perBlade) {
  const { w } = bladeSize(perBlade);
  const holeD = HOLE_DIAMETER.m;
  return { x: w / 2, y: Math.max(5.5, holeD / 2 + 3.2) };
}

/* ---------- samples (for the preview when the book is still empty) ---------- */

/** A few made-up palettes so Customize has something to show. Nothing is stored. */
export function sampleBook() {
  const specs = [
    ['Blue Sky Carnival', '#33ADE8', 'analogous'], ['Kite Parade', '#FF6F91', 'triadic'], ['Mint Chip Dream', '#7FD8BE', 'monochrome'],
    ['Sailor Disco', '#3B5BDB', 'tetradic'], ['Peach Fizz', '#FF9F6E', 'complementary'], ['Lilac Hour', '#B79CFF', 'split-complementary'],
  ];
  const palettes = {};
  const ids = [];
  specs.forEach(([name, base, harmony], i) => {
    const hexes = generateColors(base, harmony, 8, 11 * (i + 1));
    const names = nameColors(hexes);
    const id = `sample-${i}`;
    palettes[id] = { id, name, harmony: ORGANIC, foundation: harmony, colors: hexes.map((hex, k) => ({ hex, name: names[k] })) };
    ids.push(id);
  });
  return { version: 1, sections: [{ id: 'sample', name: 'My Palettes', color: TAB_COLORS[3], ids }], palettes };
}
