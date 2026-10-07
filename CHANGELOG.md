# Changelog

All notable changes to Color Palette PRO are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [1.0.5] — 2026-10-07

### Changed
- **Palettes are built in OKLCH**, a color space that matches how eyes see color, instead of HSL. Lightness steps look even for every hue, and partner hues keep the perceived lightness and intensity of your color, so harmonies are balanced instead of muddy or lopsided. Colors a screen can't show keep their hue and lightness and just lose a little intensity.
- **Random palettes** spread their hues a golden-ratio step apart from a random starting point, so they never clump (no three blues and two reds) and each one lands on different hues.
- **Surprise me** steps a golden-ratio distance around the wheel from your current color, so two presses in a row never give similar colors.
- Small bell-curve variations in lightness and intensity keep tones and partner colors from feeling mechanical.

## [1.0.4] — 2026-10-07

### Changed
- **Palettes really differ now.** Besides the eight looks, every palette is built one of five ways: tones of each hue, a smooth gradient around the wheel, a mosaic of hues at different lightness, soft neutrals with bright accents, or pale tints over rich deep colors. A batch deals these out so neighbours and two palettes of the same harmony never share one, and the "too alike" check now judges palettes the way a person sees them.
- **Shuffle all** gives a new set every time: it deals the recipes and looks out afresh and avoids anything that looks like the set it replaces.
- **Palette names** in a set no longer repeat a first or last word (no more "Clover Lullaby" next to "Clover Tea Party"); there are many more words to choose from, including the palette's second and third colors.
- **Messy Swatches** is now two choices: **Lg** (the squarer scribble) and **Sm** (the wider one).
- New **Mandala** (layered petals, beaded ring, scalloped edge) and **Modern arches** (boho rainbow print) artwork.

### Fixed
- Dialogs, including **Palette in context**, now open where you are on the page instead of at the top. On phones the wide dialogs fill the screen width.

## [1.0.3] — 2026-10-06

### Changed
- **Abstract** is back to its original lumpy shapes (a little different for every chip). **Messy Swatches** uses both of the supplied scribbles, taking turns (wide, tall, then both flipped).

## [1.0.2] — 2026-10-06

### Fixed
- The dashboard showed 7 palettes and 7 near-copies of them, and **Shuffle** barely changed a palette. Every harmony now comes in several looks (classic, soft, deep, muted, vivid, airy, dusk and contrast), so the two palettes of a harmony are clearly different, and no palette in a batch (or a theme set) is a near-copy of another.
- **Shuffle** now always gives a really different take on the palette (new tones, spread, saturation and hue drift) while keeping your color and any locked colors. **Shuffle all** turns every harmony to a new look.

### Added
- A **Show artwork** button on every palette card and in the full-screen viewer, which opens "Palette in context" (artwork and mockups painted with the palette).

### Changed
- Hearts, stars, clouds and the two scribble shapes (Abstract and Messy Swatches) now use the supplied artwork. The cloud no longer looks like a flower, and the scribbles take turns facing each way.

## [1.0.1] — 2026-10-05

### Fixed
- `npm run build` left the service worker (`sw.js`) out of `dist/`, so a deployed copy could never work offline. It is now included, and a test checks that everything the pages, styles and manifest point at is deployed.

### Added
- `vercel.json`, so the site deploys on Vercel as it is (build command, output folder `dist`, and a few safe headers).
- `npm run preview`, which serves `dist/` so you can try exactly what will be deployed.

## [1.0.0] — 2026-10-05

### Added
- **Studio modes:** Color (wheel, hex, pick from screen, pick from image), Photo (palettes pulled from a photo), Theme (24 themed random palettes), **Mood** (type "rainy café") and Build (handmade palettes, with HEX/RGB paste and file import).
- Harmonies: Complementary, Analogous, Triadic, Tetradic, Split Complementary, Monochrome and Random. Two of each by default, with a harmony filter and a palette-count setting from 1 to 40.
- A palette made only from a photo's own colors, plus harmony palettes built around the photo.
- 6–15 colors per palette (up to 30 for handmade palettes).
- HEX and RGB codes on every color, tap to copy, and a "copy all" menu.
- **Lock colors:** lock the colors you like and shuffle the rest.
- **Contrast checker** with WCAG ratios for every pair and the best text colors.
- Paint-chip cards, plus Hearts, Stars, Abstract, Messy Swatches, Circles, Flowers, Clouds, Paint Drops and Hexagons.
- Swap, remove and add colors; rename and shuffle palettes.
- A unique name for every color and a fitting name for every palette.
- **Swatch Book (flipbook) and Swatch Deck (fan of blades):** choose either, with a **Customize** panel and live preview (shapes, what to show, palettes per page or blade, portrait or landscape, example artwork pages) and a customizable **cover** (color or picture, editable title and subtitle; optional on the deck).
- Index tabs with names and colors, sort by color, drag and drop (or a ⋯ menu) to reorder or move between tabs, a full-screen viewer with quick export, and undo on delete.
- **Palette in context:** see a palette on eight pieces of example artwork, repaint shapes, try a dark version or a coloring page, and save as PNG, PDF or SVG.
- **Print and cut:** swatch decks and books for matching or swatching supplies, or just your palettes, as PDF, SVG, PNG or JPG, with punch holes, shapes, per-page counts, medium notes, two-sided blanks, example artwork pages, cut-lines-only SVG and a transparent PNG for Print Then Cut.
- **Share** a palette as a link, a short code or a QR code.
- **Import** palette files (`.ase`, `.aco`, `.gpl`, Procreate `.swatches`, Sketch, hex lists, CSS and more), including by dropping them on the Swatch Book.
- **Back up and restore** the swatch book as a flipbook page (`.html`) or a data file (`.json`), with a gentle reminder.
- Exports: Procreate `.swatches`, Adobe `.ase`, Photoshop `.aco`, GIMP `.gpl`, Sketch `.sketchpalette`, `.svg` for Figma and Canva, hex list, Paint.NET, `.jpg`, transparent `.png`, CSS and JSON. On mobile, exports open the share sheet.
- A liquid-glass UI with an ambient background, a pointer sheen, an adaptive accent color, haptics and a sparkle burst. Light and dark mode, and reduced-motion support.
- A fully **offline PWA**: bundled fonts, a service worker that keeps the app's files on the device, an update prompt, an install button, and a **Settings** panel that shows what is stored and can delete the offline copy or all data.
- The app **cleans up after itself**: pictures are read in memory and released, temporary download links are revoked seconds after use, and dialogs are removed when closed.
- `npm run shell` (offline file list), `npm run build` (public files only, in `dist/`).
- Legal documents rebuilt for Color Palette PRO and for the offline app, with the font licences in `Legal/licences/`.
