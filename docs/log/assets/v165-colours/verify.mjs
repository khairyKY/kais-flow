// v1.6.5 · "colour follows where it lives" (Kai 2026-11-16), on the real pages against a MOCKED backend, in Playwright Chromium
// (desktop 1440 calendar + project page, phone 390).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5261] [playwright-core path]
// The dev server: `npm run dev -- --port 5261 --mode mock --host ::` with app/.env.mock.local (VITE_SUPABASE_URL=http://127.0.0.1:9).
//
// Checks: (1) a project's colour reaches its task block on the grid (Fern) and a legacy area colour draws as its palette C swatch
// (hydrangea -> Lagoon); (2) filing a plain event into an area through the details' picker turns it that colour (and writes
// area_id, project_id null); (3) changing the project's colour on its page recolours the block that inherits it, live, while a
// hand-coloured block keeps its own; (4) a hand-coloured block's menu says "Custom · Reset to <project> colour", and Reset writes
// colour null and the block follows its project again; (5) a Google event keeps its calendar's colour unless filed; (6) the phone
// grid draws the task block in the project's swatch.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5261'
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
const UID = '00000000-0000-4000-8000-00000000c065'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const cairo = (hhmm, day = 21) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, day, h - 3, m)) }
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const tid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_FERN = 'c0000000-0000-4000-8000-000000000001'
const P_NONE = 'c0000000-0000-4000-8000-000000000002'
const A_HEALTH = 'a0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null,
  busy: true, type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, area_id: null, deleted_at: null,
  remind_min: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const project = (id, name, color) => ({ id, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color, target_date: null, milestones: [], checklist: [], deleted_at: null, created_at: CREATED, updated_at: CREATED })
const AREA = { id: A_HEALTH, user_id: UID, domain_id: null, name: 'Health', description: null, color: 'var(--acc-hydrangea)', sort_order: 0, deleted_at: null, created_at: CREATED, updated_at: CREATED }
const SETTINGS = { id: 'a0000000-0000-4000-8000-0000000000f1', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], calendar_day_count: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const T1 = task(1, 'Draft the proposal', { project_id: P_FERN, duration_min: 60, scheduled_start: iso('09:00'), scheduled_end: iso('10:00') })
const B1 = ev(1, 'Draft the proposal', '09:00', '10:00', { task_id: T1.id, type: 'task' })
const PLAIN = ev(2, 'Plain event', '11:00', '12:00')
const HAND = ev(3, 'Hand coloured', '13:00', '14:00', { color: '#B36670', project_id: P_FERN }) // Wine, filed under the Fern project
const GOOGLE = ev(4, 'Team call', '15:00', '16:00', { source: 'gcal', color: '#4285F4', external_ref: { source: 'gcal', id: 'cal/1', calendar: 'Work' } })
const GOOGLE_FILED = ev(5, 'Filed call', '16:30', '17:30', { source: 'gcal', color: '#4285F4', project_id: P_FERN, external_ref: { source: 'gcal', id: 'cal/2', calendar: 'Work' } })
const tables = () => structuredClone({
  tasks: [T1], calendar_events: [B1, PLAIN, HAND, GOOGLE, GOOGLE_FILED], inbox_items: [], projects: [project(P_FERN, 'Pricing site', '#72BF8E'), project(P_NONE, 'Uncoloured', null)],
  domains: [], areas: [AREA], app_settings: [SETTINGS], activity_log: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(route, { phone = false, now = cairo('12:09') } = {}) {
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
  // A stateful fake: a write lands in the rows, so a refetch shows it (as the real database would).
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      const list = state.rows[table]
      if (list && body && req.method() === 'POST') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const at = list.findIndex((x) => x.id === row.id)
          if (at >= 0) list[at] = { ...list[at], ...row }
          else list.push(row)
        }
      }
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
const eventRows = (state, from = 0) => state.writes.slice(from).filter((w) => w.table.startsWith('calendar_events')).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const lastRow = (state, id, from = 0) => eventRows(state, from).filter((b) => b && b.id === id).at(-1)
// The accent a grid block is painted with (CalendarGrid paintColor): its --kf-ev-c variable, '' when it has none.
const accent = (page, id) => page.$eval(`.fc-timegrid-event[data-kf-id="${id}"]:not(.fc-event-mirror)`, (el) => el.style.getPropertyValue('--kf-ev-c')).catch(() => null)
const menuTexts = (page) => page.$$eval('[role="menu"] [role="menuitem"], [aria-label="Block details"] button', (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()))

// ───────────────────────── desktop · calendar ─────────────────────────
{
  const { ctx, page, errors, state } = await open('/calendar')
  await page.waitForSelector('.fc', { timeout: 15000 }).catch(() => {})
  await shot(page, 'desktop-day')

  // (1) a project's colour reaches its task block; a hand colour keeps its own; Google keeps its calendar's unless filed
  check('task block: its project\'s Fern', (await accent(page, B1.id)) === 'var(--blk-fern)', await accent(page, B1.id))
  check('plain event: none of its own (the kind default)', (await accent(page, PLAIN.id)) === '', JSON.stringify(await accent(page, PLAIN.id)))
  check('hand-coloured block keeps its own Wine, though filed under Fern', (await accent(page, HAND.id)) === 'var(--blk-wine)', await accent(page, HAND.id))
  check('Google event not filed: its calendar\'s own colour', /4285f4/i.test((await accent(page, GOOGLE.id)) ?? ''), await accent(page, GOOGLE.id))
  check('Google event filed under the Fern project: Fern', (await accent(page, GOOGLE_FILED.id)) === 'var(--blk-fern)', await accent(page, GOOGLE_FILED.id))

  // (2) file the plain event into the Health area (legacy hydrangea) from its details
  await page.locator(`.fc-timegrid-event[data-kf-id="${PLAIN.id}"]`).first().click()
  await sleep(700)
  const rows = await menuTexts(page)
  check('details: the place row says "No project or area"', rows.some((t) => t.includes('No project or area')), JSON.stringify(rows).slice(0, 300))
  await page.locator('[role="menuitem"]', { hasText: 'No project or area' }).first().click()
  await sleep(500)
  await shot(page, 'desktop-place-picker')
  const picker = await page.$$eval('[role="menu"][aria-label="Move to"] [role="menuitem"]', (els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()))
  check('the picker lists areas and projects, no domains', picker.some((t) => t.startsWith('Health')) && picker.some((t) => t.startsWith('Pricing site')) && !picker.some((t) => /Domain$/.test(t)), JSON.stringify(picker))
  const before = state.writes.length
  await page.locator('[role="menu"][aria-label="Move to"] [role="menuitem"]', { hasText: 'Health' }).first().click()
  await sleep(900)
  const filed = lastRow(state, PLAIN.id, before)
  check('filing under the area writes area_id and clears project_id', filed?.area_id === A_HEALTH && filed?.project_id === null, JSON.stringify(filed && { a: filed.area_id, p: filed.project_id }))
  check('the event turns the area\'s colour (hydrangea drawn as Lagoon)', (await accent(page, PLAIN.id)) === 'var(--blk-lagoon)', await accent(page, PLAIN.id))
  await shot(page, 'desktop-filed-in-area')
  await page.keyboard.press('Escape')
  await sleep(300)

  // (4) a hand-coloured block's menu: Custom · Reset to <project> colour
  await page.locator(`.fc-timegrid-event[data-kf-id="${HAND.id}"]`).first().click({ button: 'right' })
  await sleep(700)
  await shot(page, 'desktop-reset-menu')
  const reset = page.locator('.kf-sw-reset')
  check('right-click menu: "↺ Use Pricing site colour"', (await reset.count()) === 1 && /Use Pricing site colour/.test(await reset.innerText()), await reset.innerText().catch(() => 'none'))
  const b2 = state.writes.length
  await reset.locator('button').click()
  await sleep(900)
  const cleared = lastRow(state, HAND.id, b2)
  check('Reset writes colour null', cleared && cleared.color === null, JSON.stringify(cleared && cleared.color))
  check('…and the block follows its project again (Fern)', (await accent(page, HAND.id)) === 'var(--blk-fern)', await accent(page, HAND.id))
  await page.keyboard.press('Escape')
  await sleep(300)
  check('a block with no colour of its own offers no Reset', await (async () => {
    await page.locator(`.fc-timegrid-event[data-kf-id="${HAND.id}"]`).first().click({ button: 'right' })
    await sleep(500)
    const n = await page.locator('.kf-sw-reset').count()
    await page.keyboard.press('Escape')
    return n === 0
  })())

  // (3) change the project's colour on its page, then back to the calendar in the app: the task block and the reset block follow
  await page.evaluate((id) => { window.history.pushState({}, '', `/projects/${id}`); window.dispatchEvent(new PopStateEvent('popstate')) }, P_FERN)
  await sleep(1200)
  await shot(page, 'desktop-project-colours')
  const swatches = await page.$$eval('[role="group"][aria-label="Colour"] button', (els) => els.map((e) => e.getAttribute('aria-label')))
  check('the project page offers palette C\'s 16 swatches', swatches.length === 16 && swatches[0] === 'Rose' && swatches.at(-1) === 'Heather', JSON.stringify(swatches))
  const b3 = state.writes.length
  await page.locator('[role="group"][aria-label="Colour"] button[aria-label="Clay"]').click()
  await sleep(900)
  const proj = state.writes.slice(b3).filter((w) => w.table === 'projects').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).at(-1)
  check('picking Clay writes the project\'s colour', proj?.color === '#E29572', JSON.stringify(proj && proj.color))
  await page.evaluate(() => { window.history.pushState({}, '', '/calendar'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await page.waitForSelector('.fc', { timeout: 15000 }).catch(() => {})
  await sleep(1200)
  check('the task block recoloured to Clay, live', (await accent(page, B1.id)) === 'var(--blk-clay)', await accent(page, B1.id))
  check('the reset block (now following) recoloured to Clay too', (await accent(page, HAND.id)) === 'var(--blk-clay)', await accent(page, HAND.id))
  check('the event filed under the area stays Lagoon', (await accent(page, PLAIN.id)) === 'var(--blk-lagoon)', await accent(page, PLAIN.id))
  check('the Google event filed under the project follows it', (await accent(page, GOOGLE_FILED.id)) === 'var(--blk-clay)', await accent(page, GOOGLE_FILED.id))
  await shot(page, 'desktop-after-project-recolour')
  check('desktop: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ───────────────────────── phone · grid ─────────────────────────
{
  const { ctx, page, errors } = await open('/calendar', { phone: true })
  await sleep(1000)
  await shot(page, 'phone-day')
  const style = await page.evaluate((title) => {
    const el = [...document.querySelectorAll('[class*="pc-"]')].find((e) => (e.textContent ?? '').includes(title) && /blk-/.test(e.getAttribute('style') ?? '') || false)
    return el ? el.getAttribute('style') : null
  }, 'Draft the proposal')
  const html = style ?? (await page.content())
  check('phone: the task block is drawn in its project\'s Fern', /blk-fern/.test(html), (style ?? 'no inline style found').slice(0, 200))
  check('phone: no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
