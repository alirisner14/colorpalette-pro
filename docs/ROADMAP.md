# Roadmap

## 1.0: Web (built)
- [x] Color, Photo, Theme, Mood and Build modes
- [x] Organic palettes (harmony as a hidden backbone, drift, neutrals, wildcards, contrast rules), optional "lean toward" a harmony, adjustable palette count
- [x] HEX and RGB on every color, with copy
- [x] Exports to 12 formats covering Procreate, Adobe, Affinity, GIMP/Krita, Sketch, Figma/Canva and the web
- [x] Swatch Book (flipbook) and Swatch Deck (fan), with tabs, drag and drop, a full-screen viewer, Customize and covers
- [x] Liquid-glass UI
- [x] Offline PWA with bundled fonts, and a Settings panel that shows and clears what is stored
- [x] **Back up and restore** the swatch book (flipbook page or data file)
- [x] **Import palette files** (`.ase`, `.aco`, `.gpl`, `.swatches` and more)
- [x] **Lock colors** so they survive a shuffle
- [x] **Contrast checker:** WCAG contrast for every color pair
- [x] **Palette in context:** preview a palette on example artwork
- [x] **Printable paint-chip sheets** (decks and books) as PDF, SVG, PNG and JPG, with cut files
- [x] **Mood from a word:** type "rainy café" and get a palette
- [x] **Share link / QR code:** palette data encoded in the link, so there's no server

## Studio (printables), in phases
- [x] Phase 1: Studio tab, paper and orientation, **DIY blank swatch pages** (blocks, shapes, single or double-sided, write-ins, numbering), Print or Print & cut
- [ ] Phase 2: **DIY blank swatch deck** (spaces per blade, single or double column, front and back counts, cover write-ins, color info placement on the back)
- [ ] Phase 3: **Match physical mediums to palettes**, pages and decks (side by side or front and back, palette picker with previews)
- [ ] Phase 4: **Saved palettes only**, pages and decks; then the Print & cut dialog moves into Studio
- [ ] Ideas from Ali's own swatch book (to discuss): a **testing page** (layering 1–5, blending in the same and complementary color families, fixative and erasure tests), **3- and 4-color blend / combo cards**, a **color mixing grid**, a **coloring log**, **blending samples**, and **color theory** pages (relationships, harmonies, anatomy of color, practice) plus a notes page

## Next: high value, low effort
- [ ] **Rename individual colors** (planned for the next round). Tap a color's name to type your own, the same way palette names already work. Your names show up in exports, prints, backups and shared links, and a shuffle keeps the names of locked colors. Also check that palette renaming is easy to find everywhere a palette appears (swatch book, deck, full-screen viewer), not just on the Create page.
- [ ] Drag to reorder colors inside a palette
- [ ] Search in the swatch book
- [ ] More example artwork pieces (an outfit, a logo, packaging)
- [ ] Test the cut files on more cutting machines (Cricut, Silhouette, Brother) and adjust

## Ideas that set it apart
- [ ] **Private sync code** (planned, after launch): turn on sync to get a code or QR; scan it on another device and they stay in step. Palettes are encrypted on the device with that code, so the server only stores data it cannot read. No accounts, emails or passwords. Needs a small server (Supabase or similar, set up once there are users, since free projects pause when idle) and updates to the Privacy Policy, Terms, Settings and "Delete all my data". Accounts (email and password) are the fallback if people ask for them.
- [ ] **Live environments** (to discuss): see a palette applied to realistic mockups, like Coolors does (websites, app screens, posters, branding, patterns, illustrations, interiors, typography), building on Palette in context.
- [ ] **Thumbs up / neutral / down on palettes** to learn what you like (idea, not decided). Each rating would note a
  palette's character (how light, how colorful, how many neutrals, warm or cool, how many wildcards, which backbone), and new
  batches would lean toward liked traits and show the closest matches first, while always keeping some surprises.
  Ratings would stay on the device, so the Privacy Policy, Settings and "Delete all my data" need updating first.
- [ ] **Gradients** generated from any palette, exported as CSS or image
- [ ] **Palette of the day** with a gentle streak
- [ ] **Colorblind preview:** see a palette as people with protanopia, deuteranopia or tritanopia do (not planned for now)
- [ ] A shareable "palette card" image with the QR code on it

## 2.x: Mobile
- [ ] iOS and Android apps with Capacitor (see [MOBILE.md](MOBILE.md))
- [ ] Pick colors live from the camera
- [ ] Native files and share sheet for exports
