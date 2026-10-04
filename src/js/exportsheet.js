// The export sheet: every format, grouped by where people use it.
import { FORMATS, getFormat } from './formats.js';
import { buildExport, deliver } from './export.js';
import { $, esc, toast, copyText, haptic } from './ui.js';

const GLYPHS = {
  procreate: 'Pc', ase: 'Ai', aco: 'Ps', gpl: 'Gp', sketch: 'Sk', svg: 'Fg', canva: '#', paintnet: 'Pn', jpg: 'Jp', png: 'Pg', css: '{}', json: '[]',
};

export function formatButton(f, cls = 'fmt') {
  return `<button type="button" class="${cls}" data-format="${f.id}">
    <span class="fmt-glyph" aria-hidden="true">${GLYPHS[f.id] ?? '•'}</span>
    <span class="fmt-text"><span class="fmt-label">${esc(f.label)} <span class="fmt-ext">${f.ext}</span></span><span class="fmt-apps">${esc(f.apps)}</span></span>
  </button>`;
}

/** Export a palette in one format and tell the user how it went. */
export async function runExport(palette, formatId, shapeId) {
  const f = getFormat(formatId);
  try {
    if (f.image) toast('Painting your image…');
    const out = await buildExport(palette, formatId, shapeId);
    if (f.copy && out.text) await copyText(palette.colors.map((c) => c.hex).join('\n'), 'hex codes — paste them into Canva');
    const how = await deliver(out);
    haptic(12);
    if (how === 'downloaded' && !f.copy) {
      toast(formatId === 'procreate' ? 'Saved! Open the .swatches file on your iPad to add it to Procreate.' : `Saved ${out.filename}`);
    }
  } catch (e) {
    console.error(e);
    toast('Sorry — that export failed. Please try another format.');
  }
}

let current = null;

export function openExportSheet(palette, shapeId) {
  current = { palette, shapeId };
  const dlg = $('#export-dialog');
  $('#export-title').textContent = `Export “${palette.name}”`;
  const groups = [...new Set(FORMATS.map((f) => f.group))];
  $('#export-list').innerHTML = groups.map((g) => `<section class="fmt-group">
      <h3>${esc(g)}</h3>
      <div class="fmt-grid">${FORMATS.filter((f) => f.group === g).map((f) => formatButton(f)).join('')}</div>
    </section>`).join('');
  dlg.showModal();
}

export function initExportSheet() {
  $('#export-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (!b || !current) return;
    $('#export-dialog').close();
    runExport(current.palette, b.dataset.format, current.shapeId);
  });
}
