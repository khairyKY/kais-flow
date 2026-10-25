// cal-wave (Kai 2026-10-25, queue items 8, 13, 18, 19 — "now card A"): the calendar fills its width at every
// window and interface size, Akiflow's view options (Days fit the width, Hours fit the day, Density, a second
// clock, single keys), the rail's empty sections + Scheduled, and the Ongoing / Up next card — on the REAL app
// against a MOCKED backend (the cal-polish recipe: dev server --mode mock, a made-up session, Playwright answers
// every REST call; writes are recorded and applied to the mock rows). The clock is frozen per check.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Wednesday 21 Oct 2026, Cairo (UTC+3).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5309'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const OPTIONS_PAGE = process.env.OPTIONS_PAGE ?? 'D:/Coding/kais-flow/.claude/worktrees/looks2/design-export/Calendar extras options.html'
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

// ── the day ──
const DAY = 21
const cairo = (hhmm, day = DAY) => {
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
const T = { DEEP: 1, GYM: 2, CALL: 3, RENT: 4, VET: 5, CAR: 6 }
const SAGE = '#8A9A7E'
const TASKS = [
  task(T.DEEP, 'Deep work on the forecast', { duration_min: 90, due_at: iso('15:00'), scheduled_start: iso('15:00'), scheduled_end: iso('16:30') }),
  task(T.GYM, 'Gym', { duration_min: 60, due_at: iso('17:00'), scheduled_start: iso('17:00'), scheduled_end: iso('18:00') }),
  task(T.CALL, 'Call Mom', { duration_min: 20, due_at: iso('19:10'), scheduled_start: iso('19:10'), scheduled_end: iso('19:30') }),
  task(T.RENT, 'Pay the rent', { duration_min: 15, due_at: iso('14:00'), scheduled_start: iso('14:00'), scheduled_end: iso('14:15') }),
  task(T.VET, 'Book the vet', { duration_min: 30, due_at: iso('09:00') }),
  task(T.CAR, 'Renew car insurance', { duration_min: 15, due_at: iso('09:00', 19) }),
]
const E = { WORK: 1, STANDUP: 2, DESIGN: 3, RENT: 4, DEEP: 5, GYM: 6, MAGHRIB: 7, CALL: 8, ISHA: 9 }
const EVENTS = [
  ev(E.WORK, 'Deep work block', '11:00', '12:30', null, 'time_block'),
  ev(E.STANDUP, 'Standup https://meet.example.test/abc-defg', '11:15', '11:30'),
  ev(E.DESIGN, 'Design review', '14:00', '14:45'),
  ev(E.RENT, 'Pay the rent', '14:00', '14:15', T.RENT),
  ev(E.DEEP, 'Deep work on the forecast', '15:00', '16:30', T.DEEP),
  ev(E.GYM, 'Gym', '17:00', '18:00', T.GYM),
  ev(E.MAGHRIB, 'المغرب', '18:15', '18:40', null, 'event', { color: SAGE }),
  ev(E.CALL, 'Call Mom', '19:10', '19:30', T.CALL),
  ev(E.ISHA, 'العشاء', '19:58', '20:20', null, 'event', { color: SAGE }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar'], calendar_day_count: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = (o = {}) => structuredClone({ tasks: o.empty ? [] : TASKS, calendar_events: o.empty ? [] : EVENTS, inbox_items: [], projects: [], domains: [], areas: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(o = {}) {
  const view = o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: o.w ?? 1280, height: o.h ?? 800 } }
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', ...(o.reducedMotion ? { reducedMotion: 'reduce' } : null) })
  await ctx.addInitScript(([sess, scale, uid, now, vo, fold, nowFolded]) => {
    localStorage.setItem('kf_theme', 'day'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    if (fold != null) localStorage.setItem('kf.calRailFolded', fold)
    localStorage.setItem('kf.calPlanning', '0')
    localStorage.setItem('kf.calRailSections', JSON.stringify({ overdue: false, today: false, scheduled: false, inbox: false, lists: true }))
    if (nowFolded != null) localStorage.setItem('kf.calNowFolded', nowFolded)
    if (scale) localStorage.setItem('kf_ui_scale', scale)
    localStorage.setItem('kf.calViewOptions', JSON.stringify(vo))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: now }))
  }, [JSON.stringify(session), o.scale ? String(o.scale) : null, UID, cairo(o.now ?? '08:00').getTime(), { hour24: !o.clock12, ...(o.vo ?? {}) }, o.fold === undefined ? '0' : o.fold, o.nowFolded ?? null])
  const state = { rows: tables(o), writes: [] }
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
  await page.clock.install({ time: cairo(o.now ?? '08:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${o.route ?? '/calendar'}`, { waitUntil: 'networkidle' })
  await sleep(1600)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
async function viewOptions(page) {
  await page.locator('.cal-head button[aria-haspopup="dialog"]').click()
  await sleep(300)
}
async function key(page, k) {
  await page.mouse.click(5, 300) // off any field
  await page.keyboard.press(k)
  await sleep(900)
}

/** The grid's geometry: the FullCalendar box, its body table, the wrapper it scrolls in, the header. */
const geo = (page) => page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, h: b.height } }
  const h1 = document.querySelector('.cal-head-h1')
  return {
    fc: r('.fc'), body: r('.fc-timegrid-body table') ?? r('.fc-daygrid-body table'), card: r('.cal-grid-card'), head: r('.cal-head'), ctrls: r('.cal-head-ctrls'), date: r('.cal-head-date'),
    h1Lines: h1 ? Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight || '20')) : 0,
    h1Clipped: h1 ? h1.scrollWidth > h1.clientWidth + 1 : true,
    cols: [...document.querySelectorAll('.fc-timegrid-body .fc-timegrid-col[data-date]')].map((c) => Math.round(c.getBoundingClientRect().width)),
    label: document.querySelector('.cal-head-ctrls .kf-button')?.textContent?.trim(),
  }
})
/** Fills: the body table reaches the FullCalendar box's right edge, and the box its card's (or scrolls past it). */
const fills = (g) => g.fc && g.body && g.card && Math.abs(g.body.r - g.fc.r) <= 4 && g.fc.r >= g.card.r - 2
/** One line: the controls and the date share a row, the header no taller than its 52px row (zoomed), no clipped date. */
const oneLine = (g, z) => g.head && g.ctrls && g.date && g.head.h <= 60 * z && g.date.l >= g.ctrls.r - 1 && !g.h1Clipped

// ═══ W · item 8: the grid fills its width, every window, scale and view; the header keeps one line ═══
if (want('w')) {
  for (const w of [840, 1280, 1920]) {
    for (const scale of [1, 1.25, 1.5]) {
      const { ctx, page, errors } = await open({ w, h: 760, scale, fold: null })
      const tag = `${w}@${Math.round(scale * 100)}`
      for (const [k, name] of [['d', 'Day'], ['4', '4 days'], ['2', '2 days'], ['6', '6 days'], ['w', 'Week'], ['m', 'Month']]) {
        await key(page, k)
        const g = await geo(page)
        check(`w ${tag} ${name}: the grid fills its width`, fills(g), JSON.stringify({ fc: g.fc, body: g.body, card: g.card }))
        check(`w ${tag} ${name}: the header is one line, the date unclipped`, oneLine(g, scale), JSON.stringify({ head: g.head, ctrls: g.ctrls, date: g.date }))
        if (name !== 'Week' && name !== 'Month' && name !== 'Day') check(`w ${tag} ${name}: no column under the minimum (80px × scale), days dropped instead`, g.cols.every((c) => c >= 79 * scale), `${g.label} ${g.cols.join(',')}`)
        if ((w === 840 || w === 1920) && scale !== 1 && (name === '4 days' || name === 'Week')) await shot(page, `w-${tag}-${name.replace(' ', '')}`)
      }
      // the rail opened and folded again, the window narrowed: still filled (FullCalendar re-measured)
      await key(page, '4')
      await key(page, '0')
      const g1 = await geo(page)
      await key(page, '0')
      const g2 = await geo(page)
      check(`w ${tag} the rail folded and opened (0): the grid fills both ways`, fills(g1) && fills(g2), JSON.stringify([g1.body, g1.fc, g2.body, g2.fc]))
      check(`w ${tag} no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
  // Kai's window: 840px at 125%, 4 days — the strip on the right is gone, the rail stepped aside first
  {
    const { ctx, page } = await open({ w: 840, h: 700, scale: 1.25, fold: '0' })
    await key(page, '4')
    const g = await geo(page)
    check("w Kai's 840px window at 125%, 4 days: filled edge to edge, the rail stepped aside although it was opened", fills(g) && (await page.locator('.cal-rail:not(.is-folded)').count()) === 0, JSON.stringify(g.cols))
    await shot(page, 'w-kai-840-125-4days')
    await page.locator('.cal-rail-tab').click()
    await sleep(700)
    check('w …its tab still opens it at that width (this visit), the days drop to fit beside it', (await page.locator('.cal-rail:not(.is-folded)').count()) === 1 && fills(await geo(page)))
    await page.setViewportSize({ width: 600, height: 700 })
    await sleep(800)
    check('w resized narrower by the window: still filled', fills(await geo(page)))
    await ctx.close()
  }
  // planning mode fills too
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25 })
    await viewOptions(page)
    await page.getByRole('switch', { name: 'Planning mode' }).click()
    await sleep(900)
    const g = await geo(page)
    check('w planning mode: the strip fills its width', fills(g), JSON.stringify([g.body, g.fc]))
    check('w planning mode: no Now card (planning is its own focus)', (await page.locator('.kf-now').count()) === 0)
    await page.setViewportSize({ width: 1000, height: 800 })
    await sleep(800)
    check('w planning mode, window narrowed: still filled', fills(await geo(page)))
    await ctx.close()
  }
}

// ═══ V · item 13: Akiflow's view options ═══
if (want('v')) {
  // Responsive: the days follow the width
  {
    const { ctx, page } = await open({ w: 1920, scale: 1.25, vo: { responsive: true } })
    const wide = (await geo(page)).cols.length
    await page.setViewportSize({ width: 1280, height: 800 })
    await sleep(1000)
    const mid = (await geo(page)).cols.length
    await page.setViewportSize({ width: 900, height: 800 })
    await sleep(1000)
    const g = await geo(page)
    check(`v1 Days fit the width: 1920 → ${wide}, 1280 → ${mid}, 900 → ${g.cols.length} days`, wide > mid && mid >= g.cols.length && g.cols.length >= 1 && g.cols.every((c) => c >= 149), g.cols.join(','))
    check('v1 …the header names the count ("N days")', /^\d days?$/.test(g.label ?? ''), g.label)
    check('v1 …and fills', fills(g))
    await shot(page, 'v1-responsive-900')
    await ctx.close()
  }
  // the popover: every option is there and persists
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25 })
    await viewOptions(page)
    for (const name of ['Days fit the width', 'Hours fit the day', 'Second time zone', 'Now card', 'Show weekends', '24-hour time', 'Planning mode']) check(`v2 View options has "${name}"`, (await page.getByRole('switch', { name }).count()) >= 1)
    check('v2 Density reads Small · Medium · Large', (await page.locator('[aria-label="Density"] .kf-seg-btn').allInnerTexts()).join() === 'Small,Medium,Large')
    await shot(page, 'v2-view-options')
    await page.getByRole('switch', { name: 'Hours fit the day' }).click()
    await sleep(800)
    const first = await page.locator('.fc-timegrid-slot-label[data-time]').first().getAttribute('data-time')
    const last = await page.locator('.fc-timegrid-slot-label[data-time]').last().getAttribute('data-time')
    check('v3 Hours fit the day: the grid runs 10:00 (an hour before the 11:00 block) to 22:00 (an hour after Isha ends 20:20)', first === '10:00:00' && last === '21:30:00', `${first} … ${last}`)
    const noScroll = await page.evaluate(() => { const s = document.querySelector('.fc-timegrid-body')?.closest('.fc-scroller'); return s ? s.scrollHeight <= s.clientHeight + 2 : false })
    check('v3 …the rows fit the screen (no vertical scroll)', noScroll)
    await shot(page, 'v3-dynamic')
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kf.calViewOptions') ?? '{}'))
    check('v3 …remembered with the view options', saved.dynamic === true)
    await ctx.close()
  }
  // Density
  {
    const h = {}
    for (const d of ['s', 'm', 'l']) {
      const { ctx, page } = await open({ w: 1280, scale: 1.25, vo: { density: d } })
      h[d] = await page.locator('.fc-timegrid-slot').first().evaluate((e) => e.getBoundingClientRect().height)
      if (d === 'l') await shot(page, 'v4-density-large')
      await ctx.close()
    }
    check(`v4 Density Small < Medium < Large row heights (${h.s.toFixed(1)} / ${h.m.toFixed(1)} / ${h.l.toFixed(1)})`, h.s < h.m && h.m < h.l)
  }
  // a second clock
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25 })
    await viewOptions(page)
    await page.getByRole('switch', { name: 'Second time zone' }).click()
    await page.locator('input[aria-label="Second time zone"]').fill('America/New_York')
    await sleep(300)
    await page.keyboard.press('Escape')
    await sleep(900)
    const row = await page.locator('.fc-timegrid-slot-label[data-time="18:00:00"] .fc-timegrid-slot-label-cushion').innerText()
    check('v5 Second time zone (New York): 18:00 Cairo reads 11:00 beside it', /11:00/.test(row) && /18:00/.test(row), row.replace(/\s+/g, ' '))
    const corner = await page.locator('.fc-col-header .fc-timegrid-axis-frame').evaluate((e) => [getComputedStyle(e, '::before').content, getComputedStyle(e, '::after').content])
    check('v5 …the corner names both zones (theirs, yours)', corner[0].includes('EDT') && /GMT\+3|EEST/.test(corner[1]), corner.join(' · '))
    check('v5 …and the grid still fills', fills(await geo(page)))
    await shot(page, 'v5-second-zone')
    await ctx.close()
  }
  // single keys + the cheatsheet
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25 })
    const labels = []
    for (const k of ['d', '3', 'w', 'm', '1']) {
      await key(page, k)
      labels.push(await page.locator('.cal-head-ctrls .kf-button').first().innerText())
    }
    check('v6 single keys d · 3 · w · m · 1 switch the view', labels.join('|') === 'Day|3 days|Week|Month|Day', labels.join('|'))
    await page.keyboard.press('Shift+Slash')
    await sleep(600)
    const sheet = await page.locator('body').innerText()
    check('v6 the ? cheatsheet lists them (Day · Week · Month, 1 day · 2–6 days · Week)', sheet.includes('Day · Week · Month') && sheet.includes('1 day · 2–6 days · Week'))
    await ctx.close()
  }
}

// ═══ R · item 18: the rail ═══
if (want('r')) {
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25, empty: true })
    check('r1 nothing anywhere: no section headers, one "Nothing to plan" line', (await page.locator('.cal-rail-sec:visible').count()) === 0 && (await page.locator('.cal-rail-none', { hasText: 'Nothing to plan' }).isVisible()))
    await shot(page, 'r1-rail-empty')
    await ctx.close()
  }
  {
    const { ctx, page, state } = await open({ w: 1280, scale: 1.25, now: '08:00' })
    const secs = await page.locator('.cal-rail-sec:visible').evaluateAll((els) => els.map((e) => e.dataset.section))
    check('r2 only sections with something in them, in order: Overdue · Today · Scheduled', secs.join() === 'overdue,today,scheduled', secs.join())
    const rows = await page.locator('.cal-rail-sec[data-section="scheduled"] .unscheduled-task').evaluateAll((els) => els.map((e) => e.querySelector('.cal-row-title').textContent + ' ' + (e.querySelector('.cal-row-at')?.textContent ?? '')))
    check("r2 Scheduled lists today's blocked tasks by start, with their times", JSON.stringify(rows) === JSON.stringify(['Pay the rent 14:00–14:15', 'Deep work on the forecast 15:00–16:30', 'Gym 17:00–18:00', 'Call Mom 19:10–19:30']), JSON.stringify(rows))
    await shot(page, 'r2-rail-scheduled')
    await page.locator('.cal-rail-sec[data-section="scheduled"] .unscheduled-task', { hasText: 'Gym' }).click()
    await sleep(700)
    check('r3 a Scheduled row jumps to its block (its details open)', (await page.locator('.kf-bm-title').first().inputValue().catch(() => page.locator('.kf-bm-title').first().innerText())).includes('Gym'))
    await page.keyboard.press('Escape')
    await sleep(400)
    const row = page.locator('.cal-rail-sec[data-section="scheduled"] .unscheduled-task', { hasText: 'Call Mom' })
    await row.hover()
    await row.locator('.cal-plan-btn').click()
    await sleep(400)
    check('r4 Plan ▾ on a Scheduled row reschedules it (Next free slot · Tomorrow · Pick date…)', (await page.getByText(/^Next free slot/).count()) === 1 && (await page.getByText('Pick date…').count()) === 1)
    await page.keyboard.press('Escape')
    await sleep(300)
    const w0 = state.writes.length
    await row.click({ button: 'right' })
    await sleep(400)
    await page.getByText('Unschedule', { exact: true }).first().click()
    await settle(state)
    const del = state.writes.slice(w0).find((w) => w.table === 'calendar_events' && (w.method === 'DELETE' || (w.body && (w.body.deleted_at || (Array.isArray(w.body) && w.body[0]?.deleted_at)))))
    check('r5 …its right-click Unschedule takes the block off (one write to calendar_events)', !!del, JSON.stringify(state.writes.slice(w0).map((w) => `${w.method} ${w.table}`)))
    await sleep(500)
    check('r5 …and the row leaves Scheduled', (await page.locator('.cal-rail-sec[data-section="scheduled"] .unscheduled-task', { hasText: 'Call Mom' }).count()) === 0)
    await ctx.close()
  }
}

// ═══ N · item 19: the Now card, every state (frozen clock) ═══
const nowText = (page) => page.locator('.kf-now').innerText().then((t) => t.replace(/\s+/g, ' ').trim())
if (want('n')) {
  const STATES = [
    ['n1-none', '21:00', 'none', /^Nothing else today$/],
    ['n2-far', '12:45', 'far', /^Next · Design review · 14:00$/],
    ['n3-soon', '18:05', 'soon', /^Up next in 10m المغرب 18:15 18:40$/],
    ['n4-ongoing-next', '18:25', 'on', /^Ongoing 15m left المغرب 18:15 18:40 Next Call Mom in 45m$/],
    ['n5-two-ongoing', '11:20', 'many-on', /^Ongoing · 2 Join 10m left Standup .* 11:15 11:30$/],
    ['n6-many-upcoming', '13:50', 'many-soon', /^Up next in 10m Design review 14:00 14:45$/],
  ]
  for (const [name, at, st, re] of STATES) {
    const { ctx, page, errors } = await open({ w: 1280, scale: 1.25, now: at, nowFolded: '0' })
    const s = await page.locator('.kf-now').getAttribute('data-state')
    const t = await nowText(page)
    check(`${name} at ${at}: state "${st}", reads as drawn`, s === st && re.test(t), `${s} · ${t}`)
    await page.locator('.kf-now').screenshot({ path: path.join(OUT, `${name}.png`) })
    if (st === 'many-on') {
      await page.locator('.kf-now-chev-btn').click()
      await sleep(300)
      const t2 = await nowText(page)
      check('n5 ⌄ opens the other one above (Deep work block, its own bar and time left)', /Deep work block .*1h 10m left/.test(t2) && (await page.locator('.kf-now-more .kf-now-row').count()) === 1, t2)
      await page.locator('.kf-now').screenshot({ path: path.join(OUT, 'n5-two-ongoing-open.png') })
      check('n5 Join is there for the event with a meeting link', (await page.locator('.kf-now-join').count()) === 1)
    }
    if (st === 'many-soon') {
      await page.locator('.kf-now-chev-btn').click()
      await sleep(300)
      const t2 = await nowText(page)
      check('n6 ⌄ lists the rest of the hour; the one at the same minute shows its clock time', /Next Pay the rent 14:00/.test(t2), t2)
      await page.locator('.kf-now').screenshot({ path: path.join(OUT, 'n6-many-upcoming-open.png') })
    }
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // docked at the foot of the rail; floating at the grid's corner when the rail is folded; one line; actions
  {
    const { ctx, page, state } = await open({ w: 1280, scale: 1.25, now: '18:25', nowFolded: '0' })
    const dock = await page.evaluate(() => { const c = document.querySelector('.cal-now-dock')?.getBoundingClientRect(); const r = document.querySelector('.cal-rail')?.getBoundingClientRect(); return c && r ? { inRail: !!document.querySelector('.cal-rail .kf-now'), gap: Math.round(r.bottom - c.bottom) } : null })
    check('n7 rail open: the card sits at the foot of the rail', dock?.inRail && dock.gap <= 14, JSON.stringify(dock))
    await shot(page, 'n7-desktop-rail-open')
    // RTL: المغرب right-aligned in its line
    const rtl = await page.locator('.kf-now-main .kf-now-tl .kf-now-t').evaluate((el) => { const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect(); const b = el.getBoundingClientRect(); return { dir: getComputedStyle(el).direction, right: Math.round(b.right - t.right), left: Math.round(t.left - b.left) } })
    check('n8 an Arabic title reads right to left, right-aligned in its line', rtl.dir === 'rtl' && rtl.right <= 2 && rtl.left > 20, JSON.stringify(rtl))
    // the bar fills by transform
    const bar = await page.locator('.kf-now-main .kf-now-br > i').evaluate((el) => ({ anim: getComputedStyle(el).animationName, m: new DOMMatrix(getComputedStyle(el).transform).a }))
    check('n9 the bar fills smoothly (a transform animation on the compositor), 40% through at 18:25', bar.anim === 'kf-now-fill' && Math.abs(bar.m - 0.4) < 0.05, JSON.stringify(bar))
    // click opens the block
    await page.locator('.kf-now-main .kf-now-tl .kf-now-t').click()
    await sleep(700)
    check('n10 a click on the card opens its block', (await page.locator('.kf-bm-title').count()) >= 1)
    await page.keyboard.press('Escape')
    await sleep(400)
    // fold to one line, remembered
    await page.locator('.kf-now-lbl').click()
    await sleep(300)
    const fold = page.locator('.kf-now-fold')
    check('n11 the label folds it to one line ("Ongoing · المغرب · 15m left")', (await fold.count()) === 1 && /Ongoing\s*·\s*المغرب\s*15m left/.test((await fold.innerText()).replace(/\s+/g, ' ')) && (await fold.boundingBox()).height < 48, await fold.innerText().catch(() => ''))
    await page.locator('.kf-now').screenshot({ path: path.join(OUT, 'n11-folded.png') })
    check('n11 …remembered on this device (kf.calNowFolded)', (await page.evaluate(() => localStorage.getItem('kf.calNowFolded'))) === '1')
    await page.locator('.kf-now-fold').click()
    await sleep(300)
    // the rail folded: floating 16px in from the grid's corner
    await key(page, '0')
    const fl = await page.evaluate(() => { const c = document.querySelector('.cal-now-float')?.getBoundingClientRect(); const m = document.querySelector('.cal-main')?.getBoundingClientRect(); return c && m ? { left: Math.round(c.left - m.left), bottom: Math.round(m.bottom - c.bottom) } : null })
    const z = 1.25
    check('n12 rail folded: the card floats at the grid\'s bottom-left, 16px in', fl && Math.abs(fl.left - 16 * z) <= 2 && Math.abs(fl.bottom - 16 * z) <= 2, JSON.stringify(fl))
    await shot(page, 'n12-desktop-rail-folded')
    // the Now card toggle
    await viewOptions(page)
    await page.getByRole('switch', { name: 'Now card' }).click()
    await sleep(400)
    await page.keyboard.press('Escape')
    await sleep(300)
    check('n13 View options ▸ Now card off: the card goes', (await page.locator('.kf-now').count()) === 0)
    await ctx.close()
    void state
  }
  // a task running: its checkbox ticks the task; Focus shows on hover and starts a round
  {
    const { ctx, page, state } = await open({ w: 1280, scale: 1.25, now: '17:30', nowFolded: '0' })
    const tl = page.locator('.kf-now-main .kf-now-tl')
    check('n14 Focus is hidden until the pointer is over the task', !(await page.locator('.kf-now-main .kf-now-focus').isVisible()))
    await tl.hover()
    await sleep(200)
    check('n14 …and shows on hover', await page.locator('.kf-now-main .kf-now-focus').isVisible())
    await page.locator('.kf-now').screenshot({ path: path.join(OUT, 'n14-task-hover-focus.png') })
    const w0 = state.writes.length
    await page.locator('.kf-now-main .kf-now-ck [role="checkbox"]').click()
    await settle(state)
    const done = state.writes.slice(w0).flatMap((w) => (w.table === 'tasks' ? (Array.isArray(w.body) ? w.body : [w.body]) : [])).find((b) => b?.id === id(T.GYM))
    check('n15 the card\'s checkbox ticks the task (Gym → done, through the outbox)', done?.status === 'done', JSON.stringify(done))
    await sleep(600)
    const after = await page.locator('.kf-now').getAttribute('data-state')
    check('n15 …and the card moves on (Gym done → up next is المغرب at 18:15 → "far", over an hour)', after === 'far' || after === 'soon', after)
    await page.locator('.kf-now-quiet, .kf-now-main').first().hover()
    await ctx.close()
  }
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25, now: '17:30', nowFolded: '0' })
    await page.locator('.kf-now-main .kf-now-tl').hover()
    await page.locator('.kf-now-main .kf-now-focus').click()
    await sleep(900)
    check('n16 Focus on the card starts a focus round on the task (→ /focus)', page.url().includes('/focus'), page.url())
    await ctx.close()
  }
  // 12-hour clock; reduced motion = the minute's share, no animation
  {
    const { ctx, page } = await open({ w: 1280, scale: 1.25, now: '18:25', clock12: true, nowFolded: '0', reducedMotion: true })
    const t = await nowText(page)
    check('n17 the 12-hour clock: 6:15 PM … 6:40 PM', t.includes('6:15 PM') && t.includes('6:40 PM'), t)
    const bar = await page.locator('.kf-now-main .kf-now-br > i').evaluate((el) => ({ anim: getComputedStyle(el).animationName, m: new DOMMatrix(getComputedStyle(el).transform).a }))
    check('n18 reduced motion: no animation, the bar stands at the minute\'s share (40%)', bar.anim === 'none' && Math.abs(bar.m - 0.4) < 0.02, JSON.stringify(bar))
    await ctx.close()
  }
}

// ═══ P · the phone: the rail's rule, Scheduled, and the Now card drawn on the page ═══
if (want('p')) {
  const { ctx, page, errors } = await open({ phone: true, now: '18:25' })
  const segs = (await page.locator('.pc-segs [role="radio"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  check('p1 phone: only the segments with something in them — Overdue 1 · Today 1 · Scheduled 4', segs.join() === 'Overdue 1,Today 1,Scheduled 4', segs.join())
  await page.locator('.pc-segs [role="radio"]', { hasText: 'Scheduled' }).click()
  await sleep(400)
  const chips = (await page.locator('.pc-uns .pc-chip').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  check('p2 Scheduled chips carry their times', chips[0] === 'Pay the rent 14:00–14:15' && chips.length === 4, chips.join(' | '))
  const strip = page.locator('.pc-now .kf-now-fold')
  check('p3 the Now card is a one-line strip over the grid\'s foot', (await strip.count()) === 1 && (await strip.boundingBox()).height < 50, await strip.innerText().catch(() => ''))
  const bb = await page.locator('.pc-now').boundingBox()
  check('p3 …inside the gutters, above the tab bar', bb && bb.x >= 11 && bb.x + bb.width <= 379 && bb.y + bb.height < 844 - 64, JSON.stringify(bb))
  await shot(page, 'p3-phone-strip')
  await strip.click()
  await sleep(400)
  check('p4 a tap opens it into the card (Ongoing · المغرب · Next Call Mom)', /Ongoing 15m left المغرب .* Next Call Mom in 45m/.test(await nowText(page)), await nowText(page))
  await shot(page, 'p4-phone-open')
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  {
    const { ctx, page } = await open({ phone: true, now: '08:00', empty: true })
    check('p5 phone with nothing to plan: one "Nothing to plan" line, no segments', (await page.locator('.pc-none', { hasText: 'Nothing to plan' }).count()) === 1 && (await page.locator('.pc-segs').count()) === 0)
    await ctx.close()
  }
}

// ═══ S · beside the drawing: the options page's §4 "A" next to the app's card ═══
if (want('s') && fs.existsSync(OPTIONS_PAGE)) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(pathToFileURL(OPTIONS_PAGE).href)
  await sleep(1200)
  const look = page.locator('#nowcard .look[data-look="A"] figure').first()
  await look.screenshot({ path: path.join(OUT, 'drawing-now-card-A.png') })
  await ctx.close()
  const pics = ['n1-none', 'n2-far', 'n3-soon', 'n4-ongoing-next', 'n5-two-ongoing', 'n5-two-ongoing-open', 'n6-many-upcoming-open', 'n11-folded']
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;background:#f4efe4;font:14px system-ui;display:flex;gap:32px;align-items:flex-start">
<div><h3 style="margin:0 0 8px">The drawing (Calendar extras options §4 · A)</h3><img src="drawing-now-card-A.png" style="max-width:1100px"></div>
<div><h3 style="margin:0 0 8px">The app (cal-wave, frozen clock)</h3><div style="display:grid;grid-template-columns:repeat(2,auto);gap:18px">${pics.map((p) => `<figure style="margin:0"><img src="${p}.png"><figcaption style="color:#776">${p}</figcaption></figure>`).join('')}</div></div></body>`
  fs.writeFileSync(path.join(OUT, 'beside-drawing.html'), html)
  const c2 = await browser.newContext({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 })
  const p2 = await c2.newPage()
  await p2.goto(pathToFileURL(path.join(OUT, 'beside-drawing.html')).href)
  await sleep(500)
  await p2.screenshot({ path: path.join(OUT, 'beside-drawing.png'), fullPage: true })
  await c2.close()
  check('s the app\'s card states screenshotted beside the drawing', fs.existsSync(path.join(OUT, 'beside-drawing.png')))
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
