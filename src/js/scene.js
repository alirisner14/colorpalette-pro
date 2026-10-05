// A tiny scene graph shared by printing, artwork, book pages and covers.
//
// A page is { w, h, bg, items } where items are plain objects in page units
// (millimetres for print, anything for artwork). Three backends draw the same
// scene: toSvg() for screen and SVG files, drawCanvas() for PNG/JPG, and
// buildPdf() in pdf.js for vector PDFs. Because every output comes from one
// scene, what you preview is what you print.
//
// Item types: rect, circle, ellipse, path, line, text, image, g (group).
// Paths use absolute commands M L H V C Q Z only (no arcs), so every backend
// can draw them. Stroke widths are always in page units.

const pick = (o, keys) => {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
const STYLE = ['fill', 'stroke', 'sw', 'dash', 'op', 'rule', 'rid', 'cap'];

export const S = {
  rect: (x, y, w, h, o = {}) => ({ t: 'rect', x, y, w, h, r: o.r ?? 0, ...pick(o, STYLE) }),
  circle: (cx, cy, r, o = {}) => ({ t: 'circle', cx, cy, r, ...pick(o, STYLE) }),
  ellipse: (cx, cy, rx, ry, o = {}) => ({ t: 'ellipse', cx, cy, rx, ry, ...pick(o, STYLE) }),
  /** `d` is in its own coordinates; tx/ty/s move and scale it (default: none). */
  path: (d, o = {}) => ({ t: 'path', d, tx: o.tx ?? 0, ty: o.ty ?? 0, s: o.s ?? 1, ...pick(o, STYLE) }),
  line: (x1, y1, x2, y2, o = {}) => ({ t: 'line', x1, y1, x2, y2, ...pick(o, STYLE) }),
  text: (text, x, y, o = {}) => ({
    t: 'text', text: String(text), x, y, size: o.size ?? 4, weight: o.weight ?? 400, font: o.font ?? 'body', anchor: o.anchor ?? 'start',
    spacing: o.spacing, ...pick(o, STYLE),
  }),
  image: (href, x, y, w, h, o = {}) => ({ t: 'image', href, x, y, w, h, r: o.r ?? 0, slice: o.slice ?? true, ...pick(o, ['op', 'rid']) }),
  group: (items, attrs = {}) => ({ t: 'g', items, attrs }),
};

export const page = (w, h, items = [], o = {}) => ({ w, h, bg: o.bg ?? null, items, meta: o.meta ?? {} });

/* ---------- moving and scaling a scene ---------- */

const scaleDash = (d, k) => (d ? d.map((v) => v * k) : d);

function xf(it, k, dx, dy) {
  switch (it.t) {
    case 'rect': return { ...it, x: it.x * k + dx, y: it.y * k + dy, w: it.w * k, h: it.h * k, r: (it.r || 0) * k, sw: (it.sw || 0) * k, dash: scaleDash(it.dash, k) };
    case 'circle': return { ...it, cx: it.cx * k + dx, cy: it.cy * k + dy, r: it.r * k, sw: (it.sw || 0) * k, dash: scaleDash(it.dash, k) };
    case 'ellipse': return { ...it, cx: it.cx * k + dx, cy: it.cy * k + dy, rx: it.rx * k, ry: it.ry * k, sw: (it.sw || 0) * k, dash: scaleDash(it.dash, k) };
    case 'path': return { ...it, tx: (it.tx || 0) * k + dx, ty: (it.ty || 0) * k + dy, s: (it.s ?? 1) * k, sw: (it.sw || 0) * k, dash: scaleDash(it.dash, k) };
    case 'line': return { ...it, x1: it.x1 * k + dx, y1: it.y1 * k + dy, x2: it.x2 * k + dx, y2: it.y2 * k + dy, sw: (it.sw || 0) * k, dash: scaleDash(it.dash, k) };
    case 'text': return { ...it, x: it.x * k + dx, y: it.y * k + dy, size: it.size * k, sw: (it.sw || 0) * k, spacing: it.spacing == null ? it.spacing : it.spacing * k };
    case 'image': return { ...it, x: it.x * k + dx, y: it.y * k + dy, w: it.w * k, h: it.h * k, r: (it.r || 0) * k };
    case 'g': return { ...it, items: it.items.map((c) => xf(c, k, dx, dy)) };
    default: return it;
  }
}

/** Scale by k, then move by (dx, dy). Returns new items; the originals are untouched. */
export const transformItems = (items, { k = 1, dx = 0, dy = 0 } = {}) => items.map((it) => xf(it, k, dx, dy));

export const scalePage = (pg, k) => ({ ...pg, w: pg.w * k, h: pg.h * k, items: transformItems(pg.items, { k }) });

/** Fit a scene of size (w, h) inside a box, centred, keeping its shape. */
export function fitInto(items, w, h, box) {
  const k = Math.min(box.w / w, box.h / h);
  return transformItems(items, { k, dx: box.x + (box.w - w * k) / 2, dy: box.y + (box.h - h * k) / 2 });
}

/** Every `rid` in a list of items (including inside groups). */
export function regionIds(items, out = new Set()) {
  for (const it of items) {
    if (it.rid != null) out.add(it.rid);
    if (it.t === 'g') regionIds(it.items, out);
  }
  return out;
}

/* ---------- SVG ---------- */

export const FONT_STACK = {
  display: "'Grandstander','Comic Sans MS','Chalkboard SE',cursive",
  body: "'Nunito','Helvetica Neue',Arial,sans-serif",
  mono: "ui-monospace,'SF Mono',Consolas,monospace",
};

const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OUTLINE_INK = '#1B2330';
const GROUP_ATTR = /^(data-[a-z0-9-]+|class|id|role|tabindex|aria-label|aria-hidden)$/;

/** outline: false | true | { sw, keepFill } where keepFill leaves colors in and only adds the ink lines. */
const outlineOpts = (o) => (o ? { sw: typeof o === 'object' ? o.sw : undefined, keepFill: typeof o === 'object' && !!o.keepFill } : false);

/** Fill / stroke for an item, with the "coloring page" treatment applied. */
function look(it, outline) {
  let { fill, stroke, sw } = it;
  if (outline) {
    const filled = fill && fill !== 'none';
    if (it.t === 'text') fill = filled ? OUTLINE_INK : fill;
    else if (it.t === 'line') stroke = stroke ? OUTLINE_INK : stroke;
    else if (filled) { if (!outline.keepFill) fill = '#FFFFFF'; stroke = OUTLINE_INK; sw = Math.max(sw || 0, outline.sw ?? 1.4); }
    else if (stroke) stroke = OUTLINE_INK;
  }
  return { fill, stroke, sw };
}

function paintAttrs(it, outline, scale = 1) {
  const { fill, stroke, sw } = look(it, outline);
  let a = ` fill="${!fill || fill === 'none' ? 'none' : esc(fill)}"`;
  if (stroke) {
    a += ` stroke="${esc(stroke)}" stroke-width="${num((sw || 0.25) / scale)}" stroke-linejoin="round" stroke-linecap="${it.cap || 'round'}"`;
    if (it.dash) a += ` stroke-dasharray="${it.dash.map((d) => num(d / scale)).join(' ')}"`;
  }
  if (it.op != null && it.op !== 1) a += ` opacity="${num(it.op)}"`;
  if (it.rule === 'evenodd') a += ' fill-rule="evenodd"';
  if (it.rid != null) a += ` data-r="${esc(it.rid)}"`;
  return a;
}

function itemSvg(it, ctx) {
  const { outline } = ctx;
  switch (it.t) {
    case 'rect':
      return `<rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}"${it.r ? ` rx="${num(Math.min(it.r, it.w / 2, it.h / 2))}"` : ''}${paintAttrs(it, outline)}/>`;
    case 'circle':
      return `<circle cx="${num(it.cx)}" cy="${num(it.cy)}" r="${num(it.r)}"${paintAttrs(it, outline)}/>`;
    case 'ellipse':
      return `<ellipse cx="${num(it.cx)}" cy="${num(it.cy)}" rx="${num(it.rx)}" ry="${num(it.ry)}"${paintAttrs(it, outline)}/>`;
    case 'path': {
      const moved = it.tx || it.ty || (it.s ?? 1) !== 1;
      const tr = moved ? ` transform="translate(${num(it.tx || 0)} ${num(it.ty || 0)}) scale(${num(it.s ?? 1)})"` : '';
      return `<path d="${esc(it.d)}"${tr}${paintAttrs(it, outline, it.s ?? 1)}/>`;
    }
    case 'line':
      return `<line x1="${num(it.x1)}" y1="${num(it.y1)}" x2="${num(it.x2)}" y2="${num(it.y2)}" fill="none"${paintAttrs({ ...it, fill: 'none' }, outline).replace(' fill="none"', '')}/>`;
    case 'text': {
      const { fill, stroke, sw } = look(it, outline);
      const anchor = it.anchor === 'middle' ? ' text-anchor="middle"' : it.anchor === 'end' ? ' text-anchor="end"' : '';
      const strokeAttrs = stroke ? ` stroke="${esc(stroke)}" stroke-width="${num(sw || 0.4)}" paint-order="stroke" stroke-linejoin="round"` : '';
      const spacing = it.spacing ? ` letter-spacing="${num(it.spacing)}"` : '';
      const op = it.op != null && it.op !== 1 ? ` opacity="${num(it.op)}"` : '';
      const rid = it.rid != null ? ` data-r="${esc(it.rid)}"` : '';
      return `<text x="${num(it.x)}" y="${num(it.y)}" font-family="${FONT_STACK[it.font] || FONT_STACK.body}" font-size="${num(it.size)}" font-weight="${it.weight}"${anchor}${spacing} fill="${esc(fill || '#000')}"${strokeAttrs}${op}${rid}>${esc(it.text)}</text>`;
    }
    case 'image': {
      if (!it.href) return '';
      const id = it.r ? `${ctx.idPrefix}${ctx.n++}` : null;
      const clip = id ? `<clipPath id="${id}"><rect x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" rx="${num(it.r)}"/></clipPath>` : '';
      return `${clip}<image href="${esc(it.href)}" x="${num(it.x)}" y="${num(it.y)}" width="${num(it.w)}" height="${num(it.h)}" preserveAspectRatio="${it.slice ? 'xMidYMid slice' : 'xMidYMid meet'}"${id ? ` clip-path="url(#${id})"` : ''}${it.op != null && it.op !== 1 ? ` opacity="${num(it.op)}"` : ''}/>`;
    }
    case 'g': {
      const attrs = Object.entries(it.attrs || {}).filter(([k, v]) => GROUP_ATTR.test(k) && v != null && v !== false).map(([k, v]) => ` ${k}="${esc(v === true ? '' : v)}"`).join('');
      return `<g${attrs}>${it.items.map((c) => itemSvg(c, ctx)).join('')}</g>`;
    }
    default:
      return '';
  }
}

/**
 * The page as an SVG string.
 * @param {object} opts units: 'mm' (sized for print) | 'px' | 'none' (fills its container);
 *   outline: draw as a coloring page; bg: override the page background (null = transparent).
 */
export function toSvg(pg, { units = 'mm', outline = false, bg = pg.bg, title = '', cls = '', idPrefix = 'sc', interactive = false } = {}) {
  const unit = units === 'mm' ? 'mm' : '';
  const size = units === 'none' ? '' : ` width="${num(pg.w)}${unit}" height="${num(pg.h)}${unit}"`;
  const ctx = { outline: outlineOpts(outline), idPrefix, n: 0 };
  const body = pg.items.map((it) => itemSvg(it, ctx)).join('');
  const back = bg ? `<rect width="${num(pg.w)}" height="${num(pg.h)}" fill="${esc(bg)}"/>` : '';
  const label = !title ? ' aria-hidden="true"' : interactive ? ` role="group" aria-label="${esc(title)}"` : ` role="img" aria-label="${esc(title)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(pg.w)} ${num(pg.h)}"${size}${cls ? ` class="${esc(cls)}"` : ''}${label}>${title && !interactive ? `<title>${esc(title)}</title>` : ''}${back}${body}</svg>`;
}

/* ---------- canvas ---------- */

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strokeStyle(ctx, it, st, scale = 1) {
  ctx.strokeStyle = st.stroke;
  ctx.lineWidth = (st.sw || 0.25) / scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = it.cap || 'round';
  ctx.setLineDash(it.dash ? it.dash.map((d) => d / scale) : []);
}

function drawItem(ctx, it, outline) {
  const st = look(it, outline);
  const hasFill = st.fill && st.fill !== 'none';
  ctx.save();
  if (it.op != null && it.op !== 1) ctx.globalAlpha *= it.op;
  switch (it.t) {
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'path': {
      let region = null;
      let scale = 1;
      if (it.t === 'rect') { roundRectPath(ctx, it.x, it.y, it.w, it.h, it.r || 0); }
      else if (it.t === 'circle') { ctx.beginPath(); ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2); }
      else if (it.t === 'ellipse') { ctx.beginPath(); ctx.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, Math.PI * 2); }
      else {
        scale = it.s ?? 1;
        ctx.translate(it.tx || 0, it.ty || 0);
        ctx.scale(scale, scale);
        region = new Path2D(it.d);
      }
      if (hasFill) { ctx.fillStyle = st.fill; if (region) ctx.fill(region, it.rule === 'evenodd' ? 'evenodd' : 'nonzero'); else ctx.fill(it.rule === 'evenodd' ? 'evenodd' : 'nonzero'); }
      if (st.stroke) { strokeStyle(ctx, it, st, scale); if (region) ctx.stroke(region); else ctx.stroke(); }
      break;
    }
    case 'line':
      ctx.beginPath();
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      strokeStyle(ctx, it, { stroke: st.stroke || '#000', sw: st.sw });
      ctx.stroke();
      break;
    case 'text': {
      ctx.font = `${it.weight} ${it.size}px ${FONT_STACK[it.font] || FONT_STACK.body}`;
      ctx.textAlign = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      if (it.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${it.spacing}px`;
      if (st.stroke) { ctx.lineWidth = st.sw || 0.4; ctx.lineJoin = 'round'; ctx.strokeStyle = st.stroke; ctx.strokeText(it.text, it.x, it.y); }
      ctx.fillStyle = st.fill || '#000';
      ctx.fillText(it.text, it.x, it.y);
      break;
    }
    case 'g':
      it.items.forEach((c) => drawItem(ctx, c, outline));
      break;
    default:
      break; // images are drawn by the SVG backend only
  }
  ctx.restore();
}

/**
 * Draw a page onto a 2D canvas context. `scale` is pixels per page unit.
 * Fonts must be loaded first (await document.fonts.ready).
 */
export function drawCanvas(ctx, pg, { scale = 1, outline = false, background = pg.bg } = {}) {
  ctx.save();
  ctx.scale(scale, scale);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, pg.w, pg.h); }
  const ol = outlineOpts(outline);
  pg.items.forEach((it) => drawItem(ctx, it, ol));
  ctx.restore();
}

/**
 * The coloring-page treatment applied to the items themselves, for backends
 * (PDF) that cannot restyle while drawing. Same rules as toSvg's outline mode.
 */
export function outlineItems(items, { sw = 1.4, keepFill = false } = {}) {
  return items.map((it) => {
    if (it.t === 'g') return { ...it, items: outlineItems(it.items, { sw, keepFill }) };
    const o = { ...it };
    const filled = o.fill && o.fill !== 'none';
    if (o.t === 'text') { if (filled) o.fill = OUTLINE_INK; }
    else if (o.t === 'line') { if (o.stroke) o.stroke = OUTLINE_INK; }
    else if (o.t === 'image') { /* left as is */ }
    else if (filled) { if (!keepFill) o.fill = '#FFFFFF'; o.stroke = OUTLINE_INK; o.sw = Math.max(o.sw || 0, sw); }
    else if (o.stroke) o.stroke = OUTLINE_INK;
    return o;
  });
}
