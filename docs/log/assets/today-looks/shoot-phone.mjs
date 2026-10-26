// today-looks (phone): screenshots of design-export/Phone home options.html by day and night (each phone frame, each
// home screen, the whole page) and the density counts the page works out. Plain file:// page, no server.
//   node shoot.mjs [outDir] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? path.join(HERE, 'phone')
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const PAGE = pathToFileURL(path.resolve(HERE, '../../../../design-export/Phone home options.html')).href
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(PAGE, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
const counts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-dens]')].map((b) => [b.dataset.dens, JSON.parse(b.dataset.counts)])))
// Overflow check: nothing in a frame sticks out sideways past its own clipping box (a cut-off title is fine, it ellipses).
const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')))
const wide = await page.evaluate(() => [...document.querySelectorAll('.frame')].flatMap((f) => [...f.querySelectorAll('.scr')].filter((m) => m.scrollWidth > m.clientWidth + 1).map((m) => `${f.dataset.measure} ${m.className} ${m.scrollWidth}>${m.clientWidth}`)))
for (const theme of ['day', 'night']) {
  await page.click(`[data-th="${theme}"]`)
  await page.waitForTimeout(150)
  for (const f of await page.locator('.frame').all()) {
    const id = await f.getAttribute('data-measure')
    await f.screenshot({ path: path.join(OUT, `${id}-${theme}.png`) })
  }
  for (const d of ['A', 'B', 'C']) {
    const hs = page.locator(`#look-${d} .hs:visible`)
    for (let i = 0; i < await hs.count(); i++) await hs.nth(i).screenshot({ path: path.join(OUT, `widgets-${d}-${i ? 'large' : 'small-medium'}-${theme}.png`) })
  }
  for (const f of await page.locator('[data-lock]').all()) await f.locator('.ls').screenshot({ path: path.join(OUT, `lockscreen-${await f.getAttribute('data-lock')}-${theme}.png`) })
  await page.locator('#existing').screenshot({ path: path.join(OUT, `widgets-existing-${theme}.png`) })
  await page.screenshot({ path: path.join(OUT, `page-${theme}.png`), fullPage: true })
}
// The Copy my picks button after a pick.
await page.click('#look-B .pick[data-grp="phone"]')
await page.click('#look-B .pick[data-grp="widgets"]')
await page.click('[data-grp="lock"][data-pick="B"]')
await page.click('[data-grp="w03"][data-pick="ok"]')
await page.click('[data-grp="w34"][data-pick="no"]')
await page.click('#copy')
await page.waitForTimeout(300)
const copied = await page.locator('#copied').innerText()
console.log(JSON.stringify({ counts, wide, broken, copied, errors }, null, 1))
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ counts, wide, broken, copied, errors }, null, 1))
await browser.close()
