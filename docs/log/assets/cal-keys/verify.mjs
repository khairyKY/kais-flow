// cal-keys (2026-10-13, p7e A4 · A13 · A15 · A16): the Calendar's keys, ‹ Today › as real buttons,
// ⌘/Ctrl-click makes a Task, ⌫ deletes a plain event (Undo), the ? sheet's Calendar section; repeats
// (Yearly, "Next ·" from today, an ending count, Repeat while creating); the weekend / overlap / rail
// footer truths; no false Google line — on the REAL app against a MOCKED backend (the cal-wave2 recipe:
// dev server `--mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage,
// Playwright answers every REST call; writes are recorded AND applied to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=k1,k4 runs some)
// The day: Friday 10 Jul 2026, Cairo (UTC+3), the clock at 13:20. The week is rolling: Fri 10 → Thu 16.
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000c4e1'
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
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const STRETCH = 13, PILLS = 14
const TASKS = [
  task(1, 'Draft social media kit for launch', { duration_min: 45 }),
  task(2, 'Reply to Youssef about invoice', { duration_min: 15 }),
  // An overdue daily repeat (due Tue 7 Jul): its sheet's "Next ·" must be tomorrow, not Wed 8.
  task(STRETCH, 'Stretch', { due_at: iso('09:00', 7), recurrence_rule: 'FREQ=DAILY' }),
  // "Ends after 2 times", the first of them due today: one more, then none.
  task(PILLS, 'Pill course', { due_at: iso('09:00', 10), recurrence_rule: 'FREQ=DAILY;COUNT=2' }),
]
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, over.day ?? 10), ends_at: iso(to, over.endDay ?? over.day ?? 10), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: [], created_at: CREATED, updated_at: CREATED,
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'day' && k !== 'endDay')),
})
const DEEP = 1, SYNC = 2, REVIEW = 3, STANDUP = 4, FREE = 5, CALL_A = 6, CALL_B = 7, CLASH = 8
const EVENTS = [
  ev(DEEP, 'Deep work — Forecasting', '09:00', '11:00', { type: 'time_block' }),
  ev(SYNC, 'Sync with Omar', '13:00', '13:45'),
  ev(REVIEW, 'Review portfolio', '15:00', '16:00', { type: 'time_block' }),
  ev(STANDUP, 'Standup', '08:30', '09:00', { day: 13, recurrence_rule: 'FREQ=DAILY' }),
]
// A15 footer: a Free event blocks nothing and takes no free time.
const FREE_EV = ev(FREE, 'Lunch walk', '17:00', '18:00', { busy: false })
// A15 overlaps, on Sat 11: A ends 17:00 as the client writes it (.000Z), B starts 17:00 as Postgres returns
// it (+00:00) — back to back, no clash; C sits inside A — a real one.
const OVERLAPS = [
  ev(CALL_A, 'Call A', '16:00', '17:00', { day: 11 }),
  { ...ev(CALL_B, 'Call B', '17:00', '17:30', { day: 11 }), starts_at: '2026-07-11T14:00:00+00:00', ends_at: '2026-07-11T14:30:00+00:00' },
  ev(CLASH, 'Clash', '16:30', '16:45', { day: 11 }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
// Every first-run hint already seen (features/tour/help.ts keys), so they don't cover the frames.
const HINTS = [...fs.readFileSync(new URL('../../../../app/src/features/tour/help.ts', import.meta.url), 'utf8').matchAll(/(?:key|teaches|id): '([^']+)'/g)].map((m) => m[1])
const tables = (extra = []) => structuredClone({ tasks: TASKS, calendar_events: [...EVENTS, ...extra], inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: o.device ?? 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, hints, uid, viewOpts, rail]) => {
    localStorage.setItem(`kf-help:${uid}`, hints)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', checkedAt: 4102444800000 }))
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calPlanning', '0')
    if (viewOpts) localStorage.setItem('kf.calViewOptions', viewOpts)
    if (rail) localStorage.setItem('kf.calRailFolded', rail)
  }, [o.theme ?? 'day', JSON.stringify(session), JSON.stringify(HINTS), UID, o.viewOpts ? JSON.stringify(o.viewOpts) : '', o.rail ?? ''])
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
const fc = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]`).first()
const menu = (page, label = 'Block details') => page.locator(`[role="menu"][aria-label="${label}"]`).last()
const viewLabel = (page) => page.locator('.cal-head [aria-haspopup="dialog"]').innerText()
const rangeText = (page) => page.locator('.cal-head h1').innerText()
const cols = (page) => page.locator('.fc-timegrid-col[data-date]').evaluateAll((els) => els.map((e) => e.getAttribute('data-date')))
const press = async (page, key) => {
  await page.keyboard.press(key)
  await sleep(450)
}
const railFolded = async (page) => (await page.locator('.cal-rail.is-folded').count()) === 1

// ── K1: the view, paging, today and rail keys ──
if (want('k1')) {
  const { ctx, page, errors, state } = await open('/calendar')
  await page.mouse.click(5, 790) // focus the page, nothing in particular
  check('k1 opens on Week: 7 columns from today (Fri 10 → Thu 16)', /week/i.test(await viewLabel(page)) && (await cols(page)).length === 7, `${await viewLabel(page)} ${JSON.stringify(await cols(page))}`)
  await press(page, 'd')
  check('k1 d → Day (one column, today)', /day/i.test(await viewLabel(page)) && JSON.stringify(await cols(page)) === '["2026-07-10"]', `${await viewLabel(page)} ${JSON.stringify(await cols(page))}`)
  const w = state.writes.length
  await press(page, '3')
  await settle(state)
  check('k1 3 → 3 days (and the day count is remembered, as the popover does)', /3 days/i.test(await viewLabel(page)) && (await cols(page)).length === 3 && posts(state, 'app_settings', w).some((s) => s.calendar_day_count === 3), `${await viewLabel(page)} ${(await cols(page)).length}`)
  const w6 = state.writes.length
  await press(page, '6')
  await settle(state)
  // cal-wave (2026-10-25): the N-day view drops days rather than go under the 80px column, so at 1280 with
  // the rail open 6 shows as many as fit (5). The key still picks 6; the header names what is shown.
  const n6 = (await cols(page)).length
  check('k1 6 → 6 days (shown as many as fit, header says so)', posts(state, 'app_settings', w6).some((s) => s.calendar_day_count === 6) && n6 >= 5 && n6 <= 6 && new RegExp(`${n6} days`, 'i').test(await viewLabel(page)), `${await viewLabel(page)} ${n6}`)
  await press(page, 'w')
  check('k1 w → Week', /week/i.test(await viewLabel(page)) && (await cols(page)).length === 7, await viewLabel(page))
  await press(page, '1')
  check('k1 1 → Day', /day/i.test(await viewLabel(page)) && (await cols(page)).length === 1, await viewLabel(page))
  await press(page, '7')
  check('k1 7 → Week', /week/i.test(await viewLabel(page)) && (await cols(page)).length === 7, await viewLabel(page))
  await press(page, 'm')
  check('k1 m → Month', /month/i.test(await viewLabel(page)) && (await page.locator('.fc-dayGridMonth-view').count()) === 1 && /July 2026/i.test(await rangeText(page)), `${await viewLabel(page)} ${await rangeText(page)}`)
  await press(page, '=')
  check('k1 = → next month (August)', /August 2026/i.test(await rangeText(page)), await rangeText(page))
  await press(page, '-')
  check('k1 - → back to July', /July 2026/i.test(await rangeText(page)), await rangeText(page))
  await press(page, 'w')
  const here = await rangeText(page)
  await press(page, 'ArrowRight')
  const next = await rangeText(page)
  await press(page, 'ArrowLeft')
  check('k1 → / ← page a week and back', /Jul 10 — 16/.test(here) && /Jul 17 — 23/.test(next) && (await rangeText(page)) === here, `${here} | ${next} | ${await rangeText(page)}`)
  await press(page, '=')
  await press(page, '=')
  await press(page, 't')
  check('k1 t → back to today', (await rangeText(page)) === here, await rangeText(page))
  const before = await railFolded(page)
  await press(page, '0')
  const after = await railFolded(page)
  await press(page, '0')
  check('k1 0 folds / unfolds the planning rail', before !== after && (await railFolded(page)) === before, `${before} → ${after} → ${await railFolded(page)}`)
  // An Arabic layout: the D key arrives as "ي" with code KeyD.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ي', code: 'KeyD', bubbles: true, cancelable: true })))
  await sleep(450)
  check('k1 on an Arabic layout the D key (ي, KeyD) still means Day', /day/i.test(await viewLabel(page)), await viewLabel(page))
  await press(page, 'w')
  check('k1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K2: never while typing, nor with a menu / popover / dialog open ──
if (want('k2')) {
  const { ctx, page, errors } = await open('/calendar')
  // The view popover (a dialog) is open: m does nothing to the view behind it.
  await page.locator('.cal-head [aria-haspopup="dialog"]').click()
  await sleep(400)
  await press(page, 'm')
  check('k2 with the view popover open, m does nothing', /week/i.test(await viewLabel(page)) && (await page.locator('.fc-dayGridMonth-view').count()) === 0, await viewLabel(page))
  await press(page, 'Escape')
  // Typing a title in the quick-create popover: d, m, 0 and = are letters, not keys.
  await page.locator('.fc-timegrid-slot-lane[data-time="17:00:00"]').first().scrollIntoViewIfNeeded()
  const slot = await page.locator('.fc-timegrid-slot-lane[data-time="17:00:00"]').first().boundingBox()
  const col = await page.locator('.fc-timegrid-col[data-date="2026-07-12"]').boundingBox()
  await page.mouse.click(col.x + col.width / 2, slot.y + slot.height / 2)
  await sleep(600)
  await page.keyboard.type('dm0=t')
  await sleep(400)
  check('k2 typing "dm0=t" in a title types it — the view stays Week, the range stays', (await page.locator('.kf-quickcreate input[aria-label="Title"]').inputValue()) === 'dm0=t' && /week/i.test(await viewLabel(page)) && /Jul 10 — 16/.test(await rangeText(page)), `${await page.locator('.kf-quickcreate input[aria-label="Title"]').inputValue()} ${await viewLabel(page)}`)
  await press(page, 'Escape')
  // The ? sheet is open: d does nothing behind it.
  await press(page, '?')
  await press(page, 'd')
  check('k2 with the ? sheet open, d does nothing', (await page.locator('[role="dialog"][aria-label="Shortcuts"]').count()) === 1 && /week/i.test(await viewLabel(page)), await viewLabel(page))
  await press(page, 'Escape')
  check('k2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K3: ‹ Today › are real buttons ──
if (want('k3')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme })
    const head = page.locator('.cal-head')
    const tags = await head.locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent))
    check(`k3 ${theme}: ‹ Today › are buttons (Previous · Today · Next)`, tags.includes('Previous') && tags.includes('Today') && tags.includes('Next'), JSON.stringify(tags))
    await head.getByRole('button', { name: 'Next' }).focus()
    await press(page, 'Enter')
    check(`k3 ${theme}: focused Next + Enter pages forward`, /Jul 17 — 23/.test(await rangeText(page)), await rangeText(page))
    const ring = await head.getByRole('button', { name: 'Next' }).evaluate((e) => getComputedStyle(e).boxShadow)
    check(`k3 ${theme}: the focused button shows the kit's focus ring`, ring && ring !== 'none', ring)
    await shot(page, `k3-head-focus-${theme}`)
    await head.getByRole('button', { name: 'Today' }).click()
    await sleep(400)
    check(`k3 ${theme}: Today brings it back`, /Jul 10 — 16/.test(await rangeText(page)), await rangeText(page))
    await head.getByRole('button', { name: 'Previous' }).click()
    await sleep(400)
    check(`k3 ${theme}: Previous pages back`, /Jul 3 — 9/.test(await rangeText(page)), await rangeText(page))
    check(`k3 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── K4: Ctrl-click (Windows) and ⌘-click (Mac) an empty slot make a Task there ──
if (want('k4')) {
  const { ctx, page, errors, state } = await open('/calendar')
  const slotAt = async (time, date) => {
    const lane = page.locator(`.fc-timegrid-slot-lane[data-time="${time}"]`).first()
    await lane.scrollIntoViewIfNeeded()
    const s = await lane.boundingBox()
    const c = await page.locator(`.fc-timegrid-col[data-date="${date}"]`).boundingBox()
    return { x: c.x + c.width / 2, y: s.y + s.height / 2 }
  }
  for (const [mod, time, date, day, title] of [['Control', '16:30:00', '2026-07-11', 11, 'Call the bank'], ['Meta', '17:30:00', '2026-07-12', 12, 'Book the dentist']]) {
    const at = await slotAt(time, date)
    await page.keyboard.down(mod)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.up(mod)
    await sleep(700)
    const form = page.locator('.kf-quickcreate')
    const text = await form.innerText().catch(() => '')
    check(`k4 ${mod}-click a slot opens the quick create as a Task ("Due · block")`, /Due · block/i.test(text), text.slice(0, 120).replace(/\n/g, ' | '))
    await shot(page, `k4-${mod.toLowerCase()}-click-task`)
    await form.locator('input[aria-label="Title"]').fill(title)
    const w = state.writes.length
    await press(page, 'Enter')
    await settle(state)
    const t = posts(state, 'tasks', w).find((x) => x.title === title)
    const hhmm = time.slice(0, 5)
    check(`k4 ${mod}-click: the task is due ${date} ${hhmm} and its block sits there`, !!t && t.due_at === iso(hhmm, day) && posts(state, 'calendar_events', w).some((e) => e.task_id === t.id && e.starts_at === iso(hhmm, day)), JSON.stringify({ due: t?.due_at, want: iso(hhmm, day), blocks: posts(state, 'calendar_events', w).map((e) => [e.title, e.starts_at]) }))
  }
  // A plain click is still an Event.
  const at = await slotAt('18:30:00', '2026-07-13')
  await page.mouse.click(at.x, at.y)
  await sleep(700)
  check('k4 a plain click still opens an Event ("When")', /when/i.test(await page.locator('.kf-quickcreate').innerText()) && !/Due · block/i.test(await page.locator('.kf-quickcreate').innerText()))
  await press(page, 'Escape')
  check('k4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K5: ⌫ deletes a plain event (with Undo); never a series ──
if (want('k5')) {
  const { ctx, page, errors, state } = await open('/calendar')
  await fc(page, eid(SYNC)).scrollIntoViewIfNeeded()
  await fc(page, eid(SYNC)).click()
  await sleep(600)
  const del = await menu(page).getByRole('menuitem', { name: /Delete/ }).innerText()
  check('k5 the plain event\'s Delete row shows ⌫', /⌫/.test(del), del.replace(/\n/g, ' | '))
  await shot(page, 'k5-popover-delete-key')
  let w = state.writes.length
  await press(page, 'Backspace')
  await settle(state)
  const gone = posts(state, 'calendar_events', w).find((e) => e.id === eid(SYNC))
  check('k5 ⌫ deletes it: "Deleted" toast, the row soft-deleted, the popover closed', !!gone?.deleted_at && (await toastSoon(page, 'Deleted')) && (await menu(page).count()) === 0 && (await fc(page, eid(SYNC)).count()) === 0, JSON.stringify(gone && { deleted_at: gone.deleted_at }))
  w = state.writes.length
  await page.locator('.kf-toast', { hasText: 'Deleted' }).getByRole('button', { name: 'Undo' }).first().click()
  await settle(state)
  check('k5 Undo brings it back', posts(state, 'calendar_events', w).some((e) => e.id === eid(SYNC) && !e.deleted_at) && (await fc(page, eid(SYNC)).count()) === 1)
  // A repeating Standup: ⌫ leaves the series alone (its Delete asks This / All).
  const standup = page.locator(`.fc-event[data-kf-id^="${eid(STANDUP)}"]`).first()
  await standup.scrollIntoViewIfNeeded()
  await standup.click()
  await sleep(600)
  w = state.writes.length
  await press(page, 'Backspace')
  await sleep(1200)
  check('k5 ⌫ on a repeat does nothing — no write, the popover stays', state.writes.length === w && (await menu(page).count()) === 1)
  await press(page, 'Escape')
  check('k5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K6: the ? sheet's Calendar section is back, listing the keys that work ──
if (want('k6')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme })
    await press(page, '?')
    const sheet = page.locator('[role="dialog"][aria-label="Shortcuts"]')
    const txt = await sheet.innerText()
    const rows = ['Day · Week · Month', '1 day · 2–6 days · Week', 'Previous · next', 'Jump to today', 'Fold the planning rail', 'New task in that slot', 'Delete the open event']
    check(`k6 ${theme}: the Calendar section lists every calendar key`, /Calendar/i.test(txt) && rows.every((r) => txt.includes(r)), rows.filter((r) => !txt.includes(r)).join(' / '))
    // Evidence, not a check: the three columns' heights and whether the sheet scrolls at 1280×800.
    const fit = await sheet.evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight, cols: [...e.querySelectorAll(':scope > div[style*="grid"] > div')].map((c) => Math.round(c.lastElementChild.getBoundingClientRect().bottom - c.getBoundingClientRect().top)) }))
    console.log(`     k6 ${theme} sheet fit: ${JSON.stringify(fit)}`)
    await sheet.evaluate((e) => e.scrollTo(0, e.scrollHeight))
    await sleep(300)
    await shot(page, `k6-cheatsheet-${theme}`)
    check(`k6 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── W1: "Show weekends" off hides the user's weekend (A15) ──
if (want('w1')) {
  for (const [label, weekend, want] of [['Fri + Sat', [5, 6], ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16']], ['Sat + Sun (default)', null, ['2026-07-10', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16']], ['Sun only', [0], ['2026-07-10', '2026-07-11', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16']]]) {
    const { ctx, page, errors } = await open('/calendar', { settings: { weekend_days: weekend }, viewOpts: { showWeekends: false } })
    const shown = await cols(page)
    check(`w1 ${label}: Show weekends off hides exactly that weekend`, JSON.stringify(shown) === JSON.stringify(want), JSON.stringify(shown))
    if (weekend?.[0] === 5) await shot(page, 'w1-weekend-fri-sat-hidden')
    check(`w1 ${label}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── O1: back-to-back is not a clash; a real overlap is (A15) ──
if (want('o1')) {
  const { ctx, page, errors } = await open('/calendar', { extra: OVERLAPS })
  await fc(page, eid(CALL_A)).scrollIntoViewIfNeeded()
  const flagged = await page.locator('.fc-event.fc-event-conflict').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-kf-id')))])
  check('o1 only Call A and the Clash inside it wear ⚠; Call B, back to back after A, does not', flagged.length === 2 && flagged.includes(eid(CALL_A)) && flagged.includes(eid(CLASH)) && !flagged.includes(eid(CALL_B)), JSON.stringify(flagged))
  await shot(page, 'o1-overlaps')
  check('o1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── F1: the rail footer counts busy blocks and the free time really left (A15) ──
// (Bound Journal, 2026-10-14: the count moved from the rail's footer to its header line, .cal-rail-load.)
if (want('f1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme, extra: [FREE_EV], rail: '0' })
    const foot = (await page.locator('.cal-rail .cal-rail-load').innerText()).replace(/\n/g, ' ')
    // 13:20 → free 13:45–15:00 and 16:00–20:00 = 5h 15m → 5h 30m; the Free walk at 17:00 doesn't count.
    check(`f1 ${theme}: "3 blocks · 5h 30m free" (the Free walk isn't a block; past time isn't free)`, /^3 blocks · 5h 30m free$/i.test(foot), foot)
    await page.locator('.cal-rail').evaluate((e) => e.scrollTo(0, e.scrollHeight))
    await shot(page, `f1-rail-footer-${theme}`)
    check(`f1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── R1: Repeat while creating; Yearly; no false Google line (A13, A16) ──
if (want('r1')) {
  const { ctx, page, errors, state } = await open('/new?kind=event')
  const form = page.locator('.kf-quickcreate')
  check('r1 the event form no longer claims a Google Calendar mirror', !/Google/i.test(await form.innerText()))
  await form.getByRole('button', { name: 'Repeat' }).click()
  await sleep(400)
  const items = await page.locator('[role="menu"][aria-label="Repeat"]').last().innerText()
  check('r1 the Repeat picker offers Yearly', /Yearly/.test(items), items.replace(/\n/g, ' | '))
  await page.locator('[role="menu"][aria-label="Repeat"]').last().getByText('Weekly', { exact: true }).click()
  await sleep(300)
  await form.locator('input[aria-label="Title"]').fill('Gym')
  await shot(page, 'r1-create-event-repeat')
  const w = state.writes.length
  await form.getByRole('button', { name: /Create event/ }).click()
  await settle(state)
  const made = posts(state, 'calendar_events', w).filter((e) => e.title === 'Gym')
  check('r1 Create: the event is saved repeating weekly', made.some((e) => e.recurrence_rule === 'FREQ=WEEKLY'), JSON.stringify(made.map((e) => e.recurrence_rule)))
  // The block kind has it too.
  await page.goto(`${BASE}/new?kind=block`, { waitUntil: 'networkidle' })
  await sleep(1000)
  check('r1 the time-block form has Repeat as well', (await page.locator('.kf-quickcreate').getByRole('button', { name: 'Repeat' }).count()) === 1)
  check('r1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R2: the sheet's Next and an ending count (A13), on the phone sheet ──
if (want('r2')) {
  const { ctx, page, errors, state } = await open(`/tasks?task=${tid(STRETCH)}`, { view: phone })
  const next = (await page.locator('.ts-next').innerText().catch(() => '')).trim()
  // 12h clock since v1.4.0 (one-clock change): "9:00 AM", not "09:00".
  check('r2 an overdue daily repeat previews from today: "Next · Sat 11 Jul 9:00 AM · then Sun 12" (not Wed 8)', /^next · sat 11 jul 9:00 am · then sun 12$/i.test(next), next)
  await shot(page, 'r2-next-overdue')
  await page.goto(`${BASE}/tasks?task=${tid(PILLS)}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const pills = (await page.locator('.ts-next').innerText().catch(() => '')).trim()
  check('r2 "Ends after 2 times", the first: one more next (no "then")', /^next · sat 11 jul 9:00 am$/i.test(pills), pills)
  const w = state.writes.length
  await page.getByRole('button', { name: 'Done for today' }).click()
  await settle(state)
  const spawned = posts(state, 'tasks', w).find((t) => t.id !== tid(PILLS) && t.title === 'Pill course')
  check('r2 Done for today: the last one is spawned for Sat 11 carrying COUNT=1', spawned?.due_at === iso('09:00', 11) && spawned?.recurrence_rule === 'FREQ=DAILY;COUNT=1', JSON.stringify(spawned && { due: spawned.due_at, rule: spawned.recurrence_rule }))
  check('r2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P1: the phone create sheet — an Event can repeat from the start (A13) ──
if (want('p1')) {
  const { ctx, page, errors, state } = await open('/calendar', { view: phone })
  await page.evaluate(() => { const el = document.querySelector('.pc-scroll'); if (el) el.scrollTop = 64 * 15 })
  await sleep(300)
  const canvas = await page.locator('.pc-canvas').boundingBox()
  const track = await page.locator('.pc-track').boundingBox()
  await page.mouse.click(track.x + 60, canvas.y + 64 * 17 + 4)
  await sleep(700)
  await page.locator('.pc-qc-top button', { hasText: 'Event' }).click()
  await sleep(300)
  await page.locator('.pc-qc').getByText('Repeat', { exact: true }).click()
  await sleep(400)
  await page.locator('[role="dialog"]').last().getByText('Weekly', { exact: true }).click()
  await sleep(400)
  await page.locator('.pc-qc-title').fill('Football')
  await shot(page, 'p1-phone-event-repeat')
  const w = state.writes.length
  await page.getByRole('button', { name: 'Save' }).click()
  await settle(state)
  check('p1 the phone sheet saves the event repeating weekly', posts(state, 'calendar_events', w).some((e) => e.title === 'Football' && e.recurrence_rule === 'FREQ=WEEKLY'), JSON.stringify(posts(state, 'calendar_events', w).map((e) => [e.title, e.recurrence_rule])))
  check('p1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
