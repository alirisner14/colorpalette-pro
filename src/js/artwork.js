// Example artwork for "Palette in context": eight flat-color compositions
// (a coloring page, wall art, a website, a room…) that are painted from a
// palette so you can see how the colors work together.
//
// Each template draws with `f(regionId, role)`: the role says what kind of color
// belongs there (background, ink, accent…), and `roleColors` picks the palette
// color for each role. Tap-to-paint overrides win over the automatic choice.
import { S } from './scene.js';
import { hexToHsl, makeRng } from './color.js';
import { contrastRatio, gradeOf } from './contrast.js';

const rad = (d) => (d * Math.PI) / 180;
const r2 = (v) => Math.round(v * 100) / 100;
const pt = (p) => `${r2(p[0])} ${r2(p[1])}`;
const poly = (pts) => `M${pts.map(pt).join(' L')} Z`;

/** A pie/ring segment as a polyline. Angles in degrees, 0 = up, clockwise. */
export function ringSegment(cx, cy, r0, r1, a0, a1, step = 4) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n - 90);
    pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]);
  }
  if (r0 > 0) {
    for (let i = n; i >= 0; i--) {
      const a = rad(a0 + ((a1 - a0) * i) / n - 90);
      pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]);
    }
  } else pts.push([cx, cy]);
  return poly(pts);
}

/** A petal or leaf growing from (cx, cy) in direction `angle` (0 = up). */
export function petalPath(cx, cy, angle, len, wid) {
  const a = rad(angle - 90);
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = -dy, py = dx;
  const P = (t, s) => [cx + dx * len * t + px * wid * s, cy + dy * len * t + py * wid * s];
  const tip = P(1, 0);
  return `M${r2(cx)} ${r2(cy)} C${pt(P(0.25, 0.9))} ${pt(P(0.8, 0.75))} ${pt(tip)} C${pt(P(0.8, -0.75))} ${pt(P(0.25, -0.9))} ${r2(cx)} ${r2(cy)} Z`;
}

/* ---------- which palette color goes where ---------- */

export const ROLES = ['bg', 'bg2', 'ink', 'pop', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

/**
 * Pick a color for every role. bg = lightest, ink = darkest, pop = the most
 * vivid mid-tone, m1…m8 = the other colors, taken around the color wheel.
 * `seed` reshuffles the m-colors; `dark` swaps light and dark.
 */
export function roleColors(colors, { seed = 0, dark = false } = {}) {
  const info = colors.map((hex) => ({ hex, ...hexToHsl(hex) }));
  const byL = [...info].sort((a, b) => b.l - a.l);
  const lightest = byL[0];
  const darkest = byL[byL.length - 1];
  const light2 = byL[1] ?? lightest;
  const dark2 = byL[byL.length - 2] ?? darkest;
  const mids = info.filter((c) => c !== lightest && c !== darkest);
  const pool = mids.length ? mids : info;
  const vivid = (c) => c.s * (1 - Math.abs(c.l - 0.5) * 1.6);
  const pop = [...pool].sort((a, b) => vivid(b) - vivid(a))[0];
  const order = [...pool].sort((a, b) => a.h - b.h);
  if (seed) {
    const rng = makeRng(seed * 7919 + 13);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const out = {
    bg: (dark ? darkest : lightest).hex,
    bg2: (dark ? dark2 : light2).hex,
    ink: (dark ? lightest : darkest).hex,
    pop: pop.hex,
  };
  for (let k = 1; k <= 8; k++) out[`m${k}`] = order[(k - 1) % order.length].hex;
  return out;
}

/* ---------- the templates ---------- */

/** A point `r` from (cx, cy) at `deg` degrees (0 = up, clockwise). */
const polarPt = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg - 90)), cy + r * Math.sin(rad(deg - 90))];

/**
 * A mandala petal pointing outwards at `deg`: its base spans `half` degrees either side at radius
 * r0, and it ends at r1 in a point (`tip` 0) or a rounded tip (`tip` up to 1).
 */
export function mandalaPetal(cx, cy, r0, r1, deg, half, { tip = 0, belly = 1 } = {}) {
  const P = (r, d) => pt(polarPt(cx, cy, r, d));
  const len = r1 - r0;
  const mid = r0 + len * 0.5;
  const w = half * belly;
  const t = half * tip * 0.75;
  return `M${P(r0, deg - half)} C${P(mid, deg - w * 1.25)} ${P(r1, deg - t - half * 0.05)} ${P(r1, deg)} `
    + `C${P(r1, deg + t + half * 0.05)} ${P(mid, deg + w * 1.25)} ${P(r0, deg + half)} Z`;
}

const mandala = {
  id: 'mandala', name: 'Mandala', kind: 'Coloring page', w: 400, h: 400,
  draw(f) {
    const cx = 200, cy = 200;
    const line = { stroke: f('line', 'ink'), sw: 1.1 };
    const items = [
      S.rect(0, 0, 400, 400, { fill: f('bg', 'bg'), rid: 'bg' }),
    ];
    const ring = (n, fn) => { for (let i = 0; i < n; i++) items.push(...[].concat(fn(i, (360 / n) * i))); };
    const petal = (r0, r1, deg, half, rid, role, o = {}) => S.path(mandalaPetal(cx, cy, r0, r1, deg, half, o), { fill: f(rid, role), rid, ...line });
    const dot = (r, deg, size, rid, role) => {
      const [x, y] = polarPt(cx, cy, r, deg);
      return S.circle(x, y, size, { fill: f(rid, role), rid, ...line });
    };

    // scalloped edge
    ring(32, (i, a) => dot(176, a + 5.625, 14, 'scallop', 'm6'));
    items.push(S.circle(cx, cy, 176, { fill: f('edge', 'bg2'), rid: 'edge', ...line }));
    ring(32, (i, a) => dot(182, a + 5.625, 3, 'edgeDots', 'bg'));
    items.push(S.circle(cx, cy, 166, { fill: f('field', 'bg'), rid: 'field', ...line }));
    // outer layer: big pointed petals with smaller ones peeking between them
    ring(16, (i, a) => petal(100, 152, a + 11.25, 9, 'outerBack', 'm5'));
    ring(16, (i, a) => [
      petal(92, 164, a, 12, i % 2 ? 'outerB' : 'outerA', i % 2 ? 'm2' : 'm1'),
      petal(104, 148, a, 6, 'outerIn', 'bg2'),
      dot(154, a, 2.6, 'outerDot', 'ink'),
    ]);
    // middle layer: rounded petals
    ring(12, (i, a) => [
      petal(58, 112, a + 15, 15, i % 2 ? 'midB' : 'midA', i % 2 ? 'm4' : 'm3', { tip: 1, belly: 1.05 }),
      petal(66, 100, a + 15, 8, 'midIn', 'pop', { tip: 0.8 }),
      dot(91, a + 15, 3.4, 'midDot', 'bg'),
    ]);
    // beaded ring
    items.push(S.circle(cx, cy, 60, { fill: f('band', 'm6'), rid: 'band', ...line }));
    ring(24, (i, a) => dot(53, a, 3.4, 'beads', 'bg'));
    items.push(S.circle(cx, cy, 46, { fill: f('inner', 'bg2'), rid: 'inner', ...line }));
    // inner flower
    ring(8, (i, a) => petal(14, 44, a + 22.5, 20, 'innerPetal', 'm1', { tip: 1 }));
    ring(8, (i, a) => petal(14, 38, a, 13, 'innerPetal2', 'pop', { tip: 0.4 }));
    items.push(S.circle(cx, cy, 15, { fill: f('center', 'm4'), rid: 'center', ...line }));
    items.push(S.circle(cx, cy, 6.5, { fill: f('center2', 'bg'), rid: 'center2', ...line }));
    return items;
  },
};

const sunset = {
  id: 'sunset', name: 'Sunset hills', kind: 'Wall art', w: 400, h: 500,
  draw(f) {
    const cloud = (x, y, s, rid) => [
      S.ellipse(x, y, 46 * s, 13 * s, { fill: f(rid, 'bg'), rid }),
      S.ellipse(x + 26 * s, y - 9 * s, 28 * s, 12 * s, { fill: f(rid, 'bg'), rid }),
      S.ellipse(x - 24 * s, y - 6 * s, 24 * s, 10 * s, { fill: f(rid, 'bg'), rid }),
    ];
    const tree = (x, y, s, rid) => S.path(poly([[x, y - 60 * s], [x - 20 * s, y - 22 * s], [x - 9 * s, y - 22 * s], [x - 26 * s, y + 8 * s], [x + 26 * s, y + 8 * s], [x + 9 * s, y - 22 * s], [x + 20 * s, y - 22 * s]]), { fill: f(rid, 'm6'), rid });
    const bird = (x, y, s) => S.path('M0 0 Q8 -9 16 0 Q24 -9 32 0', { tx: x, ty: y, s, stroke: f('hill', 'ink'), sw: 3, fill: 'none' });
    return [
      S.rect(0, 0, 400, 500, { fill: f('sky1', 'm3'), rid: 'sky1' }),
      S.rect(0, 110, 400, 390, { fill: f('sky2', 'm2'), rid: 'sky2' }),
      S.rect(0, 200, 400, 300, { fill: f('sky3', 'm1'), rid: 'sky3' }),
      S.circle(200, 272, 78, { fill: f('sun', 'pop'), rid: 'sun' }),
      ...cloud(90, 92, 1, 'cloud1'),
      ...cloud(312, 150, 0.8, 'cloud2'),
      S.path(poly([[0, 330], [60, 268], [112, 312], [172, 236], [232, 322], [290, 258], [350, 316], [400, 282], [400, 500], [0, 500]]), { fill: f('mt1', 'm4'), rid: 'mt1' }),
      S.path(poly([[0, 384], [72, 332], [132, 372], [212, 298], [282, 374], [342, 336], [400, 372], [400, 500], [0, 500]]), { fill: f('mt2', 'm5'), rid: 'mt2' }),
      S.path('M0 438 C80 396 160 404 224 436 C288 468 346 474 400 424 L400 500 L0 500 Z', { fill: f('hill', 'ink'), rid: 'hill' }),
      tree(46, 452, 1, 'tree1'), tree(94, 468, 0.72, 'tree2'), tree(338, 458, 0.9, 'tree3'),
      bird(84, 196, 1), bird(140, 168, 0.7), bird(292, 206, 0.85),
    ];
  },
};

const bouquet = {
  id: 'bouquet', name: 'Flower vase', kind: 'Wall art', w: 400, h: 500,
  draw(f) {
    const flower = (k, cx, cy, r, n, petalRole, centerRole) => [
      ...Array.from({ length: n }, (_, i) => S.path(petalPath(cx, cy, (360 / n) * i, r, r * 0.62), { fill: f(`flower${k}`, petalRole), rid: `flower${k}`, stroke: f('wall', 'bg'), sw: 1.2 })),
      S.circle(cx, cy, r * 0.26, { fill: f(`center${k}`, centerRole), rid: `center${k}` }),
    ];
    const stem = (x1, y1, cx, cy, x2, y2) => S.path(`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`, { fill: 'none', stroke: f('stem', 'm4'), sw: 5, rid: 'stem' });
    return [
      S.rect(0, 0, 400, 500, { fill: f('wall', 'bg'), rid: 'wall' }),
      S.rect(0, 402, 400, 98, { fill: f('table', 'm1'), rid: 'table' }),
      S.rect(0, 402, 400, 8, { fill: f('edge', 'm2'), rid: 'edge' }),
      stem(200, 306, 200, 250, 200, 196), stem(192, 306, 150, 270, 140, 236), stem(210, 306, 258, 270, 268, 232),
      stem(198, 306, 176, 220, 160, 162), stem(204, 306, 226, 214, 244, 158),
      S.path(petalPath(190, 330, -62, 64, 18), { fill: f('leafA', 'm5'), rid: 'leafA' }),
      S.path(petalPath(212, 326, 64, 66, 18), { fill: f('leafB', 'm5'), rid: 'leafB' }),
      S.path(petalPath(196, 280, -40, 44, 14), { fill: f('leafA', 'm5'), rid: 'leafA' }),
      S.path(petalPath(208, 276, 42, 46, 14), { fill: f('leafB', 'm5'), rid: 'leafB' }),
      ...flower(1, 200, 180, 44, 8, 'm1', 'pop'),
      ...flower(2, 138, 226, 34, 7, 'm3', 'bg2'),
      ...flower(3, 270, 222, 36, 7, 'm6', 'pop'),
      ...flower(4, 158, 128, 30, 6, 'm2', 'bg2'),
      ...flower(5, 244, 122, 32, 6, 'm7', 'pop'),
      S.rect(176, 290, 48, 36, { fill: f('vase', 'm3'), rid: 'vase' }),
      S.path('M150 318 C118 350 116 412 150 426 L250 426 C284 412 282 350 250 318 Z', { fill: f('vase', 'm3'), rid: 'vase' }),
      S.path('M127 372 C150 384 250 384 273 372 L271 394 C250 406 150 406 129 394 Z', { fill: f('band', 'pop'), rid: 'band' }),
      S.ellipse(200, 430, 70, 8, { fill: f('shadow', 'ink'), op: 0.18 }),
    ];
  },
};

/**
 * One band of a rainbow arch: a half ring centred on (cx, y) between radii r0 and r1, with
 * straight legs running down to `foot`. r0 = 0 gives a solid arch.
 */
export function archBand(cx, y, r0, r1, foot, step = 3) {
  const arc = (r, from, to) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / step));
    return Array.from({ length: n + 1 }, (_, i) => polarPt(cx, y, r, from + ((to - from) * i) / n));
  };
  const outer = [[cx - r1, foot], ...arc(r1, -90, 90), [cx + r1, foot]];
  const inner = r0 > 0 ? [[cx + r0, foot], ...arc(r0, 90, -90), [cx - r0, foot]] : [];
  return poly([...outer, ...inner]);
}

const geometric = {
  id: 'geometric', name: 'Modern arches', kind: 'Wall art', w: 400, h: 500,
  draw(f) {
    const foot = 404;
    const bands = [[134, 160, 'm1'], [106, 130, 'm2'], [78, 102, 'm3'], [50, 74, 'm4']];
    return [
      S.rect(0, 0, 400, 500, { fill: f('bg', 'bg'), rid: 'bg' }),
      // the sun sits behind the rainbow, up and to the right
      S.circle(318, 118, 44, { fill: f('sun', 'pop'), rid: 'sun' }),
      // a little wave and a grid of dots for texture
      S.path('M40 92 Q55 78 70 92 Q85 106 100 92 Q115 78 130 92 Q145 106 160 92', { fill: 'none', stroke: f('wave', 'm6'), sw: 5, rid: 'wave' }),
      ...[0, 1, 2, 3].flatMap((i) => [0, 1, 2].map((j) => S.circle(52 + i * 17, 128 + j * 17, 4, { fill: f('dots', 'm7'), rid: 'dots' }))),
      // the rainbow, outermost band first
      ...bands.map(([r0, r1, role], k) => S.path(archBand(200, 300, r0, r1, foot), { fill: f(`arch${k + 1}`, role), rid: `arch${k + 1}` })),
      S.path(archBand(200, 300, 0, 46, foot), { fill: f('arch5', 'bg2'), rid: 'arch5' }),
      // ground
      S.path(`M0 ${foot} L400 ${foot} L400 500 L0 500 Z`, { fill: f('ground', 'm5'), rid: 'ground' }),
      S.rect(0, foot, 400, 5, { fill: f('groundLine', 'ink'), rid: 'groundLine' }),
      // small arches in the corner
      S.path(archBand(342, 448, 0, 30, 470), { fill: f('mini1', 'm4'), rid: 'mini1' }),
      S.path(archBand(342, 448, 0, 18, 470), { fill: f('mini2', 'm2'), rid: 'mini2' }),
      S.path(archBand(64, 452, 0, 22, 470), { fill: f('mini3', 'm1'), rid: 'mini3' }),
      S.rect(28, 470, 344, 6, { r: 3, fill: f('shelf', 'bg'), rid: 'shelf' }),
    ];
  },
};

const landing = {
  id: 'landing', name: 'Website', kind: 'Web design', w: 500, h: 360,
  checks: [
    { label: 'Headline on the page', fg: 'headline', bg: 'page' },
    { label: 'Body text on the page', fg: 'bodytext', bg: 'page' },
    { label: 'Button text', fg: 'btnText', bg: 'btn' },
    { label: 'Menu text', fg: 'navText', bg: 'nav' },
    { label: 'Footer text', fg: 'footText', bg: 'foot' },
  ],
  draw(f) {
    const card = (i) => {
      const x = 36 + i * 148;
      return [
        S.rect(x, 268, 132, 56, { r: 12, fill: f(`card${i}`, 'bg2'), rid: `card${i}` }),
        S.circle(x + 24, 296, 13, { fill: f(`icon${i}`, ['m1', 'm2', 'm3'][i]), rid: `icon${i}` }),
        S.rect(x + 46, 285, 70, 7, { r: 3.5, fill: f('line1', 'ink'), rid: 'line1' }),
        S.rect(x + 46, 299, 48, 6, { r: 3, fill: f('line2', 'm4'), rid: 'line2' }),
      ];
    };
    return [
      S.rect(0, 0, 500, 360, { fill: f('page', 'bg'), rid: 'page' }),
      S.rect(0, 0, 500, 46, { fill: f('nav', 'bg2'), rid: 'nav' }),
      S.circle(30, 23, 10, { fill: f('logo', 'pop'), rid: 'logo' }),
      S.text('Palette', 46, 28, { size: 14, weight: 800, font: 'display', fill: f('navText', 'ink'), rid: 'navText' }),
      S.text('Home', 330, 27, { size: 11, weight: 700, fill: f('navText', 'ink'), rid: 'navText' }),
      S.text('Shop', 378, 27, { size: 11, weight: 700, fill: f('navText', 'ink'), rid: 'navText' }),
      S.text('About', 424, 27, { size: 11, weight: 700, fill: f('navText', 'ink'), rid: 'navText' }),
      S.circle(392, 152, 84, { fill: f('art1', 'm1'), rid: 'art1' }),
      S.circle(346, 200, 50, { fill: f('art2', 'm2'), rid: 'art2' }),
      S.circle(436, 104, 34, { fill: f('art3', 'm3'), rid: 'art3' }),
      S.ellipse(404, 206, 44, 18, { fill: f('art4', 'm4'), rid: 'art4' }),
      S.text('Colors that', 36, 112, { size: 30, weight: 800, font: 'display', fill: f('headline', 'ink'), rid: 'headline' }),
      S.text('feel like you.', 36, 148, { size: 30, weight: 800, font: 'display', fill: f('headline', 'ink'), rid: 'headline' }),
      S.text('Pick a palette, preview it, and', 36, 178, { size: 11.5, weight: 600, fill: f('bodytext', 'ink'), rid: 'bodytext' }),
      S.text('make it yours in seconds.', 36, 194, { size: 11.5, weight: 600, fill: f('bodytext', 'ink'), rid: 'bodytext' }),
      S.rect(36, 214, 120, 38, { r: 19, fill: f('btn', 'pop'), rid: 'btn' }),
      S.text('Get started', 96, 238, { size: 13, weight: 800, anchor: 'middle', fill: f('btnText', 'bg'), rid: 'btnText' }),
      S.rect(168, 214, 100, 38, { r: 19, fill: 'none', stroke: f('headline', 'ink'), sw: 2 }),
      S.text('Learn more', 218, 238, { size: 12, weight: 700, anchor: 'middle', fill: f('headline', 'ink'), rid: 'headline' }),
      ...card(0), ...card(1), ...card(2),
      S.rect(0, 334, 500, 26, { fill: f('foot', 'ink'), rid: 'foot' }),
      S.text('Made with care  ·  hello@example.com', 250, 351, { size: 9.5, weight: 700, anchor: 'middle', fill: f('footText', 'bg'), rid: 'footText' }),
    ];
  },
};

const room = {
  id: 'room', name: 'Cozy room', kind: 'Interior', w: 500, h: 400,
  draw(f) {
    return [
      S.rect(0, 0, 500, 292, { fill: f('wall', 'bg'), rid: 'wall' }),
      S.rect(0, 292, 500, 108, { fill: f('floor', 'm1'), rid: 'floor' }),
      S.rect(0, 284, 500, 10, { fill: f('base', 'bg2'), rid: 'base' }),
      // window
      S.rect(176, 44, 112, 142, { r: 4, fill: f('winframe', 'm2'), rid: 'winframe' }),
      S.rect(184, 52, 46, 60, { fill: f('glass', 'bg2'), rid: 'glass' }), S.rect(234, 52, 46, 60, { fill: f('glass', 'bg2'), rid: 'glass' }),
      S.rect(184, 118, 46, 60, { fill: f('glass', 'bg2'), rid: 'glass' }), S.rect(234, 118, 46, 60, { fill: f('glass', 'bg2'), rid: 'glass' }),
      // pictures
      S.rect(318, 52, 92, 72, { r: 3, fill: f('frame1', 'm3'), rid: 'frame1' }),
      S.rect(326, 60, 76, 56, { fill: f('art1', 'bg'), rid: 'art1' }),
      S.circle(346, 86, 13, { fill: f('art1b', 'pop'), rid: 'art1b' }),
      S.path(poly([[326, 116], [358, 84], [380, 104], [392, 94], [402, 104], [402, 116]]), { fill: f('art1c', 'm5'), rid: 'art1c' }),
      S.rect(424, 70, 52, 78, { r: 3, fill: f('frame2', 'm4'), rid: 'frame2' }),
      S.rect(431, 77, 38, 64, { fill: f('art2', 'bg2'), rid: 'art2' }),
      S.circle(450, 100, 11, { fill: f('art2b', 'm6'), rid: 'art2b' }),
      // lamp
      S.rect(58, 196, 6, 100, { fill: f('lamp', 'ink'), rid: 'lamp' }),
      S.ellipse(61, 300, 22, 6, { fill: f('lamp', 'ink'), rid: 'lamp' }),
      S.path(poly([[34, 150], [88, 150], [102, 198], [20, 198]]), { fill: f('shade', 'pop'), rid: 'shade' }),
      // rug and sofa
      S.ellipse(250, 348, 196, 36, { fill: f('rug', 'm3'), rid: 'rug' }),
      S.ellipse(250, 348, 150, 26, { fill: f('rug2', 'bg2'), rid: 'rug2' }),
      S.ellipse(250, 348, 96, 16, { fill: f('rug3', 'm2'), rid: 'rug3' }),
      S.rect(124, 182, 252, 80, { r: 26, fill: f('sofa', 'm4'), rid: 'sofa' }),
      S.rect(112, 218, 276, 82, { r: 22, fill: f('sofa', 'm4'), rid: 'sofa' }),
      S.rect(96, 206, 48, 98, { r: 22, fill: f('arm', 'm5'), rid: 'arm' }),
      S.rect(356, 206, 48, 98, { r: 22, fill: f('arm', 'm5'), rid: 'arm' }),
      S.rect(146, 238, 102, 56, { r: 14, fill: f('cushion', 'm6'), rid: 'cushion' }),
      S.rect(252, 238, 102, 56, { r: 14, fill: f('cushion', 'm6'), rid: 'cushion' }),
      S.rect(158, 196, 46, 46, { r: 11, fill: f('pillow1', 'pop'), rid: 'pillow1' }),
      S.rect(300, 200, 42, 42, { r: 11, fill: f('pillow2', 'bg2'), rid: 'pillow2' }),
      S.rect(112, 300, 10, 14, { fill: f('legs', 'ink'), rid: 'legs' }), S.rect(378, 300, 10, 14, { fill: f('legs', 'ink'), rid: 'legs' }),
      // plant
      ...[-62, -34, -8, 20, 46].map((a, i) => S.path(petalPath(446, 296, a, 74 - Math.abs(a) * 0.3, 24), { fill: f(`leaf${i % 2}`, i % 2 ? 'm2' : 'm7'), rid: `leaf${i % 2}`, stroke: f('wall', 'bg'), sw: 1 })),
      S.path(poly([[420, 292], [472, 292], [464, 346], [428, 346]]), { fill: f('pot', 'pop'), rid: 'pot' }),
    ];
  },
};

function quiltBlock(f, x, y, s, rng) {
  const pick = () => Math.floor(rng() * 8);
  const slot = (i) => `s${i}`;
  const roles = ['bg', 'bg2', 'ink', 'pop', 'm1', 'm2', 'm3', 'm4'];
  const F = (i) => f(slot(i), roles[i]);
  const R = (i, ...a) => ({ fill: F(i), rid: slot(i), ...Object.assign({}, ...a) });
  const type = Math.floor(rng() * 5);
  const a = pick();
  let b = pick();
  if (b === a) b = (a + 3) % 8;
  let c = pick();
  if (c === a || c === b) c = (b + 2) % 8;
  const h = s / 2;
  if (type === 0) return [S.rect(x, y, s, s, R(a))];
  if (type === 1) {
    const o = Math.floor(rng() * 4);
    const tri = [[[0, 0], [s, 0], [s, s]], [[0, 0], [s, 0], [0, s]], [[s, 0], [s, s], [0, s]], [[0, 0], [s, s], [0, s]]][o].map(([px, py]) => [x + px, y + py]);
    return [S.rect(x, y, s, s, R(a)), S.path(poly(tri), R(b))];
  }
  if (type === 2) return [S.rect(x, y, s, s, R(a)), S.path(poly([[x + h, y + 3], [x + s - 3, y + h], [x + h, y + s - 3], [x + 3, y + h]]), R(b)), S.circle(x + h, y + h, s * 0.13, R(c))];
  if (type === 3) {
    const cx = x + h, cy = y + h;
    return [S.rect(x, y, s, s, R(c)),
      S.path(poly([[x, y], [cx, y], [cx, cy]]), R(a)), S.path(poly([[x + s, y], [x + s, cy], [cx, cy]]), R(b)),
      S.path(poly([[x + s, y + s], [cx, y + s], [cx, cy]]), R(a)), S.path(poly([[x, y + s], [x, cy], [cx, cy]]), R(b))];
  }
  return [S.rect(x, y, h, h, R(a)), S.rect(x + h, y, h, h, R(b)), S.rect(x, y + h, h, h, R(b)), S.rect(x + h, y + h, h, h, R(a))];
}

const quilt = {
  id: 'quilt', name: 'Patchwork quilt', kind: 'Pattern', w: 400, h: 400,
  draw(f) {
    const rng = makeRng(2024);
    const items = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) items.push(...quiltBlock(f, i * 50, j * 50, 50, rng));
    return items;
  },
};

const brand = {
  id: 'brand', name: 'Brand board', kind: 'Branding', w: 500, h: 400,
  checks: [
    { label: 'Name on the front card', fg: 'c1name', bg: 'card1' },
    { label: 'Text on the back card', fg: 'c2text', bg: 'card2' },
    { label: 'Monogram on the badge', fg: 'mono', bg: 'badge2' },
  ],
  draw(f) {
    return [
      S.rect(0, 0, 500, 400, { fill: f('bg', 'bg'), rid: 'bg' }),
      S.circle(120, 160, 88, { fill: f('badge', 'm1'), rid: 'badge' }),
      S.circle(120, 160, 66, { fill: f('badge2', 'bg2'), rid: 'badge2' }),
      ...Array.from({ length: 8 }, (_, i) => S.path(petalPath(120, 160, i * 45, 62, 20), { fill: f('bloom', 'm3'), rid: 'bloom', stroke: f('badge2', 'bg2'), sw: 1.5 })),
      S.circle(120, 160, 30, { fill: f('badge3', 'm2'), rid: 'badge3' }),
      S.text('P', 120, 182, { size: 54, weight: 800, font: 'display', anchor: 'middle', fill: f('mono', 'ink'), rid: 'mono' }),
      S.text('Palette & Co.', 120, 288, { size: 20, weight: 800, font: 'display', anchor: 'middle', fill: f('brandName', 'ink'), rid: 'brandName' }),
      S.text('handmade color studio', 120, 308, { size: 11, weight: 700, anchor: 'middle', fill: f('brandName', 'ink'), rid: 'brandName' }),
      S.rect(256, 60, 214, 122, { r: 10, fill: f('shadow', 'ink'), op: 0.14 }),
      S.rect(250, 52, 214, 122, { r: 10, fill: f('card1', 'bg2'), rid: 'card1' }),
      S.circle(278, 82, 12, { fill: f('c1logo', 'pop'), rid: 'c1logo' }),
      S.text('Ava Sunrise', 298, 87, { size: 14, weight: 800, font: 'display', fill: f('c1name', 'ink'), rid: 'c1name' }),
      S.text('Color Designer', 274, 118, { size: 10.5, weight: 700, fill: f('c1name', 'ink'), rid: 'c1name' }),
      S.rect(274, 134, 96, 6, { r: 3, fill: f('c1line', 'm4'), rid: 'c1line' }),
      S.rect(274, 148, 70, 6, { r: 3, fill: f('c1line', 'm4'), rid: 'c1line' }),
      S.rect(256, 204, 214, 122, { r: 10, fill: f('shadow', 'ink'), op: 0.14 }),
      S.rect(250, 196, 214, 122, { r: 10, fill: f('card2', 'm5'), rid: 'card2' }),
      S.circle(444, 216, 40, { fill: f('c2a', 'm6'), rid: 'c2a' }),
      S.circle(424, 300, 28, { fill: f('c2b', 'pop'), rid: 'c2b' }),
      S.text('palette.co', 296, 264, { size: 18, weight: 800, font: 'display', fill: f('c2text', 'bg'), rid: 'c2text' }),
      ...[0, 1, 2, 3].map((i) => S.circle(285 + i * 50, 366, 20, { fill: f(`sticker${i}`, ['m3', 'm4', 'pop', 'm7'][i]), rid: `sticker${i}` })),
    ];
  },
};

export const TEMPLATES = [mandala, sunset, bouquet, geometric, landing, room, quilt, brand];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/**
 * Paint a template.
 * @param {object} tpl a template from TEMPLATES
 * @param {{colors: string[], seed?: number, dark?: boolean, overrides?: Record<string,string>}} opts
 * @returns {{ page: object, hex: Record<string,string>, roles: Record<string,string> }}
 *   `hex` maps each region id to the color it ended up with. With `coloring: true`
 *   every shape starts white (a coloring page) and only painted regions have color.
 */
export function buildArtwork(tpl, { colors, seed = 0, dark = false, overrides = {}, coloring = false }) {
  const roles = roleColors(colors, { seed, dark });
  const hex = {};
  const regionRole = {};
  const f = (rid, role) => {
    if (!(rid in hex)) { hex[rid] = overrides[rid] ?? (coloring ? '#FFFFFF' : roles[role]); regionRole[rid] = role; }
    return hex[rid];
  };
  const items = tpl.draw(f);
  return { page: { w: tpl.w, h: tpl.h, bg: null, items, meta: { template: tpl.id } }, hex, roles: regionRole };
}

/** Contrast notes for templates that have text (website, brand board). */
export function artworkChecks(tpl, hex) {
  return (tpl.checks ?? []).map((c) => {
    const ratio = contrastRatio(hex[c.fg], hex[c.bg]);
    return { label: c.label, ratio, grade: gradeOf(ratio), fg: hex[c.fg], bg: hex[c.bg] };
  });
}

/** Which template to use for the n-th palette when "auto" is chosen. */
export const autoTemplate = (n) => TEMPLATES[n % TEMPLATES.length];
