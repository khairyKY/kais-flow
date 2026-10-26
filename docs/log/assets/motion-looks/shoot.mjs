// motion-looks: screenshots of every item on design-export/Motion fixes.html, plus short WebM recordings of
// the top-10 Fixed panes (Playwright recordVideo, one context per item, the pane cropped by its own page).
//   node shoot.mjs [outDir] [playwright-core path]        ONLY=shots|video|check
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? HERE
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const PAGE = pathToFileURL(path.resolve(HERE, '../../../../design-export/Motion fixes.html')).href
const { chromium } = await import(pathToFileURL(PW).href)
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }

// ── check: no errors, every section filled, picks copy works ──
if (want('check') || want('shots')) {
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 }, colorScheme: 'light' })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errs.push(m.text()))
  await page.goto(PAGE)
  await sleep(500)
  const counts = await page.evaluate(() => Object.fromEntries(['A', 'B', 'C', 'D'].map((s) => [s, document.querySelectorAll('#sec' + s + ' > .look').length])))
  check('section counts A10 B13 C12 D26', counts.A === 10 && counts.B === 13 && counts.C === 12 && counts.D === 26, JSON.stringify(counts))
  const pre = await page.evaluate(() => [...document.querySelectorAll('#secC .look.kai-yes')].map((l) => l.id).sort().join(','))
  check('four Kai yes pre-marked', pre === 'CAL11,D15,D3,D4', pre)
  const ids = await page.evaluate(() => [...document.querySelectorAll('.look')].map((l) => l.id))
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })
  for (const id of ids) {
    const el = page.locator(`#${id}`)
    await el.scrollIntoViewIfNeeded()
    await sleep(id === 'R3' ? 8200 : id === 'T1' || id === 'D14' || id === 'R9' ? 6000 : 4300)
    if (want('shots')) await el.screenshot({ path: path.join(OUT, 'shots', `${id}-day.png`) })
  }
  check('no page errors while every demo played', errs.length === 0, errs.slice(0, 5).join(' | '))
  // night + reduced, a few
  await page.click('#tNight'); await page.click('#mRed')
  for (const id of ['T2T3', 'O2O3', 'CAL1', 'D15']) { const el = page.locator(`#${id}`); await el.scrollIntoViewIfNeeded(); await el.locator('.tools .btn', { hasText: 'Replay both' }).click(); await sleep(2600); if (want('shots')) await el.screenshot({ path: path.join(OUT, 'shots', `${id}-night-reduced.png`) }) }
  check('no page errors in night + reduced', errs.length === 0, errs.slice(0, 5).join(' | '))
  await page.click('#mFull'); await page.click('#tDay')
  await page.locator('#D12 .tools .seg .btn').nth(1).click()
  await page.locator('#T1 .tools .btn', { hasText: 'Not this' }).click()
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.click('#copy'); await sleep(300)
  const txt = await page.locator('#picks pre').textContent()
  check('copy my picks lists C answers and Not this', /D15 .*: Yes/.test(txt) && /D12 .*: No/.test(txt) && /T1 /.test(txt), JSON.stringify(txt))
  if (want('shots')) await page.locator('#picks .card').screenshot({ path: path.join(OUT, 'shots', 'picks.png') })
  if (want('shots')) { await page.click('#pclose'); await page.evaluate(() => scrollTo(0, 0)); await sleep(300); await page.screenshot({ path: path.join(OUT, 'shots', 'page-top.png') }) }
  await ctx.close()
}

// ── video: the top-10 Fixed panes ──
const isolate = (page, id) => page.evaluate((id) => {
  const l = document.getElementById(id)
  document.querySelectorAll('.look').forEach((x) => x !== l && (x.style.display = 'none'))
  document.querySelectorAll('.group > h2, .group > .say, .map, .sub, .p3, .lede, h1, .meta, .bar, #secB ~ .say').forEach((x) => (x.style.display = 'none'))
  l.querySelectorAll('h3, .say, .tools').forEach((x) => (x.style.display = 'none'))
  l.querySelector('[data-side="now"]').style.display = 'none'
  l.querySelector('.pair').style.cssText = 'display:block;width:720px;margin:0'
  document.querySelector('.wrap').style.cssText = 'padding:8px;max-width:none;margin:0'
  document.querySelectorAll('.group').forEach((g) => (g.style.marginTop = '0'))
  l.style.cssText = 'margin:0;padding:0;border:0'
}, id)
if (want('video')) {
  const vdir = path.join(OUT, 'video'); fs.mkdirSync(vdir, { recursive: true })
  const ids = ['T1', 'T2T3', 'K1', 'O2O3', 'R6', 'R1', 'R3', 'R8', 'O1', 'T8']
  const len = { T1: 6500, T2T3: 4500, K1: 4600, O2O3: 4200, R6: 5200, R1: 3400, R3: 9500, R8: 3600, O1: 5200, T8: 5200 }
  for (const [n, id] of ids.entries()) {
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 }, colorScheme: 'light' })
    const page = await ctx.newPage()
    await page.goto(PAGE)
    await isolate(page, id)
    const box = await page.locator(`#${id} [data-side="fixed"]`).boundingBox()
    await ctx.close()
    const size = { width: Math.ceil(box.x + box.width) + 8, height: Math.ceil(box.y + box.height) + 8 }
    const vctx = await browser.newContext({ viewport: size, colorScheme: 'light', recordVideo: { dir: vdir, size } })
    const vp = await vctx.newPage()
    await vp.goto(PAGE)
    await isolate(vp, id)
    await vp.locator(`#${id} [data-side="fixed"] .pane-hd .btn`).click()
    await sleep(len[id])
    const v = vp.video()
    await vctx.close()
    const dest = path.join(vdir, `${String(n + 1).padStart(2, '0')}-${id}-fixed.webm`)
    fs.renameSync(await v.path(), dest)
    check(`video ${id}`, fs.statSync(dest).size > 10000, `${(fs.statSync(dest).size / 1024).toFixed(0)} KB`)
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`)
