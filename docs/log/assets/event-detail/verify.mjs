// Block detail popover (Calendar.dc.html §5) + repeating events (migration 0061), Kai 2026-10-12, on
// the REAL app against a MOCKED backend (the cal-rail-drop recipe: dev server with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every
// REST call). Writes are recorded AND applied to the mock rows, so a refetch can't hide a bug.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=a1,b2 runs some)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5247'
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P1 = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const REVIEW = 1, TYRE = 2
const TASKS = [
  task(REVIEW, 'Review Kai', { duration_min: 30, due_at: iso('09:00') }),
  task(TYRE, 'Call the tyre supplier', { duration_min: 30, due_at: iso('09:00', 14), scheduled_start: iso('12:00'), scheduled_end: iso('12:30') }),
]
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const LUNCH = 1, GYM = 2, TYREB = 3, STANDUP = 4
const EVENTS = [
  ev(LUNCH, 'Lunch with Omar', '10:30', '11:30'),
  ev(GYM, 'Gym', '13:00', '14:00', null, 'time_block'),
  ev(TYREB, 'Call the tyre supplier', '12:00', '12:30', TYRE),
  // A daily series (0061), stored as ONE row: 08:00–08:30 Cairo from today.
  ev(STANDUP, 'Standup', '08:00', '08:30', null, 'event', { recurrence_rule: 'FREQ=DAILY', recurrence_exdates: [] }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [{ id: P1, user_id: UID, name: 'Site', domain_id: null, status: 'active', color: '#7A946E', created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: PROJECTS, domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  // o.device: the DEVICE zone — the user's stays Cairo (app_settings), so a different device zone
  // proves the grid reads the user's clock.
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: o.device ?? 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, rail, uid]) => {
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true })) // its strings read the 24-hour clock (lib/clock, 2026-10-22)
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', rail ? '0' : '1')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ lists: true }))
    // The "What's new" toast has its own harness; at the bottom of the screen it can sit under a slot click.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() + 864e5 }))
  }, [o.theme ?? 'day', JSON.stringify(session), !!o.rail, UID])
  const state = { rows: tables(), writes: [] }
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
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const deletes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE')
/** Waits for the outbox to send (up to 3s for its first write), then for it to go quiet. */
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
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).first().click()
const row = (state, n) => state.rows.calendar_events.find((e) => e.id === eid(n))
// The grid: one block per id (an occurrence's id is "<row id>::<start ISO>").
const fc = (page, kfId) => page.locator(`.fc-event[data-kf-id="${kfId}"]`).first()
const occId = (n, hhmm, day) => `${eid(n)}::${iso(hhmm, day)}`
const menu = (page, label = 'Block details') => page.locator(`[role="menu"][aria-label="${label}"]`).last()
const item = (page, label, menuLabel) => menu(page, menuLabel).getByRole('menuitem', { name: label, exact: false }).first()
async function openBlock(page, kfId) {
  await fc(page, kfId).scrollIntoViewIfNeeded()
  await sleep(150)
  await fc(page, kfId).click()
  await menu(page).waitFor({ timeout: 4000 })
  await sleep(250)
}
async function pick(page, rowLabel, choice, subLabel) {
  await item(page, rowLabel).click()
  await sleep(250)
  await item(page, choice, subLabel).click()
  await sleep(300)
}

// ── A1: a click opens the §5 popover beside the block — the menu, not the old form ──
if (want('a1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/calendar', { theme })
    await openBlock(page, eid(LUNCH))
    const b = await fc(page, eid(LUNCH)).boundingBox()
    const m = await menu(page).boundingBox()
    // Top-aligned with the block, or nudged up just enough to stay in the window (ContextMenu's clamp).
    const top = Math.abs(m.y - b.y) < 2 || (m.y < b.y && Math.abs(m.y + m.height - (800 - 12 * 1.25)) < 2)
    const beside = top && (m.x >= b.x + b.width || m.x + m.width <= b.x)
    check(`a1 ${theme}: the popover sits beside the block (top-aligned, or clamped into the window)`, beside, JSON.stringify({ block: [b.x, b.y, b.width], menu: [m.x, m.y, m.width, m.height] }))
    check(`a1 ${theme}: ~238px wide at 125% (297px on screen)`, Math.abs(m.width - 238 * 1.25) < 3, m.width)
    const labels = await menu(page).getByRole('menuitem').allInnerTexts()
    // event-reminders (A12, 2026-10-14): a Remind row after Repeat.
    // dup-open (Kai 2026-10-17): Duplicate joins, after More.
    check(`a1 ${theme}: the rows — date · time · project · repeat · remind · Link a task… · More · Duplicate · Delete`, /Mon, Oct 12/.test(labels[0]) && /10:30 – 11:30/.test(labels[1]) && /No project/.test(labels[2]) && /Does not repeat/.test(labels[3]) && /No reminder/.test(labels[4]) && /Link a task/.test(labels[5]) && /More/.test(labels[6]) && /^Duplicate/.test(labels[7]) && /Delete/.test(labels[8]), JSON.stringify(labels))
    check(`a1 ${theme}: no Save button, no "Sure?"`, (await page.getByRole('button', { name: 'Save' }).count()) === 0 && (await page.getByText('Sure?').count()) === 0)
    await shot(page, `a1-popover-${theme}`)
    check(`a1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── A2: every row commits on selection (title, colour, date, duration, project, More), Esc closes ──
if (want('a2')) {
  const { ctx, page, errors, state } = await open()
  await openBlock(page, eid(LUNCH))
  let w = state.writes.length
  const title = menu(page).getByRole('textbox', { name: 'Title' })
  await title.fill('Lunch with Omar & Sara')
  await title.press('Enter')
  await settle(state)
  check('a2 title: edited in place, saved on Enter', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.title === 'Lunch with Omar & Sara'))
  // Colour: the title's dot opens the swatches; the block repaints at once.
  w = state.writes.length
  await menu(page).getByRole('button', { name: 'Colour' }).click()
  await sleep(250)
  await shot(page, 'a2-colour-menu')
  await menu(page, 'Colour').getByRole('button', { name: 'Sage' }).click()
  await settle(state)
  const accent = await fc(page, eid(LUNCH)).evaluate((el) => el.style.getPropertyValue('--kf-ev-accent'))
  check('a2 colour: Sage saved and the block repaints (no reload)', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.color === '#8A9A7E') && (accent === '#8A9A7E' || accent === 'var(--acc-sage-text)'), accent) // cal-looks: a swatch draws as its token (calendar/blockHue)
  // None clears it (the popover stays open; the swatch menu shows the pick).
  await menu(page).getByRole('button', { name: 'Colour' }).click()
  await sleep(250)
  const sagePicked = await menu(page, 'Colour').getByRole('button', { name: 'Sage' }).getAttribute('aria-pressed')
  w = state.writes.length
  await menu(page, 'Colour').getByRole('button', { name: 'None', exact: true }).click()
  await settle(state)
  const cleared = await fc(page, eid(LUNCH)).evaluate((el) => el.style.getPropertyValue('--kf-ev-accent'))
  check('a2 colour: the swatches show Sage picked; None clears the hue', sagePicked === 'true' && posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.color === null) && cleared === '', `${sagePicked} ${cleared}`)
  // …and Sage again for the rest of the run.
  await menu(page).getByRole('button', { name: 'Colour' }).click()
  await sleep(250)
  await menu(page, 'Colour').getByRole('button', { name: 'Sage' }).click()
  await settle(state)
  // Duration: 1h → 30m Short.
  w = state.writes.length
  await pick(page, '10:30 – 11:30', 'Short', 'Duration')
  await settle(state)
  check('a2 duration: 30m Short ends it at 11:00', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.ends_at === iso('11:00')), JSON.stringify(posts(state, 'calendar_events', w).map((e) => e.ends_at)))
  check('a2 duration: toast with Undo', await toastSoon(page, 'Resized to 10:30–11:00'))
  // Project ▸ Site.
  await openBlock(page, eid(LUNCH))
  w = state.writes.length
  await item(page, 'No project').click()
  await sleep(300)
  await page.locator('[role="menu"]').getByText('Site', { exact: true }).last().click()
  await settle(state)
  check('a2 project: Site saved on the block', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.project_id === P1))
  // More ▸ Free.
  await openBlock(page, eid(LUNCH))
  check('a2 the project row now reads Site', /Site/.test(await item(page, 'Site').innerText().catch(() => '')))
  w = state.writes.length
  await pick(page, 'More', 'Free', 'More')
  await settle(state)
  check('a2 More ▸ Free: busy false (the deviation row keeps Busy/Free reachable)', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.busy === false))
  // Date ▸ Tomorrow: same time, the next day.
  await openBlock(page, eid(LUNCH))
  w = state.writes.length
  await item(page, 'Mon, Oct 12').click()
  await sleep(400)
  await page.locator('.kf-pk-pop .kf-as-row', { hasText: 'Tomorrow' }).click()
  await settle(state)
  check('a2 date: Tomorrow moves it to Tue 10:30', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.starts_at === iso('10:30', 13)))
  // Esc closes; the edits are already on the block.
  await openBlock(page, eid(GYM))
  await page.keyboard.press('Escape')
  await sleep(300)
  check('a2 Esc closes the popover', (await page.locator('[role="menu"][aria-label="Block details"]').count()) === 0)
  check('a2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A3: a task block — From task, Complete / Open task, Unschedule ⌫; Link a task on a plain block ──
if (want('a3')) {
  const { ctx, page, errors, state } = await open()
  await openBlock(page, eid(TYREB))
  const labels = await menu(page).getByRole('menuitem').allInnerTexts()
  check('a3 task block: no Repeat; Complete · Open task · Unschedule · Delete', !labels.some((l) => /repeat/i.test(l)) && labels.some((l) => /Complete/.test(l)) && labels.some((l) => /Open task/.test(l)) && labels.some((l) => /Unschedule/.test(l)), JSON.stringify(labels))
  check('a3 the quiet "From task" group names the task', (await menu(page).getByText('From task').count()) === 1 && (await menu(page).getByText('Call the tyre supplier').count()) >= 1)
  await shot(page, 'a3-task-block')
  let w = state.writes.length
  await page.keyboard.press('Backspace')
  await settle(state)
  check('a3 ⌫ unschedules it (the block to Trash, the task stays)', !!posts(state, 'calendar_events', w).find((e) => e.id === eid(TYREB))?.deleted_at && (await toastSoon(page, 'Unscheduled · Call the tyre supplier')))
  await undo(page, 'Unscheduled · Call the tyre supplier')
  await settle(state)
  // Link a task… on the Time block → Review Kai goes IN it (Time Slots, 0073; slots-ux 2026-10-16:
  // it used to turn the slot into that task's block, dropping any tasks the slot held).
  await openBlock(page, eid(GYM))
  w = state.writes.length
  await item(page, 'Link a task').click()
  await sleep(400)
  await page.getByRole('combobox', { name: 'Search tasks to link' }).fill('review')
  await page.getByRole('option', { name: /Review Kai/ }).click()
  await settle(state)
  const slotted = posts(state, 'tasks', w).filter((x) => x.id === id(REVIEW)).at(-1)
  check('a3 Link a task on a Time block: Review Kai IN the slot, the block still a Time block', slotted?.slot_id === eid(GYM) && slotted?.scheduled_start === iso('13:00') && !posts(state, 'calendar_events', w).some((e) => e.id === eid(GYM) && e.type !== 'time_block'))
  check('a3 Link a task on a Time block: toast "In Gym · Review Kai" with Undo', await toastSoon(page, 'In Gym · Review Kai'))
  await undo(page, 'In Gym · Review Kai')
  await settle(state)
  // …and on a plain event the event becomes the task's block, as before.
  await openBlock(page, eid(LUNCH))
  w = state.writes.length
  await item(page, 'Link a task').click()
  await sleep(400)
  await page.getByRole('combobox', { name: 'Search tasks to link' }).fill('review')
  await page.getByRole('option', { name: /Review Kai/ }).click()
  await settle(state)
  const linked = posts(state, 'calendar_events', w).find((e) => e.id === eid(LUNCH))
  const t = posts(state, 'tasks', w).filter((x) => x.id === id(REVIEW)).at(-1)
  check('a3 Link a task on an event: the block holds Review Kai, the task scheduled there', linked?.task_id === id(REVIEW) && linked?.type === 'task' && t?.scheduled_start === iso('10:30'))
  check('a3 Link a task: toast with Undo', await toastSoon(page, 'Linked · Review Kai'))
  // Complete from the popover.
  await openBlock(page, eid(LUNCH))
  w = state.writes.length
  await item(page, 'Complete').click()
  await settle(state)
  check('a3 Complete: the task done', posts(state, 'tasks', w).some((x) => x.id === id(REVIEW) && x.status === 'done'))
  check('a3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B1: Repeat ▸ Weekly → the block appears in the next weeks; the ↻ glyph ──
if (want('b1')) {
  const { ctx, page, errors, state } = await open()
  await openBlock(page, eid(LUNCH))
  const w = state.writes.length
  await pick(page, 'Does not repeat', 'Weekly', 'Repeat')
  await settle(state)
  check('b1 Repeat ▸ Weekly writes FREQ=WEEKLY on the one row', posts(state, 'calendar_events', w).some((e) => e.id === eid(LUNCH) && e.recurrence_rule === 'FREQ=WEEKLY') && state.rows.calendar_events.length === EVENTS.length)
  check('b1 today\'s block is now an occurrence with the ↻ badge', (await fc(page, occId(LUNCH, '10:30', 12)).locator('.kf-ev-repeat').count()) === 1)
  await page.locator('.cal-head').getByRole('button', { name: 'Next' }).click() // p7e A4: a real button now
  await sleep(800)
  check('b1 next week: Mon 19 Oct 10:30 is there', (await fc(page, occId(LUNCH, '10:30', 19)).count()) === 1)
  await page.locator('.cal-head').getByRole('button', { name: 'Next' }).click() // p7e A4: a real button now
  await sleep(800)
  check('b1 …and Mon 26 Oct', (await fc(page, occId(LUNCH, '10:30', 26)).count()) === 1)
  await shot(page, 'b1-repeat-next-weeks')
  check('b1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B2: drag ONE occurrence → only it moves (exdate + detached copy), one Undo restores both ──
if (want('b2')) {
  const { ctx, page, errors, state } = await open()
  const tue = occId(STANDUP, '08:00', 13)
  await fc(page, tue).scrollIntoViewIfNeeded()
  await sleep(300)
  check('b2 the daily Standup shows every day of the week (one stored row)', (await page.locator(`.fc-event[data-kf-id^="${eid(STANDUP)}::"]`).count()) === 7)
  const b = await fc(page, tue).boundingBox()
  const from = center(b)
  const slot = await page.locator('.fc-timegrid-slot-lane').first().boundingBox()
  const hour = (await page.locator('.fc-timegrid-slot-lane').nth(2).boundingBox()).y - slot.y // two 30-min slots
  const w = state.writes.length
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(from.x, from.y + (hour * 2 * i) / 15)
    await sleep(30)
  }
  await sleep(200)
  await page.mouse.up()
  await settle(state)
  const series = row(state, STANDUP)
  const copy = state.rows.calendar_events.find((e) => e.series_id === eid(STANDUP))
  check('b2 the series skips Tuesday 08:00', (series.recurrence_exdates ?? []).includes(iso('08:00', 13)), JSON.stringify(series.recurrence_exdates))
  check('b2 a one-off copy at Tuesday 10:00, pointing at its series', copy?.starts_at === iso('10:00', 13) && copy?.recurrence_rule === null, JSON.stringify(copy && [copy.starts_at, copy.recurrence_rule]))
  check('b2 the other days stay at 08:00', (await fc(page, occId(STANDUP, '08:00', 14)).count()) === 1 && (await fc(page, occId(STANDUP, '08:00', 12)).count()) === 1 && (await fc(page, tue).count()) === 0)
  check('b2 nothing written with an occurrence id', posts(state, 'calendar_events', w).every((e) => !String(e.id).includes('::')))
  await shot(page, 'b2-drag-one-occurrence')
  await undo(page, 'Moved · Standup')
  await settle(state)
  check('b2 one Undo: the copy gone, Tuesday back at 08:00', !state.rows.calendar_events.some((e) => e.series_id === eid(STANDUP)) && !(row(state, STANDUP).recurrence_exdates ?? []).includes(iso('08:00', 13)) && (await fc(page, tue).count()) === 1)
  check('b2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B3: Delete on an occurrence → This event / All events, each with Undo ──
if (want('b3')) {
  const { ctx, page, errors, state } = await open()
  const wed = occId(STANDUP, '08:00', 14)
  await openBlock(page, wed)
  await item(page, 'Delete').click()
  await sleep(300)
  await shot(page, 'b3-delete-submenu')
  check('b3 Delete opens This event / All events (a submenu, no modal)', (await menu(page, 'Delete').getByRole('menuitem').allInnerTexts()).join('|') === 'This event|All events')
  await item(page, 'This event', 'Delete').click()
  await settle(state)
  check('b3 This event: Wednesday skipped, the series still there', (row(state, STANDUP).recurrence_exdates ?? []).includes(iso('08:00', 14)) && !row(state, STANDUP).deleted_at && (await fc(page, wed).count()) === 0 && (await fc(page, occId(STANDUP, '08:00', 15)).count()) === 1)
  await undo(page, 'Deleted · Standup')
  await settle(state)
  check('b3 Undo: Wednesday back', (await fc(page, wed).count()) === 1)
  await openBlock(page, occId(STANDUP, '08:00', 15))
  await pick(page, 'Delete', 'All events', 'Delete')
  await settle(state)
  check('b3 All events: the series to Trash, no Standup left on the grid', !!row(state, STANDUP).deleted_at && (await page.locator(`.fc-event[data-kf-id^="${eid(STANDUP)}"]`).count()) === 0)
  await undo(page, 'Deleted all · Standup')
  await settle(state)
  check('b3 Undo: the whole week back', !row(state, STANDUP).deleted_at && (await page.locator(`.fc-event[data-kf-id^="${eid(STANDUP)}::"]`).count()) === 7)
  // cal-wave2 (conductor decision 2026-10-12, which supersedes "every day" here): a new length from a
  // LATER occurrence splits the series there — Friday on is 1h, Monday–Thursday keep 30 minutes.
  const sat = () => page.locator(`.fc-event[data-kf-id$="::${iso('08:00', 17)}"]`).first()
  const h0 = (await sat().boundingBox()).height
  const thu0 = (await fc(page, occId(STANDUP, '08:00', 15)).boundingBox()).height
  await openBlock(page, occId(STANDUP, '08:00', 16))
  await pick(page, '08:00 – 08:30', 'Standard', 'Duration')
  await settle(state)
  const h1 = (await sat().boundingBox()).height
  const thu1 = (await fc(page, occId(STANDUP, '08:00', 15)).boundingBox()).height
  check('b3 Duration on a later occurrence: from it on the series is 1h (Saturday doubles), the earlier days keep 30 minutes (the split)', /UNTIL=/.test(row(state, STANDUP).recurrence_rule) && h1 > h0 * 1.8 && Math.abs(thu1 - thu0) < 1, `sat ${h0} → ${h1}, thu ${thu0} → ${thu1}`)
  check('b3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P1: phone — the event sheet has the same rows; a repeat's Delete asks This / All ──
if (want('p1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone, theme })
    const tap = async (loc) => {
      const p = center(await loc.boundingBox())
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
      await sleep(40)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await sleep(700)
    }
    const block = page.locator(`.pc-block[data-id="${occId(STANDUP, '08:00', 12)}"]`)
    await block.scrollIntoViewIfNeeded().catch(() => {})
    check(`p1 ${theme}: the phone grid draws the occurrence with ↻`, (await block.count()) === 1 && (await block.getByRole('img', { name: 'Repeats' }).count()) === 1)
    await tap(block)
    const rows = await page.locator('.pc-bs-rows .kf-as-row').allInnerTexts()
    check(`p1 ${theme}: the sheet's rows — date · time · project · repeat · remind · More · Duplicate`, rows.length === 7 && /Mon, Oct 12/.test(rows[0]) && /08:00 – 08:30/.test(rows[1]) && /No project/.test(rows[2]) && /Repeats daily/.test(rows[3]) && /No reminder/.test(rows[4]) && /More/.test(rows[5]) && /^Duplicate/.test(rows[6]), JSON.stringify(rows))
    check(`p1 ${theme}: swatches for colour; Delete in the footer`, (await page.locator('.pc-bs-colors button').count()) === 10 && (await page.locator('.pc-bs-delete').count()) === 1)
    await shot(page, `p1-phone-sheet-${theme}`)
    if (theme === 'day') {
      const w = state.writes.length
      await tap(page.locator('.pc-bs-rows .kf-as-row', { hasText: 'Repeats daily' }))
      await tap(page.locator('.kf-as-row', { hasText: 'Weekly' }).last())
      await settle(state)
      check('p1 Repeat ▸ Weekly from the phone sheet', posts(state, 'calendar_events', w).some((e) => e.id === eid(STANDUP) && e.recurrence_rule === 'FREQ=WEEKLY'))
      await tap(page.locator('.pc-bs-delete'))
      const choices = await page.locator('.kf-as-row').allInnerTexts()
      check('p1 Delete on a repeat asks This event / All events', choices.some((c) => /This event/.test(c)) && choices.some((c) => /All events/.test(c)), JSON.stringify(choices))
      await shot(page, 'p1-phone-delete')
    }
    check(`p1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── C1 (conductor review): the grid on the user's clock from a device elsewhere; the rail's Plan ▾
// Today / Tomorrow mean what every Plan menu means; ⋯ on rail cards; QuickCreate's kit switches ──
if (want('c1')) {
  const { ctx, page, errors, state } = await open('/calendar', { device: 'America/Los_Angeles', rail: true })
  const slotY = async (t) => (await page.locator(`.fc-timegrid-slot-lane[data-time="${t}"]`).first().boundingBox()).y
  const lunch = await fc(page, eid(LUNCH)).boundingBox()
  check('c1 device in Los Angeles: Lunch (10:30 Cairo) sits on the 10:30 row, not 00:30', Math.abs(lunch.y - (await slotY('10:30:00'))) < 4, `${lunch.y} vs ${await slotY('10:30:00')}`)
  check('c1 …and "Today" heads Monday 12 (Cairo’s day; LA is still Sunday 00:00)', /MON[\s·]*TODAY/i.test(await page.locator('.cal-day-header-today').first().innerText()) && (await page.locator('.cal-day-header-today .cal-day-header-num').first().innerText()) === '12')
  // A click on the empty 14:00 slot opens QuickCreate at 14:00 — the same clock.
  await page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]').first().scrollIntoViewIfNeeded()
  await sleep(300)
  const col = await page.locator('.fc-timegrid-col[data-date="2026-10-13"]').boundingBox()
  await page.mouse.click(col.x + col.width / 2, (await slotY('14:00:00')) + 6)
  await sleep(500)
  const fields = await page.locator('.kf-quickcreate input').evaluateAll((els) => els.map((e) => e.value))
  check('c1 the 14:00 slot opens QuickCreate at 2:00 PM / 14:00', fields.some((v) => /^(14:00|2:00\s?PM)$/i.test(v)), JSON.stringify(fields))
  await page.getByRole('button', { name: 'More options ↗' }).click()
  await sleep(300)
  await page.locator('.kf-quickcreate button', { hasText: 'Task' }).first().click()
  await sleep(200)
  check('c1 QuickCreate: Top-3 today / Someday are the kit switches, no OS checkbox', (await page.getByRole('switch', { name: 'Top-3 today' }).count()) === 1 && (await page.getByRole('switch', { name: 'Someday' }).count()) === 1 && (await page.locator('.kf-quickcreate input[type="checkbox"]').count()) === 0)
  await page.getByRole('switch', { name: 'Top-3 today' }).click()
  check('c1 …and switches', (await page.getByRole('switch', { name: 'Top-3 today' }).getAttribute('aria-checked')) === 'true')
  await page.locator('.kf-quickcreate button', { hasText: 'Event' }).first().click()
  await sleep(200)
  check('c1 QuickCreate: All day is a kit switch', (await page.getByRole('switch', { name: 'All day' }).count()) === 1)
  await shot(page, 'c1-quickcreate-switches')
  await page.keyboard.press('Escape')
  await sleep(400)
  // The rail: Review Kai waits in Today. Its ⋯ opens the one task menu.
  const card = page.locator('.unscheduled-task', { hasText: 'Review Kai' }).first()
  await card.hover() // Bound Journal: the row's ⋯ shows on hover
  await card.getByRole('button', { name: 'More actions for "Review Kai"' }).click()
  await sleep(300)
  check('c1 rail card ⋯ opens the task menu', (await page.getByRole('menuitem', { name: /Move to/ }).count()) >= 1)
  await page.keyboard.press('Escape')
  await sleep(300)
  // Plan ▾ → Tomorrow, first thing = tomorrow 09:00, no block (moveToTomorrowWithUndo).
  // Bound Journal (2026-10-14): a rail row shows Plan ▾ on hover, so hover it first.
  await card.hover()
  await card.getByRole('button', { name: 'Plan Review Kai' }).click()
  await sleep(300)
  const tomorrowRow = page.getByRole('menuitem', { name: /Tomorrow, first thing/ })
  check('c1 Plan ▾ reads "Tomorrow, first thing · Tue 09:00"', /Tomorrow, first thing[\s\S]*Tue 09:00/.test(await tomorrowRow.innerText()), await tomorrowRow.innerText())
  const w = state.writes.length
  await tomorrowRow.click()
  await settle(state)
  const t = posts(state, 'tasks', w).find((x) => x.id === id(REVIEW))
  check('c1 …moves it to tomorrow 09:00 with no calendar block', t?.due_at === iso('09:00', 13) && posts(state, 'calendar_events', w).length === 0, JSON.stringify(t?.due_at))
  check('c1 …toast "Moved to tomorrow"', await toastSoon(page, 'Moved to tomorrow'))
  await shot(page, 'c1-rail-after')
  check('c1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
