# Changelog

All notable changes to Color Palette PRO are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [1.2.2] — 2026-10-13

### Changed
- **Bringing a backup from another device adds, it doesn't overwrite.** "Add the new palettes" is now the main choice: your swatch book stays exactly as it is, and only the palettes it doesn't have yet arrive in a tab named after the device they came from ("From iPad", "From PC", "From iPhone"…). The same tab is reused next time. "Replace my swatch book" is still there as a secondary choice for setting up a new device.
- Backups now record the kind of device that made them (only "iPad", "PC" and so on). Privacy Policy updated.

## [1.2.1] — 2026-10-13

### Changed
- **Backups on iPhone and iPad open the share sheet**, so you can choose **Save to Files → iCloud Drive** (or AirDrop) instead of hunting in Downloads. Computers still download the file.
- **The backup reminder** now appears after real changes (8 or more saved changes and a week, or any change and a month), and says how many changes are waiting. The backup window shows the count too.
- **Using more than one device?** The backup window explains how to bring your swatch book to another device (back up to a cloud drive, then Restore and **Add to my swatch book** there).
- Privacy Policy: the stored settings now mention the change count used by the reminder.

## [1.2.0] — 2026-10-13

### Changed
- **Palettes modelled on loved, hand-made palettes** (see docs/PALETTE-RESEARCH.md): a value structure first, 1–3 hue families, lights warmer and darks cooler, color richest in the light mid-tones, mostly soft with an occasional accent, neutrals from none to half, usually ordered light to dark.
- Replaces 1.1.0's forced extremes and a wildcard in every palette, which measured as the opposite of what people love.
- **Your color** stays exact in the first two palettes and a palette's first two shuffles; elsewhere it may drift slightly to sit better.
- **Monochrome** palettes can be one hue in many tones (one per batch unless you lean toward Monochrome).
- **Themes** now use the same generator, so shuffling a theme gives really different palettes. Pastel themes include one dark (charcoal, brown or a jewel tone) for text.
- **Usable in the real world:** every palette has a 3:1 pair for headings and shapes, an accent, and colors you can tell apart.
- **No near-twin colors:** steps no longer bunch up, neighbours alternate richer and quieter, and every pair must look clearly different, with a wider gap for darks (which look alike on screens). Near-twins in 8-color palettes went from 20% to 0%.
- **Fewer monochrome look-alikes:** single-family palettes are rare outside the monochrome slot (about 1–2 one-hue palettes per 14).
- **Pastel moments in themes:** about 1 in 4 theme palettes comes out soft (girly Halloween, pink-chic Christmas), always with a dark for text.
- **Shuffle all, a new theme or a new mood starts you at the first palette** instead of leaving you halfway down the list.

## [1.1.0] — 2026-10-08

### Changed
- **New palette generator: curated, organic palettes instead of tints and shades.**
  - A harmony is now only the backbone: it places the first 3–4 colors, each drifted 10–25° off the exact spot on the wheel,
    so palettes feel hand-picked.
  - No hue appears in more than two versions; every other color is a new hue.
  - Every palette must reach from very dark to very light, and mix bright colors with muted ones and neutrals (creams,
    taupes, grays, charcoals). The generator checks this and fixes any palette that falls short.
  - Every palette gets one or two **wildcard** pops from the emptiest part of the color wheel.
  - Neutrals are scattered through the palette instead of always sitting at the end.
- **Harmony labels are gone from everyday palettes.** The harmony chips are replaced by an optional **Lean toward**
  dropdown. "Anything goes" (the default) gives surprise palettes with no labels; choosing a harmony makes two in every three
  palettes use it (and say so), and the rest stay a surprise.
- Palettes saved by earlier versions keep their labels.

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
