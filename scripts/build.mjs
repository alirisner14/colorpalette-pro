// Builds a clean, deployable copy of the app in dist/ (and nothing else).
//   npm run build
// Upload the contents of dist/ to any static host, or zip it for customers who
// want the files. Internal notes, tests and scripts are not included.
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShell } from './shell.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let bytes = 0;
let count = 0;
for (const path of listShell()) {
  if (path === './') continue;
  const to = join(out, path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, path), to);
  bytes += statSync(to).size;
  count++;
}
console.log(`dist/ ready: ${count} files, ${(bytes / 1024).toFixed(0)} KB`);
