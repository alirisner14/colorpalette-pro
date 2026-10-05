// Settings: offline status, install, what is stored on this device, backup and clean-up.
import { book, prefs } from './store.js';
import { paletteCount } from './book.js';
import { openDialog, confirmDialog, esc, formatBytes, toast } from './ui.js';
import {
  offlineReady, serviceWorkerSupported, swInfo, canInstall, promptInstall, installHint, isStandalone,
  storageEstimate, isPersisted, requestPersist, localEntries, deleteOfflineCopy, deleteEverything, onPwaChange,
} from './pwa.js';
import { idbKeys } from './idb.js';
import { APP_NAME, APP_VERSION } from './meta.js';

const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'never');

async function settingsHtml() {
  const [info, est, persisted, keys] = await Promise.all([swInfo(), storageEstimate(), isPersisted(), idbKeys()]);
  const entries = localEntries();
  const sizeOf = (k) => entries.find((e) => e.key === k)?.bytes ?? 0;
  const covers = keys.filter((k) => String(k).startsWith('cover:')).length;

  let offline;
  if (!serviceWorkerSupported()) {
    offline = '<span class="status">Offline mode is unavailable here</span><p class="dlg-note">It needs the app to be opened from a web address (not as a file) in a browser that allows offline apps.</p>';
  } else if (offlineReady()) {
    offline = `<span class="status ok">Works offline</span><p class="dlg-note">${info ? `${info.files} files are stored on this device (version ${esc(String(info.version).replace(/^cpp-v?/, ""))}). ` : ''}You can use ${APP_NAME} with no internet connection at all.</p>`;
  } else {
    offline = '<span class="status">Getting ready for offline use…</span><p class="dlg-note">Keep this page open for a moment while you are online, then reload it.</p>';
  }

  let install;
  if (isStandalone()) install = '<span class="status ok">Installed on this device</span>';
  else if (canInstall()) install = '<button type="button" class="btn btn-primary" data-do="install">Install the app</button>';
  else install = `<p class="dlg-note">${esc(installHint())}</p>`;

  const total = est ? `${formatBytes(est.usage)} used${est.quota ? ` of ${formatBytes(est.quota)} available` : ''}` : 'not reported by this browser';
  const cacheBytes = est?.usageDetails?.caches;

  return `<div class="dlg-body">
    <section class="dlg-section">
      <h3>Offline and install</h3>
      ${offline}
      ${install}
    </section>
    <section class="dlg-section">
      <h3>Stored on this device</h3>
      <p class="dlg-note">Everything lives here and nowhere else. Nothing is sent to us, ever.</p>
      <div>
        <div class="row-line"><span>Swatch book</span><span>${paletteCount(book)} palette${paletteCount(book) === 1 ? '' : 's'} in ${book.sections.length} tab${book.sections.length === 1 ? '' : 's'} · ${formatBytes(sizeOf('cpp.book.v1'))}</span></div>
        <div class="row-line"><span>Preferences and your palette in progress</span><span>${formatBytes(sizeOf('cpp.prefs.v1'))}</span></div>
        <div class="row-line"><span>Cover pictures</span><span>${covers ? `${covers} stored` : 'none'}</span></div>
        <div class="row-line"><span>Offline copy of the app</span><span>${cacheBytes != null ? formatBytes(cacheBytes) : (offlineReady() ? 'stored' : 'not stored')}</span></div>
        <div class="row-line"><span>Total</span><span>${total}</span></div>
      </div>
      ${persisted
    ? '<span class="status ok">Protected from automatic clean-up</span>'
    : '<p class="dlg-note">Browsers may clear a site\'s data when the device is short on space. You can ask yours not to.</p><button type="button" class="btn btn-glass" data-do="persist">Protect my data</button>'}
    </section>
    <section class="dlg-section">
      <h3>Back up and restore</h3>
      <p class="dlg-note">Because your swatch book is stored on this device, a backup is your safety net. Last backup: <b>${esc(dateText(prefs.lastBackup))}</b>.</p>
      <div class="dlg-actions">
        <button type="button" class="btn btn-primary" data-do="backup-html">Back up as flipbook (.html)</button>
        <button type="button" class="btn btn-glass" data-do="backup-json">Back up as data file (.json)</button>
        <button type="button" class="btn btn-glass" data-do="restore">Restore from a backup…</button>
      </div>
    </section>
    <section class="dlg-section">
      <h3>Clean up</h3>
      <p class="dlg-note">${APP_NAME} keeps no temporary files. Pictures you open are read in memory and let go straight away. Use these only if you want to remove what it stored.</p>
      <div class="dlg-actions">
        <button type="button" class="btn btn-glass btn-warn" data-do="delete-offline">Delete the offline copy</button>
        <button type="button" class="btn btn-glass btn-warn" data-do="delete-all">Delete all my data…</button>
      </div>
    </section>
    <section class="dlg-section">
      <h3>About</h3>
      <div class="row-line"><span>${APP_NAME}</span><span>version ${APP_VERSION}</span></div>
      <div class="dlg-actions">
        <a class="btn btn-glass btn-sm" href="legal.html?doc=privacy">Privacy</a>
        <a class="btn btn-glass btn-sm" href="legal.html?doc=terms">Terms</a>
        <a class="btn btn-glass btn-sm" href="legal.html?doc=eula">Licence</a>
        <a class="btn btn-glass btn-sm" href="legal.html?doc=licences">Fonts &amp; credits</a>
        <a class="btn btn-glass btn-sm" href="mailto:ontherisedigital@gmail.com">Contact</a>
      </div>
    </section>
  </div>`;
}

export async function openSettings() {
  const dlg = openDialog({ title: 'Settings', cls: 'sheet', html: '<p class="muted">Looking…</p>' });
  const body = dlg.querySelector('.dlg-content');
  const render = async () => { if (dlg.open) body.innerHTML = await settingsHtml(); };
  await render();
  const off = onPwaChange(render);
  dlg.addEventListener('close', off);

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const act = b.dataset.do;
    if (act === 'install') {
      await promptInstall();
    } else if (act === 'persist') {
      toast((await requestPersist()) ? 'Done — your browser will keep your data.' : 'Your browser did not agree, but nothing is lost. Backups are still the safest option.');
      render();
    } else if (act === 'backup-html' || act === 'backup-json') {
      const m = await import('./backupui.js');
      await (act === 'backup-html' ? m.backupHtml() : m.backupJson());
      render();
    } else if (act === 'restore') {
      dlg.close();
      (await import('./backupui.js')).restoreFlow();
    } else if (act === 'delete-offline') {
      const ok = await confirmDialog({
        title: 'Delete the offline copy?',
        message: 'Your swatch book stays. The app will need an internet connection (or the original files) the next time you open it.',
        confirm: 'Delete offline copy', danger: true,
      });
      if (ok) { await deleteOfflineCopy(); toast('Offline copy deleted.'); render(); }
    } else if (act === 'delete-all') {
      const ok = await confirmDialog({
        title: 'Delete all my data?',
        message: 'This removes your swatch book, covers, settings and the offline copy from this device. It cannot be undone. Back up first if you might want it again.',
        confirm: 'Delete everything', danger: true,
      });
      if (ok) {
        await deleteEverything();
        location.hash = '';
        location.reload();
      }
    }
  });
}
