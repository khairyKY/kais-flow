// Queue item 14 — the Windows tray: popover B and menu B (design-export/Calendar extras options.html §5, Kai's
// picks) on tray.html, the REAL app against a MOCKED backend (the tray-notices recipe: `--mode mock`,
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in localStorage, Playwright answers every REST call
// and records every write). The Windows app is a stub `window.__TAURI_INTERNALS__` recording each tray.rs
// command. Signed in and signed out, popover B's contents and actions, menu B's rows/keys/picks, day + night.
// What this can't show (no real Windows here): the shared session between real WebView2 windows, the
// anchoring by the K, blur-to-hide — tray.rs, tested by its own `cargo test` (anchor) and on the next installer.
// The drawing's day: Sunday 25 October 2026, Cairo (UTC+3), 18:03.
//   node verify.mjs <outDir> [baseUrl]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5310'
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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 25) => {
  const [h, m, s = 0] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m, s))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const FIRST = '2026-09-15T09:00:00Z'
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: FIRST, updated_at: FIRST, ...over,
})
const SHIP = 1, TYRE = 2, VET = 3, MOM = 4
const TASKS = [
  task(SHIP, 'Ship the calendar polish', { top3: true, due_at: iso('09:00') }),
  task(TYRE, 'Call the tyre supplier', { top3: true, due_at: iso('09:00'), created_at: '2026-10-20T09:00:00Z' }),
  task(VET, 'Book the vet', { top3: true, due_at: iso('09:00'), created_at: '2026-10-21T09:00:00Z' }),
  task(MOM, 'Call Mom', { due_at: iso('19:10') }),
]
const evRow = (n, title, a, b, over = {}) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(a), ends_at: iso(b), all_day: false, task_id: null,
  source: 'manual', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: FIRST, updated_at: FIRST, ...over,
})
const EVENTS = [evRow(1, 'المغرب', '18:15', '18:40', { color: '#8A9A7E' }), evRow(2, 'Call Mom', '19:10', '19:30', { task_id: id(MOM), type: 'task' })]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: FIRST, updated_at: FIRST }
const tables = (s) => ({
  tasks: TASKS, calendar_events: EVENTS, projects: [], routines: [], routine_completions: [], inbox_items: [], domains: [], areas: [], people: [], interactions: [],
  app_settings: [{ ...SETTINGS, ...(s.settings ?? {}) }], activity_log: [], push_subscriptions: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const FLYOUT = { viewport: { width: 340, height: 480 } }
const MENU = { viewport: { width: 250, height: 300 } }
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const MENU_STATE = { signedIn: true, next: { now: false, title: 'المغرب', at: '6:15 PM' }, pausedUntil: null }

async function app(s = {}, o = {}) {
  const ctx = await browser.newContext({ ...DESKTOP, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, menu]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-download-bar-dismissed', '1')
    if (sess) localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-whats-new:00000000-0000-4000-8000-00000000d3e0', JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 }))
    window.__tauriCalls = []
    window.__menuState = menu
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        window.__tauriCalls.push({ cmd, args: args ?? null })
        if (cmd === 'autostart_get') return false
        if (cmd === 'tray_menu_state') return window.__menuState
        return null
      },
    }
  }, [o.theme ?? 'day', o.signedOut ? null : JSON.stringify(session), JSON.stringify(o.menu ?? MENU_STATE)])
  const state = { rows: tables(s), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
    if (url.pathname.startsWith('/storage/v1/')) return r.fulfill({ json: [] })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const errors = []
  async function open(route, view, at = '18:03') {
    const page = await ctx.newPage()
    await page.setViewportSize(view.viewport)
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
const writesTo = (state, table) => state.writes.filter((w) => w.table === table).flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const fits = (page) => page.evaluate(() => {
  const el = document.querySelector('.kf-tray')
  return el.scrollHeight <= el.clientHeight + 1 && document.documentElement.scrollWidth <= innerWidth
})
const layout = (page) => page.evaluate(() => `${document.querySelector('.kf-tray').scrollHeight}px: ` + [...document.querySelectorAll('.kf-tray > *')].map((e) => `${e.className.split(' ')[0]} ${Math.round(e.getBoundingClientRect().height)}`).join(', '))
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim()

// ── popover B, signed in, nothing running: day + night ──
if (want('popover')) for (const theme of ['day', 'night']) {
  const { ctx, errors, open } = await app({}, { theme })
  const page = await open('/tray.html', FLYOUT)
  await page.locator('.kf-tray-row-title', { hasText: 'Ship the calendar polish' }).waitFor({ timeout: 8000 }).catch(() => {})
  const head = await txt(page.locator('.kf-tray-head'))
  check(`popover ${theme}: the date and Day N`, /^Sunday, 25 October Day \d+$/.test(head), head)
  const card = await txt(page.locator('.kf-tray-nc'))
  check(`popover ${theme}: the Now card — Up next · in 12m · المغرب · 6:15 PM – 6:40 PM, a ring in the event's colour`, card === 'Up next in 12m المغرب 6:15 PM 6:40 PM' && (await page.locator('.kf-tray-nc .kf-tray-ring-mark').count()) === 1, card)
  const rows = await page.locator('.kf-tray-row-title').allInnerTexts()
  check(`popover ${theme}: Top 3, goal first`, JSON.stringify(rows) === JSON.stringify(['Ship the calendar polish', 'Call the tyre supplier', 'Book the vet']), JSON.stringify(rows))
  const stars = await page.locator('.kf-tray-row').evaluateAll((els) => els.map((el) => !!el.querySelector('.kf-tray-star')))
  check(`popover ${theme}: the gold star on the goal only`, JSON.stringify(stars) === '[true,false,false]', JSON.stringify(stars))
  const starColour = await page.locator('.kf-tray-star').evaluate((el) => getComputedStyle(el).color)
  const gold = await page.evaluate(() => {
    const d = document.createElement('i')
    d.style.color = 'var(--acc-gold)'
    document.body.append(d)
    const c = getComputedStyle(d).color
    d.remove()
    return c
  })
  check(`popover ${theme}: the star is --acc-gold`, starColour === gold, `${starColour} vs ${gold}`)
  check(`popover ${theme}: capture line, Start focus · 25:00, Open Kai's Flow + Settings`, (await page.getByPlaceholder('Write it down…').count()) === 1 && (await txt(page.locator('.kf-tray-btn.is-cta'))) === 'Start focus · 25:00' && (await txt(page.locator('.kf-tray-open'))) === 'Open Kai’s Flow' && (await page.getByRole('button', { name: 'Settings' }).count()) === 1)
  check(`popover ${theme}: the theme`, (await page.evaluate(() => document.documentElement.dataset.theme)) === theme)
  check(`popover ${theme}: fits 340 × 480 (no scroll)`, await fits(page), await layout(page))
  check(`popover ${theme}: no interface zoom here (index.html's isn't loaded)`, (await page.evaluate(() => document.documentElement.style.zoom)) === '')
  await shot(page, `popover-b-${theme}`)
  check(`popover ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── popover B: ongoing, then its actions ──
if (want('actions')) {
  const { ctx, state, errors, open } = await app({})
  const page = await open('/tray.html', FLYOUT, '18:28')
  await page.locator('.kf-tray-nc').waitFor({ timeout: 8000 }).catch(() => {})
  const card = await txt(page.locator('.kf-tray-nc'))
  const bar = await page.locator('.kf-tray-nc-bar i').evaluate((el) => el.style.width)
  check('ongoing: Ongoing · 12m left, the bar 52% along', card.startsWith('Ongoing 12m left المغرب') && bar === '52%', `${card} · ${bar}`)
  await shot(page, 'popover-b-ongoing-day')
  await page.getByPlaceholder('Write it down…').fill('buy milk')
  await page.keyboard.press('Enter')
  await sleep(1500)
  check('capture → an Inbox item (through the outbox)', writesTo(state, 'inbox_items').some((r) => r?.raw_text === 'buy milk'), JSON.stringify(writesTo(state, 'inbox_items')).slice(0, 120))
  await page.locator('.kf-tray-row').nth(2).locator('[role="checkbox"]').click()
  await sleep(900)
  const done = writesTo(state, 'tasks').find((r) => r?.id === id(VET))
  check('ticking a Top 3 row completes it (outbox write)', done?.status === 'done', JSON.stringify(done ?? null).slice(0, 80))
  await page.locator('.kf-tray-open').click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('.kf-tray-head').click()
  await page.keyboard.press('Escape')
  const ipc = (await calls(page)).filter((c) => ['tray_hide', 'tray_open'].includes(c.cmd)).map((c) => `${c.cmd}${c.args ? ' ' + JSON.stringify(c.args) : ''}`)
  check('Open → tray_open; Settings → tray_open /settings; Esc → tray_hide', JSON.stringify(ipc) === JSON.stringify(['tray_open {"route":null}', 'tray_open {"route":"/settings"}', 'tray_hide']), JSON.stringify(ipc))
  check('actions: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── focus: the popover and the menu drive the main window's one timer (same origin) ──
if (want('focus')) {
  const { ctx, state, errors, open } = await app({}, { theme: 'night' })
  const main = await open('/today', DESKTOP)
  const tray = await open('/tray.html', FLYOUT)
  const menu = await open('/tray.html?menu', MENU)
  await tray.locator('.kf-tray-btn.is-cta').click()
  await sleep(300)
  await main.clock.runFor(6 * 60_000 + 18_000)
  await sleep(600)
  const fb = await txt(tray.locator('.kf-tray-fb'))
  check('Start focus (popover) starts the main timer on the goal: Focus · 18:42 left', /^Focus · 18:4[12] left Ship the calendar polish$/.test(fb), fb)
  check('running: Pause · Stop', JSON.stringify(await tray.locator('.kf-tray-btn').allInnerTexts()) === JSON.stringify(['Pause', 'Stop']))
  check('running popover fits', await fits(tray), await layout(tray))
  await shot(tray, 'popover-b-focus-night')
  const stop = menu.locator('.kf-menu-row', { hasText: 'Stop focus' })
  check('menu: Stop focus with the time left, in terra; status Focus · 18:4x left', (await stop.count()) === 1 && /18:\d\d/.test(await stop.innerText()) && (await stop.evaluate((el) => el.classList.contains('is-danger'))) && /Focus · 18:\d\d left/.test(await txt(menu.locator('.kf-menu-who small'))), await txt(menu.locator('.kf-menu')))
  await shot(menu, 'menu-b-focus-night')
  await tray.getByRole('button', { name: 'Pause' }).click()
  await sleep(300)
  check('Pause pauses the main timer (· paused, Resume)', (await txt(tray.locator('.kf-tray-fb'))).includes('paused') && (await tray.locator('.kf-tray-btn').first().innerText()) === 'Resume')
  await tray.getByRole('button', { name: 'Stop' }).click()
  await sleep(300)
  check('Stop ends the round; Start focus is back', (await tray.locator('.kf-tray-btn.is-cta').count()) === 1)
  // the main window's own half: the menu's state (Next · …), and menu B's pause choices
  const sent = (await calls(main, 'tray_menu')).at(-1)?.args?.menu
  const parsed = sent ? JSON.parse(sent) : null
  check('main window → tray_menu: signed in, Next · المغرب · 6:15 PM', parsed?.signedIn === true && parsed?.next?.title === 'المغرب' && parsed?.next?.at === '6:15 PM' && parsed?.next?.now === false, sent)
  await main.evaluate(() => window.__kfTray('pause:60'))
  await sleep(500)
  const until = writesTo(state, 'app_settings').at(-1)?.notify_paused_until
  const nowMain = await main.evaluate(() => Date.now())
  check('menu B Pause ▸ 1 hour → paused for an hour', !!until && Math.abs(new Date(until).getTime() - (nowMain + 3_600_000)) < 60_000, `${until} vs ${new Date(nowMain + 3_600_000).toISOString()} · ${JSON.stringify(writesTo(state, 'app_settings').map((w) => w?.notify_paused_until))}`)
  await main.evaluate(() => window.__kfTray('resume'))
  await sleep(500)
  check('Resume → not paused', writesTo(state, 'app_settings').at(-1)?.notify_paused_until === null)
  await main.evaluate(() => window.__kfTray('pause:tomorrow'))
  await sleep(500)
  check('Until tomorrow → 09:00 tomorrow, Cairo', writesTo(state, 'app_settings').at(-1)?.notify_paused_until === iso('09:00', 26), writesTo(state, 'app_settings').at(-1)?.notify_paused_until)
  const n = writesTo(state, 'app_settings').length
  await main.evaluate(() => window.__kfTray('pause:nonsense'))
  await sleep(300)
  check('an unknown pause choice writes nothing', writesTo(state, 'app_settings').length === n)
  check('focus: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── signed out: the popover says so calmly; the menu is Open + Quit ──
if (want('signedout')) for (const theme of ['day', 'night']) {
  const { ctx, errors, open } = await app({}, { theme, signedOut: true, menu: { signedIn: false } })
  const page = await open('/tray.html', FLYOUT)
  const t = await txt(page.locator('.kf-tray'))
  check(`signed out ${theme}: "Sign in in Kai’s Flow" and the way to the app — not a sign-in form`, t.includes('Sign in in Kai’s Flow') && (await page.locator('input[type="password"], input[type="email"]').count()) === 0, t)
  await page.getByRole('button', { name: /Open Kai’s Flow/ }).click()
  check(`signed out ${theme}: its button opens the main window`, (await calls(page, 'tray_open')).length === 1)
  await shot(page, `popover-signed-out-${theme}`)
  const menu = await open('/tray.html?menu', MENU)
  const labels = await menu.locator('.kf-menu-row').allInnerTexts()
  check(`signed out ${theme}: the menu is Open and Quit`, JSON.stringify(labels.map((l) => l.trim())) === JSON.stringify(['Open Kai’s Flow', 'Quit Kai’s Flow']), JSON.stringify(labels))
  await shot(menu, `menu-signed-out-${theme}`)
  check(`signed out ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── menu B: rows, size handshake, keys, picks, live state ──
if (want('menu')) for (const theme of ['day', 'night']) {
  const { ctx, errors, open } = await app({}, { theme })
  const menu = await open('/tray.html?menu', MENU)
  const labels = (await menu.locator('.kf-menu-row').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim())
  check(`menu ${theme}: the drawn rows`, JSON.stringify(labels) === JSON.stringify(['Open Kai’s Flow', 'Quick capture…', 'Start focus 25:00', 'Pause notifications ▸', 'Settings', 'Quit Kai’s Flow']), JSON.stringify(labels))
  check(`menu ${theme}: the K, Kai's Flow, Next · المغرب · 6:15 PM`, (await txt(menu.locator('.kf-menu-head'))) === 'K Kai’s Flow Next · المغرب · 6:15 PM', await txt(menu.locator('.kf-menu-head')))
  const ready = (await calls(menu, 'tray_menu_ready')).map((c) => c.args?.height)
  const h = await menu.locator('.kf-menu').evaluate((el) => Math.ceil(el.getBoundingClientRect().height))
  check(`menu ${theme}: tells tray.rs its height once drawn (tray_menu_ready)`, ready.length === 1 && ready[0] === h && h > 200 && h <= 300, `${ready} vs ${h}`)
  await shot(menu, `menu-b-${theme}`)
  // keys: ↓ to the first row, End, Home, ↓↓↓ to Pause, → opens it, ↓ to 1 hour, Enter picks
  await menu.locator('.kf-menu').focus()
  await menu.keyboard.press('ArrowDown')
  const at = () => menu.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim())
  const first = await at()
  await menu.keyboard.press('End')
  const last = await at()
  await menu.keyboard.press('Home')
  await menu.keyboard.press('ArrowDown')
  await menu.keyboard.press('ArrowDown')
  await menu.keyboard.press('ArrowDown')
  const pause = await at()
  check(`menu ${theme}: ↓ End Home ↓↓↓ move through the rows`, first === 'Open Kai’s Flow' && last === 'Quit Kai’s Flow' && pause === 'Pause notifications▸', `${first} | ${last} | ${pause}`)
  await menu.keyboard.press('ArrowRight')
  await sleep(150)
  const sub = (await menu.locator('.kf-menu-sub .kf-menu-row').allInnerTexts()).map((l) => l.trim())
  const kept = (await menu.locator('.kf-menu').evaluate((el) => Math.ceil(el.getBoundingClientRect().height))) === h
  check(`menu ${theme}: → opens Pause: back, 30 minutes, 1 hour, Until tomorrow — the window keeps its height`, JSON.stringify(sub) === JSON.stringify(['Pause notifications', '30 minutes', '1 hour', 'Until tomorrow']) && kept && (await calls(menu, 'tray_menu_size')).length === 0, JSON.stringify(sub))
  check(`menu ${theme}: → lands on 30 minutes`, (await at()) === '30 minutes', await at())
  await shot(menu, `menu-b-pause-${theme}`)
  await menu.keyboard.press('ArrowDown')
  await menu.keyboard.press('Enter')
  await sleep(100)
  check(`menu ${theme}: Enter on 1 hour → tray_menu_pick pause:60`, (await calls(menu, 'tray_menu_pick')).at(-1)?.args?.id === 'pause:60', JSON.stringify(await calls(menu, 'tray_menu_pick')))
  // shown again: the main list; Esc in the submenu goes back, Esc in the list closes
  await menu.evaluate(() => window.dispatchEvent(new Event('focus')))
  await sleep(100)
  check(`menu ${theme}: shown again → the main list`, (await menu.locator('.kf-menu-sub').count()) === 0)
  await menu.locator('.kf-menu-row', { hasText: 'Pause notifications' }).click()
  await sleep(100)
  await menu.keyboard.press('Escape')
  await sleep(100)
  const back = (await menu.locator('.kf-menu-sub').count()) === 0
  await menu.keyboard.press('Escape')
  check(`menu ${theme}: Esc leaves Pause, then hides the window`, back && (await calls(menu, 'tray_hide')).length === 1)
  await menu.locator('.kf-menu-row', { hasText: 'Quick capture' }).click()
  await menu.locator('.kf-menu-row', { hasText: 'Quit' }).click()
  const picks = (await calls(menu, 'tray_menu_pick')).map((c) => c.args.id)
  check(`menu ${theme}: a click picks (capture, quit)`, JSON.stringify(picks.slice(-2)) === '["capture","quit"]', JSON.stringify(picks))
  // tray.rs pushes a new state (paused): Resume with until when; the rows' new height goes to tray.rs
  await menu.evaluate(() => window.__kfMenu({ signedIn: true, next: { now: true, title: 'Standup', at: '11:30 AM' }, pausedUntil: '7:03 PM' }))
  await sleep(150)
  const r = await txt(menu.locator('.kf-menu-row', { hasText: 'Resume' }))
  const st = await txt(menu.locator('.kf-menu-who small'))
  check(`menu ${theme}: pushed state → Resume notifications until 7:03 PM, Now · Standup · until 11:30 AM`, r === 'Resume notifications until 7:03 PM' && st === 'Now · Standup · until 11:30 AM', `${r} · ${st}`)
  await menu.evaluate(() => window.__kfMenu({ signedIn: false }))
  await sleep(150)
  const size = (await calls(menu, 'tray_menu_size')).at(-1)?.args?.height
  check(`menu ${theme}: signed out pushed → Open + Quit, and the smaller height goes to tray.rs`, (await menu.locator('.kf-menu-row').count()) === 2 && size > 0 && size < h, `${size} < ${h}`)
  check(`menu ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the bundle: the tray page loads its own small entry, not the app ──
if (want('bundle')) {
  const { ctx, open } = await app({})
  let seen = []
  ctx.on('request', (r) => seen.push(new URL(r.url()).pathname))
  const mods = async () => { const out = seen.filter((u) => u.startsWith('/src/')); seen = []; return out }
  await open('/tray.html?menu', MENU)
  const m = await mods()
  const bad = m.filter((u) => /src\/App\.tsx|AppLayout|lib\/supabase|TrayFlyout|features\/(today|calendar|tasks)\//.test(u))
  check('menu window: no app shell, supabase, flyout or page code', m.length > 0 && bad.length === 0, bad.join(' ') || `${m.length} modules`)
  await open('/tray.html', FLYOUT)
  const p = await mods()
  const bad2 = p.filter((u) => /src\/App\.tsx|AppLayout|TodayPage|CalendarPage|parseCommand/.test(u))
  check('popover window: no app shell or other pages; the capture reader waits until it is used', p.length > 0 && bad2.length === 0, bad2.join(' ') || `${p.length} modules`)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
