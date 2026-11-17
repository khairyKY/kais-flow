// v166-share-status (2026-11-18): partner sharing P2 - "Status from the Now card" and "Notices" on the real pages against a MOCKED backend
// (Playwright, Edge/Chromium), desktop 1280x800 and phone 390x844.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5274] [playwright-core index.mjs] [channel=msedge]
// Every Supabase request is answered here (see v166-sharing/verify.mjs): the P2 RPCs (share_notice_settings, share_status_mine, share_status_of,
// share_status_on_set / set / auto / focus, share_notice_pref_set) and the share_notices rows; every write is kept so the checks can say what the app
// SENT. The server's masking, quiet-hours hold and grouping are proved by supabase/tests/share-status.sh; this proves the screens ask and draw.
//
// Checks: the person page (Show my status to Reem, Notices from Reem: every kind Off, the one-line rules) - Today's status line (auto words,
// the sheet: words in a tap, own words, clears, clear it) - her status on the Her day card and the lane chip (and not at Titles, and gone once it
// has run out) - the notices strip (one strip, Dismiss) - nothing at all while the switches are off - no page errors.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5274'
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
  show_lane: true, show_day: true, color: '#8972B3', since: '2026-11-10T08:00:00Z', paused_until: null, paused_by_me: false, ...o,
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

async function openPage(browser, { phone = false, route, connections = [connection()], level = 'details', signedIn = true, extra } = {}) {
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
  const state = { rows: { tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), app_settings: [SETTINGS], projects: [], domains: [], areas: [], inbox_items: [], activity_log: [], share_invites: [], share_links: [], share_notices: structuredClone(extra?.notices ?? []) }, conns: structuredClone(connections), level, writes: [], rpcs: [], view: null, settings: structuredClone(extra?.settings ?? [{ circle_id: CIRCLE, status_on: false, notice_prefs: {} }]), mine: extra?.mine ?? { auto: true, words: null, words_until: null, now: null }, theirStatus: extra?.theirStatus ?? null, ...(extra ?? {}) }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    const json = (body, status = 200, headers = {}) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers }).catch(() => {})
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }).catch(() => {})
    if (p.startsWith('/auth/v1/user')) return json(user)
    if (p.startsWith('/functions/v1/share-view')) return json(state.view?.body ?? { error: 'unauthorized' }, state.view?.status ?? 401, { 'access-control-allow-origin': '*' })
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop()
      let body = {}
      try { body = req.postDataJSON() ?? {} } catch { /* none */ }
      state.rpcs.push({ fn, body })
      if (fn === 'share_connections') return json(state.conns)
      if (fn === 'shared_day') return json(sharedDay(state.conns.find((c) => c.partner_id === body.p_owner)?.paused_until ? null : state.level === 'none' ? null : state.level))
      if (fn === 'share_invite_create') return json({ id: `i${state.rpcs.length}`, code: body.p_relation === 'family' ? 'FAMILY22' : 'K7QMR4TX', relation: body.p_relation, expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      if (fn === 'share_invite_peek') return json(body.p_code === 'K7QMR4TX' ? { ok: true, from_name: 'Reem', relation: 'partner', level: 'details', expires_at: iso('12:09') } : { ok: false, error: 'bad_code' })
      if (fn === 'share_invite_accept') return json({ ok: true, circle_id: CIRCLE })
      if (fn === 'share_notice_settings') return json(state.settings)
      if (fn === 'share_status_mine') return json(state.mine)
      if (fn === 'share_status_of') return json(state.theirStatus)
      if (fn === 'share_status_on_set') { state.settings = state.settings.map((s) => (s.circle_id === body.p_circle ? { ...s, status_on: body.p_on } : s)); return json(null, 204) }
      if (fn === 'share_notice_pref_set') { state.settings = state.settings.map((s) => (s.circle_id === body.p_circle ? { ...s, notice_prefs: body.p_mode === 'off' ? {} : { ...s.notice_prefs, [body.p_kind]: body.p_mode } } : s)); return json(null, 204) }
      if (fn === 'share_status_set') { state.mine = { ...state.mine, words: body.p_words, words_until: body.p_words ? iso('22:30') : null, now: body.p_words ? { words: body.p_words, source: 'words', until: iso('22:30') } : state.mine.now }; return json(null, 204) }
      if (fn === 'share_status_auto') { state.mine = { ...state.mine, auto: body.p_on }; return json(null, 204) }
      return json(null)
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table: p.replace('/rest/v1/', ''), query: url.search, body })
      if (req.method() === 'DELETE' && p.endsWith('/circles')) state.conns = []
      if (req.method() === 'PATCH' && p.endsWith('/share_notices')) state.rows.share_notices = []
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


const ON = [{ circle_id: CIRCLE, status_on: true, notice_prefs: {} }]
const LIVE = { words: 'Focusing until 3:30', source: 'auto', until: iso('15:30') }
const notice = (n, o = {}) => ({ id: `b000000${n}-0000-4000-8000-000000000001`, circle_id: CIRCLE, actor_id: PARTNER, kind: 'added', payload: { verb: 'added', what: 'Dinner', at: iso('20:00', 20) }, n: 1, release_at: iso('08:00'), ...o })
const flat = async (page) => (await text(page)).replace(/\n/g, ' ')

// ── 1. the person page: Show my status, Notices from Reem ──
{
  const { page, errors, state } = await openPage(browser, { route: '/settings/sharing' })
  await page.getByText('Reem', { exact: true }).first().click()
  await sleep(900)
  let t = await text(page)
  check('the person page has Show my status to Reem, Off, with the one-line rule', /Show my status to Reem/.test(t) && /Off\. Reem sees no status\./.test(t) && /No location, ever/.test(t) && /Shown only at Details/.test(t))
  check('Notices from Reem: one kind to start, every kind Off, and what a notice never does', /Notices from Reem/.test(t) && /Reem adds something to the calendar/.test(t) && /private item never notifies/.test(t))
  const pressed = await page.locator('.kf-seg-btn[aria-pressed="true"]').allInnerTexts()
  check('the kind’s segment sits on Off', pressed.includes('Off'), pressed.join(','))
  await shot(page, 'desktop-person-status')
  await page.getByRole('switch', { name: /Show my status to Reem/ }).click(); await sleep(500)
  check('the switch calls share_status_on_set for this circle', state.rpcs.some((r) => r.fn === 'share_status_on_set' && r.body.p_circle === CIRCLE && r.body.p_on === true), JSON.stringify(state.rpcs.filter((r) => r.fn === 'share_status_on_set')))
  check('…and reads On at once', /On\. Reem sees it next to your name\./.test(await text(page)))
  await page.getByRole('button', { name: 'Push', exact: true }).first().click(); await sleep(500)
  check('Push on a kind calls share_notice_pref_set added/push', state.rpcs.some((r) => r.fn === 'share_notice_pref_set' && r.body.p_kind === 'added' && r.body.p_mode === 'push' && r.body.p_circle === CIRCLE))
  await page.getByRole('button', { name: 'Off', exact: true }).first().click(); await sleep(400)
  check('Off sends off (the server drops the key)', state.rpcs.some((r) => r.fn === 'share_notice_pref_set' && r.body.p_mode === 'off'))
  await shot(page, 'desktop-person-notices')
  allErrors.push(...errors)
  await page.context().close()
}

// ── 2. Today: nothing while the switches are off ──
{
  const { page, errors } = await openPage(browser, { route: '/today' })
  const t = await text(page)
  check('status off, no notices: Today shows no status line and no strip', !/sees\s+.*Focusing/.test(t) && !/From Reem/.test(t) && (await page.locator('.sh-status, .sh-strip').count()) === 0)
  allErrors.push(...errors)
  await page.context().close()
}

// ── 3. Today (desktop): the status line and its sheet ──
{
  const { page, errors, state } = await openPage(browser, { route: '/today', extra: { settings: ON, mine: { auto: true, words: null, words_until: null, now: LIVE } } })
  let t = await flat(page)
  check('the status line says what Reem sees, and that it is auto', /Reem sees\s+Focusing until 3:30\s*· auto/.test(t), t.slice(0, 120))
  await shot(page, 'desktop-today-status')
  await page.locator('.sh-status').first().click(); await sleep(700)
  t = await text(page)
  check('the sheet: From the Now card with its words, words in a tap, own words, Clears, never a place', /Your status/.test(t) && /Right now: Focusing until 3:30/.test(t) && /Commuting/.test(t) && /At the gym/.test(t) && /In class/.test(t) && /Tonight/.test(t) && /In an hour/.test(t) && /When I clear it/.test(t) && /No location, ever/.test(t) && (await page.locator('input[aria-label="Write your own status"]').count()) === 1)
  await shot(page, 'desktop-status-sheet')
  await page.getByRole('button', { name: 'Commuting', exact: true }).click(); await sleep(600)
  const set = state.rpcs.find((r) => r.fn === 'share_status_set')
  check('a word in a tap sets it, clearing tonight by default', set && set.body.p_words === 'Commuting' && set.body.p_clear === 'tonight', JSON.stringify(set?.body))
  await page.getByRole('button', { name: 'In an hour', exact: true }).click(); await sleep(300)
  await page.locator('input[aria-label="Write your own status"]').fill('Back at 4'); await page.getByRole('button', { name: 'Set', exact: true }).click(); await sleep(600)
  const own = state.rpcs.filter((r) => r.fn === 'share_status_set').pop()
  check('own words go with the chosen clear time', own.body.p_words === 'Back at 4' && own.body.p_clear === 'hour', JSON.stringify(own.body))
  t = await text(page)
  check('the sheet says when they clear, and offers Clear it', /Clears/.test(t) && /Clear it/.test(t))
  await page.getByRole('button', { name: 'Clear it', exact: true }).click(); await sleep(500)
  check('Clear it sends no words', state.rpcs.filter((r) => r.fn === 'share_status_set').pop().body.p_words === null)
  await page.getByRole('switch', { name: 'From the Now card' }).click(); await sleep(400)
  check('the From the Now card switch calls share_status_auto', state.rpcs.some((r) => r.fn === 'share_status_auto' && r.body.p_on === false))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 4. Today (phone) ──
{
  const { page, errors } = await openPage(browser, { phone: true, route: '/today', extra: { settings: ON, mine: { auto: true, words: null, words_until: null, now: LIVE } } })
  check('phone: the same status line under the Now card', /Reem sees\s+Focusing until 3:30/.test(await flat(page)))
  await shot(page, 'phone-today-status')
  allErrors.push(...errors)
  await page.context().close()
}

// ── 5. her status: the Her day card and the lane chip ──
{
  const { page, errors } = await openPage(browser, { route: '/today', extra: { theirStatus: { words: 'At the gym', source: 'auto', until: iso('13:00') } } })
  const t = await flat(page)
  check('Her day card: the status sits next to her name', /Reem\s*·\s*At the gym/.test(t))
  await shot(page, 'desktop-today-her-status')
  allErrors.push(...errors)
  await page.context().close()
  const cal = await openPage(browser, { route: '/calendar', extra: { theirStatus: { words: 'In class', source: 'words', until: iso('13:00') } } })
  check('the lane chip carries it too', /Reem\s*·\s*In class/.test(await flat(cal.page)))
  await shot(cal.page, 'desktop-calendar-her-status')
  allErrors.push(...cal.errors)
  await cal.page.context().close()
  const low = await openPage(browser, { route: '/today', level: 'titles', extra: { theirStatus: null }, connections: [connection({ their_level: 'titles', level: 'titles' })] })
  check('at Titles the server answers no status, and nothing says "hidden"', !/At the gym/.test(await text(low.page)) && !/hidden/i.test(await text(low.page)) && !low.state.rpcs.some((r) => r.fn === 'share_status_of'))
  allErrors.push(...low.errors)
  await low.page.context().close()
  const old = await openPage(browser, { route: '/today', extra: { theirStatus: { words: 'At the gym', source: 'auto', until: iso('12:00') } } })
  check('a status past its end time is simply gone', !/At the gym/.test(await text(old.page)))
  allErrors.push(...old.errors)
  await old.page.context().close()
}

// ── 6. the notices strip ──
{
  const { page, errors, state } = await openPage(browser, { route: '/today', extra: { notices: [notice(1), notice(2, { payload: { verb: 'invited you to', what: 'Date night', at: iso('14:00', 21) } }), notice(3, { n: 3, payload: { verb: 'added', what: 'Gym', at: iso('18:00') } })] } })
  const t = await flat(page)
  check('one strip, from Reem, one line each in her words', (await page.locator('.sh-strip').count()) === 1 && /From Reem/.test(t) && /Added Dinner, Fri 8 PM/.test(t) && /Invited you to Date night, Sat 2 PM/.test(t) && /Added 3 things/.test(t), t.slice(t.indexOf('From Reem'), t.indexOf('From Reem') + 160))
  await shot(page, 'desktop-today-strip')
  await page.locator('.sh-strip').getByRole('button', { name: 'Dismiss' }).click(); await sleep(600)
  const w = state.writes.find((x) => x.table === 'share_notices' && x.method === 'PATCH')
  check('Dismiss writes dismissed_at for what was shown, and the strip is gone', w && /dismissed_at/.test(JSON.stringify(w.body)) && (await page.locator('.sh-strip').count()) === 0, JSON.stringify(w))
  allErrors.push(...errors)
  await page.context().close()
  const ph = await openPage(browser, { phone: true, route: '/today', extra: { notices: [notice(1)] } })
  const pt = await flat(ph.page)
  check('phone: the strip is there too', /From Reem/.test(pt) && /Added Dinner, Fri 8 PM/.test(pt))
  await shot(ph.page, 'phone-today-strip')
  allErrors.push(...ph.errors)
  await ph.page.context().close()
}

check('no page errors', allErrors.length === 0, allErrors.slice(0, 3).join(' || '))
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
