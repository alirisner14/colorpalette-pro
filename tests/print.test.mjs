import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSvg, regionIds } from '../src/js/scene.js';
import { buildPdf } from '../src/js/pdf.js';
import { layoutBlock, paletteCells, swatchCells, bladeItems, bookPageItems, PRINT_SHAPES, rrectPath, circlePath } from '../src/js/sheet.js';
import {
  buildPrint, defaultPrintOptions, effectiveOptions, normalizePrintOptions, cutPage, PAPERS, KINDS,
} from '../src/js/printable.js';
import { TEMPLATES, buildArtwork, roleColors, artworkChecks, getTemplate } from '../src/js/artwork.js';
import { makePalette, assertInside } from './helpers.mjs';


const palettes = [makePalette('Blue Sky Carnival', 1), makePalette('Kite Parade', 2, 10, '#FF6F91'), makePalette('Mint Chip Dream', 3, 6, '#7FD8BE'), makePalette('Sailor Disco', 4, 12, '#1E3A8A'), makePalette('Honey Pop', 5, 15, '#FFC75F')];

const countText = (items, pred) => items.reduce((n, it) => n + (it.t === 'text' && pred(it) ? 1 : it.t === 'g' ? countText(it.items, pred) : 0), 0);

/* ---------- blocks ---------- */

test('a block puts every color on the page, with the captions you asked for', () => {
  const p = palettes[0];
  const full = layoutBlock({ x: 0, y: 0, w: 120, h: 90 }, { title: p.name, cells: paletteCells(p) }, { showColorNames: true, showHex: true, showRgb: true });
  assert.equal(countText(full.items, (t) => t.text.startsWith('#')), 8);
  assert.equal(countText(full.items, (t) => t.text.startsWith('RGB ')), 8);
  assert.equal(countText(full.items, (t) => p.colors.some((c) => c.name === t.text)), 8);
  assert.equal(countText(full.items, (t) => t.text === p.name), 1);
  const bare = layoutBlock({ x: 0, y: 0, w: 120, h: 90 }, { title: '', cells: paletteCells(p) }, {});
  assert.equal(countText(bare.items, () => true), 0);
  assert.equal(bare.info.rows, 1, 'no captions: chips run as bars');
  assert.ok(full.info.rows >= 1 && full.info.size > 0);
});

test('without captions, plain rectangles become a strip of bars', () => {
  const r = layoutBlock({ x: 0, y: 0, w: 100, h: 50 }, { cells: paletteCells(palettes[0]) }, {});
  assert.equal(r.info.rows, 1);
  assert.equal(r.info.cols, 8);
});

test('narrow tall blocks put captions beside the chips; wide ones put them below', () => {
  const tall = bladeItems({ x: 0, y: 0, w: 56, h: 200 }, [{ spec: { cells: paletteCells(palettes[0], { pair: true }) } }], { hole: 'tm', showColorNames: true, showHex: true, showRgb: true });
  assert.equal(tall.info[0].cols, 1, 'blades are always a single column');
  const wide = layoutBlock({ x: 0, y: 0, w: 190, h: 120 }, { cells: paletteCells(palettes[0], { pair: true }) }, { showColorNames: true, showHex: true, showRgb: true });
  assert.ok(wide.info.cols > 1);
});

test('shapes cycle through the chips you chose', () => {
  const res = layoutBlock({ x: 0, y: 0, w: 120, h: 80 }, { cells: paletteCells(palettes[0]) }, { shapes: ['heart', 'star'] });
  const paths = res.items.filter((i) => i.t === 'path');
  assert.equal(paths.length, 8);
  assert.notEqual(paths[0].d, paths[1].d);
  assert.equal(paths[0].d, paths[2].d);
  assert.ok(PRINT_SHAPES.length >= 10 && PRINT_SHAPES[0].id === 'rect');
});

test('blades have a punch hole where you asked, mirrored on the back', () => {
  const unit = [{ spec: { title: 'Test', cells: paletteCells(palettes[0]) } }];
  for (const [hole, wantLeft] of [['tl', true], ['tr', false]]) {
    const front = bladeItems({ x: 10, y: 10, w: 60, h: 190 }, unit, { hole, holeD: 6.35 });
    const back = bladeItems({ x: 10, y: 10, w: 60, h: 190 }, unit, { hole, holeD: 6.35, mirror: true });
    const ring = (r) => r.items.find((i) => i.t === 'circle');
    assert.equal(ring(front).cx < 40, wantLeft, `${hole} front`);
    assert.equal(ring(back).cx < 40, !wantLeft, `${hole} back`);
    assert.match(front.cuts[0], /Z M.*Z$/, 'outline plus hole in one compound path');
  }
  const mid = bladeItems({ x: 0, y: 0, w: 60, h: 190 }, unit, { hole: 'tm' });
  assert.equal(mid.items.find((i) => i.t === 'circle').cx, 30);
  const none = bladeItems({ x: 0, y: 0, w: 60, h: 190 }, unit, { hole: 'none' });
  assert.ok(!none.items.some((i) => i.t === 'circle'));
  assert.ok(rrectPath(0, 0, 10, 10, 2).startsWith('M') && circlePath(5, 5, 2).endsWith('Z'));
});

/* ---------- whole print jobs ---------- */

test('simple style ignores the customizing options', () => {
  const o = effectiveOptions({ kind: 'palettes', style: 'simple', shapes: ['heart'], perUnit: 4, showHex: true, artwork: true });
  assert.deepEqual([o.shapes, o.perUnit, o.showHex, o.artwork], [['rect'], 1, false, false]);
  const c = effectiveOptions({ kind: 'palettes', style: 'custom', shapes: ['heart'], perUnit: 4, showHex: true });
  assert.deepEqual([c.shapes, c.perUnit, c.showHex], [['heart'], 4, true]);
});

test('options are clamped and defaults follow the kind', () => {
  const o = normalizePrintOptions({ kind: 'nope', perUnit: 99, total: -5, shapes: ['bogus'], paper: 'tabloid', hole: 'x' });
  assert.deepEqual([o.kind, o.perUnit, o.total, o.shapes, o.paper, o.hole], ['match', 6, 1, ['rect'], 'letter', 'tm']);
  assert.equal(normalizePrintOptions({ kind: 'palettes' }).showHex, false);
  assert.equal(normalizePrintOptions({ kind: 'match' }).showRgb, true);
  assert.equal(KINDS.length, 3);
});

for (const paper of Object.keys(PAPERS)) {
  for (const format of ['deck', 'book']) {
    for (const kind of ['match', 'palettes', 'swatch']) {
      for (const style of ['simple', 'custom']) {
        test(`every ${paper} ${format} ${kind} (${style}) page stays on the paper and exports as a valid PDF`, () => {
          const res = buildPrint({
            format, kind, style, paper, orient: 'portrait', shapes: style === 'custom' ? ['heart', 'circle', 'star'] : ['rect'],
            perUnit: style === 'custom' ? 2 : 1, hole: 'tl', total: 30, perPage: style === 'custom' ? 10 : null,
            medium: { medium: 'Alcohol markers', brand: 'Ohuhu', count: '60 count', notes: 'swatched on cardstock' },
            showHex: true, showRgb: true, showColorNames: true, artwork: style === 'custom' && format === 'book',
          }, palettes);
          assert.ok(res.pages.length >= 1);
          const dims = PAPERS[paper];
          res.pages.forEach((pg, i) => {
            assert.ok(Math.abs(pg.w - dims.w) < 1e-6 || Math.abs(pg.w - dims.h) < 1e-6);
            assertInside(pg, `${paper}/${format}/${kind}/${style} page ${i}`);
          });
          const pdf = buildPdf(res.pages, { title: 'test' });
          assert.ok(pdf.length > 1000);
          res.pages.forEach((pg) => assert.ok(toSvg(pg).includes('</svg>')));
        });
      }
    }
  }
}

test('a deck makes one blade per palette (or per group) and a two-sided deck doubles the sheets', () => {
  const one = buildPrint({ format: 'deck', kind: 'match', style: 'custom', perUnit: 1, hole: 'tm' }, palettes.slice(0, 3));
  const bladeCount = (pg) => pg.meta.cuts.length;
  assert.equal(one.pages.reduce((n, pg) => n + bladeCount(pg), 0), 3);
  const grouped = buildPrint({ format: 'deck', kind: 'palettes', style: 'custom', perUnit: 2, hole: 'tm' }, palettes);
  assert.equal(grouped.pages.reduce((n, pg) => n + bladeCount(pg), 0), 3, '5 palettes, 2 per blade → 3 blades');
  const dbl = buildPrint({ format: 'deck', kind: 'match', style: 'custom', blank: 'back', hole: 'tl' }, palettes.slice(0, 3));
  const single = buildPrint({ format: 'deck', kind: 'match', style: 'custom', blank: 'beside', hole: 'tl' }, palettes.slice(0, 3));
  assert.equal(dbl.pages.length, single.pages.length * 2);
  assert.deepEqual(dbl.pages.map((p) => p.meta.side), single.pages.length === 1 ? ['front', 'back'] : dbl.pages.map((p) => p.meta.side));
  assert.ok(dbl.notes.some((n) => /double-sided/i.test(n)));
});

test('color-matching blades pair every color with a blank spot', () => {
  const res = buildPrint({ format: 'deck', kind: 'match', style: 'simple', hole: 'tm' }, [palettes[0]]);
  const rects = res.pages[0].items.flatMap((i) => (i.t === 'g' ? i.items : [i])).filter((i) => i.t === 'rect');
  const filled = rects.filter((r) => /^#[0-9A-F]{6}$/i.test(r.fill) && r.fill !== '#FFFFFF');
  const blank = rects.filter((r) => r.fill === '#FFFFFF');
  assert.equal(filled.length, 8);
  assert.equal(blank.length, 8);
});

test('swatching books number every chip once, across pages', () => {
  const res = buildPrint({ format: 'book', kind: 'swatch', style: 'custom', total: 50, perPage: 12, medium: { medium: 'Gel pens' } }, []);
  assert.equal(res.pages.length, 5);
  const numbers = res.pages.flatMap((pg) => pg.items.filter((i) => i.t === 'text' && /^\d+$/.test(i.text)).map((i) => Number(i.text)));
  assert.deepEqual(numbers.sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.ok(res.pages[0].items.some((i) => i.t === 'text' && i.text === 'Gel pens'));
});

test('swatching decks split the count over blades', () => {
  const res = buildPrint({ format: 'deck', kind: 'swatch', style: 'custom', total: 25, perPage: 10 }, []);
  const blades = res.pages.reduce((n, pg) => n + pg.meta.cuts.length, 0);
  assert.equal(blades, 3);
});

test('books put example artwork after each palette page', () => {
  const res = buildPrint({ format: 'book', kind: 'palettes', style: 'custom', perUnit: 2, artwork: true, artTemplate: 'auto' }, palettes);
  assert.deepEqual(res.pages.map((p) => p.meta.kind), ['book-page', 'art-page', 'book-page', 'art-page', 'book-page', 'art-page']);
  assert.ok(res.pages[1].items.length > 50);
});

test('cut files hold black compound shapes only', () => {
  const res = buildPrint({ format: 'deck', kind: 'palettes', style: 'simple', hole: 'tr' }, palettes.slice(0, 2));
  const cut = cutPage(res.pages[0]);
  assert.ok(cut.items.length >= 2 && cut.items.every((i) => i.t === 'path' && i.fill === '#000000' && i.rule === 'evenodd'));
  assert.equal(cut.bg, null);
});

test('an empty selection gives a helpful note instead of a crash', () => {
  const res = buildPrint({ format: 'book', kind: 'palettes' }, []);
  assert.equal(res.pages.length, 0);
  assert.ok(res.notes[0].includes('at least one palette'));
});

test('very large palettes still lay out (small chips get a warning)', () => {
  const huge = makePalette('Huge', 9, 15);
  const many = Array.from({ length: 6 }, (_, i) => ({ ...huge, id: `h${i}`, name: `Huge ${i}` }));
  const res = buildPrint({ format: 'book', kind: 'match', style: 'custom', perUnit: 6, showColorNames: true, showHex: true, showRgb: true }, many);
  assert.equal(res.pages.length, 1);
  assertInside(res.pages[0], 'huge');
});

/* ---------- artwork ---------- */

test('every artwork template paints every region from the palette', () => {
  const colors = palettes[1].colors.map((c) => c.hex);
  for (const tpl of TEMPLATES) {
    const { page: pg, hex } = buildArtwork(tpl, { colors });
    assert.ok(pg.items.length > 8, tpl.id);
    for (const id of regionIds(pg.items)) assert.match(hex[id], /^#[0-9A-F]{6}$/i, `${tpl.id}: ${id}`);
    Object.values(hex).forEach((h) => assert.ok(colors.includes(h), `${tpl.id} uses only palette colors`));
    assertInside({ ...pg, items: pg.items }, `art ${tpl.id}`);
    assert.ok(toSvg(pg, { units: 'none' }).includes('</svg>'));
    buildPdf([{ ...pg, w: pg.w / 2, h: pg.h / 2, items: pg.items }]); // PDF supports every shape used
    for (const c of artworkChecks(tpl, hex)) assert.ok(c.ratio >= 1 && c.ratio <= 21);
  }
});

test('shuffle, dark mode, overrides and coloring pages change the result', () => {
  const colors = palettes[1].colors.map((c) => c.hex);
  const tpl = getTemplate('sunset');
  const a = buildArtwork(tpl, { colors }).hex;
  const b = buildArtwork(tpl, { colors, seed: 4 }).hex;
  assert.notDeepEqual(a, b);
  const d = buildArtwork(tpl, { colors, dark: true }).hex;
  assert.notEqual(a.hill, d.hill, 'dark mode swaps the light and dark colors');
  assert.equal(buildArtwork(tpl, { colors, overrides: { sun: '#123456' } }).hex.sun, '#123456');
  const blank = buildArtwork(tpl, { colors, coloring: true, overrides: { sun: '#123456' } }).hex;
  assert.equal(blank.sun, '#123456');
  assert.equal(blank.sky1, '#FFFFFF');
  const roles = roleColors(colors);
  assert.ok(roles.bg && roles.ink && roles.pop && roles.m8);
  assert.deepEqual(buildArtwork(tpl, { colors, seed: 4 }).hex, b, 'shuffles are repeatable');
});

test('books with example artwork suggest printing double-sided, so each picture lands behind its palette', () => {
  const on = buildPrint({ format: 'book', kind: 'palettes', style: 'custom', artwork: true }, palettes.slice(0, 2));
  assert.ok(on.notes.some((n) => /double-sided/.test(n) && /artwork/.test(n)));
  const off = buildPrint({ format: 'book', kind: 'palettes', style: 'custom', artwork: false }, palettes.slice(0, 2));
  assert.ok(!off.notes.some((n) => /artwork/.test(n)));
  const deck = buildPrint({ format: 'deck', kind: 'palettes', style: 'custom', artwork: true }, palettes.slice(0, 2));
  assert.ok(!deck.notes.some((n) => /artwork/.test(n)));
});
