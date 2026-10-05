import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSvg } from '../src/js/scene.js';
import {
  normalizeOpts, defaultOpts, resetLayout, COVER_TITLE, COVER_SUBTITLE, COVER_COLORS,
} from '../src/js/bookopts.js';
import {
  planPages, pageScene, planBlades, bladeScene, bookPageSize, bladeSize, bladePivot, sampleBook, coverDots,
} from '../src/js/bookpages.js';
import { coverScene, isCoverDataUrl } from '../src/js/cover.js';
import {
  makeBackup, readBackup, mergeBooks, backupFileName, toScriptJson, parseBackupText, BACKUP_TYPE,
} from '../src/js/backupcore.js';
import { buildFlipbookHtml } from '../src/js/backuphtml.js';
import { backupFromHtml } from '../src/js/importers.js';
import { normalizeBook } from '../src/js/book.js';
import { makeBook, assertInside, pids, bbox } from './helpers.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
/** Everything on a cover except its soft background circles must sit inside the page. */
function assertCoverInside(sc, label) {
  assertInside({ ...sc, items: sc.items.filter((it) => !(it.t === 'circle' && it.op != null && !it.stroke)) }, label);
}
const PX = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';

/* ---------- options ---------- */

test('options start with sensible defaults', () => {
  const o = defaultOpts();
  assert.equal(o.layout, 'book');
  assert.deepEqual(o.book.shapes, ['rect']);
  assert.equal(o.book.perPage, 6);
  assert.equal(o.book.orient, 'portrait');
  assert.equal(o.book.artwork, false);
  assert.equal(o.deck.perBlade, 1);
  assert.ok(o.deck.showName && o.deck.showColorNames && o.deck.showHex && o.deck.showRgb);
  assert.equal(o.covers.book.title, COVER_TITLE);
  assert.equal(o.covers.book.subtitle, COVER_SUBTITLE.book);
  assert.equal(o.covers.deck.subtitle, COVER_SUBTITLE.deck);
  assert.equal(o.covers.book.on, true);
  assert.equal(o.covers.book.color, COVER_COLORS[0]);
});

test('options are clamped, and junk is dropped', () => {
  const o = normalizeOpts({
    layout: 'zine',
    book: { perPage: 99, shapes: ['nope', 'heart', 'heart'], orient: 'sideways', artTemplate: 'missing', showHex: 'yes' },
    deck: { perBlade: 0 },
    covers: { book: { on: false, color: 'blue' }, deck: { on: false, title: 'x'.repeat(100), subtitle: 5, color: '#abc' } },
  });
  assert.equal(o.layout, 'book');
  assert.equal(o.book.perPage, 12);
  assert.deepEqual(o.book.shapes, ['heart']);
  assert.equal(o.book.orient, 'portrait');
  assert.equal(o.book.artTemplate, 'auto');
  assert.equal(o.book.showHex, false);
  assert.equal(o.deck.perBlade, 1);
  assert.equal(o.covers.book.on, true, 'the book always has a cover');
  assert.equal(o.covers.book.color, COVER_COLORS[0]);
  assert.equal(o.covers.deck.on, false, 'the deck cover is optional');
  assert.equal(o.covers.deck.title.length, 40);
  assert.equal(o.covers.deck.subtitle, COVER_SUBTITLE.deck);
  assert.equal(o.covers.deck.color, '#AABBCC');
  for (const junk of [null, undefined, 5, 'x', [], { book: 7, deck: [], covers: 'no' }]) {
    assert.deepEqual(normalizeOpts(junk), defaultOpts());
  }
});

test('options can be cleared of text and survive a second pass unchanged', () => {
  const o = normalizeOpts({ covers: { book: { title: '', subtitle: '' } } });
  assert.equal(o.covers.book.title, '');
  assert.equal(o.covers.book.subtitle, '');
  assert.deepEqual(normalizeOpts(o), o);
  assert.deepEqual(normalizeOpts(JSON.parse(JSON.stringify(o))), o);
});

test('resetting one layout leaves the other, the cover and the choice of layout alone', () => {
  const o = normalizeOpts({ layout: 'deck', book: { perPage: 3 }, deck: { perBlade: 3, showHex: false }, covers: { deck: { title: 'Mine' } } });
  const r = resetLayout(o, 'deck');
  assert.equal(r.deck.perBlade, 1);
  assert.equal(r.deck.showHex, true);
  assert.equal(r.book.perPage, 3);
  assert.equal(r.layout, 'deck');
  assert.equal(r.covers.deck.title, 'Mine');
});

/* ---------- pages ---------- */

test('the book is a cover followed by each tab’s pages, and art pages follow when asked', () => {
  const book = makeBook(14, ['Blues', 'Pinks']);
  const o = normalizeOpts({ book: { perPage: 4 } });
  const plan = planPages(book, o);
  assert.equal(plan[0].kind, 'cover');
  const tabPages = plan.filter((d) => d.kind === 'tab');
  assert.equal(tabPages.length, 4, 'two tabs of 7 palettes, 4 per page');
  assert.deepEqual(plan.filter((d) => d.no).map((d) => d.no), [1, 2, 3, 4]);
  assert.equal(tabPages.flatMap((d) => d.ids).length, 14);
  assert.ok(tabPages.every((d) => d.ids.length <= 4));

  const withArt = planPages(book, normalizeOpts({ book: { perPage: 4, artwork: true } }));
  assert.deepEqual(withArt.map((d) => d.kind), ['cover', 'tab', 'art', 'tab', 'art', 'tab', 'art', 'tab', 'art']);
  withArt.forEach((d, i) => { if (d.kind === 'art') assert.deepEqual(d.ids, withArt[i - 1].ids); });
  assert.deepEqual(withArt.filter((d) => d.no).map((d) => d.no), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('an empty tab still gets a page, and an empty book still has a cover', () => {
  const book = makeBook(3, ['A', 'B', 'C', 'D']);
  book.sections[3].ids = [];
  const plan = planPages(book, defaultOpts());
  assert.equal(plan.filter((d) => d.kind === 'tab').length, 4);
  const empty = plan.find((d) => d.sectionId === book.sections[3].id);
  assert.deepEqual(empty.ids, []);
  assertInside(pageScene(empty, { book, opts: defaultOpts() }), 'empty tab');
  const none = makeBook(0);
  assert.equal(planPages(none, defaultOpts()).length, 2);
});

test('every page stays on the page and shows each palette once, for every setting', () => {
  const book = makeBook(11, ['Blues', 'Pinks', 'Greens']);
  const variants = [
    {},
    { perPage: 1 }, { perPage: 2 }, { perPage: 3 }, { perPage: 5 }, { perPage: 9 }, { perPage: 12 },
    { perPage: 4, orient: 'landscape' }, { perPage: 1, orient: 'landscape' }, { perPage: 8, orient: 'landscape' },
    { perPage: 4, showColorNames: true, showHex: true, showRgb: true },
    { perPage: 6, showColorNames: true, showHex: true, showRgb: true },
    { perPage: 2, shapes: ['heart', 'star', 'flower'], showColorNames: true },
    { perPage: 6, showName: false },
    { perPage: 3, artwork: true }, { perPage: 6, artwork: true, artTemplate: 'room', orient: 'landscape' },
  ];
  for (const v of variants) {
    const opts = normalizeOpts({ book: v });
    const plan = planPages(book, opts);
    plan.forEach((d, i) => {
      const sc = pageScene(d, { book, opts });
      const size = bookPageSize(opts.book.orient);
      assert.equal(sc.w, size.w);
      assert.equal(sc.h, size.h);
      (d.kind === 'cover' ? assertCoverInside : assertInside)(sc, `${JSON.stringify(v)} page ${i} (${d.kind})`);
      const found = pids(sc.items);
      if (d.kind === 'tab') assert.deepEqual(found, d.ids, `${JSON.stringify(v)} page ${i}`);
      if (d.kind === 'art') assert.deepEqual(found, d.ids.map((id) => `art:${id}`));
    });
  }
});

test('page numbers and the tab name are drawn on a page', () => {
  const book = makeBook(8, ['Blues', 'Pinks']);
  const plan = planPages(book, defaultOpts());
  const texts = (items, out = []) => { items.forEach((it) => (it.t === 'g' ? texts(it.items, out) : it.t === 'text' && out.push(it.text))); return out; };
  const sc = pageScene(plan[1], { book, opts: defaultOpts() });
  const t = texts(sc.items);
  assert.ok(t.includes('Blues'));
  assert.ok(t.includes('1'));
  assert.ok(t.includes('Palette 1'));
});

test('the "..." buttons can be left out, for the static backup page', () => {
  const book = makeBook(4);
  const plan = planPages(book, defaultOpts());
  const withMore = toSvg(pageScene(plan[1], { book, opts: defaultOpts() }), { units: 'none' });
  const without = toSvg(pageScene(plan[1], { book, opts: defaultOpts(), more: false }), { units: 'none' });
  assert.match(withMore, /pb-more/);
  assert.doesNotMatch(without, /pb-more/);
  assert.match(without, /data-pid/);
});

test('interactive pages are not hidden from screen readers', () => {
  const book = makeBook(2);
  const sc = pageScene(planPages(book, defaultOpts())[1], { book, opts: defaultOpts() });
  assert.match(toSvg(sc, { units: 'none', title: 'Page 1', interactive: true }), /^<svg[^>]*role="group" aria-label="Page 1"/);
  assert.match(toSvg(sc, { units: 'none' }), /^<svg[^>]*aria-hidden="true"/);
});

/* ---------- the deck ---------- */

test('the deck is an optional cover followed by blades', () => {
  const book = makeBook(9, ['Blues', 'Pinks']);
  const opts = normalizeOpts({ deck: { perBlade: 2 } });
  const plan = planBlades(book, opts);
  assert.equal(plan[0].kind, 'cover');
  assert.equal(plan.filter((d) => d.kind === 'blade').flatMap((d) => d.ids).length, 9);
  assert.ok(plan.every((d) => d.ids.length <= 2));
  const bare = planBlades(book, normalizeOpts({ deck: { perBlade: 2 }, covers: { deck: { on: false } } }));
  assert.equal(bare[0].kind, 'blade');
  assert.equal(bare.length, plan.length - 1);
});

test('every blade stays on the blade and shows each palette once, for every setting', () => {
  const book = makeBook(10, ['Blues', 'Pinks', 'Empty']);
  book.sections[2].ids = [];
  const variants = [
    {}, { perBlade: 2 }, { perBlade: 3 }, { perBlade: 4 },
    { showColorNames: false, showHex: false, showRgb: false },
    { showName: false }, { shapes: ['heart', 'star'] }, { perBlade: 2, shapes: ['circle'], showRgb: false },
  ];
  for (const v of variants) {
    const opts = normalizeOpts({ deck: v });
    planBlades(book, opts).forEach((d, i) => {
      const sc = bladeScene(d, { book, opts });
      const size = bladeSize(opts.deck.perBlade);
      assert.equal(sc.w, size.w);
      assert.equal(sc.h, size.h);
      (d.kind === 'cover' ? assertCoverInside : assertInside)(sc, `${JSON.stringify(v)} blade ${i}`);
      if (d.kind === 'blade') assert.deepEqual(pids(sc.items), d.ids, `${JSON.stringify(v)} blade ${i}`);
    });
  }
});

test('the pivot sits at the punch hole, inside the blade', () => {
  for (const n of [1, 2, 3, 4]) {
    const { w } = bladeSize(n);
    const p = bladePivot(n);
    assert.equal(p.x, w / 2);
    assert.ok(p.y > 3 && p.y < 12);
  }
});

test('sample palettes give Customize something to show', () => {
  const s = sampleBook();
  assert.equal(Object.keys(s.palettes).length, 6);
  assert.equal(s.sections[0].ids.length, 6);
  for (const p of Object.values(s.palettes)) {
    assert.ok(p.name && p.colors.length >= 6);
    assert.ok(p.colors.every((c) => /^#[0-9A-F]{6}$/.test(c.hex) && c.name));
  }
  assert.deepEqual(coverDots(sampleBook()).length, 8);
  assert.deepEqual(coverDots(makeBook(0)), []);
});

/* ---------- covers ---------- */

test('a cover holds its title, however long, inside the page', () => {
  const cfg = { title: 'Ali’s Big Book of Color Dreams and Other Wonders', subtitle: 'Spring 2026 Collection', color: '#E8498F' };
  for (const [w, h] of [[100, 140], [140, 100], [46, 150], [160, 150]]) {
    const sc = coverScene(w, h, cfg, { dots: ['#FF0000', '#00FF00'] });
    assertCoverInside(sc, `cover ${w}x${h}`);
    assert.equal(sc.items[0].fill, '#E8498F');
  }
});

test('a cover can have no words, and a picture goes behind the label', () => {
  const bare = coverScene(100, 140, { title: '', subtitle: '', color: '#2F6FE4' });
  assert.ok(bare.items.every((it) => it.t !== 'text'));
  const pic = coverScene(100, 140, { title: 'Hi', subtitle: '', color: '#2F6FE4' }, { image: PX });
  const kinds = pic.items.map((it) => it.t);
  assert.ok(kinds.includes('image'));
  assert.ok(kinds.indexOf('image') < kinds.indexOf('text'), 'the picture is under the words');
  assert.match(toSvg(pic, { units: 'none' }), /<image href="data:image\/jpeg;base64,/);
});

test('only small, real pictures are accepted as cover images', () => {
  assert.equal(isCoverDataUrl(PX), true);
  assert.equal(isCoverDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(isCoverDataUrl('data:text/html;base64,PGI+'), false);
  assert.equal(isCoverDataUrl('https://example.com/a.png'), false);
  assert.equal(isCoverDataUrl('data:image/png;base64,' + 'A'.repeat(6_000_000)), false);
  assert.equal(isCoverDataUrl(null), false);
});

/* ---------- backup ---------- */

function sampleBackup() {
  const book = makeBook(7, ['Blues', 'Pinks']);
  const opts = normalizeOpts({ layout: 'deck', book: { perPage: 3, shapes: ['heart'] }, covers: { book: { title: 'Mine', image: true } } });
  return makeBackup({ book, opts, covers: { book: PX, deck: null }, now: new Date('2026-10-04T12:00:00Z') });
}

test('a backup survives being written and read back', () => {
  const b = sampleBackup();
  assert.equal(b.type, BACKUP_TYPE);
  const r = readBackup(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(r.book, normalizeBook(clone(b.book)));
  assert.equal(r.opts.layout, 'deck');
  assert.deepEqual(r.opts.book.shapes, ['heart']);
  assert.equal(r.opts.covers.book.title, 'Mine');
  assert.equal(r.opts.covers.book.image, true);
  assert.equal(r.opts.covers.deck.image, false);
  assert.equal(r.covers.book, PX);
  assert.equal(r.covers.deck, null);
  assert.equal(r.counts.palettes, 7);
  assert.equal(r.counts.tabs, 2);
  assert.equal(r.counts.covers, 1);
  assert.equal(r.createdAt, '2026-10-04T12:00:00.000Z');
});

test('a damaged or hand-edited backup is cleaned, not trusted', () => {
  const b = sampleBackup();
  const ids = Object.keys(b.book.palettes);
  b.book.palettes[ids[0]].colors.push({ hex: 'not a color', name: 'Oops' }, { hex: '#ff00ff', name: '' }, null);
  b.book.palettes[ids[0]].name = `  ${'N'.repeat(200)}  `;
  b.book.palettes[ids[1]].colors = [];
  b.book.palettes[ids[2]] = 'not a palette';
  b.book.palettes['bad id <script>'] = b.book.palettes[ids[3]];
  b.book.sections[0].ids.push('ghost', ids[0]);
  b.book.sections.push({ id: b.book.sections[0].id, name: 'Dupe', color: 'zzz', ids: [] }, null, 'x');
  b.covers.deck = 'javascript:alert(1)';
  b.opts.book.perPage = 500;
  const r = readBackup(b);
  const all = r.book.sections.flatMap((s) => s.ids);
  assert.equal(new Set(all).size, all.length, 'no palette is listed twice');
  assert.ok(all.every((id) => r.book.palettes[id]), 'every listed palette exists');
  assert.ok(!all.includes('ghost'));
  assert.ok(!r.book.palettes[ids[1]], 'a palette with no colors is dropped');
  assert.ok(!r.book.palettes[ids[2]]);
  assert.ok(Object.keys(r.book.palettes).every((id) => /^[\w.:-]{1,80}$/.test(id)));
  const first = r.book.palettes[ids[0]];
  assert.equal(first.name.length, 60);
  assert.equal(first.colors.length, b.book.palettes[ids[0]].colors.length - 3 + 1 - 0, 'only the valid colors stay');
  assert.ok(first.colors.every((c) => /^#[0-9A-F]{6}$/.test(c.hex) && c.name));
  assert.equal(r.covers.deck, null);
  assert.equal(r.opts.book.perPage, 12);
  assert.equal(new Set(r.book.sections.map((s) => s.id)).size, r.book.sections.length, 'tab ids are unique');
});

test('files that are not backups, or are from the future, are refused with a friendly message', () => {
  assert.throws(() => readBackup(null), /not a Color Palette PRO backup/);
  assert.throws(() => readBackup({ type: 'something-else' }), /not a Color Palette PRO backup/);
  assert.throws(() => readBackup({ type: BACKUP_TYPE, version: 99 }), /newer version/);
  const empty = readBackup({ type: BACKUP_TYPE, version: 1 });
  assert.equal(empty.counts.palettes, 0);
  assert.equal(empty.book.sections.length, 1, 'there is always a tab to put things in');
});

test('adding a backup to a book skips what is already there and shares tabs by name', () => {
  const mine = makeBook(5, ['Blues']);
  const theirs = makeBook(8, ['blues', 'Pinks']);
  const before = Object.keys(mine.palettes).length;
  const res = mergeBooks(mine, readBackup(makeBackup({ book: theirs, opts: defaultOpts() })).book);
  assert.equal(res.skipped, 5, 'palettes 1-5 are the same colors and names');
  assert.equal(res.added, 3);
  assert.equal(Object.keys(mine.palettes).length, before + 3);
  assert.equal(mine.sections.find((s) => s.name === 'Blues').ids.length + (mine.sections.find((s) => s.name === 'Pinks')?.ids.length ?? 0), 8);
  const again = mergeBooks(mine, theirs);
  assert.equal(again.added, 0);
  assert.equal(again.tabsAdded, 0);
  const ids = mine.sections.flatMap((s) => s.ids);
  assert.equal(new Set(ids).size, ids.length);
});

test('a palette with the same id counts as the same palette, even if it was edited since', () => {
  const mine = makeBook(1);
  const theirs = makeBook(1);
  theirs.palettes.p1.name = 'An older name';
  const res = mergeBooks(mine, theirs);
  assert.equal(res.added, 0);
  assert.equal(res.skipped, 1);
  assert.equal(mine.palettes.p1.name, 'Palette 1', 'what you have now is kept');
});

test('backup file names are tidy and dated', () => {
  const name = backupFileName(new Date(2026, 9, 4, 12));
  assert.match(name, /^Color Palette PRO – Swatch book backup 2026-10-04$/);
  assert.doesNotMatch(name, /[\\/:*?"<>|]/);
});

test('data put inside a web page cannot close the page’s script tag', () => {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const nasty = { name: '</script><script>alert(1)</script>', more: `${LS}${PS} <!-- <b>` };
  const json = toScriptJson(nasty);
  assert.doesNotMatch(json, /</);
  assert.ok(!json.includes(LS) && !json.includes(PS));
  assert.deepEqual(JSON.parse(json), nasty);
});

/* ---------- the flipbook page ---------- */

function flipbook(layout, optsIn = {}) {
  const book = makeBook(9, ['Blues <b>&"x"', 'Pinks']);
  book.palettes.p1.name = '</script><img src=x onerror=alert(1)>';
  const opts = normalizeOpts({ layout, ...optsIn });
  const data = makeBackup({ book, opts, covers: { book: PX, deck: null }, now: new Date('2026-10-04T12:00:00Z') });
  const items = [];
  if (layout === 'book') {
    planPages(book, opts).forEach((d, i) => {
      items.push({ svg: toSvg(pageScene(d, { book, opts, coverImage: PX, more: false }), { units: 'none', title: `Page ${d.no}`, interactive: true, idPrefix: `e${i}-` }), kind: d.kind, sectionId: d.sectionId, no: d.no });
    });
  } else {
    planBlades(book, opts).forEach((d, i) => {
      items.push({ svg: toSvg(bladeScene(d, { book, opts, more: false }), { units: 'none', title: 'Blade', interactive: true, idPrefix: `e${i}-` }), kind: d.kind, sectionId: d.sectionId });
    });
  }
  const html = buildFlipbookHtml({
    data, layout, items,
    tabs: book.sections.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s.ids.length })),
    size: layout === 'book' ? { ...bookPageSize('portrait'), landscape: false } : { ...bladeSize(1), pivot: bladePivot(1).y },
    cover: opts.covers[layout].color,
    fonts: { display: 'AAAA', body: 'BBBB' },
    title: 'My Swatch Book', subtitle: 'Color Palette PRO',
  });
  return { html, data, book, items };
}

for (const layout of ['book', 'deck']) {
  test(`the ${layout} flipbook page is self-contained and carries the data back out`, () => {
    const { html, data, items } = flipbook(layout);
    assert.match(html, /^<!doctype html>/);
    // no way to reach the internet
    assert.doesNotMatch(html, /\b(?:src|href)=["']https?:/i);
    assert.doesNotMatch(html, /@import|url\(https?:/i);
    // the payloads cannot break out of their script tags
    const opens = (html.match(/<script/g) || []).length;
    const closes = (html.match(/<\/script>/g) || []).length;
    assert.equal(opens, 3);
    assert.equal(closes, 3);
    assert.doesNotMatch(html, /<img src=x onerror/);
    // escaped tab names
    assert.match(html, /Blues &lt;b&gt;&amp;&quot;x&quot;/);
    assert.doesNotMatch(html, /Blues <b>/);
    // fonts are embedded
    assert.match(html, /font-family:'Grandstander'[^}]*base64,AAAA/);
    // the page content
    assert.equal((html.match(layout === 'book' ? /<template data-page>/g : /class="blade"/g) || []).length, items.length);
    // Restore can read it back
    const found = backupFromHtml(html);
    assert.deepEqual(found, JSON.parse(JSON.stringify(data)));
    const r = readBackup(found);
    assert.equal(r.counts.palettes, 9);
    assert.equal(r.book.palettes.p1.name, '</script><img src=x onerror=alert(1)>'.slice(0, 60));
  });
}

test('the flipbook page script is valid JavaScript', () => {
  const { html } = flipbook('book');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
  assert.ok(bbox);
});

/* ---------- reading a chosen file ---------- */

test('a chosen backup file is recognised whether it is the flipbook page or the data file', () => {
  const { html, data } = flipbook('book');
  const fromHtml = parseBackupText('Color Palette PRO – Swatch book backup 2026-10-04.html', html);
  assert.deepEqual(fromHtml, JSON.parse(JSON.stringify(data)));
  const json = JSON.stringify(data);
  assert.deepEqual(parseBackupText('backup.json', json), JSON.parse(json));
  assert.deepEqual(parseBackupText('no-extension', json), JSON.parse(json));
  assert.equal(readBackup(parseBackupText('x.html', html)).counts.palettes, 9);
});

test('other files are turned away kindly', () => {
  for (const [name, text] of [
    ['palette.json', JSON.stringify({ name: 'Just a palette', colors: ['#fff'] })],
    ['notes.txt', 'hello'],
    ['page.html', '<!doctype html><title>Some other page</title>'],
    ['broken.json', '{"type": "color-palette-pro-backup", '],
    ['empty.json', ''],
  ]) assert.throws(() => parseBackupText(name, text), /not a Color Palette PRO backup/, name);
});
