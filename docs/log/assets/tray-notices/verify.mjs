// The three notice kinds Tray and Notifications.dc.html drew last (12h–12k): Paper capture ready,
// Birthday, Sync problem — on the REAL app against a MOCKED backend (the tray-notify / cal-rail-drop
// recipe: dev server in `--mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST and function call and records every write). The Windows
// app is a stub `window.__TAURI_INTERNALS__` recording each tray.rs command (notify_local = a toast).
// The drawing's day: Saturday 3 Oct 2026, Cairo (UTC+3) — Omar's birthday.
//   node verify.mjs <outDir> [baseUrl] [designFramesDir]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5254'
const DESIGN = process.argv[4]
const PW = 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 3, month = 9) => {
  const [h, m, s = 0] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month, day, h - 3, m, s))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const FIRST = iso('09:00', 12, 6)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: FIRST, updated_at: FIRST, ...over,
})
const TYRE = 5
const TASKS = [
  task(1, 'GCI homework 1 — NumPy', { top3: true }),
  task(2, 'Do GCI lecture 2’s survey', { top3: true, created_at: iso('09:00', 1) }),
  task(3, 'Skim OS lectures 1 + 2', { top3: true, created_at: iso('09:00', 1) }),
  task(4, 'Judge test Kai’s Flow', { due_at: iso('09:00'), created_at: iso('09:00', 1) }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:50'), created_at: iso('09:00', 1) }),
]
const OMAR = 'c0000000-0000-4000-8000-000000000001'
const PEOPLE = [
  { id: OMAR, user_id: UID, name: 'Omar', facts: [{ id: 'f1', label: 'Birthday', value: 'October 3', date: '10-03', recurs: true }], domain_id: null, created_at: FIRST, updated_at: FIRST },
  { id: 'c0000000-0000-4000-8000-000000000002', user_id: UID, name: 'Salma', facts: [{ id: 'f2', label: 'Birthday', value: 'May 9' }], domain_id: null, created_at: FIRST, updated_at: FIRST },
]
const INTERACTIONS = [
  { id: 'd0000000-0000-4000-8000-000000000001', user_id: UID, person_id: OMAR, summary: 'Coffee', occurred_at: iso('18:00', 21, 8), created_at: FIRST, updated_at: FIRST },
  { id: 'd0000000-0000-4000-8000-000000000002', user_id: UID, person_id: OMAR, summary: 'Call', occurred_at: iso('12:00', 2, 8), created_at: FIRST, updated_at: FIRST },
]
const CID = 'e1000000-0000-4000-8000-000000000001'
const line = (text, confidence, type = 'task') => ({ text, type, when: null, project: null, confidence, box: null, page: 0 })
const LINES = [
  line('Read chapter 4 before Thursday', 0.95), line('Ask about the lab grading', 0.9), line('Process scheduling — FCFS vs SJF', 0.9, 'note'),
  line('Quiz on Sunday', 0.85, 'event'), line('Email the TA', 0.8), line('Bring the old slides?', 0.6), line('Deadlock — four conditions', 0.4, 'note'),
]
const capture = (over = {}) => ({
  id: CID, user_id: UID, storage_paths: [`${UID}/${CID}/0.jpg`], pages: 1, pages_read: 0, status: 'reading', error: null, title: null, items: [],
  reviewed_at: null, expires_at: iso('09:00', 10), photos_deleted_at: null, created_at: iso('09:40'), updated_at: iso('09:40'), ...over,
})
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: FIRST, updated_at: FIRST }
const log = (n, event_type, payload, at, entity_type = 'notification', entity_id = `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`) =>
  ({ id: `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: at })
// 12j's list, in its order: today (reminder, page read, birthday, digest), yesterday (nudge, sync).
const HISTORY = [
  log(1, 'task.reminder_sent', { title: 'Call the tyre supplier', notice: { title: 'Call the tyre supplier · in 10 min', body: '09:50 · Car' } }, iso('09:40'), 'task', id(TYRE)),
  log(2, 'notify.paper_ready', { title: 'Your page is read — 7 things', body: 'From “OS lecture 3”. 2 need a quick look.', capture_id: CID }, iso('09:53')),
  log(3, 'notify.birthday', { title: 'Omar’s birthday is today', body: 'Last spoke 12 days ago.', person_id: OMAR }, iso('08:00')),
  log(4, 'notify.morning_digest', { title: 'Good morning — 3 to tend today', body: '✶ GCI homework 1 — NumPy, then the lecture 2 survey and OS lectures 1 + 2.' }, iso('07:30')),
  log(5, 'notify.evening_nudge', { title: 'The garden’s ready to close', body: '4 done · 2 left' }, iso('21:30', 2)),
  log(6, 'notify.sync_problem', { title: '2 changes are waiting to sync', body: 'They’re safe on this device. We’ll keep trying.' }, iso('18:12', 2)),
]
function tables(s) {
  return {
    tasks: TASKS, calendar_events: [], projects: [], routines: [], routine_completions: [], inbox_items: [], domains: [], areas: [],
    people: PEOPLE, interactions: INTERACTIONS, captures: s.captures ?? [],
    app_settings: [{ ...SETTINGS, ...(s.settings ?? {}) }],
    activity_log: s.history ?? HISTORY,
    push_subscriptions: [],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const FLYOUT = { viewport: { width: 340, height: 460 } }
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function app(s = {}, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESKTOP), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, tauri, away]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-whats-new:00000000-0000-4000-8000-00000000d3e0', JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 })) // no "Updated to …" toast over the screenshots
    if (away) document.hasFocus = () => false // the window is in the tray / behind another app
    if (tauri) {
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          window.__tauriCalls.push({ cmd, args: args ?? null })
          if (cmd === 'autostart_get') return false
          return null
        },
      }
    }
  }, [o.theme ?? 'day', JSON.stringify(session), !!o.tauri, !!o.away])
  const state = { rows: tables(s), writes: [], fn: [], reads: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice('/functions/v1/'.length)
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.fn.push({ name, body })
      if (name === 'capture-image') return r.fulfill({ json: { status: 'done', pages_read: 1, title: 'OS lecture 3', items: LINES } })
      return r.fulfill({ status: 500, json: { error: 'mock' } })
    }
    if (url.pathname.startsWith('/storage/v1/')) return r.fulfill({ json: [] })
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    state.reads.push(table)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const errors = []
  async function open(route, view, at = '09:55') {
    const page = await ctx.newPage()
    if (view) await page.setViewportSize(view.viewport)
    await page.clock.install({ time: cairo(at) })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await sleep(1200)
    return page
  }
  return { ctx, state, errors, open }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const calls = (page, cmd) => page.evaluate((c) => (window.__tauriCalls ?? []).filter((x) => !c || x.cmd === c), cmd)
const toasts = async (page) => (await calls(page, 'notify_local')).map((c) => c.args)
const writesTo = (state, table) => state.writes.filter((w) => w.table === table).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))

// ── 12j · the history: the three new rows, as drawn, with working buttons ──
if (want('history')) for (const [view, theme] of [[DESKTOP, 'day'], [PHONE, 'night']]) {
  const tag = view === PHONE ? 'phone-night' : 'desktop-day'
  const { ctx, state, errors, open } = await app({ captures: [capture({ status: 'done', pages_read: 1, title: 'OS lecture 3', items: LINES })] }, { theme })
  const page = await open('/activity', view)
  await page.locator('.afilter', { hasText: 'Notifications' }).click()
  await sleep(400)
  const rows = (await page.locator('.aitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
  const has = (s) => rows.some((r) => r.includes(s))
  check(`12j ${tag} six notices, the three new ones among them`, rows.length === 6 && has('Your page is read — 7 things') && has('From “OS lecture 3”. 2 need a quick look.') && has('Omar’s birthday is today') && has('Last spoke 12 days ago.') && has('2 changes are waiting to sync') && has('They’re safe on this device. We’ll keep trying.'), JSON.stringify(rows).slice(0, 400))
  const buttons = (await page.locator('.anotice').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
  check(`12j ${tag} buttons: Review · Open Omar · Open (sync)`, buttons.includes('Review') && buttons.includes('Open Omar') && buttons.filter((b) => b === 'Open').length === 1, JSON.stringify(buttons))
  // glyph discs as drawn: camera on hydrangea, people on blossom, cloud-off on hydrangea
  const discs = await page.locator('.aitem').evaluateAll((items) => items.map((el) => {
    const disc = el.querySelector('span[style*="border-radius: 50%"]')
    return { text: el.innerText.split('\n')[0], bg: disc?.getAttribute('style') ?? '', svg: disc?.querySelector('svg')?.innerHTML.slice(0, 40) ?? '' }
  }))
  const disc = (t) => discs.find((d) => d.text.includes(t)) ?? {}
  check(`12j ${tag} glyphs: camera/hydrangea, people/blossom, offline/hydrangea`,
    /block-hydrangea/.test(disc('Your page is read').bg) && /block-blossom/.test(disc('birthday').bg) && /block-hydrangea/.test(disc('waiting to sync').bg),
    JSON.stringify(discs.map((d) => [d.text.slice(0, 20), (d.bg.match(/var\(--[a-z-]+\)/g) ?? []).join(' ')])))
  await shot(page, `12j-history-${tag}`)
  // The page scrolls inside the shell, not the document: a second shot for yesterday's rows (the sync one).
  await page.locator('.aitem', { hasText: '2 changes are waiting to sync' }).evaluate((el) => el.scrollIntoView({ block: 'end' }))
  await sleep(200)
  await shot(page, `12j-history-yesterday-${tag}`)
  await page.locator('.anotice button', { hasText: 'Review' }).click()
  await sleep(1200)
  check(`12j ${tag} Review → the Inbox with that page's results open`, new URL(page.url()).pathname === '/inbox' && (await page.getByText('Read chapter 4 before Thursday').count()) >= 1, page.url())
  await shot(page, `12j-review-results-${tag}`)
  await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' })
  await sleep(800)
  await page.locator('.afilter', { hasText: 'Notifications' }).click()
  await sleep(300)
  await page.locator('.anotice button', { hasText: 'Open Omar' }).click()
  await sleep(800)
  check(`12j ${tag} Open Omar → his page`, new URL(page.url()).pathname === `/people/${OMAR}`, page.url())
  check(`12j ${tag} no writes from looking`, writesTo(state, 'captures').length === 0)
  check(`12j ${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 12i · Settings → Notifications: the three new rows, Birthday drawn off ──
if (want('settings')) for (const [view, theme, tauri] of [[DESKTOP, 'day', true], [PHONE, 'night', false]]) {
  const tag = view === PHONE ? 'phone-night' : 'desktop-day'
  const { ctx, state, errors, open } = await app({ settings: { paper_ready_on: true, birthday_on: false, sync_problem_on: true } }, { theme, tauri })
  const page = await open('/settings', view)
  await page.getByRole('button', { name: 'Send a test notification' }).scrollIntoViewIfNeeded()
  const row = (label) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last()
  const sw = (label) => row(label).locator('[role="switch"]')
  const kinds = ['Paper capture ready', 'Birthday', 'Sync problem']
  check(`12i ${tag} the three kinds have a switch`, (await Promise.all(kinds.map((k) => sw(k).count()))).every((n) => n === 1))
  const helps = await Promise.all(kinds.map((k) => row(k).innerText().then((t) => t.replace(/\s+/g, ' '))))
  check(`12i ${tag} Captures · silent / People · silent / Sync · silent`, helps[0].includes('Captures · silent') && helps[1].includes('People · silent') && helps[2].includes('Sync · silent'), JSON.stringify(helps))
  const states = await Promise.all(kinds.map((k) => sw(k).getAttribute('aria-checked')))
  check(`12i ${tag} on · off · on, as drawn`, JSON.stringify(states) === JSON.stringify(['true', 'false', 'true']), JSON.stringify(states))
  check(`12i ${tag} order: … Focus done, Paper capture ready, Birthday, Sync problem`, await page.evaluate(() => {
    const t = document.body.innerText
    const at = (s) => t.indexOf(s)
    return at('Focus done') < at('Paper capture ready') && at('Paper capture ready') < at('Birthday') && at('Birthday') < at('Sync problem')
  }))
  await page.getByText('Calm by default.', { exact: false }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(200)
  await shot(page, `12i-settings-${tag}`)
  await page.getByText('Birthday', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await sleep(200)
  await shot(page, `12i-settings-new-kinds-${tag}`)
  await sw('Birthday').click()
  await sleep(300)
  check(`12i ${tag} Birthday on → birthday_on true`, writesTo(state, 'app_settings').at(-1)?.birthday_on === true)
  await sw('Paper capture ready').click()
  await sleep(300)
  check(`12i ${tag} Paper capture ready off → paper_ready_on false`, writesTo(state, 'app_settings').at(-1)?.paper_ready_on === false)
  await sw('Sync problem').click()
  await sleep(300)
  check(`12i ${tag} Sync problem off → sync_problem_on false`, writesTo(state, 'app_settings').at(-1)?.sync_problem_on === false)
  check(`12i ${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// A brand-new account (no settings row yet): Birthday still reads off.
if (want('settings')) {
  const { ctx, errors, open } = await app({})
  ctx.route('http://127.0.0.1:9/rest/v1/app_settings**', (r) => r.fulfill({ json: [], headers: { 'content-range': '*/0' } }))
  const page = await open('/settings', DESKTOP)
  await page.getByRole('button', { name: 'Send a test notification' }).scrollIntoViewIfNeeded()
  const sw = (label) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last().locator('[role="switch"]')
  check('12i no settings row: Birthday off, the other two on', (await sw('Birthday').getAttribute('aria-checked')) === 'false' && (await sw('Paper capture ready').getAttribute('aria-checked')) === 'true' && (await sw('Sync problem').getAttribute('aria-checked')) === 'true')
  check('12i no settings row: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Birthday on Windows: the app's own sweep toasts it at 08:00 (tray.rs notify_local) ──
if (want('birthday')) {
  const { ctx, state, errors, open } = await app({ settings: { birthday_on: true, lock_screen_names: true } }, { tauri: true })
  const main = await open('/today', DESKTOP, '07:59:40')
  check('birthday: people + interactions are read when Birthday is on (whatever page is open)', state.reads.includes('people') && state.reads.includes('interactions'), JSON.stringify([...new Set(state.reads)]))
  check('birthday: nothing before 08:00', !(await toasts(main)).some((t) => t?.title?.includes('birthday')))
  await main.clock.runFor(31_000)
  await sleep(600)
  const t = (await toasts(main)).find((x) => x?.title?.includes('birthday'))
  check('birthday: 08:00 → "Omar’s birthday is today" / "Last spoke 12 days ago." · Open Omar, silent', t?.title === 'Omar’s birthday is today' && t?.body === 'Last spoke 12 days ago.' && JSON.stringify(t?.actions) === JSON.stringify([['open', 'Open Omar']]) && t?.silent === true, JSON.stringify(t))
  await main.clock.runFor(61_000)
  await sleep(300)
  check('birthday: once, not every sweep', (await toasts(main)).filter((x) => x?.title?.includes('birthday')).length === 1)
  await main.evaluate((p) => window.__kfNotifyAction('open', JSON.parse(p)), JSON.stringify(JSON.parse(t?.payload ?? '{}')))
  await sleep(600)
  check('birthday: the toast’s Open Omar lands on his page', new URL(main.url()).pathname === `/people/${OMAR}`, main.url())
  check('birthday: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('birthday')) {
  const { ctx, errors, open } = await app({ settings: { lock_screen_names: false, birthday_on: true } }, { tauri: true })
  const main = await open('/today', DESKTOP, '07:59:40')
  await main.clock.runFor(31_000)
  await sleep(600)
  const t = (await toasts(main)).find((x) => x?.title === 'A birthday')
  check('birthday, lock-screen names off: "A birthday" / "Unlock to see it" · Open — no name in the toast', !!t && t.body === 'Unlock to see it' && JSON.stringify(t.actions) === JSON.stringify([['open', 'Open']]) && !JSON.stringify(t).includes('Omar'), JSON.stringify(t))
  check('birthday private: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  const off = await app({ settings: { lock_screen_names: true } }, { tauri: true })
  const page = await off.open('/today', DESKTOP, '07:59:40')
  await page.clock.runFor(31_000)
  await sleep(600)
  check('birthday off (the default): no toast, interactions not fetched for it', !(await toasts(page)).some((x) => /birthday/i.test(x?.title ?? '')) && !off.state.reads.includes('interactions'), JSON.stringify([...new Set(off.state.reads)]))
  await off.ctx.close()
}

// ── Paper capture ready on Windows: a read finishing while the app sits in the tray ──
if (want('paper')) {
  const { ctx, state, errors, open } = await app({ captures: [capture()], settings: { lock_screen_names: true } }, { tauri: true, away: true })
  const main = await open('/today', DESKTOP)
  await sleep(1500)
  const t = (await toasts(main)).find((x) => x?.title?.startsWith('Your page is read'))
  check('paper: the read resumed here finishes → capture-image was asked', state.fn.some((f) => f.name === 'capture-image' && f.body?.capture_id === CID))
  check('paper: → "Your page is read — 7 things" / "From “OS lecture 3”. 2 need a quick look." · Review, silent', t?.title === 'Your page is read — 7 things' && t?.body === 'From “OS lecture 3”. 2 need a quick look.' && JSON.stringify(t?.actions) === JSON.stringify([['review', 'Review']]) && t?.silent === true, JSON.stringify(t))
  check('paper: the in-app toast is still there too', (await main.locator('.kf-toast-msg', { hasText: 'Your page is read · 7 things' }).count()) >= 1)
  await main.evaluate((p) => window.__kfNotifyAction('review', JSON.parse(p)), t?.payload ?? '{}')
  await sleep(1200)
  check('paper: Review (from the toast) → the Inbox with the results open', new URL(main.url()).pathname === '/inbox' && (await main.getByText('Deadlock — four conditions').count()) >= 1, main.url())
  await shot(main, 'paper-review-from-toast')
  check('paper: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('paper')) {
  const { ctx, open } = await app({ captures: [capture()], settings: { lock_screen_names: false } }, { tauri: true, away: true })
  const main = await open('/today', DESKTOP)
  await sleep(1500)
  const t = (await toasts(main)).find((x) => x?.title === 'A page is ready')
  check('paper, lock-screen names off: "A page is ready" / "Unlock to see it" — no page title in it', !!t && t.body === 'Unlock to see it' && !JSON.stringify(t).includes('OS lecture'), JSON.stringify(t))
  await ctx.close()
  const look = await app({ captures: [capture()] }, { tauri: true })
  const page = await look.open('/today', DESKTOP)
  await sleep(1500)
  await page.evaluate(() => document.hasFocus()) // a headless page has focus
  check('paper: with someone looking, no toast (the in-app one says it)', !(await toasts(page)).some((x) => /page/i.test(x?.title ?? '')) && (await page.locator('.kf-toast-msg', { hasText: 'Your page is read' }).count()) >= 1)
  await look.ctx.close()
}

// ── Sync problem on Windows: offline with a change waiting, in the tray, for 5 minutes ──
if (want('sync')) {
  const { ctx, state, errors, open } = await app({ settings: { lock_screen_names: true } }, { tauri: true })
  const main = await open('/today', DESKTOP)
  await ctx.setOffline(true)
  await sleep(300)
  await main.evaluate((t) => window.__kfNotifyAction('done', { kind: 'task_reminder', taskIds: [t] }), id(TYRE))
  await sleep(800)
  await main.evaluate(() => (document.hasFocus = () => false)) // closed to the tray
  await main.clock.runFor(2 * 60_000)
  await sleep(300)
  check('sync: not before it has lasted', !(await toasts(main)).some((x) => /sync/.test(x?.title ?? '')))
  const k = (await calls(main, 'tray_set')).at(-1)?.args
  check('sync: meanwhile the K shows "changes waiting" (12a)', k?.state === 'offline', JSON.stringify(k))
  await main.clock.runFor(4 * 60_000)
  await sleep(500)
  const told = (await toasts(main)).filter((x) => /sync/.test(x?.title ?? ''))
  check('sync: after 5 minutes → "1 change is waiting to sync" / "It’s safe on this device. We’ll keep trying." · Open, silent', told.length === 1 && told[0].title === '1 change is waiting to sync' && told[0].body === 'It’s safe on this device. We’ll keep trying.' && JSON.stringify(told[0].actions) === JSON.stringify([['open', 'Open']]) && told[0].silent === true, JSON.stringify(told))
  await main.clock.runFor(15 * 60_000)
  await sleep(300)
  check('sync: once per incident', (await toasts(main)).filter((x) => /sync/.test(x?.title ?? '')).length === 1)
  await ctx.setOffline(false)
  await main.evaluate(() => window.dispatchEvent(new Event('online')))
  await main.clock.runFor(35_000)
  await sleep(1500)
  const hist = writesTo(state, 'activity_log').find((r) => r?.event_type === 'notify.sync_problem')
  check('sync: back online, the change goes up and the notice reaches the history (12j), stamped when it was said', writesTo(state, 'tasks').some((r) => r?.id === id(TYRE) && r?.status === 'done') && hist?.payload?.title === '1 change is waiting to sync' && Math.abs(Date.parse(hist?.created_at) - (cairo('09:55').getTime() + 6 * 60_000)) < 90_000, JSON.stringify(hist))
  check('sync: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('sync')) {
  const { ctx, open } = await app({}, { tauri: true })
  const main = await open('/today', DESKTOP)
  await ctx.setOffline(true)
  await sleep(300)
  await main.evaluate((t) => window.__kfNotifyAction('done', { kind: 'task_reminder', taskIds: [t] }), id(TYRE))
  await sleep(500)
  await main.clock.runFor(10 * 60_000) // someone is looking the whole time
  await sleep(300)
  check('sync: never while someone is looking (the topbar says it)', !(await toasts(main)).some((x) => /sync/.test(x?.title ?? '')))
  await ctx.close()
}

// ── the flyout (12b), day + night: untouched by the new kinds ──
if (want('flyout')) for (const theme of ['day', 'night']) {
  const { ctx, errors, open } = await app({}, { tauri: true, theme })
  const page = await open('/tray', FLYOUT, '08:41')
  await page.locator('.kf-tray-row-title', { hasText: 'GCI homework 1 — NumPy' }).waitFor({ timeout: 8000 }).catch(() => {})
  const text = await page.locator('.kf-tray').innerText()
  check(`12b flyout ${theme}: date, Top 3, capture, focus, footer`, /Saturday, 3 October/.test(text) && text.includes('GCI homework 1 — NumPy') && (await page.getByPlaceholder('Write it down…').count()) === 1 && text.includes('Open Kai’s Flow'))
  await shot(page, `12b-flyout-${theme}`)
  check(`12b flyout ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── side by side: the drawing | this build ──
if (DESIGN) {
  const pairs = [['12j', ['12j-history-phone-night', '12j-history-yesterday-phone-night', '12j-history-yesterday-desktop-day']], ['12i', ['12i-settings-new-kinds-desktop-day', '12i-settings-new-kinds-phone-night']], ['12b', ['12b-flyout-day', '12b-flyout-night']]]
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } })
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, mine] of pairs) {
    const a = path.join(DESIGN, `design-${frame}.png`)
    const bs = mine.map((m) => path.join(OUT, `${m}.png`)).filter((f) => fs.existsSync(f))
    if (!fs.existsSync(a) || !bs.length) continue
    await page.setContent(`<body style="margin:0;padding:16px;background:#e9e4d8;display:flex;gap:16px;align-items:flex-start;font:13px sans-serif;width:max-content"><div><div>the drawing · ${frame}</div><img src="${img(a)}" style="max-width:1100px"></div>${bs.map((b) => `<div><div>this build · ${path.basename(b, '.png')}</div><img src="${img(b)}"></div>`).join('')}</body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  // 12k's copy table beside what the app actually said (the toasts above), for the three kinds.
  const k = path.join(DESIGN, 'design-12k.png')
  if (fs.existsSync(k)) {
    const said = results.filter((r) => /→ "/.test(r.name)).map((r) => `<li>${r.ok ? '✓' : '✗'} ${r.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')
    await page.setContent(`<body style="margin:0;padding:16px;background:#e9e4d8;font:14px sans-serif;width:max-content"><div>the drawing · 12k</div><img src="${img(k)}" style="max-width:1400px"><div style="margin-top:12px">this build said (notify_local payloads checked above):</div><ul>${said}</ul></body>`)
    await page.screenshot({ path: path.join(OUT, 'side-12k.png'), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
