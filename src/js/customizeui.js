// "Customize": pick the book or the deck, dress up its cover, choose the chip
// shapes, what to show, and how many palettes go on a page or blade. A live
// preview redraws as you change things. Choices are saved straight away.
import { book, getBookOpts, setBookOpts } from './store.js';
import { paletteCount } from './book.js';
import { normalizeOpts, resetLayout, COVER_COLORS, COVER_TITLE, COVER_SUBTITLE, LIMITS } from './bookopts.js';
import { PRINT_SHAPES } from './sheet.js';
import { TEMPLATES } from './artwork.js';
import { planPages, pageScene, planBlades, bladeScene, sampleBook, bookPageSize, bladeSize } from './bookpages.js';
import { coverImage, setCoverImage, clearCoverImage } from './cover.js';
import { toSvg } from './scene.js';
import { openDialog, esc, toast } from './ui.js';
import { segHtml, toggleHtml, shapeGridHtml } from './uikit.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export function openCustomize() {
  let st = clone(getBookOpts());
  const save = () => { st = normalizeOpts(st); setBookOpts(st, { silent: true }); };

  const dlg = openDialog({
    title: 'Customize',
    cls: 'sheet sheet-wide cz-dlg',
    html: '<div class="cz"><div class="cz-controls" id="cz-c"></div><div class="cz-side"><div class="cz-previews" id="cz-p"></div><p class="dlg-note cz-note" id="cz-n"></p></div></div>',
    onClose: () => setBookOpts(st), // tells the swatch book to redraw, once
  });
  const $ = (sel) => dlg.querySelector(sel);

  /* ---------- controls ---------- */
  function coverHtml(layout) {
    const c = st.covers[layout];
    const off = layout === 'deck' && !c.on;
    const swatches = COVER_COLORS.map((hex) => `<button type="button" class="tab-color ${c.color.toLowerCase() === hex.toLowerCase() ? 'is-on' : ''}" style="--c:${hex}" data-cover-color="${hex}" aria-label="Cover color ${hex}"></button>`).join('');
    return `<section class="dlg-section"><h3>Cover</h3>
      ${layout === 'deck' ? toggleHtml('coverOn', 'Give the deck a cover', c.on, 'A closed deck you tap or swipe open') : ''}
      ${off ? '' : `
      <div class="field"><span class="field-label">Color</span>
        <div class="ask-colors">${swatches}<label class="tab-color custom" title="Any color" aria-label="Choose any color"><input type="color" data-cover-custom value="${c.color}"></label></div>
      </div>
      <div class="field"><span class="field-label">Picture</span>
        <div class="dlg-actions">
          <label class="btn btn-glass btn-sm">Choose a picture…<input type="file" accept="image/*" id="cz-file" hidden></label>
          ${c.image ? '<button type="button" class="btn btn-glass btn-sm" id="cz-clear">Remove picture</button>' : ''}
        </div>
        <small class="hint">${c.image ? 'Your picture covers the whole cover. Remove it to use your color.' : 'Optional. It stays on this device.'}</small>
      </div>
      <div class="field-row">
        <label>Title<input class="text-input sm" data-text="title" value="${esc(c.title)}" maxlength="${LIMITS.title}" placeholder="${esc(COVER_TITLE)}"></label>
        <label>Subtitle<input class="text-input sm" data-text="subtitle" value="${esc(c.subtitle)}" maxlength="${LIMITS.subtitle}" placeholder="${esc(COVER_SUBTITLE[layout])}"></label>
      </div>
      <button type="button" class="link-btn" id="cz-reset-text">Use the standard words</button>`}
    </section>`;
  }

  function controlsHtml() {
    const layout = st.layout;
    const o = st[layout];
    const per = layout === 'book' ? o.perPage : o.perBlade;
    const [lo, hi] = layout === 'book' ? LIMITS.perPage : LIMITS.perBlade;
    return `
      <section class="dlg-section"><h3>Show my palettes as</h3>
        ${segHtml('layout', layout, [['book', 'Swatch book (pages)'], ['deck', 'Swatch deck (blades)']], 'Book or deck')}
        <p class="dlg-note">${layout === 'book' ? 'A flipbook: turn the pages, with index tabs on the side.' : 'A fan of blades hanging from a ring. Swipe to fan through them.'}</p>
      </section>
      ${coverHtml(layout)}
      <section class="dlg-section"><h3>Shapes</h3>${shapeGridHtml(PRINT_SHAPES, o.shapes)}<p class="dlg-note">Pick one or several. Chips take turns in the shapes you choose.</p></section>
      <section class="dlg-section"><h3>What to show</h3>
        ${toggleHtml('showName', 'Palette name', o.showName)}
        ${toggleHtml('showColorNames', 'Color names', o.showColorNames)}
        ${toggleHtml('showHex', 'HEX codes', o.showHex)}
        ${toggleHtml('showRgb', 'RGB codes', o.showRgb)}
      </section>
      <section class="dlg-section"><h3>${layout === 'book' ? 'Palettes per page' : 'Palettes per blade'}</h3>
        <div class="stepper"><button type="button" class="icon-btn sm" data-step="-1" aria-label="Fewer" ${per <= lo ? 'disabled' : ''}>−</button><output>${per}</output><button type="button" class="icon-btn sm" data-step="1" aria-label="More" ${per >= hi ? 'disabled' : ''}>+</button></div>
        <p class="dlg-note">Everything resizes to fit, and the preview shows how. ${layout === 'book' ? 'With more palettes on a page, turn off details you do not need.' : 'More than one palette makes the blade wider.'}</p>
      </section>
      ${layout === 'book' ? `
      <section class="dlg-section"><h3>Page shape</h3>
        ${segHtml('orient', o.orient, [['portrait', 'Portrait'], ['landscape', 'Landscape']], 'Page shape')}
      </section>
      <section class="dlg-section"><h3>Example artwork</h3>
        ${toggleHtml('artwork', 'Add a page of example artwork after each page of palettes', o.artwork)}
        ${o.artwork ? `<label class="field"><span class="field-label">Picture</span><span class="select-wrap glass-inset"><select data-sel="artTemplate"><option value="auto" ${o.artTemplate === 'auto' ? 'selected' : ''}>Mix it up</option>${TEMPLATES.map((t) => `<option value="${t.id}" ${o.artTemplate === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></span></label>
        <p class="dlg-note">Tap a picture in the book to paint it yourself.</p>` : ''}
      </section>` : ''}
      <section class="dlg-section">
        <button type="button" class="btn btn-glass btn-sm" id="cz-reset">Reset the ${layout} to its standard look</button>
        <p class="dlg-note">This changes how things look on screen. To get paper copies, use <b>More › Print &amp; cut</b>.</p>
      </section>`;
  }

  /* ---------- preview ---------- */
  function renderPreview() {
    const opts = normalizeOpts(st);
    const real = paletteCount(book) > 0;
    const src = real ? book : sampleBook();
    const img = coverImage(opts.layout);
    const scenes = [];
    if (opts.layout === 'book') {
      const plan = planPages(src, opts);
      const ctx = { book: src, opts, coverImage: img };
      scenes.push({ sc: pageScene({ kind: 'cover', ids: [] }, ctx), label: 'Cover', cls: 'cz-pg' });
      const tab = plan.find((d) => d.kind === 'tab' && d.ids.length);
      if (tab) scenes.push({ sc: pageScene(tab, ctx), label: 'A page', cls: 'cz-pg' });
      const art = plan.find((d) => d.kind === 'art');
      if (art) scenes.push({ sc: pageScene(art, ctx), label: 'Artwork page', cls: 'cz-pg' });
    } else {
      const plan = planBlades(src, opts);
      const ctx = { book: src, opts, coverImage: img };
      if (opts.covers.deck.on) scenes.push({ sc: bladeScene({ kind: 'cover', ids: [] }, ctx), label: 'Cover', cls: 'cz-bl' });
      const blade = plan.find((d) => d.kind === 'blade' && d.ids.length);
      if (blade) scenes.push({ sc: bladeScene(blade, ctx), label: 'A blade', cls: 'cz-bl' });
    }
    const unit = opts.layout === 'book' ? (bookPageSize(opts.book.orient).w > bookPageSize(opts.book.orient).h ? 2.3 : 1.9) : 2.2;
    $('#cz-p').innerHTML = scenes.map(({ sc, label, cls }, i) => `<figure class="cz-card ${cls}" style="width:${Math.round(sc.w * unit)}px">${toSvg(sc, { units: 'none', title: label, idPrefix: `cz${i}-` })}<figcaption>${label}</figcaption></figure>`).join('');
    $('#cz-n').textContent = real ? '' : 'Showing sample palettes until you save some of your own.';
  }

  const redraw = () => { $('#cz-c').innerHTML = controlsHtml(); renderPreview(); };
  const edit = (fn) => { fn(st[st.layout]); save(); };

  /* ---------- events ---------- */
  dlg.addEventListener('click', async (e) => {
    const t = e.target;
    const set = t.closest('[data-set]');
    if (set) {
      if (set.dataset.set === 'layout') st.layout = set.dataset.value;
      else edit((o) => { o[set.dataset.set] = set.dataset.value; });
      save();
      redraw();
      return;
    }
    const shape = t.closest('[data-shape]');
    if (shape) {
      edit((o) => {
        const id = shape.dataset.shape;
        if (o.shapes.includes(id)) { if (o.shapes.length > 1) o.shapes = o.shapes.filter((s) => s !== id); } else o.shapes = [...o.shapes, id];
      });
      redraw();
      return;
    }
    const step = t.closest('[data-step]');
    if (step) {
      const key = st.layout === 'book' ? 'perPage' : 'perBlade';
      edit((o) => { o[key] += Number(step.dataset.step); });
      redraw();
      return;
    }
    const swatch = t.closest('[data-cover-color]');
    if (swatch) { st.covers[st.layout].color = swatch.dataset.coverColor; save(); redraw(); return; }
    if (t.closest('#cz-clear')) { await clearCoverImage(st.layout); st.covers[st.layout].image = false; save(); redraw(); return; }
    if (t.closest('#cz-reset-text')) {
      st.covers[st.layout].title = COVER_TITLE;
      st.covers[st.layout].subtitle = COVER_SUBTITLE[st.layout];
      save();
      redraw();
      return;
    }
    if (t.closest('#cz-reset')) { st = resetLayout(st, st.layout); save(); redraw(); toast('Back to the standard look'); }
  });

  dlg.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      const key = t.dataset.toggle;
      if (key === 'coverOn') { st.covers.deck.on = t.checked; save(); redraw(); return; }
      edit((o) => { o[key] = t.checked; });
      redraw();
      return;
    }
    if (t.dataset.sel) { edit((o) => { o[t.dataset.sel] = t.value; }); renderPreview(); return; }
    if (t.matches('[data-cover-custom]')) { st.covers[st.layout].color = t.value; save(); redraw(); return; }
    if (t.id === 'cz-file' && t.files?.[0]) {
      const layout = st.layout;
      try {
        const stored = await setCoverImage(layout, t.files[0]);
        st.covers[layout].image = true;
        save();
        if (!stored) toast('Your picture is on the cover for now, but this browser would not store it.');
      } catch {
        toast('That picture could not be read. Try a JPG or PNG.');
      }
      if (dlg.open) redraw();
    }
  });

  dlg.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.text) {
      st.covers[st.layout][t.dataset.text] = t.value;
      save();
      renderPreview();
    } else if (t.matches('[data-cover-custom]')) {
      st.covers[st.layout].color = t.value;
      save();
      renderPreview();
    }
  });

  redraw();
}
