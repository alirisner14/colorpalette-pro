<p align="center">
  <img src="assets/icons/icon-192.png" alt="Color Palette PRO logo" width="120">
</p>

<h1 align="center">Color Palette PRO</h1>

<p align="center">
  Pick a color, a photo or a theme, and get beautiful, named color palettes.<br>
  Save them in a flip-through swatch book. Export to Procreate, Photoshop, Illustrator, Affinity, Canva, GIMP and more.<br>
  By <strong>On the Rise Digital</strong>
</p>

> **Proprietary software.** This repository is private and the code is not open source.
> See [LICENSE](LICENSE). © 2026 Alison Risner, trading as On the Rise Digital.

---

## Features

### Four ways to start
| Mode | What it does |
|---|---|
| **Color** | Pick a color with the wheel or brightness slider, type a hex code, pick from the screen (EyeDropper API), or pick from an image |
| **Photo** | Drop, choose or paste a photo. The first palette uses **only colors taken from the photo's own pixels**; the rest are harmony palettes built around its main colors |
| **Theme** | 24 themes (Spring, Halloween, Ocean, Cottagecore, Neon Nights, …) chosen from a dropdown or emoji tiles. No starting color needed |
| **Build** | Make your own palette: add the color on the wheel, or paste a list of HEX/RGB codes (1–30 colors) |

### Palettes
- **Harmonies:** Complementary, Analogous, Triadic, Tetradic, Split Complementary, Monochrome and Random.
  By default you get **2 of each**. You can filter to the harmonies you want and set how many palettes to show (1–40).
- **Size:** 6–15 colors per palette.
- **Names:** every color gets a cute, unique name and every palette a fitting name. Names can be edited.
- **Codes:** every color shows its **HEX and RGB**; tap either to copy. A palette's copy menu copies all its HEX codes, all its RGB codes, or names with both.
- **Editing:** swap any color (suggestions or a custom color), remove colors, add colors, or shuffle a single palette.
- **Styles:** paint chips (default), hearts, stars, abstract, messy swatches, circles, flowers, clouds, paint drops or hexagons.

### Swatch Book
- A **flipbook** with 3D page turns. Swipe on touch screens, drag with a mouse, or use the arrow buttons and ← → keys.
- **Index tabs** to organize palettes by color, season, project or anything else, plus one-tap **Sort by color**. Tap a tab to jump to its section.
- **Move palettes:** press and hold (on touch) or drag (with a mouse) to reorder them on a page. Drop one on a tab to move it to that section, or hold it at the page edge to turn the page. A **⋯ menu** does the same without dragging.
- **Full-screen viewer:** tap a palette and it grows to fill the screen. It has big color stripes with copyable codes, swiping between palettes, and **quick export** buttons.

### Export
| App | Format |
|---|---|
| Procreate | `.swatches` |
| Photoshop, Illustrator, InDesign, Affinity, CorelDRAW | Adobe Swatch Exchange `.ase` |
| Photoshop (classic swatches) | `.aco` |
| GIMP, Krita, Inkscape, Aseprite, Scribus | `.gpl` |
| Sketch | `.sketchpalette` |
| Figma, Canva and vector apps | `.svg` swatch sheet |
| Canva Brand Kit, Coolors, Cricut | hex list `.txt` (also copied to the clipboard) |
| Paint.NET | `.txt` palette |
| Sharing and printing | `.jpg`, or a transparent `.png`, in the swatch style you're viewing |
| Web | CSS custom properties `.css`, `.json` |

On phones and tablets, exports go through the native share sheet.

### Design
- A "liquid glass" interface: frosted panels with a sheen that follows the pointer, and an ambient background that takes its colors from your palettes.
- Accent colors follow your chosen color.
- Springy motion and haptics, a sparkle burst when you save, and paint chips that deal onto the page.
- Light and dark mode, `prefers-reduced-motion` support, keyboard support, and a bottom dock on phones.

### Platform
- An installable PWA that works offline. No accounts, no tracking, no server.
- In-app legal pages at `legal.html?doc=…`. These give you the public URL the privacy policy needs.

## Quick start

Requires [Node.js](https://nodejs.org) 20+ (for the dev server and tests only). The app has no runtime dependencies and no build step.

```bash
npm start
```

Open <http://localhost:5173>.

```bash
npm test
```

## Project structure

```
├── index.html              App shell
├── legal.html              Renders the documents in /Legal
├── manifest.webmanifest    PWA manifest
├── sw.js                   Service worker (network-first, offline fallback)
├── assets/                 Logo and app icons
├── src/
│   ├── css/styles.css      Liquid-glass theme (light + dark)
│   └── js/
│       ├── app.js          Studio: modes, generation, editing, wiring
│       ├── bookview.js     Swatch Book: flipbook, swipe, tabs, drag & drop
│       ├── viewer.js       Full-screen palette viewer
│       ├── exportsheet.js  Export picker UI
│       ├── render.js       Palette / swatch HTML
│       ├── ui.js           Toasts, menus, dialogs, haptics, glass sheen
│       ├── store.js        Shared state + persistence events
│       ├── book.js         Swatch Book data model (pure, tested)
│       ├── formats.js      ASE/ACO/GPL/Procreate/Sketch/SVG/CSS/JSON encoders (pure, tested)
│       ├── export.js       Image rendering + delivery (download / share sheet)
│       ├── photo.js        k-means photo color extraction (pure, tested)
│       ├── themes.js       Theme definitions + themed generation (pure, tested)
│       ├── harmonies.js    Harmony generation, plans, swap suggestions
│       ├── names.js        Color and palette naming
│       ├── color.js        Color math, code parsing, seeded RNG
│       ├── shapes.js       Swatch shapes (SVG paths, shared with export)
│       ├── picker.js       Color wheel
│       ├── zip.js          Minimal ZIP writer (.swatches)
│       ├── storage.js      Guarded localStorage
│       └── legal.js        Markdown renderer for legal pages
├── tests/                  Node test runner unit tests
├── scripts/serve.mjs       Zero-dependency dev server
├── docs/                   Roadmap and mobile plan
└── Legal/                  EULA, privacy, terms, storefront and app-store documents
```

## Data and privacy

Everything runs on the device. The swatch book, settings and the palette in progress are stored in `localStorage`
(`cpp.book.v1`, `cpp.prefs.v1`). Photos are processed in memory and never uploaded. There's no analytics and no tracking.
The only network requests are for Google Fonts. See [Legal/shared/PRIVACY-POLICY.md](Legal/shared/PRIVACY-POLICY.md).

## Browser support

The app supports current Chrome, Edge, Safari and Firefox.

- **Pick from screen** needs the [EyeDropper API](https://developer.mozilla.org/docs/Web/API/EyeDropper_API), which only
  Chrome and Edge on desktop support. Other browsers fall back to picking from an image.
- **Share-sheet exports** need the Web Share API with files, which is available on most phones and tablets.

## Third-party assets

| Asset | License |
|---|---|
| [Grandstander](https://fonts.google.com/specimen/Grandstander) | SIL Open Font License 1.1 |
| [Nunito](https://fonts.google.com/specimen/Nunito) | SIL Open Font License 1.1 |

App names in the export list are trademarks of their owners. They are used only to describe compatibility.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/MOBILE.md](docs/MOBILE.md).

## Support

Email **ontherisedigital@gmail.com**.
