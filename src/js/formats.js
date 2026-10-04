// Swatch file encoders for design apps. Pure functions (no DOM) so they can be
// unit tested in Node. Each returns { data: Uint8Array|string, mime, ext }.
import { hexToRgb, hexToHsv } from './color.js';
import { createZip } from './zip.js';

const enc = new TextEncoder();

/** Growable big-endian byte writer. */
class Writer {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 255); }
  u16(v) { this.u8(v >> 8); this.u8(v); }
  u32(v) { this.u16(v >>> 16); this.u16(v & 0xffff); }
  f32(v) {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, v);
    for (let i = 0; i < 4; i++) this.u8(b.getUint8(i));
  }
  utf16(str) { for (const ch of str) { const c = ch.charCodeAt(0); this.u16(c); } }
  ascii(str) { for (const ch of str) this.u8(ch.charCodeAt(0)); }
  get length() { return this.bytes.length; }
  append(w) { this.bytes.push(...w.bytes); }
  out() { return Uint8Array.from(this.bytes); }
}

// Keep names to the Basic Multilingual Plane and a sane length for binary formats.
const cleanName = (s, max = 60) => String(s).replace(/[^ -￿]/g, '').slice(0, max) || 'Color';

/** Adobe Swatch Exchange — Photoshop, Illustrator, InDesign, Affinity, CorelDRAW. */
export function encodeAse(palette) {
  const blocks = [];
  const block = (type, body) => {
    const w = new Writer();
    w.u16(type);
    w.u32(body.length);
    w.append(body);
    blocks.push(w);
  };
  const nameBody = (name) => {
    const w = new Writer();
    w.u16(name.length + 1);
    w.utf16(name);
    w.u16(0);
    return w;
  };

  block(0xc001, nameBody(cleanName(palette.name)));
  for (const c of palette.colors) {
    const body = nameBody(cleanName(`${c.name} ${c.hex}`));
    const { r, g, b } = hexToRgb(c.hex);
    body.ascii('RGB ');
    body.f32(r / 255); body.f32(g / 255); body.f32(b / 255);
    body.u16(2); // normal (process) color
    block(0x0001, body);
  }
  block(0xc002, new Writer());

  const w = new Writer();
  w.ascii('ASEF');
  w.u16(1); w.u16(0);
  w.u32(blocks.length);
  blocks.forEach((b) => w.append(b));
  return { data: w.out(), mime: 'application/octet-stream', ext: 'ase' };
}

/** Photoshop Color Swatches (.aco), version 1 + version 2 (with names). */
export function encodeAco(palette) {
  const w = new Writer();
  const colors = palette.colors.map((c) => ({ ...hexToRgb(c.hex), name: cleanName(c.name) }));
  for (const version of [1, 2]) {
    w.u16(version);
    w.u16(colors.length);
    for (const c of colors) {
      w.u16(0); // RGB color space
      w.u16(c.r * 257); w.u16(c.g * 257); w.u16(c.b * 257); w.u16(0);
      if (version === 2) {
        w.u32(c.name.length + 1);
        w.utf16(c.name);
        w.u16(0);
      }
    }
  }
  return { data: w.out(), mime: 'application/octet-stream', ext: 'aco' };
}

/** GIMP palette — GIMP, Inkscape, Krita, Aseprite, Scribus, LibreOffice. */
export function encodeGpl(palette) {
  const lines = [
    'GIMP Palette',
    `Name: ${palette.name}`,
    `Columns: ${Math.min(palette.colors.length, 8)}`,
    '#',
    ...palette.colors.map((c) => {
      const { r, g, b } = hexToRgb(c.hex);
      return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${c.name}`;
    }),
  ];
  return { data: `${lines.join('\n')}\n`, mime: 'text/plain', ext: 'gpl' };
}

/** Procreate swatches: a zip holding Swatches.json (HSB in 0–1). */
export function procreateJson(palette) {
  return JSON.stringify([{
    name: palette.name,
    swatches: palette.colors.slice(0, 30).map(({ hex }) => {
      const { h, s, v } = hexToHsv(hex);
      return { hue: h / 360, saturation: s, brightness: v, alpha: 1, colorSpace: 0 };
    }),
  }]);
}
export function encodeProcreate(palette) {
  return { data: createZip([{ name: 'Swatches.json', data: procreateJson(palette) }]), mime: 'application/zip', ext: 'swatches' };
}

/** Sketch palette plugin format. */
export function encodeSketch(palette) {
  const colors = palette.colors.map((c) => {
    const { r, g, b } = hexToRgb(c.hex);
    return { name: c.name, red: r / 255, green: g / 255, blue: b / 255, alpha: 1 };
  });
  return { data: JSON.stringify({ compatibleVersion: '2.0', pluginVersion: '2.29', colors }, null, 2), mime: 'application/json', ext: 'sketchpalette' };
}

/** Paint.NET palette: AARRGGBB per line. */
export function encodePaintNet(palette) {
  const lines = [`; paint.net Palette File`, `; ${palette.name}`, ...palette.colors.map((c) => `FF${c.hex.slice(1)}`)];
  return { data: `${lines.join('\r\n')}\r\n`, mime: 'text/plain', ext: 'txt' };
}

/** Plain hex list — paste into Canva's Brand Kit, Coolors, etc. */
export function encodeHexList(palette) {
  return { data: `${palette.name}\n${palette.colors.map((c) => `${c.hex}  ${c.name}`).join('\n')}\n`, mime: 'text/plain', ext: 'txt' };
}

export function cssVarName(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'color';
}

/** CSS custom properties. */
export function encodeCss(palette) {
  const seen = new Set();
  const lines = palette.colors.map((c) => {
    let v = cssVarName(c.name);
    while (seen.has(v)) v += '-2';
    seen.add(v);
    return `  --${v}: ${c.hex.toLowerCase()};`;
  });
  return { data: `/* ${palette.name.replace(/\*\//g, '')} — Color Palette PRO */\n:root {\n${lines.join('\n')}\n}\n`, mime: 'text/css', ext: 'css' };
}

export function encodeJson(palette) {
  const data = {
    name: palette.name,
    harmony: palette.harmony,
    colors: palette.colors.map((c) => ({ name: c.name, hex: c.hex, rgb: Object.values(hexToRgb(c.hex)) })),
  };
  return { data: JSON.stringify(data, null, 2), mime: 'application/json', ext: 'json' };
}

const escXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** Vector swatch sheet — drop into Figma, Canva, Illustrator, Affinity. */
export function encodeSvg(palette) {
  const size = 120, gap = 16, pad = 24, labelH = 44;
  const cols = Math.min(palette.colors.length, 5);
  const rows = Math.ceil(palette.colors.length / cols);
  const W = pad * 2 + cols * size + (cols - 1) * gap;
  const H = pad * 2 + 40 + rows * (size + labelH) + (rows - 1) * gap;
  const cells = palette.colors.map((c, i) => {
    const x = pad + (i % cols) * (size + gap);
    const y = pad + 40 + Math.floor(i / cols) * (size + labelH + gap);
    return `<g><title>${escXml(c.name)}</title><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="14" fill="${c.hex}"/>`
      + `<text x="${x}" y="${y + size + 18}" font-family="Nunito, Arial, sans-serif" font-size="13" font-weight="700" fill="#1F2937">${escXml(c.name)}</text>`
      + `<text x="${x}" y="${y + size + 34}" font-family="Nunito, Arial, sans-serif" font-size="12" fill="#6B7280">${c.hex}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="100%" height="100%" fill="#FFFFFF"/>`
    + `<text x="${pad}" y="${pad + 24}" font-family="Grandstander, Arial, sans-serif" font-size="24" font-weight="800" fill="#1E3A8A">${escXml(palette.name)}</text>${cells}</svg>`;
  return { data: svg, mime: 'image/svg+xml', ext: 'svg' };
}

/**
 * Export targets, grouped for the export sheet. `apps` is what users look for;
 * `kind` picks the encoder. Image kinds are rendered by export.js (needs a canvas).
 */
export const FORMATS = [
  { id: 'procreate', label: 'Procreate', apps: 'Procreate on iPad & iPhone', ext: '.swatches', group: 'Art apps', encode: encodeProcreate },
  { id: 'ase', label: 'Adobe & Affinity', apps: 'Photoshop · Illustrator · InDesign · Affinity Designer/Photo · CorelDRAW', ext: '.ase', group: 'Art apps', encode: encodeAse },
  { id: 'aco', label: 'Photoshop Swatches', apps: 'Photoshop swatches panel (all versions)', ext: '.aco', group: 'Art apps', encode: encodeAco },
  { id: 'gpl', label: 'GIMP Palette', apps: 'GIMP · Krita · Inkscape · Aseprite · Scribus', ext: '.gpl', group: 'Art apps', encode: encodeGpl },
  { id: 'sketch', label: 'Sketch', apps: 'Sketch Palettes plugin', ext: '.sketchpalette', group: 'Design apps', encode: encodeSketch },
  { id: 'svg', label: 'Figma & Canva', apps: 'Drag the swatch sheet into Figma, Canva or any vector app', ext: '.svg', group: 'Design apps', encode: encodeSvg },
  { id: 'canva', label: 'Hex codes', apps: 'Paste into Canva Brand Kit, Coolors, Cricut & more', ext: '.txt', group: 'Design apps', encode: encodeHexList, copy: true, suffix: ' (hex codes)' },
  { id: 'paintnet', label: 'Paint.NET', apps: 'Paint.NET palette', ext: '.txt', group: 'Design apps', encode: encodePaintNet, suffix: ' (Paint.NET)' },
  { id: 'jpg', label: 'Image', apps: 'Share or print — in the swatch style you see', ext: '.jpg', group: 'Images', image: 'image/jpeg' },
  { id: 'png', label: 'Transparent PNG', apps: 'Overlay on mood boards and mockups', ext: '.png', group: 'Images', image: 'image/png' },
  { id: 'css', label: 'CSS Variables', apps: 'Websites & web apps', ext: '.css', group: 'Code', encode: encodeCss },
  { id: 'json', label: 'JSON', apps: 'Developers & automations', ext: '.json', group: 'Code', encode: encodeJson },
];

export const getFormat = (id) => FORMATS.find((f) => f.id === id);
export const toBytes = (data) => (typeof data === 'string' ? enc.encode(data) : data);
