// gcal-events (Kai 2026-11-03: "When Google Calendar is connected there are a lot of bugs. You can't edit the events coming
// from there, you can't right- or left-click any event, and it gets super laggy and buggy.") on the REAL app against a
// MOCKED backend (the google-sync recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST and edge-function call and records every write; google-sync's `edit` / `undo`
// are answered by a fake that changes the mock rows the way the real function would).
//
//   C  clicks      every Google event on the week opens its details on a left-click and a menu on a right-click — ours to
//                  change or read-only — and the rows each offers (Join · Open in Google Calendar · Duplicate as my event · Delete)
//   A  actions     Join and Open in Google Calendar open their links; Duplicate as my event is a native copy, nothing to Google
//   E  edit        rename, drag, resize, delete + Undo of an editable Google event go to google-sync; a "no" puts the block back;
//                  a read-only one never moves, renames or deletes
//   R  repeating   a repeating Google event asks This · This and following · All, and sends the answer
//   P  phone       the tap sheet: editable title and Delete footer for ours, read-only for the rest; a hold lifts ours only
//   L  lag         the numbers (200+ Google events, recurring ones too): load, a sync landing, a realtime burst, click latency
//   node verify.mjs <outDir> [baseUrl=http://localhost:5346] [playwright-core path]      (ONLY=c,e runs some; LAG_ONLY=1 = L only)
// playwright-core: the 3rd argument, or $PLAYWRIGHT_CORE, else a bare `playwright-core` import (the old shared path is gone).
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5346'
const PW = process.argv[4] ?? process.env.PLAYWRIGHT_CORE
const { chromium } = PW ? await import(pathToFileURL(PW).href) : await import('playwright-core')
fs.mkdirSync(OUT, { recursive: true })
const results = []
const numbers = {}
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const num = (name, value, unit = '') => {
  numbers[name] = value
  console.log(`NUM  ${name} = ${value}${unit}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => (process.env.LAG_ONLY ? k === 'l' : !process.env.ONLY || process.env.ONLY.split(',').includes(k))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000060c2'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

/** Cairo wall time (UTC+3 all of Oct 2026) → a UTC Date. */
const cairo = (hhmm, day = 12, month = 10) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month - 1, day, h - 3, m))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const CREATED = iso('09:00', 1)
let seq = 0
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const KAI = { id: 'kai@gmail.com', name: 'Kai', color: '#4986e7', role: 'owner' }
const TEAM = { id: 'team@group.calendar.google.com', name: 'Team', color: '#16a765', role: 'writer' }
const PRAYER = { id: 'prayer@group.calendar.google.com', name: 'Prayer times', color: '#9fe1e7', role: 'reader' }
const native = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
/** A Google row as google-sync stamps it. `o.edit`: ours to change; `o.url`: a Meet link; `o.master`: a repeating event's series. */
const gcal = (n, cal, title, startIso, endIso, o = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: startIso, ends_at: endIso, all_day: !!o.allDay, task_id: null, source: 'gcal',
  gcal_id: o.gid ?? `g${n}`, gcal_etag: '"1"', busy: true, type: 'event', color: cal.color, deleted_at: null, created_at: CREATED, updated_at: CREATED,
  external_ref: { source: 'gcal', id: `${cal.id}/${o.gid ?? `g${n}`}`, calendar: cal.name, calendar_id: cal.id, ...(o.edit ? { edit: true } : null), ...(o.url ? { url: o.url } : null), ...(o.link ? { link: o.link } : null), ...(o.master ? { master: o.master } : null) },
})

const N = { DENTIST: 1, REVIEW: 2, OFFSITE: 3, BDAY: 4, LUNCH: 5, FAJR: 6, STANDUP0: 100, FILL: 1000 }
const MEET = 'https://meet.google.com/abc-defg-hij'
const OFFSITE_LINK = 'https://www.google.com/calendar/event?eid=offsite'

/** The week's events, and (bulk) a full 67-day sync window of them: prayer times, meetings, a weekly standup's instances, a
 * few native series — 200+ Google events as a real account has them. */
function buildRows({ bulk = false } = {}) {
  const rows = [
    gcal(N.DENTIST, KAI, 'Dentist', iso('13:00', 14), iso('14:00', 14), { edit: true, url: MEET, link: 'https://www.google.com/calendar/event?eid=dentist' }),
    gcal(N.REVIEW, KAI, 'Design review', iso('15:00', 13), iso('16:00', 13), { edit: true }),
    gcal(N.OFFSITE, TEAM, 'Team offsite', iso('11:00', 15), iso('12:00', 15), { link: OFFSITE_LINK }),
    gcal(N.BDAY, KAI, 'Omar’s birthday', '2026-10-16T00:00:00.000Z', '2026-10-17T00:00:00.000Z', { allDay: true }),
    native(N.LUNCH, 'Lunch with Omar', '12:10', '12:40'),
    gcal(N.FAJR, PRAYER, 'Fajr', iso('04:50', 12), iso('05:10', 12)),
  ]
  // The weekly standup, Mon–Fri 09:30 — each day its own row (singleEvents), one series.
  for (let d = -7; d <= 60; d++) {
    const at = new Date(Date.UTC(2026, 9, 12 + d))
    const dow = at.getUTCDay()
    if (dow === 5 || dow === 6) continue // the user's weekend: Fri / Sat
    const day = at.getUTCDate()
    const month = at.getUTCMonth() + 1
    const k = N.STANDUP0 + d + 7
    if (!bulk && (d < -1 || d > 8)) continue
    rows.push(gcal(k, KAI, 'Standup', iso('09:30', day, month), iso('09:45', day, month), { edit: true, master: 'standup', gid: `standup_${k}` }))
  }
  if (bulk) {
    for (let d = -7; d <= 60; d++) {
      const at = new Date(Date.UTC(2026, 9, 12 + d))
      const day = at.getUTCDate()
      const month = at.getUTCMonth() + 1
      const dow = at.getUTCDay()
      const k = N.FILL + (d + 7) * 20
      ;[['Dhuhr', '12:00', '12:20'], ['Asr', '15:20', '15:40'], ['Maghrib', '17:50', '18:10'], ['Isha', '19:10', '19:30']].forEach(([t, a, b], i) => rows.push(gcal(k + i, PRAYER, t, iso(a, day, month), iso(b, day, month))))
      if (dow !== 5 && dow !== 6) {
        rows.push(gcal(k + 5, KAI, '1:1', iso('14:00', day, month), iso('14:30', day, month), { edit: true }))
        rows.push(gcal(k + 6, TEAM, 'Sync with team', iso('11:30', day, month), iso('12:15', day, month)))
        rows.push(gcal(k + 7, KAI, 'Planning', iso('11:00', day, month), iso('12:00', day, month), { edit: true, url: MEET }))
      }
      if (day % 9 === 0) rows.push(gcal(k + 8, TEAM, 'Holiday', `${at.toISOString().slice(0, 10)}T00:00:00.000Z`, new Date(at.getTime() + 86_400_000).toISOString(), { allDay: true }))
    }
    // A few of ours that repeat, as one stored row each.
    ;[['Gym', '07:00', 'FREQ=DAILY'], ['Read', '21:00', 'FREQ=DAILY'], ['Weekly plan', '16:00', 'FREQ=WEEKLY;BYDAY=MO'], ['Water plants', '08:00', 'FREQ=DAILY;INTERVAL=2']].forEach(([t, h, rule], i) => {
      const e = native(N.FILL + 5000 + i, t, h, h.replace(/:00$/, ':30'), { recurrence_rule: rule, recurrence_exdates: [] })
      e.starts_at = iso(h, 1, 10)
      e.ends_at = iso(h.replace(/:00$/, ':30'), 1, 10)
      rows.push(e)
    })
  }
  return rows
}

const GOOGLE_ROW = { provider: 'google', updated_at: iso('09:30'), login: 'kai@gmail.com', status: 'ok', synced_at: iso('09:48'), repos: null, rules: null, calendars: [KAI, TEAM, PRAYER], chosen: [KAI.id, TEAM.id, PRAYER.id], can_write: true, mirror: null }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** The google-sync fake: an `edit` changes the mock rows the way the real function lands them, and answers the ops that undo it. */
function googleSyncFake(state, o) {
  const snapshot = []
  return (b) => {
    if (b?.action === 'edit') {
      if (o.failEdit) return { status: 403, json: { error: 'read_only' } }
      const rows = state.rows.calendar_events
      const row = rows.find((r) => r.id === b.id)
      if (!row) return { status: 404, json: { error: 'gone' } }
      const master = row.external_ref?.master
      const hit = b.scope === 'this' || !master ? [row] : rows.filter((r) => r.external_ref?.master === master && (b.scope === 'all' || r.starts_at >= row.starts_at))
      snapshot.push(structuredClone(hit))
      const c = b.change
      const delta = c.starts_at ? Date.parse(c.starts_at) - Date.parse(row.starts_at) : 0
      const len = c.starts_at ? Date.parse(c.ends_at) - Date.parse(c.starts_at) : 0
      for (const r of hit) {
        if (c.delete) state.rows.calendar_events = state.rows.calendar_events.filter((x) => x.id !== r.id)
        if (c.title !== undefined) r.title = c.title
        if (c.starts_at) {
          r.starts_at = new Date(Date.parse(r.starts_at) + delta).toISOString()
          r.ends_at = new Date(Date.parse(r.starts_at) + len).toISOString()
        }
        r.gcal_etag = '"2"'
      }
      return { ok: true, undo: { calendar: KAI.id, ops: [{ op: 'patch', id: row.gcal_id, body: { summary: 'before' } }] } }
    }
    if (b?.action === 'undo') {
      const prior = snapshot.pop() ?? []
      for (const p of prior) {
        const at = state.rows.calendar_events.findIndex((x) => x.id === p.id)
        if (at >= 0) state.rows.calendar_events[at] = p
        else state.rows.calendar_events.push(p)
      }
      return { ok: true }
    }
    return { calendars: 3, fetched: 0, new: 0, updated: 0, removed: 0, out: null }
  }
}

/** o.rows: calendar_events (default the week's); o.view: desktop | phone; o.failEdit: google-sync answers "read_only". */
async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    // Headless Chrome builds its audio graph in one 0.5–3 s block the first time anything makes a sound: not the app's cost.
    window.AudioContext = undefined
    window.webkitAudioContext = undefined
    window.__opened = []
    window.open = (u) => (window.__opened.push(String(u)), null) // Join / Open in Google Calendar leave through window.open
    window.__lt = []
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] }) } catch { /* old engine */ }
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: structuredClone({ tasks: [], calendar_events: o.rows ?? buildRows(), inbox_items: [], projects: [], domains: [], areas: [], integrations: [GOOGLE_ROW], app_settings: [SETTINGS] }), writes: [], calls: [], gets: 0 }
  const fake = googleSyncFake(state, o)
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204 })
      const name = url.pathname.replace('/functions/v1/', '')
      let body = null
      try { body = req.postDataJSON() } catch { body = null }
      state.calls.push({ name, body })
      const answer = (name === 'google-sync' ? fake(body) : null) ?? { status: 404, json: { code: 'NOT_FOUND' } }
      return r.fulfill({ status: answer.status ?? 200, json: answer.json ?? answer })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (table === 'calendar_events') state.gets++
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    const from = Number(req.headers().range?.split('-')[0] ?? url.searchParams.get('offset') ?? 0)
    return r.fulfill({ json: rows.slice(from, from + 1000), headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(o.settle ?? 1500)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
const fcEv = (page, id) => page.locator(`.fc-event[data-kf-id="${id}"]`).first()
const details = (page) => page.locator('[role="menu"][aria-label="Block details"]').last()
const menuB = (page) => page.locator('[role="menu"][aria-label="Block menu"]').last()
const labels = (m) => m.getByRole('menuitem').allInnerTexts().then((l) => l.map((t) => t.split('\n')[0].trim()))
const edits = (state) => state.calls.filter((c) => c.name === 'google-sync' && c.body?.action === 'edit').map((c) => c.body)
const undos = (state) => state.calls.filter((c) => c.name === 'google-sync' && c.body?.action === 'undo')
const calWrites = (state, from = 0) => state.writes.slice(from).filter((w) => w.table === 'calendar_events')
const opened = (page) => page.evaluate(() => window.__opened)
const toast = (page) => page.locator('[role="status"], .kf-toast').allInnerTexts()
/** A point on the event that is the event's own (not a block drawn over it), scanned over its box; null when it is wholly covered. */
const ownPoint = (page, id) => page.evaluate((kfId) => {
  const el = document.querySelector(`.fc-event[data-kf-id="${CSS.escape(kfId)}"]`)
  if (!el) return null
  el.scrollIntoView({ block: 'center' })
  const b = el.getBoundingClientRect()
  for (let dy = 2; dy < b.height; dy += 3) for (let dx = 4; dx < b.width; dx += 6) {
    const x = b.left + dx, y = b.top + dy
    if (document.elementFromPoint(x, y)?.closest('.fc-event') === el) return { x, y }
  }
  return null
}, id)


/** A drag the way a hand makes it (cal-clicks' mouseDrag): the press, a pause, steps, a pause, the release. */
async function mouseDrag(page, from, to, steps = 20) {
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(30)
  }
  await sleep(300)
  await page.mouse.up()
  await sleep(500)
}
/** Drags a block's body down by px; retried while `done()` says nothing happened (headless Chrome drops a FullCalendar drag now and then). */
async function dragDown(page, id, px, done) {
  for (let i = 0; i < 3; i++) {
    const loc = fcEv(page, id)
    await loc.scrollIntoViewIfNeeded()
    const b = await loc.boundingBox()
    const y = b.y + Math.min(10, b.height / 2)
    await mouseDrag(page, { x: b.x + b.width / 2, y }, { x: b.x + b.width / 2, y: y + px })
    await sleep(700)
    if (await done()) return i
  }
  return -1
}
/** Drags a block's bottom edge down by px. */
async function resizeDown(page, id, px, done) {
  for (let i = 0; i < 3; i++) {
    const loc = fcEv(page, id)
    const b = await loc.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await sleep(250)
    const h = await loc.locator('.fc-event-resizer-end').boundingBox()
    if (!h) continue
    await mouseDrag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2, y: h.y + h.height / 2 + px })
    await sleep(700)
    if (await done()) return i
  }
  return -1
}

// ── C: every Google event on the week opens on a left-click and on a right-click ──
if (want('c')) {
  const { ctx, page, errors, state } = await open('/calendar')
  const gids = state.rows.calendar_events.filter((r) => r.source === 'gcal' && !r.all_day).map((r) => r.id)
  const ok = { left: 0, right: 0, covered: [], noLeft: [], noRight: [] }
  for (const id of gids) {
    // Not on the screen: not drawn, or in the glide's buffer a day either side of it.
    const box = await fcEv(page, id).boundingBox().catch(() => null)
    const grid = await page.locator('.fc-view-harness').first().boundingBox()
    if (!box || box.x < grid.x || box.x + box.width > grid.x + grid.width + 1) continue
    const p = await ownPoint(page, id)
    if (!p) { ok.covered.push(id); continue }
    await page.mouse.click(p.x, p.y)
    await sleep(120)
    if ((await details(page).count()) === 1) ok.left++
    else ok.noLeft.push(id)
    await page.keyboard.press('Escape')
    await sleep(120)
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await sleep(120)
    if ((await menuB(page).count()) === 1) ok.right++
    else ok.noRight.push(id)
    await page.keyboard.press('Escape')
    await sleep(120)
  }
  const drawn = (await page.locator('.fc-timegrid-event.kf-synced, .fc-timegrid-event[data-kf-id]').count())
  check(`c1 every Google event on the week opens its details on a left-click (${ok.left})`, ok.left >= 9 && ok.noLeft.length === 0, JSON.stringify(ok))
  check(`c2 …and a menu on a right-click (${ok.right}), the same events`, ok.right === ok.left, JSON.stringify(ok))
  check('c3 none of them is wholly covered (each has a point you can press)', ok.covered.length === 0, JSON.stringify(ok.covered))
  check('c4 the week draws its Google events', drawn >= 8, drawn)

  // Ours to change: Dentist (a Meet link, a page) — details and menu B.
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.DENTIST))))
  await details(page).waitFor({ timeout: 3000 }).catch(() => {})
  check('c5 ours to change: the details rows — date ▸ · time ▸ · From Google · Join meeting · Open in Google Calendar · Delete', JSON.stringify(await labels(details(page))) === JSON.stringify(['Wed, Oct 14', '1:00 – 2:00 PM', 'From Google · Kai', 'Join meeting', 'Open in Google Calendar', 'Delete']), JSON.stringify(await labels(details(page))))
  check('c6 …the title is editable, the length chips are there', (await details(page).getByRole('textbox', { name: 'Title' }).getAttribute('readonly')) === null && (await details(page).locator('.kf-len-chip, [data-len]').count()) >= 0)
  await shot(page, 'c-mine-details')
  await page.keyboard.press('Escape')
  await sleep(200)
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.DENTIST))), { button: 'right' })
  await menuB(page).waitFor({ timeout: 3000 }).catch(() => {})
  check('c7 ours to change: menu B — Details · Join meeting · Open in Google Calendar · Duplicate as my event · Work with AI · Copy link · Delete', JSON.stringify(await labels(menuB(page))) === JSON.stringify(['Details', 'Join meeting', 'Open in Google Calendar', 'Duplicate as my event', 'Work with AI', 'Copy link', 'Delete']), JSON.stringify(await labels(menuB(page))))
  await shot(page, 'c-mine-menu')
  await page.keyboard.press('Escape')
  await sleep(200)

  // Read-only: Team offsite (another calendar), and the all-day birthday.
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.OFFSITE))))
  await details(page).waitFor({ timeout: 3000 }).catch(() => {})
  check('c8 read-only: the details rows — date · time · From Google · Open in Google Calendar · Duplicate as my event; no Delete', JSON.stringify(await labels(details(page))) === JSON.stringify(['Thu, Oct 15', '11:00 AM – 12:00 PM', 'From Google · Team', 'Open in Google Calendar', 'Duplicate as my event']), JSON.stringify(await labels(details(page))))
  check('c9 …the title is read-only, no colour tray', (await details(page).getByRole('textbox', { name: 'Title' }).getAttribute('readonly')) !== null && (await details(page).locator('.kf-swatch-tray').count()) === 0)
  await shot(page, 'c-readonly-details')
  await page.keyboard.press('Escape')
  await sleep(200)
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.OFFSITE))), { button: 'right' })
  await menuB(page).waitFor({ timeout: 3000 }).catch(() => {})
  check('c10 read-only: menu B — Details · Open in Google Calendar · Duplicate as my event · Work with AI · Copy link', JSON.stringify(await labels(menuB(page))) === JSON.stringify(['Details', 'Open in Google Calendar', 'Duplicate as my event', 'Work with AI', 'Copy link']), JSON.stringify(await labels(menuB(page))))
  await shot(page, 'c-readonly-menu')
  await page.keyboard.press('Escape')
  await sleep(200)
  // The all-day band.
  const bday = page.locator('.fc-daygrid-event', { hasText: 'Omar' }).first()
  await bday.click()
  await details(page).waitFor({ timeout: 3000 }).catch(() => {})
  check('c11 an all-day Google event opens its details too', (await details(page).count()) === 1 && /Fri, Oct 16/.test((await labels(details(page))).join('|')), JSON.stringify(await labels(details(page))))
  check('c12 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A: Join, Open in Google Calendar, Duplicate as my event ──
if (want('a')) {
  const { ctx, page, errors, state } = await open('/calendar')
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.DENTIST))))
  await details(page).getByRole('menuitem', { name: /Join meeting/ }).click()
  await sleep(300)
  check('a1 Join meeting opens the Meet link', (await opened(page)).includes(MEET), JSON.stringify(await opened(page)))
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.OFFSITE))))
  await details(page).getByRole('menuitem', { name: /Open in Google Calendar/ }).click()
  await sleep(300)
  check('a2 Open in Google Calendar opens its page (the link Google gave)', (await opened(page)).includes(OFFSITE_LINK), JSON.stringify(await opened(page)))
  // An event with no stored link falls back to the eid address.
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.REVIEW))))
  await details(page).getByRole('menuitem', { name: /Open in Google Calendar/ }).click()
  await sleep(300)
  check('a3 …or the address its id makes', (await opened(page)).some((u) => u.startsWith('https://calendar.google.com/calendar/event?eid=')), JSON.stringify(await opened(page)))

  const w = state.writes.length
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.OFFSITE))))
  await details(page).getByRole('menuitem', { name: /Duplicate as my event/ }).click()
  await sleep(900)
  const made = calWrites(state, w).map((x) => x.body).flat().filter(Boolean)
  check('a4 Duplicate as my event writes a native copy (same title and time, no Google ids)', made.length === 1 && made[0].title === 'Team offsite' && made[0].source === 'native' && !made[0].gcal_id && !made[0].external_ref && made[0].starts_at === iso('11:00', 15), JSON.stringify(made))
  check('a5 …and tells Google nothing', edits(state).length === 0)
  check('a6 …with an Undo toast', /Duplicated · Team offsite/.test((await page.locator('body').textContent()) ?? ''))
  // Ctrl+D with menu B open does the same for a Google event ours to change.
  await page.keyboard.press('Escape')
  await page.mouse.click(...Object.values(await ownPoint(page, eid(N.REVIEW))), { button: 'right' })
  await menuB(page).waitFor({ timeout: 3000 }).catch(() => {})
  const w2 = state.writes.length
  await page.keyboard.press('Control+d')
  await sleep(900)
  check('a7 Ctrl+D with menu B open duplicates an editable Google event as an event of our own', calWrites(state, w2).map((x) => x.body).flat().filter(Boolean).some((b) => b.title === 'Design review' && b.source === 'native'))
  check('a8 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── E: edit ──
if (want('e')) {
  // Rename.
  {
    const { ctx, page, errors, state } = await open('/calendar')
    await page.mouse.click(...Object.values(await ownPoint(page, eid(N.REVIEW))))
    const title = details(page).getByRole('textbox', { name: 'Title' })
    await title.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Design crit')
    await page.keyboard.press('Escape') // closing saves it
    await sleep(900)
    check('e1 a rename goes to google-sync: This, the new title', JSON.stringify(edits(state)) === JSON.stringify([{ action: 'edit', id: eid(N.REVIEW), scope: 'this', change: { title: 'Design crit' } }]), JSON.stringify(edits(state)))
    check('e2 …the grid says it, and nothing was written to the table by the client', (await fcEv(page, eid(N.REVIEW)).textContent())?.includes('Design crit') && calWrites(state).length === 0)
    check('e3 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Drag, resize.
  {
    const { ctx, page, errors, state } = await open('/calendar')
    const b0 = await fcEv(page, eid(N.REVIEW)).boundingBox()
    await dragDown(page, eid(N.REVIEW), 70, async () => edits(state).length > 0)
    const moved = edits(state)
    const delta = moved[0] ? Date.parse(moved[0].change.starts_at) - Date.parse(iso('15:00', 13)) : 0
    check('e4 a drag goes to google-sync: This, new times a quarter-hour multiple later, the same length', moved.length === 1 && moved[0].scope === 'this' && delta > 0 && delta % (15 * 60_000) === 0 && Date.parse(moved[0].change.ends_at) - Date.parse(moved[0].change.starts_at) === 60 * 60_000, JSON.stringify(moved))
    const b1 = await fcEv(page, eid(N.REVIEW)).boundingBox()
    const when = (await fcEv(page, eid(N.REVIEW)).textContent()) ?? ''
    check('e5 …and the block stays where it was dropped (4:00 PM)', /4:00/.test(when) && !/3:00/.test(when), when)
    const n = edits(state).length
    check('e6 an editable Google event has resize handles', (await fcEv(page, eid(N.REVIEW)).locator('.fc-event-resizer-end').count()) === 1)
    await resizeDown(page, eid(N.REVIEW), 40, async () => edits(state).length > n)
    const resized = edits(state).slice(n)
    check('e7 a resize goes to google-sync: This, the start kept, a longer end', resized.length === 1 && resized[0].change.starts_at === moved[0].change.starts_at && Date.parse(resized[0].change.ends_at) > Date.parse(moved[0].change.ends_at), JSON.stringify(resized))
    check('e8 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Delete, Undo.
  {
    const { ctx, page, errors, state } = await open('/calendar')
    await page.mouse.click(...Object.values(await ownPoint(page, eid(N.REVIEW))), { button: 'right' })
    await menuB(page).getByRole('menuitem', { name: /^Delete/ }).click()
    await sleep(900)
    check('e9 Delete goes to google-sync: This, delete', JSON.stringify(edits(state)) === JSON.stringify([{ action: 'edit', id: eid(N.REVIEW), scope: 'this', change: { delete: true } }]), JSON.stringify(edits(state)))
    check('e10 …the block leaves the grid and a Deleted toast offers Undo', (await fcEv(page, eid(N.REVIEW)).count()) === 0 && /Deleted · Design review/.test((await page.locator('body').textContent()) ?? ''))
    await shot(page, 'e-deleted-toast')
    await page.getByRole('button', { name: 'Undo' }).first().click()
    await sleep(1500)
    check('e11 Undo asks google-sync to put it back, and the block returns', undos(state).length === 1 && undos(state)[0].body.calendar === KAI.id && (await fcEv(page, eid(N.REVIEW)).count()) === 1, JSON.stringify(undos(state)))
    // ⌫ with the details open, too.
    await page.mouse.click(...Object.values(await ownPoint(page, eid(N.DENTIST))))
    await details(page).waitFor({ timeout: 3000 }).catch(() => {})
    await page.keyboard.press('Backspace')
    await sleep(900)
    check('e12 ⌫ with the details open deletes it in Google too', edits(state).some((e) => e.id === eid(N.DENTIST) && e.change.delete))
    check('e13 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Google says no.
  {
    const { ctx, page, errors, state } = await open('/calendar', { failEdit: true })
    await fcEv(page, eid(N.REVIEW)).scrollIntoViewIfNeeded()
    const b0 = await fcEv(page, eid(N.REVIEW)).boundingBox()
    await dragDown(page, eid(N.REVIEW), 70, async () => edits(state).length > 0)
    await sleep(1500)
    const b1 = await fcEv(page, eid(N.REVIEW)).boundingBox()
    const when = (await fcEv(page, eid(N.REVIEW)).textContent()) ?? ''
    check('e14 Google refuses: the block goes back where it was (3:00 PM)', /3:00–4:00/.test(when) && edits(state).length === 1, when)
    check('e15 …with a sentence that says so', /put back/.test((await page.locator('body').textContent()) ?? ''))
    await shot(page, 'e-refused')
    check('e16 no page errors', errors.filter((e) => !/403/.test(e)).length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Read-only: nothing moves, renames or deletes.
  {
    const { ctx, page, errors, state } = await open('/calendar')
    await fcEv(page, eid(N.OFFSITE)).scrollIntoViewIfNeeded()
    const b0 = await fcEv(page, eid(N.OFFSITE)).boundingBox()
    const f = b0.y + Math.min(10, b0.height / 2)
    await mouseDrag(page, { x: b0.x + b0.width / 2, y: f }, { x: b0.x + b0.width / 2, y: f + 70 })
    await mouseDrag(page, { x: b0.x + b0.width / 2, y: f }, { x: b0.x + b0.width / 2, y: f + 70 }) // twice: once may not take
    await sleep(900)
    const b1 = await fcEv(page, eid(N.OFFSITE)).boundingBox()
    const when = (await fcEv(page, eid(N.OFFSITE)).textContent()) ?? ''
    check('e17 a read-only Google event doesn’t move (still 11:00), and nothing is sent anywhere', /11:00/.test(when) && edits(state).length === 0 && calWrites(state).length === 0, when)
    check('e18 …no resize handle', (await fcEv(page, eid(N.OFFSITE)).locator('.fc-event-resizer').count()) === 0)
    await page.mouse.click(...Object.values(await ownPoint(page, eid(N.OFFSITE))))
    await details(page).waitFor({ timeout: 3000 }).catch(() => {})
    await page.keyboard.press('Backspace')
    await sleep(900)
    check('e19 ⌫ on its details deletes nothing', edits(state).length === 0 && (await fcEv(page, eid(N.OFFSITE)).count()) === 1)
    check('e20 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── R: a repeating Google event asks, and sends the answer ──
if (want('r')) {
  const standup = (d) => eid(N.STANDUP0 + d + 7) // d: days from Mon 12 Oct (Mon–Thu only)
  const ask = (page) => page.getByRole('dialog').filter({ hasText: /repeating event/ }).last()
  {
    const { ctx, page, errors, state } = await open('/calendar')
    await page.mouse.click(...Object.values(await ownPoint(page, standup(1))))
    await details(page).waitFor({ timeout: 3000 }).catch(() => {})
    await details(page).getByRole('textbox', { name: 'Title' }).click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Daily')
    await page.keyboard.press('Escape')
    await ask(page).waitFor({ timeout: 3000 }).catch(() => {})
    check('r1 renaming a repeating Google event asks: This event · This and following events · All events', JSON.stringify(await ask(page).getByRole('button').allInnerTexts()) === JSON.stringify(['This event', 'This and following events', 'All events', 'Cancel']) , JSON.stringify(await ask(page).getByRole('button').allInnerTexts().catch(() => null)))
    await shot(page, 'r-ask')
    await ask(page).getByRole('button', { name: 'This and following events' }).click()
    await sleep(900)
    check('r2 "This and following" sends scope following with the title', JSON.stringify(edits(state)) === JSON.stringify([{ action: 'edit', id: standup(1), scope: 'following', change: { title: 'Daily' } }]), JSON.stringify(edits(state)))
    const titles = (await page.locator('.fc-timegrid-event', { hasText: /Standup|Daily/ }).allInnerTexts()).map((t) => /Daily/.test(t) ? 'Daily' : 'Standup')
    const from = titles.indexOf('Daily')
    check('r3 …the days before keep their name, Tuesday on takes the new one', from >= 1 && titles.slice(0, from).every((t) => t === 'Standup') && titles.slice(from).every((t) => t === 'Daily'), JSON.stringify(titles))
    // Cancel writes nothing.
    const n = edits(state).length
    await page.mouse.click(...Object.values(await ownPoint(page, standup(2))))
    await details(page).getByRole('textbox', { name: 'Title' }).click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Nope')
    await page.keyboard.press('Escape')
    await ask(page).waitFor({ timeout: 3000 }).catch(() => {})
    await ask(page).getByRole('button', { name: 'Cancel' }).click()
    await sleep(600)
    check('r4 Cancel sends nothing', edits(state).length === n)
    check('r5 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors, state } = await open('/calendar')
    await page.mouse.click(...Object.values(await ownPoint(page, standup(2))), { button: 'right' })
    await menuB(page).getByRole('menuitem', { name: /^Delete/ }).click()
    await ask(page).waitFor({ timeout: 3000 }).catch(() => {})
    check('r6 Delete on a repeating Google event asks too', (await ask(page).count()) === 1)
    await ask(page).getByRole('button', { name: 'All events' }).click()
    await sleep(900)
    check('r7 "All events" sends scope all, delete — and the whole series leaves the grid', JSON.stringify(edits(state)) === JSON.stringify([{ action: 'edit', id: standup(2), scope: 'all', change: { delete: true } }]) && (await page.locator('.fc-timegrid-event', { hasText: 'Standup' }).count()) === 0, JSON.stringify(edits(state)))
    await page.getByRole('button', { name: 'Undo' }).first().click()
    await sleep(1500)
    check('r8 Undo asks google-sync to bring the series back', undos(state).length === 1 && (await page.locator('.fc-timegrid-event', { hasText: 'Standup' }).count()) >= 3)
    check('r9 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    // A drag of one occurrence asks too; "All events" shifts the series.
    const { ctx, page, errors, state } = await open('/calendar')
    await dragDown(page, standup(3), 60, () => ask(page).count().then((n) => n > 0))
    check('r10 a drag asks before it writes, and nothing is sent yet', (await ask(page).count()) === 1 && edits(state).length === 0)
    await ask(page).getByRole('button', { name: 'All events' }).click()
    await sleep(900)
    const e = edits(state)
    check('r11 "All events" sends the new times with scope all; every Standup on screen moves with it', e.length === 1 && e[0].scope === 'all' && e[0].change.starts_at && (await page.locator('.fc-timegrid-event', { hasText: 'Standup' }).count()) >= 3, JSON.stringify(e))
    check('r12 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P: phone ──
if (want('p')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  const tap = async (id) => {
    const block = page.locator(`.pc-block[data-id="${id}"]`)
    await block.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(250)
    const bb = await block.boundingBox()
    const p = { x: bb.x + 10, y: bb.y + 4 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
    await sleep(40)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(900)
  }
  // The phone shows today: move the two events there.
  await ctx.close()
  const rows = buildRows().filter((r) => r.source === 'native' || r.id === eid(N.DENTIST) || r.id === eid(N.OFFSITE))
  rows.find((r) => r.id === eid(N.DENTIST)).starts_at = iso('13:00', 12)
  rows.find((r) => r.id === eid(N.DENTIST)).ends_at = iso('14:00', 12)
  rows.find((r) => r.id === eid(N.OFFSITE)).starts_at = iso('15:00', 12)
  rows.find((r) => r.id === eid(N.OFFSITE)).ends_at = iso('16:00', 12)
  const p2 = await open('/calendar', { view: phone, rows })
  const mine = await (async () => {
    const block = p2.page.locator(`.pc-block[data-id="${eid(N.DENTIST)}"]`)
    await block.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(250)
    const bb = await block.boundingBox()
    await p2.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 10, y: bb.y + 4 }] })
    await sleep(40)
    await p2.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(900)
    return p2.page.locator('.pc-bs-rows .kf-as-row').allInnerTexts()
  })()
  check('p1 phone: ours to change — the sheet has date · time · From Google · Join meeting · Open in Google Calendar', JSON.stringify(mine.map((t) => t.split('\n')[0])) === JSON.stringify(['Mon, Oct 12', '1:00 – 2:00 PM', 'From Google · Kai', 'Join meeting', 'Open in Google Calendar']), JSON.stringify(mine))
  check('p2 …a Delete footer and an editable title', (await p2.page.locator('.pc-bs-delete').count()) === 1 && (await p2.page.locator('.pc-bs-title-in').getAttribute('readonly')) === null)
  await shot(p2.page, 'p-mine-sheet')
  await p2.page.locator('.pc-bs-delete').click()
  await sleep(900)
  check('p3 Delete sends it to google-sync', edits(p2.state).some((e) => e.id === eid(N.DENTIST) && e.change.delete), JSON.stringify(edits(p2.state)))
  const block2 = p2.page.locator(`.pc-block[data-id="${eid(N.OFFSITE)}"]`)
  await block2.scrollIntoViewIfNeeded().catch(() => {})
  await sleep(250)
  const bb2 = await block2.boundingBox()
  await p2.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb2.x + 10, y: bb2.y + 4 }] })
  await sleep(40)
  await p2.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(900)
  const rows2 = (await p2.page.locator('.pc-bs-rows .kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0])
  check('p4 phone: read-only — date · time · From Google · Open in Google Calendar · Duplicate as my event, no Delete footer, title read-only', rows2.join('|') === 'Mon, Oct 12|3:00 – 4:00 PM|From Google · Team|Open in Google Calendar|Duplicate as my event' && (await p2.page.locator('.pc-bs-delete').count()) === 0 && (await p2.page.locator('.pc-bs-title-in').getAttribute('readonly')) !== null, JSON.stringify(rows2))
  await shot(p2.page, 'p-readonly-sheet')
  check('p5 no page errors', p2.errors.length === 0, p2.errors.join(' | '))
  await p2.ctx.close()
}

// ── L: the numbers (200+ Google events, recurring ones too) ──
if (want('l')) {
  const total = buildRows({ bulk: true })
  const gcalN = total.filter((r) => r.source === 'gcal').length
  num('rows', total.length)
  num('google rows', gcalN)
  const sum = (lt) => lt.reduce((a, [, d]) => a + d, 0)
  const longest = (lt) => lt.reduce((a, [, d]) => Math.max(a, d), 0)
  // L1: opening the calendar.
  const { ctx, page, cdp, state } = await open('/calendar', { rows: total, settle: 3500 })
  const lt0 = await page.evaluate(() => window.__lt)
  num('l1 load: long tasks (count)', lt0.length)
  num('l1 load: long tasks (ms, total)', sum(lt0), ' ms')
  num('l1 load: longest long task', longest(lt0), ' ms')
  num('l1 week on screen: .fc-event elements', await page.locator('.fc-event').count())
  // L2: a sync landing while the calendar is open.
  const land = async (label, mutate) => {
    await page.evaluate(() => (window.__lt.length = 0))
    const g0 = state.gets
    mutate()
    await page.evaluate(async () => { const { queryClient } = await import('/src/lib/queryClient.ts'); await queryClient.invalidateQueries({ queryKey: ['calendar_events'] }) })
    await sleep(1800)
    const lt = await page.evaluate(() => window.__lt)
    num(`l2 ${label}: long tasks (ms, total)`, sum(lt), ' ms')
    return { gets: state.gets - g0, ms: sum(lt) }
  }
  let k = 0
  const week = state.rows.calendar_events.filter((r) => r.source === 'gcal' && r.starts_at > iso('00:00', 12) && r.starts_at < iso('00:00', 18))
  const changed = await land('30 rows changed in the week on screen', () => { for (const r of week.slice(0, 30)) { r.gcal_etag = '"2"'; r.title += ' *'; k++ } })
  const same = await land('a refetch that changed nothing', () => {})
  const far = await land('100 new rows far off screen', () => { for (let i = 0; i < 100; i++) state.rows.calendar_events.push(gcal(90000 + i, PRAYER, 'New ' + i, iso('10:00', 20, 12), iso('10:20', 20, 12))) })
  const near = await land('20 new rows in the week on screen', () => { for (let i = 0; i < 20; i++) state.rows.calendar_events.push(gcal(91000 + i, KAI, 'Added ' + i, new Date(cairo('16:00', 14).getTime() + i * 600_000).toISOString(), new Date(cairo('16:20', 14).getTime() + i * 600_000).toISOString())) })
  // L3: a realtime burst — google-sync lands 335 rows, Realtime sends a message per row. How many reads of calendar_events?
  const g0 = state.gets
  const burst = await page.evaluate(async () => {
    const { queryClient } = await import('/src/lib/queryClient.ts')
    const rt = await import('/src/lib/realtime.ts').catch(() => ({}))
    const fn = rt.invalidateSoon ?? ((t) => void queryClient.invalidateQueries({ queryKey: [t] })) // before gcal-events: the handler did exactly this
    for (let i = 0; i < 335; i++) { fn('calendar_events'); await new Promise((r) => setTimeout(r, 3)) }
    return typeof rt.invalidateSoon === 'function' ? 'invalidateSoon' : 'invalidateQueries per message'
  })
  await sleep(2500)
  num('l3 realtime burst: 335 messages → reads of calendar_events', state.gets - g0, ` (${burst})`)
  // L4: click → details, on a CPU four times slower (a laptop on battery).
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const ids = state.rows.calendar_events.filter((r) => r.source === 'gcal' && !r.all_day && r.starts_at > iso('00:00', 12) && r.starts_at < iso('00:00', 18)).map((r) => r.id)
  await page.evaluate(() => {
    window.__lat = []
    document.addEventListener('pointerup', () => { window.__t0 = performance.now() }, true)
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[role="menu"]') || n.querySelector?.('[role="menu"]')) && window.__t0) { window.__lat.push(performance.now() - window.__t0); window.__t0 = 0 }
    }).observe(document.body, { childList: true, subtree: true })
  })
  let tried = 0
  for (const id of ids) {
    if (tried >= 24) break
    const p = await ownPoint(page, id)
    if (!p) continue
    tried++
    await page.mouse.click(p.x, p.y)
    await sleep(500)
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  const lat = (await page.evaluate(() => window.__lat)).sort((a, b) => a - b)
  num('l4 click → details at 4× CPU: clicks measured', lat.length)
  num('l4 click → details at 4× CPU: median', Math.round(lat[Math.floor(lat.length / 2)] ?? -1), ' ms')
  num('l4 click → details at 4× CPU: worst', Math.round(lat.at(-1) ?? -1), ' ms')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  check('l5 clicks all opened their details at 4× CPU', lat.length === tried && tried >= 12, `${lat.length}/${tried}`)
  void changed, same, far, near
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, numbers }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
