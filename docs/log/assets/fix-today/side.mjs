// Side-by-side sheets: the design frame | the build, same state. Run after verify.mjs:
//   node side.mjs <dir with verify's screenshots> [playwright-core path]
// Reads design-export/Today.dc.html #2a and MK Now Card.dc.html straight from the repo.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const DIR = path.resolve(process.argv[2] ?? path.dirname(fileURLToPath(import.meta.url)))
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const DE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../design-export')
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

// The design frames.
const d = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await d.goto(pathToFileURL(path.join(DE, 'Today.dc.html')).href, { waitUntil: 'load' })
await d.waitForTimeout(2500)
await d.locator('[id="2a"] .dv-card').first().screenshot({ path: path.join(DIR, 'design-2a.png') })
const m = await b.newPage({ viewport: { width: 2400, height: 1000 } })
await m.goto(pathToFileURL(path.join(DE, 'MK Now Card.dc.html')).href, { waitUntil: 'load' })
await m.waitForTimeout(2500)
await m.screenshot({ path: path.join(DIR, 'design-mk-now-card.png'), clip: { x: 430, y: 20, width: 1180, height: 700 } })

/** A sheet: images side by side with a caption over each. */
async function sheet(name, items, width) {
  const p = await b.newPage({ viewport: { width, height: 400 } })
  // Inline (about:blank can't load file:// images).
  const src = (file) => `data:image/png;base64,${fs.readFileSync(path.join(DIR, file)).toString('base64')}`
  const cells = items.map(([cap, file, w]) => `<figure><figcaption>${cap}</figcaption><img src="${src(file)}" style="width:${w}px"></figure>`).join('')
  await p.setContent(`<style>body{margin:0;padding:16px;background:#e6dfce;font:13px system-ui;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}figure{margin:0}figcaption{margin:0 0 6px;color:#2a2420}img{display:block;border:1px solid #cfc7b0}</style>${cells}`)
  await p.waitForTimeout(500)
  await p.screenshot({ path: path.join(DIR, name), fullPage: true })
  await p.close()
}
await sheet('side-2a-desktop.png', [['Today.dc.html 2a (design)', 'design-2a.png', 1000], ['build · 09:40 running · day · 1280×800 @125%', 'd2-running-0940-day.png', 1000]], 2060)
await sheet('side-2a-desktop-night.png', [['Today.dc.html 2a (design, day only)', 'design-2a.png', 1000], ['build · 09:40 running · night', 'd2-running-0940-night.png', 1000]], 2060)
await sheet('side-now-desktop.png', [
  ['running 09:40', 'd2-running-0940-day.png', 640], ['running over 12:20', 'd4-over-1220-day.png', 640], ['paused', 'd7-paused-day.png', 640],
  ['just done 12:20', 'd5-just-done-1220-day.png', 640], ['idle 11:18 (no card head — ruling)', 'd3-idle-1118-day.png', 640], ['plan 08:00 (Day card head)', 'd1-plan-0800-day.png', 640],
], 2000)
await sheet('side-now-phone.png', [
  ['MK Now Card.dc.html (design)', 'design-mk-now-card.png', 900],
  ['in progress 09:40', 'p2-running-0940-day.png', 300], ['running over 12:20', 'p4-over-1220-day.png', 300], ['paused 11:02', 'p7-paused-day.png', 300], ['just done 12:20', 'p5-just-done-1220-day.png', 300],
  ['idle 11:18 (no slip — ruling)', 'p3-idle-1118-day.png', 300], ['over capacity 16:00 (MK Workload)', 'p8-over-capacity-1600-day.png', 300],
], 2200)
await b.close()
console.log('sheets written to', DIR)
