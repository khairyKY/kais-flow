// v164-kai-issues (Kai 2026-11-07 issues 1, 2, 3, 4, 6): on the REAL app against a MOCKED backend (the cal-wave
// recipe: dev server --mode mock, a made-up session, Playwright answers every REST call; writes are applied to the
// mock rows). The clock is frozen at Wed 21 Oct 2026 13:10, Cairo (UTC+3). Phone 390x844 and desktop 1280x800.
//   1. Today has no "Also open" section.            2. The task editor stays open through an action; Plan lists
//   "Pick date & time…" first.                      3. Tasks groups today's calendar items under Today.
//   4. The Now / Next card never covers the grid's last hours.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5257] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5257'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
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

// ── the day: Wednesday 21 Oct 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 21) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, taskN = null, type, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: taskN ? id(taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const T = { GOAL: 1, OMAR: 2, SLIDES: 3, MILK: 4, TRIP: 5, TAXES: 6, TOMORROW: 7, BOOK: 8 }
const TASKS = [
  task(T.GOAL, 'Finish the audit', { top3: true, duration_min: 60, due_at: iso('17:00') }),
  task(T.OMAR, 'Reply to Omar', { duration_min: 5, due_at: iso('18:00') }),
  task(T.SLIDES, 'Prepare the slides', { duration_min: 45, scheduled_start: iso('16:00'), scheduled_end: iso('16:45') }),
  task(T.MILK, 'Buy milk', { duration_min: 10 }),
  task(T.TRIP, 'Plan the trip', { duration_min: 30, due_at: iso('09:00', 25) }),
  task(T.TAXES, 'File the taxes', { duration_min: 30, due_at: iso('09:00', 19) }),
  task(T.TOMORROW, 'Dentist forms', { duration_min: 15, scheduled_start: iso('10:00', 22), scheduled_end: iso('10:15', 22) }),
  task(T.BOOK, 'Book the vet', { duration_min: 10, due_at: iso('15:00') }),
]
const E = { STANDUP: 1, REVIEW: 2, SLIDES: 3, READ: 4, CALL: 5, TOMORROW: 6 }
const EVENTS = [
  ev(E.STANDUP, 'Standup', '09:00', '09:30'),
  ev(E.REVIEW, 'Design review', '13:00', '14:00'),
  ev(E.SLIDES, 'Prepare the slides', '16:00', '16:45', T.SLIDES),
  ev(E.READ, 'Evening reading', '21:30', '22:30'),
  ev(E.CALL, 'Late call with Sam', '22:30', '23:45'),
  ev(E.TOMORROW, 'Dentist forms', '10:00', '10:15', T.TOMORROW),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 } },
}

async function open(view, route, o = {}) {
  const ctx = await browser.newContext({ ...VIEWS[view], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid, now, fold, tray]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', fold)
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calTrayFolded', tray)
    localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), UID, cairo('13:10').getTime(), o.fold ?? '0', o.tray ?? '0'])
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
  await page.clock.install({ time: cairo('13:10') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1400)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const rect = (loc) => loc.evaluate((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom } })
const overlaps = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

for (const view of ['phone', 'desktop']) {
  // ═══ 1 · Today has no "Also open" ═══
  if (want('1')) {
    const { ctx, page, errors } = await open(view, '/today')
    await shot(page, `1-today-${view}`)
    const body = await page.locator('body').innerText()
    check(`1 ${view}: no "Also open" text`, !/also open/i.test(body))
    check(`1 ${view}: no Also open section / fold`, (await page.locator('[aria-label="Also open"]').count()) === 0)
    check(`1 ${view}: an undated task (Buy milk) is not drawn on Today`, !body.includes('Buy milk'))
    check(`1 ${view}: Today's tasks still list what is due today`, body.includes('Reply to Omar'))
    check(`1 ${view}: Overdue is still there`, /overdue/i.test(body))
    check(`1 ${view}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// the address' task param: the editor (sheet / popover) is open while it is there
const taskParam = (page) => new URL(page.url()).searchParams.get('task')
const pathOf = (page) => new URL(page.url()).pathname
// the page's own scroller, pushed to its very end: a long list, scrolled, is Kai's usual state
const scrollToEnd = (page) => page.evaluate(() => { const e = document.querySelector('.app-main-content'); if (e) e.scrollTop = e.scrollHeight })

for (const view of ['phone', 'desktop']) {
  // ═══ 2 · the task editor stays open through an action; Plan lists "Pick date & time…" first ═══
  if (want('2')) {
    const phone = view === 'phone'
    const click = (loc) => (phone ? loc.tap() : loc.click())
    const editor = (page) => (phone ? page.locator('.kf-bs-fade[role="dialog"]') : page.locator('.tp-pop'))
    const chips = phone ? '.ts-chips button' : '.tp-pop .ts-chips button'
    // opens a task from its row on /tasks: a tap on a phone, a click on the title on desktop
    async function openEditor(page, n) {
      const row = page.locator(`#task-${id(n)}`)
      await row.scrollIntoViewIfNeeded()
      if (phone) await row.tap()
      else { const b = await row.boundingBox(); await page.mouse.click(b.x + 120, b.y + 20) }
      await sleep(800)
    }
    // [task, the plan choice]: the ones that move a row out from under a scrolled list are the ones that closed it
    const CASES = [[T.MILK, 'Today'], [T.MILK, 'Someday'], [T.MILK, 'No date'], [T.TOMORROW, 'Someday'], [T.TOMORROW, 'No date'], [T.OMAR, 'Tomorrow']]
    for (const [n, choice] of CASES) {
      const { ctx, page, errors } = await open(view, '/tasks')
      const name = TASKS.find((t) => t.id === id(n)).title
      const tag = `2 ${view}: ${name} · Plan → ${choice}`
      await scrollToEnd(page)
      await sleep(300)
      await openEditor(page, n)
      const startPath = pathOf(page)
      if (taskParam(page) !== id(n)) { check(`${tag}: the task opens in its editor`, false, page.url()); await ctx.close(); continue }
      await click(page.locator(chips).first())
      await sleep(600)
      const items = await page.locator('.kf-plan .kf-as-row').allInnerTexts()
      if (choice === 'Today' && n === T.MILK) check(`2 ${view}: the Plan menu lists "Pick date & time…" first`, /^Pick date & time/.test((items[0] ?? '').trim()), JSON.stringify(items.map((x) => x.split('\n')[0])))
      await click(page.locator('.kf-plan .kf-as-row', { hasText: choice }).first())
      await sleep(1200)
      check(`${tag}: the editor is still open (task param kept)`, taskParam(page) === id(n), page.url())
      check(`${tag}: …on the same page, not sent home`, pathOf(page) === startPath, `${startPath} → ${pathOf(page)}`)
      check(`${tag}: …and on screen`, (await editor(page).count()) >= 1 && (await editor(page).first().isVisible()))
      if (choice === 'Today' && n === T.MILK && taskParam(page) === id(n)) {
        await shot(page, `2-${view}-after-plan`)
        // a second action in the same editor: Priority → P1
        await click(page.locator(chips, { hasText: 'Priority' }).first())
        await sleep(500)
        await click(page.locator('[role="menuitem"], .kf-as-row').filter({ hasText: /Critical|P1|!!!/ }).first())
        await sleep(1000)
        check(`2 ${view}: a second action (Priority) and it is still open`, taskParam(page) === id(n) && (await editor(page).count()) >= 1, page.url())
      }
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}


for (const view of ['phone', 'desktop']) {
  // ═══ 3 · Tasks: what is on the calendar today is under Today ═══
  if (want('3')) {
    const { ctx, page, errors } = await open(view, '/tasks?list=all')
    const lines = (await page.locator('.app-main-content').innerText()).split('\n').map((l) => l.trim()).filter(Boolean)
    const HEADERS = ['Overdue', 'Today', 'Scheduled on calendar', 'Tomorrow', 'This week', 'Later', 'No date', 'Someday']
    const groupOf = (title) => { const at = lines.indexOf(title); return at < 0 ? null : [...lines.slice(0, at)].reverse().find((l) => HEADERS.includes(l)) ?? null }
    await shot(page, `3-tasks-${view}`)
    check(`3 ${view}: there is no "Scheduled on calendar" group`, !lines.includes('Scheduled on calendar'), JSON.stringify(lines.filter((l) => HEADERS.includes(l))))
    check(`3 ${view}: "Prepare the slides" (blocked on today's calendar) is under Today`, groupOf('Prepare the slides') === 'Today', String(groupOf('Prepare the slides')))
    check(`3 ${view}: …beside the tasks due today (Book the vet, Reply to Omar)`, groupOf('Book the vet') === 'Today' && groupOf('Reply to Omar') === 'Today')
    check(`3 ${view}: tomorrow's block (Dentist forms) is still under Tomorrow`, groupOf('Dentist forms') === 'Tomorrow', String(groupOf('Dentist forms')))
    const todayHead = lines[lines.indexOf('Today', lines.indexOf('Overdue')) + 1]
    check(`3 ${view}: Today's header counts all four (4 · 2h)`, /^4 · 2h$/.test(todayHead ?? ''), String(todayHead))
    check(`3 ${view}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

for (const view of ['phone', 'desktop']) {
  // ═══ 4 · the Now / Next card never covers the grid's last hours ═══
  if (want('4')) {
    // desktop: the rail folded so the card floats over the grid, the day tray folded so it is the grid's foot
    const { ctx, page, errors } = await open(view, '/calendar', { fold: '1', tray: '1' })
    if (view === 'desktop') await page.keyboard.press('d') // one wide day: the card is over the day's column
    await sleep(900)
    const card = view === 'phone' ? page.locator('.pc-now') : page.locator('.cal-now-float')
    check(`4 ${view}: the Now card is up`, (await card.count()) === 1 && (await card.isVisible()))
    const scroller = view === 'phone' ? '.pc-scroll' : '.fc-scroller-liquid-absolute'
    const content = view === 'phone' ? '.pc-canvas' : '.fc-timegrid-body'
    await page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => { e.scrollTop = e.scrollHeight }), scroller)
    await sleep(500)
    await shot(page, `4-${view}-scrolled-to-end`)
    const c = await rect(card)
    const body = await rect(page.locator(content).first())
    const lateTitle = page.getByText('Late call with Sam').first()
    const late = await rect(lateTitle)
    check(`4 ${view}: scrolled to the end, the whole day (to 24:00) ends above the card`, body.b <= c.t + 1, `day ends ${Math.round(body.b)}, card starts ${Math.round(c.t)}`)
    check(`4 ${view}: …so the late block (22:30–23:45) is not under the card`, !overlaps(late, c) && late.b <= c.t, `block title ${Math.round(late.t)}–${Math.round(late.b)}, card ${Math.round(c.t)}–${Math.round(c.b)}`)
    const metaLine = page.getByText(/22:30–23:45/).first()
    const meta = await rect(metaLine)
    check(`4 ${view}: …its time line is readable`, !overlaps(meta, c), `time line ${Math.round(meta.t)}–${Math.round(meta.b)}`)
    // the reserve follows the card: folded to one line (phone) or opened, it still clears
    if (view === 'phone') {
      await card.locator('button, [role="button"]').first().tap().catch(() => {})
      await sleep(600)
      await page.evaluate((sel) => document.querySelectorAll(sel).forEach((e) => { e.scrollTop = e.scrollHeight }), scroller)
      await sleep(400)
      const c2 = await rect(card)
      const body2 = await rect(page.locator(content).first())
      await shot(page, `4-${view}-card-toggled`)
      check(`4 ${view}: the card toggled (taller or shorter), the day still ends above it`, body2.b <= c2.t + 1, `day ends ${Math.round(body2.b)}, card starts ${Math.round(c2.t)}`)
    }
    check(`4 ${view}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}
await browser.close()
const bad = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
