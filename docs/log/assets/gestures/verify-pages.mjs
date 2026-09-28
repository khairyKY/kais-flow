// The real Tasks and Today pages with the row grammar, signed in against a MOCKED backend: the dev
// server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session
// sits in localStorage, and Playwright answers every REST call with sample rows. No real account,
// token or network is involved; writes are answered 201 and go nowhere.
// node verify-pages.mjs <outDir> [baseUrl]
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const task = (id, title, over = {}) => ({
  id, title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso(now), scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: iso(now - 20 * 864e5), updated_at: iso(now - 864e5), ...over,
})
const TASKS = [
  task('10000000-0000-4000-8000-000000000001', 'Call the tyre supplier about the invoice', { top3: true, duration_min: 30, project_id: 'p0000000-0000-4000-8000-000000000001' }),
  task('10000000-0000-4000-8000-000000000002', 'Review Kai', { top3: true, due_at: iso(now - 64 * 864e5), duration_min: 30 }),
  task('10000000-0000-4000-8000-000000000003', 'Search for a good node.js source to study from', { top3: true, duration_min: 210 }),
  task('10000000-0000-4000-8000-000000000004', 'Gym — upper body', { duration_min: 60, scheduled_start: iso(now + 2 * 36e5), scheduled_end: iso(now + 3 * 36e5) }),
  task('10000000-0000-4000-8000-000000000005', 'Buy milk'),
]
const EVENTS = [{
  id: 'e0000000-0000-4000-8000-000000000001', user_id: UID, title: 'Gym — upper body', starts_at: iso(now + 2 * 36e5), ends_at: iso(now + 3 * 36e5), all_day: false,
  task_id: TASKS[3].id, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'task', color: null, created_at: iso(now - 864e5), updated_at: iso(now - 864e5),
}]
const PROJECTS = [{ id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: null, name: 'Shaheen Tasks', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: iso(now - 30 * 864e5), updated_at: iso(now - 864e5) }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(view, theme, route) {
  const ctx = await browser.newContext({ viewport: view.viewport, hasTouch: view.touch, deviceScaleFactor: 1 })
  await ctx.addInitScript(([t, s]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', s)
    localStorage.setItem('kf.today.more-open', '1')
  }, [theme, JSON.stringify(session)])
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = url.pathname.replace('/rest/v1/', '')
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = { tasks: TASKS, calendar_events: EVENTS, projects: PROJECTS, app_settings: [SETTINGS] }[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(600)
  const cdp = view.touch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors }
}

const tid = (n) => TASKS[n - 1].id
const rowOf = (page, n) => page.locator(`[id="task-${tid(n)}"]`)
const fgX = (loc) => loc.locator('.kf-swipe-fg').first().evaluate((e) => {
  const m = /translateX\((-?[\d.]+)px\)/.exec(e.style.transform)
  return m ? Number(m[1]) : 0
})
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
async function swipe(cdp, loc, dx, { rest = 150, fromX = 70, during } = {}) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(200)
  const b = await loc.boundingBox()
  const x0 = b.x + fromX
  const y0 = b.y + Math.min(b.height / 2, 28)
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: x0, y: y0 }])
  for (let i = 1; i <= 16; i++) {
    await t('touchMove', [{ x: x0 + (dx * i) / 16, y: y0 }])
    await sleep(16)
  }
  await sleep(rest)
  if (during) await during()
  await t('touchEnd', [])
  await sleep(700)
}
async function hold(cdp, loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(200)
  const b = await loc.boundingBox()
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + 140, y: b.y + 18 }])
  await sleep(480)
  await t('touchEnd', [])
  await sleep(250)
}
async function tap(cdp, loc) {
  const b = await loc.boundingBox()
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await t('touchEnd', [])
  await sleep(350)
}
async function toastsGone(page) {
  for (let i = 0; i < 40 && (await page.locator('.kf-toast').count()) > 0; i++) await sleep(250)
}
const SPEC = ['Tomorrow', 'Pick date…', 'Move to project…', 'Priority', 'Repeat', 'Remind', 'Add to Top 3', 'Select', 'Delete']
const phone = { viewport: { width: 390, height: 844 }, touch: true }
const desktop = { viewport: { width: 1280, height: 800 }, touch: false }

for (const theme of ['day', 'night']) {
  // ── Tasks, phone ──
  {
    const id = `tasks-phone-${theme}`
    const { ctx, page, cdp, errors } = await open(phone, theme, '/tasks?list=all')
    const r5 = rowOf(page, 5)
    check(`${id} rows render (real TaskRow)`, (await r5.count()) === 1)
    await page.screenshot({ path: path.join(OUT, `${id}.png`) })
    await swipe(cdp, r5, 120)
    check(`${id} swipe right rests open at 196`, (await fgX(r5)) === 196)
    await page.screenshot({ path: path.join(OUT, `${id}-swipe-right.png`) })
    await swipe(cdp, r5, -150, { fromX: 250 })
    await swipe(cdp, r5, 260, { fromX: 30 })
    check(`${id} full right swipe → "Moved to tomorrow"`, (await toasts(page)).includes('Moved to tomorrow'), JSON.stringify(await toasts(page)))
    await swipe(cdp, rowOf(page, 4), -230, { fromX: 300 })
    check(`${id} full left swipe → "Moved to Trash", no confirm`, (await toasts(page)).includes('Moved to Trash') && (await page.locator('[role="dialog"]').count()) === 0, JSON.stringify(await toasts(page)))
    await page.screenshot({ path: path.join(OUT, `${id}-toasts.png`) })
    await toastsGone(page) // toasts ride above sheets (z 1100) and would take the taps below
    const r1 = rowOf(page, 1)
    await r1.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    await sleep(200)
    await tap(cdp, r1.getByRole('button', { name: /More actions/ }))
    const labels = (await page.locator('.kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    check(`${id} ⋯ sheet = MK list (starred row)`, JSON.stringify(labels) === JSON.stringify(SPEC.map((l) => (l === 'Add to Top 3' ? 'Remove from Top 3' : l))), JSON.stringify(labels))
    await page.screenshot({ path: path.join(OUT, `${id}-action-sheet.png`) })
    await tap(cdp, page.locator('.kf-as-row', { hasText: 'Select' }))
    await sleep(300)
    check(`${id} ⋯ → Select enters selection`, /1 selected/.test(await page.locator('.kf-selbar-top').innerText().catch(() => '')))
    await hold(cdp, rowOf(page, 2)).catch(() => {})
    await tap(cdp, rowOf(page, 3).locator('.kf-swipe-fg'))
    check(`${id} taps add rows while selecting`, /3 selected/.test(await page.locator('.kf-selbar-top').innerText().catch(() => '')), await page.locator('.kf-selbar-top').innerText().catch(() => ''))
    check(`${id} select circles replace checkboxes`, (await rowOf(page, 1).locator('.kf-select-circle').count()) === 1 && (await rowOf(page, 1).locator('.kf-checkbox').count()) === 0)
    await page.screenshot({ path: path.join(OUT, `${id}-selection.png`) })
    await tap(cdp, page.locator('.kf-selbar-bottom').getByRole('button', { name: 'Delete' }))
    await sleep(700)
    check(`${id} bulk Delete → "3 tasks moved to Trash", no confirm`, (await toasts(page)).includes('3 tasks moved to Trash') && (await page.locator('[role="dialog"]').count()) === 0, JSON.stringify(await toasts(page)))
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Today, phone ──
  {
    const id = `today-phone-${theme}`
    const { ctx, page, cdp, errors } = await open(phone, theme, '/today')
    const goal = rowOf(page, 1)
    check(`${id} goal card + Top 3 rows render`, (await goal.count()) === 1 && (await rowOf(page, 2).count()) === 1)
    await page.screenshot({ path: path.join(OUT, `${id}.png`), fullPage: false })
    await swipe(cdp, goal, 120)
    check(`${id} the goal card swipes (rests open)`, (await fgX(goal)) === 196)
    const tilt = await goal.locator('.kf-swipe-fg').evaluate((e) => e.style.transform)
    check(`${id} the goal keeps its tilt while open`, /rotate\(-0\.4deg\)/.test(tilt), tilt)
    await page.screenshot({ path: path.join(OUT, `${id}-goal-swipe.png`) })
    await tap(cdp, goal.locator('.kf-swipe-fg'))
    const upnext = page.locator(`[id="upnext-${EVENTS[0].id}"]`)
    check(`${id} Up next task-backed row has ⋯`, (await upnext.getByRole('button', { name: /More actions/ }).count()) === 1)
    await upnext.scrollIntoViewIfNeeded()
    await tap(cdp, upnext.getByRole('button', { name: /More actions/ }))
    const up = (await page.locator('.kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    check(`${id} Up next ⋯ = task list + Unschedule`, JSON.stringify(up) === JSON.stringify(['Tomorrow', 'Pick date…', 'Unschedule', ...SPEC.slice(2)]), JSON.stringify(up))
    const hint = await page.locator('.kf-as-row').first().innerText()
    check(`${id} Up next Tomorrow keeps the block's own time`, !/09:00/.test(hint) || /09:00/.test(new Date(EVENTS[0].starts_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo' })), hint.replace(/\n/g, ' '))
    await page.screenshot({ path: path.join(OUT, `${id}-upnext-sheet.png`) })
    await page.keyboard.press('Escape')
    await sleep(400)
    check(`${id} Up next ⋯ did not open the task`, new URL(page.url()).pathname === '/today', page.url())
    await swipe(cdp, rowOf(page, 2), -230, { fromX: 300 })
    check(`${id} Top 3 row: left swipe → Trash + Undo`, (await toasts(page)).includes('Moved to Trash'), JSON.stringify(await toasts(page)))
    await toastsGone(page)
    await hold(cdp, rowOf(page, 3))
    check(`${id} hold a Top 3 row → selection`, /1 selected/.test(await page.locator('.kf-selbar-top').innerText().catch(() => '')))
    await page.screenshot({ path: path.join(OUT, `${id}-selection.png`) })
    await tap(cdp, page.getByRole('button', { name: 'Select all' }))
    check(`${id} Select all selects the goal too`, /[3-9] selected/.test(await page.locator('.kf-selbar-top').innerText()), await page.locator('.kf-selbar-top').innerText())
    await page.keyboard.press('Escape')
    await sleep(250)
    check(`${id} Esc exits`, (await page.locator('.kf-selbar-top').count()) === 0)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Tasks + Today, desktop ──
  for (const route of ['/tasks?list=all', '/today']) {
    const id = `${route === '/today' ? 'today' : 'tasks'}-desktop-${theme}`
    const { ctx, page, errors } = await open(desktop, theme, route)
    const r = rowOf(page, route === '/today' ? 3 : 5)
    await r.scrollIntoViewIfNeeded()
    // A late layout scroll (the weather line landing) closes an open menu by design — settle, retry once.
    await sleep(800)
    const b = await r.boundingBox()
    let items = []
    for (let i = 0; i < 2 && items.length === 0; i++) {
      await page.mouse.click(b.x + 200, b.y + 16, { button: 'right' })
      await sleep(300)
      items = (await page.locator('[role="menuitem"]').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    }
    const want = route === '/today' ? SPEC.map((l) => (l === 'Add to Top 3' ? 'Remove from Top 3' : l)) : SPEC
    check(`${id} right-click = the ⋯ list`, JSON.stringify(items) === JSON.stringify(want), JSON.stringify(items))
    await page.screenshot({ path: path.join(OUT, `${id}-menu.png`) })
    await page.keyboard.press('Escape')
    await r.click({ modifiers: ['Control'], position: { x: 200, y: 16 } })
    await sleep(200)
    check(`${id} ⌃-click → kit pill bar`, /1 selected/i.test(await page.locator('.kf-bulkbar').innerText().catch(() => '')))
    await page.screenshot({ path: path.join(OUT, `${id}-pill.png`) })
    await page.keyboard.press('Escape')
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-pages-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
