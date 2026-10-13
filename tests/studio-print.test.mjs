import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SET_SIZES, TOTAL_MAX, BLOCK_MAX, MIN_CHIP, PER_PAGE_MAX, blocksFor, normalizeBlank, totalOf, buildBlankPages,
} from '../src/js/studio.js';
import { buildPdf } from '../src/js/pdf.js';
import { toSvg } from '../src/js/scene.js';
import { cutPage } from '../src/js/printable.js';
import { bbox } from './helpers.mjs';

const MARGIN = 10;
/** Everything on the page sits inside the printer-safe margins. */
function assertInMargins(pg, label) {
  for (const it of pg.items) {
    const [x0, y0, x1, y1] = bbox(it);
    assert.ok(x0 >= MARGIN - 1.2 && y0 >= MARGIN - 1.2 && x1 <= pg.w - MARGIN + 1.2 && y1 <= pg.h - MARGIN + 2, `${label}: ${it.t} outside the margins ${[x0, y0, x1, y1].map((v) => v.toFixed(1))}`);
  }
}

const VARIANTS = [
  {},
  { orient: 'landscape', info: { name: true, number: true }, infoPos: 'right', fill: 'boxes' },
  { info: { name: true, number: true }, infoPos: 'top', header: { medium: true, brand: true, count: true } },
  { info: { name: false, number: false }, numbered: false, header: { medium: false, brand: false, count: false }, paper: 'a4' },
  { info: { name: true, number: false }, infoPos: 'left', sides: 'double' },
];

test('set sizes split into blocks of at most 72, adding up to the size', () => {
  for (const n of SET_SIZES) {
    const blocks = blocksFor(n);
    assert.equal(blocks.reduce((t, b) => t + b.count, 0), n);
    assert.ok(blocks.every((b) => b.count <= BLOCK_MAX));
  }
});

test('options are tidied: blocks capped at 72 each and 500 in all, unknown shapes become chips', () => {
  const o = normalizeBlank({ blocks: [{ count: 99, shape: 'banana' }, ...Array.from({ length: 10 }, () => ({ count: 72, shape: 'heart' }))] });
  assert.equal(o.blocks[0].count, BLOCK_MAX);
  assert.equal(o.blocks[0].shape, 'rect');
  assert.equal(totalOf(o), TOTAL_MAX);
  assert.deepEqual(normalizeBlank({}).blocks, [{ count: 24, shape: 'rect' }]);
});

test('every swatch is drawn once, numbered in order, inside the margins, with one cut outline each', () => {
  for (const n of SET_SIZES) {
    for (const [v, extra] of VARIANTS.entries()) {
      const r = buildBlankPages({ blocks: blocksFor(n), ...extra });
      const label = `${n} variant ${v}`;
      assert.equal(r.total, n, label);
      assert.equal(r.pages.reduce((t, pg) => t + pg.meta.cuts.length, 0), n, `${label}: one cut outline per swatch`);
      r.pages.forEach((pg) => assertInMargins(pg, `${label} ${pg.meta.label}`));
      assert.ok(r.chip >= MIN_CHIP - 0.01, `${label}: swatches ${r.chip} mm`);
      if (normalizeBlank(extra).numbered) {
        const nums = r.pages.flatMap((pg) => pg.items.filter((it) => it.t === 'text' && it.weight === 800 && /^\d+$/.test(it.text)).map((it) => Number(it.text)));
        assert.deepEqual(nums, Array.from({ length: n }, (_, i) => i + 1), `${label}: numbered 1 to ${n}`);
      }
    }
  }
});

test('page rules: up to 150 fit one page, 240 and up need several, double-sided uses front and back', () => {
  for (const n of [12, 24, 36, 48, 72, 100, 120, 150]) assert.equal(buildBlankPages({ blocks: blocksFor(n) }).pages.length, 1, `${n}`);
  for (const n of [240, 300, 400, 500]) assert.ok(buildBlankPages({ blocks: blocksFor(n) }).pages.length >= 2, `${n}`);
  for (const n of [24, 150, 240, 500]) {
    const r = buildBlankPages({ blocks: blocksFor(n), sides: 'double' });
    assert.equal(r.pages.length % 2, 0, `${n}: double-sided makes whole sheets`);
    assert.equal(r.sheets, r.pages.length / 2);
    assert.equal(r.pages[0].meta.side, 'front');
    assert.equal(r.pages[1].meta.side, 'back');
    assert.ok(r.notes.some((t) => /double-sided/.test(t)));
    r.pages.forEach((pg) => assert.ok(pg.meta.cuts.length <= PER_PAGE_MAX));
  }
});

test('mix and match: each block keeps its own shape, and a new block starts on a new row', () => {
  const r = buildBlankPages({ blocks: [{ count: 7, shape: 'rect' }, { count: 5, shape: 'heart' }], info: { name: false, number: false } });
  const items = r.pages[0].items;
  const rects = items.filter((it) => it.t === 'rect' && it.stroke);
  const hearts = items.filter((it) => it.t === 'path' && it.s !== 1);
  assert.equal(rects.length, 7);
  assert.equal(hearts.length, 5);
  const lastChipBottom = Math.max(...rects.map((it) => it.y + it.h));
  assert.ok(hearts.every((it) => it.ty > lastChipBottom), 'the hearts begin below the chips');
});

test('portrait and landscape, Letter and A4, are the right size', () => {
  const p = buildBlankPages({ paper: 'letter' }).pages[0];
  assert.deepEqual([p.w, p.h], [215.9, 279.4]);
  const l = buildBlankPages({ paper: 'a4', orient: 'landscape' }).pages[0];
  assert.deepEqual([l.w, l.h], [297, 210]);
});

test('the header only shows what you tick, and fill-ins can be lines or boxes', () => {
  const words = (r) => r.pages[0].items.filter((it) => it.t === 'text').map((it) => it.text);
  const all = buildBlankPages({ header: { medium: true, brand: true, count: true } });
  assert.ok(['Medium', 'Brand', 'Count'].every((w) => words(all).includes(w)));
  const none = buildBlankPages({ header: { medium: false, brand: false, count: false } });
  assert.ok(!['Medium', 'Brand', 'Count'].some((w) => words(none).includes(w)));
  const lines = buildBlankPages({ fill: 'lines' }).pages[0].items.filter((it) => it.t === 'line').length;
  const boxes = buildBlankPages({ fill: 'boxes' }).pages[0].items.filter((it) => it.t === 'line').length;
  assert.ok(lines > 0 && boxes === 0);
});

test('pages export: PDF, SVG and cut files', () => {
  const r = buildBlankPages({ blocks: blocksFor(150), sides: 'double', format: 'cut' });
  const pdf = buildPdf(r.pages, { title: 'Test' });
  assert.ok(pdf.length > 1000);
  r.pages.forEach((pg) => {
    assert.ok(toSvg(pg, { units: 'mm' }).includes('</svg>'));
    assert.ok(toSvg(cutPage(pg), { units: 'mm', bg: null }).includes('<path'));
  });
  assert.ok(r.notes.some((t) => /cut file/.test(t)));
});
