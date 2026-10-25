// capture-rules (P7e parity audit A2, A5, A6, A10, A11, A19, A21) on the REAL app against a MOCKED
// backend — the fix-tasks / fix-inbox recipe: dev server in `--mode mock` (VITE_SUPABASE_URL=http://127.0.0.1:9),
// a made-up session in localStorage, Playwright answers every REST call and records every write (and
// applies it to the mock rows). Every edge function answers 500, so the AI fill never lands: what's
// checked is the instant local rule. The tray route gets a stub `window.__TAURI_INTERNALS__`.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=i,b,o,p,t picks sections)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5273'
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
const D1 = 'd0000000-0000-4000-8000-000000000001', D2 = 'd0000000-0000-4000-8000-000000000002'
const P1 = 'b0000000-0000-4000-8000-000000000001'
const LINKED = '10000000-0000-4000-8000-000000000001'
const ESSAY = 'https://example.com/calm'
const TASKS = [{
  id: LINKED, title: 'Read the calm interfaces essay', user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso('09:00'),
  scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null,
  someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  external_ref: { source: 'link', id: 'seed-1', url: ESSAY }, created_at: CREATED, updated_at: CREATED,
}]
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ib = (n, over) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const TIMED = 1, SHARED = 2, ENDPOINT = 3
const INBOX = [
  // p7e t1: "a timed card filed with e lands as a task due at 15:00 with nothing on the calendar".
  ib(TIMED, { kind: 'voice', raw_text: 'Call Omar re: pricing Saturday 3pm for 45 minutes', confidence: 0.87, created_at: iso('09:30'),
    ai_parse: { kind: 'task', title: 'Call Omar about pricing', cleaned_text: 'Call Omar about pricing', confidence: 0.87, project_id: P1, domain_id: D1, due_at: iso('15:00', 17), has_time: true, duration_min: 45 } }),
  // The share target joins title + url (capture/shareText); the capture endpoint keeps its url in the payload.
  ib(SHARED, { raw_text: `Calm interfaces essay\n${ESSAY}`, created_at: iso('09:20') }),
  ib(ENDPOINT, { raw_text: 'look at this pricing page\nhttps://example.org/pricing', payload: { source: 'capture', url: 'https://example.org/pricing' }, created_at: iso('09:10') }),
]
// "File captures for me" on (0086): these checks are about the filing rule itself (ai-chat covers it off).
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', auto_file_captures: true, help_seen: ['notice:autofile'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [
  { id: D1, user_id: UID, name: 'Career', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED },
  { id: D2, user_id: UID, name: 'Personal', color: '#C9A55A', sort_order: 1, created_at: CREATED, updated_at: CREATED },
]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: D1, status: 'active', type: 'standard', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: INBOX, projects: PROJECTS, domains: DOMAINS, areas: [], routines: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const flyout = { viewport: { width: 340, height: 460 } }

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at, tauri]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
    // `o` opens a link in a new tab: record it instead.
    window.open = (url) => ((window.__opened = [...(window.__opened ?? []), String(url)]), null)
    if (tauri) window.__TAURI_INTERNALS__ = { invoke: async (cmd) => (cmd === 'autostart_get' ? false : null) }
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime(), !!o.tauri])
  const state = { rows: tables(), writes: [], fn: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      state.fn.push(url.pathname.slice('/functions/v1/'.length))
      return r.fulfill({ status: 500, json: { error: 'mock' } }) // no AI: the local rule is what's on trial
    }
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
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(500)
  }
}
/** Polls until `get` returns something (8 s at most): a filing waits out its own motion before it writes. */
async function until(get, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    const v = get()
    if (v) return v
  }
  return get()
}
const bar = (page) => page.locator('#kf-capture-input')
async function type(page, line) {
  if (!(await bar(page).isVisible().catch(() => false))) await page.keyboard.press('Control+k')
  await bar(page).waitFor({ timeout: 5000 })
  await bar(page).fill(line)
  await sleep(250)
}
const card = (page) => page.locator('.kf-overlay-card')

// ── I: the Inbox — A2 a timed card filed with E; A19 a captured link on the card and the filed task ──
if (want('i')) {
  const { ctx, page, errors, state } = await open('/inbox')
  const w0 = state.writes.length
  const shared = page.locator(`[id="inbox-${iid(SHARED)}"]`)
  const link = shared.locator('a.ib-link')
  check('i1 A19 a shared page shows its link on the card', (await link.getAttribute('href').catch(() => null)) === ESSAY && /example\.com ↗/.test(await text(link)), await text(shared))
  const endpoint = page.locator(`[id="inbox-${iid(ENDPOINT)}"] a.ib-link`)
  check('i1 A19 …and an endpoint capture its url', (await endpoint.getAttribute('href').catch(() => null)) === 'https://example.org/pricing')
  await shot(page, 'i1-inbox-links-day')
  await page.keyboard.press('j')
  await sleep(250)
  await page.keyboard.press('e')
  const filed = await until(() => posts(state, 'tasks', w0).find((t) => t.title === 'Call Omar about pricing'))
  await settle(state)
  check('i2 A2 E files the timed card: due Sat 15:00, the 45 minutes it said', filed?.due_at === iso('15:00', 17) && filed?.duration_min === 45 && filed?.project_id === P1, JSON.stringify(filed && [filed.due_at, filed.duration_min]))
  const block = posts(state, 'calendar_events', w0).find((e) => e.task_id === filed?.id)
  check('i2 A2 …and it is on the calendar, 15:00–15:45', block?.starts_at === iso('15:00', 17) && block?.ends_at === iso('15:45', 17) && block?.type === 'task', JSON.stringify(block && [block.starts_at, block.ends_at]))
  const filedToast = await toastSoon(page, 'Filed "Call Omar about pricing"')
  check('i2 the filing toast says where', filedToast)
  const w1 = state.writes.length
  await page.locator('.kf-toast', { hasText: 'Call Omar about pricing' }).getByRole('button', { name: 'Undo' }).click()
  await settle(state)
  // The block goes with its task: from the calendar cache when one is loaded (unfile → deleteEventsForTask),
  // and on the server by calendar_events.task_id ON DELETE CASCADE (0004) — this mock doesn't cascade.
  const gone = state.writes.slice(w1).find((w) => w.table === 'tasks' && w.method === 'DELETE')
  const blockAfter = state.writes.slice(w1).findIndex((w) => w.table === 'calendar_events')
  check('i3 Undo deletes the filed task (its block cascades), the capture waits again', gone?.query.includes(filed?.id) && (blockAfter === -1 || blockAfter < state.writes.slice(w1).indexOf(gone)) && posts(state, 'inbox_items', w1).some((i) => i.id === iid(TIMED) && i.status === 'pending'), JSON.stringify(state.writes.slice(w1).map((w) => `${w.method} ${w.table}`)))
  await shared.getByRole('button', { name: 'File', exact: true }).click()
  const fromShare = await until(() => posts(state, 'tasks', w0).find((t) => t.external_ref?.url === ESSAY))
  check('i4 A19 filing the shared page keeps its link on the task', fromShare?.external_ref?.source === 'link', JSON.stringify(fromShare?.external_ref))
  check('i no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  const night = await open('/inbox', { theme: 'night' })
  await shot(night.page, 'i1-inbox-links-night')
  await night.ctx.close()
}

// ── B: the command bar (desktop) — A5 repeat, A6 // and <, A10 Esc, A11 event, A19 a typed link ──
if (want('b')) {
  const { ctx, page, errors, state } = await open('/today')
  let w = state.writes.length
  await type(page, 'Stretch every day 7am')
  check('b1 A5 the bar shows the repeat', /daily/i.test(await text(card(page))), (await text(card(page))).replace(/\n/g, ' | '))
  await shot(page, 'b1-bar-repeat-day')
  await bar(page).press('Enter')
  await settle(state)
  const stretch = posts(state, 'tasks', w).find((t) => t.title === 'Stretch')
  check('b1 A5 "every day" sets the repeat and leaves the title; starts tomorrow 07:00 (7am has passed)', stretch?.recurrence_rule === 'FREQ=DAILY' && stretch?.due_at === iso('07:00', 13), JSON.stringify(stretch && [stretch.title, stretch.recurrence_rule, stretch.due_at]))
  check('b1 A5 …its typed time blocks the calendar', posts(state, 'calendar_events', w).some((e) => e.task_id === stretch?.id && e.starts_at === iso('07:00', 13)))

  w = state.writes.length
  await type(page, 'Gym every monday 6pm')
  await bar(page).press('Enter')
  await settle(state)
  const gym = posts(state, 'tasks', w).find((t) => t.title === 'Gym')
  check('b1 A5 "every monday 6pm" is weekly on Monday, from today 18:00', gym?.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO' && gym?.due_at === iso('18:00'), JSON.stringify(gym && [gym.recurrence_rule, gym.due_at]))

  w = state.writes.length
  await type(page, 'Send the quote friday // include the VAT line')
  check('b2 A6 a // Notes chip', /\/\/ notes/i.test(await text(card(page))))
  await bar(page).press('Enter')
  await settle(state)
  const quote = posts(state, 'tasks', w).find((t) => t.title === 'Send the quote')
  check('b2 A6 // makes the rest the notes', quote?.notes === 'include the VAT line' && quote?.due_at?.startsWith('2026-10-16'), JSON.stringify(quote && [quote.title, quote.notes, quote.due_at]))
  w = state.writes.length
  await type(page, 'file taxes <friday')
  await bar(page).press('Enter')
  await settle(state)
  check('b2 A6 <friday is the date and no < is left in the title', posts(state, 'tasks', w).some((t) => t.title === 'file taxes' && t.due_at?.startsWith('2026-10-16')), JSON.stringify(posts(state, 'tasks', w).map((t) => t.title)))

  await type(page, 'call Omar tomorrow 3pm #forecasting')
  const before = await text(card(page))
  await page.keyboard.press('Escape')
  await sleep(300)
  const once = await text(card(page))
  check('b3 A10 the first Esc takes the last chip (→ Forecasting) and keeps the bar and the words', /forecasting/i.test(before) && !/→ forecasting/i.test(once) && (await bar(page).inputValue()) === 'call Omar tomorrow 3pm #forecasting', once.replace(/\n/g, ' | '))
  await shot(page, 'b3-bar-esc-day')
  await page.keyboard.press('Escape')
  await sleep(300)
  check('b3 A10 the next Esc takes the date chip', (await card(page).count()) === 1 && !/tomorrow ·/i.test(await text(card(page))))
  await page.keyboard.press('Escape')
  await sleep(300)
  check('b3 A10 with no chip left, Esc closes the bar', (await card(page).count()) === 0)
  w = state.writes.length
  await type(page, 'call Omar tomorrow 3pm #forecasting')
  await page.keyboard.press('Escape')
  await sleep(200)
  await bar(page).press('Enter')
  await settle(state)
  const plain = posts(state, 'tasks', w).find((t) => t.title?.startsWith('call Omar'))
  check('b3 A10 …and Enter then files the words as words', plain?.title === 'call Omar #forecasting' && plain?.project_id === null && plain?.due_at === iso('15:00', 13), JSON.stringify(plain && [plain.title, plain.project_id]))

  w = state.writes.length
  await type(page, 'Dinner with Reem tomorrow 8pm 1h')
  await bar(page).press('Control+2')
  await sleep(250)
  check('b4 A11 ⌘/Ctrl+2 switches the bar to Event', (await card(page).getByRole('button', { name: 'Event' }).getAttribute('aria-pressed')) === 'true')
  await shot(page, 'b4-bar-event-day')
  await bar(page).press('Enter')
  await settle(state)
  const dinner = posts(state, 'calendar_events', w).find((e) => e.title === 'Dinner with Reem')
  check('b4 A11 Enter makes an event there, that long — not a task', dinner?.type === 'event' && dinner?.starts_at === iso('20:00', 13) && dinner?.ends_at === iso('21:00', 13) && !posts(state, 'tasks', w).length, JSON.stringify(dinner && [dinner.type, dinner.starts_at, dinner.ends_at]))
  check('b4 A11 the toast says when', await toastSoon(page, 'Added to Calendar · Tomorrow · 8:00 PM'))
  w = state.writes.length
  await type(page, 'Eid holiday friday')
  check('b4 A11 the next bar is a Task again', (await card(page).getByRole('button', { name: 'Task' }).getAttribute('aria-pressed')) === 'true')
  await card(page).getByRole('button', { name: 'Event' }).click()
  await bar(page).press('Enter')
  await settle(state)
  const eid = posts(state, 'calendar_events', w).find((e) => e.title === 'Eid holiday')
  check('b4 A11 the switch by click: a date with no time is all day', eid?.all_day === true && eid?.starts_at === '2026-10-16T00:00:00.000Z', JSON.stringify(eid && [eid.all_day, eid.starts_at]))

  w = state.writes.length
  await type(page, 'read https://example.com/essay friday')
  check('b5 A19 a typed link is a chip (its site)', /example\.com/i.test(await text(card(page))))
  await bar(page).press('Enter')
  await settle(state)
  const read = posts(state, 'tasks', w).find((t) => t.title === 'read')
  check('b5 A19 …and the task keeps it as its link', read?.external_ref?.url === 'https://example.com/essay', JSON.stringify(read?.external_ref))
  await page.keyboard.press('?')
  await sleep(400)
  const sheet = await text(page.getByRole('dialog', { name: 'Shortcuts' }))
  check('b6 the cheatsheet lists every …, //, <, Esc, ⌘2 and o', /Repeat/.test(sheet) && /Notes/.test(sheet) && /Date \(<friday\)/.test(sheet) && /Last token back/.test(sheet) && /event/i.test(sheet) && /Open link/.test(sheet), sheet.replace(/\n/g, ' | ').slice(0, 600))
  check('b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()

  const night = await open('/today', { theme: 'night' })
  await type(night.page, 'Gym every monday 6pm #forecasting // legs https://example.com/plan')
  await shot(night.page, 'b1-bar-chips-night')
  await night.page.keyboard.press('Control+2')
  await sleep(250)
  await shot(night.page, 'b4-bar-event-night')
  await night.ctx.close()
}

// ── O: A19 — `o` opens a task's link; the editor shows it ──
if (want('o')) {
  const { ctx, page, errors } = await open('/tasks?list=all')
  await page.locator(`#task-${LINKED}`).waitFor({ timeout: 8000 }).catch(() => {})
  await page.keyboard.press('j')
  await sleep(250)
  await page.keyboard.press('o')
  await sleep(300)
  check('o1 A19 o on the focused task opens its link', JSON.stringify(await page.evaluate(() => window.__opened ?? [])) === JSON.stringify([ESSAY]), JSON.stringify(await page.evaluate(() => window.__opened ?? [])))
  await page.goto(`${BASE}/tasks/${LINKED}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const a = page.locator(`a[href="${ESSAY}"]`)
  await a.first().waitFor({ timeout: 8000 }).catch(() => {})
  check('o2 A19 the task editor shows the link ("example.com ↗")', /example\.com ↗/i.test(await text(a)), await text(a))
  await shot(page, 'o2-editor-link')
  check('o no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: the phone capture sheet — the same chips, the Task | Event switch ──
if (want('p')) for (const theme of ['day', 'night']) {
  const { ctx, page, errors, state } = await open('/today', { view: phone, theme })
  await page.keyboard.press('n')
  await bar(page).waitFor({ timeout: 5000 })
  await bar(page).fill('Gym every monday 6pm // legs')
  await sleep(300)
  const sheet = await text(page.locator('.kf-capture-chips'))
  check(`p1 phone ${theme}: repeat, notes chips and the Task | Event switch`, /every week on monday|weekly/i.test(sheet) && /notes/i.test(sheet) && /Event/.test(sheet), sheet.replace(/\n/g, ' | '))
  await shot(page, `p1-phone-sheet-${theme}`)
  if (theme === 'day') {
    const w = state.writes.length
    await page.locator('.kf-capture-chips').getByRole('button', { name: 'Event' }).click()
    await page.getByRole('button', { name: 'Add' }).click()
    await settle(state)
    const ev = posts(state, 'calendar_events', w).find((e) => e.title === 'Gym')
    check('p2 phone: Event by tap makes a weekly event', ev?.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO' && ev?.starts_at === iso('18:00'), JSON.stringify(ev && [ev.recurrence_rule, ev.starts_at]))
  }
  check(`p ${theme} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── T: A21 — the tray flyout's capture is the bar's rule ──
if (want('t')) {
  const { ctx, page, errors, state } = await open('/tray', { view: flyout, tauri: true })
  const field = page.getByPlaceholder('Write it down…')
  await field.waitFor({ timeout: 8000 })
  let w = state.writes.length
  await field.fill('Call the supplier tomorrow 3pm #forecasting *calls')
  await field.press('Enter')
  await settle(state)
  const t = posts(state, 'tasks', w).find((x) => x.title === 'Call the supplier')
  check('t1 A21 read at once on the tray: date on the user clock, #project, *label', t?.due_at === iso('15:00', 13) && t?.project_id === P1 && JSON.stringify(t?.labels) === '["calls"]', JSON.stringify(t && [t.due_at, t.project_id, t.labels]))
  check('t1 A21 a typed time makes its block', posts(state, 'calendar_events', w).some((e) => e.task_id === t?.id && e.starts_at === iso('15:00', 13)))
  check('t1 A21 the toast says where', await toastSoon(page, 'Added to Tomorrow · Forecasting'))
  await shot(page, 't1-tray-captured')
  w = state.writes.length
  await field.fill('think about the garden shed')
  await field.press('Enter')
  await settle(state)
  check('t2 A21 a plain line goes to the Inbox and says so', posts(state, 'inbox_items', w).some((i) => i.raw_text === 'think about the garden shed') && (await toastSoon(page, 'Added to Inbox')))
  check('t2 A21 the AI is asked after the landing (parse-capture called, its failure loses nothing)', state.fn.includes('parse-capture'), JSON.stringify(state.fn))
  check('t no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
