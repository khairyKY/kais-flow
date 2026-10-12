// Side-by-sides for the cal-wave2 handoff: each design-export frame (rendered from its .dc.html) next to
// the app's screenshot of the same thing (verify.mjs writes those into this folder first).
//   node sbs.mjs [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EXPORT = path.resolve(HERE, '../../../../design-export')
const PW = process.argv[2] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

// [frame file, frame id, app screenshots (day, night), name]
const PAIRS = [
  ['Calendar.dc.html', '4a', ['p4a-planning-1day-day', 'p4a-planning-1day-night'], 'sbs-4a-planning-1day'],
  ['Calendar.dc.html', '4b', ['p4b-planning-2day-day', 'p4b-planning-2day-night'], 'sbs-4b-planning-2day'],
  ['Calendar.dc.html', '3e', ['e3-desktop-day', 'e3-desktop-night'], 'sbs-3e-desktop'],
  ['Calendar.dc.html', '3e', ['e3-phone-day', 'e3-phone-night'], 'sbs-3e-phone'],
  ['Editor.dc.html', '1b', ['e1-create-task-day', 'e1-create-task-night'], 'sbs-1b-create-task'],
  ['Editor.dc.html', '1c', ['e1-create-event-day'], 'sbs-1c-create-event'],
  ['Editor.dc.html', '1d', ['e1-create-block-day'], 'sbs-1d-create-block'],
  ['Editor.dc.html', '1e', ['ph-create-task-day', 'ph-create-task-night'], 'sbs-1e-phone-create'],
  ['Calendar Phone.dc.html', '7c', ['ph-create-task-day', 'ph-create-block-day'], 'sbs-7c-phone-create'],
]

const frames = new Map()
async function frame(file, id) {
  const key = `${file}#${id}`
  if (frames.has(key)) return frames.get(key)
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(path.join(EXPORT, file)).href, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const el = page.locator(`[id="${id}"] .dv-card, [id="${id}"] .phone, [id="${id}"] [data-screen-label]`).first()
  const out = path.join(HERE, `frame-${file.replace(/\W+/g, '-')}${id}.png`)
  await el.screenshot({ path: out })
  await page.close()
  frames.set(key, out)
  return out
}

for (const [file, id, shots, name] of PAIRS) {
  const left = await frame(file, id)
  const right = shots.map((s) => path.join(HERE, `${s}.png`)).filter((f) => fs.existsSync(f))
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  const html = `<body style="margin:0;background:#e6dfce;font:12px monospace;display:flex;gap:24px;padding:24px;align-items:flex-start">
    <figure style="margin:0"><figcaption style="margin-bottom:6px">design-export/${file} · ${id}</figcaption><img src="${img(left)}" style="max-height:900px;max-width:1300px"></figure>
    ${right.map((f) => `<figure style="margin:0"><figcaption style="margin-bottom:6px">app · ${path.basename(f, '.png')}</figcaption><img src="${img(f)}" style="max-height:900px"></figure>`).join('')}
  </body>`
  const page = await browser.newPage({ viewport: { width: 3600, height: 1000 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  const box = await page.evaluate(() => {
    const r = document.body.scrollWidth
    const h = Math.max(...[...document.querySelectorAll('figure')].map((f) => f.getBoundingClientRect().bottom)) + 24
    return { r, h }
  })
  await page.screenshot({ path: path.join(HERE, `${name}.png`), clip: { x: 0, y: 0, width: Math.min(box.r, 3600), height: box.h } })
  await page.close()
  console.log('wrote', name)
}
await browser.close()
