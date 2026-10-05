// Full-screen palette viewer for the Swatch Book, with one-tap exports.
import { readableText, rgbString } from './color.js';
import { typeLabel } from './harmonies.js';
import { FORMATS } from './formats.js';
import { sectionOf } from './book.js';
import { book, emit, on } from './store.js';
import { $, esc, ICONS, copyText, showMenu, reducedMotion, haptic } from './ui.js';
import { formatButton, runExport, openExportSheet } from './exportsheet.js';
import { readingOrder, removeWithUndo, revealInBook, cardMenu } from './bookview.js';
import { rgbCss } from './render.js';

const QUICK = ['procreate', 'ase', 'aco', 'gpl', 'svg', 'canva', 'jpg', 'png'];
let currentId = null;
let originEl = null;

function render(id) {
  const p = book.palettes[id];
  if (!p) return;
  currentId = id;
  const s = sectionOf(book, id);
  $('#v-tab').textContent = s?.name ?? '';
  $('#v-tab').style.setProperty('--c', s?.color ?? '#ccc');
  $('#v-name').textContent = p.name;
  $('#v-meta').textContent = `${typeLabel(p)} · ${p.colors.length} colors`;
  $('#v-colors').innerHTML = p.colors.map((c, i) => `<div class="v-stripe" style="--c:${c.hex};--fg:${readableText(c.hex)};--i:${i}">
      <span class="v-name">${esc(c.name)}</span>
      <button type="button" class="v-code" data-copy="${c.hex}">${c.hex}</button>
      <button type="button" class="v-code" data-copy="${rgbCss(c.hex)}">RGB ${rgbString(c.hex)}</button>
    </div>`).join('');
  const order = readingOrder();
  const i = order.indexOf(id);
  $('#v-prev').disabled = i <= 0;
  $('#v-next').disabled = i >= order.length - 1;
  $('#v-pos').textContent = `${i + 1} / ${order.length}`;
}

export function openViewer(id, fromEl) {
  originEl = fromEl || null;
  const v = $('#viewer');
  $('#v-fmt').innerHTML = QUICK.map((fid) => formatButton(FORMATS.find((f) => f.id === fid), 'fmt fmt-quick')).join('')
    + `<button type="button" class="fmt fmt-quick more" data-more="1"><span class="fmt-glyph">${ICONS.more}</span><span class="fmt-text"><span class="fmt-label">All formats</span><span class="fmt-apps">CSS, JSON, Sketch, Paint.NET…</span></span></button>`;
  render(id);
  v.hidden = false;
  document.body.classList.add('viewer-open');
  const card = $('#v-card');
  if (!reducedMotion()) {
    $('.viewer-backdrop', v).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
    if (originEl) {
      // FLIP: grow the card out of the palette that was tapped.
      const a = originEl.getBoundingClientRect(), b = card.getBoundingClientRect();
      card.animate([
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, borderRadius: '18px', opacity: 0.6 },
        { transform: 'none', opacity: 1 },
      ], { duration: 480, easing: 'cubic-bezier(.2,.9,.25,1.04)' });
      card.querySelector('.v-colors').animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 400 });
    } else {
      card.animate([{ transform: 'scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'ease-out' });
    }
  }
  $('#v-close').focus({ preventScroll: true });
}

export function closeViewer() {
  const v = $('#viewer');
  if (v.hidden) return;
  const id = currentId;
  const done = () => {
    v.hidden = true;
    document.body.classList.remove('viewer-open');
    revealInBook(id);
  };
  if (reducedMotion()) { done(); return; }
  $('.viewer-backdrop', v).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'both' });
  $('#v-card').animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.94) translateY(12px)', opacity: 0 }], { duration: 220, easing: 'ease-in' }).onfinish = done;
}

function step(delta) {
  const order = readingOrder();
  const i = order.indexOf(currentId) + delta;
  if (i < 0 || i >= order.length) return;
  const colors = $('#v-colors');
  if (!reducedMotion()) {
    colors.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-delta * 40}px)`, opacity: 0 }], { duration: 140, easing: 'ease-in' }).onfinish = () => {
      render(order[i]);
      colors.animate([{ transform: `translateX(${delta * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    };
  } else {
    render(order[i]);
  }
  haptic(5);
}

export function initViewer() {
  const v = $('#viewer');
  $('#v-close').addEventListener('click', closeViewer);
  $('.viewer-backdrop', v).addEventListener('click', closeViewer);
  $('#v-prev').addEventListener('click', () => step(-1));
  $('#v-next').addEventListener('click', () => step(1));
  document.addEventListener('keydown', (e) => {
    if (v.hidden || e.target.closest('dialog')) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });

  $('#v-colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copyText(b.dataset.copy);
  });
  $('#v-fmt').addEventListener('click', (e) => {
    const p = book.palettes[currentId];
    if (e.target.closest('[data-more]')) { openExportSheet(p, 'chip'); return; }
    const b = e.target.closest('[data-format]');
    if (b) runExport(p, b.dataset.format, 'chip');
  });
  $('#v-copy').addEventListener('click', (e) => copyAllMenu(e.currentTarget, book.palettes[currentId]));
  $('#v-more').addEventListener('click', (e) => cardMenu(e.currentTarget, currentId, { inViewer: true }));
  // Moving or renaming a palette from the menu changes what the header shows.
  on('book', () => { if (!v.hidden && book.palettes[currentId]) render(currentId); });
  $('#v-edit').addEventListener('click', () => { const id = currentId; closeViewer(); emit('edit-palette', id); });
  $('#v-delete').addEventListener('click', () => {
    const id = currentId;
    const order = readingOrder();
    const next = order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1];
    removeWithUndo(id);
    if (next) render(next); else closeViewer();
  });

  // Swipe between palettes.
  let sx = null, sy = 0;
  const area = $('#v-colors');
  area.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  area.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
}

/** Menu for copying a whole palette's codes. Shared with the studio. */
export function copyAllMenu(anchor, p) {
  showMenu(anchor, [
    { label: 'All HEX codes', icon: ICONS.copy, onSelect: () => copyText(p.colors.map((c) => c.hex).join('\n'), `${p.colors.length} HEX codes`) },
    { label: 'All RGB codes', icon: ICONS.copy, onSelect: () => copyText(p.colors.map((c) => rgbCss(c.hex)).join('\n'), `${p.colors.length} RGB codes`) },
    { label: 'Names + HEX + RGB', icon: ICONS.copy, onSelect: () => copyText(p.colors.map((c) => `${c.name}\t${c.hex}\t${rgbCss(c.hex)}`).join('\n'), 'the full list') },
  ], 'Copy codes');
}
