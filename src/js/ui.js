// Small shared UI helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (prefix = 'p') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Light tap feedback on devices that support it. */
export function haptic(ms = 8) {
  try {
    // Browsers only allow vibration after the person has touched the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(ms);
  } catch { /* unsupported */ }
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, { action, onAction, ms = 2600 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  if (action) $('.toast-action', t).onclick = () => { t.classList.remove('is-on'); onAction?.(); };
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), action ? 5000 : ms);
}

export async function copyText(text, label = text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${label}`);
    haptic();
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? `Copied ${label}` : 'Copy failed — long-press to copy instead');
    return ok;
  }
}

/* ---------- popovers & menus ---------- */
let openPop = null;

export function closePopover() {
  if (!openPop) return;
  openPop.el.hidden = true;
  document.body.appendChild(openPop.el);
  const { anchor } = openPop;
  openPop = null;
  anchor?.setAttribute?.('aria-expanded', 'false');
}

/** Show `el` next to `anchor`, inside any open dialog so it stays on top. */
export function openPopover(el, anchor) {
  closePopover();
  const host = anchor.closest('dialog, .viewer') || document.body;
  host.appendChild(el);
  el.hidden = false;
  const r = anchor.getBoundingClientRect();
  const pw = el.offsetWidth, ph = el.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(10, Math.min(left, innerWidth - pw - 10));
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 10) top = Math.max(10, r.top - ph - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');
  openPop = { el, anchor };
  requestAnimationFrame(() => el.querySelector('button, input, select')?.focus({ preventScroll: true }));
}

/** Build a one-off menu: items = [{ label, icon?, onSelect, danger?, disabled? } | '-' ]. */
export function showMenu(anchor, items, title) {
  const el = $('#menu-pop');
  el.innerHTML = (title ? `<p class="popover-title">${esc(title)}</p>` : '') + items.map((it, i) => (it === '-'
    ? '<hr>'
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? `<span class="mi">${it.icon}</span>` : ''}${esc(it.label)}</button>`)).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closePopover();
    items[Number(b.dataset.i)].onSelect();
  };
  openPopover(el, anchor);
}

export function popoverIsOpen() { return !!openPop; }

document.addEventListener('pointerdown', (e) => {
  if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) closePopover();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPop) { e.stopPropagation(); closePopover(); } }, true);
addEventListener('resize', closePopover);

/* ---------- prompt / confirm in a glass dialog ---------- */
export function ask({ title, message = '', input = null, confirm = 'OK', cancel = 'Cancel', danger = false, colors = null }) {
  const dlg = $('#ask-dialog');
  $('#ask-title').textContent = title;
  $('#ask-message').textContent = message;
  $('#ask-message').hidden = !message;
  const field = $('#ask-input');
  field.hidden = input === null;
  field.value = input ?? '';
  const swatches = $('#ask-colors');
  swatches.hidden = !colors;
  let picked = colors?.[0] ?? null;
  if (colors) {
    swatches.innerHTML = colors.map((c, i) => `<button type="button" class="tab-color ${i === 0 ? 'is-on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Tab color ${c}"></button>`).join('');
    swatches.onclick = (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      picked = b.dataset.c;
      $$('.tab-color', swatches).forEach((x) => x.classList.toggle('is-on', x === b));
    };
  }
  $('#ask-ok').textContent = confirm;
  $('#ask-ok').classList.toggle('btn-danger', danger);
  $('#ask-cancel').textContent = cancel;
  dlg.showModal();
  if (input !== null) { field.focus(); field.select(); }
  return new Promise((resolve) => {
    dlg.onclose = () => {
      const ok = dlg.returnValue === 'ok';
      resolve(ok ? { value: field.value.trim(), color: picked } : null);
    };
  });
}

/**
 * Open a glass dialog that is built on demand and removed from the page when
 * it closes, so nothing is left behind in the document.
 * Returns the <dialog>; its content lives in `.dlg-content`.
 */
export function openDialog({ title, cls = '', html = '', onClose } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal glass ${cls}`.trim();
  dlg.innerHTML = `<form method="dialog" class="modal-head">
      <h2 class="display">${esc(title)}</h2>
      <button class="icon-btn" aria-label="Close" value="close">${ICONS.close}</button>
    </form>
    <div class="dlg-content">${html}</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => {
    try { onClose?.(dlg); } finally { dlg.remove(); }
  });
  dlg.showModal();
  return dlg;
}

/** Yes/No confirmation in a glass dialog. Resolves true when confirmed. */
export function confirmDialog({ title, message = '', confirm = 'Yes', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = openDialog({
      title,
      cls: 'ask',
      html: `${message ? `<p class="muted">${esc(message)}</p>` : ''}
        <div class="ask-actions">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>
          <button type="button" class="btn btn-glass" data-no>${esc(cancel)}</button>
        </div>`,
      onClose: () => resolve(!!dlg.confirmed),
    });
    dlg.querySelector('[data-yes]').onclick = () => { dlg.confirmed = true; dlg.close(); };
    dlg.querySelector('[data-no]').onclick = () => dlg.close();
  });
}

/** Human-friendly size: 1.4 MB, 312 KB, 86 bytes. */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/* ---------- segmented controls with a sliding "liquid" indicator ---------- */
export function syncSegment(seg) {
  const ink = $('.seg-ink', seg);
  const on = $('.is-on', seg);
  if (!ink || !on) return;
  const prev = ink.style.left;
  ink.style.left = `${on.offsetLeft}px`;
  ink.style.width = `${on.offsetWidth}px`;
  if (prev && prev !== ink.style.left && !reducedMotion()) {
    ink.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.18) scaleY(.9)' }, { transform: 'scaleX(1)' }], { duration: 420, easing: 'ease-out' });
  }
}

/* ---------- glass sheen that follows the pointer ---------- */
export function initSheen() {
  if (matchMedia('(hover: none)').matches) return;
  let last = null;
  document.addEventListener('pointermove', (e) => {
    const g = e.target.closest?.('.glass');
    if (last && last !== g) last.classList.remove('lit');
    if (!g) { last = null; return; }
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', `${e.clientX - r.left}px`);
    g.style.setProperty('--my', `${e.clientY - r.top}px`);
    g.classList.add('lit');
    last = g;
  }, { passive: true });
}

/* ---------- celebratory burst ---------- */
export function burst(anchor, colors) {
  if (reducedMotion()) return;
  const r = anchor.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const list = colors.length ? colors : ['#FFD43B'];
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement('span');
    dot.className = 'burst';
    dot.style.background = list[i % list.length];
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    document.body.appendChild(dot);
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const d = 40 + Math.random() * 50;
    dot.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => dot.remove();
  }
}

export const ICONS = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6L2.5 9.3l6.6-.8L12 2.5Z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.6 6.4A8 8 0 1 0 19.7 14h-2.1a6 6 0 1 1-1.4-6.2L13 11h7V4l-2.4 2.4Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v8.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V4ZM5 18h14v2H5v-2Z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7V7Zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11v2Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8L4 17.2Zm13.7-7.6a1 1 0 0 0 0-1.4l-1.9-1.9a1 1 0 0 0-1.4 0l-1.4 1.4 2.8 2.8 1.9-1.9Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8l4-4Z"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 7-1.4 1.4L13 8.8V19h-2V8.8l-4.6 4.6L5 12l7-7Z"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19l-7-7 1.4-1.4 4.6 4.6V5h2v10.2l4.6-4.6L19 12l-7 7Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h2V4H6Zm4 0v16h8V4h-8Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Zm7 12 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8V7a5 5 0 0 0-9.9-1l1.9.4A3 3 0 0 1 15 7v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1Zm-5 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92Z"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18V4a8 8 0 0 1 0 16Z"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3Zm-3 11H8v-5h8v5Zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM18 3H6v4h12V3Z"/></svg>',
  art: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5Z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-16-5.5 5.5 1.4 1.4L11 7.8V16h2V7.8l3.1 3.1 1.4-1.4L12 4Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4Zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm3-10H5V5h10v4Z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5Zm0 12.5L4.5 10.8 2 12l10 5 10-5-2.5-1.2L12 14.5Zm0 4L4.5 14.8 2 16l10 5 10-5-2.5-1.2L12 18.5Z"/></svg>',
  brush: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3Zm13.71-9.37-1.34-1.34a.996.996 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a.996.996 0 0 0 0-1.41Z"/></svg>',
  qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h3v3h-3v-3Zm5 0h3v2h-3v-2Zm-2 2h2v3h-2v-3Zm-3 3h3v2h-3v-2Zm5 1h3v2h-3v-2Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.6 8.8a.5.5 0 0 0 .1.6l2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.7 1.7 1l.4 2.5c0 .2.2.4.5.4h3.8c.3 0 .5-.2.5-.4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h2V4H6Zm4 0v16h8V4h-8Z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8l10 10-8 8L3 11V3Zm4 2.5A1.5 1.5 0 1 0 7 8.5a1.5 1.5 0 0 0 0-3Z"/></svg>',
};
