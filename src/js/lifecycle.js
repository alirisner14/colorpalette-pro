// Cleanup helpers. The app runs entirely on the user's device, so it must not
// leave anything behind: every temporary object URL is revoked, every scratch
// canvas is emptied and every decoded bitmap is closed as soon as it is used.

const live = new Map(); // object URL -> revoke timer

/**
 * Create a temporary object URL that is revoked automatically after `ttl` ms
 * (downloads need it for a moment), on page hide, or when `revoke` is called.
 * Pass ttl = 0 to keep it until you revoke it yourself.
 */
export function blobUrl(blob, ttl = 15000) {
  const url = URL.createObjectURL(blob);
  live.set(url, ttl > 0 ? setTimeout(() => revoke(url), ttl) : 0);
  return url;
}

export function revoke(url) {
  if (!url || !live.has(url)) return;
  clearTimeout(live.get(url));
  live.delete(url);
  try { URL.revokeObjectURL(url); } catch { /* already gone */ }
}

export function revokeAll() {
  [...live.keys()].forEach(revoke);
}

/** For tests and the storage panel: how many temporary URLs are still alive. */
export const liveUrlCount = () => live.size;

/** Empty a scratch canvas so the browser can free its pixel buffer now. */
export function releaseCanvas(canvas) {
  if (!canvas) return;
  try { canvas.width = 0; canvas.height = 0; } catch { /* ignore */ }
}

/** Free a decoded ImageBitmap (HTMLImageElements have nothing to close). */
export function closeBitmap(bitmap) {
  try { bitmap?.close?.(); } catch { /* ignore */ }
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', revokeAll);
}
