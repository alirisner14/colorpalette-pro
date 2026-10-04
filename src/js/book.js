// Swatch book data model. Pure functions over a plain object so it can be
// saved as JSON and unit tested:
//   { version, sections: [{ id, name, color, ids: [paletteId] }], palettes: { [id]: palette } }
import { hueFamily } from './names.js';

export const DEFAULT_SECTION = 'sec-main';

export const TAB_COLORS = ['#FF8FB1', '#FFC75F', '#7FD8BE', '#7EB6FF', '#B79CFF', '#FF9F6E', '#5ED3F3', '#C6E377'];

const sid = () => `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const clone = (p) => JSON.parse(JSON.stringify(p));

export function emptyBook() {
  return { version: 1, sections: [{ id: DEFAULT_SECTION, name: 'My Palettes', color: TAB_COLORS[3], ids: [] }], palettes: {} };
}

/** Accept a stored book, or migrate the v1 favorites array. Drops broken data. */
export function normalizeBook(raw, legacyFavorites = []) {
  let book = raw && Array.isArray(raw.sections) && raw.palettes ? raw : emptyBook();
  book = { version: 1, sections: book.sections.filter((s) => s && s.id && Array.isArray(s.ids)), palettes: { ...book.palettes } };
  if (!book.sections.length) book.sections = emptyBook().sections;
  for (const p of legacyFavorites) {
    if (p?.id && !book.palettes[p.id]) {
      book.palettes[p.id] = p;
      book.sections[0].ids.push(p.id);
    }
  }
  const seen = new Set();
  for (const s of book.sections) {
    s.ids = s.ids.filter((id) => book.palettes[id] && !seen.has(id) && seen.add(id));
    s.name = String(s.name || 'Untitled').slice(0, 30);
    s.color = s.color || TAB_COLORS[0];
  }
  // Orphans go to the first section.
  for (const id of Object.keys(book.palettes)) if (!seen.has(id)) book.sections[0].ids.push(id);
  return book;
}

export const hasPalette = (book, id) => !!book.palettes[id];
export const sectionOf = (book, id) => book.sections.find((s) => s.ids.includes(id));
export const getSection = (book, sectionId) => book.sections.find((s) => s.id === sectionId);
export const paletteCount = (book) => Object.keys(book.palettes).length;

export function addPalette(book, palette, sectionId = book.sections[0].id) {
  const section = getSection(book, sectionId) || book.sections[0];
  book.palettes[palette.id] = clone(palette);
  if (!sectionOf(book, palette.id)) section.ids.unshift(palette.id);
  return book;
}

export function updatePalette(book, palette) {
  if (book.palettes[palette.id]) book.palettes[palette.id] = clone(palette);
  return book;
}

export function removePalette(book, id) {
  delete book.palettes[id];
  book.sections.forEach((s) => { s.ids = s.ids.filter((x) => x !== id); });
  return book;
}

/** Move a palette to `toSectionId` at `index` (clamped; omitted = end). */
export function movePalette(book, id, toSectionId, index) {
  const from = sectionOf(book, id);
  const to = getSection(book, toSectionId);
  if (!from || !to) return book;
  const oldIndex = from.ids.indexOf(id);
  from.ids.splice(oldIndex, 1);
  let i = index ?? to.ids.length;
  if (from === to && index != null && oldIndex < index) i -= 1;
  to.ids.splice(Math.max(0, Math.min(i, to.ids.length)), 0, id);
  return book;
}

export function addSection(book, name, color) {
  const section = {
    id: sid(),
    name: String(name).trim().slice(0, 30) || 'New Tab',
    color: color || TAB_COLORS[book.sections.length % TAB_COLORS.length],
    ids: [],
  };
  book.sections.push(section);
  return section;
}

export function renameSection(book, sectionId, name, color) {
  const s = getSection(book, sectionId);
  if (s) {
    if (name?.trim()) s.name = name.trim().slice(0, 30);
    if (color) s.color = color;
  }
  return book;
}

/** Delete a tab; its palettes move to the first remaining tab. */
export function deleteSection(book, sectionId) {
  if (book.sections.length <= 1) return book;
  const i = book.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return book;
  const [gone] = book.sections.splice(i, 1);
  book.sections[0].ids.push(...gone.ids);
  return book;
}

export function moveSection(book, sectionId, delta) {
  const i = book.sections.findIndex((s) => s.id === sectionId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= book.sections.length) return book;
  [book.sections[i], book.sections[j]] = [book.sections[j], book.sections[i]];
  return book;
}

const FAMILY_TABS = {
  red: ['Reds', '#FF6B6B'], coral: ['Corals', '#FF8A65'], orange: ['Oranges', '#FFA94D'], amber: ['Golds', '#FFC75F'],
  yellow: ['Yellows', '#FFE066'], lime: ['Limes', '#C0EB75'], green: ['Greens', '#69DB7C'], mint: ['Mints', '#63E6BE'],
  teal: ['Teals', '#38D9A9'], aqua: ['Aquas', '#66D9E8'], sky: ['Sky Blues', '#74C0FC'], blue: ['Blues', '#4DABF7'],
  indigo: ['Indigos', '#748FFC'], purple: ['Purples', '#B197FC'], magenta: ['Magentas', '#E599F7'], pink: ['Pinks', '#F783AC'],
  brown: ['Browns', '#C08B5C'], white: ['Whites', '#E9ECEF'], gray: ['Grays', '#ADB5BD'], black: ['Darks', '#495057'],
};

/** The hue family that covers the most colors in a palette. */
export function mainFamily(palette) {
  const counts = {};
  palette.colors.forEach((c) => { const f = hueFamily(c.hex); counts[f] = (counts[f] || 0) + 1; });
  return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a));
}

/** Rebuild tabs as one per main color family (existing tabs are replaced). */
export function autoSortByColor(book) {
  const order = Object.keys(FAMILY_TABS);
  const groups = new Map();
  for (const s of book.sections) {
    for (const id of s.ids) {
      const fam = mainFamily(book.palettes[id]);
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam).push(id);
    }
  }
  book.sections = [...groups.keys()]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((fam) => ({ id: `sec-${fam}`, name: FAMILY_TABS[fam][0], color: FAMILY_TABS[fam][1], ids: groups.get(fam) }));
  if (!book.sections.length) book.sections = emptyBook().sections;
  return book;
}

/**
 * Lay the book out as pages: each tab starts on a new page and holds
 * `perPage` palettes per page; an empty tab still gets one page.
 */
export function paginate(book, perPage) {
  const pages = [];
  for (const s of book.sections) {
    const chunks = s.ids.length ? [] : [[]];
    for (let i = 0; i < s.ids.length; i += perPage) chunks.push(s.ids.slice(i, i + perPage));
    chunks.forEach((ids, k) => pages.push({ sectionId: s.id, ids, offset: k * perPage, pageInSection: k, pagesInSection: chunks.length }));
  }
  return pages;
}
