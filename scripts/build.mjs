// Builds a clean, deployable copy of the app in dist/ (and nothing else).
//   npm run build
// Upload the contents of dist/ to any static host, or zip it for customers who
// want the files. Internal notes, tests and scripts are not included.
// `npm run preview` serves dist/ so you can try exactly what will be deployed.
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listShell } from './shell.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');

/**
 * Every file that goes in dist/: the service worker itself (it does not list itself in
 * the files it stores, but the page has to be able to load it) plus everything the app
 * stores for offline use.
 */
export const deployFiles = () => ['./sw.js', ...listShell().filter((p) => p !== './')];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  let bytes = 0;
  let count = 0;
  for (const path of deployFiles()) {
    const to = join(out, path);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(root, path), to);
    bytes += statSync(to).size;
    count++;
  }
  console.log(`dist/ ready: ${count} files, ${(bytes / 1024).toFixed(0)} KB`);
}
