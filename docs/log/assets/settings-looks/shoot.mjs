// Screenshots of design-export/Settings options.html, day and night. Run from the repo root:
//   node docs/log/assets/settings-looks/shoot.mjs
// The page is ~20000px tall and Chrome repeats a capture past 16384px, so each theme is two images:
// -1 = the grouping table + Layout, -2 = Rows and controls + Search + Notes.
import { chromium } from 'file:///D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const page = resolve('design-export/Settings options.html')
const out = resolve('docs/log/assets/settings-looks')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const errors = []
for (const night of [false, true]) {
  const tab = await browser.newPage({ viewport: { width: 1480, height: 1000 } })
  tab.on('pageerror', (e) => errors.push(String(e)))
  tab.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await tab.goto(pathToFileURL(page).href + (night ? '?night' : ''), { waitUntil: 'networkidle' })
  await tab.evaluate(() => document.fonts.ready)
  const { cut, end } = await tab.evaluate(() => ({ cut: Math.round(document.getElementById('rows').getBoundingClientRect().top + scrollY - 24), end: document.documentElement.scrollHeight }))
  const name = `${out}/settings-options-${night ? 'night' : 'day'}`
  await tab.screenshot({ path: `${name}-1.png`, fullPage: true, clip: { x: 0, y: 0, width: 1480, height: cut } })
  await tab.screenshot({ path: `${name}-2.png`, fullPage: true, clip: { x: 0, y: cut, width: 1480, height: end - cut } })
  await tab.close()
}
await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors')
