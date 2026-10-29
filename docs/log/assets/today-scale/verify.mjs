// today-scale (Kai 2026-10-22): three reports, one harness.
//   1. "the today tasks are combined with the also open tasks" — Today's tasks (due or on the calendar
//      today) is its own section; Also open, the rest, a separate fold below it. Desktop and phone.
//   2. "clipping issues … while the app is in 150% scale" — at 125% and 150% interface size, at
//      1280×800 and 1920×1080, every main page: no sideways scroll, no key control cut by a clipping
//      box, the sidebar's nav reachable and its pinned foot whole (expanded and collapsed).
//   3. "the goal of the day is either clipped or the right side of the card's outline is overlapped" —
//      the tilted goal card's outline (4 edges) and its shadow's room against every clipping ancestor,
//      nothing drawn over its right border; 100/125/150% and the phone.
// Same mocked backend as today-shell/verify.mjs (its setup copied; tables reseeded for these cases).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=split,goal,scale,ui to pick)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), 09:40.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5295'
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
const FORECAST = pid(1), SHAHEEN = pid(2), PORTFOLIO = pid(3), GARDEN = pid(4)
// Today's tasks: due today, on the calendar today (no block), done today, a parent with its subtask.
const GOAL = 1, LOGIC = 2, EMAILS = 3
const DUE = 4, SCHED = 5, DONE_TODAY = 6, PARENT = 7, SUB = 8
// The rest: overdue (its own fold), due later, undated, done today with no date.
const OVERDUE = 9, LATER = 10, U1 = 11, U2 = 12, U3 = 13, U4 = 14, DONE_UNDATED = 15
const TODAY_IDS = [DUE, SCHED, PARENT, DONE_TODAY]
const ALSO_IDS = [LATER, U1, U2, U3, U4, DONE_UNDATED]
function tasksFor() {
  return [
    task(GOAL, 'Deliver the MVP of the forecasting app before the investor call', { top3: true, top3_rank: 1, project_id: FORECAST, duration_min: 120, due_at: iso('09:00') }),
    task(LOGIC, 'Plan & implement the forecasting logic', { top3: true, top3_rank: 2, project_id: FORECAST, duration_min: 90 }),
    task(EMAILS, 'Create official emails for Shaheen', { top3: true, top3_rank: 3, project_id: SHAHEEN, duration_min: 30 }),
    task(DUE, 'Audit ads performance', { due_at: iso('09:00'), recurrence_rule: 'FREQ=WEEKLY' }),
    task(SCHED, 'Water the balcony plants', { duration_min: 15, scheduled_start: iso('18:00'), scheduled_end: iso('18:15') }),
    task(DONE_TODAY, 'Check the invoices', { due_at: iso('09:00'), status: 'done', completed_at: iso('08:30') }),
    task(PARENT, 'Prepare the Thursday talk', { due_at: iso('17:00'), project_id: PORTFOLIO }),
    task(SUB, 'Draft the slides', { parent_task_id: id(PARENT) }),
    task(OVERDUE, 'Figure out linking multiple GitHub accounts', { due_at: iso('09:00', 9) }),
    task(LATER, 'Renew the domain', { due_at: iso('09:00', 15) }),
    task(U1, 'Reply to Salma about Thursday'),
    task(U2, 'Order printer ink'),
    task(U3, 'Book the dentist'),
    task(U4, 'Sketch the garden bed layout', { project_id: GARDEN }),
    task(DONE_UNDATED, 'Sort the bookmarks', { status: 'done', completed_at: iso('08:00') }),
  ]
}
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const EVENTS = [
  ev(1, 'Deep work — Forecasting', '09:00', '11:00', null, 'time_block'),
  ev(2, 'Sync with Omar', '13:00', '13:30'),
  ev(3, 'Review the portfolio site', '15:00', '16:00'),
]
const project = (p, name) => ({ id: p, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(FORECAST, 'Forecasting App'), project(SHAHEEN, 'Shaheen'), project(PORTFOLIO, 'Portfolio site'), project(GARDEN, 'Garden club')]
const ROUTINES = [['Glass of water', 'morning'], ['Vitamins', 'morning'], ['Tidy the desk', 'evening']].map(([name, t], i) => ({
  id: `c1000000-0000-4000-8000-00000000000${i}`, user_id: UID, name, time_of_day: t, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: [], domain_id: null, created_at: CREATED, updated_at: CREATED,
}))
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const INBOX = [{ id: 'a2000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Buy printer ink', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00') }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables() {
  const log = [GOAL, LOGIC, EMAILS].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50'))
  log.push(act(1, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '08:20'))
  ;['overdue', 'inbox', 'top3', 'block'].forEach((step, i) => log.push(act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '08:15')))
  return {
    tasks: tasksFor(),
    calendar_events: structuredClone(EVENTS),
    projects: PROJECTS,
    app_settings: [SETTINGS],
    routines: ROUTINES,
    routine_completions: [{ id: 'c2000000-0000-4000-8000-000000000001', user_id: UID, routine_id: ROUTINES[0].id, completed_on: TODAY, created_at: iso('07:10') }],
    inbox_items: INBOX,
    activity_log: log,
    time_entries: [],
    domains: [],
    areas: [],
    people: [
      { id: 'd1000000-0000-4000-8000-000000000001', user_id: UID, name: 'Salma Hassan', facts: [{ id: 'f1', label: 'Birthday', value: '3 Nov' }], domain_id: null, created_at: CREATED, updated_at: CREATED },
      { id: 'd1000000-0000-4000-8000-000000000002', user_id: UID, name: 'Omar Farouk', facts: [], domain_id: null, created_at: CREATED, updated_at: CREATED },
    ],
    books: [{ id: 'd2000000-0000-4000-8000-000000000001', user_id: UID, title: 'The Overstory', author: 'Richard Powers', published_year: 2018, current_page: 120, total_pages: 502, status: 'reading', created_at: CREATED, updated_at: CREATED }],
    journal_entries: [{ id: 'd3000000-0000-4000-8000-000000000001', user_id: UID, body: 'A quiet start; the plants needed water.', entry_date: TODAY, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: iso('08:10'), updated_at: iso('08:10') }],
    slipping: [{ entity_type: 'project', entity_id: GARDEN, entity_name: 'Garden club', last_touch: iso('09:00', 1), days_since: 11 }],
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
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(at, o = {}) {
  const view = o.view ?? { viewport: { width: 1280, height: 800 } }
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, scale, collapsed]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    if (collapsed) localStorage.setItem('kf.sidebarCollapsed', '1')
  }, [o.theme ?? 'day', JSON.stringify(session), UID, o.scale ? String(o.scale) : null, !!o.collapsed])
  const state = { rows: tables(), writes: [] }
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
  return { ctx, page, errors, state }
}

const shot = async (page, name, top = true) => {
  if (top) await page.evaluate(() => document.querySelector('.app-main-content')?.scrollTo(0, 0))
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const text = (loc) => loc.first().innerText().catch(() => '')
const rowIds = (loc) => loc.locator('[id^="task-"]').evaluateAll((els) => els.map((e) => e.id.slice(5)))
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// ── 1 · Today's tasks vs Also open ──
for (const theme of ['day', 'night']) {
  if (want('split-desk')) {
    const tag = `split-desk-${theme}`
    const { ctx, page, errors } = await open('09:40', { theme, scale: 1.25 })
    const today = page.locator('section[aria-label="Today\'s tasks"]')
    const also = page.locator('section[aria-label="Also open"]')
    check(`${tag} "Today's tasks · 3" (3 open; the 1 done today listed, not counted — as Also open), its own section`, (await today.count()) === 1 && /^Today's tasks · 3$/m.test(await text(today)), (await text(today)).split('\n')[0])
    const tIds = await rowIds(today)
    check(`${tag} Today's tasks = due today, on the calendar today, done today, the parent (its subtask nested under it)`, same(tIds, [...TODAY_IDS, SUB].map(id)) && tIds.indexOf(id(SUB)) === tIds.indexOf(id(PARENT)) + 1, tIds.map((x) => +x.slice(-3)).join(','))
    check(`${tag} …done today last (done-after-open)`, tIds.filter((x) => x !== id(SUB)).at(-1) === id(DONE_TODAY), tIds.map((x) => +x.slice(-3)).join(','))
    check(`${tag} no Top 3 pick and no overdue row in Today's tasks`, ![GOAL, LOGIC, EMAILS, OVERDUE].some((n) => tIds.includes(id(n))))
    check(`${tag} "Also open · 5", a separate section`, (await also.count()) === 1 && /^Also open · 5$/m.test(await text(also)), (await text(also)).split('\n')[0])
    await also.locator('button.td-more').click().catch(() => {})
    await sleep(300)
    const aIds = await rowIds(also)
    check(`${tag} Also open (unfolded) = later, undated, done-today-undated — none of today's`, same(aIds, ALSO_IDS.map(id)), aIds.map((x) => +x.slice(-3)).join(','))
    const order = await page.evaluate(() => [...document.querySelectorAll('.td-main > section, .td-main > div > section')].map((s) => s.getAttribute('aria-label') ?? s.dataset.tour ?? (s.querySelector('button[aria-expanded]')?.innerText.split(' ·')[0] ?? '?')))
    check(`${tag} order: Today's three → Today's tasks → Overdue → Also open`, JSON.stringify(order.filter((x) => ['top3', "Today's tasks", 'Overdue', 'Also open'].includes(x))) === JSON.stringify(['top3', "Today's tasks", 'Overdue', 'Also open']), order.join(' → '))
    const overdue = page.getByRole('button', { name: /^Overdue · 1/ })
    check(`${tag} the overdue one stays in its own fold`, (await overdue.count()) === 1 && (await page.locator(`#task-${id(OVERDUE)}`).count()) === 0)
    await shot(page, tag)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('split-phone')) {
    const tag = `split-phone-${theme}`
    const { ctx, page, errors } = await open('09:40', { theme, view: phone })
    const today = page.locator('section[aria-label="Today\'s tasks"]')
    check(`${tag} "Today's tasks · 3" section (3 open), not folded`, (await today.count()) === 1 && /Today's tasks · 3/.test(await text(today)), (await text(today)).split('\n')[0])
    const tIds = await rowIds(today)
    check(`${tag} Today's tasks rows = the same four (+ the nested subtask)`, same(tIds, [...TODAY_IDS, SUB].map(id)), tIds.map((x) => +x.slice(-3)).join(','))
    const fold = page.getByRole('button', { name: /^Also open · \d+/ })
    check(`${tag} "Also open · N" is the fold below it (was "More for today")`, (await fold.count()) === 1 && (await page.getByRole('button', { name: /^More for today/ }).count()) === 0, await text(fold))
    const below = await page.evaluate(() => {
      const t = document.querySelector('section[aria-label="Today\'s tasks"]')
      const f = [...document.querySelectorAll('button[aria-expanded]')].find((b) => /^Also open/.test(b.innerText))
      return !!(t && f && t.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    check(`${tag} the fold sits below Today's tasks`, below)
    if ((await fold.getAttribute('aria-expanded')) === 'false') await fold.click()
    await sleep(400)
    const foldIds = await page.locator('section:has(> div > button[aria-expanded="true"]), [role="group"][aria-label="Also open"]').locator('[id^="task-"]') /* phone-today: B's folds panel */.evaluateAll((els) => els.map((e) => e.id.slice(5)))
    check(`${tag} the fold lists the rest, none of today's`, same(foldIds, ALSO_IDS.map(id)), foldIds.map((x) => +x.slice(-3)).join(','))
    await shot(page, tag)
    await today.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(OUT, `${tag}-lists.png`) })
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── 3 · The goal card: whole outline + shadow room, nothing over its right border ──
/** Measured in the page: the card's (rotated) outline against every clipping ancestor and the window. */
const goalProbe = (page) => page.evaluate(() => {
  const fg = document.querySelector('.kf-goal-row > .kf-swipe-fg, .tp-goal > .kf-swipe-fg')
  if (!fg) return null
  fg.scrollIntoView({ block: 'center' })
  const r = fg.getBoundingClientRect()
  const room = 12 * (Number(document.documentElement.style.zoom) || 1) // the shadow's visible spread sideways (--shadow-goal blurs 20px; past ~12px it's under 2%)
  const cut = []
  // Rects are in zoomed px, clientWidth / borders / margins in CSS px: scale those by the root zoom.
  const z = Number(document.documentElement.style.zoom) || 1
  const clipBox = (a) => {
    const b = a.getBoundingClientRect()
    const s = getComputedStyle(a)
    // overflow-clip-margin only counts when both axes clip (Chrome).
    const m = s.overflowX === 'clip' && s.overflowY === 'clip' ? (parseFloat(s.overflowClipMargin) || 0) * z : 0
    return { left: b.left + a.clientLeft * z - m, top: b.top + a.clientTop * z - m, right: b.left + (a.clientLeft + a.clientWidth) * z + m, bottom: b.top + (a.clientTop + a.clientHeight) * z + m, ox: s.overflowX, oy: s.overflowY }
  }
  for (let a = fg.parentElement; a && a !== document.documentElement; a = a.parentElement) {
    const c = clipBox(a)
    const name = a.className && typeof a.className === 'string' ? a.className.split(' ')[0] : a.tagName
    if (c.ox !== 'visible') {
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5) cut.push(`${name} cuts the outline sideways (${(r.left - c.left).toFixed(1)} / ${(c.right - r.right).toFixed(1)})`)
      else if (r.left - room < c.left - 0.5 || r.right + room > c.right + 0.5) cut.push(`${name} cuts the shadow sideways (${(r.left - c.left).toFixed(1)} / ${(c.right - r.right).toFixed(1)} of ${room})`)
    }
    if (c.oy !== 'visible' && (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5)) cut.push(`${name} cuts the outline vertically`)
  }
  if (r.left < 0 || r.right > innerWidth) cut.push('the window cuts it')
  // What's drawn at the right border's middle and corners (1px in): the card itself, never a sibling
  // or one of its own buttons.
  const cy = r.top + r.height / 2
  const at = (x, y) => document.elementFromPoint(x, y)
  const own = (el) => el === fg || (el && fg.contains(el) && !el.closest('button, [role="button"]'))
  const rad = (parseFloat(getComputedStyle(fg).borderTopRightRadius) || 0) * z + 4 // below the rounded corner
  const probes = [[r.right - 1.2, cy], [r.right - 1.5, r.top + rad], [r.right - 1.5, r.bottom - rad]]
  const over = probes.map(([x, y]) => at(x, y)).filter((el) => !own(el)).map((el) => el?.className || el?.tagName)
  // The + / ⋯ buttons sit inside the border.
  const inner = { right: r.right - parseFloat(getComputedStyle(fg).borderRightWidth) }
  const btns = [...fg.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({ t: b.title || b.getAttribute('aria-label') || b.innerText, right: b.getBoundingClientRect().right }))
  const outside = btns.filter((b) => b.right > inner.right + 0.5).map((b) => b.t)
  return { rect: { l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1) }, cut, over, outside }
})
const SIZES = [['1280', { width: 1280, height: 800 }], ['1920', { width: 1920, height: 1080 }]]
for (const theme of ['day', 'night']) for (const [sz, viewport] of SIZES) for (const scale of [1, 1.25, 1.5]) {
  const tag = `goal-${sz}-${Math.round(scale * 100)}-${theme}`
  if (!want(tag)) continue
  const { ctx, page, errors } = await open('09:40', { theme, scale, view: { viewport } })
  const p = await goalProbe(page)
  check(`${tag} the goal card's outline and shadow room clear every clipping box`, p && p.cut.length === 0, p ? `${JSON.stringify(p.rect)} ${p.cut.join('; ')}` : 'no card')
  check(`${tag} nothing drawn over its right border; + and ⋯ inside it`, p && p.over.length === 0 && p.outside.length === 0, p ? `${p.over.join(',')} ${p.outside.join(',')}` : '')
  const box = await page.locator('.kf-goal-row').boundingBox()
  await page.mouse.move(1, 1)
  if (box) await page.screenshot({ path: path.join(OUT, `${tag}.png`), clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 30), width: Math.min(viewport.width - Math.max(0, box.x - 40), box.width + 80), height: box.height + 60 } })
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
for (const theme of ['day', 'night']) {
  const tag = `goal-phone-${theme}`
  if (!want(tag)) continue
  const { ctx, page, errors } = await open('09:40', { theme, view: phone })
  const p = await goalProbe(page)
  check(`${tag} the goal card's outline and shadow room clear every clipping box`, p && p.cut.length === 0, p ? `${JSON.stringify(p.rect)} ${p.cut.join('; ')}` : 'no card')
  check(`${tag} nothing drawn over its right border; ⋯ inside it`, p && p.over.length === 0 && p.outside.length === 0, p ? `${p.over.join(',')} ${p.outside.join(',')}` : '')
  const box = await page.locator('.tp-goal').boundingBox()
  if (box) await page.screenshot({ path: path.join(OUT, `${tag}.png`), clip: { x: 0, y: Math.max(0, box.y - 30), width: 390, height: box.height + 60 } })
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2 · The scale sweep ──
/** Every visible key control: cut by a clipping (non-scrolling) ancestor or the window, or its own
 * text cut without an ellipsis. Partly-in only — a control wholly outside a box is hidden on purpose. */
const clipProbe = (page) => page.evaluate(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [role="link"], [role="checkbox"], h1, h2, h3, label'
  const out = []
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}「${(el.innerText || el.getAttribute('aria-label') || el.title || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 28)}」`
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[aria-hidden="true"], [inert]')) continue
    if (cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) out.push(`${desc(el)} text cut`)
    if (r.right > innerWidth + 1 || r.left < -1) { if (r.right > 0 && r.left < innerWidth) out.push(`${desc(el)} cut by the window`); continue }
    // The part you see: an icon button's glyph (its hit circle may overhang a row on purpose).
    const glyph = el.matches('button, [role="button"]') && el.children.length === 1 && el.firstElementChild.tagName === 'svg' ? el.firstElementChild.getBoundingClientRect() : r
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      const scrollX = s.overflowX === 'auto' || s.overflowX === 'scroll', scrollY = s.overflowY === 'auto' || s.overflowY === 'scroll'
      const clipX = s.overflowX === 'hidden' || s.overflowX === 'clip'
      const clipY = s.overflowY === 'hidden' || s.overflowY === 'clip'
      const b = a.getBoundingClientRect()
      // A scroller can't scroll to what's left of (or above) its start: that part is cut for good.
      if ((scrollX && a.scrollLeft === 0 && glyph.left < b.left - 1 && glyph.right > b.left) || (scrollY && a.scrollTop === 0 && glyph.top < b.top - 1 && glyph.bottom > b.top)) { out.push(`${desc(el)} cut at the start of ${desc(a)}`); break }
      if (!clipX && !clipY) continue
      const m = s.overflowX === 'clip' && s.overflowY === 'clip' ? parseFloat(s.overflowClipMargin) || 0 : 0
      const inX = r.right > b.left && r.left < b.right, inY = r.bottom > b.top && r.top < b.bottom
      if (!inX || !inY) break // wholly outside: hidden on purpose (a fold, a drawer)
      const partX = clipX && (glyph.left < b.left - 1 - m || glyph.right > b.right + 1 + m)
      const partY = clipY && (glyph.top < b.top - 1 - m || glyph.bottom > b.bottom + 1 + m)
      if (partX || partY) { out.push(`${desc(el)} cut by ${desc(a)}`); break }
    }
  }
  const sc = document.scrollingElement
  const main = document.querySelector('.app-main-content')
  return {
    cut: [...new Set(out)],
    docX: sc.scrollWidth - innerWidth, // sideways scroll of the window
    mainX: main ? main.scrollWidth - main.clientWidth : 0, // …and of the page's own scroller
  }
})
/** The sidebar at this size: every nav row reachable (in view, or the column scrolls to it), the
 * pinned foot (streak + footer rows) wholly inside the window, and a row cut where the column ends
 * only under the fade that says "more below" (--kf-side-fade, gone once scrolled to the end). */
const sideProbe = (page) => page.evaluate(async () => {
  const side = document.querySelector('.app-sidebar')
  if (!side || getComputedStyle(side).display === 'none') return null
  const col = document.querySelector('.app-sidebar-col')
  const cr = col.getBoundingClientRect()
  const rows = [...document.querySelectorAll('nav[data-tour="sidebar"] a')]
  const scrolls = col.scrollHeight > col.clientHeight + 1
  const fade = () => parseFloat(getComputedStyle(col).getPropertyValue('--kf-side-fade')) || 0
  const fadeTop = fade()
  const unreachable = rows.filter((a) => { const r = a.getBoundingClientRect(); return r.bottom > cr.bottom + 1 && !scrolls }).map((a) => a.textContent.trim())
  // A nav row half under the pinned foot with nothing saying the column goes on: the cut Kai saw.
  const half = fadeTop >= 16 ? [] : rows.filter((a) => { const r = a.getBoundingClientRect(); return r.top < cr.bottom - 1 && r.bottom > cr.bottom + 1 }).map((a) => a.textContent.trim())
  const foot = [...document.querySelectorAll('.app-vine, .app-sidebar-footer a, .app-sidebar-footer button')].filter((e) => e.getBoundingClientRect().height > 0)
  const footOut = foot.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > innerHeight + 0.5 || r.top < 0 || r.right > side.getBoundingClientRect().right + 0.5 }).map((e) => e.innerText.trim().split(String.fromCharCode(10))[0] || e.title)
  let fadeEnd = 0
  if (scrolls) {
    col.scrollTop = col.scrollHeight
    for (let i = 0; i < 20 && (fadeEnd = fade()) > 0; i++) await new Promise((r) => setTimeout(r, 50)) // a smooth scroll lands over a few frames
    col.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }
  return { unreachable, half, footOut, colH: Math.round(col.clientHeight), need: Math.round(col.scrollHeight), scrolls, fadeTop, fadeEnd }
})
const sideOk = (sb) => sb && !sb.unreachable.length && !sb.half.length && !sb.footOut.length && (!sb.scrolls || sb.fadeEnd === 0)
const PAGES = [
  ['today', '/today'], ['inbox', '/inbox'], ['calendar', '/calendar'], ['tasks', '/tasks'], ['projects', '/projects'], ['project', `/projects/${FORECAST}`],
  ['routines', '/routines'], ['focus', '/focus'], ['review', '/weekly-review'], ['journal', '/journal'], ['library', '/library'], ['people', '/people'], ['settings', '/settings'],
]
for (const [sz, viewport] of SIZES) for (const scale of [1.25, 1.5]) for (const theme of ['day', 'night']) {
  // Night only at 1920 × 150% (the Windows app's common case) — the rest is day.
  if (theme === 'night' && !(sz === '1920' && scale === 1.5)) continue
  for (const [key, at] of PAGES) {
    const tag = `scale-${sz}-${Math.round(scale * 100)}-${key}-${theme}`
    if (!want(tag)) continue
    const { ctx, page, errors } = await open('09:40', { theme, scale, view: { viewport }, path: at })
    const c = await clipProbe(page)
    check(`${tag} no sideways scroll`, c.docX <= 1 && c.mainX <= 1, `window ${c.docX} · page ${c.mainX}`)
    check(`${tag} no key control cut`, c.cut.length === 0, c.cut.slice(0, 6).join(' | '))
    // The narrow-page cases the sweep's screenshots showed (150% on a 1280 window, ~530px of page).
    const fit = await page.evaluate((key) => {
      const z = Number(document.documentElement.style.zoom) || 1
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect()
      const css = (n) => Math.round(n / z)
      if (key === 'today') { const m = box('.td-main'); return m ? { ok: css(m.width) >= 380, why: `lists ${css(m.width)}px` } : null }
      if (key === 'routines') { const m = box('.routines-grid > div'); return m ? { ok: css(m.width) >= 380, why: `list column ${css(m.width)}px` } : null }
      if (key === 'review') {
        const m = box('.wr-grid > div'), side = box('.wr-grid > div:nth-child(2)')
        const swept = [...document.querySelectorAll('.wr-grid span')].find((e) => /domains swept/.test(e.textContent))?.getBoundingClientRect()
        const clear = !side || !swept || side.top >= m.bottom - 1 || swept.right <= side.left - 1
        return m ? { ok: css(m.width) >= 320 && clear, why: `sweep column ${css(m.width)}px, header clear of the side column: ${clear}` } : null
      }
      if (key === 'focus') { const c = box('.fp-task > *'), main = box('.app-main-content'); return c && main ? { ok: c.left >= main.left + 8 * z, why: `checkbox ${css(c.left - main.left)}px in` } : null }
      if (key === 'tasks') {
        const rail = document.querySelector('.tasks-rail'), list = box('.tasks-grid > div')
        if (!rail || getComputedStyle(rail).display === 'none' || !list) return { ok: true, why: 'one column' }
        const gap = css(rail.getBoundingClientRect().left - list.right)
        return { ok: gap >= 20, why: `list to rail ${gap}px` }
      }
      return null
    }, key)
    if (fit) check(`${tag} the page's columns fit (${fit.why})`, fit.ok, fit.why)
    if (key === 'today' || key === 'settings') {
      const sb = await sideProbe(page)
      check(`${tag} sidebar: every nav row reachable, none cut without the "more below" fade (gone at the end), the foot whole`, sideOk(sb), JSON.stringify(sb))
    }
    await shot(page, tag)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── 2b · The sidebar collapsed, the task popover, the command bar — at 150% ──
for (const [sz, viewport] of SIZES) for (const scale of [1.25, 1.5]) {
  const s = `${sz}-${Math.round(scale * 100)}`
  if (want(`ui-collapsed-${s}`)) {
    const tag = `ui-collapsed-${s}`
    const { ctx, page, errors } = await open('09:40', { scale, view: { viewport }, collapsed: true })
    if (!(await page.locator('.app-sidebar.collapsed').count())) await page.locator('.kf-collapse-btn').click()
    await sleep(400)
    const sb = await sideProbe(page)
    const c = await clipProbe(page)
    check(`${tag} collapsed rail: every nav row reachable, none cut without the fade, the foot whole`, sideOk(sb), JSON.stringify(sb))
    check(`${tag} no key control cut, no sideways scroll`, c.cut.length === 0 && c.docX <= 1 && c.mainX <= 1, c.cut.slice(0, 6).join(' | '))
    await shot(page, tag)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want(`ui-popover-${s}`)) {
    const tag = `ui-popover-${s}`
    const { ctx, page, errors } = await open('09:40', { scale, view: { viewport }, path: '/tasks' })
    await page.locator(`#task-${id(DUE)}`).first().click()
    await sleep(900)
    const pop = page.locator('[role="dialog"]').first()
    const c = await clipProbe(page)
    const pb = await pop.boundingBox().catch(() => null)
    const inWin = pb && pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= viewport.width + 0.5 && pb.y + pb.height <= viewport.height + 0.5
    check(`${tag} the task popover opens wholly inside the window, nothing in it cut`, inWin && c.cut.length === 0, `${JSON.stringify(pb)} ${c.cut.slice(0, 6).join(' | ')}`)
    await shot(page, tag, false)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want(`ui-cmdbar-${s}`)) {
    const tag = `ui-cmdbar-${s}`
    const { ctx, page, errors } = await open('09:40', { scale, view: { viewport } })
    await page.keyboard.press('Control+k')
    await sleep(700)
    await page.keyboard.type('Call the bank tomorrow 3pm #Shaheen for 30m')
    await sleep(700)
    const c = await clipProbe(page)
    const dlg = page.locator('.kf-cmd-scrim > div').first()
    const pb = await dlg.boundingBox().catch(() => null)
    const inWin = pb && pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= viewport.width + 0.5 && pb.y + pb.height <= viewport.height + 0.5
    check(`${tag} the command bar opens wholly inside the window, nothing in it cut`, inWin && c.cut.length === 0, `${JSON.stringify(pb)} ${c.cut.slice(0, 6).join(' | ')}`)
    await shot(page, tag, false)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
