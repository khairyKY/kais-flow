// Routines 2 (Kai 2026-10-12, "build the unbuilt designs"): Routines.dc.html 2a/2b — per-step minutes
// + "N min total", step reorder (drag on a computer, hold-and-drag on a phone, ⠿ menu + keyboard as
// the tap path), the five-species plant picker, and the species drawn on the garden card + trellis.
// The REAL app, signed in against a MOCKED backend (the edit-after-create recipe): the dev server
// runs with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, and
// Playwright answers every REST call; writes are answered 201 and recorded, so each check asserts the
// row the outbox actually sent. Desktop 1280×800 + phone 390×844, day + night; side-by-side with the
// export's 2a/2b (design-export/Routines.dc.html, rendered from file://).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const OUT = process.argv[2] ?? HERE
const BASE = process.argv[3] ?? 'http://localhost:5259'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const DESIGN = pathToFileURL(path.resolve(HERE, '../../../../design-export/Routines.dc.html')).href
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data: today on the user's clock (Cairo), and N days back ──
const cairoKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const daysAgo = (n) => cairoKey(new Date(Date.now() - n * 86400000))
const T = '2026-09-01T09:00:00Z'
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HEALTH = { id: id('4', 1), user_id: UID, name: 'Health', color: 'var(--acc-hydrangea)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const DAILY = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const base = { user_id: UID, clock_time: null, cadence: DAILY, challenge_start: null, challenge_end: null, active: true, domain_id: null, goal_days: null, created_at: T, updated_at: T }
// A row cached before 0067 (no `plant`) with one old string step and one timed step.
const STRETCH = { ...base, id: id('7', 1), name: 'Stretch', time_of_day: 'evening', steps: ['Neck rolls', { text: 'Hamstrings & hips', minutes: 3 }] }
const READ = { ...base, id: id('7', 2), name: 'Read', time_of_day: 'evening', steps: [], plant: 'cherry' }
const JOURNAL = { ...base, id: id('7', 3), name: 'Journal', time_of_day: 'morning', steps: [], plant: 'fern' }
const WATER = { ...base, id: id('7', 4), name: 'Water the plants', time_of_day: 'morning', steps: [], plant: 'clover' }
const WALK = { ...base, id: id('7', 5), name: 'Walk', time_of_day: 'afternoon', steps: [], plant: 'daisy' }
const done = (r, n) => Array.from({ length: n }, (_, i) => ({ id: id('9', r.id.slice(-2) * 100 + i), user_id: UID, routine_id: r.id, completed_on: daysAgo(i + 1), created_at: T }))
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }
const tables = () => ({
  tasks: [], projects: [], areas: [], domains: [HEALTH], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [],
  activity_log: [], time_entries: [], people: [], interactions: [],
  routines: [STRETCH, READ, JOURNAL, WATER, WALK],
  routine_completions: [...done(READ, 8), ...done(JOURNAL, 2), ...done(WATER, 31), ...done(WALK, 12)],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESK = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }

async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? DESK, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0' })) // no "Updated to" toast over the shots
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name, el) => (el ? el.screenshot({ path: path.join(OUT, `${name}.png`) }) : page.screenshot({ path: path.join(OUT, `${name}.png`) }))
const sent = async (state, table) => {
  await sleep(700) // the outbox flushes on the next tick
  return state.writes.filter((w) => w.table === table && w.method === 'POST').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))
}
const last = (rows) => rows[rows.length - 1]
const stepTexts = (page) => page.locator('input[data-step-text]').evaluateAll((els) => els.map((e) => e.value))
const stepMinutes = (page) => page.locator('input[aria-label^="Minutes for step"]').evaluateAll((els) => els.map((e) => e.value))
async function block(fn) {
  try { await fn() } catch (e) { check(`(threw) ${e.message.split('\n')[0]}`, false) }
}

/** Fill the form with the export's own sample (2a/2b): Evening stretch, three timed steps, Evening, Custom M/W/F. */
async function fillSample(page, phone) {
  await page.locator('input[placeholder="Evening stretch"]').fill('Evening stretch')
  const steps = [['Neck & shoulder rolls', '2'], ['Hamstrings & hips', '3'], ['Slow breathing, lights low', '5']]
  for (const [i, [text, min]] of steps.entries()) {
    await page.getByRole('button', { name: phone ? '＋ Add step' : '＋ Add a step' }).click()
    await page.locator(`input[data-step-text="${i}"]`).fill(text)
    await page.getByRole('textbox', { name: `Minutes for step ${i + 1}` }).fill(min)
  }
  const card = formCard(page, phone)
  await card.getByText(phone ? 'Eve' : 'Evening', { exact: true }).click()
  await card.getByText('Custom', { exact: true }).click()
  for (const d of ['M', 'W', 'F']) await card.getByText(d, { exact: true }).first().click()
  if (phone) return // 2b draws no reminder / challenge / domain
  await card.getByRole('switch', { name: 'Remind me' }).click()
  await card.getByRole('checkbox').click() // Challenge (optional) · 30 day streak
  await card.getByRole('button', { name: 'Domain' }).click()
  await page.getByRole('option', { name: 'Health' }).click()
}
const formCard = (page, phone) => (phone ? page.locator('[role="dialog"]').last() : page.locator('.kf-overlay-card'))
/** The whole form in two viewport shots: as it opens (-a), then scrolled to its end (-b, the plant picker). */
async function formShots(page, phone, name) {
  const scroll = (to) => formCard(page, phone).evaluate((card, end) => {
    const box = [card, ...card.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY))
    if (box) box.scrollTop = end ? box.scrollHeight : 0
  }, to)
  await scroll(false)
  await sleep(150)
  await shot(page, `${name}-a`)
  await scroll(true)
  await sleep(150)
  await shot(page, `${name}-b`)
  await scroll(false)
}

// ── 0. The export's 2a / 2b, for the side-by-sides ──
await block(async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(`${DESIGN}#2a`, { waitUntil: 'load' })
  await sleep(1200)
  await shot(page, 'design-2a', page.locator('[id="2a"] .dv-card'))
  await shot(page, 'design-2b', page.locator('[id="2b"] .phone'))
  check('export 2a/2b rendered for the side-by-side', fs.existsSync(path.join(OUT, 'design-2a.png')) && fs.existsSync(path.join(OUT, 'design-2b.png')))
  await ctx.close()
})

// ── 1. Desktop: plant a routine with minutes, reorder three ways, a species ──
await block(async () => {
  const { ctx, page, errors, state } = await open('/routines')
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await sleep(300)
  await fillSample(page, false)
  check('desktop: "10 min total" under the steps (2a)', await page.getByText('10 min total', { exact: true }).isVisible())
  check('desktop: the picker lists the five species, Vine chosen', JSON.stringify(await page.getByRole('radio').allInnerTexts()) === JSON.stringify(['VINE', 'CHERRY', 'FERN', 'CLOVER', 'DAISY']) && (await page.getByRole('radio', { name: 'Vine' }).getAttribute('aria-checked')) === 'true', JSON.stringify(await page.getByRole('radio').allInnerTexts()))
  await formShots(page, false, '2a-app-desktop-day')

  // drag: step 3's ⠿ onto step 1
  const from = await page.locator('[data-step-handle="2"]').boundingBox()
  const to = await page.locator('[data-step-handle="0"]').boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y) * i) / 12, { steps: 2 })
  await sleep(150)
  await shot(page, '1-drag-in-flight-desktop') // a viewport shot: an element shot taller than the window resizes it, which cancels a drag
  await page.mouse.up()
  await sleep(250)
  let order = await stepTexts(page)
  check('desktop: dragging step 3 by its ⠿ onto step 1 moves it to the top', JSON.stringify(order) === JSON.stringify(['Slow breathing, lights low', 'Neck & shoulder rolls', 'Hamstrings & hips']), JSON.stringify(order))
  check('desktop: a step keeps its minutes when it moves', JSON.stringify(await stepMinutes(page)) === JSON.stringify(['5', '2', '3']), JSON.stringify(await stepMinutes(page)))
  check('desktop: the drop opened no menu', (await page.locator('[role="menu"]').count()) === 0)

  // keyboard: ↓ on the first ⠿, focus follows the step
  await page.locator('[data-step-handle="0"]').focus()
  await page.keyboard.press('ArrowDown')
  await sleep(150)
  order = await stepTexts(page)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-step-handle'))
  check('desktop: ↓ on a ⠿ moves the step down, focus follows it', order[1] === 'Slow breathing, lights low' && focused === '1', `${JSON.stringify(order)} focus=${focused}`)
  // Alt+↑ in the step's own text moves it back
  await page.locator('input[data-step-text="1"]').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await sleep(150)
  order = await stepTexts(page)
  check('desktop: Alt+↑ in a step moves it up', order[0] === 'Slow breathing, lights low', JSON.stringify(order))

  // the tap path: click the ⠿ → Move up / Move down / Remove step
  await page.locator('[data-step-handle="0"]').click()
  await sleep(200)
  const items = await page.locator('[role="menu"] button').allInnerTexts()
  check('desktop: clicking the ⠿ opens Move down / Remove step (no Move up on the first)', JSON.stringify(items.map((s) => s.trim())) === JSON.stringify(['Move down', 'Remove step']), JSON.stringify(items))
  await shot(page, '1-step-menu-desktop') // viewport: the menu is portaled outside the card, and a resize closes it
  await page.locator('[role="menu"] button', { hasText: 'Move down' }).click()
  await sleep(150)
  order = await stepTexts(page)
  check('desktop: Move down from the ⠿ menu', JSON.stringify(order) === JSON.stringify(['Neck & shoulder rolls', 'Slow breathing, lights low', 'Hamstrings & hips']), JSON.stringify(order))

  // species
  await page.getByRole('radio', { name: 'Cherry' }).click()
  const head = await formCard(page, false).locator('img').first().getAttribute('src')
  check('desktop: picking Cherry draws a cherry in the header and on Plant routine', /cherry\/opening/.test(head) && /cherry\/opening/.test(await page.getByRole('button', { name: /Plant routine/ }).locator('img').getAttribute('src')), head)
  await shot(page, '1-cherry-picked-desktop', formCard(page, false))
  await page.getByRole('button', { name: /Plant routine/ }).click()
  const row = last(await sent(state, 'routines'))
  check('desktop: the planted row carries the steps in order with minutes, and plant = cherry',
    row?.name === 'Evening stretch' && row?.plant === 'cherry' && JSON.stringify(row?.steps) === JSON.stringify([{ text: 'Neck & shoulder rolls', minutes: 2 }, { text: 'Slow breathing, lights low', minutes: 5 }, { text: 'Hamstrings & hips', minutes: 3 }]) && row?.time_of_day === 'evening' && JSON.stringify(row?.cadence) === JSON.stringify({ weekdays: [1, 3, 5] }),
    JSON.stringify(row))
  check('desktop create: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// ── 2. Desktop: edit an old row (string step, no plant) — minutes + a species ──
await block(async () => {
  const { ctx, page, errors, state } = await open('/routines')
  await page.getByRole('button', { name: 'Stretch', exact: true }).click()
  await sleep(300)
  check('edit: old string step + timed step prefill', JSON.stringify(await stepTexts(page)) === JSON.stringify(['Neck rolls', 'Hamstrings & hips']) && JSON.stringify(await stepMinutes(page)) === JSON.stringify(['', '3']), JSON.stringify([await stepTexts(page), await stepMinutes(page)]))
  check('edit: a routine from before 0067 opens on Vine', (await page.getByRole('radio', { name: 'Vine' }).getAttribute('aria-checked')) === 'true')
  check('edit: "3 min total"', await page.getByText('3 min total', { exact: true }).isVisible())
  await page.getByRole('textbox', { name: 'Minutes for step 1' }).fill('4')
  check('edit: the total follows ("7 min total")', await page.getByText('7 min total', { exact: true }).isVisible())
  await page.getByRole('radio', { name: 'Fern' }).click()
  await shot(page, '2-edit-desktop', formCard(page, false))
  await page.getByRole('button', { name: /Save routine/ }).click()
  const row = last(await sent(state, 'routines'))
  check('edit: saves over the same row — minutes on the old step, plant = fern, the rest kept',
    row?.id === STRETCH.id && row?.plant === 'fern' && JSON.stringify(row?.steps) === JSON.stringify([{ text: 'Neck rolls', minutes: 4 }, { text: 'Hamstrings & hips', minutes: 3 }]) && row?.time_of_day === 'evening' && row?.name === 'Stretch',
    JSON.stringify(row))
  check('desktop edit: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// ── 3. Rendering: each routine's own species on the garden card and the trellis; the steps fold ──
for (const theme of ['day', 'night']) {
  await block(async () => {
    const { ctx, page, errors } = await open('/routines', { theme })
    const srcs = await page.locator('img[src*="/ds/assets/"]').evaluateAll((els) => els.map((e) => e.getAttribute('src')))
    if (theme === 'day') {
      // Stretch: no completions → bare vine; Read 8 days → cherry bloom; Journal 2 → fern unfurl1;
      // Water 31 → clover four_leaf; Walk 12 → daisy midday.
      const want = ['vine/bare', 'cherry/bloom', 'fern/unfurl1', 'clover/four_leaf', 'daisy/midday']
      check('garden cards draw each routine\'s own species at its streak stage', want.every((w) => srcs.some((s) => s.includes(w))), JSON.stringify(srcs.filter((s) => !/lush|leaf-/.test(s))))
      await page.getByRole('button', { name: /2 steps · 3 min/ }).click()
      await sleep(200)
      check('the steps fold under the row: "2 steps · 3 min", each step with its minutes', (await page.getByText('3 min', { exact: true }).count()) === 1 && (await page.getByText('Neck rolls', { exact: true }).isVisible()), '')
    } else {
      await page.getByRole('button', { name: /2 steps · 3 min/ }).click()
      await sleep(200)
    }
    await shot(page, `3-routines-desktop-${theme}`)
    // the trellis of a cherry routine
    await page.getByRole('button', { name: 'More for Read' }).click()
    await page.getByText('Streak trellis', { exact: true }).click()
    await sleep(400)
    const tsrcs = await page.locator('img[src*="/ds/assets/"]').evaluateAll((els) => els.map((e) => e.getAttribute('src')))
    if (theme === 'day') {
      check('trellis: a cherry routine is headed by its cherry at its stage and grows cherry marks', tsrcs.filter((s) => s.includes('cherry/bloom')).length >= 8 && !tsrcs.some((s) => s.includes('vine/leaf-')), JSON.stringify([...new Set(tsrcs)]))
      check('trellis caption names the cherry', await page.getByText(/the cherry kept growing|the cherry held on|the cherry started over/).isVisible())
    }
    await shot(page, `3-trellis-cherry-desktop-${theme}`)
    check(`routines desktop ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  })
}

// ── 4. Phone: the 2b sheet, hold-and-drag, the ⠿ sheet, plant ──
await block(async () => {
  const { ctx, page, errors, state } = await open('/routines', { view: PHONE })
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await sleep(500)
  await fillSample(page, true)
  check('phone: the label carries the total — "Steps · 10 min total" (2b)', await page.getByText('Steps · 10 min total', { exact: true }).isVisible())
  check('phone: minutes read "2m" (2b) and no ✕ on the rows', (await page.getByText('m', { exact: true }).count()) >= 3 && (await page.getByRole('button', { name: /^Remove step/ }).count()) === 0)
  const tiles = await page.getByRole('radio').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right] }))
  check('phone: all five plant tiles fit at 390 (no scroll)', tiles.length === 5 && tiles[4][1] <= 390 - 16, JSON.stringify(tiles))
  await formShots(page, true, '2b-app-phone-day')

  // hold-and-drag (real touch events): hold step 3's ⠿, then move it onto step 1
  const cdp = await ctx.newCDPSession(page)
  const from = await page.locator('[data-step-handle="2"]').boundingBox()
  const to = await page.locator('[data-step-handle="0"]').boundingBox()
  const pt = (y) => [{ x: Math.round(from.x + from.width / 2), y: Math.round(y) }]
  const y0 = from.y + from.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y0) })
  await sleep(450) // past the 250ms hold
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y0 + ((to.y - from.y) * i) / 12) })
    await sleep(25)
  }
  await sleep(120)
  await shot(page, '4-hold-drag-in-flight-phone')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(300)
  let order = await stepTexts(page)
  check('phone: hold-and-drag moves step 3 to the top', JSON.stringify(order) === JSON.stringify(['Slow breathing, lights low', 'Neck & shoulder rolls', 'Hamstrings & hips']), JSON.stringify(order))
  check('phone: the drag opened no sheet', (await page.getByText('Move down', { exact: true }).count()) === 0)

  // a quick swipe over the ⠿ (no hold) doesn't drag
  const s0 = await page.locator('[data-step-handle="1"]').boundingBox()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(s0.x + 8), y: Math.round(s0.y + 10) }] })
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(s0.x + 8), y: Math.round(s0.y + 10 + i * 12) }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(250)
  check('phone: a quick swipe over the ⠿ moves nothing', JSON.stringify(await stepTexts(page)) === JSON.stringify(order), JSON.stringify(await stepTexts(page)))

  // the tap path: tap the ⠿ → the step's sheet
  await page.locator('[data-step-handle="1"]').tap()
  await sleep(500)
  const sheetRows = await page.locator('.kf-as-row').allInnerTexts()
  check('phone: tapping the ⠿ opens Move up / Move down / Remove step', JSON.stringify(sheetRows.map((s) => s.trim())) === JSON.stringify(['Move up', 'Move down', 'Remove step']), JSON.stringify(sheetRows))
  await shot(page, '4-step-sheet-phone')
  await page.locator('.kf-as-row', { hasText: 'Move up' }).tap()
  await sleep(500)
  order = await stepTexts(page)
  check('phone: Move up from the sheet', JSON.stringify(order) === JSON.stringify(['Neck & shoulder rolls', 'Slow breathing, lights low', 'Hamstrings & hips']), JSON.stringify(order))

  await page.getByRole('radio', { name: 'Daisy' }).tap()
  await page.getByRole('button', { name: /Plant routine/ }).tap()
  const row = last(await sent(state, 'routines'))
  check('phone: planted with steps in order + minutes, plant = daisy',
    row?.plant === 'daisy' && JSON.stringify(row?.steps) === JSON.stringify([{ text: 'Neck & shoulder rolls', minutes: 2 }, { text: 'Slow breathing, lights low', minutes: 5 }, { text: 'Hamstrings & hips', minutes: 3 }]),
    JSON.stringify(row))
  check('phone create: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// ── 5. Night: the same filled forms, desktop + phone; the phone page + trellis ──
for (const [view, size] of [['desktop', DESK], ['phone', PHONE]]) {
  await block(async () => {
    const phone = size === PHONE
    const { ctx, page, errors } = await open('/routines', { view: size, theme: 'night' })
    await page.getByRole('button', { name: '＋ New routine' }).click()
    await sleep(500)
    await fillSample(page, phone)
    await formShots(page, phone, `${phone ? '2b' : '2a'}-app-${view}-night`)
    check(`night ${view} form: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  })
}
for (const theme of ['day', 'night']) {
  await block(async () => {
    const { ctx, page, errors } = await open('/routines', { view: PHONE, theme })
    await page.getByRole('button', { name: /2 steps · 3 min/ }).tap()
    await sleep(200)
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, `5-routines-phone-${theme}`)
    await page.locator('.app-main-content, main').first().evaluate((el) => el.scrollIntoView({ block: 'end' })).catch(() => {})
    await page.getByText('The garden', { exact: true }).scrollIntoViewIfNeeded()
    await sleep(200)
    await shot(page, `5-garden-phone-${theme}`)
    await page.getByRole('button', { name: 'More for Water the plants' }).tap()
    await sleep(400)
    await page.locator('.kf-as-row', { hasText: 'Streak trellis' }).tap()
    await sleep(600)
    await shot(page, `5-trellis-clover-phone-${theme}`)
    check(`routines phone ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  })
}

// ── 6. Today: its routine rail (Today.dc.html draws names + boxes, no plant, no steps) still renders ──
for (const [view, size] of [['desktop', DESK], ['phone', PHONE]]) {
  await block(async () => {
    const { ctx, page, errors } = await open('/today', { view: size })
    check(`today ${view}: the routine rail lists today's routines`, (await page.getByText(/^(Journal|Read|Walk)$/).count()) > 0, '') // the phone shows this part of the day's
    await shot(page, `6-today-${view}-day`)
    check(`today ${view}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  })
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
