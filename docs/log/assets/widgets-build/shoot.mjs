// widgets-build (2026-10-26): screenshots of mock.html — a before / after-day / after-night card per widget (wNN.png),
// the three families at 2×2 / 4×2 / 4×4 by day and night (families-{day,night}.png), and the picker previews
// (app/native/android/res/drawable-nodpi/kfw_preview_wNN.webp, the day face at 2×, transparent corners).
//   node docs/log/assets/widgets-build/shoot.mjs [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RES = path.resolve(HERE, '../../../../app/native/android/res/drawable-nodpi')
const PW = process.argv[2] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const errors = []
const open = async (scale) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: scale })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(pathToFileURL(path.join(HERE, 'mock.html')).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return page
}

// 1. the cards and the families, at 1×
const page = await open(1)
const clipped = await page.evaluate(() => [...document.querySelectorAll('.w .nw, .w .clamp')].filter((e) => e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('nw')).length)
const overflow = await page.evaluate(() => [...document.querySelectorAll('.w')].filter((w) => [...w.querySelectorAll('*')].some((e) => { const r = e.getBoundingClientRect(), b = w.getBoundingClientRect(); return r.height > 0 && (r.bottom > b.bottom + 1 || r.right > b.right + 1) && !e.closest('.col') })).map((w) => w.dataset.w))
for (const el of await page.$$('[data-pair]')) await el.screenshot({ path: path.join(HERE, `${(await el.getAttribute('data-pair')).toLowerCase()}.png`) })
for (const t of ['day', 'night']) await (await page.$(`[data-fams="${t}"]`)).screenshot({ path: path.join(HERE, `families-${t}.png`) })

// 2. the picker previews: the day face alone at 2×, on a transparent page, as WebP
const p2 = await open(2)
await p2.addStyleTag({ content: 'body{background:transparent!important} .wall{background:none!important}' })
let n = 0
const save = async (el) => {
  const id = (await el.getAttribute('data-w')).split('-')[0].slice(1)
  const png = await el.screenshot({ omitBackground: true })
  const webp = await p2.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/webp', 0.92).split(',')[1]
  }, png.toString('base64'))
  fs.writeFileSync(path.join(RES, `kfw_preview_w${id}.webp`), Buffer.from(webp, 'base64'))
  n++
}
for (const el of await p2.$$('.pair [data-w$="-day"]')) await save(el)
// the families' new entries (W35–W41) have no "before" card: their day faces from the families row
for (const el of await p2.$$('[data-fams="day"] [data-w$="-day"]')) if (+(await el.getAttribute('data-w')).slice(1, 3) > 34) await save(el)
await browser.close()
const result = { errors, overflowing: overflow, previews: n }
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(result, null, 2))
console.log(result)
