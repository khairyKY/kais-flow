// v166-shared-lists (2026-11-18): partner sharing P2, shared lists, on the real pages against a MOCKED backend (Playwright, Edge/Chromium),
// desktop 1280x800 and phone 390x844.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5273] [playwright-core index.mjs] [channel=msedge]
// The dev server runs in mock mode (app/.env.mock.local: VITE_SUPABASE_URL=http://127.0.0.1:9). Every Supabase request is answered here and every
// write is kept, so the checks can say what the app SENT. The server's rules (who may write, Private, the tick credit, the copies on leaving) are
// proved by supabase/tests/sharing-lists.sh against real Postgres; this proves the screens ask for them and draw them.
//
// Checks: Projects has a "Shared with Reem" group before the rest (and the shared list is not in the forest) - the list page: the rule line, To buy,
// Got, the face that added each item and the face and time of each tick - add an item (an ordinary task in the project, no user_id, no Top 3) - tick
// is "set to done" (a full row, status done) and Got shows it - an offline tick: shown at once, one write, sent when back online - the list menu
// (Leave this list for hers, Stop sharing for mine), the sentence that each keeps a copy, and the call it makes - New project: "Share with Reem" off
// until flipped, then the project row is written (never with shared_circle_id) and share_list_start is asked with its id and the circle - the project
// menu's "Share with Reem" - the Private switch inside a list is off and says why - phone layout - no page errors.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5273'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const CHANNEL = process.argv[5] ?? 'msedge'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' - ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── mock session + rows: Wed 18 Nov 2026, Cairo (UTC+2), 12:09 ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11' // Kai
const PARTNER = '00000000-0000-4000-8000-00000000dd22' // Reem
const CIRCLE = 'c1000000-0000-4000-8000-000000000001'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'kai@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const at = (hhmm, day = 18) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, day, h - 2, m)) }
const iso = (hhmm, day) => at(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const tid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null,
  top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null,
  reminder_sent: false, completed_at: null, paused: false, private: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null, slot_date: null,
  added_by: null, done_by: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const project = (n, name, over = {}) => ({ id: pid(n), user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], engagement_model: null, completion_summary: null, shared_circle_id: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const connection = (o = {}) => ({
  circle_id: CIRCLE, relation: 'partner', partner_id: PARTNER, partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details', my_grant_id: 'd0000000-0000-4000-8000-000000000001',
  show_lane: true, since: '2026-11-10T08:00:00Z', paused_until: null, paused_by_me: false, ...o,
})

// Reem's Groceries, shared with Kai: five to buy (who added each), two got (who ticked, when). Kai's own Dahab trip, shared with Reem. An ordinary project.
const GROC = project(1, 'Groceries', { user_id: PARTNER, shared_circle_id: CIRCLE })
const TRIP = project(2, 'Dahab trip', { shared_circle_id: CIRCLE })
const THESIS = project(3, 'Thesis', {})
const G = (n, title, by, over = {}) => task(n, title, { user_id: PARTNER, project_id: GROC.id, added_by: by, created_at: iso('08:0' + n, 10), ...over })
const TASKS = [
  G(1, 'Milk', UID), G(2, 'Eggs, a dozen', PARTNER), G(3, 'Tomatoes', PARTNER), G(4, 'Pita bread', UID), G(5, 'Olive oil', UID),
  G(6, 'Coffee beans', PARTNER, { status: 'done', done_by: PARTNER, completed_at: iso('18:12', 17) }),
  G(7, 'Bananas', UID, { status: 'done', done_by: UID, completed_at: iso('09:30', 18) }),
  task(20, 'Book hostel', { project_id: TRIP.id, added_by: UID }),
  task(21, 'Call the dentist', { project_id: THESIS.id, private: true }),
]

async function openPage(browser, { phone = false, route, connections = [connection()], projects = [GROC, TRIP, THESIS] } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    timezoneId: 'Africa/Cairo', locale: 'en-US', ...(phone ? { hasTouch: true, isMobile: true } : {}),
  })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe']))
  }, [JSON.stringify(session), UID])
  const state = { rows: { tasks: structuredClone(TASKS), projects: structuredClone(projects), calendar_events: [], app_settings: [SETTINGS], domains: [], areas: [], inbox_items: [], activity_log: [], share_invites: [], share_links: [] }, conns: structuredClone(connections), writes: [], rpcs: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    const json = (body, status = 200, headers = {}) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers }).catch(() => {})
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }).catch(() => {})
    if (p.startsWith('/auth/v1/user')) return json(user)
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop()
      let body = {}
      try { body = req.postDataJSON() ?? {} } catch { /* none */ }
      state.rpcs.push({ fn, body })
      if (fn === 'share_connections') return json(state.conns)
      if (fn === 'shared_day') return json({ level: null })
      if (fn === 'share_list_start') return json({ ok: true })
      if (fn === 'share_list_stop') return json({ ok: true, copy_id: body.p_project === GROC.id ? pid(9) : null })
      return json(null)
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table: p.replace('/rest/v1/', ''), query: url.search, body })
      return json([], 201)
    }
    const table = p.replace('/rest/v1/', '')
    const rows = state.rows[table] ?? []
    return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: at('12:09') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch((e) => errors.push('goto ' + e.message))
  await sleep(1500)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {})
const text = (page) => page.evaluate(() => document.body.innerText)
const click = async (page, name, opts = {}) => { await page.getByRole(opts.role ?? 'button', { name, exact: opts.exact ?? false }).first().click(); await sleep(opts.wait ?? 500) }
const taskWrites = (state) => state.writes.filter((w) => w.table === 'tasks').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))

const browser = await chromium.launch({ channel: CHANNEL, headless: true })
const allErrors = []

// ── 1. Projects: the group, and the list is not in the forest ──
{
  const { page, errors } = await openPage(browser, { route: '/projects' })
  const t = await text(page)
  check('Projects has a "Shared with Reem" group with both lists', /Shared with Reem/.test(t) && /Groceries/.test(t) && /Dahab trip/.test(t), t.slice(0, 200).replace(/\n/g, ' | '))
  check('...each with what is left (Groceries 5 to buy, Dahab trip 1)', /5 to buy/.test(t) && /1 to buy/.test(t))
  check('...and the group comes before the ordinary projects', t.indexOf('Shared with Reem') < t.indexOf('Thesis'))
  const forest = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && e.textContent === 'Groceries').length)
  check('a shared list is listed once (not also in the forest)', forest === 1, forest)
  await shot(page, 'desktop-projects')
  allErrors.push(...errors)
  await page.context().close()
}

// ── 2. the list page (hers, shared with me) ──
{
  const { page, errors, state } = await openPage(browser, { route: `/projects/${GROC.id}` })
  let t = await text(page)
  check('the page names the list and the rule', /Groceries/.test(t) && /Shared with Reem · either of you adds and ticks/.test(t))
  check('To buy has the five open items in the order they were added', /To buy · 5/.test(t) && t.indexOf('Milk') < t.indexOf('Eggs, a dozen') && t.indexOf('Eggs, a dozen') < t.indexOf('Olive oil'))
  check('Got has the two done ones, the latest tick first', /Got · 2/.test(t) && t.indexOf('Bananas') < t.indexOf('Coffee beans'))
  const faces = await page.locator('.sl-row .sl-by').evaluateAll((els) => els.map((e) => e.textContent.trim() + '|' + (e.querySelector('.sh-av')?.className.includes('is-her') ? 'her' : 'me')))
  check("every row wears a face: Milk is mine, Eggs is Reem's", faces[0].endsWith('me') && faces[1].endsWith('her'), faces.join(' ; '))
  check('a ticked row shows who and when: Bananas 9:30 AM (mine), Coffee beans Tue (hers)', /9:30 AM/.test(t) && /Tue/.test(t), faces.slice(-2).join(' ; '))
  await shot(page, 'desktop-list')

  // add an item
  await page.getByLabel('Add an item').fill('Olives')
  await page.keyboard.press('Enter'); await sleep(700)
  const added = taskWrites(state).find((w) => w.title === 'Olives')
  check('Enter adds an item: an ordinary task in the project, no user_id, off Top 3', added && added.project_id === GROC.id && !added.user_id && added.top3 === false && added.status === 'todo', JSON.stringify(added)?.slice(0, 160))
  t = await text(page)
  check('...it shows at once (To buy 6)', /To buy · 6/.test(t) && /Olives/.test(t))

  // tick: set to done
  await page.getByLabel('Tick Milk').first().click(); await sleep(900)
  const ticked = taskWrites(state).filter((w) => w.id === tid(1)).at(-1)
  check('a tick writes the row done (set to done, never a toggle)', ticked && ticked.status === 'done' && !!ticked.completed_at, JSON.stringify(ticked)?.slice(0, 160))
  t = await text(page)
  check('...Milk moves to Got', /Got · 3/.test(t))
  await shot(page, 'desktop-list-ticked')

  // the Private switch is off inside a list
  await page.locator('.sl-title', { hasText: 'Tomatoes' }).click(); await sleep(900)
  t = await text(page)
  check('opening an item: the Private switch is off and says why', /Private · not in a shared list/.test(t), t.slice(0, 200).replace(/\n/g, ' | '))
  await shot(page, 'desktop-private-blocked')
  await page.keyboard.press('Escape'); await sleep(400)

  // leave this list
  await page.getByRole('button', { name: 'List menu' }).click(); await sleep(500)
  await click(page, 'Leave this list')
  t = await text(page)
  check('Leave asks first, and says each keeps a copy', /Leave Groceries\?/.test(t) && /You keep a copy of Groceries/.test(t) && /Reem keeps theirs/.test(t))
  await shot(page, 'desktop-leave')
  await click(page, 'Leave this list', { exact: true })
  await sleep(700)
  check('the call is share_list_stop with the project', state.rpcs.some((r) => r.fn === 'share_list_stop' && r.body.p_project === GROC.id))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 3. my own list: Stop sharing ──
{
  const { page, errors, state } = await openPage(browser, { route: `/projects/${TRIP.id}` })
  let t = await text(page)
  check("my own shared list reads the same, with Reem's name", /Shared with Reem · either of you adds and ticks/.test(t) && /Book hostel/.test(t))
  await page.getByRole('button', { name: 'List menu' }).click(); await sleep(500)
  t = await text(page)
  check('the menu says Stop sharing (not Leave) for the owner', /Stop sharing/.test(t) && !/Leave this list/.test(t))
  await click(page, 'Stop sharing')
  t = await text(page)
  check('Stop asks first: Reem keeps a copy', /Stop sharing Dahab trip\?/.test(t) && /Reem keeps a copy of Dahab trip/.test(t))
  await click(page, 'Stop sharing', { exact: true }); await sleep(700)
  check('the call is share_list_stop with my project', state.rpcs.some((r) => r.fn === 'share_list_stop' && r.body.p_project === TRIP.id))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 4. offline tick: shown at once, one set-to-done write, sent when back online ──
{
  const { page, ctx, errors, state } = await openPage(browser, { route: `/projects/${GROC.id}` })
  await ctx.setOffline(true); await sleep(300)
  await page.getByLabel('Tick Eggs, a dozen').first().click(); await sleep(800)
  const t = await text(page)
  check('offline, the tick shows at once (Got 3)', /Got · 3/.test(t))
  check('...and nothing has gone out yet', taskWrites(state).filter((w) => w.id === tid(2)).length === 0)
  await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(2500)
  const sent = taskWrites(state).filter((w) => w.id === tid(2))
  check('back online it goes out once, as "done" with the tick time', sent.length === 1 && sent[0].status === 'done' && !!sent[0].completed_at, JSON.stringify(sent).slice(0, 160))
  allErrors.push(...errors)
  await ctx.close()
}

// ── 5. New project: Share with Reem ──
{
  const { page, errors, state } = await openPage(browser, { route: '/projects' })
  await click(page, '+ New project')
  const t = await text(page)
  check('New project has "Share with Reem", and it is off until flipped', /Share with Reem/.test(t) && (await page.getByRole('switch', { name: 'Share with Reem' }).getAttribute('aria-checked')) === 'false')
  await page.getByPlaceholder('e.g. Balcony garden rebuild…').fill('Weekend trip')
  await page.getByRole('switch', { name: 'Share with Reem' }).click(); await sleep(200)
  await shot(page, 'desktop-new-project')
  await click(page, 'Plant project'); await sleep(1500)
  const created = state.writes.filter((w) => w.table === 'projects').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body])).find((b) => b.name === 'Weekend trip')
  check('the project row is written without shared_circle_id (the server owns it)', created && !('shared_circle_id' in created), JSON.stringify(created)?.slice(0, 140))
  const start = state.rpcs.find((r) => r.fn === 'share_list_start')
  check('then share_list_start is asked with the project and the circle', start && start.body.p_project === created?.id && start.body.p_circle === CIRCLE, JSON.stringify(start))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 6. the project menu offers Share with Reem (an ordinary project of mine) ──
{
  const { page, errors, state } = await openPage(browser, { route: '/projects' })
  await page.getByText('Thesis', { exact: true }).first().click({ button: 'right' }); await sleep(500)
  const t = await text(page)
  check('the project menu has "Share with Reem" for an ordinary project of mine', /Share with Reem/.test(t))
  await page.getByText('Share with Reem', { exact: true }).first().click(); await sleep(900)
  const start = state.rpcs.find((r) => r.fn === 'share_list_start')
  check('...and it asks share_list_start for that project', start && start.body.p_project === THESIS.id && start.body.p_circle === CIRCLE, JSON.stringify(start))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 7. phone ──
{
  const { page, errors } = await openPage(browser, { phone: true, route: '/projects' })
  let t = await text(page)
  check('phone: the Projects page has the Shared with Reem group', /Shared with Reem/.test(t) && /Groceries/.test(t))
  await shot(page, 'phone-projects')
  await page.getByRole('button', { name: /Groceries/ }).first().click(); await sleep(1000)
  t = await text(page)
  check('phone: the list page, To buy and Got', /Shared with Reem · either of you adds and ticks/.test(t) && /To buy · 5/.test(t) && /Got · 2/.test(t))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('phone: no horizontal scroll', !overflow)
  await shot(page, 'phone-list')
  await page.locator('.sl-title', { hasText: 'Tomatoes' }).click(); await sleep(1000)
  t = await text(page)
  check('phone: the task sheet has the Private switch off, with why', /Private · not in a shared list/.test(t))
  await shot(page, 'phone-private-blocked')
  allErrors.push(...errors)
  await page.context().close()
}

check('no page errors', allErrors.length === 0, allErrors.slice(0, 3).join(' || '))
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
