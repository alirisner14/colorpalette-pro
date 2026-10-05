// Backup and restore for the swatch book. Two kinds of backup file:
//   • a flipbook page (.html) that looks and turns like the real thing and also holds the data
//   • a small data file (.json) made just for restoring
// Everything is made and read on this device; nothing is sent anywhere.
import {
  book, getBookOpts, setBookOpts, replaceBook, persistBook, persistPrefs, prefs,
} from './store.js';
import { paletteCount } from './book.js';
import {
  makeBackup, readBackup, mergeBooks, backupFileName, parseBackupText,
} from './backupcore.js';
import { buildFlipbookHtml } from './backuphtml.js';
import {
  planPages, pageScene, planBlades, bladeScene, bookPageSize, bladeSize, bladePivot,
} from './bookpages.js';
import { coverImage, setCoverImageData, clearCoverImage } from './cover.js';
import { toSvg } from './scene.js';
import { downloadBlob } from './export.js';
import { openDialog, toast, esc } from './ui.js';
import { APP_NAME } from './meta.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const snapshot = () => makeBackup({ book, opts: getBookOpts(), covers: { book: coverImage('book'), deck: coverImage('deck') } });
const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'never');
const tick = () => new Promise((r) => setTimeout(r, 0)); // let the browser breathe during long jobs

/* ---------- making a backup ---------- */

async function fetchBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The two bundled fonts as base64, so the flipbook page looks right with nothing else installed. */
async function fontData() {
  try {
    const [display, body] = await Promise.all([
      fetchBase64('assets/fonts/grandstander-latin-wght-normal.woff2'),
      fetchBase64('assets/fonts/nunito-latin-wght-normal.woff2'),
    ]);
    return { display, body };
  } catch {
    return {}; // the page falls back to the system fonts
  }
}

function markBackedUp() {
  persistPrefs({ lastBackup: new Date().toISOString() });
}

/** Save the swatch book as a flipbook page (the book, or the deck if that is what you are using). */
export async function backupHtml() {
  const opts = getBookOpts();
  const { layout } = opts;
  toast('Making your flipbook…', { ms: 1500 });
  await tick();
  const data = snapshot();
  const fonts = await fontData();
  const items = [];
  if (layout === 'book') {
    const plan = planPages(book, opts);
    for (let i = 0; i < plan.length; i++) {
      const d = plan[i];
      const scene = pageScene(d, { book, opts, coverImage: coverImage('book'), more: false });
      const svg = toSvg(scene, d.kind === 'cover'
        ? { units: 'none', title: 'Cover', idPrefix: `e${i}-` }
        : { units: 'none', title: `Page ${d.no}`, interactive: true, idPrefix: `e${i}-` });
      items.push({ svg, kind: d.kind, sectionId: d.sectionId, no: d.no });
      if (i % 4 === 3) await tick();
    }
  } else {
    const plan = planBlades(book, opts);
    for (let i = 0; i < plan.length; i++) {
      const d = plan[i];
      const scene = bladeScene(d, { book, opts, coverImage: coverImage('deck'), more: false });
      const svg = toSvg(scene, d.kind === 'cover'
        ? { units: 'none', title: 'Cover', idPrefix: `e${i}-` }
        : { units: 'none', title: 'Palettes on this blade', interactive: true, idPrefix: `e${i}-` });
      items.push({ svg, kind: d.kind, sectionId: d.sectionId });
      if (i % 4 === 3) await tick();
    }
  }
  const page = bookPageSize(opts.book.orient);
  const blade = bladeSize(opts.deck.perBlade);
  const html = buildFlipbookHtml({
    data,
    layout,
    items,
    tabs: book.sections.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.ids.length })),
    size: layout === 'book' ? { w: page.w, h: page.h, landscape: opts.book.orient === 'landscape' } : { w: blade.w, h: blade.h, pivot: bladePivot(opts.deck.perBlade).y },
    cover: opts.covers[layout].color,
    fonts,
    title: layout === 'book' ? 'My Swatch Book' : 'My Swatch Deck',
    subtitle: APP_NAME,
  });
  downloadBlob(new Blob([html], { type: 'text/html' }), `${backupFileName()}.html`);
  markBackedUp();
  toast('Saved your flipbook backup. Keep it somewhere safe ✨');
}

/** Save the swatch book as a small data file made for restoring. */
export async function backupJson() {
  const text = JSON.stringify(snapshot());
  downloadBlob(new Blob([text], { type: 'application/json' }), `${backupFileName()}.json`);
  markBackedUp();
  toast('Saved your data backup. Keep it somewhere safe ✨');
}

/** The "Back up" dialog. */
export function openBackup() {
  const layout = getBookOpts().layout;
  const dlg = openDialog({
    title: 'Back up my swatch book',
    cls: 'sheet',
    html: `<div class="dlg-body">
      <p class="dlg-note">Your swatch book is stored on this device only. A backup is a file you can keep anywhere: a cloud drive, an email to yourself, a USB stick.</p>
      <section class="dlg-section"><h3>Flipbook page (.html)</h3>
        <p class="dlg-note">Opens in any browser with no internet, and ${layout === 'book' ? 'turns its pages just like your swatch book' : 'fans out just like your swatch deck'}, cover and all. It also holds everything needed to restore. Best for keeping and showing off.</p>
        <button type="button" class="btn btn-primary" data-do="html">Save flipbook (.html)</button>
      </section>
      <section class="dlg-section"><h3>Data file (.json)</h3>
        <p class="dlg-note">A small file made just for restoring: your palettes, tabs, look and covers.</p>
        <button type="button" class="btn btn-glass" data-do="json">Save data file (.json)</button>
      </section>
      <p class="dlg-note">Last backup: <b>${esc(longDate(prefs.lastBackup))}</b>. To bring a backup back, use <button type="button" class="link-btn" data-do="restore">Restore from a backup</button>.</p>
    </div>`,
  });
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    dlg.close();
    if (b.dataset.do === 'html') await backupHtml();
    else if (b.dataset.do === 'json') await backupJson();
    else restoreFlow();
  });
}

/* ---------- restoring ---------- */

async function readBackupFile(file) {
  if (file.size > 80 * 1024 * 1024) throw new Error('That file is too big to be a backup.');
  return parseBackupText(file.name, await file.text());
}

/** Ask for a backup file (a flipbook page or a data file) and restore from it. */
export function restoreFlow() {
  const input = document.createElement('input'); // never added to the page, so nothing is left behind
  input.type = 'file';
  input.accept = '.html,.htm,.json,application/json,text/html';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      restoreFromData(await readBackupFile(file));
    } catch (e) {
      toast(e.message || 'That file could not be read.');
    }
  });
  input.click();
}

function chooseRestore({ r, have }) {
  return new Promise((resolve) => {
    const bits = [`${r.counts.palettes} palette${r.counts.palettes === 1 ? '' : 's'} in ${r.counts.tabs} tab${r.counts.tabs === 1 ? '' : 's'}`];
    if (r.counts.covers) bits.push(`${r.counts.covers} cover picture${r.counts.covers === 1 ? '' : 's'}`);
    const dlg = openDialog({
      title: 'Restore this backup?',
      cls: 'ask',
      html: `<p class="muted">Backup from <b>${esc(longDate(r.createdAt))}</b>: ${esc(bits.join(', '))}.${have ? ` Your swatch book has ${have} palette${have === 1 ? '' : 's'} right now.` : ''}</p>
        <div class="ask-actions ask-stack">
          <button type="button" class="btn btn-primary" data-pick="replace">${have ? 'Replace my swatch book' : 'Restore'}</button>
          ${have ? '<button type="button" class="btn btn-glass" data-pick="merge">Add to my swatch book</button>' : ''}
          <button type="button" class="btn btn-glass" data-pick="">Cancel</button>
        </div>
        ${have ? '<p class="dlg-note">Replace swaps in the backup’s palettes, tabs, look and covers (you can undo right after). Add keeps what you have and adds the palettes you do not already have.</p>' : ''}`,
      onClose: () => resolve(dlg.picked || null),
    });
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      dlg.picked = b.dataset.pick;
      dlg.close();
    });
  });
}

async function applyCovers(covers) {
  for (const layout of ['book', 'deck']) {
    if (covers[layout]) await setCoverImageData(layout, covers[layout]);
    else await clearCoverImage(layout);
  }
}

/** Restore from an already-read backup object (a file's contents). */
export async function restoreFromData(raw) {
  let r;
  try { r = readBackup(raw); } catch (e) { toast(e.message); return; }
  const have = paletteCount(book);
  const choice = await chooseRestore({ r, have });
  if (!choice) return;

  if (choice === 'merge') {
    const res = mergeBooks(book, r.book);
    persistBook();
    toast(res.added
      ? `Added ${res.added} palette${res.added === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} already here)` : ''} ★`
      : 'Everything in that backup is already in your swatch book.');
    return;
  }

  const before = { book: clone(book), opts: clone(getBookOpts()), covers: { book: coverImage('book'), deck: coverImage('deck') } };
  await applyCovers(r.covers);
  replaceBook(r.book);
  setBookOpts(r.opts);
  toast(`Restored ${r.counts.palettes} palette${r.counts.palettes === 1 ? '' : 's'} ★`, {
    action: have ? 'Undo' : undefined,
    onAction: async () => {
      await applyCovers(before.covers);
      replaceBook(before.book);
      setBookOpts(before.opts);
      toast('Put your earlier swatch book back.');
    },
  });
}
