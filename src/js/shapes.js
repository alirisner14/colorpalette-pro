// Swatch shapes as SVG path strings in a 100x100 box. The same strings are
// used for on-screen SVG and for canvas export (via Path2D).
import { makeRng } from './color.js';

const f = (n) => Math.round(n * 10) / 10;

function polar(rFn, steps = 120) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = rFn(t);
    pts.push(`${f(50 + r * Math.cos(t))} ${f(50 + r * Math.sin(t))}`);
  }
  return `M${pts.join(' L')} Z`;
}

function polygon(points, radius, inner = null, rotate = -Math.PI / 2) {
  const pts = [];
  const total = inner ? points * 2 : points;
  for (let i = 0; i < total; i++) {
    const r = inner && i % 2 ? inner : radius;
    const t = rotate + (i / total) * Math.PI * 2;
    pts.push(`${f(50 + r * Math.cos(t))} ${f(50 + r * Math.sin(t))}`);
  }
  return `M${pts.join(' L')} Z`;
}

function blob(index) {
  const rng = makeRng(1000 + index * 37);
  const [a, b, c] = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const [k1, k2] = [2 + Math.floor(rng() * 2), 3 + Math.floor(rng() * 3)];
  return polar((t) => 38 + 6 * Math.sin(k1 * t + a) + 4 * Math.sin(k2 * t + b) + 2.5 * Math.sin(7 * t + c));
}

function messy(index) {
  const rng = makeRng(5000 + index * 53);
  const jit = (amp) => (rng() - 0.5) * amp;
  const top = [], bottom = [], right = [], left = [];
  // Wavy top/bottom like a loaded brush; ragged bristle streaks at the ends.
  const wave = rng() * 6.28;
  for (let x = 14; x <= 86; x += 6) top.push(`${f(x)} ${f(21 + 2.5 * Math.sin(x / 9 + wave) + jit(1.5))}`);
  for (let y = 24; y <= 76; y += 3.5) right.push(`${f(86 + (y % 7 < 3.5 ? 7 : 1) + jit(6))} ${f(y)}`);
  for (let x = 86; x >= 14; x -= 6) bottom.push(`${f(x)} ${f(79 + 2.5 * Math.sin(x / 8 - wave) + jit(1.5))}`);
  for (let y = 76; y >= 24; y -= 5) left.push(`${f(10 + jit(4))} ${f(y)}`);
  return `M${[...top, ...right, ...bottom, ...left].join(' L')} Z`;
}

export const SHAPES = [
  { id: 'chip', label: 'Paint Chips', path: null },
  { id: 'heart', label: 'Hearts', path: () => 'M50 90 C22 70 5 52 5 32 C5 16 17 6 30 6 C40 6 46 12 50 20 C54 12 60 6 70 6 C83 6 95 16 95 32 C95 52 78 70 50 90 Z' },
  { id: 'star', label: 'Stars', path: () => polygon(5, 47, 21) },
  { id: 'blob', label: 'Abstract', path: blob },
  { id: 'messy', label: 'Messy Swatches', path: messy },
  { id: 'circle', label: 'Circles', path: () => polar(() => 45) },
  { id: 'flower', label: 'Flowers', path: () => polar((t) => 32 + 14 * Math.abs(Math.cos(2.5 * t)), 180) },
  { id: 'cloud', label: 'Clouds', path: () => polar((t) => 36 + 7 * Math.abs(Math.sin(3.5 * t)), 180) },
  { id: 'drop', label: 'Paint Drops', path: () => 'M50 5 C50 5 16 45 16 64 C16 83 31 95 50 95 C69 95 84 83 84 64 C84 45 50 5 50 5 Z' },
  { id: 'hexagon', label: 'Hexagons', path: () => polygon(6, 46, null, 0) },
];

export const getShape = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];
