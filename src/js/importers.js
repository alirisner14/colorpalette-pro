// Read palette files from other apps: Adobe Swatch Exchange (.ase), Photoshop
// swatches (.aco), GIMP palettes (.gpl), Procreate swatches (.swatches),
// Sketch palettes, hex lists, CSS variables, Paint.NET palettes, this app's own
// JSON / SVG, and share codes. Everything is read on the device.
import { normalizeHex, rgbToHex, hsvToHex, parseColorCodes, clamp } from './color.js';
import { nameColors } from './names.js';
import { readZip } from './zip.js';
import { decodeShare, extractShareCode } from './sharecode.js';

export const IMPORT_ACCEPT = '.ase,.aco,.gpl,.swatches,.sketchpalette,.json,.txt,.hex,.css,.svg,.html,.htm,.csv,.pal';
const MAX_COLORS = 60;
const MAX_PALETTES = 60;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const ascii = (bytes, start, len) => String.fromCharCode(...bytes.subarray(start, start + len));
const utf16be = (bytes, start, chars) => {
  let s = '';
  for (let i = 0; i < chars; i++) s += String.fromCharCode((bytes[start + 2 * i] << 8) | bytes[start + 2 * i + 1]);
  return s;
};
const cleanName = (s) => String(s ?? '').replace(/\0/g, '').replace(/\s+#?[0-9a-f]{6}$/i, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const baseName = (file) => cleanName(file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')) || 'Imported palette';
const titleCase = (s) => s.replace(/\b([a-z])([a-z']*)/gi, (_, a, b) => a.toUpperCase() + b.toLowerCase());

/* ---------- color spaces ---------- */

const cmykToHex = (c, m, y, k) => rgbToHex({ r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k) });

/** CIE Lab (D50, as used by Adobe) → sRGB. */
export function labToHex(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.96422 * f(fx);
  const Y = f(fy);
  const Z = 0.82521 * f(fz);
  const lin = [
    3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z,
    -0.9787684 * X + 1.9161415 * Y + 0.033454 * Z,
    0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z,
  ];
  const enc = (v) => {
    v = clamp(v, 0, 1);
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return rgbToHex({ r: enc(lin[0]), g: enc(lin[1]), b: enc(lin[2]) });
}

/* ---------- binary formats ---------- */

function parseAse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== 'ASEF') throw new Error('That is not an Adobe Swatch Exchange file.');
  const blocks = dv.getUint32(8);
  const palettes = [];
  const loose = { name: '', colors: [] };
  let current = null;
  let p = 12;
  for (let i = 0; i < blocks && p + 6 <= bytes.length; i++) {
    const type = dv.getUint16(p);
    const len = dv.getUint32(p + 2);
    const body = p + 6;
    p = body + len;
    if (type === 0xc001) {
      const n = dv.getUint16(body);
      current = { name: cleanName(utf16be(bytes, body + 2, Math.max(0, n - 1))), colors: [] };
      palettes.push(current);
    } else if (type === 0xc002) {
      current = null;
    } else if (type === 0x0001) {
      const n = dv.getUint16(body);
      const name = cleanName(utf16be(bytes, body + 2, Math.max(0, n - 1)));
      let q = body + 2 + n * 2;
      const model = ascii(bytes, q, 4);
      q += 4;
      let hex = null;
      if (model === 'RGB ') hex = rgbToHex({ r: dv.getFloat32(q) * 255, g: dv.getFloat32(q + 4) * 255, b: dv.getFloat32(q + 8) * 255 });
      else if (model === 'CMYK') hex = cmykToHex(dv.getFloat32(q), dv.getFloat32(q + 4), dv.getFloat32(q + 8), dv.getFloat32(q + 12));
      else if (model === 'LAB ') hex = labToHex(dv.getFloat32(q) * 100, dv.getFloat32(q + 4), dv.getFloat32(q + 8));
      else if (model === 'Gray') { const g = dv.getFloat32(q) * 255; hex = rgbToHex({ r: g, g, b: g }); }
      if (hex) (current ?? loose).colors.push({ hex, name });
    }
  }
  if (loose.colors.length) palettes.unshift(loose);
  return palettes;
}

function parseAco(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const v1 = dv.getUint16(0);
  if (v1 !== 1 && v1 !== 2) throw new Error('That is not a Photoshop swatches file.');
  const colorAt = (space, w, x, y, z) => {
    if (space === 0) return rgbToHex({ r: w / 257, g: x / 257, b: y / 257 });
    if (space === 1) return hsvToHex({ h: (w / 65535) * 360, s: x / 65535, v: y / 65535 });
    if (space === 2) return cmykToHex(1 - w / 65535, 1 - x / 65535, 1 - y / 65535, 1 - z / 65535);
    if (space === 7) return labToHex(w / 100, (x > 32767 ? x - 65536 : x) / 100, (y > 32767 ? y - 65536 : y) / 100);
    if (space === 8) { const g = (w / 10000) * 255; return rgbToHex({ r: g, g, b: g }); }
    return null;
  };
  const count1 = dv.getUint16(2);
  const colors = [];
  let p = 4;
  for (let i = 0; i < count1; i++, p += 10) {
    const hex = colorAt(dv.getUint16(p), dv.getUint16(p + 2), dv.getUint16(p + 4), dv.getUint16(p + 6), dv.getUint16(p + 8));
    if (hex) colors.push({ hex, name: '' });
  }
  // A version-2 block follows version 1 and carries the color names.
  if (p + 4 <= bytes.length && dv.getUint16(p) === 2) {
    const count2 = dv.getUint16(p + 2);
    p += 4;
    const named = [];
    for (let i = 0; i < count2 && p + 14 <= bytes.length; i++) {
      const hex = colorAt(dv.getUint16(p), dv.getUint16(p + 2), dv.getUint16(p + 4), dv.getUint16(p + 6), dv.getUint16(p + 8));
      const nlen = dv.getUint32(p + 10);
      const name = cleanName(utf16be(bytes, p + 14, Math.max(0, nlen - 1)));
      p += 14 + nlen * 2;
      if (hex) named.push({ hex, name });
    }
    if (named.length) return [{ name: '', colors: named }];
  }
  return [{ name: '', colors }];
}

async function parseSwatchesZip(bytes) {
  const files = readZip(bytes);
  const entry = files.get('Swatches.json') ?? [...files].find(([n]) => /(^|\/)swatches\.json$/i.test(n))?.[1];
  if (!entry) throw new Error('That zip does not contain a Procreate palette (Swatches.json).');
  return fromProcreateJson(JSON.parse(new TextDecoder().decode(await entry())));
}

function fromProcreateJson(json) {
  const list = Array.isArray(json) ? json : [json];
  return list.filter((p) => p && Array.isArray(p.swatches)).map((p) => ({
    name: cleanName(p.name),
    colors: p.swatches.filter(Boolean).map((s) => ({
      hex: hsvToHex({ h: (Number(s.hue) || 0) * 360, s: clamp(Number(s.saturation) || 0), v: clamp(Number(s.brightness) || 0) }),
      name: cleanName(s.name),
    })),
  }));
}

/* ---------- text formats ---------- */

function parseGpl(text) {
  const colors = [];
  let name = '';
  for (const line of text.split(/\r?\n/)) {
    const nm = line.match(/^Name:\s*(.+)$/i);
    if (nm) { name = cleanName(nm[1]); continue; }
    const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+(.*))?$/);
    if (m && +m[1] <= 255 && +m[2] <= 255 && +m[3] <= 255) colors.push({ hex: rgbToHex({ r: +m[1], g: +m[2], b: +m[3] }), name: cleanName(m[4]) });
  }
  return [{ name, colors }];
}

function parseSketch(json) {
  const list = Array.isArray(json.colors) ? json.colors : [];
  return [{
    name: '',
    colors: list.map((c) => ({ hex: rgbToHex({ r: (Number(c.red) || 0) * 255, g: (Number(c.green) || 0) * 255, b: (Number(c.blue) || 0) * 255 }), name: cleanName(c.name) })),
  }];
}

function parseOwnJson(json) {
  const list = Array.isArray(json) ? json : [json];
  return list.filter((p) => p && Array.isArray(p.colors)).map((p) => ({
    name: cleanName(p.name),
    colors: p.colors.map((c) => (typeof c === 'string' ? { hex: normalizeHex(c), name: '' } : { hex: normalizeHex(c.hex), name: cleanName(c.name) })).filter((c) => c.hex),
  }));
}

function parseSvg(text) {
  const colors = [];
  for (const m of text.matchAll(/<g>\s*<title>([^<]*)<\/title>\s*<rect[^>]*fill="(#[0-9a-f]{6})"/gi)) {
    colors.push({ hex: m[2].toUpperCase(), name: cleanName(m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'")) });
  }
  const title = text.match(/<text[^>]*font-size="24"[^>]*>([^<]+)<\/text>/i);
  return colors.length ? [{ name: cleanName(title?.[1] ?? ''), colors }] : [];
}

function parseText(text) {
  const colors = [];
  let name = '';

  // CSS custom properties:  --sunny-day: #ffd93d;
  for (const m of text.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi)) {
    const hex = parseColorCodes(m[2])[0];
    if (hex) colors.push({ hex, name: titleCase(m[1].replace(/[-_]+/g, ' ')) });
  }
  if (colors.length) return [{ name, colors }];

  const lines = text.split(/\r?\n/);
  let first = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
    const argb = line.match(/^([0-9a-f]{8})$/i); // Paint.NET: AARRGGBB
    if (argb) { colors.push({ hex: `#${argb[1].slice(2).toUpperCase()}`, name: '' }); first = false; continue; }
    const named = line.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})\s+([A-Za-z][^,;]*)$/i);
    if (named) { colors.push({ hex: normalizeHex(named[1]), name: cleanName(named[2]) }); first = false; continue; }
    const codes = parseColorCodes(line);
    if (codes.length) { codes.forEach((hex) => colors.push({ hex, name: '' })); first = false; continue; }
    if (first && !colors.length && line.length <= 60) { name = cleanName(line); first = false; }
  }
  return [{ name, colors }];
}

/* ---------- putting it together ---------- */

/** Pull this app's backup out of an HTML flipbook export. */
export function backupFromHtml(text) {
  const m = text.match(/<script[^>]*id="cpp-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

const isBackup = (json) => json && typeof json === 'object' && json.type === 'color-palette-pro-backup';

/**
 * Work out what a file is and read it.
 * @param {string} fileName
 * @param {Uint8Array} bytes
 * @returns {Promise<{ kind: 'palettes', palettes: object[], warnings: string[] } | { kind: 'backup', data: object }>}
 */
export async function parsePaletteFile(fileName, bytes) {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('That file is too big to be a palette.');
  const ext = (fileName.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  const warnings = [];
  let raw;

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp'].includes(ext)) {
    throw new Error('That is a picture. Use Photo mode to pull a palette out of it.');
  }

  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'ASEF') raw = parseAse(bytes);
  else if (ext === 'aco') raw = parseAco(bytes);
  else if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) raw = await parseSwatchesZip(bytes);
  else {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    const trimmed = text.trimStart();
    if (trimmed.startsWith('GIMP Palette') || ext === 'gpl') raw = parseGpl(text);
    else if (/^\s*(<!doctype html|<html)/i.test(trimmed) || ext === 'html' || ext === 'htm') {
      const data = backupFromHtml(text);
      if (!isBackup(data)) throw new Error('That web page is not a Color Palette PRO backup.');
      return { kind: 'backup', data };
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[') || ext === 'json' || ext === 'sketchpalette') {
      let json;
      try { json = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
      if (isBackup(json)) return { kind: 'backup', data: json };
      if (json && Array.isArray(json.colors) && json.colors.some((c) => c && 'red' in c)) raw = parseSketch(json);
      else if (Array.isArray(json) && json.some((p) => p && Array.isArray(p.swatches))) raw = fromProcreateJson(json);
      else if (json && Array.isArray(json.swatches)) raw = fromProcreateJson(json);
      else raw = parseOwnJson(json);
    } else if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || ext === 'svg') {
      raw = parseSvg(text);
    } else {
      const code = extractShareCode(text);
      const shared = code ? decodeShare(code) : null;
      raw = shared ? [{ name: shared.name, colors: shared.colors }] : parseText(text);
    }
  }
  return { kind: 'palettes', palettes: tidyPalettes(raw, baseName(fileName), warnings), warnings };
}

/** Pasted text: a share link / code, or any list of color codes. */
export function parsePastedText(text) {
  const warnings = [];
  const code = extractShareCode(text);
  const shared = code ? decodeShare(code) : null;
  const raw = shared ? [{ name: shared.name, colors: shared.colors }] : parseText(String(text));
  return { kind: 'palettes', palettes: tidyPalettes(raw, 'Pasted colors', warnings), warnings };
}

/** Validate, cap sizes and drop empties. */
function tidyPalettes(list, fallbackName, warnings) {
  const out = [];
  for (const p of list) {
    const colors = (p.colors ?? []).filter((c) => c && normalizeHex(c.hex)).map((c) => ({ hex: normalizeHex(c.hex), name: cleanName(c.name) }));
    if (!colors.length) continue;
    let name = cleanName(p.name) || fallbackName;
    if (colors.length > MAX_COLORS) {
      warnings.push(`“${name}” has ${colors.length} colors; the first ${MAX_COLORS} were kept.`);
      colors.length = MAX_COLORS;
    }
    out.push({ name, colors });
  }
  if (out.length > MAX_PALETTES) {
    warnings.push(`The file holds ${out.length} palettes; the first ${MAX_PALETTES} were kept.`);
    out.length = MAX_PALETTES;
  }
  return out;
}

let counter = 0;
const newId = () => `imp-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Turn a parsed palette into one the app can store: names filled in, id and labels set. */
export function finalizePalette(raw) {
  const generated = nameColors(raw.colors.map((c) => c.hex));
  return {
    id: newId(),
    name: raw.name || 'Imported palette',
    harmony: 'imported',
    source: 'import',
    colors: raw.colors.map((c, i) => ({ hex: c.hex, name: c.name || generated[i] })),
    createdAt: new Date().toISOString(),
  };
}
