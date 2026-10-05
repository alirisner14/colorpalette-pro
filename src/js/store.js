// Shared app state, book persistence and a tiny event bus.
import { normalizeBook } from './book.js';
import { normalizeOpts } from './bookopts.js';
import { loadBook, saveBook, loadFavorites, clearFavorites, loadPrefs, savePrefs } from './storage.js';
import { toast } from './ui.js';

const legacy = loadFavorites();
export const book = normalizeBook(loadBook(), legacy);
if (legacy.length) { saveBook(book); clearFavorites(); }

export const prefs = loadPrefs();

const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { (listeners[evt] || []).forEach((fn) => fn(data)); }

let warned = false;
export function persistBook() {
  if (!saveBook(book) && !warned) {
    warned = true;
    toast('Heads up: this browser is blocking storage, so your swatch book will reset when you leave.');
  }
  emit('book');
}

export function persistPrefs(patch) {
  Object.assign(prefs, patch);
  savePrefs(prefs);
}

/** Replace the whole swatch book (restoring a backup) without changing the `book` object other modules hold. */
export function replaceBook(next) {
  book.sections = next.sections;
  book.palettes = next.palettes;
  persistBook();
}

/* How the swatch book and deck look (layout, shapes, what to show, covers). */
let opts = normalizeOpts(prefs.bookOpts);
export const getBookOpts = () => opts;

/** Save new look-and-feel options. `silent` skips telling the views (they redraw once when a dialog closes). */
export function setBookOpts(next, { silent = false } = {}) {
  opts = normalizeOpts(next);
  persistPrefs({ bookOpts: opts });
  if (!silent) emit('bookopts');
  return opts;
}
