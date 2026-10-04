// The Swatch Book: a flipbook of pages with index tabs.
// Gestures on the page stage:
//   swipe sideways ........ turn the page (follows your finger)
//   tap a palette ......... open it full screen
//   press & hold / drag ... pick a palette up; drop it on another palette,
//                           on a tab, or hold it at the page edge to turn the page
import {
  paginate, movePalette, removePalette, addSection, renameSection, deleteSection, moveSection,
  autoSortByColor, getSection, sectionOf, TAB_COLORS, paletteCount,
} from './book.js';
import { book, persistBook, emit, on } from './store.js';
import { typeLabel } from './harmonies.js';
import { stripHtml } from './render.js';
import { $, $$, esc, ICONS, showMenu, ask, toast, haptic, reducedMotion } from './ui.js';
import { openViewer } from './viewer.js';
import { openExportSheet } from './exportsheet.js';

const view = { pages: [], index: 0, perPage: 6, busy: false, queued: null };
let stage, tabsEl;

/* ---------- layout ---------- */

function perPageFor(width) {
  if (width < 560) return 4;
  return 6;
}

function pageHtml(page, i) {
  const s = getSection(book, page.sectionId);
  const cards = page.ids.map((id) => {
    const p = book.palettes[id];
    return `<div class="bcard" data-pid="${id}" tabindex="0" role="button" aria-label="Open ${esc(p.name)}">
      ${stripHtml(p)}
      <span class="bcard-foot">
        <span class="bcard-name">${esc(p.name)}</span>
        <span class="bcard-meta">${p.colors.length} colors · ${esc(typeLabel(p))}</span>
      </span>
      <button type="button" class="bcard-more" data-action="card-menu" data-pid="${id}" aria-label="Options for ${esc(p.name)}">${ICONS.more}</button>
    </div>`;
  }).join('');
  const empty = `<div class="page-empty">
      <p><b>This tab is empty.</b></p>
      <p>Press &amp; hold a palette and drop it on the <span class="chip-inline" style="--c:${s.color}">${esc(s.name)}</span> tab, or use its ${ICONS.more} menu › Move to tab.</p>
    </div>`;
  return `<div class="page" data-page="${i}" style="--tab:${s.color}">
    <div class="face front">
      <header class="page-head">
        <span class="page-dot"></span>
        <h2 class="page-title">${esc(s.name)}</h2>
        <span class="page-count">${page.pagesInSection > 1 ? `${page.pageInSection + 1} / ${page.pagesInSection}` : ''}</span>
        <button type="button" class="icon-btn sm" data-action="tab-menu" data-sid="${s.id}" aria-label="Tab options for ${esc(s.name)}">${ICONS.more}</button>
      </header>
      <div class="page-grid" data-per="${view.perPage}">${cards || empty}</div>
      <footer class="page-foot">${i + 1}</footer>
    </div>
    <div class="face back" aria-hidden="true"></div>
  </div>`;
}

function renderTabs() {
  const current = view.pages[view.index]?.sectionId;
  tabsEl.innerHTML = book.sections.map((s) => `<button type="button" class="book-tab ${s.id === current ? 'is-on' : ''}" data-sid="${s.id}" style="--c:${s.color}" aria-current="${s.id === current}">
      <span>${esc(s.name)}</span><b>${s.ids.length}</b>
    </button>`).join('')
    + `<button type="button" class="book-tab add" id="tab-add-inline" aria-label="Add a tab">${ICONS.plus}</button>`;
}

function renderNav() {
  $('#page-info').textContent = view.pages.length ? `Page ${view.index + 1} of ${view.pages.length}` : '';
  $('#page-prev').disabled = view.index <= 0;
  $('#page-next').disabled = view.index >= view.pages.length - 1;
  $('#book-total').textContent = `${paletteCount(book)} palette${paletteCount(book) === 1 ? '' : 's'} · ${book.sections.length} tab${book.sections.length === 1 ? '' : 's'}`;
}

/** Rebuild pages; keep showing `focusId` (or the current page) where possible. */
export function renderBook(focusId) {
  if (!stage) return;
  view.perPage = perPageFor(stage.clientWidth || innerWidth);
  const keep = focusId || view.pages[view.index]?.ids[0];
  const keepSection = view.pages[view.index]?.sectionId;
  view.pages = paginate(book, view.perPage);
  let idx = keep ? view.pages.findIndex((p) => p.ids.includes(keep)) : -1;
  if (idx < 0 && keepSection) idx = view.pages.findIndex((p) => p.sectionId === keepSection);
  view.index = Math.max(0, Math.min(idx < 0 ? view.index : idx, view.pages.length - 1));
  stage.innerHTML = pageHtml(view.pages[view.index], view.index);
  stage.firstElementChild.classList.add('is-current');
  renderTabs();
  renderNav();
}

/* ---------- page turning ---------- */

const ease = (t) => 1 - (1 - t) ** 3;

function tween(from, to, ms, fn) {
  return new Promise((resolve) => {
    if (reducedMotion()) { fn(to); resolve(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Rotation of the turning page: 0 = flat, -180 = fully turned to the left. */
function setTurn(el, angle) {
  el.style.transform = `rotateY(${angle}deg)`;
  el.style.setProperty('--shade', (Math.sin((Math.abs(angle) / 180) * Math.PI) * 0.45).toFixed(3));
}

/**
 * Prepare a flip toward `target`. Returns a handle with set(progress 0..1),
 * plus finish() and cancel(). Next: the current page turns away.
 * Previous: the target page turns back in on top.
 */
function beginFlip(target) {
  const dir = Math.sign(target - view.index);
  const cur = stage.querySelector('.page.is-current');
  stage.insertAdjacentHTML(dir > 0 ? 'afterbegin' : 'beforeend', pageHtml(view.pages[target], target));
  const incoming = dir > 0 ? stage.firstElementChild : stage.lastElementChild;
  const turning = dir > 0 ? cur : incoming;
  turning.classList.add('is-turning');
  const angleAt = (p) => (dir > 0 ? -180 * p : -180 * (1 - p));
  setTurn(turning, angleAt(0));
  let progress = 0;
  stage.classList.add('flipping');
  return {
    dir,
    set(p) { progress = Math.max(0, Math.min(1, p)); setTurn(turning, angleAt(progress)); },
    async finish(ms = 520) {
      await tween(progress, 1, ms * (1 - progress) + 120, (p) => setTurn(turning, angleAt(p)));
      cur.remove();
      incoming.classList.remove('is-turning');
      incoming.style.transform = '';
      incoming.classList.add('is-current');
      stage.classList.remove('flipping');
      view.index = target;
      renderTabs();
      renderNav();
      haptic(6);
    },
    async cancel() {
      await tween(progress, 0, 260, (p) => setTurn(turning, angleAt(p)));
      incoming.remove();
      cur.classList.remove('is-turning');
      cur.style.transform = '';
      stage.classList.remove('flipping');
    },
  };
}

export async function flipTo(target) {
  if (view.busy) { view.queued = target; return; }
  if (target === view.index || target < 0 || target >= view.pages.length) return;
  view.busy = true;
  // Jumping several pages riffles through a couple in between, like a real book.
  const dir = Math.sign(target - view.index);
  const hops = Math.abs(target - view.index);
  const steps = hops > 1 && !reducedMotion() ? [view.index + dir * Math.ceil(hops / 2), target] : [target];
  for (const [k, t] of steps.entries()) {
    await beginFlip(t).finish(k < steps.length - 1 ? 260 : 520);
  }
  view.busy = false;
  if (view.queued != null) { const q = view.queued; view.queued = null; flipTo(q); }
}

function bump(dir) {
  // Nothing more that way: give a little elastic tug instead.
  const cur = stage.querySelector('.page.is-current');
  cur.animate([{ transform: 'rotateY(0)' }, { transform: `rotateY(${dir > 0 ? -12 : 6}deg)` }, { transform: 'rotateY(0)' }], { duration: 380, easing: 'ease-out' });
}

export const nextPage = () => (view.index < view.pages.length - 1 ? flipTo(view.index + 1) : bump(1));
export const prevPage = () => (view.index > 0 ? flipTo(view.index - 1) : bump(-1));

/* ---------- gestures: swipe, tap, press-and-hold drag ---------- */

let g = null; // the active gesture

function onDown(e) {
  if (view.busy || e.button > 0 || e.target.closest('button')) return;
  const card = e.target.closest('.bcard');
  g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), card, mode: 'pending', type: e.pointerType };
  if (card && e.pointerType !== 'mouse') g.timer = setTimeout(() => g?.mode === 'pending' && startDrag(e), 330);
}

function onMove(e) {
  if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
  const dist = Math.hypot(dx, dy);
  if (g.mode === 'pending') {
    if (g.card && g.type === 'mouse' && dist > 6) { startDrag(e); return; }
    if (dist > 10) {
      clearTimeout(g.timer);
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        const target = view.index + (dx < 0 ? 1 : -1);
        if (target < 0 || target >= view.pages.length) { g.mode = 'none'; bump(dx < 0 ? 1 : -1); return; }
        g.mode = 'flip';
        g.flip = beginFlip(target);
        stage.setPointerCapture(e.pointerId);
      } else {
        g.mode = 'none'; // vertical: let the page scroll
      }
    }
  }
  if (g.mode === 'flip') {
    const w = stage.clientWidth;
    g.flip.set(g.flip.dir > 0 ? -dx / w : dx / w);
    g.lastX = e.clientX; g.lastT = performance.now();
  }
  if (g.mode === 'drag') moveDrag(e);
}

async function onUp(e) {
  if (!g || e.pointerId !== g.id) return;
  clearTimeout(g.timer);
  const gesture = g;
  g = null;
  if (gesture.mode === 'pending' && gesture.card && e.type === 'pointerup') {
    openViewer(gesture.card.dataset.pid, gesture.card);
  } else if (gesture.mode === 'flip') {
    view.busy = true;
    const dx = e.clientX - gesture.x0;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - gesture.t0);
    const progress = Math.abs(dx) / stage.clientWidth;
    if (e.type === 'pointerup' && (progress > 0.3 || speed > 0.6)) await gesture.flip.finish();
    else await gesture.flip.cancel();
    view.busy = false;
  } else if (gesture.mode === 'drag') {
    endDrag(e.type === 'pointerup');
  }
}

/* drag & drop */

let drag = null;

function startDrag(e) {
  const card = g.card;
  g.mode = 'drag';
  haptic(15);
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add('bcard-ghost');
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  document.body.appendChild(ghost);
  card.classList.add('is-placeholder');
  drag = { id: card.dataset.pid, ghost, offX: g.x0 - r.left, offY: g.y0 - r.top, dwell: null, target: null };
  document.body.classList.add('is-dragging');
  moveDrag(e);
}

function clearDropMarks() {
  $$('.drop-before, .drop-after, .drop-tab, .edge-hot').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-tab', 'edge-hot'));
}

function dwell(key, ms, fn) {
  if (drag.dwell?.key === key) return;
  clearTimeout(drag.dwell?.timer);
  drag.dwell = key ? { key, timer: setTimeout(() => { drag.dwell = null; fn(); }, ms) } : null;
}

function moveDrag(e) {
  const { ghost } = drag;
  ghost.style.left = `${e.clientX - drag.offX}px`;
  ghost.style.top = `${e.clientY - drag.offY}px`;
  clearDropMarks();
  drag.target = null;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const tab = under?.closest('.book-tab[data-sid]');
  const sr = stage.getBoundingClientRect();

  if (tab) {
    tab.classList.add('drop-tab');
    drag.target = { sectionId: tab.dataset.sid };
    // Hover on a tab to open that section and place it precisely.
    dwell(`tab:${tab.dataset.sid}`, 650, () => {
      const first = view.pages.findIndex((p) => p.sectionId === tab.dataset.sid);
      if (first >= 0 && view.pages[view.index].sectionId !== tab.dataset.sid) flipTo(first);
    });
    return;
  }
  const inStage = e.clientX > sr.left && e.clientX < sr.right && e.clientY > sr.top && e.clientY < sr.bottom;
  if (inStage && (e.clientX < sr.left + 40 || e.clientX > sr.right - 40)) {
    const dir = e.clientX < sr.left + 40 ? -1 : 1;
    stage.classList.add('edge-hot');
    dwell(`edge:${dir}`, 600, () => { (dir > 0 ? nextPage : prevPage)(); drag && (drag.dwell = null); });
  } else {
    dwell(null);
  }
  if (!inStage || view.busy) return;

  const page = view.pages[view.index];
  const cards = $$('.page.is-current .bcard:not(.is-placeholder)', stage);
  let local = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const sameRow = e.clientY >= r.top && e.clientY <= r.bottom;
    if ((sameRow && e.clientX < r.left + r.width / 2) || e.clientY < r.top) {
      local = i;
      cards[i].classList.add('drop-before');
      break;
    }
  }
  if (local === cards.length && cards.length) cards[cards.length - 1].classList.add('drop-after');
  // Convert the slot on this page into an index within the section (excluding the dragged card).
  const section = getSection(book, page.sectionId);
  const beforeIds = section.ids.slice(0, page.offset).filter((id) => id !== drag.id);
  drag.target = { sectionId: page.sectionId, index: beforeIds.length + local };
}

function endDrag(commit) {
  const d = drag;
  drag = null;
  clearTimeout(d.dwell?.timer);
  clearDropMarks();
  document.body.classList.remove('is-dragging');
  if (commit && d.target) {
    const from = sectionOf(book, d.id);
    // movePalette expects an index in the list *with* the item still in it.
    const to = getSection(book, d.target.sectionId);
    let index = d.target.index;
    if (index != null && from === to && from.ids.indexOf(d.id) < index + 1) index += 1;
    movePalette(book, d.id, d.target.sectionId, index);
    persistBook();
    if (from !== to) toast(`Moved to ${to.name}`);
    haptic(10);
    d.ghost.remove();
    renderBook(d.id);
    stage.querySelector(`[data-pid="${d.id}"]`)?.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  } else {
    d.ghost.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 180 }).onfinish = () => d.ghost.remove();
    $$('.is-placeholder').forEach((c) => c.classList.remove('is-placeholder'));
  }
}

/* ---------- menus ---------- */

function moveMenu(anchor, id) {
  const here = sectionOf(book, id);
  showMenu(anchor, book.sections.map((s) => ({
    label: s.id === here.id ? `${s.name} (here)` : s.name,
    icon: `<span class="tab-swatch" style="--c:${s.color}"></span>`,
    disabled: s.id === here.id,
    onSelect: () => { movePalette(book, id, s.id, 0); persistBook(); renderBook(id); toast(`Moved to ${s.name}`); },
  })), 'Move to tab');
}

function cardMenu(anchor, id) {
  const s = sectionOf(book, id);
  const i = s.ids.indexOf(id);
  const p = book.palettes[id];
  showMenu(anchor, [
    { label: 'Open', icon: ICONS.sparkle, onSelect: () => openViewer(id, anchor.closest('.bcard')) },
    { label: 'Export…', icon: ICONS.download, onSelect: () => openExportSheet(p, 'chip') },
    { label: 'Edit in studio', icon: ICONS.pencil, onSelect: () => emit('edit-palette', id) },
    '-',
    { label: 'Move to tab…', icon: ICONS.tag, onSelect: () => moveMenu(anchor, id) },
    { label: 'Move earlier', icon: ICONS.up, disabled: i === 0, onSelect: () => { movePalette(book, id, s.id, i - 1); persistBook(); renderBook(id); } },
    { label: 'Move later', icon: ICONS.down, disabled: i === s.ids.length - 1, onSelect: () => { movePalette(book, id, s.id, i + 2); persistBook(); renderBook(id); } },
    '-',
    { label: 'Remove from book', icon: ICONS.trash, danger: true, onSelect: () => removeWithUndo(id) },
  ], p.name);
}

export function removeWithUndo(id) {
  const s = sectionOf(book, id);
  const index = s.ids.indexOf(id);
  const p = book.palettes[id];
  removePalette(book, id);
  persistBook();
  renderBook();
  toast(`Removed “${p.name}”`, {
    action: 'Undo',
    onAction: () => {
      book.palettes[id] = p;
      (getSection(book, s.id) || book.sections[0]).ids.splice(index, 0, id);
      persistBook();
      renderBook(id);
    },
  });
}

async function newTab() {
  const res = await ask({ title: 'New tab', message: 'Organize by color, season, project — anything you like.', input: '', confirm: 'Add tab', colors: TAB_COLORS });
  if (!res) return;
  const s = addSection(book, res.value || 'New Tab', res.color);
  persistBook();
  renderBook();
  const first = view.pages.findIndex((p) => p.sectionId === s.id);
  flipTo(first);
}

function tabMenu(anchor, sid) {
  const s = getSection(book, sid);
  const i = book.sections.indexOf(s);
  showMenu(anchor, [
    {
      label: 'Rename / recolor', icon: ICONS.pencil,
      onSelect: async () => {
        const res = await ask({ title: 'Edit tab', input: s.name, confirm: 'Save', colors: [s.color, ...TAB_COLORS.filter((c) => c !== s.color)] });
        if (res) { renameSection(book, sid, res.value, res.color); persistBook(); renderBook(); }
      },
    },
    { label: 'Move tab up', icon: ICONS.up, disabled: i === 0, onSelect: () => { moveSection(book, sid, -1); persistBook(); renderBook(); } },
    { label: 'Move tab down', icon: ICONS.down, disabled: i === book.sections.length - 1, onSelect: () => { moveSection(book, sid, 1); persistBook(); renderBook(); } },
    '-',
    {
      label: 'Delete tab', icon: ICONS.trash, danger: true, disabled: book.sections.length <= 1,
      onSelect: async () => {
        const res = await ask({ title: `Delete “${s.name}”?`, message: s.ids.length ? `Its ${s.ids.length} palette${s.ids.length === 1 ? '' : 's'} will move to “${book.sections.find((x) => x !== s).name}”.` : '', confirm: 'Delete tab', danger: true });
        if (res) { deleteSection(book, sid); persistBook(); renderBook(); }
      },
    },
  ], s.name);
}

/* ---------- setup ---------- */

export function showBook() {
  renderBook();
  const bookEl = $('#book');
  if (!reducedMotion()) bookEl.animate([{ transform: 'translateY(16px) scale(.98)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
}

/** Jump to (and briefly highlight) a palette, e.g. after the viewer closes. */
export function revealInBook(id) {
  const target = view.pages.findIndex((p) => p.ids.includes(id));
  if (target >= 0 && target !== view.index) {
    view.index = target;
    renderBook(id);
  }
}

export function initBook() {
  stage = $('#book-stage');
  tabsEl = $('#book-tabs');

  stage.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  // While dragging a palette on touch screens, stop the page from scrolling.
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { endDrag(false); g = null; }
    if ($('#view-book').hidden || e.target.closest('input, textarea, dialog, .viewer:not([hidden])')) return;
    if (e.key === 'ArrowRight') nextPage();
    if (e.key === 'ArrowLeft') prevPage();
  });
  stage.addEventListener('contextmenu', (e) => { if (e.target.closest('.bcard')) e.preventDefault(); });

  stage.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'card-menu') cardMenu(b, b.dataset.pid);
    if (b.dataset.action === 'tab-menu') tabMenu(b, b.dataset.sid);
  });
  stage.addEventListener('keydown', (e) => {
    const card = e.target.closest('.bcard');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openViewer(card.dataset.pid, card); }
  });

  tabsEl.addEventListener('click', (e) => {
    if (e.target.closest('#tab-add-inline')) { newTab(); return; }
    const t = e.target.closest('.book-tab[data-sid]');
    if (!t || drag) return;
    const first = view.pages.findIndex((p) => p.sectionId === t.dataset.sid);
    flipTo(first);
  });

  $('#page-prev').addEventListener('click', prevPage);
  $('#page-next').addEventListener('click', nextPage);
  $('#tab-add').addEventListener('click', newTab);
  $('#tab-auto').addEventListener('click', async () => {
    const res = await ask({ title: 'Sort by main color?', message: 'This replaces your tabs with one tab per color family (Blues, Pinks, Greens…). Your palettes are kept.', confirm: 'Sort my book' });
    if (!res) return;
    autoSortByColor(book);
    persistBook();
    view.index = 0;
    renderBook();
    toast('Sorted into color tabs ✨');
  });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('#view-book').hidden && perPageFor(stage.clientWidth) !== view.perPage) renderBook(); }, 150);
  });
  on('book', () => { if (!$('#view-book').hidden && !drag && !view.busy) renderBook(); });
}

/** All palette ids in reading order — the viewer swipes through these. */
export const readingOrder = () => book.sections.flatMap((s) => s.ids);
