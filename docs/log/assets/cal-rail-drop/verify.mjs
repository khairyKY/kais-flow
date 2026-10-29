// Calendar → rail drops + event colour edits (Kai 2026-10-12) on the REAL app against a MOCKED backend
// (the calendar-rail recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call). Writes are recorded AND applied to the mock rows,
// so a refetch can't hide a bug behind the optimistic cache.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5246'
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
const LUNCH = 1, GYM = 2, TYREB = 3
const EVENTS = [
  ev(LUNCH, 'Lunch with Omar', '10:30', '11:30'),
  ev(GYM, 'Gym', '13:00', '14:00', null, 'time_block'),
  ev(TYREB, 'Call the tyre supplier', '12:00', '12:30', TYRE),
]
const INBOX = [{ id: 'a1000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Buy printer ink', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00') }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [{ id: P1, user_id: UID, name: 'Site', domain_id: null, status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: INBOX, projects: PROJECTS, domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/calendar', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true })) // its strings read the 24-hour clock (lib/clock, 2026-10-22)
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ lists: false }))
  }, [o.theme ?? 'day', JSON.stringify(session)])
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
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const deletes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE')
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const sec = (page, s) => page.locator(`.cal-rail-sec[data-section="${s}"]`)
const fcBlock = (page, n) => page.locator(`.fc-event[data-kf-id="${eid(n)}"]`).first()
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).click()

/** Drags block n onto rail section s (its header row, which is there folded or not). `mid` runs with
 * the pointer still over the section. */
async function dragToSection(page, n, s, mid) {
  await fcBlock(page, n).scrollIntoViewIfNeeded()
  // Wait for the block to stop moving (the grid's scroll can still be settling on a loaded machine).
  let box = await fcBlock(page, n).boundingBox()
  for (let i = 0; i < 20; i++) {
    await sleep(150)
    const next = await fcBlock(page, n).boundingBox()
    if (next && box && next.x === box.x && next.y === box.y) break
    box = next
  }
  const from = center(box)
  await page.mouse.move(from.x, from.y)
  await sleep(150)
  await page.mouse.down()
  await sleep(150)
  // cal-wave (item 18): an empty section steps aside and comes back (last) once the drag is up — so the
  // target is read after the block has started moving.
  await page.mouse.move(from.x + 12, from.y + 4)
  await sleep(200)
  const to = center(await sec(page, s).locator('.cal-rail-sec-head').boundingBox())
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20)
    await sleep(30)
  }
  await sleep(250)
  if (mid) await mid()
  await page.mouse.up()
  await sleep(700)
}

// ── R1: a plain event onto Inbox → an inbox capture, the event to Trash; the section lights while over it ──
if (want('r1')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  let lit = null
  await dragToSection(page, LUNCH, 'inbox', async () => {
    lit = await page.locator('.cal-rail-sec[data-drop-over]').evaluateAll((els) => els.map((e) => e.dataset.section))
    await shot(page, 'r1-inbox-hover')
  })
  check('r1 while dragging, only the Inbox section is lit', JSON.stringify(lit) === '["inbox"]', JSON.stringify(lit))
  check('r1 nothing stays lit after the drop', (await page.locator('.cal-rail-sec[data-drop-over]').count()) === 0)
  await settle(state)
  const item = posts(state, 'inbox_items', w0).at(-1)
  check('r1 an inbox_items row "Lunch with Omar", pending', item?.raw_text === 'Lunch with Omar' && item?.status === 'pending', JSON.stringify(item))
  const gone = posts(state, 'calendar_events', w0).find((e) => e.id === eid(LUNCH))
  check('r1 the event is trashed (deleted_at set)', !!gone?.deleted_at)
  check('r1 toast "Moved to Inbox · Lunch with Omar"', await toastSoon(page, 'Moved to Inbox · Lunch with Omar'))
  check('r1 the capture shows in the rail\'s Inbox; the block left the grid', (await sec(page, 'inbox').locator('.unscheduled-task', { hasText: 'Lunch with Omar' }).count()) === 1 && (await page.locator(`.fc-event[data-kf-id="${eid(LUNCH)}"]`).count()) === 0)
  check('r1 no soft-no shake', (await page.locator('.kf-cal-softno').count()) === 0)
  await shot(page, 'r1-inbox-after')
  const w1 = state.writes.length
  await undo(page, 'Moved to Inbox')
  await sleep(500)
  await settle(state)
  check('r1 Undo: the capture deleted, the event back (deleted_at null), on the grid again',
    deletes(state, 'inbox_items', w1).some((d) => d.query.includes(item.id)) && posts(state, 'calendar_events', w1).some((e) => e.id === eid(LUNCH) && e.deleted_at === null) && (await page.locator(`.fc-event[data-kf-id="${eid(LUNCH)}"]`).count()) === 1)
  check('r1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R2: an empty time block onto Today → a task due today, no time, its length as the estimate ──
if (want('r2')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  await dragToSection(page, GYM, 'today')
  await settle(state)
  const t = posts(state, 'tasks', w0).find((x) => x.title === 'Gym')
  check('r2 a task "Gym", 60 min, due today 09:00 (the app\'s date-only Today), no schedule', t?.duration_min === 60 && t?.due_at === iso('09:00') && t?.scheduled_start === null, JSON.stringify(t && [t.duration_min, t.due_at, t.scheduled_start]))
  check('r2 the block is trashed', !!posts(state, 'calendar_events', w0).find((e) => e.id === eid(GYM))?.deleted_at)
  check('r2 toast "Now a task · Tasks · Today"', await toastSoon(page, 'Now a task · Tasks · Today'))
  check('r2 it waits in the rail\'s Today', (await sec(page, 'today').locator('.unscheduled-task', { hasText: 'Gym' }).count()) === 1)
  await shot(page, 'r2-today-after')
  const w1 = state.writes.length
  await undo(page, 'Now a task')
  await sleep(500)
  await settle(state)
  check('r2 Undo: the task deleted, the block back', deletes(state, 'tasks', w1).some((d) => d.query.includes(t.id)) && (await page.locator(`.fc-event[data-kf-id="${eid(GYM)}"]`).count()) === 1 && (await sec(page, 'today').locator('.unscheduled-task', { hasText: 'Gym' }).count()) === 0)
  check('r2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R3: a plain event onto Lists scoped to a project → a task in that project ──
if (want('r3')) {
  const { ctx, page, errors, state } = await open()
  // cal-wave (item 18): Lists with nothing in it steps aside — "Lists…" brings it (and its scope picker) back.
  if (await page.locator('.cal-rail-more', { hasText: 'Show lists' }).count()) await page.locator('.cal-rail-more').click()
  await page.getByRole('button', { name: 'Rail scope type' }).click()
  await page.locator('[role="option"]', { hasText: 'Project' }).first().click()
  await sleep(300)
  const w0 = state.writes.length
  await dragToSection(page, LUNCH, 'lists')
  await settle(state)
  const t = posts(state, 'tasks', w0).find((x) => x.title === 'Lunch with Omar')
  check('r3 a task in the scoped project "Site" (no date)', t?.project_id === P1 && t?.due_at === null, JSON.stringify(t && [t.project_id, t.due_at]))
  check('r3 toast "Now a task · Site"', await toastSoon(page, 'Now a task · Site'))
  check('r3 it shows in the Lists section', (await sec(page, 'lists').locator('.unscheduled-task', { hasText: 'Lunch with Omar' }).count()) === 1)
  await shot(page, 'r3-lists-after')
  check('r3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R4: Overdue says no (soft-no, no writes); a task block onto Today / Inbox ──
if (want('r4')) {
  const { ctx, page, errors, state } = await open()
  let lit = null
  let w0 = state.writes.length
  await page.mouse.move(0, 0)
  // The shake lives 340ms; a polled wait can miss it on a loaded machine, so the page itself records
  // the moment the class lands (a MutationObserver armed before the drag).
  await page.evaluate(() => {
    window.__softno = false
    new MutationObserver(() => { if (document.querySelector('.kf-cal-softno')) window.__softno = true })
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  })
  const softno = { then: (f) => sleep(400).then(() => page.evaluate(() => window.__softno)).then(f) }
  await dragToSection(page, LUNCH, 'overdue', async () => {
    lit = await page.locator('.cal-rail-sec[data-drop-over]').evaluateAll((els) => els.map((e) => e.dataset.section))
  })
  check('r4 Overdue: the soft-no shake', await softno)
  check('r4 Overdue: never lit (it has the attribute but no look)', JSON.stringify(lit) === '["overdue"]' && (await sec(page, 'overdue').evaluate((e) => getComputedStyle(e).outlineStyle)) !== 'dashed')
  await sleep(500)
  await settle(state)
  // app_settings aside: the first drag marks the calendar hint learned (help_seen), not a drop's write.
  const dropWrites = state.writes.slice(w0).filter((w) => w.table !== 'app_settings')
  check('r4 Overdue: nothing written', dropWrites.length === 0, dropWrites.map((w) => w.table).join())
  // Task block onto Today: unscheduled AND due today; the task stays a task.
  w0 = state.writes.length
  await dragToSection(page, TYREB, 'today')
  await settle(state)
  const t = posts(state, 'tasks', w0).filter((x) => x.id === id(TYRE)).at(-1)
  check('r4 task block → Today: the block trashed, the task due today 09:00, unscheduled', !!posts(state, 'calendar_events', w0).find((e) => e.id === eid(TYREB))?.deleted_at && t?.due_at === iso('09:00') && t?.scheduled_start === null, JSON.stringify(t && [t.due_at, t.scheduled_start]))
  check('r4 …no new task, no inbox row', posts(state, 'tasks', w0).every((x) => x.id === id(TYRE)) && posts(state, 'inbox_items', w0).length === 0)
  check('r4 …toast "Unscheduled · Call the tyre supplier · Today", the card in Today', (await toastSoon(page, 'Unscheduled · Call the tyre supplier · Today')) && (await sec(page, 'today').locator('.unscheduled-task', { hasText: 'Call the tyre supplier' }).count()) === 1)
  await shot(page, 'r4-task-today')
  const w1 = state.writes.length
  await undo(page, 'Unscheduled · Call the tyre')
  await sleep(500)
  await settle(state)
  const back = posts(state, 'tasks', w1).filter((x) => x.id === id(TYRE)).at(-1)
  check('r4 Undo: the block back at 12:00 and the due date back (Wed)', posts(state, 'calendar_events', w1).some((e) => e.id === eid(TYREB) && e.deleted_at === null) && back?.due_at === iso('09:00', 14) && back?.scheduled_start === iso('12:00'), JSON.stringify(back && [back.due_at, back.scheduled_start]))
  // Task block onto Inbox: just unscheduled (the task stays a task — no inbox capture).
  const w2 = state.writes.length
  await dragToSection(page, TYREB, 'inbox')
  await settle(state)
  check('r4 task block → Inbox: unscheduled, no inbox row, due date untouched', !!posts(state, 'calendar_events', w2).find((e) => e.id === eid(TYREB))?.deleted_at && posts(state, 'inbox_items', w2).length === 0 && posts(state, 'tasks', w2).every((x) => x.due_at === iso('09:00', 14)))
  check('r4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── C1: colour edits repaint at once (desktop details panel), None clears, swatches show the pick ──
// c1 drove EventDetailsPanel (deleted 2026-10-12 with Calendar §5's block menu); colour on the new
// menu — None included, the repaint without a reload — is event-detail/verify.mjs a2. Run it with ONLY=c1.
if (process.env.ONLY?.split(',').includes('c1')) {
  const { ctx, page, errors, state } = await open()
  const accent = () => fcBlock(page, LUNCH).evaluate((e) => e.style.getPropertyValue('--kf-ev-accent'))
  check('c1 an uncoloured event has no inline hue', (await accent()) === '')
  await fcBlock(page, LUNCH).click()
  await sleep(500)
  check('c1 the panel marks None as picked', (await page.getByRole('button', { name: 'None', exact: true }).getAttribute('aria-pressed')) === 'true')
  await page.getByRole('button', { name: 'Terra', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await sleep(600)
  check('c1 Terra → the block repaints without a reload (--kf-ev-accent #B5654A)', (await accent()) === '#B5654A', await accent())
  await shot(page, 'c1-terra')
  await fcBlock(page, LUNCH).click()
  await sleep(500)
  check('c1 reopened, Terra reads as picked', (await page.getByRole('button', { name: 'Terra', exact: true }).getAttribute('aria-pressed')) === 'true')
  await page.getByRole('button', { name: 'Sage', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await sleep(600)
  check('c1 Sage → repaints again', (await accent()) === '#8A9A7E', await accent())
  await fcBlock(page, LUNCH).click()
  await sleep(500)
  await page.getByRole('button', { name: 'None', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await sleep(600)
  check('c1 None → the inline hue is cleared (back to the kind\'s colour)', (await accent()) === '', await accent())
  await settle(state)
  check('c1 the writes carried the colours', posts(state, 'calendar_events').filter((e) => e.id === eid(LUNCH)).map((e) => e.color).join() === '#B5654A,#8A9A7E,', posts(state, 'calendar_events').map((e) => e.color).join())
  // The time-block quick create: no colour → None picked (it used to be given a lavender string no swatch matched).
  await page.locator('td.fc-timegrid-slot-lane[data-time="15:00:00"]').scrollIntoViewIfNeeded()
  await sleep(200)
  const slot = await page.locator('td.fc-timegrid-slot-lane[data-time="15:00:00"]').boundingBox()
  const col = await page.locator('td.fc-timegrid-col[data-date="2026-10-12"]').boundingBox()
  await page.mouse.click(col.x + col.width / 2, slot.y + 4, { button: 'right' })
  await page.locator('[role="menuitem"]', { hasText: 'New Time Block' }).click()
  await sleep(500)
  check('c1 New Time Block: None reads as picked', (await page.locator('.kf-quickcreate button[title="None"]').last().getAttribute('aria-pressed')) === 'true')
  await shot(page, 'c1-quickcreate-block')
  check('c1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P1: the phone event sheet has the swatches and saves on tap ──
if (want('p1')) {
  const { ctx, page, cdp, errors, state } = await open('/calendar', { view: phone })
  const block = page.locator(`.pc-block[data-id="${eid(LUNCH)}"]`)
  await block.scrollIntoViewIfNeeded().catch(() => {})
  const p = center(await block.boundingBox())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(700)
  const fill0 = await block.evaluate((e) => e.style.getPropertyValue('--pc-fill'))
  // cal-blocks (Kai 2026-10-26, palette C + menu B's tray): No colour + 16 swatches, Sage became Moss
  check('p1 the event sheet shows the tray: No colour + 16 swatches, No colour picked', (await page.locator('.pc-bs-colors button.kf-sw').count()) === 17 && (await page.locator('.pc-bs-colors button[aria-label="No colour"]').getAttribute('aria-pressed')) === 'true')
  const w0 = state.writes.length
  const sage = await page.locator('.pc-bs-colors button[title="Moss"]').boundingBox()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center(sage)] })
  await sleep(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(700)
  await settle(state)
  check('p1 a tap on Moss saves it', posts(state, 'calendar_events', w0).some((e) => e.id === eid(LUNCH) && e.color === '#768A42'))
  check('p1 …Moss reads as picked, "✓ Saved"', (await page.locator('.pc-bs-colors button[title="Moss"]').getAttribute('aria-pressed')) === 'true' && /saved/i.test(await text(page.locator('.pc-bs-save'))))
  const fill1 = await block.evaluate((e) => e.style.getPropertyValue('--pc-fill'))
  // cal-looks (Kai 2026-10-23): a swatch colour draws as its token (calendar/blockHue), so Night Garden redraws it
  check('p1 the grid block takes the new hue', fill1 !== fill0 && fill1.includes('var(--blk-moss)'), `${fill0} → ${fill1}`)
  await shot(page, 'p1-phone-sheet')
  check('p1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
