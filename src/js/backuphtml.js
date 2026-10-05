// The flipbook backup: one self-contained .html page that looks and turns like the
// swatch book (or fans like the deck) with no internet, and that also carries
// the backup data, so Restore can read it back. Pure string building (no DOM).
import { toScriptJson } from './backupcore.js';
import { APP_NAME, APP_MAKER } from './meta.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fontFace = (family, b64, range) => (b64
  ? `@font-face{font-family:'${family}';font-style:normal;font-weight:${range};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`
  : '');

const CSS = `
:root{--ink:#17213D;--soft:#56658C;--bg:#EEF4FF;--paper:#FFFDF9;--paper-back:#F1ECE2;--accent:#1A7FD8;--accent-2:#6A5CFF;--spring:cubic-bezier(.3,1.45,.45,1);--display:'Grandstander','Comic Sans MS','Chalkboard SE',cursive;--body:'Nunito',system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#EEF3FF;--soft:#A5B3D6;--bg:#0A0F21;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;font-family:var(--body);color:var(--ink);background:radial-gradient(1200px 600px at 10% -10%,rgba(110,190,255,.35),transparent 60%),radial-gradient(900px 600px at 100% 0,rgba(183,156,255,.3),transparent 60%),var(--bg)}
header{text-align:center;padding:26px 16px 10px}
h1{margin:0;font-family:var(--display);font-size:clamp(1.7rem,4vw,2.4rem)}
header p{margin:6px 0 0;color:var(--soft);font-weight:700}
main{width:100%;max-width:1060px;padding:8px 12px 0}
button{font:inherit;color:inherit;cursor:pointer}
button:disabled{cursor:default;opacity:.4}
.area{display:flex;justify-content:center;align-items:flex-start;--stage-h:clamp(500px,74vh,720px);--side:262px}
.area.landscape{--stage-h:clamp(340px,54vh,520px)}
.body{position:relative;padding:16px 16px 16px 28px;border-radius:30px;background:linear-gradient(135deg,color-mix(in srgb,var(--cover,#2F6FE4) 84%,#fff),var(--cover,#2F6FE4));box-shadow:0 30px 60px -24px rgba(10,20,60,.55),inset 0 1px 0 rgba(255,255,255,.45),inset 0 -10px 30px rgba(0,0,0,.18)}
.body::after{content:'';position:absolute;left:11px;top:44px;bottom:44px;width:14px;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.92) 0 4px,rgba(0,0,0,.28) 5px,transparent 6px) 0 0/14px 34px repeat-y}
.stage{position:relative;width:min(calc(var(--stage-h)*var(--ar-num,.7143)),calc(100vw - var(--side)));aspect-ratio:var(--ar,100/140);perspective:2400px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.stage::before{content:'';position:absolute;inset:6px -6px -6px 6px;border-radius:8px 22px 22px 8px;background:var(--paper-back);box-shadow:3px 3px 0 #E9E3D7,6px 6px 0 #E2DACB,0 20px 40px -20px rgba(0,0,0,.5)}
.page{position:absolute;inset:0;transform-origin:left center;transform-style:preserve-3d}
.page.turn{z-index:3;transition:transform .75s cubic-bezier(.45,.05,.25,1)}
.face{position:absolute;inset:0;-webkit-backface-visibility:hidden;backface-visibility:hidden;border-radius:8px 22px 22px 8px;overflow:hidden;color:#17213D;background:linear-gradient(90deg,rgba(0,0,0,.09),rgba(0,0,0,0) 5%),radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.9),rgba(255,255,255,0) 60%),var(--paper);box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}
.page.is-cover .face.front{background:var(--cover,#2F6FE4);box-shadow:none}
.face.back{transform:rotateY(180deg);background:linear-gradient(270deg,rgba(0,0,0,.1),rgba(0,0,0,0) 6%),var(--paper-back)}
.page.turn .face::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.5));animation:shade .75s ease-in-out both}
@keyframes shade{0%,100%{opacity:0}50%{opacity:.45}}
.pg{position:absolute;inset:0}.pg>svg{width:100%;height:100%;display:block}
.pb{cursor:pointer}
.tabs{display:flex;flex-direction:column;gap:6px;padding-top:26px;width:132px;flex:none}
.tab{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-left:-10px;border:0;border-radius:0 14px 14px 0;padding:10px 10px 10px 18px;text-align:left;background:var(--c);color:#17213D;font-weight:800;font-size:.82rem;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 6px 14px -8px rgba(0,0,0,.45);transition:transform .3s var(--spring),margin .3s var(--spring)}
.tab span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tab b{font-size:.7rem;background:rgba(255,255,255,.6);border-radius:999px;padding:1px 6px}
.tab:hover{transform:translateX(4px)}
.tab.is-on{margin-left:-4px;transform:translateX(6px);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 10px 20px -8px rgba(0,0,0,.5)}
.nav{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px;font-weight:800;color:var(--soft)}
.nav button{width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.75);background:rgba(255,255,255,.55);font-size:1.4rem;line-height:1;color:var(--ink)}
.hint{text-align:center;font-size:.82rem;font-weight:700;color:var(--soft);margin:8px 0 0}
.deckarea{display:flex;flex-direction:column;align-items:stretch}
.deckarea .tabs{order:-1;width:auto;flex-direction:row;flex-wrap:wrap;justify-content:center;gap:8px;padding:0;margin-bottom:16px}
.deckarea .tab{margin:0;border-radius:999px;padding:8px 14px}
.deckarea .tab:hover,.deckarea .tab.is-on{margin:0;transform:translateY(-3px)}
.deck-stage{position:relative;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;border-radius:28px}
.blade{position:absolute;left:50%;top:18px;width:var(--bw);height:var(--bh);margin-left:calc(var(--bw)/-2);transform-origin:50% var(--pivot);border-radius:var(--br);background:#fff;cursor:pointer;box-shadow:0 14px 26px -12px rgba(20,30,60,.55),0 0 0 1px rgba(0,0,0,.06);will-change:transform}
.deck-stage.settle .blade{transition:transform .62s var(--spring),opacity .35s,filter .35s}
.blade-svg{position:absolute;inset:0;border-radius:inherit;overflow:hidden}.blade-svg svg{width:100%;height:100%;display:block}
.blade-tab{position:absolute;right:-10px;top:calc(var(--u)*24);width:15px;height:42px;border-radius:0 10px 10px 0;background:var(--tab);box-shadow:2px 3px 6px -2px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.6)}
.ring{position:absolute;left:50%;top:calc(18px + var(--pivot));width:32px;height:32px;margin:-16px 0 0 -16px;border-radius:50%;z-index:2000;pointer-events:none;border:5px solid;border-color:#F2F5FB #A9B2C6 #7D869C #D9DEEA;box-shadow:0 3px 8px rgba(0,0,0,.4),inset 0 1px 2px rgba(255,255,255,.85)}
.scrub{display:block;width:min(100%,520px);margin:14px auto 0;accent-color:var(--accent)}
dialog{border:0;border-radius:26px;padding:20px;width:min(92vw,460px);color:var(--ink);background:var(--paper);box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
dialog::backdrop{background:rgba(10,15,33,.5)}
dialog h2{margin:0 0 10px;font-family:var(--display)}
.row{display:grid;grid-template-columns:34px 1fr auto auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed rgba(23,33,61,.12)}
.row .sw{width:34px;height:34px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.row b{font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row button{border:0;border-radius:999px;padding:5px 10px;background:rgba(23,33,61,.07);font:700 .72rem ui-monospace,Consolas,monospace}
.close{margin-top:14px;border:0;border-radius:999px;padding:10px 20px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2))}
.note{max-width:640px;margin:26px 16px;text-align:center;font-size:.85rem;line-height:1.55;color:var(--soft)}
.note b{color:var(--ink)}
@media (max-width:700px){.area{--side:56px;flex-direction:column;align-items:stretch}.book{align-self:center}.body{padding:12px 10px 12px 20px;border-radius:24px}.body::after{left:6px;top:34px;bottom:34px}.tabs{order:-1;width:auto;flex-direction:row;overflow-x:auto;padding:0 8px;gap:4px}.tab{flex:none;margin:0 0 -8px;border-radius:14px 14px 0 0;padding:9px 12px 16px;max-width:150px}.tab:hover,.tab.is-on{margin:0 0 -8px;transform:translateY(-4px)}.deckarea .tabs{flex-wrap:nowrap;justify-content:flex-start}.deckarea .tab{border-radius:999px;padding:8px 14px}}
@media (prefers-reduced-motion:reduce){.page.turn,.deck-stage.settle .blade{transition:none}}
`;

const SCRIPT = `
(function () {
  var CFG = JSON.parse(document.getElementById('cpp-view').textContent);
  var DATA = JSON.parse(document.getElementById('cpp-data').textContent);
  var $ = function (s) { return document.querySelector(s); };
  var info = $('#info'), prev = $('#prev'), next = $('#next');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage = $('#stage'), cur = 0, busy = false, N = CFG.kinds.length;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }
  function sync() {
    var k = CFG.kinds[cur], label;
    if (CFG.layout === 'deck') label = k === 'cover' ? 'Closed \\u00b7 tap the cover to open' : 'Blade ' + (cur + (CFG.kinds[0] === 'cover' ? 0 : 1)) + ' of ' + (N - (CFG.kinds[0] === 'cover' ? 1 : 0));
    else label = k === 'cover' ? 'Cover \\u00b7 tap to open' : 'Page ' + CFG.nos[cur] + ' of ' + CFG.pages;
    info.textContent = label;
    prev.disabled = cur <= 0; next.disabled = cur >= N - 1;
    [].forEach.call(document.querySelectorAll('.tab[data-sid]'), function (t) { t.classList.toggle('is-on', t.getAttribute('data-sid') === CFG.sections[cur]); });
  }
  function jump(sid) { var i = CFG.sections.indexOf(sid); if (i >= 0) go(i); }
  [].forEach.call(document.querySelectorAll('.tab[data-sid]'), function (t) { t.addEventListener('click', function () { jump(t.getAttribute('data-sid')); }); });
  prev.addEventListener('click', function () { go(cur - 1); });
  next.addEventListener('click', function () { go(cur + 1); });
  addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });

  /* ---- a palette, bigger, with copyable codes ---- */
  var dlg = $('#pal');
  function rgbOf(h) { return parseInt(h.slice(1, 3), 16) + ', ' + parseInt(h.slice(3, 5), 16) + ', ' + parseInt(h.slice(5, 7), 16); }
  function copyBtn(label, text) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 900); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this:', text); });
      else prompt('Copy this:', text);
    });
    return b;
  }
  function openPalette(pid) {
    var p = DATA.book && DATA.book.palettes && DATA.book.palettes[pid]; if (!p) return;
    $('#pal-name').textContent = p.name;
    var list = $('#pal-list'); list.textContent = '';
    p.colors.forEach(function (c) {
      var row = document.createElement('div'); row.className = 'row';
      var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = c.hex;
      var nm = document.createElement('b'); nm.textContent = c.name;
      row.appendChild(sw); row.appendChild(nm); row.appendChild(copyBtn(c.hex, c.hex)); row.appendChild(copyBtn('RGB ' + rgbOf(c.hex), 'rgb(' + rgbOf(c.hex) + ')'));
      list.appendChild(row);
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#pal-close').addEventListener('click', function () { dlg.close(); });

  var sx = null, sy = 0;
  function tapped(e) { var card = e.target.closest && e.target.closest('[data-pid]'); if (card) { openPalette(card.getAttribute('data-pid')); return true; } return false; }

  if (CFG.layout === 'book') {
    var T = [].slice.call(document.querySelectorAll('template[data-page]'));
    var mk = function (i) {
      var d = document.createElement('div'); d.className = 'page' + (CFG.kinds[i] === 'cover' ? ' is-cover' : '');
      d.innerHTML = '<div class="face front"><div class="pg"></div></div><div class="face back"></div>';
      d.querySelector('.pg').appendChild(T[i].content.cloneNode(true)); return d;
    };
    var show = function (i) { stage.textContent = ''; stage.appendChild(mk(i)); cur = i; sync(); };
    var go = function (t) {
      if (busy || t === cur || t < 0 || t >= N) return;
      if (reduce) { show(t); return; }
      busy = true;
      var old = stage.firstElementChild, nw = mk(t), dir = t > cur ? 1 : -1;
      if (dir > 0) { stage.insertBefore(nw, old); old.classList.add('turn'); old.getBoundingClientRect(); old.style.transform = 'rotateY(-180deg)'; }
      else { nw.classList.add('turn'); nw.style.transform = 'rotateY(-180deg)'; stage.appendChild(nw); nw.getBoundingClientRect(); nw.style.transform = ''; }
      wait(780).then(function () { old.remove(); nw.classList.remove('turn'); nw.style.transform = ''; cur = t; busy = false; sync(); });
    };
    stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { go(cur + (dx < 0 ? 1 : -1)); return; }
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && !tapped(e) && CFG.kinds[cur] === 'cover') go(cur + 1);
    });
    show(0);
  } else {
    var B = [].slice.call(stage.querySelectorAll('.blade')), A = [0, 13, 22, 29, 34, 38], f = {}, pos = 0;
    var covered = CFG.kinds[0] === 'cover';
    var fit = function () {
      var W = +stage.getAttribute('data-w'), H = +stage.getAttribute('data-h'), P = +stage.getAttribute('data-piv');
      var sw = stage.clientWidth || 360, bh = Math.min(Math.max(innerHeight * 0.66, 400), 640), u = bh / H, bw = u * W;
      if (bw > sw * 0.9) { bw = sw * 0.9; u = bw / W; bh = u * H; }
      var pv = P * u, vis = sw < 520 ? 2 : sw < 820 ? 3 : 5, a0 = A[Math.min(vis, 5)], sp = 1;
      for (; sp > 0.3; sp -= 0.05) { var a = a0 * sp * Math.PI / 180; if ((bh - pv) * Math.sin(a) + bw / 2 * Math.cos(a) <= sw / 2 - 8) break; }
      f = { vis: vis, sp: Math.max(0.3, sp) };
      stage.style.height = Math.round(bh + 52) + 'px';
      stage.style.setProperty('--bw', bw + 'px'); stage.style.setProperty('--bh', bh + 'px'); stage.style.setProperty('--u', u + 'px');
      stage.style.setProperty('--pivot', pv + 'px'); stage.style.setProperty('--br', (u * Math.min(4, W * 0.08)) + 'px');
    };
    var ang = function (d) { var x = Math.min(Math.abs(d), f.vis + 1, 5), i = Math.min(Math.floor(x), 4); return (d < 0 ? -1 : 1) * (A[i] + (A[i + 1] - A[i]) * (x - i)) * f.sp; };
    var place = function (p, anim) {
      stage.classList.toggle('settle', !!anim && !reduce);
      var open = covered ? Math.max(0, Math.min(1, p)) : 1;
      B.forEach(function (el, i) {
        var d = i - p, ad = Math.abs(d), hide = ad > f.vis + 0.6;
        el.style.transform = 'rotate(' + (ang(d) * open).toFixed(2) + 'deg)';
        el.style.zIndex = 500 - Math.round(ad * 20);
        el.style.opacity = hide ? 0 : 1; el.style.pointerEvents = hide ? 'none' : '';
        el.style.filter = ad < 0.05 ? '' : 'brightness(' + (1 - Math.min(ad, 4) * 0.045).toFixed(3) + ')';
      });
    };
    var go = function (t) { t = Math.max(0, Math.min(N - 1, Math.round(t))); cur = t; pos = t; place(t, true); $('#scrub').value = t; sync(); };
    var step = function () { return Math.max(46, parseFloat(stage.style.getPropertyValue('--bw')) * 0.42); };
    var drag = null;
    stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, p: pos, mode: 0, t: e.target, s: [[performance.now(), e.clientX]] }; });
    addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.mode && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) { drag.mode = 1; try { stage.setPointerCapture(e.pointerId); } catch (x) {} }
      if (drag.mode !== 1) return;
      drag.s.push([performance.now(), e.clientX]); if (drag.s.length > 6) drag.s.shift();
      var p = drag.p - dx / step(); p = p < 0 ? p * 0.35 : p > N - 1 ? N - 1 + (p - N + 1) * 0.35 : p;
      pos = p; place(p, false);
    });
    addEventListener('pointerup', function (e) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.mode === 1) { var a = d.s[0], b = d.s[d.s.length - 1], v = b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0; go(pos - v * 160 / step()); return; }
      var bl = d.t.closest && d.t.closest('.blade'); if (!bl) return;
      var i = +bl.getAttribute('data-i');
      if (i !== cur) { go(i); return; }
      if (CFG.kinds[i] === 'cover') { go(1); return; }
      tapped({ target: d.t });
    });
    $('#scrub').max = N - 1;
    $('#scrub').addEventListener('input', function (e) { go(+e.target.value); });
    addEventListener('resize', function () { fit(); place(pos, false); });
    fit(); place(0, false); sync();
  }
})();
`;

/**
 * @param {object} p
 * @param {object} p.data the backup object (embedded so Restore can read it back)
 * @param {'book'|'deck'} p.layout
 * @param {{ svg: string, kind: string, sectionId?: string, no?: number }[]} p.items pages or blades, in order
 * @param {{ id: string, name: string, color: string, count: number }[]} p.tabs
 * @param {{ w: number, h: number, pivot?: number, landscape?: boolean }} p.size
 * @param {string} p.cover the hard-cover color
 * @param {{ display?: string, body?: string }} [p.fonts] base64 woff2 data
 * @param {string} p.title
 * @param {string} p.subtitle
 */
export function buildFlipbookHtml({ data, layout, items, tabs, size, cover, fonts = {}, title, subtitle }) {
  const sections = items.map((it) => it.sectionId ?? '');
  const view = {
    layout,
    kinds: items.map((it) => it.kind),
    sections,
    nos: items.map((it) => it.no ?? 0),
    pages: items.filter((it) => it.kind !== 'cover').length,
  };
  const tabHtml = tabs.map((t) => `<button type="button" class="tab" data-sid="${esc(t.id)}" style="--c:${esc(t.color)}"><span>${esc(t.name)}</span><b>${t.count}</b></button>`).join('');
  const nav = '<div class="nav"><button type="button" id="prev" aria-label="Previous">‹</button><span id="info"></span><button type="button" id="next" aria-label="Next">›</button></div>';
  let main;
  if (layout === 'book') {
    const pages = items.map((it) => `<template data-page>${it.svg}</template>`).join('\n');
    main = `<div class="area${size.landscape ? ' landscape' : ''}" style="--cover:${esc(cover)}">
  <div class="book"><div class="body"><div class="stage" id="stage" style="--ar:${size.w} / ${size.h};--ar-num:${(size.w / size.h).toFixed(4)}" aria-live="polite"></div></div></div>
  <nav class="tabs" aria-label="Tabs">${tabHtml}</nav>
</div>
${pages}
${nav}
<p class="hint">Swipe, tap the arrows or use ← → to turn the pages · Tap a palette to see its codes</p>`;
  } else {
    const blades = items.map((it, i) => {
      const tab = tabs.find((t) => t.id === it.sectionId);
      return `<div class="blade" data-i="${i}" style="--tab:${esc(tab?.color ?? 'transparent')}"><div class="blade-svg">${it.svg}</div>${tab ? '<span class="blade-tab"></span>' : ''}</div>`;
    }).join('\n');
    main = `<div class="deckarea area" style="display:flex">
  <nav class="tabs" aria-label="Tabs">${tabHtml}</nav>
  <div class="deck-stage" id="stage" data-w="${size.w}" data-h="${size.h}" data-piv="${size.pivot ?? 6.4}">
${blades}
<span class="ring" aria-hidden="true"></span></div>
  <input id="scrub" class="scrub" type="range" min="0" max="0" value="0" aria-label="Scrub through the deck">
</div>
${nav}
<p class="hint">Swipe or use ← → to fan through the blades · Tap a palette to see its codes</p>`;
  }
  const made = data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${fontFace('Grandstander', fonts.display, '100 900')}${fontFace('Nunito', fonts.body, '200 1000')}${CSS}</style>
</head>
<body>
<header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header>
<main>
${main}
</main>
<dialog id="pal" aria-labelledby="pal-name"><h2 id="pal-name"></h2><div id="pal-list"></div><button type="button" class="close" id="pal-close">Close</button></dialog>
<p class="note"><b>This is a backup of a swatch book made with ${esc(APP_NAME)}</b>${made ? ` on ${esc(made)}` : ''}. It works without an internet connection and keeps your palettes, tabs and look.
To bring it back, open ${esc(APP_NAME)}, go to <b>Settings › Restore from a backup</b> and choose this file.<br>${esc(APP_NAME)} by ${esc(APP_MAKER)}.</p>
<script type="application/json" id="cpp-view">${toScriptJson(view)}</script>
<script type="application/json" id="cpp-data">${toScriptJson(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
