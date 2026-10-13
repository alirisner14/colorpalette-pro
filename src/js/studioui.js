// The Studio screen: build printables with a live preview. Phase 1: DIY blank swatch pages.
import { prefs, persistPrefs } from './store.js';
import {
  SET_SIZES, BLOCK_MIN, BLOCK_MAX, TOTAL_MAX, TEXT_MAX, blocksFor, normalizeBlank, totalOf, buildBlankPages, studioFileName, parseColorList,
} from './studio.js';
import { BRAND_SETS } from './brandsets.js';
import { PAPERS, cutPage } from './printable.js';
import { PRINT_SHAPES } from './sheet.js';
import { toSvg, drawCanvas } from './scene.js';
import { buildPdf } from './pdf.js';
import { createZip } from './zip.js';
import { esc, toast, ICONS, openDialog } from './ui.js';
import { downloadBlob } from './export.js';
import { releaseCanvas } from './lifecycle.js';
import { segHtml as seg, toggleHtml as toggle, shapeIconHtml } from './uikit.js';
import { APP_NAME } from './meta.js';

/** What the Studio can make. The rest arrive in the next updates. */
const TYPES = [
  { id: 'blank-pages', label: 'DIY blank swatch pages', blurb: 'Blank swatches to paint, color or mark, in blocks (one per set you own), each with its medium, brand and count.' },
  { id: 'blank-deck', label: 'DIY blank swatch deck', soon: true },
  { id: 'match-pages', label: 'Match supplies to palettes: pages', soon: true },
  { id: 'match-deck', label: 'Match supplies to palettes: deck', soon: true },
  { id: 'palette-pages', label: 'Saved palettes: pages', soon: true },
  { id: 'palette-deck', label: 'Saved palettes: deck', soon: true },
];
const OUTS = [['pdf', 'PDF'], ['svg', 'SVG'], ['png', 'PNG'], ['jpg', 'JPG']];

const $ = (sel, root = document) => root.querySelector(sel);

let root = null;
let st = null;
let built = null;
let ready = false;

/* The screen keeps a few export choices alongside the printable's own options. */
const EXPORT_KEYS = ['out', 'dpi', 'cutOnly', 'transparent', 'pagesWhich'];

function save() {
  const keep = { ...normalizeBlank(st) };
  EXPORT_KEYS.forEach((k) => { keep[k] = st[k]; });
  persistPrefs({ studio: keep });
}

function rebuild() {
  built = buildBlankPages(st);
  st.page = Math.min(st.page, built.pages.length - 1);
}

/* ---------- controls ---------- */

function blockCard(b, i) {
  const total = totalOf(st);
  const fill = st.mode === 'fill';
  const heads = [['medium', 'Medium', 'Watercolor, colored pencil…'], ['brand', 'Brand', 'Prismacolor, Ohuhu…'], ['count', 'Count', '24']]
    .filter(([k]) => st.header[k]);
  const filled = b.colors.filter((c) => c.name || c.number).length;
  return `
    <div class="st-block">
      <div class="st-block-top">
        <b>Block ${i + 1}</b>
        <div class="stepper">
          <button type="button" class="icon-btn sm" data-blk-step="-1" data-i="${i}" aria-label="Fewer swatches in block ${i + 1}" ${b.count <= BLOCK_MIN ? 'disabled' : ''}>−</button>
          <input type="number" inputmode="numeric" min="${BLOCK_MIN}" max="${BLOCK_MAX}" value="${b.count}" data-blk-count="${i}" aria-label="Swatches in block ${i + 1}">
          <button type="button" class="icon-btn sm" data-blk-step="1" data-i="${i}" aria-label="More swatches in block ${i + 1}" ${b.count >= BLOCK_MAX || total >= TOTAL_MAX ? 'disabled' : ''}>+</button>
        </div>
        <span class="muted">swatches</span>
        ${st.blocks.length > 1 ? `<button type="button" class="icon-btn sm st-blk-x" data-blk-remove="${i}" aria-label="Remove block ${i + 1}" title="Remove this block">${ICONS.close}</button>` : ''}
      </div>
      ${st.mixShapes ? `<span class="select-wrap glass-inset st-shape-sel"><select data-blk-shape="${i}" aria-label="Shape for block ${i + 1}">${PRINT_SHAPES.map((s) => `<option value="${s.id}" ${s.id === b.shape ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></span>` : ''}
      ${fill && heads.length ? `<div class="st-heads">${heads.map(([k, label, ph]) => `<label class="st-in"><span>${label}</span><input type="text" maxlength="${TEXT_MAX}" data-blk-field="${k === 'count' ? 'setCount' : k}" data-i="${i}" value="${esc(k === 'count' ? b.setCount : b[k])}" placeholder="${esc(ph)}"></label>`).join('')}</div>` : ''}
      ${fill && (st.info.name || st.info.number) ? `<button type="button" class="btn btn-glass btn-sm" data-colors="${i}">${ICONS.pencil} Color names &amp; numbers${filled ? ` · ${filled} of ${b.count} filled` : ''}</button>` : ''}
    </div>`;
}

function blocksHtml() {
  const total = totalOf(st);
  return `${st.blocks.map(blockCard).join('')}
    <button type="button" class="btn btn-glass btn-sm" data-blk-add ${total >= TOTAL_MAX ? 'disabled' : ''}>+ Add a block</button>
    <p class="dlg-note" id="st-total">${totalText()}</p>`;
}

/** "36 swatches · 1 page · swatches about 31 mm across" */
function totalText() {
  const pages = built.pages.length;
  const fitText = st.sides === 'double'
    ? `${built.sheets} sheet${built.sheets === 1 ? '' : 's'}, printed on both sides`
    : `${pages} page${pages === 1 ? '' : 's'}`;
  const sets = st.repeat && st.blocks.length === 1 && built.total > st.blocks[0].count ? ` (${built.total / st.blocks[0].count} sets of ${st.blocks[0].count})` : '';
  return `<b>${built.total} swatches</b>${sets} · ${fitText} · swatches about ${Math.round(built.chip)} mm (${(built.chip / 25.4).toFixed(2)}″) across`;
}

function controlsHtml() {
  const fill = st.mode === 'fill';
  return `
    <section class="dlg-section"><h3>What are you making?</h3>
      <div class="st-types">${TYPES.map((t) => `<button type="button" class="st-type ${t.id === 'blank-pages' ? 'is-on' : ''}" ${t.soon ? 'disabled' : ''} aria-pressed="${t.id === 'blank-pages'}"><b>${esc(t.label)}</b>${t.soon ? '<small>Coming soon</small>' : ''}</button>`).join('')}</div>
      <p class="dlg-note">${esc(TYPES[0].blurb)} Need palette pages or a deck today? Use <button type="button" class="link-btn" data-open-print>Print &amp; cut</button>.</p>
    </section>
    <section class="dlg-section"><h3>Paper</h3>
      ${seg('paper', st.paper, Object.entries(PAPERS).map(([id, p]) => [id, p.label]), 'Paper size')}
      ${seg('orient', st.orient, [['portrait', 'Portrait'], ['landscape', 'Landscape']], 'Orientation')}
      ${seg('sides', st.sides, [['single', 'Single-sided'], ['double', 'Double-sided']], 'Sides')}
      <p class="dlg-note">Up to 150 swatches fit on one page; double-sided spreads them over the front and back (recommended for 150). Bigger sets go over several pages.</p>
    </section>
    <section class="dlg-section"><h3>Write-ins</h3>
      ${seg('mode', st.mode, [['write', 'Write in later'], ['fill', 'Fill in now']], 'Write-ins')}
      <p class="dlg-note">${fill ? 'Type the medium, brand, count and color names in the app, and they print on the lines. Anything left empty stays a blank line to write on.' : 'Blank lines (or boxes) where you choose, to write on by hand.'}</p>
      ${seg('style', st.style, [['lines', 'Lines'], ['boxes', 'Boxes'], ['strip', 'Strip']], 'Write-in style')}
      ${st.style === 'strip' ? '<p class="dlg-note">A gray strip joined under each swatch, for the color name (and number, split off at the right).</p>' : ''}
      <h4 class="st-h4">At the top of each block</h4>
      ${toggle('header.medium', 'Medium', st.header.medium, 'Watercolor, gouache, pencils…')}
      ${toggle('header.brand', 'Brand', st.header.brand)}
      ${toggle('header.count', 'Count', st.header.count, 'How many colors in the set')}
      <h4 class="st-h4">With each swatch</h4>
      ${toggle('numbered', 'Number the swatches', st.numbered, '1, 2, 3…')}
      ${toggle('info.name', 'Color name', st.info.name)}
      ${toggle('info.number', 'Color number', st.info.number, 'The maker’s number, like 102 or PC924')}
      ${st.style === 'strip' ? '' : seg('infoPos', st.infoPos, [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], 'Where the color info goes')}
    </section>
    <section class="dlg-section"><h3>Swatches</h3>
      <div class="fchips st-presets" role="group" aria-label="Common set sizes">${SET_SIZES.map((n) => `<button type="button" class="fchip" data-preset="${n}">${n}</button>`).join('')}</div>
      <p class="dlg-note">Pick a set size, or build it from blocks: one block per set you own (24 pencils, then 36 markers…), each with its own medium and brand at the top.</p>
      <div id="st-blocks">${blocksHtml()}</div>
    </section>
    <section class="dlg-section"><h3>Shape</h3>
      <div class="shape-grid">${PRINT_SHAPES.map((s) => `<button type="button" class="shape-pick ${st.shape === s.id ? 'is-on' : ''}" data-shape-all="${s.id}" aria-pressed="${st.shape === s.id}" title="${esc(s.label)}">${shapeIconHtml(s)}<span>${esc(s.label)}</span></button>`).join('')}</div>
      ${(st.mixShapes ? st.blocks.some((b) => b.shape === 'rect') : st.shape === 'rect') ? seg('chip', st.chip, [['square', 'Square chips'], ['wide', 'Wide chips']], 'Chip shape') : ''}
      ${toggle('mixShapes', 'A different shape for each block', st.mixShapes)}
      ${st.blocks.length === 1 ? toggle('repeat', 'Repeat this set to fill the page', st.repeat, 'Several blank sets of the same size on one sheet (4 of 12, 3 of 18…)') : ''}
    </section>`;
}

/* ---------- preview and export ---------- */

function renderPreview() {
  const pg = built.pages[st.page];
  $('#st-preview', root).innerHTML = `<div class="pv-sheet" style="aspect-ratio:${pg.w} / ${pg.h};--ar:${(pg.w / pg.h).toFixed(4)}">${toSvg(pg, { units: 'none', title: pg.meta.label, idPrefix: 'stp' })}</div>`;
  const n = built.pages.length;
  $('#st-nav', root).innerHTML = n > 1
    ? `<button type="button" class="icon-btn sm" data-page="-1" aria-label="Previous page" ${st.page === 0 ? 'disabled' : ''}>‹</button><span>${esc(pg.meta.label)}</span><button type="button" class="icon-btn sm" data-page="1" aria-label="Next page" ${st.page === n - 1 ? 'disabled' : ''}>›</button>`
    : `<span>${esc(pg.meta.label)}</span>`;
  $('#st-notes', root).innerHTML = built.notes.map((t) => `<p class="imp-note">${esc(t)}</p>`).join('');
}

function renderExport() {
  const raster = st.out === 'png' || st.out === 'jpg';
  const many = built.pages.length > 1;
  const cut = st.format === 'cut';
  const what = st.out === 'svg' && st.cutOnly ? 'cut lines (SVG)' : `${st.out.toUpperCase()}${cut ? ' + cut file' : ''}`;
  $('#st-export', root).innerHTML = `
    <h3 class="st-h3">Format</h3>
    ${seg('format', st.format, [['print', 'Print'], ['cut', 'Print & cut']], 'Format')}
    ${seg('out', st.out, OUTS, 'File type')}
    <div class="export-opts">
      ${st.out === 'svg' ? toggle('cutOnly', 'Cut lines only', st.cutOnly, 'Just the swatch outlines, for cutting machines') : ''}
      ${st.out === 'png' ? toggle('transparent', 'Transparent background', st.transparent, 'Best for Print Then Cut') : ''}
      ${raster ? seg('dpi', String(st.dpi), [['200', 'Standard (200 dpi)'], ['300', 'High (300 dpi)']], 'Quality') : ''}
      ${st.out !== 'pdf' && many ? seg('pagesWhich', st.pagesWhich, [['all', `All ${built.pages.length} pages (zip)`], ['this', 'This page only']], 'Pages') : ''}
    </div>
    <button type="button" class="btn btn-primary btn-wide" id="st-download">${ICONS.download} Save ${what}</button>
    <p class="dlg-note">${cut
    ? 'Print & cut adds an SVG cut file for each page (every swatch outlined) to a zip with your printable. Upload to Cricut Design Space or Silhouette Studio; for Print Then Cut, a transparent PNG works best.'
    : st.out === 'svg' ? 'For cutting machine apps, or for editing. Text uses your computer’s fonts unless you convert it to outlines.'
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
  renderPreview();
  const note = $('#st-total', root);
  if (note) note.innerHTML = totalText();
}

async function toBlob(pg, type, transparent) {
  let k = (Number(st.dpi) || 300) / 25.4;
  while (pg.w * k * pg.h * k > 30_000_000) k *= 0.85;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pg.w * k);
  canvas.height = Math.round(pg.h * k);
  const ctx = canvas.getContext('2d');
  drawCanvas(ctx, pg, { scale: k, background: transparent ? null : '#FFFFFF' });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.93));
  releaseCanvas(canvas);
  return blob;
}

const cutSvg = (pg) => `<?xml version="1.0" encoding="UTF-8"?>\n${toSvg(cutPage(pg), { units: 'mm', bg: null, title: `Cut lines – ${pg.meta.label}`, idPrefix: 'cut' })}`;

async function download(btn) {
  btn.disabled = true;
  try {
    await document.fonts?.ready;
    const base = studioFileName(st);
    const pages = st.out === 'pdf' || st.pagesWhich === 'all' ? built.pages : [built.pages[st.page]];
    const name = (pg) => `${base} – ${pg.meta.label}`;
    const files = [];
    if (st.out === 'pdf') {
      const pdf = buildPdf(pages, { title: base, creator: APP_NAME });
      files.push({ name: `${base}.pdf`, data: pdf, blob: new Blob([pdf], { type: 'application/pdf' }) });
    } else if (st.out === 'svg') {
      pages.forEach((pg) => {
        const svg = st.cutOnly ? cutSvg(pg) : `<?xml version="1.0" encoding="UTF-8"?>\n${toSvg(pg, { units: 'mm', bg: '#FFFFFF', title: pg.meta.label, idPrefix: 'ex' })}`;
        files.push({ name: `${name(pg)}${st.cutOnly ? ' – cut lines' : ''}.svg`, data: svg, blob: new Blob([svg], { type: 'image/svg+xml' }) });
      });
    } else {
      const type = st.out === 'jpg' ? 'image/jpeg' : 'image/png';
      for (const pg of pages) {
        if (pages.length > 3) toast(`Making page ${files.length + 1} of ${pages.length}…`, { ms: 1200 });
        const blob = await toBlob(pg, type, st.out === 'png' && st.transparent);
        files.push({ name: `${name(pg)}.${st.out}`, data: new Uint8Array(await blob.arrayBuffer()), blob });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (st.format === 'cut' && !(st.out === 'svg' && st.cutOnly)) {
      pages.forEach((pg) => files.push({ name: `${name(pg)} – cut lines.svg`, data: cutSvg(pg) }));
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

/* ---------- color names and numbers for a block ---------- */

function openColors(i) {
  const b = st.blocks[i];
  const rows = Array.from({ length: b.count }, (_, k) => b.colors[k] ?? { name: '', number: '' });
  const sets = BRAND_SETS.filter((s) => s.colors.length);
  const dlg = openDialog({
    title: `Block ${i + 1}: color names & numbers`,
    cls: 'sheet',
    html: `<div class="dlg-body">
      ${sets.length ? `<section class="dlg-section"><h3>Fill in from a brand set</h3>
        <span class="select-wrap glass-inset"><select id="st-brandset"><option value="">Choose a set…</option>${sets.map((s, k) => `<option value="${k}">${esc(s.label)} (${s.colors.length})</option>`).join('')}</select></span></section>` : ''}
      <section class="dlg-section"><h3>Paste a list</h3>
        <textarea id="st-paste" rows="4" placeholder="One color per line, like:&#10;Crimson Red, PC924&#10;PC1005 Limepeel" class="text-input"></textarea>
        <button type="button" class="btn btn-glass btn-sm" data-do="paste">Fill in from this list</button>
      </section>
      <section class="dlg-section"><h3>Or type them in</h3>
        <div class="st-colors">${rows.map((c, k) => `<div class="st-color"><b>${k + 1}</b><input type="text" maxlength="${TEXT_MAX}" data-c="${k}" data-f="name" value="${esc(c.name)}" placeholder="Name" aria-label="Color ${k + 1} name"><input type="text" maxlength="${TEXT_MAX}" data-c="${k}" data-f="number" value="${esc(c.number)}" placeholder="No." aria-label="Color ${k + 1} number"></div>`).join('')}</div>
      </section>
      <div class="dlg-actions"><button type="button" class="btn btn-glass btn-sm" data-do="clear">Clear all</button><button type="button" class="btn btn-primary" data-do="done">Done</button></div>
    </div>`,
    onClose: () => { save(); renderAll(); },
  });
  const commit = () => { st.blocks[i] = { ...st.blocks[i], colors: rows.map((c) => ({ ...c })) }; renderLive(); };
  const fillFrom = (list) => {
    list.slice(0, b.count).forEach((c, k) => { rows[k] = { name: c.name ?? '', number: c.number ?? '' }; });
    dlg.querySelectorAll('[data-c]').forEach((el) => { el.value = rows[Number(el.dataset.c)][el.dataset.f]; });
    commit();
    toast(`Filled in ${Math.min(list.length, b.count)} color${list.length === 1 ? '' : 's'}.`);
  };
  dlg.addEventListener('input', (e) => {
    const el = e.target.closest('[data-c]');
    if (!el) return;
    rows[Number(el.dataset.c)] = { ...rows[Number(el.dataset.c)], [el.dataset.f]: el.value };
    commit();
  });
  dlg.addEventListener('change', (e) => {
    if (e.target.id !== 'st-brandset' || e.target.value === '') return;
    const set = sets[Number(e.target.value)];
    if (!st.blocks[i].brand && set.brand) st.blocks[i] = { ...st.blocks[i], brand: set.brand, medium: st.blocks[i].medium || set.medium || '' };
    fillFrom(set.colors);
  });
  dlg.addEventListener('click', (e) => {
    const act = e.target.closest('[data-do]')?.dataset.do;
    if (act === 'paste') fillFrom(parseColorList($('#st-paste', dlg).value));
    else if (act === 'clear') fillFrom(Array.from({ length: b.count }, () => ({ name: '', number: '' })));
    else if (act === 'done') dlg.close();
  });
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
    const key = set.dataset.set;
    st[key] = key === 'dpi' ? Number(set.dataset.value) : set.dataset.value;
    save();
    if (EXPORT_KEYS.includes(key) || key === 'format') { if (key === 'format') rebuild(); renderExport(); if (key === 'format') renderPreview(); return; }
    st.page = 0;
    renderAll();
    return;
  }
  const preset = t.closest('[data-preset]');
  if (preset) {
    // keep each block's header and colors where there is a block to keep them in
    st.blocks = blocksFor(Number(preset.dataset.preset)).map((b, i) => ({ ...(st.blocks[i] ?? {}), count: b.count }));
    st.page = 0; save(); renderAll(); return;
  }
  const step = t.closest('[data-blk-step]');
  if (step) {
    const i = Number(step.dataset.i);
    const room = TOTAL_MAX - totalOf(st) + st.blocks[i].count;
    st.blocks[i] = { ...st.blocks[i], count: Math.min(BLOCK_MAX, room, Math.max(BLOCK_MIN, st.blocks[i].count + Number(step.dataset.blkStep))) };
    save(); renderAll(); return;
  }
  if (t.closest('[data-blk-add]')) {
    const last = st.blocks[st.blocks.length - 1];
    st.blocks = [...st.blocks, { count: Math.min(24, TOTAL_MAX - totalOf(st)), shape: last.shape, medium: last.medium, colors: [] }];
    save(); renderAll(); return;
  }
  const rm = t.closest('[data-blk-remove]');
  if (rm) { st.blocks = st.blocks.filter((_, i) => i !== Number(rm.dataset.blkRemove)); st.page = 0; save(); renderAll(); return; }
  const shapeAll = t.closest('[data-shape-all]');
  if (shapeAll) { st.shape = shapeAll.dataset.shapeAll; st.blocks = st.blocks.map((b) => ({ ...b, shape: st.shape })); save(); renderAll(); return; }
  const colors = t.closest('[data-colors]');
  if (colors) { openColors(Number(colors.dataset.colors)); return; }
  const pg = t.closest('[data-page]');
  if (pg) { st.page = Math.min(built.pages.length - 1, Math.max(0, st.page + Number(pg.dataset.page))); renderPreview(); return; }
  if (t.closest('[data-open-print]')) { import('./printui.js').then((m) => m.openPrint()); return; }
  const dl = t.closest('#st-download');
  if (dl) download(dl);
}

function onChange(e) {
  const t = e.target;
  if (t.dataset.toggle) {
    setPath(t.dataset.toggle, t.checked);
    save();
    if (['cutOnly', 'transparent'].includes(t.dataset.toggle)) { renderExport(); return; }
    st.page = 0;
    renderAll();
    return;
  }
  if (t.dataset.blkShape != null) { const i = Number(t.dataset.blkShape); st.blocks[i] = { ...st.blocks[i], shape: t.value }; save(); renderAll(); return; }
  if (t.dataset.blkCount != null || t.dataset.blkField != null) { save(); renderAll(); } // settle once you leave the box
}

function onInput(e) {
  const t = e.target;
  if (t.dataset.blkField != null) {
    const i = Number(t.dataset.i);
    st.blocks[i] = { ...st.blocks[i], [t.dataset.blkField]: t.value };
    renderLive();
    return;
  }
  if (t.dataset.blkCount == null) return;
  const i = Number(t.dataset.blkCount);
  const v = Math.round(Number(t.value));
  if (!Number.isFinite(v) || v < BLOCK_MIN) return;
  const room = TOTAL_MAX - totalOf(st) + st.blocks[i].count;
  st.blocks[i] = { ...st.blocks[i], count: Math.min(BLOCK_MAX, room, v) };
  st.page = 0;
  renderLive(); // update the preview as you type, without redrawing the box you are typing in
}

/** Show the Studio (called each time its tab opens). */
export function showStudio(el) {
  root = el;
  if (!ready) {
    ready = true;
    const saved = prefs.studio ?? {};
    st = {
      ...normalizeBlank(saved),
      out: OUTS.some(([id]) => id === saved.out) ? saved.out : 'pdf',
      dpi: saved.dpi === 200 ? 200 : 300,
      cutOnly: !!saved.cutOnly,
      transparent: !!saved.transparent,
      pagesWhich: saved.pagesWhich === 'this' ? 'this' : 'all',
      page: 0,
    };
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
