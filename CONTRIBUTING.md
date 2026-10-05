# Contributing

Color Palette PRO is **proprietary software**. It does not accept outside contributions.
If that changes, contributors will have to sign a contributor licence agreement before any patch can be accepted,
so that On the Rise Digital owns everything it sells.

The notes below are for anyone with access who is working on the code.

## Development

```bash
npm start            # http://localhost:5173 (use a web address, not file://, so offline mode can work)
npm test             # unit tests (Node's built-in test runner)
npm run shell        # rewrite the offline file list in sw.js
npm run build        # write the public files to dist/ (including sw.js)
npm run preview      # serve dist/ to check exactly what will be deployed
```

There are no runtime dependencies and no bundler. Keep it that way unless there's a strong reason not to.
Simple hosting and packaging with Capacitor both depend on it.

## Conventions

- **Modules:** plain ES modules in `src/js/`. Color math, generation, naming, layout (`sheet.js`, `bookpages.js`,
  `printable.js`), backups (`backupcore.js`) and the drawing scene (`scene.js`) stay free of DOM code, so they can be unit
  tested in Node. The screen, the live previews, the PDF/SVG/PNG/JPG files and the flipbook backup all draw the same scenes.
- **Style:** 2-space indent, single quotes, semicolons, trailing commas in multi-line literals (see `.editorconfig`).
- **Tests:** add or update tests in `tests/` for any change to the pure modules above, `color.js`, `harmonies.js`,
  `names.js`, `shapes.js`, `zip.js`, `export.js` or `importers.js`.
- **Accessibility:** every control needs an accessible name and has to work from the keyboard. Respect `prefers-reduced-motion`.
- **Storage:** go through `storage.js` (local storage), `idb.js` (IndexedDB) and `store.js`. They are guarded because
  storage can throw or be blocked.
- **Clean up after yourself.** The app lives on the user's device and must leave nothing behind:
  - make temporary object URLs with `blobUrl()` from `lifecycle.js` (it revokes them), never `URL.createObjectURL` directly;
  - empty scratch canvases with `releaseCanvas()` and close decoded bitmaps with `closeBitmap()`;
  - build dialogs with `openDialog()` so they are removed when closed;
  - anything new that is stored must be added to section 2 of `Legal/shared/PRIVACY-POLICY.md`, to the Settings panel and to
    "Delete all my data".
- **No network requests** except for the app's own files. Do not add fonts, scripts, analytics or images from other hosts.
- **Service worker:** when you add or remove a file the app needs, run `npm run shell` (a test fails if the list in `sw.js`
  is out of date) and bump `VERSION` in `sw.js` for a release.

## Branches and commits

- `main` is always releasable.
- Work on `feature/<short-name>` or `fix/<short-name>` branches and merge with a pull request.
- Write commit messages in the imperative mood, for example "Add hexagon swatch shape".
- Update `CHANGELOG.md` under **Unreleased** with every user-facing change.

## Releasing

1. Move the **Unreleased** changelog entries under a new version heading.
2. Bump `version` in `package.json`, `APP_VERSION` in `src/js/meta.js` and `VERSION` in `sw.js`.
3. Run `npm run shell`, `npm test` and `npm run build`.
4. Check the release items in `Legal/direct/CHECKLIST.md`.
5. Tag the release: `git tag v1.x.y`.
