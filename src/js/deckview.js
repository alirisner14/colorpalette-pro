// The Swatch Deck: blades that hang from a ring and fan out as you swipe.
// Each blade is an SVG scene (bookpages.js); this file positions, rotates and
// animates them. Swipe to fan through, tap a side blade to bring it forward,
// tap a palette to open it. With a cover, the deck starts closed.
import { toSvg } from './scene.js';
import { planBlades, bladeScene, bladeSize, bladePivot } from './bookpages.js';
import { coverImage } from './cover.js';
import { book, getBookOpts } from './store.js';
import { getSection } from './book.js';
import { reducedMotion, haptic } from './ui.js';

/** How far (degrees) the blade n places away from the front is swung, for n = 0..5. */
const ANGLES = [0, 13, 22, 29, 34, 38];
const TOP = 18; // px of room above the blades (matches .blade { top } in book.css)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const D = { descs: [], index: 0, pos: 0, els: [], built: new Set(), f: null };
let stage;
let scrub;
let cb = {};

/* ---------- sizes ---------- */

function fit(opts) {
  const { w: W, h: H } = bladeSize(opts.deck.perBlade);
  const stageW = stage.clientWidth || Math.max(280, innerWidth - 40);
  let bh = clamp(innerHeight * 0.66, 400, 640);
  let u = bh / H;
  let bw = u * W;
  if (bw > stageW * 0.9) { bw = stageW * 0.9; u = bw / W; bh = u * H; }
  const pivot = bladePivot(opts.deck.perBlade).y * u;
  const vis = stageW < 520 ? 2 : stageW < 820 ? 3 : 5;
  const A = ANGLES[Math.min(vis, ANGLES.length - 1)];
  let spread = 1;
  for (; spread > 0.3; spread -= 0.05) {
    // the swung blade's far corner must stay on the stage
    const a = (A * spread * Math.PI) / 180;
    if ((bh - pivot) * Math.sin(a) + (bw / 2) * Math.cos(a) <= stageW / 2 - 8) break;
  }
  return { u, bw, bh, pivot, vis, spread: Math.max(0.3, spread), stageW, radius: u * Math.min(4, W * 0.08) };
}

function applySizes() {
  const f = fit(getBookOpts());
  D.f = f;
  stage.style.height = `${Math.round(f.bh + TOP + 34)}px`;
  stage.style.setProperty('--bw', `${f.bw.toFixed(1)}px`);
  stage.style.setProperty('--bh', `${f.bh.toFixed(1)}px`);
  stage.style.setProperty('--u', `${f.u.toFixed(3)}px`);
  stage.style.setProperty('--pivot', `${f.pivot.toFixed(1)}px`);
  stage.style.setProperty('--br', `${f.radius.toFixed(1)}px`);
}

/* ---------- the blades ---------- */

const hasCover = () => D.descs[0]?.kind === 'cover';

function angleFor(d) {
  const f = D.f;
  const x = Math.min(Math.abs(d), f.vis + 1, ANGLES.length - 1);
  const i = Math.min(Math.floor(x), ANGLES.length - 2);
  const a = ANGLES[i] + (ANGLES[i + 1] - ANGLES[i]) * (x - i);
  return Math.sign(d) * a * f.spread;
}

function bladeEl(d, i) {
  const el = document.createElement('div');
  el.className = 'blade';
  el.dataset.i = String(i);
  const s = d.sectionId ? getSection(book, d.sectionId) : null;
  el.style.setProperty('--tab', s?.color ?? 'transparent');
  el.innerHTML = `<div class="blade-svg"></div>${s ? '<span class="blade-tab" aria-hidden="true"></span>' : ''}`;
  const n = i + (hasCover() ? 0 : 1);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', d.kind === 'cover' ? 'Deck cover' : `${s?.name ?? 'Blade'}, blade ${n} of ${D.descs.length - (hasCover() ? 1 : 0)}`);
  return el;
}

/** Only the blade in front can be tabbed to; the others stay tappable (a tap brings one forward). */
function setFocusable(el, front) {
  el.setAttribute('aria-hidden', front ? 'false' : 'true');
  el.querySelectorAll('[tabindex]').forEach((n) => n.setAttribute('tabindex', front ? '0' : '-1'));
}

function build(i) {
  if (D.built.has(i) || !D.els[i]) return;
  D.built.add(i);
  const d = D.descs[i];
  const scene = bladeScene(d, { book, opts: getBookOpts(), coverImage: coverImage('deck') });
  D.els[i].querySelector('.blade-svg').innerHTML = toSvg(scene, d.kind === 'cover'
    ? { units: 'none', title: 'Cover', idPrefix: `bl${i}-` }
    : { units: 'none', title: 'Palettes on this blade', interactive: true, idPrefix: `bl${i}-` });
  setFocusable(D.els[i], D.els[i].classList.contains('is-front'));
}

/** Draw the blades near the front (the others are drawn when they come close). */
function ensureWindow() {
  const reach = D.f.vis + 3;
  const lo = Math.max(0, Math.floor(D.pos) - reach);
  const hi = Math.min(D.descs.length - 1, Math.ceil(D.pos) + reach);
  for (let i = lo; i <= hi; i++) build(i);
}

/** Swing every blade to where it belongs when the deck is at `pos` (a blade number; fractions while dragging). */
function place(pos, animate) {
  stage.classList.toggle('is-settling', !!animate);
  const openness = hasCover() ? clamp(pos, 0, 1) : 1; // the cover keeps a closed deck shut
  D.els.forEach((el, i) => {
    const d = i - pos;
    const ad = Math.abs(d);
    const hidden = ad > D.f.vis + 0.6;
    const front = ad < 0.5;
    el.style.transform = `rotate(${(angleFor(d) * openness).toFixed(2)}deg)`;
    el.style.zIndex = String(500 - Math.round(ad * 20));
    el.style.opacity = hidden ? '0' : '1';
    el.style.pointerEvents = hidden ? 'none' : '';
    el.style.filter = ad < 0.05 ? '' : `brightness(${(1 - Math.min(ad, 4) * 0.045).toFixed(3)})`;
    if (front !== el.classList.contains('is-front')) {
      el.classList.toggle('is-front', front);
      setFocusable(el, front);
    }
  });
}

/* ---------- going places ---------- */

export function deckGoTo(i) {
  const n = D.descs.length;
  if (!n) return;
  const k = clamp(Math.round(i), 0, n - 1);
  const moved = k !== D.index;
  D.index = k;
  D.pos = k;
  ensureWindow();
  place(k, !reducedMotion());
  scrub.value = String(k);
  if (moved) haptic(6);
  cb.onChange?.();
}

export const deckGo = (delta) => deckGoTo(D.index + delta);
export const deckSectionId = () => D.descs[D.index]?.sectionId ?? null;
export const deckCount = () => D.descs.length;
export const deckFocusId = () => D.descs[D.index]?.ids?.[0];

export function deckInfo() {
  const cover = hasCover();
  const d = D.descs[D.index];
  if (!d) return { label: '', index: 0, count: 0 };
  const total = D.descs.length - (cover ? 1 : 0);
  return { label: d.kind === 'cover' ? 'Closed · tap the cover to open' : `Blade ${D.index + (cover ? 0 : 1)} of ${total}`, index: D.index, count: D.descs.length };
}

export function deckJumpToSection(sid) {
  const i = D.descs.findIndex((d) => d.sectionId === sid);
  if (i >= 0) deckGoTo(i);
}

export function deckFocusPalette(id) {
  const i = D.descs.findIndex((d) => d.ids.includes(id));
  if (i >= 0) deckGoTo(i);
}

/** (Re)build the deck from the swatch book. Keeps the blade you were on, or the one holding `focusId`. */
export function renderDeck(focusId) {
  const opts = getBookOpts();
  D.descs = planBlades(book, opts);
  D.built.clear();
  let idx = D.index;
  if (focusId) {
    const k = D.descs.findIndex((d) => d.ids.includes(focusId));
    if (k >= 0) idx = k;
  }
  D.index = clamp(idx, 0, Math.max(0, D.descs.length - 1));
  D.pos = D.index;
  stage.textContent = '';
  D.els = D.descs.map(bladeEl);
  stage.append(...D.els);
  const ring = document.createElement('span');
  ring.className = 'deck-ring';
  ring.setAttribute('aria-hidden', 'true');
  stage.append(ring);
  applySizes();
  ensureWindow();
  place(D.pos, false);
  scrub.max = String(Math.max(0, D.descs.length - 1));
  scrub.value = String(D.index);
  scrub.hidden = D.descs.length < 2;
  cb.onChange?.();
}

/* ---------- gestures: swipe to fan, tap to open ---------- */

let g = null;
const stepPx = () => Math.max(46, D.f.bw * 0.42);

function onDown(e) {
  if (e.button > 0 || !stage.contains(e.target)) return;
  g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), pos0: D.pos, mode: 'pending', target: e.target, samples: [[performance.now(), e.clientX]] };
}

function onMove(e) {
  if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x0;
  const dy = e.clientY - g.y0;
  if (g.mode === 'pending' && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
    g.mode = 'drag';
    try { stage.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  }
  if (g.mode !== 'drag') return;
  g.samples.push([performance.now(), e.clientX]);
  if (g.samples.length > 6) g.samples.shift();
  const max = D.descs.length - 1;
  let pos = g.pos0 - dx / stepPx();
  if (pos < 0) pos *= 0.35; // a little elastic resistance at the ends
  if (pos > max) pos = max + (pos - max) * 0.35;
  D.pos = pos;
  ensureWindow();
  place(pos, false);
}

function onUp(e) {
  if (!g || e.pointerId !== g.id) return;
  const gesture = g;
  g = null;
  if (gesture.mode === 'drag') {
    const s = gesture.samples;
    const [t1, x1] = s[s.length - 1];
    const [t0, x0] = s[0];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0; // px per ms; a flick carries on a little
    deckGoTo(Math.round(D.pos - (v * 160) / stepPx()));
  } else if (gesture.mode === 'pending' && e.type === 'pointerup' && performance.now() - gesture.t0 < 600) {
    tap(gesture.target);
  }
}

function tap(target) {
  const blade = target.closest?.('.blade');
  if (!blade) return;
  const i = Number(blade.dataset.i);
  if (i !== D.index) { deckGoTo(i); return; }
  if (D.descs[i].kind === 'cover') { deckGoTo(1); return; }
  const more = target.closest('.pb-more');
  if (more) { cb.onMenu?.(more, more.dataset.pid); return; }
  const pb = target.closest('[data-pid]');
  if (pb) cb.onOpen?.(pb.dataset.pid, pb);
}

export function initDeck({ stage: stageEl, scrub: scrubEl, callbacks = {} }) {
  stage = stageEl;
  scrub = scrubEl;
  cb = callbacks;
  stage.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const pb = e.target.closest?.('[data-pid]');
    if (!pb) return;
    e.preventDefault();
    if (e.target.closest('.pb-more')) cb.onMenu?.(e.target.closest('.pb-more'), pb.dataset.pid);
    else cb.onOpen?.(pb.dataset.pid, pb);
  });
  scrub.addEventListener('input', () => deckGoTo(Number(scrub.value)));
  let t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!stage.offsetParent || !D.els.length) return;
      applySizes();
      ensureWindow();
      place(D.pos, false);
    }, 120);
  });
}
