// Import dialog: palette files from other apps, share links, or pasted color codes.
import { IMPORT_ACCEPT, parsePaletteFile, parsePastedText, finalizePalette } from './importers.js';
import { book, persistBook } from './store.js';
import { addPalette } from './book.js';
import { stripHtml } from './render.js';
import { openDialog, esc, toast, ICONS, haptic } from './ui.js';

/**
 * @param {{ files?: File[], sectionId?: string, onDone?: (count:number) => void }} opts
 */
export function openImport({ files = [], sectionId, onDone } = {}) {
  /** @type {{ raw: object, on: boolean, source: string }[]} */
  let items = [];
  const notes = []; // errors and warnings, shown above the list
  let backup = null;

  const dlg = openDialog({
    title: 'Import palettes',
    cls: 'sheet',
    html: `<div class="dlg-body">
      <label class="dropzone imp-drop" id="imp-drop">
        <input type="file" id="imp-file" multiple accept="${IMPORT_ACCEPT}" hidden>
        <span class="dz-empty">${ICONS.upload}
          <b>Drop palette files here</b>
          <span>or tap to choose. Works with Photoshop, Illustrator, InDesign and Affinity swatches (.ase, .aco), Procreate (.swatches), GIMP/Krita/Inkscape (.gpl), Sketch, hex lists, CSS and more.</span>
        </span>
      </label>
      <details class="paste-box">
        <summary>…or paste a share link, a share code or color codes</summary>
        <textarea id="imp-text" rows="3" placeholder="C1AbC…  or  #FF8FB1, #FFC75F, rgb(127, 216, 190)"></textarea>
        <button type="button" class="btn btn-glass btn-wide" id="imp-read">Read these colors</button>
      </details>
      <div id="imp-notes"></div>
      <div id="imp-results" class="imp-results"></div>
      <div class="dlg-foot imp-foot">
        <label class="field-inline"><span>Put them in</span>
          <span class="select-wrap glass-inset"><select id="imp-tab">${book.sections.map((s) => `<option value="${s.id}" ${s.id === sectionId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></span>
        </label>
        <button type="button" class="btn btn-primary" id="imp-go" disabled>Import</button>
      </div>
    </div>`,
  });
  const $ = (sel) => dlg.querySelector(sel);

  function draw() {
    $('#imp-notes').innerHTML = notes.map((n) => `<p class="imp-note ${n.error ? 'is-error' : ''}">${esc(n.text)}</p>`).join('')
      + (backup ? `<p class="imp-note">This is a Color Palette PRO backup. <button type="button" class="link-btn" id="imp-restore">Restore it instead</button></p>` : '');
    $('#imp-results').innerHTML = items.map((it, i) => `<div class="imp-item">
        <label class="imp-check"><input type="checkbox" data-i="${i}" ${it.on ? 'checked' : ''} aria-label="Import ${esc(it.raw.name)}"></label>
        <div class="imp-strip">${stripHtml(it.raw)}</div>
        <input class="text-input sm imp-name" data-name="${i}" value="${esc(it.raw.name)}" maxlength="40" aria-label="Palette name">
        <span class="imp-count">${it.raw.colors.length}</span>
      </div>`).join('');
    const n = items.filter((it) => it.on).length;
    $('#imp-go').disabled = n === 0;
    $('#imp-go').textContent = n ? `Import ${n} palette${n === 1 ? '' : 's'}` : 'Import';
  }

  async function readFiles(list) {
    for (const file of list) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await parsePaletteFile(file.name, bytes);
        if (res.kind === 'backup') { backup = res.data; continue; }
        res.warnings.forEach((text) => notes.push({ text }));
        if (!res.palettes.length) notes.push({ text: `No colors found in “${file.name}”.`, error: true });
        res.palettes.forEach((raw) => items.push({ raw, on: true, source: file.name }));
      } catch (e) {
        notes.push({ text: `“${file.name}”: ${e.message || 'could not be read.'}`, error: true });
      }
    }
    draw();
  }

  $('#imp-file').addEventListener('change', async (e) => { await readFiles([...e.target.files]); e.target.value = ''; });
  const drop = $('#imp-drop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); readFiles([...e.dataTransfer.files]); });

  $('#imp-read').addEventListener('click', () => {
    const res = parsePastedText($('#imp-text').value);
    res.warnings.forEach((text) => notes.push({ text }));
    if (!res.palettes.length) notes.push({ text: 'No colors found in that text. Try a share link, or codes like #FF8FB1 or rgb(255, 143, 177).', error: true });
    res.palettes.forEach((raw) => items.push({ raw, on: true, source: 'pasted' }));
    $('#imp-text').value = '';
    draw();
  });

  dlg.addEventListener('change', (e) => {
    const box = e.target.closest('[data-i]');
    if (box) { items[+box.dataset.i].on = box.checked; draw(); }
  });
  dlg.addEventListener('input', (e) => {
    const name = e.target.closest('[data-name]');
    if (name) items[+name.dataset.name].raw.name = name.value.trim().slice(0, 40) || 'Imported palette';
  });
  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('#imp-restore')) {
      dlg.close();
      (await import('./backupui.js')).restoreFromData(backup);
    }
  });

  $('#imp-go').addEventListener('click', () => {
    const target = $('#imp-tab').value;
    const chosen = items.filter((it) => it.on);
    // addPalette puts each one first, so go backwards to keep the file's order.
    [...chosen].reverse().forEach((it) => addPalette(book, finalizePalette(it.raw), target));
    persistBook();
    haptic(15);
    const where = book.sections.find((s) => s.id === target)?.name ?? 'your swatch book';
    toast(`Imported ${chosen.length} palette${chosen.length === 1 ? '' : 's'} into “${where}” ★`);
    dlg.close();
    onDone?.(chosen.length);
  });

  if (files.length) readFiles(files);
  draw();
}
