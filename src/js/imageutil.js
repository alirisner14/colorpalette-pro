// Decode images without leaving object URLs or big bitmaps lying around.
import { closeBitmap, releaseCanvas } from './lifecycle.js';

/** Decode a File/Blob. Returns { source, width, height }; pass `source` to closeBitmap() when done. */
export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url); // the decoded image no longer needs it
  }
}

export function scaleToFit(width, height, maxSide) {
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * k)), h: Math.max(1, Math.round(height * k)) };
}

/** Draw a decoded image onto a fresh canvas, scaled to fit `maxSide`. Caller releases the canvas. */
export function drawScaled(decoded, maxSide) {
  const { w, h } = scaleToFit(decoded.width, decoded.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(decoded.source, 0, 0, w, h);
  return canvas;
}

/** A File → small JPEG/PNG data URL (a plain string: nothing to revoke or free later). */
export async function fileToDataUrl(file, { maxSide = 1200, quality = 0.84, type = 'image/jpeg' } = {}) {
  const decoded = await decodeImage(file);
  try {
    const { w, h } = scaleToFit(decoded.width, decoded.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(decoded.source, 0, 0, w, h);
    const dataUrl = canvas.toDataURL(type, quality);
    releaseCanvas(canvas);
    return { dataUrl, width: w, height: h };
  } finally {
    closeBitmap(decoded.source);
  }
}
