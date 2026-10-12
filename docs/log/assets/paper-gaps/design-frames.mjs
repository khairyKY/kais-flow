// The drawing's frames for the side-by-sides: design-export/Paper Capture.dc.html rendered in
// Chrome, each frame (by its id) cut out as design-<id>.png.
//   node design-frames.mjs <outDir> [repoRoot]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const ROOT = process.argv[3] ?? path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../../..')
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(ROOT, 'design-export', 'Paper Capture.dc.html')).href, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
for (const id of ['11c', '11d', '11e', '11f', '11i', '11m']) {
  const frame = page.locator(`[id="${id}"]`)
  if (!(await frame.count())) {
    console.log(`no frame ${id}`)
    continue
  }
  await frame.screenshot({ path: path.join(OUT, `design-${id}.png`) })
  console.log(`design-${id}.png`)
}
await browser.close()
