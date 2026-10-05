# Apple App Store and Google Play submission

**Color Palette PRO** — On the Rise Digital (Alison Risner)

This is for later, when the iOS and Android apps are built (see
`../../docs/MOBILE.md`). It covers what the stores need and, more usefully,
what they take off your hands.

> Store rules change often. Before submitting, check each point here against
> the current App Review Guidelines and Google Play Developer Policy.

---

## What the stores do for you

| You need this when selling direct | On the App Store / Google Play |
|---|---|
| Terms of Sale | Apple or Google is the seller; their terms govern the sale |
| Refund Policy | Apple's or Google's policy applies and overrides yours |
| Hosting and delivery | The store hosts and installs it |
| Access links / licence keys | Store purchase entitlements handle it |
| Update mechanism | The store updates the app automatically |
| Sales tax / VAT | The store is the merchant of record worldwide |
| Chargebacks | Handled by the store |

## What you still need

### Required by both stores

1. **A privacy policy at a public URL.** Use `shared/PRIVACY-POLICY.md`
   (served at `legal.html?doc=privacy`). Before you submit, edit it for the
   native app: the fonts are already bundled (nothing is loaded from Google
   Fonts), so only the storage wording changes: "app storage" rather than
   "browser storage", and the web-host paragraph in section 5 goes.
2. **Privacy disclosures.**
   - Apple **App Privacy** ("nutrition label"): **Data Not Collected**. This
     is accurate as long as the app keeps sending nothing anywhere.
   - Google Play **Data safety** form: no data collected, no data shared.
3. **An age rating.** Apple's questionnaire and Google's IARC questionnaire.
   A palette tool with no user-generated sharing should come back rated for
   everyone.
4. **A support contact** that works and is monitored.
5. **A store listing**; see below.

### Optional but worth having

6. **Your own EULA.** Apple applies its Standard EULA if you supply none.
   That standard EULA does not contain your no-AI-training clause or your
   no-extraction clause. Supply `shared/EULA.md` with the store edits below.
7. **Terms of Use.** Use `shared/TERMS-OF-USE.md` as the acceptable-use terms.
8. **Third-party licence notices.** Ship `shared/THIRD-PARTY-LICENCES.md`
   inside the app, reachable from the menu. Bundled fonts make the OFL notice
   a licence condition.

### EULA edits for the stores

- **Section 10 (Refunds).** Replace it with a line saying purchases through
  the App Store or Google Play are governed by that store's refund policy.
- **Section 2.2 (devices).** Store purchases follow the customer's Apple or
  Google account. Keep the clause, but don't contradict how the store
  behaves.
- **Access links, keys and chargebacks.** Remove any mention; none of them
  exist on this route.
- **Apple only.** Apple requires a custom EULA to meet its minimum terms. Its
  standard EULA lists them; check that ours covers each one.

## Rules that matter for this app

- **Apple 4.2, Minimum Functionality.** Apps that are "just a website in a
  wrapper" get rejected. Color Palette PRO has a strong case: it works
  offline, keeps a local swatch book, and exports through the native share
  sheet. Make sure the native build uses native file saving and sharing, and
  add one native-only extra, such as picking colors from the camera.
- **Paid app vs. unlocking with a storefront key.** Sell it as a paid app (or
  with the store's own in-app purchase). **Don't** let a key bought on your
  Fourthwall or Payhip store unlock the iOS app. Apple's rules on outside
  purchases are strict and change by region.
- **Trademarks in the listing.** You may say "exports to Procreate,
  Photoshop…" to describe compatibility. Don't use those names in the app
  title or in keywords meant to piggyback on them, and don't use their logos.

## The listing

| Field | Notes |
|---|---|
| App name | "Color Palette PRO". Reserve it early in App Store Connect and Play Console. |
| Subtitle / short description | One honest line, for example "Palettes from a color, a photo or a theme" |
| Description | What it does, the export formats, that palettes stay on the device, and the "not affiliated" line |
| Screenshots | iPhone, iPad, Android phone and tablet sizes; show the paint chips, the swatch book and the export sheet |
| Icon | 1024×1024 with no transparency (Apple); 512×512 (Google). Use `CPP_Icon.png`. |
| Category | Graphics & Design (Apple); Art & Design (Google) |
| Privacy policy URL | Required |
| Support URL / email | Required |

## Accounts

- **Apple Developer Program:** $99/year. If you enroll as an organization,
  you need a D-U-N-S number and a registered business. If you enroll as an
  individual, your personal name is shown as the seller.
- **Google Play Console:** one-time $25. New personal accounts must run a
  closed test with a minimum number of testers for a minimum period before
  publishing to production; check the current numbers in Play Console.
- Both stores charge a reduced 15% commission for small developers. Enroll in
  Apple's Small Business Program; Google applies the reduced rate to your
  first $1M of revenue.

**Settle the entity question (`../README.md` §2) before enrolling.**
Switching an Apple individual account to an organization later is a support
process, not a setting.
