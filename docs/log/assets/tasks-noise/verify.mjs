// Kai's 2026-10-07 feedback (Ctrl+A · Move to… areas & domains · the sync status / change noise) on
// the REAL app, signed in against a MOCKED backend — the projects-fixes recipe: the dev server runs
// `--mode mock` (VITE_SUPABASE_URL=http://127.0.0.1:9, nothing listens there), a made-up session sits
// in localStorage, and Playwright answers every REST call. Writes are answered 201 and recorded (or
// held / rejected where a check needs a slow or a refused write). Desktop 1280×720, phone 390×844,
// day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      ONLY=1,2,3 to run some sections
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5273'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !ONLY || ONLY.has(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data ──
const T = '2026-09-01T09:00:00Z'
const DAY = 86400000
// Noon in Cairo today, so "today" / "overdue" / "tomorrow" hold whatever hour the harness runs.
const noon = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())}T10:00:00Z`)
const at = (days) => new Date(noon.getTime() + days * DAY).toISOString()
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id('1', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: at(0), scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over,
})
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const HOME = { ...WORK, id: id('4', 2), name: 'Home', color: 'var(--acc-moss)', sort_order: 1 }
const project = (n, name, over = {}) => ({ id: id('2', n), user_id: UID, domain_id: WORK.id, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], engagement_model: null, deleted_at: null, created_at: T, updated_at: T, ...over })
const SITE = project(1, 'Shaheen Website')
const RETAINER = project(2, 'Retainer Co', { type: 'retainer' })
const GARAGE = project(3, 'Garage', { domain_id: null })
const area = (n, name, domain_id) => ({ id: id('3', n), user_id: UID, domain_id, name, description: null, color: null, sort_order: n, deleted_at: null, created_at: T, updated_at: T })
const HEALTH = area(1, 'Health', HOME.id)
const READING = area(2, 'Reading', null)
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
const TASKS = () => [
  task(1, 'Call the tyre supplier', { project_id: SITE.id, domain_id: WORK.id }),
  task(2, 'Send the Q3 numbers to Priya', { domain_id: WORK.id }),
  task(3, 'Run 5k', { area_id: HEALTH.id, domain_id: HOME.id }),
  task(4, 'Renew the passport'),
  task(5, 'Old invoice', { due_at: at(-3) }),
  task(6, 'Plan the garden', { someday: true, due_at: null }),
  task(7, 'Read Dune', { someday: true, due_at: null, area_id: READING.id }),
  task(8, 'Book the flights', { due_at: at(40) }),
  task(9, 'Fix the gate', { project_id: GARAGE.id, due_at: null }),
  task(10, 'Remanage the hosting plan', { status: 'done', completed_at: new Date().toISOString() }),
  task(11, 'Write the site copy', { project_id: SITE.id, domain_id: WORK.id, due_at: at(1) }),
  task(12, 'Stretch', { area_id: HEALTH.id, due_at: at(2) }),
]
const N = (n) => id('1', n)
function tables() {
  return {
    // Projects by name, as the real query orders them (the mock ignores ?order).
    tasks: TASKS(), projects: [GARAGE, RETAINER, SITE], areas: [HEALTH, READING], domains: [WORK, HOME], app_settings: [settings],
    calendar_events: [], inbox_items: [], journal_entries: [], activity_log: [], time_entries: [], people: [],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { width: 390, height: 844 }

/** Opens `route` at 1280×720 (or `o.view`). `o.hold(table)` → ms to hold that write; `o.reject(table, n)` → refuse the n-th write to it. */
async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 720 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_ui_scale', '1')
    // v1.0.22's one-time "Updated to vX · What's new" toast is a deliberate notice, not change noise:
    // seeded as seen so it never takes a toast slot here.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [], count: {} }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      const n = (state.count[table] = (state.count[table] ?? 0) + 1)
      const hold = o.hold?.(table, n) ?? 0
      if (hold) await sleep(hold)
      if (o.reject?.(table, n)) return r.fulfill({ status: 400, json: { code: '23514', message: 'new row violates check constraint', details: null, hint: null } }).catch(() => {})
      state.writes.push({ method: req.method(), table, query: url.search, body, at: Date.now() })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' }).catch(() => {})
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    const eq = url.searchParams.get('entity_id')
    if (eq?.startsWith('eq.')) rows = rows.filter((x) => x.entity_id === eq.slice(3))
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  // A cold dev server can still be compiling a route's chunk after networkidle: task lists wait for a row.
  if (/^\/(tasks|projects\/|planning)/.test(route)) await page.waitForSelector('[id^="task-"]', { timeout: 20000 }).catch(() => {})
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const rowsTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))
const noHScroll = (page) => page.evaluate(() => { const m = document.querySelector('.app-main-content'); return (!m || m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1 })
const rightClick = async (loc) => { await loc.scrollIntoViewIfNeeded(); await sleep(400); await loc.click({ button: 'right' }) }
const lastToast = (page) => page.locator('.kf-toast').last()
const undo = async (page) => { await lastToast(page).getByRole('button', { name: /undo/i }).click(); await sleep(600) }
/** The outbox sends one request at a time: wait (up to 8s) until `n` rows reached `table`. */
const settle = async (state, table, from, n) => {
  const end = Date.now() + 8000
  while (rowsTo(state, table, from).length < n && Date.now() < end) await sleep(100)
  await sleep(200)
}
/** "N selected" from the desktop pill or the phone app bar; 0 when neither shows. */
const selectedCount = async (page) => {
  const bar = page.locator('.kf-bulkbar, .kf-selbar-top')
  if (!(await bar.count())) return 0
  return Number(((await bar.first().innerText()).match(/(\d+)\s+selected/i) ?? [])[1] ?? -1)
}
/** Distinct open task rows on the page (done rows can't be selected). */
const openRows = (page) => page.evaluate(() => new Set([...document.querySelectorAll('[id^="task-"]')].filter((e) => !e.querySelector('[title="Reopen"]') && !e.id.startsWith('task-demo')).map((e) => e.id)).size)
const syncText = (page) => page.evaluate(() => document.querySelector('.app-topbar-sync')?.textContent ?? null)

for (const theme of ['day', 'night']) {
  const NN = (s) => `${s}-${theme}`
  const DAYT = theme === 'day'

  // ── 1 · Ctrl+A on every task list ──
  if (want('1')) {
    // /tasks is the Today tab with every pending task (no ?list); ?list=today is due-today only.
    // Today itself selects its folded "More for today" rows too (TodayPage's own rule), so it has a count, not visible rows.
    const views = [
      ['/tasks', 'tasks-default', 9], ['/tasks?list=today', 'tasks-today', 5], ['/tasks?list=all', 'tasks-all', 11], ['/tasks?list=overdue', 'tasks-overdue', 1], ['/tasks?list=upcoming', 'tasks-upcoming', 1],
      ['/tasks?list=someday', 'tasks-someday', 2], ['/tasks?list=week', 'tasks-week', 7], ['/tasks?list=month', 'tasks-month', null],
      [`/projects/${SITE.id}`, 'project-page', 2], [`/projects/${HEALTH.id}`, 'area-page', 2], ['/planning', 'planning-board', null], ['/today', 'today', 9],
    ]
    for (const [route, name, expected] of views) {
      const { ctx, page, errors } = await open(route, { theme })
      // A cold dev server can still be compiling a route's chunk after networkidle: wait for its rows.
      if (name !== 'today') await page.waitForSelector('[id^="task-"]', { timeout: 20000 }).catch(() => {})
      const rows = await openRows(page)
      await page.keyboard.press('Control+a')
      await sleep(350)
      const n = await selectedCount(page)
      const textSel = await page.evaluate(() => (getSelection()?.toString() ?? '').length)
      check(`${NN('ctrl-a')} ${name}: selects every open task (${expected ?? rows})`, n === (expected ?? rows) && (name === 'today' || n === rows) && textSel === 0, `selected ${n}, rows ${rows}, page text selected ${textSel}`)
      if (DAYT || name === 'tasks-today' || name === 'area-page') await shot(page, NN(`1-ctrl-a-${name}`))
      await page.keyboard.press('Escape')
      await sleep(300)
      check(`${NN('ctrl-a')} ${name}: Esc clears it`, (await selectedCount(page)) === 0)
      check(`${NN('ctrl-a')} ${name}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    {
      // The Done tab has nothing selectable (bulk acts on open tasks): the browser's own select-all stays.
      const { ctx, page } = await open('/tasks?list=done', { theme })
      await page.keyboard.press('Control+a')
      await sleep(300)
      check(`${NN('ctrl-a')} Done tab: no selection (done tasks aren't bulk-actionable)`, (await selectedCount(page)) === 0)
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/tasks?list=all', { theme })
      // The quick add keeps focus after Enter — Ctrl+A there used to do nothing.
      const add = page.getByPlaceholder(/Quick add task/)
      await add.click()
      await page.keyboard.type('Buy oat milk')
      await page.keyboard.press('Enter')
      await sleep(500)
      const focusedEmpty = await page.evaluate(() => document.activeElement?.tagName === 'INPUT' && document.activeElement.value === '')
      await page.keyboard.press('Control+a')
      await sleep(350)
      check(`${NN('ctrl-a')} empty quick add (focus kept after Enter) hands Ctrl+A to the list`, focusedEmpty && (await selectedCount(page)) === 12, `focus in empty field ${focusedEmpty}, selected ${await selectedCount(page)}`)
      await shot(page, NN('1-ctrl-a-after-quick-add'))
      await page.keyboard.press('Escape')
      await sleep(300)
      await add.click()
      await page.keyboard.type('half a title')
      await page.keyboard.press('Control+a')
      await sleep(300)
      const sel = await add.evaluate((e) => [e.selectionStart, e.selectionEnd, e.value.length])
      check(`${NN('ctrl-a')} a field with text keeps the browser select-all (text selected, no rows)`, (await selectedCount(page)) === 0 && sel[0] === 0 && sel[1] === sel[2], JSON.stringify(sel))
      await page.keyboard.press('Escape')
      await add.fill('')
      await page.mouse.click(1000, 650)
      await sleep(200)
      // An Arabic layout: Ctrl+A arrives as key 'ش', code 'KeyA'.
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ش', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true })))
      await sleep(300)
      check(`${NN('ctrl-a')} Arabic layout (key ش, code KeyA) selects too`, (await selectedCount(page)) === 12, String(await selectedCount(page)))
      check(`${NN('ctrl-a')} quick add wrote one task`, rowsTo(state, 'tasks').some((t) => t.title === 'Buy oat milk'))
      await ctx.close()
    }
    {
      // Phone: a hardware keyboard on a phone gets the same; the app bar shows the count.
      const { ctx, page } = await open('/tasks?list=all', { theme, view: PHONE })
      await page.keyboard.press('Control+a')
      await sleep(400)
      check(`${NN('ctrl-a')} phone 390: Ctrl+A selects all, the selection app bar shows "11 selected"`, (await selectedCount(page)) === 11, String(await selectedCount(page)))
      await shot(page, NN('1-ctrl-a-phone'))
      check(`${NN('ctrl-a')} phone: no sideways scroll`, await noHScroll(page))
      await ctx.close()
    }
  }

  // ── 2 · Move to… — projects, areas, domains, none; one task and bulk; Undo ──
  if (want('2')) {
    const { ctx, page, state, errors } = await open('/tasks', { theme })
    const openMove = async (n) => {
      await rightClick(page.locator(`[id="task-${N(n)}"]`))
      await sleep(400)
      await page.getByRole('menuitem', { name: /^Move to…/ }).click()
      await sleep(500)
    }
    await openMove(4)
    const picker = page.getByRole('menu', { name: 'Move to' })
    const groups = await picker.locator('[role="group"]').evaluateAll((gs) => gs.map((g) => [g.getAttribute('aria-label'), [...g.querySelectorAll('button')].map((b) => b.textContent.replace(/(Domain|Area|Project|✓)$/, '').trim())]))
    check(`${NN('move')} the picker: each domain, its areas, its projects; then No domain`, JSON.stringify(groups) === JSON.stringify([
      ['Work', ['Work', 'Retainer Co', 'Shaheen Website']], ['Home', ['Home', 'Health']], ['No domain', ['Reading', 'Garage']],
    ]), JSON.stringify(groups))
    await shot(page, NN('2-move-picker-desktop'))
    let from = state.writes.length
    await picker.getByRole('menuitem', { name: /^Health/ }).click()
    await sleep(700)
    let w = rowsTo(state, 'tasks', from)
    check(`${NN('move')} one task → an area: area + its domain, no project`, w.length === 1 && w[0].area_id === HEALTH.id && w[0].domain_id === HOME.id && w[0].project_id === null, JSON.stringify(w.map((x) => [x.project_id, x.area_id, x.domain_id])))
    check(`${NN('move')} toast "Moved to Health" with Undo`, /Moved to Health/.test(await lastToast(page).innerText()))
    from = state.writes.length
    await undo(page)
    w = rowsTo(state, 'tasks', from)
    check(`${NN('move')} Undo puts it back (no area, no domain)`, w.length === 1 && w[0].area_id === null && w[0].domain_id === null && w[0].project_id === null, JSON.stringify(w))

    await openMove(1)
    from = state.writes.length
    await page.getByRole('menu', { name: 'Move to' }).getByRole('menuitem', { name: /^Home/ }).click()
    await sleep(700)
    w = rowsTo(state, 'tasks', from)
    check(`${NN('move')} a project task → a domain: only the domain`, w.length === 1 && w[0].domain_id === HOME.id && w[0].project_id === null && w[0].area_id === null, JSON.stringify(w.map((x) => [x.project_id, x.area_id, x.domain_id])))

    await openMove(3)
    from = state.writes.length
    await page.getByRole('menu', { name: 'Move to' }).getByRole('menuitem', { name: /^None/ }).click()
    await sleep(700)
    w = rowsTo(state, 'tasks', from)
    check(`${NN('move')} None clears project, area and domain ("Unfiled")`, w.length === 1 && w[0].domain_id === null && w[0].project_id === null && w[0].area_id === null && /Unfiled/.test(await lastToast(page).innerText()), JSON.stringify(w))

    // `p` on the focused row: the picker opens with its search focused.
    await page.mouse.click(1000, 650)
    await page.keyboard.press('ArrowDown')
    await sleep(200)
    const focused = await page.evaluate(() => document.activeElement?.id?.replace('task-', ''))
    await page.keyboard.press('p')
    await sleep(400)
    await page.keyboard.type('read')
    from = state.writes.length
    await page.keyboard.press('Enter')
    await sleep(700)
    w = rowsTo(state, 'tasks', from)
    check(`${NN('move')} \`p\` → type "read" → Enter files it in the Reading area`, w.length === 1 && w[0].id === focused && w[0].area_id === READING.id && w[0].project_id === null, JSON.stringify(w.map((x) => [x.id, x.area_id])))
    check(`${NN('move')} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()

    // Bulk: Ctrl+A → Move → a project; one toast, one Undo.
    {
      const { ctx, page, state } = await open('/tasks?list=all', { theme })
      await page.keyboard.press('Control+a')
      await sleep(300)
      await page.locator('.kf-bulkbar').getByRole('button', { name: /^Move/ }).click()
      await sleep(500)
      await shot(page, NN('2-move-bulk-picker'))
      await page.keyboard.type('gar')
      let from = state.writes.length
      await page.keyboard.press('Enter')
      await settle(state, 'tasks', from, 11)
      let w = rowsTo(state, 'tasks', from)
      check(`${NN('move')} bulk: 11 tasks → Garage (project), out of their areas`, w.length === 11 && w.every((x) => x.project_id === GARAGE.id && x.area_id === null && x.domain_id === null), `${w.length} writes`)
      check(`${NN('move')} bulk: one toast "11 tasks moved to Garage"`, /11 tasks moved to Garage/.test(await lastToast(page).innerText()), await lastToast(page).innerText())
      from = state.writes.length
      await undo(page)
      await settle(state, 'tasks', from, 11)
      w = rowsTo(state, 'tasks', from)
      const back = Object.fromEntries(w.map((x) => [x.id, [x.project_id, x.area_id, x.domain_id]]))
      check(`${NN('move')} bulk Undo: every task back where it was`, w.length === 11 && JSON.stringify(back[N(3)]) === JSON.stringify([null, HEALTH.id, HOME.id]) && JSON.stringify(back[N(1)]) === JSON.stringify([SITE.id, null, WORK.id]), JSON.stringify([back[N(3)], back[N(1)]]))
      await ctx.close()
    }

    // Phone: ⋯ → Move to… → the sheet (52px rows) → an area; and bulk from the selection bar.
    {
      const { ctx, page, state, errors } = await open('/tasks', { theme, view: PHONE })
      await page.getByRole('button', { name: 'More actions for "Renew the passport"' }).click()
      await sleep(600)
      await page.getByRole('dialog').getByRole('button', { name: /^Move to…/ }).click()
      await sleep(700)
      const sheet = page.getByRole('dialog').last()
      const heights = await sheet.locator('button.kf-as-row').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)))
      check(`${NN('move')} phone sheet: every row ≥ 48px`, heights.length >= 8 && heights.every((h) => h >= 48), JSON.stringify(heights))
      await shot(page, NN('2-move-sheet-phone'))
      const from = state.writes.length
      await sheet.getByRole('button', { name: /^Health/ }).click()
      await sleep(800)
      const w = rowsTo(state, 'tasks', from)
      check(`${NN('move')} phone: tap Health → in the area, with its domain`, w.length === 1 && w[0].area_id === HEALTH.id && w[0].domain_id === HOME.id, JSON.stringify(w))
      check(`${NN('move')} phone: no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/tasks?list=all', { theme, view: PHONE })
      await page.keyboard.press('Control+a')
      await sleep(400)
      const labels = (await page.locator('.kf-selbar-bottom button').allInnerTexts()).map((t) => t.trim())
      // plan-replan (2026-10-07): the bar's date button opens the Plan list, so it reads Plan.
      check(`${NN('move')} phone bulk bar: Done · Tomorrow · Plan · Move · Delete`, JSON.stringify(labels) === JSON.stringify(['Done', 'Tomorrow', 'Plan', 'Move', 'Delete']), JSON.stringify(labels))
      await page.locator('.kf-selbar-bottom').getByRole('button', { name: 'Move' }).click()
      await sleep(700)
      const from = state.writes.length
      await page.getByRole('dialog').last().getByRole('button', { name: /^Work\s*Domain/ }).click()
      await settle(state, 'tasks', from, 11)
      const w = rowsTo(state, 'tasks', from)
      check(`${NN('move')} phone bulk: 11 tasks → the Work domain`, w.length === 11 && w.every((x) => x.domain_id === WORK.id && !x.project_id && !x.area_id), `${w.length}`)
      if (DAYT) await shot(page, NN('2-move-bulk-phone-toast'))
      await ctx.close()
    }
  }

  // ── 3 · An area's (and a project's) domain; its tasks follow; Undo ──
  if (want('3')) {
    {
      const { ctx, page, state, errors } = await open(`/projects/${HEALTH.id}`, { theme })
      const field = page.locator('[aria-label="Area domain"]')
      check(`${NN('domain')} the area page has a Domain field showing Home`, /Home/.test(await field.innerText()))
      await field.click()
      await sleep(400)
      const from = state.writes.length
      await page.getByRole('option', { name: 'Work' }).click()
      await sleep(900)
      const a = rowsTo(state, 'areas', from)
      const t = rowsTo(state, 'tasks', from)
      check(`${NN('domain')} area → Work: the area is written with it`, a.length === 1 && a[0].domain_id === WORK.id, JSON.stringify(a))
      check(`${NN('domain')} area → Work: both its tasks follow (domain_id Work)`, t.length === 2 && t.every((x) => x.domain_id === WORK.id && x.area_id === HEALTH.id), JSON.stringify(t.map((x) => [x.id, x.domain_id])))
      check(`${NN('domain')} toast "Moved to Work" with Undo`, /Moved to Work/.test(await lastToast(page).innerText()))
      await shot(page, NN('3-area-domain-desktop'))
      const from2 = state.writes.length
      await undo(page)
      const a2 = rowsTo(state, 'areas', from2)
      const t2 = Object.fromEntries(rowsTo(state, 'tasks', from2).map((x) => [x.id, x.domain_id]))
      check(`${NN('domain')} Undo: the area back in Home, each task back to its own domain`, a2.length === 1 && a2[0].domain_id === HOME.id && t2[N(3)] === HOME.id && t2[N(12)] === null, JSON.stringify([a2.map((x) => x.domain_id), t2]))
      check(`${NN('domain')} area page: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open(`/projects/${SITE.id}`, { theme })
      await page.locator('[aria-label="Project domain"]').click()
      await sleep(400)
      const from = state.writes.length
      await page.getByRole('option', { name: 'Home' }).click()
      await sleep(900)
      const p = rowsTo(state, 'projects', from)
      const t = rowsTo(state, 'tasks', from)
      check(`${NN('domain')} project → Home: its tasks follow too (they kept the old domain before)`, p.length === 1 && p[0].domain_id === HOME.id && t.length === 2 && t.every((x) => x.domain_id === HOME.id), JSON.stringify(t.map((x) => x.domain_id)))
      const from2 = state.writes.length
      await undo(page)
      check(`${NN('domain')} project Undo: back in Work, tasks too`, rowsTo(state, 'projects', from2)[0]?.domain_id === WORK.id && rowsTo(state, 'tasks', from2).every((x) => x.domain_id === WORK.id))
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/projects', { theme })
      await rightClick(page.getByText('Reading', { exact: true }).first())
      await sleep(400)
      await page.getByRole('menuitem', { name: /^Domain…/ }).click()
      await sleep(400)
      await shot(page, NN('3-projects-row-domain-menu'))
      const from = state.writes.length
      await page.getByRole('menuitem', { name: /^Home/ }).click()
      await sleep(900)
      const a = rowsTo(state, 'areas', from)
      const t = rowsTo(state, 'tasks', from)
      check(`${NN('domain')} Projects ⋯ → Domain… → Home: Reading moves, its task follows`, a[0]?.domain_id === HOME.id && t.length === 1 && t[0].id === N(7) && t[0].domain_id === HOME.id, JSON.stringify([a, t.map((x) => x.id)]))
      await ctx.close()
    }
    {
      const { ctx, page, state, errors } = await open(`/projects/${HEALTH.id}`, { theme, view: PHONE })
      const field = page.locator('[aria-label="Area domain"]')
      const h = await field.evaluate((e) => e.getBoundingClientRect().height)
      check(`${NN('domain')} phone: the area's Domain field is ≥ 48px tall`, h >= 48, `${h}px`)
      await field.click()
      await sleep(500)
      await shot(page, NN('3-area-domain-phone'))
      const from = state.writes.length
      await page.getByRole('option', { name: 'No domain' }).or(page.getByRole('option', { name: '— no domain' })).first().click()
      await sleep(900)
      check(`${NN('domain')} phone: area → no domain, its tasks too`, rowsTo(state, 'areas', from)[0]?.domain_id === null && rowsTo(state, 'tasks', from).every((x) => x.domain_id === null))
      check(`${NN('domain')} phone: no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/projects', { theme, view: PHONE })
      await page.getByRole('button', { name: 'More for Reading' }).click()
      await sleep(600)
      await page.getByRole('dialog').getByRole('button', { name: /^Domain…/ }).click()
      await sleep(700)
      const sheet = page.getByRole('dialog').last()
      const heights = await sheet.locator('button.kf-as-row').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)))
      check(`${NN('domain')} phone Projects ⋯ → Domain…: a sheet of domains, rows ≥ 48px`, heights.length === 3 && heights.every((x) => x >= 48), JSON.stringify(heights))
      await shot(page, NN('3-projects-domain-sheet-phone'))
      const from = state.writes.length
      await sheet.getByRole('button', { name: /^Work/ }).click()
      await sleep(900)
      check(`${NN('domain')} phone: Reading → Work`, rowsTo(state, 'areas', from)[0]?.domain_id === WORK.id)
      await ctx.close()
    }
  }

  // ── 4 · The sync status stays quiet; speaks for slow, offline and not-saved writes ──
  if (want('4')) for (const view of [undefined, PHONE]) {
    const V = view ? 'phone' : 'desktop'
    // Kai's Android screenshot (Routines, via More): "KAI'S FLOW · TUE 6 OCT · SYNCED ●" on every
    // More-section page. The strip is the same component on every page that shows it (Today and
    // Calendar on a phone draw their own app bar instead), so each of these must read the same.
    for (const route of ['/routines', '/people', '/settings', '/projects', '/tasks', '/inbox']) {
      const { ctx, page } = await open(route, { theme, view })
      const strip = await page.locator('.app-topbar').innerText()
      const shown = await page.locator('.app-topbar').isVisible()
      check(`${NN('sync')} ${V} ${route}: the strip shows no sync status at rest`, shown && !/synced|syncing|offline/i.test(strip) && !strip.includes('●') && (await syncText(page)) === null, strip.replace(/\n/g, ' '))
      if (route === '/routines') {
        await shot(page, NN(`4-strip-at-rest-routines-${V}`))
        await ctx.setOffline(true)
        await sleep(500)
        check(`${NN('sync')} ${V} /routines: offline shows on the same strip`, (await syncText(page)) === 'Offline', String(await syncText(page)))
        await shot(page, NN(`4-strip-offline-routines-${V}`))
      }
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/tasks?list=all', { theme, view })
      check(`${NN('sync')} ${V}: nothing shows at rest`, (await syncText(page)) === null, String(await syncText(page)))
      await page.evaluate(() => {
        window.__syncSeen = []
        const look = () => { const t = document.querySelector('.app-topbar-sync')?.textContent; if (t) window.__syncSeen.push(t) }
        new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true })
        window.__syncTimer = setInterval(look, 50)
      })
      // A burst: star / unstar one task 12 times, ~250ms apart (24 writes with their activity rows).
      const before = state.writes.length
      if (view) {
        for (let i = 0; i < 12; i++) { await page.locator(`[id="task-${N(4)}"]`).getByTitle(/Top 3/).click(); await sleep(250) }
      } else {
        await page.mouse.click(1000, 650)
        await page.keyboard.press('ArrowDown')
        for (let i = 0; i < 12; i++) { await page.keyboard.press('t'); await sleep(250) }
      }
      await sleep(3000)
      const seen = await page.evaluate(() => window.__syncSeen)
      check(`${NN('sync')} ${V}: a burst of ${state.writes.length - before} writes — the status never showed`, state.writes.length - before >= 20 && seen.length === 0, `${state.writes.length - before} writes, seen ${JSON.stringify([...new Set(seen)])}`)
      check(`${NN('sync')} ${V}: and no toast for them`, (await page.locator('.kf-toast').count()) === 0, String(await page.locator('.kf-toast').count()))
      await shot(page, NN(`4-sync-quiet-after-burst-${V}`))
      await ctx.close()
    }
    {
      // A write the server holds 5.5s: quiet at first, "Syncing…" past ~4s, then quiet again (no "Synced").
      const { ctx, page } = await open('/tasks?list=all', { theme, view, hold: (table, n) => (table === 'tasks' && n === 1 ? 5500 : 0) })
      await page.locator(`[id="task-${N(4)}"]`).getByTitle(/Top 3/).click()
      await sleep(2000)
      const early = await syncText(page)
      await sleep(2600)
      const slow = await syncText(page)
      await shot(page, NN(`4-sync-slow-${V}`))
      await sleep(2500)
      const after = await syncText(page)
      check(`${NN('sync')} ${V}: slow write — nothing at 2s, "Syncing…" at 4.6s, nothing once it lands`, early === null && slow === 'Syncing…' && after === null, JSON.stringify([early, slow, after]))
      await ctx.close()
    }
    {
      const { ctx, page, state } = await open('/tasks?list=all', { theme, view })
      await ctx.setOffline(true)
      await sleep(500)
      const off = await syncText(page)
      await page.locator(`[id="task-${N(4)}"]`).getByTitle(/Top 3/).click()
      await sleep(700)
      const waiting = await syncText(page)
      await shot(page, NN(`4-sync-offline-${V}`))
      const before = state.writes.length
      await ctx.setOffline(false)
      await sleep(1200)
      const back = await syncText(page)
      await shot(page, NN(`4-sync-synced-${V}`))
      await sleep(3000)
      const later = await syncText(page)
      check(`${NN('sync')} ${V}: offline → "Offline", a change → "Offline · 1 waiting"`, off === 'Offline' && waiting === 'Offline · 1 waiting', JSON.stringify([off, waiting]))
      check(`${NN('sync')} ${V}: back online it syncs, says "Synced" briefly, then nothing`, state.writes.length > before && /^Synced/.test(back ?? '') && later === null, JSON.stringify([back, later]))
      await ctx.close()
    }
    {
      // The server refuses a write: the error toast stays, and the status says so until it's looked at.
      const { ctx, page } = await open('/tasks?list=all', { theme, view, reject: (table, n) => table === 'tasks' && n === 1 })
      await page.locator(`[id="task-${N(4)}"]`).getByTitle(/Top 3/).click()
      await sleep(1200)
      const label = await syncText(page)
      const toast = await page.locator('.kf-toast').allInnerTexts()
      check(`${NN('sync')} ${V}: a refused write → "1 change not saved ⚠" + its toast`, label === '1 change not saved ⚠' && toast.some((t) => /couldn't be saved/.test(t)), JSON.stringify([label, toast]))
      await page.locator('.app-topbar-sync').click()
      await sleep(400)
      const pop = await page.locator('.kf-sync-pop').innerText()
      check(`${NN('sync')} ${V}: its popover names the change that wasn't saved`, /Not saved/i.test(pop) && /Renew the passport/.test(pop), pop.replace(/\n/g, ' / '))
      await shot(page, NN(`4-sync-not-saved-${V}`))
      await page.mouse.click(view ? 200 : 900, view ? 700 : 600)
      await sleep(400)
      const seen = await syncText(page)
      await sleep(3000)
      check(`${NN('sync')} ${V}: once seen it calms — "Synced", then nothing`, /^Synced/.test(seen ?? '') && (await syncText(page)) === null, JSON.stringify([seen, await syncText(page)]))
      await ctx.close()
    }
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
