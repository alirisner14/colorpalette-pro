// Share dialog: a link, a short code, and a QR code for a palette, all made on
// this device. Also handles opening a palette someone shared with you.
import { encodeShare, shareLink, decodeShare } from './sharecode.js';
import { encodeQr, qrToSvg } from './qr.js';
import { openDialog, esc, copyText, toast, ICONS } from './ui.js';
import { downloadBlob, safeFileName } from './export.js';
import { releaseCanvas } from './lifecycle.js';
import { stripHtml } from './render.js';
import { finalizePalette } from './importers.js';
import { book, persistBook } from './store.js';
import { addPalette } from './book.js';

const canLink = () => /^https?:$/.test(location.protocol);

function qrCanvasBlob(qr, scale = 12, margin = 4) {
  const n = qr.size + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
  return new Promise((resolve) => canvas.toBlob((b) => { releaseCanvas(canvas); resolve(b); }, 'image/png'));
}

export function openShare(palette) {
  const code = encodeShare(palette);
  const link = canLink() ? shareLink(palette, location.href) : null;
  const qrText = link ?? code;
  let qr = null;
  try { qr = encodeQr(qrText, 'M'); } catch { /* too long: no QR */ }
  const svg = qr ? qrToSvg(qr, { scale: 6, title: `QR code for ${palette.name}` }) : '';

  const dlg = openDialog({
    title: 'Share this palette',
    cls: 'sheet',
    html: `<div class="dlg-body share-body">
      <div class="share-palette">
        <div class="imp-strip">${stripHtml(palette)}</div>
        <b>${esc(palette.name)}</b>
      </div>
      <div class="share-grid">
        <div class="share-qr">${svg || '<p class="dlg-note">This palette has too many colors for a QR code.</p>'}
          <small>${link ? 'Scan with a phone camera to open this palette' : 'Scan, then paste the text into Import'}</small>
        </div>
        <div class="share-actions">
          ${link ? `<button type="button" class="btn btn-primary" data-do="link">${ICONS.link} Copy link</button>` : ''}
          <button type="button" class="btn ${link ? 'btn-glass' : 'btn-primary'}" data-do="code">${ICONS.copy} Copy share code</button>
          ${navigator.share ? `<button type="button" class="btn btn-glass" data-do="native">${ICONS.share} Share…</button>` : ''}
          ${qr ? `<button type="button" class="btn btn-glass" data-do="png">${ICONS.download} QR as PNG</button>
          <button type="button" class="btn btn-glass" data-do="svg">${ICONS.download} QR as SVG</button>` : ''}
        </div>
      </div>
      <p class="dlg-note">${link
    ? 'The link opens this app with your palette ready to save, so it works for people who have the app. The share code works anywhere: they paste it into <b>Import</b>.'
    : 'This copy is open as a file, so a link would not work on another device. Send the share code instead: your friend pastes it into <b>Import</b> in their copy.'}
      Nothing is uploaded: the palette is packed into the link or code itself.</p>
    </div>`,
  });

  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const act = b.dataset.do;
    if (act === 'link') copyText(link, 'the link');
    else if (act === 'code') copyText(code, 'the share code');
    else if (act === 'native') {
      try { await navigator.share({ title: palette.name, text: `${palette.name} — a color palette`, url: link ?? undefined }); } catch { /* cancelled */ }
    } else if (act === 'png') downloadBlob(await qrCanvasBlob(qr), `${safeFileName(palette.name)} QR.png`);
    else if (act === 'svg') downloadBlob(new Blob([qrToSvg(qr, { scale: 8, title: palette.name })], { type: 'image/svg+xml' }), `${safeFileName(palette.name)} QR.svg`);
  });
}

/** A palette arrived through a link or code: show it and offer to keep it. */
export function openSharedPalette(code, { onOpenInStudio } = {}) {
  const decoded = decodeShare(code);
  if (!decoded) { toast('That share link did not work. It may be cut off or damaged.'); return false; }
  const raw = { name: decoded.name, colors: decoded.colors };
  const dlg = openDialog({
    title: 'A palette for you',
    cls: 'sheet',
    html: `<div class="dlg-body">
      <div class="share-palette"><div class="imp-strip">${stripHtml(raw)}</div><b>${esc(raw.name)}</b></div>
      <div class="swatch-list">${raw.colors.map((c) => `<div class="row-line"><span><i class="dotc" style="background:${c.hex}"></i>${esc(c.name)}</span><span>${c.hex}</span></div>`).join('')}</div>
      <label class="field"><span class="field-label">Save into</span>
        <span class="select-wrap glass-inset"><select id="shared-tab">${book.sections.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></span>
      </label>
      <div class="dlg-foot">
        <button type="button" class="btn btn-glass" data-do="studio">Open in studio</button>
        <button type="button" class="btn btn-primary" data-do="save">Save to my swatch book</button>
      </div>
    </div>`,
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const p = finalizePalette(raw);
    if (b.dataset.do === 'save') {
      addPalette(book, p, dlg.querySelector('#shared-tab').value);
      persistBook();
      toast(`Saved “${p.name}” to your swatch book ★`);
    } else {
      onOpenInStudio?.(p);
    }
    dlg.close();
  });
  return true;
}
