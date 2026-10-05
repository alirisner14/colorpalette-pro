import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { deployFiles } from '../scripts/build.mjs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p.replace(/^\.\//, ''), root), 'utf8');
const files = new Set(deployFiles().map((p) => posix.normalize(p).replace(/^\.\//, '')));

/** Local files a page or stylesheet points at, relative to the site root. */
function localRefs(text, fromFile, pattern) {
  const out = [];
  for (const m of text.matchAll(pattern)) {
    const ref = m[1].trim();
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|#|%23|\/\/)/i.test(ref)) continue; // web addresses, mailto:, data:, anchors (also inside inline SVG)
    const clean = ref.split(/[?#]/)[0];
    const target = clean && posix.normalize(posix.join(dirname(fromFile), clean));
    if (target && target !== './' && target !== '.') out.push(target); // './' is the site's own front page
  }
  return out;
}

test('the deployable files include the service worker, and every one of them exists', () => {
  assert.ok(files.has('sw.js'), 'sw.js has to be deployed, or the app can never work offline');
  for (const f of ['index.html', 'legal.html', 'manifest.webmanifest']) assert.ok(files.has(f), f);
  for (const f of files) assert.ok(existsSync(new URL(f, root)), `${f} is listed but missing`);
});

test('nothing internal is deployed', () => {
  for (const f of files) {
    assert.doesNotMatch(f, /^(tests|scripts|docs|node_modules|\.github|\.scratch)\//, f);
    assert.doesNotMatch(f, /(CHECKLIST|SUBMISSION|GOING-PROPRIETARY|COOKIE-NOTICE|WEBSITE-TERMS)/, f);
  }
});

test('everything the pages, the stylesheets and the manifest point at is deployed', () => {
  const missing = [];
  const want = (list, from) => list.forEach((p) => { if (!files.has(p)) missing.push(`${from} -> ${p}`); });
  for (const page of ['index.html', 'legal.html']) {
    want(localRefs(read(page), page, /\b(?:src|href)="([^"]*)"/g), page);
  }
  for (const css of [...files].filter((f) => f.endsWith('.css'))) {
    want(localRefs(read(css), css, /url\(\s*['"]?([^'")]+)['"]?\s*\)/g), css);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const fromManifest = [manifest.start_url, ...(manifest.icons ?? []).map((i) => i.src), ...(manifest.shortcuts ?? []).flatMap((s) => (s.icons ?? []).map((i) => i.src))];
  want(fromManifest.filter(Boolean).map((p) => posix.normalize(p).replace(/^\.\//, '').split(/[?#]/)[0]), 'manifest.webmanifest');
  assert.deepEqual(missing, []);
});

test('the page registers the service worker that is deployed', () => {
  const pwa = read('src/js/pwa.js');
  const m = pwa.match(/serviceWorker\.register\('([^']+)'/);
  assert.ok(m, 'pwa.js registers a service worker');
  assert.ok(files.has(posix.normalize(m[1])), `${m[1]} is not deployed`);
});

test('the Vercel settings point at the folder the build writes', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.equal(v.outputDirectory, 'dist');
  assert.equal(v.buildCommand, 'npm run build');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
});
