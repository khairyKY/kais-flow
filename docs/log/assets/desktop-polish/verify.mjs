// Kai's desktop feedback (2026-10-03, Windows app at 125–150%) on the REAL app, signed in against a
// MOCKED backend — the task-sheet recipe (docs/log/assets/task-sheet/verify.mjs): the dev server runs
// with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST call. Writes are answered 201 and recorded.
// Desktop 1280×720 with the interface size at 150% (and 100% as a sanity pass), day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5247'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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

// ── data ──
const T = '2026-09-01T09:00:00Z'
const today = new Date()
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id('1', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: today.toISOString(), scheduled_start: null,
  scheduled_end: null, top3: n <= 3, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over,
})
const PROJECT = { id: id('2', 1), user_id: UID, domain_id: null, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], deleted_at: null, created_at: T, updated_at: T }
const AREA = { id: id('3', 1), user_id: UID, domain_id: null, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const TRASHED_AREA = { ...AREA, id: id('3', 2), name: 'Old garden bed', deleted_at: '2026-10-01T10:00:00Z' }
const settings = (view) => ({ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', calendar_day_count: 4, ...(view !== undefined ? { calendar_default_view: view } : null), created_at: T, updated_at: T })
function tables(s = {}) {
  return {
    tasks: [
      task(1, 'Call the tyre supplier', { project_id: PROJECT.id }),
      task(2, 'Send the Q3 numbers to Priya'),
      task(3, 'Plan the forecasting logic'),
      task(4, 'Run 5k', { area_id: AREA.id, top3: false }),
      ...Array.from({ length: 24 }, (_, i) => task(10 + i, `Errand number ${i + 1}`, { top3: false })),
    ],
    projects: [PROJECT],
    areas: [AREA, TRASHED_AREA],
    domains: [],
    app_settings: [settings(s.view)],
    calendar_events: [],
    inbox_items: [],
    journal_entries: [],
    activity_log: [],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

/** Opens `route` at 1280×720 (or `o.view`), interface size `o.scale` (default 150%). */
async function open(route, s = {}, o = {}) {
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 720 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, scale, tauri]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_ui_scale', scale)
    if (tauri) window.__TAURI_INTERNALS__ = { invoke: async (cmd) => (cmd === 'plugin:app|version' ? tauri : null) }
  }, [o.theme ?? 'day', JSON.stringify(session), String(o.scale ?? 1.5), o.tauriVersion ?? null])
  const state = { rows: tables(s), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const mainScroll = (page) => page.evaluate(() => document.querySelector('.app-main-content').scrollTop)
const writesTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => w.body)
const noHScroll = (page) => page.evaluate(() => { const m = document.querySelector('.app-main-content'); return m.scrollWidth <= m.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 })

for (const theme of ['day', 'night']) {
  const N = (s) => `${s}-${theme}`

  // ── 3 · Settings scrolls from anywhere (150% and 100%) + the Calendar / App cards ──
  for (const scale of theme === 'day' ? [1.5, 1] : [1.5]) {
    const { ctx, page, errors, state } = await open('/settings', {}, { theme, scale })
    const content = await page.locator('#settings-Appearance').boundingBox()
    await page.mouse.move(content.x + content.width / 2, Math.min(content.y + content.height / 2, 600))
    await page.mouse.wheel(0, 400)
    await sleep(500)
    const overContent = await mainScroll(page)
    check(`${N('settings')} @${scale * 100}% wheel over the content cards scrolls the page`, overContent > 0, overContent)
    await page.evaluate(() => { document.querySelector('.app-main-content').scrollTop = 0 })
    await page.mouse.move(content.x - 120, 400)
    await page.mouse.wheel(0, 400)
    await sleep(500)
    check(`${N('settings')} @${scale * 100}% wheel over the left nav still scrolls it`, (await mainScroll(page)) > 0)
    check(`${N('settings')} @${scale * 100}% no sideways scroll`, await noHScroll(page))
    if (scale === 1.5) {
      await page.evaluate(() => { document.querySelector('.app-main-content').scrollTop = 0 })
      await shot(page, N('settings-150'))
      // 2 · default calendar view — the row shows Week until picked, a pick writes app_settings
      const cal = page.locator('#settings-Calendar')
      await cal.scrollIntoViewIfNeeded()
      await sleep(300)
      check(`${N('settings')} Calendar → Opens on shows Week (desktop default) when unset`, (await cal.locator('button[aria-pressed="true"]').innerText()) === 'Week')
      const from = state.writes.length
      await cal.getByRole('button', { name: '3 days' }).click()
      await sleep(500)
      const w = writesTo(state, 'app_settings', from)
      check(`${N('settings')} picking 3 days writes calendar_default_view = '3day'`, w.length === 1 && w[0].calendar_default_view === '3day', JSON.stringify(w.map((x) => x.calendar_default_view)))
      check(`${N('settings')} and the row shows it`, (await cal.locator('button[aria-pressed="true"]').innerText()) === '3 days')
      await shot(page, N('settings-calendar'))
    }
    check(`${N('settings')} @${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 3 · the same dead scroller on the other pages that had it ──
  if (theme === 'day') {
    for (const route of ['/settings/import', '/activity', '/herbarium', '/trash', '/library']) {
      const { ctx, page } = await open(route, {}, { theme })
      const scrollable = await page.evaluate(() => { const m = document.querySelector('.app-main-content'); return m.scrollHeight > m.clientHeight + 1 })
      await page.mouse.move(820, 420)
      await page.mouse.wheel(0, 300)
      await sleep(400)
      const st = await mainScroll(page)
      check(`${route} wheel over the page content scrolls it`, !scrollable || st > 0, `scrollable=${scrollable} scrollTop=${st}`)
      await ctx.close()
    }
  }

  // ── 2 + 1 · the calendar opens on the synced default; the toolbar chevron ──
  for (const [view, label, cols] of [[undefined, 'WEEK', 7], ['day', 'DAY', 1], ['3day', '3 DAYS', 3], ['week', 'WEEK', 7]]) {
    if (theme === 'night' && view !== '3day') continue
    const { ctx, page, errors } = await open('/calendar', { view }, { theme })
    const btn = page.locator('.cal-head span[role="button"][aria-haspopup="dialog"]')
    const text = (await btn.innerText()).trim()
    const n = await page.locator('.fc-col-header-cell').count()
    check(`${N('calendar')} default ${view ?? 'unset'} → opens on ${label} (${cols} column${cols > 1 ? 's' : ''})`, text === label && n === cols, `${text} · ${n}`)
    if (view === '3day' || theme === 'day' && view === undefined) {
      const html = await btn.innerHTML()
      check(`${N('calendar')} view button: the kit chevdown, no ⚟`, html.includes('<svg') && !text.includes('⚟') && !html.includes('⚟'))
    }
    if (view === '3day') await shot(page, N('calendar-3day'))
    check(`${N('calendar')} ${view ?? 'unset'} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 6 + 11 · drag-select on the week grid at 150%: no "Invalid Date", 15-min snap, quick-create fits ──
  {
    const { ctx, page, errors } = await open('/calendar', {}, { theme })
    const col = await page.locator('.fc-timegrid-col[data-date]').nth(3).boundingBox()
    const x = col.x + col.width / 2
    /** A half-hour lane whose whole height is on screen in the time grid (not under the header). */
    const visibleLane = () =>
      page.evaluate((px) => {
        for (const e of document.querySelectorAll('.fc-timegrid-slot-lane')) {
          const b = e.getBoundingClientRect()
          const hitTop = document.elementFromPoint(px, b.top + 2)
          const hitBottom = document.elementFromPoint(px, b.bottom - 2)
          if (b.top > 380 && b.bottom < 680 && hitTop?.closest('.fc-timegrid-body') && hitBottom?.closest('.fc-timegrid-body')) return { top: b.top, h: b.height }
        }
        return null
      }, x)
    const lane = await visibleLane()
    const qh = lane.h / 2
    const y0 = lane.top + 2
    const y1 = lane.top + 2.5 * qh // three quarter-hour cells → 45 min
    await page.mouse.move(x, y0)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) { await page.mouse.move(x, y0 + ((y1 - y0) * i) / 6); await sleep(40) }
    await sleep(250)
    const mirror = (await page.locator('.fc-event-mirror').allInnerTexts()).join(' | ')
    check(`${N('calendar')} drag preview has a real time, no "Invalid Date"`, mirror !== '' && !/invalid/i.test(mirror) && /\d/.test(mirror), mirror)
    await shot(page, N('calendar-drag'))
    await page.mouse.up()
    await sleep(600)
    const qc = page.locator('.kf-quickcreate')
    const times = await qc.locator('input[aria-label="Time"]').evaluateAll((els) => els.map((e) => e.value))
    const mins = times.map((t) => { const m = t.match(/(\d+):(\d+)\s*(AM|PM)/); return m ? ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : NaN })
    check(`${N('calendar')} drag of three quarter-hours → a 45-minute slot (15-min snap)`, mins.length === 2 && mins[1] - mins[0] === 45 && mins.every((m) => m % 15 === 0), times.join(' – '))
    check(`${N('calendar')} quick-create shows the duration on the When row`, (await qc.innerText()).includes('45m'))
    for (const kind of ['Event', 'Task', 'Time block']) {
      await qc.getByRole('button', { name: kind, exact: true }).click()
      await sleep(250)
      const m = await qc.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, sh: el.scrollHeight, ch: el.clientHeight, vw: innerWidth, vh: innerHeight } })
      check(`${N('calendar')} quick-create (${kind}) fits the 150% window, no inner scroll`, m.top >= 0 && m.bottom <= m.vh && m.left >= 0 && m.right <= m.vw && m.sh <= m.ch + 1, JSON.stringify(m))
      if (kind === 'Task') {
        check(`${N('calendar')} task: priority and project share one row, no hint line`, !(await qc.innerText()).includes('lands in Tasks'))
        await shot(page, N('quickcreate-task'))
      }
    }
    check(`${N('calendar')} quick-create every field reachable: title, date, 2 times, kind switch, More options, Create`, (await qc.locator('input').count()) >= 3 && (await qc.getByText('More options').count()) === 1 && (await qc.getByRole('button', { name: /Create/ }).count()) === 1)
    // A plain click still makes a half-hour
    await page.keyboard.press('Escape')
    await sleep(300)
    const lane2 = await visibleLane()
    await page.mouse.click(x, lane2.top + 4)
    await sleep(600)
    const t2 = await page.locator('.kf-quickcreate input[aria-label="Time"]').evaluateAll((els) => els.map((e) => e.value))
    const m2 = t2.map((t) => { const m = t.match(/(\d+):(\d+)\s*(AM|PM)/); return m ? ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : NaN })
    check(`${N('calendar')} a plain click still opens a 30-minute slot`, m2.length === 2 && m2[1] - m2[0] === 30, t2.join(' – '))
    // quick-create's time list opens inside the window (9 — the same TimeField)
    await page.locator('.kf-quickcreate input[aria-label="Time"]').last().click()
    await sleep(300)
    const lb = await page.locator('[role="listbox"]').last().boundingBox()
    check(`${N('calendar')} quick-create time list inside the window`, lb && lb.x >= 0 && lb.x + lb.width <= 1280 && lb.y >= 0 && lb.y + lb.height <= 720, JSON.stringify(lb))
    check(`${N('calendar')} drag scene no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 9 · the task editor's time list opens on screen (125% and 150%) ──
  for (const scale of theme === 'day' ? [1.25, 1.5] : [1.5]) {
    const { ctx, page, errors } = await open(`/tasks/${id('1', 1)}`, {}, { theme, scale })
    const input = page.locator('input[aria-label="Time"]').first()
    await input.click()
    await sleep(400)
    const lb = await page.locator('[role="listbox"]').boundingBox()
    const ib = await input.boundingBox()
    check(`${N('task editor')} @${scale * 100}% time list opens inside the window, under/over its field`, lb && lb.x >= 0 && lb.x + lb.width <= 1280 && lb.y >= 0 && lb.y + lb.height <= 720 && Math.abs(lb.x - ib.x) < 4, `list ${JSON.stringify(lb)} field ${JSON.stringify(ib)}`)
    const opts = await page.locator('[role="listbox"] [role="option"]').allInnerTexts()
    check(`${N('task editor')} @${scale * 100}% the list steps in 15 minutes`, opts.length === 96 && opts[1] === '12:15 AM', `${opts.length} · ${opts.slice(0, 3).join(', ')}`)
    if (scale === 1.5) await shot(page, N('task-editor-timelist'))
    check(`${N('task editor')} @${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 4 · our right-click menu on Projects; area delete + Undo; the WebView menu is suppressed ──
  {
    const { ctx, page, errors, state } = await open('/projects', {}, { theme })
    const areaRow = page.locator('.kf-lift', { hasText: 'Health' }).first()
    await areaRow.click({ button: 'right' })
    await sleep(300)
    // projects-fixes (Kai 2026-10-06) added "Change type…" to both menus (docs/log/assets/projects-fixes).
    check(`${N('projects')} right-click an area → Open · Rename · Change type… · Delete`, (await page.locator('[role="menu"]').innerText()).split('\n').join(' · ') === 'Open · Rename · Change type… · Delete')
    await shot(page, N('projects-area-menu'))
    await page.keyboard.press('Escape')
    await sleep(200)
    await page.locator('.kf-lift', { hasText: 'Shaheen Website' }).first().click({ button: 'right' })
    await sleep(300)
    check(`${N('projects')} right-click a project → Open · Rename · Change type… · Finish & press · Delete`, (await page.locator('[role="menu"]').innerText()).split('\n').join(' · ') === 'Open · Rename · Change type… · Finish & press · Delete')
    await page.keyboard.press('Escape')
    await sleep(200)
    const prevented = await page.evaluate(() => {
      const fire = (el) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented }
      const h1 = document.querySelector('h1')
      const input = document.createElement('input')
      document.querySelector('.app-main-content').appendChild(input)
      const out = { page: fire(h1), input: fire(input) }
      const range = document.createRange(); range.selectNodeContents(h1); getSelection().removeAllRanges(); getSelection().addRange(range)
      out.selected = fire(h1)
      getSelection().removeAllRanges(); input.remove()
      return out
    })
    check(`${N('projects')} the WebView's own menu is blocked on the page, kept in a text field and over selected text`, prevented.page && !prevented.input && !prevented.selected, JSON.stringify(prevented))
    if (theme === 'day') {
      // ⋯ (touch) opens the same menu; Rename edits in place
      const more = page.getByRole('button', { name: 'More for Shaheen Website' })
      await more.scrollIntoViewIfNeeded()
      await sleep(300)
      await more.click()
      await sleep(300)
      await page.locator('[role="menuitem"]', { hasText: 'Rename' }).click()
      await sleep(200)
      const from = state.writes.length
      await page.keyboard.type('Shaheen Site')
      await page.keyboard.press('Enter')
      await sleep(500)
      const w = writesTo(state, 'projects', from)
      check(`${N('projects')} ⋯ → Rename edits in place and writes the name`, w.length === 1 && w[0].name === 'Shaheen Site' && writesTo(state, 'activity_log', from).some((a) => a.event_type === 'project.renamed'))
    }
    // Delete an area: Trash + Undo, its task untouched
    const from = state.writes.length
    await areaRow.click({ button: 'right' })
    await sleep(300)
    await page.locator('[role="menuitem"]', { hasText: 'Delete' }).click()
    await sleep(600)
    const aw = writesTo(state, 'areas', from)
    check(`${N('projects')} area Delete → deleted_at written, no confirm, logged`, aw.length === 1 && !!aw[0].deleted_at && writesTo(state, 'activity_log', from).some((a) => a.event_type === 'area.deleted'))
    check(`${N('projects')} its tasks are not touched`, writesTo(state, 'tasks', from).length === 0)
    check(`${N('projects')} the row leaves, "Moved to Trash · Undo"`, (await page.locator('.kf-lift', { hasText: 'Health' }).count()) === 0 && (await page.locator('.kf-toast-msg').allInnerTexts()).includes('Moved to Trash'))
    await shot(page, N('projects-area-deleted'))
    await page.locator('.kf-toast').getByRole('button', { name: /undo/i }).click()
    await sleep(600)
    const uw = writesTo(state, 'areas', from)
    check(`${N('projects')} Undo puts the area back`, uw.length === 2 && uw[1].deleted_at === null && (await page.locator('.kf-lift', { hasText: 'Health' }).count()) === 1)
    check(`${N('projects')} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 4 · Trash lists a trashed area and restores it ──
  if (theme === 'day') {
    const { ctx, page, errors, state } = await open('/trash', {}, { theme })
    const row = page.locator(`[id="trash-${TRASHED_AREA.id}"]`)
    check('trash lists the trashed area with an Area badge', (await row.count()) === 1 && (await row.innerText()).includes('Old garden bed') && (await row.innerText()).toUpperCase().includes('AREA'))
    const from = state.writes.length
    await row.getByText(/restore/i).first().click()
    await sleep(900)
    const w = writesTo(state, 'areas', from)
    check('trash → Restore writes deleted_at null', w.length === 1 && w[0].deleted_at === null, JSON.stringify(w))
    await shot(page, 'trash-area-day')
    check('trash no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 5 · Focus: search the picker ──
  {
    const { ctx, page, errors } = await open('/focus', {}, { theme })
    await page.locator('span[title="Click to select another task"]').click()
    await sleep(400)
    const panel = await page.locator('[role="listbox"]').evaluate((el) => { const r = el.parentElement.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, focus: document.activeElement?.getAttribute('aria-label') } })
    check(`${N('focus')} picker opens inside the 150% window with the search field focused`, panel.top >= 0 && panel.bottom <= 720 && panel.left >= 0 && panel.right <= 1280 && panel.focus === 'Search tasks to focus on', JSON.stringify(panel))
    await shot(page, N('focus-picker'))
    await page.keyboard.type('tyre')
    await sleep(200)
    const titles = await page.locator('[role="option"] > span:first-child').allInnerTexts()
    check(`${N('focus')} typing filters by title`, JSON.stringify(titles) === JSON.stringify(['Call the tyre supplier']), JSON.stringify(titles))
    await page.keyboard.press('Enter')
    await sleep(300)
    check(`${N('focus')} Enter picks the first match and closes`, (await page.locator('span[title="Click to select another task"]').innerText()) === 'Call the tyre supplier' && (await page.locator('[role="listbox"]').count()) === 0)
    await page.locator('span[title="Click to select another task"]').click()
    await sleep(300)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const sel = await page.locator('[role="option"][aria-selected="true"] > span:first-child').innerText()
    await page.keyboard.press('Escape')
    await sleep(300)
    check(`${N('focus')} arrows move, Esc closes`, sel === 'Plan the forecasting logic' && (await page.locator('[role="listbox"]').count()) === 0, sel)
    check(`${N('focus')} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 10 · the collapsed rail: boxes centred, tape on the box, labels fly out, footer reachable ──
  for (const scale of theme === 'day' ? [1, 1.25, 1.5] : [1.5]) {
    const { ctx, page, errors } = await open('/today', {}, { theme, scale, view: { width: 1280, height: 690 } })
    await page.getByTitle('Collapse sidebar').click()
    await sleep(400)
    const m = await page.evaluate(() => {
      const aside = document.querySelector('.app-sidebar').getBoundingClientRect()
      const icon = (r) => r.querySelector('.kf-nav-icon').getBoundingClientRect()
      const rows = [...document.querySelectorAll('.app-sidebar nav .kf-side-row')].map((r) => { const b = r.getBoundingClientRect(); const i = icon(r); return { off: Math.abs((b.left + b.right) / 2 - (aside.left + aside.right - 1) / 2), iconOff: Math.abs((b.left + b.right) / 2 - (i.left + i.right) / 2) } })
      const act = document.querySelector('.app-sidebar nav .kf-active')
      const a = act.getBoundingClientRect()
      const t = act.querySelector('.kf-nav-tape').getBoundingClientRect()
      const f = document.querySelector('.app-sidebar-footer .kf-side-row').getBoundingClientRect()
      const hit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2)?.closest('.app-sidebar-footer')
      return { maxOff: Math.max(...rows.map((r) => r.off)), maxIconOff: Math.max(...rows.map((r) => r.iconOff)), tapeInside: t.left >= a.left - 1 && t.right <= a.right + 1, footerHit: !!hit }
    })
    check(`${N('rail')} @${scale * 100}% every box centred in the rail, its icon centred in the box`, m.maxOff <= 1.5 && m.maxIconOff <= 1.5, JSON.stringify(m))
    check(`${N('rail')} @${scale * 100}% the active tape sits on its box`, m.tapeInside)
    check(`${N('rail')} @${scale * 100}% the footer stays reachable (the column scrolls, it never runs under)`, m.footerHit)
    await page.locator('.app-sidebar nav .kf-side-row').nth(2).hover()
    await sleep(250)
    const fly = await page.locator('.kf-nav-flyout').boundingBox()
    const row = await page.locator('.app-sidebar nav .kf-side-row').nth(2).boundingBox()
    check(`${N('rail')} @${scale * 100}% hover label beside its row`, fly && fly.x > row.x + row.width && Math.abs(fly.y + fly.height / 2 - (row.y + row.height / 2)) < 3)
    if (scale === 1.5) await shot(page, N('rail-collapsed-150'))
    check(`${N('rail')} @${scale * 100}% no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 7 · the main view uses its width: Today and Tasks share one page width ──
  const combos = theme === 'day' ? [[1920, 1080, 1, false], [1920, 1080, 1, true], [1920, 1080, 1.25, false], [1920, 1080, 1.5, false], [1280, 720, 1.5, false], [1280, 720, 1.5, true], [1280, 720, 1, false]] : [[1920, 1080, 1, false]]
  for (const [w, h, scale, collapsed] of combos) {
    const geo = {}
    for (const route of ['/today', '/tasks']) {
      const { ctx, page, errors } = await open(route, {}, { theme, scale, view: { width: w, height: h } })
      if (collapsed) { await page.getByTitle('Collapse sidebar').click(); await sleep(400) }
      geo[route] = await page.evaluate(() => {
        const main = document.querySelector('.app-main-content')
        const cs = getComputedStyle(main)
        const z = Number(document.documentElement.style.zoom) || 1
        // clientWidth / padding are layout px already; rects are visual px (÷ zoom).
        const avail = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const root = document.querySelector('.kf-route').firstElementChild.tagName === 'STYLE' ? document.querySelector('.kf-route').children[1] : document.querySelector('.kf-route').firstElementChild
        const r = root.getBoundingClientRect()
        return { avail: Math.round(avail), width: Math.round(r.width / z), left: Math.round((r.left - main.getBoundingClientRect().left) / z) }
      })
      if (route === '/today' && w === 1920 && scale === 1 && !collapsed) await shot(page, N('today-1920'))
      check(`${N(route.slice(1))} ${w}×${h} @${scale * 100}%${collapsed ? ' rail' : ''}: fills the column up to 1280, from the gutter`, geo[route].width === Math.min(1280, geo[route].avail) && geo[route].left === geo['/today'].left, JSON.stringify(geo[route]))
      if (errors.length) check(`${route} ${w} errors`, false, errors.join(' | '))
      await ctx.close()
    }
    check(`${theme} ${w}×${h} @${scale * 100}%${collapsed ? ' rail' : ''}: Today and Tasks are the same width`, geo['/today'].width === geo['/tasks'].width)
  }

  // ── 8 · Check for updates ──
  if (theme === 'day') {
    const MINE = 'aaaaaaa1111111111111111111111111111111111'
    const web = async (answer) => {
      const env = await open('/settings', {}, { theme })
      await env.ctx.route('**/version.json*', (r) => (answer === 'offline' ? r.abort() : r.fulfill({ json: { commit: answer, builtAt: '2026-10-03T08:00:00Z' } })))
      await env.page.evaluate((c) => { const m = document.createElement('meta'); m.name = 'kf-build'; m.content = `${c} 2026-10-02T20:20:00Z`; document.head.appendChild(m) }, MINE)
      const card = env.page.locator('#settings-App')
      await card.scrollIntoViewIfNeeded()
      await card.getByRole('button', { name: 'Check for updates' }).click()
      await sleep(600)
      return { ...env, card, text: await card.innerText() }
    }
    {
      const { ctx, page, card, text } = await web('bbbbbbb2222222222222222222222222222222222')
      check('updates (web) a newer deploy → "A new version is ready" + Reload', text.includes('A new version is ready') && (await card.getByRole('button', { name: 'Reload' }).count()) === 1)
      check('updates (web) shows this build + its date', text.includes('build aaaaaaa') && text.includes('built 2 Oct 2026') || text.includes('built 3 Oct 2026'), text.replace(/\n/g, ' / '))
      await shot(page, 'updates-web-newer-day')
      await ctx.close()
    }
    {
      const { ctx, text } = await web(MINE)
      check("updates (web) same commit → You're on the latest", text.includes("You're on the latest (build aaaaaaa)"), text.replace(/\n/g, ' / '))
      await ctx.close()
    }
    {
      const { ctx, text, errors } = await web('offline')
      check('updates (web) offline → a calm line, no crash', text.includes('Couldn’t reach the update check') && errors.length === 0, text.replace(/\n/g, ' / '))
      await ctx.close()
    }
    const native = async (tag) => {
      const env = await open('/settings', {}, { theme, tauriVersion: '1.0.14' })
      const requested = []
      await env.ctx.route('https://api.github.com/**', (r) => {
        requested.push(r.request().url())
        if (tag === 'offline') return r.abort()
        return r.fulfill({ json: { tag_name: tag, assets: [{ name: `kais-flow-${tag}.apk`, browser_download_url: `https://github.com/khairyKY/kais-flow/releases/download/${tag}/kais-flow-${tag}.apk` }, { name: `kais-flow-${tag}-windows-setup.exe`, browser_download_url: `https://github.com/khairyKY/kais-flow/releases/download/${tag}/kais-flow-${tag}-windows-setup.exe` }] } })
      })
      await env.ctx.route('https://github.com/**', (r) => { requested.push(r.request().url()); return r.fulfill({ status: 200, headers: { 'content-disposition': 'attachment; filename=setup.exe', 'content-type': 'application/octet-stream' }, body: 'x' }) })
      const card = env.page.locator('#settings-App')
      await card.scrollIntoViewIfNeeded()
      const before = await card.innerText()
      await card.getByRole('button', { name: 'Check for updates' }).click()
      await sleep(700)
      return { ...env, card, requested, before, text: await card.innerText() }
    }
    {
      const { ctx, page, card, requested, before, text } = await native('v1.0.15')
      check('updates (Windows) shows the installed version', before.includes('v1.0.14'), before.replace(/\n/g, ' / '))
      check('updates (Windows) newer release → "v1.0.15 is out" + Download, one request', text.includes('v1.0.15 is out') && (await card.getByRole('button', { name: 'Download' }).count()) === 1 && requested.length === 1)
      await shot(page, 'updates-windows-newer-day')
      await card.getByRole('button', { name: 'Download' }).click().catch(() => {})
      await sleep(800)
      check('updates (Windows) Download asks for the Windows installer', requested.some((u) => u.endsWith('/kais-flow-v1.0.15-windows-setup.exe')), requested.join(' '))
      await ctx.close()
    }
    {
      const { ctx, text } = await native('v1.0.14')
      check("updates (Windows) same version → You're on the latest (v1.0.14)", text.includes("You're on the latest (v1.0.14)"), text.replace(/\n/g, ' / '))
      await ctx.close()
    }
    {
      const { ctx, text, errors } = await native('offline')
      check('updates (Windows) offline → a calm line, no crash', text.includes('Couldn’t reach the update check') && errors.length === 0)
      await ctx.close()
    }
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
