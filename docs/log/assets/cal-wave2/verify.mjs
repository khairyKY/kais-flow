// cal-wave2 (2026-10-13): Calendar §4 planning mode (4a/4b), 3e multi-day spans + midnight cuts,
// Editor 1b–1e (the full create page, the phone create sheet), the repeat split + shared Repeat
// picker, phone parity (Month, chip Complete / Open, Lists, the daisy on the user's clock) — on the
// REAL app against a MOCKED backend (the event-detail recipe: dev server `--mode mock` with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every
// REST call; writes are recorded AND applied to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=p4a,e3 runs some)
// The day: Friday 10 Jul 2026, Cairo (UTC+3) — Calendar.dc.html §4's own day — the clock at 13:20.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5256'
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000c4e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 6, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const tid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SHAHEEN = 'b0000000-0000-4000-8000-000000000001'
const FORECAST = 'b0000000-0000-4000-8000-000000000002'
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// Calendar.dc.html 4a's twelve, as drawn.
const TASKS = [
  task(1, 'Create official emails for Shaheen', { project_id: SHAHEEN, due_at: iso('09:00', 11) }),
  task(2, 'Draft social media kit for launch', { project_id: SHAHEEN, duration_min: 45 }),
  task(3, 'Book photographer for product shots', { project_id: SHAHEEN, duration_min: 15 }),
  task(4, 'Plan & implement forecasting logic', { project_id: FORECAST }),
  task(5, 'Write unit tests for trend model', { project_id: FORECAST }),
  task(6, 'Figure out linking GitHub accounts', { due_at: iso('09:00', 7), duration_min: 45 }),
  task(7, 'Audit ads performance', { recurrence_rule: 'FREQ=WEEKLY' }),
  task(8, 'Reply to Youssef about invoice', { duration_min: 15 }),
  task(9, 'Water the plants', { duration_min: 10, recurrence_rule: 'FREQ=DAILY' }),
  task(10, "Review Kai's Flow analytics dashboard"),
  task(11, 'Buy birthday present for Mama', { due_at: iso('09:00', 13) }),
  task(12, 'Renew car insurance', { duration_min: 15, due_at: iso('09:00', 18) }),
]
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, over.day ?? 10), ends_at: iso(to, over.endDay ?? over.day ?? 10), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: [], created_at: CREATED, updated_at: CREATED,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'day' && k !== 'endDay')),
})
const DEEP = 1, SYNC = 2, REVIEW = 3, TABLE = 4, OFFSITE = 5, NIGHT = 6, STANDUP = 7
const EVENTS = [
  ev(DEEP, 'Deep work — Forecasting', '09:00', '11:00', { type: 'time_block' }),
  ev(SYNC, 'Sync with Omar', '13:00', '13:45'),
  ev(REVIEW, 'Review portfolio', '15:00', '16:00', { type: 'time_block' }),
  ev(TABLE, 'Table group', '18:00', '19:00', { day: 11 }),
]
// 3e: a multi-day span (Mon 13 9 AM → Wed 15 3 PM) and a block over midnight (Tue 14 11 PM → Wed 1:30 AM);
// a weekly standup from Mon 13 for the repeat split.
const EVENTS_3E = [
  ev(OFFSITE, 'Offsite', '09:00', '15:00', { day: 13, endDay: 15 }),
  ev(NIGHT, 'Night shift', '23:00', '01:30', { day: 14, endDay: 15 }),
  ev(STANDUP, 'Standup', '08:30', '09:00', { day: 13, recurrence_rule: 'FREQ=DAILY' }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [
  { id: SHAHEEN, user_id: UID, name: 'Shaheen', domain_id: null, status: 'active', color: '#D4A8B0', created_at: CREATED, updated_at: CREATED, deleted_at: null },
  { id: FORECAST, user_id: UID, name: 'Forecasting', domain_id: null, status: 'active', color: '#7A946E', created_at: CREATED, updated_at: CREATED, deleted_at: null },
]
// Every first-run hint already seen (features/tour/help.ts keys), so they don't cover the frames.
const HINTS = [...fs.readFileSync(new URL('../../../../app/src/features/tour/help.ts', import.meta.url), 'utf8').matchAll(/(?:key|teaches|id): '([^']+)'/g)].map((m) => m[1])
const tables = (extra = []) => structuredClone({ tasks: TASKS, calendar_events: [...EVENTS, ...extra], inbox_items: [], projects: PROJECTS, domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: o.device ?? 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, planning, view, hints, uid]) => {
    localStorage.setItem(`kf-help:${uid}`, hints)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', checkedAt: 4102444800000 }))
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calPlanning', planning ? '1' : '0')
    localStorage.removeItem('kf.calPlanTab')
    localStorage.removeItem('kf.calPlanSort')
  }, [o.theme ?? 'day', JSON.stringify(session), !!o.planning, o.view ?? '', JSON.stringify(HINTS), UID])
  const state = { rows: tables(o.extra), writes: [] }
  if (o.settings) Object.assign(state.rows.app_settings[0], o.settings)
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      const rows = (state.rows[table] ??= [])
      if (req.method() === 'DELETE') {
        const gone = url.searchParams.get('id')?.replace(/^eq\./, '')
        state.rows[table] = rows.filter((x) => x.id !== gone)
      } else if (body && typeof body === 'object') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const i = rows.findIndex((x) => x.id === row.id)
          if (i === -1) rows.push(row)
          else rows[i] = { ...rows[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(o.clock ?? '13:20', o.day ?? 10) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  const start = state.writes.length
  for (let i = 0; i < 15 && state.writes.length === start; i++) await sleep(200)
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(500)
  }
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const fc = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]`).first()
const menu = (page, label = 'Block details') => page.locator(`[role="menu"][aria-label="${label}"]`).last()
/** Picks the desktop view from the ⌄ view-options popover (Day = "1", Week = "W", Month = "M"). */
async function pickView(page, cell) {
  await page.locator('.cal-head [aria-haspopup="dialog"]').click()
  await sleep(300)
  await page.locator('[role="dialog"]').getByRole('button', { name: cell, exact: true }).first().click()
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(500)
}

// ── P4A / P4B: planning mode — the grid collapses to a strip, the rail swells ──
if (want('p4a')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    await pickView(page, '1')
    // The toggle: the three dots on the rail's right edge.
    await page.getByRole('button', { name: /Planning mode/ }).click()
    await sleep(1200)
    const panel = page.locator('.cal-plan')
    check(`p4a ${theme}: planning mode opens — the rail swells, the strip shows one day`, (await panel.count()) === 1 && (await page.locator('.cal-strip .fc-timegrid-col[data-date]').count()) === 1)
    const head = await panel.locator('.cal-plan-head').innerText()
    check(`p4a ${theme}: "Unscheduled · 12 tasks" + the hand line`, /Unscheduled · 12 tasks/i.test(head) && /pick something, plant it on the right/.test(head), head.replace(/\n/g, ' | '))
    const groups = await panel.locator('.cal-plan-group-head').allInnerTexts()
    check(`p4a ${theme}: per-project groups with totals — Shaheen · 3 tasks · 1h 30m … No project last`, /Shaheen · 3 tasks · 1h 30m/i.test(groups[0]) && /Forecasting · 2 tasks · 1h/i.test(groups.join()) && /No project · 7 tasks/i.test(groups.at(-1)), JSON.stringify(groups))
    const foot = await panel.locator('.cal-plan-foot').innerText()
    check(`p4a ${theme}: the footer — "12 tasks · 5h 25m total" and today's blocks / free time`, /12 tasks · 5h 25m total/i.test(foot) && /3 blocked today · .* free/i.test(foot), foot.replace(/\n/g, ' | '))
    const free = await page.locator('.cal-strip .kf-free-label').allInnerTexts()
    check(`p4a ${theme}: the strip marks the free stretch after 16:00 ("4h free")`, free.some((f) => /4h free/i.test(f)), JSON.stringify(free))
    const card = await panel.locator('.cal-plan-card', { hasText: 'Figure out linking GitHub accounts' }).innerText()
    check(`p4a ${theme}: an overdue card reads "Overdue 3d" in terra, the rest "30m · Due tomorrow" / "↻ Weekly"`, /Overdue 3d/i.test(card) && /Due tomorrow/i.test(await panel.locator('.cal-plan-card', { hasText: 'Create official emails' }).innerText()) && /↻ Weekly/i.test(await panel.locator('.cal-plan-card', { hasText: 'Audit ads' }).innerText()), card)
    await page.mouse.move(0, 0)
    await shot(page, `p4a-planning-1day-${theme}`)
    if (theme === 'day') {
      // Tabs: Overdue lists one task.
      await panel.getByRole('button', { name: 'Overdue', exact: true }).click()
      await sleep(400)
      check('p4a tabs: Overdue lists the one overdue task', (await panel.locator('.cal-plan-card').count()) === 1)
      await panel.getByRole('button', { name: 'All', exact: true }).click()
      await sleep(300)
      // Sort ↕ ▸ Shortest first puts the 10m task first in No project.
      await panel.getByRole('button', { name: 'Sort ↕' }).click()
      await sleep(300)
      await page.locator('[role="menu"][aria-label="Sort"]').getByText('Shortest first').click()
      await sleep(400)
      const firstNoProject = await panel.locator('.cal-plan-group').last().locator('.cal-plan-card').first().innerText()
      check('p4a Sort ↕ Shortest first: "Water the plants" (10m) leads No project', /Water the plants/.test(firstNoProject), firstNoProject.split('\n')[0])
      // Drag a card onto the strip at 16:30 → its block lands there.
      await panel.locator('.cal-plan-card', { hasText: 'Reply to Youssef' }).scrollIntoViewIfNeeded()
      await sleep(300)
      const from = await panel.locator('.cal-plan-card', { hasText: 'Reply to Youssef' }).boundingBox()
      const slot = await page.locator('.cal-strip .fc-timegrid-slot-lane[data-time="16:30:00"]').first().boundingBox()
      const col = await page.locator('.cal-strip .fc-timegrid-col[data-date]').first().boundingBox()
      let w = state.writes.length
      await page.mouse.move(from.x + 40, from.y + 15)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(from.x + 40 + ((col.x + col.width / 2 - from.x - 40) * i) / 12, from.y + 15 + ((slot.y + 4 - from.y - 15) * i) / 12)
        await sleep(30)
      }
      await page.mouse.up()
      await settle(state)
      const placed = posts(state, 'calendar_events', w).find((e) => e.task_id === tid(8))
      check('p4a drag a card onto the strip: its block lands at 16:30, the card leaves the list', placed?.starts_at === iso('16:30') && (await panel.locator('.cal-plan-card', { hasText: 'Reply to Youssef' }).count()) === 0, JSON.stringify({ placed: placed?.starts_at, want: iso('16:30'), all: posts(state, 'calendar_events', w).map((e) => [e.title, e.starts_at]), slot, col, from }))
      await shot(page, 'p4a-after-drop')
      // A click (no drag) opens the Plan menu.
      await panel.locator('.cal-plan-card', { hasText: 'Renew car insurance' }).click()
      await sleep(400)
      const plan = await page.locator('[role="menu"]').last().innerText()
      check('p4a a click on a card opens the Plan menu (Today · Next free slot · Tomorrow · Pick date…)', /Today/.test(plan) && /Next free slot/.test(plan) && /Pick date/.test(plan), plan.replace(/\n/g, ' | '))
      await page.keyboard.press('Escape')
      // Leave: the dots on the strip's left edge.
      await page.getByRole('button', { name: /Leave planning mode/ }).click()
      await sleep(900)
      check('p4a leave planning mode: the rail and the grid are back', (await page.locator('.cal-plan').count()) === 0 && (await page.locator('.cal-head').count()) === 1)
    }
    check(`p4a ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

if (want('p4b')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, planning: true })
    await sleep(500)
    const cols = await page.locator('.cal-strip .fc-timegrid-col[data-date]').count()
    const range = await page.locator('.cal-strip-range').innerText().catch(() => '')
    check(`p4b ${theme}: from the week view, the strip holds two days ("Fri 10 — Sat 11")`, cols === 2 && /Fri 10 — Sat 11/.test(range), `${cols} ${range}`)
    check(`p4b ${theme}: one line a task, no groups; the hand line "two days ahead"`, (await page.locator('.cal-plan-card.is-compact').count()) === 12 && (await page.locator('.cal-plan-group').count()) === 0 && /two days ahead/.test(await page.locator('.cal-plan-hand').innerText()))
    const foot = await page.locator('.cal-plan-foot').innerText()
    check(`p4b ${theme}: footer "3 blocked today · 1 blocked tomorrow"`, /3 blocked today · 1 blocked tomorrow/i.test(foot), foot.replace(/\n/g, ' | '))
    const head = await page.locator('.cal-strip .cal-strip-dayhead').allInnerTexts()
    check(`p4b ${theme}: the day row reads "FRI · TODAY" / "SAT"`, /Fri · Today/i.test(head[0]) && /Sat/i.test(head[1]), JSON.stringify(head))
    await page.mouse.move(0, 0)
    await shot(page, `p4b-planning-2day-${theme}`)
    check(`p4b ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── E1: Editor 1b–1d — the popover's More options ↗ is the full create page (sidebar folded, Notes) ──
if (want('e1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme })
    // A click on an empty slot at 16:30 today opens the 2a popover.
    await page.locator('.fc-timegrid-slot-lane[data-time="16:30:00"]').first().scrollIntoViewIfNeeded()
    await sleep(300)
    const slot = await page.locator('.fc-timegrid-slot-lane[data-time="16:30:00"]').first().boundingBox()
    const col = await page.locator('.fc-timegrid-col.fc-day-today').first().boundingBox()
    await page.mouse.click(col.x + col.width / 2, slot.y + 6)
    await sleep(500)
    await shot(page, `e1-popover-${theme}`)
    await page.locator('.kf-quickcreate').getByRole('button', { name: 'Task', exact: true }).click()
    await page.locator('.kf-quickcreate input[aria-label="Title"]').fill('Call Omar re: pricing !! *deep-work')
    await page.locator('.kf-quickcreate').getByRole('button', { name: /More options/ }).click()
    await sleep(1200)
    check(`e1 ${theme}: More options ↗ opens the full page at /new (not a modal)`, page.url().endsWith('/new') && (await page.locator('.kf-scrim').count()) === 0 && (await page.getByRole('heading', { name: 'Something new' }).count()) === 1, page.url())
    check(`e1 ${theme}: the sidebar folds to the rail`, (await page.locator('.app-sidebar.collapsed').count()) === 1)
    check(`e1 ${theme}: what was typed came along (title, the caught !! and *deep-work)`, (await page.locator('input[aria-label="Title"]').inputValue()) === 'Call Omar re: pricing !! *deep-work' && /high/i.test(await page.locator('.kf-quickcreate').innerText()))
    await page.locator('textarea[aria-label="Notes"]').fill('Bring the Q3 numbers')
    await page.mouse.move(0, 0)
    await shot(page, `e1-create-task-${theme}`)
    if (theme === 'day') {
      await page.getByRole('button', { name: /^Event/ }).click()
      await sleep(300)
      await shot(page, 'e1-create-event-day')
      await page.getByRole('button', { name: /^Time block/ }).click()
      await sleep(300)
      await shot(page, 'e1-create-block-day')
      await page.getByRole('button', { name: /^Task/ }).click()
      await sleep(300)
      const w = state.writes.length
      await page.getByRole('button', { name: /Create task/ }).click()
      await settle(state)
      const t = posts(state, 'tasks', w).find((x) => x.notes === 'Bring the Q3 numbers')
      const b = posts(state, 'calendar_events', w).find((x) => x.task_id === t?.id)
      check('e1 Create task: the task carries its Notes, the caught priority and label, a clean title, and its block at the clicked 16:30', !!t && t.title === 'Call Omar re: pricing' && t.priority === 2 && t.labels?.includes('deep-work') && b?.starts_at === iso('16:30'), JSON.stringify({ title: t?.title, p: t?.priority, l: t?.labels, b: b?.starts_at }))
      check('e1 back on the calendar, the sidebar open again', page.url().endsWith('/calendar') && (await page.locator('.app-sidebar.collapsed').count()) === 0, page.url())
    }
    check(`e1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── E3: Calendar 3e — a multi-day span in the all-day band, a block cut at midnight (desktop + phone) ──
if (want('e3')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, extra: EVENTS_3E, day: 13, clock: '10:00' })
    await page.locator(`.fc-event[data-kf-id="${eid(NIGHT)}"]`).first().scrollIntoViewIfNeeded()
    await sleep(400)
    const segs = await page.locator('.fc-daygrid-event.kf-seg').allInnerTexts()
    check(`e3 ${theme}: the Offsite span is three pieces in the band — "Offsite »", "« »", "« ends 3:00 PM"`, segs.length === 3 && /^Offsite »$/.test(segs[0].trim()) && /^« »$/.test(segs[1].trim()) && /« ends 3:00 PM/.test(segs[2]), JSON.stringify(segs))
    const shapes = await page.locator('.fc-daygrid-event.kf-seg').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopLeftRadius + '/' + getComputedStyle(el).borderTopRightRadius))
    check(`e3 ${theme}: only the outer corners round`, shapes[0].startsWith('0px') === false && shapes[0].endsWith('/0px') && shapes[1] === '0px/0px' && shapes[2].startsWith('0px/'), JSON.stringify(shapes))
    check(`e3 ${theme}: the span is not also drawn in the time grid`, (await page.locator(`.fc-timegrid-event[data-kf-id="${eid(OFFSITE)}"]`).count()) === 0)
    const cuts = await page.locator(`.fc-timegrid-event[data-kf-id="${eid(NIGHT)}"] .kf-ev-cut`).allInnerTexts()
    check(`e3 ${theme}: the night shift is cut at midnight — "⌄ 1:30 AM" on Tue, "⌃ from 11:00 PM" on Wed`, cuts.some((c) => /⌄ 1:30 AM/.test(c)) && cuts.some((c) => /⌃ from 11:00 PM/.test(c)), JSON.stringify(cuts))
    // A click on a span piece opens the block itself.
    if (theme === 'day') {
      await page.locator('.fc-daygrid-event.kf-seg').nth(1).click()
      await sleep(500)
      check('e3 a click on a piece opens the span\'s own block menu', /Offsite/.test(await menu(page).locator('textarea').inputValue().catch(() => '')))
      await page.keyboard.press('Escape')
      await sleep(300)
    }
    await page.mouse.move(0, 0)
    await shot(page, `e3-desktop-${theme}`)
    check(`e3 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
    // Phone: Tue 14 (the cut's first day) and Wed 15.
    const ph = await open('/calendar?date=2026-07-14', { theme, extra: EVENTS_3E, day: 13, clock: '10:00', view: phone })
    await ph.page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = el.scrollHeight })
    await sleep(400)
    const chip = await ph.page.locator('.pc-allday-chip').allInnerTexts()
    const into = await ph.page.locator('.pc-block.is-cut-into .pc-cut').allInnerTexts()
    check(`e3 phone ${theme}: the span's chip reads "« Offsite »" mid-way; the night shift ends "⌄ 01:30" at the cut`, chip.some((c) => /« Offsite »/.test(c)) && into.some((c) => /⌄ 01:30/.test(c)), JSON.stringify({ chip, into }))
    await shot(ph.page, `e3-phone-${theme}`)
    check(`e3 phone ${theme}: no page errors`, ph.errors.length === 0, ph.errors.join(' | '))
    await ph.ctx.close()
  }
}

// ── R1: Repeat changed from a LATER occurrence keeps the earlier ones (the split); the shared picker ──
if (want('r1')) {
  const { ctx, page, errors, state } = await open('/calendar', { extra: EVENTS_3E, day: 13, clock: '10:00' })
  // Standup is daily from Mon 13 08:30; open Wed 15's.
  const occ = `${eid(STANDUP)}::${iso('08:30', 15)}`
  await fc(page, occ).scrollIntoViewIfNeeded()
  await fc(page, occ).click()
  await menu(page).waitFor({ timeout: 4000 })
  await sleep(300)
  await menu(page).getByRole('menuitem', { name: /Repeats daily/ }).click()
  await sleep(400)
  const items = await page.locator('[role="menu"]').last().getByRole('menuitem').allInnerTexts()
  check('r1 the Repeat submenu is the shared picker — Never · Daily ✓ · Weekly · Monthly · Custom…', /Never/.test(items[0]) && items.some((i) => /Daily ✓/.test(i)) && items.some((i) => /Custom…/.test(i)), JSON.stringify(items))
  await shot(page, 'r1-repeat-menu')
  let w = state.writes.length
  await page.locator('[role="menu"]').last().getByRole('menuitem', { name: 'Weekly', exact: true }).click()
  await settle(state)
  const written = posts(state, 'calendar_events', w)
  const head = written.find((e) => e.id === eid(STANDUP))
  const tail = written.find((e) => e.id !== eid(STANDUP))
  check('r1 Weekly from Wed 15: the series ends before it (UNTIL) and a new weekly one starts on it — Mon 13 and Tue 14 stay', /UNTIL=20260715T052959Z/.test(head?.recurrence_rule ?? '') && tail?.recurrence_rule === 'FREQ=WEEKLY' && tail?.starts_at === iso('08:30', 15), JSON.stringify({ head: head?.recurrence_rule, tail: [tail?.recurrence_rule, tail?.starts_at] }))
  await sleep(500)
  const shown = await page.locator(`.fc-event[data-kf-id^="${eid(STANDUP)}::"]`).count()
  check('r1 Mon 13 and Tue 14 still show the standup', shown >= 2, shown)
  check('r1 one Undo toast', await toastSoon(page, 'Repeats weekly · from'))
  w = state.writes.length
  await page.locator('.kf-toast', { hasText: 'Repeats weekly' }).getByRole('button', { name: 'Undo' }).first().click()
  await settle(state)
  check('r1 Undo puts the daily series back and drops the new one', posts(state, 'calendar_events', w).some((e) => e.id === eid(STANDUP) && e.recurrence_rule === 'FREQ=DAILY') && state.writes.slice(w).some((x) => x.method === 'DELETE'))
  // Custom…: the rule editor takes the popover's place.
  await fc(page, occ).click()
  await menu(page).waitFor({ timeout: 4000 })
  await menu(page).getByRole('menuitem', { name: /Repeats daily/ }).click()
  await sleep(300)
  await page.locator('[role="menu"]').last().getByRole('menuitem', { name: 'Custom…' }).click()
  await sleep(500)
  check('r1 Custom… opens the rule editor', (await page.getByText('Custom repeat').count()) >= 1)
  await shot(page, 'r1-custom-editor')
  await page.keyboard.press('Escape')
  await sleep(300)
  check('r1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R2 (conductor 2026-10-13): Mon–Fri picked on a SATURDAY block — it stays as a one-off, the series
// starts Monday, one Undo ──
if (want('r2')) {
  const { ctx, page, errors, state } = await open('/calendar')
  await fc(page, eid(TABLE)).scrollIntoViewIfNeeded()
  await fc(page, eid(TABLE)).click()
  await menu(page).waitFor({ timeout: 4000 })
  await sleep(300)
  await menu(page).getByRole('menuitem', { name: /Does not repeat/ }).click()
  await sleep(300)
  await page.locator('[role="menu"]').last().getByRole('menuitem', { name: 'Custom…' }).click()
  await sleep(500)
  for (const d of ['Sat', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await page.getByRole('button', { name: d, exact: true }).last().click()
  await shot(page, 'r2-custom-weekdays')
  const w = state.writes.length
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await settle(state)
  const written = posts(state, 'calendar_events', w)
  const series = written.find((e) => e.id === eid(TABLE))
  const keep = written.find((e) => e.id !== eid(TABLE))
  check('r2 the series starts Mon 13 18:00 on Mon–Fri; Saturday 18:00 stays as a one-off of it', series?.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' && series?.starts_at === iso('18:00', 13) && keep?.starts_at === iso('18:00', 11) && keep?.series_id === eid(TABLE) && !keep?.recurrence_rule, JSON.stringify({ series: series && [series.recurrence_rule, series.starts_at], keep: keep && [keep.starts_at, keep.series_id] }))
  await sleep(600)
  check('r2 on the grid: the Saturday block is still there, and Monday has the series', (await page.locator(`.fc-event[data-kf-id="${keep?.id}"]`).count()) === 1 && (await page.locator(`.fc-event[data-kf-id="${eid(TABLE)}::${iso('18:00', 13)}"]`).count()) === 1)
  await shot(page, 'r2-saturday-kept')
  check('r2 one Undo toast — "· from Mon 13"', await toastSoon(page, 'from Mon 13'))
  const w2 = state.writes.length
  await page.locator('.kf-toast', { hasText: 'from Mon 13' }).getByRole('button', { name: 'Undo' }).first().click()
  await settle(state)
  check('r2 Undo: the one-off back as it was, the copy gone', posts(state, 'calendar_events', w2).some((e) => e.id === eid(TABLE) && !e.recurrence_rule && e.starts_at === iso('18:00', 11)) && state.writes.slice(w2).some((x) => x.method === 'DELETE'))
  check('r2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── PH: phone parity — create sheet (7c / 1e), Month, Lists, a chip's Complete / Open ──
if (want('ph')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme, view: phone })
    // Tap an empty slot at 16:00.
    await page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = 64 * 15 })
    await sleep(300)
    const canvas = await page.locator('.pc-canvas').boundingBox()
    const track = await page.locator('.pc-track').boundingBox()
    await page.mouse.click(track.x + 60, canvas.y + 64 * 16 + 4)
    await sleep(700)
    const kinds = await page.locator('.pc-qc-top button').allInnerTexts()
    check(`ph ${theme}: the create sheet offers Task · Event · Block`, kinds.slice(0, 3).map((k) => k.replace(/[^A-Za-z]/g, '')).join() === 'Task,Event,Block', JSON.stringify(kinds))
    await page.locator('.pc-qc-title').fill('Pick up the new tyres !!')
    await sleep(300)
    const chips = await page.locator('.ts-chips').innerText()
    check(`ph ${theme}: the task sheet's chips — P2 caught from "!!", Project, Remind, Repeat, + Label, Top-3, notes`, /P2/.test(chips) && /project/i.test(chips) && /remind/i.test(chips) && /repeat/i.test(chips) && /top-3/i.test(chips) && (await page.locator('textarea[aria-label="Notes"]').count()) === 1, chips.replace(/\n/g, ' | '))
    await shot(page, `ph-create-task-${theme}`)
    if (theme === 'day') {
      // Repeat ▸ Weekly through the shared picker; then Save.
      await page.locator('.ts-chips').getByText('Repeat', { exact: true }).click()
      await sleep(400)
      await page.locator('[role="dialog"]').last().getByText('Weekly', { exact: true }).click()
      await sleep(400)
      await page.locator('textarea[aria-label="Notes"]').fill('Ask about the warranty')
      const w = state.writes.length
      await page.getByRole('button', { name: 'Save' }).click()
      await settle(state)
      const t = posts(state, 'tasks', w).find((x) => x.title === 'Pick up the new tyres')
      check('ph Save: the task with P2, its notes and its weekly repeat, and its block at 16:00', !!t && t.priority === 2 && t.notes === 'Ask about the warranty' && posts(state, 'tasks', w).some((x) => x.id === t.id && x.recurrence_rule === 'FREQ=WEEKLY') && posts(state, 'calendar_events', w).some((e) => e.task_id === t.id && e.starts_at === iso('16:00')), JSON.stringify(t && { p: t.priority, n: t.notes }))
      // Block kind holds a task.
      await page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = 64 * 16 })
      await sleep(300)
      const canvas2 = await page.locator('.pc-canvas').boundingBox()
      await page.mouse.click(track.x + 60, canvas2.y + 64 * 18 + 4)
      await sleep(700)
      await page.locator('.pc-qc-top button', { hasText: 'Block' }).click()
      await sleep(300)
      await shot(page, 'ph-create-block-day')
      await page.getByText('Holds a task…').click()
      await sleep(400)
      await page.keyboard.type('Water')
      await sleep(300)
      await shot(page, 'ph-holds-picker-day')
      await page.getByText('Water the plants', { exact: true }).last().click()
      await sleep(400)
      const w2 = state.writes.length
      await page.getByRole('button', { name: 'Save' }).click()
      await settle(state)
      check('ph Block holding a task: that task gets its block at 18:00', posts(state, 'calendar_events', w2).some((e) => e.task_id === tid(9) && e.starts_at === iso('18:00')))
      // Month view.
      await page.locator('.pc-title').click()
      await sleep(400)
      await page.locator('[role="dialog"]').last().getByText('Month', { exact: true }).click()
      await sleep(700)
      check('ph Month: the title reads "July 2026", a grid of whole weeks with dots on the busy days', /July 2026/.test(await page.locator('.pc-title').innerText()) && (await page.locator('.pc-mcell').count()) === 35 && (await page.locator('.pc-mcell[data-today] .pc-mdots i').count()) >= 3)
      await shot(page, 'ph-month-day')
      await page.locator('.pc-mcell', { hasText: '11' }).first().click()
      await sleep(600)
      check('ph Month: a tap opens that day', /Saturday, Jul 11/.test(await page.locator('.pc-title').innerText()))
      // Lists segment.
      await shot(page, 'ph-after-month-day')
      await page.locator('.pc-segs').getByText(/^Lists/).click()
      await sleep(400)
      const listChips = await page.locator('.pc-uns .pc-chip').allInnerTexts()
      check('ph Lists: the strip lists This Week (a scope chip first)', /This Week/.test(listChips[0] ?? ''), JSON.stringify(listChips.slice(0, 3)))
      await page.locator('.pc-uns .pc-chip').first().click()
      await sleep(400)
      await page.locator('[role="dialog"]').last().getByText('Project…').click()
      await sleep(700)
      await page.locator('[role="dialog"]').last().getByText('Shaheen', { exact: true }).click()
      await sleep(600)
      const shaheen = await page.locator('.pc-uns .pc-chip').allInnerTexts()
      check('ph Lists ▸ Project… ▸ Shaheen lists its unscheduled tasks', /Shaheen/.test(shaheen[0]) && shaheen.length >= 3, JSON.stringify(shaheen))
      await shot(page, 'ph-lists-day')
      // A chip: Complete from its sheet.
      await page.locator('.pc-uns .pc-chip', { hasText: 'Book photographer' }).click()
      await sleep(600)
      const rows = await page.locator('[role="dialog"]').last().innerText()
      check('ph a chip\'s sheet offers Complete and Open task, not only the slots', /Complete/.test(rows) && /Open task/.test(rows), rows.replace(/\n/g, ' | ').slice(0, 200))
      await shot(page, 'ph-chip-sheet-day')
      const w3 = state.writes.length
      await page.locator('[role="dialog"]').last().getByText('Complete', { exact: true }).click()
      await settle(state)
      check('ph Complete ticks the task off (with Undo)', posts(state, 'tasks', w3).some((x) => x.id === tid(3) && x.status === 'done') && (await toastSoon(page, 'Done')), JSON.stringify(posts(state, 'tasks', w3).map((x) => [x.title, x.status])) + ' ' + (await page.locator('.kf-toast-msg').allInnerTexts()).join('|'))
    }
    check(`ph ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── TL: the task editor's Labels open the shared Label picker (conductor 2026-10-13) ──
if (want('tl')) {
  const { ctx, page, errors, state } = await open(`/tasks/${tid(2)}`)
  await page.getByRole('button', { name: '+ label' }).click()
  await sleep(500)
  await page.keyboard.type('launch')
  await page.keyboard.press('Enter')
  await settle(state)
  check('tl the editor\'s "+ label" opens the Label picker; Enter makes and adds "launch"', posts(state, 'tasks').some((t) => t.id === tid(2) && t.labels?.includes('launch')), JSON.stringify(posts(state, 'tasks').map((t) => t.labels)))
  await page.keyboard.press('Escape')
  await sleep(400)
  check('tl the chip shows on the editor', (await page.getByRole('button', { name: /Labels: launch/ }).count()) === 1)
  await shot(page, 'tl-editor-labels')
  check('tl no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
