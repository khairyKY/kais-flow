// Tray & notifications (Tray and Notifications.dc.html 12b/12c/12i/12j) on the REAL app, signed in
// against a MOCKED backend — the task-sheet recipe: the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, Playwright answers every REST call with the drawing's sample day (Saturday 3 Oct
// 2026, Day 84, Cairo, the clock at 08:41) and records every write.
// The Windows app is played by a stub `window.__TAURI_INTERNALS__` that records each tray.rs command
// the web app sends (tray_set, tray_hide, tray_open, notify_local, autostart_*), so the IPC contract
// is checked here; the Rust side itself only runs in the CI-built installer.
//   node verify.mjs <outDir> [baseUrl] [designFramesDir]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5253'
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

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the drawing's day: Saturday 3 Oct 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 3, month = 9) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month, day, h - 3, m))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const NOW = '08:41'
const FIRST = iso('09:00', 12, 6) // 12 July → Saturday 3 October is Day 84
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: FIRST, updated_at: FIRST, ...over,
})
const GOAL = 1, SURVEY = 2, OS = 3, JUDGE = 4, TYRE = 5
const TASKS = [
  task(GOAL, 'GCI homework 1 — NumPy', { top3: true }),
  task(SURVEY, 'Do GCI lecture 2’s survey', { top3: true, created_at: iso('09:00', 1) }),
  task(OS, 'Skim OS lectures 1 + 2', { top3: true, created_at: iso('09:00', 1) }),
  task(JUDGE, 'Judge test Kai’s Flow', { due_at: iso('09:00'), created_at: iso('09:00', 1) }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('08:50'), reminder_at: iso('08:40'), created_at: iso('09:00', 1) }),
]
const EVENTS = [
  { id: 'e0000000-0000-4000-8000-000000000001', user_id: UID, title: 'Judge test Kai’s Flow', starts_at: iso('09:00'), ends_at: iso('10:00'), all_day: false, task_id: id(JUDGE), source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'task', color: null, created_at: FIRST, updated_at: FIRST },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: FIRST, updated_at: FIRST }
const log = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: at })
const ACTIVITY = [
  log(1, 'task.reminder_sent', 'task', id(TYRE), { title: 'Call the tyre supplier', notice: { title: 'Call the tyre supplier · in 10 min', body: '08:50' } }, iso('08:40')),
  log(2, 'notify.morning_digest', 'notification', 'f1000000-0000-4000-8000-000000000001', { title: 'Good morning — 3 to tend today', body: '✶ GCI homework 1 — NumPy, then Do GCI lecture 2’s survey and Skim OS lectures 1 + 2.' }, iso('07:30')),
  log(3, 'task.completed', 'task', id(JUDGE), {}, iso('07:10')),
  log(4, 'notify.evening_nudge', 'notification', 'f1000000-0000-4000-8000-000000000002', { title: 'The garden’s ready to close', body: '4 done · 2 left' }, iso('21:30', 2)),
]
function tables(s) {
  return {
    tasks: TASKS,
    calendar_events: EVENTS,
    projects: [],
    routines: [],
    inbox_items: [],
    domains: [],
    app_settings: [{ ...SETTINGS, ...(s.settings ?? {}) }],
    activity_log: ACTIVITY,
    push_subscriptions: s.subs ?? [],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const FLYOUT = { viewport: { width: 340, height: 460 } }
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** One browser context (one "app": its windows share localStorage, IndexedDB and BroadcastChannel). */
async function app(s = {}, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? DESKTOP), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, tauri]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    if (tauri) {
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd, args) => {
          window.__tauriCalls.push({ cmd, args: args ?? null })
          if (cmd === 'autostart_get') return false
          if (cmd === 'autostart_set') return !!args?.on
          return null
        },
      }
    }
  }, [o.theme ?? 'day', JSON.stringify(session), !!o.tauri])
  const state = { rows: tables(s), writes: [], fn: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice('/functions/v1/'.length)
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.fn.push({ name, body })
      if (name === 'notify') return r.fulfill({ json: { sent: 1, pruned: 0, users: [] } })
      return r.fulfill({ status: 500, json: { error: 'mock' } }) // parse-capture: no AI here → Inbox
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const errors = []
  async function open(route, view) {
    const page = await ctx.newPage()
    if (view) await page.setViewportSize(view.viewport)
    await page.clock.install({ time: cairo(NOW) })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await sleep(900)
    return page
  }
  return { ctx, state, errors, open }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const calls = (page, cmd) => page.evaluate((c) => (window.__tauriCalls ?? []).filter((x) => !c || x.cmd === c), cmd)
const writesTo = (state, table) => state.writes.filter((w) => w.table === table).map((w) => w.body)
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight + 1)

// ── 12b · the flyout, day, nothing running ──
{
  const { ctx, state, errors, open } = await app({}, { tauri: true })
  const page = await open('/tray', FLYOUT)
  const text = await page.locator('.kf-tray').innerText()
  check('12b date + Day N', /Saturday, 3 October/.test(text) && /DAY 84/i.test(text), text.split('\n').slice(0, 2).join(' | '))
  check('12b Next · 09:00 Judge test Kai’s Flow, with a check', (await page.locator('.kf-tray-now').innerText()).replace(/\s+/g, ' ').includes('NEXT · 09:00 Judge test Kai’s Flow') && (await page.locator('.kf-tray-check').count()) === 1)
  const rows = await page.locator('.kf-tray-row-title').allInnerTexts()
  check('12b Top 3 as three rows, goal first', JSON.stringify(rows) === JSON.stringify(['GCI homework 1 — NumPy', 'Do GCI lecture 2’s survey', 'Skim OS lectures 1 + 2']), JSON.stringify(rows))
  check('12b capture field + Start focus · 25:00 + footer', (await page.getByPlaceholder('Write it down…').count()) === 1 && (await page.locator('.kf-tray-btn.is-cta').innerText()).includes('Start focus · 25:00') && (await page.locator('.kf-tray-open').innerText()).includes('Open Kai’s Flow'))
  check('12b fits 340 × 460 (no scroll)', await noOverflow(page))
  await shot(page, '12b-flyout-day')

  // capture → Inbox (no AI in the mock); a Top 3 check completes the task
  await page.getByPlaceholder('Write it down…').fill('buy milk')
  await page.keyboard.press('Enter')
  await sleep(800)
  const inbox = writesTo(state, 'inbox_items')
  check('12b quick capture writes an Inbox item', inbox.some((b) => (Array.isArray(b) ? b : [b]).some((r) => r?.raw_text === 'buy milk')), JSON.stringify(inbox).slice(0, 120))
  await page.locator('.kf-tray-row').nth(2).locator('[role="checkbox"]').click()
  await sleep(700)
  const done = writesTo(state, 'tasks').flat().find((r) => r?.id === id(OS))
  check('12b ticking a Top 3 row completes it (outbox write)', done?.status === 'done', JSON.stringify(done ?? null).slice(0, 80))

  // the window's own commands: Esc hides, the footer opens the app / Settings
  await page.keyboard.press('Escape')
  await page.locator('.kf-tray-open').click()
  await page.getByRole('button', { name: 'Settings' }).click()
  const ipc = (await calls(page)).filter((c) => ['tray_hide', 'tray_open'].includes(c.cmd)).map((c) => `${c.cmd}${c.args ? ' ' + JSON.stringify(c.args) : ''}`)
  check('12b Esc → tray_hide; Open → tray_open; Settings → tray_open /settings', JSON.stringify(ipc) === JSON.stringify(['tray_hide', 'tray_open {"route":null}', 'tray_open {"route":"/settings"}']), JSON.stringify(ipc))
  check('12b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 12c · focus running, night: the flyout drives the main window's timer ──
{
  const { ctx, errors, open } = await app({}, { theme: 'night', tauri: true })
  const main = await open('/today', DESKTOP)
  const tray = await open('/tray', FLYOUT)
  await tray.locator('.kf-tray-btn.is-cta').click()
  await sleep(300)
  const running = await main.evaluate(() => document.title !== undefined)
  await main.clock.runFor(6 * 60_000 + 18_000) // 25:00 → 18:42
  await sleep(500)
  const now = (await tray.locator('.kf-tray-now').innerText()).replace(/\s+/g, ' ')
  check('12c Start focus in the flyout starts the main window’s timer, on the goal', running && /FOCUS · 18:4[12] LEFT GCI homework 1 — NumPy/.test(now), now)
  check('12c the button becomes Pause · Stop', JSON.stringify(await tray.locator('.kf-tray-btn').allInnerTexts()) === JSON.stringify(['Pause', 'Stop']), JSON.stringify(await tray.locator('.kf-tray-btn').allInnerTexts()))
  check('12c night theme', (await tray.evaluate(() => document.documentElement.dataset.theme)) === 'night')
  check('12c fits 340 × 460', await noOverflow(tray))
  await shot(tray, '12c-flyout-focus-night')
  const set = (await calls(main, 'tray_set')).at(-1)?.args
  check('12a the tray K shows the filling focus dot + the menu rows follow', set?.state === 'focus2' && set?.focusLabel === 'Stop focus · 19 min left' && set?.pauseLabel === 'Pause notifications for 1 hour', JSON.stringify(set))
  check('12a the main window told the tray to show (tray_shown)', (await calls(main, 'tray_shown')).some((c) => c.args?.shown === true))

  await tray.getByRole('button', { name: 'Pause' }).click()
  await sleep(300)
  check('12c Pause pauses the main timer', (await tray.locator('.kf-tray-now').innerText()).includes('PAUSED') && (await tray.locator('.kf-tray-btn').first().innerText()) === 'Resume')
  await tray.getByRole('button', { name: 'Stop' }).click()
  await sleep(300)
  check('12c Stop ends the round; Start focus is back', (await tray.locator('.kf-tray-btn.is-cta').count()) === 1 && (await tray.locator('.kf-tray-now').innerText()).includes('Judge test'))
  await shot(tray, '12b-flyout-night-idle')

  // focus done while nobody looks → a toast with Break · Keep going (tray.rs notify_local)
  await tray.locator('.kf-tray-btn.is-cta').click()
  await main.evaluate(() => (document.hasFocus = () => false))
  await main.clock.runFor(25 * 60_000 + 2_000)
  await sleep(500)
  const toast = (await calls(main, 'notify_local')).at(-1)?.args
  check('12e focus done → "25 minutes tended ✿" · Break 5 min · Keep going', toast?.title === '25 minutes tended ✿' && JSON.stringify(toast?.actions) === JSON.stringify([['break', 'Break 5 min'], ['keep', 'Keep going']]), JSON.stringify(toast))
  // its button runs in the main window: Keep going = a fresh round
  await main.evaluate(() => window.__kfNotifyAction('keep', { kind: 'focus_done', taskIds: [] }))
  await sleep(300)
  check('12e Keep going starts a new round', /FOCUS · 2[45]:\d\d LEFT/.test((await tray.locator('.kf-tray-now').innerText()).replace(/\s+/g, ' ')), await tray.locator('.kf-tray-now').innerText())
  check('12c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the Windows app's own reminder sweep + the menu's actions ──
{
  const { ctx, state, errors, open } = await app({ settings: { lock_screen_names: true } }, { tauri: true })
  const main = await open('/today', DESKTOP)
  await main.clock.runFor(31_000) // the next 30-second sweep, with tasks loaded
  await sleep(500)
  const toast = (await calls(main, 'notify_local')).find((c) => c.args?.title?.startsWith('Call the tyre'))?.args
  check('12e a reminder due while the app runs → its toast, Done · Tomorrow', /^Call the tyre supplier · in [89] min$/.test(toast?.title ?? '') && toast?.body === '08:50' && JSON.stringify(toast?.actions) === JSON.stringify([['done', 'Done'], ['tomorrow', 'Tomorrow']]), JSON.stringify(toast))
  check('12a … and the K gets the needs-you dot', (await calls(main, 'tray_set')).at(-1)?.args?.state === 'needs', JSON.stringify((await calls(main, 'tray_set')).at(-1)?.args))
  await main.evaluate(() => window.__kfNotifyAction('tomorrow', JSON.parse(JSON.stringify({ kind: 'task_reminder', taskIds: ['10000000-0000-4000-8000-000000000005'] }))))
  await sleep(600)
  const moved = writesTo(state, 'tasks').flat().find((r) => r?.id === id(TYRE))
  check('12e Tomorrow (from the toast) = tomorrow 09:00 Cairo', moved?.due_at === iso('09:00', 4), JSON.stringify(moved?.due_at))
  await main.evaluate(() => window.__kfTray('seen'))
  await sleep(200)
  check('12a opening the flyout clears the dot', (await calls(main, 'tray_set')).at(-1)?.args?.state === 'normal', JSON.stringify((await calls(main, 'tray_set')).at(-1)?.args))
  await main.evaluate(() => window.__kfTray('pause'))
  await sleep(500)
  const paused = writesTo(state, 'app_settings').at(-1)
  check('12d Pause notifications for 1 hour → notify_paused_until = now + 1h', !!paused?.notify_paused_until && Math.abs(new Date(paused.notify_paused_until) - (cairo(NOW).getTime() + 3_600_000)) < 120_000, paused?.notify_paused_until)
  await main.evaluate(() => window.__kfTray('capture'))
  await sleep(500)
  check('12d Quick capture… opens the command bar', (await main.locator('.kf-overlay-card').count()) > 0)
  await main.keyboard.press('Escape')
  await main.evaluate(() => window.__kfTray({ open: '/activity' }))
  await sleep(500)
  check('12d tray_open(route) lands the main window on it', new URL(main.url()).pathname === '/activity', main.url())
  check('no page errors (main)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 12i · Settings → Notifications writes (desktop day + phone night) ──
for (const [view, theme, tauri] of [[DESKTOP, 'day', true], [PHONE, 'night', false]]) {
  const tag = view === PHONE ? 'phone-night' : 'desktop-day'
  const { ctx, state, errors, open } = await app({ subs: [{ id: 's1', user_id: UID, endpoint: 'https://fcm.googleapis.com/x', keys: {}, device_label: 'Pixel', created_at: FIRST }] }, { theme, tauri })
  const page = await open('/settings', view)
  const card = page.locator('#settings-Notifications, div:has(> div > div > div:text-is("Notifications"))').first()
  await page.getByText('Send a test notification').scrollIntoViewIfNeeded()
  const row = (label) => page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last()
  const toggle = async (label) => {
    await row(label).locator('[role="switch"]').click()
    await sleep(300)
    return writesTo(state, 'app_settings').at(-1)
  }
  const kinds = ['Task reminder', 'Morning digest', 'Evening nudge', 'Focus done']
  check(`12i ${tag} every kind has a switch`, (await Promise.all(kinds.map((k) => row(k).locator('[role="switch"]').count()))).every((n) => n === 1))
  check(`12i ${tag} Task reminder off → task_reminder_on false`, (await toggle('Task reminder'))?.task_reminder_on === false)
  check(`12i ${tag} Quiet hours off → quiet_hours_on false`, (await toggle('Quiet hours'))?.quiet_hours_on === false)
  check(`12i ${tag} lock-screen names on → lock_screen_names true`, (await toggle('Show task names on the lock screen'))?.lock_screen_names === true)
  const from = await page.getByLabel('Quiet from').inputValue().catch(() => '')
  const until = await page.getByLabel('Quiet until').inputValue().catch(() => '')
  check(`12i ${tag} quiet hours from–to read 22:30 to 07:00 (the time field's 12-hour face)`, /^10:30\s?PM$/i.test(from) && /^0?7:00\s?AM$/i.test(until), `${from} → ${until}`)
  await page.getByText('Send a test notification').click()
  await sleep(600)
  if (tauri) {
    const t = (await calls(page, 'notify_local')).at(-1)?.args
    check(`12i ${tag} test (Windows) → a local toast`, t?.title === 'Kai’s Flow', JSON.stringify(t))
    check(`12i ${tag} Windows rows: tray + start with Windows`, (await row('Show in the system tray').count()) === 1 && (await row('Start with Windows').count()) === 1)
    await row('Start with Windows').locator('[role="switch"]').click()
    await row('Show in the system tray').locator('[role="switch"]').click()
    await sleep(300)
    const ipc = (await calls(page)).filter((c) => ['autostart_set', 'tray_shown'].includes(c.cmd)).map((c) => `${c.cmd} ${JSON.stringify(c.args)}`)
    check(`12i ${tag} Start with Windows → autostart_set; tray off → tray_shown false`, ipc.includes('autostart_set {"on":true}') && ipc.includes('tray_shown {"shown":false}'), JSON.stringify(ipc))
  } else {
    check(`12i ${tag} test (web) → notify {kind:'test'}`, state.fn.some((f) => f.name === 'notify' && f.body?.kind === 'test') && (await page.getByText('Sent to 1 device.').count()) === 1)
    check(`12i ${tag} no Windows rows on the web`, (await page.getByText('Start with Windows').count()) === 0)
  }
  await page.getByText('Calm by default.', { exact: false }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await sleep(200)
  await shot(page, `12i-settings-${tag}`)
  check(`12i ${tag} no page errors`, errors.length === 0, errors.join(' | '))
  void card
  await ctx.close()
}

// ── 12j · the history (Activity): same kinds, same glyphs, buttons that work ──
for (const [view, theme] of [[DESKTOP, 'day'], [PHONE, 'night']]) {
  const tag = view === PHONE ? 'phone-night' : 'desktop-day'
  const { ctx, state, errors, open } = await app({}, { theme })
  const page = await open('/activity', view)
  await page.locator('.afilter', { hasText: 'Notifications' }).click()
  await sleep(400)
  const rows = await page.locator('.aitem').allInnerTexts()
  check(`12j ${tag} the Notifications filter lists the three sent notices`, rows.length === 3 && rows[0].includes('Call the tyre supplier · in 10 min') && rows.some((r) => r.includes('Good morning — 3 to tend today')) && rows.some((r) => r.includes('The garden’s ready to close')), JSON.stringify(rows).slice(0, 200))
  check(`12j ${tag} each with its glyph + buttons (Done · Tomorrow / Plan my day · Open / Shut down)`, JSON.stringify(await page.locator('.anotice').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')))) === JSON.stringify(['Done Tomorrow', 'Plan my day Open', 'Shut down']), JSON.stringify(await page.locator('.anotice').allInnerTexts()))
  await shot(page, `12j-history-${tag}`)
  await page.locator('.anotice button', { hasText: 'Done' }).click()
  await sleep(600)
  check(`12j ${tag} Done from the history completes the task`, writesTo(state, 'tasks').flat().find((r) => r?.id === id(TYRE))?.status === 'done')
  await page.locator('.anotice button', { hasText: 'Plan my day' }).click()
  await sleep(900)
  check(`12j ${tag} Plan my day opens the ritual on Today (and the address is clean)`, new URL(page.url()).pathname === '/today' && !page.url().includes('ritual=') && (await page.locator('[role="dialog"]').filter({ hasText: 'Plan my day' }).count()) >= 1, page.url())
  check(`12j ${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the service worker's no-window path, app side: /today?kfAction=done&kfTasks=… runs once ──
{
  const { ctx, state, errors, open } = await app()
  const page = await open(`/today?kfAction=done&kfTasks=${id(TYRE)}`, DESKTOP)
  await sleep(600)
  check('sw → app: ?kfAction=done completes the task, and the address drops the action', writesTo(state, 'tasks').flat().find((r) => r?.id === id(TYRE))?.status === 'done' && !page.url().includes('kfAction'), page.url())
  check('sw → app: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── side by side: the drawing | this build ──
if (DESIGN) {
  const pairs = [['12b', '12b-flyout-day'], ['12c', '12c-flyout-focus-night'], ['12i', '12i-settings-desktop-day'], ['12j', '12j-history-phone-night']]
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } })
  for (const [frame, mine] of pairs) {
    const a = path.join(DESIGN, `design-${frame}.png`)
    const b = path.join(OUT, `${mine}.png`)
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue
    const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
    await page.setContent(`<body style="margin:0;padding:16px;background:#e9e4d8;display:flex;gap:16px;align-items:flex-start;font:13px sans-serif;width:max-content"><div><div>the drawing · ${frame}</div><img src="${img(a)}" style="max-width:1100px"></div><div><div>this build</div><img src="${img(b)}"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
