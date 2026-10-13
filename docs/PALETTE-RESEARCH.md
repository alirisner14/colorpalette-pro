# What makes a palette feel hand-made

In October 2026 we measured how loved, real-world palettes behave and tuned the generator to match.
Only statistics were kept; no palettes from either site are stored in or shipped with the app.

## What we measured

| Sample | Palettes | Colors each |
|---|---|---|
| Color Hunt, most-liked of all time | 1,000 | 4 |
| Color Hunt, newest | 200 | 4 |
| Coolors, popular and trending | 68 | 5–10 |
| Coolors, its own spacebar generator | 145 | 5 |
| Ours, version 1.1.0 | 500 | 6 |

Every color was measured in OKLCH (perceived lightness, colorfulness and hue). Color Hunt is
human-curated (people submit and like palettes). Only 2 of the 145 Coolors generator palettes were in
the curated lists, so its generator makes palettes rather than serving saved ones, and it behaves much
like the curated sets.

## What loved palettes have in common

1. **Restraint in hue.** Most use 1–3 hue families inside a fairly narrow slice of the wheel (median
   span 40–98°). Color Hunt's favorites are a single family 43% of the time. Version 1.1.0 averaged 4
   families across 218°.
2. **A value structure.** They read as a strip of lightness steps (mean step about 0.14), usually ending
   in a light tint or cream (76% reach very light). Only 9–19% have both a very dark and a very light
   color. 35–66% are literally ordered light to dark.
3. **Painterly temperature.** Lighter colors lean warm (toward yellow) and darker ones cool (toward
   blue). In 84% of palettes the lightest color is closer to yellow than the darkest. Darks are mostly
   navy and indigo, lights mostly cream and butter.
4. **Color follows lightness.** Colors are richest in the light mid-tones (OKLCH lightness 0.55–0.75)
   and quieter in the darks and the near-whites.
5. **Mostly soft.** Typical chroma is about 0.07–0.09. Neon (chroma above 0.2) appears in only
   9–25% of palettes, and 39–64% have nothing louder than 0.13.
6. **Neutrals are common but not fixed.** A median of 20–25% of colors are neutrals, mostly warm
   creams, and the share varies from none to half.

Version 1.1.0 did the opposite on almost every count: extreme contrast in every palette, neon in 83%,
four or more hue families spread around the wheel, and no light-to-dark order. That is why it felt
busy and soulless, even though it was "varied".

## How the generator works now

- **Value first:** a run of lightness steps, usually topped by a tint or cream; some palettes are
  moody, and some run all the way down to an ink.
- **1–3 hue families:** your color's family plus partners from the backbone harmony. Partners take the
  light mid-tones, where color is richest, and warmer partners take the lighter steps.
- **Temperature shift:** every color's hue turns toward yellow as it lightens and toward blue as it
  darkens.
- **Chroma curve:** colorfulness follows lightness, scaled by the palette's mood. Sometimes one accent
  is allowed to sing.
- **Neutrals:** from none to half the palette, a cream at the top and a charcoal or ink at the bottom
  first.
- **Order:** most often a light-to-dark strip (either way), otherwise grouped by family.
- **Monochromes:** true one-hue palettes appear, but at most one per batch unless you lean toward
  Monochrome.
- **Your color:** stays exact in the first two palettes of a batch and a palette's first two shuffles;
  elsewhere it may drift slightly (OKLCH distance up to 0.075) to sit better.
- **Themes:** recipes for the same generator (which hues, how light, how colorful, how many neutrals), so
  shuffles really differ. Pastel themes get one dark (charcoal, brown or a jewel tone) for text.

## Usable in the real world

Palettes are a guide, so these are gentle floors rather than rules that flatten everything:

- a pair with at least 3:1 contrast (headings, shapes and icons). Most palettes reach 4.5:1 on
  their own (100% in our tests before the floor was relaxed, against 46–69% of the loved samples)
- at least one color with some real color (an accent for logos and calls to action)
- no two colors so close they are hard to tell apart (OKLab distance of at least 0.035), for
  coloring pages and charts

The tests in `tests/variety.test.mjs` hold the generator to all of the above.
