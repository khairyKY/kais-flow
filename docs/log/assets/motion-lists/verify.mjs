// motion-lists (lane A1, 2026-10-28): the shared motion helpers and the list surfaces, on the REAL app
// against a MOCKED backend (the motion/verify.mjs recipe: dev server --mode mock, a made-up session,
// Playwright answers every REST call and applies writes to the mock rows).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=h,c,... to pick sections)
// Every item is checked with Effects on, Effects off and OS reduced motion where the rule differs
// (RM2: functional motion plays with Effects off and is cut under reduced motion; decorative motion
// plays only with Effects on). The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5326'
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
  ...Array.from({ length: 60 }, (_, i) => task(100 + i, `Backlog item ${i + 1}`)),
  ...Array.from({ length: 3 }, (_, i) => task(200 + i, `Finished on Saturday ${i + 1}`, { status: 'done', completed_at: iso('18:00', 10) })),
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
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
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

// JPEG: the paper grain makes PNGs heavy; frames don't need lossless.
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 })
const MODES = [
  ['on', {}],
  ['off', { effectsOff: true }],
  ['reduced', { reduced: true }],
]
/** Client-side navigation (a route ENTRY, not the cold boot that data-initial stills). */
const go = (page, url) => page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')) }, url)
const row = (page, n) => page.locator(`#task-${id(n)}`)
const exists = async (loc) => (await loc.count()) > 0
/** The row is still drawn OPEN (its checkbox is there) — a done row has the filled ✓ instead. */
const openRow = (page, n) => exists(row(page, n).locator('.kf-checkbox'))
/** The running Web Animations (not CSS) on an element: name-less keyframe effects. */
const waapi = (loc) => loc.evaluate((el) => el.getAnimations().filter((a) => !('animationName' in a) && !('transitionProperty' in a)).length).catch(() => -1)

// ── H: the shared helpers — T1 stagger cap, T2/T5 completing rows (Tasks), T8 Collapse (DoneView) ──
if (want('h')) {
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/today', o)
    // T1: a route entry onto 60+ rows.
    const t0 = Date.now()
    await go(page, '/tasks?list=all')
    await page.waitForFunction(() => document.querySelectorAll('[id^="task-"]').length > 40, null, { timeout: 5000 }).catch(() => {})
    const delays = await page.locator('.kf-stagger-item').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).animationDelay) * 1000))
    const wait = 2500 - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
    const hidden = await page.locator('[id^="task-"]').evaluateAll((els) => els.filter((e) => {
      let n = e
      while (n && n !== document.body) { if (parseFloat(getComputedStyle(n).opacity) < 0.99) return true; n = n.parentElement }
      return false
    }).length)
    if (mode === 'on') {
      check(`h1 [${mode}] T1 the entry stagger caps at row 8: the longest wait is 480ms over ${delays.length} rows`, delays.length > 40 && Math.max(...delays) <= 480, `max ${Math.max(...delays)}ms`)
    } else {
      check(`h1 [${mode}] T1 no entry stagger (decorative)`, delays.length === 0, `${delays.length} staggered`)
    }
    check(`h1 [${mode}] T1 every row is visible 2.5s after entry`, hidden === 0, `${hidden} still hidden`)
    await shot(page, `h1-tasks-entry-2500ms-${mode}`)
    // Later arrivals: Show N more, after the entry window.
    const more = page.getByRole('button', { name: /^Show \d+ more$/ }).first()
    if (await exists(more)) {
      await more.click()
      await sleep(60)
      const late = await row(page, 159).evaluate((el) => {
        const it = el.closest('.kf-stagger-item')
        return it ? parseFloat(getComputedStyle(it).animationDelay) * 1000 : 0
      }).catch(() => -1)
      check(`h1 [${mode}] T1 "Show more" rows arrive with no delay`, late === 0, `${late}ms`)
    }

    // T2/T5 on Tasks: tick holds the row for the check, then it leaves; Undo inside the window eases it back.
    await go(page, '/tasks?list=today')
    await sleep(900)
    const box = (n) => row(page, n).locator('.kf-checkbox').first()
    await box(TYRE).click()
    await sleep(250)
    const held = await openRow(page, TYRE)
    await shot(page, `h2-tasks-tick-250ms-${mode}`)
    await sleep(1400)
    const gone = !(await openRow(page, TYRE))
    if (mode === 'reduced' || mode === 'off') {
      check(`h2 [${mode}] T2 the ticked row leaves the open rows (no grace without Effects; unchanged)`, !held && gone, `held=${held} gone=${gone}`)
    } else {
      check(`h2 [${mode}] T2 the ticked row holds its place for the check, then slides out`, held && gone, `held=${held} gone=${gone}`)
    }
    if (mode === 'on') {
      await box(REVIEW).click()
      await sleep(820) // into the exit (grace 650 + slide)
      const mid = await waapi(row(page, REVIEW))
      await page.getByRole('button', { name: 'Undo' }).last().click()
      await sleep(80)
      const easing = await waapi(row(page, REVIEW))
      await shot(page, `h3-tasks-undo-easing-back-${mode}`)
      await sleep(700)
      const r = row(page, REVIEW)
      const back = await r.evaluate((el) => ({ h: el.offsetHeight, op: getComputedStyle(el).opacity, checking: !!el.querySelector('.tr-checking') || el.classList.contains('tr-checking'), checked: el.querySelector('.kf-checkbox')?.getAttribute('aria-checked') })).catch(() => null)
      check('h3 [on] T5 Undo mid-exit: the exit is reversed (an easing-back animation runs, not a snap)', mid > 0 && easing > 0, `exit anims ${mid}, back anims ${easing}`)
      check('h3 [on] T5 …and the row stands back open, unticked, full height', back && back.h > 20 && back.op === '1' && !back.checking && back.checked !== 'true', JSON.stringify(back))
    }

    // T8: DoneView "Earlier this week" through Collapse.
    await go(page, '/tasks?list=done')
    await sleep(900)
    const head = page.getByText('Earlier this week', { exact: true }).first()
    const fold = page.locator('.kf-collapse').first()
    await head.click()
    await sleep(60)
    const midOpen = await fold.evaluate((el) => el.getBoundingClientRect().height)
    await sleep(400)
    const fullOpen = await fold.evaluate((el) => el.getBoundingClientRect().height)
    await shot(page, `h4-done-earlier-open-${mode}`)
    await head.click()
    await sleep(60)
    const midShut = await fold.evaluate((el) => el.getBoundingClientRect().height)
    const stillMounted = await page.getByText('Finished on Saturday 1').count()
    await sleep(400)
    const shut = await fold.evaluate((el) => el.getBoundingClientRect().height)
    const unmounted = (await page.getByText('Finished on Saturday 1').count()) === 0
    if (mode === 'reduced') {
      check(`h4 [${mode}] T8 Collapse is a cut under reduced motion`, midOpen === fullOpen && fullOpen > 60 && shut === 0 && unmounted, `${midOpen}/${fullOpen} → ${shut}`)
    } else {
      check(`h4 [${mode}] T8 Collapse eases open (part-way at 60ms) and shut (children kept while it folds, then unmounted)`, midOpen > 0 && midOpen < fullOpen && midShut > 0 && midShut < fullOpen && stillMounted > 0 && shut === 0 && unmounted, `open ${midOpen}→${fullOpen}, shut ${midShut}→${shut}`)
    }
    check(`h [${mode}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── SECTIONS-END ──
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
