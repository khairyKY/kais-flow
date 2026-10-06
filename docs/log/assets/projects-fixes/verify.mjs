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
// Scroll first and let it settle: our menus close on a page scroll (they'd detach from their row),
// and Playwright's scroll-into-view lands its scroll event just after the menu opens.
const rightClick = async (loc) => { await loc.scrollIntoViewIfNeeded(); await sleep(400); await loc.click({ button: 'right' }) }
const toastUndo = async (page) => { await page.locator('.kf-toast').last().getByRole('button', { name: /undo/i }).click(); await sleep(600) }

for (const theme of ['day', 'night']) {
  const N = (s) => `${s}-${theme}`
  const DAY = theme === 'day'

  // ── 1 · Move a task that's in a project to another project ──
  if (want('1')) for (const scale of DAY ? [1, 1.5] : [1.5]) {
    const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { theme, scale })
    const row = page.locator(`[id="task-${id('1', 1)}"]`)
    await rightClick(row)
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
    await rightClick(both)
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
    // The first domain: no Move up. Item 7 added Move up / down and Make it an area….
    check(`${N('domains')} ⋯ → Rename · Colour · Move down · Merge into… · Make it an area… · Delete`, items === 'Rename · Colour · Move down · Merge into… · Make it an area… · Delete', items)
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
    await rightClick(rail)
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

  // ── 4 · A search result opens the thing itself — every entity type search_hybrid returns ──
  if (want('4')) {
    const PERSON = { id: id('7', 1), user_id: UID, name: 'Remy Manage', facts: [], domain_id: null, created_at: T, updated_at: T }
    const FILED = { id: id('8', 1), user_id: UID, kind: 'text', raw_text: 'remanage the vendor contract', transcript: null, ai_parse: null, confidence: null, status: 'filed', filed_task_id: id('1', 2), payload: null, snoozed_until: null, deleted_at: null, created_at: T, updated_at: T }
    const ENTRY = { id: id('a', 9), user_id: UID, body: 'Remanaged the garden beds today', entry_date: '2026-09-14', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: '2026-09-14T07:00:00Z', updated_at: '2026-09-14T07:00:00Z' }
    const later = new Date(Date.now() + 16 * 86400000)
    later.setUTCHours(8, 0, 0, 0)
    const EVENT = { id: id('b', 1), user_id: UID, title: 'Remanage review', starts_at: later.toISOString(), ends_at: new Date(later.getTime() + 3600000).toISOString(), all_day: false, task_id: null, source: 'local', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: T, updated_at: T }
    const hit = (entity_type, entity_id, title) => ({ entity_type, entity_id, title, snippet: null, score: 1 })
    const hits = [
      hit('task', id('1', 5), 'Remanage the hosting plan'), // done, inside a project
      hit('project', SITE.id, 'Shaheen Website'),
      hit('area', AREA.id, 'Health'),
      hit('person', PERSON.id, 'Remy Manage'),
      hit('inbox_item', FILED.id, 'remanage the vendor contract'), // filed — the Inbox is at zero
      hit('journal_entry', ENTRY.id, 'Remanaged the garden beds today'), // three weeks ago
      hit('calendar_event', EVENT.id, 'Remanage review'), // two weeks out
    ]
    const rows = { people: [PERSON], inbox_items: [FILED], journal_entries: [ENTRY], calendar_events: [EVENT] }
    const cases = [
      ['remanage the hosting', 'Tasks', 'task (done, in a project)', async (page) => (await page.locator('textarea, input').evaluateAll((els) => els.some((e) => e.value === 'Remanage the hosting plan')))],
      ['shaheen', 'Projects', 'project', async (page) => (await page.getByRole('heading', { level: 1 }).innerText()).includes('Shaheen Website')],
      ['health', 'Areas', 'area', async (page) => (await page.getByRole('heading', { level: 1 }).innerText()).includes('Health')],
      ['remy', 'People', 'person', async (page) => (await page.locator('.app-main-content').innerText()).includes('Remy Manage')],
      ['vendor', 'Inbox', 'inbox item (filed, Inbox at zero)', async (page) => (await page.locator(`[id="inbox-${FILED.id}"]`).count()) === 1 && /already filed/i.test(await page.locator(`[id="inbox-${FILED.id}"]`).innerText())],
      ['garden beds', 'Journal', 'journal entry (an older day)', async (page) => (await page.locator(`[id="journal-${ENTRY.id}"]`).count()) === 1 && (await page.locator(`[id="journal-${ENTRY.id}"]`).isVisible())],
      ['review', 'Events', 'calendar event (two weeks out)', async (page) => (await page.locator('input').evaluateAll((els) => els.some((e) => e.value === 'Remanage review'))) || ((await page.getByRole('dialog').count()) > 0 && (await page.getByRole('dialog').last().innerText()).includes('Remanage review'))],
    ]
    for (const view of DAY ? [undefined, PHONE] : [undefined]) {
      const v = view ? 'phone' : 'desktop'
      for (const [q, group, label, landed] of cases) {
        const { ctx, page, errors } = await open('/today', { theme, view, rows, hits, scale: view ? 1 : 1.5 })
        await page.keyboard.press('Control+/')
        await sleep(300)
        await page.keyboard.type(q)
        await sleep(900)
        const groupLabel = page.getByText(group, { exact: true }).first()
        const row = page.locator('button', { hasText: hits.find((h) => h.title.toLowerCase().includes(q))?.title }).first()
        if (q === 'remanage the hosting' && DAY && !view) await shot(page, N('4-search-overlay-150'))
        const found = (await groupLabel.count()) > 0 && (await row.count()) > 0
        await row.click()
        await sleep(1300)
        const ok = found && (await landed(page))
        check(`${N('search')} ${v}: ${label} → opens it (${new URL(page.url()).pathname}${new URL(page.url()).search})`, ok)
        if (q === 'garden beds' || q === 'review' || q === 'vendor' || (q === 'remanage the hosting' && view)) await shot(page, N(`4-search-${label.split(' ')[0]}-${v}`))
        check(`${N('search')} ${v}: ${label} no page errors`, errors.length === 0, errors.join(' | '))
        await ctx.close()
      }
    }
  }

  // ── 5 · Project status updates (and work entries): edit in place, delete with Undo ──
  if (want('5')) for (const view of DAY ? [undefined, PHONE] : [undefined]) {
    const v = view ? 'phone' : 'desktop'
    const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { theme, view, scale: view ? 1 : 1.5 })
    const upd = page.getByRole('button', { name: 'Edit update: Homepage copy approved' })
    await upd.scrollIntoViewIfNeeded()
    await upd.click()
    await sleep(250)
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Homepage copy approved by Priya')
    let from = state.writes.length
    await page.keyboard.press('Enter')
    await sleep(500)
    let w = writesTo(state, 'activity_log', from)
    check(`${N('updates')} ${v}: edit an update in place → project.update_edited {update_id, note}`, w.length === 1 && w[0].event_type === 'project.update_edited' && w[0].payload.update_id === UPDATE.id && w[0].payload.note === 'Homepage copy approved by Priya', JSON.stringify(w))
    check(`${N('updates')} ${v}: the feed shows the new note`, (await page.getByRole('button', { name: 'Edit update: Homepage copy approved by Priya' }).count()) === 1)
    if (!view) await shot(page, N('5-updates-edited-150'))
    from = state.writes.length
    await page.getByRole('button', { name: 'Delete update: Homepage copy approved by Priya' }).click()
    await sleep(500)
    w = writesTo(state, 'activity_log', from)
    check(`${N('updates')} ${v}: ✕ deletes it (project.update_deleted), no confirm, "Update deleted · Undo"`, w.some((x) => x.event_type === 'project.update_deleted' && x.payload.update_id === UPDATE.id) && (await page.getByRole('button', { name: /Edit update/ }).count()) === 0 && (await page.locator('.kf-toast-msg').allInnerTexts()).includes('Update deleted'))
    if (view) await shot(page, N('5-updates-deleted-phone'))
    from = state.writes.length
    await toastUndo(page)
    check(`${N('updates')} ${v}: Undo brings it back with its edit (project.update_restored)`, writesTo(state, 'activity_log', from).some((x) => x.event_type === 'project.update_restored') && (await page.getByRole('button', { name: 'Edit update: Homepage copy approved by Priya' }).count()) === 1)
    // a work entry
    await page.getByRole('button', { name: 'Edit work: Wireframes' }).click()
    await sleep(200)
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Wireframes v2')
    from = state.writes.length
    await page.keyboard.press('Enter')
    await sleep(500)
    check(`${N('updates')} ${v}: a work entry's note edits the time entry (+ project.work_edited)`, writesTo(state, 'time_entries', from).some((x) => x.id === WORKLOG.id && x.note === 'Wireframes v2') && logged(state, from).includes('project.work_edited'))
    from = state.writes.length
    await page.getByRole('button', { name: 'Delete work: Wireframes v2' }).click()
    await sleep(500)
    check(`${N('updates')} ${v}: ✕ on a work entry deletes it (+ project.work_deleted)`, state.writes.slice(from).some((x) => x.table === 'time_entries' && x.method === 'DELETE') && logged(state, from).includes('project.work_deleted'))
    from = state.writes.length
    await toastUndo(page)
    check(`${N('updates')} ${v}: Undo writes it back`, writesTo(state, 'time_entries', from).some((x) => x.id === WORKLOG.id))
    check(`${N('updates')} ${v}: no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // ── 6 · Number fields: focus selects, typing replaces, empty allowed while typing, −/+ ──
  if (want('6')) for (const view of DAY ? [undefined, PHONE] : [undefined]) {
    const v = view ? 'phone' : 'desktop'
    const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`, { theme, view, scale: view ? 1 : 1.5 })
    const weight = page.getByRole('textbox', { name: 'Milestone weight' })
    await weight.scrollIntoViewIfNeeded()
    await weight.click()
    await sleep(150)
    await page.keyboard.type('5')
    check(`${N('number')} ${v}: weight — click, type 5 → "5" (was "15")`, (await weight.inputValue()) === '5', await weight.inputValue())
    await page.keyboard.press('Backspace')
    check(`${N('number')} ${v}: the field may be empty while typing`, (await weight.inputValue()) === '')
    await page.getByPlaceholder('Add milestone…').click()
    await sleep(150)
    check(`${N('number')} ${v}: left empty, blur keeps the last good value`, (await weight.inputValue()) === '5', await weight.inputValue())
    await weight.click()
    await page.keyboard.type('250')
    await page.getByPlaceholder('Add milestone…').click()
    await sleep(150)
    check(`${N('number')} ${v}: out of range → clamped on blur (max 100)`, (await weight.inputValue()) === '100', await weight.inputValue())
    await page.getByRole('button', { name: 'Less Milestone weight' }).click()
    await page.getByRole('button', { name: 'Less Milestone weight' }).click()
    check(`${N('number')} ${v}: − steps down`, (await weight.inputValue()) === '98')
    await page.getByRole('button', { name: 'More Milestone weight' }).click()
    check(`${N('number')} ${v}: + steps up`, (await weight.inputValue()) === '99')
    if (!view) await shot(page, N('6-weight-150'))
    await page.getByPlaceholder('Add milestone…').fill('Beta')
    const from = state.writes.length
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await sleep(500)
    const ms = writesTo(state, 'projects', from).at(-1)?.milestones ?? []
    check(`${N('number')} ${v}: Add writes the milestone with weight 99, the field resets to 1`, ms.some((m) => m.title === 'Beta' && m.weight === 99) && (await weight.inputValue()) === '1', JSON.stringify(ms))
    if (view) {
      await shot(page, N('6-weight-phone'))
      const plus = await page.getByRole('button', { name: 'More Milestone weight' }).boundingBox()
      const shifted = await page.evaluate(() => [...document.querySelectorAll('*')].some((el) => el.scrollLeft > 0))
      check(`${N('number')} phone: the milestone row fits the card (−/+ in reach, nothing scrolled sideways)`, plus && plus.x + plus.width <= 390 && !shifted, JSON.stringify({ plus, shifted }))
    }
    check(`${N('number')} ${v}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('6') && DAY) {
    // The other number fields share it: Focus's custom minutes, a challenge's days, the new-project milestone weight
    {
      const { ctx, page, errors } = await open('/focus', { theme })
      await page.getByTitle('pomodoro settings').click()
      await sleep(400)
      const mins = page.getByRole('textbox', { name: 'Custom minutes' }).first()
      await mins.click()
      await page.keyboard.type('40')
      await page.keyboard.press('Enter')
      await sleep(200)
      check('focus: custom minutes — click, type 40, Enter → 40 (typing replaces)', (await mins.inputValue()) === '40', await mins.inputValue())
      await shot(page, '6-focus-minutes-day')
      check('focus: no page errors', errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    {
      const { ctx, page, errors } = await open('/routines', { theme })
      await page.getByText('＋ New routine').first().click()
      await sleep(400)
      await page.getByText('Challenge (optional)').click()
      await sleep(200)
      const days = page.getByRole('textbox', { name: 'Challenge days' })
      await days.click()
      await page.keyboard.type('21')
      check('routines: challenge days — click, type 21 → 21 (was 3021)', (await days.inputValue()) === '21', await days.inputValue())
      await page.getByRole('button', { name: 'More Challenge days' }).click()
      check('routines: + → 22', (await days.inputValue()) === '22')
      await shot(page, '6-challenge-days-day')
      check('routines: no page errors', errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }

  // ── 7 · Change a thing's type: project ↔ retainer, project → area, area → domain, domain → area ──
  if (want('7')) {
    const { ctx, page, errors, state } = await open('/projects', { theme, scale: 1.5 })
    await rightClick(page.locator('.kf-lift', { hasText: 'Shaheen Website' }).first())
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Change type…' }).click()
    await sleep(300)
    const opts = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim()).join(' · ')
    check(`${N('type')} a project can become a retainer or an area`, opts === 'Make it a retainer · Make it an area', opts)
    await page.getByRole('menuitem', { name: 'Make it an area' }).click()
    await sleep(400)
    const body = await page.locator('.kf-overlay-card').innerText()
    check(`${N('type')} the confirmation says exactly what happens`, body.includes('Make “Shaheen Website” an area?') && body.includes('2 open tasks and 1 done move to the new area · its milestones, logged hours, updates stay with the project in Trash (30 days).'), body.replace(/\n/g, ' / '))
    await shot(page, N('7-type-confirm-150'))
    let from = state.writes.length
    await page.getByRole('button', { name: 'Make it an area' }).click()
    await sleep(700)
    const newArea = writesTo(state, 'areas', from)
    const moved = writesTo(state, 'tasks', from)
    const trashed = writesTo(state, 'projects', from)
    check(`${N('type')} project → area: a new area with its name + domain, its 3 tasks moved, the project to Trash, logged`, newArea.length === 1 && newArea[0].name === 'Shaheen Website' && newArea[0].domain_id === WORK.id && moved.length === 3 && moved.every((t) => t.area_id === newArea[0].id && t.project_id === null) && trashed.length === 1 && !!trashed[0].deleted_at && logged(state, from).includes('project.type_changed'), JSON.stringify({ newArea: newArea.length, moved: moved.length, trashed: trashed.length }))
    check(`${N('type')} "“Shaheen Website” is now an area · Undo"; the row now sits with the areas`, (await page.locator('.kf-toast-msg').allInnerTexts()).some((t) => t.includes('is now an area')))
    from = state.writes.length
    await toastUndo(page)
    const un = state.writes.slice(from)
    check(`${N('type')} one Undo: project back, tasks back in it, the new area removed`, writesTo(state, 'projects', from).some((p) => p.id === SITE.id && p.deleted_at === null) && writesTo(state, 'tasks', from).length === 3 && writesTo(state, 'tasks', from).every((t) => t.project_id === SITE.id) && un.some((w) => w.table === 'areas' && w.method === 'DELETE'), JSON.stringify(un.map((w) => `${w.method} ${w.table}`)))
    // retainer → project
    await rightClick(page.locator('.kf-lift', { hasText: 'Retainer Co' }).first())
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Change type…' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Make it a project' }).click()
    await sleep(300)
    from = state.writes.length
    await page.getByRole('button', { name: 'Make it a project' }).click()
    await sleep(500)
    const flip = writesTo(state, 'projects', from)
    check(`${N('type')} retainer → project flips the type only`, flip.length === 1 && flip[0].type === 'standard' && flip[0].id === RETAINER.id)
    check(`${N('type')} projects page no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('7')) {
    // area page → Change type… → Make it a domain; lands on Projects
    const { ctx, page, errors, state } = await open(`/projects/${AREA.id}`, { theme, view: DAY ? undefined : PHONE })
    // Scroll first and let it settle: a menu closes on a page scroll (it would detach from its anchor).
    await page.getByRole('button', { name: /Change type/ }).scrollIntoViewIfNeeded()
    await sleep(500)
    await page.getByRole('button', { name: /Change type/ }).click()
    await sleep(400)
    await page.getByRole(DAY ? 'menuitem' : 'button', { name: 'Make it a domain' }).click()
    await sleep(500)
    const body = await page.locator('.kf-overlay-card').innerText()
    check(`${N('type')} ${DAY ? 'desktop' : 'phone'} area page → Make it a domain: "2 open tasks move to the new domain · the area goes to Trash."`, body.includes('2 open tasks move to the new domain · the area goes to Trash.'), body.replace(/\n/g, ' / '))
    if (!DAY) await shot(page, N('7-type-area-phone'))
    const from = state.writes.length
    await page.locator('.kf-overlay-card').getByRole('button', { name: 'Make it a domain' }).click()
    await sleep(700)
    const d = writesTo(state, 'domains', from)
    check(`${N('type')} area → domain: a domain named Health, its tasks carry it, the area to Trash, off to Projects`, d.length === 1 && d[0].name === 'Health' && writesTo(state, 'tasks', from).every((t) => t.domain_id === d[0].id && t.area_id === null) && writesTo(state, 'areas', from).some((a) => a.id === AREA.id && a.deleted_at) && new URL(page.url()).pathname === '/projects')
    check(`${N('type')} area page no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  if (want('7') && DAY) {
    // domain → area from Settings → Organize; and a domain chip's right-click on Tasks
    const { ctx, page, errors, state } = await open('/settings', { theme })
    const card = page.locator('#settings-Organize')
    await card.scrollIntoViewIfNeeded()
    await card.getByRole('button', { name: 'More for Home' }).click()
    await sleep(300)
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/[▸\n]/g, '').trim()).join(' · ')
    check('domain menu: Rename · Colour · Move up · Merge into… · Make it an area… · Delete (the last domain has no Move down)', items === 'Rename · Colour · Move up · Merge into… · Make it an area… · Delete', items)
    let from = state.writes.length
    await page.getByRole('menuitem', { name: 'Move up' }).click()
    await sleep(400)
    const order = writesTo(state, 'domains', from)
    check('Move up rewrites the order (sort_order)', order.some((x) => x.id === HOME.id && x.sort_order === 0) && order.some((x) => x.id === WORK.id && x.sort_order === 1), JSON.stringify(order.map((x) => [x.name, x.sort_order])))
    await card.getByRole('button', { name: 'More for Home' }).click()
    await sleep(300)
    await page.getByRole('menuitem', { name: 'Make it an area…' }).click()
    await sleep(400)
    const body = await page.locator('.kf-overlay-card').innerText()
    check('domain → area: "No tasks to move · its 1 area keep going with no domain · the domain goes to Trash."', body.includes('its 1 area keep going with no domain · the domain goes to Trash.'), body.replace(/\n/g, ' / '))
    from = state.writes.length
    await page.locator('.kf-overlay-card').getByRole('button', { name: 'Make it an area' }).click()
    await sleep(600)
    const areas = writesTo(state, 'areas', from)
    check('domain → area: a new area "Home", Health leaves the domain, Home to Trash', areas.some((a) => a.name === 'Home' && a.domain_id === null) && areas.some((a) => a.id === AREA.id && a.domain_id === null) && writesTo(state, 'domains', from).some((x) => x.id === HOME.id && x.deleted_at))
    await shot(page, 'type-domain-to-area-day')
    check('settings (type) no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
    // The domain chips are the phone's (Tasks.dc.html 1b); a long-press is the phone's right-click.
    const t = await open('/tasks', { theme, view: PHONE })
    await rightClick(t.page.locator('span', { hasText: /^Work$/ }).first())
    await sleep(300)
    check('Tasks (phone): long-press / right-click a domain chip opens the domain sheet', (await t.page.getByRole('button', { name: /Make it an area/ }).count()) === 1)
    await t.page.getByRole('button', { name: /^Rename/ }).click()
    await sleep(200)
    from = t.state.writes.length
    await t.page.keyboard.type('Clients')
    await t.page.keyboard.press('Enter')
    await sleep(400)
    check('Tasks: chip → Rename edits the chip in place', writesTo(t.state, 'domains', from).some((x) => x.name === 'Clients'))
    await shot(t.page, 'type-domain-chip-day')
    check('tasks (chips) no page errors', t.errors.length === 0, t.errors.join(' | '))
    await t.ctx.close()
  }
  if (want('7') && !DAY) {
    // phone: Projects ⋯ → Change type… → the sheet
    const { ctx, page, errors, state } = await open('/projects', { theme, view: PHONE })
    await page.getByRole('button', { name: 'More for Retainer Co' }).click()
    await sleep(500)
    await page.getByRole('button', { name: /Change type/ }).click()
    await sleep(600)
    await shot(page, N('7-type-sheet-phone'))
    await page.getByRole('button', { name: 'Make it a project' }).click()
    await sleep(500)
    const from = state.writes.length
    await page.locator('.kf-overlay-card').getByRole('button', { name: 'Make it a project' }).click()
    await sleep(500)
    check(`${N('type')} phone ⋯ → Change type… → Make it a project`, writesTo(state, 'projects', from).some((p) => p.id === RETAINER.id && p.type === 'standard'))
    check(`${N('type')} phone no sideways scroll, no page errors`, (await noHScroll(page)) && errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
