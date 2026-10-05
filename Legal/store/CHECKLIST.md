# Submitting to the App Store and Google Play

Shorter than the direct-sale list, because the stores handle most of it.
See `SUBMISSION.md` for the detail behind each line.

## Before you enroll

- [ ] **Settle the entity question.** See `../README.md` §2.
- [ ] Decide on pricing: a paid app, or free with one in-app purchase.
- [ ] Build the native apps (`../../docs/MOBILE.md`) with the fonts bundled.

## Accounts

- [ ] Apple Developer Program ($99/yr). Get a D-U-N-S number first if you
      enroll as an organization.
- [ ] Google Play Console ($25, one time)
- [ ] Reserve "Color Palette PRO" on both stores.
- [ ] Apple Small Business Program (15% commission)

## Documents

- [ ] `shared/PRIVACY-POLICY.md`, **edited for the native app** (the fonts are
      already bundled, so change "your browser's storage" to "app storage"
      and drop the web-host paragraph in §5) and published at a public URL
- [ ] `shared/EULA.md`, edited for the stores:
  - [ ] refund section replaced with "the store's policy applies"
  - [ ] access links, keys and chargebacks removed
  - [ ] checked against Apple's minimum EULA terms
- [ ] `shared/TERMS-OF-USE.md` included
- [ ] `shared/THIRD-PARTY-LICENCES.md` inside the app, with the OFL texts from
      `licences/` and every Capacitor plugin listed
- [ ] A support email that is monitored

**Not needed on this route:** Terms of Sale, Refund Policy, Website Terms,
Cookie Notice.

## Privacy disclosures

- [ ] Apple App Privacy: **Data Not Collected**
- [ ] Google Play Data safety: no data collected or shared
- [ ] Both age-rating questionnaires completed

## Listing

- [ ] An accurate subtitle and short description
- [ ] A description that names the export apps for compatibility only, with
      the "not affiliated" line
- [ ] Screenshots for each required device size
- [ ] Icons: 1024×1024 (Apple), 512×512 (Google)
- [ ] Category: Graphics & Design / Art & Design
- [ ] Limitations stated plainly: palettes stay on the device, and screen
      colors aren't print-matched

## Test before submitting

- [ ] Fresh install, airplane mode: the app opens, generates palettes and
      saves to the swatch book.
- [ ] Every export opens the share sheet and imports into its target app.
- [ ] Photo mode works with the camera and the photo library, and the
      permission prompts explain why access is needed.
- [ ] Google: closed testing period completed.

## Submit

- [ ] Submit to both stores. Review usually takes from a day to a week.
- [ ] If Apple rejects under 4.2, the fix is more native functionality, not
      an argument with the reviewer.
- [ ] Keep version numbers in step across the web, iOS and Android builds.
