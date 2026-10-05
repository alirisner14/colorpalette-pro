// Lists every file the offline app needs, and keeps the list inside sw.js up to date.
//   node scripts/shell.mjs         rewrite the list in sw.js
//   node scripts/shell.mjs --check exit 1 if sw.js is out of date (used by the tests)
//
// The list is also the *public* file set: `npm run build` copies exactly these
// files into dist/, so internal notes (checklists, strategy docs) never ship.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS } from '../src/js/legal.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ROOT_FILES = ['index.html', 'legal.html', 'manifest.webmanifest'];
const DIRS = ['src', 'assets', 'Legal/licences'];
const EXT = /\.(js|css|png|ico|woff2|md|txt|svg)$/i;
const START = '/*SHELL:START*/';
const END = '/*SHELL:END*/';

function walk(dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (EXT.test(entry.name)) out.push(`./${rel}`);
  }
  return out;
}

export function listShell() {
  const docs = Object.values(DOCS).map((d) => `./${d.file}`);
  const files = [...DIRS.flatMap((d) => walk(d)), ...docs];
  return ['./', ...ROOT_FILES.map((f) => `./${f}`), ...[...new Set(files)].sort()];
}

export function renderShellBlock(list = listShell()) {
  return `${START}[\n${list.map((p) => `  '${p}',`).join('\n')}\n]${END}`;
}

export function currentShellBlock() {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const a = sw.indexOf(START);
  const b = sw.indexOf(END);
  if (a < 0 || b < 0) throw new Error('sw.js has no SHELL markers');
  return { sw, a, b: b + END.length, text: sw.slice(a, b + END.length) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sw, a, b, text } = currentShellBlock();
  const next = renderShellBlock();
  if (process.argv.includes('--check')) {
    if (text !== next) { console.error('sw.js file list is out of date. Run: npm run shell'); process.exit(1); }
    console.log('sw.js file list is up to date');
  } else {
    writeFileSync(join(root, 'sw.js'), sw.slice(0, a) + next + sw.slice(b));
    console.log(`sw.js now lists ${listShell().length} files`);
  }
}
