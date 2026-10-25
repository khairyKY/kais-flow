// Subtasks, built (Kai 2026-10-16: "A and C for add a task, and the time display for sub tasks too, 4 C").
// The REAL app against a MOCKED backend (the task-sheet recipe): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, Playwright answers every
// REST call from the scene below (Friday 16 Oct 2026, Cairo, 13:10) and records every write.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// Desktop and phone: nested + "1/3 ⌄" + fold (remembered), add from the row ("at 6pm" → its own time,
// on the calendar), a timed subtask in Up next and on the calendar ("↳ parent"), the popover's subtasks,
// and ticking the parent: Tick them too / Leave them open / Esc, with the one Undo.
import fs from 'node:fs'
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
/** Polls until `fn()` holds (the outbox sends its writes in a batch, a beat after the click). */
async function until(fn, ms = 4000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await fn()) return true
  return !!(await fn())
}

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000051b0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the options page's day: Friday 16 Oct 2026, Cairo = UTC+3, 13:10 ──
const cairo = (hhmm, day = 16) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '13:10'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DOMAIN = { id: 'd0000000-0000-4000-8000-000000000001', user_id: UID, name: 'Study', color: '#7E9A76', sort_order: 1, created_at: CREATED, updated_at: CREATED }
const PROJECT = { id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: DOMAIN.id, name: 'Data Structures', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED }
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, sort_order: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const GOAL = 1, SHEET = 2, NOTES = 3, Q1 = 4, Q2 = 5, OMAR = 6, TRIP = 7, HOTEL = 8
const PARENT = 'Finish the Data Structures sheet'
const inSheet = { project_id: PROJECT.id, domain_id: DOMAIN.id }
const TASKS = [
  task(GOAL, 'Call the tyre supplier about the invoice', { top3: true, top3_rank: 1, due_at: iso('09:00'), duration_min: 30 }),
  task(SHEET, PARENT, { top3: true, top3_rank: 2, due_at: iso('09:00'), duration_min: 90, ...inSheet }),
  task(NOTES, 'Read the linked lists notes', { parent_task_id: id(SHEET), status: 'done', completed_at: iso('11:00'), created_at: iso('09:00', 2), ...inSheet }),
  task(Q1, 'Questions 1–5', { parent_task_id: id(SHEET), due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:45'), duration_min: 45, created_at: iso('09:01', 2), ...inSheet }),
  task(Q2, 'Questions 6–10', { parent_task_id: id(SHEET), created_at: iso('09:02', 2), ...inSheet }),
  task(OMAR, 'Reply to Omar about Thursday', { due_at: iso('09:00'), duration_min: 30 }),
  task(TRIP, 'Plan the Alexandria trip', { due_at: iso('09:00') }),
  task(HOTEL, 'Book the hotel', { parent_task_id: id(TRIP), due_at: iso('09:00', 17) }),
]
const ev = (n, title, from, to, taskN = null) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null,
  recurrence_rule: null, recurrence_exdates: [], deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
// Shown times read the 12h clock since v1.4.0 (one-clock change): "4:00 PM", not "16:00".
const Q1_BLOCK = ev(2, 'Questions 1–5', '16:00', '16:45', Q1)
const EVENTS = [ev(1, 'Data Structures lecture', '14:00', '15:30'), Q1_BLOCK]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => ({ tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), projects: [PROJECT], domains: [DOMAIN], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1360, height: 900 } }

async function open(route, view, o = {}) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, keep]) => {
    if (sessionStorage.getItem('kf-verify-booted') && keep) return // a reload keeps what the page stored
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    localStorage.removeItem('kf.subtasks.folded')
  }, [JSON.stringify(session), UID, true])
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
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(350)
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })
const taskWrites = (state, taskId) => state.writes.filter((w) => w.table === 'tasks').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).filter((b) => b && b.id === taskId)
const lastWrite = (state, taskId) => taskWrites(state, taskId).at(-1)
const toastText = (page) => page.locator('[role="status"], .kf-toast').filter({ hasText: /Done|Undo/ }).last().innerText().catch(() => '')
async function clickUndo(page) {
  await page.getByRole('button', { name: /^Undo$/ }).last().click()
  await sleep(500)
}

// ═══════════════ Desktop ═══════════════
{
  const { ctx, page, errors, state } = await open('/today', desktop)
  const nest = page.locator(`[data-nest="${id(SHEET)}"]`)
  // 1 · nested, with its count and its subtasks' own times
  check('d1 the parent row carries "1/3"', (await page.locator(`#task-${id(SHEET)} .kf-subcount`).innerText()).replace(/\s/g, '') === '1/3')
  check('d1 its three subtasks sit nested under it', (await nest.locator('.ts-sub.is-nested').count()) === 3)
  check('d1 the timed one shows its time (C)', (await nest.locator(`#task-${id(Q1)} .ts-sub-when`).innerText()) === '4:00 PM')
  check('d1 no subtask is a row of its own in the lists', (await page.locator(`.td-row#task-${id(Q2)}, .td-row#task-${id(Q1)}`).count()) === 0)
  const hotel = page.locator(`[data-nest="${id(TRIP)}"] #task-${id(HOTEL)}`)
  await page.getByRole('button', { name: /Show \d+ more/ }).click().catch(() => {})
  await sleep(300)
  check('d1 a subtask due another day still nests under its parent, its day shown', (await hotel.count()) === 1 && (await hotel.locator('.ts-sub-when').innerText()) === 'Tomorrow', await hotel.count())
  // 4 · Up next: the timed subtask by itself, "↳ parent"
  const upnext = page.locator(`#upnext-${Q1_BLOCK.id}`)
  check('d4 the timed subtask is in Up next by itself, "↳ parent"', (await upnext.count()) === 1 && (await upnext.innerText()).includes(`↳ ${PARENT}`), await upnext.innerText().catch(() => 'none'))
  await shot(page, 'd1-today-nested')

  // 2 · fold, remembered on the device
  await page.locator(`#task-${id(SHEET)} .kf-subcount`).click()
  await sleep(300)
  check('d2 "1/3" folds the subtasks away', (await nest.count()) === 0)
  const stored = await page.evaluate(() => localStorage.getItem('kf.subtasks.folded'))
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1200)
  check('d2 the fold is remembered on this device (after a reload)', (await nest.count()) === 0 && stored?.includes('2'), stored)
  await shot(page, 'd2-folded')
  await page.locator(`#task-${id(SHEET)} .kf-subcount`).click()
  await sleep(300)
  check('d2 and unfolds again', (await nest.count()) === 1)

  // 3 · add from the row: the +, "at 6pm" → its own time, on the calendar
  const row = page.locator(`#task-${id(SHEET)}`).first()
  await row.hover()
  await sleep(250)
  const plus = row.locator('.kf-sub-add')
  check('d3 the row shows its + on hover', (await plus.evaluate((el) => getComputedStyle(el).opacity)) === '1')
  await plus.click()
  await sleep(300)
  const input = nest.locator('input.ts-sub-add')
  check('d3 + opens the add line, focused', await input.evaluate((el) => el === document.activeElement))
  await input.fill('Hand it in at 6pm')
  await sleep(200)
  const hint = await nest.locator('.ts-sub-hint').innerText().catch(() => '')
  check('d3 the line says what it will do', hint.includes('Today 6:00 PM · on your calendar'), hint)
  await shot(page, 'd3-add-typing')
  await input.press('Enter')
  await sleep(600)
  const findAdded = () => state.writes.filter((w) => w.table === 'tasks').flatMap((w) => [w.body].flat()).find((b) => b?.title === 'Hand it in')
  await until(findAdded)
  const added = findAdded()
  check('d3 Enter adds it under the parent, the time out of its title', !!added && added.parent_task_id === id(SHEET) && added.project_id === PROJECT.id, JSON.stringify(added ?? null).slice(0, 160))
  const findBlock = () => state.writes.filter((w) => w.table === 'calendar_events').flatMap((w) => [w.body].flat()).find((b) => b?.task_id === added?.id)
  await until(findBlock)
  const block = findBlock()
  check('d3 "at 6pm" puts it on the calendar at 18:00', block?.starts_at === iso('18:00'), block?.starts_at)
  const newRow = nest.locator(`#task-${added?.id}`)
  check('d3 it shows in the nest with its own time', (await newRow.count()) === 1 && (await newRow.locator('.ts-sub-when').innerText()) === '6:00 PM')
  check('d3 the line stays open for the next one, empty', (await input.inputValue()) === '' && (await input.count()) === 1)
  await input.press('Escape')
  await sleep(200)
  check('d3 Esc closes the line', (await nest.locator('input.ts-sub-add').count()) === 0)
  await shot(page, 'd3-added')

  // 5 · the popover has its subtasks (C: times and a faint clock)
  await page.locator(`#task-${id(SHEET)} .td-row-title`).first().click()
  await sleep(500)
  const pop = page.locator('.tp-pop[role="dialog"]').first()
  const popText = await pop.innerText().catch(() => '')
  check('d5 the popover has a Subtasks section with the count', /Subtasks · 1 of 4/.test(popText), popText.slice(0, 120))
  check('d5 the timed subtask shows its time; an unplanned one a faint clock', (await pop.locator(`#sub-${id(Q1)} .ts-sub-when`).innerText().catch(() => '')) === '4:00 PM' && (await pop.locator(`#sub-${id(Q2)} .ts-sub-clock`).count()) === 1)
  check('d5 an add line, "enter to add"', (await pop.locator('input.ts-sub-add').count()) === 1)
  await shot(page, 'd5-popover')
  await page.keyboard.press('Escape')
  await sleep(300)

  // 6 · tick the parent: the question, Tick them too, one Undo
  const box = () => page.locator(`#task-${id(SHEET)} [role="checkbox"]`).first()
  await box().click()
  await sleep(500)
  const ask = page.locator('.tp-ask[role="dialog"]')
  const askText = await ask.innerText().catch(() => '')
  check('d6 ticking the parent asks: 3 still open, Questions 1–5 at 4:00 PM', askText.includes('3 subtasks are still open') && askText.includes('Questions 1–5 is on your day at 4:00 PM.'), askText.replace(/\n/g, ' | '))
  check('d6 the parent is done at once', await until(() => lastWrite(state, id(SHEET))?.status === 'done'))
  await shot(page, 'd6-ask')
  await ask.getByRole('button', { name: 'Tick them too' }).click()
  await sleep(500)
  check('d6 Tick them too ticks every open subtask', await until(() => [Q1, Q2].every((n) => lastWrite(state, id(n))?.status === 'done') && lastWrite(state, added?.id)?.status === 'done'), [Q1, Q2].map((n) => lastWrite(state, id(n))?.status).concat(lastWrite(state, added?.id)?.status).join(','))
  const t1 = await toastText(page)
  check('d6 one toast: "Done, with its 3 open subtasks"', t1.includes('Done, with its 3 open subtasks'), t1)
  await shot(page, 'd6-ticked')
  await clickUndo(page)
  check('d6 its one Undo opens the parent and all three again', await until(() => [SHEET, Q1, Q2].every((n) => lastWrite(state, id(n))?.status === 'todo') && lastWrite(state, added?.id)?.status === 'todo'))
  check('d6 the done one stays done', !taskWrites(state, id(NOTES)).some((w) => w.status === 'todo'))

  // 7 · Leave them open
  await box().click()
  await sleep(500)
  await page.locator('.tp-ask').getByRole('button', { name: 'Leave them open' }).click()
  await sleep(500)
  const t2 = await toastText(page)
  check('d7 Leave them open: the parent done, its subtasks open, plain "Done"', (await until(() => lastWrite(state, id(SHEET))?.status === 'done')) && lastWrite(state, id(Q1))?.status === 'todo' && /Done\b/.test(t2) && !t2.includes('with its'), t2)
  await shot(page, 'd7-left-open')
  await clickUndo(page)
  // 8 · Esc = leave them open
  await box().click()
  await sleep(500)
  await page.keyboard.press('Escape')
  await sleep(400)
  check('d8 Esc answers "Leave them open"', (await page.locator('.tp-ask').count()) === 0 && (await until(() => lastWrite(state, id(SHEET))?.status === 'done')) && lastWrite(state, id(Q2))?.status === 'todo')
  await clickUndo(page)
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══════════════ Desktop · the calendar ═══════════════
{
  const { ctx, page, errors } = await open('/calendar', desktop)
  const blockEl = page.locator('.fc-event').filter({ hasText: 'Questions 1–5' }).first()
  const text = await blockEl.innerText().catch(() => '')
  check('c1 the timed subtask is its own block on the calendar, "↳ parent"', text.includes(`↳ ${PARENT}`), text.replace(/\n/g, ' | '))
  await blockEl.scrollIntoViewIfNeeded().catch(() => {})
  await shot(page, 'c1-calendar-block')
  check('c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══════════════ Phone ═══════════════
{
  const { ctx, page, cdp, errors, state } = await open('/today', phone)
  const nest = page.locator(`[data-nest="${id(SHEET)}"]`)
  check('p1 nested under the Top 3 row, "1/3"', (await nest.locator('.ts-sub.is-nested').count()) === 3 && (await page.locator(`#task-${id(SHEET)} .kf-subcount`).innerText()).replace(/\s/g, '') === '1/3')
  check('p1 the timed one shows 4:00 PM', (await nest.locator(`#task-${id(Q1)} .ts-sub-when`).innerText()) === '4:00 PM')
  const upRow = page.locator(`#upnext-${Q1_BLOCK.id}`)
  check('p1 Up next has the timed subtask by itself, "↳ parent"', (await upRow.innerText().catch(() => '')).includes(`↳ ${PARENT}`), await upRow.innerText().catch(() => 'none'))
  await shot(page, 'p1-today-nested')
  // fold
  await tap(cdp, page.locator(`#task-${id(SHEET)} .kf-subcount`))
  check('p2 a tap on "1/3" folds them', (await nest.count()) === 0)
  await tap(cdp, page.locator(`#task-${id(SHEET)} .kf-subcount`))
  check('p2 and back', (await nest.count()) === 1)
  // ⋯ → Add a subtask
  await tap(cdp, page.locator(`#task-${id(SHEET)}`).getByRole('button', { name: /More/ }).first())
  const item = page.getByRole('button', { name: 'Add a subtask' })
  check('p3 ⋯ offers Add a subtask', (await item.count()) === 1)
  await shot(page, 'p3-menu')
  await tap(cdp, item)
  await sleep(400)
  const input = nest.locator('input.ts-sub-add')
  check('p3 it opens the add line under the parent, focused', await input.evaluate((el) => el === document.activeElement).catch(() => false))
  await input.fill('Hand it in at 6pm')
  await sleep(200)
  check('p3 the line says "Today 6:00 PM · on your calendar"', (await nest.locator('.ts-sub-hint').innerText().catch(() => '')).includes('Today 6:00 PM · on your calendar'))
  await shot(page, 'p3-add-typing')
  await input.press('Enter')
  await sleep(600)
  const findAdded = () => state.writes.filter((w) => w.table === 'tasks').flatMap((w) => [w.body].flat()).find((b) => b?.title === 'Hand it in')
  await until(findAdded)
  const added = findAdded()
  check('p3 Enter adds it with its own time', !!added && added.parent_task_id === id(SHEET) && (await nest.locator(`#task-${added.id} .ts-sub-when`).innerText().catch(() => '')) === '6:00 PM')
  await input.press('Escape')
  await sleep(300)
  await shot(page, 'p3-added')
  // tick the parent: the action sheet
  await tap(cdp, page.locator(`#task-${id(SHEET)} [role="checkbox"]`).first())
  await sleep(500)
  const sheet = page.locator('[role="dialog"]').filter({ hasText: 'subtasks are still open' })
  const sheetText = await sheet.innerText().catch(() => '')
  check('p4 ticking the parent asks in a sheet, with the timed one\'s note', sheetText.includes('3 subtasks are still open') && sheetText.includes('Questions 1–5 stays on your day at 4:00 PM'), sheetText.replace(/\n/g, ' | '))
  await shot(page, 'p4-ask')
  await tap(cdp, sheet.getByRole('button', { name: /Tick them too/ }))
  await sleep(600)
  check('p4 Tick them too: all ticked, one toast', (await until(() => [Q1, Q2].every((n) => lastWrite(state, id(n))?.status === 'done'))) && (await toastText(page)).includes('Done, with its 3 open subtasks'))
  await shot(page, 'p4-ticked')
  await tap(cdp, page.getByRole('button', { name: /^Undo$/ }).last())
  await sleep(500)
  check('p4 the one Undo opens them all again', await until(() => [SHEET, Q1, Q2].every((n) => lastWrite(state, id(n))?.status === 'todo')))
  await tap(cdp, page.locator(`#task-${id(SHEET)} [role="checkbox"]`).first())
  await sleep(500)
  await tap(cdp, page.locator('[role="dialog"]').filter({ hasText: 'subtasks are still open' }).getByRole('button', { name: /Leave them open/ }))
  await sleep(600)
  check('p5 Leave them open: the parent done, the subtasks open', (await until(() => lastWrite(state, id(SHEET))?.status === 'done')) && lastWrite(state, id(Q1))?.status === 'todo')
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══════════════ Phone · the calendar ═══════════════
{
  const { ctx, page, errors } = await open('/calendar', phone)
  const blockEl = page.locator('.pc-block').filter({ hasText: 'Questions 1–5' }).first()
  const text = await blockEl.innerText().catch(() => '')
  check('pc1 the subtask\'s block on the phone calendar, "↳ parent"', text.includes(`↳ ${PARENT}`), text.replace(/\n/g, ' | '))
  await blockEl.scrollIntoViewIfNeeded().catch(() => {})
  await shot(page, 'pc1-phone-calendar')
  check('pc no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
