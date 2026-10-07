// The phone calendar (Calendar Phone.dc.html 7a–7n) on the REAL app, signed in against a MOCKED backend —
// the task-sheet recipe (docs/log/assets/task-sheet/verify.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in localStorage,
// and Playwright answers every REST call with the drawing's day (Sunday 27 Sep 2026, Cairo, now 13:40).
// Writes are answered 201, go nowhere, and are recorded so each gesture's write can be checked.
// Gestures are real CDP touch (Input.dispatchTouchEvent): swipes, 400ms holds, drags.
//   node verify.mjs <outDir> [baseUrl] [designDir] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5244'
const DESIGN = process.argv[4] // Calendar Phone.dc.html frames rendered to design-<id>.png (optional)
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const snap15 = (m) => Math.round(m / 15) * 15
// ONLY=7d,7e runs just those scenes (desktop = the desktop pass; more = +N; edge = auto-scroll); unset runs everything.
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the drawing's day: Sunday 27 Sep 2026, Cairo = UTC+3, the clock at 13:40 ──
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '13:40'
const CREATED = iso('09:00', 21)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DOMAINS = [
  { id: 'd0000000-0000-4000-8000-000000000001', user_id: UID, name: 'Shaheen', color: '#C9A961', sort_order: 1, created_at: CREATED, updated_at: CREATED },
  { id: 'd0000000-0000-4000-8000-000000000002', user_id: UID, name: 'Work', color: '#7E9A76', sort_order: 2, created_at: CREATED, updated_at: CREATED },
]
const proj = (n, name, d) => ({ id: `p0000000-0000-4000-8000-00000000000${n}`, user_id: UID, domain_id: DOMAINS[d].id, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED })
const PROJECTS = [proj(1, 'Shaheen Tasks', 0), proj(2, 'Forecasting app', 1)]
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const TYRE = 1, DEEP = 2, REVIEW = 3, SEARCH = 4, DENT = 5, SUB1 = 6, SUB2 = 7
const TASKS = [
  task(TYRE, 'Call the tyre supplier', { project_id: PROJECTS[0].id, domain_id: DOMAINS[0].id, duration_min: 30, due_at: iso('15:00'), reminder_at: iso('14:50'), notes: 'They sent the wrong batch', scheduled_start: iso('15:00'), scheduled_end: iso('15:30') }),
  task(DEEP, 'Deep work — forecasting', { project_id: PROJECTS[1].id, domain_id: DOMAINS[1].id, duration_min: 90, scheduled_start: iso('09:00'), scheduled_end: iso('10:30') }),
  task(REVIEW, 'Review Kai', { duration_min: 30, due_at: iso('17:00') }),
  task(SEARCH, 'Search for a node.js source', { duration_min: 210, due_at: iso('18:00') }),
  task(DENT, 'Dentist', { due_at: iso('16:00', 29), duration_min: 60, scheduled_start: iso('16:00', 29), scheduled_end: iso('17:00', 29) }),
  task(SUB1, 'Find the invoice number', { parent_task_id: id(TYRE) }),
  task(SUB2, 'Ask about delivery dates', { parent_task_id: id(TYRE) }),
]
const ev = (n, title, from, to, day = 27, taskN = null, type) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [
  ev(1, 'Deep work — forecasting', '09:00', '10:30', 27, DEEP),
  ev(2, 'Lunch with Omar', '13:00', '14:00'),
  ev(3, 'Call the tyre supplier', '15:00', '15:30', 27, TYRE),
  ev(4, 'Gym', '18:00', '19:00', 27, null, 'time_block'),
  ev(5, 'School run', '08:00', '09:00', 28),
  ev(6, 'Standup', '10:30', '10:45', 28),
  ev(7, 'Lunch with Sam', '12:30', '13:30', 28),
  ev(8, 'Deep work — forecasting', '15:00', '16:30', 28, DEEP),
  ev(9, 'Weekly review', '10:00', '11:00', 29, null, 'time_block'),
  ev(10, 'Dentist', '16:00', '17:00', 29, DENT),
  ev(11, 'Workshop', '08:00', '13:00', 30),
  { ...ev(12, 'Company offsite', '00:00', '00:00', 30), starts_at: '2026-10-02T00:00:00.000Z', ends_at: '2026-10-03T00:00:00.000Z', all_day: true },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => ({ tasks: TASKS, calendar_events: EVENTS, projects: PROJECTS, domains: DOMAINS, app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

/** Opens `route` with the day's data (or `rows`). `hold` delays REST answers (loading). */
async function open(route = '/calendar', o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { hold: o.hold ?? 0, rows: o.rows ?? tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (state.hold) await sleep(state.hold)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: o.hold ? 'domcontentloaded' : 'networkidle' })
  await sleep(900)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
async function tapAt(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(450)
}
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await tapAt(cdp, center(await loc.boundingBox()))
}
/** A finger from `from`, held `hold` ms, then moved by (dx, dy) in `steps`, then (unless `keep`) lifted. */
async function drag(cdp, from, { dx = 0, dy = 0, hold = 0, steps = 10, stepMs = 25, keep = false, mid } = {}) {
  await touch(cdp, 'touchStart', [from])
  if (hold) await sleep(hold)
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }])
    await sleep(stepMs)
    if (mid && i === Math.round(steps * 0.8)) await mid()
  }
  if (!keep) {
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
  }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
/** Two toasts show at once and a third waits (MK Undo Toast): give a queued one its turn. */
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const writesOf = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => w.body)
const block = (page, n) => page.locator(`.pc-block[data-id="${eid(n)}"]`)
const dialog = (page) => page.locator('[role="dialog"]').last()
const taskSheet = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('.ts-top') })
const title = (page) => text(page.locator('.pc-title'))
const scrollTop = (page) => page.locator('.pc-scroll').evaluate((e) => e.scrollTop)
/** Pretend the on-screen keyboard is up (px): the sheet reads visualViewport like a real IME. */
const keyboard = (page, px) =>
  page.evaluate((h) => {
    const vv = window.visualViewport
    if (h) Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - h })
    else delete vv.height
    vv.dispatchEvent(new Event('resize'))
  }, px)
/** The y (screen px) of a Cairo time on the grid. */
const yOf = (page, hhmm) =>
  page.locator('.pc-canvas').evaluate((c, t) => {
    const [h, m] = t.split(':').map(Number)
    return c.getBoundingClientRect().top + ((h * 60 + m) * 64) / 60
  }, hhmm)
async function basics(page, name, errors) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  const small = await page.evaluate(() => {
    const out = []
    for (const root of document.querySelectorAll('.pc, [role="dialog"]')) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px`, small.length === 0, small.slice(0, 4).join(' | '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}

for (const theme of ['day', 'night']) {
  const night = theme === 'night'

  // 7a / 7l-a — the day view: header, strip, unscheduled strip, 64px hours, 4 blocks, the now line.
  s7a: {
    if (!want('7a')) break s7a
    const name = night ? '7l-a-night' : '7a-day'
    const { ctx, page, errors } = await open('/calendar', { theme })
    await shot(page, name)
    check(`${name} title "Sunday, Sep 27" (Source Serif 26) + chevron`, (await title(page)) === 'Sunday, Sep 27' && (await page.locator('.pc-title').evaluate((e) => getComputedStyle(e).fontFamily.includes('Source Serif') && getComputedStyle(e).fontSize === '26px')))
    check(`${name} the shell's mono top bar steps aside; the header is 56 tall`, (await page.locator('.app-topbar').isHidden()) && (await page.locator('.pc-head').evaluate((e) => e.getBoundingClientRect().height)) === 56)
    const cells = await page.locator('.pc-day').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width >= 48 && e.getBoundingClientRect().height === 76, e.getAttribute('aria-current'), e.innerText.replace(/\s+/g, ' ')]))
    check(`${name} week strip: 7 × 76px targets, Sun 27 shown, today ringed`, cells.length === 7 && cells.every((c) => c[0]) && cells[0][1] === 'date' && cells[0][2] === 'S 27' && cells[6][2] === 'S 3', JSON.stringify(cells.map((c) => c[2])))
    // calendar-rail (Kai 2026-10-07) replaced the "Unscheduled · 2" label with the rail's segments.
    check(`${name} planning strip: "Overdue 0 · Today 2 · Inbox 0" (Today chosen), paper cards 40 tall`, (await page.locator('.pc-segs [role="radio"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join() === 'Overdue 0,Today 2,Inbox 0' && (await page.locator('.pc-segs [aria-checked="true"]').innerText()).includes('Today') && (await page.locator('.pc-chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).join() === '40,40')
    const labels = await page.locator('.pc-hour > span').evaluateAll((els) => els.slice(11, 13).map((e) => e.getBoundingClientRect().top))
    check(`${name} hours are 64px`, labels[1] - labels[0] === 64, labels[1] - labels[0])
    check(`${name} four blocks today`, (await page.locator('.pc-pane .pc-block').count()) === 4)
    check(`${name} Lunch reads "Now · 20m left", in blossom`, (await text(block(page, 2))).includes('NOW · 20M LEFT') && (await block(page, 2).evaluate((e) => e.style.getPropertyValue('--pc-fill'))) === 'var(--block-blossom)')
    check(`${name} the tyre block: 15:00–15:30, 32px, the project hue, an 18px checkbox`, (await text(block(page, 3))).includes('15:00–15:30') && (await block(page, 3).evaluate((e) => [e.getBoundingClientRect().height, getComputedStyle(e).getPropertyValue('--pc-fill').includes('#C9A961'), e.querySelector('.kf-checkbox').getBoundingClientRect().width].join())) === '32,true,18')
    check(`${name} Gym (a time block) lavender, no checkbox`, (await block(page, 4).evaluate((e) => e.style.getPropertyValue('--pc-fill') === 'var(--block-lavender)' && !e.querySelector('.kf-checkbox'))))
    check(`${name} past block at 55% / saturate .6`, (await block(page, 1).evaluate((e) => getComputedStyle(e).opacity === '0.55' && getComputedStyle(e).filter.includes('saturate(0.6)'))))
    const y1340 = await yOf(page, '13:40')
    const now = await page.locator('.pc-nowtag').evaluate((e) => [e.innerText, Math.round(e.getBoundingClientRect().top + 11)])
    check(`${name} now tag 13:40 on the line`, now[0] === '13:40' && Math.abs(now[1] - y1340) <= 1, JSON.stringify(now))
    const body = await block(page, 1).locator('.pc-block-body').boundingBox()
    const grid = await page.locator('.pc-scroll').boundingBox()
    check(`${name} a block half scrolled off keeps its title in view (sticky)`, (await block(page, 1).boundingBox()).y < grid.y && body.y >= grid.y - 1, `${Math.round(body.y)} vs ${Math.round(grid.y)}`)
    check(`${name} the grid ends at the tab bar`, Math.abs(grid.y + grid.height - (await page.locator('.app-tabbar').boundingBox()).y) <= 1)
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7d / 7l-d — tap a task block: the Task sheet at once (Kai 2026-10-03), its block card holding Change
  // time and Unschedule; a plain event keeps the event sheet (Time · Delete).
  s7d: {
    if (!want('7d')) break s7d
    const name = night ? '7l-d-night' : '7d-day'
    const { ctx, page, cdp, errors, state } = await open('/calendar', { theme })
    await tap(cdp, block(page, 3).locator('.pc-name'))
    await sleep(400)
    const ts = taskSheet(page)
    check(`${name} tap a task block → the Task sheet straight away, over /calendar (?task=)`, new URL(page.url()).pathname === '/calendar' && new URL(page.url()).searchParams.get('task') === id(TYRE) && (await ts.count()) === 1 && (await ts.locator('.ts-title').inputValue()) === 'Call the tyre supplier' && (await page.locator('.pc-bs-title').count()) === 0 && (await dialog(page).count()) === 1, page.url())
    const card = ts.locator('.ts-block')
    await card.scrollIntoViewIfNeeded()
    check(`${name} its block card: On your calendar · Sun 27 · 15:00–15:30 · 30m, Change time · Unschedule`, (await text(card.locator('small'))) === 'SUN 27 · 15:00–15:30 · 30M' && (await card.getByRole('button', { name: 'Change time' }).count()) === 1 && (await card.getByRole('button', { name: 'Unschedule' }).count()) === 1, await text(card))
    await shot(page, name)
    if (!night) {
      // Change time → the Time sheet for the block's day → 16:15 → Done: one move, "Moved to 16:15 · Undo".
      const w0 = state.writes.length
      await tap(cdp, card.getByRole('button', { name: 'Change time' }))
      check(`${name} Change time → the Time sheet, meta the task`, (await text(page.locator('.kf-pk-meta'))).includes('CALL THE TYRE SUPPLIER'), await text(page.locator('.kf-pk-meta')))
      await page.locator('.kf-pk-time', { hasText: '16:15' }).scrollIntoViewIfNeeded()
      await tap(cdp, page.locator('.kf-pk-time', { hasText: '16:15' }))
      await tap(cdp, page.getByRole('button', { name: 'Done' }))
      await sleep(300)
      const moved = writesOf(state, 'calendar_events', w0)
      check(`${name} …Done → one move write 16:15–16:45 (+ the task's schedule), "Moved to 16:15 · Undo"`, moved.length === 1 && moved[0].id === eid(3) && moved[0].starts_at === iso('16:15') && moved[0].ends_at === iso('16:45') && writesOf(state, 'tasks', w0).some((t) => t.id === id(TYRE) && t.scheduled_start === iso('16:15')) && (await page.locator('.kf-toast', { hasText: 'Moved to 16:15' }).getByRole('button', { name: 'Undo' }).count()) === 1, JSON.stringify(moved.map((m) => m.starts_at)))
      check(`${name} …the sheet stays, its card reads 16:15–16:45, "Saved"`, (await ts.count()) === 1 && (await text(card.locator('small'))).includes('16:15–16:45') && (await text(ts.locator('.ts-save'))) === 'SAVED', `${await text(card.locator('small'))} / ${await text(ts.locator('.ts-save'))}`)
      await shot(page, '7d-change-time-day')
      const w1 = state.writes.length
      await tap(cdp, page.locator('.kf-toast', { hasText: 'Moved to 16:15' }).getByRole('button', { name: 'Undo' }))
      await sleep(300)
      check(`${name} …Undo → back to 15:00–15:30`, writesOf(state, 'calendar_events', w1).some((x) => x.id === eid(3) && x.starts_at === iso('15:00')) && (await text(card.locator('small'))).includes('15:00–15:30'))
      // Unschedule → the block leaves the calendar, the task stays (and its sheet), Undo puts it back.
      const w2 = state.writes.length
      await tap(cdp, card.getByRole('button', { name: 'Unschedule' }))
      await sleep(300)
      const un = [writesOf(state, 'calendar_events', w2).some((e) => e.id === eid(3) && e.deleted_at), writesOf(state, 'tasks', w2).some((t) => t.id === id(TYRE) && t.scheduled_start === null && !t.deleted_at), await toastSoon(page, 'Unscheduled · Call the tyre supplier'), await ts.count(), await ts.locator('.ts-block').count(), await block(page, 3).count()]
      check(`${name} Unschedule → block deleted, task unscheduled (not deleted), "Unscheduled · …" + Undo; the sheet stays, the card goes`, un.join() === 'true,true,true,1,0,0', JSON.stringify(un))
      await shot(page, '7d-unschedule-day')
      await tap(cdp, page.locator('.kf-toast', { hasText: 'Unscheduled' }).getByRole('button', { name: 'Undo' }))
      await sleep(300)
      check(`${name} …Undo → the block and the card come back`, writesOf(state, 'calendar_events', w2).some((e) => e.id === eid(3) && e.deleted_at === null) && (await ts.locator('.ts-block').count()) === 1 && (await block(page, 3).count()) === 1)
      await page.keyboard.press('Escape')
      await sleep(500)
      check(`${name} closing it leaves /calendar as it was`, (await ts.count()) === 0 && !new URL(page.url()).searchParams.has('task'), page.url())
      // A plain event: the event sheet — "Event · 1h", Date + Time (calendar-rail: its title is a field
      // and the day moves too), Delete; no task, no Unschedule.
      await tap(cdp, block(page, 2).locator('.pc-name'))
      const e = dialog(page)
      check(`${name} a plain event → the event sheet: "Event · 1h", Date + Time, Delete (no Unschedule, no checkbox)`, (await text(e.locator('.pc-bs-meta'))) === 'EVENT · 1H' && (await e.locator('.kf-as-row').count()) === 2 && (await e.getByRole('button', { name: 'Unschedule' }).count()) === 0 && (await e.getByRole('checkbox').count()) === 0 && !new URL(page.url()).searchParams.has('task'))
      const held = await page.locator('.pc-held').boundingBox()
      check(`${name} …the event stays in view above its sheet, drawn over the scrim`, (await text(page.locator('.pc-held'))).startsWith('Lunch with Omar') && held.y >= (await page.locator('.pc-scroll').boundingBox()).y && held.y + held.height <= (await e.boundingBox()).y, JSON.stringify(held))
      check(`${name} …its title sits on the sheet's gutter`, Math.abs((await e.locator('.pc-bs-title').boundingBox()).x - 20) <= 1, (await e.locator('.pc-bs-title').boundingBox()).x)
      await shot(page, '7d-event-day')
      const w3 = state.writes.length
      await tap(cdp, e.locator('.kf-as-row', { hasText: 'Time' }))
      await page.locator('.kf-pk-time', { hasText: '14:30' }).scrollIntoViewIfNeeded()
      await tap(cdp, page.locator('.kf-pk-time', { hasText: '14:30' }))
      await tap(cdp, page.getByRole('button', { name: 'Done' }))
      await sleep(300)
      const m3 = writesOf(state, 'calendar_events', w3)
      check(`${name} …Time → 14:30 → one write + "Moved to 14:30", "✓ Saved"`, m3.length === 1 && m3[0].starts_at === iso('14:30') && (await toasts(page)).includes('Moved to 14:30') && (await text(e.locator('.pc-bs-save'))) === '✓ SAVED', JSON.stringify(m3.map((m) => m.starts_at)))
      const w4 = state.writes.length
      await tap(cdp, e.getByRole('button', { name: 'Delete' }))
      await sleep(300)
      check(`${name} …Delete → the block goes, "Deleted · Lunch with Omar" + Undo`, writesOf(state, 'calendar_events', w4).some((x) => x.id === eid(2) && x.deleted_at) && (await toastSoon(page, 'Deleted · Lunch with Omar')) && (await block(page, 2).count()) === 0)
    }
    await basics(page, name, errors)
    await ctx.close()
  }
  if (night) continue

  // 7b — swipe the day: only the columns slide; past 40% (or a fling) commits; short of it springs back.
  s7b: {
    if (!want('7b')) break s7b
    const name = '7b-day'
    const { ctx, page, cdp, errors } = await open()
    const labelX = (await page.locator('.pc-hour > span').nth(12).boundingBox()).x
    const g = await page.locator('.pc-scroll').boundingBox()
    const from = { x: 300, y: g.y + 200 }
    await drag(cdp, from, { dx: -150, steps: 12, keep: true })
    await sleep(100)
    await shot(page, name)
    const tx = await page.locator('.pc-pane').nth(1).evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41)
    check(`${name} mid-swipe the columns follow the finger (−150)`, Math.abs(tx + 150) <= 2, tx)
    check(`${name} …the next day slides in beside it (Standup visible)`, (await page.locator('.pc-block', { hasText: 'Standup' }).count()) === 1)
    check(`${name} …the hour labels stay put`, (await page.locator('.pc-hour > span').nth(12).boundingBox()).x === labelX)
    check(`${name} …and the columns slide under a clip at the gutter, not over the hour labels`, (await page.locator('.pc-track').evaluate((e) => getComputedStyle(e).overflowX)) === 'clip')
    check(`${name} …the title changes only after the commit`, (await title(page)) === 'Sunday, Sep 27')
    await touch(cdp, 'touchEnd', [])
    await sleep(600)
    check(`${name} release past 40% → Monday, Sep 28; the strip follows`, (await title(page)) === 'Monday, Sep 28' && (await page.locator('.pc-day[aria-current]').innerText()).replace(/\s+/g, ' ') === 'M 28')
    await drag(cdp, from, { dx: 70, steps: 10, stepMs: 40 })
    await sleep(200)
    check(`${name} a slow swipe short of 40% springs back`, (await title(page)) === 'Monday, Sep 28')
    await page.evaluate(() => {
      window.__log = []
      const el = document.querySelector('.pc-scroll')
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) el.addEventListener(t, (e) => window.__log.push([t, Math.round(e.timeStamp), Math.round(e.clientX)]), true)
    })
    await drag(cdp, from, { dx: 100, steps: 3, stepMs: 8 })
    await sleep(200)
    check(`${name} a fling short of 40% commits (back to Sunday)`, (await title(page)) === 'Sunday, Sep 27', JSON.stringify(await page.evaluate(() => window.__log)))
    const st = await scrollTop(page)
    await drag(cdp, from, { dy: -200, steps: 8 })
    check(`${name} a vertical drag scrolls the hours, no day change`, (await scrollTop(page)) > st + 100 && (await title(page)) === 'Sunday, Sep 27')
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7n + 7h — the title is the view switch; 3 days; week; Today re-centres.
  s7n: {
    if (!want('7n')) break s7n
    const name = '7n-day'
    const { ctx, page, cdp, errors, state } = await open()
    await tap(cdp, page.locator('.pc-title'))
    await shot(page, name)
    const rows = await dialog(page).locator('.kf-as-row').evaluateAll((els) => els.map((e) => [e.innerText.replace(/\s+/g, ' ').trim(), e.getAttribute('aria-current')]))
    check(`${name} View: Day (current, checked) · 3 days SUN–TUE · Week SEP 27 – OCT 3`, JSON.stringify(rows) === JSON.stringify([['Day', 'true'], ['3 days SUN–TUE', null], ['Week SEP 27 – OCT 3', null]]), JSON.stringify(rows))
    check(`${name} the chevron turns up while it's open`, (await page.locator('.pc-title').getAttribute('aria-expanded')) === 'true')
    await tap(cdp, dialog(page).locator('.kf-as-row', { hasText: '3 days' }))
    await sleep(300)
    await shot(page, '7h-day')
    check('7h-day title "Sep 27 – 29", three columns SUN 27 · MON 28 · TUE 29', (await title(page)) === 'Sep 27 – 29' && (await page.locator('.pc-colhead > span').allInnerTexts()).join() === 'SUN 27,MON 28,TUE 29')
    check('7h-day the strip washes 27–29', JSON.stringify(await page.locator('.pc-day').evaluateAll((els) => els.map((e) => e.dataset.range ?? null))) === JSON.stringify(['start', 'mid', 'end', null, null, null, null]))
    check('7h-day blocks from all three days; short ones title only', (await page.locator('.pc-block', { hasText: 'Weekly review' }).count()) === 1 && (await page.locator('.pc-block', { hasText: 'Lunch with Sam' }).count()) === 1 && !(await text(block(page, 3))).includes('15:00'))
    check('7h-day the day header row is 32px', (await page.locator('.pc-colhead').evaluate((e) => e.getBoundingClientRect().height)) === 32)
    // A lifted block moves across columns: one column right = the next day, same time.
    const tb = await block(page, 3).boundingBox()
    const cw = (await page.locator('.pc-col').first().boundingBox()).width
    const w3 = state.writes.length
    await drag(cdp, { x: tb.x + tb.width / 2, y: tb.y + 16 }, { hold: 550, dx: cw, steps: 8, stepMs: 40 })
    const x3 = writesOf(state, 'calendar_events', w3)
    check('7h-day a lifted block dragged one column right → Mon 28, same time ("Moved to Mon 28 15:00")', x3.length === 1 && x3[0].starts_at === iso('15:00', 28) && x3[0].ends_at === iso('15:30', 28) && (await toasts(page)).includes('Moved to Mon 28 15:00'), JSON.stringify(x3.map((x) => x.starts_at)))
    await tap(cdp, page.locator('.kf-toast', { hasText: 'Moved to Mon 28' }).getByRole('button', { name: 'Undo' }))
    // A swipe leaves no stale "swallow": the very next tap on a block's checkbox still ticks it.
    const w4 = state.writes.length
    await tap(cdp, block(page, 3).locator('.kf-checkbox'))
    check('7h-day a block checkbox right after a gesture still completes the task', writesOf(state, 'tasks', w4).some((t) => t.id === id(TYRE) && t.status === 'done'))
    const g = await page.locator('.pc-scroll').boundingBox()
    await drag(cdp, { x: 300, y: g.y + 200 }, { dx: -200, steps: 10 })
    await sleep(300)
    check('7h-day a swipe pages three days (Sep 30 – Oct 2)', (await title(page)) === 'Sep 30 – Oct 2')
    await tap(cdp, page.locator('.pc-title'))
    await tap(cdp, dialog(page).locator('.kf-as-row', { hasText: 'Week' }))
    await sleep(300)
    check('week: "Sep 27 – Oct 3", seven narrow columns', (await title(page)) === 'Sep 27 – Oct 3' && (await page.locator('.pc-colhead > span').count()) === 7)
    await shot(page, 'week-day')
    await tap(cdp, page.locator('.pc-title'))
    await tap(cdp, dialog(page).getByRole('button', { name: 'Day', exact: true }))
    await tap(cdp, page.locator('.pc-day').nth(3))
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = 0))
    await tap(cdp, page.getByRole('button', { name: 'Today' }))
    const y = await yOf(page, '13:40')
    const g1 = await page.locator('.pc-scroll').boundingBox()
    check('Today → Sunday, and the now line re-centred', (await title(page)) === 'Sunday, Sep 27' && Math.abs(y - (g1.y + g1.height / 2)) <= 2, `${Math.round(y)} vs ${Math.round(g1.y + g1.height / 2)}`)
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7c — tap an empty slot: quick create, keyboard up, the slot over the scrim, Save waits for a title.
  s7c: {
    if (!want('7c')) break s7c
    const name = '7c-day'
    const { ctx, page, cdp, errors, state } = await open()
    const y16 = await yOf(page, '16:00')
    await tapAt(cdp, { x: 200, y: y16 + 8 })
    await keyboard(page, 300)
    await sleep(400)
    const d = dialog(page)
    check(`${name} the sheet: Task (chosen) | Event, Save disabled, the title focused`, (await d.getByRole('radio', { name: 'Task' }).getAttribute('aria-checked')) === 'true' && (await d.getByRole('button', { name: 'Save' }).isDisabled()) && (await d.locator('.pc-qc-title').evaluate((e) => document.activeElement === e)))
    check(`${name} the date chip "SUN 27 · 16:00"; 30M chosen`, (await text(d.locator('.kf-chip').first())) === 'SUN 27 · 16:00' && (await d.locator('.kf-chip[aria-pressed="true"]').innerText()) === '30M')
    const box = await d.boundingBox()
    check(`${name} keyboard up → the sheet sits on it`, Math.abs(box.y + box.height - (844 - 300)) <= 2, JSON.stringify(box))
    await d.locator('.pc-qc-title').pressSequentially('Pick up the new tyres')
    const slot = await page.locator('.pc-held').boundingBox()
    check(`${name} the slot 16:00–16:30, over the scrim and above the sheet, with the live title`, (await text(page.locator('.pc-held'))).replace(/\s+/g, ' ') === 'Pick up the new tyres 16:00–16:30' && slot.y + slot.height <= box.y && Math.abs(slot.height - 32) <= 1 && (await page.locator('.pc-held').evaluate((e) => getComputedStyle(e).zIndex)) === '1001')
    await shot(page, name)
    await tap(cdp, d.locator('.kf-chip', { hasText: '45M' }))
    check(`${name} 45M → the slot grows to 16:00–16:45`, (await text(page.locator('.pc-held'))).includes('16:00–16:45'))
    const w0 = state.writes.length
    await tap(cdp, d.getByRole('button', { name: 'Save' }))
    await keyboard(page, 0)
    await sleep(400)
    const t = writesOf(state, 'tasks', w0).find((r) => r.title === 'Pick up the new tyres')
    const e = writesOf(state, 'calendar_events', w0).find((r) => r.title === 'Pick up the new tyres')
    check(`${name} Save → a task + its block 16:00–16:45`, t && e && e.task_id === t.id && e.starts_at === iso('16:00') && e.ends_at === iso('16:45') && t.duration_min === 45 && (await dialog(page).count()) === 0, JSON.stringify(e))
    await tapAt(cdp, { x: 200, y: (await yOf(page, '17:00')) + 8 })
    await tap(cdp, dialog(page).getByRole('radio', { name: 'Event' }))
    await dialog(page).locator('.pc-qc-title').fill('Coffee with Hana')
    const w1 = state.writes.length
    await dialog(page).locator('.pc-qc-title').press('Enter')
    await sleep(400)
    const c = writesOf(state, 'calendar_events', w1)
    check(`${name} Event + Enter → a plain event 17:00–17:30, no task`, c.length === 1 && c[0].type === 'event' && c[0].task_id === null && c[0].starts_at === iso('17:00') && writesOf(state, 'tasks', w1).length === 0, JSON.stringify(c))
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7g / 7g2 — tap an unscheduled chip: the Schedule sheet, one tap places it.
  s7g: {
    if (!want('7g')) break s7g
    const name = '7g-day'
    const { ctx, page, cdp, errors, state } = await open()
    await tap(cdp, page.locator('.pc-chip', { hasText: 'Review Kai' }))
    const d = dialog(page)
    await shot(page, name)
    check(`${name} Schedule · REVIEW KAI · 30M · Next free today`, (await text(d.locator('.kf-pk-meta'))) === 'REVIEW KAI · 30M' && (await d.innerText()).includes('NEXT FREE TODAY'))
    check(`${name} the next 3 free slots: 14:00–14:30 · 14:30–15:00 · 15:30–16:00`, (await d.locator('.kf-pk-slot').allInnerTexts()).join() === '14:00–14:30,14:30–15:00,15:30–16:00', (await d.locator('.kf-pk-slot').allInnerTexts()).join())
    check(`${name} the tapped chip is marked`, (await page.locator('.pc-chip', { hasText: 'Review Kai' }).getAttribute('aria-expanded')) === 'true')
    const w0 = state.writes.length
    await tap(cdp, d.locator('.kf-pk-slot', { hasText: '14:30–15:00' }))
    await sleep(300)
    const e = writesOf(state, 'calendar_events', w0)
    check(`${name} one tap → the block 14:30–15:00, "Scheduled" + Undo, the chip leaves`, e.length === 1 && e[0].task_id === id(REVIEW) && e[0].starts_at === iso('14:30') && e[0].ends_at === iso('15:00') && (await toasts(page)).includes('Scheduled · Review Kai') && (await page.locator('.pc-chip', { hasText: 'Review Kai' }).count()) === 0)
    await tap(cdp, page.locator('.kf-toast', { hasText: 'Scheduled · Review Kai' }).getByRole('button', { name: 'Undo' }))
    check(`${name} Undo → the block goes and the chip comes back`, (await page.locator('.pc-chip', { hasText: 'Review Kai' }).count()) === 1 && writesOf(state, 'calendar_events', w0).some((x) => x.task_id === id(REVIEW) && x.deleted_at))
    await basics(page, name, errors)

    const n2 = '7g2-day'
    await tap(cdp, page.locator('.pc-chip', { hasText: 'Search for a node.js source' }))
    const d2 = dialog(page)
    await shot(page, n2)
    check(`${n2} too long for today: "Next free", the next days, "No 3h30 gap left today"`, !(await d2.innerText()).includes('NEXT FREE TODAY') && (await d2.locator('.kf-pk-slot').allInnerTexts()).join() === 'Tomorrow 16:30,Tue 29 11:00,Wed 30 13:00' && (await text(d2.locator('.pc-hint'))) === 'No 3h30 gap left today', (await d2.locator('.kf-pk-slot').allInnerTexts()).join())
    const w1 = state.writes.length
    await tap(cdp, d2.locator('.kf-pk-slot', { hasText: 'Tue 29' }))
    await sleep(300)
    const e2 = writesOf(state, 'calendar_events', w1)
    check(`${n2} Tue 29 11:00 → placed 11:00–14:30, and the grid goes to Tuesday`, e2.length === 1 && e2[0].starts_at === iso('11:00', 29) && e2[0].ends_at === iso('14:30', 29) && (await title(page)) === 'Tuesday, Sep 29')
    // Pick a time… → the time sheet → Done places it today.
    await tap(cdp, page.getByRole('button', { name: 'Today' }))
    await tap(cdp, page.locator('.pc-chip', { hasText: 'Review Kai' }))
    await tap(cdp, dialog(page).locator('.kf-as-row', { hasText: 'Pick a time' }))
    await page.locator('.kf-pk-time', { hasText: '19:00' }).scrollIntoViewIfNeeded()
    await tap(cdp, page.locator('.kf-pk-time', { hasText: '19:00' }))
    const w2 = state.writes.length
    await tap(cdp, page.getByRole('button', { name: 'Done' }))
    await sleep(300)
    check(`${n2} Pick a time… → 19:00 → placed today`, writesOf(state, 'calendar_events', w2).some((x) => x.starts_at === iso('19:00')))
    await basics(page, n2, errors)
    await ctx.close()
  }

  // 7e / 7m — hold 400ms: the block lifts and follows the finger on the 15-min grid; drop → toast + Undo.
  s7e: {
    if (!want('7e')) break s7e
    const name = '7e-day'
    const { ctx, page, cdp, errors, state } = await open()
    const b = await block(page, 3).boundingBox()
    const from = { x: b.x + 120, y: b.y + 16 }
    const st = await scrollTop(page)
    await drag(cdp, from, { hold: 150, dy: 60, steps: 6 }) // moving before 400ms is a scroll, not a lift
    check(`${name} moving before 400ms scrolls; nothing lifts`, (await page.locator('.pc-block.is-lifted').count()) === 0 && (await scrollTop(page)) !== st)
    await page.locator('.pc-scroll').evaluate((e, s) => (e.scrollTop = s), st)
    await sleep(200)
    const b2 = await block(page, 3).boundingBox()
    const f2 = { x: b2.x + 120, y: b2.y + 16 }
    const w0 = state.writes.length
    let midShot = null
    await drag(cdp, f2, {
      hold: 550, dy: 80, steps: 10, stepMs: 40, keep: true,
      mid: async () => {
        midShot = await page.locator('.pc-bubble').innerText().catch(() => '')
      },
    })
    await sleep(150)
    await shot(page, name)
    const lifted = await page.locator('.pc-block.is-lifted').evaluate((e) => [e.dataset.id, getComputedStyle(e).transform !== 'none', getComputedStyle(e).boxShadow !== 'none'])
    check(`${name} held 400ms → lifted (scale + tilt + shadow)`, lifted[0] === eid(3) && lifted[1] && lifted[2], JSON.stringify(lifted))
    check(`${name} the time bubble in the gutter follows: 16:15, inverted toast colours`, (await text(page.locator('.pc-bubble'))) === '16:15' && (await page.locator('.pc-bubble').evaluate((e) => e.getBoundingClientRect().left < 60)), `${midShot} → ${await text(page.locator('.pc-bubble'))}`)
    check(`${name} its old place stays as a dashed outline`, (await page.locator('.pc-ghost').evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'dashed')
    check(`${name} the page did not scroll under the drag`, (await scrollTop(page)) === st, `${st} → ${await scrollTop(page)}`)
    check(`${name} nothing written mid-drag`, writesOf(state, 'calendar_events', w0).length === 0)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    await shot(page, '7m-day')
    const e = writesOf(state, 'calendar_events', w0)
    check('7m-day drop → one write 16:15–16:45 (+ the task\'s schedule)', e.length === 1 && e[0].starts_at === iso('16:15') && e[0].ends_at === iso('16:45') && writesOf(state, 'tasks', w0).some((t) => t.id === id(TYRE) && t.scheduled_start === iso('16:15')), JSON.stringify(e.map((x) => x.starts_at)))
    check('7m-day toast "Moved to 16:15 · Undo"; the lift ends', (await toasts(page)).includes('Moved to 16:15') && (await page.locator('.kf-toast', { hasText: 'Moved to 16:15' }).getByRole('button', { name: 'Undo' }).count()) === 1 && (await page.locator('.pc-block.is-lifted').count()) === 0)
    const w1 = state.writes.length
    await tap(cdp, page.locator('.kf-toast', { hasText: 'Moved to 16:15' }).getByRole('button', { name: 'Undo' }))
    check('7m-day Undo → back to 15:00', writesOf(state, 'calendar_events', w1).some((x) => x.starts_at === iso('15:00')))
    // A hold released without moving stays lifted — until a tap elsewhere, or Back.
    const b3 = await block(page, 3).boundingBox()
    await drag(cdp, { x: b3.x + 120, y: b3.y + 16 }, { hold: 550, steps: 0 })
    await sleep(700)
    check('lift: released without moving, it stays lifted', (await page.locator('.pc-block.is-lifted').count()) === 1 && (await dialog(page).count()) === 0)
    const w2 = state.writes.length
    await tapAt(cdp, { x: 200, y: (await yOf(page, '11:00')) + 8 })
    check('lift: a tap elsewhere puts it down — and only that (no sheet, no write)', (await page.locator('.pc-block.is-lifted').count()) === 0 && (await dialog(page).count()) === 0 && state.writes.length === w2)
    await drag(cdp, { x: b3.x + 120, y: b3.y + 16 }, { hold: 550, steps: 0 })
    await page.keyboard.press('Escape') // lib/overlayStack — what Android Back calls
    await sleep(300)
    check('lift: Back (Esc) puts it down first', (await page.locator('.pc-block.is-lifted').count()) === 0)
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7f — resize with the handles outside the block's edges, each a 48px target.
  s7f: {
    if (!want('7f')) break s7f
    const name = '7f-day'
    const { ctx, page, cdp, errors, state } = await open()
    const b = await block(page, 3).boundingBox()
    await drag(cdp, { x: b.x + 120, y: b.y + 16 }, { hold: 550, steps: 0 })
    await sleep(300)
    const lb = await block(page, 3).boundingBox()
    const top = await page.locator('.pc-handle.is-top').boundingBox()
    const bot = await page.locator('.pc-handle.is-bottom').boundingBox()
    // (boxes, not the handles' own frames: the lifted block's +1.2° tilt widens every box by a few px)
    check(`${name} handles sit outside the top and bottom edges, 48px targets`, top.y + top.height <= lb.y + 6 && bot.y >= lb.y + lb.height - 6 && Math.round(top.height) >= 48 && Math.round(bot.height) >= 48, JSON.stringify([top, lb, bot].map((r) => [Math.round(r.y), Math.round(r.height)])))
    const w0 = state.writes.length
    await drag(cdp, center(bot), { dy: 48, steps: 8, stepMs: 40, keep: true })
    await sleep(150)
    await shot(page, name)
    check(`${name} dragging the bottom handle: bubble "16:15 · 1H15"`, (await text(page.locator('.pc-bubble'))) === '16:15 · 1H15', await text(page.locator('.pc-bubble')))
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    const e = writesOf(state, 'calendar_events', w0)
    check(`${name} release → 15:00–16:15, the task's estimate 75 min, "Resized to 15:00–16:15"`, e.length === 1 && e[0].starts_at === iso('15:00') && e[0].ends_at === iso('16:15') && writesOf(state, 'tasks', w0).some((t) => t.duration_min === 75) && (await toasts(page)).includes('Resized to 15:00–16:15'), JSON.stringify(e))
    const b2 = await block(page, 3).boundingBox()
    await drag(cdp, { x: b2.x + 120, y: b2.y + 16 }, { hold: 550, steps: 0 })
    await sleep(300)
    const w1 = state.writes.length
    await drag(cdp, center(await page.locator('.pc-handle.is-top').boundingBox()), { dy: -32, steps: 6, stepMs: 40 })
    const e2 = writesOf(state, 'calendar_events', w1)
    check(`${name} the top handle up 32px → starts 14:30, end kept`, e2.length === 1 && e2[0].starts_at === iso('14:30') && e2[0].ends_at === iso('16:15'), JSON.stringify(e2))
    await basics(page, name, errors)
    await ctx.close()
  }

  // +N (Kai 2026-10-03) — 4 blocks at once: three drawn, the 4th behind a "+1" kit chip at the stack's
  // top-right; the chip lists it (time + title) and a row opens it the way a tap does.
  sMore: {
    if (!want('more')) break sMore
    const name = 'more-day'
    const rows = tables()
    rows.calendar_events = [...EVENTS, ev(20, 'Design review', '11:00', '12:30'), ev(21, 'Budget', '11:00', '12:00'), ev(22, 'Call Omar', '11:30', '12:30'), ev(23, 'Review Kai', '11:45', '12:45', 27, REVIEW)]
    const { ctx, page, cdp, errors, state } = await open('/calendar', { rows })
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = 10.5 * 64))
    await sleep(200)
    const drawn = await Promise.all([20, 21, 22, 23].map((n) => block(page, n).count()))
    check(`${name} 4 at once → 3 drawn (Design review · Budget · Call Omar), the 4th (Review Kai) not`, drawn.join() === '1,1,1,0', drawn.join())
    const chip = page.locator('.pc-more .kf-chip')
    const cb = await chip.boundingBox()
    const ob = await block(page, 22).boundingBox()
    check(`${name} one "+1" kit chip (24 tall) at the stack's top-right — Call Omar's corner`, (await chip.count()) === 1 && (await text(chip)) === '+1' && Math.round(cb.height) === 24 && Math.abs(cb.x + cb.width - (ob.x + ob.width - 2)) <= 1 && Math.abs(cb.y - (ob.y + 2)) <= 1, JSON.stringify([cb, ob]))
    await shot(page, name)
    const w0 = state.writes.length
    await tap(cdp, chip)
    const list = dialog(page)
    const listRows = (await list.locator('.kf-as-row').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim())
    check(`${name} tap "+1" → its list: "1 more", Review Kai 11:45–12:45 (and no quick create, no write)`, (await list.innerText()).startsWith('1 more') && listRows.join(' | ') === 'Review Kai 11:45–12:45' && (await page.locator('.pc-qc-title').count()) === 0 && state.writes.length === w0, JSON.stringify(listRows))
    await shot(page, 'more-list-day')
    await tap(cdp, list.locator('.kf-as-row', { hasText: 'Review Kai' }))
    await sleep(500)
    check(`${name} …a row opens it like a tap: the Task sheet over /calendar, the list gone`, (await taskSheet(page).count()) === 1 && new URL(page.url()).searchParams.get('task') === id(REVIEW) && (await page.locator('[role="dialog"]', { hasText: '1 more' }).count()) === 0, page.url())
    await page.keyboard.press('Escape')
    await sleep(500)
    await basics(page, name, errors)
    await ctx.close()
  }

  // Auto-scroll (Kai 2026-10-03): a lifted block dragged into the grid's top/bottom 48px scrolls it; the
  // block and the bubble keep tracking the finger on the 15-min grid; the day's ends stop it.
  sEdge: {
    if (!want('edge')) break sEdge
    const name = 'edge-day'
    const { ctx, page, cdp, errors, state } = await open()
    const g = await page.locator('.pc-scroll').boundingBox()
    const bottom = Math.round(g.y + g.height)
    const mid = Math.round(g.y + g.height / 2)
    const b = await block(page, 3).boundingBox()
    const f = { x: Math.round(b.x + 120), y: Math.round(b.y + 16) }
    const st0 = await scrollTop(page)
    const w0 = state.writes.length
    await drag(cdp, f, { hold: 550, dy: bottom - 12 - f.y, steps: 10, stepMs: 30, keep: true })
    await sleep(500)
    const stDeep = await scrollTop(page)
    check(`${name} a lifted block held 12px from the bottom edge scrolls the grid down`, stDeep > st0 + 100, `${st0} → ${stDeep}`)
    await shot(page, name) // mid-scroll: the block under the finger at the bottom edge, the bubble on it
    for (let i = 1; i <= 6; i++) {
      await touch(cdp, 'touchMove', [{ x: f.x, y: Math.round(bottom - 12 + ((mid - bottom + 12) * i) / 6) }])
      await sleep(30)
    }
    await sleep(300)
    const st1 = await scrollTop(page)
    await sleep(300)
    check(`${name} …out of the zone, it stops`, (await scrollTop(page)) === st1, `${st1} → ${await scrollTop(page)}`)
    const want1 = snap15(900 + ((mid - f.y + st1 - st0) * 60) / 64)
    const fingerAt = Math.abs((await yOf(page, hm(want1))) + 16 - mid)
    check(`${name} …the block stays under the finger through the scroll: bubble ${hm(want1)}, the block's start within a snap of the finger`, (await text(page.locator('.pc-bubble'))) === hm(want1) && fingerAt <= 8, `${await text(page.locator('.pc-bubble'))} · ${fingerAt}px`)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    const e1 = writesOf(state, 'calendar_events', w0)
    check(`${name} …drop → one write at ${hm(want1)} (30 min kept), "Moved to ${hm(want1)}"`, e1.length === 1 && e1[0].starts_at === iso(hm(want1)) && e1[0].ends_at === iso(hm(want1 + 30)) && (await toastSoon(page, `Moved to ${hm(want1)}`)), JSON.stringify(e1.map((x) => x.starts_at)))

    // Up: the top 48px scroll it back (from 19:15, clear of the "Moved" toast docked at the bottom).
    const b2 = await block(page, 3).boundingBox()
    const f2 = { x: Math.round(b2.x + 120), y: Math.round(b2.y + 16) }
    const st2 = await scrollTop(page)
    const w1 = state.writes.length
    await drag(cdp, f2, { hold: 550, dy: Math.round(g.y) + 12 - f2.y, steps: 10, stepMs: 30, keep: true })
    await sleep(400)
    const stUp = await scrollTop(page)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    const e2 = writesOf(state, 'calendar_events', w1)
    const m2 = e2[0] ? (Date.parse(e2[0].starts_at) - Date.parse(iso('00:00'))) / 60_000 : -1
    check(`${name} near the top edge it scrolls up, and the drop lands earlier, on the 15-min grid`, stUp < st2 - 100 && e2.length === 1 && m2 < want1 && m2 % 15 === 0, `${st2} → ${stUp} · ${e2[0]?.starts_at}`)

    // Past the bottom edge (the finger on the tab bar) is full speed — to the end of the day, where it stops.
    const b3 = await block(page, 3).boundingBox()
    const f3 = { x: Math.round(b3.x + 120), y: Math.round(b3.y + 16) }
    const w2 = state.writes.length
    await drag(cdp, f3, { hold: 550, dy: bottom + 20 - f3.y, steps: 10, stepMs: 30, keep: true })
    await sleep(2500)
    // 24:00 at the grid's bottom edge — not past it, though the lifted block's handle hangs below the canvas.
    const end = await page.locator('.pc-scroll').evaluate((e) => e.querySelector('.pc-canvas').offsetHeight - e.clientHeight)
    check(`${name} past the edge: full speed to the end of the day, where it stops (24:00 on the bottom edge); the block can't leave the day (23:30)`, (await scrollTop(page)) === end && (await text(page.locator('.pc-bubble'))) === '23:30', `${await scrollTop(page)} / ${end} · ${await text(page.locator('.pc-bubble'))}`)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    const e3 = writesOf(state, 'calendar_events', w2)
    check(`${name} …dropped there: 23:30–24:00`, e3.length === 1 && e3[0].starts_at === iso('23:30') && e3[0].ends_at === iso('00:00', 28), JSON.stringify(e3.map((x) => [x.starts_at, x.ends_at])))
    await basics(page, name, errors)
    await ctx.close()
  }
  // 7f + auto-scroll: a resize handle dragged into the bottom zone grows the block past the screen.
  sEdgeResize: {
    if (!want('edge')) break sEdgeResize
    const name = 'edge-resize-day'
    const { ctx, page, cdp, errors, state } = await open()
    const g = await page.locator('.pc-scroll').boundingBox()
    const bottom = Math.round(g.y + g.height)
    const mid = Math.round(g.y + g.height / 2) + 40
    const b = await block(page, 3).boundingBox()
    await drag(cdp, { x: b.x + 120, y: b.y + 16 }, { hold: 550, steps: 0 })
    await sleep(300)
    const hb = await page.locator('.pc-handle.is-bottom').boundingBox()
    const h = { x: Math.round(hb.x + hb.width / 2), y: Math.round(hb.y + hb.height / 2) }
    const st0 = await scrollTop(page)
    const w0 = state.writes.length
    await drag(cdp, h, { dy: bottom - 12 - h.y, steps: 8, stepMs: 30, keep: true })
    await sleep(400)
    for (let i = 1; i <= 6; i++) {
      await touch(cdp, 'touchMove', [{ x: h.x, y: Math.round(bottom - 12 + ((mid - bottom + 12) * i) / 6) }])
      await sleep(30)
    }
    await sleep(300)
    const st1 = await scrollTop(page)
    const end = snap15(930 + ((mid - h.y + st1 - st0) * 60) / 64)
    check(`${name} the bottom handle in the zone scrolls the grid; the bubble reads the new end ${hm(end)}`, st1 > st0 + 100 && (await text(page.locator('.pc-bubble'))).startsWith(`${hm(end)} ·`), `${st0} → ${st1} · ${await text(page.locator('.pc-bubble'))}`)
    await shot(page, name)
    await touch(cdp, 'touchEnd', [])
    await sleep(500)
    const e = writesOf(state, 'calendar_events', w0)
    check(`${name} …release → 15:00–${hm(end)}, "Resized to 15:00–${hm(end)}"`, e.length === 1 && e[0].starts_at === iso('15:00') && e[0].ends_at === iso(hm(end)) && (await toastSoon(page, `Resized to 15:00–${hm(end)}`)), JSON.stringify(e.map((x) => [x.starts_at, x.ends_at])))
    await basics(page, name, errors)
    await ctx.close()
  }

  // 7i — an empty day: the daisy's zero stage, one line, "Plan my day".
  s7i: {
    if (!want('7i')) break s7i
    const name = '7i-day'
    const { ctx, page, cdp, errors } = await open()
    await tap(cdp, page.locator('.pc-day').nth(4))
    await sleep(300)
    await shot(page, name)
    check(`${name} Thursday, Oct 1: daisy/future.png + "A clear day — tap any time to plan"`, (await title(page)) === 'Thursday, Oct 1' && (await page.locator('.pc-empty img').getAttribute('src')) === '/ds/assets/daisy/future.png' && (await text(page.locator('.pc-empty'))).includes('A clear day — tap any time to plan'))
    check(`${name} the strip: 1 selected, 27 ringed as today`, (await page.locator('.pc-day[aria-current]').innerText()).replace(/\s+/g, ' ') === 'T 1' && (await page.locator('.pc-day[data-today] .pc-day-n').evaluate((e) => getComputedStyle(e).boxShadow.includes('inset'))))
    await tapAt(cdp, { x: 200, y: (await yOf(page, '12:00')) + 8 })
    check(`${name} the hours around it stay tappable (quick create)`, (await dialog(page).locator('.pc-qc-title').count()) === 1)
    await page.keyboard.press('Escape')
    await sleep(400)
    // An all-day event (none are drawn on the grid): a chip row over the hours on its day only.
    await tap(cdp, page.locator('.pc-day').nth(5))
    check('all-day: Fri Oct 2 shows "Company offsite" in a chip row over the hours (not a clear day)', (await page.locator('.pc-allday-chip').allInnerTexts()).join() === 'Company offsite' && (await page.locator('.pc-block').count()) === 0 && (await page.locator('.pc-empty').count()) === 0)
    await tap(cdp, page.locator('.pc-allday-chip'))
    check('all-day: tap → its sheet, "Event · All day", no Time row (it stays a date)', (await text(dialog(page).locator('.pc-bs-meta'))) === 'EVENT · ALL DAY' && (await dialog(page).locator('.kf-as-row').count()) === 0)
    await page.keyboard.press('Escape')
    await sleep(400)
    await tap(cdp, page.locator('.pc-day').nth(4))
    check('all-day: not on the day before', (await page.locator('.pc-allday').count()) === 0)
    await tap(cdp, page.getByRole('button', { name: 'Plan my day' }))
    await sleep(800)
    check(`${name} Plan my day → the ritual sheet`, (await page.locator('[role="dialog"]', { hasText: 'Plan my day' }).count()) >= 1)
    await basics(page, name, errors.filter((e) => !/AudioContext|play\(\)/.test(e)))
    await ctx.close()
  }

  // 7j — loading with nothing cached: skeleton blocks and chips, then the day.
  s7j: {
    if (!want('7j')) break s7j
    const name = '7j-day'
    const { ctx, page, errors, state } = await open('/calendar', { hold: 5000 })
    await sleep(600)
    await shot(page, name)
    check(`${name} skeleton blocks + chips, the now line, no real blocks yet`, (await page.locator('.pc-skel').count()) === 3 && (await page.locator('.pc-chip.is-skel').count()) === 2 && (await page.locator('.pc-block').count()) === 0 && (await page.locator('.pc-nowtag').count()) === 1)
    state.hold = 0
    await sleep(5500)
    check(`${name} …then the day`, (await page.locator('.pc-block').count()) === 4 && (await page.locator('.pc-skel').count()) === 0)
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // 7k — offline: the chip under the title; a move queues and the block shows its pending ring.
  s7k: {
    if (!want('7k')) break s7k
    const name = '7k-day'
    const { ctx, page, cdp, errors, state } = await open()
    await ctx.setOffline(true)
    await sleep(500)
    check(`${name} "Offline — changes will sync" under the title`, (await text(page.locator('.pc-offline'))) === 'Offline — changes will sync')
    const b = await block(page, 3).boundingBox()
    const w0 = state.writes.length
    await drag(cdp, { x: b.x + 120, y: b.y + 16 }, { hold: 550, dy: 64, steps: 8, stepMs: 40 })
    await sleep(1200)
    await shot(page, name)
    check(`${name} the move is queued (nothing sent) and the block moved to 16:00–16:30`, writesOf(state, 'calendar_events', w0).length === 0 && (await text(block(page, 3))).includes('16:00–16:30'))
    check(`${name} …with its pending ring`, (await block(page, 3).locator('.pc-pending').count()) === 1)
    await ctx.setOffline(false)
    await basics(page, name, errors.filter((e) => !/Failed to fetch|NetworkError/.test(e)))
    await ctx.close()
  }
}

// ── Desktop 1280: the FullCalendar layout, unchanged (week view, the rail, no phone grid). ──
for (const theme of want('desktop') ? ['day', 'night'] : []) {
  const name = `desktop-${theme}`
  const { ctx, page, errors, state } = await open('/calendar', { view: desktop, theme })
  await shot(page, name)
  check(`${name} FullCalendar week + the rail, no phone grid`, (await page.locator('.fc').count()) === 1 && (await page.locator('.fc-timegrid-col').count()) >= 7 && (await page.locator('.cal-rail').count()) === 1 && (await page.locator('.pc').count()) === 0)
  check(`${name} the shell's top bar is still there`, await page.locator('.app-topbar').isVisible())
  if (theme === 'day') {
    await page.locator('.fc-event', { hasText: 'Lunch with Omar' }).first().click()
    await sleep(400)
    check(`${name} a block click still opens the details panel`, (await page.locator('input[placeholder="Add title"]').inputValue().catch(() => '')) === 'Lunch with Omar')
    await page.keyboard.press('Escape')
    await sleep(300)
    const w0 = state.writes.length
    await page.locator('.fc-event', { hasText: 'Call the' }).first().click({ button: 'right' })
    await page.getByText('Unschedule', { exact: true }).click()
    await sleep(400)
    check(`${name} right-click → Unschedule still writes the delete + "Unscheduled" toast (shared deleteEventWithUndo)`, writesOf(state, 'calendar_events', w0).some((e) => e.id === eid(3) && e.deleted_at) && (await toasts(page)).includes('Unscheduled · Call the tyre supplier'), JSON.stringify(await toasts(page)))
  }
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Side by side: the design frame | this build, same state. ──
if (DESIGN) {
  const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, ours] of [['7a', '7a-day'], ['7b', '7b-day'], ['7h', '7h-day'], ['7n', '7n-day'], ['7c', '7c-day'], ['7d', '7d-day'], ['7g', '7g-day'], ['7g2', '7g2-day'], ['7e', '7e-day'], ['7f', '7f-day'], ['7m', '7m-day'], ['7i', '7i-day'], ['7j', '7j-day'], ['7k', '7k-day'], ['7l-a', '7l-a-night'], ['7l-d', '7l-d-night']]) {
    const d = path.join(DESIGN, `design-${frame}.png`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(d) || !fs.existsSync(o)) continue
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff;align-items:flex-start"><div><div>design ${frame}</div><img src="${uri(d)}" style="width:390px"></div><div><div>build ${ours}</div><img src="${uri(o)}" style="width:390px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
