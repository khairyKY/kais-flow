// Wave M pickers on the REAL pages, signed in against a MOCKED backend (same harness as
// docs/log/assets/gestures/verify-pages.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST call with sample rows. Writes are recorded and
// answered 201 — no real account, token or network. Browser clock zone = Africa/Cairo.
// node verify-pages.mjs <outDir> [baseUrl]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5247'
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Cairo calendar + wall clock → instant (the app's rule: a picked day lands at 09:00 Cairo)
const cairoKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d)
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const cairoIso = (k, hhmm = '09:00') => {
  const [y, m, d] = k.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  const off = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(t).map((x) => [x.type, Number(x.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - t
  }
  return new Date(wall - off(wall - off(wall))).toISOString()
}
const today = cairoKey(new Date())
const same = (a, b) => a && b && Date.parse(a) === Date.parse(b)

const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const task = (id, title, over = {}) => ({
  id, title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso(now), scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: iso(now - 20 * 864e5), updated_at: iso(now - 864e5), ...over,
})
const TASKS = [
  task('10000000-0000-4000-8000-000000000001', 'Call the tyre supplier about the invoice', { top3: true, duration_min: 30 }),
  task('10000000-0000-4000-8000-000000000002', 'Review Kai', { top3: true, due_at: iso(now - 64 * 864e5), duration_min: 30 }),
  task('10000000-0000-4000-8000-000000000003', 'Search for a good node.js source to study from', { top3: true, duration_min: 30, due_at: cairoIso(today, '09:00') }),
  task('10000000-0000-4000-8000-000000000004', 'Gym — upper body', { duration_min: 60, scheduled_start: iso(now + 2 * 36e5), scheduled_end: iso(now + 3 * 36e5) }),
  task('10000000-0000-4000-8000-000000000005', 'Buy milk', { due_at: cairoIso(today, '09:00') }),
]
const EVENTS = [{
  id: 'e0000000-0000-4000-8000-000000000001', user_id: UID, title: 'Gym — upper body', starts_at: iso(now + 2 * 36e5), ends_at: iso(now + 3 * 36e5), all_day: false,
  task_id: TASKS[3].id, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'task', color: null, created_at: iso(now - 864e5), updated_at: iso(now - 864e5),
}]
const INBOX = [{
  id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Book the dentist for next month', transcript: null, ai_parse: null, confidence: null,
  status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso(now - 36e5), updated_at: iso(now - 36e5),
}]
const PROJECT = { id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: null, name: 'Shaheen Tasks', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: iso(now - 30 * 864e5), updated_at: iso(now - 864e5) }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(view, theme, route, { projects = [PROJECT] } = {}) {
  const ctx = await browser.newContext({ viewport: view.viewport, hasTouch: view.touch, isMobile: view.touch, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo' })
  await ctx.addInitScript(([t, s]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', s)
    localStorage.setItem('kf.today.more-open', '1')
  }, [theme, JSON.stringify(session)])
  const writes = []
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { /* not JSON */ }
      writes.push({ table, method: req.method(), body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = { tasks: TASKS, calendar_events: EVENTS, projects, inbox_items: INBOX, app_settings: [SETTINGS] }[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(700)
  const cdp = view.touch ? await ctx.newCDPSession(page) : null
  // the last write to `table` for row `id` (the outbox flushes async)
  const wrote = async (table, id) => {
    for (let i = 0; i < 30; i++) {
      const w = writes.filter((x) => x.table === table).map((x) => (Array.isArray(x.body) ? x.body : [x.body])).flat().filter((b) => b?.id === id)
      if (w.length) return w.at(-1)
      await sleep(150)
    }
    return null
  }
  return { ctx, page, cdp, errors, writes, wrote }
}

const tid = (n) => TASKS[n - 1].id
const rowOf = (page, n) => page.locator(`[id="task-${tid(n)}"]`)
const dialog = (page) => page.locator('[role="dialog"]').last()
const heading = async (page) => (await dialog(page).locator('[id]').first().innerText()).split('\n')[0]
const noNative = async (page) => (await page.locator('input[type="date"],input[type="time"],input[type="datetime-local"]').count()) === 0
const cell = (page, k) => page.locator(`[data-day="${k}"]`)
async function pickDay(page, k, tapIt) {
  const month = await page.locator('.kf-pk-month > span').innerText()
  const want = new Date(k + 'T12:00:00Z').toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (month !== want) await tapIt(page.getByRole('button', { name: 'Next month' }))
  await tapIt(cell(page, k))
}
async function swipe(cdp, loc, dx) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(200)
  const b = await loc.boundingBox()
  const x0 = b.x + 70
  const y0 = b.y + Math.min(b.height / 2, 28)
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await t('touchStart', [{ x: x0, y: y0 }])
  for (let i = 1; i <= 16; i++) {
    await t('touchMove', [{ x: x0 + (dx * i) / 16, y: y0 }])
    await sleep(16)
  }
  await sleep(150)
  await t('touchEnd', [])
  await sleep(700)
}
const phone = { viewport: { width: 390, height: 844 }, touch: true }
const desktop = { viewport: { width: 1280, height: 800 }, touch: false }
const tap = (l) => l.tap()
const click = (l) => l.click()

for (const theme of ['day', 'night']) {
  // ── Tasks, phone: ⋯ → Pick date… and the swipe's Pick date ──
  {
    const id = `tasks-phone-${theme}`
    const { ctx, page, cdp, errors, wrote } = await open(phone, theme, '/tasks?list=all')
    const r5 = rowOf(page, 5)
    await r5.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    await r5.getByRole('button', { name: /More actions/ }).tap()
    await sleep(400)
    // plan-replan (2026-10-07): ⋯ → Plan… is one list (the old quick picks + Next free slot, each with
    // its line); its Pick date & time… is the date sheet, which no longer repeats the quick picks.
    await page.locator('.kf-as-row', { hasText: 'Plan…' }).tap()
    await sleep(450)
    const labels = (await dialog(page).locator('.kf-plan .kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0])
    check(`${id} ⋯ → Plan…: the quick picks + Next free slot, Someday + No date (task has a date); Today ticked`, JSON.stringify(labels) === JSON.stringify(['Today', 'Next free slot', 'Tomorrow, first thing', 'This weekend', 'Next week', 'Pick date & time…', 'Someday', 'No date']) && (await page.locator('.kf-as-row[aria-current="true"]').innerText()).startsWith('Today'), JSON.stringify(labels))
    await page.locator('.kf-plan .kf-as-row', { hasText: 'Pick date & time…' }).tap()
    await sleep(450)
    check(`${id} → Pick date & time… = the full date sheet, task title as meta, no quick picks`, (await heading(page)) === 'Pick date & time' && /buy milk/i.test(await dialog(page).locator('.kf-pk-meta').innerText()) && Math.abs((await dialog(page).boundingBox()).height - 796) <= 1 && (await page.locator('.kf-pk-picks').count()) === 0, await heading(page))
    check(`${id} no native date input`, await noNative(page))
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    const k = addDays(today, 3)
    await pickDay(page, k, tap)
    await page.getByRole('button', { name: 'Done' }).tap()
    const w = await wrote('tasks', tid(5))
    check(`${id} day + Done → due_at = ${k} 09:00 Cairo`, same(w?.due_at, cairoIso(k)), w?.due_at)
    await sleep(400)
    await swipe(cdp, rowOf(page, 1), 120)
    await rowOf(page, 1).locator('.kf-swipe-act', { hasText: 'Plan' }).tap()
    await sleep(450)
    check(`${id} swipe → Plan opens the same Plan list`, (await heading(page)) === 'Plan' && (await page.locator('.kf-plan .kf-as-row').count()) >= 6)
    await page.locator('.kf-plan .kf-as-row', { hasText: 'Tomorrow, first thing' }).tap()
    const w1 = await wrote('tasks', tid(1))
    check(`${id} Tomorrow, first thing = tomorrow 09:00 Cairo`, same(w1?.due_at, cairoIso(addDays(today, 1))), w1?.due_at)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Today, phone: ⋯ → Pick date… → Set time (the day's calendar) ──
  {
    const id = `today-phone-${theme}`
    const { ctx, page, errors, wrote } = await open(phone, theme, '/today')
    const r3 = rowOf(page, 3)
    await r3.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    await r3.getByRole('button', { name: /More actions/ }).tap()
    await sleep(400)
    await page.locator('.kf-as-row', { hasText: 'Plan…' }).tap() // plan-replan: Plan… → Pick date & time…
    await sleep(450)
    await page.locator('.kf-plan .kf-as-row', { hasText: 'Pick date & time…' }).tap()
    await sleep(450)
    check(`${id} Top 3 ⋯ → Plan… → Pick date & time… → date sheet`, (await heading(page)) === 'Pick date & time' && (await cell(page, today).getAttribute('aria-selected')) === 'true')
    check(`${id} has-items dot on today (cached tasks/events)`, (await cell(page, today).getAttribute('class')).includes('has-items'))
    await page.getByRole('button', { name: 'Set time' }).tap()
    await sleep(350)
    const gymRow = page.locator('.kf-pk-time', { hasText: 'Gym — upper body' })
    check(`${id} Set time → "Time · Today …", the Gym block is a busy row with its chip`, (await heading(page)) === 'Time' && /today ·/i.test(await dialog(page).locator('.kf-pk-meta').innerText()) && (await gymRow.count()) === 1 && (await gymRow.getAttribute('class')).includes('is-busy'), await dialog(page).locator('.kf-pk-meta').innerText())
    check(`${id} opens on the task's time (09:00 selected)`, (await page.locator('.kf-pk-time[aria-selected="true"]').innerText()).startsWith('09:00'))
    await page.screenshot({ path: path.join(OUT, `${id}-time.png`) })
    const slots = page.locator('.kf-pk-slot')
    let want
    if (await slots.count()) {
      want = (await slots.first().innerText()).slice(0, 5)
      await slots.first().tap()
    } else {
      want = '21:15'
      await page.locator('.kf-pk-time', { hasText: want }).tap()
    }
    await page.getByRole('button', { name: 'Done' }).tap()
    const w = await wrote('tasks', tid(3))
    check(`${id} free slot + Done → due_at today ${want} Cairo`, same(w?.due_at, cairoIso(today, want)), `${w?.due_at} (${want})`)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Task editor, phone: Schedule → date → time + duration, one write ──
  {
    const id = `editor-phone-${theme}`
    const { ctx, page, errors, writes, wrote } = await open(phone, theme, `/tasks/${tid(3)}`)
    await page.getByRole('button', { name: /Schedule/ }).first().tap()
    await sleep(450)
    check(`${id} Schedule → date sheet on the task's day`, (await heading(page)) === 'Due date' && (await cell(page, today).getAttribute('aria-selected')) === 'true')
    await page.getByRole('button', { name: 'Set time' }).tap()
    await sleep(350)
    const chips = page.locator('.kf-pk-durs button')
    check(`${id} time sheet has duration chips, 30m selected (the task's)`, (await chips.count()) === 6 && (await chips.nth(1).getAttribute('aria-pressed')) === 'true')
    await page.screenshot({ path: path.join(OUT, `${id}-time.png`) })
    const before = writes.length
    await page.locator('.kf-pk-time', { hasText: '14:30' }).tap()
    await chips.nth(2).tap()
    await page.getByRole('button', { name: 'Done' }).tap()
    const w = await wrote('tasks', tid(3))
    await sleep(500)
    const n = writes.slice(before).filter((x) => x.table === 'tasks').length
    check(`${id} Done → due_at today 14:30 + duration 45 in one row write`, same(w?.due_at, cairoIso(today, '14:30')) && w?.duration_min === 45 && n === 1, `${w?.due_at} · ${w?.duration_min}m · ${n} write(s)`)
    check(`${id} no native inputs`, await noNative(page))
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Inbox snooze, phone: Snooze → Pick a date… ──
  {
    const id = `inbox-phone-${theme}`
    const { ctx, page, errors, wrote } = await open(phone, theme, '/inbox')
    await page.getByRole('button', { name: 'Snooze', exact: true }).first().tap()
    await sleep(450)
    await page.getByRole('button', { name: 'Pick a date…' }).tap()
    await sleep(450)
    check(`${id} Snooze → Pick a date… → "Snooze until" date sheet, item as meta, no quick picks`, (await heading(page)) === 'Snooze until' && /dentist/i.test(await dialog(page).locator('.kf-pk-meta').innerText()) && (await page.locator('.kf-pk-picks').count()) === 0)
    check(`${id} no native date input`, await noNative(page))
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    const k = addDays(today, 2)
    await pickDay(page, k, tap)
    await page.getByRole('button', { name: 'Done' }).tap()
    const w = await wrote('inbox_items', INBOX[0].id)
    check(`${id} → snoozed_until = ${k} 09:00 Cairo`, same(w?.snoozed_until, cairoIso(k)), w?.snoozed_until)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── New project, phone: Target date ──
  {
    const id = `project-phone-${theme}`
    const { ctx, page, errors } = await open(phone, theme, '/projects', { projects: [] })
    await page.getByRole('button', { name: /Plant the first one/ }).first().tap()
    await sleep(500)
    check(`${id} no native date input in the new-project form`, await noNative(page))
    const field = page.getByRole('button', { name: /^Target date:/ })
    await field.tap()
    await sleep(450)
    check(`${id} Target date → date sheet (day picks, no time)`, (await heading(page)) === 'Target date' && (await page.getByRole('button', { name: 'Set time' }).count()) === 0)
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    const wk = (await page.locator('.kf-pk-picks .kf-as-row', { hasText: 'This weekend' }).innerText()).split('\n').at(-1)
    await page.locator('.kf-pk-picks .kf-as-row', { hasText: 'This weekend' }).tap()
    await sleep(400)
    check(`${id} This weekend → the field shows that day`, (await field.innerText()).toLowerCase().includes(wk.toLowerCase().split(' ').slice(0, 2).join(' ')), `${await field.innerText()} / ${wk}`)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── New routine, phone: reminder time ──
  {
    const id = `routine-phone-${theme}`
    const { ctx, page, errors } = await open(phone, theme, '/routines')
    await page.getByRole('button', { name: /New routine/ }).first().tap()
    await sleep(500)
    await page.getByText('a gentle push notification').locator('xpath=../..').locator('[role="switch"]').tap()
    await sleep(200)
    check(`${id} no native time input`, await noNative(page))
    const tf = page.getByRole('textbox', { name: 'Time' })
    check(`${id} reminder time is read-only (no keyboard)`, await tf.evaluate((e) => e.readOnly))
    await tf.tap()
    await sleep(450)
    check(`${id} → time sheet (no day → no free slots)`, (await heading(page)) === 'Time' && (await page.locator('.kf-pk-slot').count()) === 0 && (await page.locator('.kf-pk-times').count()) === 1)
    await page.screenshot({ path: path.join(OUT, `${id}-time.png`) })
    await page.locator('.kf-pk-time', { hasText: '07:30' }).tap()
    await page.getByRole('button', { name: 'Done' }).tap()
    await sleep(400)
    check(`${id} 07:30 → field "7:30 AM"`, (await tf.inputValue()) === '7:30 AM', await tf.inputValue())
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Tasks, desktop: right-click → Pick date… (popover, keyboard) ──
  {
    const id = `tasks-desktop-${theme}`
    const { ctx, page, errors, wrote } = await open(desktop, theme, '/tasks?list=all')
    const r = rowOf(page, 5)
    await r.scrollIntoViewIfNeeded()
    await sleep(800)
    const b = await r.boundingBox()
    await page.mouse.click(b.x + 200, b.y + 16, { button: 'right' })
    await sleep(300)
    // plan-replan: right-click → Plan… (the Plan list popover) → Pick date & time… (the date popover).
    await page.locator('[role="menuitem"]', { hasText: 'Plan…' }).click()
    await sleep(400)
    await page.locator('.kf-pk-pop .kf-as-row', { hasText: 'Pick date & time…' }).click()
    await sleep(400)
    const pop = page.locator('.kf-pk-pop')
    check(`${id} right-click → Plan… → Pick date & time… → the popover (no sheet, no native input, no repeated quick picks)`, (await pop.count()) === 1 && (await noNative(page)) && (await pop.locator('.kf-as-row').count()) === 0)
    check(`${id} focus on the task's day`, (await page.evaluate(() => document.activeElement?.getAttribute('data-day'))) === today)
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const w = await wrote('tasks', tid(5))
    check(`${id} → → Enter → due_at = today+2 09:00 Cairo, menu closed`, same(w?.due_at, cairoIso(addDays(today, 2))) && (await pop.count()) === 0 && (await page.locator('[role="menu"]').count()) === 0, w?.due_at)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Task editor, desktop: Due date field popover; Due time keeps the typed list ──
  {
    const id = `editor-desktop-${theme}`
    const { ctx, page, errors, wrote } = await open(desktop, theme, `/tasks/${tid(5)}`)
    check(`${id} no native inputs`, await noNative(page))
    const field = page.getByRole('button', { name: /^Due date:/ })
    await field.click()
    await sleep(350)
    check(`${id} Due date → popover "Due date"`, (await page.locator('.kf-pk-pop').count()) === 1 && (await heading(page)) === 'Due date')
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    const k = addDays(today, 4)
    await pickDay(page, k, click)
    await page.locator('.kf-pk-pop').getByRole('button', { name: 'Done' }).click()
    const w = await wrote('tasks', tid(5))
    check(`${id} day + Done → due_at ${k} at the task's time (09:00)`, same(w?.due_at, cairoIso(k)), w?.due_at)
    const tf = page.getByRole('textbox', { name: 'Time' })
    await tf.click()
    await sleep(250)
    check(`${id} Due time: typed text + list, no sheet`, (await page.locator('[role="listbox"]').count()) === 1 && (await page.locator('[role="dialog"]').count()) === 0)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── Inbox snooze, desktop ──
  {
    const id = `inbox-desktop-${theme}`
    const { ctx, page, errors, wrote } = await open(desktop, theme, '/inbox')
    await page.getByRole('button', { name: 'Snooze', exact: true }).first().click()
    await sleep(300)
    await page.getByRole('button', { name: 'Pick a date…' }).click()
    await sleep(350)
    check(`${id} Snooze → Pick a date… → popover "Snooze until"`, (await page.locator('.kf-pk-pop').count()) === 1 && (await heading(page)) === 'Snooze until' && (await noNative(page)))
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    const k = addDays(today, 5)
    await pickDay(page, k, click)
    await page.locator('.kf-pk-pop').getByRole('button', { name: 'Done' }).click()
    const w = await wrote('inbox_items', INBOX[0].id)
    check(`${id} → snoozed_until ${k} 09:00 Cairo`, same(w?.snoozed_until, cairoIso(k)), w?.snoozed_until)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── New project + project work log, desktop ──
  {
    const id = `project-desktop-${theme}`
    const { ctx, page, errors } = await open(desktop, theme, '/projects', { projects: [] })
    await page.getByRole('button', { name: /Plant the first one/ }).first().click()
    await sleep(400)
    const field = page.getByRole('button', { name: /^Target date:/ })
    await field.click()
    await sleep(350)
    check(`${id} Target date → popover in the modal, no native input`, (await page.locator('.kf-pk-pop').count()) === 1 && (await noNative(page)))
    await page.screenshot({ path: path.join(OUT, `${id}-date.png`) })
    await page.locator('.kf-pk-pop .kf-as-row', { hasText: 'Today' }).click()
    await sleep(250)
    check(`${id} Today → the field shows today`, (await page.locator('.kf-pk-pop').count()) === 0 && /\d{4}$/.test(await field.innerText()), await field.innerText())
    await field.click()
    await sleep(300)
    await page.keyboard.press('Escape')
    await sleep(250)
    check(`${id} Esc closes the picker first, the modal stays`, (await page.locator('.kf-pk-pop').count()) === 0 && (await field.count()) === 1)
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const id = `worklog-desktop-${theme}`
    const { ctx, page, errors } = await open(desktop, theme, `/projects/${PROJECT.id}`)
    const field = page.getByRole('button', { name: /^Date this work happened:/ })
    if (await field.count()) {
      await field.click()
      await sleep(350)
      const labels = (await page.locator('.kf-pk-pop .kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0])
      check(`${id} work date: only Today (max = today), no No date, future days disabled`, JSON.stringify(labels) === JSON.stringify(['Today']) && (await cell(page, addDays(today, 1)).count() === 0 || (await cell(page, addDays(today, 1)).isDisabled())), JSON.stringify(labels))
      await page.keyboard.press('Escape')
    } else check(`${id} work date field present`, false, 'not rendered')
    check(`${id} no native inputs`, await noNative(page))
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // ── New routine, desktop: typed list, no sheet ──
  {
    const id = `routine-desktop-${theme}`
    const { ctx, page, errors } = await open(desktop, theme, '/routines')
    await page.getByRole('button', { name: /New routine/ }).first().click()
    await sleep(400)
    await page.getByText('a gentle push notification').locator('xpath=../..').locator('[role="switch"]').click()
    const tf = page.getByRole('textbox', { name: 'Time' })
    await tf.click()
    await sleep(250)
    check(`${id} reminder time: typed text + list, no native input`, (await page.locator('[role="listbox"]').count()) === 1 && (await noNative(page)))
    await page.screenshot({ path: path.join(OUT, `${id}-time.png`) })
    await tf.fill('6:15 am')
    await tf.press('Enter')
    check(`${id} "6:15 am" → 6:15 AM`, (await tf.inputValue()) === '6:15 AM', await tf.inputValue())
    check(`${id} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-pages-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
