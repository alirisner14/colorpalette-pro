// HTML builders for palettes and swatches, shared by the studio, builder and viewer.
import { readableText, rgbString } from './color.js';
import { getShape } from './shapes.js';
import { typeLabel, getHarmony, MAX_COLORS } from './harmonies.js';
import { esc, ICONS } from './ui.js';

export const rgbCss = (hex) => `rgb(${rgbString(hex)})`;

function codes(c) {
  return `<span class="codes">
    <button type="button" class="code" data-action="copy" data-text="${c.hex}" title="Copy HEX">${c.hex}</button>
    <button type="button" class="code" data-action="copy" data-text="${rgbCss(c.hex)}" title="Copy RGB">RGB ${rgbString(c.hex)}</button>
  </span>`;
}

function tools(p, i, { editable }) {
  if (!editable) return '';
  return `<span class="swatch-tools">
      <button type="button" class="mini" data-action="swap" data-pid="${p.id}" data-index="${i}" aria-label="Swap color">${ICONS.swap}</button>
      <button type="button" class="mini" data-action="remove" data-pid="${p.id}" data-index="${i}" aria-label="Remove color">${ICONS.trash}</button>
    </span>`;
}

export function swatchHtml(p, c, i, shapeId, opts = {}) {
  const fill = `data-action="copy" data-text="${c.hex}" aria-label="${esc(c.name)}, ${c.hex}. Copy HEX"`;
  const base = p.base && c.hex === p.base ? '<span class="base-dot" title="Your starting color"></span>' : '';
  if (shapeId === 'chip') {
    return `<li class="swatch chip" style="--c:${c.hex};--fg:${readableText(c.hex)};--i:${i}">
      <button type="button" class="chip-color" ${fill}>${base}<span class="copy-hint">Copy</span></button>
      ${tools(p, i, opts)}
      <span class="chip-label"><span class="swatch-name">${esc(c.name)}</span>${codes(c)}</span>
    </li>`;
  }
  const shape = getShape(shapeId);
  return `<li class="swatch shaped" style="--c:${c.hex};--i:${i}">
    <button type="button" class="shape-btn" ${fill}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d="${shape.path(i)}" fill="${c.hex}"/></svg>${base}
    </button>
    ${tools(p, i, opts)}
    <span class="swatch-name">${esc(c.name)}</span>${codes(c)}
  </li>`;
}

/**
 * A palette card. `actions` is a list of action ids rendered as icon buttons:
 * star, shuffle, add, copyall, export, save, clear.
 */
export function paletteHtml(p, { shapeId = 'chip', saved = false, editable = true, actions = ['star', 'shuffle', 'add', 'copyall', 'export'], maxColors = MAX_COLORS, extraClass = '' } = {}) {
  const blurb = getHarmony(p.harmony)?.blurb ?? '';
  const btn = {
    star: `<button type="button" class="icon-btn star ${saved ? 'is-on' : ''}" data-action="star" data-pid="${p.id}" aria-pressed="${saved}" aria-label="${saved ? 'Saved in' : 'Save to'} swatch book" title="${saved ? 'Saved — tap to remove' : 'Save to swatch book'}">${ICONS.star}</button>`,
    shuffle: `<button type="button" class="icon-btn" data-action="shuffle" data-pid="${p.id}" aria-label="Shuffle this palette" title="Shuffle">${ICONS.shuffle}</button>`,
    add: `<button type="button" class="icon-btn" data-action="add" data-pid="${p.id}" aria-label="Add a color" title="Add a color" ${p.colors.length >= maxColors ? 'disabled' : ''}>${ICONS.plus}</button>`,
    copyall: `<button type="button" class="icon-btn" data-action="copyall" data-pid="${p.id}" aria-label="Copy all codes" title="Copy all codes" aria-haspopup="menu">${ICONS.copy}</button>`,
    export: `<button type="button" class="icon-btn" data-action="export" data-pid="${p.id}" aria-label="Export" title="Export" aria-haspopup="dialog">${ICONS.download}</button>`,
  };
  const source = p.source === 'photo' && p.harmony !== 'photo-pure' ? ' · from your photo' : '';
  return `<article class="palette glass ${extraClass}" data-id="${p.id}">
    <header class="palette-head">
      <div class="palette-title">
        <h2 class="palette-name"><button type="button" class="name-btn" data-action="rename" data-pid="${p.id}" title="Rename palette" ${editable ? '' : 'disabled'}>${esc(p.name)} <span class="pencil">${ICONS.pencil}</span></button></h2>
        <p class="palette-meta"><span class="pill" title="${esc(blurb)}">${esc(typeLabel(p))}</span>${p.colors.length} colors${source}</p>
      </div>
      <div class="palette-actions">${actions.map((a) => btn[a] ?? a).join('')}</div>
    </header>
    <ol class="swatches shape-${shapeId}">${p.colors.map((c, i) => swatchHtml(p, c, i, shapeId, { editable })).join('')}</ol>
  </article>`;
}

/** A compact strip of colors, used on book pages and blades. */
export const stripHtml = (p) => `<span class="strip">${p.colors.map((c) => `<span style="background:${c.hex}"></span>`).join('')}</span>`;
