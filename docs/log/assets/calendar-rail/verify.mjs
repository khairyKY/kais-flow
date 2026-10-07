// The calendar's planning rail + replanning (Kai 2026-10-07) on the REAL app against a MOCKED backend —
// the calendar-phone recipe: the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up
// session sits in localStorage, and Playwright answers every REST call with the day below. Writes are
// answered 201, go nowhere, and are recorded so each gesture's write can be checked.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Wednesday 7 Oct 2026, Cairo (UTC+3), the clock at 14:40.
//   - "Crypto — heavy session" (1h30) was on the calendar yesterday 20:00 and was missed → Overdue, its
//     block stuck in the past.  - "Send the tax papers" was due Monday → Overdue 2d.
//   - "Review Kai" due today 17:00 and "Pick the 3" (Top 3) → Today.  - two inbox captures → Inbox.
//   - "Call the tyre supplier" 16:00–16:30 and "Read 2 pages" 11:00–11:10 are planned (on the grid).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5272'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day ──
const cairo = (hhmm, day = 7) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '14:40'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const CRYPTO = 1, PAPERS = 2, REVIEW = 3, STAR = 4, TYRE = 5, READ = 6, DEEP = 7
const TASKS = [
  task(CRYPTO, 'Crypto — heavy session', { duration_min: 90, due_at: iso('09:00', 6), scheduled_start: iso('20:00', 6), scheduled_end: iso('21:30', 6) }),
  task(PAPERS, 'Send the tax papers', { due_at: iso('09:00', 5) }),
  task(REVIEW, 'Review Kai', { duration_min: 30, due_at: iso('17:00') }),
  task(STAR, 'Pick the 3', { top3: true }),
  task(TYRE, 'Call the tyre supplier', { duration_min: 30, due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:30') }),
  task(READ, 'Read 2 pages', { duration_min: 10, scheduled_start: iso('11:00'), scheduled_end: iso('11:10') }),
  task(DEEP, 'Deep work — forecasting the quarterly numbers', { duration_min: 90, scheduled_start: iso('09:00'), scheduled_end: iso('10:30') }),
]
const ev = (n, title, from, to, day = 7, taskN = null, type) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [
  ev(1, 'Crypto — heavy session', '20:00', '21:30', 6, CRYPTO),
  ev(2, 'Lunch with Omar', '13:00', '14:00'),
  ev(3, 'Call the tyre supplier', '16:00', '16:30', 7, TYRE),
  ev(4, 'Gym', '18:00', '19:00', 7, null, 'time_block'),
  ev(5, 'Read 2 pages', '11:00', '11:10', 7, READ),
  ev(6, 'Deep work — forecasting the quarterly numbers', '09:00', '10:30', 7, DEEP),
]
const inboxItem = (n, raw, over = {}) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00'), ...over,
})
const INBOX = [
  inboxItem(1, 'buy printer ink 15m', { ai_parse: { cleaned_text: 'Buy printer ink', confidence: 0.9 }, payload: { duration_override: 15 } }),
  inboxItem(2, 'Call the bank about the card', { kind: 'voice' }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: INBOX, projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, extra]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
  }, [o.theme ?? 'day', JSON.stringify(session), o.storage ?? {}])
  const state = { rows: o.rows ?? tables(), writes: [] }
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
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1000)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const flat = (s) => s.replace(/\s+/g, ' ').trim()
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
/** The outbox flushes on its own clock: wait until no write has landed for 400ms. */
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const deletes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE')
const sec = (page, s) => page.locator(`.cal-rail-sec[data-section="${s}"]`)
const card = (page, s, title) => sec(page, s).locator('.unscheduled-task', { hasText: title })
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]`)
const menuItem = (page, label) => page.locator('[role="menu"] [role="menuitem"]', { hasText: label }).first()
const dialog = (page) => page.locator('[role="dialog"]').last()

/** Scroll the desktop grid so `hhmm` is near the top, and return the screen point of that slot in today's column. */
async function slotPoint(page, hhmm, date = '2026-10-07') {
  await page.evaluate((t) => {
    const slot = document.querySelector(`td.fc-timegrid-slot-lane[data-time="${t}:00"]`)
    const scroller = slot?.closest('.fc-scroller')
    // well clear of FullCalendar's 50px edge auto-scroll zone, which would nudge the drop a quarter
    if (slot && scroller) scroller.scrollTop = slot.closest('tr').offsetTop - scroller.clientHeight / 2
  }, hhmm)
  await sleep(200)
  const lane = await page.locator(`td.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`).boundingBox()
  const col = await page.locator(`td.fc-timegrid-col[data-date="${date}"]`).boundingBox()
  return { x: col.x + col.width / 2, y: lane.y + 5 }
}
async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(600)
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
/** The date picker's Set time → `hhmm` → Done (desktop popover or phone sheet). */
async function setTime(page, hhmm, tapFn) {
  const click = tapFn ?? ((loc) => loc.click())
  await click(page.getByRole('button', { name: 'Set time' }).last())
  await sleep(300)
  const row = page.locator('.kf-pk-time', { hasText: hhmm }).first()
  await row.scrollIntoViewIfNeeded()
  await click(row)
  await click(page.getByRole('button', { name: 'Done' }).last())
  await sleep(500)
}

// ═══ Desktop 1280 ═══
for (const theme of ['day', 'night']) {
  const night = theme === 'night'

  // D1 — the rail: Overdue · Today · Inbox (· Lists, folded), open by itself because there's a pile.
  d1: {
    if (!want('d1')) break d1
    const name = `rail-${theme}`
    const { ctx, page, errors } = await open('/calendar', { theme })
    await shot(page, name)
    const heads = await page.locator('.cal-rail-sec-head').allInnerTexts()
    check(`${name} four sections with counts: Overdue 2 · Today 2 · Inbox 2 · Lists`, flat(heads.join(' | ')).toUpperCase().startsWith('OVERDUE 2 | TODAY 2 | INBOX 2 | LISTS'), flat(heads.join(' | ')))
    check(`${name} the rail is open by itself (an overdue pile, no fold chosen)`, (await page.locator('.cal-rail:not(.is-folded)').count()) === 1)
    const od = await sec(page, 'overdue').locator('.unscheduled-task').allInnerTexts()
    check(`${name} Overdue: the tax papers (2d) then the crypto session (its block missed yesterday, 1d)`, od.length === 2 && /Send the tax papers[\s\S]*OVERDUE 2D/i.test(od[0]) && /Crypto — heavy session[\s\S]*OVERDUE 1D/i.test(od[1]), JSON.stringify(od.map(flat)))
    check(`${name} Overdue's label is terra`, await sec(page, 'overdue').locator('.cal-rail-sec-head span').nth(0).evaluate((e) => getComputedStyle(e).color !== getComputedStyle(e.parentElement).color))
    const td = await sec(page, 'today').locator('.unscheduled-task').allInnerTexts()
    check(`${name} Today: Review Kai (17:00, no time on the calendar) and the Top 3 pick — not the planned tyre call`, td.length === 2 && /Review Kai/.test(td[0]) && /Pick the 3/.test(td[1]), JSON.stringify(td.map(flat)))
    const ib = await sec(page, 'inbox').locator('.unscheduled-task').allInnerTexts()
    check(`${name} Inbox: the AI's cleaned title ("Buy printer ink") and the voice capture`, ib.length === 2 && /Buy printer ink/.test(ib[0]) && /Call the bank/.test(ib[1]), JSON.stringify(ib.map(flat)))
    check(`${name} every card has Plan ▾`, (await page.locator('.cal-rail .unscheduled-task .cal-plan-btn').count()) === 6)
    check(`${name} Lists is folded by default`, (await sec(page, 'lists').locator('.cal-rail-cards').count()) === 0)
    // Fold a section; it stays folded on reload (per device).
    await sec(page, 'today').locator('.cal-rail-sec-head').click()
    check(`${name} a section folds on its header (aria-expanded false, cards gone)`, (await sec(page, 'today').locator('.cal-rail-sec-head').getAttribute('aria-expanded')) === 'false' && (await sec(page, 'today').locator('.unscheduled-task').count()) === 0)
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(800)
    check(`${name} …and stays folded after a reload`, (await sec(page, 'today').locator('.cal-rail-sec-head').getAttribute('aria-expanded')) === 'false')
    await sec(page, 'today').locator('.cal-rail-sec-head').click()
    // Folding the whole rail: the person's choice wins, and the tab keeps the overdue count in terra.
    await page.getByRole('button', { name: 'Hide unscheduled tasks' }).click()
    await sleep(300)
    await shot(page, `rail-folded-${theme}`)
    const tab = page.locator('.cal-rail-tab-label')
    check(`${name} folded by hand → the tab reads "Overdue · 2" in terra`, flat(await text(tab)).toUpperCase() === 'OVERDUE · 2' && (await tab.evaluate((e) => e.style.color)) === 'var(--acc-terra)', await text(tab))
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(800)
    check(`${name} …the fold is respected after a reload (the count still shows)`, (await page.locator('.cal-rail.is-folded').count()) === 1 && flat(await text(tab)).toUpperCase() === 'OVERDUE · 2')
    await page.locator('.cal-rail-tab').click()
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (night) continue

  // D2 — the 4am case by drag: the crypto card from Overdue onto today 04:00. Its missed block MOVES
  // (same id, 1h30 kept) — no second block — the due date follows, and it leaves Overdue.
  d2: {
    if (!want('d2')) break d2
    const name = 'drop-4am-day'
    const { ctx, page, errors, state } = await open()
    await sleep(1000) // FullCalendar's own opening scroll first
    const to = await slotPoint(page, '04:00')
    const from = center(await card(page, 'overdue', 'Crypto').boundingBox())
    const w0 = state.writes.length
    await mouseDrag(page, from, to)
    await settle(state)
    const evs = posts(state, 'calendar_events', w0)
    check(`${name} one write: the missed block moved to today 04:00–05:30 (same id, no new block)`, evs.length === 1 && evs[0].id === eid(1) && evs[0].starts_at === iso('04:00') && evs[0].ends_at === iso('05:30') && !evs[0].deleted_at, JSON.stringify(evs.map((e) => [e.id, e.starts_at, e.ends_at])))
    const t = posts(state, 'tasks', w0).filter((x) => x.id === id(CRYPTO)).at(-1)
    check(`${name} the task's schedule is 04:00 and its missed due date followed (no longer overdue anywhere)`, t?.scheduled_start === iso('04:00') && t?.due_at === iso('04:00'), JSON.stringify(t && [t.scheduled_start, t.due_at]))
    check(`${name} "Scheduled · Crypto — heavy session" + Undo`, await toastSoon(page, 'Scheduled · Crypto — heavy session'))
    const box = await fcBlock(page, 1).boundingBox()
    check(`${name} the block is on today's grid at 04:00, in view`, !!box && box.y > 0 && box.y < 800 && (await text(fcBlock(page, 1))).includes('Crypto'), JSON.stringify(box))
    check(`${name} it left Overdue (one card there now)`, (await sec(page, 'overdue').locator('.unscheduled-task').count()) === 1)
    await shot(page, name)
    const w1 = state.writes.length
    await page.locator('.kf-toast', { hasText: 'Scheduled · Crypto' }).getByRole('button', { name: 'Undo' }).click()
    await sleep(500)
    await settle(state)
    const back = posts(state, 'calendar_events', w1)
    check(`${name} Undo → the block back on yesterday 20:00, the due date back, Overdue 2 again`, back.some((e) => e.id === eid(1) && e.starts_at === iso('20:00', 6)) && posts(state, 'tasks', w1).some((x) => x.id === id(CRYPTO) && x.due_at === iso('09:00', 6)) && (await sec(page, 'overdue').locator('.unscheduled-task').count()) === 2)
    // An inbox capture dropped on the grid: filed (the AI's title) and blocked there for its 15m.
    await card(page, 'inbox', 'Buy printer ink').scrollIntoViewIfNeeded()
    const to2 = await slotPoint(page, '15:00')
    const w2 = state.writes.length
    await mouseDrag(page, center(await card(page, 'inbox', 'Buy printer ink').boundingBox()), to2)
    await sleep(800)
    await settle(state)
    const nt = posts(state, 'tasks', w2).find((x) => x.title === 'Buy printer ink')
    const nb = posts(state, 'calendar_events', w2).find((x) => nt && x.task_id === nt.id)
    const filed = posts(state, 'inbox_items', w2).find((x) => x.id === iid(1))
    check(`${name} an inbox card dropped at 15:00 → filed as "Buy printer ink" + its 15m block 15:00–15:15, the item marked filed`, !!nt && nb?.starts_at === iso('15:00') && nb?.ends_at === iso('15:15') && filed?.status === 'filed' && filed?.filed_task_id === nt.id, JSON.stringify([nt?.title, nb?.starts_at, nb?.ends_at, filed?.status]))
    check(`${name} …one toast for both: "Scheduled · Buy printer ink"`, await toastSoon(page, 'Scheduled · Buy printer ink'))
    const w3 = state.writes.length
    await page.locator('.kf-toast', { hasText: 'Scheduled · Buy printer ink' }).getByRole('button', { name: 'Undo' }).click()
    await sleep(1500)
    await settle(state)
    const un = [posts(state, 'calendar_events', w3).some((x) => x.id === nb?.id && x.deleted_at), deletes(state, 'tasks', w3).length, posts(state, 'inbox_items', w3).some((x) => x.id === iid(1) && x.status === 'pending'), await sec(page, 'inbox').locator('.unscheduled-task').count()]
    check(`${name} …Undo → the block off, the task removed, the capture back in the Inbox`, un.join() === 'true,1,true,2', JSON.stringify(un))
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // D3 — the 4am case through the menus: Plan ▾ → Pick date… → Set time 04:00 (a time → on the
  // calendar, and the grid scrolls to it), and the task's own right-click Pick date… (the desktop
  // submenu that drops the picker's flag — 04:00 isn't the 09:00 a date alone lands on).
  d3: {
    if (!want('d3')) break d3
    const name = 'plan-4am-day'
    const { ctx, page, errors, state } = await open()
    await card(page, 'overdue', 'Send the tax papers').locator('.cal-plan-btn').click()
    await sleep(300)
    const items = (await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map(flat)
    check(`${name} Plan ▾ (a 30m task at 14:40): Today · Next free slot · 14:45 · Tomorrow first thing · 08:00 · Pick date…`, JSON.stringify(items) === JSON.stringify(['Today', 'Next free slot · 14:45', 'Tomorrow first thing · 08:00', 'Pick date… ▸']), JSON.stringify(items))
    await shot(page, 'plan-menu-day')
    await menuItem(page, 'Pick date…').click()
    await sleep(300)
    const w0 = state.writes.length
    await setTime(page, '04:00')
    await settle(state)
    const e = posts(state, 'calendar_events', w0)
    check(`${name} Pick date… → Set time 04:00 → a block today 04:00–04:30 for the tax papers`, e.length === 1 && e[0].task_id === id(PAPERS) && e[0].starts_at === iso('04:00') && e[0].ends_at === iso('04:30'), JSON.stringify(e.map((x) => [x.task_id, x.starts_at])))
    await sleep(400)
    const bb = await page.locator('.fc-event', { hasText: 'Send the tax papers' }).first().boundingBox()
    check(`${name} …and the grid scrolled to it: the 04:00 block is on screen`, !!bb && bb.y > 100 && bb.y < 780, JSON.stringify(bb))
    await shot(page, name)
    // Right-click Review Kai (Today) → Pick date… ▸ → Set time 04:00 → Done.
    await card(page, 'today', 'Review Kai').click({ button: 'right' })
    await sleep(300)
    await menuItem(page, 'Pick date').click()
    await sleep(300)
    const w1 = state.writes.length
    await setTime(page, '04:00')
    await settle(state)
    const e1 = posts(state, 'calendar_events', w1)
    check(`${name} the task's right-click Pick date… → Set time 04:00 → it's on the calendar at 04:00 (a time = a block)`, e1.length === 1 && e1[0].task_id === id(REVIEW) && e1[0].starts_at === iso('04:00'), JSON.stringify(e1.map((x) => [x.task_id, x.starts_at])))
    check(`${name} …and its due time is 04:00`, posts(state, 'tasks', w1).some((x) => x.id === id(REVIEW) && x.due_at === iso('04:00')))
    // A date alone stays a date: Plan ▾ → Today on the crypto session — its stuck block comes off.
    const w2 = state.writes.length
    await card(page, 'overdue', 'Crypto').locator('.cal-plan-btn').click()
    await menuItem(page, 'Today').click()
    await sleep(500)
    await settle(state)
    check(`${name} Plan ▾ → Today (a date alone): the missed block comes off, the task moves to Today with no time`, posts(state, 'calendar_events', w2).some((x) => x.id === eid(1) && x.deleted_at) && posts(state, 'tasks', w2).some((x) => x.id === id(CRYPTO) && x.due_at === iso('09:00') && x.scheduled_start === null) && (await card(page, 'today', 'Crypto').count()) === 1)
    check(`${name} …"Planned · Today" + Undo`, await toastSoon(page, 'Planned · Today'))
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // D4 — the stuck block on the grid: muted, "Overdue · Replan"; Replan moves THAT block.
  d4: {
    if (!want('d4')) break d4
    const name = 'overdue-block-day'
    const { ctx, page, errors, state } = await open()
    await page.locator('.cal-main span', { hasText: '‹' }).first().click() // the week before
    await sleep(600)
    await page.evaluate(() => {
      const slot = document.querySelector('td.fc-timegrid-slot-lane[data-time="19:00:00"]')
      slot.closest('.fc-scroller').scrollTop = slot.closest('tr').offsetTop - 80
    })
    await sleep(300)
    const b = fcBlock(page, 1)
    await b.scrollIntoViewIfNeeded()
    // A narrow column (this week view at 1280 / 125%) drops the word and keeps the link whole.
    const narrow = await b.evaluate((e) => !!e.closest('.kf-cal-narrow'))
    check(`${name} yesterday's missed block reads "${narrow ? 'Replan' : 'Overdue · Replan'}" in terra, muted (opacity .55)`, flat(await text(b)).toUpperCase().endsWith(narrow ? 'REPLAN' : 'OVERDUE · REPLAN') && (await b.evaluate((e) => e.classList.contains('kf-overdue') && getComputedStyle(e).opacity === '0.55')), flat(await text(b)))
    const inside = await b.evaluate((e) => { const r = e.getBoundingClientRect(); const l = e.querySelector('.kf-ev-replan').getBoundingClientRect(); return l.right <= r.right + 0.5 && l.bottom <= r.bottom + 0.5 })
    check(`${name} …the Replan link sits whole inside the block`, inside)
    await shot(page, name)
    await b.locator('.kf-ev-replan').click()
    await page.locator('[role="menu"]').waitFor({ timeout: 3000 }).catch(() => {})
    check(`${name} Replan opens the Plan menu (not the details panel, no drag)`, (await page.locator('[role="menu"]').count()) === 1 && (await page.locator('input[placeholder="Add title"]').count()) === 0)
    const w0 = state.writes.length
    await menuItem(page, 'Next free slot').click()
    await sleep(700)
    await settle(state)
    const e = posts(state, 'calendar_events', w0)
    check(`${name} Next free slot → the same block moves to today 16:30–18:00 (1h30 kept), nothing left on yesterday`, e.length === 1 && e[0].id === eid(1) && e[0].starts_at === iso('16:30') && e[0].ends_at === iso('18:00'), JSON.stringify(e.map((x) => [x.id, x.starts_at])))
    check(`${name} …the grid went to today's week and shows it there, once`, (await page.locator('.fc-event', { hasText: 'Crypto' }).count()) === 1 && (await page.locator('td.fc-timegrid-col[data-date="2026-10-07"] .fc-event', { hasText: 'Crypto' }).count()) === 1)
    await shot(page, 'overdue-replanned-day')
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
    // Right-click on a missed block also offers Replan… (a fresh page: the data as it was).
    const o2 = await open()
    await o2.page.locator('.cal-main span', { hasText: '‹' }).first().click()
    await sleep(500)
    await fcBlock(o2.page, 1).scrollIntoViewIfNeeded()
    await fcBlock(o2.page, 1).click({ button: 'right', position: { x: 10, y: 4 } })
    await sleep(300)
    check(`${name} right-click on it: "Replan…" beside Edit Task`, (await o2.page.locator('[role="menuitem"]', { hasText: 'Replan…' }).count()) === 1)
    await o2.ctx.close()
  }

  // D5 — the details panel reads as editable: field chrome on title / date / times, hover, focus,
  // the pointer, a time's list opening in place; a missed block offers Replan and its day moves.
  d5: {
    if (!want('d5')) break d5
    for (const t of ['day', 'night']) {
      const name = `details-${t}`
      const { ctx, page, errors, state } = await open('/calendar', { theme: t })
      await page.locator('.fc-event', { hasText: 'Lunch with Omar' }).first().click()
      await sleep(400)
      const fields = await page.evaluate(() => {
        const look = (el) => {
          const s = getComputedStyle(el)
          return { border: s.borderTopWidth + ' ' + s.borderTopStyle, bg: s.backgroundColor, cursor: s.cursor, radius: s.borderTopLeftRadius }
        }
        return {
          title: look(document.querySelector('input[aria-label="Title"]')),
          date: look(document.querySelector('.edp-when button')),
          start: look(document.querySelector('input[aria-label="Start time"]')),
          end: look(document.querySelector('input[aria-label="End time"]')),
        }
      })
      // (1px at 125% interface size computes as 0.8px)
      const chrome = (f) => /^0?\.?\d+(\.\d+)?px solid$/.test(f.border) && parseFloat(f.border) > 0 && f.radius === '6px' && f.bg !== 'rgba(0, 0, 0, 0)'
      check(`${name} title, date and both times wear field chrome (a solid border, radius 6, filled)`, chrome(fields.title) && chrome(fields.date) && chrome(fields.start) && chrome(fields.end), JSON.stringify(fields))
      check(`${name} …the date and times point; the title is a text field`, fields.date.cursor === 'pointer' && fields.start.cursor === 'pointer' && fields.title.cursor === 'text')
      check(`${name} the date shows Wed 7 Oct, the times 1:00 PM – 2:00 PM (the user's clock)`, flat(await text(page.locator('.edp-when button'))).toUpperCase().startsWith('WED 7 OCT') && (await page.locator('input[aria-label="Start time"]').inputValue()) === '1:00 PM' && (await page.locator('input[aria-label="End time"]').inputValue()) === '2:00 PM')
      const before = await page.locator('input[aria-label="End time"]').evaluate((e) => getComputedStyle(e).borderTopColor)
      await page.locator('input[aria-label="End time"]').hover()
      await sleep(200)
      const hover = await page.locator('input[aria-label="End time"]').evaluate((e) => getComputedStyle(e).borderTopColor)
      check(`${name} hover darkens a field's border`, hover !== before, `${before} → ${hover}`)
      await page.locator('input[aria-label="Start time"]').click()
      await sleep(300)
      const list = page.locator('[role="listbox"]')
      check(`${name} click a time → its list opens in place, under the field, with a focus ring`, (await list.count()) === 1 && (await page.locator('input[aria-label="Start time"]').evaluate((e) => getComputedStyle(e).boxShadow !== 'none')) && Math.abs((await list.boundingBox()).x - (await page.locator('input[aria-label="Start time"]').boundingBox()).x) < 40)
      await shot(page, name)
      const w0 = state.writes.length
      await list.locator('[role="option"]', { hasText: /^1:30 PM$/ }).click()
      await page.getByRole('button', { name: 'Save' }).click()
      await sleep(400)
      await settle(state)
      const e = posts(state, 'calendar_events', w0)
      check(`${name} pick 1:30 PM → Save → one write 13:30–14:00 on the user's clock`, e.length === 1 && e[0].starts_at === iso('13:30') && e[0].ends_at === iso('14:00'), JSON.stringify(e.map((x) => [x.starts_at, x.ends_at])))
      if (t === 'day') {
        // A missed task block: "Overdue" + Replan ▾, and its date field moves it to today.
        await page.locator('.cal-main span', { hasText: '‹' }).first().click()
        await sleep(500)
        await fcBlock(page, 1).scrollIntoViewIfNeeded()
        await fcBlock(page, 1).click({ position: { x: 30, y: 6 } })
        await sleep(400)
        const replan = page.getByRole('button', { name: 'Replan ▾' })
        check(`${name} a missed task block's panel: "Overdue" + Replan ▾`, (await replan.count()) === 1 && (await replan.evaluate((e) => e.previousElementSibling?.textContent)) === 'Overdue')
        await shot(page, 'details-overdue-day')
        await page.locator('.edp-when button').click()
        await sleep(300)
        await page.locator('.kf-pk-pop .kf-as-row', { hasText: 'Today' }).click()
        await sleep(200)
        const w1 = state.writes.length
        await page.getByRole('button', { name: 'Save' }).click()
        await sleep(400)
        await settle(state)
        const m = posts(state, 'calendar_events', w1)
        check(`${name} …date → Today → Save: the same block moves to today 20:00–21:30, none left behind`, m.length === 1 && m[0].id === eid(1) && m[0].starts_at === iso('20:00') && m[0].ends_at === iso('21:30'), JSON.stringify(m.map((x) => [x.id, x.starts_at])))
        await shot(page, 'details-moved-day')
      }
      check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// ═══ Phone 390 ═══
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
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
async function hold(cdp, p) {
  await touch(cdp, 'touchStart', [p])
  await sleep(600)
  await touch(cdp, 'touchEnd', [])
  await sleep(500)
}
const seg = (page, label) => page.locator('.pc-segs [role="radio"]', { hasText: label })
const pcBlock = (page, n) => page.locator(`.pc-block[data-id="${eid(n)}"]`)
const yOf = (page, hhmm) =>
  page.locator('.pc-canvas').evaluate((c, t) => {
    const [h, m] = t.split(':').map(Number)
    return c.getBoundingClientRect().top + ((h * 60 + m) * 64) / 60
  }, hhmm)
async function phoneBasics(page, name, errors) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}

for (const theme of ['day', 'night']) {
  const night = theme === 'night'

  // P1 — the strip: Overdue · Today · Inbox with counts; Overdue first (there's a pile); chips per segment.
  p1: {
    if (!want('p1')) break p1
    const name = `phone-strip-${theme}`
    const { ctx, page, cdp, errors } = await open('/calendar', { view: phone, theme })
    await shot(page, name)
    const segs = (await page.locator('.pc-segs [role="radio"]').allInnerTexts()).map(flat)
    check(`${name} segments "Overdue 2 · Today 2 · Inbox 2", Overdue chosen`, JSON.stringify(segs) === JSON.stringify(['Overdue 2', 'Today 2', 'Inbox 2']) && (await seg(page, 'Overdue').getAttribute('aria-checked')) === 'true', JSON.stringify(segs))
    const sb = await page.locator('.pc-segs .rt-seg-row').boundingBox()
    const opts = await page.locator('.pc-segs [role="radio"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    check(`${name} the segment row is a 48px target row (options 40 inside it)`, Math.round(sb.height) >= 48 && opts.every((h) => h === 40), `${sb.height} · ${opts}`)
    const chips = (await page.locator('.pc-chip').allInnerTexts()).map(flat)
    check(`${name} Overdue chips: the tax papers 2D, the crypto session 1D`, JSON.stringify(chips) === JSON.stringify(['Send the tax papers 2D', 'Crypto — heavy session 1D']), JSON.stringify(chips))
    const hits = await page.locator('.pc-chip').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const a = getComputedStyle(e, '::after'); return r.height + parseFloat(a.top === 'auto' ? 0 : -parseFloat(a.top)) * 2 }))
    check(`${name} chips keep a 48px hit (40 + the ::after)`, hits.every((h) => h >= 48), JSON.stringify(hits))
    if (!night) {
      await tap(cdp, seg(page, 'Today'))
      check(`${name} Today → Review Kai · Pick the 3`, JSON.stringify((await page.locator('.pc-chip .pc-chip-t').allInnerTexts())) === JSON.stringify(['Review Kai', 'Pick the 3']))
      await tap(cdp, seg(page, 'Inbox'))
      check(`${name} Inbox → Buy printer ink · Call the bank about the card`, JSON.stringify((await page.locator('.pc-chip .pc-chip-t').allInnerTexts())) === JSON.stringify(['Buy printer ink', 'Call the bank about the card']))
      await shot(page, 'phone-strip-inbox-day')
    }
    await phoneBasics(page, name, errors)
    await ctx.close()
  }
  if (night) continue

  // P2 — 7g from an Overdue chip: one tap on a slot MOVES the missed block (same id); the 4am case
  // via "Pick a time…"; an inbox chip files and blocks.
  p2: {
    if (!want('p2')) break p2
    const name = 'phone-schedule-day'
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
    await tap(cdp, page.locator('.pc-chip', { hasText: 'Crypto' }))
    const d = dialog(page)
    check(`${name} Schedule · CRYPTO — HEAVY SESSION · 1H30 (its missed block's length)`, flat(await text(d.locator('.kf-pk-meta'))).toUpperCase() === 'CRYPTO — HEAVY SESSION · 1H30', await text(d.locator('.kf-pk-meta')))
    await shot(page, name)
    await tap(cdp, d.locator('.kf-as-row', { hasText: 'Pick a time' }))
    const row = page.locator('.kf-pk-time', { hasText: '04:00' }).first()
    await row.scrollIntoViewIfNeeded()
    await tap(cdp, row)
    const w0 = state.writes.length
    await tap(cdp, page.getByRole('button', { name: 'Done' }))
    await sleep(500)
    await settle(state)
    const e = posts(state, 'calendar_events', w0)
    check(`${name} Pick a time… 04:00 → the missed block moves to today 04:00–05:30 (same id, no second block)`, e.length === 1 && e[0].id === eid(1) && e[0].starts_at === iso('04:00') && e[0].ends_at === iso('05:30'), JSON.stringify(e.map((x) => [x.id, x.starts_at])))
    const bb = await pcBlock(page, 1).boundingBox()
    const g = await page.locator('.pc-scroll').boundingBox()
    check(`${name} …and it's on today's grid, scrolled into view`, !!bb && bb.y >= g.y - 2 && bb.y < g.y + g.height, JSON.stringify([bb, g]))
    check(`${name} …the Overdue count drops to 1`, flat(await text(seg(page, 'Overdue'))).endsWith('1'))
    await shot(page, 'phone-4am-day')
    await tap(cdp, seg(page, 'Inbox'))
    await tap(cdp, page.locator('.pc-chip', { hasText: 'Buy printer ink' }))
    const w1 = state.writes.length
    await tap(cdp, dialog(page).locator('.kf-pk-slot').first())
    await sleep(500)
    await settle(state)
    const nt = posts(state, 'tasks', w1).find((x) => x.title === 'Buy printer ink')
    const nb = posts(state, 'calendar_events', w1).find((x) => nt && x.task_id === nt.id)
    check(`${name} an inbox chip → a slot → filed as "Buy printer ink" + a 15m block, the capture filed`, !!nt && !!nb && Date.parse(nb.ends_at) - Date.parse(nb.starts_at) === 15 * 60_000 && posts(state, 'inbox_items', w1).some((x) => x.id === iid(1) && x.status === 'filed'), JSON.stringify(nb))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // P3 — the stuck block on the phone grid (yesterday): muted, "Overdue · Replan"; a tap is the Replan
  // sheet (with the way into the task); a slot moves THAT block.
  p3: {
    if (!want('p3')) break p3
    const name = 'phone-replan-day'
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
    const g = await page.locator('.pc-scroll').boundingBox()
    await touch(cdp, 'touchStart', [{ x: 200, y: g.y + 200 }])
    for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', [{ x: 200 + i * 22, y: g.y + 200 }]); await sleep(25) }
    await touch(cdp, 'touchEnd', [])
    await sleep(700)
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = 19 * 64))
    await sleep(300)
    const b = pcBlock(page, 1)
    check(`${name} yesterday: the missed block reads "Overdue · Replan", muted`, flat(await text(b)).toUpperCase().includes('OVERDUE · REPLAN') && (await b.evaluate((e) => getComputedStyle(e).opacity)) === '0.55', flat(await text(b)))
    await shot(page, name)
    await tap(cdp, b.locator('.pc-name'))
    const d = dialog(page)
    check(`${name} a tap → the Replan sheet (Next free · Pick a time · Pick a date · Open task)`, flat(await text(d)).startsWith('Replan') && (await d.locator('.kf-as-row', { hasText: 'Open task' }).count()) === 1, flat(await text(d)).slice(0, 80))
    await shot(page, 'phone-replan-sheet-day')
    const w0 = state.writes.length
    await tap(cdp, d.locator('.kf-pk-slot').first())
    await sleep(500)
    await settle(state)
    const e = posts(state, 'calendar_events', w0)
    check(`${name} a slot → the same block moves to today 16:30 (1h30), the grid follows to today`, e.length === 1 && e[0].id === eid(1) && e[0].starts_at === iso('16:30') && e[0].ends_at === iso('18:00') && flat(await text(page.locator('.pc-title'))).startsWith('Wednesday'), JSON.stringify(e.map((x) => [x.id, x.starts_at])))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // P4 — the task sheet's date chip → Pick date → Set time 04:00: the overdue task lands on the calendar.
  p4: {
    if (!want('p4')) break p4
    const name = 'phone-tasksheet-4am-day'
    const { ctx, page, cdp, errors, state } = await open(`/calendar?task=${id(PAPERS)}`, { view: phone })
    const ts = page.locator('[role="dialog"]').filter({ has: page.locator('.ts-top') })
    await tap(cdp, ts.locator('.ts-chips .kf-chip').first())
    await sleep(400)
    await tap(cdp, page.locator('.kf-pk-day[aria-current="date"]')) // today (the picker opens on this month)
    const w0 = state.writes.length
    await setTime(page, '04:00', (loc) => tap(cdp, loc))
    await settle(state)
    const e = posts(state, 'calendar_events', w0)
    check(`${name} Date chip → Set time 04:00 → Done: the tax papers get a block today 04:00–04:30`, e.length === 1 && e[0].task_id === id(PAPERS) && e[0].starts_at === iso('04:00') && e[0].ends_at === iso('04:30'), JSON.stringify(e.map((x) => [x.task_id, x.starts_at])))
    check(`${name} …its sheet shows "On your calendar · Wed 7 · 04:00–04:30"`, flat(await text(ts.locator('.ts-block small'))).toUpperCase().includes('04:00–04:30'), await text(ts.locator('.ts-block small')))
    await shot(page, name)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // P5 — Kai's screenshots: a 10-minute block reads (24 tall, one compact line, an 18px checkbox, the
  // handles outside its text); a 1h30 block wraps its title over lines with the time on its own line.
  p5: {
    if (!want('p5')) break p5
    const name = 'phone-blocks-day'
    const { ctx, page, cdp, errors } = await open('/calendar', { view: phone })
    await page.locator('.pc-scroll').evaluate((e) => (e.scrollTop = 8.5 * 64))
    await sleep(300)
    const r = pcBlock(page, 5)
    const m = await r.evaluate((e) => {
      const name = e.querySelector('.pc-name')
      const time = e.querySelector('.pc-time')
      const box = e.querySelector('.kf-checkbox')?.getBoundingClientRect()
      return { h: e.getBoundingClientRect().height, compact: e.classList.contains('is-compact'), nameClipped: name.scrollHeight > name.clientHeight + 1, nameFits: name.getBoundingClientRect().bottom <= e.getBoundingClientRect().bottom + 0.5, time: time?.innerText, check: box && [Math.round(box.width), Math.round(box.height)] }
    })
    check(`${name} "Read 2 pages" (10 min) draws 24 tall, compact, its title whole on one line with its time`, m.h >= 24 && m.compact && !m.nameClipped && m.nameFits && m.time === '11:00–11:10', JSON.stringify(m))
    check(`${name} …its checkbox is a whole 18px box`, m.check && m.check[0] === 18 && m.check[1] === 18, JSON.stringify(m.check))
    const deep = await pcBlock(page, 6).evaluate((e) => {
      const name = e.querySelector('.pc-name')
      const time = e.querySelector('.pc-time')
      return { lines: Math.round(name.getBoundingClientRect().height / 18), ellipsed: name.scrollHeight > name.clientHeight + 1, timeOwnLine: time.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1, text: name.innerText }
    })
    check(`${name} the 1h30 "Deep work — forecasting the quarterly numbers" wraps (2–3 lines, nothing cut) with its time on its own line`, deep.lines >= 2 && !deep.ellipsed && deep.timeOwnLine, JSON.stringify(deep))
    await shot(page, name)
    const rb = await r.boundingBox()
    await hold(cdp, { x: rb.x + 150, y: rb.y + rb.height / 2 })
    const lifted = await r.evaluate((e) => {
      const b = e.getBoundingClientRect()
      const name = e.querySelector('.pc-name').getBoundingClientRect()
      const top = e.querySelector('.pc-handle.is-top > i').getBoundingClientRect()
      const bot = e.querySelector('.pc-handle.is-bottom > i').getBoundingClientRect()
      return { lifted: e.classList.contains('is-lifted'), topClear: top.bottom <= name.top + 1, botClear: bot.top >= name.bottom - 1, b: [Math.round(b.top), Math.round(b.bottom)], name: [Math.round(name.top), Math.round(name.bottom)], top: Math.round(top.bottom), bot: Math.round(bot.top) }
    })
    check(`${name} lifted: the two handles sit outside its text (above and below it)`, lifted.lifted && lifted.topClear && lifted.botClear, JSON.stringify(lifted))
    await shot(page, 'phone-short-lifted-day')
    await page.keyboard.press('Escape')
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // P6 — Kai's screenshot: tap 14:00 at 14:40, open the time: the draft never draws over the Time sheet,
  // and the list opens on the next quarter (14:45), not the past.
  p6: {
    if (!want('p6')) break p6
    const name = 'phone-quick-time-day'
    const { ctx, page, cdp, errors } = await open('/calendar', { view: phone })
    // +14px (14:13, still the 14:00 slot): a tap 8px under Lunch's end snaps to Lunch (Chrome's touch adjustment, as a finger would).
    await tapAt(cdp, { x: 200, y: (await yOf(page, '14:00')) + 14 })
    await sleep(300)
    const held = await page.locator('.pc-held').boundingBox()
    check(`${name} the draft 14:00–14:30 is drawn over the quick-create scrim, clear above its sheet`, flat(await text(page.locator('.pc-held'))).includes('14:00–14:30') && held.y + held.height <= (await dialog(page).boundingBox()).y, JSON.stringify(held))
    await tap(cdp, dialog(page).locator('.kf-chip').first())
    await sleep(500)
    check(`${name} with the Time sheet open, the draft is gone from over it`, (await page.locator('.pc-held').count()) === 0)
    const sel = await page.locator('.kf-pk-time[aria-selected="true"]').innerText().catch(() => '')
    check(`${name} the list opens selected on 14:45 (the next quarter), not 14:00`, flat(sel).startsWith('14:45'), sel)
    const row = page.locator('.kf-pk-time', { hasText: '13:15' }).first()
    await row.scrollIntoViewIfNeeded()
    const hit = await row.evaluate((e) => {
      const r = e.getBoundingClientRect()
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.kf-pk-time') === e
    })
    check(`${name} …its 13:15 row is the sheet's own (nothing from the grid on top)`, hit)
    await shot(page, name)
    await phoneBasics(page, name, errors)
    await ctx.close()
  }

  // P7 — the phone event sheet reads as editable: the title is a field, Date and Time rows; a rename writes.
  p7: {
    if (!want('p7')) break p7
    const name = 'phone-event-sheet-day'
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
    await tap(cdp, pcBlock(page, 2).locator('.pc-name'))
    const d = dialog(page)
    await sleep(300)
    const hb = await page.locator('.pc-held').boundingBox()
    check(`${name} the block stays in view above its sheet, never over it`, !!hb && hb.y + hb.height <= (await d.boundingBox()).y, JSON.stringify([hb, await d.boundingBox()]))
    const t = d.locator('input[aria-label="Title"]')
    const look = await t.evaluate((e) => { const s = getComputedStyle(e); return [s.borderTopStyle, s.backgroundColor !== 'rgba(0, 0, 0, 0)', Math.round(e.getBoundingClientRect().height)] })
    check(`${name} the title is a field (border, fill, 52 tall)`, (await t.inputValue()) === 'Lunch with Omar' && look[0] === 'solid' && look[1] && look[2] === 52, JSON.stringify(look))
    const rows = (await d.locator('.kf-as-row').allInnerTexts()).map(flat)
    check(`${name} Date (Wed 7) and Time (13:00–14:00) rows, each a 48+ tap row with a chevron`, rows.length === 2 && rows[0].startsWith('Date') && rows[1].startsWith('Time') && (await d.locator('.kf-as-row').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 48))), JSON.stringify(rows))
    await shot(page, name)
    const w0 = state.writes.length
    await t.fill('Lunch with Omar & Sam')
    await t.press('Enter')
    await sleep(400)
    await settle(state)
    check(`${name} rename → Done → one write with the new title, "✓ Saved"`, posts(state, 'calendar_events', w0).some((x) => x.id === eid(2) && x.title === 'Lunch with Omar & Sam') && flat(await text(d.locator('.pc-bs-save'))).includes('SAVED'))
    await phoneBasics(page, name, errors)
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
