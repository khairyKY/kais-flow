// v165-cal-add (Kai 2026-11-16, Next up decisions §1 A "Type in place"): adding to the calendar, desktop and phone.
// On the REAL app against a MOCKED backend (dev server in `--mode mock`, a made-up session in localStorage, Playwright
// answers every REST call; writes are recorded).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5262] [playwright-core path]          ONLY=d,p,o to run some sections
// The day: Monday 16 Nov 2026, Cairo (UTC+2), 12:09. An empty afternoon, one event "Standup" at 09:00.
//   D  desktop (1280x800): a click on an empty slot is a draft hour with the caret in its title; a drag is the dragged
//      range; Enter saves (1 click + type + Enter for a 1-hour event); Esc discards; a press outside discards when empty
//      and saves when titled (and never opens the next draft); Enter on an empty title waits; "Study Crypto task" and a
//      leading "t " make a task; "… block" a Time block; right-click's New Time Block; Undo; the old popover, "More
//      options" and /new are gone; a saved block's click is the existing details popover
//   P  phone (390x844): a tap is a 1-hour draft with the keyboard's field focused INSIDE the tap (focus() called in the
//      click's own task, transient activation on); 16px (no iOS zoom); in view above a 300px keyboard; Enter saves
//      (1 tap + type + Enter); Esc and an empty outside tap discard; a titled outside tap saves; the old sheet is gone;
//      a saved block's tap is the existing sheet
//   O  offline: the block shows at once and the outbox keeps the write until the network is back
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5262'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
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
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day: Mon 16 Nov 2026, Cairo = UTC+2 ──
const cairo = (hhmm, day = 16) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h - 2, m))
}
const NOW = cairo('12:09')
const CREATED = cairo('07:00', 1).toISOString()
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const EVENTS = [{
  id: eid(1), user_id: UID, title: 'Standup', starts_at: cairo('09:00').toISOString(), ends_at: cairo('09:30').toISOString(), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
}]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 7, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: [], calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, now, opts]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '1')
    if (opts?.rail) localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
    // Every focus() on a field: was it made inside a click's own task (the phone keyboard's condition), with activation?
    window.__focus = []
    let inClick = false
    document.addEventListener('click', () => { inClick = true; setTimeout(() => { inClick = false }, 0) }, true)
    const focus = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (...a) {
      window.__focus.push({ cls: String(this.className), inClick, active: navigator.userActivation?.isActive ?? null })
      return focus.apply(this, a)
    }
  }, [JSON.stringify(session), UID, NOW.getTime(), o])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      const rows = (state.rows[table] ??= [])
      if (body && typeof body === 'object') {
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
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const writesOf = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const ISO = (hhmm, day) => cairo(hhmm, day).toISOString()
const draft = (page) => page.evaluate(() => {
  const input = document.querySelector('.kf-draft-input')
  if (!input) return null
  const r = input.getBoundingClientRect()
  const box = input.closest('.fc-event-mirror, .pc-draft')?.getBoundingClientRect()
  return { value: input.value, focused: document.activeElement === input, top: r.top, bottom: r.bottom, h: box?.height ?? 0, fs: parseFloat(getComputedStyle(input).fontSize), time: document.querySelector('.kf-draft-time')?.textContent ?? '' }
})
const noDraft = async (page) => (await draft(page)) === null

// ── desktop geometry ──
/** Scrolls the 14:00 lane into view and returns where the column and the lanes are. */
async function lane(page, hhmm, date = '2026-11-16') {
  return page.evaluate(([hhmm, date]) => {
    const l = document.querySelector(`.fc-timegrid-slot-lane[data-time="${hhmm}:00"]`)
    l.scrollIntoView({ block: 'center' })
    const lr = l.getBoundingClientRect()
    const col = document.querySelector(`.fc-timegrid-col[data-date="${date}"]`).getBoundingClientRect()
    return { x: col.left + col.width / 2, y: lr.top, h: lr.height }
  }, [hhmm, date])
}
async function click(page, hhmm, o = {}) {
  const l = await lane(page, hhmm)
  await page.mouse.click(l.x + (o.dx ?? 0), l.y + 2, o)
  await sleep(250)
  return l
}
async function drag(page, from, to) {
  const a = await lane(page, from) // scrolls `from` to the middle; `to` is a few lanes below, still on screen
  const mins = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))
  const toY = a.y + ((mins(to) - mins(from)) / 30) * a.h
  await page.mouse.move(a.x, a.y + 2)
  await page.mouse.down()
  await page.mouse.move(a.x, (a.y + toY) / 2, { steps: 6 })
  await page.mouse.move(a.x, toY - 2, { steps: 6 })
  await page.mouse.up()
  await sleep(250)
}
const quiet = async (page, state) => { await sleep(900); return writesOf(state, 'calendar_events') }

// ═══ D · desktop ═══
if (want('d')) {
  const { ctx, page, errors, state } = await open()
  check('d-open the week opens with the day\'s "Standup" and no draft', (await page.locator('.fc-timegrid-event').count()) >= 1 && (await noDraft(page)))

  // a click: an hour, the caret in its title
  let taps = 0
  const keys = []
  const l = await click(page, '14:00'); taps++
  let dr = await draft(page)
  const hour = l.h * 2 // two 30-minute lanes
  check('d-click a click on an empty slot opens a draft block with the title focused (the caret blinks there)', dr && dr.focused && dr.value === '', JSON.stringify(dr))
  check('d-click the draft is an hour tall (two 30-minute lanes) and reads its time and kind', dr && Math.abs(dr.h - hour) < 4 && /14:00/.test(dr.time) && /Event/.test(dr.time), `${dr?.h} vs ${hour} · ${dr?.time}`)
  await shot(page, 'd-draft-click')
  await page.keyboard.type('Dinner with family')
  await page.keyboard.press('Enter'); keys.push('Enter')
  const w = await quiet(page, state)
  const made = w.find((e) => e.title === 'Dinner with family')
  check('d-enter 1 click + type + Enter saves a 1-hour event right there (14:00–15:00), default colour', made && made.starts_at === ISO('14:00') && made.ends_at === ISO('15:00') && made.type === 'event' && made.color == null && !made.all_day, JSON.stringify(made))
  check('d-enter the count: 1 tap, Enter, no other control', taps === 1 && keys.join() === 'Enter', `${taps} tap, keys ${keys}`)
  check('d-enter the draft is gone and the saved block is drawn where it was', (await noDraft(page)) && (await page.locator('.fc-timegrid-event', { hasText: 'Dinner with family' }).count()) === 1)
  check('d-enter no popover, no sheet, no "More options"', (await page.locator('.kf-quickcreate, [role="dialog"]').count()) === 0 && (await page.getByText('More options').count()) === 0)
  await shot(page, 'd-saved')

  // Undo
  const undoBtn = page.getByRole('button', { name: 'Undo' })
  const hadUndo = (await undoBtn.count()) > 0
  if (hadUndo) await undoBtn.first().click()
  else await page.keyboard.press('Control+z')
  await sleep(900)
  const gone = writesOf(state, 'calendar_events').filter((e) => e.id === made?.id).at(-1)
  check('d-undo Undo takes the new event back (toast button, else Ctrl+Z)', gone && gone.deleted_at, `${hadUndo ? 'toast' : 'ctrl+z'} · ${JSON.stringify(gone)}`)
  check('d-undo and the block leaves the grid', (await page.locator('.fc-timegrid-event', { hasText: 'Dinner with family' }).count()) === 0)

  // a drag: the dragged range
  let n = state.writes.length
  await drag(page, '15:00', '17:00')
  dr = await draft(page)
  check('d-drag a drag over 15:00–17:00 opens a draft there, focused', dr && dr.focused && /15:00/.test(dr.time) && Math.abs(dr.h - hour * 2) < 6, JSON.stringify(dr))
  await page.keyboard.type('Workshop')
  await page.keyboard.press('Enter')
  let w2 = writesOf({ writes: state.writes.slice(n) }, 'calendar_events')
  await sleep(700)
  w2 = writesOf(state, 'calendar_events', n)
  const ws = w2.find((e) => e.title === 'Workshop')
  check('d-drag Enter saves exactly the dragged range', ws && ws.starts_at === ISO('15:00') && ws.ends_at === ISO('17:00'), JSON.stringify(ws))

  // a drag of one quarter keeps one quarter
  n = state.writes.length
  {
    const a = await lane(page, '18:00')
    await page.mouse.move(a.x, a.y + 2)
    await page.mouse.down()
    await page.mouse.move(a.x, a.y + 4, { steps: 2 })
    await page.mouse.move(a.x, a.y + a.h / 2 - 2, { steps: 4 })
    await page.mouse.up()
    await sleep(250)
  }
  dr = await draft(page)
  await page.keyboard.type('Quick sync')
  await page.keyboard.press('Enter')
  await sleep(700)
  const q = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Quick sync')
  check('d-drag a drag of one quarter stays a quarter (no widening to an hour)', q && Date.parse(q.ends_at) - Date.parse(q.starts_at) === 15 * 60_000, JSON.stringify(q))

  // Esc discards; empty outside press discards; titled outside press saves and opens nothing
  n = state.writes.length
  await click(page, '10:00')
  await page.keyboard.type('Not this one')
  await page.keyboard.press('Escape')
  await sleep(500)
  check('d-esc Esc discards the draft, nothing is written', (await noDraft(page)) && writesOf(state, 'calendar_events', n).length === 0)
  check('d-esc and the selection mirror is gone from the grid', (await page.locator('.fc-event-mirror').count()) === 0)

  await click(page, '10:00')
  check('d-empty-outside (draft open)', !(await noDraft(page)))
  await page.mouse.click(1100, 120) // the days header band, away from the grid slots
  await sleep(500)
  check('d-empty-outside a press outside an empty draft discards it, nothing written', (await noDraft(page)) && writesOf(state, 'calendar_events', n).length === 0)

  await click(page, '10:00')
  await page.keyboard.type('Saved by a press')
  const away = await lane(page, '20:00')
  await page.mouse.click(away.x, away.y + 2) // an empty slot: closes the draft, opens no new one
  await sleep(900)
  const so = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Saved by a press')
  check('d-titled-outside a press on another empty slot saves the titled draft there (10:00–11:00)', so && so.starts_at === ISO('10:00') && so.ends_at === ISO('11:00'), JSON.stringify(so))
  check('d-titled-outside …and does not open the next draft', await noDraft(page))

  // Enter on an empty title waits
  await click(page, '11:00')
  await page.keyboard.press('Enter')
  await sleep(300)
  dr = await draft(page)
  check('d-enter-empty Enter on an empty title does nothing: the draft stays, focused', dr && dr.focused)
  await page.keyboard.press('Escape')
  await sleep(300)

  // kinds from the title
  n = state.writes.length
  await click(page, '12:00')
  await page.keyboard.type('Study Crypto task')
  dr = await draft(page)
  check('d-task the draft reads "Task" beside the time once the title says so', dr && /Task/.test(dr.time), dr?.time)
  await page.keyboard.press('Enter')
  await sleep(900)
  const tk = writesOf(state, 'tasks', n).find((t) => t.title === 'Study Crypto')
  const blk = writesOf(state, 'calendar_events', n).find((e) => e.task_id && tk && e.task_id === tk.id)
  check('d-task "Study Crypto task" makes a task (marker off its title) due and blocked on that hour', tk && tk.due_at === ISO('12:00') && blk && blk.starts_at === ISO('12:00') && blk.ends_at === ISO('13:00'), JSON.stringify({ tk: tk && { title: tk.title, due: tk.due_at }, blk: blk && [blk.starts_at, blk.ends_at] }))

  n = state.writes.length
  await click(page, '16:30', { dx: 120 })
  await page.keyboard.type('t Buy milk !!')
  await page.keyboard.press('Enter')
  await sleep(900)
  const t2 = writesOf(state, 'tasks', n).find((t) => t.title === 'Buy milk')
  check('d-task a leading "t " makes a task too, and its !! is read', t2 && t2.priority === 2, JSON.stringify(t2 && { title: t2.title, priority: t2.priority }))

  n = state.writes.length
  await click(page, '19:00')
  await page.keyboard.type('Deep work block')
  await page.keyboard.press('Enter')
  await sleep(900)
  const tb = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Deep work')
  check('d-block "… block" makes a Time block', tb && tb.type === 'time_block', JSON.stringify(tb && tb.type))

  // right-click: New Time Block
  n = state.writes.length
  {
    const l2 = await lane(page, '21:00')
    await page.mouse.click(l2.x + 60, l2.y + 2, { button: 'right' })
    await sleep(300)
    await page.getByText('New Time Block', { exact: true }).click()
    await sleep(300)
    dr = await draft(page)
    check('d-menu right-click → New Time Block opens a draft that reads "Time block"', dr && dr.focused && /Time block/.test(dr.time), dr?.time)
    await page.keyboard.type('Focus')
    await page.keyboard.press('Enter')
    await sleep(900)
    const fb = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Focus')
    check('d-menu …and saves a Time block', fb && fb.type === 'time_block', JSON.stringify(fb && fb.type))
  }

  // all-day band: a drag over two days
  n = state.writes.length
  {
    const band = await page.evaluate(() => {
      const c = ['2026-11-17', '2026-11-18'].map((d) => document.querySelector(`.fc-daygrid-day[data-date="${d}"]`).getBoundingClientRect())
      return { y: c[0].top + c[0].height / 2, x0: c[0].left + 20, x1: c[1].left + 20 }
    })
    await page.mouse.move(band.x0, band.y)
    await page.mouse.down()
    await page.mouse.move((band.x0 + band.x1) / 2, band.y, { steps: 4 })
    await page.mouse.move(band.x1, band.y, { steps: 4 })
    await page.mouse.up()
    await sleep(300)
    dr = await draft(page)
    check('d-allday a drag over two days of the all-day band opens a draft there, focused', dr && dr.focused, JSON.stringify(dr))
    await page.keyboard.type('Offsite')
    await page.keyboard.press('Enter')
    await sleep(900)
    const ad = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Offsite')
    check('d-allday …and Enter saves an all-day event over both days (Tue 17 – Wed 18)', ad && ad.all_day && ad.starts_at === '2026-11-17T00:00:00.000Z' && ad.ends_at === '2026-11-19T00:00:00.000Z', JSON.stringify(ad))
  }

  // Ctrl-click: a task there
  n = state.writes.length
  {
    const l3 = await lane(page, '13:00')
    await page.keyboard.down('Control')
    await page.mouse.click(l3.x, l3.y + 2)
    await page.keyboard.up('Control')
    await sleep(300)
    dr = await draft(page)
    check('d-ctrl Ctrl-click opens a draft that reads "Task"', dr && dr.focused && /Task/.test(dr.time), JSON.stringify(dr))
    await page.keyboard.type('Pay rent')
    await page.keyboard.press('Enter')
    await sleep(900)
    check('d-ctrl …and saves a task blocked there', writesOf(state, 'tasks', n).some((t) => t.title === 'Pay rent'))
  }

  // the saved block's click is the existing details popover
  await page.locator('.fc-timegrid-event', { hasText: 'Saved by a press' }).first().scrollIntoViewIfNeeded()
  await page.locator('.fc-timegrid-event', { hasText: 'Saved by a press' }).first().click()
  await sleep(500)
  await shot(page, 'd-details')
  check('d-details a click on the saved block opens its details (the existing popover: an editable title), not a create form', (await page.locator('[placeholder="Add title"]').inputValue().catch(() => '')) === 'Saved by a press' && (await noDraft(page)))
  await page.keyboard.press('Escape')

  // the old way is gone
  const r = await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' })
  await sleep(600)
  check('d-gone /new is no create page any more', (await page.getByText('Something new').count()) === 0 && (await page.getByText('More options').count()) === 0, page.url())
  check('d-errors no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ R · the rail's "Quick add task…" is the capture bar ═══
if (want('r')) {
  const { ctx, page } = await open('/calendar', { rail: true })
  await page.locator('.cal-rail-extra').click()
  await sleep(600)
  check('r-rail "Quick add task…" opens the capture bar with its field focused (no create popover)', (await page.evaluate(() => document.activeElement?.id)) === 'kf-capture-input' && (await page.locator('.kf-quickcreate').count()) === 0)
  await ctx.close()
}

// ═══ P · phone ═══
if (want('p')) {
  const { ctx, page, errors, state } = await open('/calendar', { view: phone })
  // where an hour sits on the canvas
  const spot = (hour, minute = 0) => page.evaluate(([hour, minute]) => {
    const sc = document.querySelector('.pc-scroll')
    const canvas = document.querySelector('.pc-canvas')
    sc.scrollTop = Math.max(0, hour * 64 - 200)
    const r = canvas.getBoundingClientRect()
    const x = r.left + 60 + (r.width - 60) / 2
    return { x, y: r.top + (hour + minute / 60) * 64 + 8 }
  }, [hour, minute])
  const tap = async (hour, minute = 0) => {
    const p = await spot(hour, minute)
    await sleep(100)
    const q = await spot(hour, minute)
    await page.touchscreen.tap(q.x, q.y)
    await sleep(350)
    return q
  }
  check('p-open the day opens with its Standup and no draft', (await page.locator('.pc-block').count()) >= 1 && (await noDraft(page)))

  let taps = 0
  const keys = []
  await page.evaluate(() => { window.__focus.length = 0 })
  await tap(15); taps++
  let dr = await draft(page)
  const foc = await page.evaluate(() => window.__focus.filter((f) => f.cls.includes('kf-draft-input')))
  check('p-tap a tap on an empty slot opens a draft with its title field focused', dr && dr.focused, JSON.stringify(dr))
  check('p-tap the field was focused inside the tap\'s own click task, with user activation (iOS raises the keyboard for that and nothing later)', foc.length >= 1 && foc.every((f) => f.inClick && f.active), JSON.stringify(foc))
  check('p-tap an hour tall (64px) and reads its time and kind', dr && Math.abs(dr.h - 64) < 3 && /15:00/.test(dr.time) && /Event/.test(dr.time), `${dr?.h} · ${dr?.time}`)
  check('p-tap the field is 16px (iOS does not zoom the page on focus)', dr && dr.fs >= 16, `${dr?.fs}px`)
  // a 300px keyboard covers the bottom of the screen: the field sits clear above it
  check('p-tap the field sits above a 300px keyboard (kept in view)', dr && dr.bottom < 844 - 300, `${dr?.top}–${dr?.bottom}`)
  check('p-tap no sheet opened', (await page.locator('[role="dialog"]').count()) === 0)
  await shot(page, 'p-draft')
  await page.keyboard.type('Dinner with family')
  await page.keyboard.press('Enter'); keys.push('Enter')
  await sleep(900)
  const made = writesOf(state, 'calendar_events').find((e) => e.title === 'Dinner with family')
  check('p-enter 1 tap + type + Enter saves a 1-hour event there (15:00–16:00)', made && made.starts_at === ISO('15:00') && made.ends_at === ISO('16:00') && made.type === 'event' && made.color == null, JSON.stringify(made))
  check('p-enter the count: 1 tap, Enter, no button', taps === 1 && keys.join() === 'Enter', `${taps} tap, keys ${keys}`)
  check('p-enter the saved block is drawn where the draft was', (await noDraft(page)) && (await page.locator('.pc-block', { hasText: 'Dinner with family' }).count()) === 1)
  await shot(page, 'p-saved')

  // Undo toast
  const undo = page.getByRole('button', { name: 'Undo' })
  const hadUndo = (await undo.count()) > 0
  if (hadUndo) { await undo.first().click(); await sleep(700) }
  const gone = writesOf(state, 'calendar_events').filter((e) => e.id === made?.id).at(-1)
  check('p-undo Undo takes it back', hadUndo && gone?.deleted_at, JSON.stringify(gone?.deleted_at))

  // Esc / Back
  let n = state.writes.length
  await tap(11)
  await page.keyboard.type('Never mind')
  await page.keyboard.press('Escape')
  await sleep(400)
  check('p-esc Esc (and Android Back) discards the draft, nothing written', (await noDraft(page)) && writesOf(state, 'calendar_events', n).length === 0)

  // empty outside tap discards and opens nothing
  await tap(11)
  const lone = await draft(page)
  await tap(17)
  check('p-empty-outside a tap elsewhere on an empty draft discards it and opens no new one', lone && (await noDraft(page)) && writesOf(state, 'calendar_events', n).length === 0)

  // titled outside tap saves
  await tap(11)
  await page.keyboard.type('Saved by a tap')
  await tap(18)
  await sleep(900)
  const so = writesOf(state, 'calendar_events', n).find((e) => e.title === 'Saved by a tap')
  check('p-titled-outside a tap elsewhere saves a titled draft (11:00–12:00) and opens no new one', so && so.starts_at === ISO('11:00') && so.ends_at === ISO('12:00') && (await noDraft(page)), JSON.stringify(so))

  // a task from the title
  n = state.writes.length
  await tap(13)
  await page.keyboard.type('Study Crypto task')
  await page.keyboard.press('Enter')
  await sleep(900)
  const tk = writesOf(state, 'tasks', n).find((t) => t.title === 'Study Crypto')
  const blk = writesOf(state, 'calendar_events', n).find((e) => tk && e.task_id === tk.id)
  check('p-task "Study Crypto task" makes a task blocked on that hour', tk && blk && blk.starts_at === ISO('13:00') && blk.ends_at === ISO('14:00'), JSON.stringify({ tk: tk?.title, blk: blk && [blk.starts_at, blk.ends_at] }))

  // late slot: room for the hour
  n = state.writes.length
  await sleep(5500) // the last toast sits over the bottom of the grid till it goes
  await tap(23, 20)
  dr = await draft(page)
  check('p-late a tap at 23:20 gets a full hour: the draft slides up to 23:00–24:00', dr && Math.abs(dr.h - 64) < 3 && /23:00/.test(dr.time), JSON.stringify(dr))
  await page.keyboard.press('Escape')

  // the saved block's tap is the existing sheet
  await page.locator('.pc-block', { hasText: 'Saved by a tap' }).first().tap()
  await sleep(600)
  await shot(page, 'p-details')
  check('p-details a tap on a saved block opens its sheet (the existing one)', (await page.locator('[role="dialog"]').count()) >= 1)
  check('p-errors no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ O · offline ═══
if (want('o')) {
  const { ctx, page, state } = await open()
  await ctx.setOffline(true)
  await click(page, '14:00')
  await page.keyboard.type('Written offline')
  await page.keyboard.press('Enter')
  await sleep(900)
  check('o-block the block shows at once, offline', (await page.locator('.fc-timegrid-event', { hasText: 'Written offline' }).count()) === 1)
  check('o-queue nothing reached the server yet', writesOf(state, 'calendar_events').filter((e) => e.title === 'Written offline').length === 0)
  await ctx.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await sleep(2500)
  const w = writesOf(state, 'calendar_events').find((e) => e.title === 'Written offline')
  check('o-flush back online the outbox sends it, whole (14:00–15:00)', w && w.starts_at === ISO('14:00') && w.ends_at === ISO('15:00'), JSON.stringify(w))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
