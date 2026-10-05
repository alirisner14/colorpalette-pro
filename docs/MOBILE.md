# iOS and Android plan

Color Palette PRO is a dependency-free static web app with a build step that writes only its public files, so it can be
wrapped as a native app with [Capacitor](https://capacitorjs.com) without a rewrite.

## Steps

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Color Palette PRO" com.ontherisedigital.colorpalettepro --web-dir dist
```

1. Run `npm run build`. It writes `dist/` with exactly the files the app needs (including the bundled Grandstander and
   Nunito fonts, which are SIL OFL, so the app works fully offline).
2. Run `npx cap add ios` and `npx cap add android`, then `npx cap sync`.
3. Decide whether the native build should register the service worker. Inside a native web view the files are already on
   the device, so the offline copy is not needed; `src/js/pwa.js` already does nothing where service workers are
   unavailable (it only registers on http and https addresses).

## Platform differences to handle

| Feature | Web | Native |
|---|---|---|
| Pick from screen | EyeDropper API (Chrome and Edge on desktop) | Not available. Use the camera or photo picker (`@capacitor/camera`). |
| Export, backups and print files | `<a download>` | `@capacitor/filesystem` and `@capacitor/share` (the files are made in the same way; only delivery changes in `export.js`) |
| `.swatches` to Procreate | Download, then open | The share sheet opens it directly in Procreate on iPad |
| Storage | `localStorage` and IndexedDB | Use `@capacitor/preferences` and the filesystem so the data survives OS cleanup; keep Back up and Restore working |
| Printing | PDF download | The share sheet or `window.print` equivalent; check the sheet sizes |
| Cover pictures | File input | The photo picker |

## Store requirements

- A privacy policy at a public URL (see `Legal/shared/PRIVACY-POLICY.md`; the fonts are already bundled, so only the
  storage wording changes)
- Apple: an App Store privacy "nutrition label" stating that no data is collected
- Google Play: a Data Safety form stating that no data is collected or shared
- The OFL texts in `Legal/licences/` and every Capacitor plugin listed in `Legal/shared/THIRD-PARTY-LICENCES.md`
