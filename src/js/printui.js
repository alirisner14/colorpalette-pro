// "Print & cut": make a printable swatch deck or book, with a live preview, and
// save it as PDF, SVG (colors or cut lines only), PNG or JPG.
import { book, prefs, persistPrefs } from './store.js';
import {
  KINDS, PAPERS, buildPrint, cutPage, normalizePrintOptions, effectiveOptions, printFileName,
} from './printable.js';
import { PRINT_SHAPES } from './sheet.js';
import { TEMPLATES } from './artwork.js';
import { toSvg, drawCanvas } from './scene.js';
import { buildPdf } from './pdf.js';
import { createZip } from './zip.js';
import { stripHtml } from './render.js';
import { openDialog, esc, toast, ICONS } from './ui.js';
import { downloadBlob, safeFileName } from './export.js';
import { releaseCanvas } from './lifecycle.js';
import { segHtml, toggleHtml, shapeGridHtml } from './uikit.js';
import { APP_NAME } from './meta.js';

const HOLE_LABELS = [['none', 'No hole'], ['tl', 'Top left'], ['tm', 'Top middle'], ['tr', 'Top right']];
const HOLE_SIZE_LABELS = [['s', 'Small ⅛″'], ['m', 'Medium ¼″'], ['l', 'Large ⅜″']];

const seg = segHtml;
const toggle = toggleHtml;

/**
 * @param {{ palettes?: object[], format?: 'deck'|'book' }} opts palettes preselected (studio palettes need not be saved)
 */
export function openPrint({ palettes = [], format } = {}) {
  // Everything that can be printed: the swatch book, plus anything passed in.
  const library = new Map();
  book.sections.forEach((s) => s.ids.forEach((id) => library.set(id, book.palettes[id])));
  palettes.forEach((p) => library.set(p.id, p));
  const st = { ...normalizePrintOptions(prefs.printOpts ?? {}), sel: new Set(palettes.map((p) => p.id)), page: 0, out: 'pdf', dpi: 300, transparent: false, cutOnly: false, pagesWhich: 'all' };
  if (format) st.format = format;
  if (!st.sel.size && library.size) library.forEach((_, id) => st.sel.add(id));

  const dlg = openDialog({
    title: 'Print & cut',
    cls: 'sheet sheet-wide print-dlg',
    html: '<div class="print"><div class="print-controls" id="pc"></div><div class="print-side"><div class="print-preview" id="pv"></div><div class="print-nav" id="pn"></div><div id="pnotes"></div><div class="print-export" id="pe"></div></div></div>',
  });
  const $ = (sel) => dlg.querySelector(sel);

  const chosen = () => [...library.values()].filter((p) => st.sel.has(p.id));
  const options = () => ({
    format: st.format, kind: st.kind, style: st.style, paper: st.paper, orient: st.orient, shapes: st.shapes, showName: st.showName,
    showColorNames: st.showColorNames, showHex: st.showHex, showRgb: st.showRgb, perUnit: st.perUnit, blank: st.blank, hole: st.hole,
    holeSize: st.holeSize, guides: st.guides, medium: st.medium, total: st.total, perPage: st.perPage, artwork: st.artwork, artTemplate: st.artTemplate,
  });
  const save = () => persistPrefs({ printOpts: options() });

  let built = null;
  function rebuild() {
    built = buildPrint(options(), chosen());
    if (st.page >= built.pages.length) st.page = Math.max(0, built.pages.length - 1);
  }

  /* ---------- the controls ---------- */
  function controlsHtml() {
    const o = effectiveOptions(options());
    const custom = st.style === 'custom';
    const swatch = st.kind === 'swatch';
    const list = [...library.values()].map((p) => `<label class="plist-row"><input type="checkbox" data-pal="${p.id}" ${st.sel.has(p.id) ? 'checked' : ''} aria-label="Print ${esc(p.name)}"><span class="imp-strip">${stripHtml(p)}</span><span class="plist-name">${esc(p.name)}</span><small>${p.colors.length}</small></label>`).join('');

    return `
      <section class="dlg-section"><h3>1. Deck or book?</h3>
        ${seg('format', st.format, [['deck', 'Swatch deck (blades)'], ['book', 'Swatch book (pages)']])}
        <p class="dlg-note">${st.format === 'deck' ? 'Blades you cut out and fasten together through the hole with a ring or screw, like a paint-chip fan deck.' : 'Pages that you punch and bind into a book.'}</p>
      </section>
      <section class="dlg-section"><h3>2. What is it for?</h3>
        <div class="kind-grid">${KINDS.map((k) => `<button type="button" class="kind ${k.id === st.kind ? 'is-on' : ''}" data-set="kind" data-value="${k.id}" aria-pressed="${k.id === st.kind}"><b>${k.label}</b><span>${k.blurb}</span></button>`).join('')}</div>
      </section>
      ${swatch ? '' : `<section class="dlg-section"><h3>3. Which palettes?</h3>
        ${library.size ? `<div class="dlg-actions"><button type="button" class="btn btn-glass btn-sm" data-pal-all="1">Select all</button><button type="button" class="btn btn-glass btn-sm" data-pal-all="0">None</button></div><div class="plist">${list}</div>`
    : '<p class="dlg-note">You have no saved palettes yet. Save some to your swatch book (★) and they will show up here.</p>'}
      </section>`}
      <section class="dlg-section"><h3>${swatch ? '3' : '4'}. Style</h3>
        ${seg('style', st.style, [['simple', 'Simple'], ['custom', 'Customize']])}
        <p class="dlg-note">${custom ? 'Choose shapes, what to show, how many go on each blade or page, and more.' : 'Squares and rectangles with everything you need. Switch to Customize for more.'}</p>
      </section>
      <section class="dlg-section"><h3>Punch hole</h3>
        ${seg('hole', st.hole, HOLE_LABELS)}
        ${custom && st.hole !== 'none' ? seg('holeSize', st.holeSize, HOLE_SIZE_LABELS) : ''}
        <p class="dlg-note">${st.hole === 'none' ? 'No hole.' : 'A circle at the top for a hole punch, or a cut line for a cutting machine.'}</p>
      </section>
      <section class="dlg-section"><h3>Paper</h3>
        ${seg('paper', st.paper, Object.entries(PAPERS).map(([id, p]) => [id, id === 'letter' ? 'US Letter' : 'A4']))}
        ${st.format === 'book' ? seg('orient', st.orient, [['portrait', 'Portrait'], ['landscape', 'Landscape']]) : ''}
      </section>
      ${custom ? customHtml(o, swatch) : ''}`;
  }

  function customHtml(o, swatch) {
    const shapes = shapeGridHtml(PRINT_SHAPES, st.shapes);
    const medium = swatch ? `
      <section class="dlg-section"><h3>About your supplies</h3>
        <div class="field-row">
          <label>Medium<input class="text-input sm" data-med="medium" value="${esc(st.medium.medium)}" maxlength="40" placeholder="Alcohol markers"></label>
          <label>Brand<input class="text-input sm" data-med="brand" value="${esc(st.medium.brand)}" maxlength="40" placeholder="Ohuhu"></label>
        </div>
        <div class="field-row">
          <label>Set or count<input class="text-input sm" data-med="count" value="${esc(st.medium.count)}" maxlength="30" placeholder="60 colors"></label>
          <label>Notes<input class="text-input sm" data-med="notes" value="${esc(st.medium.notes)}" maxlength="60" placeholder="swatched on cardstock"></label>
        </div>
      </section>
      <section class="dlg-section"><h3>How many?</h3>
        <div class="field-row">
          <label>Total swatches<input class="text-input sm" type="number" min="1" max="400" data-num="total" value="${st.total}"></label>
          <label>${st.format === 'deck' ? 'Per blade' : 'Per page'}<input class="text-input sm" type="number" min="1" max="60" data-num="perPage" value="${st.perPage ?? (st.format === 'deck' ? 8 : 12)}"></label>
        </div>
        <p class="dlg-note">Sizes adjust to fit, and the preview updates as you type.</p>
      </section>` : '';
    const show = `
      <section class="dlg-section"><h3>What to show</h3>
        ${toggle('showName', swatch ? 'Title' : 'Palette name', st.showName)}
        ${swatch ? '' : `${toggle('showColorNames', 'Color names', st.showColorNames)}${toggle('showHex', 'HEX codes', st.showHex)}${toggle('showRgb', 'RGB codes', st.showRgb)}`}
      </section>`;
    const per = swatch ? '' : `
      <section class="dlg-section"><h3>${st.format === 'deck' ? 'Palettes per blade' : 'Palettes per page'}</h3>
        <div class="stepper"><button type="button" class="icon-btn sm" data-step="-1" aria-label="Fewer">−</button><output>${st.perUnit}</output><button type="button" class="icon-btn sm" data-step="1" aria-label="More">+</button></div>
        <p class="dlg-note">1 palette per ${st.format === 'deck' ? 'blade' : 'page'} is the default. More fit smaller.</p>
      </section>`;
    const blank = st.kind === 'match' ? `
      <section class="dlg-section"><h3>Blank swatching spot</h3>
        ${seg('blank', st.blank, [['beside', 'Beside each color'], ['back', 'On the back (two-sided)']])}
        <p class="dlg-note">${st.blank === 'back' ? 'Print on both sides. Each blank spot lands right behind its color.' : 'Each color has a blank spot next to it so you can compare your own paint.'}</p>
      </section>` : '';
    const art = st.format === 'book' && !swatch ? `
      <section class="dlg-section"><h3>Example artwork</h3>
        ${toggle('artwork', 'Add a page of example artwork after each palette page', st.artwork)}
        ${st.artwork ? `<label class="field"><span class="field-label">Picture</span><span class="select-wrap glass-inset"><select data-sel="artTemplate"><option value="auto" ${st.artTemplate === 'auto' ? 'selected' : ''}>Mix it up</option>${TEMPLATES.map((t) => `<option value="${t.id}" ${st.artTemplate === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></span></label>` : ''}
      </section>` : '';
    return `<section class="dlg-section"><h3>Shapes</h3>${shapes}<p class="dlg-note">Pick one or several. Chips take turns in the shapes you choose.</p></section>${show}${per}${blank}${medium}${art}
      <section class="dlg-section">${toggle('guides', 'Show cut guides', st.guides, 'Thin gray outlines to cut along')}</section>`;
  }

  /* ---------- the preview ---------- */
  function renderPreview() {
    const pages = built.pages;
    const pv = $('#pv');
    if (!pages.length) {
      pv.innerHTML = '<p class="dlg-note pv-empty">Nothing to print yet. Choose at least one palette on the left.</p>';
      $('#pn').innerHTML = '';
      $('#pnotes').innerHTML = built.notes.map((n) => `<p class="imp-note">${esc(n)}</p>`).join('');
      return;
    }
    const pg = pages[st.page];
    pv.innerHTML = `<div class="pv-sheet" style="aspect-ratio:${pg.w} / ${pg.h}">${toSvg(pg, { units: 'none', title: pg.meta.label, idPrefix: 'pv' })}</div>`;
    $('#pn').innerHTML = `<button type="button" class="icon-btn sm" data-page="-1" aria-label="Previous page" ${st.page === 0 ? 'disabled' : ''}>‹</button><span>${esc(pg.meta.label)} <small>(${st.page + 1} of ${pages.length})</small></span><button type="button" class="icon-btn sm" data-page="1" aria-label="Next page" ${st.page === pages.length - 1 ? 'disabled' : ''}>›</button>`;
    $('#pnotes').innerHTML = built.notes.map((n) => `<p class="imp-note">${esc(n)}</p>`).join('');
  }

  function renderExport() {
    const raster = st.out === 'png' || st.out === 'jpg';
    $('#pe').innerHTML = `
      <div class="seg-inline" role="radiogroup" aria-label="File type">${[['pdf', 'PDF'], ['svg', 'SVG'], ['png', 'PNG'], ['jpg', 'JPG']].map(([id, l]) => `<button type="button" role="radio" class="${st.out === id ? 'is-on' : ''}" aria-checked="${st.out === id}" data-out="${id}">${l}</button>`).join('')}</div>
      <div class="export-opts">
        ${st.out === 'svg' ? toggle('cutOnly', 'Cut lines only', st.cutOnly, 'Black shapes with the holes cut out, for cutting machines') : ''}
        ${st.out === 'png' ? toggle('transparent', 'Transparent background', st.transparent, 'Best for Print Then Cut') : ''}
        ${raster ? `<div class="seg-inline" role="radiogroup" aria-label="Quality">${[[200, 'Standard'], [300, 'High']].map(([d, l]) => `<button type="button" role="radio" class="${st.dpi === d ? 'is-on' : ''}" aria-checked="${st.dpi === d}" data-dpi="${d}">${l} (${d} dpi)</button>`).join('')}</div>` : ''}
        ${st.out !== 'pdf' && built.pages.length > 1 ? seg('pagesWhich', st.pagesWhich, [['all', `All ${built.pages.length} pages (zip)`], ['this', 'This page only']]) : ''}
      </div>
      <button type="button" class="btn btn-primary btn-wide" id="do-export" ${built.pages.length ? '' : 'disabled'}>${ICONS.download} Save ${st.out.toUpperCase()}</button>
      <p class="dlg-note">${st.out === 'pdf' ? 'Print at 100% (“actual size”). Sizes are in real inches and millimeters.' : st.out === 'svg' ? (st.cutOnly ? 'Upload this to your cutting machine to cut the blade outlines and holes.' : 'Colors and lines, for editing or printing. Text uses your computer’s fonts unless you convert it to outlines.') : 'Print this, or for Cricut and similar machines upload the transparent PNG for Print Then Cut.'}</p>`;
  }

  function renderAll() {
    rebuild();
    $('#pc').innerHTML = controlsHtml();
    renderPreview();
    renderExport();
  }

  /* ---------- exporting ---------- */
  async function toBlob(pg, type, transparent) {
    const scale = st.dpi / 25.4;
    let k = scale;
    while (pg.w * k * pg.h * k > 30_000_000) k *= 0.85; // keep within what browsers can allocate
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pg.w * k);
    canvas.height = Math.round(pg.h * k);
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    drawCanvas(ctx, pg, { scale: k, background: transparent ? null : '#FFFFFF' });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.93));
    releaseCanvas(canvas);
    return blob;
  }

  async function exportNow() {
    const btn = $('#do-export');
    btn.disabled = true;
    const base = safeFileName(printFileName(effectiveOptions(options())));
    const all = st.out === 'pdf' || st.pagesWhich === 'all';
    const pages = all ? built.pages : [built.pages[st.page]];
    try {
      if (st.out === 'pdf') {
        const pdf = buildPdf(pages, { title: base, creator: APP_NAME });
        downloadBlob(new Blob([pdf], { type: 'application/pdf' }), `${base}.pdf`);
      } else {
        const files = [];
        for (let i = 0; i < pages.length; i++) {
          if (pages.length > 3) toast(`Making page ${i + 1} of ${pages.length}…`, { ms: 1200 });
          const pg = pages[i];
          const name = `${base} – ${pages.length > 1 || !all ? safeFileName(pg.meta.label) : 'page'}`;
          if (st.out === 'svg') {
            const svg = toSvg(st.cutOnly ? cutPage(pg) : pg, { units: 'mm', bg: st.cutOnly ? null : '#FFFFFF', title: pg.meta.label, idPrefix: 'ex' });
            files.push({ name: `${name}.svg`, data: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, blob: new Blob([svg], { type: 'image/svg+xml' }) });
          } else {
            const type = st.out === 'jpg' ? 'image/jpeg' : 'image/png';
            const blob = await toBlob(pg, type, st.out === 'png' && st.transparent);
            files.push({ name: `${name}.${st.out}`, data: new Uint8Array(await blob.arrayBuffer()), blob });
          }
          await new Promise((r) => setTimeout(r, 0)); // let the browser breathe between pages
        }
        if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
        else downloadBlob(new Blob([createZip(files.map((f) => ({ name: f.name, data: f.data })))], { type: 'application/zip' }), `${base}.zip`);
      }
      toast(st.out === 'pdf' ? 'Saved your PDF. Print at 100% size.' : 'Saved!');
    } catch (e) {
      console.error(e);
      toast('Sorry, that could not be made. Try fewer pages or a lower quality.');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- events ---------- */
  let timer;
  const refresh = (full) => {
    save();
    if (full) { renderAll(); return; }
    clearTimeout(timer);
    timer = setTimeout(() => { rebuild(); renderPreview(); renderExport(); }, 120);
  };

  dlg.addEventListener('click', (e) => {
    const set = e.target.closest('[data-set]');
    if (set) {
      const { set: key, value } = set.dataset;
      st[key] = value;
      if (key === 'kind') {
        // each kind starts with its own idea of what to show
        const d = normalizePrintOptions({ kind: value });
        Object.assign(st, { showName: d.showName, showColorNames: d.showColorNames, showHex: d.showHex, showRgb: d.showRgb });
        if (value !== 'match') st.blank = 'beside';
      }
      st.page = 0;
      refresh(true);
      return;
    }
    const shape = e.target.closest('[data-shape]');
    if (shape) {
      const id = shape.dataset.shape;
      const has = st.shapes.includes(id);
      if (has && st.shapes.length === 1) return;
      st.shapes = has ? st.shapes.filter((s) => s !== id) : [...st.shapes, id];
      refresh(true);
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) { st.perUnit = Math.min(6, Math.max(1, st.perUnit + Number(step.dataset.step))); refresh(true); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) { st.page = Math.min(built.pages.length - 1, Math.max(0, st.page + Number(pg.dataset.page))); renderPreview(); return; }
    const out = e.target.closest('[data-out]');
    if (out) { st.out = out.dataset.out; renderExport(); return; }
    const dpi = e.target.closest('[data-dpi]');
    if (dpi) { st.dpi = Number(dpi.dataset.dpi); renderExport(); return; }
    const all = e.target.closest('[data-pal-all]');
    if (all) { library.forEach((_, id) => (all.dataset.palAll === '1' ? st.sel.add(id) : st.sel.delete(id))); refresh(true); return; }
    if (e.target.closest('#do-export')) exportNow();
  });

  dlg.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pal) { if (t.checked) st.sel.add(t.dataset.pal); else st.sel.delete(t.dataset.pal); st.page = 0; refresh(false); return; }
    if (t.dataset.toggle) {
      const key = t.dataset.toggle;
      st[key] = t.checked;
      if (key === 'cutOnly' || key === 'transparent') { renderExport(); return; } // export-only choices
      st.page = 0;
      refresh(key === 'artwork'); // the artwork switch reveals a picker
      return;
    }
    if (t.dataset.sel) { st[t.dataset.sel] = t.value; refresh(false); return; }
  });

  dlg.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.med) { st.medium = { ...st.medium, [t.dataset.med]: t.value }; refresh(false); }
    if (t.dataset.num) {
      const v = Math.round(Number(t.value));
      if (Number.isFinite(v) && v > 0) { st[t.dataset.num] = v; refresh(false); }
    }
  });

  renderAll();
}
