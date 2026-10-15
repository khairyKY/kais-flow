// P7e A3 · A7 · A8 · A9 · A31 (docs/log/2026-10-13-0808-p7e-parity-audit.md §3 A): the keys, on the REAL
// app against a MOCKED backend (the fix-inbox recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every REST call; writes are recorded AND applied).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=u,k,d,j,c runs a subset)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5274'
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
const A1 = 'c0000000-0000-4000-8000-000000000001'
const tid = (n) => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const BANK = 1, BASIL = 2, FERNS = 3, BRIEF = 4
const TASKS = [
  task(BANK, 'Call the bank', { due_at: iso('09:00') }),
  task(BASIL, 'Plant the basil', { due_at: iso('09:00', 14), labels: ['garden'] }),
  task(FERNS, 'Water the ferns', { due_at: iso('09:00'), labels: ['garden'] }),
  task(BRIEF, 'Write the brief', { due_at: iso('09:00') }),
]
const ib = (n, over) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const OMAR = 1, SALMA = 2, HOSTING = 3, GH482 = 4
const INBOX = [
  ib(OMAR, { kind: 'voice', raw_text: 'Call Omar re: pricing Saturday 3pm', confidence: 0.87, created_at: iso('21:14', 8),
    ai_parse: { kind: 'task', title: 'Call Omar about pricing', cleaned_text: 'Call Omar about pricing Saturday 3pm', confidence: 0.87, project_id: P1, domain_id: D1, due_at: iso('15:00', 17), has_time: true } }),
  ib(SALMA, { raw_text: 'that thing salma said about the balcony plants', confidence: 0.44, created_at: iso('19:00', 11),
    ai_parse: { kind: 'note', title: 'Balcony plants from Salma', cleaned_text: 'That thing Salma said about the balcony plants', confidence: 0.44 } }),
  ib(HOSTING, { kind: 'email', raw_text: 'renew hosting before the 15th', confidence: 0.9, created_at: iso('08:30', 7),
    ai_parse: { kind: 'task', title: 'renew hosting before the 15th', cleaned_text: 'renew hosting before the 15th', confidence: 0.9, due_at: iso('09:00', 14), has_time: false } }),
  ib(GH482, { kind: 'github_issue', raw_text: 'Checkout drops the coupon field on mobile Safari', created_at: iso('09:00', 9),
    payload: { repo: 'Shaheen/website', number: 482, url: 'https://github.com/Shaheen/website/issues/482', node_id: 'I_482', created_at: iso('09:00', 9), updated_at: iso('09:00', 12) } }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting App', domain_id: D1, type: 'standard', status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const DOMAINS = [{ id: D1, user_id: UID, name: 'Freelance', color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const AREAS = [{ id: A1, user_id: UID, name: 'Health', domain_id: null, description: null, color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: INBOX, projects: PROJECTS, domains: DOMAINS, areas: AREAS, people: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...desktop, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar', 'hint:today', 'hint:tasks']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v99.0.0' }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [] }
  await ctx.route('https://github.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>issue</title>' }))
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
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const where = (page) => { const u = new URL(page.url()); return u.pathname + u.search }
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const toastCount = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).count()
const writesTo = (state, table, id) => state.writes.filter((w) => w.table === table && (w.query.includes(id) || [].concat(w.body ?? []).some((b) => b?.id === id)))
const lastRow = (state, table, id) => writesTo(state, table, id).flatMap((w) => [].concat(w.body ?? [])).filter((b) => b?.id === id).at(-1)
/** j until the list's focus ring sits on `id` (useListKeys moves real focus). */
async function focusRow(page, id, max = 8) {
  for (const key of ['j', 'k']) {
    for (let i = 0; i < max; i++) {
      if ((await page.evaluate(() => document.activeElement?.id)) === id) return true
      await page.keyboard.press(key)
      await sleep(120)
    }
  }
  return (await page.evaluate(() => document.activeElement?.id)) === id
}
/** A keydown as a non-Latin layout sends it: Arabic's I key is 'ه', U is 'ع'. */
const layoutKey = (page, key, code, mods = {}) => page.evaluate(([k, c, m]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true, cancelable: true, ...m })), [key, code, mods])

// ── A3: Ctrl/⌘+Z undoes the newest toast's action; a field keeps its own undo; an open bar rests. ──
if (want('u')) {
  const { ctx, page, errors, state } = await open('/tasks?list=today')
  check('u0 Today tab lists the tasks', (await page.locator(`[id="task-${tid(BANK)}"]`).count()) === 1)
  await focusRow(page, `task-${tid(BANK)}`)
  await page.keyboard.press('e')
  check('u1a e completes the focused task (Done toast)', await toastSoon(page, 'Done'))
  await sleep(1200)
  check('u1b the completion was written', lastRow(state, 'tasks', tid(BANK))?.status === 'done', JSON.stringify(lastRow(state, 'tasks', tid(BANK))?.status))
  await page.keyboard.press('Control+z')
  await sleep(1500)
  check('u1c Ctrl+Z ran the toast\'s Undo (task todo again)', lastRow(state, 'tasks', tid(BANK))?.status === 'todo', JSON.stringify(lastRow(state, 'tasks', tid(BANK))?.status))
  check('u1d the undone toast left the stack', (await toastCount(page, 'Done')) === 0)
  await shot(page, 'u1-after-ctrl-z')

  // A field: Ctrl+Z is the browser's, and the toast's Undo stays put.
  await focusRow(page, `task-${tid(BRIEF)}`)
  await page.keyboard.press('e')
  await toastSoon(page, 'Done')
  await sleep(800)
  const quick = page.getByPlaceholder(/Quick add task/)
  await quick.click()
  await page.keyboard.type('abc')
  await page.keyboard.press('Control+z')
  await sleep(600)
  const v = await quick.inputValue()
  check('u2a Ctrl+Z inside a field undoes the typing', v !== 'abc', JSON.stringify(v))
  check('u2b …and leaves the toast\'s action alone', lastRow(state, 'tasks', tid(BRIEF))?.status === 'done' && (await toastCount(page, 'Done')) === 1)
  await quick.fill('')
  await page.locator('h1, .app-main-content').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.evaluate(() => (document.activeElement)?.blur())

  // The command bar open: Ctrl+Z rests.
  await page.keyboard.press('n')
  await page.locator('#kf-capture-input').first().waitFor({ timeout: 4000 }).catch(() => {})
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('Control+z')
  await sleep(800)
  check('u3 with the command bar open, Ctrl+Z does nothing', lastRow(state, 'tasks', tid(BRIEF))?.status === 'done')
  await page.keyboard.press('Escape')
  await sleep(300)
  const alive = await toastCount(page, 'Done')
  await page.evaluate(() => (document.activeElement)?.blur()) // the page's quick add takes focus back when the bar closes
  await page.keyboard.press('Control+z')
  await sleep(1500)
  check('u4 bar closed: Ctrl+Z undoes the second completion', lastRow(state, 'tasks', tid(BRIEF))?.status === 'todo', `${JSON.stringify(lastRow(state, 'tasks', tid(BRIEF))?.status)} · toast alive ${alive} · active ${await page.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id)}`)
  await page.keyboard.press('Control+z')
  await sleep(300)
  check('u5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A7: i Inbox · u Upcoming · bare / Search · Ctrl+, Settings — and they rest in fields, menus, the bar. ──
if (want('k')) {
  const { ctx, page, errors } = await open('/today')
  await page.keyboard.press('i')
  await sleep(800)
  check('k1 i → Inbox', where(page) === '/inbox', where(page))
  await page.keyboard.press('u')
  await sleep(1000)
  check('k2a u → Upcoming', where(page) === '/tasks?list=upcoming', where(page))
  check('k2b the Upcoming tab is the active one', (await page.locator('a[aria-current="page"]', { hasText: 'Upcoming' }).count()) === 1)
  await page.keyboard.press('/')
  const search = page.getByPlaceholder('Search the garden…')
  const opened = await search.waitFor({ timeout: 4000 }).then(() => true, () => false)
  await sleep(300)
  check('k3a bare / opens Search', opened)
  check('k3b …focused and empty (the / is not typed)', opened && (await search.evaluate((el) => el === document.activeElement && el.value === '')))
  await shot(page, 'k3-slash-search')
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.keyboard.press('Control+,')
  await sleep(1000)
  check('k4 Ctrl+, → Settings', where(page) === '/settings', where(page))
  await layoutKey(page, 'ه', 'KeyI')
  await sleep(800)
  check('k5a Arabic layout: the I key (ه) → Inbox', where(page) === '/inbox', where(page))
  await layoutKey(page, 'ع', 'KeyU')
  await sleep(800)
  check('k5b Arabic layout: the U key (ع) → Upcoming', where(page) === '/tasks?list=upcoming', where(page))
  await layoutKey(page, 'ظ', 'Slash')
  check('k5c Arabic layout: the / key (ظ) → Search', await search.waitFor({ timeout: 3000 }).then(() => true, () => false))
  await page.keyboard.press('Escape')
  await sleep(300)
  await layoutKey(page, 'و', 'Comma', { ctrlKey: true })
  await sleep(800)
  check('k5d Arabic layout: Ctrl + the , key (و) → Settings', where(page) === '/settings', where(page))

  await page.goto(`${BASE}/tasks?list=today`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const quick = page.getByPlaceholder(/Quick add task/)
  await quick.click()
  await page.keyboard.type('iu/')
  await sleep(400)
  check('k6 typing i u / in a field stays in the field', where(page) === '/tasks?list=today' && (await quick.inputValue()) === 'iu/', `${where(page)} ${await quick.inputValue()}`)
  await quick.fill('')
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('n')
  await sleep(500)
  await page.keyboard.type('iu')
  await sleep(300)
  check('k7 the command bar open: i u type into it', where(page) === '/tasks?list=today' && (await page.locator('#kf-capture-input').first().inputValue()) === 'iu')
  await page.evaluate(() => (document.activeElement)?.blur())
  await page.keyboard.press('i')
  await sleep(400)
  check('k7b …even with its field blurred, i does not leave', where(page) === '/tasks?list=today', where(page))
  await page.keyboard.press('Escape')
  await sleep(400)
  await page.locator(`[id="task-${tid(BANK)}"]`).click({ button: 'right' })
  const menu = await page.locator('[role="menu"]').first().waitFor({ timeout: 3000 }).then(() => true, () => false)
  await page.keyboard.press('i')
  await sleep(400)
  check('k8 a menu open: i does not navigate', menu && where(page) === '/tasks?list=today', `${menu} ${where(page)}`)
  await page.keyboard.press('Escape')
  check('k9 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A8: Inbox Space = done now · p = plan (the card's date picker). ──
if (want('d')) {
  const { ctx, page, errors, state } = await open('/inbox')
  check('d0 the inbox lists the captures', (await page.locator(`[id="inbox-${iid(OMAR)}"]`).count()) === 1)
  await focusRow(page, `inbox-${iid(OMAR)}`)
  await page.keyboard.press(' ')
  check('d1a Space files it as done (toast)', await toastSoon(page, 'Filed "Call Omar about pricing" as done'))
  await sleep(1500)
  const made = state.rows.tasks.find((t) => t.title === 'Call Omar about pricing')
  check('d1b a task was written, done, in its card\'s project', made?.status === 'done' && !!made?.completed_at && made?.project_id === P1, JSON.stringify(made && { status: made.status, project: made.project_id }))
  check('d1c the capture is filed', state.rows.inbox_items.find((i) => i.id === iid(OMAR))?.status === 'filed')
  check('d1d the card left the list', (await page.locator(`[id="inbox-${iid(OMAR)}"]`).count()) === 0)
  await shot(page, 'd1-done-now-toast')
  await page.keyboard.press('Control+z')
  await sleep(1500)
  check('d1e Ctrl+Z: the task is deleted and the capture is back', !state.rows.tasks.some((t) => t.id === made?.id) && state.rows.inbox_items.find((i) => i.id === iid(OMAR))?.status === 'pending')
  check('d1f …and its card returns', await page.locator(`[id="inbox-${iid(OMAR)}"]`).waitFor({ timeout: 4000 }).then(() => true, () => false))

  // p on the compact email row: it opens full and its date picker opens.
  await focusRow(page, `inbox-${iid(HOSTING)}`)
  await page.keyboard.press('p')
  const picker = page.locator('.kf-pk-pop[role="dialog"]')
  check('d2a p opens the card\'s date picker', await picker.waitFor({ timeout: 3000 }).then(() => true, () => false))
  check('d2b the compact card opened full (its Due date field shows)', (await page.locator(`[id="inbox-${iid(HOSTING)}"] [aria-label="Due date"]`).count()) === 1)
  await shot(page, 'd2-plan-picker')
  await page.keyboard.press('d')
  await sleep(500)
  check('d2c d inside the picker does not dismiss the card behind it', state.rows.inbox_items.find((i) => i.id === iid(HOSTING))?.status === 'pending' && (await picker.count()) === 1)
  await picker.getByRole('button', { name: /Tomorrow/ }).click()
  await sleep(500)
  check('d2d picking Tomorrow closes it and the card says so', (await picker.count()) === 0 && /Tomorrow|Tue/.test(await page.locator(`[id="inbox-${iid(HOSTING)}"] [aria-label="Due date"]`).innerText()), await page.locator(`[id="inbox-${iid(HOSTING)}"] [aria-label="Due date"]`).innerText().catch(() => ''))
  const back = await page.evaluate(() => document.activeElement?.id)
  check('d2e focus is back on the card', back === `inbox-${iid(HOSTING)}`, back)
  await page.keyboard.press('e')
  await sleep(1500)
  const filed = state.rows.tasks.find((t) => t.title === 'renew hosting before the 15th')
  check('d2f e then files it on the planned day (Tue 13 Oct)', !!filed && filed.due_at?.startsWith('2026-10-13'), filed?.due_at)

  // p on the unsure note: it becomes a task (only a task has a date) and the picker opens.
  await focusRow(page, `inbox-${iid(SALMA)}`)
  await page.keyboard.press('p')
  check('d3a p on a note card opens the date picker', await picker.waitFor({ timeout: 3000 }).then(() => true, () => false))
  check('d3b …and the card now files as a Task', /Task/.test(await page.locator(`[id="inbox-${iid(SALMA)}"] .ib-field`).first().innerText()), await page.locator(`[id="inbox-${iid(SALMA)}"] .ib-field`).first().innerText().catch(() => ''))
  await page.keyboard.press('Escape')
  await sleep(300)

  // Space on a selection: one toast, one Undo for all of them.
  await page.keyboard.press('Control+a')
  await sleep(300)
  const n = await page.locator('.ib-select-box.on, [data-checked]').count()
  await page.keyboard.press(' ')
  check('d4a Space on a selection files every one as done', await toastSoon(page, 'captures filed as done'), `selected ${n}`)
  await sleep(1500)
  check('d4b …all written done', state.rows.tasks.filter((t) => t.status === 'done').length >= 2, state.rows.tasks.filter((t) => t.status === 'done').length)
  await page.keyboard.press('Control+z')
  await sleep(1500)
  check('d4c one Ctrl+Z brings them all back', state.rows.inbox_items.filter((i) => i.status === 'pending').length >= 3, state.rows.inbox_items.filter((i) => i.status === 'pending').length)
  check('d5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A9: ⌘K jumps to projects, areas and labels (and still to views). ──
if (want('j')) {
  const { ctx, page, errors } = await open('/today')
  async function jump(typed, expect, shotName) {
    await page.keyboard.press('Control+k')
    const field = page.locator('#kf-capture-input').first()
    await field.waitFor({ timeout: 4000 })
    await field.fill(typed)
    await sleep(300)
    const row = (await page.getByText('Jump', { exact: true }).first().locator('..').innerText().catch(() => '')).replace(/\s+/g, ' ')
    const ok = expect.every((w) => row.includes(w))
    if (shotName) await shot(page, shotName)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await sleep(1200)
    return { ok, row }
  }
  let r = await jump('fore', ['Forecasting App', 'Project'], 'j1-jump-row-project')
  check('j1a "fore" offers Forecasting App · Project', r.ok, r.row)
  check('j1b ↓ ↵ opens the project', where(page) === `/projects/${P1}`, where(page))
  r = await jump('heal', ['Health', 'Area'])
  check('j2a "heal" offers Health · Area', r.ok, r.row)
  check('j2b ↓ ↵ opens the area', where(page) === `/projects/${A1}`, where(page))
  await page.goto(`${BASE}/tasks?list=today`, { waitUntil: 'networkidle' })
  await sleep(1200)
  r = await jump('gard', ['garden', 'Label'])
  check('j3a "gard" offers garden · Label', r.ok, r.row)
  check('j3b ↓ ↵ lands on All tasks with the label filter on (from Tasks itself)', where(page) === '/tasks?list=all', where(page))
  const trigger = await page.getByRole('button', { name: /Label filter/ }).innerText().catch(async () => page.locator('text=/Label ·/').first().innerText().catch(() => ''))
  check('j3c the Label filter reads garden', /garden/i.test(trigger), trigger)
  const shown = await page.locator('[id^="task-"]').evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0]))
  check('j3d only the garden tasks show', shown.length === 2 && shown.every((t) => /basil|ferns/i.test(t)), shown.join(' | '))
  await shot(page, 'j3-label-jump')
  r = await jump('inbox', ['Inbox'])
  check('j4 views still jump ("inbox")', where(page) === '/inbox', where(page))
  check('j5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── A31: the ? cheatsheet matches the real keys; ↵ on a desktop GitHub row opens it. ──
if (want('c')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/settings', { theme })
    await page.keyboard.press('?')
    const sheet = page.locator('[role="dialog"][aria-label="Shortcuts"]')
    await sheet.waitFor({ timeout: 4000 })
    await sleep(500)
    const txt = await sheet.innerText()
    if (theme === 'day') {
      const need = ['Go to Inbox', 'Go to Upcoming', 'Undo the last action', 'Settings', 'Done now', 'Plan: pick a date', 'Restore', 'Select all', 'Label', 'Duration', 'Labels…', '30m']
      const missing = need.filter((w) => !txt.includes(w))
      check('c1 the cheatsheet lists the real keys', missing.length === 0, missing.join(', ') || 'all present')
      // The Calendar section is real again (p7e A4, lib/shortcuts CALENDAR_KEYS); it only passed here while caps hid it from /Calendar/.
      check('c2 nothing fictional came back (no g Go-to)', !/Go to anything/.test(txt))
    }
    await shot(page, `c-cheatsheet-${theme}`)
    check(`c3 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  const { ctx, page, errors } = await open('/inbox')
  const onRow = await focusRow(page, `inbox-${iid(GH482)}`)
  const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null)
  await page.keyboard.press('Enter')
  const tab = await popup
  await tab?.waitForURL(/github\.com/, { timeout: 5000 }).catch(() => {}) // a new tab starts at about:blank
  check('c4 ↵ on a desktop GitHub row opens the issue', !!tab && tab.url().includes('github.com/Shaheen/website/issues/482'), `focused ${onRow} · ${tab?.url()}`)
  check('c5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
