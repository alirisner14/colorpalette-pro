import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, page, toSvg, transformItems, scalePage, fitInto, regionIds } from '../src/js/scene.js';
import { buildPdf, pathOps, pdfString } from '../src/js/pdf.js';
import { textWidth, fitSize, ellipsize, wrapText } from '../src/js/textmetrics.js';

function wellFormed(svg) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) return false; } else stack.push(name);
  }
  return stack.length === 0;
}

const sample = () => page(100, 80, [
  S.rect(5, 5, 40, 30, { fill: '#FF8FB1', r: 4, rid: 'a' }),
  S.circle(70, 20, 10, { fill: '#7FD8BE', stroke: '#000000', sw: 0.5 }),
  S.ellipse(70, 60, 12, 6, { fill: '#B79CFF', op: 0.5 }),
  S.path('M0 0 L10 0 L10 10 Q5 15 0 10 Z', { fill: '#FFC75F', tx: 10, ty: 45, s: 2, stroke: '#111111', sw: 1 }),
  S.line(5, 70, 95, 70, { stroke: '#333333', sw: 0.3, dash: [2, 1] }),
  S.text('Pink (Bubble) \\ “café”', 5, 42, { size: 4, weight: 800, font: 'display', fill: '#1B2330' }),
  S.group([S.rect(0, 0, 5, 5, { fill: '#000000' })], { 'data-pid': 'p1', class: 'pb', onclick: 'alert(1)', tabindex: 0 }),
], { bg: '#FFFFFF' });

/* ---------- SVG ---------- */

test('SVG output is well formed, escaped and carries region ids', () => {
  const svg = toSvg(sample(), { title: 'Test <&> page' });
  assert.ok(wellFormed(svg));
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 80" width="100mm" height="80mm"/);
  assert.match(svg, /<title>Test &lt;&amp;&gt; page<\/title>/);
  assert.match(svg, /data-r="a"/);
  assert.match(svg, /Pink \(Bubble\) \\ “café”/);
  assert.ok(!svg.includes('onclick'), 'unsafe group attributes are dropped');
  assert.match(svg, /data-pid="p1"/);
  assert.match(svg, /transform="translate\(10 45\) scale\(2\)"/);
  assert.match(svg, /stroke-width="0\.5"[^>]*d="M0 0|d="M0 0[^>]*stroke-width="0\.5"/, 'stroke width is divided by the path scale');
  assert.equal(toSvg(sample(), { units: 'none' }).includes('width="100mm"'), false);
  assert.ok(toSvg(sample(), { bg: null }).indexOf('<rect width="100"') < 0, 'transparent background');
});

test('outline mode turns filled shapes into a coloring page', () => {
  const svg = toSvg(sample(), { outline: true });
  assert.ok(wellFormed(svg));
  assert.ok(!svg.includes('#FF8FB1') && !svg.includes('#7FD8BE'), 'fills are removed');
  assert.match(svg, /fill="#FFFFFF" stroke="#1B2330"/);
  assert.match(svg, /fill="#1B2330"[^>]*>Pink/, 'text becomes dark ink');
});

test('moving and scaling a scene moves every kind of item', () => {
  const items = sample().items;
  const out = transformItems(items, { k: 2, dx: 10, dy: 20 });
  assert.deepEqual([out[0].x, out[0].y, out[0].w, out[0].r], [20, 30, 80, 8]);
  assert.deepEqual([out[1].cx, out[1].cy, out[1].r, out[1].sw], [150, 60, 20, 1]);
  assert.deepEqual([out[3].tx, out[3].ty, out[3].s, out[3].sw], [30, 110, 4, 2]);
  assert.deepEqual([out[4].x1, out[4].x2, out[4].dash], [20, 200, [4, 2]]);
  assert.equal(out[5].size, 8);
  assert.equal(out[6].items[0].w, 10);
  assert.equal(items[0].x, 5, 'the original is untouched');
  const big = scalePage(sample(), 3);
  assert.deepEqual([big.w, big.h], [300, 240]);
  const fit = fitInto([S.rect(0, 0, 100, 50, { fill: '#000000' })], 100, 50, { x: 10, y: 10, w: 200, h: 200 });
  assert.deepEqual([fit[0].x, fit[0].y, fit[0].w, fit[0].h], [10, 60, 200, 100], 'centred and not stretched');
  assert.deepEqual([...regionIds(sample().items)], ['a']);
});

/* ---------- text widths ---------- */

test('text widths follow Helvetica', () => {
  assert.ok(Math.abs(textWidth('Hello', 10) - 22.78) < 0.01);
  assert.ok(textWidth('Hello', 10, { weight: 700 }) > textWidth('Hello', 10));
  assert.ok(textWidth('Hello', 10, { font: 'display' }) > textWidth('Hello', 10, { weight: 700 }));
  assert.equal(textWidth('abcd', 10, { font: 'mono' }), 24);
  assert.equal(fitSize('Hi', 10, 100), 10);
  assert.ok(fitSize('A very long palette name indeed', 10, 40) < 10);
  assert.equal(fitSize('A very long palette name indeed', 10, 1, { min: 3 }), 3);
  assert.ok(ellipsize('A very long palette name indeed', 4, 30).endsWith('…'));
  assert.equal(ellipsize('Short', 4, 100), 'Short');
  const lines = wrapText('Electric Forget-Me-Not Blue', 4, 35, { maxLines: 2 });
  assert.ok(lines.length <= 2 && lines.every((l) => textWidth(l, 4) <= 35));
});

/* ---------- PDF ---------- */

const latin1 = (u8) => Array.from(u8, (b) => String.fromCharCode(b)).join('');

function checkPdf(u8, pageCount) {
  const text = latin1(u8);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref', 'startxref points at the table');
  const size = Number(/\/Size (\d+)/.exec(text)[1]);
  const entries = text.slice(startxref).split('\n').slice(3, 3 + size - 1);
  assert.equal(entries.length, size - 1);
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    assert.equal(text.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} is where the table says`);
  });
  assert.equal((text.match(/\/Type \/Page /g) || []).length, pageCount);
  assert.match(text, new RegExp(`/Count ${pageCount}`));
  // every content stream's /Length is exact
  for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(text.slice(start + Number(m[1]), start + Number(m[1]) + 10), '\nendstream', 'stream length');
  }
  return text;
}

test('PDFs have a valid structure and draw every item type', () => {
  const pdf = buildPdf([sample(), sample()], { title: 'Café “test”' });
  const text = checkPdf(pdf, 2);
  assert.match(text, /\/MediaBox \[0 0 283\.465 226\.772\]/);
  assert.match(text, /\/ExtGState/);
  assert.match(text, /\/Title <FEFF/);
  assert.match(text, /\(Pink \\\(Bubble\\\) \\\\ \x93caf\xE9\x94\) Tj/, 'parentheses and backslashes are escaped; accents use WinAnsi');
  assert.match(text, / re\n/, 'plain rectangles');
  assert.match(text, /\bB\b|\bf\b/);
  assert.match(text, /\[2 1\] 0 d/, 'dashes');
  assert.match(text, /BT \/F2 4 Tf 1 0 0 -1 /, 'display text uses bold Helvetica, upright under the flipped page');
});

test('PDF page sizes follow the scene', () => {
  const pdf = latin1(buildPdf([page(215.9, 279.4, [S.rect(10, 10, 20, 20, { fill: '#FF0000' })], { bg: '#FFFFFF' })]));
  assert.match(pdf, /\/MediaBox \[0 0 612\.0?\d* 792\.0?\d*\]/.source ? /\/MediaBox \[0 0 612\.\d+ 792\.\d+\]|\/MediaBox \[0 0 612 792\]/ : /x/);
});

test('path parsing handles the commands the app uses', () => {
  assert.deepEqual(pathOps('M10 20 L30 40 Z'), ['10 20 m', '30 40 l', 'h']);
  assert.deepEqual(pathOps('M0 0 C1 1 2 2 3 3'), ['0 0 m', '1 1 2 2 3 3 c']);
  assert.deepEqual(pathOps('M0 0 L1 1 2 2'), ['0 0 m', '1 1 l', '2 2 l'], 'extra pairs repeat the command');
  assert.deepEqual(pathOps('M10 10 l5 0 v5 h-5 z'), ['10 10 m', '15 10 l', '15 15 l', '10 15 l', 'h']);
  const q = pathOps('M0 0 Q3 0 3 3');
  assert.equal(q[1], '2 0 3 1 3 3 c', 'quadratic curves become cubic');
  assert.throws(() => pathOps('M0 0 A5 5 0 0 1 10 10'), /Unsupported/);
  assert.equal(pdfString('a(b)c\\'), '(a\\(b\\)c\\\\)');
  assert.equal(pdfString('Zoë ★'), '(Zo\xEB ?)');
});

test('an even-odd path with a hole uses the even-odd operator', () => {
  const hole = page(50, 50, [S.path('M0 0 L40 0 L40 40 L0 40 Z M10 10 L30 10 L30 30 L10 30 Z', { fill: '#FFFFFF', rule: 'evenodd', tx: 5, ty: 5 })]);
  assert.match(latin1(buildPdf([hole])), /\nf\*\nQ/);
  assert.match(toSvg(hole), /fill-rule="evenodd"/);
});
