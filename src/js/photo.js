// Pull a palette out of a photo. The math works on a flat RGBA array so it
// runs in Node tests; loadImagePixels() is the browser-only part.
import { rgbToHex, colorDistance, makeRng, hexToHsl } from './color.js';
import { decodeImage, drawScaled } from './imageutil.js';
import { closeBitmap, releaseCanvas } from './lifecycle.js';

/** Sample opaque pixels as [r, g, b] triples, skipping by `step`. */
export function samplePixels(rgba, step = 1) {
  const out = [];
  for (let i = 0; i < rgba.length; i += 4 * step) {
    if (rgba[i + 3] < 128) continue;
    out.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  return out;
}

const dist2 = (a, b) => {
  // Weighted RGB distance — close enough to perceptual for clustering.
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
};

/**
 * k-means with k-means++ seeding. Returns clusters sorted by size, each with
 * its centroid, member count and `pixel` — the real pixel closest to the
 * centroid, so photo palettes only ever contain colors present in the photo.
 */
export function kmeans(pixels, k, { seed = 1, iterations = 12 } = {}) {
  if (!pixels.length) return [];
  const rng = makeRng(seed);
  k = Math.min(k, pixels.length);
  const centers = [pixels[Math.floor(rng() * pixels.length)].slice()];
  const d = new Float64Array(pixels.length).fill(Infinity);
  while (centers.length < k) {
    let sum = 0;
    const last = centers[centers.length - 1];
    for (let i = 0; i < pixels.length; i++) {
      d[i] = Math.min(d[i], dist2(pixels[i], last));
      sum += d[i];
    }
    if (sum === 0) break;
    let r = rng() * sum;
    let idx = 0;
    while (idx < pixels.length - 1 && (r -= d[idx]) > 0) idx++;
    centers.push(pixels[idx].slice());
  }

  const assign = new Int32Array(pixels.length);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dd = dist2(pixels[i], centers[c]);
        if (dd < bestD) { bestD = dd; best = c; }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += pixels[i][0]; s[1] += pixels[i][1]; s[2] += pixels[i][2]; s[3]++;
    }
    centers.forEach((c, j) => {
      const s = sums[j];
      if (s[3]) { c[0] = s[0] / s[3]; c[1] = s[1] / s[3]; c[2] = s[2] / s[3]; }
    });
  }

  const clusters = centers.map((c) => ({ center: c, count: 0, pixel: null, best: Infinity }));
  for (let i = 0; i < pixels.length; i++) {
    const cl = clusters[assign[i]];
    cl.count++;
    const dd = dist2(pixels[i], cl.center);
    if (dd < cl.best) { cl.best = dd; cl.pixel = pixels[i]; }
  }
  return clusters
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      hex: rgbToHex({ r: c.pixel[0], g: c.pixel[1], b: c.pixel[2] }),
      count: c.count,
    }));
}

/**
 * Distinct colors from a photo, most common first, with a nudge toward
 * including vivid accents that a pure popularity sort would drop.
 */
export function extractPhotoColors(pixels, n, seed = 1) {
  const clusters = kmeans(pixels, Math.min(24, Math.max(n * 2, 8)), { seed });
  const total = clusters.reduce((a, c) => a + c.count, 0) || 1;
  const scored = clusters.map((c) => {
    const { s, l } = hexToHsl(c.hex);
    const vivid = s * (1 - Math.abs(l - 0.5) * 1.4);
    return { ...c, score: c.count / total + vivid * 0.04 };
  }).sort((a, b) => b.score - a.score);

  const out = [];
  for (const minDist of [40, 26, 14, 0]) {
    for (const c of scored) {
      if (out.length >= n) break;
      if (!out.includes(c.hex) && out.every((h) => colorDistance(h, c.hex) >= minDist)) out.push(c.hex);
    }
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Browser only: read a File into a small RGBA array plus a small preview
 * picture (a data URL, so there is nothing to revoke later). The full-size
 * photo is decoded once, scaled down, and released straight away.
 */
export async function loadImagePixels(file, maxSide = 160, previewSide = 640) {
  const decoded = await decodeImage(file);
  const small = drawScaled(decoded, maxSide);
  try {
    const pixels = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, small.width, small.height).data;
    const preview = drawScaled(decoded, previewSide);
    const thumb = preview.toDataURL('image/jpeg', 0.85);
    releaseCanvas(preview);
    return { pixels, thumb, width: decoded.width, height: decoded.height };
  } finally {
    releaseCanvas(small);
    closeBitmap(decoded.source);
  }
}
