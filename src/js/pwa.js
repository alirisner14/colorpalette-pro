// Offline / install support: registers the service worker, offers updates and
// installation, and can wipe everything the app stored on this device.
import { toast } from './ui.js';
import { idbDestroy } from './idb.js';

const CACHE_PREFIX = 'cpp-';
const LS_PREFIX = 'cpp.';

let deferredPrompt = null;
let registration = null;
let reloading = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
export const onPwaChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !!deferredPrompt;
export const serviceWorkerSupported = () => 'serviceWorker' in navigator && location.protocol.startsWith('http');
export const offlineReady = () => serviceWorkerSupported() && !!navigator.serviceWorker.controller;

/** Plain-language install steps for browsers that have no install button. */
export function installHint() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Tap the Share button, then “Add to Home Screen”.';
  if (/Android/.test(ua)) return 'Open the browser menu (⋮), then “Install app” or “Add to Home screen”.';
  return 'Use the install icon at the right of the address bar, or the browser menu › “Install Color Palette PRO”.';
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null; // an install prompt can only be used once
  notify();
  return outcome;
}

function offerUpdate(reg) {
  toast('A new version of Color Palette PRO is ready.', {
    action: 'Update',
    ms: 15000,
    onAction: () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }),
  });
}

export async function initPwa() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; notify(); });
  addEventListener('appinstalled', () => { deferredPrompt = null; notify(); toast('Installed! Open it from your home screen or desktop.'); });
  if (!serviceWorkerSupported()) return;

  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    notify();
    if (hadController && !reloading) { reloading = true; location.reload(); } // a new version took over
  });

  try {
    registration = await navigator.serviceWorker.register('sw.js', { scope: './' });
  } catch {
    return; // e.g. a private window that blocks service workers: the app still works online
  }
  if (registration.waiting && hadController) offerUpdate(registration);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      if (navigator.serviceWorker.controller) offerUpdate(registration);
      else { toast('Ready to use offline ✓'); notify(); }
    });
  });

  // Look for a new version when the app comes back to the front, and hourly.
  const check = () => registration.update().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60 * 60 * 1000);
}

/** Ask the SW for its version and file count (null when there is no worker). */
export function swInfo() {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) { resolve(null); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    sw.postMessage({ type: 'VERSION' }, [channel.port2]);
  });
}

/* ---------- storage ---------- */

export async function storageEstimate() {
  try { return (await navigator.storage?.estimate?.()) ?? null; } catch { return null; }
}

export async function isPersisted() {
  try { return !!(await navigator.storage?.persisted?.()); } catch { return false; }
}

/** Ask the browser not to clear this app's data when space runs low. */
export async function requestPersist() {
  try { return !!(await navigator.storage?.persist?.()); } catch { return false; }
}

/** Every localStorage entry this app owns, with its size in bytes. */
export function localEntries() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(LS_PREFIX)) out.push({ key, bytes: (key.length + (localStorage.getItem(key) || '').length) * 2 });
    }
  } catch { /* storage blocked */ }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

async function deleteCaches() {
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n)));
  } catch { /* no Cache Storage */ }
}

async function unregisterWorkers() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* none */ }
}

/** Remove the stored copy of the app (the app downloads again the next time it is opened online). */
export async function deleteOfflineCopy() {
  reloading = true; // do not auto-reload while we tear things down
  await unregisterWorkers();
  await deleteCaches();
  notify();
}

/** Remove everything: swatch book, settings, cover images, the offline copy. */
export async function deleteEverything() {
  reloading = true;
  try {
    localEntries().forEach(({ key }) => localStorage.removeItem(key));
  } catch { /* ignore */ }
  await idbDestroy();
  await unregisterWorkers();
  await deleteCaches();
}
