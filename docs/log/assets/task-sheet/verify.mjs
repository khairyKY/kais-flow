// The phone task sheet (Task Sheet.dc.html 4a–4n) on the REAL app, signed in against a MOCKED backend —
// builder D's recipe (docs/log/assets/gestures/verify-pages.mjs, reused by today-phone/verify.mjs): the dev
// server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits
// in localStorage, and Playwright answers every REST call with the drawing's sample task (Sunday 27 Sep
// 2026, Cairo). Writes are answered 201, go nowhere, and are recorded so each edit can be checked.
//   node verify.mjs <outDir> [baseUrl] [designDir] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:5243'
const DESIGN = process.argv[4] // Task Sheet.dc.html frames rendered to design-<id>.png (optional)
const PW = process.argv[5] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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

// ── the drawing's task: Sunday 27 Sep 2026, Cairo = UTC+3, the clock at 12:50 ──
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const NOW = '12:50'
const CREATED = iso('09:00', 21)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const dom = (n, name, color) => ({ id: `d0000000-0000-4000-8000-00000000000${n}`, user_id: UID, name, color, sort_order: n, created_at: CREATED, updated_at: CREATED })
const DOMAINS = [dom(1, 'Shaheen', '#C9A961'), dom(2, 'Work', '#7E9A76'), dom(3, 'Personal', '#C98A9A')]
const proj = (n, name, d) => ({ id: `p0000000-0000-4000-8000-00000000000${n}`, user_id: UID, domain_id: DOMAINS[d].id, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED })
const PROJECTS = [proj(1, 'Shaheen Tasks', 0), proj(2, 'Shaheen Website', 0), proj(3, 'Forecasting app', 1), proj(4, 'Home', 2), proj(5, 'Finance', 1)]
PROJECTS[1].color = '#8FA9B8'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const TYRE = 1, SUB1 = 2, SUB2 = 3, SUB3 = 4, Q3 = 5, FORE = 6, BANK = 7, PORT = 8, DENT = 9
function tasksFor(s) {
  const rows = [
    task(TYRE, 'Call the tyre supplier about the invoice', {
      due_at: iso('15:00'), duration_min: 30, project_id: PROJECTS[0].id, domain_id: DOMAINS[0].id, priority: 2, reminder_at: iso('14:50'),
      labels: ['calls'], notes: s.noNotes ? null : 'They sent the wrong batch last time',
      ...(s.recurring ? { recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' } : null),
      ...(s.done ? { status: 'done', completed_at: iso('11:24') } : null),
    }),
    task(SUB1, 'Find the invoice number', { parent_task_id: id(TYRE), ...(s.sub3 || s.done ? { status: 'done', completed_at: iso('10:00') } : null) }),
    task(SUB2, 'Ask about delivery dates', { parent_task_id: id(TYRE), ...(s.done ? { status: 'done', completed_at: iso('11:00') } : null) }),
    task(Q3, 'Send the Q3 numbers to Priya', { top3: true, due_at: iso('09:00', 27 - 64), duration_min: 30, project_id: PROJECTS[4].id }),
    task(FORE, 'Plan and implement the forecasting logic', { top3: true, duration_min: 30, project_id: PROJECTS[2].id, due_at: iso('17:00') }),
    task(BANK, 'Call the bank about the mortgage', { duration_min: 15, project_id: PROJECTS[3].id, due_at: iso('18:00') }),
    task(PORT, 'Fix your portfolio', { status: 'done', completed_at: iso('08:40'), due_at: iso('08:00') }),
    task(DENT, 'Book the dentist', { due_at: iso('19:00') }),
  ]
  if (s.sub3) rows.push(task(SUB3, 'Ask for a credit note on the wrong batch', { parent_task_id: id(TYRE) }))
  return rows
}
const ev = (n, title, from, to, taskN = null) => ({
  id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false,
  task_id: taskN ? id(taskN) : null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: taskN ? 'task' : 'event', color: null, created_at: CREATED, updated_at: CREATED,
})
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const FILED = { id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'call the tyre people about the invoice', transcript: null, ai_parse: null, confidence: null, status: 'filed', filed_task_id: id(TYRE), payload: null, snoozed_until: null, created_at: iso('08:10'), updated_at: iso('08:10') }
function tables(s) {
  return {
    tasks: tasksFor(s),
    calendar_events: [ev(1, 'Deep work — forecasting', '09:00', '10:30'), ev(2, 'Standup', '13:30', '14:00'), ...(s.noBlock ? [] : [ev(3, 'Call the tyre supplier about the invoice', '15:00', '15:30', TYRE)])],
    projects: PROJECTS,
    domains: DOMAINS,
    app_settings: [SETTINGS],
    inbox_items: [FILED, { ...FILED, id: 'i0000000-0000-4000-8000-000000000002', raw_text: 'book dentist', status: 'pending', filed_task_id: null }],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

/** Opens `route` at the scene's data. `hold` delays REST answers (loading). */
async function open(route, s = {}, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // The one-time "Updated to vX" toast held a toast slot, so "Link copied" queued behind it (v1.0.26).
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { hold: o.hold ?? 0, rows: tables(s), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/search')) {
      return r.fulfill({ json: { results: [{ entity_type: 'task', entity_id: id(TYRE), title: 'Call the tyre supplier about the invoice', snippet: null, score: 1 }] } })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (state.hold) await sleep(state.hold)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: o.hold ? 'domcontentloaded' : 'networkidle' })
  await sleep(o.hold ? 900 : 900)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(450)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const sheetOf = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('.ts-top') })
const sheetBox = (page) => sheetOf(page).boundingBox()
const param = (page) => new URL(page.url()).searchParams.get('task')
/** The task rows written since `from`. */
const taskWrites = (state, from = 0) => state.writes.slice(from).filter((w) => w.table === 'tasks' && w.method === 'POST').map((w) => w.body)
const chipTexts = (page) => sheetOf(page).locator('.ts-chips .kf-chip:not(input)').allInnerTexts()
async function sheetBasics(page, name, errors) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at 390`, wide <= 390, wide)
  const small = await page.evaluate(() => {
    const out = []
    for (const root of document.querySelectorAll('[role="dialog"]')) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px in the sheet`, small.length === 0, small.slice(0, 4).join(' | '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}
/** Open the tyre task from the Tasks list by tapping its row. */
async function fromTasks(s = {}, o = {}) {
  const env = await open('/tasks', s, o)
  await tap(env.cdp, env.page.locator(`[id="task-${id(TYRE)}"]`).getByText('Call the tyre supplier about the invoice'))
  await sleep(400)
  return env
}
/** Pretend the on-screen keyboard is up (300px): the sheet reads visualViewport like a real IME. */
const keyboard = (page, px) =>
  page.evaluate((h) => {
    const vv = window.visualViewport
    if (h) Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - h })
    else delete vv.height
    vv.dispatchEvent(new Event('resize'))
  }, px)

for (const theme of ['day', 'night']) {
  const tag = (frame) => (theme === 'night' ? { '4a': '4l-a', '4b': '4l-b' }[frame] : frame)

  // 4a / 4l-a — open from Tasks: medium, over the list; every chip; star writes + Saved flicker.
  {
    const name = `${tag('4a')}-${theme}`
    const { ctx, page, cdp, errors, state } = await fromTasks({}, { theme })
    const box = await sheetBox(page)
    check(`${name} tap a Tasks row → the sheet, over Tasks (?task=)`, box && param(page) === id(TYRE) && new URL(page.url()).pathname === '/tasks' && (await page.locator(`[id="task-${id(Q3)}"]`).count()) === 1, page.url())
    check(`${name} medium detent = 60% (506 of 844)`, box && Math.abs(box.height - 506) <= 2, box?.height)
    if (theme === 'day') {
      const chips = await chipTexts(page)
      check(`${name} one chip per field, unset dashed (Repeat)`, JSON.stringify(chips) === JSON.stringify(['TODAY · 15:00', '30M', 'SHAHEEN TASKS', 'P2', 'REPEAT', '10M BEFORE', 'CALLS']), JSON.stringify(chips))
      check(`${name} Repeat is a dashed pill`, (await sheetOf(page).locator('.ts-chips .kf-chip', { hasText: 'Repeat' }).evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'dashed')
      check(`${name} notes, subtasks 0/2, the block card`, (await sheetOf(page).locator('.ts-notes').inputValue()) === 'They sent the wrong batch last time' && (await text(sheetOf(page).locator('.ts-sec'))) === 'SUBTASKS · 0/2')
      check(`${name} title row: check · serif title · star · ⋯ (48 targets)`, await sheetOf(page).locator('.ts-top').evaluate((r) => [...r.querySelectorAll('.ts-box, .kf-star, .ts-more')].every((b) => b.getBoundingClientRect().width >= 48) && getComputedStyle(r.querySelector('.ts-title')).fontFamily.includes('Source Serif')))
      check(`${name} footer: Created 21 Sep · Mark complete`, (await text(sheetOf(page).locator('.ts-foot'))).includes('CREATED 21 SEP') && (await sheetOf(page).getByRole('button', { name: 'Mark complete' }).count()) === 1)
      const w0 = state.writes.length
      await tap(cdp, sheetOf(page).locator('.kf-star'))
      const w = taskWrites(state, w0)
      check(`${name} star → one tasks write, top3 true`, w.length === 1 && w[0].top3 === true && w[0].id === id(TYRE), JSON.stringify(w.map((r) => r.top3)))
      check(`${name} "✓ Saved" flickers in the footer`, (await text(sheetOf(page).locator('.ts-save'))) === 'SAVED' && /is-saved/.test(await sheetOf(page).locator('.ts-save').getAttribute('class')))
      await sleep(1700)
      check(`${name} …then "Edited 12:50"`, (await text(sheetOf(page).locator('.ts-save'))) === 'EDITED 12:50', await text(sheetOf(page).locator('.ts-save')))
      await tap(cdp, sheetOf(page).locator('.kf-star'))
      await sleep(1700)
    }
    await shot(page, name)
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4b / 4l-b — full height: ✕ in the handle row, 3 subtasks (1 done), block card, Focus pill.
  {
    const name = `${tag('4b')}-${theme}`
    const { ctx, page, cdp, errors, state } = await fromTasks({ sub3: true }, { theme })
    await tap(cdp, sheetOf(page).getByRole('button', { name: 'Expand sheet' }))
    await sleep(400)
    const box = await sheetBox(page)
    check(`${name} handle tap → full height (796)`, box && Math.abs(box.height - 796) <= 2, box?.height)
    const x = await sheetOf(page).getByRole('button', { name: 'Close' }).boundingBox()
    check(`${name} ✕ sits in the 48px handle row`, x && x.y - box.y < 48 && x.height === 48, JSON.stringify(x))
    check(`${name} subtasks 1/3`, (await text(sheetOf(page).locator('.ts-sec'))) === 'SUBTASKS · 1/3')
    check(`${name} block card: On your calendar · Sun 27 · 15:00–15:30 · 30m · Change time · Unschedule`, (await text(sheetOf(page).locator('.ts-block'))).replace(/\n/g, ' ') === 'On your calendar SUN 27 · 15:00–15:30 · 30M Change time Unschedule', await text(sheetOf(page).locator('.ts-block')))
    check(`${name} Focus pill`, (await sheetOf(page).getByRole('button', { name: 'Focus · 25:00' }).count()) === 1)
    await sheetOf(page).locator('.ts-focus').scrollIntoViewIfNeeded()
    await shot(page, name)
    if (theme === 'day') {
      // A subtask checks off in place with Done + Undo; a new one adds inline.
      const w0 = state.writes.length
      await tap(cdp, sheetOf(page).getByRole('checkbox', { name: 'Complete "Ask about delivery dates"' }))
      const w = taskWrites(state, w0)
      await shot(page, `${name}-toast`) // a toast docks at the top while a sheet is up
      check(`${name} subtask check → done write + "Done" toast`, w.some((r) => r.id === id(SUB2) && r.status === 'done') && (await toasts(page)).includes('Done'), JSON.stringify(await toasts(page)))
      const w1 = state.writes.length
      await sheetOf(page).getByPlaceholder('Add a subtask').fill('Ask for the delivery note')
      await sheetOf(page).getByPlaceholder('Add a subtask').press('Enter')
      await sleep(300)
      const add = taskWrites(state, w1)
      check(`${name} Add a subtask → a child row`, add.some((r) => r.title === 'Ask for the delivery note' && r.parent_task_id === id(TYRE)), JSON.stringify(add.map((r) => r.title)))
      // The subtask's "Done" toast sits just above the sheet footer (MK 6l) — over the Focus pill; let it go first.
      await page.waitForFunction(() => !document.querySelector('.kf-toast'), null, { timeout: 9000 }).catch(() => {})
      await tap(cdp, sheetOf(page).getByRole('button', { name: 'Focus · 25:00' }))
      await sleep(600)
      check(`${name} Focus → /focus on this task`, new URL(page.url()).pathname === '/focus' && (await sheetOf(page).count()) === 0, page.url())
    }
    await sheetBasics(page, name, errors.filter((e) => !/AudioContext|play\(\)/.test(e)))
    await ctx.close()
  }
  if (theme === 'night') continue

  // 4c — the title with the keyboard up: full height, footer hidden; Enter saves the new title.
  {
    const name = '4c-day'
    const { ctx, page, cdp, errors, state } = await fromTasks()
    await tap(cdp, sheetOf(page).locator('.ts-title'))
    await keyboard(page, 300)
    await sleep(500)
    const box = await sheetBox(page)
    check(`${name} keyboard up → full, sheet bottom on the keyboard`, box && Math.abs(box.y + box.height - (844 - 300)) <= 2 && (await sheetOf(page).getByRole('button', { name: 'Close' }).count()) === 1, JSON.stringify(box))
    check(`${name} the footer hides while typing`, (await sheetOf(page).locator('.ts-foot').count()) === 0)
    check(`${name} the title is a field with the focus ring`, await sheetOf(page).locator('.ts-title').evaluate((e) => document.activeElement === e && getComputedStyle(e).boxShadow !== 'none'))
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' and the credit note')
    await shot(page, name)
    const w0 = state.writes.length
    await page.keyboard.press('Enter')
    await sleep(300)
    await keyboard(page, 0)
    await sleep(300)
    const w = taskWrites(state, w0)
    check(`${name} Enter (the keyboard's Done) saves the title`, w.length === 1 && w[0].title === 'Call the tyre supplier about the invoice and the credit note', JSON.stringify(w.map((r) => r.title)))
    check(`${name} keyboard down → footer back, Saved`, (await text(sheetOf(page).locator('.ts-save'))) === 'SAVED')
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4n — swipe down mid-drag; edits are already saved; release past 30% closes, Back entry popped.
  {
    const name = '4n-day'
    const { ctx, page, cdp, errors, state } = await fromTasks()
    await sheetOf(page).locator('.ts-notes').fill('They sent the wrong batch last time — ask for batch 7')
    await sheetOf(page).locator('.ts-sub-add').focus() // blur the notes: they save
    await sleep(200)
    const notes = taskWrites(state).filter((r) => r.notes?.includes('batch 7'))
    check(`${name} notes save on blur`, notes.length === 1, notes.length)
    await page.locator('.ts-sub-add').evaluate((e) => e.blur())
    await sheetOf(page).locator('.ts-top').scrollIntoViewIfNeeded()
    const h = await sheetOf(page).getByRole('button', { name: 'Expand sheet' }).boundingBox()
    const box = await sheetBox(page)
    const x = h.x + h.width / 2
    let y = h.y + 12
    await touch(cdp, 'touchStart', [{ x, y }])
    for (let i = 0; i < 12; i++) {
      y += (box.height * 0.42) / 12
      await touch(cdp, 'touchMove', [{ x, y }])
      await sleep(30)
    }
    await sleep(200)
    await shot(page, name)
    const moved = await sheetOf(page).evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m42)
    check(`${name} mid-drag the sheet follows the finger (~42%)`, Math.abs(moved - box.height * 0.42) < 30, Math.round(moved))
    await touch(cdp, 'touchEnd', [])
    await sleep(700)
    check(`${name} release past 30% closes; ?task popped (Back won't reopen it)`, (await sheetOf(page).count()) === 0 && param(page) === null && new URL(page.url()).pathname === '/tasks', page.url())
    check(`${name} the edit made before the swipe stays written`, taskWrites(state).some((r) => r.notes?.includes('batch 7')))
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4m — not on the calendar: Suggest a time, three slots before the due time; a tap places the block.
  {
    const name = '4m-day'
    const { ctx, page, cdp, errors, state } = await fromTasks({ noBlock: true, noNotes: true })
    await tap(cdp, sheetOf(page).getByRole('button', { name: 'Expand sheet' }))
    await sheetOf(page).locator('.ts-focus').scrollIntoViewIfNeeded()
    await sleep(300)
    await shot(page, name)
    const slots = await sheetOf(page).locator('.kf-pk-slot').allInnerTexts()
    check(`${name} three slots: Today 13:00 · 14:00 · 14:30 (the first pre-selected)`, JSON.stringify(slots) === JSON.stringify(['Today 13:00', '14:00', '14:30']) && (await sheetOf(page).locator('.kf-pk-slot').first().getAttribute('aria-pressed')) === 'true', JSON.stringify(slots))
    check(`${name} "Free before 15:00 · tap one to place it"`, (await text(sheetOf(page).locator('.ts-hint'))) === 'Free before 15:00 · tap one to place it')
    check(`${name} empty notes read "Add notes"`, (await sheetOf(page).locator('.ts-notes').getAttribute('placeholder')) === 'Add notes')
    const w0 = state.writes.length
    await tap(cdp, sheetOf(page).locator('.kf-pk-slot', { hasText: '14:00' }))
    const ev = state.writes.slice(w0).filter((w) => w.table === 'calendar_events').map((w) => w.body)
    check(`${name} one tap places the block 14:00–14:30`, ev.length === 1 && ev[0].task_id === id(TYRE) && ev[0].starts_at === iso('14:00') && ev[0].ends_at === iso('14:30'), JSON.stringify(ev))
    check(`${name} …and the section becomes the block card`, (await text(sheetOf(page).locator('.ts-block'))).includes('14:00–14:30'))
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4d — project chip → the picker sheet over the sheet; a tap applies + closes; search doubles as create.
  // tasks-noise (Kai 2026-10-07): the chip opens "Move to" — each domain, its areas, its projects, then None.
  {
    const name = '4d-day'
    const { ctx, page, cdp, errors, state } = await fromTasks()
    await tap(cdp, sheetOf(page).locator('.ts-chips .kf-chip', { hasText: 'Shaheen Tasks' }))
    await sleep(300)
    const picker = page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder('Find a domain, area or project') })
    await shot(page, name)
    const rows = (await picker.locator('.kf-as-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    check(`${name} picker: each domain then its projects, the current one checked, None last`, JSON.stringify(rows) === JSON.stringify(['Shaheen DOMAIN', 'Shaheen Tasks PROJECT', 'Shaheen Website PROJECT', 'Work DOMAIN', 'Forecasting app PROJECT', 'Finance PROJECT', 'Personal DOMAIN', 'Home PROJECT', 'None NO PROJECT, AREA OR DOMAIN']) && (await picker.locator('.kf-as-row[aria-current="true"]').innerText()).startsWith('Shaheen Tasks'), JSON.stringify(rows))
    check(`${name} a second scrim over the task sheet`, (await page.locator('[role="dialog"]').count()) === 2)
    const w0 = state.writes.length
    await tap(cdp, picker.locator('.kf-as-row', { hasText: 'Forecasting app' }))
    await sleep(300)
    const w = taskWrites(state, w0)
    check(`${name} tap → applies (project + domain) and closes`, w.length === 1 && w[0].project_id === PROJECTS[2].id && w[0].domain_id === DOMAINS[1].id && (await page.locator('[role="dialog"]').count()) === 1, JSON.stringify(w.map((r) => r.project_id)))
    check(`${name} Saved in the task sheet, chip reads the new project`, (await text(sheetOf(page).locator('.ts-save'))) === 'SAVED' && (await chipTexts(page)).includes('FORECASTING APP'))
    await tap(cdp, sheetOf(page).locator('.ts-chips .kf-chip', { hasText: 'Forecasting app' }))
    await sleep(300)
    await page.locator('[role="dialog"]').getByPlaceholder('Find a domain, area or project').fill('Tyres')
    await sleep(200)
    const w1 = state.writes.length
    await tap(cdp, page.locator('.kf-as-row', { hasText: 'Create project “Tyres”' }))
    await sleep(300)
    const made = state.writes.slice(w1).filter((x) => x.table === 'projects').map((x) => x.body)
    const moved = taskWrites(state, w1)
    check(`${name} search → "Create project “Tyres”" makes the project and moves the task`, made.length === 1 && made[0].name === 'Tyres' && moved.some((r) => r.project_id === made[0].id), JSON.stringify(made))
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // Every other chip opens its kit picker and writes: date (Tomorrow = tomorrow 09:00), duration, priority, repeat, remind, labels.
  {
    const name = 'chips-day'
    const { ctx, page, cdp, errors, state } = await fromTasks()
    const pick = async (chip, row, sheetTitle) => {
      const w0 = state.writes.length
      await tap(cdp, sheetOf(page).locator('.ts-chips .kf-chip', { hasText: chip }))
      await sleep(300)
      const title = await page.locator('[role="dialog"]').last().innerText()
      await tap(cdp, page.locator('[role="dialog"]').last().locator('.kf-as-row', { hasText: row }).first())
      await sleep(400)
      return { w: taskWrites(state, w0), titled: title.includes(sheetTitle) }
    }
    // plan-replan (2026-10-07): the date chip opens the Plan list; its Tomorrow, first thing = tomorrow 09:00.
    let r = await pick('Today · 15:00', 'Tomorrow, first thing', 'Plan')
    check(`${name} date chip → the Plan list; Tomorrow, first thing = tomorrow 09:00 Cairo`, r.titled && r.w.length === 1 && r.w[0].due_at === iso('09:00', 28), JSON.stringify(r.w.map((x) => x.due_at)))
    check(`${name} date chip reads Tomorrow · 09:00`, (await chipTexts(page))[0] === 'TOMORROW · 09:00', (await chipTexts(page))[0])
    r = await pick('30m', '1h', 'Duration')
    check(`${name} duration chip → 1h`, r.titled && r.w.length === 1 && r.w[0].duration_min === 60, JSON.stringify(r.w.map((x) => x.duration_min)))
    r = await pick('P2', 'Critical', 'Priority')
    check(`${name} priority chip → Critical (P1)`, r.titled && r.w.length === 1 && r.w[0].priority === 1 && (await chipTexts(page)).includes('P1'))
    r = await pick('Repeat', 'Weekly', 'Repeat')
    check(`${name} repeat chip → Weekly (lavender chip now)`, r.titled && r.w.length === 1 && r.w[0].recurrence_rule === 'FREQ=WEEKLY' && (await chipTexts(page)).includes('WEEKLY'))
    check(`${name} a repeating task: next dates + "Done for today"`, (await text(sheetOf(page).locator('.ts-next'))).startsWith('NEXT · MON 5 OCT 09:00') && (await page.getByRole('button', { name: 'Done for today' }).count()) === 1, await text(sheetOf(page).locator('.ts-next')))
    r = await pick('before', '30 min before', 'Remind')
    check(`${name} remind chip → 30 min before the (new) due`, r.titled && r.w.length === 1 && r.w[0].reminder_at === iso('08:30', 28) && (await chipTexts(page)).includes('30M BEFORE'), JSON.stringify(r.w.map((x) => x.reminder_at)))
    const w0 = state.writes.length
    await sheetOf(page).locator('.ts-label-add').fill('garage')
    await sheetOf(page).locator('.ts-label-add').press('Enter')
    await sleep(300)
    check(`${name} + Label adds one`, taskWrites(state, w0).some((x) => JSON.stringify(x.labels) === '["calls","garage"]'))
    r = await pick('garage', 'Remove label', 'garage')
    check(`${name} a label chip → Remove label`, r.w.length === 1 && JSON.stringify(r.w[0].labels) === '["calls"]')
    await shot(page, name)
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4e / 4f — ⋯: Duplicate · Copy link · Delete. Delete: the sheet leaves, then "Moved to Trash · Undo".
  {
    const name = '4e-day'
    const { ctx, page, cdp, errors, state } = await fromTasks()
    await tap(cdp, sheetOf(page).locator('.ts-more'))
    await sleep(300)
    const menu = page.locator('[role="dialog"]').last()
    await shot(page, name)
    const rows = (await menu.locator('.kf-as-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    // plan-replan (2026-10-07): Make goal of the day leads the sheet's ⋯ (the task isn't the goal).
    check(`${name} ⋯ = Make goal of the day · Duplicate · Copy link · Delete (last, terra, Undo 6s)`, JSON.stringify(rows) === JSON.stringify(['Make goal of the day', 'Duplicate', 'Copy link', 'Delete UNDO 6S']) && (await menu.locator('.kf-as-row.is-destructive').innerText()).startsWith('Delete'), JSON.stringify(rows))
    check(`${name} header: title + project · 30m · due`, (await menu.innerText()).includes('SHAHEEN TASKS · 30M · TODAY · 15:00'))
    const w0 = state.writes.length
    await tap(cdp, menu.locator('.kf-as-row', { hasText: 'Duplicate' }))
    await sleep(300)
    const dup = taskWrites(state, w0)
    check(`${name} Duplicate → a new open copy + "Duplicated · Undo"`, dup.length === 1 && dup[0].id !== id(TYRE) && dup[0].title === 'Call the tyre supplier about the invoice' && dup[0].status === 'todo' && (await toasts(page)).includes('Duplicated'), JSON.stringify(await toasts(page)))
    await tap(cdp, sheetOf(page).locator('.ts-more'))
    await tap(cdp, page.locator('[role="dialog"]').last().locator('.kf-as-row', { hasText: 'Copy link' }))
    await sleep(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    check(`${name} Copy link → /tasks/<id> on the clipboard + toast`, clip === `${BASE}/tasks/${id(TYRE)}` && (await toasts(page)).includes('Link copied'), clip)
    await sheetBasics(page, name, errors)
    await ctx.close()
  }
  {
    const { ctx, page, cdp, state } = await fromTasks()
    await tap(cdp, sheetOf(page).locator('.ts-more'))
    const w0 = state.writes.length
    await tap(cdp, page.locator('[role="dialog"]').last().locator('.kf-as-row', { hasText: 'Delete' }))
    await sleep(900)
    await shot(page, '4f-day')
    const del = taskWrites(state, w0)
    check('4f-day Delete → sheet gone, row to Trash (deleted_at), block too', (await sheetOf(page).count()) === 0 && del.some((r) => r.id === id(TYRE) && r.deleted_at) && state.writes.slice(w0).some((x) => x.table === 'calendar_events' && x.body?.deleted_at), JSON.stringify(del.map((r) => r.deleted_at)))
    check('4f-day toast "Moved to Trash" with Undo, no confirm', (await toasts(page)).includes('Moved to Trash') && (await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(await toasts(page)))
    check('4f-day the row left the list behind', (await page.locator(`[id="task-${id(TYRE)}"]`).count()) === 0)
    await ctx.close()
  }

  // 4g — recurring: rule in words, the next two dates, "Done for today" completes this one.
  {
    const name = '4g-day'
    const { ctx, page, cdp, errors, state } = await fromTasks({ recurring: true })
    await shot(page, name)
    check(`${name} Repeat chip: Every weekday`, (await chipTexts(page)).includes('EVERY WEEKDAY'), JSON.stringify(await chipTexts(page)))
    check(`${name} Next · Mon 28 Sep 15:00 · then Tue 29`, (await text(sheetOf(page).locator('.ts-next'))) === 'NEXT · MON 28 SEP 15:00 · THEN TUE 29', await text(sheetOf(page).locator('.ts-next')))
    const w0 = state.writes.length
    await tap(cdp, sheetOf(page).getByRole('button', { name: 'Done for today' }))
    await sleep(900)
    const w = taskWrites(state, w0)
    check(`${name} Done for today → this one done, the next spawned for Mon 28 15:00, Undo`, w.some((r) => r.id === id(TYRE) && r.status === 'done') && w.some((r) => r.id !== id(TYRE) && r.due_at === iso('15:00', 28) && r.status === 'todo') && (await toasts(page)).includes('Done'), JSON.stringify(w.map((r) => [r.status, r.due_at])))
    check(`${name} the sheet closed`, (await sheetOf(page).count()) === 0 && param(page) === null)
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4h — completed: struck title, the done stamp, Reopen (secondary) in place of the primary.
  {
    const name = '4h-day'
    const { ctx, page, cdp, errors, state } = await open(`/tasks?task=${id(TYRE)}`, { done: true })
    await shot(page, name)
    check(`${name} title struck, "Done · Sun 27 · 11:24" under it`, (await sheetOf(page).locator('.ts-title.is-done').count()) === 1 && (await text(sheetOf(page).locator('.ts-done'))) === 'DONE · SUN 27 · 11:24')
    check(`${name} footer: Done 11:24 · Reopen (secondary), no Mark complete`, (await text(sheetOf(page).locator('.ts-save'))) === 'DONE 11:24' && /kf-button--secondary/.test(await sheetOf(page).getByRole('button', { name: 'Reopen' }).getAttribute('class')) && (await page.getByRole('button', { name: 'Mark complete' }).count()) === 0)
    check(`${name} chips keep full contrast (not dimmed)`, await sheetOf(page).locator('.ts-chips').evaluate((e) => getComputedStyle(e).opacity === '1'))
    const w0 = state.writes.length
    await tap(cdp, sheetOf(page).getByRole('button', { name: 'Reopen' }))
    const w = taskWrites(state, w0)
    check(`${name} Reopen → open again, "Reopened · Undo", the sheet stays`, w.some((r) => r.id === id(TYRE) && r.status === 'todo') && (await toasts(page)).includes('Reopened') && (await page.getByRole('button', { name: 'Mark complete' }).count()) === 1)
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4i — a cold /tasks/:id with nothing cached: Tasks behind, the sheet at once with its skeleton.
  {
    const name = '4i-day'
    const { ctx, page, state } = await open(`/tasks/${id(TYRE)}`, {}, { hold: 6000 })
    await sleep(600) // the sheet's 300ms entrance
    await shot(page, name)
    const sheet = page.locator('[role="dialog"]').first()
    check(`${name} cold /tasks/:id → /tasks?task=<id> (the link still works)`, new URL(page.url()).pathname === '/tasks' && param(page) === id(TYRE), page.url())
    check(`${name} skeleton inside the sheet + a disabled Mark complete`, (await sheet.locator('[role="status"][aria-busy="true"]').count()) === 1 && (await sheet.getByRole('button', { name: 'Mark complete' }).isDisabled()), await sheet.innerText().catch(() => ''))
    state.hold = 0
    await sleep(6500)
    check(`${name} …and the task fills it in when it lands`, (await sheetOf(page).locator('.ts-title').inputValue().catch(() => '')) === 'Call the tyre supplier about the invoice')
    await ctx.close()
  }

  // 4j — not found (deleted on another device): the fallen cherry, one line, Close.
  {
    const name = '4j-day'
    const { ctx, page, cdp, errors } = await open(`/today?task=${id(99)}`)
    await shot(page, name)
    const sheet = page.locator('[role="dialog"]').first()
    check(`${name} fallen cherry + "This task was deleted on another device." + Close`, (await sheet.innerText()).includes('This task was deleted on another device.') && /cherry\/fallen/.test(await sheet.locator('img').getAttribute('src')))
    await tap(cdp, sheet.getByRole('button', { name: 'Close' }))
    await sleep(400)
    check(`${name} Close → gone, over the page it came from`, (await page.locator('[role="dialog"]').count()) === 0 && page.url().endsWith('/today'), page.url())
    await sheetBasics(page, name, errors)
    await ctx.close()
  }

  // 4k — offline: the chip under the title; the changed chip keeps its ring; footer "Pending sync".
  {
    const name = '4k-day'
    const { ctx, page, cdp, errors } = await fromTasks()
    await ctx.setOffline(true)
    await sleep(400)
    await tap(cdp, sheetOf(page).locator('.ts-chips .kf-chip').first())
    await tap(cdp, page.locator('[role="dialog"]').last().locator('.kf-as-row', { hasText: 'Tomorrow, first thing' }).first())
    await sleep(900)
    await shot(page, name)
    check(`${name} offline chip under the title`, (await text(sheetOf(page).locator('.ts-offline'))) === 'Offline — changes will sync')
    check(`${name} footer: ○ Pending sync`, (await text(sheetOf(page).locator('.ts-save'))) === 'PENDING SYNC' && /is-pending/.test(await sheetOf(page).locator('.ts-save').getAttribute('class')))
    check(`${name} the changed chip (date → Tomorrow 09:00) keeps its selected ring`, (await sheetOf(page).locator('.ts-chips .kf-chip').first().getAttribute('aria-pressed')) === 'true' && (await chipTexts(page))[0] === 'TOMORROW · 09:00')
    await ctx.setOffline(false)
    await sheetBasics(page, name, errors.filter((e) => !/fetch|network/i.test(e)))
    await ctx.close()
  }

  // Back closes the sheet (browser/WebView history, and the overlay stack Android Back walks); a cold
  // link closes to the page under it.
  {
    const name = 'back-day'
    const { ctx, page, errors } = await fromTasks()
    await page.goBack()
    await sleep(500)
    check(`${name} history Back → sheet gone, /tasks`, (await sheetOf(page).count()) === 0 && page.url().endsWith('/tasks'), page.url())
    await page.goForward()
    await sleep(600)
    check(`${name} Forward → it opens again`, (await sheetOf(page).count()) === 1)
    await page.keyboard.press('Escape') // lib/overlayStack — the same closeTopOverlay Android Back calls
    await sleep(600)
    check(`${name} Esc / Android Back (overlay stack) → closes and pops ?task`, (await sheetOf(page).count()) === 0 && page.url().endsWith('/tasks'), page.url())
    await page.goto(`${BASE}/tasks/${id(TYRE)}`, { waitUntil: 'networkidle' })
    await sleep(800)
    check(`${name} cold /tasks/:id → Tasks behind + the sheet`, (await sheetOf(page).count()) === 1 && (await page.locator(`[id="task-${id(Q3)}"]`).count()) === 1 && param(page) === id(TYRE), page.url())
    await page.mouse.click(195, 60) // the scrim
    await sleep(600)
    check(`${name} scrim tap on a cold link → /tasks (param dropped, no Back needed)`, (await sheetOf(page).count()) === 0 && page.url().endsWith('/tasks'), page.url())
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // Opened from Today, Inbox, Calendar and Search — always over the page it came from.
  {
    const name = 'from-today'
    const { ctx, page, cdp, errors } = await open('/today')
    await tap(cdp, page.locator(`[id="task-${id(Q3)}"]`).getByText('Send the Q3 numbers to Priya'))
    await sleep(400)
    await shot(page, name)
    check(`${name} a Top 3 row → the sheet over Today`, (await sheetOf(page).locator('.ts-title').inputValue()) === 'Send the Q3 numbers to Priya' && new URL(page.url()).pathname === '/today' && (await page.locator('.tp').count()) === 1, page.url())
    await page.keyboard.press('Escape')
    await sleep(500)
    check(`${name} closes back to /today`, page.url().endsWith('/today'))
    await sheetBasics(page, name, errors)
    await ctx.close()
  }
  {
    const name = 'from-inbox'
    const { ctx, page, cdp, errors } = await open(`/inbox?focus=${FILED.id}`)
    await tap(cdp, page.getByRole('button', { name: 'open task →' }))
    await sleep(400)
    await shot(page, name)
    check(`${name} a filed capture's "open task →" → its task's sheet over the Inbox`, (await sheetOf(page).locator('.ts-title').inputValue()) === 'Call the tyre supplier about the invoice' && new URL(page.url()).pathname === '/inbox', page.url())
    await sheetBasics(page, name, errors)
    await ctx.close()
  }
  {
    const name = 'from-calendar'
    const { ctx, page, cdp, errors } = await open('/calendar')
    // Kai 2026-10-03: a task block on the phone calendar opens as its task — the sheet at once, no block sheet first.
    const block = page.locator('.pc-block', { hasText: 'Call the tyre supplier' }).first()
    await block.scrollIntoViewIfNeeded().catch(() => {})
    await tap(cdp, block.locator('.pc-name'))
    await sleep(500)
    await shot(page, name)
    check(`${name} a task block → the sheet over the calendar, in one tap`, (await sheetOf(page).count()) === 1 && (await page.locator('[role="dialog"]').count()) === 1 && new URL(page.url()).pathname === '/calendar' && param(page) === id(TYRE), page.url())
    await sheetBasics(page, name, errors)
    await ctx.close()
  }
  {
    const name = 'from-search'
    const { ctx, page, cdp, errors } = await open('/today')
    await tap(cdp, page.locator('.tp-bar').getByRole('button', { name: 'Search' }))
    await page.getByPlaceholder('Search the garden…').fill('tyre')
    await sleep(900)
    await tap(cdp, page.getByRole('button', { name: 'Call the tyre supplier about the invoice' }).last()) // the hit, not the Today row under the overlay
    await sleep(500)
    check(`${name} a task hit → the sheet over the page (not a jump to Tasks)`, (await sheetOf(page).count()) === 1 && new URL(page.url()).pathname === '/today' && param(page) === id(TYRE), page.url())
    await sheetBasics(page, name, errors)
    await ctx.close()
  }
}

// ── Desktop 1280: a task still opens the full editor page, unchanged. ──
for (const theme of ['day', 'night']) {
  const name = `desktop-${theme}`
  const { ctx, page, errors, state } = await open('/tasks', {}, { view: desktop, theme })
  await page.locator(`[id="task-${id(TYRE)}"]`).getByText('Call the tyre supplier about the invoice').click()
  await sleep(700)
  await shot(page, name)
  check(`${name} row click → /tasks/:id editor page, no sheet`, new URL(page.url()).pathname === `/tasks/${id(TYRE)}` && (await page.locator('[role="dialog"]').count()) === 0 && (await page.getByText('Delete task').count()) === 1, page.url())
  if (theme === 'day') {
    await page.evaluate(() => [...document.querySelectorAll('input')].find((i) => i.value === 'Call the tyre supplier about the invoice')?.setAttribute('data-title', ''))
    const title = page.locator('[data-title]')
    await title.fill('Call the tyre supplier today')
    const w0 = state.writes.length
    await title.press('Enter')
    await sleep(300)
    check(`${name} the editor's title still saves on blur`, taskWrites(state, w0).some((r) => r.title === 'Call the tyre supplier today'))
    const w1 = state.writes.length
    await page.locator('textarea').first().focus()
    await page.locator('textarea').first().blur()
    check(`${name} an untouched notes blur writes nothing (the shared draft only writes real changes)`, taskWrites(state, w1).length === 0)
  }
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Side by side: the design frame | this build, same state. ──
if (DESIGN) {
  const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 })
  const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`
  for (const [frame, ours] of [['4a', '4a-day'], ['4b', '4b-day'], ['4c', '4c-day'], ['4n', '4n-day'], ['4m', '4m-day'], ['4d', '4d-day'], ['4e', '4e-day'], ['4f', '4f-day'], ['4g', '4g-day'], ['4h', '4h-day'], ['4i', '4i-day'], ['4j', '4j-day'], ['4k', '4k-day'], ['4l-a', '4l-a-night'], ['4l-b', '4l-b-night']]) {
    const d = path.join(DESIGN, `design-${frame}.png`)
    const o = path.join(OUT, `${ours}.png`)
    if (!fs.existsSync(d) || !fs.existsSync(o)) continue
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:12px;font:12px monospace;color:#fff;align-items:flex-start"><div><div>design ${frame}</div><img src="${uri(d)}" style="width:390px"></div><div><div>build ${ours}</div><img src="${uri(o)}" style="width:390px"></div></body>`)
    await page.screenshot({ path: path.join(OUT, `side-${frame}.png`), fullPage: true })
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
