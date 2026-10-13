// The Studio screen: build printables with a live preview. Phase 1: DIY blank swatch pages.
import { prefs, persistPrefs } from './store.js';
import {
  SET_SIZES, BLOCK_MIN, BLOCK_MAX, TOTAL_MAX, blocksFor, normalizeBlank, totalOf, buildBlankPages, studioFileName,
} from './studio.js';
import { PAPERS, cutPage } from './printable.js';
import { PRINT_SHAPES } from './sheet.js';
import { toSvg, drawCanvas } from './scene.js';
import { buildPdf } from './pdf.js';
import { createZip } from './zip.js';
import { esc, toast, ICONS } from './ui.js';
import { downloadBlob } from './export.js';
import { releaseCanvas } from './lifecycle.js';
import { segHtml as seg, toggleHtml as toggle, shapeIconHtml } from './uikit.js';
import { APP_NAME } from './meta.js';

/** What the Studio can make. The rest arrive in the next updates. */
const TYPES = [
  { id: 'blank-pages', label: 'DIY blank swatch pages', blurb: 'Blank swatches to paint, color or mark, with spots to write the medium, brand and color names.' },
  { id: 'blank-deck', label: 'DIY blank swatch deck', soon: true },
  { id: 'match-pages', label: 'Match supplies to palettes: pages', soon: true },
  { id: 'match-deck', label: 'Match supplies to palettes: deck', soon: true },
  { id: 'palette-pages', label: 'Saved palettes: pages', soon: true },
  { id: 'palette-deck', label: 'Saved palettes: deck', soon: true },
];

const $ = (sel, root = document) => root.querySelector(sel);

let root = null;
let st = null;
let built = null;
let ready = false;

function save() {
  const { page, out, dpi, ...rest } = st;
  persistPrefs({ studio: { ...rest, out, dpi } });
}

function rebuild() {
  built = buildBlankPages(st);
  st.page = Math.min(st.page, built.pages.length - 1);
}

/* ---------- controls ---------- */

function blocksHtml() {
  const total = totalOf(st);
  const rows = st.blocks.map((b, i) => `
    <div class="st-block">
      <span class="st-block-no">Block ${i + 1}</span>
      <div class="stepper">
        <button type="button" class="icon-btn sm" data-blk-step="-1" data-i="${i}" aria-label="Fewer swatches in block ${i + 1}" ${b.count <= BLOCK_MIN ? 'disabled' : ''}>−</button>
        <input type="number" inputmode="numeric" min="${BLOCK_MIN}" max="${BLOCK_MAX}" value="${b.count}" data-blk-count="${i}" aria-label="Swatches in block ${i + 1}">
        <button type="button" class="icon-btn sm" data-blk-step="1" data-i="${i}" aria-label="More swatches in block ${i + 1}" ${b.count >= BLOCK_MAX || total >= TOTAL_MAX ? 'disabled' : ''}>+</button>
      </div>
      <span class="select-wrap glass-inset st-shape-sel"><select data-blk-shape="${i}" aria-label="Shape for block ${i + 1}">${PRINT_SHAPES.map((s) => `<option value="${s.id}" ${s.id === b.shape ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></span>
      ${st.blocks.length > 1 ? `<button type="button" class="icon-btn sm" data-blk-remove="${i}" aria-label="Remove block ${i + 1}" title="Remove this block">${ICONS.close}</button>` : '<span></span>'}
    </div>`).join('');
  return `${rows}
    <button type="button" class="btn btn-glass btn-sm" data-blk-add ${total >= TOTAL_MAX ? 'disabled' : ''}>+ Add a block</button>
    <p class="dlg-note" id="st-total">${totalText()}</p>`;
}

/** "36 swatches · 1 page · swatches about 31 mm across" */
function totalText() {
  const pages = built.pages.length;
  const fitText = st.sides === 'double'
    ? `${built.sheets} sheet${built.sheets === 1 ? '' : 's'}, printed on both sides`
    : `${pages} page${pages === 1 ? '' : 's'}`;
  return `<b>${totalOf(st)} swatches</b> · ${fitText} · swatches about ${Math.round(built.chip)} mm (${(built.chip / 25.4).toFixed(2)}″) across`;
}

function controlsHtml() {
  const allShape = st.blocks.every((b) => b.shape === st.blocks[0].shape) ? st.blocks[0].shape : null;
  return `
    <section class="dlg-section"><h3>What are you making?</h3>
      <div class="st-types">${TYPES.map((t) => `<button type="button" class="st-type ${t.id === 'blank-pages' ? 'is-on' : ''}" ${t.soon ? 'disabled' : ''} aria-pressed="${t.id === 'blank-pages'}"><b>${esc(t.label)}</b>${t.soon ? '<small>Coming soon</small>' : ''}</button>`).join('')}</div>
      <p class="dlg-note">${esc(TYPES[0].blurb)} Need palette pages or a deck today? Use <button type="button" class="link-btn" data-open-print>Print &amp; cut</button>.</p>
    </section>
    <section class="dlg-section"><h3>Paper</h3>
      ${seg('paper', st.paper, Object.entries(PAPERS).map(([id, p]) => [id, p.label]), 'Paper size')}
      ${seg('orient', st.orient, [['portrait', 'Portrait'], ['landscape', 'Landscape']], 'Orientation')}
    </section>
    <section class="dlg-section"><h3>How many swatches</h3>
      <div class="fchips st-presets" role="group" aria-label="Common set sizes">${SET_SIZES.map((n) => `<button type="button" class="fchip ${totalOf(st) === n && st.blocks.length === blocksFor(n).length ? 'is-on' : ''}" data-preset="${n}">${n}</button>`).join('')}</div>
      <p class="dlg-note">Pick a set size, or build your own from blocks of ${BLOCK_MIN}–${BLOCK_MAX}. Each block can have its own shape (24 chips and 12 hearts, say).</p>
      <div id="st-blocks">${blocksHtml()}</div>
    </section>
    <section class="dlg-section"><h3>Pages</h3>
      ${seg('sides', st.sides, [['single', 'Single-sided'], ['double', 'Double-sided']], 'Sides')}
      <p class="dlg-note">Up to 150 swatches fit on one page; double-sided spreads them over the front and back (recommended for 150). Bigger sets go over several pages.</p>
    </section>
    <section class="dlg-section"><h3>Shape for every block</h3>
      <div class="shape-grid">${PRINT_SHAPES.map((s) => `<button type="button" class="shape-pick ${allShape === s.id ? 'is-on' : ''}" data-shape-all="${s.id}" aria-pressed="${allShape === s.id}" title="${esc(s.label)}">${shapeIconHtml(s)}<span>${esc(s.label)}</span></button>`).join('')}</div>
    </section>
    <section class="dlg-section"><h3>Top of the page</h3>
      ${toggle('header.medium', 'Medium', st.header.medium, 'Watercolor, gouache, pencils…')}
      ${toggle('header.brand', 'Brand', st.header.brand)}
      ${toggle('header.count', 'Count', st.header.count, 'How many colors in the set')}
    </section>
    <section class="dlg-section"><h3>Beside each swatch</h3>
      ${toggle('numbered', 'Number the swatches', st.numbered, '1, 2, 3…')}
      ${toggle('info.name', 'Color name', st.info.name)}
      ${toggle('info.number', 'Color number', st.info.number, 'The maker’s number, like 102 or PC924')}
      ${seg('infoPos', st.infoPos, [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], 'Where the color info goes')}
    </section>
    <section class="dlg-section"><h3>Spaces to write in</h3>
      ${seg('fill', st.fill, [['lines', 'Lines'], ['boxes', 'Boxes']], 'Write-in style')}
    </section>`;
}

/* ---------- preview and export ---------- */

function renderPreview() {
  const pg = built.pages[st.page];
  $('#st-preview', root).innerHTML = `<div class="pv-sheet" style="aspect-ratio:${pg.w} / ${pg.h}">${toSvg(pg, { units: 'none', title: pg.meta.label, idPrefix: 'stp' })}</div>`;
  const n = built.pages.length;
  $('#st-nav', root).innerHTML = n > 1
    ? `<button type="button" class="icon-btn sm" data-page="-1" aria-label="Previous page" ${st.page === 0 ? 'disabled' : ''}>‹</button><span>${esc(pg.meta.label)}</span><button type="button" class="icon-btn sm" data-page="1" aria-label="Next page" ${st.page === n - 1 ? 'disabled' : ''}>›</button>`
    : `<span>${esc(pg.meta.label)}</span>`;
  $('#st-notes', root).innerHTML = built.notes.map((t) => `<p class="imp-note">${esc(t)}</p>`).join('');
}

function renderExport() {
  $('#st-export', root).innerHTML = `
    <h3 class="st-h3">Format</h3>
    ${seg('format', st.format, [['print', 'Print'], ['cut', 'Print & cut']], 'Format')}
    ${seg('out', st.out, [['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG']], 'File type')}
    <button type="button" class="btn btn-primary btn-wide" id="st-download">${ICONS.download} Save ${st.format === 'cut' ? `${st.out.toUpperCase()} + cut file` : st.out.toUpperCase()}</button>
    <p class="dlg-note">${st.format === 'cut'
    ? 'You get a zip with the printable and an SVG cut file for each page (every swatch outlined). Upload both to Cricut Design Space or Silhouette Studio for print-then-cut.'
    : 'Print at 100% (“actual size”). Sizes are real inches and millimeters.'}</p>`;
}

function renderAll() {
  rebuild();
  $('#st-controls', root).innerHTML = controlsHtml();
  renderPreview();
  renderExport();
}

function renderLive() {
  rebuild();
  $('#st-blocks', root).innerHTML = blocksHtml();
  renderPreview();
}

async function toBlob(pg, type) {
  let k = (st.dpi || 300) / 25.4;
  while (pg.w * k * pg.h * k > 30_000_000) k *= 0.85;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pg.w * k);
  canvas.height = Math.round(pg.h * k);
  drawCanvas(canvas.getContext('2d'), pg, { scale: k, background: '#FFFFFF' });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.93));
  releaseCanvas(canvas);
  return blob;
}

async function download(btn) {
  btn.disabled = true;
  try {
    await document.fonts?.ready;
    const base = studioFileName(st);
    const pages = built.pages;
    const files = [];
    if (st.out === 'pdf') {
      const pdf = buildPdf(pages, { title: base, creator: APP_NAME });
      files.push({ name: `${base}.pdf`, data: pdf, blob: new Blob([pdf], { type: 'application/pdf' }) });
    } else {
      const type = st.out === 'jpg' ? 'image/jpeg' : 'image/png';
      for (const pg of pages) {
        const blob = await toBlob(pg, type);
        files.push({ name: `${base} – ${pg.meta.label}.${st.out}`, data: new Uint8Array(await blob.arrayBuffer()), blob });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (st.format === 'cut') {
      pages.forEach((pg) => {
        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${toSvg(cutPage(pg), { units: 'mm', bg: null, title: `Cut lines – ${pg.meta.label}`, idPrefix: 'cut' })}`;
        files.push({ name: `${base} – cut lines – ${pg.meta.label}.svg`, data: svg });
      });
    }
    if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
    else downloadBlob(new Blob([createZip(files.map((f) => ({ name: f.name, data: f.data })))], { type: 'application/zip' }), `${base}.zip`);
    toast(st.out === 'pdf' ? 'Saved! Print at 100% size.' : 'Saved!');
  } catch (e) {
    console.error(e);
    toast('Sorry, that could not be made. Try PDF, or fewer pages.');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- events ---------- */

function setPath(path, value) {
  const [a, b] = path.split('.');
  if (b) st[a] = { ...st[a], [b]: value };
  else st[a] = value;
}

function onClick(e) {
  const t = e.target;
  const set = t.closest('[data-set]');
  if (set) {
    st[set.dataset.set] = set.dataset.value;
    if (set.dataset.set === 'out' || set.dataset.set === 'format') { save(); renderExport(); return; }
    st.page = 0; save(); renderAll(); return;
  }
  const preset = t.closest('[data-preset]');
  if (preset) { st.blocks = blocksFor(Number(preset.dataset.preset), st.blocks[0]?.shape ?? 'rect'); st.page = 0; save(); renderAll(); return; }
  const step = t.closest('[data-blk-step]');
  if (step) {
    const i = Number(step.dataset.i);
    const room = TOTAL_MAX - totalOf(st) + st.blocks[i].count;
    st.blocks[i] = { ...st.blocks[i], count: Math.min(BLOCK_MAX, room, Math.max(BLOCK_MIN, st.blocks[i].count + Number(step.dataset.blkStep))) };
    save(); renderAll(); return;
  }
  const add = t.closest('[data-blk-add]');
  if (add) { st.blocks = [...st.blocks, { count: Math.min(12, TOTAL_MAX - totalOf(st)), shape: st.blocks[st.blocks.length - 1].shape }]; save(); renderAll(); return; }
  const rm = t.closest('[data-blk-remove]');
  if (rm) { st.blocks = st.blocks.filter((_, i) => i !== Number(rm.dataset.blkRemove)); st.page = 0; save(); renderAll(); return; }
  const shapeAll = t.closest('[data-shape-all]');
  if (shapeAll) { st.blocks = st.blocks.map((b) => ({ ...b, shape: shapeAll.dataset.shapeAll })); save(); renderAll(); return; }
  const pg = t.closest('[data-page]');
  if (pg) { st.page = Math.min(built.pages.length - 1, Math.max(0, st.page + Number(pg.dataset.page))); renderPreview(); return; }
  if (t.closest('[data-open-print]')) { import('./printui.js').then((m) => m.openPrint()); return; }
  const dl = t.closest('#st-download');
  if (dl) download(dl);
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.toggle) { setPath(t.dataset.toggle, t.checked); st.page = 0; save(); renderAll(); return; }
  if (t.dataset.blkShape != null) { const i = Number(t.dataset.blkShape); st.blocks[i] = { ...st.blocks[i], shape: t.value }; save(); renderAll(); return; }
  if (t.dataset.blkCount != null) { save(); renderAll(); } // settle the number once you leave the box
}

function onInput(e) {
  const t = e.target;
  if (t.dataset.blkCount == null) return;
  const i = Number(t.dataset.blkCount);
  const v = Math.round(Number(t.value));
  if (!Number.isFinite(v) || v < BLOCK_MIN) return;
  const room = TOTAL_MAX - totalOf(st) + st.blocks[i].count;
  st.blocks[i] = { ...st.blocks[i], count: Math.min(BLOCK_MAX, room, v) };
  st.page = 0;
  // update the preview as you type, without redrawing the box you are typing in
  rebuild();
  renderPreview();
  const note = $('#st-total', root);
  if (note) note.innerHTML = totalText();
}

/** Show the Studio (called each time its tab opens). */
export function showStudio(el) {
  root = el;
  if (!ready) {
    ready = true;
    st = { ...normalizeBlank(prefs.studio ?? {}), out: ['pdf', 'png', 'jpg'].includes(prefs.studio?.out) ? prefs.studio.out : 'pdf', dpi: 300, page: 0 };
    root.innerHTML = `
      <div class="pstudio-head">
        <h1 class="display" id="studio-title">Studio</h1>
        <p class="muted">Make printables for swatching your paints, pencils and markers, with a live preview.</p>
      </div>
      <div class="pstudio glass">
        <div class="print">
          <div class="print-controls" id="st-controls"></div>
          <div class="print-side">
            <div class="print-preview" id="st-preview"></div>
            <div class="print-nav" id="st-nav"></div>
            <div id="st-notes"></div>
            <div class="print-export" id="st-export"></div>
          </div>
        </div>
      </div>`;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
  }
  renderAll();
}
