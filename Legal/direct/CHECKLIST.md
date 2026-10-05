# Launching Color Palette PRO on your storefront

The route that doesn't depend on anyone approving you. Roughly in order.

## Decide the entity first

Every document names it, so changing it later means editing all of them.

- [ ] Decide: your own name, a DBA or an LLC. See `../README.md` §2.
- [ ] If DBA: register with the county or state ($10–100).
- [ ] Open a separate bank account for the business, whatever you chose.
- [ ] If you form an entity, update "Alison Risner, trading as On the Rise
      Digital" in every document.

## Decide how buyers get the app

This is a web app, so "delivery" means one of these:

| | How | Pros | Cons |
|---|---|---|---|
| **A. Hosted, private link** | You host it (Netlify, Vercel, Cloudflare Pages, GitHub Pages); the order email links to it | Updates reach everyone instantly; works on every device; installable | Anyone with the link can use it, so you need a hard-to-guess URL and the right to deactivate it |
| **B. Downloadable files** | Sell a `.zip` of the app; buyer opens it on any static host or locally | No hosting costs | Buyers must re-download updates, and `file://` can't run modules, so they need a host |
| **C. Hosted + licence key** | A hosted app asks for a key once | Strongest protection | Needs a small server or a licence-key service, so the privacy policy must change |

**A is the usual starting point.** Whatever you choose, update section 5 of
`TERMS-OF-SALE.md` and §5 of `PRIVACY-POLICY.md` to match.

**Building what you host or sell.** Run `npm run build`. It writes `dist/`,
which holds exactly the public files (the app, the fonts, the public legal
documents) and none of the internal notes in this folder. Upload `dist/` to
your host, or zip it for option B. The app stores itself on the buyer's device
the first time it loads online, then works with no connection.

## Pick a payment provider

| | Merchant of record | Fee | Notes |
|---|---|---|---|
| **Payhip** | for EU VAT | 5%, or flat-fee plans | digital-goods focused, licence keys, EU VAT handled |
| **Fourthwall** | **verify** | varies | creator storefront; confirm MoR status for digital goods |
| **Paddle** | yes | ~5% + 50¢ | more established, heavier setup |
| **Gumroad** | yes | ~10% | simplest to start, highest fee |
| **Stripe alone** | **no** | ~2.9% + 30¢ | cheapest, but *you* register for and remit sales tax everywhere |

**A merchant of record is worth the fee.** It means the provider is legally the
seller and handles VAT, GST and US state sales tax for you.

- [ ] Choose a provider and confirm it is the merchant of record.
- [ ] Enable the **"digital goods / waive right of withdrawal"** checkout tick.
      It's what makes the refund policy hold up in the EU and UK.
- [ ] Test a real purchase end to end with a real card, then refund yourself.

## Publish the documents

The app already serves these at `legal.html?doc=…`. Link them from the store.

- [ ] `shared/PRIVACY-POLICY.md` at a public URL (`legal.html?doc=privacy`)
- [ ] `shared/EULA.md` (`legal.html?doc=eula`)
- [ ] `shared/TERMS-OF-USE.md` (`legal.html?doc=terms`)
- [ ] `shared/THIRD-PARTY-LICENCES.md` (`legal.html?doc=licences`)
- [ ] `direct/TERMS-OF-SALE.md`, linked from checkout
- [ ] `direct/REFUND-POLICY.md`, linked from checkout **and** the product page
- [ ] `direct/SUPPORT-POLICY.md`
- [ ] `direct/INSTALL.md`, in the confirmation email
- [ ] `direct/WEBSITE-TERMS.md` and `direct/COOKIE-NOTICE.md`, only once you
      run a site of your own

```bash
grep -rn "\[[A-Z ]*\]" Legal/
```

Nothing ships until that search comes back clean, apart from the two
analytics placeholders in Cookie Notice Version B.

## Before launch: privacy and offline

- [x] The fonts are bundled and the OFL texts ship in `licences/`, so the
      privacy policy says nothing is loaded from Google Fonts or anywhere
      else. Check that stays true: open the app, then look in the browser's
      Network tab; every request should be to your own host.
- [ ] Load the hosted app once, switch the device to airplane mode, and
      reload. It should open normally, and Settings should say "Works
      offline".
- [ ] Settings › Stored on this device: confirm it lists only what the
      privacy policy §2 lists.

## The product page

- [ ] One sentence above the fold saying what it does
- [ ] Screenshots or a short screen recording of the real app: the paint
      chips, the swatch book, the export sheet
- [ ] Supported browsers, stated plainly
- [ ] The apps it exports to, with the "not affiliated" line
- [ ] **What it doesn't do**: colors stay on one device (say that the
      backup exists), and screen colors aren't print-matched. Being honest
      here prevents refunds later.
- [ ] Price, with tax handling made clear
- [ ] Links to the refund policy, EULA and privacy policy
- [ ] An email address that works

## Before you take the first payment

- [ ] Buy your own product with a real card, from a different browser.
- [ ] Confirm the delivery email arrives and isn't in spam.
- [ ] Open it on an iPhone, an iPad, an Android phone and a Windows/Mac
      browser. Add it to the home screen on each.
- [ ] Import an export into Procreate, Photoshop and Canva yourself.
- [ ] Back up your swatch book (flipbook page and data file), clear the
      site's data, and restore. Open the flipbook page with the internet off.
- [ ] Print a swatch sheet at 100% size. If you promote cutting, cut a test
      deck and book on the machine you name (the SVG "cut lines only" file,
      or the transparent PNG for Print Then Cut).
- [ ] Refund yourself and confirm the process works.

## After launch

- [ ] Keep a record of every sale for tax purposes, even with an MoR.
- [ ] Note which questions arrive twice. That's your FAQ writing itself.
- [ ] Review these documents at every major version.
