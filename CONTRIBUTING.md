# Contributing

Color Palette PRO is **proprietary software** in a private repository. It does not accept outside contributions.
If that changes, contributors will have to sign a contributor licence agreement before any patch can be accepted,
so that On the Rise Digital owns everything it sells.

The notes below are for anyone with access who is working on the code.

## Development

```bash
npm start   # http://localhost:5173
npm test    # unit tests (Node's built-in test runner)
```

There is no build step and there are no dependencies. Keep it that way unless there's a strong reason not to.
Simple hosting and packaging with Capacitor both depend on it.

## Conventions

- **Modules:** plain ES modules in `src/js/`. Color math, generation and naming stay free of DOM code, so they can be unit tested in Node.
- **Style:** 2-space indent, single quotes, semicolons, trailing commas in multi-line literals (see `.editorconfig`).
- **Tests:** add or update tests in `tests/` for any change to `color.js`, `harmonies.js`, `names.js`, `shapes.js`, `zip.js` or `export.js`.
- **Accessibility:** every control needs an accessible name and has to work from the keyboard. Respect `prefers-reduced-motion`.
- **Storage:** go through `storage.js`. Never call `localStorage` directly, because it can throw.
- **Service worker:** when you add a file that the app shell needs, add it to `SHELL` in `sw.js` and bump `VERSION`.

## Branches and commits

- `main` is always releasable.
- Work on `feature/<short-name>` or `fix/<short-name>` branches and merge with a pull request.
- Write commit messages in the imperative mood, for example "Add hexagon swatch shape".
- Update `CHANGELOG.md` under **Unreleased** with every user-facing change.

## Releasing

1. Move the **Unreleased** changelog entries under a new version heading.
2. Bump `version` in `package.json` and `VERSION` in `sw.js`.
3. Run `npm test`.
4. Check the release items in `Legal/direct/CHECKLIST.md`.
5. Tag the release: `git tag v1.x.y`.
