# Kai's Flow — the explainer site

The public website that says what Kai's Flow is and where to get it. Plain static HTML + CSS + a
little JS, built by one Node script with **no dependencies** (no `npm install`). No tracking, no
cookies, no framework. Separate from the app in `../app` — it doesn't import anything from it.

```
node build.mjs          # → dist/  (30 pages, sitemap.xml, robots.txt, field-notes/feed.xml)
```

Preview: serve `dist/` with any static server (`npx serve dist`, `python -m http.server -d dist`).

## Deploy on Cloudflare Pages ($0) — Kai does this once

Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `khairyKY/kais-flow`, then:

| Setting | Value |
|---|---|
| Project name | `kais-flow-site` (gives `https://kais-flow-site.pages.dev`) |
| Production branch | `master` (once `claude/site` is merged; any other branch gets a preview URL) |
| Framework preset | None |
| Build command | `node build.mjs` |
| Build output directory | `dist` |
| Root directory (advanced) | `site` |
| Environment variable | `SITE_URL` = the address people will use, e.g. `https://kais-flow-site.pages.dev` or your own domain. Canonical links, share cards, the sitemap and RSS use it. If the project name above was taken, set it to the `*.pages.dev` address Cloudflare gave you. |

Then **Settings → Builds → Build watch paths → Include paths: `site/*`**, so app-only commits don't
rebuild the site. `404.html` is picked up automatically for unknown addresses; no `_headers` or
`_redirects` are needed. A custom domain is optional (Pages → Custom domains).

## Where things live

| Path | What |
|---|---|
| `build.mjs` | renders every page, copies `public/`, writes sitemap/robots/RSS |
| `src/data.mjs` | **every fact**: app URL, latest release (fallback), field notes, the roadmap, contact email |
| `src/pages/*.mjs` | one module per page group (home, features, paper, guides, info, Arabic…) |
| `src/lib.mjs` · `src/parts.mjs` | the page shell (header, footer, head tags) and shared sections |
| `src/tokens.css` | the app's colour/type tokens, copied (not imported) from `app/src/styles/tokens` |
| `src/site.css` · `src/site.js` | the styles, and the bits of behaviour: sun/moon, menu, scroll story, live version, guide search |
| `src/screens/*.html` | the app screens drawn in Kai's design (`design-export/Site*.dc.html`), shown scaled down |
| `public/img/*.webp` | the botanical art, converted from `app/public/ds/assets` |
| `public/og/*.png`, `favicon*`, `press/*.zip` | rendered by `tools/render-assets.mjs` (needs Playwright + Chrome; run by hand, commit the output) |

## Keeping it true

- **A new release**: add it to the top of `RELEASES` in `src/data.mjs` and bump `LATEST` (the page
  also asks GitHub for the newest release when it loads, so the version on the download cards is
  current even before you do). Re-run `tools/render-assets.mjs` so the field-notes share card shows it.
- **The roadmap**: `ROADMAP` in `src/data.mjs`.
- **Placeholders for Kai** are shown on the page as `[Kai writes this …]` / `[contact email]`:
  the About story and photo, `CONTACT_EMAIL`, how long database backups are kept (Privacy §1), and
  how to make the Akiflow dump (guide: Import your old app).
- The site loads fonts from Google Fonts and the release number from api.github.com; the privacy
  page says so. Nothing else leaves the browser.
