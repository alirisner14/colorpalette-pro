// Swatch shapes as SVG path strings in a 100x100 box. The same strings are
// used for on-screen SVG and for canvas export (via Path2D).
import { makeRng } from './color.js';
import {
  HEART, STAR, CLOUD, SCRIBBLE_WIDE, SCRIBBLE_TALL,
} from './shapedata.js';

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

/** A soft, lumpy shape that is a little different for every chip. */
function blob(index) {
  const rng = makeRng(1000 + index * 37);
  const [a, b, c] = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const [k1, k2] = [2 + Math.floor(rng() * 2), 3 + Math.floor(rng() * 3)];
  return polar((t) => 38 + 6 * Math.sin(k1 * t + a) + 4 * Math.sin(k2 * t + b) + 2.5 * Math.sin(7 * t + c));
}

/** Flip a path left to right inside the 100x100 box (absolute coordinates only). */
export function mirrorX(d) {
  let argument = 0;
  return d.replace(/[A-Za-z]|-?\d*\.?\d+/g, (token) => {
    if (/[A-Za-z]/.test(token)) { argument = 0; return token; }
    const value = argument % 2 === 0 ? f(100 - Number(token)) : token; // x first, then y
    argument += 1;
    return value;
  });
}

/** The two scribbles take turns (wide, tall, then both flipped), so a row of them looks hand-made. */
const scribble = (index) => {
  const d = index % 2 ? SCRIBBLE_TALL : SCRIBBLE_WIDE;
  return Math.floor(index / 2) % 2 ? mirrorX(d) : d;
};

export const SHAPES = [
  { id: 'chip', label: 'Paint Chips', path: null },
  { id: 'heart', label: 'Hearts', path: () => HEART },
  { id: 'star', label: 'Stars', path: () => STAR },
  { id: 'blob', label: 'Abstract', path: blob },
  { id: 'messy', label: 'Messy Swatches', path: scribble },
  { id: 'circle', label: 'Circles', path: () => polar(() => 45) },
  { id: 'flower', label: 'Flowers', path: () => polar((t) => 32 + 14 * Math.abs(Math.cos(2.5 * t)), 180) },
  { id: 'cloud', label: 'Clouds', path: () => CLOUD },
  { id: 'drop', label: 'Paint Drops', path: () => 'M50 5 C50 5 16 45 16 64 C16 83 31 95 50 95 C69 95 84 83 84 64 C84 45 50 5 50 5 Z' },
  { id: 'hexagon', label: 'Hexagons', path: () => polygon(6, 46, null, 0) },
];

export const getShape = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];
