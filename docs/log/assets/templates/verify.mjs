// Checklist templates (parity audit A25, P7 7d) on the REAL app against a MOCKED backend — the
// labels recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call; writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5283'
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
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const BRIEF = { id: id('1', 1), user_id: UID, title: 'Write the brief', project_id: id('2', 1), domain_id: WORK.id, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null,
  top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null,
  paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T }
const SITE = { id: id('2', 1), user_id: UID, domain_id: WORK.id, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, target_date: null, engagement_model: null, deleted_at: null, created_at: T, updated_at: T,
  milestones: [], checklist: [
    { id: id('9', 1), title: 'Buy domain', type: 'one-shot', completed: true, task_id: null },
    { id: id('9', 2), title: 'Write the brief', type: 'task-linked', completed: false, task_id: BRIEF.id },
    { id: id('9', 3), title: 'Pick fonts', type: 'one-shot', completed: false, task_id: null },
  ] }
const SHOP = { ...SITE, id: id('2', 2), name: 'Bakery Shop', checklist: [], milestones: [] }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', checklist_templates: null, created_at: T, updated_at: T }
const tables = (settings) => structuredClone({
  tasks: [BRIEF], projects: [SITE, SHOP], areas: [], domains: [WORK], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [],
  activity_log: [], time_entries: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { width: 390, height: 844 }

async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 800 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(o.settings ?? SETTINGS), writes: [] }
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
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(500)
  }
}
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const templatesNow = (state) => state.rows.app_settings[0].checklist_templates ?? []
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undoToast = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByText('Undo', { exact: true }).first().click()
const section = (page) => page.getByText(/^Templates · \d+$/)

// A — save the Shaheen Website checklist as "Launch kit"; then use it on Bakery Shop; rename; delete.
{
  const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`)
  const save = page.getByRole('button', { name: 'save as template' })
  check('a1 the checklist offers "save as template"', await save.isVisible())
  check('a1 no templates yet → no Templates section', (await section(page).count()) === 0)
  await save.click()
  const field = page.getByRole('textbox', { name: 'Template name' })
  check('a2 saving opens the name in place, the project name to start', (await field.inputValue()) === 'Shaheen Website', await field.inputValue())
  await field.fill('Launch kit')
  await page.keyboard.press('Enter')
  await settle(state)
  const t = templatesNow(state)
  check('a3 one template stored on app_settings.checklist_templates, titles + types (no ticks, no tasks)',
    t.length === 1 && t[0].name === 'Launch kit' && JSON.stringify(t[0].items) === JSON.stringify([{ title: 'Buy domain', type: 'one-shot' }, { title: 'Write the brief', type: 'task-linked' }, { title: 'Pick fonts', type: 'one-shot' }]),
    JSON.stringify(t))
  check('a3 toast: Saved as a template · 3 items (with Undo)', await toastSoon(page, 'Saved as a template · 3 items'))
  check('a4 Templates · 1 lists it with its count', (await section(page).textContent()) === 'Templates · 1' && (await page.getByText('3 items', { exact: true }).count()) === 1, await section(page).textContent())
  await page.getByRole('button', { name: 'Use template Launch kit' }).scrollIntoViewIfNeeded()
  await shot(page, 'a-saved-desktop-day')

  // B — on another project: use it.
  await page.goto(`${BASE}/projects/${SHOP.id}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  check('b0 the empty checklist has no "save as template"', (await page.getByRole('button', { name: 'save as template' }).count()) === 0)
  const w0 = state.writes.length
  await page.getByRole('button', { name: 'Use template Launch kit' }).click()
  await settle(state)
  const newTasks = posts(state, 'tasks', w0)
  check('b1 exactly the task-linked item became a task: under Bakery Shop, its domain, no area',
    newTasks.length === 1 && newTasks[0].title === 'Write the brief' && newTasks[0].project_id === SHOP.id && newTasks[0].domain_id === WORK.id && newTasks[0].area_id === null && newTasks[0].status === 'todo',
    JSON.stringify(newTasks.map((x) => [x.title, x.project_id, x.domain_id, x.area_id])))
  const shop = state.rows.projects.find((p) => p.id === SHOP.id)
  check('b2 every item is a new unticked checklist line; the task-linked one links its new task',
    JSON.stringify(shop.checklist.map((l) => [l.title, l.type, l.completed])) === JSON.stringify([['Buy domain', 'one-shot', false], ['Write the brief', 'task-linked', false], ['Pick fonts', 'one-shot', false]]) &&
    shop.checklist[1].task_id === newTasks[0]?.id && shop.checklist[0].task_id === null,
    JSON.stringify(shop.checklist))
  check('b3 one projects write for the whole batch', posts(state, 'projects', w0).length === 1, posts(state, 'projects', w0).length)
  const logged = posts(state, 'activity_log', w0).map((a) => a.event_type)
  check('b4 logged: task.created + project.template_used', logged.includes('task.created') && logged.includes('project.template_used'), logged.join(','))
  check('b5 toast: Added “Launch kit” · 3 items, 1 as tasks', await toastSoon(page, 'Added “Launch kit” · 3 items, 1 as tasks'))
  check('b6 the new task shows under Open tasks', (await page.locator(`#task-${newTasks[0]?.id}`).count()) === 1)
  await shot(page, 'b-used-desktop-day')
  const w1 = state.writes.length
  await undoToast(page, 'Added “Launch kit”')
  await settle(state)
  const dels = state.writes.slice(w1).filter((w) => w.method === 'DELETE' && w.table === 'tasks')
  check('b7 one Undo: the new task removed outright, the lines taken back',
    dels.length === 1 && dels[0].query.includes(newTasks[0]?.id) && state.rows.projects.find((p) => p.id === SHOP.id).checklist.length === 0,
    `${dels.length} deletes · ${state.rows.projects.find((p) => p.id === SHOP.id).checklist.length} lines`)
  check('b7 Undo logged', posts(state, 'activity_log', w1).some((a) => a.event_type === 'project.template_unused'))

  // C — rename in place, with Undo.
  await page.getByRole('button', { name: 'Launch kit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Template name' }).fill('Website launch')
  await page.keyboard.press('Enter')
  await settle(state)
  check('c1 renamed', templatesNow(state)[0]?.name === 'Website launch', templatesNow(state)[0]?.name)
  check('c1 toast: Renamed to “Website launch”', await toastSoon(page, 'Renamed to “Website launch”'))
  await undoToast(page, 'Renamed to')
  await settle(state)
  check('c2 Undo puts the old name back', templatesNow(state)[0]?.name === 'Launch kit', templatesNow(state)[0]?.name)

  // D — delete with Undo.
  await page.getByRole('button', { name: 'Delete template Launch kit' }).click()
  await settle(state)
  check('d1 deleted: the list is empty, the section goes', templatesNow(state).length === 0 && (await section(page).count()) === 0, JSON.stringify(templatesNow(state)))
  check('d1 toast: Deleted “Launch kit”', await toastSoon(page, 'Deleted “Launch kit”'))
  await undoToast(page, 'Deleted “Launch kit”')
  await settle(state)
  check('d2 Undo brings it back whole', templatesNow(state).length === 1 && templatesNow(state)[0].items.length === 3 && (await section(page).count()) === 1)
  check('a–d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// E — before 0079 is pushed (the row has no checklist_templates): nothing offered, nothing sent.
{
  const { checklist_templates: _gone, ...pre } = SETTINGS
  const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { settings: pre })
  check('e1 pre-push: no "save as template"', (await page.getByRole('button', { name: 'save as template' }).count()) === 0)
  await settle(state)
  check('e1 pre-push: no app_settings write', posts(state, 'app_settings').length === 0)
  check('e no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// F — phone + night: the templates rows fit and keep 44px rows.
const ONE = { ...SETTINGS, checklist_templates: [{ id: id('8', 1), name: 'Launch kit', items: [{ title: 'Buy domain', type: 'one-shot' }, { title: 'Write the brief', type: 'task-linked' }] }, { id: id('8', 2), name: 'Monthly retainer close', items: [{ title: 'Send invoice', type: 'task-linked' }] }] }
for (const [view, tag] of [[PHONE, 'phone'], [undefined, 'desktop']]) {
  for (const theme of ['day', 'night']) {
    if (tag === 'desktop' && theme === 'day') continue // A covers it
    const { ctx, page, errors } = await open(`/projects/${SITE.id}`, { view, theme, settings: ONE })
    await page.getByText('Templates · 2').scrollIntoViewIfNeeded()
    await sleep(300)
    const use = page.getByRole('button', { name: 'Use template Monthly retainer close' })
    const box = await use.boundingBox()
    const vw = view?.width ?? 1280
    check(`f [${tag} ${theme}] the rows fit the width`, box && box.x + box.width <= vw, JSON.stringify(box))
    if (tag === 'phone') {
      const row = await use.locator('xpath=..').boundingBox()
      check(`f [${tag} ${theme}] row ≥ 44px tall`, row && row.height >= 44, JSON.stringify(row))
    }
    await shot(page, `f-${tag}-${theme}`)
    check(`f [${tag} ${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
