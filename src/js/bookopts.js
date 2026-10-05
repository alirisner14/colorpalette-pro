// What the swatch book and the swatch deck look like: chip shapes, what is shown,
// how many palettes go on a page or blade, example artwork, and the covers.
// Plain data helpers (no DOM) so they can be saved, restored and unit tested.
import { PRINT_SHAPES } from './sheet.js';
import { TEMPLATES } from './artwork.js';
import { normalizeHex } from './color.js';
import { APP_NAME } from './meta.js';

export const LAYOUTS = ['book', 'deck'];
export const COVER_TITLE = APP_NAME;
export const COVER_SUBTITLE = { book: 'Swatch Book', deck: 'Swatch Deck' };
export const COVER_COLORS = ['#2F6FE4', '#7C5CFF', '#E8498F', '#FF8A4C', '#2BB673', '#17213D'];
export const LIMITS = { perPage: [1, 12], perBlade: [1, 4], title: 40, subtitle: 40 };

const DEFAULTS = {
  book: { shapes: ['rect'], showName: true, showColorNames: false, showHex: false, showRgb: false, perPage: 6, artwork: false, artTemplate: 'auto', orient: 'portrait' },
  deck: { shapes: ['rect'], showName: true, showColorNames: true, showHex: true, showRgb: true, perBlade: 1 },
};

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const int = (v, [lo, hi], d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const text = (v, d, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, max) : d);

const shapeList = (v) => {
  const ids = PRINT_SHAPES.map((s) => s.id);
  const list = [...new Set((Array.isArray(v) ? v : []).filter((s) => ids.includes(s)))];
  return list.length ? list : ['rect'];
};

function normalizeCover(layout, c = {}) {
  const src = c && typeof c === 'object' ? c : {};
  return {
    // The book always has a cover; the deck's is optional.
    on: layout === 'book' ? true : bool(src.on, true),
    title: text(src.title, COVER_TITLE, LIMITS.title),
    subtitle: text(src.subtitle, COVER_SUBTITLE[layout], LIMITS.subtitle),
    color: normalizeHex(src.color) ?? COVER_COLORS[0],
    image: bool(src.image, false),
  };
}

/** Fill in anything missing and keep every value in range. Safe to call with anything. */
export function normalizeOpts(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = r.book && typeof r.book === 'object' ? r.book : {};
  const d = r.deck && typeof r.deck === 'object' ? r.deck : {};
  const covers = r.covers && typeof r.covers === 'object' ? r.covers : {};
  return {
    layout: LAYOUTS.includes(r.layout) ? r.layout : 'book',
    book: {
      shapes: shapeList(b.shapes),
      showName: bool(b.showName, DEFAULTS.book.showName),
      showColorNames: bool(b.showColorNames, DEFAULTS.book.showColorNames),
      showHex: bool(b.showHex, DEFAULTS.book.showHex),
      showRgb: bool(b.showRgb, DEFAULTS.book.showRgb),
      perPage: int(b.perPage, LIMITS.perPage, DEFAULTS.book.perPage),
      artwork: bool(b.artwork, false),
      artTemplate: b.artTemplate === 'auto' || !TEMPLATES.some((t) => t.id === b.artTemplate) ? 'auto' : b.artTemplate,
      orient: b.orient === 'landscape' ? 'landscape' : 'portrait',
    },
    deck: {
      shapes: shapeList(d.shapes),
      showName: bool(d.showName, DEFAULTS.deck.showName),
      showColorNames: bool(d.showColorNames, DEFAULTS.deck.showColorNames),
      showHex: bool(d.showHex, DEFAULTS.deck.showHex),
      showRgb: bool(d.showRgb, DEFAULTS.deck.showRgb),
      perBlade: int(d.perBlade, LIMITS.perBlade, DEFAULTS.deck.perBlade),
    },
    covers: { book: normalizeCover('book', covers.book), deck: normalizeCover('deck', covers.deck) },
  };
}

export const defaultOpts = () => normalizeOpts({});

/** The default look of one layout (used by "Reset"), keeping the cover and the layout as they are. */
export function resetLayout(opts, layout) {
  const base = defaultOpts();
  return normalizeOpts({ ...opts, [layout]: base[layout] });
}

/** What a layout's blocks should show, in the shape the layout engine expects. */
export const showFor = (opts, layout) => {
  const o = opts[layout];
  return { shapes: o.shapes, showName: o.showName, showColorNames: o.showColorNames, showHex: o.showHex, showRgb: o.showRgb };
};
