// Minimal ZIP writer (STORE, no compression). Enough for Procreate .swatches files.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const MAX_ENTRY_BYTES = 25 * 1024 * 1024; // refuse anything that unpacks to more than this

/** Inflate raw-deflate data in the browser (or Node), stopping at a safe size. */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY_BYTES) { await reader.cancel(); throw new Error('That file unpacks to something too large.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/**
 * Read a .zip file. Returns a Map of file name → async function giving its bytes.
 * Handles stored and deflated entries, which covers every file this app reads.
 */
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That does not look like a zip file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count > 500) throw new Error('That zip has too many files.');
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('That zip file is damaged.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    files.set(name, async () => {
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error('That zip uses a compression this app does not read.');
    });
  }
  return files;
}

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {{name: string, data: Uint8Array|string}[]} files
 * @returns {Uint8Array}
 */
export function createZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}
