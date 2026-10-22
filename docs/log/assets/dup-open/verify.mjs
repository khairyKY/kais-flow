// Duplicate everywhere (Kai 2026-10-17: "we need to add duplicating options") — the REAL app against a
// MOCKED backend (the subtasks recipe): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9, a
// made-up session sits in localStorage, Playwright answers every REST call from the scene below (Friday
// 16 Oct 2026, Cairo, 13:10) and records every write.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The row menu's Duplicate (a plain task; a parent with its subtasks), its Undo, ⌘/Ctrl+D on the focused
// row, the bulk bar's More → Duplicate, the calendar block menu (an event; a task's block), and the
// Projects row menu's Duplicate.
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5290'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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

// ── Friday 16 Oct 2026, Cairo = UTC+3, 13:10 ──
const cairo = (hhmm, day = 16) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DOMAIN = { id: 'd0000000-0000-4000-8000-000000000001', user_id: UID, name: 'Study', color: '#7E9A76', sort_order: 1, created_at: CREATED, updated_at: CREATED }
const PROJECT = {
  id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: DOMAIN.id, name: 'Data Structures', type: 'standard', status: 'active', color: null,
  milestones: [{ id: 'm1', title: 'Midterm', weight: 1, completed: true }], checklist: [], created_at: CREATED, updated_at: CREATED,
}
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, sort_order: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const GOAL = 1, SHEET = 2, NOTES = 3, Q1 = 4, Q2 = 5, OMAR = 6, TRIP = 7
const PARENT = 'Finish the Data Structures sheet'
const inSheet = { project_id: PROJECT.id, domain_id: DOMAIN.id }
const TASKS = [
  task(GOAL, 'Call the tyre supplier about the invoice', { top3: true, top3_rank: 1, due_at: iso('09:00'), duration_min: 30 }),
  task(SHEET, PARENT, { top3: true, top3_rank: 2, due_at: iso('09:00'), duration_min: 90, milestone_id: 'm1', ...inSheet }),
  task(NOTES, 'Read the linked lists notes', { parent_task_id: id(SHEET), status: 'done', completed_at: iso('11:00'), created_at: iso('09:00', 2), ...inSheet }),
  task(Q1, 'Questions 1–5', { parent_task_id: id(SHEET), due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:45'), duration_min: 45, created_at: iso('09:01', 2), ...inSheet }),
  task(Q2, 'Questions 6–10', { parent_task_id: id(SHEET), created_at: iso('09:02', 2), ...inSheet }),
  task(OMAR, 'Reply to Omar about Thursday', { due_at: iso('09:00'), duration_min: 30, labels: ['calls'], priority: 2 }),
  task(TRIP, 'Plan the Alexandria trip', { due_at: iso('09:00') }),
]
const ev = (n, title, from, to, taskN = null) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null,
  recurrence_rule: null, recurrence_exdates: [], deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const LECTURE = ev(1, 'Data Structures lecture', '14:00', '15:30')
const Q1_BLOCK = ev(2, 'Questions 1–5', '16:00', '16:45', Q1)
const EVENTS = [LECTURE, Q1_BLOCK]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => ({ tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), projects: [PROJECT], domains: [DOMAIN], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1360, height: 900 } }

async function open(route) {
  const ctx = await browser.newContext({ ...desktop, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true })) // its strings read the 24-hour clock (lib/clock, 2026-10-22)
    if (sessionStorage.getItem('kf-verify-booted')) return
    sessionStorage.setItem('kf-verify-booted', '1')
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: decodeURIComponent(url.search), body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('13:10') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })
const posted = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => [w.body].flat()).filter(Boolean)
const deleted = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE').map((w) => w.query).join(' ')
const toast = (page, text) => page.locator('.kf-toast', { hasText: text }).last()
async function undo(page, text) {
  await toast(page, text).getByRole('button', { name: 'Undo' }).click()
  await sleep(700)
}
async function menuItem(page, at, label) {
  await page.locator(at).first().click({ button: 'right' })
  await sleep(300)
  const item = page.locator('[role="menu"] [role="menuitem"]', { hasText: new RegExp(`^${label}`) }).first()
  return item
}

// ═══ 1 · Today: the row menu's Duplicate, its Undo, a parent with its subtasks, ⌘/Ctrl+D, the bulk bar ═══
{
  const { ctx, page, errors, state } = await open('/today')
  // a plain task
  let w = state.writes.length
  const dup = await menuItem(page, `#task-${id(OMAR)}`, 'Duplicate')
  check('t1 the row menu has Duplicate, with its ⌃D key', (await dup.count()) === 1 && /D/.test(await dup.innerText()), await dup.innerText().catch(() => 'none'))
  await shot(page, 't1-row-menu')
  await dup.click()
  await until(() => posted(state, 'tasks', w).some((t) => t.title === 'Reply to Omar about Thursday' && t.id !== id(OMAR)))
  const copy = posted(state, 'tasks', w).find((t) => t.title === 'Reply to Omar about Thursday' && t.id !== id(OMAR))
  check('t1 Duplicate writes an open copy: same date, labels, priority; not in the Top 3, not on the calendar', !!copy && copy.status === 'todo' && copy.due_at === iso('09:00') && copy.labels?.[0] === 'calls' && copy.priority === 2 && copy.top3 === false && copy.scheduled_start === null, JSON.stringify(copy ?? null).slice(0, 200))
  check('t1 "Duplicated · Undo", and the copy shows as a row', (await toast(page, 'Duplicated').count()) === 1 && (await page.locator(`#task-${copy?.id}`).count()) >= 1)
  w = state.writes.length
  await undo(page, 'Duplicated')
  await until(() => deleted(state, 'tasks', w).includes(copy?.id))
  check('t1 Undo removes the copy outright', deleted(state, 'tasks', w).includes(copy?.id) && (await page.locator(`#task-${copy?.id}`).count()) === 0, deleted(state, 'tasks', w))

  // a parent: its subtasks come along, open, under the copy
  w = state.writes.length
  await (await menuItem(page, `#task-${id(SHEET)}`, 'Duplicate')).click()
  await until(() => posted(state, 'tasks', w).filter((t) => t.parent_task_id && t.parent_task_id !== id(SHEET)).length === 3)
  const rows = posted(state, 'tasks', w)
  const parent = rows.find((t) => t.title === PARENT && t.id !== id(SHEET))
  const subs = rows.filter((t) => parent && t.parent_task_id === parent.id)
  check('t2 a parent copies with its 3 subtasks, open, in order, under the copy', !!parent && subs.map((s) => [s.title, s.status]).join() === 'Read the linked lists notes,todo,Questions 1–5,todo,Questions 6–10,todo' && subs.every((s) => s.scheduled_start === null), JSON.stringify(subs.map((s) => [s.title, s.status, s.scheduled_start])))
  check('t2 the toast says "Duplicated, with its 3 subtasks"', (await toast(page, 'Duplicated, with its 3 subtasks').count()) === 1)
  await shot(page, 't2-parent-copied')
  w = state.writes.length
  await undo(page, 'Duplicated, with its 3 subtasks')
  await until(() => [parent, ...subs].every((t) => deleted(state, 'tasks', w).includes(t?.id)))
  check('t2 one Undo removes the copy and its subtasks', [parent, ...subs].every((t) => deleted(state, 'tasks', w).includes(t?.id)), deleted(state, 'tasks', w))

  // ⌘/Ctrl+D on the focused row
  await page.locator('body').click({ position: { x: 5, y: 450 } })
  await page.keyboard.press('j')
  await sleep(200)
  const focused = await page.evaluate(() => document.activeElement?.id ?? '')
  const focusedTitle = TASKS.find((t) => `task-${t.id}` === focused)?.title
  w = state.writes.length
  await page.keyboard.press('Control+d')
  await until(() => posted(state, 'tasks', w).some((t) => t.title === focusedTitle))
  check('t3 Ctrl+D duplicates the focused row', !!focusedTitle && posted(state, 'tasks', w).some((t) => t.title === focusedTitle && `task-${t.id}` !== focused), `${focused} ${focusedTitle}`)
  await undo(page, 'Duplicated')

  // the bulk bar: select two, More → Duplicate
  await page.locator(`#task-${id(OMAR)}`).getByText('Reply to Omar').click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(TRIP)}`).getByText('Plan the Alexandria trip').click({ modifiers: ['Control'] })
  await sleep(300)
  const pill = page.locator('.kf-bulkbar')
  check('t4 two selected: the bulk bar is up', (await pill.count()) === 1 && /2 selected/.test(await pill.innerText()), await pill.innerText().catch(() => 'none'))
  await pill.getByRole('button', { name: /More/ }).click()
  await sleep(300)
  const more = page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Duplicate' })
  check('t4 More offers Duplicate', (await more.count()) === 1)
  await shot(page, 't4-bulk-more')
  w = state.writes.length
  await more.click()
  await until(() => posted(state, 'tasks', w).length >= 2)
  const both = posted(state, 'tasks', w).map((t) => t.title).sort().join(' | ')
  check('t4 both copied, "2 tasks duplicated · Undo", the selection cleared', both === 'Plan the Alexandria trip | Reply to Omar about Thursday' && (await toast(page, '2 tasks duplicated').count()) === 1 && (await pill.count()) === 0, both)
  check('t· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 2 · Calendar: the block menu's Duplicate — an event; a task's block ═══
{
  const { ctx, page, errors, state } = await open('/calendar')
  const block = (e) => page.locator(`.fc-event[data-kf-id="${e.id}"]`).first()
  let w = state.writes.length
  await block(LECTURE).click()
  await sleep(400)
  const item = page.locator('[role="menu"][aria-label="Block details"] [role="menuitem"]', { hasText: /^Duplicate/ })
  check('c1 an event\'s block menu has Duplicate', (await item.count()) === 1)
  await shot(page, 'c1-block-menu')
  await item.click()
  await until(() => posted(state, 'calendar_events', w).some((e) => e.title === LECTURE.title && e.id !== LECTURE.id))
  const copy = posted(state, 'calendar_events', w).find((e) => e.title === LECTURE.title && e.id !== LECTURE.id)
  check('c1 the copy sits at the same time, "Duplicated · Data Structures lecture"', copy?.starts_at === LECTURE.starts_at && copy?.ends_at === LECTURE.ends_at && copy?.task_id === null && (await toast(page, 'Duplicated · Data Structures lecture').count()) === 1, JSON.stringify(copy ?? null).slice(0, 160))
  await sleep(400)
  check('c1 both show on the grid, side by side', (await page.locator(`.fc-event[data-kf-id="${copy?.id}"]`).count()) === 1 && (await block(LECTURE).count()) === 1)
  await shot(page, 'c1-side-by-side')
  w = state.writes.length
  await undo(page, 'Duplicated · Data Structures lecture')
  check('c1 Undo removes the copy', deleted(state, 'calendar_events', w).includes(copy?.id), deleted(state, 'calendar_events', w))

  w = state.writes.length
  await block(Q1_BLOCK).click()
  await sleep(400)
  await page.locator('[role="menu"][aria-label="Block details"] [role="menuitem"]', { hasText: /^Duplicate/ }).click()
  const copyOf = () => posted(state, 'tasks', w).find((x) => x.title === 'Questions 1–5' && x.id !== id(Q1))
  await until(() => copyOf() && posted(state, 'calendar_events', w).some((e) => e.task_id === copyOf().id), 8000)
  const t = copyOf()
  const b = posted(state, 'calendar_events', w).find((e) => e.task_id === t?.id)
  check("c2 a task's block: the task's copy, still a subtask of its parent, blocked at 16:00–16:45", !!t && t.parent_task_id === id(SHEET) && b?.starts_at === iso('16:00') && b?.ends_at === iso('16:45'), JSON.stringify([t?.parent_task_id, b?.starts_at]))
  check('c· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 3 · Projects: the row menu's Duplicate ═══
{
  const { ctx, page, errors, state } = await open('/projects')
  const w = state.writes.length
  await page.getByText('Data Structures', { exact: true }).first().click({ button: 'right' })
  await sleep(300)
  const item = page.locator('[role="menu"] [role="menuitem"]', { hasText: /^Duplicate/ })
  check('p1 the project row menu has Duplicate', (await item.count()) === 1)
  await shot(page, 'p1-project-menu')
  await item.click()
  await until(() => posted(state, 'projects', w).length > 0 && posted(state, 'tasks', w).length >= 4, 8000)
  const p = posted(state, 'projects', w)[0]
  const ts = posted(state, 'tasks', w)
  const inCopy = ts.filter((t) => t.project_id === p?.id)
  check('p1 "Data Structures (copy)", active, its milestone afresh', p?.name === 'Data Structures (copy)' && p?.status === 'active' && p?.milestones?.[0]?.completed === false && p?.milestones?.[0]?.id !== 'm1', JSON.stringify(p ?? null).slice(0, 200))
  check('p1 its 4 tasks copied open, undated, out of the Top 3, on the copy\'s milestone', inCopy.length === 4 && inCopy.every((t) => t.status === 'todo' && t.due_at === null && t.top3 === false && t.scheduled_start === null) && inCopy.find((t) => t.title === PARENT)?.milestone_id === p?.milestones?.[0]?.id, JSON.stringify(inCopy.map((t) => [t.title, t.status, t.due_at])))
  check('p1 "Duplicated · Data Structures (copy) · 4 tasks · Undo"', (await toast(page, 'Duplicated · Data Structures (copy) · 4 tasks').count()) === 1)
  check('p· no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(`${OUT}/verify-results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
