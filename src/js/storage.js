// Local persistence. Storage can be unavailable (private mode, blocked site
// data), so every access is guarded and the app works without it.
const KEYS = {
  favorites: 'cpp.favorites.v1',
  prefs: 'cpp.prefs.v1',
  book: 'cpp.book.v1',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadFavorites = () => {
  const list = read(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
};
export const saveFavorites = (list) => write(KEYS.favorites, list);
export const loadBook = () => read(KEYS.book, null);
export const saveBook = (book) => write(KEYS.book, book);
/** The v1 favorites list is only read once, to migrate it into the book. */
export const clearFavorites = () => { try { localStorage.removeItem(KEYS.favorites); } catch { /* ignore */ } };
export const loadPrefs = () => read(KEYS.prefs, {});
export const savePrefs = (prefs) => write(KEYS.prefs, prefs);
