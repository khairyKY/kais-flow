// fix-tasks (Kai 2026-10-12 review findings) on the REAL app against a MOCKED backend — the cal-rail-drop
// recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage,
// Playwright answers every REST call; writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=p,e,r,b,q,d to pick sections)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5249'
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
const D1 = 'd0000000-0000-4000-8000-000000000001', D2 = 'd0000000-0000-4000-8000-000000000002'
const P1 = 'b0000000-0000-4000-8000-000000000001'
const A1 = 'a0000000-0000-4000-8000-0000000000a1'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const FORE = 1, TYRE = 2, REVIEW = 3, SUB1 = 4, SUB2 = 5, INVOICE = 6, OLD = 7, PLANTS = 8, STRETCH = 9, PAUSED = 10
const TASKS = [
  task(FORE, 'Plan & implement forecasting logic', { project_id: P1, domain_id: D1, due_at: iso('15:00'), priority: 2, duration_min: 30, recurrence_rule: 'FREQ=WEEKLY', notes: 'Start with the cohort model, then wire the RRULE engine…', labels: ['deep-work'], reminder_at: iso('14:30') }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:00') }),
  task(REVIEW, 'Review the week'),
  task(SUB1, 'Pull Q2 actuals', { parent_task_id: id(FORE), status: 'done', completed_at: iso('08:00') }),
  task(SUB2, 'Draft the cohort model', { parent_task_id: id(FORE), duration_min: 45 }),
  task(INVOICE, 'Send the invoice', { due_at: iso('09:00', 13) }),
  task(OLD, 'Renew passport', { due_at: iso('09:00', 10) }),
  task(PLANTS, 'Water the plants', { status: 'done', completed_at: iso('08:00'), due_at: iso('08:00') }),
  task(STRETCH, 'Stretch', { recurrence_rule: 'FREQ=DAILY', due_at: iso('09:00', 7) }),
  task(PAUSED, 'Paused practice', { recurrence_rule: 'FREQ=DAILY', due_at: iso('09:00'), paused: true }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [
  { id: D1, user_id: UID, name: 'Career', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED },
  { id: D2, user_id: UID, name: 'Personal', color: '#C9A55A', sort_order: 1, created_at: CREATED, updated_at: CREATED },
]
const AREAS = [{ id: A1, user_id: UID, name: 'Health', domain_id: D2, color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: D1, status: 'active', type: 'standard', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: PROJECTS, domains: DOMAINS, areas: AREAS, app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/tasks?list=all', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    // No "Updated to vX" toast over the screenshots.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime()])
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
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const lastRow = (state, table, rowId, from = 0) => posts(state, table, from).filter((r) => r.id === rowId).at(-1)
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const row = (page, n) => page.locator(`#task-${id(n)}`)
/** Scrolled into view first, then clicked — as a person would: a menu closes on a scroll behind it
 * (ContextMenu, the popover), and Playwright's own scroll-into-view can land after its click. */
async function steady(loc, opts) {
  await loc.scrollIntoViewIfNeeded()
  await sleep(300)
  await loc.click(opts)
}
const pop = (page) => page.locator('.tp-pop')
const openPop = async (page, n) => {
  await steady(row(page, n).getByText(TASKS[n - 1].title, { exact: true }).first())
  await sleep(500)
}

// ── P: the desktop task detail popover ──
for (const theme of want('p') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
  await openPop(page, FORE)
  const rb = await row(page, FORE).boundingBox()
  const pb = await pop(page).boundingBox()
  check(`p1 [${theme}] a click on a row opens the popover beside it (under, or over when there's no room) — never on it`, !!pb && (pb.y >= rb.y + rb.height - 1 || pb.y + pb.height <= rb.y + 1) && new URL(page.url()).searchParams.get('task') === id(FORE), `${JSON.stringify(rb)} / ${JSON.stringify(pb)}`)
  const body = await text(pop(page))
  check(`p1 [${theme}] it draws the task's fields (notes, chips, Delete · Open full)`, /cohort model/.test(await pop(page).locator('.tp-notes').inputValue()) && /P2/.test(body) && /Forecasting/i.test(body) && /30m/i.test(body) && /Weekly/i.test(body) && /Delete/i.test(body) && /Open full/i.test(body), body.replace(/\n/g, ' | '))
  await shot(page, `p1-popover-${theme}`)
  if (theme === 'day') {
    const w0 = state.writes.length
    // A chip opens its picker inside the popover; the pick writes at once and the popover stays.
    await pop(page).getByRole('button', { name: 'P2' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Critical' }).click()
    await settle(state)
    check('p2 the Priority chip writes at once, popover stays open', lastRow(state, 'tasks', id(FORE), w0)?.priority === 1 && (await pop(page).count()) === 1)
    // Title: type, Enter commits; a second Enter expands to the full page.
    await pop(page).locator('.tp-title').fill('Plan the forecasting logic')
    await page.keyboard.press('Enter')
    await settle(state)
    check('p3 the title commits on Enter', lastRow(state, 'tasks', id(FORE), w0)?.title === 'Plan the forecasting logic')
    await page.keyboard.press('Enter')
    await sleep(800)
    check('p3 a second Enter expands to /tasks/:id', new URL(page.url()).pathname === `/tasks/${id(FORE)}`, page.url())
    // Notes edit, then a click outside closes and keeps the edit.
    await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
    await sleep(800)
    await openPop(page, TYRE)
    await pop(page).locator('.tp-notes').fill('ask about winter tyres')
    await page.locator('h1').first().click()
    await settle(state)
    check('p4 a click outside closes it, and the notes are written', (await pop(page).count()) === 0 && lastRow(state, 'tasks', id(TYRE), w0)?.notes === 'ask about winter tyres' && !new URL(page.url()).searchParams.get('task'))
    await openPop(page, TYRE)
    await page.keyboard.press('Escape')
    await sleep(300)
    check('p5 Esc closes it', (await pop(page).count()) === 0)
    await openPop(page, TYRE)
    await pop(page).getByRole('button', { name: 'Open full ↗' }).click()
    await sleep(800)
    check('p6 "Open full ↗" expands to the editor', new URL(page.url()).pathname === `/tasks/${id(TYRE)}`)
  }
  check(`p [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── E: the editor page at parity with the phone sheet ──
for (const theme of want('e') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open(`/tasks/${id(FORE)}`, { theme })
  const w0 = state.writes.length
  const field = (name) => page.getByRole('button', { name, exact: true })
  check(`e1 [${theme}] Reminder and Repeat show values set elsewhere`, /30m before/i.test(await text(field('Reminder'))) && /Weekly/.test(await text(field('Repeat'))), `${await text(field('Reminder'))} / ${await text(field('Repeat'))}`)
  await shot(page, `e1-editor-${theme}`)
  if (theme === 'day') {
    await page.getByRole('group', { name: 'Priority' }).getByRole('button', { name: '!!!', exact: true }).click()
    await settle(state)
    check('e2 a priority control writes priority', lastRow(state, 'tasks', id(FORE), w0)?.priority === 1)
    const durationGroup = page.getByRole('group', { name: 'Duration' })
    const durations = (await durationGroup.getByRole('button').allInnerTexts()).map((d) => d.toLowerCase())
    check('e3 durations run 15m–2h and None', ['none', '15m', '30m', '45m', '1h', '1h30', '2h'].every((d) => durations.includes(d)), durations.join(','))
    await durationGroup.getByRole('button', { name: 'None', exact: true }).click()
    await settle(state)
    check('e3 None clears the duration', lastRow(state, 'tasks', id(FORE), w0)?.duration_min === null)
    await field('Project or area').click()
    await sleep(400)
    const picker = await text(page.locator('[role="dialog"], [role="menu"]').last())
    check('e4 Move to… lists domains and areas (and a new project)', /Personal/.test(picker) && /Health/.test(picker) && /Career/.test(picker), picker.replace(/\n/g, ' | '))
    await page.getByText('Health', { exact: true }).last().click()
    await settle(state)
    const moved = lastRow(state, 'tasks', id(FORE), w0)
    check("e4 an area carries its domain (placeTask)", moved?.area_id === A1 && moved?.domain_id === D2 && moved?.project_id === null, JSON.stringify({ area: moved?.area_id, domain: moved?.domain_id, project: moved?.project_id }))
    // Scrolled first, as a person would: Playwright's own scroll-into-view lands after the click and a
    // menu closes on a scroll behind it (ContextMenu, by design).
    const moreBtn = page.getByRole('button', { name: /^More for/ })
    await moreBtn.scrollIntoViewIfNeeded()
    await sleep(300)
    await moreBtn.click()
    await sleep(300)
    const more = await page.getByRole('menu').last().innerText()
    check('e5 ⋯ has Make goal · Duplicate · Copy link · Delete', ['Make goal of the day', 'Duplicate', 'Copy link', 'Delete'].every((x) => more.includes(x)), more.replace(/\n/g, ' | '))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Plan ▾' }).click()
    await sleep(400)
    const plan = await text(page.locator('.kf-pk-pop').last())
    check('e6 Plan ▾ is the Plan list (Next free slot, This weekend)', /Next free slot/.test(plan) && /weekend/i.test(plan), plan.replace(/\n/g, ' | '))
    await page.keyboard.press('Escape')
    await sleep(200)
    // Subtasks: ⋯ → Rename; a tap on the title opens it.
    await page.locator(`#sub-${id(SUB2)}`).scrollIntoViewIfNeeded()
    await sleep(300)
    await page.locator(`#sub-${id(SUB2)}`).getByRole('button', { name: /More actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Subtask title' }).fill('Draft the cohort model v2')
    await page.keyboard.press('Enter')
    await settle(state)
    check('e7 a subtask renames from its ⋯', lastRow(state, 'tasks', id(SUB2), w0)?.title === 'Draft the cohort model v2')
    await page.locator(`#sub-${id(SUB2)}`).locator('.ts-sub-open').click()
    await sleep(500)
    check('e7 a tap on a subtask opens it', new URL(page.url()).searchParams.get('task') === id(SUB2) && (await pop(page).count()) === 1)
    await page.keyboard.press('Escape')
    await steady(page.locator(`#sub-${id(SUB2)}`), { button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await settle(state)
    check('e7 right-click → Delete sends it to Trash, with Undo', !!lastRow(state, 'tasks', id(SUB2), w0)?.deleted_at && (await toastSoon(page, 'Moved to Trash')))
  }
  check(`e [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R: Repeat → Custom… builds a rule (editor field and the row ⋯ menu) ──
if (want('r')) {
  const { ctx, page, errors, state } = await open(`/tasks/${id(FORE)}`)
  const w0 = state.writes.length
  await steady(page.getByRole('button', { name: 'Repeat', exact: true }))
  await page.getByRole('menuitem', { name: 'Custom…' }).click()
  await sleep(400)
  const editor = page.locator('.kf-pk-pop', { hasText: 'Custom repeat' })
  check('r1 Custom… opens the rule editor (not a dead end)', (await editor.count()) === 1)
  await editor.getByRole('button', { name: 'More Repeat every' }).click()
  await editor.getByRole('button', { name: 'Wed', exact: true }).click()
  await sleep(200)
  const summary = await text(editor)
  await shot(page, 'r1-custom-repeat')
  check('r1 the summary reads the rule', /Every 2 weeks on Monday, Wednesday/i.test(summary), summary.replace(/\n/g, ' | '))
  await editor.getByRole('button', { name: 'Done', exact: true }).click()
  await settle(state)
  check('r1 Done writes the RRULE', lastRow(state, 'tasks', id(FORE), w0)?.recurrence_rule === 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', lastRow(state, 'tasks', id(FORE), w0)?.recurrence_rule)
  check('r1 the field shows it', /Every 2 weeks/.test(await text(page.getByRole('button', { name: 'Repeat', exact: true }))))
  // The row ⋯ / right-click menu: Repeat ▸ Custom… opens the same editor.
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(800)
  await steady(row(page, TYRE), { button: 'right' })
  await page.getByRole('menuitem', { name: 'Repeat' }).hover()
  await sleep(500)
  await page.getByRole('menuitem', { name: 'Custom…' }).click()
  await sleep(400)
  const ed2 = page.locator('.kf-pk-pop', { hasText: 'Custom repeat' })
  await ed2.getByRole('group', { name: 'Repeat unit' }).getByRole('button', { name: 'Days' }).click()
  await ed2.getByRole('group', { name: 'Ends' }).getByRole('button', { name: 'After' }).click()
  await ed2.getByRole('button', { name: 'Done', exact: true }).click()
  await settle(state)
  check('r2 the row menu’s Custom… writes too (daily, 10 times)', lastRow(state, 'tasks', id(TYRE), w0)?.recurrence_rule === 'FREQ=DAILY;COUNT=10', lastRow(state, 'tasks', id(TYRE), w0)?.recurrence_rule)
  check('r no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('r')) {
  // Phone: row ⋯ → Repeat → Custom… is a bottom sheet with the same editor.
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: phone })
  const w0 = state.writes.length
  await row(page, TYRE).getByRole('button', { name: /More actions for/ }).click()
  await sleep(500)
  await page.locator('.kf-as-row', { hasText: 'Repeat' }).first().click()
  await sleep(500)
  await page.locator('.kf-as-row', { hasText: 'Custom…' }).click()
  await sleep(700)
  await page.getByRole('button', { name: 'Fri', exact: true }).click()
  await shot(page, 'r3-phone-custom-repeat')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await settle(state)
  check('r3 phone: ⋯ → Repeat → Custom… sheet writes the rule', lastRow(state, 'tasks', id(TYRE), w0)?.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO,FR', lastRow(state, 'tasks', id(TYRE), w0)?.recurrence_rule)
  check('r3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B: phone bulk Top 3; This Week / This Month on the phone tabs ──
for (const theme of want('b') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: phone, theme })
  const w0 = state.writes.length
  check(`b0 [${theme}] the phone tab strip has This Week and This Month`, (await page.getByRole('link', { name: /This Week/ }).isVisible()) && (await page.getByRole('link', { name: /This Month/ }).count()) === 1)
  await row(page, TYRE).getByRole('button', { name: /More actions for/ }).click()
  await sleep(500)
  await page.locator('.kf-as-row', { hasText: 'Select' }).first().click()
  await sleep(500)
  await row(page, INVOICE).getByText('Send the invoice').click()
  await sleep(400)
  const bar = page.getByRole('toolbar', { name: 'Selected tasks' })
  check(`b1 [${theme}] the phone bulk bar has Top 3`, (await bar.getByRole('button', { name: 'Top 3' }).count()) === 1, await text(bar))
  await shot(page, `b1-phone-bulk-${theme}`)
  if (theme === 'day') {
    await bar.getByRole('button', { name: 'Top 3' }).click()
    await settle(state)
    check('b1 it stars the selection, one Undo', lastRow(state, 'tasks', id(TYRE), w0)?.top3 === true && lastRow(state, 'tasks', id(INVOICE), w0)?.top3 === true && (await toastSoon(page, '2 added to Top 3')))
    await page.getByRole('link', { name: /This Week/ }).click()
    await sleep(600)
    check('b0 This Week opens ?list=week', new URL(page.url()).searchParams.get('list') === 'week')
    await shot(page, 'b0-phone-week-tab')
  }
  check(`b [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S: the phone task sheet on the shared controls (unchanged behaviour), subtasks open from it ──
for (const theme of want('s') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: phone, theme })
  const w0 = state.writes.length
  await row(page, FORE).getByText(TASKS[FORE - 1].title, { exact: true }).click()
  await sleep(900)
  const sheet = page.locator('.kf-bs-panel, [role="dialog"]').last()
  const body = await text(sheet)
  check(`s1 [${theme}] a tap opens the phone sheet (not the popover) with its chips and subtasks`, (await pop(page).count()) === 0 && /P2/.test(body) && /Subtasks/i.test(body) && /Draft the cohort model/.test(body), body.replace(/\n/g, ' | ').slice(0, 300))
  await shot(page, `s1-phone-sheet-${theme}`)
  if (theme === 'day') {
    await page.getByRole('button', { name: 'P2' }).click()
    await sleep(500)
    await page.locator('.kf-as-row', { hasText: 'Critical' }).click()
    await settle(state)
    check('s2 a chip picker still writes from the sheet', lastRow(state, 'tasks', id(FORE), w0)?.priority === 1)
    await page.locator(`#sub-${id(SUB2)} .ts-sub-open`).click()
    await sleep(900)
    check('s3 a tap on a subtask opens its own sheet', new URL(page.url()).searchParams.get('task') === id(SUB2))
  }
  check(`s [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Q: quick add reads like the command bar ──
if (want('q')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const w0 = state.writes.length
  const input = page.getByPlaceholder(/Quick add task/)
  await input.fill('submit the report tomorrow 3pm #forecasting !! *calls')
  await input.press('Enter')
  await settle(state)
  const made = posts(state, 'tasks', w0).find((t) => t.title === 'submit the report')
  check('q1 title, date + time on the user clock, #project, !!, *label', made?.project_id === P1 && made?.due_at === iso('15:00', 13) && made?.priority === 2 && JSON.stringify(made?.labels) === '["calls"]', JSON.stringify(made))
  check('q1 it says where it went ("Added to Tomorrow · Forecasting")', await toastSoon(page, 'Added to Tomorrow · Forecasting'))
  check('q1 a typed time puts it on the calendar (as the command bar does)', posts(state, 'calendar_events', w0).some((e) => e.task_id === made?.id && e.starts_at === iso('15:00', 13)))
  await shot(page, 'q1-quick-add')
  check('q no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── C: the command bar — Enter is the one capture path (⌘↵ cut), and every landing says where ──
if (want('c')) {
  const { ctx, page, errors, state } = await open('/today')
  const w0 = state.writes.length
  await page.keyboard.press('Control+k')
  await sleep(500)
  const bar = page.locator(`#${'kf-capture-input'}`).or(page.getByPlaceholder(/Send the quote/)).first()
  const hint = await text(page.locator('.kf-overlay-card, [role="dialog"]').filter({ hasText: 'quick add' }).first())
  check('c1 the bar no longer offers "⌘ ↵ AI capture"', /quick add/i.test(hint) && !/AI capture/i.test(hint), hint.replace(/\n/g, ' | ').slice(-120))
  await bar.fill('pay rent tomorrow #forecasting')
  await bar.press('Control+Enter') // now just Enter: the same instant capture
  await settle(state)
  const made = posts(state, 'tasks', w0).find((t) => t.title === 'pay rent')
  const onTue = made?.due_at && Date.parse(made.due_at) >= cairo('00:00', 13).getTime() && Date.parse(made.due_at) < cairo('00:00', 14).getTime()
  check('c2 ⌘/Ctrl+Enter is plain Enter: an instant task from the local parse (tomorrow, #project)', made?.project_id === P1 && onTue, JSON.stringify(made))
  check('c2 it says where it went', await toastSoon(page, 'Added to Tomorrow · Forecasting'))
  await page.keyboard.press('Control+k')
  await sleep(500)
  await bar.fill('think about the garden shed')
  await bar.press('Enter')
  await settle(state)
  check('c3 a line with no structure lands in the Inbox and says so', posts(state, 'inbox_items', w0).some((i) => i.raw_text === 'think about the garden shed') && (await toastSoon(page, 'Added to Inbox')))
  await page.keyboard.press('?')
  await sleep(400)
  const sheet = await text(page.getByRole('dialog', { name: 'Shortcuts' }))
  check('c4 the cheatsheet has no AI capture row', !/AI capture/i.test(sheet))
  check('c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D: Tasks page — chips on desktop, Done keys, click-away, overdue days, cheatsheet ──
if (want('d')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const w0 = state.writes.length
  check('d1 domain filter chips show on desktop', await page.getByText('Career', { exact: true }).first().isVisible())
  check('d2 Overdue days count the user day', /Overdue 2d/i.test(await text(row(page, OLD))), await text(row(page, OLD)))
  await row(page, TYRE).getByText('Call the tyre supplier').click({ modifiers: ['Control'] })
  await sleep(300)
  const pill = page.locator('.kf-bulkbar')
  check('d3 ctrl-click selects (bulk bar up, with Top 3)', (await pill.count()) === 1 && /Top 3/.test(await text(pill)))
  await page.locator('h1').first().click()
  await sleep(300)
  check('d3 a click on empty space clears the selection', (await pill.count()) === 0)
  await page.keyboard.press('?')
  await sleep(400)
  const sheet = await text(page.getByRole('dialog', { name: 'Shortcuts' }))
  check('d4 the cheatsheet shows the page keys + Space, Ctrl+A, Alt+↑/↓, the selection note', /Space/.test(sheet) && /Select all/.test(sheet) && /Reorder Top 3/.test(sheet) && /With a selection, keys act on all selected/.test(sheet), sheet.replace(/\n/g, ' | ').slice(0, 400))
  await shot(page, 'd4-cheatsheet')
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/tasks?list=done`, { waitUntil: 'networkidle' })
  await sleep(800)
  await page.keyboard.press('j')
  await sleep(200)
  await page.keyboard.press('e')
  await settle(state)
  check('d5 Done tab keys: j then e reopens the focused done row', [PLANTS, SUB1].some((n) => lastRow(state, 'tasks', id(n), w0)?.status === 'todo'))
  // Kai 2026-10-12 audit items.
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(800)
  check('a1 a paused series is on no list', (await row(page, PAUSED).count()) === 0)
  // Subtasks A (2026-10-16): with its parent on the page it sits nested under it; drawn alone it says "↳ parent".
  check('a2 a subtask sits nested under its parent (A)', (await page.locator(`[data-nest="${id(FORE)}"] #task-${id(SUB2)}`).count()) === 1, await text(row(page, SUB2)))
  await steady(row(page, TYRE), { button: 'right' })
  await sleep(300)
  const items = await page.getByRole('menu').first().getByRole('menuitem').allInnerTexts()
  check('a3 desktop right-click: Tomorrow is a top row again (with its 2 key), Plan… right after', /^Tomorrow/.test(items[0]) && /2/.test(items[0]) && /^Plan/.test(items[1]), items.slice(0, 3).join(' / ').replace(/\n/g, ' '))
  await shot(page, 'a3-context-menu')
  await page.getByRole('menuitem', { name: /^Tomorrow/ }).click()
  await settle(state)
  check('a3 …and it moves the task to tomorrow 09:00', lastRow(state, 'tasks', id(TYRE), w0)?.due_at === iso('09:00', 13))
  await row(page, STRETCH).getByRole('checkbox').click()
  await settle(state)
  const spawned = posts(state, 'tasks', w0).find((t) => t.title === 'Stretch' && t.id !== id(STRETCH))
  check('a4 a daily repeat finished 5 days late comes back tomorrow 09:00, not already overdue', spawned?.due_at === iso('09:00', 13), spawned?.due_at)
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
