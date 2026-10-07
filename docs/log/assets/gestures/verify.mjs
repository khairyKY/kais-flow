// Behaviour + visual check of the one task-row grammar on the dev-only /design-system route
// (KitGesturesDemo: the real SwipeRow, useRowGrammar → TaskMenu, and BulkBar over sample rows).
// Touch is real CDP touch input (Input.dispatchTouchEvent), so touch-action / scrolling apply.
// node verify.mjs <outDir> [baseUrl]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5231'
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

// v1.0.23 (plan-replan + tasks-noise): one Plan/Replan entry replaces Tomorrow + Pick date, "Move to…", Make goal, Start focus.
const SPEC = ['Replan…', 'Move to…', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Make goal of the day', 'Start focus', 'Select', 'Delete']

async function open(view, theme) {
  const ctx = await browser.newContext({ viewport: view.viewport, hasTouch: view.touch, deviceScaleFactor: 1 })
  await ctx.addInitScript((t) => {
    localStorage.setItem('kf_theme', t)
    window.__buzz = 0
    Object.defineProperty(navigator, 'vibrate', { value: () => { window.__buzz++; return true }, configurable: true })
  }, theme)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/design-system`, { waitUntil: 'networkidle' })
  await page.getByText('Task row grammar').waitFor()
  const cdp = view.touch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors }
}

const demo = (page) => page.locator('[data-gesture-demo]')
const row = (page, n) => page.locator(`#task-demo-${n}`)
const fgX = (page, n) => row(page, n).locator('.kf-swipe-fg').evaluate((e) => {
  const m = /translateX\((-?[\d.]+)px\)/.exec(e.style.transform)
  return m ? Number(m[1]) : 0
})
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
async function center(page) {
  await demo(page).evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(250)
}

/** A finger on row n: down at `fromX`, moves by (dx, dy) in `steps`, optionally rests, then lifts. */
async function swipe(page, cdp, n, dx, { dy = 0, steps = 16, rest = 150, fromX = 60, during } = {}) {
  const b = await row(page, n).boundingBox()
  const x0 = b.x + fromX
  const y0 = b.y + Math.min(b.height / 2, 30)
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: x0, y: y0 }])
  for (let i = 1; i <= steps; i++) {
    await t('touchMove', [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }])
    await sleep(16)
  }
  if (rest) await sleep(rest)
  if (during) await during()
  await t('touchEnd', [])
  await sleep(320)
}
async function hold(page, cdp, n, ms = 480) {
  const b = await row(page, n).boundingBox()
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + 120, y: b.y + 20 }])
  await sleep(ms)
  await t('touchEnd', [])
  await sleep(250)
}
async function tap(page, cdp, locator) {
  const b = await locator.boundingBox()
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await t('touchEnd', [])
  await sleep(300)
}

// ── Phone: 390 × 844, touch ──
for (const theme of ['day', 'night']) {
  const id = `phone-${theme}`
  const { ctx, page, cdp, errors } = await open({ viewport: { width: 390, height: 844 }, touch: true }, theme)
  await center(page)
  await demo(page).screenshot({ path: path.join(OUT, `${id}-rows.png`) })

  // Swipe right, under the line → rests open on Tomorrow · Pick date · Project
  let outerTransform = ''
  await swipe(page, cdp, 3, 120, { during: async () => { outerTransform = await row(page, 3).evaluate((e) => getComputedStyle(e).transform) } })
  check(`${id} no transform on the row while it is swiped`, outerTransform === 'none', outerTransform)
  // Headless touch never sets :active, so force it (DevTools' own :active toggle): a bare .kf-lift
  // presses to 0.97, a swipeable row must not.
  const forcedActive = async (selector) => {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    await sleep(200)
    const tr = await page.locator(selector).evaluate((e) => getComputedStyle(e).transform)
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    return tr
  }
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="lift-control" class="kf-lift">x</div>'))
  const control = await forcedActive('#lift-control')
  const pressed = await forcedActive('#task-demo-2')
  check(`${id} pressed row: no scale(0.97) shrink (a bare .kf-lift does shrink)`, pressed === 'none' && /^matrix\(0\.97/.test(control), `row ${pressed}, control ${control}`)
  check(`${id} swipe right under 40% rests open at 196`, (await fgX(page, 3)) === 196, String(await fgX(page, 3)))
  const acts = row(page, 3).locator('.kf-swipe-act')
  check(`${id} partial reveal = Tomorrow · Plan · Move`, JSON.stringify(await acts.allInnerTexts()) === JSON.stringify(['Tomorrow', 'Plan', 'Move']), JSON.stringify(await acts.allInnerTexts()))
  const fs12 = await acts.first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  check(`${id} action labels ≥ 12px`, fs12 >= 12, `${fs12}px`)
  const bg = await row(page, 3).locator('.kf-swipe-bg').evaluate((e) => getComputedStyle(e).backgroundColor)
  const want = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--swipe-right-bg)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c })
  check(`${id} right layer is --swipe-right-bg`, bg === want, `${bg} vs ${want}`)
  await page.screenshot({ path: path.join(OUT, `${id}-swipe-right-partial.png`) })

  // Opening another row closes this one
  await swipe(page, cdp, 4, -70)
  check(`${id} opening one row closes the other`, (await fgX(page, 3)) === 0 && (await fgX(page, 4)) === -96, `row3 ${await fgX(page, 3)}, row4 ${await fgX(page, 4)}`)
  check(`${id} swipe left under the line rests on Delete (96)`, (await row(page, 4).locator('.kf-swipe-act.is-delete').count()) === 1)
  await page.screenshot({ path: path.join(OUT, `${id}-swipe-left-partial.png`) })
  // A tap on the open row closes it and does not open the task
  const before = (await toasts(page)).length
  await tap(page, cdp, row(page, 4).locator('.kf-swipe-fg'))
  check(`${id} tap on an open row closes it (no open)`, (await fgX(page, 4)) === 0 && (await toasts(page)).length === before)

  // Under threshold springs back
  await swipe(page, cdp, 5, 40)
  check(`${id} a short swipe springs back`, (await fgX(page, 5)) === 0)

  // Right past the line: one-action layer, haptic, commit → Tomorrow 09:00 + Undo
  const buzz0 = await page.evaluate(() => window.__buzz)
  let commitText = ''
  await swipe(page, cdp, 3, 260, {
    fromX: 30,
    during: async () => {
      commitText = await row(page, 3).locator('.kf-swipe-commit').innerText().catch(() => '')
      await page.screenshot({ path: path.join(OUT, `${id}-swipe-right-past-line.png`) })
    },
  })
  check(`${id} past 40%: "Tomorrow · <day> 09:00"`, /^Tomorrow\s+[A-Z]{3} 09:00$/i.test(commitText.replace(/\n/g, ' ').trim()), JSON.stringify(commitText))
  // Haptics are native-only since lib/haptics (the web has no tick), so nothing to count here.
  void buzz0
  await sleep(300)
  check(`${id} commit toasts "Moved to tomorrow" + Undo`, (await toasts(page)).includes('Moved to tomorrow') && (await page.getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(await toasts(page)))
  check(`${id} one toast host (no double toast)`, (await page.locator('.kf-toast-msg', { hasText: 'Moved to tomorrow' }).count()) === 1)
  const meta3 = await row(page, 3).innerText()
  check(`${id} row now reads Tomorrow 09:00`, /TOMORROW 09:00/i.test(meta3), meta3.replace(/\n/g, ' | '))
  await page.screenshot({ path: path.join(OUT, `${id}-tomorrow-toast.png`) })
  await tap(page, cdp, page.locator('.kf-toast', { hasText: 'Moved to tomorrow' }).getByRole('button', { name: 'Undo' }))
  check(`${id} Undo puts the date back`, !/TOMORROW/i.test(await row(page, 3).innerText()))

  // Left past the line: collapse → "Moved to Trash" + Undo, no confirm
  await swipe(page, cdp, 5, -220, { fromX: 300, during: async () => page.screenshot({ path: path.join(OUT, `${id}-swipe-left-past-line.png`) }) })
  await sleep(500)
  check(`${id} delete commit: row gone, no confirm dialog`, (await row(page, 5).count()) === 0 && (await page.locator('[role="dialog"]').count()) === 0)
  check(`${id} toast "Moved to Trash" + Undo`, (await toasts(page)).includes('Moved to Trash'), JSON.stringify(await toasts(page)))
  await page.screenshot({ path: path.join(OUT, `${id}-trash-toast.png`) })
  await tap(page, cdp, page.locator('.kf-toast', { hasText: 'Moved to Trash' }).getByRole('button', { name: 'Undo' }))
  check(`${id} Undo brings the row back`, (await row(page, 5).count()) === 1)

  // Vertical scroll wins over a little sideways drift
  const scroll0 = await page.evaluate(() => window.scrollY)
  await swipe(page, cdp, 2, 7, { dy: -140, rest: 0, steps: 10, during: async () => check(`${id} vertical drag with 7px drift never moves the row`, (await fgX(page, 2)) === 0) })
  const scroll1 = await page.evaluate(() => window.scrollY)
  check(`${id} …and the page scrolls`, scroll1 > scroll0, `${scroll0} → ${scroll1}`)
  await center(page)

  // Under a 125% interface zoom the row still tracks the finger (math in CSS px)
  await page.evaluate(() => { document.documentElement.style.zoom = '1.25' })
  await center(page)
  let zx = 0
  await swipe(page, cdp, 2, 100, { rest: 120, during: async () => { zx = await fgX(page, 2) } })
  check(`${id} zoom 1.25: 100 screen px = 80 CSS px`, Math.abs(zx - 80) < 1, String(zx))
  await page.evaluate(() => { document.documentElement.style.zoom = '' })
  await swipe(page, cdp, 2, -150, { fromX: 250 }) // close it again (flick left from open → close)
  await center(page)

  // ⋯ → the action sheet, in MK order
  const more = row(page, 2).getByRole('button', { name: /More actions/ })
  const mb = await more.boundingBox()
  check(`${id} ⋯ is a 48 × 48 target`, Math.round(mb.width) === 48 && Math.round(mb.height) === 48, `${mb.width} × ${mb.height}`)
  await tap(page, cdp, more)
  const asRows = page.locator('.kf-as-row')
  const labels = (await asRows.allInnerTexts()).map((t) => t.split('\n')[0].trim())
  check(`${id} ⋯ sheet items in MK order`, JSON.stringify(labels) === JSON.stringify(SPEC), JSON.stringify(labels))
  const hTomorrow = await asRows.first().innerText()
  check(`${id} first entry plans (Replan… on an overdue row)`, /^(Re)?[Pp]lan…/.test(hTomorrow), hTomorrow.replace(/\n/g, ' '))
  const rowH = await asRows.first().evaluate((e) => e.getBoundingClientRect().height)
  check(`${id} sheet rows 52 tall`, Math.abs(rowH - 52) < 1, String(rowH))
  const del = asRows.last()
  const delColor = await del.evaluate((e) => getComputedStyle(e).color)
  const terra = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--acc-terra-ink)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c })
  check(`${id} Delete last, in --acc-terra-ink`, delColor === terra, `${delColor} vs ${terra}`)
  await page.screenshot({ path: path.join(OUT, `${id}-action-sheet.png`) })
  await tap(page, cdp, asRows.filter({ hasText: 'Priority' }))
  await sleep(350)
  const subLabels = (await page.locator('.kf-as-row').allInnerTexts()).map((t) => t.trim())
  check(`${id} Priority opens its own sheet`, JSON.stringify(subLabels) === JSON.stringify(['None', 'Medium', 'High', 'Critical']), JSON.stringify(subLabels))
  await tap(page, cdp, page.locator('.kf-as-row', { hasText: 'High' }))
  await sleep(400)
  check(`${id} choosing closes the sheet`, (await page.locator('[role="dialog"]').count()) === 0)

  // Hold 400ms → selection mode
  const buzz1 = await page.evaluate(() => window.__buzz)
  await hold(page, cdp, 1)
  const top = page.locator('.kf-selbar-top')
  check(`${id} hold → "1 selected" app bar`, (await top.count()) === 1 && /1 selected/.test(await top.innerText()))
  void buzz1
  const bottom = page.locator('.kf-selbar-bottom')
  check(`${id} bulk bar: Done · Tomorrow · Plan · Move · Delete`, JSON.stringify((await bottom.locator('button').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Done', 'Tomorrow', 'Plan', 'Move', 'Delete']), JSON.stringify((await bottom.locator('button').allInnerTexts()).map((t) => t.trim())))
  const covers = await page.evaluate(() => {
    const tab = document.querySelector('.app-tabbar')?.getBoundingClientRect()
    if (!tab) return 'no tab bar'
    const el = document.elementFromPoint(tab.left + 40, tab.top + tab.height / 2)
    return el?.closest('.kf-selbar-bottom') ? 'bulk' : el?.closest('.app-tabbar') ? 'tabbar' : String(el?.className)
  })
  check(`${id} bulk bar replaces the tab bar`, covers === 'bulk', covers)
  const circle = await row(page, 1).locator('.kf-select-dot').evaluate((e) => e.getBoundingClientRect().width).catch(() => 0)
  check(`${id} select circle 24`, Math.round(circle) === 24, String(circle))
  const selBg = await row(page, 1).evaluate((e) => getComputedStyle(e).backgroundColor)
  const wantSel = await page.evaluate(() => { const d = document.createElement('div'); d.style.background = 'var(--select-bg)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c })
  check(`${id} selected row wears --select-bg`, selBg === wantSel, `${selBg} vs ${wantSel}`)
  check(`${id} no ⋯ or checkbox while selecting`, (await row(page, 2).getByRole('button', { name: /More actions/ }).count()) === 0 && (await row(page, 2).locator('.kf-checkbox').count()) === 0)
  await tap(page, cdp, row(page, 3).locator('.kf-swipe-fg'))
  check(`${id} a tap adds a row: "2 selected"`, /2 selected/.test(await top.innerText()))
  await page.screenshot({ path: path.join(OUT, `${id}-selection.png`) })
  await tap(page, cdp, page.getByRole('button', { name: 'Select all' }))
  check(`${id} Select all`, /5 selected/.test(await top.innerText()))
  await tap(page, cdp, page.getByRole('button', { name: 'Clear selection' }))
  check(`${id} ✕ exits selection`, (await top.count()) === 0)
  await hold(page, cdp, 2)
  await page.keyboard.press('Escape')
  await sleep(200)
  check(`${id} Esc/Back exits selection`, (await top.count()) === 0)
  await hold(page, cdp, 2)
  await tap(page, cdp, row(page, 2).locator('.kf-swipe-fg'))
  check(`${id} deselecting the last exits`, (await top.count()) === 0)
  // Bulk Tomorrow + bulk Delete (no confirm)
  await hold(page, cdp, 1)
  await tap(page, cdp, row(page, 2).locator('.kf-swipe-fg'))
  await tap(page, cdp, bottom.getByRole('button', { name: 'Tomorrow' }))
  check(`${id} bulk Tomorrow → "2 tasks moved to tomorrow"`, (await toasts(page)).includes('2 tasks moved to tomorrow') && (await top.count()) === 0, JSON.stringify(await toasts(page)))
  await hold(page, cdp, 4)
  await tap(page, cdp, bottom.getByRole('button', { name: 'Delete' }))
  await sleep(600)
  check(`${id} bulk Delete → Trash + Undo, no confirm`, (await toasts(page)).some((t) => /moved to Trash/.test(t)) && (await page.locator('[role="dialog"]').count()) === 0, JSON.stringify(await toasts(page)))
  await page.screenshot({ path: path.join(OUT, `${id}-bulk-toasts.png`) })

  check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Desktop: 1280 × 800, mouse (the page's own 125% default zoom) ──
for (const theme of ['day', 'night']) {
  const id = `desktop-${theme}`
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 }, touch: false }, theme)
  await center(page)
  const r2 = await row(page, 2).boundingBox()
  await page.mouse.click(r2.x + 200, r2.y + 20, { button: 'right' })
  await sleep(250)
  const items = (await page.locator('[role="menuitem"]').allInnerTexts()).map((t) => t.split('\n')[0].trim())
  check(`${id} right-click = the same list, same order`, JSON.stringify(items) === JSON.stringify(SPEC), JSON.stringify(items))
  await page.screenshot({ path: path.join(OUT, `${id}-context-menu.png`) })
  await page.keyboard.press('Escape')
  await sleep(200)
  await row(page, 2).getByRole('button', { name: /More actions/ }).click()
  await sleep(250)
  const items2 = (await page.locator('[role="menuitem"]').allInnerTexts()).map((t) => t.split('\n')[0].trim())
  check(`${id} ⋯ opens the same menu`, JSON.stringify(items2) === JSON.stringify(SPEC), JSON.stringify(items2))
  // Tomorrow lives in the Plan / Replan submenu since v1.0.23.
  await page.locator('[role="menuitem"]', { hasText: /^(Re)?[Pp]lan…/ }).first().click()
  await sleep(300)
  await page.locator('.kf-as-row', { hasText: 'Tomorrow, first thing' }).first().click() // the Plan sheet / popover's rows
  await sleep(300)
  check(`${id} menu Plan → Tomorrow → toast`, (await toasts(page)).some((t) => /tomorrow/i.test(t)), JSON.stringify(await toasts(page)))
  // A mouse drag never swipes (J-1)
  const r3 = await row(page, 3).boundingBox()
  await page.mouse.move(r3.x + 100, r3.y + 20)
  await page.mouse.down()
  await page.mouse.move(r3.x + 300, r3.y + 20, { steps: 10 })
  const mx = await fgX(page, 3)
  await page.mouse.up()
  check(`${id} a mouse drag never swipes`, mx === 0, String(mx))
  // Ctrl-click selects; the pill bar carries the kit actions
  await row(page, 1).click({ modifiers: ['Control'], position: { x: 200, y: 20 } })
  await row(page, 4).click({ modifiers: ['Control'], position: { x: 200, y: 20 } })
  const pill = page.locator('.kf-bulkbar')
  check(`${id} ⌃-click selects → pill bar`, /2 selected/i.test(await pill.innerText()))
  check(`${id} pill: Done · Tomorrow · Plan · Move · Delete`, JSON.stringify((await pill.locator('.kf-bulk-act').allInnerTexts()).map((t) => t.replace('▾', '').trim()).filter(Boolean)) === JSON.stringify(['Done', 'Tomorrow', 'Plan', 'Move', 'Delete']), JSON.stringify((await pill.locator('.kf-bulk-act').allInnerTexts()).map((t) => t.replace('▾', '').trim()).filter(Boolean)))
  await page.screenshot({ path: path.join(OUT, `${id}-bulk-pill.png`) })
  await page.keyboard.press('Escape')
  await sleep(200)
  check(`${id} Esc clears the selection`, (await pill.count()) === 0)
  check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
