// Exporting palettes: image rendering (needs a canvas) plus file encoders from formats.js.
import { rgbString } from './color.js';
import { getShape } from './shapes.js';
import { typeLabel } from './harmonies.js';
import { getFormat } from './formats.js';

export const APP_NAME = 'Color Palette PRO';

export function safeFileName(name) {
  return (name || 'palette').replace(/[\/:*?"<>|]+/g, '').replace(/s+/g, ' ').trim() || 'palette';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Build the file for a format id. Returns { blob, filename }. */
export async function buildExport(palette, formatId, shapeId = 'chip') {
  const f = getFormat(formatId);
  if (!f) throw new Error(`Unknown format ${formatId}`);
  const base = safeFileName(palette.name) + (f.suffix ?? '');
  if (f.image) {
    const blob = await paletteImageBlob(palette, shapeId, { type: f.image, transparent: f.image === 'image/png' });
    return { blob, filename: `${base}${f.ext}` };
  }
  const { data, mime, ext } = f.encode(palette);
  return { blob: new Blob([data], { type: mime }), filename: `${base}.${ext}`, text: typeof data === 'string' ? data : null };
}

/** Share through the OS share sheet when available (mobile), else download. */
export async function deliver({ blob, filename }) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Break text into at most `maxLines` lines that fit `maxWidth`. */
function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = fitText(ctx, `${lines[maxLines - 1]} …`, maxWidth);
  }
  return lines.map((l) => fitText(ctx, l, maxWidth));
}

/** Draw the palette to a canvas and return an image blob. */
export async function paletteImageBlob(palette, shapeId = 'chip', { type = 'image/jpeg', transparent = false } = {}) {
  if (document.fonts?.ready) await document.fonts.ready;
  const W = 1800, pad = 90, gap = 36;
  const n = palette.colors.length;
  const cols = n <= 4 ? n : n <= 8 ? 4 : n <= 10 ? 5 : n <= 12 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const isChip = shapeId === 'chip';
  const swatchH = isChip ? cw * 0.9 : cw;
  const cellH = swatchH + (isChip ? 186 : 176);
  const headerH = 230, footerH = 110;
  const H = headerH + rows * cellH + (rows - 1) * gap + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (!transparent) {
    ctx.fillStyle = '#F4FAFF';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = '#1E3A8A';
  ctx.font = '700 84px Grandstander, "Comic Sans MS", cursive';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, palette.name, W - pad * 2), pad, 130);
  ctx.fillStyle = '#4B6390';
  ctx.font = '600 34px Nunito, system-ui, sans-serif';
  const from = palette.base ? ` · from ${palette.base}` : '';
  ctx.fillText(`${typeLabel(palette)} · ${n} colors${from}`, pad, 186);

  const shape = getShape(shapeId);
  palette.colors.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    // Center a short last row.
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const rowOffset = ((cols - inRow) * (cw + gap)) / 2;
    const x = pad + rowOffset + col * (cw + gap);
    const y = headerH + row * (cellH + gap);

    if (isChip) {
      ctx.save();
      ctx.shadowColor = 'rgba(30, 58, 138, 0.18)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      roundRect(ctx, x, y, cw, cellH, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, x, y, cw, cellH, 22);
      ctx.clip();
      ctx.fillStyle = c.hex;
      ctx.fillRect(x, y, cw, swatchH);
      ctx.restore();
      ctx.fillStyle = '#1F2937';
      ctx.font = '700 30px Nunito, system-ui, sans-serif';
      const lines = wrapLines(ctx, c.name, cw - 36);
      lines.forEach((l, k) => ctx.fillText(l, x + 18, y + swatchH + 48 + k * 36));
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 26px Nunito, system-ui, sans-serif';
      ctx.fillText(c.hex, x + 18, y + swatchH + 48 + lines.length * 36 + 6);
      ctx.fillText(`RGB ${rgbString(c.hex)}`, x + 18, y + swatchH + 48 + lines.length * 36 + 40);
    } else {
      const p = new Path2D(shape.path(i));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(cw / 100, cw / 100);
      ctx.shadowColor = 'rgba(30, 58, 138, 0.2)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = c.hex;
      ctx.fill(p);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1F2937';
      ctx.font = '700 30px Nunito, system-ui, sans-serif';
      const lines = wrapLines(ctx, c.name, cw);
      lines.forEach((l, k) => ctx.fillText(l, x + cw / 2, y + cw + 44 + k * 36));
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 26px Nunito, system-ui, sans-serif';
      ctx.fillText(c.hex, x + cw / 2, y + cw + 44 + lines.length * 36 + 6);
      ctx.fillText(`RGB ${rgbString(c.hex)}`, x + cw / 2, y + cw + 44 + lines.length * 36 + 40);
      ctx.textAlign = 'left';
    }
  });

  ctx.fillStyle = '#7C8DB5';
  ctx.font = '600 26px Nunito, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`Made with ${APP_NAME}`, W - pad, H - 48);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.94));
}

