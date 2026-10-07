// Builds the static site into dist/. Node only, no dependencies: `node build.mjs`.
// SITE_URL (env) = the public origin, used for canonical links, Open Graph images, sitemap and RSS.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { page } from './src/lib.mjs'
import { pages } from './src/pages/index.mjs'
import { RELEASES, shortDate } from './src/data.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const SITE = (process.env.SITE_URL || 'https://kais-flow-site.pages.dev').replace(/\/+$/, '')

fs.rmSync(DIST, { recursive: true, force: true })
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true })
const read = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')
const write = (rel, text) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text) }

write('site.css', read('tokens.css') + '\n' + read('site.css'))
write('site.js', read('site.js'))

const seen = new Set()
for (const p of pages) {
  if (seen.has(p.path)) throw new Error(`two pages at ${p.path}`)
  seen.add(p.path)
  write(p.path === '/404' ? '404.html' : path.join(p.path, 'index.html'), page({ site: SITE, ...p }))
}

// sitemap + robots
const urls = pages.filter((p) => p.path !== '/404').map((p) => `  <url><loc>${SITE}${p.path}</loc></url>`)
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)

// field notes as RSS — the "tell me when it's ready" with no email
const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const items = RELEASES.map((r) => `  <item>
    <title>${x(`${r.v} · ${shortDate(r.date)}${r.title ? ` — ${r.title}` : ''}`)}</title>
    <link>${SITE}/field-notes/#${r.v}</link>
    <guid isPermaLink="false">kais-flow-${r.v}</guid>
    <pubDate>${new Date(r.date + 'T12:00:00+03:00').toUTCString()}</pubDate>
    <description>${x(r.highlights.join(' · '))}</description>
  </item>`)
write('field-notes/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Kai’s Flow · Field notes</title>
  <link>${SITE}/field-notes/</link>
  <atom:link href="${SITE}/field-notes/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Every release of Kai’s Flow, written down like a journal entry.</description>
  <language>en</language>
${items.join('\n')}
</channel>
</rss>
`)

console.log(`built ${pages.length} pages → ${path.relative(process.cwd(), DIST) || 'dist'} (${SITE})`)
