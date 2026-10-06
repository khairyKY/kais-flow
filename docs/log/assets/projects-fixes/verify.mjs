// Kai's projects / organizing bugs (2026-10-06) on the REAL app, signed in against a MOCKED backend —
// the task-sheet recipe (docs/log/assets/task-sheet/verify.mjs): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits in
// localStorage, and Playwright answers every REST / function call. Writes are answered 201 and
// recorded. Desktop 1280×720 at 100% and 150% interface size, phone 390×844, day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5257'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !ONLY || ONLY.has(k)

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
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over,
})
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const HOME = { ...WORK, id: id('4', 2), name: 'Home', color: 'var(--acc-moss)', sort_order: 1 }
const project = (n, name, over = {}) => ({ id: id('2', n), user_id: UID, domain_id: WORK.id, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], engagement_model: null, deleted_at: null, created_at: T, updated_at: T, ...over })
const SITE = project(1, 'Shaheen Website', { milestones: [{ id: id('9', 1), title: 'Launch', weight: 2, completed: false }] })
const RETAINER = project(2, 'Retainer Co', { type: 'retainer' })
const AREA = { id: id('3', 1), user_id: UID, domain_id: HOME.id, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const UPDATE = { id: id('5', 1), user_id: UID, event_type: 'project.update_logged', entity_type: 'project', entity_id: SITE.id, payload: { note: 'Homepage copy approved' }, created_at: '2026-10-05T10:00:00Z' }
const WORKLOG = { id: id('6', 1), user_id: UID, project_id: SITE.id, task_id: null, note: 'Wireframes', duration_min: 90, started_at: '2026-10-04T10:00:00Z', ended_at: null, created_at: T, updated_at: T }
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
function tables() {
  return {
    tasks: [
      task(1, 'Call the tyre supplier', { project_id: SITE.id, domain_id: WORK.id }),
      task(2, 'Send the Q3 numbers to Priya', { domain_id: WORK.id }),
      task(3, 'Run 5k', { area_id: AREA.id }),
      task(4, 'Book the physio', { area_id: AREA.id, project_id: SITE.id }), // written both ways before 0050
      task(5, 'Remanage the hosting plan', { project_id: SITE.id, status: 'done', completed_at: '2026-10-01T10:00:00Z' }),
    ],
    projects: [SITE, RETAINER],
    areas: [AREA],
    domains: [WORK, HOME],
    app_settings: [settings],
    calendar_events: [],
    inbox_items: [],
    journal_entries: [],
    activity_log: [UPDATE],
    time_entries: [WORKLOG],
    people: [],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { width: 390, height: 844 }

/** Opens `route` at 1280×720 (or `o.view`), interface size `o.scale` (default 100%). */
async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 720 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  await ctx.addInitScript(([t, sess, scale]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_ui_scale', scale)
  }, [o.theme ?? 'day', JSON.stringify(session), String(o.scale ?? 1)])
  const state = { rows: { ...tables(), ...(o.rows ?? {}) }, writes: [], searched: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname === '/functions/v1/search') {
      const q = (req.postDataJSON()?.query ?? '').toLowerCase()
      state.searched.push(q)
      return r.fulfill({ json: { results: (o.hits ?? []).filter((h) => h.title.toLowerCase().includes(q)) } })
    }
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
    const eq = url.searchParams.get('entity_id')
    if (eq?.startsWith('eq.')) rows = rows.filter((x) => x.entity_id === eq.slice(3))
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
const writesTo = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))
const logged = (state, from = 0) => writesTo(state, 'activity_log', from).map((a) => a.event_type)
const noHScroll = (page) => page.evaluate(() => { const m = document.querySelector('.app-main-content'); return (!m || m.scrollWidth <= m.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth + 1 })
const toastUndo = async (page) => { await page.locator('.kf-toast').last().getByRole('button', { name: /undo/i }).click(); await sleep(600) }

for (const theme of ['day', 'night']) {
  const N = (s) => `${s}-${theme}`
  const DAY = theme === 'day'

  // ── 1 · Move a task that's in a project to another project ──
  if (want('1')) for (const scale of DAY ? [1, 1.5] : [1.5]) {
    const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { theme, scale })
    const row = page.locator(`[id="task-${id('1', 1)}"]`)
    await row.click({ button: 'right' })
    await sleep(400)
    // A real hand: rest on "Move to project…", then head diagonally down-right into the list —
    // across Priority / Repeat, which used to swap the list for theirs.
    const mv = await page.getByRole('menuitem', { name: /Move to project/ }).boundingBox()
    await page.mouse.move(mv.x + 24, mv.y + mv.height / 2)
    await sleep(450)
    const target = page.getByRole('menu').getByText('Retainer Co', { exact: true })
    const tb = await target.boundingBox()
    await page.mouse.move(tb.x + 12, tb.y + tb.height / 2, { steps: 14 })
    await sleep(500)
    check(`${N('move')} @${scale * 100}% the project list survives the diagonal trip across Priority / Repeat`, (await target.count()) === 1 && (await target.isVisible()))
    if (scale === 1.5) await shot(page, N('1-move-submenu-150'))
    const from = state.writes.length
    await target.click()
    await sleep(600)
    const w = writesTo(state, 'tasks', from)
    check(`${N('move')} @${scale * 100}% → writes the new project, logs task.moved`, w.length === 1 && w[0].project_id === RETAINER.id && logged(state, from).includes('task.moved'), JSON.stringify(w.map((x) => x.project_id)))
    check(`${N('move')} @${scale * 100}% the row leaves this project's list`, (await row.count()) === 0)
    // The task written both ways: it leaves the area too.
    const both = page.locator(`[id="task-${id('1', 4)}"]`)
    await both.click({ button: 'right' })
    await sleep(300)
    await page.getByRole('menuitem', { name: /Move to project/ }).click()
    await sleep(400)
    const from2 = state.writes.length
    await page.getByRole('menu').getByText('Retainer Co', { exact: true }).click()
    await sleep(500)
    const w2 = writesTo(state, 'tasks', from2)
    check(`${N('move')} @${scale * 100}% a task in a project AND an area → project only (area_id cleared)`, w2.length === 1 && w2[0].project_id === RETAINER.id && w2[0].area_id === null, JSON.stringify(w2))
    check(`${N('move')} @${scale * 100}% no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('1')) {
    // Phone: ⋯ → Move to project… → the sheet
    const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { theme, view: PHONE })
    await page.getByRole('button', { name: 'More actions for "Call the tyre supplier"' }).click()
    await sleep(500)
    await page.getByRole('button', { name: /Move to project/ }).click()
    await sleep(600)
    await shot(page, N('1-move-phone-sheet'))
    const from = state.writes.length
    await page.getByRole('button', { name: /Retainer Co/ }).click()
    await sleep(700)
    const w = writesTo(state, 'tasks', from)
    check(`${N('move')} phone ⋯ → Move to project… → Retainer Co writes it`, w.length === 1 && w[0].project_id === RETAINER.id, JSON.stringify(w))
    check(`${N('move')} phone no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 2 · Rename from inside the item: project, retainer, area ──
  if (want('2')) for (const [label, entity, table, event] of [['project', SITE, 'projects', 'project.renamed'], ['retainer', RETAINER, 'projects', 'project.renamed'], ['area', AREA, 'areas', 'area.renamed']]) {
    for (const view of DAY ? [undefined, PHONE] : [label === 'project' ? undefined : PHONE]) {
      const v = view ? 'phone' : 'desktop'
      const { ctx, page, errors, state } = await open(`/projects/${entity.id}`, { theme, view, scale: view ? 1 : 1.5 })
      const title = page.getByRole('button', { name: `Rename ${entity.name}` })
      await title.click()
      await sleep(250)
      const input = page.getByRole('textbox', { name: 'Name' })
      check(`${N('rename')} ${label} ${v}: tapping the title opens it for editing, text selected`, (await input.count()) === 1 && (await input.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length)))
      await page.keyboard.press('Escape')
      await sleep(200)
      let from = state.writes.length
      check(`${N('rename')} ${label} ${v}: Esc keeps the old name, writes nothing`, writesTo(state, table, from).length === 0 && (await page.getByRole('heading', { level: 1 }).innerText()).includes(entity.name))
      await title.click()
      await sleep(200)
      await page.keyboard.type(`${entity.name} 2`)
      if (label === 'area') await page.locator('body').click({ position: { x: 5, y: 300 } })
      else await page.keyboard.press('Enter')
      await sleep(500)
      const w = writesTo(state, table, from)
      check(`${N('rename')} ${label} ${v}: ${label === 'area' ? 'leaving the field' : 'Enter'} saves through the outbox + ${event}`, w.length === 1 && w[0].name === `${entity.name} 2` && logged(state, from).includes(event), JSON.stringify(w.map((x) => x.name)))
      check(`${N('rename')} ${label} ${v}: the page shows the new name`, (await page.getByRole('heading', { level: 1 }).innerText()).includes(`${entity.name} 2`))
      if (label !== 'retainer') await shot(page, N(`2-rename-${label}-${v}`))
      check(`${N('rename')} ${label} ${v}: no page errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }

  // ── 3 · Domains: create, rename, recolour, merge, delete — Settings → Organize + Tasks → Organize ──
  if (want('3')) {
    const { ctx, page, errors, state } = await open('/settings', { theme, scale: 1.5 })
    const card = page.locator('#settings-Organize')
    await card.scrollIntoViewIfNeeded()
    await sleep(300)
    check(`${N('domains')} Settings has an Organize card listing every domain with what's in it`, (await card.innerText()).includes('Work') && (await card.innerText()).includes('Home') && (await card.innerText()).includes('2 projects') && (await card.innerText()).includes('1 area'))
    let from = state.writes.length
    await card.getByRole('textbox', { name: 'New domain' }).fill('Studio')
    await card.getByRole('button', { name: 'Add' }).click()
    await sleep(500)
    let w = writesTo(state, 'domains', from)
    check(`${N('domains')} Settings → Add creates a domain (outbox + domain.created)`, w.length === 1 && w[0].name === 'Studio' && logged(state, from).includes('domain.created'), JSON.stringify(w))
    await shot(page, N('3-settings-organize-150'))
    // rename in place
    from = state.writes.length
    await card.getByRole('button', { name: 'Rename Work' }).click()
    await sleep(200)
    await page.keyboard.type('Day job')
    await page.keyboard.press('Enter')
    await sleep(400)
    w = writesTo(state, 'domains', from)
    check(`${N('domains')} click a name → rename in place (domain.renamed)`, w.length === 1 && w[0].name === 'Day job' && logged(state, from).includes('domain.renamed'), JSON.stringify(w))
    // ⋯ → Colour ▸ Gold
    from = state.writes.length
    await card.getByRole('button', { name: 'More for Day job' }).click()
    await sleep(300)
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/[▸\n]/g, '').trim()).join(' · ')
    check(`${N('domains')} ⋯ → Rename · Colour · Merge into… · Delete`, items === 'Rename · Colour · Merge into… · Delete', items)
    await page.getByRole('menuitem', { name: 'Colour' }).click()
    await sleep(300)
    await shot(page, N('3-domain-colour-menu'))
    await page.getByRole('menuitem', { name: 'Gold' }).click()
    await sleep(400)
    w = writesTo(state, 'domains', from)
    check(`${N('domains')} Colour ▸ Gold recolours it (domain.recolored)`, w.length === 1 && w[0].color === 'var(--acc-gold)' && logged(state, from).includes('domain.recolored'), JSON.stringify(w))
    // Merge Home into Day job
    from = state.writes.length
    await card.getByRole('button', { name: 'More for Home' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Merge into…' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Day job' }).click()
    await sleep(600)
    const movedAreas = writesTo(state, 'areas', from)
    const trashedHome = writesTo(state, 'domains', from)
    check(`${N('domains')} Merge Home → Day job moves its area there and trashes Home (domain.merged)`, movedAreas.length === 1 && movedAreas[0].domain_id === WORK.id && trashedHome.length === 1 && !!trashedHome[0].deleted_at && logged(state, from).includes('domain.merged'), JSON.stringify({ movedAreas, trashedHome }))
    check(`${N('domains')} … "Merged into Day job · Undo", Home leaves the list`, (await page.locator('.kf-toast-msg').allInnerTexts()).some((t) => t.includes('Merged into Day job')) && !(await card.innerText()).includes('Home'))
    from = state.writes.length
    await toastUndo(page)
    const back = writesTo(state, 'areas', from)
    check(`${N('domains')} Undo puts the area back in Home and restores Home`, back.length === 1 && back[0].domain_id === HOME.id && writesTo(state, 'domains', from).some((d) => d.id === HOME.id && d.deleted_at === null) && (await card.innerText()).includes('Home'))
    // Delete Studio → Trash + Undo
    from = state.writes.length
    await card.getByRole('button', { name: 'More for Studio' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await sleep(500)
    w = writesTo(state, 'domains', from)
    check(`${N('domains')} Delete → Trash, no confirm, nothing else rewritten (domain.deleted)`, w.length === 1 && !!w[0].deleted_at && writesTo(state, 'tasks', from).length === 0 && writesTo(state, 'projects', from).length === 0 && logged(state, from).includes('domain.deleted'))
    check(`${N('domains')} "Moved to Trash · Undo"`, (await page.locator('.kf-toast-msg').allInnerTexts()).includes('Moved to Trash'))
    check(`${N('domains')} settings no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('3') && DAY) {
    // Tasks → Organize: the same rows and menu
    const { ctx, page, errors, state } = await open('/tasks', { theme, view: { width: 1440, height: 900 } })
    const rail = page.locator('.kf-domain-row', { hasText: 'Work' })
    await rail.click({ button: 'right' })
    await sleep(300)
    check(`${N('domains')} Tasks → Organize: right-click a domain → the same menu`, (await page.getByRole('menu').first().innerText()).startsWith('Rename'))
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await sleep(200)
    const from = state.writes.length
    await page.keyboard.type('Clients')
    await page.keyboard.press('Enter')
    await sleep(400)
    check(`${N('domains')} Tasks → Organize: Rename writes the domain`, writesTo(state, 'domains', from).some((d) => d.name === 'Clients'))
    await shot(page, N('3-tasks-organize'))
    check(`${N('domains')} Tasks no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('3')) {
    // Phone: Settings → Organize, ⋯ → the ActionSheet → Colour sheet
    const { ctx, page, errors, state } = await open('/settings', { theme, view: PHONE })
    const card = page.locator('#settings-Organize')
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: 'More for Work' }).click()
    await sleep(500)
    await shot(page, N('3-domain-sheet-phone'))
    await page.getByRole('button', { name: /^Colour/ }).click()
    await sleep(500)
    const from = state.writes.length
    await page.getByRole('button', { name: /Lavender/ }).click()
    await sleep(500)
    check(`${N('domains')} phone ⋯ → Colour → Lavender`, writesTo(state, 'domains', from).some((d) => d.color === 'var(--acc-lavender-deep)'))
    check(`${N('domains')} phone no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('3') && DAY) {
    const trashed = { ...HOME, deleted_at: '2026-10-05T10:00:00Z' }
    const { ctx, page, errors, state } = await open('/trash', { theme, rows: { domains: [WORK, trashed] } })
    const row = page.locator(`[id="trash-${HOME.id}"]`)
    check('trash lists a trashed domain', (await row.count()) === 1 && (await row.innerText()).includes('Home'))
    const from = state.writes.length
    await row.getByText(/restore/i).first().click()
    await sleep(900)
    check('trash → Restore brings the domain back (deleted_at null, domain.restored)', writesTo(state, 'domains', from).some((d) => d.id === HOME.id && d.deleted_at === null) && logged(state, from).includes('domain.restored'))
    check('trash no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
