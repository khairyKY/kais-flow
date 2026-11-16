// v1.6.4 F7 · multi-day events, on the real pages against a MOCKED backend, in Playwright Chromium (desktop 1440 week + month, phone 390).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5252] [playwright-core path]
// The dev server: `npm run dev -- --port 5252 --mode mock --host ::` with app/.env.mock.local (VITE_SUPABASE_URL=http://127.0.0.1:9).
//
// Checks (desktop week): an all-day trip Mon–Thu draws four band pieces that count themselves (2/4); a timed conference
// Tue 09:00 – Thu 17:00 sits in the band with "from 9 AM" / "until 5 PM"; a night event (Mon 22:00 – Tue 02:00) is two halves in the
// time grid and a click on the Tuesday half opens the same event; the details popover's Starts / Ends rows, picking a later
// Ends writes the new end and Ctrl+Z puts it back; the grip on the last piece grows it a day; dragging a piece moves the
// whole span; a repeating all-day weekend asks This / Following / All; a drag across three days in the band opens the
// create popover with its Ends date, and creating writes an all-day multi-day event (end exclusive). Month: the same trip
// across its days. Today: "Trip · day 3 of 4". Phone: the chip row says "day 3 of 4"; the event sheet has Starts / Ends / All day.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5252'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/rea-agents/node_modules/playwright-core/index.mjs'
const { chromium, devices } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── mock session + rows (Wed 21 Oct 2026, Cairo, 12:09 — UTC+3) ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000f711'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const cairo = (hhmm, day) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, day, h - 3, m)) }
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ev = (n, title, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso('10:00', 21), ends_at: iso('11:00', 21), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, deleted_at: null, remind_min: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const day0 = (d) => `2026-10-${String(d).padStart(2, '0')}T00:00:00.000Z`
const TRIP = ev(1, 'Trip to Alex', { all_day: true, starts_at: day0(19), ends_at: day0(23) }) // Mon 19 – Thu 22
const CONF = ev(2, 'Conference', { starts_at: iso('09:00', 20), ends_at: iso('17:00', 22) }) // Tue 09:00 – Thu 17:00
const NIGHT = ev(3, 'Night shift', { starts_at: iso('22:00', 19), ends_at: iso('02:00', 20) }) // Mon 22:00 – Tue 02:00 (the 02:00 is on the 20th)
NIGHT.ends_at = new Date(Date.UTC(2026, 9, 19, 23, 0)).toISOString() // 02:00 on Tue 20 Oct, Cairo
const WEEKEND = ev(4, 'Family weekend', { all_day: true, starts_at: day0(23), ends_at: day0(26), recurrence_rule: 'FREQ=WEEKLY;BYDAY=FR' }) // every Fri–Sun
const LUNCH_MON = ev(6, 'Lunch', { starts_at: iso('13:00', 19), ends_at: iso('14:00', 19) })
const LUNCH = ev(5, 'Lunch', { starts_at: iso('13:00', 21), ends_at: iso('14:00', 21) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: [], calendar_events: [TRIP, CONF, NIGHT, WEEKEND, LUNCH], inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(route, { phone = false, now = cairo('12:09', 21), rows = null } = {}) {
  const desc = phone ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1440, height: 900 } }
  const ctx = await browser.newContext({ ...desc, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe']))
  }, [JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [] }
  if (rows) state.rows.calendar_events = rows
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }).catch(() => {})
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user }).catch(() => {})
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return (rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: now })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_UNSAFE_PORT|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text().replace(/\s+/g, ' ').slice(0, 300)))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch((e) => errors.push('goto ' + e.message))
  await sleep(1500)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const eventWrites = (state, from = 0) => state.writes.slice(from).filter((w) => w.table.startsWith('calendar_events'))
const lastRow = (state, id, from = 0) => {
  const rows = eventWrites(state, from).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).filter((b) => b && b.id === id)
  return rows.at(-1)
}
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()))

// ───────────────────────── desktop · week ─────────────────────────
{
  // the week view is rolling (it starts on the day it opens): open it on Mon 19 so the whole trip is on screen
  const { ctx, page, errors, state } = await open('/calendar', { now: cairo('12:09', 19) })
  await page.waitForSelector('.fc', { timeout: 15000 }).catch(() => {})
  await shot(page, 'desktop-week')

  const trip = await texts(page, `.fc-daygrid-event.kf-seg[data-kf-id="${TRIP.id}"]`)
  check('week: the trip is four band pieces', trip.length === 4, JSON.stringify(trip))
  check('week: each piece after the first counts itself (2/4, 3/4, 4/4)', ['2/4', '3/4', '4/4'].every((n) => trip.some((t) => t.includes(n))), JSON.stringify(trip))
  check('week: the first piece carries the title', trip.some((t) => t.startsWith('Trip to Alex')))

  const conf = await texts(page, `.fc-daygrid-event.kf-seg[data-kf-id="${CONF.id}"]`)
  check('week: the conference is three band pieces', conf.length === 3, JSON.stringify(conf))
  check('week: the conference reads "from 9" on its first day and "until 5" on its last', /from 9/.test(conf[0] ?? '') && /until 5/.test(conf.at(-1) ?? ''), JSON.stringify(conf))

  const halves = await page.$$(`.fc-timegrid-event[data-kf-id="${NIGHT.id}"]:not(.fc-event-mirror)`)
  check('week: the night event is two halves in the time grid', halves.length === 2, `${halves.length}`)
  if (halves.length === 2) {
    await halves[1].click()
    await sleep(600)
    const menu = await texts(page, '[role="menu"], [aria-label="Block details"], [role="dialog"]')
    check('week: a click on the Tuesday half opens the same event', menu.some((t) => t.includes('Night shift')), JSON.stringify(menu).slice(0, 200))
    await shot(page, 'desktop-night-menu')
    if (!menu.some((t) => t.includes('Night shift'))) console.log('  url after click:', page.url(), '| errors so far:', errors.join(' | ').slice(0, 400))
    await page.keyboard.press('Escape')
    await sleep(300)
  }

  // details of the trip: Starts / Ends rows
  const first = await page.$(`.fc-daygrid-event.kf-seg[data-kf-id="${TRIP.id}"]`)
  await first?.click()
  await sleep(700)
  const rows = await texts(page, '[role="menu"] [role="menuitem"], [aria-label="Block details"] button')
  const hasRows = ['Starts', 'Ends', 'All day'].every((w) => rows.some((t) => t.includes(w)))
  check('details: Starts, Ends and All day rows', hasRows, JSON.stringify(rows).slice(0, 300))
  await shot(page, 'desktop-trip-details')
  const before = state.writes.length
  const endsRow = page.locator('[role="menuitem"]', { hasText: 'Ends' }).first()
  if (await endsRow.count()) {
    await endsRow.click()
    await sleep(500)
    await shot(page, 'desktop-ends-picker')
    // the picker is a month grid: Fri 23 Oct
    const day23 = page.locator('[role="gridcell"][data-day="2026-10-23"]').first()
    if (await day23.count()) {
      await day23.click()
      await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {})
      await sleep(700)
      const row = lastRow(state, TRIP.id, before)
      check('Ends: picking Fri 23 writes the end as the 24th (exclusive), the start kept', row?.ends_at === day0(24) && row?.starts_at === TRIP.starts_at, JSON.stringify(row && { s: row.starts_at, e: row.ends_at }))
      const piecesAfter = await page.$$(`.fc-daygrid-event.kf-seg[data-kf-id="${TRIP.id}"]`)
      check('Ends: the band then holds five pieces', piecesAfter.length === 5, `${piecesAfter.length}`)
      await page.keyboard.press('Control+z')
      await sleep(700)
      const back = lastRow(state, TRIP.id, before)
      check('Ends: Ctrl+Z puts the end back', back?.ends_at === TRIP.ends_at, JSON.stringify(back && back.ends_at))
    } else check('Ends: the date picker opened', false, 'no day cell 2026-10-23')
  } else check('Ends row present', false)
  await page.keyboard.press('Escape')

  // the grip on the last piece
  await sleep(500)
  const lastPiece = page.locator(`.fc-daygrid-event.kf-seg[data-kf-id="${TRIP.id}"]`).last()
  const grip = lastPiece.locator('.kf-seg-grip-end')
  check('grip: the last piece has a resize grip on its right edge', (await grip.count()) === 1)
  if (await grip.count()) {
    const colW = await page.evaluate(() => document.querySelector('.fc-timegrid-col')?.getBoundingClientRect().width ?? 150)
    const gb = await grip.boundingBox()
    const w0 = state.writes.length
    if (gb) {
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
      await page.mouse.down()
      await page.mouse.move(gb.x + gb.width / 2 + colW * 0.6, gb.y + gb.height / 2, { steps: 5 })
      await page.mouse.move(gb.x + gb.width / 2 + colW * 1.05, gb.y + gb.height / 2, { steps: 5 })
      const tip = await texts(page, '.kf-seg-tip')
      check('grip: a tip names the range while dragging', tip.length === 1 && /Mon 19 – Fri 23/.test(tip[0]), JSON.stringify(tip))
      await page.mouse.up()
      await sleep(800)
      const row = lastRow(state, TRIP.id, w0)
      check('grip: dragging a day to the right grows the trip to Fri (end 24th)', row?.ends_at === day0(24), JSON.stringify(row && row.ends_at))
      await page.keyboard.press('Control+z')
      await sleep(600)
      check('grip: Ctrl+Z undoes it', lastRow(state, TRIP.id, w0)?.ends_at === TRIP.ends_at)
    }
  }

  // the repeating weekend asks the scope
  const wk = page.locator(`.fc-daygrid-event.kf-seg[data-kf-id^="${WEEKEND.id}"]`)
  const wkN = await wk.count()
  check('repeat: the weekend series draws its Fri–Sun pieces', wkN >= 1, `${wkN}`)
  if (wkN) {
    await wk.first().click()
    await sleep(600)
    const e2 = page.locator('[role="menuitem"]', { hasText: 'Ends' }).first()
    if (await e2.count()) {
      await e2.click()
      await sleep(400)
      const target = page.locator('[role="gridcell"][data-day="2026-10-27"]').first()
      if (await target.count()) {
        await target.click()
        await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {})
        await sleep(700)
        const ask = await texts(page, '[role="dialog"], [role="alertdialog"], [role="radiogroup"]')
        check('repeat: editing a repeating multi-day event asks This / Following / All', ask.some((t) => /This event|This and following|All events/i.test(t)), JSON.stringify(ask).slice(0, 200))
        await shot(page, 'desktop-scope-ask')
        await page.keyboard.press('Escape')
      } else check('repeat: the date picker opened', false)
    } else check('repeat: Ends row', false)
    await page.keyboard.press('Escape')
  }

  check('week: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ───────────────────────── desktop · create by dragging across the band ─────────────────────────
{
  const { ctx, page, errors, state } = await open('/calendar', { now: cairo('12:09', 19), rows: [LUNCH_MON] })
  await page.waitForSelector('.fc', { timeout: 15000 }).catch(() => {})
  await sleep(500)
  const cells = await page.evaluate(() => {
    const grid = document.querySelector('.fc-timegrid-col')?.getBoundingClientRect()
    return [...document.querySelectorAll('.fc-timegrid-allday .fc-daygrid-day, td.fc-daygrid-day[data-date]')]
      .map((c) => ({ d: c.getAttribute('data-date'), r: c.getBoundingClientRect() }))
      .filter((c) => grid && c.r.x >= grid.x - 2 && c.r.width > 20 && c.r.height > 10)
      .map((c) => ({ d: c.d, x: c.r.x, y: c.r.y, w: c.r.width, h: c.r.height }))
  })
  const pick = (d) => cells.find((c) => c.d === d)
  const x1 = pick('2026-10-21'), x2 = pick('2026-10-23')
  const w1 = state.writes.length
  if (x1 && x2) {
    const y = x1.y + x1.h / 2
    await page.mouse.move(x1.x + x1.w / 2, y)
    await page.mouse.down()
    await page.mouse.move(x2.x + x2.w / 2, y, { steps: 8 })
    await page.mouse.up()
    await sleep(900)
    const pop = await texts(page, '[role="dialog"], .kf-pop')
    check('create: a drag across three days in the band opens the popover with an Ends date', pop.some((t) => /Ends/.test(t)), JSON.stringify(pop).slice(0, 240))
    await shot(page, 'desktop-create-span')
    check('create: the popover names the range (Wed 21 – Fri 23)', pop.some((t) => /Wed 21 – Fri 23/.test(t)), JSON.stringify(pop).slice(0, 240))
    await page.keyboard.type('Retreat')
    await page.keyboard.press('Enter')
    await sleep(900)
    const made = eventWrites(state, w1).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).find((r) => r && r.title === 'Retreat')
    check('create: writes an all-day event Wed 21 – Fri 23 (end exclusive, the 24th)', made?.all_day === true && made?.starts_at === day0(21) && made?.ends_at === day0(24), JSON.stringify(made && { a: made.all_day, s: made.starts_at, e: made.ends_at }))
    const pieces = await page.$$('.fc-daygrid-event.kf-seg')
    check('create: the new event is three band pieces', pieces.length === 3, `${pieces.length}`)
  } else check('create: found the band cells', false, JSON.stringify(cells).slice(0, 300))
  // the time grid: a drag from Wed 20:00 across to Thu 20:00 — a timed span over a midnight
  await page.evaluate(() => document.querySelector('.fc-timegrid-slot-lane[data-time="20:00:00"]')?.scrollIntoView({ block: 'center' }))
  await sleep(500)
  const g = await page.evaluate(() => {
    const lane = document.querySelector('.fc-timegrid-slot-lane[data-time="20:00:00"]')?.getBoundingClientRect()
    const c1 = document.querySelector('.fc-timegrid-col[data-date="2026-10-21"]')?.getBoundingClientRect()
    const c2 = document.querySelector('.fc-timegrid-col[data-date="2026-10-22"]')?.getBoundingClientRect()
    return lane && c1 && c2 ? { y: lane.y + 4, x1: c1.x + c1.width / 2, x2: c2.x + c2.width / 2 } : null
  })
  if (g) {
    const w2 = state.writes.length
    await page.mouse.move(g.x1, g.y)
    await page.mouse.down()
    await page.mouse.move(g.x2, g.y + 2, { steps: 8 })
    await page.mouse.move(g.x2, g.y + 48, { steps: 4 })
    await page.mouse.up()
    await sleep(900)
    const pop = await texts(page, '[role="dialog"], .kf-pop')
    check('create: a timed drag from Wed 20:00 into Thursday names both dates in the popover', pop.some((t) => /Wed 21/.test(t) && /Thu 22/.test(t)), JSON.stringify(pop).slice(0, 260))
    await shot(page, 'desktop-create-timed-span')
    await page.keyboard.type('Overnight')
    await page.keyboard.press('Enter')
    await sleep(900)
    const made = eventWrites(state, w2).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).find((r) => r && r.title === 'Overnight')
    check('create: it writes a timed event ending on Thursday', !!made && made.all_day === false && made.starts_at === iso('20:00', 21) && Date.parse(made.ends_at) > Date.parse(iso('00:00', 22)), JSON.stringify(made && { s: made.starts_at, e: made.ends_at }))
  } else check('create: found the time grid lanes', false)
  check('create: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ───────────────────────── desktop · month ─────────────────────────
{
  const { ctx, page, errors } = await open('/calendar')
  await page.waitForSelector('.fc', { timeout: 15000 }).catch(() => {})
  // the month view: the view options' M cell
  const opts = page.getByRole('button', { name: /view options|view/i }).first()
  await opts.click().catch(() => {})
  await sleep(400)
  await page.getByRole('button', { name: /^M$|month/i }).first().click().catch(() => {})
  await sleep(1200)
  await shot(page, 'desktop-month')
  const trip = await texts(page, `.fc-daygrid-event.kf-seg[data-kf-id="${TRIP.id}"]`)
  check('month: the trip is drawn across its four days', trip.length === 4, JSON.stringify(trip))
  const conf = await texts(page, `.fc-daygrid-event.kf-seg[data-kf-id="${CONF.id}"]`)
  check('month: the conference across its three', conf.length === 3, JSON.stringify(conf))
  check('month: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ───────────────────────── Today ─────────────────────────
{
  const { ctx, page, errors } = await open('/today')
  await sleep(800)
  await shot(page, 'desktop-today')
  const lines = await texts(page, '.td-span')
  check('today: "Trip to Alex · day 3 of 4"', lines.some((t) => t.includes('Trip to Alex') && t.includes('day 3 of 4')), JSON.stringify(lines))
  check('today: the conference is day 2 of 3', lines.some((t) => t.includes('Conference') && t.includes('day 2 of 3')), JSON.stringify(lines))
  check('today: a night event under 24 hours is not a span line', !lines.some((t) => t.includes('Night shift')))
  check('today: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ───────────────────────── phone ─────────────────────────
{
  const { ctx, page, errors, state } = await open('/calendar', { phone: true })
  await sleep(800)
  await shot(page, 'phone-calendar')
  const chips = await texts(page, '.pc-allday-chip')
  check('phone: the chip row says "day N of 4" for the trip', chips.some((t) => t.includes('Trip to Alex') && /day \d of 4/.test(t)), JSON.stringify(chips))
  check('phone: the conference chip says its times', chips.some((t) => t.includes('Conference') && /from 9|until 5|all day/.test(t)), JSON.stringify(chips))
  const chip = page.locator('.pc-allday-chip', { hasText: 'Trip to Alex' }).first()
  if (await chip.count()) {
    await chip.click()
    await sleep(900)
    await shot(page, 'phone-trip-sheet')
    const rows = await texts(page, '.kf-as-row')
    check('phone: the event sheet has Starts, Ends and All day rows', ['Starts', 'Ends', 'All day'].every((w) => rows.some((t) => t.includes(w))), JSON.stringify(rows).slice(0, 300))
    const before = state.writes.length
    await page.locator('.kf-as-row', { hasText: 'Ends' }).first().click().catch(() => {})
    await sleep(700)
    await shot(page, 'phone-ends-picker')
    const d23 = page.locator('[role="gridcell"][data-day="2026-10-23"]').first()
    if (await d23.count()) {
      await d23.click()
      await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {})
      await sleep(900)
      const row = lastRow(state, TRIP.id, before)
      check('phone: Ends → Fri 23 writes the end as the 24th', row?.ends_at === day0(24), JSON.stringify(row && row.ends_at))
    } else check('phone: the Ends picker opened', false)
  } else check('phone: found the trip chip', false)
  check('phone: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
