# Legal and release documents

These are the legal and release documents for **Color Palette PRO**, by
**On the Rise Digital** (Alison Risner). They were adapted from the On the
Rise Digital template set and rewritten for a browser-based palette app that
is sold on your storefront now and in the app stores later.

**They are not legal advice and I am not a lawyer.** They cover what these
documents usually cover, and they should cut a lawyer's review to about an
hour. That review is the one line on either checklist worth paying for.

---

## Which set do I need?

```
Legal/
├── shared/     every route needs these
├── direct/     your storefront (Fourthwall, Payhip) or your own site
└── store/      Apple App Store and Google Play (future mobile apps)
```

| | Direct (now) | App stores (later) |
|---|---|---|
| EULA | ✅ | ✅ (edit the refund section) |
| Terms of Use | ✅ | ✅ |
| Privacy Policy | ✅ | ✅ **required at a public URL** |
| Third-party licences | ✅ | ✅ (with the bundled fonts' OFL text) |
| **Terms of Sale** | ✅ | ❌ the store is the seller |
| **Refund Policy** | ✅ | ❌ the store's policy applies |
| **Website Terms** | when you have your own site | ❌ |
| **Cookie Notice** | when you have your own site | ❌ |
| **Support Policy** | ✅ | recommended |
| **Getting started** (`INSTALL.md`) | ✅ | ❌ |
| Sales tax handling | your provider's | the store's |

## Start here

- Selling on your storefront → **`direct/CHECKLIST.md`**
- Publishing the mobile apps → **`store/CHECKLIST.md`**

## Read them in the app

The app serves every document as a styled page, so you can link to them from
your storefront:

| Document | Path |
|---|---|
| Privacy Policy | `legal.html?doc=privacy` |
| EULA | `legal.html?doc=eula` |
| Terms of Use | `legal.html?doc=terms` |
| Third-party licences | `legal.html?doc=licences` |
| Terms of Sale | `legal.html?doc=sale` |
| Refund Policy | `legal.html?doc=refunds` |
| Support Policy | `legal.html?doc=support` |
| Getting started | `legal.html?doc=start` |

## Already filled in

| | |
|---|---|
| Product | Color Palette PRO |
| Contracting party | Alison Risner, trading as On the Rise Digital |
| Email | ontherisedigital@gmail.com |
| State | Ohio |
| Currency | USD |
| Storefronts | Fourthwall first, Payhip likely second |
| Dates | 04 October 2026 |

**If the product name changes**, find and replace "Color Palette PRO" across
this folder. Nothing else in the documents depends on the name.

**Only two placeholders are left:** `[ANALYTICS PROVIDER]` and `[PERIOD]`, in
Version B of `direct/COOKIE-NOTICE.md`. Use Version A and delete Version B,
and they go with it.

---

## What's true about this app (and the documents rely on it)

The privacy policy makes strong promises. They're accurate today, and they
need to stay accurate:

- **No data leaves the device.** There's no analytics, no account and no
  server. Photos, cover pictures and imported files are processed in the
  browser. Share links and QR codes carry the palette itself, not a pointer.
- **There are no third-party requests at all.** The fonts are bundled
  (`licences/` holds their OFL texts), the app has no code libraries, and
  once it has loaded it works offline. The only requests are for the app's own
  files, to your host.
- **What is stored, and where.** Local storage (swatch book, settings),
  IndexedDB (cover pictures) and Cache Storage (the app's own files). Privacy
  policy §2 lists them, Settings shows them, and "Delete all my data" removes
  them. The app leaves no other files: temporary download links are released
  seconds after use. If you add something that stores more, update §2.
- **The swatch book lives on the device.** The EULA, Terms of Use, Refund
  Policy and Getting Started all say that clearing site data deletes it, and
  that **Back up** (a flipbook page or a data file) and **Restore** exist.

**If you ever add analytics, accounts, cloud sync or licence-key checks,
update `PRIVACY-POLICY.md` first.** An inaccurate privacy document is worse
than none.

---

## Decisions that affect every document

### 1. "No refunds" is not enforceable everywhere

A flat no-refunds policy is void against EU and UK consumers, who have a
statutory 14-day right to cancel. It doesn't bind Apple or Google, and it
doesn't stop a chargeback. A chargeback costs you the sale plus a fee, and a
pattern of them endangers your payment account.

**What's written instead:** "all sales are final" as the default, with
carve-outs where the law overrides it. Then comes the clause that actually
works: **at checkout, the buyer ticks a box requesting immediate delivery and
acknowledging they lose the right to cancel.** Payhip, Paddle and Gumroad all
support this.

Offer goodwill refunds quietly for the first few months regardless.

### 2. "On the Rise Digital" is not a legal entity

- **DBA** with your county or state: $10–100. It makes the trading name
  official, but gives **no** liability protection.
- **Single-member LLC**: $50–500 plus an annual fee. This is what actually
  separates personal assets from the business.
- **Meanwhile:** the documents contract as *Alison Risner, trading as On the
  Rise Digital*, which is lawful and accurate today.

**Settle this before enrolling with Apple.** An organization account needs a
registered business and a D-U-N-S number.

### 3. Commercial use is *allowed*, deliberately

The template restricted commercial use. That's right for some tools, but
wrong for a palette maker, whose buyers are designers, artists and makers
who sell their work. The EULA now:

- allows use in your own paid work (§2.1)
- says the palettes you create are yours, including for commercial use
  (§4.2)
- restricts **sharing** the app, **offering it as a service**, **extracting**
  its naming system or themes, and **AI training** (§3)

Licences are per person. A studio that wants five seats buys five licences.

### 4. Trademarks

The app names Procreate, Adobe, Canva and others to describe export
compatibility. That's allowed (nominative fair use), as long as you:

- use the names only to say what the app works with, never as your branding
- don't use their logos (the app uses neutral letter glyphs, on purpose)
- say you're not affiliated with them (EULA §5.2, Terms of Use §5.2,
  Third-party licences)

Keep doing all three in the store listing too.

### 5. Colors on screen aren't print-matched

EULA §7 and Terms of Use §6 say the app isn't a color-management system. It
matters because buyers will print, paint and dye with these palettes, and
screens lie.

---

## Also worth having

- **A short warranty statement** on the product page: "If it doesn't work in
  your browser within 30 days, we'll fix it or refund you."
- **Supported browsers, stated plainly** (see `direct/INSTALL.md`).
- **A backup of the whole swatch book** — done: Swatch Book › More › Back up
  (and Settings). It answers the biggest support question before anyone asks
  it, and moves a book to a new device.
- **An accessibility note** if you add colorblind previews or contrast checks.
