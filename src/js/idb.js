// A tiny key-value store on IndexedDB, used for things too big for
// localStorage (cover images). One database ("cpp"), one store ("kv").
// Every call is guarded: when storage is blocked (private windows, strict
// settings) the functions resolve to harmless defaults instead of throwing.

const DB_NAME = 'cpp';
const STORE = 'kv';
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    } catch (e) {
      reject(e);
    }
  });
  opening.catch(() => { opening = null; });
  return opening;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbGet = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);
export const idbSet = (key, value) => run('readwrite', (s) => s.put(value, key)).then(() => true, () => false);
export const idbDel = (key) => run('readwrite', (s) => s.delete(key)).then(() => true, () => false);
export const idbKeys = () => run('readonly', (s) => s.getAllKeys()).then((k) => k ?? [], () => []);

/** Delete the whole database. Used by "Delete all my data". */
export async function idbDestroy() {
  try { (await open()).close(); } catch { /* nothing open */ }
  opening = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
