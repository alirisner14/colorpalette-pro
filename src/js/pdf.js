// A small vector PDF writer for scenes (see scene.js). No dependencies.
// Text uses the PDF standard fonts (Helvetica, Helvetica-Bold, Courier), so
// nothing needs embedding; characters outside Western European text print as "?".
import { textWidth } from './textmetrics.js';

const PT = 72 / 25.4; // page units are millimetres

const fmt = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '0 0 0';
  const n = parseInt(m[1], 16);
  return `${fmt(((n >> 16) & 255) / 255)} ${fmt(((n >> 8) & 255) / 255)} ${fmt((n & 255) / 255)}`;
}

const CP1252 = { 8364: 0x80, 8218: 0x82, 402: 0x83, 8222: 0x84, 8230: 0x85, 8224: 0x86, 8225: 0x87, 710: 0x88, 8240: 0x89, 352: 0x8a, 8249: 0x8b, 338: 0x8c, 381: 0x8e, 8216: 0x91, 8217: 0x92, 8220: 0x93, 8221: 0x94, 8226: 0x95, 8211: 0x96, 8212: 0x97, 732: 0x98, 8482: 0x99, 353: 0x9a, 8250: 0x9b, 339: 0x9c, 382: 0x9e, 376: 0x9f };

/** A PDF string literal in WinAnsi, as a JS string whose char codes are the bytes. */
export function pdfString(str) {
  let out = '(';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    let b;
    if (c >= 32 && c < 127) b = c;
    else if (c >= 160 && c <= 255) b = c;
    else b = CP1252[c] ?? 63; // '?'
    const s = String.fromCharCode(b);
    out += s === '\\' || s === '(' || s === ')' ? `\\${s}` : s;
  }
  return `${out})`;
}

/* ---------- paths ---------- */

/** Turn an SVG path (M L H V C Q Z, absolute or relative) into PDF path operators. */
export function pathOps(d) {
  // Arc and smooth-curve commands are matched too so they are reported, not misread.
  const tokens = d.match(/[MLHVCQZSTAmlhvcqzsta]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  let lc = [0, 0]; // last cubic control point, for S
  let prev = '';
  const next = () => {
    const v = parseFloat(tokens[i++]);
    if (Number.isNaN(v)) throw new Error('Bad path data');
    return v;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { out.push('h'); x = sx; y = sy; prev = 'Z'; continue; }
    if (C === 'M') {
      x = next() + (rel ? x : 0); y = next() + (rel ? y : 0); sx = x; sy = y;
      out.push(`${fmt(x)} ${fmt(y)} m`);
      cmd = rel ? 'l' : 'L'; // extra pairs after a moveto are line-tos
    } else if (C === 'L') {
      x = next() + (rel ? x : 0); y = next() + (rel ? y : 0);
      out.push(`${fmt(x)} ${fmt(y)} l`);
    } else if (C === 'H') {
      x = next() + (rel ? x : 0);
      out.push(`${fmt(x)} ${fmt(y)} l`);
    } else if (C === 'V') {
      y = next() + (rel ? y : 0);
      out.push(`${fmt(x)} ${fmt(y)} l`);
    } else if (C === 'C') {
      const x1 = next() + (rel ? x : 0), y1 = next() + (rel ? y : 0);
      const x2 = next() + (rel ? x : 0), y2 = next() + (rel ? y : 0);
      const nx = next() + (rel ? x : 0), ny = next() + (rel ? y : 0);
      out.push(`${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(nx)} ${fmt(ny)} c`);
      lc = [x2, y2]; x = nx; y = ny;
    } else if (C === 'S') {
      const x2 = next() + (rel ? x : 0), y2 = next() + (rel ? y : 0);
      const nx = next() + (rel ? x : 0), ny = next() + (rel ? y : 0);
      const smooth = prev === 'C' || prev === 'S';
      const x1 = smooth ? 2 * x - lc[0] : x, y1 = smooth ? 2 * y - lc[1] : y;
      out.push(`${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(nx)} ${fmt(ny)} c`);
      lc = [x2, y2]; x = nx; y = ny;
    } else if (C === 'Q') {
      const qx = next() + (rel ? x : 0), qy = next() + (rel ? y : 0);
      const nx = next() + (rel ? x : 0), ny = next() + (rel ? y : 0);
      // quadratic -> cubic
      out.push(`${fmt(x + (2 / 3) * (qx - x))} ${fmt(y + (2 / 3) * (qy - y))} ${fmt(nx + (2 / 3) * (qx - nx))} ${fmt(ny + (2 / 3) * (qy - ny))} ${fmt(nx)} ${fmt(ny)} c`);
      x = nx; y = ny;
    } else {
      throw new Error(`Unsupported path command ${cmd}`);
    }
    prev = C;
  }
  return out;
}

const K = 0.5522847498;

function rrectOps(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return [`${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)} re`];
  const k = K * r;
  const f = fmt;
  return [
    `${f(x + r)} ${f(y)} m`,
    `${f(x + w - r)} ${f(y)} l`,
    `${f(x + w - r + k)} ${f(y)} ${f(x + w)} ${f(y + r - k)} ${f(x + w)} ${f(y + r)} c`,
    `${f(x + w)} ${f(y + h - r)} l`,
    `${f(x + w)} ${f(y + h - r + k)} ${f(x + w - r + k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} c`,
    `${f(x + r)} ${f(y + h)} l`,
    `${f(x + r - k)} ${f(y + h)} ${f(x)} ${f(y + h - r + k)} ${f(x)} ${f(y + h - r)} c`,
    `${f(x)} ${f(y + r)} l`,
    `${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)} c`,
    'h',
  ];
}

function ellipseOps(cx, cy, rx, ry) {
  const kx = K * rx, ky = K * ry;
  const f = fmt;
  return [
    `${f(cx + rx)} ${f(cy)} m`,
    `${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c`,
    `${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)} c`,
    `${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c`,
    `${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)} c`,
    'h',
  ];
}

/* ---------- items ---------- */

const hasPaint = (v) => v && v !== 'none';

function emit(out, it, gs) {
  if (it.t === 'g') { it.items.forEach((c) => emit(out, c, gs)); return; }
  if (it.t === 'image') return; // images are not drawn in PDFs (only covers use them)
  const fill = hasPaint(it.fill);
  const stroke = hasPaint(it.stroke) && (it.sw ?? 0.25) > 0;
  out.push('q');
  if (it.op != null && it.op < 1) out.push(`/${gs(it.op)} gs`);

  if (it.t === 'text') {
    const bold = it.font === 'display' || it.weight >= 600;
    const font = it.font === 'mono' ? '/F3' : bold ? '/F2' : '/F1';
    // The PDF draws Helvetica, so measure with Helvetica's own widths (no extra allowance for the rounded display font).
    const w = textWidth(it.text, it.size, it.font === 'mono' ? { font: 'mono' } : { font: 'body', weight: bold ? 700 : 400 });
    const x = it.anchor === 'middle' ? it.x - w / 2 : it.anchor === 'end' ? it.x - w : it.x;
    out.push(`${rgb(it.fill || '#000000')} rg`);
    out.push(`BT ${font} ${fmt(it.size)} Tf 1 0 0 -1 ${fmt(x)} ${fmt(it.y)} Tm ${pdfString(it.text)} Tj ET`);
    out.push('Q');
    return;
  }

  let scale = 1;
  if (it.t === 'path' && ((it.s ?? 1) !== 1 || it.tx || it.ty)) {
    scale = it.s ?? 1;
    out.push(`${fmt(scale)} 0 0 ${fmt(scale)} ${fmt(it.tx || 0)} ${fmt(it.ty || 0)} cm`);
  }
  if (fill) out.push(`${rgb(it.fill)} rg`);
  if (stroke) {
    out.push(`${rgb(it.stroke)} RG ${fmt((it.sw ?? 0.25) / scale)} w 1 j ${it.cap === 'butt' ? 0 : 1} J`);
    out.push(it.dash ? `[${it.dash.map((d) => fmt(d / scale)).join(' ')}] 0 d` : '[] 0 d');
  }
  if (it.t === 'line') {
    out.push(`${fmt(it.x1)} ${fmt(it.y1)} m ${fmt(it.x2)} ${fmt(it.y2)} l S`);
    out.push('Q');
    return;
  }
  if (it.t === 'rect') out.push(...rrectOps(it.x, it.y, it.w, it.h, it.r || 0));
  else if (it.t === 'circle') out.push(...ellipseOps(it.cx, it.cy, it.r, it.r));
  else if (it.t === 'ellipse') out.push(...ellipseOps(it.cx, it.cy, it.rx, it.ry));
  else if (it.t === 'path') out.push(...pathOps(it.d));
  const eo = it.rule === 'evenodd';
  out.push(fill && stroke ? (eo ? 'B*' : 'B') : fill ? (eo ? 'f*' : 'f') : stroke ? 'S' : 'n');
  out.push('Q');
}

/* ---------- document ---------- */

const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

function utf16Hex(str) {
  let hex = 'FEFF';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) {
      const v = c - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += c.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

/**
 * Build a PDF from scene pages (units: millimetres).
 * @param {{w:number,h:number,bg?:string,items:object[]}[]} pages
 * @returns {Uint8Array}
 */
export function buildPdf(pages, { title = 'Document', author = '', creator = 'Color Palette PRO' } = {}) {
  if (!pages.length) throw new Error('A PDF needs at least one page.');
  const alphas = [];
  const gsName = (a) => {
    let i = alphas.findIndex((v) => Math.abs(v - a) < 0.005);
    if (i < 0) { alphas.push(a); i = alphas.length - 1; }
    return `GS${i + 1}`;
  };

  const contents = pages.map((pg) => {
    const out = [`${fmt(PT)} 0 0 ${fmt(-PT)} 0 ${fmt(pg.h * PT)} cm`];
    if (pg.bg) out.push(`${rgb(pg.bg)} rg 0 0 ${fmt(pg.w)} ${fmt(pg.h)} re f`);
    pg.items.forEach((it) => emit(out, it, gsName));
    return out.join('\n');
  });

  // Object numbers: 1 catalog, 2 pages, 3-5 fonts, then graphics states, info, then page/content pairs.
  const FONT_BASE = 3;
  const gsBase = 6;
  const infoNum = gsBase + alphas.length;
  const pageBase = infoNum + 1;
  const total = pageBase + pages.length * 2;
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (s) => { const b = typeof s === 'string' ? bytes(s) : s; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n${body}\nendobj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(FONT_BASE, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(FONT_BASE + 1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  obj(FONT_BASE + 2, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  alphas.forEach((a, i) => obj(gsBase + i, `<< /Type /ExtGState /ca ${fmt(a)} /CA ${fmt(a)} >>`));
  const now = new Date();
  const stamp = `D:${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`;
  obj(infoNum, `<< /Title ${utf16Hex(title)} /Author ${utf16Hex(author)} /Creator ${utf16Hex(creator)} /Producer ${utf16Hex(creator)} /CreationDate (${stamp}) >>`);
  const resources = `/Resources << /Font << /F1 ${FONT_BASE} 0 R /F2 ${FONT_BASE + 1} 0 R /F3 ${FONT_BASE + 2} 0 R >>${alphas.length ? ` /ExtGState << ${alphas.map((_, i) => `/GS${i + 1} ${gsBase + i} 0 R`).join(' ')} >>` : ''} >>`;
  pages.forEach((pg, i) => {
    const pn = pageBase + i * 2;
    obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pg.w * PT)} ${fmt(pg.h * PT)}] ${resources} /Contents ${pn + 1} 0 R >>`);
    const body = contents[i];
    obj(pn + 1, `<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });

  const xref = pos;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
