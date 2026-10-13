// P7e parity audit (2026-10-13): the core Akiflow verbs on the REAL app against a MOCKED backend, counted
// in keys/taps — capture, schedule, triage, time-block — plus cheap probes of claims the audit makes
// (Akiflow nav/calendar keys, recurrence in capture, Ctrl+Z). Read-only evidence: it changes no app code.
// Recipe = fix-tasks/verify.mjs: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9 (--mode mock), a
// made-up session, Playwright answers every REST call and records the writes.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Tuesday 13 Oct 2026, Cairo (UTC+3), 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5268'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
/** A finding, not a pass/fail: what the app did when an Akiflow key/verb was tried. */
const note = (name, detail) => {
  results.push({ name, ok: null, detail: String(detail) })
  console.log(`NOTE ${name} — ${detail}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000e7e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 13) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const D1 = 'd0000000-0000-4000-8000-000000000001'
const P1 = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const REPORT = 1, TYRE = 2, INVOICE = 3
const TASKS = [
  task(REPORT, 'Write the monthly report', { due_at: iso('09:00'), duration_min: 60, project_id: P1, domain_id: D1 }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:00') }),
  task(INVOICE, 'Send the invoice', { due_at: iso('09:00') }),
]
const ib = (n, over) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00'), ...over,
})
const INBOX = [
  ib(1, { raw_text: 'call omar about pricing saturday 3pm', confidence: 0.9, ai_parse: { kind: 'task', title: 'Call Omar about pricing', cleaned_text: 'Call Omar about pricing Saturday 3pm', confidence: 0.9, project_id: P1, domain_id: D1, due_at: iso('15:00', 17), has_time: true } }),
  ib(2, { raw_text: 'renew hosting before the 15th', confidence: 0.9, ai_parse: { kind: 'task', title: 'Renew hosting', cleaned_text: 'renew hosting before the 15th', confidence: 0.9, due_at: iso('09:00', 15), has_time: false } }),
  ib(3, { raw_text: 'that article about sleep', confidence: 0.4, ai_parse: { kind: 'note', title: 'Article about sleep', cleaned_text: 'that article about sleep', confidence: 0.4 } }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [{ id: D1, user_id: UID, name: 'Career', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED }]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: D1, status: 'active', type: 'standard', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: INBOX, projects: PROJECTS, domains: DOMAINS, areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, at]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [JSON.stringify(session), UID, cairo('09:00').getTime()])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/')) return r.fulfill({ status: 503, json: { error: 'mock: no functions' } })
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
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(500)
  }
}
const toastText = (page) => page.locator('.kf-toast-msg').allInnerTexts().then((t) => t.join(' | '), () => '')

// ── C: capture (Akiflow: Cmd+E/Cmd+K → type → Enter = 2 keys) ──
if (want('c')) {
  const { ctx, page, errors, state } = await open('/today')
  const w0 = state.writes.length
  await page.keyboard.press('n')
  await sleep(400)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.type('Call John tomorrow 3pm 1h #forecast !!')
  await sleep(300)
  await shot(page, 'c1-capture-typed')
  await page.keyboard.press('Enter')
  await settle(state)
  const t = posts(state, 'tasks', w0).find((r) => /Call John/.test(r.title ?? ''))
  const ev = posts(state, 'calendar_events', w0).find((r) => r.task_id === t?.id)
  check('c1 desktop capture = 2 keys (n, Enter): the bar opens focused', focused === 'Capture', focused)
  check('c1 "Call John tomorrow 3pm 1h #forecast !!" → task "Call John", Wed 14 Oct 15:00 Cairo, 60 min, project Forecasting, priority !!', !!t && t.title === 'Call John' && t.due_at === iso('15:00', 14) && t.duration_min === 60 && t.project_id === P1 && t.priority === 2, JSON.stringify(t && { title: t.title, due: t.due_at, dur: t.duration_min, p: t.project_id, pr: t.priority }))
  check('c1 the typed time also puts it on the calendar as a block (time-blocked in the same 2 keys)', !!ev && ev.starts_at === iso('15:00', 14), JSON.stringify(ev && { s: ev.starts_at, e: ev.ends_at }))
  note('c1 toast after capture', await toastText(page))
  // Recurrence in the bar (Akiflow parses "every week").
  const w1 = state.writes.length
  await page.keyboard.press('n')
  await sleep(300)
  await page.keyboard.type('Stretch every day 7am')
  await page.keyboard.press('Enter')
  await settle(state)
  const r = posts(state, 'tasks', w1).at(-1)
  const ib = posts(state, 'inbox_items', w1).at(-1)
  note('c2 "Stretch every day 7am" (Akiflow sets a daily repeat)', r ? `task title="${r.title}" recurrence_rule=${r.recurrence_rule} due=${r.due_at}` : ib ? `inbox item "${ib.raw_text}"` : 'nothing written')
  check('c2 recurrence typed in the bar is NOT parsed (gap)', !r?.recurrence_rule, r?.recurrence_rule ?? 'none')
  // Akiflow's `<` deadline and `//` description syntax.
  const w2 = state.writes.length
  await page.keyboard.press('n')
  await sleep(300)
  await page.keyboard.type('Ship the quote <friday // include the VAT line')
  await page.keyboard.press('Enter')
  await settle(state)
  const q = posts(state, 'tasks', w2).at(-1) ?? posts(state, 'inbox_items', w2).at(-1)
  note('c3 "Ship the quote <friday // include the VAT line" (Akiflow: deadline + description)', JSON.stringify(q && { title: q.title ?? q.raw_text, due: q.due_at, notes: q.notes }))
  check('c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K: Akiflow's single-key navigation and calendar keys, tried on the real app ──
if (want('k')) {
  const { ctx, page, errors } = await open('/today')
  for (const key of ['i', 'u', 'g', '/', 'Control+,', 'Control+1', 'Control+2', 'Control+3', 'a', 'Control+f']) {
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
    await sleep(800)
    await page.locator('body').click({ position: { x: 640, y: 20 } }).catch(() => {})
    await page.keyboard.press(key)
    await sleep(600)
    const dialog = await page.locator('[role="dialog"]').count()
    note(`k1 Akiflow key "${key}" on Today`, `path=${new URL(page.url()).pathname} dialogs=${dialog}`)
  }
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(800)
  await page.keyboard.press('Control+/')
  await sleep(600)
  note('k2 Ctrl+/ (our Search)', `dialogs=${await page.locator('[role="dialog"]').count()} search input=${await page.locator('input[type="search"], input[placeholder*="earch"]').count()}`)
  await page.keyboard.press('Escape')
  // Calendar view keys (Akiflow D/W/M, 1–7, -/=, Cmd+T)
  await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const view = () => page.evaluate(() => [...document.querySelectorAll('.fc-view')].map((v) => [...v.classList].find((c) => /^fc-.*-view$/.test(c) && c !== 'fc-view')).join(',') + ' | ' + (document.querySelector('.fc-toolbar-title, .cal-title, h1')?.textContent ?? '').trim())
  const before = await view()
  for (const key of ['m', 'w', 'd', '3', '=', '-']) {
    await page.locator('body').click({ position: { x: 640, y: 20 } }).catch(() => {})
    await page.keyboard.press(key)
    await sleep(600)
    note(`k3 Akiflow calendar key "${key}"`, `${before} → ${await view()}`)
  }
  check('k no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── U: done + Ctrl+Z (Akiflow: E, Cmd+Z) ──
if (want('u')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await page.keyboard.press('j')
  await sleep(300)
  const w0 = state.writes.length
  await page.keyboard.press('e')
  await settle(state)
  const done = posts(state, 'tasks', w0).find((r) => r.status === 'done')
  check('u1 j, e completes the focused task (2 keys)', !!done, JSON.stringify(done && { id: done.id, status: done.status }))
  const w1 = state.writes.length
  await page.keyboard.press('Control+z')
  await settle(state)
  const back = posts(state, 'tasks', w1).find((r) => r.id === done?.id && r.status === 'todo')
  note('u2 Ctrl+Z right after (Akiflow Cmd+Z undo)', back ? 'reopened by Ctrl+Z' : `no reopen write; toast: ${await toastText(page)}`)
  check('u no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── T: inbox triage (Akiflow: one key per item — E done · P plan · Cmd+S someday) ──
if (want('t')) {
  const { ctx, page, errors, state } = await open('/inbox')
  await shot(page, 't0-inbox')
  const w0 = state.writes.length
  const keys = []
  const press = async (k) => { keys.push(k); await page.keyboard.press(k); await sleep(900) }
  await press('j')
  const ringed = await page.evaluate(() => document.activeElement?.id || document.querySelector('[data-focused="true"], .is-focused')?.id || '')
  await press('e')
  await press('e')
  await press('d')
  await settle(state)
  const tasks = posts(state, 'tasks', w0)
  const inbox = posts(state, 'inbox_items', w0)
  check('t1 three captures triaged in 4 keys (j to focus, e file, e file, d dismiss)', inbox.filter((r) => r.status === 'filed').length === 2 && inbox.some((r) => r.id === iid(3) && r.status === 'dismissed'), `keys=${keys.join(' ')} focus=${ringed} inbox=${JSON.stringify(inbox.map((r) => [r.id.slice(-2), r.status]))}`)
  check('t1 e files with the AI\'s suggestion: Omar → Sat 17 Oct 15:00, Forecasting; hosting → Thu 15 Oct', tasks.some((r) => r.title === 'Call Omar about pricing' && r.due_at === iso('15:00', 17) && r.project_id === P1) && tasks.some((r) => r.title === 'Renew hosting' && r.due_at === iso('09:00', 15)), JSON.stringify(tasks.map((r) => [r.title, r.due_at, r.project_id && 'P1'])))
  const omar = tasks.find((r) => r.title === 'Call Omar about pricing')
  const omarBlock = posts(state, 'calendar_events', w0).find((r) => r.task_id === omar?.id)
  note('t1 the timed suggestion (Sat 15:00) filed by e — calendar block?', omarBlock ? `yes ${omarBlock.starts_at}` : 'no block: filed as a task due 15:00 with nothing on the calendar (the bar makes a block for the same line)')
  note('t2 inbox keys besides e/d/s/↵', 'no key marks a capture done on the spot (Akiflow E) or opens a date picker (Akiflow P); the date comes from the AI suggestion or the card\'s Suggested field')
  check('t no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S: schedule (Akiflow: P → type/pick → Enter) ──
if (want('s')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await page.keyboard.press('j')
  await sleep(300)
  const focusedId = await page.evaluate(() => document.querySelector('.is-focused, [data-focused="true"], [aria-current="true"]')?.id ?? document.activeElement?.id ?? '')
  const w0 = state.writes.length
  await page.keyboard.press('2')
  await settle(state)
  const moved = posts(state, 'tasks', w0).at(-1)
  check('s1 j, 2 = Tomorrow in 2 keys', !!moved && moved.due_at?.startsWith('2026-10-14'), JSON.stringify(moved && { id: moved.id, due: moved.due_at, focusedId }))
  // A specific day + time by mouse: right-click → Plan… → Pick date & time… → day → Set time → time → Done.
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(1200)
  let clicks = 0
  const click = async (loc) => { clicks++; await loc.click(); await sleep(450) }
  const rowTitle = page.locator(`#task-${id(TYRE)}`).getByText('Call the tyre supplier', { exact: true }).first()
  await rowTitle.scrollIntoViewIfNeeded()
  clicks++
  await rowTitle.click({ button: 'right' })
  await sleep(450)
  await click(page.getByRole('menuitem', { name: /^Plan…/ }).first())
  await shot(page, 's2-plan-menu')
  await click(page.getByRole('button', { name: /Pick date & time/ }).first())
  await click(page.locator('.kf-pk-day:not(.is-out)', { hasText: /^16$/ }).first())
  const w1 = state.writes.length
  const setTime = page.getByRole('button', { name: 'Set time' }).last()
  if (await setTime.count()) {
    await click(setTime)
    const row = page.locator('.kf-pk-time', { hasText: '15:00' }).first()
    await row.scrollIntoViewIfNeeded()
    await click(row)
    await click(page.getByRole('button', { name: 'Done' }).last())
  }
  await settle(state)
  const s2 = posts(state, 'tasks', w0).filter((r) => r.id === id(TYRE)).at(-1)
  check(`s2 a day + time by mouse took ${clicks} clicks (right-click, Plan…, Pick date & time…, 16, Set time, 15:00, Done)`, !!s2 && s2.due_at === iso('15:00', 16), JSON.stringify(s2 && { due: s2.due_at }))
  check('s no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B: time-block (Akiflow: drag the task onto the calendar = 1 drag) ──
if (want('b')) {
  const { ctx, page, errors, state } = await open('/calendar')
  // The rail opens by itself only over an overdue pile; otherwise it's one click on its tab (remembered).
  const folded = (await page.locator('.cal-rail.is-folded').count()) > 0
  if (folded) {
    await page.locator('.cal-rail-tab').first().click()
    await sleep(700)
  }
  note('b0 the rail was folded on arrival (one click to open; the fold is remembered)', String(folded))
  const card = page.locator('.cal-rail .unscheduled-task', { hasText: 'Call the tyre supplier' }).first()
  const cards = await page.locator('.cal-rail .unscheduled-task').count()
  const w0 = state.writes.length
  if (await card.count()) {
    await page.evaluate(() => {
      const slot = document.querySelector('td.fc-timegrid-slot-lane[data-time="14:00:00"]')
      const sc = slot?.closest('.fc-scroller')
      if (slot && sc) sc.scrollTop = slot.closest('tr').offsetTop - sc.clientHeight / 2
    })
    await sleep(300)
    const lane = await page.locator('td.fc-timegrid-slot-lane[data-time="14:00:00"]').boundingBox()
    const col = await page.locator('td.fc-timegrid-col[data-date="2026-10-13"]').boundingBox()
    const from = await card.boundingBox()
    const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const b = { x: col.x + col.width / 2, y: lane.y + 5 }
    await page.mouse.move(a.x, a.y)
    await sleep(150)
    await page.mouse.down()
    await sleep(150)
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(a.x + ((b.x - a.x) * i) / 20, a.y + ((b.y - a.y) * i) / 20)
      await sleep(30)
    }
    await sleep(300)
    await page.mouse.up()
    await settle(state)
  }
  const ev = posts(state, 'calendar_events', w0).find((r) => r.task_id === id(TYRE))
  check('b1 one drag from the calendar rail onto 14:00 makes a block linked to the task', !!ev && ev.starts_at === iso('14:00'), `rail cards=${cards} ${JSON.stringify(ev && { s: ev.starts_at, e: ev.ends_at })}`)
  await shot(page, 'b1-after-drag')
  // The click path: Plan ▾ on a rail card → Next free slot → confirm.
  const w1 = state.writes.length
  const inv = page.locator('.cal-rail .unscheduled-task', { hasText: 'Send the invoice' }).first()
  let clicks = 0
  if (await inv.count()) {
    clicks++
    await inv.locator('.cal-plan-btn').click()
    await sleep(500)
    const slot = page.getByRole('menuitem', { name: /Next free slot/ }).first()
    const slotBtn = (await slot.count()) ? slot : page.getByRole('button', { name: /Next free slot/ }).first()
    if (await slotBtn.count()) {
      clicks++
      await slotBtn.click()
      await sleep(500)
      const confirm = page.getByRole('button', { name: /^(Put it there|Schedule|Confirm|Block it|Plan it)/ }).first()
      if (await confirm.count()) {
        clicks++
        await confirm.click()
      }
    }
    await settle(state)
  }
  const ev2 = posts(state, 'calendar_events', w1).find((r) => r.task_id === id(INVOICE))
  note('b2 Plan ▾ → Next free slot → confirm', `${clicks} clicks; block=${JSON.stringify(ev2 && { s: ev2.starts_at, e: ev2.ends_at })}`)
  check('b no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: phone capture (tap +, type, tap Add = 2 taps) ──
if (want('p')) {
  const { ctx, page, errors, state } = await open('/today', { view: phone })
  const w0 = state.writes.length
  await page.getByRole('button', { name: /^Capture — tap to type/ }).first().tap()
  await sleep(600)
  await page.keyboard.type('Buy printer ink friday')
  await page.getByRole('button', { name: 'Add', exact: true }).first().tap()
  await settle(state)
  const t = posts(state, 'tasks', w0).at(-1)
  check('p1 phone capture = 2 taps (+, Add): "Buy printer ink friday" → task due Fri 16 Oct', !!t && t.title === 'Buy printer ink' && t.due_at?.startsWith('2026-10-16'), JSON.stringify(t && { title: t.title, due: t.due_at }))
  note('p1 toast', await toastText(page))
  await shot(page, 'p1-phone-after-capture')
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => r.ok === false)
console.log(`\n${results.filter((r) => r.ok === true).length} passed, ${failed.length} failed, ${results.filter((r) => r.ok === null).length} notes`)
