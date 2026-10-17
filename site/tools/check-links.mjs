// Checks the built site (run after `node build.mjs`; CI runs both): every internal href/src resolves to
// a file in dist/ (and its #anchor exists), no Kai placeholder is left except the ones he still has to
// write, and with ARABIC off nothing mentions /ar/. Also asserts data.mjs siteUrl. No dependencies.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARABIC, siteUrl } from '../src/data.mjs'

// siteUrl: SITE_URL wins; Pages' deployment URL → the project's; otherwise the Worker's address
assert.equal(siteUrl({ SITE_URL: 'https://example.org/' }), 'https://example.org')
assert.equal(siteUrl({ CF_PAGES_URL: 'https://9e5c2a6f.kais-flow-site.pages.dev' }), 'https://kais-flow-site.pages.dev')
assert.equal(siteUrl({ CF_PAGES_URL: 'https://kais-flow-site.pages.dev' }), 'https://kais-flow-site.pages.dev')
assert.equal(siteUrl({}), 'https://kais-flow-site.khairyshhn1.workers.dev')

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
// Kai's own words, still to come (site/README.md "Placeholders for Kai"): page → how many
// 2026-10-13: the contact email is set (data.mjs CONTACT_EMAIL), so privacy and terms have none left.
const ALLOWED = { 'about/index.html': 5 }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const html = walk(DIST).filter((f) => f.endsWith('.html'))
const rel = (f) => path.relative(DIST, f).split(path.sep).join('/')
const target = (p) => { const f = path.join(DIST, decodeURI(p)); return p.endsWith('/') ? path.join(f, 'index.html') : f }
const ids = new Map()
const idsOf = (f) => { if (!ids.has(f)) ids.set(f, new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))); return ids.get(f) }

const bad = []
let links = 0
for (const f of html) {
  const text = fs.readFileSync(f, 'utf8')
  for (const [, url] of text.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(url)) continue
    links++
    const [p, hash] = url.split('#')
    const file = p ? target(p.startsWith('/') ? p : path.posix.join('/', path.posix.dirname(rel(f)), p)) : f
    if (!fs.existsSync(file)) bad.push(`${rel(f)}: ${url} — no such file`)
    else if (hash && file.endsWith('.html') && !idsOf(file).has(hash)) bad.push(`${rel(f)}: ${url} — no #${hash}`)
  }
  const og = text.match(/property="og:image" content="https?:\/\/[^/]+(\/[^"]+)"/)?.[1]
  if (og && !fs.existsSync(target(og))) bad.push(`${rel(f)}: share card ${og} — not rendered (tools/render-assets.mjs)`)
  const todo = (text.match(/class="todo"/g) ?? []).length
  if (todo !== (ALLOWED[rel(f)] ?? 0)) bad.push(`${rel(f)}: ${todo} placeholder(s), expected ${ALLOWED[rel(f)] ?? 0}`)
  if (!ARABIC && /href="\/ar\/|hreflang="ar"/.test(text)) bad.push(`${rel(f)}: links to the Arabic page, which is turned off`)
}
if (!ARABIC && fs.existsSync(path.join(DIST, 'ar'))) bad.push('dist/ar/ exists, but ARABIC is off')
if (!ARABIC && /\/ar\//.test(fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8'))) bad.push('sitemap.xml lists /ar/')

console.log(`${html.length} pages, ${links} internal links and images checked`)
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('all resolve; placeholders only where Kai still writes')
