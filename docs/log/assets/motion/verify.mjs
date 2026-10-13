// motion (Motion 2b/2c/2d/3a/4d/4e, Effects 2j/2k/2l) on the REAL app against a MOCKED backend — the
// fix-tasks recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9 (--mode mock), a made-up session
// in localStorage, Playwright answers every REST call; writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=s,p,d,n,t,i,b,r,o,l,k to pick sections)
// Frame sequences run the page's animations at 1/5 speed (DevTools' Animation.setPlaybackRate), so a
// 380ms move is caught at 0 / 20 / 40 / 60 / 80% and at rest.
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5263'
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
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const D1 = 'd0000000-0000-4000-8000-000000000001', D2 = 'd0000000-0000-4000-8000-000000000002'
const P1 = 'b0000000-0000-4000-8000-000000000001', P2 = 'b0000000-0000-4000-8000-000000000002', P3 = 'b0000000-0000-4000-8000-000000000003'
const A1 = 'c0000000-0000-4000-8000-0000000000a1'
const SALMA = 'e1000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const FORE = 1, TYRE = 2, REVIEW = 3, INVOICE = 4, PASSPORT = 5, DENTIST = 6, STRETCH = 7, BALCONY = 8, CHARTS = 9
const TASKS = [
  task(FORE, 'Plan & implement forecasting logic', { project_id: P1, domain_id: D1, due_at: iso('15:00'), top3: true, top3_rank: 1 }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:00'), top3: true, top3_rank: 2 }),
  task(REVIEW, 'Review the week', { due_at: iso('11:00'), top3: true, top3_rank: 3 }),
  task(INVOICE, 'Send the invoice', { due_at: iso('09:00', 13) }),
  task(PASSPORT, 'Renew passport', { due_at: iso('09:00', 15) }),
  task(DENTIST, 'Dentist callback', { due_at: iso('12:00', 14) }),
  task(STRETCH, 'Stretch before bed'),
  task(BALCONY, 'Water the balcony plants'),
  task(CHARTS, 'Wireframe the charts view', { project_id: P1, domain_id: D1, due_at: iso('09:00', 16) }),
  ...Array.from({ length: 14 }, (_, i) => task(20 + i, `Someday idea ${i + 1}`, { someday: true })),
]
const ib = (n, over) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const OAT = 1, HOSTING = 2
const INBOX = [
  ib(OAT, { raw_text: 'Oat milk in the cortado', created_at: iso('09:40') }),
  ib(HOSTING, { kind: 'email', raw_text: 'renew hosting before the 15th', created_at: iso('08:30', 7) }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [
  { id: D1, user_id: UID, name: 'Freelance', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED },
  { id: D2, user_id: UID, name: 'Home', color: '#C9A55A', sort_order: 1, created_at: CREATED, updated_at: CREATED },
]
const AREAS = [{ id: A1, user_id: UID, name: 'Health', domain_id: D2, description: null, color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const project = (pid, name, domain) => ({ id: pid, user_id: UID, name, domain_id: domain, status: 'active', type: 'standard', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(P1, 'Forecasting App', D1), project(P2, 'Garage', D2), project(P3, 'Kitchen deep-clean', D2)]
const PEOPLE = [{ id: SALMA, user_id: UID, name: 'Salma Hassan', facts: [], domain_id: null, created_at: CREATED, updated_at: CREATED }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: INBOX, projects: PROJECTS, domains: DOMAINS, areas: AREAS, people: PEOPLE, app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, sess, uid, at, effects]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
    if (effects === '0') localStorage.setItem('kf_effects', '0')
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime(), o.effectsOff ? '0' : '1'])
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
  if (process.env.DEBUG) page.on('console', (m) => m.text().startsWith('[dbg]') && console.log(m.text()))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

// JPEG: the paper grain makes these PNGs ~600KB each; a frame sequence doesn't need lossless.
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 })
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
const path_ = (page) => new URL(page.url()).pathname
const layerCount = (page) => page.locator('.kf-stack-layer').count()
const stackAttr = (page) => page.locator('.app-main-content').getAttribute('data-stack')

/** Runs `go` with the page's animations at 1/5 speed and saves frames through the move (`one`: only
 * the frame at ~40%, as proof — the full sequences are s1/s2 and p1/p2). */
async function frames(page, name, go, at = [0, 380, 760, 1140, 1520, 2300], one = false) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.2 })
  const t0 = Date.now()
  await go()
  const seen = { layer: false, stack: null }
  for (const [i, ms] of at.entries()) {
    const wait = t0 + ms - Date.now()
    if (wait > 0) await sleep(wait)
    if (await layerCount(page)) seen.layer = true
    seen.stack ??= await stackAttr(page)
    if (!one) await shot(page, `${name}-${i}`)
    else if (ms === 760) await shot(page, name)
  }
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  return seen
}

/** A mouse drag from `from` to `to` (locators), held over the target for a beat. */
async function drag(page, from, to, { hold, beforeUp } = {}) {
  await from.scrollIntoViewIfNeeded()
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + Math.min(60, a.width / 2), a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 80, a.y + a.height / 2 + 8, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 })
  await sleep(hold ?? 250)
  if (beforeUp) await beforeUp()
  await page.mouse.up()
}

// ── S: Motion 2b / 4e — the stack on a computer (vertical): push, its back link, Back, Esc ──
if (want('s')) {
  const { ctx, page, errors } = await open('/projects')
  const seen = await frames(page, 's1-push-desktop', () => page.getByText('Forecasting App', { exact: true }).first().click())
  check('s1 a project row pushes its page: the list stays underneath as a receding copy while the detail rides up', seen.layer && seen.stack === 'push' && path_(page) === `/projects/${P1}`, JSON.stringify(seen))
  check('s1 at rest the copy is gone and the page is live', (await layerCount(page)) === 0 && !(await stackAttr(page)))
  const seenPop = await frames(page, 's2-pop-backlink-desktop', () => page.getByRole('link', { name: /All projects/ }).first().click())
  check('s2 its back link pops: the detail drops away over the list', seenPop.layer && seenPop.stack === 'pop' && path_(page) === '/projects', JSON.stringify(seenPop))
  await page.getByText('Forecasting App', { exact: true }).first().click()
  await sleep(800)
  const seenBack = await frames(page, 's3-pop-browser-back', () => page.goBack(), [0, 760, 2300], true)
  check("s3 the browser's Back pops too", seenBack.stack === 'pop' && path_(page) === '/projects', JSON.stringify(seenBack))
  const seenFwd = await frames(page, 's3-push-browser-forward', () => page.goForward(), [0, 760, 2300], true)
  check("s3 …and Forward pushes again", seenFwd.stack === 'push' && path_(page) === `/projects/${P1}`, JSON.stringify(seenFwd))
  await page.locator('h1').first().click()
  const seenEsc = await frames(page, 's4-pop-esc', () => page.keyboard.press('Escape'), [0, 760, 2300], true)
  check('s4 Esc pops a detail page', seenEsc.stack === 'pop' && path_(page) === '/projects', `${JSON.stringify(seenEsc)} ${path_(page)}`)
  // A sidebar jump from a detail to another section is a plain route cut, not a pop.
  await page.getByText('Forecasting App', { exact: true }).first().click()
  await sleep(800)
  const seenCut = await frames(page, 's5-cut-sidebar', () => page.locator('.app-sidebar').getByRole('link', { name: 'Inbox' }).click(), [0, 760], true)
  check('s5 a sidebar jump away from a detail is the route cut, no stack', !seenCut.layer && !seenCut.stack && path_(page) === '/inbox', JSON.stringify(seenCut))
  // People and the person page ride the same stack.
  await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' })
  await sleep(800)
  const seenPeople = await frames(page, 's6-push-people', () => page.getByText('Salma Hassan').last().click(), [0, 760, 2300], true)
  check('s6 People → a person pushes', seenPeople.stack === 'push' && path_(page) === `/people/${SALMA}`, JSON.stringify(seenPeople))
  // Tasks → the full task page (the popover's Open full ↗).
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(800)
  await page.locator(`#task-${id(INVOICE)}`).getByText('Send the invoice', { exact: true }).click()
  await sleep(600)
  const seenTask = await frames(page, 's7-push-task-editor', () => page.locator('.tp-pop').getByRole('button', { name: 'Open full ↗' }).click(), [0, 760, 2300], true)
  check('s7 Tasks → the task editor page pushes', seenTask.stack === 'push' && path_(page) === `/tasks/${id(INVOICE)}`, JSON.stringify(seenTask))
  check('s no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: Motion 3a — the stack on a phone (horizontal), and night ──
if (want('p')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/projects', { view: phone, theme })
    const seen = await frames(page, `p1-push-phone-${theme}`, () => page.getByText('Forecasting App', { exact: true }).first().click(), undefined, theme === 'night')
    check(`p1 [${theme}] a phone pushes the detail in from the right`, seen.layer && seen.stack === 'push' && path_(page) === `/projects/${P1}`, JSON.stringify(seen))
    if (theme === 'day') {
      const pop = await frames(page, 'p2-pop-phone', () => page.goBack())
      check('p2 Back slides it away to the right', pop.layer && pop.stack === 'pop' && path_(page) === '/projects', JSON.stringify(pop))
    }
    check(`p [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── D: Motion 2c / 2d / 4d — the filing drag on the Tasks page, Effects 2j's soft no ──
if (want('d')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const rowOf = (n) => page.locator(`#drag-${id(n)}`)
  const side = (name) => page.locator('.app-sidebar').getByRole('link', { name: new RegExp(`^${name}( |$)`) })
  // d1: one task onto the sidebar's Someday.
  let w0 = state.writes.length
  await drag(page, rowOf(BALCONY), side('Someday'), {
    beforeUp: async () => {
      check('d1 mid-drag: a lifted ghost follows the pointer, the row keeps its place as a dashed slot, Someday opens as the placeholder', (await page.locator('.kf-ghost').count()) === 1 && (await rowOf(BALCONY).getAttribute('data-drag-slot')) !== null && /kf-drop-over/.test((await side('Someday').getAttribute('class')) ?? ''))
      await shot(page, 'd1-drag-over-someday')
    },
  })
  await settle(state)
  check('d1 the drop parks it for someday, with a toast and Undo', lastRow(state, 'tasks', id(BALCONY), w0)?.someday === true && (await toastSoon(page, 'Parked for someday')))
  await sleep(120)
  await shot(page, 'd1-dropped-catch')
  await page.locator('.kf-toast-act', { hasText: 'Undo' }).first().click()
  await settle(state)
  check('d1 Undo puts it back', lastRow(state, 'tasks', id(BALCONY), w0)?.someday === false)
  // d2: onto the sidebar's Today.
  w0 = state.writes.length
  await drag(page, rowOf(PASSPORT), side('Today'))
  await settle(state)
  const passport = lastRow(state, 'tasks', id(PASSPORT), w0)
  check('d2 onto Today: due today at its own time, toast "Moved to today"', passport?.due_at === iso('09:00') && (await toastSoon(page, 'Moved to today')), passport?.due_at)
  check('d no page errors (1280)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// The Organize rail shows when the list beside it keeps >=472px (a wider window than 1280 at 125%).
if (want('d')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: { viewport: { width: 1680, height: 1000 } } })
  const rowOf = (n) => page.locator(`#drag-${id(n)}`)
  let w0 = state.writes.length
  // d3: the soft no — a task already in Forecasting App, onto Forecasting App in the Organize rail.
  let refused = 0
  await drag(page, rowOf(CHARTS), page.locator('.tasks-rail').getByText('Forecasting App', { exact: true }), {
    beforeUp: async () => {
      refused = await page.locator('.tasks-rail .kf-drop-no').count()
      await shot(page, 'd3-softno-over')
    },
  })
  await sleep(90)
  const shaking = await page.locator('.tasks-rail [data-play="drop-softno"]').count()
  await shot(page, 'd3-softno-shake')
  await sleep(250)
  await shot(page, 'd3-softno-ride-home')
  await settle(state)
  check('d3 the soft no: the project it already lives in warms terra under the pointer, shakes once on the drop, nothing is written', refused === 1 && shaking === 1 && posts(state, 'tasks', w0).length === 0, `over=${refused} shake=${shaking} writes=${posts(state, 'tasks', w0).length}`)
  // d4: a multi-selection onto a rail project — one ghost, the others fanned behind, counted.
  for (const n of [STRETCH, DENTIST, INVOICE]) {
    await rowOf(n).hover()
    await rowOf(n).locator('.tr-select').click()
  }
  w0 = state.writes.length
  await drag(page, rowOf(STRETCH), page.locator('.tasks-rail').getByText('Garage', { exact: true }), {
    beforeUp: async () => {
      check('d4 three selected lift as ONE ghost with two fanned behind and the count 3', (await page.locator('.kf-ghost-under').count()) === 2 && (await page.locator('.kf-ghost-count').innerText()) === '3' && (await page.locator('[data-drag-slot]').count()) === 3)
      await shot(page, 'd4-stacked-ghost')
    },
  })
  await settle(state)
  const moved = [STRETCH, DENTIST, INVOICE].map((n) => lastRow(state, 'tasks', id(n), w0)?.project_id)
  check('d4 the drop moves all three to Garage, one toast, and clears the selection', moved.every((p) => p === P2) && (await toastSoon(page, '3 tasks moved to Garage')) && (await page.locator('.tr-select.is-on').count()) === 0, moved.join(','))
  // d5: the click that ends a drag is not a tap on the row.
  check('d5 no popover opened by the drag', (await page.locator('.tp-pop').count()) === 0)
  // d6: Effects 2j beyond drops — a fourth star for a full Top 3 shakes once (the toast says why).
  await page.locator(`#task-${id(PASSPORT)} [title="Add to Top 3"]`).click()
  const starShake = await page.locator(`#task-${id(PASSPORT)} [data-play="softno"]`).count()
  check('d6 a refused star shakes (and "Top 3 is full" says why)', starShake === 1 && (await toastSoon(page, 'Top 3 is full')))
  check('d no page errors (rail)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── N: night — the stack and the drag under the night tokens ──
if (want('n')) {
  const { ctx, page, errors, state } = await open('/projects', { theme: 'night' })
  const seen = await frames(page, 'n1-push-desktop-night', () => page.getByText('Forecasting App', { exact: true }).first().click(), [0, 760, 1140, 2300], true)
  check('n1 [night] the push plays under the night palette', seen.layer && seen.stack === 'push', JSON.stringify(seen))
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(800)
  const w0 = state.writes.length
  await drag(page, page.locator(`#drag-${id(BALCONY)}`), page.locator('.app-sidebar').getByRole('link', { name: /^Someday( |$)/ }), { beforeUp: () => shot(page, 'n2-drag-over-someday-night') })
  await settle(state)
  check('n2 [night] the drag files the same way', lastRow(state, 'tasks', id(BALCONY), w0)?.someday === true)
  check('n [night] no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── T: the shell's drag world wraps every page — Today's own Top 3 drag (its nested DndContext) still works ──
if (want('t')) {
  const { ctx, page, errors, state } = await open('/today')
  const w0 = state.writes.length
  await drag(page, page.locator(`[data-top3-slot="${id(REVIEW)}"]`), page.locator(`[data-top3-slot="${id(FORE)}"]`))
  await settle(state)
  // Aimed at the goal card it lands on place 2 — with or without the shell's context around it (checked
  // by taking DragShell out): Today's own drag moves its row by dnd-kit's un-zoomed delta. Not this branch's.
  const rank = lastRow(state, 'tasks', id(REVIEW), w0)?.top3_rank
  check("t1 Today's Top 3 drag (its own DndContext, inside the shell's) still reorders: Review moves up", rank != null && rank < 3, JSON.stringify(rank))
  check('t no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── I: Motion 2d — Inbox → the sidebar's Today ──
if (want('i')) {
  const { ctx, page, errors, state } = await open('/inbox')
  const w0 = state.writes.length
  await drag(page, page.locator(`#drag-${iid(OAT)}`), page.locator('.app-sidebar').getByRole('link', { name: /^Today( |$)/ }), {
    beforeUp: () => shot(page, 'i1-inbox-drag-over-today'),
  })
  await sleep(700) // the card breathes out (3e), then the filing is written
  await settle(state)
  const filed = posts(state, 'inbox_items', w0).find((r) => r.id === iid(OAT))
  const made = posts(state, 'tasks', w0).at(-1)
  check('i1 a capture dropped on Today is filed as a task due today (toast + Undo), and its card heals out of the list', filed?.status === 'filed' && made?.due_at === iso('09:00') && (await toastSoon(page, 'Filed')), `${filed?.status} ${made?.due_at}`)
  await shot(page, 'i1-inbox-filed')
  check('i no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B: Motion 2c/2d on the Projects board — a card to another domain's column; its own column says no ──
if (want('b')) {
  const { ctx, page, errors, state } = await open('/projects')
  await page.getByText('Board', { exact: true }).click()
  await sleep(600)
  const card = page.locator(`#drag-${P2}`)
  const col = (name) => page.locator('[class*="kf-drop"], div').filter({ has: page.getByText(name, { exact: true }) }).filter({ has: page.getByText('Plant a project here…') }).last()
  let w0 = state.writes.length
  await drag(page, card, col('Home'))
  await settle(state)
  check('b1 its own column is the soft no — nothing written', posts(state, 'projects', w0).length === 0)
  w0 = state.writes.length
  await drag(page, card, col('Freelance'), { beforeUp: () => shot(page, 'b2-board-drag-over-column') })
  await settle(state)
  check('b2 another column moves the project there, with "Moved to Freelance" + Undo', lastRow(state, 'projects', P2, w0)?.domain_id === D1 && (await toastSoon(page, 'Moved to Freelance')))
  await shot(page, 'b2-board-moved')
  check('b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R / O: reduced motion and the animations toggle off — every move is a cut, every drag still works ──
for (const [k, o] of [['r', { reduced: true }], ['o', { effectsOff: true }]]) {
  if (!want(k)) continue
  const label = k === 'r' ? 'reduced motion' : 'animations off'
  const { ctx, page, errors, state } = await open('/projects', o)
  const seen = await frames(page, `${k}1-push-${k === 'r' ? 'reduced' : 'effects-off'}`, () => page.getByText('Forecasting App', { exact: true }).first().click(), [0, 760], true)
  check(`${k}1 [${label}] the drill-in is a cut: no still copy, no slide, the page is there`, !seen.layer && path_(page) === `/projects/${P1}`, JSON.stringify(seen))
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(800)
  const w0 = state.writes.length
  await drag(page, page.locator(`#drag-${id(BALCONY)}`), page.locator('.app-sidebar').getByRole('link', { name: /^Someday( |$)/ }), {
    beforeUp: async () => {
      check(`${k}2 [${label}] the ghost is still there to show what's in hand, but it doesn't float`, (await page.locator('.kf-ghost').count()) === 1 && (await page.locator('.kf-ghost[data-motion]').count()) === 0)
    },
  })
  await settle(state)
  check(`${k}2 [${label}] the drop still files it; the ghost leaves at once`, lastRow(state, 'tasks', id(BALCONY), w0)?.someday === true && (await page.locator('.kf-ghost').count()) === 0)
  check(`${k} [${label}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── L / K: Effects 2l (the hold's bloom) and 2k (the list's edge) on a phone, by touch ──
const sessions = new WeakMap()
async function touch(page, type, x, y) {
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page))
  await sessions.get(page).send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
}
if (want('l')) {
  const { ctx, page, errors } = await open('/tasks?list=all', { view: phone })
  await page.locator(`#task-${id(TYRE)}`).scrollIntoViewIfNeeded()
  const r = await page.locator(`#task-${id(TYRE)}`).boundingBox()
  const x = r.x + r.width / 2, y = r.y + r.height / 2
  await touch(page, 'touchStart', x, y)
  await sleep(220)
  const midBloom = await page.locator(`#task-${id(TYRE)} .kf-press-bloom`).count()
  await shot(page, 'l1-hold-bloom-mid')
  await sleep(320)
  await shot(page, 'l1-hold-selected')
  await touch(page, 'touchEnd', x, y)
  await sleep(300)
  check('l1 a hold blooms under the finger while it counts, then selects the row', midBloom === 1 && (await page.locator('.kf-select-circle[data-on]').count()) === 1)
  // A touch that turns into a scroll drains the bloom and selects nothing.
  await page.locator('.kf-toast-act').count()
  check('l no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('k')) {
  const { ctx, page, errors } = await open('/tasks?list=someday', { view: phone })
  await page.locator('.app-main-content').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await sleep(400)
  const x = 200, y0 = 600
  await touch(page, 'touchStart', x, y0)
  for (let i = 1; i <= 12; i++) {
    await touch(page, 'touchMove', x, y0 - i * 10)
    await sleep(16)
  }
  const pulled = await page.locator('.kf-route').evaluate((el) => el.style.transform)
  await shot(page, 'k1-pull-past-end')
  await touch(page, 'touchEnd', x, y0 - 120)
  await sleep(140)
  await shot(page, 'k1-ease-back')
  await sleep(500)
  const after = await page.locator('.kf-route').evaluate((el) => el.style.transform)
  const px = Number(/translateY\((-?[\d.]+)px\)/.exec(pulled)?.[1] ?? 0)
  check('k1 dragged 120px past the end, the list follows at a third, capped at 40px, and eases back to rest', px < -30 && px >= -40 && after === '', `${pulled} → ${after || 'none'}`)
  check('k no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
