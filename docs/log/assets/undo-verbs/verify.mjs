// P7e A17 · A18 (docs/log/2026-10-13-0808-p7e-parity-audit.md §3 A): Undo for the silent setters, and the
// remaining list verbs — on the REAL app against a MOCKED backend (the keys-undo recipe: dev server with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session, Playwright answers every REST call; writes are
// recorded AND applied).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=a,p,v,c runs a subset)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5279'
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
const P1 = 'b0000000-0000-4000-8000-000000000001'
const D1 = 'd0000000-0000-4000-8000-000000000001'
const tid = (n) => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const BANK = 1, BASIL = 2, FERNS = 3, BRIEF = 4, SHED = 5
const TASKS = [
  task(BANK, 'Call the bank', { due_at: iso('09:00'), project_id: P1, domain_id: D1 }),
  task(BASIL, 'Plant the basil', { due_at: iso('09:00', 14), labels: ['garden'], project_id: P1, domain_id: D1 }),
  task(FERNS, 'Water the ferns', { due_at: iso('09:00'), labels: ['garden'] }),
  task(BRIEF, 'Write the brief', { due_at: iso('09:00'), priority: 3 }),
  task(SHED, 'Paint the shed', { someday: true }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting App', domain_id: D1, type: 'standard', status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const DOMAINS = [{ id: D1, user_id: UID, name: 'Freelance', color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: PROJECTS, domains: DOMAINS, areas: [], people: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.phone ? phone : desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar', 'hint:today', 'hint:tasks']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v99.0.0' }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
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
    if (url.pathname.startsWith('/functions/')) return r.fulfill({ status: 503, json: { error: 'mock' } }) // no AI read in the mock
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
const where = (page) => { const u = new URL(page.url()); return u.pathname + u.search }
const toast = (page, msg) => page.locator('.kf-toast', { has: page.locator('.kf-toast-msg', { hasText: msg }) }).first()
const toastSoon = (page, msg) => toast(page, msg).waitFor({ timeout: 8000 }).then(() => true, () => false)
/** The toast says `msg` and offers Undo (the app's one pattern). */
const undoToast = async (page, msg) => (await toastSoon(page, msg)) && (await toast(page, msg).getByRole('button', { name: 'Undo' }).count()) === 1
const pressUndo = async (page, msg) => {
  await toast(page, msg).getByRole('button', { name: 'Undo' }).click()
  await sleep(1200)
}
const row = (state, table, id) => state.rows[table]?.find((r) => r.id === id)
async function focusRow(page, id, max = 8) {
  await page.evaluate(() => (document.activeElement)?.blur())
  for (const key of ['j', 'k']) {
    for (let i = 0; i < max; i++) {
      if ((await page.evaluate(() => document.activeElement?.id)) === id) return true
      await page.keyboard.press(key)
      await sleep(120)
    }
  }
  return (await page.evaluate(() => document.activeElement?.id)) === id
}
/** Right-click a row, then walk the menu by its labels (a submenu opens on click). */
async function rowMenu(page, n, ...labels) {
  const el = page.locator(`[id="task-${tid(n)}"]`)
  await el.scrollIntoViewIfNeeded()
  await sleep(200)
  await el.click({ button: 'right', position: { x: 60, y: 14 } })
  await sleep(300)
  for (const l of labels) {
    await page.getByRole('menuitem', { name: l, exact: false }).last().click()
    await sleep(350)
  }
}
const menuOpen = (page, text) => page.locator('[role="menu"]', { hasText: text }).first().waitFor({ timeout: 3000 }).then(() => true, () => false)

// ── A17: every silent setter now says what it set, with Undo. ──
if (want('a')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  check('a0 All lists the tasks', (await page.locator(`[id="task-${tid(BASIL)}"]`).count()) === 1)

  // Keys 1 and 3.
  await focusRow(page, `task-${tid(BASIL)}`)
  await page.keyboard.press('1')
  check('a1a key 1: "Planned · Today …" with Undo', await undoToast(page, 'Planned · Today'))
  await sleep(800)
  check('a1b …written to today', row(state, 'tasks', tid(BASIL))?.due_at?.startsWith('2026-10-12'), row(state, 'tasks', tid(BASIL))?.due_at)
  await page.keyboard.press('Control+z')
  await sleep(1200)
  check('a1c Ctrl+Z puts Wed 14 back', row(state, 'tasks', tid(BASIL))?.due_at === iso('09:00', 14), row(state, 'tasks', tid(BASIL))?.due_at)
  await focusRow(page, `task-${tid(BANK)}`)
  await page.keyboard.press('3')
  check('a2a key 3: "Planned · …" with Undo', await undoToast(page, 'Planned ·'))
  await sleep(800)
  const moved = row(state, 'tasks', tid(BANK))?.due_at
  check('a2b …written to next week', moved && moved > iso('23:00', 17), moved)
  await page.keyboard.press('Control+z')
  await sleep(1200)
  check('a2c Ctrl+Z puts today back', row(state, 'tasks', tid(BANK))?.due_at === iso('09:00'), row(state, 'tasks', tid(BANK))?.due_at)

  // Priority, repeat and remind from the row menu.
  await rowMenu(page, FERNS, 'Priority', 'High')
  check('a3a menu Priority → High: "Priority · High" with Undo', await undoToast(page, 'Priority · High'))
  await sleep(800)
  check('a3b …written', row(state, 'tasks', tid(FERNS))?.priority === 2)
  await shot(page, 'a3-priority-toast')
  await pressUndo(page, 'Priority · High')
  check('a3c Undo takes it off', row(state, 'tasks', tid(FERNS))?.priority === null, row(state, 'tasks', tid(FERNS))?.priority)
  await rowMenu(page, FERNS, 'Repeat', 'Weekly')
  check('a4a menu Repeat → Weekly: "Repeats · Weekly" with Undo', await undoToast(page, 'Repeats · Weekly'))
  await sleep(800)
  check('a4b …written', row(state, 'tasks', tid(FERNS))?.recurrence_rule === 'FREQ=WEEKLY')
  await pressUndo(page, 'Repeats · Weekly')
  check('a4c Undo: no repeat again', row(state, 'tasks', tid(FERNS))?.recurrence_rule === null)
  await rowMenu(page, FERNS, 'Remind', '15 min before')
  check('a5a menu Remind → 15 min before: "Reminder · 15m before" with Undo', await undoToast(page, 'Reminder · 15m before'))
  await sleep(800)
  check('a5b …written', row(state, 'tasks', tid(FERNS))?.reminder_at === iso('08:45'), row(state, 'tasks', tid(FERNS))?.reminder_at)
  await pressUndo(page, 'Reminder · 15m before')
  check('a5c Undo: no reminder again', row(state, 'tasks', tid(FERNS))?.reminder_at === null)

  // The popover (the sheet's controls): Duration and Labels.
  await page.locator(`[id="task-${tid(BRIEF)}"]`).getByText('Write the brief', { exact: true }).first().click()
  const pop = page.locator('.tp-pop')
  await pop.waitFor({ timeout: 4000 })
  await pop.getByRole('button', { name: 'Duration' }).click()
  await sleep(300)
  await page.getByRole('menuitem', { name: '30m', exact: true }).click()
  check('a6a sheet Duration → 30m: "Duration · 30m" with Undo', await undoToast(page, 'Duration · 30m'))
  await sleep(800)
  check('a6b …written, the popover stays', row(state, 'tasks', tid(BRIEF))?.duration_min === 30 && (await pop.count()) === 1)
  await pressUndo(page, 'Duration · 30m')
  check('a6c Undo: no duration again', row(state, 'tasks', tid(BRIEF))?.duration_min === null)
  if (!(await pop.count())) await page.locator(`[id="task-${tid(BRIEF)}"]`).getByText('Write the brief', { exact: true }).first().click() // the Undo click was outside it
  await pop.waitFor({ timeout: 4000 })
  await pop.getByRole('button', { name: 'Label', exact: true }).click()
  await sleep(400)
  await page.getByRole('option', { name: /garden/ }).first().click()
  check('a7a sheet Labels → garden: "Added “garden”" with Undo', await undoToast(page, 'Added “garden”'))
  await sleep(800)
  check('a7b …written', JSON.stringify(row(state, 'tasks', tid(BRIEF))?.labels) === '["garden"]')
  await page.keyboard.press('Escape')
  await sleep(300)
  await pressUndo(page, 'Added “garden”')
  check('a7c Undo: no label again', JSON.stringify(row(state, 'tasks', tid(BRIEF))?.labels) === '[]', JSON.stringify(row(state, 'tasks', tid(BRIEF))?.labels))
  await page.keyboard.press('Escape')
  await sleep(300)

  // The command bar's "Added to Inbox".
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('n')
  const bar = page.locator('#kf-capture-input').first()
  await bar.waitFor({ timeout: 4000 })
  await bar.fill('remember the plant food')
  await page.keyboard.press('Enter')
  check('a8a a plain line: "Added to Inbox" with Undo', await undoToast(page, 'Added to Inbox'))
  await sleep(800)
  const cap = state.rows.inbox_items.find((i) => i.raw_text === 'remember the plant food')
  check('a8b …the capture was written', !!cap && !cap.deleted_at)
  await shot(page, 'a8-added-to-inbox')
  await pressUndo(page, 'Added to Inbox')
  check('a8c Undo sends it to Trash', !!row(state, 'inbox_items', cap?.id)?.deleted_at, JSON.stringify(row(state, 'inbox_items', cap?.id)?.deleted_at))
  check('a9 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()

  // The editor's date fields.
  {
    const { ctx, page, errors, state } = await open(`/tasks/${tid(BANK)}`)
    await page.getByRole('button', { name: /Due date/ }).first().click()
    await sleep(400)
    await page.locator('[data-day="2026-10-15"]').click()
    await sleep(300)
    const done = page.getByRole('button', { name: 'Done', exact: true })
    if (await done.count()) await done.last().click()
    check('a10a editor Due date → Thu 15: "Planned · Thu …" with Undo', await undoToast(page, 'Planned ·'))
    await sleep(800)
    check('a10b …written', row(state, 'tasks', tid(BANK))?.due_at?.startsWith('2026-10-15'), row(state, 'tasks', tid(BANK))?.due_at)
    await shot(page, 'a10-editor-date-toast')
    await pressUndo(page, 'Planned ·')
    check('a10c Undo puts today back', row(state, 'tasks', tid(BANK))?.due_at === iso('09:00'), row(state, 'tasks', tid(BANK))?.due_at)
    check('a10d no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // Someday's → Today.
  {
    const { ctx, page, errors, state } = await open('/tasks?list=someday')
    const shed = page.locator(`[id="task-${tid(SHED)}"]`)
    await shed.hover()
    await sleep(300)
    await shed.getByText('→ Today').click()
    check('a11a Someday → Today: "Planned · Today …" with Undo', await undoToast(page, 'Planned · Today'))
    await sleep(800)
    check('a11b …written: dated today, off Someday', row(state, 'tasks', tid(SHED))?.someday === false && row(state, 'tasks', tid(SHED))?.due_at?.startsWith('2026-10-12'))
    await pressUndo(page, 'Planned · Today')
    check('a11c Undo: back on Someday, undated', row(state, 'tasks', tid(SHED))?.someday === true && row(state, 'tasks', tid(SHED))?.due_at === null)
    check('a11d no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── Phone: Someday's pills show on touch; the bulk bar's More → Labels…. ──
if (want('p')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/tasks?list=someday', { phone: true, theme })
    const op = await page.locator(`[id="task-${tid(SHED)}"] .tr-someday-hover`).first().evaluate((el) => getComputedStyle(el).opacity).catch(() => 'none')
    check(`p1 [${theme}] on touch the → Today / Plan pills show (no hover needed)`, op === '1', op)
    const hit = await page.locator(`[id="task-${tid(SHED)}"] .tr-someday-hover`).first().evaluate((el) => getComputedStyle(el, '::after').height).catch(() => '')
    check(`p1 [${theme}] …with a touch-size hit area`, parseFloat(hit) >= 44, hit)
    await shot(page, `p1-someday-phone-${theme}`)
    await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
    await sleep(1200)
    await page.keyboard.press('Control+a')
    await sleep(500)
    const bar = page.locator('[role="toolbar"][aria-label="Selected tasks"]')
    const tabs = await bar.locator('button').allInnerTexts()
    check(`p2 [${theme}] the phone bar: Done · Tomorrow · Plan · Move · Top 3 · More · Delete`, tabs.map((t) => t.trim()).join('|') === 'Done|Tomorrow|Plan|Move|Top 3|More|Delete', tabs.join('|'))
    const fits = await bar.locator('button').evaluateAll((els) => els.every((b) => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().width >= 44))
    check(`p2 [${theme}] …every tab ≥ 44px wide, no label spilling`, fits)
    await shot(page, `p2-phone-bulk-${theme}`)
    await bar.getByRole('button', { name: 'More' }).click()
    await sleep(500)
    check(`p3 [${theme}] More opens a sheet with Priority… and Labels…`, (await page.getByRole('button', { name: 'Priority…' }).count()) === 1 && (await page.getByRole('button', { name: 'Labels…' }).count()) === 1)
    await shot(page, `p3-phone-more-${theme}`)
    if (theme === 'day') {
      await page.getByRole('button', { name: 'Labels…' }).click()
      await sleep(700)
      await page.getByRole('option', { name: /garden/ }).first().click()
      check('p4a phone: a label for the whole selection, with Undo', await undoToast(page, '“garden”'))
      await sleep(800)
      const all = state.rows.tasks.filter((t) => !t.someday && t.status === 'todo')
      check('p4b …written on every selected task', all.every((t) => t.labels.includes('garden')), all.map((t) => t.labels.join(',')).join(' / '))
      await shot(page, 'p4-phone-bulk-labels')
    }
    check(`p5 [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── A18: the list verbs. ──
if (want('v')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await focusRow(page, `task-${tid(BASIL)}`)
  await page.keyboard.press('!')
  check('v1a ! opens Priority under the row', await menuOpen(page, 'Critical'))
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'))
  check('v1b …its first choice has the keyboard', focused === 'menuitem', focused)
  await shot(page, 'v1-priority-key')
  await page.getByRole('menuitem', { name: 'Critical' }).click()
  check('v1c pick → "Priority · Critical" with Undo', await undoToast(page, 'Priority · Critical'))
  await sleep(800)
  check('v1d …written', row(state, 'tasks', tid(BASIL))?.priority === 1)

  await focusRow(page, `task-${tid(BASIL)}`)
  await page.keyboard.press('=')
  check('v2a = opens Duration', await menuOpen(page, '45m'))
  await page.getByRole('menuitem', { name: '45m', exact: true }).click()
  check('v2b pick → "Duration · 45m" with Undo', await undoToast(page, 'Duration · 45m'))
  await sleep(800)
  check('v2c …written', row(state, 'tasks', tid(BASIL))?.duration_min === 45)

  await focusRow(page, `task-${tid(BASIL)}`)
  await page.keyboard.press('d')
  const plan = page.locator('.kf-pk-pop')
  check('v3a d opens the whole Plan list', await plan.waitFor({ timeout: 3000 }).then(() => true, () => false) && /Next week/.test(await plan.innerText()))
  const pf = await page.evaluate(() => document.activeElement?.closest('.kf-pk-pop') != null)
  check('v3b …with the keyboard inside it', pf)
  await shot(page, 'v3-plan-key')
  await plan.getByRole('button', { name: /Next week/ }).first().click()
  check('v3c Next week → "Planned · …" with Undo', await undoToast(page, 'Planned ·'))
  await sleep(800)
  check('v3d …written', row(state, 'tasks', tid(BASIL))?.due_at > iso('23:00', 17), row(state, 'tasks', tid(BASIL))?.due_at)

  await focusRow(page, `task-${tid(FERNS)}`)
  await page.keyboard.press('s')
  check('v4a s → "Parked for someday" with Undo', await undoToast(page, 'Parked for someday'))
  await sleep(800)
  check('v4b …written', row(state, 'tasks', tid(FERNS))?.someday === true)
  await page.keyboard.press('Control+z')
  await sleep(1200)
  check('v4c Ctrl+Z takes it back', row(state, 'tasks', tid(FERNS))?.someday === false)

  await focusRow(page, `task-${tid(FERNS)}`)
  await page.keyboard.press('h')
  check('v5a h → "Goal of the day"', await toastSoon(page, 'Goal of the day'))
  await sleep(800)
  check('v5b …it leads the Top 3', row(state, 'tasks', tid(FERNS))?.top3 === true && row(state, 'tasks', tid(FERNS))?.top3_rank === 1)

  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('Shift+F')
  await sleep(400)
  check('v6a ⇧F opens the Label filter', (await page.locator('[aria-label="Label filter"]').getAttribute('aria-expanded')) === 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await sleep(500)
  check('v6b ↓ ↵ picks a label (the filter is on)', /garden/i.test(await page.locator('[aria-label="Label filter"]').innerText()), await page.locator('[aria-label="Label filter"]').innerText())
  await page.keyboard.press('Shift+F')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await sleep(500)
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('Shift+S')
  await sleep(400)
  check('v7a ⇧S opens the Sort', (await page.locator('[aria-label="Sort order"]').getAttribute('aria-expanded')) === 'true')
  await shot(page, 'v7-sort-key')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await sleep(400)
  check('v7b ↓ ↵ changes the sort', /due/i.test(await page.locator('[aria-label="Sort order"]').innerText()), await page.locator('[aria-label="Sort order"]').innerText())

  // A selection: ! acts on all of it.
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('Control+a')
  await sleep(400)
  const n = await page.locator('[role="toolbar"]').first().innerText()
  await page.keyboard.press('!')
  await menuOpen(page, 'High')
  await page.getByRole('menuitem', { name: 'High' }).click()
  check('v8a ! with a selection → "N tasks · priority high" with Undo', await undoToast(page, 'tasks · priority high'), n.split('\n')[0])
  await sleep(800)
  const open4 = state.rows.tasks.filter((t) => !t.someday && t.status === 'todo')
  check('v8b …written on every selected task', open4.every((t) => t.priority === 2), open4.map((t) => t.priority).join(','))
  await pressUndo(page, 'tasks · priority high') // Ctrl+Z rests while a selection is open (keys-undo's rule)
  check('v8c one Undo puts every priority back', row(state, 'tasks', tid(BRIEF))?.priority === 3 && row(state, 'tasks', tid(BANK))?.priority === null)
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('Control+a') // the toast click was a click-away: select again
  await sleep(400)
  const bulkBar = page.locator('.kf-bulkbar')
  const acts = (await bulkBar.locator('button').allInnerTexts()).map((t) => t.replace('▾', '').trim()).filter(Boolean)
  check('v9 desktop bulk bar: … Top 3 · More · Delete', acts.join('|') === 'Done|Tomorrow|Plan|Move|Top 3|More|Delete', acts.join('|'))
  const pill = await bulkBar.boundingBox()
  check('v9a …and the pill fits the 1280px window (its × included)', !!pill && pill.x >= 0 && pill.x + pill.width <= 1280, JSON.stringify(pill))
  await shot(page, 'v9-bulk-bar-day')
  await bulkBar.getByRole('button', { name: /More/ }).click()
  check('v9b More is a menu: Priority… · Labels…', (await menuOpen(page, 'Labels…')) && (await page.getByRole('menuitem', { name: 'Priority…' }).count()) === 1)
  await shot(page, 'v9-bulk-more-day')
  await page.getByRole('menuitem', { name: 'Labels…' }).click()
  check('v9c the bar\'s Labels… opens the picker for the selection', await page.locator('[role="dialog"][aria-label="Labels"]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(300)

  await focusRow(page, `task-${tid(BANK)}`)
  await page.keyboard.press('f')
  await sleep(1200)
  check('v10 f starts focus on the row', where(page).startsWith('/focus'), where(page))
  check('v11 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()

  // The project page: l, and its bulk bar's Top 3.
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open(`/projects/${P1}`, { theme })
    if (theme === 'day') {
      const on = await focusRow(page, `task-${tid(BANK)}`)
      await page.keyboard.press('l')
      check('v12 l on the project page opens the Label picker', on && (await page.locator('[role="dialog"][aria-label="Labels"]').waitFor({ timeout: 3000 }).then(() => true, () => false)))
      await page.keyboard.press('Escape')
      await sleep(300)
    }
    await page.evaluate(() => (document.activeElement)?.blur())
    await page.keyboard.press('Control+a')
    await sleep(500)
    const acts = (await page.locator('.kf-bulkbar button').allInnerTexts()).map((t) => t.replace('▾', '').trim()).filter(Boolean)
    check(`v13 [${theme}] the project page's bulk bar has Top 3 and More (Priority, Labels)`, ['Top 3', 'More'].every((a) => acts.includes(a)), acts.join('|'))
    await shot(page, `v13-project-bulk-${theme}`)
    check(`v14 [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── The ? cheatsheet says what each page binds — no more, no less. ──
if (want('c')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/tasks?list=all', { theme })
    await page.keyboard.press('?')
    const sheet = page.locator('[role="dialog"][aria-label="Shortcuts"]')
    await sheet.waitFor({ timeout: 4000 })
    await sleep(500)
    const txt = await sheet.innerText()
    const need = ['Plan…', 'Someday', 'Priority…', 'Duration…', 'Make goal of the day', 'Start focus', 'Filter by label', 'Sort', 'Move to…', 'Toggle Top 3', 'Schedule today', 'Labels…']
    const missing = need.filter((w) => !txt.includes(w))
    check(`c1 [${theme}] Tasks: the cheatsheet lists the new keys, and the old ones as they were`, missing.length === 0, missing.join(', ') || 'all present')
    await shot(page, `c1-cheatsheet-tasks-${theme}`)
    await page.keyboard.press('Escape')
    check(`c2 [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  const { ctx, page, errors } = await open('/today')
  await page.keyboard.press('?')
  const sheet = page.locator('[role="dialog"][aria-label="Shortcuts"]')
  await sheet.waitFor({ timeout: 4000 })
  const txt = await sheet.innerText()
  check('c3 Today: the row verbs, but no filter / sort (Tasks only)', ['Plan…', 'Priority…', 'Start focus'].every((w) => txt.includes(w)) && !txt.includes('Filter by label'))
  check('c4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
