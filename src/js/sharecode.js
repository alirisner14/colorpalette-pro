// Share a palette as a short code or a link. The code carries the palette's
// name and its colors (3 bytes each); color names are made again on the other
// side, so a 15-color palette is only ~100 characters, which also keeps the
// QR code small. Everything happens on the device: there is no server.
import { normalizeHex, hexToRgb, rgbToHex } from './color.js';
import { nameColors } from './names.js';

const PREFIX = 'C1';
const MAX_COLORS = 60;

function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The palette as a compact code, e.g. "C1TXkgUGFsZXR0ZQD..." */
export function encodeShare(palette) {
  const nameBytes = new TextEncoder().encode(String(palette.name || 'Shared palette').slice(0, 40)).slice(0, 80);
  const colors = palette.colors.slice(0, MAX_COLORS);
  const bytes = new Uint8Array(nameBytes.length + 1 + colors.length * 3);
  bytes.set(nameBytes, 0);
  bytes[nameBytes.length] = 0;
  colors.forEach((c, i) => {
    const { r, g, b } = hexToRgb(c.hex);
    bytes.set([r, g, b], nameBytes.length + 1 + i * 3);
  });
  return PREFIX + toBase64Url(bytes);
}

/** Read a code made by encodeShare. Returns { name, colors:[{hex,name}] } or null. */
export function decodeShare(code) {
  const text = String(code || '').trim();
  if (!text.startsWith(PREFIX) || text.length < 8) return null;
  let bytes;
  try { bytes = fromBase64Url(text.slice(PREFIX.length)); } catch { return null; }
  const zero = bytes.indexOf(0);
  if (zero < 0) return null;
  const rest = bytes.length - zero - 1;
  if (rest < 3 || rest % 3 || rest / 3 > MAX_COLORS) return null;
  let name;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(0, zero)).trim(); } catch { return null; }
  const hexes = [];
  for (let i = 0; i < rest / 3; i++) {
    const o = zero + 1 + i * 3;
    hexes.push(rgbToHex({ r: bytes[o], g: bytes[o + 1], b: bytes[o + 2] }));
  }
  const names = nameColors(hexes);
  return { name: name || 'Shared palette', colors: hexes.map((hex, i) => ({ hex: normalizeHex(hex), name: names[i] })) };
}

/** A link that opens the app with the palette ready to save. `base` is the app's address. */
export function shareLink(palette, base) {
  return `${base.split('#')[0]}#s=${encodeShare(palette)}`;
}

/** Find a share code inside a pasted link or any text. */
export function extractShareCode(text) {
  const m = String(text || '').match(/(?:[#?&]s=)?(C1[A-Za-z0-9_-]{8,})/);
  return m ? m[1] : null;
}
