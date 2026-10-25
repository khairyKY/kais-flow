// looks2: screenshots of design-export/Calendar extras options.html, day and night, one PNG per section,
// plus the AA check on the palettes (every computed text colour >= 4.5:1 on every fill it can sit on).
// Run from the repo root:  node docs/log/assets/looks2/shoot.mjs
import { chromium } from 'file:///D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const page_ = path.resolve(here, '../../../../design-export/Calendar extras options.html')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(pathToFileURL(page_).href)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
// the sticky picks bar would sit over every section shot
await page.addStyleTag({ content: '.bar{position:static!important}' })

// AA: A, B and C must clear 4.5:1 for the time row and the title on every fill; "Now" is reported only.
const pals = await page.$$eval('.look[data-grp="palette"]', (els) => els.map((e) => ({ look: e.dataset.look, time: +e.dataset.minTime, title: +e.dataset.minTitle, terra: +e.dataset.minTerra })))
const values = await page.evaluate(() => Object.fromEntries(Object.entries(PAL).map(([k, P]) => [k, { fill: P.fill, ran: { day: toHex(P.ran.day), night: toHex(P.ran.night) }, sw: P.sw.map((s) => ({ name: s.name, day: toHex(s.day), dayInk: toHex(s.dInk), night: toHex(s.night), nightInk: toHex(s.nInk) })) }])))
writeFileSync(path.join(here, 'palettes.json'), JSON.stringify(values, null, 2))
let fail = 0
for (const p of pals) {
  const ok = p.look === 'N' || (p.time >= 4.5 && p.title >= 4.5)
  if (!ok) fail++
  console.log(`palette ${p.look}: time row ${p.time.toFixed(2)} · title ${p.title.toFixed(2)} · ran-over terra ${p.terra.toFixed(2)} ${ok ? 'ok' : 'FAIL'}`)
}

for (const th of ['day', 'night']) {
  await page.click(`[data-th="${th}"]`)
  await page.waitForTimeout(200)
  for (const id of ['colours', 'menu', 'checks', 'nowcard', 'tray']) {
    const el = await page.$(`#${id}`)
    await el.screenshot({ path: path.join(here, `${id}-${th}.png`) })
  }
}
await browser.close()
if (errors.length) { console.log('page errors:\n' + errors.join('\n')); fail++ }
console.log(fail ? `${fail} problem(s)` : 'all good')
process.exit(fail ? 1 : 0)
