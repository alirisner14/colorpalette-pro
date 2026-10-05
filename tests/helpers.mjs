// Shared bits for the tests (not a test file itself).
import assert from 'node:assert/strict';
import { textWidth } from '../src/js/textmetrics.js';
import { nameColors } from '../src/js/names.js';
import { generateColors } from '../src/js/harmonies.js';

export const makePalette = (name, seed, n = 8, base = '#33ADE8', harmony = 'analogous') => {
  const hexes = generateColors(base, harmony, n, seed);
  const names = nameColors(hexes);
  return { id: `p${seed}`, name, harmony, createdAt: '2026-01-01T00:00:00.000Z', colors: hexes.map((hex, i) => ({ hex, name: names[i] })) };
};

/** A swatch book with `count` palettes spread over the given tab names. */
export function makeBook(count, tabs = ['My Palettes']) {
  const sections = tabs.map((name, i) => ({ id: `sec-${i}`, name, color: ['#7EB6FF', '#FF8FB1', '#7FD8BE', '#FFC75F'][i % 4], ids: [] }));
  const palettes = {};
  for (let i = 0; i < count; i++) {
    const p = makePalette(`Palette ${i + 1}`, i + 1, 6 + (i % 5), ['#33ADE8', '#FF6F91', '#7FD8BE', '#FFC75F'][i % 4]);
    palettes[p.id] = p;
    sections[i % sections.length].ids.push(p.id);
  }
  return { version: 1, sections, palettes };
}

/** Rough bounding box of an item, in page units. */
export function bbox(it) {
  switch (it.t) {
    case 'rect': return [it.x, it.y, it.x + it.w, it.y + it.h];
    case 'circle': return [it.cx - it.r, it.cy - it.r, it.cx + it.r, it.cy + it.r];
    case 'ellipse': return [it.cx - it.rx, it.cy - it.ry, it.cx + it.rx, it.cy + it.ry];
    case 'line': return [Math.min(it.x1, it.x2), Math.min(it.y1, it.y2), Math.max(it.x1, it.x2), Math.max(it.y1, it.y2)];
    case 'path': {
      const nums = (it.d.match(/-?\d*\.?\d+/g) || []).map(Number);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      const s = it.s ?? 1;
      return [Math.min(...xs) * s + (it.tx || 0), Math.min(...ys) * s + (it.ty || 0), Math.max(...xs) * s + (it.tx || 0), Math.max(...ys) * s + (it.ty || 0)];
    }
    case 'text': {
      const w = textWidth(it.text, it.size, { font: it.font, weight: it.weight });
      const x0 = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
      return [x0, it.y - it.size, x0 + w, it.y];
    }
    case 'image': return [it.x, it.y, it.x + it.w, it.y + it.h];
    case 'g': {
      if (!it.items.length) return [0, 0, 0, 0];
      const boxes = it.items.map(bbox);
      return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    }
    default: return [0, 0, 0, 0];
  }
}

export function assertInside(pg, label) {
  const tol = 0.6;
  for (const it of pg.items) {
    const [x0, y0, x1, y1] = bbox(it);
    assert.ok(x0 >= -tol && y0 >= -tol && x1 <= pg.w + tol && y1 <= pg.h + tol, `${label}: ${it.t} sticks out of the page: ${[x0, y0, x1, y1].map((v) => v.toFixed(1))} on ${pg.w}x${pg.h}`);
  }
}

/** Every `data-pid` in a list of scene items (the tap targets of a screen page). */
export function pids(items, out = []) {
  for (const it of items) {
    if (it.t !== 'g') continue;
    if (it.attrs?.['data-pid'] && it.attrs.class?.includes('pb') && !it.attrs['data-action']) out.push(it.attrs['data-pid']);
    else if (it.attrs?.['data-action'] === 'art') out.push(`art:${it.attrs['data-pid']}`);
    else pids(it.items, out);
  }
  return out;
}
