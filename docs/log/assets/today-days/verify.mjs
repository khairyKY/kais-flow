// today-days: Today's ‹ › and date picker (Kai 2026-10-23) — another day to look at and plan. Arrows,
// the picker (desktop popover, phone sheet), ?day= across a reload, Shift+←/→, a future day's contents
// and planting its 3 (the evening ritual's seeds, `ritual.seeded` for that date), a past day's calm
// summary (done · left open · its line · routines ticked, reopen and Move only), Back to today — day and
// night, desktop and phone. Same mocked backend as today-shell/verify.mjs (its setup copied).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 26 Oct 2026, Cairo (UTC+3 until the 29th, UTC+2 after). Desktop 1280×800, phone 390×844.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5306'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').some((p) => k.startsWith(p))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Cairo wall time → instant. Egypt's summer time ends the night of Thu 29 Oct 2026.
const cairo = (hhmm, day = 26, month = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  const off = month === 10 && day <= 29 ? 3 : 2
  return new Date(Date.UTC(2026, month - 1, day, h - off, m))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const TODAY = '2026-10-26'
const TOMORROW = '2026-10-27'
const PAST = '2026-10-24'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const T = { GOAL: 1, LOGIC: 2, TODAYTASK: 3, LETTER: 10, DENTIST: 11, WATER: 12, RENT: 13, MUM: 14, PASSPORT: 20, INVOICE: 30, GARAGE: 31, GATE: 32 }
const TASKS = [
  // today
  task(T.GOAL, 'Deliver the MVP of the forecasting app', { top3: true, top3_rank: 1, due_at: iso('09:00') }),
  task(T.LOGIC, 'Plan the forecasting logic', { top3: true, top3_rank: 2 }),
  task(T.TODAYTASK, 'Reply to Salma', { due_at: iso('12:00') }),
  // tomorrow
  task(T.LETTER, 'Draft the quarterly letter', { due_at: iso('09:00', 27) }),
  task(T.DENTIST, 'Dentist', { scheduled_start: iso('10:00', 27), scheduled_end: iso('11:00', 27), duration_min: 60 }),
  task(T.WATER, 'Water the plants', { due_at: iso('18:00', 27) }),
  task(T.RENT, 'Pay the rent', { due_at: iso('11:30', 27) }),
  task(T.MUM, 'Call Mum', { due_at: iso('19:00', 27) }),
  // Tue 3 Nov
  task(T.PASSPORT, 'Renew the passport', { due_at: iso('09:00', 3, 11) }),
  // Sat 24 Oct (past)
  task(T.INVOICE, 'Send the invoice', { status: 'done', completed_at: iso('11:00', 24), top3_rank: 1, due_at: iso('09:00', 24) }),
  task(T.GARAGE, 'Tidy the garage', { status: 'done', completed_at: iso('16:00', 24) }),
  task(T.GATE, 'Fix the gate', { due_at: iso('09:00', 24) }),
]
const ev = (n, title, from, to, day, taskN = null) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [
  ev(1, 'Deep work', '09:00', '11:00', 26),
  ev(2, 'Dentist', '10:00', '11:00', 27, T.DENTIST),
  ev(3, 'Team sync', '13:00', '13:30', 27),
  ev(4, 'Lunch with Salma', '13:00', '14:00', 24),
]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Tidy the desk', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at, day) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at, day) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(s) {
  const log = [T.GOAL, T.LOGIC].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  // Last night's Shut down planted "Pay the rent" for Tue 27 — the evening's own seed.
  if (s.seeded) log.push(act(40, 'ritual.seeded', 'task', id(T.RENT), { ritual: 'evening', step: 'seeds', for_date: TOMORROW, date: '2026-10-25' }, '21:00', 25))
  return {
    tasks: structuredClone(TASKS),
    calendar_events: structuredClone(EVENTS),
    projects: [],
    app_settings: [SETTINGS],
    routines: ROUTINES,
    routine_completions: [
      { id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') },
      { id: 'c2000000-0000-4000-8000-000000000002', user_id: UID, routine_id: ROUTINES[0].id, completed_on: PAST, created_at: iso('07:10', 24) },
      { id: 'c2000000-0000-4000-8000-000000000003', user_id: UID, routine_id: ROUTINES[1].id, completed_on: PAST, created_at: iso('07:12', 24) },
    ],
    inbox_items: [],
    activity_log: log,
    journal_entries: [{ id: 'f1000000-0000-4000-8000-000000000001', user_id: UID, entry_date: PAST, body: 'A slow, good Saturday — the garage is finally clear.', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: iso('21:30', 24), updated_at: iso('21:30', 24) }],
    time_entries: [],
    domains: [],
    areas: [],
    slipping: [],
    resurfaced_log: [],
  }
}

/** PostgREST filters the app sends (eq / neq / in / gte / gt / lte / lt / is), enough for the mock. `or`
 * isn't read — a superset, which the app's own rules (seededTaskIds' for_date) narrow again. */
function filterRows(rows, url) {
  let out = rows
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const m = v.match(/^(not\.)?(eq|neq|in|gte|gt|lte|lt|is)\.(.*)$/)
    if (!m) continue
    const [, not, op, raw] = m
    const val = (x) => (x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : x)
    const test = (r) => {
      const a = r[k]
      if (op === 'eq') return String(a) === raw
      if (op === 'neq') return String(a) !== raw
      if (op === 'is') return a === val(raw)
      if (op === 'in') return raw.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(a))
      if (a == null) return false
      return op === 'gte' ? a >= raw : op === 'gt' ? a > raw : op === 'lte' ? a <= raw : a < raw
    }
    out = out.filter((r) => (not ? !test(r) : test(r)))
  }
  return out
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(at, s = {}, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-26T00:00:00Z') }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(s), writes: [] }
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
          if (i === -1) rows.push({ created_at: new Date().toISOString(), ...row })
          else rows[i] = { ...rows[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(at) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${o.path ?? '/today'}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = async (page, name, top = true) => {
  if (top) await page.evaluate(() => document.querySelector('.app-main-content')?.scrollTo(0, 0))
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
async function tap(cdp, page, loc) {
  const p = center(await loc.boundingBox())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
}
const dayParam = (page) => new URL(page.url()).searchParams.get('day')
const seeds = (state, from = 0) => posts(state, 'activity_log', from).filter((r) => r.event_type === 'ritual.seeded' || r.event_type === 'ritual.unseeded')
const noErrors = (tag, errors) => check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
const main = (page) => page.locator('.app-main-content')

// ── D · desktop, day + night: the bar, ›, a future day, planting its 3, reload, the keys, the picker, a past day ──
for (const theme of ['day', 'night']) {
  if (!want(`d-${theme}`)) continue
  const tag = `d-${theme}`
  const { ctx, page, errors, state } = await open('09:40', {}, { theme })
  const nav = page.locator('.td-daynav')
  check(`${tag} Today: ‹ the date › — the date is a button that opens the picker`, (await nav.getByRole('button', { name: 'Previous day' }).count()) === 1 && (await nav.getByRole('button', { name: 'Next day' }).count()) === 1 && (await text(page.locator('.td-date'))) === 'Monday, October 26' && (await page.locator('.td-date button').count()) === 1, await text(page.locator('.td-date')))
  check(`${tag} …no Back to today on today; the Now card and the rituals as before`, (await page.getByRole('button', { name: 'Back to today' }).count()) === 0 && (await page.locator('.td-now').count()) === 1 && (await page.locator('section[aria-label="Rituals"] .td-rit').count()) === 2)
  await shot(page, `${tag}-today`)

  // See tomorrow: 1 click.
  await nav.getByRole('button', { name: 'Next day' }).click()
  await sleep(700)
  check(`${tag} › (1 click) → ?day=${TOMORROW}, "Tuesday, October 27"`, dayParam(page) === TOMORROW && (await text(page.locator('.td-date'))) === 'Tuesday, October 27', `${page.url()} · ${await text(page.locator('.td-date'))}`)
  check(`${tag} …Back to today shows`, (await page.getByRole('button', { name: 'Back to today' }).count()) === 1)
  const three = page.locator('section[aria-label="Tomorrow\'s three"]')
  const list = page.locator('section[aria-label="Tomorrow\'s tasks"]')
  check(`${tag} …"Tomorrow's three" (nothing planted yet) and "Tomorrow's tasks · 5" with its tasks in time order`, /Nothing planted yet/.test(await text(three)) && /Tomorrow's tasks · 5/.test(await text(list)), (await text(list)).replace(/\n/g, ' / '))
  const order = await list.locator('.td-row-title').allInnerTexts()
  check(`${tag} …in time order: letter 09:00, Dentist 10:00, rent 11:30, plants 18:00, Mum 19:00`, order.join('|') === 'Draft the quarterly letter|Dentist|Pay the rent|Water the plants|Call Mum', order.join('|'))
  check(`${tag} …the Dentist row carries its block's time`, /10:00/.test(await text(list.locator(`#task-${id(T.DENTIST)}`))), await text(list.locator(`#task-${id(T.DENTIST)}`)))
  const card = page.locator('section.td-now')
  check(`${tag} …the ribbon has the day's 2 blocks, no now line; the calendar list has Team sync (the Dentist is a row)`, (await card.locator('.td-rb').count()) === 2 && (await card.locator('.td-ribbon-now').count()) === 0 && /Team sync/.test(await text(card.locator('.td-next'))) && !/Dentist/.test(await text(card.locator('.td-next'))), await text(card.locator('.td-next')))
  check(`${tag} …the rituals are a quiet line ("Tonight's Shut down…"); no Now card head, no Top 3 goal card`, /Tonight's Shut down starts from these three/.test(await text(page.locator('section[aria-label="Rituals"]'))) && (await page.locator('.td-rit').count()) === 0 && (await page.locator('.kf-goal-row').count()) === 0)
  check(`${tag} …routines for the day: 0/3, read-only`, /Routines · 0\/3/.test(await text(page.locator('section[aria-label="Routines"]'))) && (await page.locator('section[aria-label="Routines"] [role="checkbox"]:disabled').count()) === 3)
  check(`${tag} …the add pill is there for the day`, (await page.locator('.td-pill-field').count()) === 1)
  await shot(page, `${tag}-tomorrow`)

  // Plant its 3 — the evening ritual's seeds for that date.
  let w0 = state.writes.length
  const plant = (n) => list.locator(`#task-${id(n)}`).getByRole('button', { name: /^Plant/ }).click()
  await list.locator(`#task-${id(T.LETTER)}`).hover()
  await plant(T.LETTER)
  await settle(state)
  let s = seeds(state, w0)
  check(`${tag} ☆ on a row → ritual.seeded for ${TOMORROW}, through the outbox`, s.length === 1 && s[0].event_type === 'ritual.seeded' && s[0].entity_id === id(T.LETTER) && s[0].payload?.for_date === TOMORROW, JSON.stringify(s))
  check(`${tag} …the row moves into Tomorrow's three, ★, and the toast has Undo`, (await three.locator(`#task-${id(T.LETTER)}`).count()) === 1 && (await list.locator(`#task-${id(T.LETTER)}`).count()) === 0 && (await toastSoon(page, 'Planted for Tomorrow')))
  w0 = state.writes.length
  await page.locator('.kf-toast').filter({ hasText: 'Planted for Tomorrow' }).getByRole('button', { name: /Undo/ }).click()
  await settle(state)
  s = seeds(state, w0)
  check(`${tag} …Undo → ritual.unseeded, the row goes back`, s.length === 1 && s[0].event_type === 'ritual.unseeded' && (await list.locator(`#task-${id(T.LETTER)}`).count()) === 1, JSON.stringify(s))
  for (const n of [T.LETTER, T.RENT, T.WATER]) {
    await list.locator(`#task-${id(n)}`).hover()
    await plant(n)
    await sleep(350)
  }
  check(`${tag} three planted → "3 of 3 planted"`, (await three.locator('.td-row-title').count()) === 3 && /3 of 3 planted/.test(await text(three)), await text(three))
  w0 = state.writes.length
  await list.locator(`#task-${id(T.MUM)}`).hover()
  await plant(T.MUM)
  await settle(state)
  check(`${tag} …a fourth is refused, nothing written`, seeds(state, w0).length === 0 && (await toastSoon(page, 'already has three')))
  await shot(page, `${tag}-tomorrow-planted`)

  // A reload keeps the day (and the planted three come back from the log).
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  check(`${tag} reload keeps ?day — still Tuesday, still three planted`, dayParam(page) === TOMORROW && /Tuesday, October 27/.test(await text(page.locator('.td-date'))) && (await three.locator('.td-row-title').count()) === 3, await text(three))

  // Keys: Shift+→ / Shift+←.
  await page.keyboard.press('Shift+ArrowRight')
  await sleep(500)
  check(`${tag} Shift+→ → Wednesday 28`, dayParam(page) === '2026-10-28', page.url())
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await sleep(600)
  check(`${tag} Shift+← twice → today: the param is gone, Today's own page`, dayParam(page) === null && (await page.locator('.td-rit').count()) === 2 && (await page.getByRole('button', { name: 'Back to today' }).count()) === 0, page.url())
  await page.keyboard.press('?')
  await sleep(500)
  check(`${tag} the cheatsheet lists ⇧ ←/→ Previous · next day`, /Previous · next day/.test(await text(page.locator('[role="dialog"]'))))
  await page.keyboard.press('Escape')
  await sleep(300)

  // Jump to Nov 3: the date → next month → 3 (3 clicks; a day in this month is 2).
  await page.locator('.td-date button').click()
  const pop = page.locator('.kf-overlay-card').filter({ has: page.locator('[role="grid"]') })
  await pop.waitFor({ timeout: 4000 })
  check(`${tag} the date opens the app's date picker ("Go to a day", quick picks)`, /Go to a day/.test(await text(pop)) && (await pop.getByRole('button', { name: /^Tomorrow/ }).count()) === 1, (await text(pop)).slice(0, 80))
  await sleep(600) // the popover / sheet's entrance
  await shot(page, `${tag}-picker`, false)
  await pop.getByRole('button', { name: 'Next month' }).click()
  await pop.locator('[data-day="2026-11-03"]').click()
  await sleep(700)
  check(`${tag} …Nov 3 → ?day=2026-11-03, "Tuesday, November 3", the picker closed`, dayParam(page) === '2026-11-03' && (await text(page.locator('.td-date'))) === 'Tuesday, November 3' && (await pop.count()) === 0, page.url())
  check(`${tag} …"The day's tasks · 1": Renew the passport`, /The day's tasks · 1/.test(await text(page.locator('section[aria-label="The day\'s tasks"]'))) && /Renew the passport/.test(await text(main(page))))
  check(`${tag} …the rituals line for a later day`, /the morning ritual starts from these three/.test(await text(page.locator('section[aria-label="Rituals"]'))))

  // A past day: Sat 24 Oct.
  await page.goto(`${BASE}/today?day=${PAST}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const done = page.locator('section[aria-label="Done"]')
  const left = page.locator('section[aria-label="Left open"]')
  check(`${tag} past (?day=${PAST}): "Saturday, October 24"; Done · 2 — the day's goal first`, (await text(page.locator('.td-date'))) === 'Saturday, October 24' && /Done · 2/.test(await text(done)) && (await done.locator('.td-row-title').allInnerTexts()).join('|') === 'Send the invoice|Tidy the garage', (await done.locator('.td-row-title').allInnerTexts()).join('|'))
  check(`${tag} …Left open · 1 (Fix the gate) with Move ▾, no checkbox to tick it`, /Left open · 1/.test(await text(left)) && (await left.getByRole('button', { name: /^Move/ }).count()) === 1 && (await left.locator('[role="checkbox"]').count()) === 0)
  check(`${tag} …its line, routines 2/3 ticked (read-only), the calendar's Lunch with Salma`, /A slow, good Saturday/.test(await text(page.locator('section[aria-label="The day\'s line"]'))) && /Routines · 2\/3/.test(await text(page.locator('section[aria-label="Routines"]'))) && (await page.locator('section[aria-label="Routines"] [role="checkbox"]:disabled').count()) === 3 && /Lunch with Salma/.test(await text(page.locator('section.td-now'))))
  check(`${tag} …no rituals, no add pill, no stars`, (await page.locator('section[aria-label="Rituals"]').count()) === 0 && (await page.locator('.td-pill').count()) === 0 && (await page.locator('.td-star').count()) === 0)
  check(`${tag} …the summary: "2 done · 1 left open · routines 2/3"`, /2 done · 1 left open · routines 2\/3/.test(await text(page.locator('.td-sum'))), await text(page.locator('.td-sum')))
  await shot(page, `${tag}-past`)
  // Reopen: the ✓ on a done row.
  w0 = state.writes.length
  await done.locator(`#task-${id(T.GARAGE)}`).getByTitle('Reopen').click()
  await settle(state)
  const reopened = posts(state, 'tasks', w0)
  check(`${tag} …✓ reopens (status todo) with Undo`, reopened.some((t) => t.id === id(T.GARAGE) && t.status === 'todo') && (await toastSoon(page, 'Reopened')), reopened.map((t) => `${t.title}:${t.status}`).join(', '))
  // Move ▾ → Today.
  await left.getByRole('button', { name: /^Move/ }).click()
  await sleep(500)
  const menu = page.locator('.kf-overlay-card, [role="dialog"]').last()
  w0 = state.writes.length
  await menu.getByRole('button', { name: /^Today/ }).first().click()
  await settle(state)
  const moved = posts(state, 'tasks', w0).filter((t) => t.id === id(T.GATE))
  check(`${tag} …Move ▾ → Today moves "Fix the gate" to today`, moved.some((t) => (t.due_at ?? t.scheduled_start ?? '').startsWith('2026-10-26')), moved.map((t) => t.due_at).join(', '))

  await page.getByRole('button', { name: 'Back to today' }).click()
  await sleep(700)
  check(`${tag} Back to today → /today, Today's page`, dayParam(page) === null && (await text(page.locator('.td-date'))) === 'Monday, October 26' && (await page.locator('.td-rit').count()) === 2, page.url())
  noErrors(tag, errors)
  await ctx.close()
}

// ── D · last night's seed shows on tomorrow (one seeds model with the evening ritual) ──
if (want('d-seeded')) {
  const { ctx, page, errors } = await open('09:40', { seeded: true }, { path: `/today?day=${TOMORROW}` })
  const three = page.locator('section[aria-label="Tomorrow\'s three"]')
  check('d-seeded a seed the evening planted for tomorrow is in Tomorrow\'s three', (await three.locator(`#task-${id(T.RENT)}`).count()) === 1 && /1 of 3 planted/.test(await text(three)), await text(three))
  noErrors('d-seeded', errors)
  await ctx.close()
}

// ── P · phone, day + night: the strip, ›, planting, the title's picker sheet, a past day, Back to today ──
for (const theme of ['day', 'night']) {
  if (!want(`p-${theme}`)) continue
  const tag = `p-${theme}`
  const { ctx, page, cdp, errors, state } = await open('09:40', {}, { theme, view: phone })
  const strip = page.locator('.tp-daynav')
  check(`${tag} Today: the title unchanged ("Monday, Oct 26"), the strip "‹ Yesterday · picker · Tomorrow ›"`, (await text(page.locator('.tp-bar-title'))) === 'Monday, Oct 26' && /Yesterday/.test(await text(strip)) && /Tomorrow/.test(await text(strip)) && (await strip.getByRole('button', { name: 'Pick a day' }).count()) === 1 && (await strip.getByRole('button', { name: 'Back to today' }).count()) === 0, (await text(strip)).replace(/\n/g, ' '))
  check(`${tag} …the Today menu (rituals) is still in the bar`, (await page.locator('.tp-bar').getByRole('button', { name: 'Today menu' }).count()) === 1)
  const fit = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
  check(`${tag} …nothing runs sideways`, fit.sw <= fit.iw + 1, JSON.stringify(fit))
  await shot(page, `${tag}-today`)

  await tap(cdp, page, strip.getByRole('button', { name: 'Next day' }))
  await sleep(500)
  check(`${tag} › (1 tap) → tomorrow: "Tuesday, Oct 27", Back to today in the strip, no Today menu`, dayParam(page) === TOMORROW && (await text(page.locator('.tp-bar-title'))) === 'Tuesday, Oct 27' && (await strip.getByRole('button', { name: 'Back to today' }).count()) === 1 && (await page.locator('.tp-bar').getByRole('button', { name: 'Today menu' }).count()) === 0, page.url())
  const three = page.locator('section[aria-label="Tomorrow\'s three"]')
  const list = page.locator('section[aria-label="Tomorrow\'s tasks"]')
  check(`${tag} …its three, On the calendar (Team sync), its tasks · 5, routines, the rituals line`, /Nothing planted yet/.test(await text(three)) && /Team sync/.test(await text(page.locator('section[aria-label="On the calendar"]'))) && /Tomorrow's tasks · 5/.test(await text(list)) && /Routines · 0\/3/.test(await text(page.locator('section[aria-label="Routines"]'))) && /Tonight's Shut down/.test(await text(page.locator('.tp-day-rituals'))))
  await shot(page, `${tag}-tomorrow`)
  let w0 = state.writes.length
  await tap(cdp, page, list.locator(`#task-${id(T.WATER)}`).getByRole('button', { name: /^Plant/ }))
  await settle(state)
  const s = seeds(state, w0)
  check(`${tag} ☆ (tap) plants "Water the plants" for ${TOMORROW}`, s.length === 1 && s[0].payload?.for_date === TOMORROW && (await three.locator(`#task-${id(T.WATER)}`).count()) === 1, JSON.stringify(s))
  await shot(page, `${tag}-tomorrow-planted`)

  // The title opens the picker sheet; a day in it goes there (2 taps for a day this month).
  await tap(cdp, page, page.locator('.tp-title-btn'))
  const sheet = page.locator('[role="dialog"]').filter({ has: page.locator('[role="grid"]') })
  await sheet.waitFor({ timeout: 4000 })
  check(`${tag} the title opens the date sheet`, /Go to a day/.test(await text(sheet)))
  await sleep(600) // the popover / sheet's entrance
  await shot(page, `${tag}-picker`, false)
  await tap(cdp, page, sheet.locator(`[data-day="${PAST}"]`))
  await sleep(800)
  check(`${tag} …a tap on Sat 24 → the past day, the sheet closed`, dayParam(page) === PAST && (await text(page.locator('.tp-bar-title'))) === 'Saturday, Oct 24' && (await sheet.count()) === 0, page.url())
  check(`${tag} …Done · 2, Left open · 1 with Move ▾, its line, routines 2/3`, /Done · 2/.test(await text(page.locator('section[aria-label="Done"]'))) && (await page.locator('section[aria-label="Left open"]').getByRole('button', { name: /^Move/ }).count()) === 1 && /A slow, good Saturday/.test(await text(page.locator('section[aria-label="The day\'s line"]'))) && /Routines · 2\/3/.test(await text(page.locator('section[aria-label="Routines"]'))))
  await shot(page, `${tag}-past`)

  await tap(cdp, page, strip.getByRole('button', { name: 'Back to today' }))
  await sleep(600)
  check(`${tag} Back to today → Today`, dayParam(page) === null && (await text(page.locator('.tp-bar-title'))) === 'Monday, Oct 26', page.url())
  noErrors(tag, errors)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
