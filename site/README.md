# Kai's Flow — the explainer site

The public website that says what Kai's Flow is and where to get it. Plain static HTML + CSS + a
little JS, built by one Node script with **no dependencies** (no `npm install`). No tracking, no
cookies, no framework. Separate from the app in `../app` — it doesn't import anything from it.

```
node build.mjs             # → dist/  (31 pages, sitemap.xml, robots.txt, field-notes/feed.xml)
node tools/check-links.mjs # every internal link, image and share card resolves; placeholders only where Kai still writes
```

Both run in CI (`.github/workflows/ci.yml`, job **Site build**), so a broken page fails the build.
Preview: serve `dist/` with any static server (`python -m http.server -d dist`), or `npx wrangler dev` here to see it
exactly as the Worker serves it.

## Live (2026-10-17)

**https://kais-flow-site.khairyshhn1.workers.dev**: a Worker with static assets in Kai's Cloudflare account, deployed from this machine (Kai pressed Allow once for `wrangler login`; the dashboard's GitHub connect never listed the repo). Each release: `cd site && node build.mjs && npx wrangler deploy`. The sections below are the dashboard routes, kept for reference.

## Put it live ($0) — Kai does this once, either way

Two free ways on Cloudflare; pick one. Both build from `master`, need no secrets, and rebuild on every push.

### A · Cloudflare Pages

Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `khairyKY/kais-flow`, then:

| Setting | Value |
|---|---|
| Project name | `kais-flow-site` (gives `https://kais-flow-site.pages.dev`) |
| Production branch | `master` (any other branch gets a preview URL) |
| Framework preset | None |
| Build command | `node build.mjs` |
| Build output directory | `dist` |
| Root directory (advanced) | `site` |
| Environment variable | `SITE_URL` = the address people will use, e.g. `https://kais-flow-site.pages.dev` or your own domain. Canonical links, share cards, the sitemap and RSS use it. Without it the build takes the project's own `*.pages.dev` address from Cloudflare (`CF_PAGES_URL`). |

Then **Settings → Builds → Build watch paths → Include paths: `site/*`**, so app-only commits don't
rebuild the site. `404.html` is picked up automatically for unknown addresses; no `_headers` or
`_redirects` are needed. Pages ignores `wrangler.jsonc`. A custom domain is optional (Custom domains).

### B · A Worker with static assets — the way the app itself deploys

`site/wrangler.jsonc` is a Worker named `kais-flow-site` that serves `dist/` (unknown addresses get
`404.html` with a 404). Cloudflare dashboard → **Workers & Pages → Create → Workers → Import a repository**
(Connect to Git) → pick `khairyKY/kais-flow`, then:

| Setting | Value |
|---|---|
| Project (Worker) name | `kais-flow-site` — it must match `name` in `wrangler.jsonc` |
| Production branch | `master` |
| Root directory (advanced) | `site` |
| Build command | `node build.mjs` |
| Deploy command | `npx wrangler deploy` |
| Build variable | `SITE_URL` = `https://kais-flow-site.kaidagoat.workers.dev` (or your own domain). Workers Builds doesn't say its address, so without it the build assumes that one — the account's `workers.dev` subdomain, where the app already is (`kais-flow.kaidagoat.workers.dev`). |

The site is then at **https://kais-flow-site.kaidagoat.workers.dev** (`https://kais-flow-site.<account>.workers.dev`
in general). Optionally **Settings → Build → Build watch paths → `site/*`**. To deploy by hand instead:
`cd site && node build.mjs && npx wrangler deploy` (needs `npx wrangler login` once).

## Where things live

| Path | What |
|---|---|
| `build.mjs` | renders every page, copies `public/`, writes sitemap/robots/RSS |
| `wrangler.jsonc` | the Worker (option B): serves `dist/`, `404.html` for unknown addresses |
| `tools/check-links.mjs` | the build check: links, images, share cards, placeholders, the Arabic switch |
| `src/releases.json` | **the release notes**, newest first: Field notes, What’s new, RSS, the app’s What’s new sheet and the GitHub Release body all read it |
| `src/data.mjs` | **every other fact**: app URL, latest release (fallback, from releases.json), the roadmap, contact email, `ARABIC`, the site address (`siteUrl`) |
| `src/pages/*.mjs` | one module per page group (home, features, paper, guides, info, Arabic…) |
| `src/lib.mjs` · `src/parts.mjs` | the page shell (header, footer, head tags) and shared sections |
| `src/tokens.css` | the app's colour/type tokens, copied (not imported) from `app/src/styles/tokens` |
| `src/site.css` · `src/site.js` | the styles, and the bits of behaviour: sun/moon, menu, scroll story, live version, guide search |
| `public/shots/*.webp` | **real screenshots of the app** (day + night), made by `tools/shoot-app.mjs` against a mocked backend. `shot()` in `lib.mjs` shows them in a drawn bezel; `screen()` uses them wherever one exists |
| `src/screens/*.html` | the older drawn screens (pre-Bound Journal); only used where no real shot exists yet |
| `public/img/*.webp` | the botanical art, converted from `app/public/ds/assets` |
| `public/og/*.png`, `favicon*`, `press/*.zip` | rendered by `tools/render-assets.mjs` (needs Playwright + Chrome; run by hand, commit the output) |

## Keeping it true

- **The pictures**: when the app's look changes, re-run `tools/shoot-app.mjs` (its header says how), then `tools/render-assets.mjs` for the share cards and press kit.
- **A new release**: add it to the top of `src/releases.json` **before tagging** — `{ v, date, title?, highlights,
  icons?, art }`, short warm lines, no jargon. `LATEST` follows it (the page also asks GitHub for the newest
  release when it loads). The app bundles the same file (its What's new sheet), and the release workflow
  writes that entry as the GitHub Release body, which older installs read for "Coming in …". Re-run
  `tools/render-assets.mjs` so the What’s new / Field notes / Download share cards show it.
- **The roadmap**: `ROADMAP` in `src/data.mjs`. Now = this month’s work; when something ships it leaves for Field notes.
- **Arabic is off** (Kai, 2026-10-12): `ARABIC = false` in `src/data.mjs`. Nothing builds or links `/ar/` — no EN | ع
  switch, no hreflang, no sitemap entry, no share card. `src/pages/ar.mjs` and `public/og/ar.png` stay in the repo;
  `ARABIC = true` brings all of it back (re-check its copy against the app first).
- **Placeholders for Kai** are shown on the page as `[Kai writes this …]` / `[contact email]`:
  the About story and the photo caption, and `CONTACT_EMAIL` (Privacy §6, Terms). `tools/check-links.mjs` counts
  them, so a new one can’t slip in unnoticed (and the count needs updating when Kai fills one in).
- The site loads fonts from Google Fonts and the release number from api.github.com; the privacy
  page says so. Nothing else leaves the browser.
