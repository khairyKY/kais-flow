// daystrip-looks: screenshots of design-export/Day strip options.html by day and night (each phone frame, each widget,
// the whole page) plus the above-the-fold counts the page measures. Plain file:// page, no server.
//   node shoot.mjs [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PW = process.argv[2] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const PAGE = pathToFileURL(path.resolve(HERE, '../../../../design-export/Day strip options.html')).href
const { chromium } = await import(pathToFileURL(PW).href)

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(PAGE, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
const counts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-dens]')].map((b) => [b.dataset.dens, JSON.parse(b.dataset.counts)])))
const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.style.display !== 'none' && (!i.complete || i.naturalWidth === 0)).map((i) => i.getAttribute('src')))
// nothing sticks out sideways past the phone's scroll box (a cut-off title is fine, it ellipses)
const wide = await page.evaluate(() => [...document.querySelectorAll('.frame')].flatMap((f) => [...f.querySelectorAll('.scr')].filter((m) => m.scrollWidth > m.clientWidth + 1).map((m) => `${f.dataset.measure} ${m.scrollWidth}>${m.clientWidth}`)))
for (const theme of ['day', 'night']) {
  await page.click(`[data-th="${theme}"]`)
  await page.waitForTimeout(150)
  for (const f of await page.locator('.frame').all()) await f.screenshot({ path: path.join(HERE, `${await f.getAttribute('data-measure')}-${theme}.png`) })
  for (const w of await page.locator('[data-widget]').all()) await w.screenshot({ path: path.join(HERE, `widget-${await w.getAttribute('data-widget')}-${theme}.png`) })
  await page.screenshot({ path: path.join(HERE, `page-${theme}.png`), fullPage: true })
}
await page.click('#look-3 .pick[data-grp="day"]')
await page.click('#look-3 .pick[data-grp="widget"]')
await page.click('#copy')
await page.waitForTimeout(300)
const copied = await page.locator('#copied').innerText()
const out = { counts, wide, broken, copied, errors }
console.log(JSON.stringify(out, null, 1))
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(out, null, 1))
await browser.close()
