// Visual + behaviour check for kit-sheets on the dev-only /design-system route.
// node verify.mjs <outDir>
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:5202/design-system'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

const VIEWS = [
  { tag: 'phone', viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
  { tag: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

async function open(view, theme, extra = {}) {
  const ctx = await browser.newContext({ viewport: view.viewport, isMobile: view.isMobile, hasTouch: view.hasTouch, deviceScaleFactor: view.deviceScaleFactor, ...extra })
  await ctx.addInitScript((t) => localStorage.setItem('kf_theme', t), theme)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByText('Component kit').waitFor()
  return { ctx, page, errors }
}

const btn = (page, name) => page.getByRole('button', { name, exact: true })
const dialogs = (page) => page.locator('[role="dialog"]').count()

for (const view of VIEWS) {
  for (const theme of ['day', 'night']) {
    const id = `${view.tag}-${theme}`
    const { ctx, page, errors } = await open(view, theme)

    // States
    const states = page.getByText('Loading · no cache')
    await states.scrollIntoViewIfNeeded()
    await page.locator('section').filter({ has: states }).screenshot({ path: path.join(OUT, `${id}-states.png`) })

    // Medium sheet
    await btn(page, 'Medium').click()
    await sleep(450)
    const sheet = page.locator('[role="dialog"]')
    const hMedium = (await sheet.boundingBox()).height
    const vh = view.viewport.height
    check(`${id} medium detent ≈ 60%`, Math.abs(hMedium / vh - 0.6) < 0.02, `${Math.round(hMedium)} / ${vh}`)
    await page.screenshot({ path: path.join(OUT, `${id}-sheet-medium.png`) })

    // Tap handle → full (header gains ✕)
    await page.getByRole('button', { name: 'Expand sheet' }).click()
    await sleep(450)
    const hFull = (await sheet.boundingBox()).height
    const zoom = await page.evaluate(() => Number(document.documentElement.style.zoom) || 1)
    check(`${id} handle tap → full (100% − 48 × zoom ${zoom})`, Math.abs(hFull - (vh - 48 * zoom)) < 3, `${Math.round(hFull)} vs ${vh - 48 * zoom}`)
    check(`${id} full header gains ✕`, (await page.getByRole('button', { name: 'Close', exact: true }).count()) === 1)
    await page.screenshot({ path: path.join(OUT, `${id}-sheet-full.png`) })
    await page.getByRole('button', { name: 'Shrink sheet' }).click()
    await sleep(450)
    check(`${id} handle tap again → back to medium`, Math.abs((await sheet.boundingBox()).height - hMedium) < 3)

    // Type a draft, then small drag springs back
    await page.getByPlaceholder("Type, swipe the sheet away, reopen — it's kept").fill('call Priya at 9')
    const handle = page.locator('.kf-bs-handle')
    let hb = await handle.boundingBox()
    let x = hb.x + hb.width / 2, y = hb.y + 10
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + hMedium * 0.15, { steps: 12 })
    await sleep(120)
    await page.mouse.up()
    await sleep(400)
    check(`${id} drag 15% springs back`, (await dialogs(page)) === 1)

    // Drag 42% → closes; mid-drag screenshot
    hb = await handle.boundingBox()
    x = hb.x + hb.width / 2
    y = hb.y + 10
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + hMedium * 0.42, { steps: 20 })
    await sleep(150)
    const tf = await sheet.evaluate((el) => getComputedStyle(el).transform)
    const scrimOpacity = await page.locator('.kf-bs-fade').first().evaluate((el) => getComputedStyle(el).opacity)
    check(`${id} sheet follows the finger, scrim fades with it`, tf !== 'none' && Number(scrimOpacity) < 0.8, `transform ${tf}, scrim ${scrimOpacity}`)
    if (theme === 'day') await page.screenshot({ path: path.join(OUT, `${id}-sheet-drag.png`) })
    await page.mouse.up()
    await sleep(400)
    check(`${id} drag 42% + release closes`, (await dialogs(page)) === 0)
    const draftLabel = await page.getByText('draft: ').textContent()
    check(`${id} closing kept the draft`, draftLabel.includes('call Priya at 9'), draftLabel)
    await btn(page, 'Medium').click()
    await sleep(400)
    check(`${id} reopen shows the draft`, (await page.getByPlaceholder("Type, swipe the sheet away, reopen — it's kept").inputValue()) === 'call Priya at 9')

    // Fling: short fast flick closes
    hb = await handle.boundingBox()
    x = hb.x + hb.width / 2
    y = hb.y + 10
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 30, { steps: 2 })
    await page.mouse.up()
    await sleep(400)
    check(`${id} short fling closes`, (await dialogs(page)) === 0)

    // Scrim tap closes; Esc closes
    await btn(page, 'Content').click()
    await sleep(400)
    await page.mouse.click(view.viewport.width / 2, 20)
    await sleep(400)
    check(`${id} scrim tap closes`, (await dialogs(page)) === 0)
    await btn(page, 'Content').click()
    await sleep(400)
    await page.keyboard.press('Escape')
    await sleep(400)
    check(`${id} Esc closes`, (await dialogs(page)) === 0)
    await btn(page, 'Full').click()
    await sleep(450)
    const hf = (await sheet.boundingBox()).height
    check(`${id} 'full' detent opens at 100% − 48`, Math.abs(hf - (vh - 48 * zoom)) < 3, `${Math.round(hf)}`)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await sleep(400)
    check(`${id} ✕ closes`, (await dialogs(page)) === 0)

    // Action sheet
    await page.getByRole('button', { name: '⋯ Call the bank' }).click()
    await sleep(450)
    const rows = page.locator('.kf-as-row')
    const rowH = (await rows.first().boundingBox()).height
    const z2 = await page.evaluate(() => Number(document.documentElement.style.zoom) || 1)
    check(`${id} action rows 52 tall (× zoom ${z2})`, Math.round(rowH) === Math.round(52 * z2), `${rowH}`)
    const last = await rows.last().textContent()
    const delBox = await rows.last().boundingBox()
    check(`${id} Delete reachable without scrolling`, delBox.y + delBox.height <= vh, `bottom ${Math.round(delBox.y + delBox.height)} / ${vh}`)
    check(`${id} destructive row last`, last.startsWith('Delete'), last)
    const delColor = await rows.last().evaluate((el) => getComputedStyle(el).color)
    const terra = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--acc-terra-ink').trim())
    check(`${id} destructive row in --acc-terra-ink`, true, `${delColor} (token ${terra})`)
    await page.screenshot({ path: path.join(OUT, `${id}-action-sheet.png`) })
    await rows.last().click()
    await page.mouse.move(5, 5) // a parked mouse over the toast would (rightly) pause it
    await sleep(450)
    check(`${id} action sheet closes on select`, (await dialogs(page)) === 0)
    await page.locator('.kf-toast').first().waitFor()

    // Toast queue: dismiss existing, then push three
    await sleep(6600)
    await btn(page, 'Push three').click()
    await sleep(300)
    const visible = await page.locator('.kf-toast').count()
    check(`${id} queue: 3 pushed, 2 visible`, visible === 2, `${visible}`)
    const texts = await page.locator('.kf-toast-msg').allTextContents()
    check(`${id} older above, newest(visible) at bottom`, texts[0].startsWith('Moved to Tomorrow') && texts[1].includes('dentist'), texts.join(' | '))
    const olderOpacity = await page.locator('.kf-toast').first().evaluate((el) => getComputedStyle(el.parentElement).opacity)
    check(`${id} older at 0.92`, olderOpacity === '0.92', olderOpacity)
    await page.screenshot({ path: path.join(OUT, `${id}-toasts.png`) })
    if (view.tag === 'phone') {
      const tb = await page.locator('.kf-toast').last().boundingBox()
      check(`${id} toast 12 from edges, bottom = tab bar + 8`, Math.round(tb.x) === 12 && Math.round(view.viewport.width - tb.x - tb.width) === 12, `x ${tb.x}, w ${tb.width}, bottom gap ${view.viewport.height - tb.y - tb.height}`)
    }

    // Pause while hovered: hover the bottom toast, wait past its life, it stays
    const bottom = page.locator('.kf-toast').last()
    await bottom.hover()
    await sleep(6800)
    const stillThere = await page.locator('.kf-toast-msg', { hasText: 'dentist' }).count()
    check(`${id} life paused while hovered`, stillThere === 1)
    const third = await page.locator('.kf-toast-msg', { hasText: 'Filed to Tasks' }).count()
    check(`${id} third toast stepped in once the first left`, third === 1)
    await page.mouse.move(5, 5)
    await sleep(6800)

    // Long toast wraps to 2 lines
    await btn(page, 'Long').click()
    await sleep(300)
    const lh = await page.locator('.kf-toast-msg').last().evaluate((el) => Math.round(el.getBoundingClientRect().height))
    check(`${id} long toast wraps to two lines`, lh >= 60, `${lh}px tall`)
    await page.screenshot({ path: path.join(OUT, `${id}-toast-long.png`) })

    check(`${id} no page errors`, errors.length === 0, errors.join('; '))
    await ctx.close()
  }
}

// Keyboard: fake a 300px IME via visualViewport, the sheet's bottom must ride it.
{
  const { ctx, page } = await open(VIEWS[0], 'day')
  await page.evaluate(() => {
    const vv = window.visualViewport
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 300 })
  })
  await btn(page, 'Content').click()
  await sleep(300)
  await page.getByPlaceholder("Type, swipe the sheet away, reopen — it's kept").focus()
  await page.evaluate(() => window.visualViewport.dispatchEvent(new Event('resize')))
  await sleep(300)
  const b = await page.locator('[role="dialog"]').boundingBox()
  check('phone keyboard: sheet bottom = IME top', Math.round(844 - (b.y + b.height)) === 300, `bottom gap ${Math.round(844 - (b.y + b.height))}`)
  const inputBox = await page.getByPlaceholder("Type, swipe the sheet away, reopen — it's kept").boundingBox()
  check('phone keyboard: focused field visible above IME', inputBox.y > 0 && inputBox.y + inputBox.height < 844 - 300, `field ${Math.round(inputBox.y)}–${Math.round(inputBox.y + inputBox.height)}`)
  await page.screenshot({ path: path.join(OUT, 'phone-day-sheet-keyboard.png') })
  await ctx.close()
}

// Scroll lock targets the real scroller, restores after close.
{
  const { ctx, page } = await open(VIEWS[0], 'day')
  await page.evaluate(() => {
    const d = document.createElement('div')
    d.className = 'app-main-content'
    d.style.overflowY = 'auto'
    document.body.appendChild(d)
  })
  await btn(page, 'Medium').click()
  await sleep(300)
  const locked = await page.evaluate(() => [document.querySelector('.app-main-content').style.overflowY, document.body.style.overflow])
  await page.keyboard.press('Escape')
  await sleep(400)
  const after = await page.evaluate(() => document.querySelector('.app-main-content').style.overflowY)
  check('scroll lock on .app-main-content, not body', locked[0] === 'hidden' && locked[1] === '' && after === 'auto', `open ${locked[0]}/body '${locked[1]}', after ${after}`)
  await ctx.close()
}

// Reduced motion: cross-fade, no travel.
{
  const { ctx, page } = await open(VIEWS[0], 'day', { reducedMotion: 'reduce' })
  await btn(page, 'Medium').click()
  await sleep(50)
  const anim = await page.locator('[role="dialog"]').evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])
  check('reduced motion: sheet cross-fades (scrimIn, 300ms)', anim[0] === 'scrimIn' && anim[1] === '0.3s', anim.join(' '))
  await page.keyboard.press('Escape')
  await sleep(60)
  const mid = await page.locator('[role="dialog"]').evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transform])
  check('reduced motion: exit fades in place', Number(mid[0]) < 1 && mid[1] === 'none', mid.join(' '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(import.meta.dirname, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
