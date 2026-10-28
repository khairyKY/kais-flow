// motion-pages (lane A2, 2026-10-28): Routines, Focus, Chat, the rituals, Weekly Review, Projects' plant,
// Import/Notebook/Library swaps, the Tour, auth and the onboarding hand-off — on the REAL app
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
const BASE = process.argv[3] ?? 'http://localhost:5327'
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
const rid = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ALLDAYS = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const routine = (n, name, over = {}) => ({ id: rid(n), user_id: UID, name, description: null, time_of_day: 'morning', clock_time: null, cadence: ALLDAYS, challenge_start: null, challenge_end: null, active: true, steps: [], step_minutes: null, domain_id: null, goal_days: null, plant: 'vine', created_at: CREATED, updated_at: CREATED, ...over })
const WALK = 1, READ = 2
const ROUTINES = [routine(WALK, 'Morning walk', { steps: ['Shoes on', 'Round the block'], step_minutes: [2, 15] }), routine(READ, 'Read 10 pages')]
// Walk: done the 6 days before today → ticking today makes 7, crossing sprouting → flowering (vineStage).
const day = (d) => `2026-10-${String(d).padStart(2, '0')}`
const COMPLETIONS = [6, 7, 8, 9, 10, 11].map((d, i) => ({ id: `f1000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: UID, routine_id: rid(WALK), completed_on: day(d), created_at: CREATED }))
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: INBOX, projects: PROJECTS, domains: DOMAINS, areas: AREAS, people: PEOPLE, app_settings: [SETTINGS], routines: ROUTINES, routine_completions: COMPLETIONS })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, sess, uid, at, effects, seeds]) => {
    if (sessionStorage.getItem('kf-seeded')) return // once per tab: a reload keeps what the page wrote
    sessionStorage.setItem('kf-seeded', '1')
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    if (sess) localStorage.setItem('sb-127-auth-token', sess)
    for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
    if (effects === '0') localStorage.setItem('kf_effects', '0')
  }, [o.theme ?? 'day', o.signedOut ? null : JSON.stringify(session), UID, cairo('09:00').getTime(), o.effectsOff ? '0' : '1', o.seeds ?? {}])
  const state = { rows: o.tables ? o.tables(tables()) : tables(), writes: [] }
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
  if (o.routes) await o.routes(ctx) // after the mock, so these win (Playwright: last route first)
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (process.env.DEBUG) page.on('console', (m) => m.text().startsWith('[dbg]') && console.log(m.text()))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {})
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

/** CSS animation names running on an element and its subtree (pseudo-elements included). */
const cssAnims = (loc) => loc.first().evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => 'animationName' in a).map((a) => a.animationName)).catch(() => [])
const css = (loc, prop) => loc.first().evaluate((el, p) => getComputedStyle(el)[p], prop).catch(() => null)
const height = (loc) => loc.first().evaluate((el) => el.getBoundingClientRect().height).catch(() => -1)
const has = (list, ...names) => names.every((n) => list.includes(n))
const decoOk = (mode, seen) => (mode === 'on' ? seen : !seen) // decorative: Effects on only

// ── R: Routines — R1 kit check + four beats, R2 plant cross-fade + all-tended bloom, T12 tally/counters,
// R13 stagger + lift, T8 steps fold, O1 StreakTrellis entrance on the token scrim ──
if (want('r')) {
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/routines', o)
    const walkBox = page.getByRole('checkbox', { name: 'Complete "Morning walk"' })
    check(`r1 [${mode}] R1 the routine check is the kit Checkbox`, (await walkBox.count()) === 1)
    const rows = page.locator('.kf-stagger-item.kf-lift')
    check(`r1 [${mode}] R13 routine rows carry the entry stagger + hover lift`, (await rows.count()) >= 2, `${await rows.count()} rows`)
    const walkRow = rows.filter({ hasText: 'Morning walk' }).first()
    const bar = page.locator('.kf-bar').first()
    const barBefore = await css(bar, 'transform')
    await walkBox.click()
    await sleep(70)
    const a = await cssAnims(walkRow)
    await shot(page, `r1-routine-tick-70ms-${mode}`)
    if (mode === 'on') check('r1 [on] R1 four beats: boxFill → checkPop, strikeGrow, rowDip', has(a, 'boxFill', 'checkPop', 'tr-strikeGrow', 'tr-rowDip'), a.join(','))
    else check(`r1 [${mode}] R1 no decorative beats`, !a.includes('tr-rowDip') && !a.includes('checkPop'), a.join(',') || 'none')
    check(`r1 [${mode}] R1 the box ends ticked`, (await walkBox.getAttribute('aria-checked')) === 'true')
    const stageIn = await page.locator('.kf-stage-in').count()
    const bloom = await page.locator('.kf-bloom-once').count()
    check(`r2 [${mode}] R2 the plant crossing a stage cross-fades (+ bloom), Effects on only`, decoOk(mode, stageIn > 0 && bloom > 0), `stage-in ${stageIn}, bloom ${bloom}`)
    const dur = await css(bar, 'transitionDuration')
    const barAfter = await css(bar, 'transform')
    check(`r3 [${mode}] T12 the tally bar eases its scaleX (${mode === 'reduced' ? 'collapsed' : '300ms'})`, barBefore !== barAfter && (mode === 'reduced' ? parseFloat(dur) < 0.01 : dur === '0.3s'), `${barBefore} → ${barAfter}, ${dur}`)
    // the streak counter in the ticked row, read at 70ms (its rise is 200ms)
    check(`r3 [${mode}] T12 a changed counter rises in (Effects on only)`, (await page.locator('.kf-num').count()) > 0 && decoOk(mode, a.includes('kfNumIn')), a.join(',') || 'none')
    await page.getByRole('checkbox', { name: 'Complete "Read 10 pages"' }).click()
    await sleep(80)
    const tended = await page.locator('[data-all-tended]').count()
    check(`r2 [${mode}] R2 the last routine of the day → one "all tended" bloom (Effects on only)`, decoOk(mode, tended === 1), `${tended}`)
    await shot(page, `r2-all-tended-${mode}`)
    await page.getByRole('button', { name: /2 steps/ }).first().click()
    await sleep(60)
    const fold = page.locator('.kf-collapse').first()
    const mid = await height(fold)
    await sleep(400)
    const full = await height(fold)
    check(`r4 [${mode}] T8 the steps fold ${mode === 'reduced' ? 'opens as a cut' : 'eases open'}`, mode === 'reduced' ? mid === full && full > 20 : mid > 0 && mid < full, `${mid} → ${full}`)
    await page.locator('[title="14-day trellis"]').first().click()
    await sleep(60)
    const scrim = page.locator('.kf-overlay-scrim')
    const bg = await css(scrim, 'backgroundColor')
    const enter = await cssAnims(scrim)
    check(`r5 [${mode}] StreakTrellis enters (kfScrimIn) on the token scrim`, bg === 'rgba(42, 36, 32, 0.36)' && (mode === 'reduced' || enter.includes('kfScrimIn')), `${bg} · ${enter.join(',')}`)
    check(`r [${mode}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── F: Focus — R4 continuous sweep, R3 round end bloom → break cross-fade, R3 paused dim + breathe,
// R5 garden fade in/out, T12 round dots ──
if (want('f')) {
  const sess = (over) => JSON.stringify({ mode: 'pomodoro', isRunning: true, secondsLeft: 5, stopwatchSeconds: 0, stopwatchStartIso: '', stopwatchStartStr: '', currentRound: 1, breakType: 'short', activeTask: null, pomodoroStartIso: null, savedAt: cairo('10:00').getTime(), ...over })
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/focus', { ...o, seeds: { kf_focus_session: sess({}) } })
    const lav = page.locator('circle[stroke="var(--acc-lavender)"]')
    const tr = await lav.first().evaluate((el) => el.style.transition).catch(() => 'missing')
    check(`f1 [${mode}] R4 the running ring sweeps continuously (Effects on only)`, decoOk(mode, /stroke-dashoffset 1s linear/.test(tr)), tr || 'none')
    const dots = await css(page.locator('.fp-modes span[style*="border-radius: 50%"]'), 'transitionProperty')
    check(`f1 [${mode}] T12 the round dots ease their fill`, /background-color/.test(dots ?? ''), dots)
    let bloomAt = -1
    let breakAt = -1
    const t0 = Date.now()
    while (Date.now() - t0 < 9000 && breakAt < 0) {
      if (bloomAt < 0 && (await page.locator('.fp-round-bloom').count())) {
        bloomAt = Date.now() - t0
        await shot(page, `f2-round-end-bloom-${mode}`)
      }
      if (await page.locator('.fp-break-in').count()) breakAt = Date.now() - t0
      await sleep(40)
    }
    await sleep(60)
    const breakAnim = await cssAnims(page.locator('.fp-break-in'))
    if (mode === 'on') check('f2 [on] R3 round end: the bloom plays, then (~600ms later) the break view cross-fades in', bloomAt >= 0 && breakAt - bloomAt >= 450 && breakAnim.includes('fpFadeIn'), `bloom ${bloomAt}ms, break ${breakAt}ms, ${breakAnim}`)
    else check(`f2 [${mode}] R3 round end goes straight to the break view (no bloom)`, bloomAt < 0 && breakAt >= 0, `bloom ${bloomAt}, break ${breakAt}`)
    await shot(page, `f2-break-${mode}`)
    await page.getByRole('button', { name: 'Skip break' }).click()
    await sleep(200)
    await page.getByRole('button', { name: /Start/ }).first().click()
    await sleep(1500)
    await page.getByRole('button', { name: /Pause/ }).first().click()
    await sleep(500)
    const ring = page.locator('svg.fp-ring')
    const pausedCls = await ring.first().evaluate((el) => el.classList.contains('is-paused')).catch(() => false)
    const op = parseFloat((await css(ring, 'opacity')) ?? '1')
    const breathe = await cssAnims(ring)
    check(`f3 [${mode}] R3 paused: the ring dims (~0.55)${mode === 'on' ? ' and breathes' : ''}`, pausedCls && op < 0.8 && decoOk(mode, breathe.includes('fpRingBreathe')), `op ${op}, ${breathe.join(',') || 'no anim'}`)
    await shot(page, `f3-paused-${mode}`)
    check(`f [${mode}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
    const g = await open('/focus', { ...o, seeds: { kf_focus_session: sess({ mode: 'garden', isRunning: false, secondsLeft: 900 }) } })
    const gin = [await css(g.page.locator('.fp-garden-in'), 'animationName')] // its 300ms fade has played by now: read the declared one
    check(`f4 [${mode}] R5 the garden fades in (Effects on only)`, (await g.page.locator('.fp-garden-in').count()) === 1 && decoOk(mode, gin.includes('fpFadeIn')), gin.join(',') || 'none')
    await g.page.getByText('Stay a while').click()
    await sleep(120)
    const leaving = await waapi(g.page.locator('.fp-garden-in'))
    await sleep(500)
    const back = (await g.page.locator('.fp-garden-in').count()) === 0 && (await g.page.locator('svg.fp-ring').count()) === 1
    check(`f4 [${mode}] R5 leaving the garden fades it (Effects on), then the timer is back`, decoOk(mode, leaving > 0) && back, `fade anims ${leaving}, back ${back}`)
    await g.ctx.close()
  }
}

// ── C: Chat — R6 opens at the bottom, pins on send, "↓ New" when scrolled up; R7 thinking dots; T11 arrivals ──
if (want('c')) {
  const history = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Message ${i + 1}: ${'a few words of the conversation '.repeat(3)}` })))
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/today', {
      ...o,
      seeds: { [`kf.chat.${UID}`]: history },
      routes: (c) => c.route('http://127.0.0.1:9/functions/**', async (r) => {
        await sleep(2500)
        await r.fulfill({ status: 500, body: 'nope' }).catch(() => {})
      }),
    })
    await page.getByRole('button', { name: 'Chat', exact: true }).first().click()
    await sleep(800)
    const list = page.locator('.kf-chat-list')
    const atEnd = () => list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 8).catch(() => false)
    check(`c1 [${mode}] R6 the chat opens at the bottom of the history`, await atEnd())
    const hist = await page.locator('.kf-chat-list .kf-row-in').count()
    check(`c1 [${mode}] T11 history bubbles don't replay an arrival`, hist === 0, `${hist}`)
    await list.evaluate((el) => (el.scrollTop = 0))
    await sleep(100)
    await page.getByPlaceholder('Ask about your day…').fill('Plan my afternoon')
    await page.keyboard.press('Enter')
    await sleep(mode === 'on' ? 700 : 150)
    check(`c2 [${mode}] R6 a send pins the list to the bottom (${mode === 'on' ? 'smooth' : 'instant'})`, await atEnd())
    const sent = await page.locator('.kf-chat-list .kf-row-in').count()
    check(`c2 [${mode}] T11 the new bubbles breathe in (.kf-row-in)`, sent >= 2, `${sent}`)
    const dots = await cssAnims(page.locator('.kf-chat-dots'))
    check(`c3 [${mode}] R7 thinking shows three dots, twinkling with Effects on only`, (await page.locator('.kf-chat-dots > i').count()) === 3 && decoOk(mode, dots.filter((n) => n === 'twinkle').length === 3), dots.join(',') || 'still')
    await shot(page, `c3-thinking-${mode}`)
    await list.evaluate((el) => (el.scrollTop = 0))
    await sleep(2600)
    const pill = page.locator('.kf-chat-new')
    const pillShown = await pill.count()
    await shot(page, `c4-new-pill-${mode}`)
    check(`c4 [${mode}] R6 scrolled up when the reply lands → a "↓ New" pill, not a yank`, pillShown === 1 && !(await atEnd()), `pill ${pillShown}`)
    if (pillShown) {
      await pill.click()
      await sleep(mode === 'on' ? 800 : 150)
      check(`c4 [${mode}] R6 the pill takes you to the bottom and goes`, (await atEnd()) && (await pill.count()) === 0)
    }
    check(`c [${mode}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── W: rituals — R8 finish beat, D10 dusk veil, T6 ritual inbox rows leave, T8 FoldSection ──
if (want('w')) {
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/routines', o)
    await page.getByRole('button', { name: /Evening ritual/ }).click()
    await sleep(900)
    await page.getByRole('button', { name: 'Close the day' }).click()
    await sleep(60)
    const leaving = await page.locator('.rt-leaving').count()
    await sleep(300)
    const sum = page.locator('.rt-summary')
    // declared animations (the 200ms fade is over by now; the 600ms sprout/480ms ink aren't)
    const img = [await css(sum.locator('> img'), 'animationName')]
    const title = [await css(sum.locator('> .rt-summary-title'), 'animationName')]
    check(`w1 [${mode}] R8 the content fades out (.rt-leaving), then the finish screen`, (mode === 'reduced' || leaving === 1) && (await sum.count()) === 1, `leaving ${leaving}`)
    if (mode === 'on') check('w1 [on] R8 the payoff: clover rises (rtSprout), title soaks in (rtInk)', img.includes('rtSprout') && title.includes('rtInk'), `${img} | ${title}`)
    else if (mode === 'off') check('w1 [off] R8 Effects off: a plain fade, no sprout/ink', img.includes('rtFadeIn') && !img.includes('rtSprout') && !title.includes('rtInk'), `${img} | ${title}`)
    await shot(page, `w1-finish-300ms-${mode}`)
    await sleep(2000)
    const veil = page.locator('[data-dusk]')
    const vop = (await veil.count()) ? parseFloat(await css(veil, 'opacity')) : 0
    check(`w2 [${mode}] D10 the dusk veil settles over the evening close (Effects on only)`, decoOk(mode, vop > 0.5), `veil opacity ${vop}`)
    await shot(page, `w2-dusk-veil-2300ms-${mode}`)
    check(`w [${mode}] evening: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()

    const m = await open('/routines', o)
    await m.page.getByRole('button', { name: /Morning ritual/ }).click()
    await sleep(900)
    const inboxRows = m.page.locator('.rt-inbox')
    const n0 = await inboxRows.count()
    await inboxRows.first().getByRole('button', { name: 'Dismiss' }).click()
    await sleep(80)
    const exit = await waapi(inboxRows.first())
    await sleep(600)
    const n1 = await inboxRows.count()
    check(`w3 [${mode}] T6 a dismissed ritual inbox row ${mode === 'reduced' ? 'leaves (cut)' : 'slides out and closes its gap'}`, n0 > 0 && n1 === n0 - 1 && (mode === 'reduced' ? exit <= 0 : exit > 0), `${n0}→${n1}, exit anims ${exit}`)
    for (let i = 0; i < n1; i++) {
      await inboxRows.first().getByRole('button', { name: 'Dismiss' }).click()
      await sleep(600)
    }
    const zero = m.page.locator('.kf-collapse', { hasText: 'Inbox zero' })
    const zMid = await height(zero)
    await sleep(400)
    const zFull = await height(zero)
    check(`w4 [${mode}] T8 the emptied section folds to its quiet line`, (await zero.first().getAttribute('data-open').catch(() => null)) !== null && zFull > 10, `${zMid} → ${zFull}`)
    await shot(m.page, `w4-inbox-zero-${mode}`)
    await m.page.getByRole('button', { name: 'Start the day' }).click()
    await sleep(450)
    const mimg = await cssAnims(m.page.locator('.rt-summary > img'))
    check(`w5 [${mode}] R8 "The day has a shape." with the payoff beat (sprout on Effects only)`, (await m.page.getByText('The day has a shape.').count()) === 1 && decoOk(mode, mimg.includes('rtSprout')), mimg.join(',') || 'none')
    await shot(m.page, `w5-morning-finish-${mode}`)
    check(`w [${mode}] morning: no page errors`, m.errors.length === 0, m.errors.join(' | '))
    await m.ctx.close()
  }
}

// ── V: Weekly Review — R9 flourish timing, once per week, phones too; T8 season fold; close-week bloom ──
if (want('v')) {
  for (const [mode, o] of MODES) {
    for (const view of mode === 'on' ? [desktop, phone] : [desktop]) {
      const vname = view === phone ? 'phone' : 'desktop'
      const { ctx, page, errors } = await open('/weekly-review', { ...o, view, tables: (t) => ({ ...t, domains: [] }) })
      const svg = page.locator('svg[data-flourish]')
      const state = await svg.first().getAttribute('data-flourish').catch(() => null)
      const delays = await svg.locator('circle').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationDelay)).catch(() => [])
      if (mode === 'on') check(`v1 [on/${vname}] R9 the flourish draws, dots 0.5s apart (the last lands with the 2.2s line)`, state === 'draw' && delays.join() === '0s,0.5s,1s,1.5s,2s', `${state} · ${delays.join(' ')}`)
      else check(`v1 [${mode}] R9 no flourish (decorative)`, (await svg.count()) === 0)
      await shot(page, `v1-flourish-${vname}-${mode}`)
      if (mode === 'on') {
        await page.reload({ waitUntil: 'networkidle' })
        await sleep(1200)
        check(`v2 [on/${vname}] R9 once per week: a revisit shows it already drawn`, (await svg.first().getAttribute('data-flourish').catch(() => null)) === 'still')
      }
      if (view === desktop) {
        await page.getByRole('button', { name: /The season so far/ }).click()
        await sleep(60)
        const fold = page.locator('.kf-collapse[data-open]').last()
        const mid = await height(fold)
        await sleep(400)
        const full = await height(fold)
        check(`v3 [${mode}] T8 the season ${mode === 'reduced' ? 'opens as a cut' : 'folds open'}`, mode === 'reduced' ? mid === full && full > 40 : mid >= 0 && mid < full, `${mid} → ${full}`)
        const close = page.getByRole('button', { name: /Close the week/ })
        if (await close.isEnabled().catch(() => false)) {
          await close.click()
          await sleep(200)
          const bl = await page.locator('[data-week-bloom]').count()
          check(`v4 [${mode}] R9 closing the week blooms the fern once (Effects on only)`, decoOk(mode, bl === 1), `${bl}`)
          await shot(page, `v4-week-closed-${mode}`)
        }
      }
      check(`v [${mode}/${vname}] no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}

// ── O: lateral swaps — O10 Notebook day slide, Library phone list ↔ reader, Import step fade ──
if (want('o')) {
  const NOTE = 'e2000000-0000-4000-8000-000000000001'
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/notebook', o)
    check(`o1 [${mode}] O10 the Notebook page's first paint doesn't slide`, (await page.locator('.nb-day-in').count()) === 0)
    await page.getByRole('button', { name: 'Tomorrow', exact: true }).first().click()
    await sleep(40)
    const a = await cssAnims(page.locator('.nb-day-in.is-next'))
    check(`o1 [${mode}] O10 Tomorrow slides in from the right (Effects on) / fades (off)`, mode === 'on' ? a.includes('nbDayNext') : mode === 'off' ? a.includes('nbDayFade') : (await page.locator('.nb-day-in.is-next').count()) === 1, a.join(',') || 'none')
    await shot(page, `o1-notebook-tomorrow-40ms-${mode}`)
    await ctx.close()
    const l = await open('/library?tab=notes', { ...o, view: phone, tables: (t) => ({ ...t, notes: [{ id: NOTE, user_id: UID, title: 'Reading list', body: 'Dune, then the Left Hand of Darkness.', tags: [], domain_id: null, book_id: null, created_at: CREATED, updated_at: CREATED }] }) })
    check(`o2 [${mode}] O10 the Library list doesn't slide on first paint`, (await l.page.locator('.kf-lib-moved').count()) === 0)
    await l.page.getByText('Reading list').first().click()
    await sleep(40)
    const ra = await cssAnims(l.page.locator('.kf-lib-reader'))
    check(`o2 [${mode}] O10 the reader comes in from the right (Effects on) / fades (off)`, mode === 'on' ? ra.includes('kfLibIn') : mode === 'off' ? ra.includes('kfSwapIn') : (await l.page.locator('.kf-lib-reader').count()) === 1, ra.join(',') || 'none')
    await l.page.getByText('Back to list').first().click()
    await sleep(40)
    const la = await cssAnims(l.page.locator('.kf-lib-list'))
    check(`o2 [${mode}] O10 back, the list returns from the left (Effects on) / fades (off)`, mode === 'on' ? la.includes('kfLibBack') : mode === 'off' ? la.includes('kfSwapIn') : true, la.join(',') || 'none')
    await shot(l.page, `o2-library-back-${mode}`)
    await l.ctx.close()
    const im = await open('/settings/import', o)
    check(`o3 [${mode}] O10 Import's step card is keyed for its fade`, (await im.page.locator('.kf-swap-in').count()) >= 1)
    check(`o [${mode}] no page errors`, errors.length + l.errors.length + im.errors.length === 0, [...errors, ...l.errors, ...im.errors].join(' | '))
    await im.ctx.close()
  }
}

// ── T: the Tour — R11 the spotlight glides between notes ──
if (want('t')) {
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/today', { ...o, seeds: { [`kf-tour-pending:${UID}`]: '1' } })
    await page.locator('.kf-tour-note').waitFor({ timeout: 6000 }).catch(() => {})
    await page.locator('.kf-tour-next').click()
    let blank = 0
    let glide = -1
    for (let i = 0; i < 12; i++) {
      await sleep(25)
      if (!(await page.locator('.kf-tour-spot, .kf-tour-dim').count())) blank++
      if (glide < 0 && (await page.locator('.kf-tour-spot.is-glide').count())) glide = await waapi(page.locator('.kf-tour-spot.is-glide').first())
    }
    check(`t1 [${mode}] R11 the dim never blinks out between notes`, blank === 0, `${blank} blank frames`)
    check(`t1 [${mode}] R11 the next note's spotlight glides (Effects on) instead of re-fading`, (await page.locator('.kf-tour-spot.is-glide').count()) === 1 && decoOk(mode, glide > 0), `glide anims ${glide}`)
    await shot(page, `t1-tour-step2-${mode}`)
    check(`t [${mode}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── A: auth shake + error fade; the onboarding "planted" hand-off ──
if (want('a')) {
  for (const [mode, o] of MODES) {
    const { ctx, page, errors } = await open('/sign-in', {
      ...o,
      signedOut: true,
      routes: (c) => c.route('http://127.0.0.1:9/auth/v1/token**', (r) => r.fulfill({ status: 400, json: { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' } })),
    })
    // no remembered email → it opens on sign-up; its "Sign in" link switches to the sign-in form
    if (await page.getByText('Create your account').count()) await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await sleep(200)
    await page.getByLabel('Email').fill('demo@example.test')
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    await page.locator('.kf-swap-in').first().waitFor({ timeout: 4000 }).catch(() => {})
    const shake = await waapi(page.locator('input[type="password"]').locator('xpath=ancestor::div[contains(@class,"fr-box")]').first())
    const card = [await css(page.locator('.kf-swap-in'), 'animationName')] // declared (its 160ms may be over)
    check(`a1 [${mode}] R12 a wrong password shakes the field (Effects on only)`, decoOk(mode, shake > 0), `${shake}`)
    check(`a1 [${mode}] R12 the error card fades in`, (await page.locator('.kf-swap-in').count()) === 1 && card.includes('kfSwapIn'), card.join(','))
    await shot(page, `a1-signin-refused-${mode}`)
    await ctx.close()
    const t = await open('/today', o)
    await t.page.evaluate(() => (document.documentElement.dataset.planted = ''))
    await go(t.page, '/inbox')
    await sleep(300)
    await go(t.page, '/today')
    await sleep(120)
    const slots = await t.page.locator('[data-top3-slot]').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName + '@' + getComputedStyle(e).animationDelay))
    const goalBloom = await t.page.locator('[data-top3-slot]:has(.kf-goal-row, .tp-goal)').first().evaluate((el) => getComputedStyle(el, '::after').animationName).catch(() => 'no goal slot')
    check(`a2 [${mode}] R12 planted hand-off: the Top 3 lines rise in turn and the goal blooms (Effects on only)`, decoOk(mode, slots.length >= 3 && slots[0].startsWith('kfPlantedIn') && slots[2].endsWith('0.4s') && goalBloom === 'kfBloomGlow'), `${slots.join(' ')} · ${goalBloom}`)
    await shot(t.page, `a2-planted-120ms-${mode}`)
    check(`a [${mode}] no page errors`, errors.length + t.errors.length === 0, [...errors, ...t.errors].join(' | '))
    await t.ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`
${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
