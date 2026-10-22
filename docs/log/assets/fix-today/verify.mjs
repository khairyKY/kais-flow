// Today 2a (desktop "reviewed pass") + the MK Now Card states + the review fixes, on the REAL /today
// page against a MOCKED backend (the cal-rail-drop recipe: dev server with VITE_SUPABASE_URL=
// http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every REST call — with
// PostgREST's eq / in / gte / is filters — and applies every write to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3). Desktop 1280×800 at the 125% default zoom; phone 390×844.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5251'
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

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const TODAY = '2026-10-12'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pid = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// Today 2a's sample day, on our calendar.
const GOAL = 1, LOGIC = 2, EMAILS = 3, GITHUB = 4, ADS = 5, BUG = 6, BANK = 7, CHECKED = 13
const FORECAST = pid(1), SHAHEEN = pid(2), PORTFOLIO = pid(3), GARDEN = pid(4)
function tasksFor(s) {
  const big = s.heavy ? 240 : 30
  return [
    task(GOAL, 'Deliver the MVP of the forecasting app', { top3: true, top3_rank: 1, project_id: FORECAST, duration_min: big, due_at: iso('09:00') }),
    task(LOGIC, 'Plan & implement the forecasting logic', { top3: true, top3_rank: 2, project_id: FORECAST, duration_min: big }),
    task(EMAILS, 'Create official emails for Shaheen', { top3: true, top3_rank: 3, project_id: SHAHEEN, duration_min: big }),
    task(GITHUB, 'Figure out linking multiple GitHub accounts', { due_at: iso('09:00', 9) }),
    task(ADS, 'Audit ads performance', { due_at: iso('09:00'), recurrence_rule: 'FREQ=WEEKLY' }),
    task(BUG, '[BUG] Deactivating a vendor store', { project_id: SHAHEEN }),
    task(BANK, 'Call the bank about the mortgage', { duration_min: 30, scheduled_start: iso('11:30'), scheduled_end: iso('12:00'), ...(s.bankDone ? { status: 'done', completed_at: iso('11:50') } : null) }),
    task(8, 'Renew the domain'),
    task(9, 'Reply to Salma about Thursday'),
    task(10, 'Order printer ink'),
    task(11, 'Book the dentist'),
    task(12, 'Sketch the garden bed layout'),
    task(CHECKED, 'Check the invoices', { status: 'done', completed_at: iso('08:30') }),
  ]
}
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const DEEP = 1, BANKB = 2, SYNC = 3, REVIEWB = 4
const EVENTS = [
  ev(DEEP, 'Deep work — Forecasting', '09:00', '11:00', null, 'time_block'),
  ev(BANKB, 'Call the bank about the mortgage', '11:30', '12:00', BANK),
  ev(SYNC, 'Sync with Omar', '13:00', '13:30'),
  ev(REVIEWB, 'Review the portfolio site', '15:00', '16:00'),
]
const project = (p, name) => ({ id: p, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(FORECAST, 'Forecasting App'), project(SHAHEEN, 'Shaheen'), project(PORTFOLIO, 'Portfolio site'), project(GARDEN, 'Garden club')]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Tidy the desk', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const INBOX = [{ id: 'a2000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Buy printer ink', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00') }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(s) {
  const log = [GOAL, LOGIC, EMAILS].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  if (s.morning) {
    log.push(act(1, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '08:20'))
    ;['overdue', 'inbox', 'top3', 'block'].forEach((step, i) => log.push(act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '08:15')))
  } else if (s.morningHalf) {
    ;['overdue', 'inbox'].forEach((step, i) => log.push(act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '07:58')))
  }
  if (s.closed) log.push(act(3, 'review.week_closed', 'review', iso('00:00', 6), {}, '18:00'))
  if (s.evening) log.push(act(2, 'ritual.finished', 'ritual', `evening-${TODAY}`, { ritual: 'evening', date: TODAY, steps: ['sweep', 'line', 'seeds', 'goodnight'] }, '21:00'))
  return {
    tasks: tasksFor(s),
    calendar_events: structuredClone(EVENTS),
    projects: PROJECTS,
    app_settings: [s.weekend ? { ...SETTINGS, weekend_days: s.weekend } : SETTINGS],
    routines: ROUTINES,
    routine_completions: [{ id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') }],
    inbox_items: INBOX,
    activity_log: log,
    time_entries: [],
    domains: [],
    areas: [],
    slipping: [
      { entity_type: 'project', entity_id: PORTFOLIO, entity_name: 'Portfolio site', last_touch: iso('09:00', 3), days_since: 9 },
      { entity_type: 'project', entity_id: GARDEN, entity_name: 'Garden club', last_touch: iso('09:00', 1), days_since: 11 },
      // the goal's own project — 2a rule 7: never flagged beside the goal
      { entity_type: 'project', entity_id: FORECAST, entity_name: 'Forecasting App', last_touch: iso('09:00', 4), days_since: 8 },
    ],
    resurfaced_log: [],
  }
}

/** PostgREST filters the app sends (eq / neq / in / gte / gt / lte / lt / is), enough for the mock. */
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
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
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
          if (i === -1) rows.push(row)
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
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(1800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = async (page, name, top = true) => {
  if (top) await page.evaluate(() => document.querySelector(".app-main-content")?.scrollTo(0, 0))
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
/** Shell fit (shell-fit harness): the document never scrolls (the shell does) and nothing runs sideways. */
const fit = (page) => page.evaluate(() => ({ win: innerHeight, doc: document.scrollingElement.scrollHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
async function fitCheck(page, tag) {
  const m = await fit(page)
  check(`${tag} shell fit: no page scroll, no sideways scroll`, m.doc <= m.win + 1 && m.sw <= m.iw + 1, JSON.stringify(m))
}
const now = (page) => page.locator('.td-now')
const slip = (page) => page.locator('.tp-slip-wrap')

// ── D · desktop 2a, each state ──
const DESK = [
  ['d1-plan-0800', '08:00', {}],
  ['d2-running-0940', '09:40', { morning: true }],
  ['d3-idle-1118', '11:18', { morning: true }],
  ['d4-over-1220', '12:20', { morning: true }],
  ['d6-idle-1410', '14:10', { morning: true }],
  ['d8-shutdown-1900', '19:00', { morning: true }],
  ['d9-closed-2110', '21:10', { morning: true, evening: true }],
]
for (const theme of ['day', 'night']) for (const [name, at, s] of DESK) {
  if (!want(name) || (theme === 'night' && !['d2-running-0940', 'd8-shutdown-1900', 'd4-over-1220'].includes(name))) continue
  const tag = `${name}-${theme}`
  const { ctx, page, errors } = await open(at, s, { theme })
  const zoom = await page.evaluate(() => document.documentElement.style.zoom || getComputedStyle(document.documentElement).zoom)
  if (name === 'd1-plan-0800' && theme === 'day') {
    check(`${tag} desktop at the 125% default`, String(zoom).startsWith('1.25'), zoom)
    check(`${tag} one date: the H1 only, no "Today" eyebrow`, (await page.locator('main h1, .td h1').count()) === 1 && !(await text(page.locator('.td'))).startsWith('TODAY'))
    // Times read on the 12-hour default, one range style (lib/clock — cal-polish 2026-10-22, clock fallout 2026-10-23).
    check(`${tag} summary "1 of 6 done · next up Deep work — Forecasting at 9:00 AM"`, /1 of 6 done · next up Deep work — Forecasting at 9:00 AM/.test(await text(page.locator('.td-sum'))), await text(page.locator('.td-sum')))
    check(`${tag} no terrarium band`, (await page.getByText('The terrarium').count()) === 0 && (await page.getByText('pressed & kept').count()) === 0)
    check(`${tag} typed "Add a task…" pill with the mic`, (await page.locator('.td-pill-field', { hasText: 'Add a task…' }).count()) === 1 && (await page.locator('.td-pill-mic').count()) === 1)
    check(`${tag} "Today's three · 1h 30m planned"`, /Today's three/i.test(await text(page.locator('section[data-tour="top3"]'))) && (await text(page.locator('section[data-tour="top3"] .td-label-note'))) === '1h 30m planned', await text(page.locator('section[data-tour="top3"] .td-label-note')))
    check(`${tag} no stars on the Top 3 rows`, (await page.locator('section[data-tour="top3"] .td-star').count()) === 0)
    const also = page.locator('section[aria-label="Also open"]')
    // today-scale (Kai 2026-10-22): Audit ads (due today) is in Today's tasks now, so Also open is one fewer.
    check(`${tag} "Today's tasks · 1" (Audit ads, due today) above "Also open · 6" — three rows, then "Show 3 more →"`, (await page.locator(`section[aria-label="Today's tasks"] #task-${id(ADS)}`).count()) === 1 && /Also open · 6/i.test(await text(also)) && (await also.locator('[id^="task-"]').count()) === 3 && /Show 3 more →/.test(await text(also.locator('.td-more'))), await text(also.locator('.td-more')))
    await also.locator('.td-more').click()
    await sleep(200)
    check(`${tag} Show more opens the rest in place (remembered as the old fold was)`, (await also.locator('[id^="task-"]').count()) === 7 && (await page.evaluate(() => localStorage.getItem('kf.today.more-open'))) === '1')
    await also.locator('.td-more').click()
    check(`${tag} Overdue keeps its own fold with Replan all (Kai 2026-10-07)`, (await page.getByRole('button', { name: /Overdue · 1/ }).count()) === 1 && (await page.getByRole('button', { name: /Replan all/ }).count()) === 1)
    check(`${tag} card head = Plan your day + Begin (the Day card loop)`, /Plan your day/.test(await text(now(page))) && (await now(page).getByRole('button', { name: 'Begin' }).count()) === 1)
    check(`${tag} the ribbon draws today's 4 blocks, the next two listed with Calendar →`, (await page.locator('.td-rb').count()) === 4 && (await page.locator('.td-next-item').count()) === 2 && (await page.locator('.td-cal-link').count()) === 1)
    check(`${tag} rail Rituals: Morning open with its 4 steps, Evening · from 5:00 PM folded`, /* 12h (lib/clock) */ (await page.locator('.td-rit[data-ritual="morning"] .td-rit-step').count()) === 4 && (await page.locator('.td-rit[data-ritual="evening"] .td-rit-step').count()) === 0 && /Evening · from 5:00 PM/.test(await text(page.locator('.td-rit[data-ritual="evening"]'))))
    check(`${tag} Routines stay in the rail`, /Routines · 1\/3/i.test(await text(page.locator('.td-rail'))))
    const worth = page.locator('section[aria-label="Worth a look"]')
    check(`${tag} Worth a look · 1 of 2 — not the goal's own project (rule 7)`, /1 of 2/.test(await text(worth)) && !(await text(worth)).includes('Forecasting App') && (await worth.getByRole('button', { name: 'Plan a step' }).count()) === 1 && (await worth.getByRole('button', { name: 'Snooze a week' }).count()) === 1, await text(worth))
    await worth.getByRole('button', { name: /next/ }).click()
    await sleep(200)
    check(`${tag} "1 of 2" steps to the next nudge`, /2 of 2/.test(await text(worth)) && /Garden club|Portfolio site/.test(await text(worth)))
    check(`${tag} the notebook button`, (await page.getByRole('link', { name: 'Notebook page' }).count()) === 1)
  }
  if (name === 'd2-running-0940') {
    check(`${tag} Now · 9:00–11:00 AM · Deep work — Forecasting · 1h 20m left · Start focus`, /Now · 9:00–11:00 AM/i.test( /* 12h, one range style (lib/clock) */await text(now(page).locator('.td-cap'))) && /Deep work — Forecasting/.test(await text(now(page).locator('.td-now-title'))) && /1h 20m left/.test(await text(now(page).locator('.td-now-sub'))) && (await now(page).getByRole('button', { name: 'Start focus' }).count()) === 1, await text(now(page)))
    check(`${tag} the running block outlined on the ribbon, a now line`, (await page.locator('.td-rb[data-head] .td-rb-spent').count()) === 1 && (await page.locator('.td-ribbon-now').count()) === 1)
    check(`${tag} Up next skips the card's block`, (await page.locator(`#upnext-${eid(DEEP)}`).count()) === 0)
  }
  if (name === 'd3-idle-1118') {
    // deviation(2026-10-12 ruling): no "Next · 11:30" head — nothing runs, so the card keeps only its
    // ribbon and the next two; the bank call leads them as a task (its checkbox, its menu).
    check(`${tag} idle: no head (no Next count-down), the ribbon + next two stay`, (await now(page).locator('.td-now-head').count()) === 0 && (await now(page).getAttribute('data-now')) === 'idle' && (await page.locator('.td-rb').count()) === 4)
    check(`${tag} the bank call leads Up next with its checkbox`, (await page.locator(`#upnext-${eid(BANKB)} [role="checkbox"]`).count()) === 1 && (await page.locator('.td-next-item').first().getAttribute('id')) === `upnext-${eid(BANKB)}`)
  }
  if (name === 'd4-over-1220') {
    check(`${tag} Now · 20 min over (amber)`, /Now · 20 min over/i.test(await text(now(page).locator('.td-cap'))) && (await now(page).locator('.td-cap[data-tone="over"]').count()) === 1, await text(now(page).locator('.td-cap')))
  }
  if (name === 'd6-idle-1410') {
    check(`${tag} idle: no head (no "Free" card), the next two are 3:00 PM Review the portfolio site`, (await now(page).locator('.td-now-head').count()) === 0 && /3:00 PM\s*Review the portfolio site/.test( /* 12h (lib/clock) */await text(page.locator('.td-next'))), await text(page.locator('.td-next')))
  }
  if (name === 'd8-shutdown-1900') check(`${tag} card head = Shut down the day; Evening opens in the rail`, /Shut down the day/.test(await text(now(page))) && (await page.locator('.td-rit[data-ritual="evening"] .td-rit-step').count()) === 4)
  if (name === 'd9-closed-2110') check(`${tag} card head = Day closed ✿`, /Day closed/.test(await text(now(page))))
  await fitCheck(page, tag)
  await shot(page, tag)
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D5 · just done → then Free (desktop): tick the Now card's checkbox ──
if (want('d5')) {
  const { ctx, page, errors, state } = await open('12:20', { morning: true })
  const w0 = state.writes.length
  await now(page).locator('.td-now-head [role="checkbox"]').click()
  await sleep(500)
  check('d5 Just done: "Done · 12:20", struck, Undo', /Done · 12:20/i.test(await text(now(page).locator('.td-cap'))) && (await now(page).locator('.td-struck').count()) === 1 && (await now(page).getByRole('button', { name: 'Undo' }).count()) === 1, await text(now(page)))
  await shot(page, 'd5-just-done-1220-day')
  await settle(state)
  check('d5 the task was completed (REST)', posts(state, 'tasks', w0).some((t) => t.id === id(BANK) && t.status === 'done'))
  await page.clock.runFor(5000)
  await sleep(800)
  check('d5 …then it goes: nothing runs, the card has no head', (await now(page).locator('.td-now-head').count()) === 0 && (await now(page).getAttribute('data-now')) === 'idle')
  await shot(page, 'd5-after-done-day')
  check('d5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D7 · paused focus (desktop): Start focus from the card, pause on /focus, back to Today ──
if (want('d7')) {
  const { ctx, page, errors } = await open('09:40', { morning: true })
  await now(page).getByRole('button', { name: 'Start focus' }).click()
  await page.waitForURL(/\/focus/, { timeout: 5000 }).catch(() => {})
  check('d7 Start focus lands on /focus', page.url().includes('/focus'))
  await sleep(600)
  await page.clock.runFor(3 * 60_000)
  await page.getByRole('button', { name: /Pause/ }).first().click()
  await sleep(300)
  await page.evaluate(() => { history.pushState({}, '', '/today'); dispatchEvent(new PopStateEvent('popstate')) })
  await sleep(1200)
  // A time block with no task: Start focus took the first open pick (2a's "working on" the pick).
  check('d7 Paused · since 9:43 AM — the goal, "left in the round", Resume focus', /Paused · since 9:4\d AM/i.test( /* 12h (lib/clock) */await text(now(page).locator('.td-cap'))) && /Deliver the MVP/.test(await text(now(page))) && /left in the round/.test(await text(now(page))) && (await now(page).getByRole('button', { name: 'Resume focus' }).count()) === 1, await text(now(page)))
  await shot(page, 'd7-paused-day')
  check('d7 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── F · the review fixes (desktop) ──
if (want('f')) {
  const { ctx, page, errors, state } = await open('09:40', { morning: true })
  // F1 Ctrl+click the goal card selects it; a second row joins; the row menu acts on both.
  await page.locator(`#task-${id(GOAL)}`).click({ modifiers: ['Control'] })
  await sleep(200)
  check('f1 Ctrl+click on the goal card selects it (bulk bar · 1)', (await page.locator('[role="toolbar"]').count()) === 1 && /1/.test(await text(page.locator('[role="toolbar"]'))))
  await page.keyboard.press('Escape')
  await sleep(200)
  // F2 two Top 3 rows selected → a row's right-click menu acts on both (BulkActions, onTop3 too).
  await page.locator(`#task-${id(LOGIC)}`).click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(EMAILS)}`).click({ modifiers: ['Control'] })
  await sleep(200)
  await page.locator(`#task-${id(EMAILS)}`).click({ button: 'right' })
  await sleep(400)
  const menu = await text(page.locator('[role="menu"]'))
  check('f2 the right-click menu acts on the selection: "Plan… (2)", "Delete (2)"', /Plan… \(2\)/.test(menu) && /Delete \(2\)/.test(menu), menu.replace(/\n/g, ' | '))
  await shot(page, 'f2-bulk-menu', false)
  let w0 = state.writes.length
  await page.locator('[role="menuitem"]', { hasText: 'Remove from Top 3' }).first().click()
  await settle(state)
  const flipped = posts(state, 'tasks', w0)
  check('f2 …Remove from Top 3 takes both out (the page\'s bulk onTop3)', flipped.some((t) => t.id === id(LOGIC) && t.top3 === false) && flipped.some((t) => t.id === id(EMAILS) && t.top3 === false), flipped.map((t) => `${t.title}:${t.top3}`).join(', '))
  // …and Delete (2) from an "Also open" row's menu bins both.
  await page.locator('section[aria-label="Also open"] button.td-more').click()
  await sleep(300)
  await page.locator(`#task-${id(ADS)}`).click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(BUG)}`).click({ modifiers: ['Control'] })
  await sleep(200)
  await page.locator(`#task-${id(BUG)}`).click({ button: 'right' })
  await sleep(400)
  w0 = state.writes.length
  await page.locator('[role="menuitem"]', { hasText: 'Delete (2)' }).first().click()
  await settle(state)
  await page.clock.runFor(1000) // the rows' exit animation (Motion 3e) runs on the page clock
  await settle(state)
  const binned = posts(state, 'tasks', w0).filter((t) => t.deleted_at)
  check('f2 …Delete (2) bins both', binned.some((t) => t.id === id(ADS)) && binned.some((t) => t.id === id(BUG)), state.writes.slice(w0).map((w) => `${w.method} ${w.table}`).join(', '))
  // F3 a plain event in Up next opens on the calendar at that event.
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await page.locator(`#upnext-${eid(SYNC)}`).click()
  await sleep(800)
  check('f3 an Up next event opens /calendar?event=<id>', page.url().includes(`/calendar?event=${eid(SYNC)}`), page.url())
  // F4 (today-shell, conductor 2026-10-13: one meaning per key) N is New task on Today too — the
  // capture bar; the Notebook page is Shift+N.
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('n')
  await sleep(600)
  check('f4 N on Today → the capture bar (New task), not the Notebook', page.url().endsWith('/today') && (await page.evaluate(() => document.activeElement?.id === 'kf-capture-input')), page.url())
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.locator('body').click({ position: { x: 5, y: 790 } })
  await page.keyboard.press('Shift+N')
  await sleep(600)
  check('f4 Shift+N on Today → /notebook?day=today', page.url().includes('/notebook?day=today'), page.url())
  // F5 the pill opens the capture bar.
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await page.locator('.td-pill-field').click()
  await sleep(500)
  check('f5 "Add a task…" opens the capture bar, cursor in it', await page.evaluate(() => document.activeElement?.id === 'kf-capture-input'))
  check('f no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P · phone: the slip in each state, the workload line, the event row grammar ──
const PH = [
  ['p1-plan-0800', '08:00', {}],
  ['p2-running-0940', '09:40', { morning: true }],
  ['p3-idle-1118', '11:18', { morning: true }],
  ['p4-over-1220', '12:20', { morning: true }],
  ['p6-idle-1410', '14:10', { morning: true }],
  ['p8-over-capacity-1600', '16:00', { morning: true, heavy: true }],
]
for (const theme of ['day', 'night']) for (const [name, at, s] of PH) {
  if (!want(name) || (theme === 'night' && !['p2-running-0940', 'p4-over-1220', 'p8-over-capacity-1600'].includes(name))) continue
  const tag = `${name}-${theme}`
  const { ctx, page, cdp, errors } = await open(at, s, { view: phone, theme })
  const cap = await text(slip(page).locator('.tp-caption'))
  if (name === 'p1-plan-0800') {
    check(`${tag} ritual card, no slip (Next/Free give way to Plan)`, (await page.locator('.tp-ritual').count()) === 1 && (await slip(page).count()) === 0)
    check(`${tag} the notebook icon beside search`, (await page.locator('.tp-bar').getByRole('link', { name: 'Notebook page' }).count()) === 1)
    check(`${tag} progress hairline "1 of 6 done"`, (await page.locator('.tp-progress[aria-label="Today · 1 of 6 done"]').count()) === 1)
    // the event row grammar: ⋯ → Open in calendar · Delete
    const row = page.locator(`#upnext-${eid(DEEP)}`)
    await row.scrollIntoViewIfNeeded()
    await tap(cdp, page, row.locator('.kf-row-more'))
    const sheet = await text(page.locator('[role="dialog"]').last())
    check(`${tag} an event row's ⋯ → Open in calendar · Delete`, /Open in calendar/.test(sheet) && /Delete/.test(sheet), sheet.replace(/\n/g, ' | '))
    await shot(page, `${tag}-event-sheet`)
    await page.locator('[role="dialog"]').last().getByRole('button', { name: 'Open in calendar' }).click()
    await sleep(800)
    check(`${tag} …Open in calendar → /calendar?event=<id>`, page.url().includes(`/calendar?event=${eid(DEEP)}`), page.url())
  }
  if (name === 'p2-running-0940') check(`${tag} Now · until 11:00, ring 1h 20m`, /now · until 11:00/i.test(cap) && /^1h\s20m$/.test(await text(slip(page).locator('.tp-ring'))), cap)
  if (name === 'p3-idle-1118') check(`${tag} nothing runs → no slip (Kai: only while something runs), no ritual card mid-day`, (await slip(page).count()) === 0 && (await page.locator('.tp-ritual').count()) === 0)
  if (name === 'p4-over-1220') check(`${tag} NOW · 20M OVER, amber ring +20`, /now · 20M over/i.test(cap) && /\+20/.test(await text(slip(page).locator('.tp-ring'))) && (await slip(page).locator('.tp-caption.is-over').count()) === 1, cap)
  if (name === 'p6-idle-1410') check(`${tag} a free gap → no slip`, (await slip(page).count()) === 0)
  if (name === 'p8-over-capacity-1600') {
    const sum = page.locator('.tp-sum')
    check(`${tag} the Today line turns amber with "… OVER"`, (await page.locator('.tp-sum.is-over').count()) === 1 && /over/i.test(await text(page.locator('.tp-over'))), await text(sum))
  }
  await fitCheck(page, tag)
  await shot(page, tag)
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P5 · phone just done → Free; P7 paused ──
if (want('p5')) {
  const { ctx, page, cdp, errors } = await open('12:20', { morning: true }, { view: phone })
  await tap(cdp, page, slip(page).locator('.tp-slip-done'))
  await sleep(300)
  check('p5 Just done: DONE · 12:20, struck, ↶ Undo', /done · 12:20/i.test(await text(slip(page).locator('.tp-caption'))) && (await slip(page).locator('.tp-slip-title.is-done').count()) === 1 && (await slip(page).getByRole('button', { name: /Undo/ }).count()) === 1)
  await shot(page, 'p5-just-done-1220-day')
  await page.clock.runFor(5000)
  await sleep(800)
  check('p5 …then the slip goes (nothing runs)', (await slip(page).count()) === 0)
  await shot(page, 'p5-after-done-day')
  check('p5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('p7')) {
  const { ctx, page, cdp, errors } = await open('11:00', { morning: true }, { view: phone })
  // Start focus from the goal's ⋯ sheet, pause on /focus, back to Today.
  await tap(cdp, page, page.locator(`#task-${id(GOAL)} .kf-row-more`))
  await page.locator('[role="dialog"]').last().getByRole('button', { name: /Start focus/ }).click()
  await page.waitForURL(/\/focus/, { timeout: 5000 }).catch(() => {})
  await sleep(600)
  await page.clock.runFor(2 * 60_000)
  await page.getByRole('button', { name: /Pause/ }).first().click()
  await sleep(300)
  await page.evaluate(() => { history.pushState({}, '', '/today'); dispatchEvent(new PopStateEvent('popstate')) })
  await sleep(1200)
  check('p7 Paused · since 11:02, hairline ring frozen at 23m', /paused · since 11:0\d/i.test(await text(slip(page).locator('.tp-caption'))) && /^23m$/.test(await text(slip(page).locator('.tp-ring'))), await text(slip(page)))
  await shot(page, 'p7-paused-day')
  check('p7 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R · the weekly review on its day (the first day of the weekend), gone once the week is closed ──
if (want('r')) {
  for (const [tag, s, shown] of [['r1-review-day', { morning: true, weekend: [1, 2] }, true], ['r2-week-closed', { morning: true, weekend: [1, 2], closed: true }, false], ['r3-not-review-day', { morning: true }, false]]) {
    const { ctx, page, errors } = await open('14:10', s)
    const row = page.locator('.td-rit[data-ritual="review"]')
    check(`${tag} desktop: the rail's "Weekly review" row ${shown ? 'shows' : 'is hidden'}`, (await row.count()) === (shown ? 1 : 0))
    if (shown) {
      await shot(page, `${tag}-desktop`, false)
      await row.getByRole('link').click()
      await sleep(600)
      check(`${tag} …it opens /weekly-review`, page.url().endsWith('/weekly-review'), page.url())
    }
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
    const ph = await open('14:10', s, { view: phone })
    check(`${tag} phone: the Weekly review card ${shown ? 'shows' : 'is hidden'}`, (await ph.page.locator('section[aria-label="Weekly review"]').count()) === (shown ? 1 : 0))
    if (shown) await shot(ph.page, `${tag}-phone`)
    check(`${tag} phone no page errors`, ph.errors.length === 0, ph.errors.join(' | '))
    await ph.ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
