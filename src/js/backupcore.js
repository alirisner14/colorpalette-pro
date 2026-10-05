// Backing up and restoring the swatch book. Pure functions (no DOM): make the
// backup object, check and tidy one that was read from a file (it may have been
// edited, damaged or made by something else), and merge it into a book.
import { normalizeBook, addSection, TAB_COLORS } from './book.js';
import { normalizeHex } from './color.js';
import { nameColors } from './names.js';
import { normalizeOpts, LAYOUTS } from './bookopts.js';
import { isCoverDataUrl } from './cover.js';
import { backupFromHtml } from './importers.js';
import { APP_NAME, APP_VERSION } from './meta.js';

export const BACKUP_TYPE = 'color-palette-pro-backup';
export const BACKUP_VERSION = 1;
export const LIMITS = { palettes: 3000, colors: 60, sections: 200 };

const clone = (o) => JSON.parse(JSON.stringify(o));
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const ID = /^[\w.:-]{1,80}$/;
const SOURCES = ['color', 'photo', 'theme', 'mood', 'custom', 'import'];

/** The backup as a plain object, ready to be saved as JSON or embedded in the flipbook page. */
export function makeBackup({ book, opts, covers = {}, now = new Date() }) {
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    app: { name: APP_NAME, version: APP_VERSION },
    createdAt: now.toISOString(),
    book: clone(book),
    opts: clone(opts),
    covers: { book: covers.book ?? null, deck: covers.deck ?? null },
  };
}

function cleanPalette(p, id) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.colors)) return null;
  const colors = p.colors.slice(0, LIMITS.colors)
    .map((c) => ({ hex: normalizeHex(c?.hex), name: str(c?.name, 40) }))
    .filter((c) => c.hex);
  if (!colors.length) return null;
  const made = nameColors(colors.map((c) => c.hex));
  const out = {
    id,
    name: str(p.name, 60) || 'Palette',
    harmony: str(p.harmony, 60) || 'custom',
    colors: colors.map((c, i) => ({ hex: c.hex, name: c.name || made[i] })),
  };
  if (typeof p.createdAt === 'string' && Number.isFinite(Date.parse(p.createdAt))) out.createdAt = new Date(p.createdAt).toISOString();
  if (SOURCES.includes(p.source)) out.source = p.source;
  const base = normalizeHex(p.base);
  if (base) out.base = base;
  if (typeof p.moodText === 'string') out.moodText = str(p.moodText, 60);
  return out;
}

/**
 * Check a backup that came from a file and return clean data to restore.
 * Throws an Error with a friendly message when it is not usable.
 * @returns {{ book: object, opts: object, covers: {book: string|null, deck: string|null}, createdAt: string|null, counts: object }}
 */
export function readBackup(raw) {
  if (!raw || typeof raw !== 'object' || raw.type !== BACKUP_TYPE) throw new Error('That file is not a Color Palette PRO backup.');
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Color Palette PRO. Update the app, then try again.');
  }
  const rb = raw.book && typeof raw.book === 'object' ? raw.book : {};
  const palettes = {};
  let n = 0;
  for (const [key, p] of Object.entries(rb.palettes && typeof rb.palettes === 'object' ? rb.palettes : {})) {
    if (n >= LIMITS.palettes) break;
    const id = ID.test(key) ? key : `r-${n}-${Math.random().toString(36).slice(2, 6)}`;
    const clean = cleanPalette(p, id);
    if (clean) { palettes[id] = clean; n++; }
  }
  const seen = new Set();
  const sections = [];
  (Array.isArray(rb.sections) ? rb.sections : []).slice(0, LIMITS.sections).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const id = ID.test(s.id) && !seen.has(s.id) ? s.id : `sec-r${i}`;
    seen.add(id);
    sections.push({
      id,
      name: str(s.name, 30) || 'Untitled',
      color: normalizeHex(s.color) ?? TAB_COLORS[i % TAB_COLORS.length],
      ids: (Array.isArray(s.ids) ? s.ids : []).map(String).filter((pid) => palettes[pid]),
    });
  });
  const book = normalizeBook({ version: 1, sections, palettes });

  const opts = normalizeOpts(raw.opts);
  const covers = { book: null, deck: null };
  for (const layout of LAYOUTS) {
    if (isCoverDataUrl(raw.covers?.[layout])) covers[layout] = raw.covers[layout];
    opts.covers[layout].image = !!covers[layout];
  }
  return {
    book,
    opts,
    covers,
    createdAt: Number.isFinite(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : null,
    counts: { palettes: Object.keys(book.palettes).length, tabs: book.sections.length, covers: LAYOUTS.filter((l) => covers[l]).length },
  };
}

const signature = (p) => `${p.name.toLowerCase()}|${p.colors.map((c) => c.hex).join(',')}`;

/**
 * Add the palettes of `incoming` to `current` (in place), skipping any that are already there
 * (same id, or the same name and colors). Tabs with the same name are shared; a tab is only
 * created when it has something to add.
 * @returns {{ added: number, skipped: number, tabsAdded: number }}
 */
export function mergeBooks(current, incoming) {
  const result = { added: 0, skipped: 0, tabsAdded: 0 };
  const have = new Set(Object.values(current.palettes).map(signature));
  for (const s of incoming.sections) {
    let target = current.sections.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    for (const id of s.ids) {
      const p = incoming.palettes[id];
      if (current.palettes[id] || have.has(signature(p))) { result.skipped++; continue; }
      if (!target) { target = addSection(current, s.name, s.color); result.tabsAdded++; }
      current.palettes[id] = { ...p };
      target.ids.push(id);
      have.add(signature(p));
      result.added++;
    }
  }
  return result;
}

/** A file name for a backup, e.g. "Color Palette PRO – Swatch book backup 2026-10-04". */
export function backupFileName(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `${APP_NAME} – Swatch book backup ${d}`;
}

/**
 * Read the text of a file the person chose (a flipbook page or a data file) and return the backup inside.
 * Throws an Error with a friendly message when it is not one of ours.
 */
export function parseBackupText(fileName, text) {
  let data = null;
  if (/^\s*(<!doctype html|<html)/i.test(text) || /\.html?$/i.test(fileName)) data = backupFromHtml(text);
  else {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!data || data.type !== BACKUP_TYPE) throw new Error('That file is not a Color Palette PRO backup. To add palettes from other apps, use Import.');
  return data;
}

/** A backup as JSON text that is safe to put inside a <script> tag. */
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");
export const toScriptJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');
