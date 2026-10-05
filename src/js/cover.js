// Covers for the swatch book and the swatch deck: a color or a picture of your
// own, with a label card that holds the (editable) title. The scene builder is
// plain data; the picture itself lives in IndexedDB as a small data URL.
import { S, page } from './scene.js';
import { textWidth, wrapText } from './textmetrics.js';
import { idbGet, idbSet, idbDel } from './idb.js';
import { fileToDataUrl } from './imageutil.js';
import { LAYOUTS } from './bookopts.js';

const INK = '#1F2937';
const SOFT = '#4B5563';
const DISPLAY = { font: 'display', weight: 800 };
const SAMPLE_DOTS = ['#FF8FB1', '#FFC75F', '#7FD8BE', '#7EB6FF', '#B79CFF'];

/** The biggest title size (up to `maxSize`) whose wrapped lines all fit in the label. */
function titleLayout(textIn, maxW, maxSize) {
  const want = textIn.replace(/\s+/g, ' ').trim();
  for (let size = maxSize; size >= 2.4; size -= 0.4) {
    const lines = wrapText(want, size, maxW, { maxLines: 3, ...DISPLAY });
    if (lines.join(' ') === want && lines.every((l) => textWidth(l, size, DISPLAY) <= maxW)) return { size, lines };
  }
  return { size: 2.4, lines: wrapText(want, 2.4, maxW, { maxLines: 3, ...DISPLAY }) };
}

/**
 * The cover as a scene.
 * @param {number} w @param {number} h
 * @param {{title:string, subtitle:string, color:string}} cfg
 * @param {{ image?: string|null, dots?: string[], spine?: boolean, hole?: {x:number,y:number,r:number} }} extra `hole` marks the punch hole of a deck cover
 */
export function coverScene(w, h, cfg, { image = null, dots = [], spine = false, hole = null } = {}) {
  const items = [S.rect(0, 0, w, h, { fill: cfg.color })];
  if (image) {
    items.push(S.image(image, 0, 0, w, h));
  } else {
    const R = Math.max(w, h);
    items.push(
      S.circle(w * 0.96, h * 0.04, R * 0.4, { fill: '#FFFFFF', op: 0.12 }),
      S.circle(w * 0.02, h * 0.99, R * 0.3, { fill: '#FFFFFF', op: 0.1 }),
      S.circle(w * 0.8, h * 0.9, R * 0.11, { fill: '#000000', op: 0.07 }),
      S.circle(w * 0.18, h * 0.12, R * 0.06, { fill: '#FFFFFF', op: 0.16 }),
    );
  }
  if (spine) items.push(S.rect(0, 0, w * 0.04, h, { fill: '#000000', op: 0.14 }), S.rect(w * 0.04, 0, w * 0.006, h, { fill: '#FFFFFF', op: 0.25 }));

  const title = (cfg.title ?? '').trim();
  const sub = (cfg.subtitle ?? '').trim();
  const colors = (dots.length ? dots : SAMPLE_DOTS).slice(0, 8);
  if (title || sub) {
    const cw = w * 0.8;
    const pad = cw * 0.075;
    const inner = cw - pad * 2;
    const t = title ? titleLayout(title, inner, Math.min(cw * 0.17, 15)) : { size: 0, lines: [] };
    const lh = t.size * 1.14;
    const subSize = sub ? Math.min(inner * 0.095, t.size ? t.size * 0.5 : 6, 6.5) : 0;
    const subLines = sub ? wrapText(sub, subSize, inner, { maxLines: 2, weight: 700 }) : [];
    const dotD = Math.min(inner / (colors.length * 1.45), cw * 0.075);
    const gap = Math.max(1.6, cw * 0.035);
    const ch = pad + t.lines.length * lh + (subLines.length ? gap + subLines.length * subSize * 1.25 : 0) + gap + dotD + pad * 0.9;
    const cx = (w - cw) / 2 + (spine ? w * 0.02 : 0);
    const cy = Math.max(h * 0.08, (h - ch) * 0.46);
    items.push(S.rect(cx + 0.7, cy + 1.1, cw, ch, { r: cw * 0.07, fill: '#000000', op: 0.14 }));
    items.push(S.rect(cx, cy, cw, ch, { r: cw * 0.07, fill: '#FFFFFF', op: 0.94 }));
    let y = cy + pad;
    t.lines.forEach((line) => {
      y += lh;
      items.push(S.text(line, cx + cw / 2, y - t.size * 0.2, { size: t.size, weight: 800, font: 'display', anchor: 'middle', fill: INK }));
    });
    if (subLines.length) {
      y += gap * 0.4;
      subLines.forEach((line) => {
        y += subSize * 1.25;
        items.push(S.text(line, cx + cw / 2, y - subSize * 0.2, { size: subSize, weight: 700, anchor: 'middle', fill: SOFT }));
      });
    }
    y += gap + dotD / 2;
    const rowW = colors.length * dotD * 1.45 - dotD * 0.45;
    colors.forEach((hex, i) => items.push(S.circle(cx + cw / 2 - rowW / 2 + dotD / 2 + i * dotD * 1.45, y, dotD / 2, { fill: hex, stroke: '#00000026', sw: 0.2 })));
  }
  if (hole) {
    // a reinforced punch hole, like a binder page
    items.push(
      S.circle(hole.x, hole.y, hole.r + 1.5, { fill: '#FFFFFF', op: 0.88, stroke: '#00000026', sw: 0.2 }),
      S.circle(hole.x, hole.y, hole.r, { fill: '#000000', op: 0.38 }),
    );
  }
  return page(w, h, items, { bg: null, meta: { kind: 'cover' } });
}

/* ---------- the picture ---------- */

const images = { book: null, deck: null }; // data URLs, loaded once at start-up
const key = (layout) => `cover:${layout}`;

/** Read the stored pictures into memory. Safe when storage is blocked. */
export async function loadCoverImages() {
  for (const layout of LAYOUTS) images[layout] = (await idbGet(key(layout))) || null;
  return { ...images };
}

export const coverImage = (layout) => images[layout] ?? null;

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const isCoverDataUrl = (s) => typeof s === 'string' && s.length < 6_000_000 && DATA_URL.test(s);

/** Store a picture the person chose. Resolves to true when it was saved on the device. */
export async function setCoverImage(layout, file) {
  const { dataUrl } = await fileToDataUrl(file, { maxSide: 1400, quality: 0.85 });
  images[layout] = dataUrl; // shown right away even if the device refuses to store it
  return idbSet(key(layout), dataUrl);
}

/** Put a picture back from a backup. */
export async function setCoverImageData(layout, dataUrl) {
  if (!isCoverDataUrl(dataUrl)) return false;
  images[layout] = dataUrl;
  return idbSet(key(layout), dataUrl);
}

export async function clearCoverImage(layout) {
  images[layout] = null;
  await idbDel(key(layout));
}
