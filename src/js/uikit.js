// Small HTML builders shared by the Print & cut and Customize dialogs.
import { esc } from './ui.js';

/** A segmented choice. Buttons carry data-set="name" data-value="id". */
export const segHtml = (name, value, options, label = name) => `<div class="seg-inline" role="radiogroup" aria-label="${esc(label)}">${options.map(([id, text]) => `<button type="button" role="radio" class="${id === value ? 'is-on' : ''}" aria-checked="${id === value}" data-set="${name}" data-value="${id}">${esc(text)}</button>`).join('')}</div>`;

/** A labelled on/off switch. The checkbox carries data-toggle="name". */
export const toggleHtml = (name, label, checked, hint = '') => `<label class="switch-row"><span>${label}${hint ? `<small class="hint">${hint}</small>` : ''}</span><input type="checkbox" data-toggle="${name}" ${checked ? 'checked' : ''}></label>`;

/** The little picture on a shape button. */
export function shapeIconHtml(shape) {
  if (!shape.path) return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="14" y="22" width="72" height="56" rx="8"/></svg>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${shape.path(0)}"/></svg>`;
}

/** The grid of shape buttons (several can be on). Buttons carry data-shape="id". */
export const shapeGridHtml = (shapes, chosen) => `<div class="shape-grid">${shapes.map((s) => `<button type="button" class="shape-pick ${chosen.includes(s.id) ? 'is-on' : ''}" data-shape="${s.id}" aria-pressed="${chosen.includes(s.id)}" title="${esc(s.label)}">${shapeIconHtml(s)}<span>${esc(s.label)}</span></button>`).join('')}</div>`;
