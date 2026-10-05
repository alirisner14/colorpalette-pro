# Keeping the source proprietary

What protects Color Palette PRO's code, and what to keep doing.

## Where things stand

Color Palette PRO has been **proprietary from its first commit**. `LICENSE`
says "All rights reserved", and the repository has never carried an
open-source licence. That means there's no earlier grant to work around: no
one has ever been given a right to copy, modify or redistribute the code.

## Keep the repository private

GitHub → the repo → **Settings** → **Danger Zone** → check that
visibility is **Private**.

- Check **Settings → Collaborators** from time to time. Anyone listed there
  can read and clone everything.
- Forks of a private repository stay private and lose access when the
  collaborator does. They still have a copy of whatever they cloned, though,
  so add people deliberately.
- GitHub Pages on a private repo needs a paid plan. Host the web app
  somewhere else (Netlify, Vercel, Cloudflare Pages) if you'd rather not pay.

## What the buyer gets vs. what stays private

A web app has to send its JavaScript to the browser, so **anyone who opens
the app can see the code it runs**. That's true of every web app. The
protection comes from the licence, not from secrecy:

- The EULA forbids copying, extracting, redistributing and AI training
  (sections 3.3–3.6). That's what you enforce.
- Keep the repository, tests, documentation and future plans private. Only
  the built app is public.
- Optionally, minify the JavaScript when you publish. It's a speed bump, not
  a lock, and it makes support harder, so it isn't worth much here.

## Contributions

A private, proprietary repo takes no outside contributions, which removes
the question. If you ever hire help or accept a patch, get a written
agreement that **assigns** the copyright in that work to you (a contractor
agreement or contributor licence agreement) **before** you merge it.
Otherwise you don't own all of what you sell.

## What stays open regardless

- **Grandstander and Nunito** keep their SIL Open Font License. The font files
  are bundled, and their OFL texts ship in `Legal/licences/`. Keep them there.
- **Capacitor** and any plugins used for the mobile apps keep their own
  licences (mostly MIT). List them in `shared/THIRD-PARTY-LICENCES.md`.

Keeping your own code proprietary doesn't release you from any of these.

## Reassuring buyers without opening the code

The privacy promise is easy to check: after it has loaded, the app makes no
network requests at all (the fonts are bundled), and anyone can confirm that
in the browser's Network tab, or by switching to airplane mode and watching
it keep working. Say so on the product page. It's the strongest trust signal you have, and
it costs nothing.
