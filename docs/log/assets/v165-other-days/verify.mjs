// v165-other-days: Tomorrow, yesterday and a picked day on Today's own page (other-days look A, Kai 2026-11-16,
// design-export/Other days.html) — the same phone and desktop layout and components as Today over that day's data.
// Phone and desktop, day and night: the title + date, ‹ Today · picker · › with the Today pill two days out, the day
// panel (title line, the Day bar, block lines), the goal and Top 3 (a future day's are that date's seeds — plant,
// undo, the fourth refused, a reload), Plan tomorrow, tasks, routines; a past day (goal done, picks with Slipped +
// Move ▾, Also done, Left open, the day's line, a ✓ reopens, no check on an open row); a picked date through the
// picker; nothing Today-only (Now card, rituals, Overdue); Today itself unchanged. Screenshots sit next to the
// design page's look A (design-A-*.png, drawn from the design page itself when it is on disk).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path] [design page]
// The day: Monday 26 Oct 2026, 09:40 Cairo (UTC+3 until the 29th). Desktop 1280×800, phone 390×844.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5263'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const DESIGN = process.argv[5] ?? 'D:/Coding/kais-flow/design-export/Other days.html'
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
const UID = '00000000-0000-4000-8000-00000000d3e5'
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
const YESTERDAY = '2026-10-25'
const FAR = '2026-11-03'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const T = { GOAL: 1, LOGIC: 2, SALMA_T: 3, LETTER: 10, DENTIST: 11, WATER: 12, RENT: 13, MUM: 14, PASSPORT: 20, WRITEUP: 30, CV: 31, PAPER: 32, REPLY: 33, LAUNDRY: 34, BOOK: 35 }
const TASKS = [
  // today
  task(T.GOAL, 'Deliver the MVP of the forecasting app', { top3: true, top3_rank: 1, due_at: iso('09:00') }),
  task(T.LOGIC, 'Plan the forecasting logic', { top3: true, top3_rank: 2 }),
  task(T.SALMA_T, 'Reply to Salma', { due_at: iso('12:00') }),
  // tomorrow
  task(T.LETTER, 'Draft the quarterly letter', { due_at: iso('09:00', 27) }),
  task(T.DENTIST, 'Dentist', { scheduled_start: iso('10:00', 27), scheduled_end: iso('11:00', 27), duration_min: 60 }),
  task(T.WATER, 'Water the plants', { due_at: iso('18:00', 27) }),
  task(T.RENT, 'Pay the rent', { due_at: iso('11:30', 27) }),
  task(T.MUM, 'Call Mum', { due_at: iso('19:00', 27) }),
  // Tue 3 Nov: one task with its block
  task(T.PASSPORT, 'Renew the passport', { scheduled_start: iso('09:00', 3, 11), scheduled_end: iso('10:30', 3, 11), duration_min: 90 }),
  // Sun 25 Oct (yesterday): the goal and one more pick done, a third pick slipped, two also done, one left open
  task(T.WRITEUP, 'Write up the lecture 6 summary', { status: 'done', completed_at: iso('11:00', 25), top3_rank: 1, due_at: iso('09:00', 25), scheduled_start: iso('13:00', 25), scheduled_end: iso('15:00', 25) }),
  task(T.CV, 'Submit the CV lab report', { status: 'done', completed_at: iso('16:20', 25), top3_rank: 2, due_at: iso('09:00', 25) }),
  task(T.PAPER, 'Pick three past-paper questions', { top3: true, top3_rank: 3, due_at: iso('09:00', 25) }),
  task(T.REPLY, 'Reply to Dr. Hany', { status: 'done', completed_at: iso('09:15', 25) }),
  task(T.LAUNDRY, 'Laundry', { status: 'done', completed_at: iso('18:30', 25) }),
  task(T.BOOK, 'Book the dentist', { due_at: iso('09:00', 25) }),
]
const ev = (n, title, from, to, day, taskN = null, month) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, day, month), ends_at: iso(to, day, month), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [
  ev(1, 'Deep work', '09:00', '11:00', 26),
  ev(2, 'Dentist', '10:00', '11:00', 27, T.DENTIST),
  ev(3, 'Team sync', '13:00', '13:30', 27),
  ev(4, 'Lecture 6 — Optimisation', '10:00', '11:30', 25),
  ev(5, 'Write up the lecture 6 summary', '13:00', '15:00', 25, T.WRITEUP),
  ev(6, 'Gym — push day', '17:30', '18:30', 25),
  ev(7, 'Passport office', '09:00', '10:30', 3, T.PASSPORT, 11),
]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Tidy the desk', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at, day) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at, day) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(s) {
  const log = [T.GOAL, T.LOGIC].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  // Last night's Shut down planted "Pay the rent" for Tue 27 — the evening's own seed.
  if (s.seeded) log.push(act(40, 'ritual.seeded', 'task', id(T.RENT), { ritual: 'evening', step: 'seeds', for_date: TOMORROW, date: YESTERDAY }, '21:00', 25))
  return {
    tasks: structuredClone(TASKS),
    calendar_events: structuredClone(EVENTS),
    projects: [],
    app_settings: [SETTINGS],
    routines: ROUTINES,
    routine_completions: [
      { id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') },
      { id: 'c2000000-0000-4000-8000-000000000002', user_id: UID, routine_id: ROUTINES[0].id, completed_on: YESTERDAY, created_at: iso('07:10', 25) },
      { id: 'c2000000-0000-4000-8000-000000000003', user_id: UID, routine_id: ROUTINES[1].id, completed_on: YESTERDAY, created_at: iso('07:12', 25) },
    ],
    inbox_items: [],
    activity_log: log,
    journal_entries: [{ id: 'f1000000-0000-4000-8000-000000000001', user_id: UID, entry_date: YESTERDAY, body: 'A slow, good Sunday. Optimisation finally clicked, and the dentist can wait.', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: iso('21:40', 25), updated_at: iso('21:40', 25) }],
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
const flat = async (loc) => (await text(loc)).replace(/\s+/g, ' ').trim()
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
  await loc.scrollIntoViewIfNeeded()
  await sleep(150)
  const p = center(await loc.boundingBox())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
}
const dayParam = (page) => new URL(page.url()).searchParams.get('day')
const seeds = (state, from = 0) => posts(state, 'activity_log', from).filter((r) => r.event_type === 'ritual.seeded' || r.event_type === 'ritual.unseeded')
const noErrors = (tag, errors) => check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
const noSideways = async (tag, page) => {
  const fit = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
  check(`${tag} nothing runs sideways`, fit.sw <= fit.iw + 1, JSON.stringify(fit))
}
const disabledBox = (loc) => loc.locator('[role="checkbox"]').first().evaluate((el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true').catch(() => false)
const todayOnly = async (tag, page) => {
  const gone = (await page.locator('section[aria-label="Now"], .td-rit, [data-day-card], section[aria-label="Rituals"][data-tour="plan"]').count()) === 0
  const noOverdue = !/Overdue|Worth a look|Replan all/.test(await text(page.locator('.app-main-content')))
  check(`${tag} nothing only Today has: no Now card, no ritual card or panel, no Overdue, no Worth a look`, gone && noOverdue)
}

// ── P · phone, day + night: Today → ›, the day panel, plant, Plan tomorrow, the picker, yesterday, a far day ──
for (const theme of ['day', 'night']) {
  if (!want(`p-${theme}`)) continue
  const tag = `p-${theme}`
  const { ctx, page, cdp, errors, state } = await open('09:40', {}, { theme, view: phone })
  const strip = page.locator('.tp-daynav')
  check(`${tag} Today is Today's own page: "Monday, Oct 26", the Now panel, the rituals panel`, (await text(page.locator('.tp-bar-title'))) === 'Monday, Oct 26' && (await page.locator('section[aria-label="Now"]').count()) === 1 && (await page.locator('section[aria-label="Rituals"]').count()) === 1)
  await tap(cdp, page, strip.getByRole('button', { name: 'Next day' }))
  await sleep(600)
  // — Tomorrow
  check(`${tag} › → Tomorrow (?day=${TOMORROW}): title "Tomorrow", the date beside it "Tue, Oct 27"`, dayParam(page) === TOMORROW && /^Tomorrow\s*Tue, Oct 27$/.test(await flat(page.locator('.tp-bar-title'))) && (await text(page.locator('.tp-bar-cap'))) === 'Tue, Oct 27', await flat(page.locator('.tp-bar-title')))
  check(`${tag} …‹ Today · the picker · Wed, Oct 28 ›, and no Today pill one day out`, /Today/.test(await text(strip)) && /Wed, Oct 28/.test(await text(strip)) && (await strip.getByRole('button', { name: 'Back to today' }).count()) === 0 && (await strip.getByRole('button', { name: 'Pick a day' }).count()) === 1, await flat(strip))
  const panel = page.locator('section[aria-label="The day"]')
  check(`${tag} …the day panel: "2 blocks · first at 10:00 AM", the Day bar with its 2 blocks and no now tick, 2 block lines`, (await text(panel.locator('.tp-dh-t'))) === '2 blocks' && /first at 10:00 AM/.test(await text(panel.locator('.tp-dh-r'))) && (await panel.locator('.tp-dbar-sg').count()) === 2 && (await panel.locator('.tp-dbar-now').count()) === 0 && (await panel.locator('.tp-bk').count()) === 2, await flat(panel))
  const plan = page.locator('section[aria-label="Plan tomorrow"]')
  check(`${tag} …Plan tomorrow: "Tomorrow · not planned", 5 tasks waiting, 2 blocks, Plan`, /Tomorrow · not planned/.test(await text(plan)) && /5 tasks waiting/.test(await text(plan)) && /2 blocks/.test(await text(plan)) && (await plan.getByRole('button', { name: 'Plan' }).count()) === 1, await flat(plan))
  const three = page.locator('section[aria-label="Top 3"]')
  const list = page.locator('section[aria-label="Tomorrow\'s tasks"]')
  check(`${tag} …Top 3 · nothing planted, no goal card; Tomorrow's tasks · 5 in time order with the Dentist's block time`, /nothing planted/.test(await text(three)) && (await page.locator('.tp-gs').count()) === 0 && /Tomorrow's tasks · 5/.test(await flat(list)) && (await list.locator('.tp-slim-t').allInnerTexts()).join('|') === 'Draft the quarterly letter|Dentist|Pay the rent|Water the plants|Call Mum' && /10:00 AM/.test(await text(list.locator(`#task-${id(T.DENTIST)}`))), await flat(list))
  check(`${tag} …Routines · 3 daily: one row "Morning · Evening" to the Routines page`, /Routines · 3 daily/.test(await flat(page.locator('section[aria-label="Routines"]'))) && /Morning · Evening/.test(await text(page.locator('section[aria-label="Routines"] a'))) && (await page.locator('section[aria-label="Routines"] a').getAttribute('href')) === '/routines')
  await todayOnly(tag, page)
  await noSideways(tag, page)
  await shot(page, `app-phone-tomorrow-${theme}`)

  // Plant: ☆ on rows → the day's seeds.
  let w0 = state.writes.length
  await tap(cdp, page, list.locator(`#task-${id(T.RENT)}`).getByRole('button', { name: /^Plant/ }))
  await settle(state)
  let s = seeds(state, w0)
  check(`${tag} ☆ (tap) on "Pay the rent" → ritual.seeded for ${TOMORROW}, through the outbox`, s.length === 1 && s[0].event_type === 'ritual.seeded' && s[0].entity_id === id(T.RENT) && s[0].payload?.for_date === TOMORROW, JSON.stringify(s))
  check(`${tag} …it is the goal card with a star, Top 3 · 1 of 3 planted, Plan tomorrow gone, the row left the list`, (await page.locator('.tp-gs').count()) === 1 && /Pay the rent/.test(await text(page.locator('.tp-gs'))) && /Goal of the day/i.test(await text(page.locator('.tp-gs'))) && /1 of 3 planted/.test(await text(three)) && (await plan.count()) === 0 && (await list.locator(`#task-${id(T.RENT)}`).count()) === 0 && (await toastSoon(page, 'Planted for Tomorrow')), await flat(three))
  w0 = state.writes.length
  await page.locator('.kf-toast').filter({ hasText: 'Planted for Tomorrow' }).getByRole('button', { name: /Undo/ }).click()
  await settle(state)
  s = seeds(state, w0)
  check(`${tag} …Undo → ritual.unseeded, the row is back and Plan tomorrow with it`, s.length === 1 && s[0].event_type === 'ritual.unseeded' && (await list.locator(`#task-${id(T.RENT)}`).count()) === 1 && (await plan.count()) === 1, JSON.stringify(s))
  for (const n of [T.LETTER, T.RENT, T.WATER]) await tap(cdp, page, list.locator(`#task-${id(n)}`).getByRole('button', { name: /^Plant/ }))
  await settle(state)
  check(`${tag} three planted → the goal (the first) and two numbered rows 2, 3 with a filled star; "3 of 3 planted"; the hint "Tonight's Shut down starts from these three."`, /3 of 3 planted/.test(await text(three)) && (await three.locator('.tp-slim-n').allInnerTexts()).join('') === '23' && (await three.locator('.kf-star[aria-pressed="true"]').count()) === 3 && /Tonight's Shut down starts from these three/.test(await text(three)), await flat(three))
  w0 = state.writes.length
  await tap(cdp, page, list.locator(`#task-${id(T.MUM)}`).getByRole('button', { name: /^Plant/ }))
  await settle(state)
  check(`${tag} …a fourth is refused, nothing written`, seeds(state, w0).length === 0 && (await toastSoon(page, 'already has three')))
  await shot(page, `app-phone-planned-${theme}`)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  check(`${tag} reload keeps ?day and the three planted`, dayParam(page) === TOMORROW && /3 of 3 planted/.test(await text(three)))

  // — The picker: a far day
  await tap(cdp, page, page.locator('.tp-title-btn'))
  const sheet = page.locator('[role="dialog"]').filter({ has: page.locator('[role="grid"]') })
  await sheet.waitFor({ timeout: 4000 })
  await sleep(600)
  await shot(page, `app-phone-picker-${theme}`, false)
  await tap(cdp, page, sheet.getByRole('button', { name: 'Next month' }))
  await tap(cdp, page, sheet.locator(`[data-day="${FAR}"]`))
  await sleep(800)
  check(`${tag} the title opens the date sheet; Nov 3 → ?day=${FAR}, title "Tue, Nov 3" and "in 8 days"`, dayParam(page) === FAR && (await text(page.locator('.tp-bar-title'))) .replace(/\s+/g, ' ') === 'Tue, Nov 3 in 8 days' && (await sheet.count()) === 0, await flat(page.locator('.tp-bar-title')))
  check(`${tag} …the Today pill shows (two days out), the neighbours stay Mon, Nov 2 · Wed, Nov 4`, (await strip.getByRole('button', { name: 'Back to today' }).count()) === 1 && /Mon, Nov 2/.test(await text(strip)) && /Wed, Nov 4/.test(await text(strip)), await flat(strip))
  check(`${tag} …1 block, first at 9:00 AM; Top 3 · nothing planted ("Plant picks any time…"); The day's tasks · 1 with the passport; no Plan tomorrow`, (await text(panel.locator('.tp-dh-t'))) === '1 block' && /first at 9:00 AM/.test(await text(panel.locator('.tp-dh-r'))) && /Plant picks any time/.test(await text(three)) && /The day's tasks · 1/.test(await flat(page.locator('section[aria-label="The day\'s tasks"]'))) && /Renew the passport/.test(await text(page.locator('section[aria-label="The day\'s tasks"]'))) && (await plan.count()) === 0, await flat(three))
  await todayOnly(tag, page)
  await shot(page, `app-phone-far-${theme}`)
  await tap(cdp, page, strip.getByRole('button', { name: 'Back to today' }))
  await sleep(600)
  check(`${tag} the Today pill → Today (no ?day), its own page again`, dayParam(page) === null && (await text(page.locator('.tp-bar-title'))) === 'Monday, Oct 26' && (await page.locator('section[aria-label="Now"]').count()) === 1)

  // — Yesterday
  await tap(cdp, page, strip.getByRole('button', { name: 'Previous day' }))
  await sleep(600)
  check(`${tag} ‹ → Yesterday: title "Yesterday", "Sun, Oct 25" beside it; no Today pill; ‹ Sat, Oct 24 · Today ›`, dayParam(page) === YESTERDAY && /^Yesterday\s*Sun, Oct 25$/.test(await flat(page.locator('.tp-bar-title'))) && (await strip.getByRole('button', { name: 'Back to today' }).count()) === 0 && /Sat, Oct 24/.test(await text(strip)) && /Today/.test(await text(strip)), await flat(strip))
  check(`${tag} …the day panel: 3 blocks, "1 of 3 done", the bar, no Add a block; no Plan tomorrow`, (await text(panel.locator('.tp-dh-t'))) === '3 blocks' && /1 of 3 done/.test(await text(panel.locator('.tp-dh-r'))) && (await panel.locator('.tp-dbar-sg').count()) === 3 && (await panel.getByText('Add a block').count()) === 0 && (await page.locator('section[aria-label="Plan tomorrow"]').count()) === 0)
  const goal = page.locator('.tp-gs')
  check(`${tag} …the goal card, done: struck, "Goal of the day · Done 11:00 AM"`, /Write up the lecture 6 summary/.test(await text(goal)) && (await goal.locator('.tp-gs-title.is-done').count()) === 1 && /Goal of the day · Done/i.test(await text(goal)) && /11:00 AM/i.test(await text(goal)), await flat(goal))
  check(`${tag} …Top 3 · 2 of 3 done: the CV report (2, ticked, 4:20 PM) and the slipped paper question (3, Slipped, Move ▾)`, /2 of 3 done/.test(await flat(three)) && (await three.locator('.tp-slim-n').allInnerTexts()).join('') === '23' && /4:20 PM/.test(await text(three.locator(`#task-${id(T.CV)}`))) && /Slipped/.test(await text(three.locator(`#task-${id(T.PAPER)}`))) && (await three.locator(`#task-${id(T.PAPER)}`).getByRole('button', { name: /^Move/ }).count()) === 1, await flat(three))
  const also = page.locator('section[aria-label="Also done"]')
  const left = page.locator('section[aria-label="Left open"]')
  check(`${tag} …Also done · 2 (Reply to Dr. Hany, Laundry); Left open · 1 (Book the dentist) with Move ▾`, /Also done · 2/.test(await flat(also)) && (await also.locator('.tp-slim-t').allInnerTexts()).join('|') === 'Reply to Dr. Hany|Laundry' && /Left open · 1/.test(await flat(left)) && (await left.getByRole('button', { name: /^Move/ }).count()) === 1, await flat(also))
  check(`${tag} …read-only: no stars, an open row's check can't be ticked`, (await page.locator('.kf-star').count()) === 0 && (await disabledBox(left.locator(`#task-${id(T.BOOK)}`))) && (await disabledBox(three.locator(`#task-${id(T.PAPER)}`))))
  const line = page.locator('section[aria-label="The day\'s line"]')
  check(`${tag} …the day's line (stamp, the sentence in italics) with Open journal; Routines · 2/3`, /SUN OCT 25 · 9:40 PM/.test(await text(line)) && /A slow, good Sunday/.test(await text(line)) && /Open journal/.test(await text(line)) && /Routines · 2\/3/.test(await flat(page.locator('section[aria-label="Routines"]'))), await flat(line))
  await todayOnly(tag, page)
  await noSideways(tag, page)
  await shot(page, `app-phone-yesterday-${theme}`)
  w0 = state.writes.length
  await tap(cdp, page, three.locator(`#task-${id(T.CV)}`).getByRole('checkbox'))
  await settle(state)
  const reopened = posts(state, 'tasks', w0)
  check(`${tag} …✓ on a finished row reopens it (status todo) with Undo`, reopened.some((t) => t.id === id(T.CV) && t.status === 'todo') && (await toastSoon(page, 'Reopened')), reopened.map((t) => `${t.title}:${t.status}`).join(', '))
  await tap(cdp, page, three.locator(`#task-${id(T.PAPER)}`).getByRole('button', { name: /^Move/ }))
  await sleep(500)
  const menu = page.locator('.kf-overlay-card, [role="dialog"]').last()
  w0 = state.writes.length
  await menu.getByRole('button', { name: /^Today/ }).first().click()
  await settle(state)
  const moved = posts(state, 'tasks', w0).filter((t) => t.id === id(T.PAPER))
  check(`${tag} …Move ▾ → Today moves the slipped pick to today`, moved.some((t) => (t.due_at ?? t.scheduled_start ?? '').startsWith('2026-10-26')), moved.map((t) => t.due_at).join(', '))
  noErrors(tag, errors)
  await ctx.close()
}

// ── P · phone: an empty day, and a seed the evening planted ──
if (want('p-empty')) {
  const { ctx, page, cdp, errors } = await open('09:40', {}, { view: phone, path: '/today?day=2026-10-28' })
  const panel = page.locator('section[aria-label="The day"]')
  check('p-empty Wed 28: "Wednesday"-less title "Wed, Oct 28 · in 2 days", the panel says On the calendar · Nothing yet, Free all day + Add a block', /^Wed, Oct 28 in 2 days$/.test(await flat(page.locator('.tp-bar-title'))) && (await text(panel.locator('.tp-dh-t'))) === 'On the calendar' && /Nothing yet/.test(await text(panel.locator('.tp-dh-r'))) && /Free all day/.test(await text(panel)) && (await panel.getByRole('link', { name: 'Add a block' }).count()) === 1, await flat(panel))
  const list = page.locator('section[aria-label="Wednesday\'s tasks"]')
  check('p-empty …Wednesday\'s tasks · 0: "Nothing else on this day yet" and an add row that opens capture', /Nothing else on this day yet/.test(await text(list)) && (await list.getByRole('button', { name: /Add a task for Wednesday/ }).count()) === 1, await flat(list))
  await shot(page, 'app-phone-empty-day')
  noErrors('p-empty', errors)
  await ctx.close()
}
if (want('p-seeded')) {
  const { ctx, page, errors } = await open('09:40', { seeded: true }, { view: phone, path: `/today?day=${TOMORROW}` })
  const three = page.locator('section[aria-label="Top 3"]')
  check("p-seeded last night's seed is Tomorrow's goal card, 1 of 3 planted; no Plan tomorrow card", /Pay the rent/.test(await text(page.locator('.tp-gs'))) && /1 of 3 planted/.test(await text(three)) && (await page.locator('section[aria-label="Plan tomorrow"]').count()) === 0, await flat(three))
  noErrors('p-seeded', errors)
  await ctx.close()
}
if (want('p-plan')) {
  const { ctx, page, cdp, errors } = await open('09:40', {}, { view: phone, path: `/today?day=${TOMORROW}` })
  await tap(cdp, page, page.locator('section[aria-label="Plan tomorrow"]').getByRole('button', { name: 'Plan' }))
  await sleep(900)
  check('p-plan Plan → the evening ritual (Shut down) opens over Tomorrow', (await page.locator('[role="dialog"]').count()) > 0 && /Shut down|Tomorrow|seed|Sweep/i.test(await text(page.locator('[role="dialog"]'))), (await flat(page.locator('[role="dialog"]'))).slice(0, 120))
  await shot(page, 'app-phone-plan-ritual', false)
  noErrors('p-plan', errors)
  await ctx.close()
}

// ── D · desktop, day + night: Today → ›, the Now card's day, plant, rail, the picker, yesterday, a far day ──
for (const theme of ['day', 'night']) {
  if (!want(`d-${theme}`)) continue
  const tag = `d-${theme}`
  const { ctx, page, errors, state } = await open('09:40', {}, { theme })
  const nav = page.locator('.td-daynav')
  check(`${tag} Today is Today's own page: "Monday, October 26", the Now card, the rituals rail`, (await text(page.locator('.td-date'))) === 'Monday, October 26' && (await page.locator('.td-now').count()) === 1 && (await page.locator('.td-rit').count()) === 2)
  await nav.getByRole('button', { name: 'Next day' }).click()
  await sleep(700)
  check(`${tag} › → Tomorrow (?day=${TOMORROW}): title "Tomorrow" with "Tuesday, October 27" beside it`, dayParam(page) === TOMORROW && /^Tomorrow\s*Tuesday, October 27$/.test(await flat(page.locator('.td-date'))) && (await text(page.locator('.td-date-cap'))) === 'Tuesday, October 27', await flat(page.locator('.td-date')))
  check(`${tag} …no Today chip one day out; the summary "5 tasks · 2 blocks · not planned"; the add pill for the day`, (await page.getByRole('button', { name: 'Back to today' }).count()) === 0 && /5 tasks · 2 blocks · not planned/.test(await text(page.locator('.td-sum'))) && (await page.locator('.td-pill-field').count()) === 1, await text(page.locator('.td-sum')))
  const card = page.locator('section.td-now')
  check(`${tag} …the Now card's ribbon is the day's: 2 blocks, no now line; the list has Dentist and Team sync, Calendar → on that date`, (await card.locator('.td-rb').count()) === 2 && (await card.locator('.td-ribbon-now').count()) === 0 && /Dentist/.test(await text(card.locator('.td-next'))) && /Team sync/.test(await text(card.locator('.td-next'))) && (await card.getByRole('link', { name: /Calendar/ }).getAttribute('href')) === `/calendar?date=${TOMORROW}`, await flat(card.locator('.td-next')))
  const three = page.locator('section[aria-label="Top 3"]')
  const list = page.locator('section[aria-label="Tomorrow\'s tasks"]')
  check(`${tag} …Tomorrow's three · 0 of 3 planted (no goal card); Tomorrow's tasks · 5 in time order`, /Tomorrow's three/.test(await text(three)) && /0 of 3 planted/.test(await text(three)) && (await page.locator('.kf-goal-row').count()) === 0 && /Tomorrow's tasks · 5/.test(await text(list)) && (await list.locator('.td-row-title').allInnerTexts()).join('|') === 'Draft the quarterly letter|Dentist|Pay the rent|Water the plants|Call Mum', await flat(three))
  const rail = page.locator('.td-rail')
  check(`${tag} …the rail: Rituals (the Shut down line + Plan tomorrow), Routines · 0/3 read-only`, /Tonight's Shut down starts from these three/.test(await text(rail)) && (await rail.getByRole('button', { name: 'Plan tomorrow' }).count()) === 1 && /Routines · 0\/3/.test(await text(rail)) && (await rail.locator('[role="checkbox"]:disabled').count()) === 3, await flat(rail))
  await todayOnly(tag, page)
  await shot(page, `app-desk-tomorrow-${theme}`)

  let w0 = state.writes.length
  const plant = (n) => list.locator(`#task-${id(n)}`).getByRole('button', { name: /^Plant/ }).click()
  await list.locator(`#task-${id(T.RENT)}`).hover()
  await plant(T.RENT)
  await settle(state)
  let s = seeds(state, w0)
  check(`${tag} ☆ on "Pay the rent" → ritual.seeded for ${TOMORROW}`, s.length === 1 && s[0].event_type === 'ritual.seeded' && s[0].entity_id === id(T.RENT) && s[0].payload?.for_date === TOMORROW, JSON.stringify(s))
  const dd = { goal: await page.locator('.kf-goal-row').count(), goalTxt: await flat(page.locator('.kf-goal-row')), three: await flat(three), planBtn: await rail.getByRole('button', { name: 'Plan tomorrow' }).count() }
  check(`${tag} …it is the goal card (taped, "Goal of the day"), 1 of 3 planted, the Plan tomorrow button gone`, dd.goal === 1 && /Pay the rent/.test(dd.goalTxt) && /Goal of the day/i.test(dd.goalTxt) && /1 of 3 planted/.test(dd.three) && dd.planBtn === 0, JSON.stringify(dd))
  w0 = state.writes.length
  await page.keyboard.press('Control+z') // a quiet edit on desktop: the history, not a toast
  await settle(state)
  s = seeds(state, w0)
  check(`${tag} …Ctrl+Z (the global undo) → ritual.unseeded, the row goes back`, s.length === 1 && s[0].event_type === 'ritual.unseeded' && (await list.locator(`#task-${id(T.RENT)}`).count()) === 1, JSON.stringify(s))
  for (const n of [T.LETTER, T.RENT, T.WATER]) {
    await list.locator(`#task-${id(n)}`).hover()
    await plant(n)
    await sleep(350)
  }
  check(`${tag} three planted → the goal and two rows, "3 of 3 planted", the hint`, /3 of 3 planted/.test(await text(three)) && (await three.locator('.td-row-title').count()) === 2 && /Tonight's Shut down starts from these three/.test(await text(three)), await flat(three))
  w0 = state.writes.length
  await list.locator(`#task-${id(T.MUM)}`).hover()
  await plant(T.MUM)
  await settle(state)
  check(`${tag} …a fourth is refused, nothing written`, seeds(state, w0).length === 0 && (await toastSoon(page, 'already has three')))
  await shot(page, `app-desk-planned-${theme}`)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  check(`${tag} reload keeps ?day and the three planted`, dayParam(page) === TOMORROW && /3 of 3 planted/.test(await text(three)))
  await page.keyboard.press('Shift+ArrowRight')
  await sleep(500)
  check(`${tag} Shift+→ → Wednesday 28`, dayParam(page) === '2026-10-28', page.url())
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await sleep(600)
  check(`${tag} Shift+← twice → Today: the param is gone, Today's own page`, dayParam(page) === null && (await page.locator('.td-rit').count()) === 2, page.url())

  // The picker: Nov 3.
  await page.locator('.td-date button').click()
  const pop = page.locator('.kf-overlay-card').filter({ has: page.locator('[role="grid"]') })
  await pop.waitFor({ timeout: 4000 })
  await sleep(600)
  await shot(page, `app-desk-picker-${theme}`, false)
  await pop.getByRole('button', { name: 'Next month' }).click()
  await pop.locator(`[data-day="${FAR}"]`).click()
  await sleep(700)
  check(`${tag} the date opens the picker; Nov 3 → ?day=${FAR}: "Tue, Nov 3" with "in 8 days", the Today chip, the picker closed`, dayParam(page) === FAR && /^Tue, Nov 3\s*in 8 days$/.test(await flat(page.locator('.td-date'))) && (await page.getByRole('button', { name: 'Back to today' }).count()) === 1 && (await pop.count()) === 0, await flat(page.locator('.td-date')))
  check(`${tag} …the passport's block on the ribbon; The day's tasks · 1; Top 3 asks to plant`, (await page.locator('section.td-now .td-rb').count()) === 1 && /The day's tasks · 1/.test(await text(page.locator('section[aria-label="The day\'s tasks"]'))) && /Renew the passport/.test(await text(page.locator('section[aria-label="The day\'s tasks"]'))) && /Plant picks any time/.test(await text(three)))
  await shot(page, `app-desk-far-${theme}`)

  // Yesterday.
  await page.goto(`${BASE}/today?day=${YESTERDAY}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  check(`${tag} yesterday: "Yesterday" with "Sunday, October 25"; the Today chip; summary "4 done · 2 slipped · routines 2/3"; no add pill`, /^Yesterday\s*Sunday, October 25$/.test(await flat(page.locator('.td-date'))) && (await page.getByRole('button', { name: 'Back to today' }).count()) === 1 && /4 done · 2 slipped · routines 2\/3/.test(await text(page.locator('.td-sum'))) && (await page.locator('.td-pill').count()) === 0, await text(page.locator('.td-sum')))
  const done = page.locator('section[aria-label="Also done"]')
  const left = page.locator('section[aria-label="Left open"]')
  check(`${tag} …the ribbon has the day's 3 blocks; the goal card done ("Done 11:00 AM", struck); Top 3 · 2 of 3 done`, (await page.locator('section.td-now .td-rb').count()) === 3 && /Done 11:00 AM/.test(await text(page.locator('.kf-goal-row'))) && /2 of 3 done/.test(await text(three)), await flat(three))
  check(`${tag} …the CV row ticked (4:20 PM), the paper question Slipped with Move ▾ and no tickable box; Also done · 2; Left open · 1 with Move ▾`, /4:20 PM/.test(await text(three.locator(`#task-${id(T.CV)}`))) && /Slipped/.test(await text(three.locator(`#task-${id(T.PAPER)}`))) && (await three.locator(`#task-${id(T.PAPER)}`).getByRole('button', { name: /^Move/ }).count()) === 1 && (await disabledBox(three.locator(`#task-${id(T.PAPER)}`))) && /Also done · 2/.test(await text(done)) && /Left open · 1/.test(await text(left)) && (await left.getByRole('button', { name: /^Move/ }).count()) === 1)
  check(`${tag} …the rail: the day's line (italic, stamp, Open journal), Routines · 2/3; no rituals, no stars`, /A slow, good Sunday/.test(await text(page.locator('.td-rail'))) && /SUN OCT 25 · 9:40 PM/.test(await text(page.locator('.td-rail'))) && /Open journal/.test(await text(page.locator('.td-rail'))) && /Routines · 2\/3/.test(await text(page.locator('.td-rail'))) && (await page.locator('section[aria-label="Rituals"]').count()) === 0 && (await page.locator('.td-star').count()) === 0)
  await todayOnly(tag, page)
  await shot(page, `app-desk-yesterday-${theme}`)
  w0 = state.writes.length
  await three.locator(`#task-${id(T.CV)}`).getByTitle('Reopen').click()
  await settle(state)
  const reopened = posts(state, 'tasks', w0)
  check(`${tag} …✓ reopens a finished row (status todo)`, reopened.some((t) => t.id === id(T.CV) && t.status === 'todo'), reopened.map((t) => `${t.title}:${t.status}`).join(', '))
  await left.locator(`#task-${id(T.BOOK)}`).getByRole('button', { name: /^Move/ }).click()
  await sleep(500)
  const menu = page.locator('.kf-overlay-card, [role="dialog"]').last()
  w0 = state.writes.length
  await menu.getByRole('button', { name: /^Today/ }).first().click()
  await settle(state)
  const moved = posts(state, 'tasks', w0).filter((t) => t.id === id(T.BOOK))
  check(`${tag} …Move ▾ → Today moves "Book the dentist" to today`, moved.some((t) => (t.due_at ?? t.scheduled_start ?? '').startsWith('2026-10-26')), moved.map((t) => t.due_at).join(', '))
  await page.getByRole('button', { name: 'Back to today' }).click()
  await sleep(700)
  check(`${tag} the Today chip → Today's page`, dayParam(page) === null && (await text(page.locator('.td-date'))) === 'Monday, October 26' && (await page.locator('.td-rit').count()) === 2, page.url())
  noErrors(tag, errors)
  await ctx.close()
}
if (want('d-seeded')) {
  const { ctx, page, errors } = await open('09:40', { seeded: true }, { path: `/today?day=${TOMORROW}` })
  check("d-seeded last night's seed is Tomorrow's goal card, 1 of 3 planted, no Plan tomorrow button", /Pay the rent/.test(await text(page.locator('.kf-goal-row'))) && /1 of 3 planted/.test(await text(page.locator('section[aria-label="Top 3"]'))) && (await page.getByRole('button', { name: 'Plan tomorrow' }).count()) === 0)
  noErrors('d-seeded', errors)
  await ctx.close()
}
if (want('d-empty')) {
  const { ctx, page, errors } = await open('09:40', {}, { path: '/today?day=2026-10-28' })
  check('d-empty Wed 28: "Wed, Oct 28 · in 2 days", "Nothing on the calendar", Wednesday\'s tasks · 0, "Nothing planned yet"', /^Wed, Oct 28\s*in 2 days$/.test(await flat(page.locator('.td-date'))) && /Nothing on the calendar/.test(await text(page.locator('section.td-now'))) && /Nothing planned yet/.test(await text(page.locator('.td-sum'))) && /Wednesday's tasks · 0/.test(await text(page.locator('section[aria-label="Wednesday\'s tasks"]'))))
  await shot(page, 'app-desk-empty-day')
  noErrors('d-empty', errors)
  await ctx.close()
}

// ── the design page's look A, drawn from the design page itself, next to the app's own shots ──
if (want('design') && fs.existsSync(DESIGN)) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(pathToFileURL(DESIGN).href)
  await sleep(1500)
  const A = page.locator('section.look[data-look="A"]')
  const figs = A.locator('.shots figure')
  const names = ['tomorrow', 'empty', 'plan', 'yesterday', 'far', 'picker']
  for (let i = 0; i < names.length; i++) await figs.nth(i).locator('.ph').screenshot({ path: path.join(OUT, `design-A-phone-${names[i]}.png`) })
  for (const [seg, name] of [['plan', 'tomorrow'], ['empty', 'empty'], ['past', 'yesterday'], ['far', 'far']]) {
    await A.locator(`.seg button[data-s="${seg}"]`).click()
    await sleep(300)
    await A.locator('.dk').screenshot({ path: path.join(OUT, `design-A-desk-${name}.png`) })
  }
  check('design look A drawn from the design page: 6 phones, 4 desktops', fs.readdirSync(OUT).filter((f) => f.startsWith('design-A-')).length === 10)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
