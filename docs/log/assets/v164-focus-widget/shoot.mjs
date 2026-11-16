// v1.6.4 F6 (2026-11-16): the Focus widget redrawn to Focus D3 — a segment bar in place of the ring. Draws the faces from
// ../widgets-build/mock.html (focusFace: run, break, paused, idle; 2×2 and the slim 2×1; day and night) into
// after-<state>-<size>-<theme>.png and after.png (one sheet), and the picker previews kfw_preview_w18 / w20 (day, 2×,
// transparent corners) the way widgets-build/shoot.mjs makes them. before-w18.png / before-w20.png are the ring versions.
//   node shoot.mjs [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RES = path.resolve(HERE, '../../../../app/native/android/res/drawable-nodpi')
const PW = process.argv[2] ?? 'D:/temp/claude/D--Coding-kais-flow/364f4c21-606b-40e0-a1f2-b46300b06cdf/scratchpad/pw2/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const errors = []
const open = async (scale) => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: scale })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(pathToFileURL(path.join(HERE, '../widgets-build/mock.html')).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // Our own grid: every state, both sizes, both themes.
  await page.evaluate(() => {
    const out = document.getElementById('out')
    const card = (state, slim, theme) => {
      const [c, r] = slim ? [2, 1] : [2, 2]
      return `<div data-theme="${theme}" style="display:inline-block;padding:10px"><div class="w ${slim ? 'slim' : ''}" data-face="${state}-${slim ? 'slim' : '2x2'}-${theme}" style="width:${dp(c)}px;height:${hp(r)}px">${focusFace(state, slim)}</div></div>`
    }
    out.innerHTML = ['day', 'night'].map((t) => `<div data-sheet="${t}" data-theme="${t}" style="display:flex;flex-wrap:wrap;gap:6px;padding:14px;background:var(--paper-linen);width:1000px">${['run', 'break', 'paused', 'idle'].map((s) => card(s, false, t) + card(s, true, t)).join('')}</div>`).join('')
  })
  return page
}

const page = await open(1)
const overflow = await page.evaluate(() => [...document.querySelectorAll('[data-face]')].filter((w) => [...w.querySelectorAll('*')].some((e) => { const r = e.getBoundingClientRect(), b = w.getBoundingClientRect(); return r.height > 0 && (r.bottom > b.bottom + 1 || r.right > b.right + 1) })).map((w) => w.dataset.face))
for (const el of await page.$$('[data-face]')) await el.screenshot({ path: path.join(HERE, `after-${await el.getAttribute('data-face')}.png`) })
await (await page.$('[data-sheet="day"]')).screenshot({ path: path.join(HERE, 'after-day.png') })
await (await page.$('[data-sheet="night"]')).screenshot({ path: path.join(HERE, 'after-night.png') })

const p2 = await open(2)
await p2.addStyleTag({ content: 'body{background:transparent!important} .wall{background:none!important}' })
for (const [id, face] of [['18', 'run-2x2-day'], ['20', 'run-slim-day']]) {
  const png = await (await p2.$(`[data-face="${face}"]`)).screenshot({ omitBackground: true })
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
}
await browser.close()
const result = { errors, overflowing: overflow }
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(result, null, 2))
console.log(result)
