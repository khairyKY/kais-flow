// v165-site (2026-11-16): the explainer site's new hero (A · "Title page") and maker mark (4 · "Signed"), checked
// on the built site against Kai's design page, in day and night at 1280 and 390.
//   node verify.mjs <outDir> [designHtml] [siteDist] [playwright-core path]
// Serves site/dist on a throwaway port, takes the home page's hero + footer, takes the design page's A hero and
// mark-4 footer tile, and puts each pair side by side (design left, site right).
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? 'out'
const DESIGN = process.argv[3] ?? 'D:/Coding/kais-flow/design-export/Site and mark.html'
const DIST = process.argv[4] ?? fileURLToPath(new URL('../../../../site/dist', import.meta.url))
const PW = process.argv[5] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`) }

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.json': 'application/json' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let f = path.join(DIST, p)
  if (p.endsWith('/')) f = path.join(f, 'index.html')
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nope') }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
})
await new Promise((r) => server.listen(0, '::', r))
const BASE = `http://localhost:${server.address().port}`

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newPage = async (width, height, theme) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme === 'night' ? 'dark' : 'light' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => check('no page error', false, e.message))
  return page
}
const side = async (a, b, out) => {
  const page = await newPage(2600, 1000, 'day')
  const u = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
  await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;align-items:flex-start;padding:16px;font:14px sans-serif"><figure style="margin:0"><figcaption>design page</figcaption><img src="${u(a)}"></figure><figure style="margin:0"><figcaption>built site</figcaption><img src="${u(b)}"></figure></body>`)
  await page.screenshot({ path: out, fullPage: true })
  await page.context().close()
}

for (const [w, h, tag] of [[1280, 900, '1280'], [390, 844, '390']]) {
  for (const theme of ['day', 'night']) {
    // ── the built site
    const page = await newPage(w, h, theme)
    await page.addInitScript((t) => localStorage.setItem('kf-theme', t), theme)
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const ds = await page.evaluate(() => document.documentElement.dataset.theme)
    check(`${tag} ${theme}: theme applied`, ds === theme, ds)
    check(`${tag} ${theme}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await page.evaluate(() => document.documentElement.scrollWidth))
    const sel = tag === '1280' ? 'cal' : 'today'
    check(`${tag} ${theme}: ${sel} tab is the open one`, await page.evaluate((k) => document.querySelector('.ha-stage').dataset.on === k, sel))
    const shownImg = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.ha-stage .ha-pane')].find((p) => getComputedStyle(p).visibility === 'visible')
      return [...pane.querySelectorAll('img')].filter((x) => x.offsetParent && x.getAttribute('src').includes('hero-')).map((x) => x.getAttribute('src'))[0]
    })
    check(`${tag} ${theme}: the ${theme} picture shows`, shownImg?.includes(`-${theme}.webp`), shownImg)
    const sigFont = await page.evaluate(() => getComputedStyle(document.querySelector('.sig-tx')).fontFamily)
    check(`${tag} ${theme}: signed mark in the footer`, /made by kai, egypt/.test(await page.textContent('.foot-sig')), sigFont)
    check(`${tag} ${theme}: the pill links to What's new`, await page.evaluate(() => document.querySelector('.ha-vp').getAttribute('href') === '/whats-new/'))
    await page.locator('.ha').screenshot({ path: `${OUT}/site-${tag}-${theme}-hero.png` })
    await page.locator('.site-footer').scrollIntoViewIfNeeded()
    await page.locator('.site-footer').screenshot({ path: `${OUT}/site-${tag}-${theme}-footer.png` })
    if (tag === '1280' && theme === 'day') {
      // tabs: click each; the open one is marked selected
      for (const k of ['inbox', 'widgets', 'today']) {
        await page.locator('.ha').scrollIntoViewIfNeeded()
        await page.locator(`.ha-tabs [data-tab="${k}"]`).click()
        await page.waitForTimeout(450)
        check(`tab ${k} opens`, await page.evaluate((k) => document.querySelector('.ha-stage').dataset.on === k && document.querySelector(`.ha-tabs [data-tab="${k}"]`).getAttribute('aria-selected') === 'true', k))
      }
      // the other pages still build and show the footer mark
      for (const p of ['/whats-new/', '/field-notes/', '/download/', '/features/']) {
        const r = await page.goto(BASE + p, { waitUntil: 'load' })
        check(`${p} loads with the mark`, r.status() === 200 && (await page.locator('.sig-tx').count()) === 1)
      }
    }
    await page.context().close()

    // ── the design page
    const dp = await newPage(w === 390 ? 1200 : 1280, 900, theme)
    await dp.goto(pathToFileURL(DESIGN).href, { waitUntil: 'load' })
    await dp.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await dp.evaluate(() => document.fonts.ready)
    await dp.waitForTimeout(500)
    const fit = dp.locator(`[data-dir="A"] .fit.f${w === 390 ? '390' : '1440'}`)
    await fit.scrollIntoViewIfNeeded()
    await fit.screenshot({ path: `${OUT}/design-${tag}-${theme}-hero.png` })
    const tile = dp.locator('#marks .mk-grid').nth(3).locator('.sfoot')
    await tile.scrollIntoViewIfNeeded()
    await tile.screenshot({ path: `${OUT}/design-${tag}-${theme}-mark4.png` })
    await dp.context().close()
    await side(`${OUT}/design-${tag}-${theme}-hero.png`, `${OUT}/site-${tag}-${theme}-hero.png`, `${OUT}/side-${tag}-${theme}-hero.png`)
    await side(`${OUT}/design-${tag}-${theme}-mark4.png`, `${OUT}/site-${tag}-${theme}-footer.png`, `${OUT}/side-${tag}-${theme}-mark.png`)
  }
}
await browser.close(); server.close()
console.log(results.every(Boolean) ? 'ALL PASS' : 'FAILURES')
process.exit(results.every(Boolean) ? 0 : 1)
