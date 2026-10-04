# iOS and Android plan

Color Palette PRO is a dependency-free static web app, so it can be wrapped as a native app with
[Capacitor](https://capacitorjs.com) without a rewrite.

## Steps

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Color Palette PRO" com.ontherisedigital.colorpalettepro --web-dir www
```

1. Add a `build` script that copies `index.html`, `manifest.webmanifest`, `sw.js`, `assets/` and `src/` into `www/`.
2. Self-host the Grandstander and Nunito fonts (both are SIL OFL) so the app works fully offline.
3. Run `npx cap add ios` and `npx cap add android`, then `npx cap sync`.

## Platform differences to handle

| Feature | Web | Native |
|---|---|---|
| Pick from screen | EyeDropper API (Chrome and Edge on desktop) | Not available. Use the camera or photo picker (`@capacitor/camera`). |
| Export | `<a download>` | `@capacitor/filesystem` and `@capacitor/share` |
| `.swatches` to Procreate | Download, then open | The share sheet opens it directly in Procreate on iPad |
| Storage | `localStorage` | Use `@capacitor/preferences` so the data survives OS cleanup |

## Store requirements

- A privacy policy at a public URL (see `Legal/shared/PRIVACY-POLICY.md`)
- Apple: an App Store privacy "nutrition label" stating that no data is collected
- Google Play: a Data Safety form stating that no data is collected or shared
