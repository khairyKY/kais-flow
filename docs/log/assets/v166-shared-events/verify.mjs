// v166-shared-events (2026-11-18): partner sharing P2, Free together and Shared events, on the real pages against a MOCKED backend
// (Playwright, Edge/Chromium), desktop 1280x800 and phone 390x844.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5272] [playwright-core index.mjs] [channel=msedge]
// The dev server runs in mock mode (app/.env.mock.local: VITE_SUPABASE_URL=http://127.0.0.1:9). Every Supabase request is answered here: REST rows,
// the sharing RPCs (share_connections, shared_day, shared_free_together, shared_event_create / respond / delete_both) and every write is kept, so the
// checks say what the app SENT. The server's own rules (windows only, locked link columns, edit for both, leave, a third user) are proved by
// supabase/tests/sharing-events.sh; this proves the screens ask for them and draw them. The example partner is Reem; her colour is Heather.
//
// Checks: Her day card has Free together + New shared event · Free together lists the windows by day with the day chips, asks the server for
// the chip's range and Propose fills the time in from the window · Send to Reem calls shared_event_create with that title and time (and nothing
// else), a paused connection says so, an offline/failed send says so · a shared event on the calendar is dashed until answered, carries Reem's
// face, and its menu has Accept / Decline / Remove from mine / Delete for both (no Private, no Repeat) · Accept and Decline call the RPC ·
// Delete for both asks first, calls the RPC only after, and Remove from mine is a plain delete of its own row (the outbox) · the phone sheet's
// footer is Delete for both · Settings has the per-side Google switch · no page errors.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5272'
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
const UID = '00000000-0000-4000-8000-00000000cc11'
const PARTNER = '00000000-0000-4000-8000-00000000dd22'
const CIRCLE = 'c1000000-0000-4000-8000-000000000001'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'kai@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const DAY = 18
const at = (hhmm, day = DAY) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, day, h - 2, m)) }
const iso = (hhmm, day) => at(hhmm, day).toISOString()
const CREATED = iso('07:00', 1)
const tid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null,
  top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null,
  reminder_sent: false, completed_at: null, paused: false, private: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from, DAY), ends_at: iso(to, DAY), all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true,
  type: 'event', color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, private: false, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const TASKS = [task(2, 'Draft the CV chapter', { top3: true, top3_rank: 1, due_at: iso('09:00') }), task(3, 'Buy stamps', { due_at: iso('09:00') })]
const EVENTS = [ev(1, 'Dentist', '13:00', '14:00'), ev(2, 'Gym', '18:00', '19:00')]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], calendar_day_count: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const connection = (o = {}) => ({
  circle_id: CIRCLE, relation: 'partner', partner_id: PARTNER, partner_name: 'Reem', my_level: 'details', their_level: 'details', level: 'details', my_grant_id: 'd0000000-0000-4000-8000-000000000001',
  show_lane: true, since: '2026-11-10T08:00:00Z', paused_until: null, paused_by_me: false, ...o,
})
/** What the server would answer for Reem's day at a level: the masking is the server's, here only its shape. */
function sharedDay(level) {
  if (!level) return { level: null }
  const titled = level !== 'busy'
  const b = (id, a, z, title) => ({ id, starts_at: iso(a), ends_at: iso(z), all_day: false, masked: !titled || !title, ...(titled && title ? { title, kind: 'event' } : {}) })
  const day = { level, zone: 'Africa/Cairo', now: iso('12:09'), blocks: [b('r1', '09:00', '12:30', 'Study - pharmacology'), b('r2', '12:30', '14:00', 'Histology lab'), b('r3', '14:30', '15:30', 'Coffee with Mona'), b('r4', '17:00', '18:00', null)], top3: [], tasks: [] }
  if (level === 'details') {
    day.top3 = [{ id: 'q1', title: 'Finish the pharmacology summary', notes: 'chapters 4 to 6', done: false, goal: true }, { id: 'q2', title: 'Call grandma', done: true }]
    day.tasks = [{ id: 'q3', title: 'Buy a birthday card for Mona', notes: null }]
  }
  return day
}

// Shared events as the server stores them: my copy of each (the other person's copy is hers).
const sev = (n, title, from, to, over = {}) => ev(n, title, from, to, { shared_id: 's' + n, shared_with: PARTNER, shared_circle: CIRCLE, share_status: 'accepted', share_peer_status: 'accepted', share_edited_by: UID, ...over })
const SHARED = [
  sev(11, 'Date night', '19:00', '21:00'), // both said yes
  sev(12, 'Walk by the Nile', '16:00', '17:00', { share_peer_status: 'invited' }), // I made it, waiting on Reem (dashed)
  sev(13, 'Lunch with Reem’s family', '15:00', '16:00', { share_status: 'invited' }), // Reem proposed it to me (dashed, Accept / Decline)
  sev(14, 'Cinema', '10:30', '11:30', { share_peer_status: 'declined' }), // Reem can't go
]
/** Free together as the server answers it: windows only, her clock. */
function freeAnswer() {
  return { ok: true, zone: 'Africa/Cairo', partner_zone: 'Africa/Cairo', windows: [{ starts_at: iso('17:30'), ends_at: iso('21:00') }, { starts_at: iso('19:00', DAY + 1), ends_at: iso('22:00', DAY + 1) }, { starts_at: iso('10:00', DAY + 2), ends_at: iso('12:00', DAY + 2) }] }
}

async function openPage(browser, { phone = false, route, connections = [connection()], level = 'details', signedIn = true, extra, events, integrations } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    timezoneId: 'Africa/Cairo', locale: 'en-US', ...(phone ? { hasTouch: true, isMobile: true } : {}),
  })
  await ctx.addInitScript(([sess, uid, signedIn]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    if (signedIn) localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe']))
    // Copy and Share: the clipboard and the share sheet are the browser's; keep what was sent
    window.__sent = []
    navigator.share = (d) => { window.__sent.push(d); return Promise.resolve() }
  }, [JSON.stringify(session), UID, signedIn])
  const state = { rows: { tasks: structuredClone(TASKS), calendar_events: structuredClone(events ?? EVENTS), app_settings: [SETTINGS], projects: [], domains: [], areas: [], inbox_items: [], activity_log: [], integrations: integrations ?? [], share_invites: [], share_links: [] }, conns: structuredClone(connections), level, writes: [], rpcs: [], view: null, free: null, answer: null, fail: false, functions: [], ...(extra ?? {}) }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    const json = (body, status = 200, headers = {}) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers }).catch(() => {})
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }).catch(() => {})
    if (p.startsWith('/auth/v1/user')) return json(user)
    if (p.startsWith('/functions/v1/google-')) {
      let body = null
      try { body = req.postDataJSON() } catch { /* none */ }
      state.functions.push({ name: p.split('/').pop(), body })
      return json(body?.action === 'share_events' ? { share_events: body.on } : {}, 200, { 'access-control-allow-origin': '*' })
    }
    if (p.startsWith('/functions/v1/share-view')) return json(state.view?.body ?? { error: 'unauthorized' }, state.view?.status ?? 401, { 'access-control-allow-origin': '*' })
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop()
      let body = {}
      try { body = req.postDataJSON() ?? {} } catch { /* none */ }
      state.rpcs.push({ fn, body })
      if (fn === 'share_connections') return json(state.conns)
      if (fn === 'shared_day') return json(sharedDay(state.conns.find((c) => c.partner_id === body.p_owner)?.paused_until ? null : state.level === 'none' ? null : state.level))
      if (fn === 'shared_free_together') return json(state.free ?? freeAnswer())
      if ((fn === 'shared_event_create' || fn === 'shared_event_respond' || fn === 'shared_event_delete_both') && state.fail) return json({ message: 'down' }, 500)
      if (fn === 'shared_event_create') return state.answer ? json(state.answer) : json({ ok: true, shared_id: 's-new', event_id: body.p_id })
      if (fn === 'shared_event_respond' || fn === 'shared_event_delete_both') return json(state.answer ?? { ok: true })
      if (fn === 'share_invite_create') return json({ id: `i${state.rpcs.length}`, code: body.p_relation === 'family' ? 'FAMILY22' : 'K7QMR4TX', relation: body.p_relation, expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      if (fn === 'share_invite_peek') return json(body.p_code === 'K7QMR4TX' ? { ok: true, from_name: 'Reem', relation: 'partner', level: 'details', expires_at: iso('12:09') } : { ok: false, error: 'bad_code' })
      if (fn === 'share_invite_accept') return json({ ok: true, circle_id: CIRCLE })
      return json(null)
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table: p.replace('/rest/v1/', ''), query: url.search, body })
      if (req.method() === 'DELETE' && p.endsWith('/circles')) state.conns = []
      return json([], 201)
    }
    const table = p.replace('/rest/v1/', '')
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406)
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

const browser = await chromium.launch({ channel: CHANNEL, headless: true })
const allErrors = []


const GOOGLE_ROW = { provider: 'google', updated_at: '2026-11-10T08:00:00Z', login: 'kai@example.test', status: 'ok', synced_at: '2026-11-18T10:00:00Z', calendars: [{ id: 'primary', name: 'Kai', color: null, role: 'owner' }], chosen: ['primary'], can_write: true, mirror: null, share_events: null }
const near = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 60_000 // the mocked clock runs on from 12:09
const rpcOf = (state, fn) => state.rpcs.filter((r) => r.fn === fn)

// ── 1. Free together and Propose, desktop ──
{
  const { page, errors, state } = await openPage(browser, { route: '/today' })
  const card = page.locator('.sh-day').first()
  const t0 = await card.innerText().catch(() => '')
  check('Her day card has Free together and New shared event', /Free together/.test(t0) && /New shared event/.test(t0), t0.replace(/\n/g, ' | ').slice(-120))
  await card.getByRole('button', { name: 'Free together' }).click(); await sleep(700)
  let t = await text(page)
  check('Free together: the sheet says what free means and that only gaps are compared', /Free together/.test(t) && /an hour or more, between 8:00 AM and 10:30 PM/.test(t) && /nobody’s blocks are shown/.test(t))
  const ft = rpcOf(state, 'shared_free_together')
  check('it asks the server for TODAY, from now to my midnight, about Reem only', ft.length >= 1 && ft[0].body.p_partner === PARTNER && near(ft[0].body.p_from, iso('12:09')) && ft[0].body.p_to === iso('24:00'), JSON.stringify(ft[0]?.body))
  check('the chips are Today / Tomorrow / This week, Today picked', (await page.getByRole('button', { name: 'Today', exact: true }).count()) >= 1 && (await page.getByRole('button', { name: 'This week' }).count()) === 1)
  check('windows read as ranges on my clock, grouped by day', /5:30 – 9:00 PM/.test(t) && /Tomorrow/.test(t) && /7:00 – 10:00 PM/.test(t), t.replace(/\n/g, ' | ').slice(0, 260))
  const sheetText = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).join(' | '))
  check('it never shows her blocks or titles (the sheet holds windows only)', /5:30 – 9:00 PM/.test(sheetText) && !/Histology|Coffee|Study|pharmacology|Busy/.test(sheetText), sheetText.slice(0, 120))
  await shot(page, 'desktop-free-together')
  await page.getByRole('button', { name: 'This week' }).click(); await sleep(600)
  const ft2 = rpcOf(state, 'shared_free_together').at(-1)
  check('This week asks for the next seven days', near(ft2.body.p_from, iso('12:09')) && near(ft2.body.p_to, iso('12:09', DAY + 7)), JSON.stringify(ft2.body))
  await page.getByRole('button', { name: 'Propose' }).first().click(); await sleep(700)
  check('Propose fills in date and time from the window (5:30 PM, two hours)', (await page.locator('#sh-ev-date').inputValue()) === '2026-11-18' && (await page.locator('#sh-ev-start').inputValue()) === '17:30' && (await page.locator('#sh-ev-end').inputValue()) === '19:30')
  const send = page.getByRole('button', { name: 'Send to Reem' })
  check('Send is off until there is a title', await send.isDisabled())
  await page.locator('#sh-ev-title').fill('Dinner at Zitouni'); await sleep(200)
  await shot(page, 'desktop-propose')
  await send.click(); await sleep(800)
  const cr = rpcOf(state, 'shared_event_create')
  check('Send to Reem calls shared_event_create with exactly the title, the time and the circle', cr.length === 1 && cr[0].body.p_title === 'Dinner at Zitouni' && cr[0].body.p_starts_at === iso('17:30') && cr[0].body.p_ends_at === iso('19:30') && cr[0].body.p_circle === CIRCLE && /^[0-9a-f-]{36}$/.test(cr[0].body.p_id), JSON.stringify(cr[0]?.body))
  check('no row is written by the app itself (the server makes both copies)', !state.writes.some((w) => w.table.startsWith('calendar_events')))
  check('…and says it is waiting for an answer', /Sent to Reem\. It stays on both calendars until they answer/.test(await text(page)))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 2. a new shared event from the card; paused; failure; the clock hint ──
{
  const { page, errors, state } = await openPage(browser, { route: '/today' })
  await page.locator('.sh-day').first().getByRole('button', { name: 'New shared event' }).click(); await sleep(700)
  check('New shared event: the same sheet, blank title, the next hour', /New shared event/.test(await text(page)) && (await page.locator('#sh-ev-title').inputValue()) === '' && (await page.locator('#sh-ev-start').inputValue()) === '14:00')
  await page.locator('#sh-ev-title').fill('Date night'); await sleep(100)
  await page.locator('#sh-ev-end').fill('13:00'); await sleep(200)
  check('an end before the start is said, and Send stays off', /It has to end after it starts/.test(await text(page)) && (await page.getByRole('button', { name: 'Send to Reem' }).isDisabled()))
  await page.locator('#sh-ev-end').fill('15:00'); await sleep(200)
  state.answer = { ok: false, error: 'paused' }
  await page.getByRole('button', { name: 'Send to Reem' }).click(); await sleep(700)
  check('a paused connection says so and keeps the sheet', /Reem paused sharing, so nothing can be sent/.test(await text(page)))
  state.answer = null; state.fail = true
  await page.getByRole('button', { name: 'Send to Reem' }).click(); await sleep(700)
  check('a failed send says it needs a connection and keeps what was typed', /Sending needs a connection/.test(await text(page)) && (await page.locator('#sh-ev-title').inputValue()) === 'Date night')
  allErrors.push(...errors)
  await page.context().close()
}
{
  const { page } = await openPage(browser, { route: '/today', extra: { free: { ok: true, zone: 'Africa/Cairo', partner_zone: 'America/New_York', windows: [{ starts_at: iso('17:30'), ends_at: iso('21:00') }] } } })
  await page.locator('.sh-day').first().getByRole('button', { name: 'Free together' }).click(); await sleep(600)
  await page.getByRole('button', { name: 'Propose' }).first().click(); await sleep(600)
  check('her clock is shown when it is an hour or more from mine', /\(Reem 10:30 AM\)/.test(await text(page)), (await text(page)).slice(-160).replace(/\n/g, ' | '))
  await page.context().close()
}
{
  const { page } = await openPage(browser, { route: '/today', connections: [connection({ paused_until: '2026-11-19T06:00:00.000Z' })] })
  check('a paused connection has no Free together button', (await page.getByRole('button', { name: 'Free together' }).count()) === 0)
  await page.context().close()
}
{
  const { page } = await openPage(browser, { route: '/today', extra: { free: { ok: true, zone: 'Africa/Cairo', partner_zone: 'Africa/Cairo', windows: [] } } })
  await page.locator('.sh-day').first().getByRole('button', { name: 'Free together' }).click(); await sleep(600)
  check('no window: says so plainly', /No hour when you are both free today/.test(await text(page)))
  await page.context().close()
}

// ── 3. shared events on the calendar, desktop ──
{
  const { page, errors, state } = await openPage(browser, { route: '/calendar', events: [...EVENTS, ...SHARED] })
  await sleep(800)
  const cls = async (title) => (await page.locator('.fc-event', { hasText: title }).first().getAttribute('class')) ?? ''
  const c1 = await cls('Date night'), c2 = await cls('Walk by the Nile'), c3 = await cls('Lunch with Reem'), c4 = await cls('Cinema')
  check('a shared event both said yes to is a shared block, not dashed', /kf-shared\b/.test(c1) && !/kf-shared-pending/.test(c1), c1)
  check('waiting on Reem: dashed', /kf-shared-pending/.test(c2), c2)
  check('a proposal to me: dashed', /kf-shared-pending/.test(c3), c3)
  check('“can’t go”: shown softer', /kf-shared-declined/.test(c4), c4)
  const face = await page.locator('.fc-event', { hasText: 'Date night' }).first().locator('.sh-face').innerText().catch(() => '')
  check('Reem’s face (her initial) is on it; an ordinary event has none', face === 'R' && (await page.locator('.fc-event', { hasText: 'Dentist' }).first().locator('.sh-face').count()) === 0, face)
  const edge = await page.locator('.fc-event', { hasText: 'Walk by the Nile' }).first().evaluate((e) => getComputedStyle(e).borderTopStyle)
  check('the dashed edge is really dashed', edge === 'dashed', edge)
  await shot(page, 'desktop-calendar-shared')

  await page.locator('.fc-event', { hasText: 'Lunch with Reem' }).first().click(); await sleep(900)
  let menu = (await page.getByRole('menuitem').allInnerTexts()).join(' | ')
  check('a proposal’s menu: who invited me, Accept, Decline; no Private and no Repeat', /Reem invited you/.test(menu) && /Accept/.test(menu) && /Decline/.test(menu) && !/Private/.test(menu) && !/repeat/i.test(menu), menu)
  await shot(page, 'desktop-menu-proposal')
  await page.getByRole('menuitem', { name: 'Accept' }).click(); await sleep(700)
  const ac = rpcOf(state, 'shared_event_respond')
  check('Accept calls shared_event_respond for that event with accept: true', ac.length === 1 && ac[0].body.p_event === eid(13) && ac[0].body.p_accept === true, JSON.stringify(ac[0]?.body))
  check('…and says you are on it with Reem', /You’re on it with Reem/.test(await text(page)))
  await page.locator('.fc-event', { hasText: 'Cinema' }).first().click(); await sleep(700)
  menu = (await page.getByRole('menuitem').allInnerTexts()).join(' | ')
  check('a declined event reads “Reem can’t go”', /Reem can’t go/.test(menu), menu)
  await page.keyboard.press('Escape'); await sleep(400)

  await page.locator('.fc-event', { hasText: 'Lunch with Reem' }).first().click(); await sleep(800)
  const dec = page.getByRole('menuitem', { name: 'Decline' })
  if (await dec.count()) { await dec.click(); await sleep(700) }
  const dc = rpcOf(state, 'shared_event_respond').at(-1)
  check('Decline calls it with accept: false', !!dc && dc.body.p_accept === false && dc.body.p_event === eid(13), JSON.stringify(dc?.body))

  await page.locator('.fc-event', { hasText: 'Date night' }).first().click(); await sleep(900)
  menu = (await page.getByRole('menuitem').allInnerTexts()).join(' | ')
  check('a shared event’s menu: With Reem, Remove from mine, Delete for both; no Private, no Repeat, no plain Delete', /With Reem/.test(menu) && /Remove from mine/.test(menu) && /Delete for both/.test(menu) && !/Private/.test(menu) && !/repeat/i.test(menu) && !/\bDelete\b(?! for both)/.test(menu), menu)
  await shot(page, 'desktop-menu-shared')
  await page.getByRole('menuitem', { name: 'Delete for both' }).click(); await sleep(800)
  const t = await text(page)
  check('Delete for both asks first, and nothing was sent yet', /Delete “Date night” for both\?/.test(t) && /goes from Reem’s calendar too/.test(t) && /Remove from mine instead/.test(t) && rpcOf(state, 'shared_event_delete_both').length === 0)
  await shot(page, 'desktop-delete-both')
  await page.getByRole('button', { name: 'Keep it' }).click(); await sleep(700)
  check('Keep it sends nothing', rpcOf(state, 'shared_event_delete_both').length === 0)
  await page.locator('.fc-event', { hasText: 'Date night' }).first().click(); await sleep(800)
  await page.getByRole('menuitem', { name: 'Delete for both' }).click(); await sleep(700)
  await page.getByRole('button', { name: 'Delete for both' }).click(); await sleep(800)
  const db = rpcOf(state, 'shared_event_delete_both')
  check('confirming calls shared_event_delete_both for my copy, and offers Undo', db.length === 1 && db[0].body.p_event === eid(11) && /Deleted for both · Date night/.test(await text(page)) && (await page.getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(db[0]?.body))
  await page.locator('.fc-event', { hasText: 'Walk by the Nile' }).first().click(); await sleep(800)
  await page.getByRole('menuitem', { name: 'Remove from mine' }).click(); await sleep(800)
  const rm = state.writes.find((w) => w.table.startsWith('calendar_events') && /Walk by the Nile/.test(JSON.stringify(w.body)))
  check('Remove from mine is a plain delete of my own copy through the outbox (deleted_at), not an RPC', !!rm && /"deleted_at":"2026-/.test(JSON.stringify(rm.body)) && rpcOf(state, 'shared_event_delete_both').length === 1, JSON.stringify(rm?.body ?? null).slice(0, 160))
  check('…and says Reem still has it, with an Undo', /Removed from your calendar · Walk by the Nile\. Reem still has it/.test(await text(page)) && (await page.getByRole('button', { name: 'Undo' }).count()) >= 1)
  const before = state.writes.length
  await page.getByRole('button', { name: 'Undo' }).last().click(); await sleep(700)
  const undone = state.writes.slice(before).find((w) => w.table.startsWith('calendar_events') && /Walk by the Nile/.test(JSON.stringify(w.body)))
  check('Undo restores my copy (deleted_at back to null) through the outbox', !!undone && /"deleted_at":null/.test(JSON.stringify(undone.body)), JSON.stringify(undone?.body ?? null).slice(0, 140))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 4. the phone ──
{
  const { page, errors, state } = await openPage(browser, { phone: true, route: '/calendar', events: [...EVENTS, ...SHARED] })
  await sleep(700)
  check('phone day: a shared block carries the face; waiting and proposals are dashed', (await page.locator('.pc-block.is-shared .sh-face').count()) >= 3 && (await page.locator('.pc-block.is-shared-pending').count()) === 2, `shared ${await page.locator('.pc-block.is-shared').count()} pending ${await page.locator('.pc-block.is-shared-pending').count()}`)
  await shot(page, 'phone-calendar-shared')
  await page.locator('.pc-block', { hasText: 'Date night' }).first().click(); await sleep(900)
  const sheet = await text(page)
  check('the event sheet: With Reem, Remove from mine, and the footer is Delete for both', /With Reem/.test(sheet) && /Remove from mine/.test(sheet) && (await page.locator('.pc-bs-delete').innerText().catch(() => '')) === 'Delete for both', await page.locator('.pc-bs-delete').innerText().catch(() => 'none'))
  check('…no Private row and no Repeat row', !/Private/.test(sheet) && !/repeat/i.test(sheet))
  await shot(page, 'phone-event-sheet-shared')
  await page.locator('.pc-bs-delete').click(); await sleep(900)
  check('the footer asks first (no RPC yet)', /for both\?/.test(await text(page)) && rpcOf(state, 'shared_event_delete_both').length === 0)
  await shot(page, 'phone-delete-both')
  allErrors.push(...errors)
  await page.context().close()
  const t2 = await openPage(browser, { phone: true, route: '/today' })
  await t2.page.locator('.sh-day').first().getByRole('button', { name: 'Free together' }).click(); await sleep(800)
  check('phone: the Free together sheet lists the windows', /5:30 – 9:00 PM/.test(await text(t2.page)))
  await shot(t2.page, 'phone-free-together')
  allErrors.push(...t2.errors)
  await t2.page.context().close()
}

// ── 5. Settings: Google, per side ──
{
  const { page, errors, state } = await openPage(browser, { route: '/settings/integrations/google', integrations: [GOOGLE_ROW] })
  await sleep(500)
  const t = await text(page)
  check('Google settings: the shared-events switch sits beside the plan switch, on by default', /Show events I share with someone in Google/.test(t) && (await page.getByRole('switch', { name: 'Show events I share with someone in Google' }).getAttribute('aria-checked')) === 'true')
  await shot(page, 'desktop-settings-google')
  await page.getByRole('switch', { name: 'Show events I share with someone in Google' }).click(); await sleep(600)
  const fn = state.functions.find((f) => f.name === 'google-connect' && f.body?.action === 'share_events')
  check('turning it off tells google-connect, this side only', !!fn && fn.body.on === false, JSON.stringify(fn?.body))
  allErrors.push(...errors)
  await page.context().close()
}

check('no page errors', allErrors.length === 0, allErrors.slice(0, 3).join(' || '))
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
