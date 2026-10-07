import { normalizeHex, readableText, hslToHex, hexToHsl, rgbString, rgbToHex, parseColorCodes } from './color.js';
import {
  HARMONIES, MIN_COLORS, MAX_COLORS, STYLES, RECIPES, generateBatch, generateDistinct, pickDistinct, paletteLikeness, swapOptions, harmonyPlan, PER_TYPE_DEFAULT,
} from './harmonies.js';
import { nameColor, nameColors, namePalette } from './names.js';
import { SHAPES, getShape } from './shapes.js';
import { THEMES, getTheme, generateThemeColors } from './themes.js';
import { moodPalettes, SUGGESTIONS } from './mood.js';
import { mergeLocked, carryLocks, hasLocks, toggleLock, unlockAll } from './lock.js';
import { extractShareCode } from './sharecode.js';
import { extractPhotoColors, samplePixels, loadImagePixels } from './photo.js';
import { decodeImage, drawScaled } from './imageutil.js';
import { releaseCanvas, closeBitmap } from './lifecycle.js';
import { initPwa, canInstall, promptInstall, onPwaChange } from './pwa.js';
import { addPalette, updatePalette, removePalette, hasPalette, getSection, paletteCount } from './book.js';
import { book, prefs, persistBook, persistPrefs, on, getBookOpts, setBookOpts } from './store.js';
import { ColorWheel } from './picker.js';
import { paletteHtml, rgbCss } from './render.js';
import {
  $, $$, esc, uid, toast, copyText, openPopover, closePopover, showMenu, syncSegment, initSheen, burst, haptic, ICONS, reducedMotion,
} from './ui.js';
import { openExportSheet, initExportSheet } from './exportsheet.js';
import { initBook, showBook, renderBook } from './bookview.js';
import { loadCoverImages, coverImage } from './cover.js';
import { initViewer, copyAllMenu } from './viewer.js';
import { paletteMoreItems } from './palettemenu.js';

const MODES = ['color', 'photo', 'theme', 'mood', 'build'];
const BUILD_MAX = 30;

const state = {
  mode: MODES.includes(prefs.mode) ? prefs.mode : 'color',
  base: normalizeHex(prefs.base) || '#33ADE8',
  count: Math.min(MAX_COLORS, Math.max(MIN_COLORS, Number(prefs.count) || 8)),
  shape: getShape(prefs.shape).id,
  filter: Array.isArray(prefs.filter) ? prefs.filter.filter((id) => HARMONIES.some((h) => h.id === id)) : [],
  total: Number(prefs.total) || 0, // 0 = auto
  themeId: getTheme(prefs.themeId).id,
  photo: null, // { thumb (data URL), pixels, colors }
  mood: { text: typeof prefs.moodText === 'string' ? prefs.moodText.slice(0, 60) : '', info: null },
  palettes: [],
  draft: prefs.draft?.colors ? prefs.draft : null,
  view: 'create',
};
if (!state.draft) state.draft = newDraft();

function newDraft() {
  return { id: uid(), name: 'My Handmade Palette', harmony: 'custom', source: 'custom', colors: [], createdAt: new Date().toISOString() };
}

const savePrefs = () => persistPrefs({
  mode: state.mode, base: state.base, count: state.count, shape: state.shape,
  filter: state.filter, total: state.total, themeId: state.themeId, draft: state.draft, moodText: state.mood.text,
});

/* ================= palette generation ================= */

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

function makePalette(harmony, hexes, taken, extra = {}) {
  const names = nameColors(hexes);
  const name = namePalette(hexes, harmony, taken);
  taken.add(name);
  return { id: uid(), name, harmony, colors: hexes.map((hex, i) => ({ hex, name: names[i] })), createdAt: new Date().toISOString(), ...extra };
}

/** How many harmony palettes to make when `total` may be auto (0). */
function planFor(total) {
  if (total < 0) return [];
  return harmonyPlan(state.filter, total);
}

/** Make a fresh set of palettes; locked colors from the previous set carry over. */
function generate(opts = {}) {
  const prev = state.palettes;
  // "Shuffle all" must not hand back palettes that look like the ones it replaces.
  const avoid = opts.stable ? [] : prev.map((p) => p.colors.map((c) => c.hex));
  generateFresh({ ...opts, avoid });
  if (state.palettes.length && prev.some(hasLocks)) state.palettes = carryLocks(prev, state.palettes);
}

/**
 * @param {{ stable?: boolean, live?: boolean, avoid?: string[][] }} opts `stable` makes the same start give the same batch;
 *   `live` is for frames while the color wheel is being dragged (no look-for-near-copies pass, so nothing jumps).
 */
function generateFresh({ stable = false, live = false, avoid = [] } = {}) {
  const taken = new Set();
  const seedFor = (i) => (stable ? 7919 * (i + 1) : randSeed());
  // A stable batch always starts with the classic look; "shuffle all" turns every harmony to a new one.
  const shift = stable ? 0 : 1 + Math.floor(Math.random() * (STYLES.length - 1));
  const offset = stable ? 0 : Math.floor(Math.random() * RECIPES.length);
  /** One palette per entry of `plan`: each of a harmony's palettes gets a different look, and none copies an earlier one. */
  const harmonyBatch = (plan, baseFor, source, seen = []) => generateBatch(plan, baseFor, state.count, {
    seedFor, shift, offset, distinct: !live, seen: [...seen, ...avoid],
  }).map(({ harmony, base, hexes }) => makePalette(harmony, hexes, taken, { base, source }));
  if (state.mode === 'color') {
    state.palettes = harmonyBatch(planFor(state.total), () => state.base, 'color');
  } else if (state.mode === 'photo') {
    if (!state.photo) { state.palettes = []; return; }
    const pure = extractPhotoColors(state.photo.pixels, state.count, 7);
    state.photo.colors = pure;
    const first = makePalette('photo-pure', pure, taken, { source: 'photo' });
    first.name = `${first.name.split(' ')[0]} Snapshot`;
    const bases = pure.slice(0, Math.min(3, pure.length));
    // "Palettes to show" counts the photo palette too.
    const rest = state.total ? state.total - 1 : 0;
    const plan = state.total && rest === 0 ? [] : planFor(rest);
    state.palettes = [first, ...harmonyBatch(plan, (i) => bases[i % bases.length], 'photo', [pure])];
  } else if (state.mode === 'mood') {
    const text = state.mood.text.trim();
    if (!text) { state.palettes = []; state.mood.info = null; return; }
    const res = moodPalettes(text, { count: state.count, variants: state.total || 9, seed: stable ? 1 : randSeed() });
    state.mood.info = { known: res.known, unknown: res.unknown, fallback: res.fallback };
    state.palettes = res.palettes.map((mp) => {
      const names = nameColors(mp.hexes);
      let name = mp.name;
      for (let n = 2; taken.has(name); n++) name = `${mp.name} ${n}`;
      taken.add(name);
      return {
        id: uid(), name, harmony: 'mood', source: 'mood', moodText: text, variant: mp.variant,
        colors: mp.hexes.map((hex, i) => ({ hex, name: names[i] })), createdAt: new Date().toISOString(),
      };
    });
  } else if (state.mode === 'theme') {
    const n = state.total || 9;
    const seen = [...avoid];
    state.palettes = Array.from({ length: n }, (_, i) => {
      const make = (k) => generateThemeColors(state.themeId, state.count, seedFor(i) + 13 + k * 104729, (i + k) % 3);
      const hexes = live ? make(0) : pickDistinct(make, seen, { limit: 0.6, tries: 10, measure: paletteLikeness });
      seen.push(hexes);
      return makePalette(`theme:${state.themeId}`, hexes, taken, { source: 'theme' });
    });
  } else {
    state.palettes = [];
  }
}

/* ================= rendering ================= */

const findPalette = (id) => (state.draft.id === id ? state.draft : state.palettes.find((p) => p.id === id) || book.palettes[id]);

function cardHtml(p) {
  return paletteHtml(p, { shapeId: state.shape, saved: hasPalette(book, p.id) });
}

function builderHtml() {
  const d = state.draft;
  const saved = hasPalette(book, d.id);
  const actions = [
    `<button type="button" class="btn btn-primary btn-sm" data-action="build-save" data-pid="${d.id}" ${d.colors.length ? '' : 'disabled'}>${ICONS.star}<span>${saved ? 'Saved ✓' : 'Save to book'}</span></button>`,
    'art', 'add', 'copyall', 'export', 'more',
    `<button type="button" class="icon-btn" data-action="build-new" aria-label="Start a new palette" title="Start a new palette">${ICONS.sparkle}</button>`,
  ];
  if (!d.colors.length) {
    return `<article class="palette glass builder empty-builder" data-id="${d.id}">
      <div class="builder-empty">
        <span class="be-icon">${ICONS.sparkle}</span>
        <h2 class="display">Build your own palette</h2>
        <p class="muted">Pick a color on the wheel and tap <b>Add this color</b>, or paste HEX/RGB codes. Up to ${BUILD_MAX} colors.</p>
      </div>
    </article>`;
  }
  const editing = saved ? `<p class="builder-note">${ICONS.book} Editing a palette from your swatch book — changes save automatically.</p>` : '';
  return editing + paletteHtml(d, { shapeId: state.shape, actions, maxColors: BUILD_MAX, extraClass: 'builder', lockable: false });
}

function emptyPhotoHtml() {
  return `<article class="palette glass empty-builder"><div class="builder-empty">
    <span class="be-icon">${ICONS.sparkle}</span>
    <h2 class="display">Palettes from a photo</h2>
    <p class="muted">Add a photo and we'll pull its colors into a palette made <b>only</b> of colors from your photo, plus harmony palettes built around them.</p>
  </div></article>`;
}

function emptyMoodHtml() {
  return `<article class="palette glass empty-builder"><div class="builder-empty">
    <span class="be-icon">${ICONS.sparkle}</span>
    <h2 class="display">Palettes from your words</h2>
    <p class="muted">Describe a place, a food, the weather or a feeling, like <b>rainy café</b> or <b>enchanted forest</b>, and get palettes to match. It works with no internet at all.</p>
  </div></article>`;
}

function renderPalettes({ animate = true } = {}) {
  const el = $('#palettes');
  el.classList.toggle('no-anim', !animate || reducedMotion());
  if (state.mode === 'build') el.innerHTML = builderHtml();
  else if (state.mode === 'photo' && !state.photo) el.innerHTML = emptyPhotoHtml();
  else if (state.mode === 'mood' && !state.palettes.length) el.innerHTML = emptyMoodHtml();
  else el.innerHTML = state.palettes.map(cardHtml).join('');
  updateAmbient();
}

function rerender(p) {
  if (p === state.draft) { renderPalettes({ animate: false }); return; }
  const node = $(`#palettes .palette[data-id="${p.id}"]`);
  if (node) {
    node.outerHTML = cardHtml(p);
    $(`#palettes .palette[data-id="${p.id}"]`)?.classList.add('no-anim'); // small edits should not re-deal every swatch
  }
}

function renderShapePicker() {
  $('#shape-picker').innerHTML = SHAPES.map((s) => {
    const icon = s.path
      ? `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${s.path(0)}"/></svg>`
      : '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="22" y="8" width="56" height="84" rx="10"/><rect x="22" y="62" width="56" height="30" fill="#fff" opacity=".85"/></svg>';
    const on = s.id === state.shape;
    return `<button type="button" class="shape-opt ${on ? 'is-on' : ''}" role="radio" aria-checked="${on}" data-shape="${s.id}" title="${s.label}">${icon}<span>${s.label}</span></button>`;
  }).join('');
}

function renderFilter() {
  $('#harmony-filter').innerHTML = HARMONIES.map((h) => {
    const on = state.filter.includes(h.id);
    return `<button type="button" class="fchip ${on ? 'is-on' : ''}" aria-pressed="${on}" data-harmony="${h.id}" title="${esc(h.blurb)}">${esc(h.label)}</button>`;
  }).join('');
  $('#filter-clear').hidden = !state.filter.length;
}

function renderTotal() {
  const auto = !state.total;
  const types = state.filter.length || HARMONIES.length;
  const autoN = state.mode === 'theme' || state.mode === 'mood' ? 9 : types * PER_TYPE_DEFAULT + (state.mode === 'photo' ? 1 : 0);
  $('#total-auto').setAttribute('aria-pressed', auto);
  $('#total-auto').classList.toggle('is-on', auto);
  $('#total').classList.toggle('is-auto', auto);
  $('#total').value = auto ? autoN : state.total;
  $('#total-out').textContent = auto ? `Auto · ${autoN}` : state.total;
}

function renderBase() {
  $('#base-preview').style.background = state.base;
  const input = $('#hex-input');
  if (document.activeElement !== input) input.value = state.base;
  $('#base-name').textContent = nameColor(state.base);
  $('#base-rgb').textContent = `RGB ${rgbString(state.base)}`;
}

function renderMode() {
  $$('#mode-seg [data-mode]').forEach((b) => {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on);
  });
  syncSegment($('#mode-seg'));
  $$('.studio [data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(state.mode); });
  $('#regen-all').hidden = state.mode === 'build';
  if (state.mode === 'build') wheel.setHex(state.base);
}

function renderPhoto() {
  const ph = state.photo;
  $('#photo-preview').hidden = !ph;
  $('#dz-empty').hidden = !!ph;
  $('#dropzone').classList.toggle('has-photo', !!ph);
  if (ph) $('#photo-preview').src = ph.thumb;
  $('#photo-remove').hidden = !ph;
  $('#photo-dots').innerHTML = ph?.colors ? ph.colors.map((c) => `<button type="button" class="dot" style="--c:${c}" data-action="copy" data-text="${c}" title="${c}"></button>`).join('') : '';
}

function renderThemes() {
  $('#theme-select').innerHTML = THEMES.map((t) => `<option value="${t.id}" ${t.id === state.themeId ? 'selected' : ''}>${t.emoji}  ${esc(t.label)}</option>`).join('');
  $('#theme-grid').innerHTML = THEMES.map((t) => `<button type="button" role="listitem" class="theme-tile ${t.id === state.themeId ? 'is-on' : ''}" data-theme="${t.id}" title="${esc(t.label)}"><span>${t.emoji}</span></button>`).join('');
}

/** Tint the floating background blobs and the accent from what's on screen. */
function updateAmbient() {
  const src = state.mode === 'build' ? state.draft.colors.map((c) => c.hex)
    : state.palettes[0]?.colors.map((c) => c.hex) ?? [];
  const colors = src.length ? src : [state.base, '#8EDCF7', '#B79CFF', '#FF8FB1'];
  const pick = (k) => colors[Math.floor((k * colors.length) / 4) % colors.length];
  const root = document.documentElement.style;
  [1, 2, 3, 4].forEach((k) => root.setProperty(`--a${k}`, pick(k - 1)));
  const accent = state.mode === 'color' || state.mode === 'build' ? state.base : colors[0];
  // Keep the accent rich enough to read as a button.
  const { h, s, l } = hexToHsl(accent);
  const a = hslToHex({ h, s: Math.max(s, 0.45), l: Math.min(Math.max(l, 0.38), 0.6) });
  root.setProperty('--accent', a);
  root.setProperty('--accent-2', hslToHex({ h: h + 40, s: Math.max(s, 0.5), l: Math.min(Math.max(l, 0.42), 0.62) }));
  root.setProperty('--accent-ink', readableText(a));
}

function updateBadge() {
  $('#fav-count').textContent = paletteCount(book);
}

/* ================= actions ================= */

function regenerate(opts = {}) {
  generate(opts);
  renderPalettes(opts);
}

function setBase(hex, { fromWheel = false } = {}) {
  const n = normalizeHex(hex);
  if (!n) return;
  state.base = n;
  if (!fromWheel) wheel.setHex(n);
  renderBase();
  if (state.mode === 'color') regenerate({ stable: true });
  else updateAmbient();
  savePrefs();
}

function setMode(mode) {
  if (!MODES.includes(mode)) return;
  state.mode = mode;
  renderMode();
  renderTotal();
  if (mode !== 'build') generate({ stable: true });
  renderPalettes();
  savePrefs();
}

/** After editing a palette: refresh it and keep the book copy in sync. */
function afterEdit(p) {
  if (hasPalette(book, p.id)) { updatePalette(book, p); persistBook(); }
  rerender(p);
  if (p === state.draft) savePrefs();
}

const isCustom = (p) => p === state.draft || p.harmony === 'custom';
function minFor(p) { return isCustom(p) ? 1 : MIN_COLORS; }
function maxFor(p) { return isCustom(p) ? BUILD_MAX : MAX_COLORS; }

function removeColor(p, index) {
  if (p.colors.length <= minFor(p)) {
    toast(`Palettes keep at least ${minFor(p)} color${minFor(p) === 1 ? '' : 's'} — try swapping instead.`);
    return;
  }
  p.colors.splice(index, 1);
  afterEdit(p);
}

function setColor(p, index, hex) {
  const taken = new Set(p.colors.filter((_, i) => i !== index).map((c) => c.name));
  const entry = { hex, name: nameColor(hex, taken) };
  if (index >= p.colors.length) p.colors.push(entry); else p.colors[index] = entry;
  afterEdit(p);
}

function addColors(p, hexes) {
  const room = maxFor(p) - p.colors.length;
  if (room <= 0) { toast(`That's the max of ${maxFor(p)} colors.`); return 0; }
  const list = hexes.slice(0, room);
  const taken = new Set(p.colors.map((c) => c.name));
  for (const hex of list) {
    const name = nameColor(hex, taken);
    taken.add(name);
    p.colors.push({ hex, name });
  }
  afterEdit(p);
  return list.length;
}

function shufflePalette(id) {
  const i = state.palettes.findIndex((p) => p.id === id);
  if (i < 0) return;
  const old = state.palettes[i];
  const taken = new Set(state.palettes.map((p) => p.name));
  let hexes;
  const before = [old.colors.map((c) => c.hex)]; // the new palette must not be a copy of this one
  if (old.harmony.startsWith('theme:')) {
    hexes = pickDistinct((k) => generateThemeColors(state.themeId, state.count, randSeed(), (i + k) % 3), before);
  } else if (old.harmony === 'photo-pure') {
    hexes = pickDistinct(() => extractPhotoColors(state.photo.pixels, state.count, randSeed()), before, { limit: 0.75 });
  } else if (old.harmony === 'mood') {
    hexes = pickDistinct(() => {
      const res = moodPalettes(old.moodText, { count: state.count, variants: 9, seed: randSeed() });
      return (res.palettes.find((m) => m.variant === old.variant) ?? res.palettes[0]).hexes;
    }, before);
  } else hexes = generateDistinct(old.base, old.harmony, state.count, randSeed(), {}, before);
  const fresh = makePalette(old.harmony, hexes, taken, { base: old.base, source: old.source, moodText: old.moodText, variant: old.variant });
  if (old.harmony === 'mood') fresh.name = old.name;
  if (hasLocks(old)) fresh.colors = mergeLocked(old.colors, hexes, state.count);
  state.palettes[i] = fresh;
  const node = $(`#palettes .palette[data-id="${old.id}"]`);
  if (node) node.outerHTML = cardHtml(fresh);
}

function startRename(btn) {
  const p = findPalette(btn.dataset.pid);
  const input = document.createElement('input');
  input.className = 'name-input';
  input.value = p.name;
  input.maxLength = 48;
  input.setAttribute('aria-label', 'Palette name');
  btn.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (save && v) p.name = v;
    afterEdit(p);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

/** The "more" menu on a palette card. */
function moreMenu(btn, p) {
  showMenu(btn, [
    ...paletteMoreItems(p),
    '-',
    { label: 'Unlock all colors', icon: ICONS.unlock, disabled: !hasLocks(p), onSelect: () => { unlockAll(p); afterEdit(p); } },
  ], p.name);
}

function lockColor(p, index) {
  const locked = toggleLock(p, index);
  if (hasPalette(book, p.id)) { updatePalette(book, p); persistBook(); }
  rerender(p);
  haptic(8);
  if (locked && !prefs.lockHint) {
    toast('Locked colors stay put when you shuffle 🔒');
    persistPrefs({ lockHint: true });
  }
}

/* save to book */

function saveTo(p, sectionId, btn) {
  addPalette(book, p, sectionId);
  persistBook();
  const s = getSection(book, sectionId) || book.sections[0];
  burst(btn, p.colors.map((c) => c.hex));
  haptic(15);
  toast(`Saved to “${s.name}” ★`);
  rerender(p);
  updateBadge();
}

function toggleSave(p, btn) {
  if (hasPalette(book, p.id)) {
    removePalette(book, p.id);
    persistBook();
    toast('Removed from your swatch book');
    rerender(p);
    updateBadge();
    return;
  }
  if (book.sections.length === 1) { saveTo(p, book.sections[0].id, btn); return; }
  showMenu(btn, book.sections.map((s) => ({
    label: `${s.name} (${s.ids.length})`,
    icon: `<span class="tab-swatch" style="--c:${s.color}"></span>`,
    onSelect: () => saveTo(p, s.id, btn),
  })), 'Save to which tab?');
}

/* swap / add popover */

let popCtx = null;

function openColorPop(btn, p, index, mode) {
  popCtx = { p, index, mode };
  const ref = mode === 'swap' ? p.colors[index].hex : (p.colors[p.colors.length - 1]?.hex ?? state.base);
  $('#swap-title').textContent = mode === 'swap' ? `Swap ${p.colors[index].name} for…` : 'Add a color';
  const opts = swapOptions(ref, p.colors.map((c) => c.hex)).slice(0, 10);
  if (mode === 'add' && !p.colors.some((c) => c.hex === state.base)) opts.unshift(state.base);
  $('#swap-options').innerHTML = opts.slice(0, 10).map((o) => `<button type="button" class="swap-opt" style="background:${o}" data-swap="${o}" title="${esc(nameColor(o))} · ${o} · RGB ${rgbString(o)}" aria-label="${esc(nameColor(o))} ${o}"></button>`).join('');
  $('#swap-custom').value = ref.toLowerCase();
  openPopover($('#swap-pop'), btn);
}

function applyColorPop(hex) {
  if (!popCtx) return;
  const { p, index, mode } = popCtx;
  if (mode === 'swap') setColor(p, index, hex.toUpperCase());
  else addColors(p, [hex.toUpperCase()]);
  closePopover();
  popCtx = null;
}

/* builder */

function saveDraft(btn) {
  const d = state.draft;
  if (!d.colors.length) return;
  if (hasPalette(book, d.id)) { updatePalette(book, d); persistBook(); toast('Saved ✓'); return; }
  if (book.sections.length === 1) { saveTo(d, book.sections[0].id, btn); renderPalettes({ animate: false }); return; }
  showMenu(btn, book.sections.map((s) => ({
    label: `${s.name} (${s.ids.length})`,
    icon: `<span class="tab-swatch" style="--c:${s.color}"></span>`,
    onSelect: () => { saveTo(d, s.id, btn); renderPalettes({ animate: false }); },
  })), 'Save to which tab?');
}

/* photo */

async function usePhoto(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  try {
    toast('Reading your photo…');
    const img = await loadImagePixels(file);
    state.photo = { thumb: img.thumb, pixels: samplePixels(img.pixels) };
    if (state.mode !== 'photo') setMode('photo');
    generate({ stable: true });
    renderPhoto();
    renderPalettes();
    toast(`Found ${state.photo.colors.length} colors in your photo 📸`);
  } catch {
    toast('Sorry, that photo could not be read.');
  }
}

function clearPhoto() {
  state.photo = null; // drops the pixels and the preview picture together
  $('#photo-preview').removeAttribute('src');
  renderPhoto();
  if (state.mode === 'photo') { generate({ stable: true }); renderPalettes(); }
}

/* screen + single-pixel image picking */

async function pickFromScreen() {
  if (!('EyeDropper' in window)) {
    toast('Screen picking isn\'t supported in this browser — snap a screenshot and pick from it!');
    $('#image-input').click();
    return;
  }
  try {
    const { sRGBHex } = await new window.EyeDropper().open();
    setBase(normalizeHex(sRGBHex) || rgbStringToHex(sRGBHex));
  } catch { /* cancelled */ }
}

function rgbStringToHex(s) {
  const m = String(s).match(/(\d+)\D+(\d+)\D+(\d+)/);
  return m ? rgbToHex({ r: +m[1], g: +m[2], b: +m[3] }) : null;
}

async function pickFromImage(file) {
  if (!file) return;
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    toast('Sorry, that image could not be opened.');
    return;
  }
  const canvas = $('#image-canvas');
  const k = Math.min(1, Math.min(900, innerWidth - 64) / decoded.width, (innerHeight * 0.65) / decoded.height);
  const scratch = drawScaled(decoded, Math.max(decoded.width, decoded.height) * k);
  canvas.width = scratch.width;
  canvas.height = scratch.height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(scratch, 0, 0);
  releaseCanvas(scratch);
  closeBitmap(decoded.source);
  $('#image-dialog').showModal();
}

function sampleImage(e) {
  const canvas = e.currentTarget;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * canvas.width);
  const y = Math.floor(((e.clientY - r.top) / r.height) * canvas.height);
  const [red, g, b] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  $('#image-dialog').close();
  setBase(rgbToHex({ r: red, g, b }));
}

/* mood */

function renderMood() {
  const info = state.mood.info;
  const note = $('#mood-note');
  if (document.activeElement !== $('#mood-input')) $('#mood-input').value = state.mood.text;
  if (!state.mood.text) note.textContent = 'Type a few words (a place, a food, a feeling, a season) and get palettes to match.';
  else if (info?.fallback) note.textContent = 'I don\u2019t know those words yet, so here is a palette made from them anyway. Try a place, a food, the weather or a feeling.';
  else if (info) note.textContent = `Understood: ${info.known.join(', ')}${info.unknown.length ? ` · Not sure about: ${info.unknown.join(', ')}` : ''}`;
}

function makeMood(text, { fresh = false } = {}) {
  state.mood.text = text.trim().slice(0, 60);
  generate({ stable: !fresh });
  renderMood();
  renderPalettes();
  savePrefs();
}

/* ================= navigation ================= */

function navigate(target) {
  if (target === 'build') {
    if (hasPalette(book, state.draft.id) || state.draft.colors.length) state.draft = newDraft();
    setMode('build');
    target = 'create';
  }
  const isBook = target === 'book';
  if (state.view !== target && !reducedMotion()) {
    const el = $(isBook ? '#view-book' : '#view-create');
    requestAnimationFrame(() => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' }));
  }
  state.view = target;
  $('#view-create').hidden = isBook;
  $('#view-book').hidden = !isBook;
  $$('#main-nav [data-nav]').forEach((t) => {
    const on = t.dataset.nav === target;
    t.classList.toggle('is-on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  syncSegment($('#main-nav'));
  if (isBook) showBook();
  if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
  scrollTo({ top: 0 });
}

/** A palette arrived in the address (a share link): show it and offer to keep it. */
async function handleIncomingShare() {
  const code = extractShareCode(location.hash);
  if (!code) return;
  const { openSharedPalette } = await import('./shareui.js');
  openSharedPalette(code, {
    onOpenInStudio: (p) => {
      state.draft = { ...p, harmony: 'custom', source: 'custom' };
      navigate('create');
      setMode('build');
    },
  });
}

function editFromBook(id) {
  const p = book.palettes[id];
  if (!p) return;
  state.draft = JSON.parse(JSON.stringify(p));
  navigate('create');
  setMode('build');
  toast(`Editing “${p.name}”`);
}

/* ================= wiring ================= */

let rafPending = false;
const wheel = new ColorWheel($('#wheel'), $('#wheel-handle'), $('#brightness'), (hex, source) => {
  state.base = hex;
  renderBase();
  if (state.mode !== 'color') { updateAmbient(); if (source === 'wheel-end') savePrefs(); return; }
  if (source === 'wheel-end') { setBase(hex, { fromWheel: true }); return; }
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    regenerate({ stable: true, animate: false, live: true });
  });
});

function handlePaletteAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, pid } = btn.dataset;
  const p = pid ? findPalette(pid) : null;
  switch (action) {
    case 'copy': copyText(btn.dataset.text); break;
    case 'star': toggleSave(p, btn); break;
    case 'shuffle': shufflePalette(pid); break;
    case 'add':
      if (p.colors.length >= maxFor(p)) { toast(`That's the max of ${maxFor(p)} colors.`); break; }
      openColorPop(btn, p, p.colors.length, 'add');
      break;
    case 'remove': removeColor(p, Number(btn.dataset.index)); break;
    case 'lock': lockColor(p, Number(btn.dataset.index)); break;
    case 'more': moreMenu(btn, p); break;
    case 'swap': openColorPop(btn, p, Number(btn.dataset.index), 'swap'); break;
    case 'copyall': copyAllMenu(btn, p); break;
    case 'art': import('./contextui.js').then((m) => m.openContext(p)); break;
    case 'export': openExportSheet(p, state.shape); break;
    case 'rename': startRename(btn); break;
    case 'build-save': saveDraft(btn); break;
    case 'build-new': state.draft = newDraft(); renderPalettes(); savePrefs(); break;
    default: return;
  }
  e.stopPropagation();
}

function init() {
  $('#year').textContent = new Date().getFullYear();
  $('#count').value = state.count;
  $('#count-out').textContent = state.count;
  wheel.setHex(state.base);
  renderBase();
  renderShapePicker();
  renderFilter();
  renderThemes();
  renderMode();
  renderTotal();
  const incomingShare = extractShareCode(location.hash);
  $('#mood-suggest').innerHTML = SUGGESTIONS.slice(0, 8).map((x) => `<button type="button" class="fchip" data-mood="${esc(x)}">${esc(x)}</button>`).join('');
  generate({ stable: true });
  renderMood();
  renderPalettes();
  updateBadge();
  initSheen();
  initExportSheet();
  initViewer();
  initBook();
  // Cover pictures live in IndexedDB; once they are read, redraw the book if it is already on screen.
  loadCoverImages().then(() => {
    const o = getBookOpts();
    const has = { book: !!coverImage('book'), deck: !!coverImage('deck') };
    if (has.book !== o.covers.book.image || has.deck !== o.covers.deck.image) {
      const next = JSON.parse(JSON.stringify(o));
      next.covers.book.image = has.book;
      next.covers.deck.image = has.deck;
      setBookOpts(next, { silent: true });
    }
    if (!$('#view-book').hidden) renderBook();
  });
  on('book', () => {
    updateBadge();
    // Stars on studio cards reflect the book.
    $$('#palettes .star').forEach((b) => {
      const saved = hasPalette(book, b.dataset.pid);
      b.classList.toggle('is-on', saved);
      b.setAttribute('aria-pressed', saved);
    });
  });
  on('edit-palette', editFromBook);

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); navigate(nav.dataset.nav); }
  });
  $('#palettes').addEventListener('click', handlePaletteAction);

  $('#mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b && b.dataset.mode !== state.mode) setMode(b.dataset.mode);
  });

  $('#hex-input').addEventListener('input', (e) => {
    let v = e.target.value.trim();
    if (v && !v.startsWith('#')) v = `#${v}`;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setBase(v);
  });
  $('#hex-input').addEventListener('blur', () => { $('#hex-input').value = state.base; });
  $('#base-rgb').addEventListener('click', () => copyText(rgbCss(state.base)));

  $('#count').addEventListener('input', (e) => {
    state.count = Number(e.target.value);
    $('#count-out').textContent = state.count;
    regenerate({ stable: true, animate: false, live: true });
    if (state.mode === 'photo') renderPhoto();
    savePrefs();
  });
  $('#count').addEventListener('change', () => regenerate({ stable: true, animate: false }));

  $('#harmony-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-harmony]');
    if (!b) return;
    const id = b.dataset.harmony;
    state.filter = state.filter.includes(id) ? state.filter.filter((x) => x !== id) : [...state.filter, id];
    renderFilter();
    renderTotal();
    regenerate({ stable: true });
    savePrefs();
  });
  $('#filter-clear').addEventListener('click', () => {
    state.filter = [];
    renderFilter();
    renderTotal();
    regenerate({ stable: true });
    savePrefs();
  });

  $('#total-auto').addEventListener('click', () => {
    state.total = state.total ? 0 : Number($('#total').value);
    renderTotal();
    regenerate({ stable: true });
    savePrefs();
  });
  $('#total').addEventListener('input', (e) => {
    state.total = Number(e.target.value);
    renderTotal();
    regenerate({ stable: true, animate: false, live: true });
    savePrefs();
  });
  $('#total').addEventListener('change', () => regenerate({ stable: true, animate: false }));

  $('#shape-picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-shape]');
    if (!b) return;
    state.shape = b.dataset.shape;
    renderShapePicker();
    renderPalettes();
    savePrefs();
  });

  $('#regen-all').addEventListener('click', (e) => {
    regenerate();
    if (state.mode === 'mood') renderMood();
    if (state.mode === 'photo') renderPhoto();
    const icon = e.currentTarget.querySelector('svg');
    if (!reducedMotion()) icon.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 500, easing: 'ease-out' });
  });
  $('#surprise').addEventListener('click', () => {
    setBase(hslToHex({ h: Math.random() * 360, s: 0.45 + Math.random() * 0.5, l: 0.4 + Math.random() * 0.35 }));
  });
  $('#eyedropper').addEventListener('click', pickFromScreen);
  $('#image-input').addEventListener('change', (e) => { pickFromImage(e.target.files[0]); e.target.value = ''; });
  $('#image-canvas').addEventListener('click', sampleImage);
  // Empty the picking canvas as soon as the dialog closes.
  $('#image-dialog').addEventListener('close', () => { const c = $('#image-canvas'); c.width = 0; c.height = 0; });
  $('#photo-remove').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); clearPhoto(); });

  // Photo mode: file picker and drag & drop.
  $('#photo-input').addEventListener('change', (e) => { usePhoto(e.target.files[0]); e.target.value = ''; });
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, () => dz.classList.remove('is-over')));
  dz.addEventListener('drop', (e) => { e.preventDefault(); usePhoto(e.dataTransfer.files[0]); });
  $('#photo-dots').addEventListener('click', (e) => { const b = e.target.closest('[data-text]'); if (b) copyText(b.dataset.text); });
  // Paste a photo from the clipboard anywhere in photo mode.
  document.addEventListener('paste', (e) => {
    if (state.mode !== 'photo' || state.view !== 'create') return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) usePhoto(file);
  });

  // Themes.
  const pickTheme = (id) => {
    state.themeId = getTheme(id).id;
    renderThemes();
    regenerate();
    savePrefs();
  };
  $('#theme-select').addEventListener('change', (e) => pickTheme(e.target.value));
  $('#theme-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) pickTheme(b.dataset.theme); });

  // Mood.
  $('#mood-go').addEventListener('click', () => makeMood($('#mood-input').value));
  $('#mood-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') makeMood(e.target.value); });
  $('#mood-suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (b) makeMood(b.dataset.mood);
  });

  // Builder.
  $('#build-import').addEventListener('click', async () => (await import('./importui.js')).openImport({ sectionId: book.sections[0].id }));
  $('#build-add').addEventListener('click', (e) => {
    if (state.draft.colors.some((c) => c.hex === state.base)) { toast('That color is already in your palette.'); return; }
    if (addColors(state.draft, [state.base])) {
      if (state.draft.colors.length === 1) renderPalettes({ animate: false });
      burst(e.currentTarget, [state.base]);
    }
  });
  $('#paste-add').addEventListener('click', () => {
    const codes = parseColorCodes($('#paste-codes').value);
    if (!codes.length) { toast('No HEX or RGB codes found there.'); return; }
    const n = addColors(state.draft, codes);
    renderPalettes({ animate: false });
    $('#paste-codes').value = '';
    toast(`Added ${n} color${n === 1 ? '' : 's'}`);
  });

  // Swap / add popover.
  $('#swap-options').addEventListener('click', (e) => { const b = e.target.closest('[data-swap]'); if (b) applyColorPop(b.dataset.swap); });
  $('#swap-custom').addEventListener('change', (e) => applyColorPop(e.target.value));

  addEventListener('resize', () => { syncSegment($('#main-nav')); syncSegment($('#mode-seg')); });
  document.fonts?.ready.then(() => { syncSegment($('#main-nav')); syncSegment($('#mode-seg')); });

  const start = location.hash.slice(1);
  navigate(['book', 'create'].includes(start) ? start : 'create');

  if (incomingShare) handleIncomingShare();

  initPwa();
  const installBtn = $('#install-btn');
  const syncInstall = () => { installBtn.hidden = !canInstall(); };
  onPwaChange(syncInstall);
  syncInstall();
  installBtn.addEventListener('click', () => promptInstall());
  $('#open-settings').addEventListener('click', async () => (await import('./settingsui.js')).openSettings());
}

init();
