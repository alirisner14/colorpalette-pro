import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, getShape, mirrorX } from '../src/js/shapes.js';
import { HEART, STAR, CLOUD, SCRIBBLE_WIDE, SCRIBBLE_TALL } from '../src/js/shapedata.js';

const numbers = (d) => (d.match(/-?\d*\.?\d+/g) || []).map(Number);
const box = (d) => {
  const n = numbers(d);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

const TRACED = { heart: HEART, star: STAR, cloud: CLOUD, scribbleWide: SCRIBBLE_WIDE, scribbleTall: SCRIBBLE_TALL };

test('the supplied shapes are closed, smooth outlines that fit in the 100 box', () => {
  for (const [name, d] of Object.entries(TRACED)) {
    assert.match(d, /^M[\d. -]+( C[\d. -]+)+ Z$/, name);
    assert.doesNotMatch(d, /[LHVQSA]/, `${name} uses only M, C and Z`);
    const b = box(d);
    assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 100 && b.y1 <= 100, `${name} stays inside the box: ${JSON.stringify(b)}`);
    assert.ok(Math.max(b.x1 - b.x0, b.y1 - b.y0) > 90, `${name} fills the box`);
    assert.ok(d.split('C').length > 30, `${name} has plenty of curve segments`);
  }
});

test('the shapes keep the proportions of the artwork', () => {
  const ratio = (d) => { const b = box(d); return (b.x1 - b.x0) / (b.y1 - b.y0); };
  assert.ok(ratio(CLOUD) > 1.7 && ratio(CLOUD) < 2.0, 'a wide cloud');
  assert.ok(ratio(HEART) > 1.15 && ratio(HEART) < 1.4, 'a heart a little wider than tall');
  assert.ok(ratio(STAR) > 0.95 && ratio(STAR) < 1.15, 'a star about as wide as tall');
  assert.ok(ratio(SCRIBBLE_WIDE) > 2 && ratio(SCRIBBLE_WIDE) < 2.6, 'a wide scribble');
  assert.ok(ratio(SCRIBBLE_TALL) > 0.8 && ratio(SCRIBBLE_TALL) < 1, 'a tall scribble');
});

test('hearts, stars, clouds and the two scribble shapes use the supplied outlines', () => {
  assert.equal(getShape('heart').path(0), HEART);
  assert.equal(getShape('star').path(3), STAR);
  assert.equal(getShape('cloud').path(1), CLOUD);
  assert.equal(getShape('messy').path(0), SCRIBBLE_WIDE);
  assert.equal(getShape('blob').path(0), SCRIBBLE_TALL);
  // the cloud no longer looks like a flower
  assert.notEqual(getShape('cloud').path(0), getShape('flower').path(0));
});

test('mirroring flips a path left to right, and flipping twice gives the original back', () => {
  assert.equal(mirrorX('M10 20 C30 40 50 60 70 80 Z'), 'M90 20 C70 40 50 60 30 80 Z');
  for (const d of Object.values(TRACED)) {
    assert.equal(mirrorX(mirrorX(d)), d);
    const a = box(d);
    const b = box(mirrorX(d));
    assert.ok(Math.abs(b.x0 - (100 - a.x1)) < 0.11 && Math.abs(b.x1 - (100 - a.x0)) < 0.11);
    assert.equal(b.y0, a.y0);
    assert.equal(b.y1, a.y1);
  }
});

test('scribbles take turns facing each way; the other shapes never change', () => {
  for (const id of ['messy', 'blob']) {
    const s = getShape(id);
    assert.notEqual(s.path(0), s.path(1), id);
    assert.equal(s.path(0), s.path(2), id);
    assert.equal(s.path(1), s.path(3), id);
  }
  for (const id of ['heart', 'star', 'cloud', 'circle', 'flower', 'drop', 'hexagon']) {
    assert.equal(getShape(id).path(0), getShape(id).path(5), id);
  }
});

test('every shape in the list has a label and a usable path', () => {
  const ids = SHAPES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SHAPES) {
    assert.ok(s.label);
    if (s.path) for (let i = 0; i < 3; i++) assert.match(s.path(i), /^M.*Z$/, s.id);
  }
});

test('printing with the supplied shapes stays on the paper and makes a valid PDF', async () => {
  const { buildPrint } = await import('../src/js/printable.js');
  const { buildPdf } = await import('../src/js/pdf.js');
  const { assertInside, makePalette } = await import('./helpers.mjs');
  const palettes = [makePalette('Sky', 1), makePalette('Kite', 2, 10, '#FF6F91')];
  for (const format of ['deck', 'book']) {
    for (const shapes of [['heart'], ['star'], ['cloud'], ['messy'], ['blob'], ['heart', 'star', 'cloud', 'messy', 'blob']]) {
      const res = buildPrint({ format, kind: 'palettes', style: 'custom', shapes, perUnit: 2, showHex: true }, palettes);
      assert.ok(res.pages.length > 0, `${format} ${shapes}`);
      res.pages.forEach((pg, i) => assertInside(pg, `${format} ${shapes} page ${i}`));
      const pdf = buildPdf(res.pages, { title: 'Test' });
      assert.equal(new TextDecoder('latin1').decode(pdf.subarray(0, 5)), '%PDF-');
    }
  }
});
