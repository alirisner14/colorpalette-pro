import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SET_SIZES, TOTAL_MAX, MIN_CHIP, PER_PAGE_MAX, blocksFor, normalizeBlank, totalOf, buildBlankPages, parseColorList,
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
const words = (pages) => pages.flatMap((pg) => pg.items.filter((it) => it.t === 'text').map((it) => it.text));

const VARIANTS = [
  {},
  { orient: 'landscape', info: { name: true, number: true }, infoPos: 'right', style: 'boxes' },
  { info: { name: true, number: true }, infoPos: 'top', header: { medium: true, brand: true, count: true } },
  { info: { name: false, number: false }, numbered: false, header: { medium: false, brand: false, count: false }, paper: 'a4' },
  { info: { name: true, number: false }, infoPos: 'left', sides: 'double', mode: 'fill' },
];

test('a set size is one block (one set, one header)', () => {
  for (const n of SET_SIZES) assert.deepEqual(blocksFor(n), [{ count: n }]);
});

test('options are tidied: 500 swatches in all, unknown shapes become chips, write in later by default', () => {
  const o = normalizeBlank({ shape: 'banana', blocks: [{ count: 400, shape: 'banana' }, { count: 300 }] });
  assert.equal(o.blocks[0].shape, 'rect');
  assert.equal(o.shape, 'rect');
  assert.equal(totalOf(o), TOTAL_MAX);
  const d = normalizeBlank({});
  assert.equal(d.blocks.length, 1);
  assert.equal(d.blocks[0].count, 24);
  assert.equal(d.mode, 'write');
  assert.equal(d.style, 'lines');
  assert.equal(normalizeBlank({ fill: 'boxes' }).style, 'boxes', 'settings saved by 1.3.0 still work');
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

test('blocks: each has its own header at its top, with space before the next block', () => {
  const r = buildBlankPages({
    blocks: [{ count: 24, medium: 'Colored pencil', brand: 'Brand A' }, { count: 36, medium: 'Alcohol marker', brand: 'Brand B' }],
    mode: 'fill', header: { medium: true, brand: true, count: false },
  });
  const items = r.pages[0].items;
  const mediums = items.filter((it) => it.t === 'text' && it.text === 'Medium:');
  assert.equal(mediums.length, 2, 'one header per block');
  assert.ok(words(r.pages).includes('Colored pencil') && words(r.pages).includes('Alcohol marker'), 'filled-in values are printed');
  const chips = items.filter((it) => it.t === 'rect' && it.stroke && it.r > 0 && it.w === it.h);
  const secondHeader = mediums[1].y;
  assert.equal(chips.filter((it) => it.y < secondHeader).length, 24, 'block 1 sits above block 2’s header');
  assert.equal(chips.filter((it) => it.y > secondHeader).length, 36);
});

test('a block that runs onto the next page repeats its header, marked continued', () => {
  const r = buildBlankPages({ blocks: [{ count: 300, brand: 'Big set' }], mode: 'fill', header: { medium: true, brand: true, count: true } });
  assert.ok(r.pages.length >= 2);
  r.pages.forEach((pg, i) => {
    const w = pg.items.filter((it) => it.t === 'text').map((it) => it.text);
    assert.ok(w.includes('Big set'), `page ${i + 1} names the set`);
    assert.equal(w.includes('(continued)'), i > 0);
  });
});

test('write in later leaves blank lines; fill in now prints what you typed', () => {
  const blocks = [{ count: 3, medium: 'Gouache', colors: [{ name: 'Crimson', number: '102' }, { name: 'Teal' }] }];
  const later = buildBlankPages({ blocks, mode: 'write', info: { name: true, number: true } });
  assert.ok(!['Gouache', 'Crimson', '102', 'Teal'].some((w) => words(later.pages).includes(w)));
  const now = buildBlankPages({ blocks, mode: 'fill', info: { name: true, number: true } });
  assert.ok(['Gouache', 'Crimson', '102', 'Teal'].every((w) => words(now.pages).includes(w)));
  const lines = now.pages[0].items.filter((it) => it.t === 'line').length;
  assert.ok(lines >= 3 * 2 + 1, 'every write-in still has its line, filled or not (and the header its rule)');
});

test('one shape for everything by default; a different shape per block when you ask for it', () => {
  const blocks = [{ count: 7, shape: 'rect' }, { count: 5, shape: 'heart' }];
  const same = buildBlankPages({ blocks, shape: 'star', info: { name: false, number: false } }).pages[0].items;
  assert.equal(same.filter((it) => it.t === 'path' && it.s !== 1).length, 12, 'all twelve are stars');
  const mixed = buildBlankPages({ blocks, mixShapes: true, info: { name: false, number: false } }).pages[0].items;
  assert.equal(mixed.filter((it) => it.t === 'rect' && it.stroke && it.w === it.h).length, 7);
  assert.equal(mixed.filter((it) => it.t === 'path' && it.s !== 1).length, 5);
});

test('pasted color lists are read in the common ways people write them', () => {
  assert.deepEqual(parseColorList('Crimson Red, PC924\nPC1005 Limepeel\nTeal\tB02\n\n  Sky Blue  '), [
    { name: 'Crimson Red', number: 'PC924' },
    { name: 'Limepeel', number: 'PC1005' },
    { name: 'Teal', number: 'B02' },
    { name: 'Sky Blue', number: '' },
  ]);
  assert.deepEqual(parseColorList('102, Crimson'), [{ name: 'Crimson', number: '102' }]);
});

test('portrait and landscape, Letter and A4, are the right size', () => {
  const p = buildBlankPages({ paper: 'letter' }).pages[0];
  assert.deepEqual([p.w, p.h], [215.9, 279.4]);
  const l = buildBlankPages({ paper: 'a4', orient: 'landscape' }).pages[0];
  assert.deepEqual([l.w, l.h], [297, 210]);
});

test('pages export: PDF, SVG and cut files', () => {
  const r = buildBlankPages({ blocks: blocksFor(150), sides: 'double', format: 'cut', mode: 'fill' });
  const pdf = buildPdf(r.pages, { title: 'Test' });
  assert.ok(pdf.length > 1000);
  r.pages.forEach((pg) => {
    assert.ok(toSvg(pg, { units: 'mm' }).includes('</svg>'));
    assert.ok(toSvg(cutPage(pg), { units: 'mm', bg: null }).includes('<path'));
  });
  assert.ok(r.notes.some((t) => /cut file/.test(t)));
});

test('the header prints the count already (the block size), unless you typed your own', () => {
  const plain = words(buildBlankPages({ blocks: [{ count: 18 }] }).pages);
  assert.ok(plain.includes('Count:') && plain.includes('18'));
  const typed = words(buildBlankPages({ blocks: [{ count: 18, setCount: '18 + 2 blenders' }], mode: 'fill' }).pages);
  assert.ok(typed.includes('18 + 2 blenders'));
});

test('swatch chart look: wide chips with a gray strip joined underneath to write on', () => {
  const r = buildBlankPages({ blocks: [{ count: 12 }], chip: 'wide', style: 'strip', info: { name: true, number: true }, mode: 'fill' });
  const items = r.pages[0].items;
  const chips = items.filter((it) => it.t === 'rect' && it.fill === '#FFFFFF' && it.stroke);
  const strips = items.filter((it) => it.t === 'rect' && it.fill === '#E3E6EB');
  assert.equal(chips.length, 12);
  assert.equal(strips.length, 12);
  chips.forEach((c) => assert.ok(Math.abs(c.w / c.h - 2) < 0.05, 'chips are about 2:1'));
  strips.forEach((s, i) => {
    assert.ok(Math.abs(s.y - (chips[i].y + chips[i].h)) < 0.5, 'the strip is joined to the chip');
    assert.ok(Math.abs(s.w - chips[i].w) < 0.01, 'and just as wide');
  });
  // hearts and stars stay their own shape even when chips are wide
  const hearts = buildBlankPages({ blocks: [{ count: 6 }], shape: 'heart', chip: 'wide', info: { name: false, number: false } }).pages[0].items.filter((it) => it.t === 'path' && it.s !== 1);
  assert.equal(hearts.length, 6);
});

test('repeat to fill the page: several sets of the same size, each with its own header', () => {
  const twelve = buildBlankPages({ blocks: [{ count: 12 }], repeat: true, chip: 'wide', style: 'strip' });
  assert.equal(twelve.pages.length, 1);
  const heads = twelve.pages[0].items.filter((it) => it.t === 'text' && it.text === 'Count:').length;
  assert.ok(heads >= 3, `${heads} sets of 12 on the page`);
  assert.equal(twelve.total, heads * 12);
  const many = buildBlankPages({ blocks: [{ count: 150 }], repeat: true });
  assert.equal(many.total, 150, 'a set that already fills the page is not repeated');
  const two = buildBlankPages({ blocks: [{ count: 12 }, { count: 24 }], repeat: true });
  assert.equal(two.total, 36, 'repeat is for a single block');
});

test('a part-filled last row is centered', () => {
  const items = buildBlankPages({ blocks: [{ count: 7 }], info: { name: false, number: false }, numbered: false }).pages[0].items;
  const chips = items.filter((it) => it.t === 'rect' && it.stroke).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [...new Set(chips.map((c) => Math.round(c.y)))];
  const center = (row) => { const cs = chips.filter((c) => Math.round(c.y) === row); return (Math.min(...cs.map((c) => c.x)) + Math.max(...cs.map((c) => c.x + c.w))) / 2; };
  assert.ok(rows.length >= 2);
  assert.ok(Math.abs(center(rows[0]) - center(rows[rows.length - 1])) < 0.5);
});
