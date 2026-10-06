// Screenshots of the built site + side-by-sides with Kai's design frames (builder S2, 2026-10-04).
//   node shots.mjs <outDir> [siteBase=http://localhost:5438] [sharp dir] [playwright-core path]
// Renders the frames straight from design-export/*.dc.html (served on a free port), shoots each page,
// and writes JPEGs: pages/<width>-<page>.jpg and sbs-<frame>.jpg (design left, built right).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')
const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5438'
const sharp = createRequire(path.join(process.argv[4] ?? 'D:/Coding/kais-flow/app', 'package.json'))('sharp')
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true })

// design-export over a throwaway server (support.js renders the <x-dc> markup)
const DX = path.join(REPO, 'design-export')
const srv = http.createServer((q, r) => { const f = path.join(DX, decodeURIComponent(new URL(q.url, 'http://x').pathname)); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); r.end(b) }) }).listen(0)
const DBASE = `http://localhost:${srv.address().port}/`

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const ctxs = {}
const ctx = async (w, theme, reduced = true) => {
  const k = `${w}${theme}${reduced}`
  if (!ctxs[k]) {
    ctxs[k] = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, colorScheme: theme === 'night' ? 'dark' : 'light', reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await ctxs[k].route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"tag_name":"v1.0.17","published_at":"2026-10-03T23:48:44Z","assets":[]}' }))
  }
  return ctxs[k]
}
// one shot: [path, width, theme, mode] — mode full | top | story:<n> | sel:<css>
const shoot = async ([u, w, theme, mode = 'full']) => {
  const p = await (await ctx(w, theme, !mode.startsWith('story'))).newPage()
  await p.goto(BASE + u, { waitUntil: 'networkidle' })
  await p.evaluate(async () => { await document.fonts.ready; for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } scrollTo(0, 0) })
  await p.waitForTimeout(300)
  let buf
  if (mode === 'full') buf = await p.screenshot({ fullPage: true, type: 'png' })
  else if (mode === 'top') buf = await p.screenshot({ type: 'png' })
  else if (mode.startsWith('story:')) {
    const i = +mode.slice(6)
    await p.evaluate((i) => { const s = document.querySelector('.story'); scrollTo(0, s.offsetTop + ((i + 0.5) * (s.offsetHeight - innerHeight)) / 5) }, i)
    await p.waitForTimeout(1000)
    buf = await p.screenshot({ type: 'png' })
  } else buf = await p.locator(mode.slice(4)).first().screenshot({ type: 'png' })
  await p.close()
  return buf
}
const design = async (doc, id) => {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await p.goto(DBASE + encodeURIComponent(doc), { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const b = await p.locator(`[id="${id}"]`).screenshot({ type: 'png' })
  await p.close()
  return b
}

const BG = { r: 239, g: 233, b: 219 }
const label = (t, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="36"><text x="0" y="24" font-family="Georgia, serif" font-size="20" fill="#5f5849">${t}</text></svg>`)
const fit = async (buf, w) => { const m = await sharp(buf).metadata(); const width = Math.min(w, m.width); return { buf: await sharp(buf).resize({ width }).png().toBuffer(), w: width, h: Math.round((m.height * width) / m.width) } }
const sideBySide = async (name, designBuf, built, note) => {
  const L = await fit(designBuf, 760)
  const R = []
  for (const [b, w] of built) R.push(await fit(b, w))
  const rw = Math.max(...R.map((r) => r.w)), rh = R.reduce((a, r) => a + r.h + 16, -16)
  const W = L.w + 40 + rw + 48, H = Math.max(L.h, rh) + 72
  const comps = [{ input: label(`Design ${name}`, L.w), left: 24, top: 12 }, { input: L.buf, left: 24, top: 48 }, { input: label(`Built${note ? ' · ' + note : ''}`, rw), left: L.w + 64, top: 12 }]
  let y = 48
  for (const r of R) { comps.push({ input: r.buf, left: L.w + 64, top: y }); y += r.h + 16 }
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(comps).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(OUT, `sbs-${name}.jpg`))
  console.log('sbs', name)
}

const D = 'Site.dc.html', H2 = 'Site Home v2.dc.html', P = 'Site Pages.dc.html', A = 'Site Arabic and Details.dc.html'
const ogBuf = (n) => fs.readFileSync(path.join(REPO, 'site/public/og', n + '.png'))
const PAIRS = [
  ['13a', D, [[['/', 1440, 'day'], 560]], 'reduced-motion view: the scroll story stacks'],
  ['13b', D, [[['/', 390, 'day'], 300]]],
  ['13c', D, [[['/', 1440, 'night', 'top'], 720], [['/', 390, 'night', 'top'], 300]]],
  ['13d', D, [[['/download/', 1440, 'day'], 640], [['/download/', 390, 'day'], 300]]],
  ['13e', D, [[['/privacy/', 1440, 'day'], 640], [['/privacy/', 390, 'day'], 300]]],
  ['13f', D, [[['/terms/', 1440, 'day'], 720]]],
  ['13g', D, [[ogBuf('home'), 720], [['/', 1440, 'day', 'sel:.site-footer .foot-brand'], 300]]],
  ['13b-1', H2, [0, 1, 2, 3, 4].map((i) => [['/', 1440, i === 4 ? 'day' : 'day', `story:${i}`], 560]).concat([0, 1, 2, 3, 4].map((i) => [['/', 390, 'day', `story:${i}`], 220])), 'pinned scroll, beats 1–5, desktop then phone'],
  ['13b-2', H2, [[['/', 1440, 'day', 'sel:section:has(.little)'], 720], [['/', 390, 'day', 'sel:section:has(.little)'], 300]]],
  ['13b-3', P, [[['/features/', 1440, 'day'], 640], [['/features/calendar/', 1440, 'day'], 640], [['/features/calendar/', 390, 'day'], 300]]],
  ['13b-4', P, [[['/paper/', 1440, 'day'], 720]]],
  ['13b-5', P, [[['/integrations/', 1440, 'day'], 720]]],
  ['13b-6', P, [[['/compare/', 1440, 'day'], 720]]],
  ['13b-7', P, [[['/field-notes/', 1440, 'day'], 640]]],
  ['13b-8', P, [[['/growing/', 1440, 'day'], 720]]],
  ['13b-9', P, [[['/guides/', 1440, 'day'], 640], [['/guides/install-android/', 1440, 'day'], 640]]],
  ['13b-10', P, [[['/about/', 1440, 'day'], 640], [['/press/', 1440, 'day'], 640]]],
  ['13b-11', P, [[['/404.html', 1440, 'day'], 640], [['/404.html', 390, 'night'], 300]]],
  ['13b-12', A, [[['/ar/', 1440, 'day'], 640], [['/ar/', 390, 'day'], 300]]],
  ['13b-13', A, [[ogBuf('home'), 600], [ogBuf('feature-calendar'), 600], [ogBuf('field-notes'), 600], [ogBuf('guide-install-android'), 600]]],
]
for (const [id, doc, built, note] of PAIRS) {
  const bufs = []
  for (const [spec, w] of built) bufs.push([Buffer.isBuffer(spec) ? spec : await shoot(spec), w])
  await sideBySide(id, await design(doc, id), bufs, note)
}

// every page, desktop + phone, day; plus a night set
const pages = [...(await (await fetch(BASE + '/sitemap.xml')).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).concat('/404.html')
const slug = (u) => u.replace(/^\/|\/$/g, '').replace(/[/.]/g, '-') || 'home'
for (const u of pages) {
  for (const [w, sc] of [[1440, 0.4], [390, 0.6]]) {
    const b = await shoot([u, w, 'day'])
    await sharp(b).resize({ width: Math.round(w * sc) }).jpeg({ quality: 68, mozjpeg: true }).toFile(path.join(OUT, 'pages', `${w}-${slug(u)}.jpg`))
  }
}
for (const [u, w] of [['/', 1440], ['/privacy/', 1440], ['/features/calendar/', 1440], ['/', 390], ['/ar/', 390], ['/field-notes/', 390]]) {
  const b = await shoot([u, w, 'night'])
  await sharp(b).resize({ width: Math.round(w * (w > 800 ? 0.4 : 0.6)) }).jpeg({ quality: 68, mozjpeg: true }).toFile(path.join(OUT, 'pages', `${w}-${slug(u)}-night.jpg`))
}
console.log('pages:', pages.length, '× 2 + 6 night')
await browser.close()
srv.close()
