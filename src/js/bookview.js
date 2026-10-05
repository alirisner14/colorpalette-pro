// The Swatch Book (a flipbook of SVG pages with a cover and index tabs) and the
// Swatch Deck (a fan of blades), plus the tab bar and toolbar they share.
// Gestures on the book's page stage:
//   swipe sideways ........ turn the page (follows your finger)
//   tap a palette ......... open it full screen
//   tap the cover ......... open the book
//   press & hold / drag ... pick a palette up; drop it on another palette,
//                           on a tab, or hold it at the page edge to turn the page
import {
  movePalette, removePalette, addSection, renameSection, deleteSection, moveSection,
  autoSortByColor, getSection, sectionOf, TAB_COLORS, paletteCount,
} from './book.js';
import { book, persistBook, emit, on, getBookOpts, setBookOpts, prefs, persistPrefs } from './store.js';
import { planPages, pageScene, bookPageSize } from './bookpages.js';
import { toSvg } from './scene.js';
import { coverImage } from './cover.js';
import { paletteMoreItems } from './palettemenu.js';
import {
  initDeck, renderDeck, deckGo, deckInfo, deckSectionId, deckJumpToSection, deckFocusPalette, deckFocusId,
} from './deckview.js';
import { $, $$, esc, ICONS, showMenu, ask, toast, haptic, reducedMotion } from './ui.js';
import { openViewer } from './viewer.js';
import { openExportSheet } from './exportsheet.js';

const view = { pages: [], index: 0, busy: false, queued: null, svg: new Map() };
let stage;
let tabsEl;
let area;
let bodyEl;
let deckEl;

const layout = () => getBookOpts().layout;
export const currentLayout = layout;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const visible = () => !$('#view-book').hidden;

/* ---------- pages ---------- */

/** The SVG for a page, drawn once and remembered for a while. */
function sceneSvg(i) {
  const hit = view.svg.get(i);
  if (hit) return hit;
  const d = view.pages[i];
  const scene = pageScene(d, { book, opts: getBookOpts(), coverImage: coverImage('book') });
  const svg = toSvg(scene, d.kind === 'cover'
    ? { units: 'none', title: 'Cover', idPrefix: `pg${i}-` }
    : { units: 'none', title: `Page ${d.no}`, interactive: true, idPrefix: `pg${i}-` });
  view.svg.set(i, svg);
  if (view.svg.size > 14) view.svg.delete(view.svg.keys().next().value);
  return svg;
}

function pageHtml(i) {
  const d = view.pages[i];
  const s = d.sectionId ? getSection(book, d.sectionId) : null;
  const menu = s ? `<button type="button" class="icon-btn sm page-more" data-action="tab-menu" data-sid="${s.id}" aria-label="Tab options for ${esc(s.name)}">${ICONS.more}</button>` : '';
  return `<div class="page ${d.kind === 'cover' ? 'is-cover' : ''}" data-page="${i}" style="--tab:${s?.color ?? '#ccc'}">
    <div class="face front"><div class="pg">${sceneSvg(i)}</div>${menu}</div>
    <div class="face back" aria-hidden="true"></div>
  </div>`;
}

function currentSectionId() {
  return layout() === 'deck' ? deckSectionId() : view.pages[view.index]?.sectionId ?? null;
}

function renderTabs() {
  const current = currentSectionId();
  tabsEl.innerHTML = book.sections.map((s) => `<button type="button" class="book-tab ${s.id === current ? 'is-on' : ''}" data-sid="${s.id}" style="--c:${s.color}" aria-current="${s.id === current}">
      <span>${esc(s.name)}</span><b>${s.ids.length}</b>
    </button>`).join('')
    + `<button type="button" class="book-tab add" id="tab-add-inline" aria-label="Add a tab">${ICONS.plus}</button>`;
}

function renderNav() {
  let label = '';
  let prev = false;
  let next = false;
  if (layout() === 'deck') {
    const info = deckInfo();
    label = info.label;
    prev = info.index > 0;
    next = info.index < info.count - 1;
  } else if (view.pages.length) {
    const d = view.pages[view.index];
    const total = view.pages.filter((p) => p.kind !== 'cover').length;
    label = d.kind === 'cover' ? 'Cover · tap to open' : `Page ${d.no} of ${total}`;
    prev = view.index > 0;
    next = view.index < view.pages.length - 1;
  }
  $('#page-info').textContent = label;
  $('#page-prev').disabled = !prev;
  $('#page-next').disabled = !next;
  const n = paletteCount(book);
  $('#book-total').textContent = `${n} palette${n === 1 ? '' : 's'} · ${book.sections.length} tab${book.sections.length === 1 ? '' : 's'}`;
}

const HINTS = {
  book: 'Swipe or use ← → to flip · Tap a palette to open · Press & hold to move it',
  deck: 'Swipe or use ← → to fan through the blades · Tap a palette to open it · Use its ⋯ menu to move it',
};

/** Show the right container and toolbar state for the chosen layout. */
function syncLayoutUi() {
  const opts = getBookOpts();
  area.dataset.layout = opts.layout;
  area.dataset.orient = opts.layout === 'book' ? opts.book.orient : 'portrait';
  $('#book').hidden = opts.layout !== 'book';
  deckEl.hidden = opts.layout !== 'deck';
  $$('#layout-seg [data-layout]').forEach((b) => {
    const isOn = b.dataset.layout === opts.layout;
    b.classList.toggle('is-on', isOn);
    b.setAttribute('aria-checked', String(isOn));
  });
  $('#book-title').textContent = opts.layout === 'book' ? 'My Swatch Book' : 'My Swatch Deck';
  $('#book-hint').textContent = HINTS[opts.layout];
}

/** Rebuild the view; keep showing `focusId` (or the current page or blade) where possible. */
export function renderBook(focusId) {
  if (!stage) return;
  syncLayoutUi();
  const opts = getBookOpts();
  if (opts.layout === 'deck') {
    renderDeck(focusId);
    renderTabs();
    renderNav();
    return;
  }
  const size = bookPageSize(opts.book.orient);
  stage.style.setProperty('--ar', `${size.w} / ${size.h}`);
  stage.style.setProperty('--ar-num', String(size.w / size.h));
  bodyEl.style.setProperty('--cover', opts.covers.book.color);
  stage.style.setProperty('--cover-solid', opts.covers.book.color);

  const prev = view.pages[view.index];
  const keep = focusId || prev?.ids?.[0];
  const kind = !focusId && prev?.kind === 'art' ? 'art' : 'tab';
  view.pages = planPages(book, opts);
  view.svg.clear();
  let idx = keep ? view.pages.findIndex((p) => p.kind === kind && p.ids.includes(keep)) : -1;
  if (idx < 0 && prev?.kind === 'cover' && view.pages[0]?.kind === 'cover' && !focusId) idx = 0;
  if (idx < 0 && prev?.sectionId) idx = view.pages.findIndex((p) => p.sectionId === prev.sectionId);
  view.index = clamp(idx < 0 ? view.index : idx, 0, view.pages.length - 1);
  stage.innerHTML = pageHtml(view.index);
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
  stage.insertAdjacentHTML(dir > 0 ? 'afterbegin' : 'beforeend', pageHtml(target));
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
  cur?.animate([{ transform: 'rotateY(0)' }, { transform: `rotateY(${dir > 0 ? -12 : 6}deg)` }, { transform: 'rotateY(0)' }], { duration: 380, easing: 'ease-out' });
}

export const nextPage = () => {
  if (layout() === 'deck') { deckGo(1); return; }
  if (view.index < view.pages.length - 1) flipTo(view.index + 1); else bump(1);
};
export const prevPage = () => {
  if (layout() === 'deck') { deckGo(-1); return; }
  if (view.index > 0) flipTo(view.index - 1); else bump(-1);
};

/** Go to the first page (or blade) of a tab. */
function jumpToSection(sid) {
  if (layout() === 'deck') { deckJumpToSection(sid); return; }
  const first = view.pages.findIndex((p) => p.kind === 'tab' && p.sectionId === sid);
  if (first >= 0) flipTo(first);
}

/* ---------- gestures: swipe, tap, press-and-hold drag ---------- */

let g = null; // the active gesture

function onDown(e) {
  if (view.busy || e.button > 0 || e.target.closest('button, .pb-more')) return;
  const card = e.target.closest('.pb[data-pid]');
  g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY, t0: performance.now(), card, mode: 'pending', type: e.pointerType };
  if (card && !card.classList.contains('art') && e.pointerType !== 'mouse') g.timer = setTimeout(() => g?.mode === 'pending' && startDrag(), 330);
}

function onMove(e) {
  if (!g || e.pointerId !== g.id) return;
  g.lastX = e.clientX;
  g.lastY = e.clientY;
  const dx = e.clientX - g.x0;
  const dy = e.clientY - g.y0;
  const dist = Math.hypot(dx, dy);
  if (g.mode === 'pending') {
    const draggable = g.card && !g.card.classList.contains('art');
    if (draggable && g.type === 'mouse' && dist > 6) { startDrag(); return; }
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
  }
  if (g.mode === 'drag') moveDrag(e.clientX, e.clientY);
}

async function onUp(e) {
  if (!g || e.pointerId !== g.id) return;
  clearTimeout(g.timer);
  const gesture = g;
  g = null;
  if (gesture.mode === 'pending' && e.type === 'pointerup') {
    if (gesture.card?.classList.contains('art')) openArt(gesture.card.dataset.pid);
    else if (gesture.card) openViewer(gesture.card.dataset.pid, gesture.card);
    else if (e.target.closest?.('.page.is-cover')) nextPage();
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

async function openArt(pid) {
  const p = book.palettes[pid];
  if (p) (await import('./contextui.js')).openContext(p);
}

/* drag & drop */

let drag = null;
const NS = 'http://www.w3.org/2000/svg';

/** A floating copy of a card: its SVG group in a little SVG of its own. */
function makeGhost(card, r) {
  const bb = card.getBBox();
  const ghost = document.createElement('div');
  ghost.className = 'pb-ghost';
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
  const copy = card.cloneNode(true);
  copy.removeAttribute('data-pid');
  copy.classList.remove('is-placeholder');
  svg.appendChild(copy);
  ghost.appendChild(svg);
  document.body.appendChild(ghost);
  return ghost;
}

function startDrag() {
  const card = g.card;
  g.mode = 'drag';
  haptic(15);
  const r = card.getBoundingClientRect();
  const ghost = makeGhost(card, r);
  card.classList.add('is-placeholder');
  drag = { id: card.dataset.pid, ghost, offX: g.x0 - r.left, offY: g.y0 - r.top, dwell: null, target: null };
  document.body.classList.add('is-dragging');
  moveDrag(g.lastX, g.lastY);
}

function dropBar(rect, side) {
  let bar = $('.drop-bar', bodyEl);
  if (!rect) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'drop-bar';
    bodyEl.appendChild(bar);
  }
  const br = bodyEl.getBoundingClientRect();
  bar.style.left = `${(side === 'after' ? rect.right : rect.left) - br.left - 2.5}px`;
  bar.style.top = `${rect.top - br.top}px`;
  bar.style.height = `${rect.height}px`;
}

function clearDropMarks() {
  $$('.drop-tab, .edge-hot').forEach((el) => el.classList.remove('drop-tab', 'edge-hot'));
  dropBar(null);
}

function dwell(key, ms, fn) {
  if (drag.dwell?.key === key) return;
  clearTimeout(drag.dwell?.timer);
  drag.dwell = key ? { key, timer: setTimeout(() => { drag.dwell = null; fn(); }, ms) } : null;
}

function moveDrag(x, y) {
  const { ghost } = drag;
  ghost.style.left = `${x - drag.offX}px`;
  ghost.style.top = `${y - drag.offY}px`;
  clearDropMarks();
  drag.target = null;
  const under = document.elementFromPoint(x, y);
  const tab = under?.closest('.book-tab[data-sid]');
  const sr = stage.getBoundingClientRect();

  if (tab) {
    tab.classList.add('drop-tab');
    drag.target = { sectionId: tab.dataset.sid };
    // Hover on a tab to open that section and place it precisely.
    dwell(`tab:${tab.dataset.sid}`, 650, () => {
      const first = view.pages.findIndex((p) => p.kind === 'tab' && p.sectionId === tab.dataset.sid);
      if (first >= 0 && view.pages[view.index].sectionId !== tab.dataset.sid) flipTo(first);
    });
    return;
  }
  const inStage = x > sr.left && x < sr.right && y > sr.top && y < sr.bottom;
  if (inStage && (x < sr.left + 40 || x > sr.right - 40)) {
    const dir = x < sr.left + 40 ? -1 : 1;
    stage.classList.add('edge-hot');
    dwell(`edge:${dir}`, 600, () => { (dir > 0 ? nextPage : prevPage)(); if (drag) drag.dwell = null; });
  } else {
    dwell(null);
  }
  const page = view.pages[view.index];
  if (!inStage || view.busy || page.kind !== 'tab') return;

  const cards = $$('.page.is-current .pb[data-pid]:not(.is-placeholder):not(.art)', stage);
  let local = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const sameRow = y >= r.top && y <= r.bottom;
    if ((sameRow && x < r.left + r.width / 2) || y < r.top) { local = i; break; }
  }
  if (cards.length) {
    if (local < cards.length) dropBar(cards[local].getBoundingClientRect(), 'before');
    else dropBar(cards[cards.length - 1].getBoundingClientRect(), 'after');
  }
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

/** The menu for one palette in the book or deck (also used by the full-screen viewer). */
export function cardMenu(anchor, id, { inViewer = false } = {}) {
  const s = sectionOf(book, id);
  if (!s) return;
  const i = s.ids.indexOf(id);
  const p = book.palettes[id];
  const cardEl = () => $(`.pb[data-pid="${id}"]:not(.art)`) ?? anchor;
  const items = [
    ...(inViewer ? [] : [
      { label: 'Open', icon: ICONS.sparkle, onSelect: () => openViewer(id, cardEl()) },
      { label: 'Export…', icon: ICONS.download, onSelect: () => openExportSheet(p, 'chip') },
      { label: 'Edit in studio', icon: ICONS.pencil, onSelect: () => emit('edit-palette', id) },
    ]),
    ...paletteMoreItems(p),
    '-',
    { label: 'Move to tab…', icon: ICONS.tag, onSelect: () => moveMenu(anchor, id) },
    { label: 'Move earlier', icon: ICONS.up, disabled: i === 0, onSelect: () => { movePalette(book, id, s.id, i - 1); persistBook(); renderBook(id); } },
    { label: 'Move later', icon: ICONS.down, disabled: i === s.ids.length - 1, onSelect: () => { movePalette(book, id, s.id, i + 2); persistBook(); renderBook(id); } },
    '-',
    ...(inViewer ? [] : [{ label: 'Remove from book', icon: ICONS.trash, danger: true, onSelect: () => removeWithUndo(id) }]),
  ];
  while (items[items.length - 1] === '-') items.pop();
  showMenu(anchor, items, p.name);
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
  jumpToSection(s.id);
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

async function sortByColor() {
  const res = await ask({ title: 'Sort by main color?', message: 'This replaces your tabs with one tab per color family (Blues, Pinks, Greens…). Your palettes are kept.', confirm: 'Sort my book' });
  if (!res) return;
  autoSortByColor(book);
  persistBook();
  view.index = 0;
  renderBook();
  toast('Sorted into color tabs ✨');
}

function moreMenu(anchor) {
  showMenu(anchor, [
    { label: 'Sort by main color…', icon: ICONS.tag, onSelect: sortByColor },
    { label: 'Import palette files…', icon: ICONS.upload, onSelect: async () => (await import('./importui.js')).openImport({ sectionId: currentSectionId() ?? book.sections[0].id }) },
    { label: 'Print & cut…', icon: ICONS.print, onSelect: async () => (await import('./printui.js')).openPrint({ format: layout() }) },
    '-',
    { label: 'Back up my swatch book…', icon: ICONS.save, onSelect: async () => (await import('./backupui.js')).openBackup() },
    { label: 'Restore from a backup…', icon: ICONS.upload, onSelect: async () => (await import('./backupui.js')).restoreFlow() },
  ], layout() === 'deck' ? 'Swatch deck' : 'Swatch book');
}

export async function openCustomize() {
  (await import('./customizeui.js')).openCustomize();
}

/** Switch between the flipbook and the fan deck. */
export function setLayout(next) {
  if (next === layout()) return;
  const focus = layout() === 'deck' ? deckFocusId() : view.pages[view.index]?.ids?.[0];
  setBookOpts({ ...getBookOpts(), layout: next }, { silent: true });
  renderBook(focus);
  haptic(8);
}

/* ---------- a gentle reminder to back up ---------- */

let nudged = false;
function maybeNudge() {
  if (nudged) return;
  nudged = true;
  const DAY = 864e5;
  const last = prefs.lastBackup ? Date.parse(prefs.lastBackup) : 0;
  const snooze = prefs.backupSnooze ? Date.parse(prefs.backupSnooze) : 0;
  if (paletteCount(book) < 3 || Date.now() - last < 30 * DAY || Date.now() < snooze) return;
  persistPrefs({ backupSnooze: new Date(Date.now() + 14 * DAY).toISOString() });
  setTimeout(() => toast(last ? 'It has been a while since your last backup.' : 'Tip: back up your swatch book so it stays safe.', {
    action: 'Back up', onAction: async () => (await import('./backupui.js')).openBackup(),
  }), 900);
}

/* ---------- setup ---------- */

export function showBook() {
  renderBook();
  if (!reducedMotion()) area.animate([{ transform: 'translateY(16px) scale(.98)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  maybeNudge();
}

/** Jump to (and briefly highlight) a palette, e.g. after the viewer closes. */
export function revealInBook(id) {
  if (layout() === 'deck') { deckFocusPalette(id); return; }
  const target = view.pages.findIndex((p) => p.kind === 'tab' && p.ids.includes(id));
  if (target >= 0 && target !== view.index) {
    view.index = target;
    renderBook(id);
  }
}

export function initBook() {
  stage = $('#book-stage');
  tabsEl = $('#book-tabs');
  area = $('#book-area');
  bodyEl = $('#book-body');
  deckEl = $('#deck');

  initDeck({
    stage: $('#deck-stage'),
    scrub: $('#deck-scrub'),
    callbacks: {
      onChange: () => { if (visible()) { renderTabs(); renderNav(); } },
      onOpen: (pid, el) => openViewer(pid, el),
      onMenu: (anchor, pid) => cardMenu(anchor, pid),
    },
  });

  stage.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  // While dragging a palette on touch screens, stop the page from scrolling.
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { endDrag(false); g = null; }
    if (!visible() || e.target.closest('input, textarea, select, dialog, .viewer:not([hidden])')) return;
    if (e.key === 'ArrowRight') nextPage();
    if (e.key === 'ArrowLeft') prevPage();
  });
  // Right-click (or the touch screen's long-press menu) on a palette opens its menu.
  const contextOpen = (e) => {
    const card = e.target.closest('.pb[data-pid]:not(.art)');
    if (!card) return;
    e.preventDefault();
    if (!drag) cardMenu(card.querySelector('.pb-more') ?? card, card.dataset.pid);
  };
  stage.addEventListener('contextmenu', contextOpen);
  $('#deck-stage').addEventListener('contextmenu', contextOpen);

  stage.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'card-menu') cardMenu(b, b.dataset.pid);
    if (b.dataset.action === 'tab-menu') tabMenu(b, b.dataset.sid);
  });
  stage.addEventListener('keydown', (e) => {
    const card = e.target.closest('.pb[data-pid]');
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (e.target.closest('.pb-more')) cardMenu(e.target.closest('.pb-more'), card.dataset.pid);
    else if (card.classList.contains('art')) openArt(card.dataset.pid);
    else openViewer(card.dataset.pid, card);
  });

  tabsEl.addEventListener('click', (e) => {
    if (e.target.closest('#tab-add-inline')) { newTab(); return; }
    const t = e.target.closest('.book-tab[data-sid]');
    if (!t || drag) return;
    jumpToSection(t.dataset.sid);
  });

  $('#page-prev').addEventListener('click', prevPage);
  $('#page-next').addEventListener('click', nextPage);
  $('#tab-add').addEventListener('click', newTab);
  $('#layout-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layout]');
    if (b) setLayout(b.dataset.layout);
  });
  $('#book-customize').addEventListener('click', openCustomize);
  $('#book-more').addEventListener('click', (e) => moreMenu(e.currentTarget));

  // Drop palette files anywhere on the swatch book to import them.
  const section = $('#view-book');
  section.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  section.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    (await import('./importui.js')).openImport({ files, sectionId: currentSectionId() ?? book.sections[0].id });
  });

  on('book', () => { if (visible() && !drag && !view.busy) renderBook(); });
  on('bookopts', () => { if (visible()) renderBook(); });
}

/** All palette ids in reading order — the viewer swipes through these. */
export const readingOrder = () => book.sections.flatMap((s) => s.ids);
