// "Palette in context": see a palette on real compositions (a coloring page,
// wall art, a website, a room…), repaint shapes by tapping, and save the result.
import { TEMPLATES, getTemplate, buildArtwork, artworkChecks } from './artwork.js';
import { toSvg, drawCanvas, fitInto, outlineItems, S } from './scene.js';
import { buildPdf } from './pdf.js';
import { openDialog, esc, toast, haptic, ICONS } from './ui.js';
import { downloadBlob, safeFileName } from './export.js';
import { ratioText } from './contrast.js';
import { releaseCanvas } from './lifecycle.js';
import { APP_NAME } from './meta.js';

const KEEP = { keepFill: true }; // coloring-page ink lines, keeping any paint

const gradeClass = (g) => `g-${g.toLowerCase().replace(/\s+/g, '-')}`;

export function openContext(palette, { template = 'bouquet' } = {}) {
  const colors = palette.colors.map((c) => c.hex);
  const st = { tpl: getTemplate(template).id, seed: 0, dark: false, coloring: false, brush: null, paint: {}, history: [] };
  const keyOf = (tpl = st.tpl, col = st.coloring) => `${tpl}|${col ? 'c' : 'n'}`;
  const overrides = () => (st.paint[keyOf()] ||= {});
  const build = (tplId = st.tpl, extra = {}) => buildArtwork(getTemplate(tplId), {
    colors, seed: st.seed, dark: st.dark, coloring: st.coloring, overrides: st.paint[keyOf(tplId)] || {}, ...extra,
  });

  const dlg = openDialog({
    title: 'Palette in context',
    cls: 'sheet sheet-wide',
    html: `<div class="ctx">
      <div class="ctx-main">
        <div class="ctx-stage" id="ctx-stage" role="img"></div>
        <div id="ctx-checks" class="ctx-checks"></div>
      </div>
      <div class="ctx-side">
        <section class="dlg-section"><h3>Choose a picture</h3><div class="ctx-thumbs" id="ctx-thumbs"></div></section>
        <section class="dlg-section">
          <h3>Paint with</h3>
          <div class="ctx-brush" id="ctx-brush"></div>
          <p class="dlg-note" id="ctx-hint"></p>
        </section>
        <section class="dlg-section">
          <div class="dlg-actions">
            <button type="button" class="btn btn-glass btn-sm" data-do="shuffle">${ICONS.shuffle} Shuffle arrangement</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="dark" aria-pressed="false">Dark version</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="coloring" aria-pressed="false">${ICONS.brush} Coloring page</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="undo">Undo</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="clear">Clear paint</button>
          </div>
        </section>
        <section class="dlg-section">
          <h3>Save this picture</h3>
          <div class="dlg-actions">
            <button type="button" class="btn btn-primary btn-sm" data-do="png">${ICONS.download} PNG</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="pdf">${ICONS.download} PDF</button>
            <button type="button" class="btn btn-glass btn-sm" data-do="svg">${ICONS.download} SVG</button>
          </div>
          <p class="dlg-note">The example artwork is for previewing your palette. Pictures you save are fine for personal use and your own projects; please don't sell the artwork itself.</p>
        </section>
      </div>
    </div>`,
  });
  const $ = (sel) => dlg.querySelector(sel);

  function renderStage() {
    const { page, hex } = build();
    const tpl = getTemplate(st.tpl);
    const stage = $('#ctx-stage');
    stage.setAttribute('aria-label', `${tpl.name} painted with ${palette.name}`);
    stage.innerHTML = toSvg(page, { units: 'none', outline: st.coloring ? KEEP : false, bg: st.coloring ? '#FFFFFF' : null, cls: 'ctx-svg', idPrefix: 'cx' });
    stage.classList.toggle('is-painting', !!st.brush);
    const checks = artworkChecks(tpl, hex);
    $('#ctx-checks').innerHTML = !st.coloring && checks.length
      ? `<p class="dlg-note">Can you read the text? (WCAG contrast)</p>${checks.map((c) => `<span class="ctx-check"><i style="background:${c.bg};color:${c.fg}">Aa</i>${esc(c.label)} <b>${ratioText(c.ratio)}</b> <span class="grade ${gradeClass(c.grade)}">${c.grade}</span></span>`).join('')}`
      : '';
  }

  function renderThumbs() {
    $('#ctx-thumbs').innerHTML = TEMPLATES.map((t) => {
      const { page } = buildArtwork(t, { colors, seed: st.seed, dark: st.dark });
      return `<button type="button" class="ctx-thumb ${t.id === st.tpl ? 'is-on' : ''}" data-tpl="${t.id}" title="${esc(t.name)} · ${esc(t.kind)}" aria-label="${esc(t.name)}" aria-pressed="${t.id === st.tpl}">
        ${toSvg(page, { units: 'none', idPrefix: `th${t.id}` })}<span>${esc(t.name)}</span></button>`;
    }).join('');
  }

  function renderBrush() {
    $('#ctx-brush').innerHTML = palette.colors.map((c) => `<button type="button" class="brush ${st.brush === c.hex ? 'is-on' : ''}" style="background:${c.hex}" data-brush="${c.hex}" title="${esc(c.name)} ${c.hex}" aria-label="${esc(c.name)}" aria-pressed="${st.brush === c.hex}"></button>`).join('');
    $('#ctx-hint').textContent = st.coloring
      ? 'Pick a color, then tap a shape to color it in. Save it as a PNG, or as a blank page to color with your own supplies.'
      : 'Pick a color, then tap a shape in the picture to repaint it. Or shuffle for a new arrangement.';
    $('[data-do="dark"]').setAttribute('aria-pressed', st.dark);
    $('[data-do="coloring"]').setAttribute('aria-pressed', st.coloring);
  }

  const renderAll = () => { renderThumbs(); renderBrush(); renderStage(); };
  renderAll();

  $('#ctx-stage').addEventListener('click', (e) => {
    const region = e.target.closest('[data-r]');
    if (!region) return;
    if (!st.brush) { toast('Pick a color under “Paint with” first, then tap the picture.'); return; }
    const o = overrides();
    st.history.push({ k: keyOf(), rid: region.dataset.r, prev: o[region.dataset.r] });
    o[region.dataset.r] = st.brush;
    haptic(6);
    renderStage();
  });

  async function exportAs(kind) {
    const tpl = getTemplate(st.tpl);
    const { page } = build();
    const name = `${safeFileName(palette.name)} – ${tpl.name}${st.coloring ? ' (coloring page)' : ''}`;
    const outline = st.coloring ? KEEP : false;
    try {
      if (kind === 'svg') {
        downloadBlob(new Blob([toSvg(page, { units: 'px', outline, bg: '#FFFFFF', title: `${tpl.name} painted with ${palette.name}`, idPrefix: 'ex' })], { type: 'image/svg+xml' }), `${name}.svg`);
      } else if (kind === 'png') {
        await document.fonts?.ready;
        const W = 1800;
        const scale = W / page.w;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = Math.round(page.h * scale);
        drawCanvas(canvas.getContext('2d'), page, { scale, outline, background: '#FFFFFF' });
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        releaseCanvas(canvas);
        downloadBlob(blob, `${name}.png`);
      } else {
        const landscape = tpl.w > tpl.h * 1.1;
        const PW = landscape ? 279.4 : 215.9;
        const PH = landscape ? 215.9 : 279.4;
        const margin = 12;
        const base = st.coloring ? outlineItems(page.items, KEEP) : page.items;
        const items = fitInto(base, tpl.w, tpl.h, { x: margin, y: margin, w: PW - margin * 2, h: PH - margin * 2 - 22 });
        const sw = Math.min(16, (PW - margin * 2) / colors.length - 1);
        const strip = colors.flatMap((hex, i) => [
          S.rect(margin + i * (sw + 1), PH - margin - 16, sw, 9, { fill: hex, r: 1.5, stroke: '#00000022', sw: 0.2 }),
          S.text(hex, margin + i * (sw + 1) + sw / 2, PH - margin - 3.5, { size: 2.4, weight: 700, font: 'mono', anchor: 'middle', fill: '#4B5563' }),
        ]);
        const label = S.text(`${palette.name} · ${tpl.name} · ${APP_NAME}`, margin, PH - margin + 3, { size: 3.2, weight: 700, fill: '#6B7280' });
        const pdf = buildPdf([{ w: PW, h: PH, bg: '#FFFFFF', items: [...items, ...strip, label] }], { title: `${palette.name} – ${tpl.name}`, creator: APP_NAME });
        downloadBlob(new Blob([pdf], { type: 'application/pdf' }), `${name}.pdf`);
      }
    } catch (e) {
      console.error(e);
      toast('Sorry, that could not be saved. Please try another format.');
    }
  }

  dlg.addEventListener('click', (e) => {
    const thumb = e.target.closest('[data-tpl]');
    if (thumb) { st.tpl = thumb.dataset.tpl; renderAll(); return; }
    const brush = e.target.closest('[data-brush]');
    if (brush) { st.brush = st.brush === brush.dataset.brush ? null : brush.dataset.brush; renderBrush(); renderStage(); return; }
    const act = e.target.closest('[data-do]')?.dataset.do;
    if (!act) return;
    if (act === 'shuffle') { st.seed += 1; renderAll(); }
    else if (act === 'dark') { st.dark = !st.dark; renderAll(); }
    else if (act === 'coloring') {
      st.coloring = !st.coloring;
      if (st.coloring && !st.brush) st.brush = colors[0];
      renderAll();
    } else if (act === 'undo') {
      const last = st.history.pop();
      if (!last) { toast('Nothing to undo.'); return; }
      const o = st.paint[last.k] || {};
      if (last.prev === undefined) delete o[last.rid]; else o[last.rid] = last.prev;
      renderStage();
    } else if (act === 'clear') { st.paint[keyOf()] = {}; renderStage(); }
    else exportAs(act);
  });
}
