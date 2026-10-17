// Smart lists (migration 0081) on the REAL app against a MOCKED backend — the labels / fix-tasks recipe:
// dev server with VITE_SUPABASE_URL=http://127.0.0.1:9 (app/.env.mock.local, `--mode mock`), a made-up
// session in localStorage, Playwright answers every REST call; writes are recorded AND applied to the
// mock rows, so a reload reads back what was written.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=m,e,p to pick sections)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
//   M  make one from the Tasks page's filters → it opens, sits in the sidebar with its count → reload keeps it
//   E  ⋯ / right-click: Edit (show done) · Rename · Move up · Delete → Undo → reload keeps it; "+ New smart list"
//   P  phone: the list on the Tasks strip, opened, "Edit smart list" is a sheet
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5292'
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
const D1 = 'd0000000-0000-4000-8000-000000000001'
const P1 = 'b0000000-0000-4000-8000-000000000001'
const A1 = 'a1000000-0000-4000-8000-000000000001'
const SL1 = '51000000-0000-4000-8000-000000000001'
const SL2 = '51000000-0000-4000-8000-000000000002'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const FORE = 1, QUICK = 2, LONG = 3, TYRE = 4, LATE = 5, DONE = 6, CELLO = 7, GYM = 8
const TASKS = [
  task(FORE, 'Plan the forecasting logic', { project_id: P1, domain_id: D1, due_at: iso('15:00'), duration_min: 30, labels: ['Deep work'] }),
  task(QUICK, 'Reply to Omar', { domain_id: D1, due_at: iso('09:00'), duration_min: 15 }),
  task(LONG, 'Rewrite the model', { project_id: P1, domain_id: D1, due_at: iso('09:00', 14), duration_min: 120 }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:00'), duration_min: 15, labels: ['Errand'] }),
  task(LATE, 'Send the invoice', { project_id: P1, due_at: iso('09:00', 10), duration_min: 20 }), // its domain only through the project
  task(DONE, 'File the old report', { project_id: P1, domain_id: D1, status: 'done', completed_at: iso('08:00'), due_at: iso('08:00'), duration_min: 15 }),
  task(CELLO, 'Learn the cello', { someday: true }),
  task(GYM, 'Book the gym', { area_id: A1, due_at: iso('18:00'), labels: ['Errand'] }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [{ id: D1, user_id: UID, name: 'Career', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED }]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: D1, status: 'active', type: 'standard', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const AREAS = [{ id: A1, user_id: UID, name: 'Health', domain_id: null, color: null, description: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const list = (lid, name, filter, position) => ({ id: lid, user_id: UID, name, icon: null, filter, position, deleted_at: null, created_at: CREATED, updated_at: CREATED })
const QUICKIES = { places: [D1], when: ['overdue', 'today'], length: 30 }
const SEEDED = [list(SL1, 'Work quickies', QUICKIES, 0), list(SL2, 'Errands', { labels: ['Errand'] }, 1)]
const tables = (smart = []) => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: PROJECTS, domains: DOMAINS, areas: AREAS, app_settings: [SETTINGS], smart_lists: smart })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime()])
  const state = { rows: tables(o.smart ?? []), writes: [] }
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
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const sideRow = (page, name) => page.locator('.kf-sl-row', { hasText: name })
const sideNames = (page) => page.locator('.kf-sl-row').allInnerTexts().then((xs) => xs.map((x) => x.replace(/\s+/g, ' ').trim()))
const editor = (page) => page.getByRole('dialog', { name: /smart list/ })
const chipIn = (scope, label) => scope.locator('button.kf-chip', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
const rowShown = async (page, n) => (await page.locator(`#task-${id(n)}`).count()) > 0
const h1 = (page) => text(page.locator('h1'))
const menuItem = (page, label) => page.getByRole('menuitem', { name: label })

// ── M: make one from the Tasks page's filters ──
for (const theme of want('m') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=today', { theme })
  await page.locator('.kf-chip', { hasText: /^Career$/ }).first().click()
  await sleep(300)
  await page.getByRole('button', { name: '＋ Save as smart list' }).click()
  await sleep(800)
  const dlg = editor(page)
  check(`m1 [${theme}] "Save as smart list" opens the editor, starting from the view: Today's days, the Career chip`,
    (await dlg.count()) === 1 && (await chipIn(dlg, 'Overdue').getAttribute('aria-pressed')) === 'true' && (await chipIn(dlg, 'Today').getAttribute('aria-pressed')) === 'true' &&
    (await chipIn(dlg, 'Career').getAttribute('aria-pressed')) === 'true' && (await chipIn(dlg, 'This week').getAttribute('aria-pressed')) === 'false')
  await dlg.getByLabel('Smart list name').fill('Work quickies')
  await chipIn(dlg, '≤ 30 min').click()
  await sleep(300)
  const live = await text(dlg.locator('.kf-help'))
  check(`m2 [${theme}] a live count: Career (own or through its project), ≤ 30 min, overdue or today = 3`, /^3 open tasks match/.test(live), live)
  await shot(page, `m2-editor-desktop-${theme}`)
  const w0 = state.writes.length
  await dlg.getByRole('button', { name: 'Save list' }).click()
  await settle(state)
  const made = posts(state, 'smart_lists', w0).at(-1)
  check(`m3 [${theme}] Save writes one smart_lists row through the outbox: name, the filter`,
    made && made.name === 'Work quickies' && JSON.stringify(made.filter) === JSON.stringify({ places: [D1], when: ['overdue', 'today'], length: 30 }) && made.position === 0 && !('user_id' in made && made.user_id),
    JSON.stringify(made))
  const url = new URL(page.url())
  check(`m4 [${theme}] it opens: /tasks?list=<its id>, its name as the title, its conditions in words`,
    url.searchParams.get('list') === made?.id && (await h1(page)) === 'Work quickies' && /Career · Overdue or Today · ≤ 30 min/.test(await text(page.locator('.kf-help').first())),
    `${url.search} · ${await h1(page)} · ${await text(page.locator('.kf-help').first())}`)
  check(`m5 [${theme}] the rows: the three that fit, not the others`,
    (await rowShown(page, FORE)) && (await rowShown(page, QUICK)) && (await rowShown(page, LATE)) && !(await rowShown(page, TYRE)) && !(await rowShown(page, LONG)) && !(await rowShown(page, GYM)))
  const side = sideRow(page, 'Work quickies')
  check(`m6 [${theme}] the sidebar's Plan group lists it with its count, active`,
    (await side.count()) === 1 && /Work quickies\s*3/.test(await text(side)) && /kf-active/.test(await side.locator('a').getAttribute('class')), await text(side))
  await shot(page, `m6-made-desktop-${theme}`)
  if (theme === 'day') {
    await page.reload({ waitUntil: 'networkidle' })
    await sleep(1500)
    check('m7 a reload keeps it: the list, its title, its count', (await h1(page)) === 'Work quickies' && /Work quickies\s*3/.test(await text(sideRow(page, 'Work quickies'))) && (await rowShown(page, LATE)))
    await page.getByRole('link', { name: /^Due Today/ }).click()
    await sleep(600)
    check('m8 the fixed lists still work beside it (Due Today has no smart list active)', (await h1(page)) === 'Tasks' && !/kf-active/.test(await sideRow(page, 'Work quickies').locator('a').getAttribute('class')))
  }
  check(`m [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── E: change it from the sidebar ──
if (want('e')) {
  const { ctx, page, errors, state } = await open(`/tasks?list=${SL1}`, { smart: SEEDED })
  check('e0 two seeded lists in the sidebar, in their order, with counts', JSON.stringify(await sideNames(page)) === JSON.stringify(['Work quickies 3', 'Errands 2']), JSON.stringify(await sideNames(page)))
  await sideRow(page, 'Work quickies').click({ button: 'right' })
  await sleep(400)
  const items = await page.getByRole('menuitem').allInnerTexts()
  check('e1 right-click → Edit… · Rename · Move down · Delete (no Move up on the first)', JSON.stringify(items.map((x) => x.replace(/\s+/g, ' ').trim())) === JSON.stringify(['Edit…', 'Rename', 'Move down', 'Delete Undo 6s']), JSON.stringify(items))
  await shot(page, 'e1-menu-desktop-day')
  await menuItem(page, 'Edit…').click()
  await sleep(800)
  const dlg = editor(page)
  check('e2 Edit… opens the editor on this list', (await dlg.count()) === 1 && (await dlg.getByLabel('Smart list name').inputValue()) === 'Work quickies' && (await chipIn(dlg, '≤ 30 min').getAttribute('aria-pressed')) === 'true')
  await dlg.getByRole('switch', { name: 'Show done tasks too' }).click()
  let w0 = state.writes.length
  await dlg.getByRole('button', { name: 'Save', exact: true }).click()
  await settle(state)
  const edited = posts(state, 'smart_lists', w0).at(-1)
  check('e3 Save writes the change on the same row', edited?.id === SL1 && edited.filter.show_done === true && edited.name === 'Work quickies', JSON.stringify(edited))
  check('e4 done ones show last, under Done; the count stays the open ones',
    (await page.locator('text=File the old report').count()) === 1 && /Work quickies\s*3/.test(await text(sideRow(page, 'Work quickies'))) && /done ones too/.test(await text(page.locator('.kf-help').first())))
  await shot(page, 'e4-show-done-desktop-day')

  await page.getByRole('button', { name: 'More for Work quickies' }).click()
  await sleep(300)
  await menuItem(page, 'Rename').click()
  await sleep(300)
  const field = page.getByLabel('Smart list name')
  await field.fill('Quick work')
  w0 = state.writes.length
  await field.press('Enter')
  await settle(state)
  check('e5 Rename in place: the row, the title', posts(state, 'smart_lists', w0).at(-1)?.name === 'Quick work' && (await sideRow(page, 'Quick work').count()) === 1 && (await h1(page)) === 'Quick work')

  await page.getByRole('button', { name: 'More for Errands' }).click()
  await sleep(300)
  w0 = state.writes.length
  await menuItem(page, 'Move up').click()
  await settle(state)
  const moved = Object.fromEntries(posts(state, 'smart_lists', w0).map((r) => [r.name, r.position]))
  check('e6 Move up renumbers: Errands first', moved.Errands === 0 && moved['Quick work'] === 1 && JSON.stringify(await sideNames(page)) === JSON.stringify(['Errands 2', 'Quick work 3']), `${JSON.stringify(moved)} ${JSON.stringify(await sideNames(page))}`)

  await page.getByRole('button', { name: 'More for Quick work' }).click()
  await sleep(300)
  w0 = state.writes.length
  await menuItem(page, /^Delete/).click()
  await settle(state)
  const toast = page.locator('.kf-toast', { hasText: 'Deleted “Quick work”' })
  check('e7 Delete: off the sidebar at once, a soft delete, an Undo toast — no confirm',
    (await sideRow(page, 'Quick work').count()) === 0 && !!posts(state, 'smart_lists', w0).at(-1)?.deleted_at && (await toast.count()) === 1 && (await page.getByRole('dialog').count()) === 0)
  await shot(page, 'e7-deleted-desktop-day')
  w0 = state.writes.length
  await toast.getByText('Undo', { exact: true }).click()
  await settle(state)
  check('e8 Undo brings it back, where it was, and the open page applies it again',
    posts(state, 'smart_lists', w0).at(-1)?.deleted_at === null && JSON.stringify(await sideNames(page)) === JSON.stringify(['Errands 2', 'Quick work 3']) && (await h1(page)) === 'Quick work')
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  check('e9 a reload keeps every change: names, order, show done', JSON.stringify(await sideNames(page)) === JSON.stringify(['Errands 2', 'Quick work 3']) && (await page.locator('text=File the old report').count()) === 1)

  await page.getByRole('button', { name: 'New smart list' }).click()
  await sleep(800)
  const fresh = editor(page)
  check('e10 "+ New smart list" opens an empty editor; Save waits for a name', (await fresh.count()) === 1 && (await fresh.getByLabel('Smart list name').inputValue()) === '' && (await fresh.getByRole('button', { name: 'Save list' }).isDisabled()))
  await chipIn(fresh, 'Health').click()
  await sleep(200)
  check('e11 an area works as a place (Book the gym)', /^1 open task match/.test(await text(fresh.locator('.kf-help'))), await text(fresh.locator('.kf-help')))
  const w1 = state.writes.length
  await page.keyboard.press('Escape')
  await settle(state)
  check('e12 Esc closes it, nothing written', (await editor(page).count()) === 0 && posts(state, 'smart_lists', w1).length === 0)
  check('e no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── E (night): the sidebar and the editor by night ──
if (want('e')) {
  const { ctx, page, errors } = await open(`/tasks?list=${SL2}`, { smart: SEEDED, theme: 'night' })
  check('en1 [night] the open list is active in the sidebar; Errands = two labelled tasks', (await h1(page)) === 'Errands' && /kf-active/.test(await sideRow(page, 'Errands').locator('a').getAttribute('class')) && (await rowShown(page, TYRE)) && (await rowShown(page, GYM)))
  await shot(page, 'en1-sidebar-desktop-night')
  await page.getByRole('button', { name: 'More for Errands' }).click()
  await sleep(300)
  await menuItem(page, 'Edit…').click()
  await sleep(800)
  await shot(page, 'en2-editor-desktop-night')
  check('en [night] no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: the phone's Tasks strip ──
for (const theme of want('p') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=today', { view: phone, theme, smart: SEEDED })
  const tab = page.getByRole('link', { name: /^Work quickies/ })
  check(`p1 [${theme}] the phone's strip carries the smart lists, with counts`, (await tab.count()) === 1 && /Work quickies\s*3/.test(await text(tab)) && (await page.getByRole('link', { name: /^Errands/ }).count()) === 1)
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await sleep(800)
  check(`p2 [${theme}] tapped, it opens and its tab is current`, new URL(page.url()).searchParams.get('list') === SL1 && (await h1(page)) === 'Work quickies' && (await tab.getAttribute('aria-current')) === 'page')
  await shot(page, `p2-list-phone-${theme}`)
  await page.getByRole('button', { name: 'Edit smart list' }).click()
  await sleep(900)
  const sheet = page.getByRole('dialog', { name: 'Edit smart list' })
  check(`p3 [${theme}] "Edit smart list" is a sheet on the phone, Delete in it`, (await sheet.count()) === 1 && (await sheet.getByRole('button', { name: 'Delete' }).count()) === 1)
  await shot(page, `p3-edit-sheet-phone-${theme}`)
  if (theme === 'day') {
    const w0 = state.writes.length
    await sheet.getByRole('button', { name: 'Delete' }).click()
    await settle(state)
    await sleep(500)
    check('p4 Delete from the sheet: soft-deleted, its tab gone, an Undo toast', !!posts(state, 'smart_lists', w0).at(-1)?.deleted_at && (await page.getByRole('link', { name: /^Work quickies/ }).count()) === 0 && (await page.locator('.kf-toast', { hasText: 'Deleted' }).count()) === 1)
  }
  check(`p [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
