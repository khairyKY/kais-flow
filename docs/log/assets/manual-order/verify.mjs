// manual-order (p7e parity audit A22, Akiflow's "Move task up/down"): ⌘/Ctrl+↑/↓ moves the focused
// task, or the selection, one place within its group on Tasks, Today and a project page; the place
// lands on tasks.sort_order (0076) through the outbox, one Undo per burst. The REAL app against a
// MOCKED backend (the fix-tasks recipe): dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a
// made-up session, Playwright answers every REST call; writes are recorded and applied to the rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Wednesday 14 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5280'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
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

const cairo = (hhmm, day = 14) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const ms = (hhmm, day) => cairo(hhmm, day).getTime()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P1 = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, sort_order: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// Today's group: P was moved before (sort_order a minute before A's 15:00), then A–D by their times.
const P = 1, A = 2, B = 3, C = 4, D = 5, U1 = 6, U2 = 7, U3 = 8, G1 = 9, G2 = 10, X1 = 11, X2 = 12, X3 = 13
const TASKS = [
  task(P, 'Pinned first', { due_at: iso('20:00'), sort_order: ms('14:59') }),
  task(A, 'Alpha', { due_at: iso('15:00') }),
  task(B, 'Bravo', { due_at: iso('16:00') }),
  task(C, 'Charlie', { due_at: iso('17:00') }),
  task(D, 'Delta', { due_at: iso('18:00') }),
  task(U1, 'Undated one'),
  task(U2, 'Undated two'),
  task(U3, 'Undated three'),
  task(G1, 'The goal', { due_at: iso('12:00'), top3: true, top3_rank: 1 }),
  task(G2, 'Second pick', { due_at: iso('13:00'), top3: true, top3_rank: 2 }),
  task(X1, 'Project one', { project_id: P1, due_at: iso('09:00', 20) }),
  task(X2, 'Project two', { project_id: P1, due_at: iso('09:00', 21) }),
  task(X3, 'Project three', { project_id: P1, due_at: iso('09:00', 22) }),
]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: null, status: 'active', type: 'standard', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: PROJECTS, domains: [], areas: [], app_settings: [SETTINGS], activity_log: [] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(route, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime()])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      const rows = (state.rows[table] ??= [])
      if (body && typeof body === 'object') {
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
    await sleep(400)
  }
}
/** The ids of `ns` in the order the page draws their rows. */
const drawn = async (page, ns) => {
  const want = new Map(ns.map((n) => [id(n), n]))
  const ids = await page.$$eval('[id^="task-"]', (els) => els.map((e) => e.id.slice(5)))
  return [...new Set(ids)].filter((x) => want.has(x)).map((x) => want.get(x))
}
const keys = async (page, key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await sleep(120)
  }
}
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const NAME = { [P]: 'P', [A]: 'A', [B]: 'B', [C]: 'C', [D]: 'D', [U1]: 'U1', [U2]: 'U2', [U3]: 'U3', [G1]: 'G1', [G2]: 'G2', [X1]: 'X1', [X2]: 'X2', [X3]: 'X3' }
const names = (ns) => ns.map((n) => NAME[n]).join(',')

// ── T: Tasks (All) — the Today group, the No date group, a selection, Undo, the cheatsheet ──
{
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const today = [P, A, B, C, D]
  check('t1 a seeded sort_order leads its group; the rest by date', names(await drawn(page, today)) === 'P,A,B,C,D', names(await drawn(page, today)))
  // Focus walks the page's rows: Top 3 picks are in Today's group too — find C's place by pressing j until it's focused.
  for (let i = 0; i < 12; i++) {
    await keys(page, 'j')
    if (await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(C)}`)) break
  }
  let w0 = state.writes.length
  await keys(page, 'Control+ArrowUp')
  await settle(state)
  check('t2 ⌘/Ctrl+↑ moves the focused row up one place', names(await drawn(page, today)) === 'P,A,C,B,D', names(await drawn(page, today)))
  const sent = posts(state, 'tasks', w0)
  check('t2 one write: C at the midpoint of A and B', sent.length === 1 && sent[0].id === id(C) && sent[0].sort_order === (ms('15:00') + ms('16:00')) / 2, JSON.stringify(sent.map((r) => [r.title, r.sort_order])))
  check('t2 focus stays on the moved row', await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(C)}`))
  await keys(page, 'Control+ArrowUp')
  await settle(state)
  check('t3 again: up past A', names(await drawn(page, today)) === 'P,C,A,B,D', names(await drawn(page, today)))
  const t = await toasts(page)
  check('t3 a burst is one toast', t.filter((x) => /^Moved up/.test(x)).length === 1, JSON.stringify(t))
  await shot(page, 't3-tasks-moved')
  w0 = state.writes.length
  await page.keyboard.press('Control+z')
  await settle(state)
  check('t4 ⌘/Ctrl+Z puts the burst back in one step', names(await drawn(page, today)) === 'P,A,B,C,D', names(await drawn(page, today)))
  check('t4 the Undo writes C back to null', posts(state, 'tasks', w0).some((r) => r.id === id(C) && r.sort_order === null), JSON.stringify(posts(state, 'tasks', w0).map((r) => [r.title, r.sort_order])))

  // A selection (Ctrl+click A and B) moves down as a block.
  await page.locator(`#task-${id(A)}`).getByText('Alpha', { exact: true }).click({ modifiers: ['Control'] })
  await page.locator(`#task-${id(B)}`).getByText('Bravo', { exact: true }).click({ modifiers: ['Control'] })
  await sleep(300)
  w0 = state.writes.length
  await keys(page, 'Control+ArrowDown')
  await settle(state)
  check('t5 a selection moves down as a block', names(await drawn(page, today)) === 'P,C,A,B,D', names(await drawn(page, today)))
  check('t5 "2 tasks moved", with Undo', (await toasts(page)).some((x) => /2 tasks moved/.test(x)), JSON.stringify(await toasts(page)))
  check('t5 only the moved rows are written', posts(state, 'tasks', w0).every((r) => [id(A), id(B)].includes(r.id)), JSON.stringify(posts(state, 'tasks', w0).map((r) => r.title)))
  await shot(page, 't5-selection-moved')
  await page.keyboard.press('Escape')
  await sleep(300)

  // The No date group: three rows tied on "no date"; the first move gives the run its own keys.
  const undated = [U1, U2, U3]
  for (let i = 0; i < 20; i++) {
    await keys(page, 'j')
    if (await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(U3)}`)) break
  }
  w0 = state.writes.length
  await keys(page, 'Control+ArrowUp')
  await settle(state)
  check('t6 No date group: U3 moves up past U2', names(await drawn(page, undated)) === 'U1,U3,U2', names(await drawn(page, undated)))
  check('t6 the tied run is written once, the short side only (≤ 2 rows)', posts(state, 'tasks', w0).length <= 2, posts(state, 'tasks', w0).length)
  check('t7 the Today group did not move', names(await drawn(page, today)) === 'P,C,A,B,D', names(await drawn(page, today)))

  await page.keyboard.press('?')
  await sleep(500)
  const sheet = await page.getByRole('dialog', { name: 'Shortcuts' }).innerText().catch(() => '')
  check('t8 the cheatsheet lists ⌘/Ctrl ↑/↓ Move task up / down', /Move task up \/ down/.test(sheet), sheet.slice(0, 200))
  await shot(page, 't8-cheatsheet')
  check('t no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Y: Today — Also open, and a Top 3 row (⌘↑ = Alt+↑ there) ──
{
  const { ctx, page, errors, state } = await open('/today')
  const also = [P, A, B]
  check('y1 Also open draws the manual order first, then by date', names(await drawn(page, also)) === 'P,A,B', names(await drawn(page, also)))
  for (let i = 0; i < 12; i++) {
    await keys(page, 'j')
    if (await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(A)}`)) break
  }
  let w0 = state.writes.length
  await keys(page, 'Control+ArrowUp')
  await settle(state)
  check('y2 ⌘/Ctrl+↑ on Today: A above P', names(await drawn(page, also)) === 'A,P,B', names(await drawn(page, also)))
  const sent = posts(state, 'tasks', w0)
  check('y2 one write, A a minute before P', sent.length === 1 && sent[0].id === id(A) && sent[0].sort_order === ms('14:59') - 60_000, JSON.stringify(sent.map((r) => [r.title, r.sort_order])))
  await shot(page, 'y2-today-moved')
  for (let i = 0; i < 12; i++) {
    await keys(page, 'k')
    if (await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(G2)}`)) break
  }
  w0 = state.writes.length
  await keys(page, 'Control+ArrowUp')
  await settle(state)
  const ranks = Object.fromEntries(posts(state, 'tasks', w0).map((r) => [NAME[Object.keys(NAME).find((n) => id(+n) === r.id)], r.top3_rank]))
  check('y3 on a Top 3 row it reorders the Top 3 (the second pick becomes the goal)', ranks.G2 === 1 && ranks.G1 === 2, JSON.stringify(ranks))
  check('y no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── X: a project page ──
{
  const { ctx, page, errors, state } = await open(`/projects/${P1}`)
  const xs = [X1, X2, X3]
  check('x1 the project lists its tasks by date', names(await drawn(page, xs)) === 'X1,X2,X3', names(await drawn(page, xs)))
  for (let i = 0; i < 6; i++) {
    await keys(page, 'j')
    if (await page.evaluate((x) => document.activeElement?.closest('[id^="task-"]')?.id === x, `task-${id(X1)}`)) break
  }
  const w0 = state.writes.length
  await keys(page, 'Control+ArrowDown')
  await settle(state)
  check('x2 ⌘/Ctrl+↓ on a project page: X1 below X2', names(await drawn(page, xs)) === 'X2,X1,X3', names(await drawn(page, xs)))
  const sent = posts(state, 'tasks', w0)
  check('x2 one write, X1 between X2 and X3', sent.length === 1 && sent[0].id === id(X1) && sent[0].sort_order === (ms('09:00', 21) + ms('09:00', 22)) / 2, JSON.stringify(sent.map((r) => [r.title, r.sort_order])))
  await shot(page, 'x2-project-moved')
  check('x no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
