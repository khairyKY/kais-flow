// Side-by-side sheets for the shell side of Today 2a: the design | the build. Run after verify.mjs:
//   node side.mjs <dir with verify's screenshots> [playwright-core path]
// Reads design-export/Today.dc.html #2a (and Inbox.dc.html #3a, same sidebar) straight from the repo.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const DIR = path.resolve(process.argv[2] ?? path.dirname(fileURLToPath(import.meta.url)))
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const DE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../design-export')
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

const d = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await d.goto(pathToFileURL(path.join(DE, 'Today.dc.html')).href, { waitUntil: 'load' })
await d.waitForTimeout(2500)
await d.locator('[id="2a"] .dv-card').first().screenshot({ path: path.join(DIR, 'design-2a.png') })
await d.locator('[id="2a"] .dv-card aside').first().screenshot({ path: path.join(DIR, 'design-2a-sidebar.png') })

async function sheet(name, items, width) {
  const p = await b.newPage({ viewport: { width, height: 400 } })
  const src = (file) => `data:image/png;base64,${fs.readFileSync(path.join(DIR, file)).toString('base64')}`
  const cells = items.map(([cap, file, w]) => `<figure><figcaption>${cap}</figcaption><img src="${src(file)}" style="width:${w}px"></figure>`).join('')
  await p.setContent(`<style>body{margin:0;padding:16px;background:#e6dfce;font:13px system-ui;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}figure{margin:0}figcaption{margin:0 0 6px;color:#2a2420;max-width:${Math.max(...items.map((i) => i[2]))}px}img{display:block;border:1px solid #cfc7b0}</style>${cells}`)
  await p.waitForTimeout(500)
  await p.screenshot({ path: path.join(DIR, name), fullPage: true })
  await p.close()
}
await sheet('side-2a-today.png', [['Today.dc.html 2a (design, 1240 wide)', 'design-2a.png', 1000], ['build · Today 09:40 · day · 1280×800 @125% (no top bar)', 's-today-day.png', 1000]], 2060)
await sheet('side-2a-sidebar.png', [
  ['2a sidebar (design)', 'design-2a-sidebar.png', 240],
  ['build · 1280×800 @125% · day (short: icon foot)', 'sidebar-today-day.png', 240],
  ['build · night', 'sidebar-today-night.png', 240],
  ['build · 1280×1100 (tall: labelled foot, ● synced)', 'sidebar-tall-day.png', 240],
], 1100)
await sheet('side-pages.png', [
  ['Today · day (2a: no top bar)', 's-today-day.png', 640], ['Inbox · day (3a: no top bar)', 's-inbox-day.png', 640],
  ['Tasks · day (its frame keeps the top bar)', 's-tasks-day.png', 640], ['Calendar · day (keeps the top bar)', 's-calendar-day.png', 640],
  ['Today · night', 's-today-night.png', 640], ['Inbox · night', 's-inbox-night.png', 640],
  ['Tasks · night', 's-tasks-night.png', 640], ['Calendar · night', 's-calendar-night.png', 640],
], 1340)
await b.close()
console.log('sheets written to', DIR)
