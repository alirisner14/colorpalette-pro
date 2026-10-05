// Contrast checker dialog: which pairs of a palette's colors are readable as text.
import { summarize, bestTextOn, ratioText, gradeHint } from './contrast.js';
import { openDialog, esc, copyText } from './ui.js';

const FILTERS = [
  ['all', 'All pairs'],
  ['aa', 'Good for text'],
  ['large', 'Big text only'],
  ['fail', 'Low contrast'],
];
const gradeClass = (g) => `g-${g.toLowerCase().replace(/\s+/g, '-')}`;

const matches = (filter, pair) => {
  if (filter === 'aa') return pair.grade === 'AA' || pair.grade === 'AAA';
  if (filter === 'large') return pair.grade === 'AA Large';
  if (filter === 'fail') return pair.grade === 'Fail';
  return true;
};

function pairRow(pair) {
  const { a, b } = pair;
  return `<div class="cpair">
    <span class="cpair-samples">
      <span class="cpair-sample" style="background:${a.hex};color:${b.hex}">Aa</span>
      <span class="cpair-sample" style="background:${b.hex};color:${a.hex}">Aa</span>
    </span>
    <span class="cpair-names"><span><b>${esc(a.name)}</b> + <b>${esc(b.name)}</b></span><small>${a.hex} · ${b.hex}</small></span>
    <span class="cpair-ratio">${ratioText(pair.ratio)}</span>
    <span class="grade ${gradeClass(pair.grade)}" title="${esc(gradeHint[pair.grade])}">${pair.grade}</span>
  </div>`;
}

export function openContrast(palette) {
  const sum = summarize(palette.colors);
  let filter = sum.aa ? 'aa' : 'all';

  const best = palette.colors.map((c) => {
    const t = bestTextOn(c.hex, palette.colors);
    return `<button type="button" class="cbest" data-copy="${t.hex}" style="background:${c.hex};color:${t.hex}" title="Best text color on ${esc(c.name)}: ${t.hex} (${ratioText(t.ratio)}). Tap to copy.">
      <b>Aa</b><span>${t.hex}</span><small>${ratioText(t.ratio)}</small>
    </button>`;
  }).join('');

  const dlg = openDialog({
    title: 'Contrast checker',
    cls: 'sheet',
    html: `<div class="dlg-body">
      <p class="dlg-note"><b>${esc(palette.name)}</b>: <b>${sum.aa}</b> of ${sum.total} pairs read well as body text (WCAG AA), <b>${sum.aaa}</b> are excellent (AAA), and <b>${sum.large}</b> work for big or bold text.</p>
      <section class="dlg-section">
        <h3>Best text color on each color</h3>
        <div class="cbest-grid">${best}</div>
        <p class="dlg-note">Black, white or another color from this palette, whichever is easiest to read. Tap one to copy its code.</p>
      </section>
      <section class="dlg-section">
        <h3>Every pair</h3>
        <div class="fchips" id="cfilter"></div>
        <div id="clist" class="clist"></div>
      </section>
      <p class="dlg-note">Based on the WCAG 2 contrast formula, as a guide for choosing text colors. It is not a legal accessibility audit.</p>
    </div>`,
  });

  const draw = () => {
    dlg.querySelector('#cfilter').innerHTML = FILTERS.map(([id, label]) => {
      const n = sum.pairs.filter((p) => matches(id, p)).length;
      return `<button type="button" class="fchip ${id === filter ? 'is-on' : ''}" data-filter="${id}" aria-pressed="${id === filter}">${label} (${n})</button>`;
    }).join('');
    const rows = sum.pairs.filter((p) => matches(filter, p));
    dlg.querySelector('#clist').innerHTML = rows.length ? rows.map(pairRow).join('') : '<p class="dlg-note">No pairs in this group.</p>';
  };
  draw();

  dlg.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw(); return; }
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy);
  });
}
