// v166-sharing (2026-11-17, updated 2026-11-18 for v165-sharing-tweaks: two switches, her colour, pause with no end): partner sharing P1 on the real pages against a MOCKED backend (Playwright, Edge/Chromium), desktop 1280x800 and phone 390x844.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5271] [playwright-core index.mjs] [channel=msedge]
// The dev server runs in mock mode (app/.env.mock.local: VITE_SUPABASE_URL=http://127.0.0.1:9). Every Supabase request is answered here:
// REST rows, the sharing RPCs (share_connections, shared_day, share_invite_create / peek / accept) and the `share-view` function, and every
// write is kept so the checks can say what the app SENT: the level (an outbox upsert of the owner's own grant), a pause, a disconnect,
// the lane switch, the Private flag. The server's masking itself is proved by supabase/tests/sharing.sh; this proves the screens ask for it and draw it.
//
// Checks: Settings > Sharing (the person, Invite someone, Enter a code, View links, Never shared) · the invite sheet (8 tiles, the message with
// code AND link, a new relation = a new code) · enter a code > confirm > Connect · a person's page (the level list with previews, the rule
// line, the lower level, pause chips (until I turn it back on / an hour, never "today"), her lane and her Today card as TWO switches that each
// move only their own surface, her colour (16 swatches, per viewer, drawn on the lane, the card and the avatar), Disconnect asks once) · Her day on Today at Details / Titles / Busy · the lane on
// the desktop week and the phone day · the lane chip · the Private switch in an event's menu and on a task · the view link's page (and "turned
// off") · /join/<code> signed out and signed in · no page errors.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5278'
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
  const state = { rows: { tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), app_settings: [SETTINGS], projects: [], domains: [], areas: [], inbox_items: [], activity_log: [], share_invites: [], share_links: [] }, conns: structuredClone(connections), level, writes: [], rpcs: [], view: null, ...(extra ?? {}) }
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

// ── 1. Settings > Sharing, desktop ──
{
  const { page, errors, state } = await openPage(browser, { route: '/settings/sharing' })
  let t = await text(page)
  check('Settings has a Sharing page with the person, Partner, both ways', /Reem/.test(t) && /Partner · Details both ways/.test(t), t.slice(0, 160).replace(/\n/g, ' | '))
  check('Invite someone, Enter a code, View links, Never shared are there', /Invite someone/.test(t) && /Enter a code/.test(t) && /View links/.test(t) && /Never shared:/.test(t))
  await shot(page, 'desktop-settings-sharing')

  // invite sheet
  await click(page, 'Invite someone')
  t = await text(page)
  const tiles = await page.locator('.sh-tile').allInnerTexts()
  check('the invite sheet shows the code in 8 tiles, Partner picked', tiles.join('') === 'K7QMR4TX' && /Partner starts at Details/.test(t), tiles.join(''))
  check('the message carries the code AND the tap link, and says where to type it', /K7QM-R4TX/.test(t) && /\/join\/K7QMR4TX/.test(t) && /Settings → Sharing → Enter a code/.test(t))
  check('the code is already there: made on open, one create call', state.rpcs.filter((r) => r.fn === 'share_invite_create').length === 1)
  await shot(page, 'desktop-invite-sheet')
  await click(page, 'Share…')
  const sent = await page.evaluate(() => window.__sent)
  check('Share… hands the message to the share sheet', sent.length === 1 && /K7QM-R4TX/.test(sent[0].text), JSON.stringify(sent).slice(0, 120))
  await click(page, 'Family', { exact: true })
  await sleep(500)
  const tiles2 = (await page.locator('.sh-tile').allInnerTexts()).join('')
  check('another relationship is a new code (the old one cancelled)', tiles2 === 'FAMILY22' && state.writes.some((w) => w.table === 'share_invites' && w.method === 'PATCH'), tiles2)
  await page.keyboard.press('Escape'); await sleep(600)

  // enter a code
  await click(page, 'Enter a code')
  await page.locator('input[aria-label="Invite code"]').fill('k7qm-r4tx')
  await sleep(200)
  const typed = (await page.locator('.sh-tile').allInnerTexts()).join('')
  check('typing a code (any case, a dash) fills the tiles', typed === 'K7QMR4TX', typed)
  await click(page, 'Continue')
  t = await text(page)
  check('the confirm step: who invited, what each of you sees, the rule, never shared', /Connect with Reem/.test(t) && /invited you as their partner/.test(t) && /You see what you show/.test(t) && /Never shared:/.test(t))
  await shot(page, 'desktop-confirm')
  await click(page, 'Connect with Reem')
  check('Connect accepts the code', state.rpcs.some((r) => r.fn === 'share_invite_accept' && r.body.p_code === 'K7QMR4TX'))
  await sleep(600)
  await page.keyboard.press('Escape'); await sleep(500)
  // a wrong code reads like any bad code
  await click(page, 'Enter a code')
  await page.locator('input[aria-label="Invite code"]').fill('ZZZZ2222')
  await click(page, 'Continue')
  t = await text(page)
  check('a bad code: the one plain sentence', /That code doesn’t work\. It may be used or out of date\./.test(t))
  await page.keyboard.press('Escape'); await sleep(500)
  allErrors.push(...errors)
  await page.context().close()
}

// ── 2. a person's page: levels, rule, pause, lane switch, disconnect ──
{
  const { page, errors, state } = await openPage(browser, { route: '/settings/sharing', connections: [connection({ their_level: 'busy', level: 'busy' })] })
  await page.getByText('Reem', { exact: true }).first().click()
  await sleep(800)
  let t = await text(page)
  check('the person page: relationship, levels with previews, the rule at work', /Relationship/.test(t) && /What Reem sees of you/.test(t) && /You show Details · Reem shows Busy only/.test(t) && /you both see Busy only/.test(t))
  check('…and says the other side limits it', /Reem shows Busy only/.test(t) && /You can still show more/.test(t))
  const radios = await page.locator('.sh-level').count()
  check('three levels, each a radio with a preview', radios === 3 && (await page.locator('.sh-level .sh-mini').count()) === 3)
  await shot(page, 'desktop-person')
  await page.getByRole('radio', { name: /^Titles/ }).click(); await sleep(600)
  const lw = state.writes.find((w) => w.table === 'share_grants')
  check('picking a level writes my own grant through the outbox (an upsert with the owner)', lw && /"level":"titles"/.test(JSON.stringify(lw.body)) && JSON.stringify(lw.body).includes(UID), JSON.stringify(lw?.body))
  t = await text(page)
  check('the rule line follows at once', /You show Titles · Reem shows Busy only/.test(t))
  t = await text(page)
  check('Pause is offered as "until I turn it back on" first, an hour second, and nothing says "today"', /Pause until I turn it back on/.test(t) && /Pause for an hour/.test(t) && t.indexOf('Pause until I turn it back on') < t.indexOf('Pause for an hour') && !/for today/i.test(t), t.match(/Pause[^\n]*/g)?.join(' | '))
  await click(page, 'Pause until I turn it back on')
  const pw = state.writes.find((w) => w.table === 'circles' && w.method === 'PATCH')
  check('Pause until I turn it back on has NO end: paused_until is infinity', pw && /"paused_until":"infinity"/.test(JSON.stringify(pw.body)), JSON.stringify(pw?.body))
  t = await text(page)
  check('the page says it is paused with no end and offers Resume', /Paused/.test(t) && /Until turned back on/.test(t) && !/Back tomorrow/.test(t) && /Resume/.test(t))
  await shot(page, 'desktop-person-paused')
  await click(page, 'Resume')
  check('Resume clears it', state.writes.filter((w) => w.table === 'circles' && w.method === 'PATCH').some((w) => /"paused_until":null/.test(JSON.stringify(w.body))))
  await click(page, 'Pause for an hour')
  const hw = state.writes.filter((w) => w.table === 'circles' && w.method === 'PATCH').at(-1)
  check('Pause for an hour (the timed one) still ends: an hour from now, not infinity', hw && /"paused_until":"2026-11-18T11:0\d:\d\d\.\d{3}Z"/.test(JSON.stringify(hw.body)), JSON.stringify(hw?.body))
  await click(page, 'Resume')
  // two switches: each writes only its own column
  const before = state.writes.length
  await page.getByRole('switch', { name: /Show Reem’s lane on my calendar/ }).click(); await sleep(400)
  const w1 = state.writes.slice(before).filter((w) => w.table === 'circle_members')
  check('"Show her lane on my calendar" writes show_lane ONLY', w1.length === 1 && /"show_lane":false/.test(JSON.stringify(w1[0].body)) && !/show_day|color/.test(JSON.stringify(w1[0].body)), JSON.stringify(w1.map((w) => w.body)))
  check('…and the other switch stays on', (await page.getByRole('switch', { name: /Show Reem’s day on Today/ }).getAttribute('aria-checked')) === 'true')
  const before2 = state.writes.length
  await page.getByRole('switch', { name: /Show Reem’s day on Today/ }).click(); await sleep(400)
  const w2 = state.writes.slice(before2).filter((w) => w.table === 'circle_members')
  check('"Show her day on Today" writes show_day ONLY', w2.length === 1 && /"show_day":false/.test(JSON.stringify(w2[0].body)) && !/show_lane|color/.test(JSON.stringify(w2[0].body)), JSON.stringify(w2.map((w) => w.body)))
  // her colour: 16 swatches, a pick writes color only, to my own member row
  const sw = page.getByRole('group', { name: /Reem’s colour/ })
  check('her colour: palette C\'s 16 swatches, Heather ticked', (await sw.getByRole('button').count()) === 16 && (await sw.getByRole('button', { name: 'Heather' }).getAttribute('aria-pressed')) === 'true')
  await sw.getByRole('button', { name: 'Rose' }).click(); await sleep(400)
  const w3 = state.writes.filter((w) => w.table === 'circle_members' && /color/.test(JSON.stringify(w.body)))
  check('picking Rose writes color #E58F99 ONLY, to member rows of this circle (RLS keeps it to mine)', w3.length === 1 && /"color":"#E58F99"/.test(JSON.stringify(w3[0].body)) && !/show_/.test(JSON.stringify(w3[0].body)) && /circle_id=eq\./.test(w3[0].query), JSON.stringify(w3.map((w) => [w.query, w.body])))
  check('…Rose is now the ticked one, and the avatar draws in it', (await sw.getByRole('button', { name: 'Rose' }).getAttribute('aria-pressed')) === 'true' && (await page.locator('.sh-head .sh-av').first().evaluate((e) => e.style.getPropertyValue('--her'))) === 'var(--blk-rose)')
  await shot(page, 'desktop-person-colour')
  await page.getByRole('button', { name: /Disconnect from Reem/ }).first().click(); await sleep(600)
  t = await text(page)
  check('Disconnect asks once, in plain words', /Disconnect from Reem\?/.test(t) && /Nothing is kept/.test(t))
  await shot(page, 'desktop-disconnect')
  check('nothing was deleted before the confirm', !state.writes.some((w) => w.method === 'DELETE'))
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click(); await sleep(800)
  check('the confirm deletes the circle (both sides, nothing kept)', state.writes.some((w) => w.method === 'DELETE' && w.table.startsWith('circles')))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 3. Her day on Today at each level ──
for (const level of ['details', 'titles', 'busy']) {
  const { page, errors, state: cstate } = await openPage(browser, { route: '/today', level, connections: [connection({ level, their_level: level })] })
  const card = page.locator('.sh-day').first()
  const t = await card.innerText().catch(() => '')
  check(`[${level}] Her day card is on Today with the level named`, new RegExp(`Reem’s day`).test(t) && new RegExp(level === 'busy' ? 'Busy only' : level === 'titles' ? 'Titles' : 'Details').test(t), t.replace(/\n/g, ' | ').slice(0, 140))
  check(`[${level}] Now and Next`, /Now/.test(t) && /Histology lab|Busy/.test(t))
  if (level === 'details') {
    check('[details] her Top 3 with the goal, a done one, and today’s tasks with notes', /Top 3 · 1 of 2 done/.test(t) && /Finish the pharmacology summary/.test(t) && /chapters 4 to 6/.test(t) && /Buy a birthday card/.test(t))
    await shot(page, 'desktop-today-details')
    await page.getByRole('button', { name: /Pause sharing with Reem/ }).click(); await sleep(300)
    const ct = await card.innerText()
    check('her card’s pause menu: until I turn it back on first, an hour second, no "today"', /Pause until I turn it back on/.test(ct) && /Pause for an hour/.test(ct) && ct.indexOf('Pause until I turn it back on') < ct.indexOf('Pause for an hour') && !/for today/i.test(ct), ct.match(/Pause[^\n]*/g)?.join(' | '))
    await page.getByRole('button', { name: 'Pause until I turn it back on' }).click(); await sleep(500)
    check('...picking it from the card writes infinity', cstate.writes.some((w) => w.table === 'circles' && /"paused_until":"infinity"/.test(JSON.stringify(w.body))))
  } else {
    check(`[${level}] no Top 3 and no tasks`, !/Top 3|birthday card|pharmacology summary/.test(t))
  }
  if (level === 'busy') check('[busy] every block reads Busy: no title anywhere', !/Study|Histology|Coffee/.test(t) && (await card.locator('.sh-blk.is-busy').count()) >= 1)
  allErrors.push(...errors)
  await page.context().close()
}
{
  const { page } = await openPage(browser, { route: '/today', connections: [connection({ paused_until: '2026-11-19T06:00:00.000Z' })] })
  const t = await page.locator('.sh-day').first().innerText().catch(() => '')
  check('a timed pause is one quiet line: who, paused, when she is back', /paused/.test(t) && /Back tomorrow at 8:00 AM/.test(t) && !/Histology/.test(t), t.replace(/\n/g, ' | '))
  await page.context().close()
  const inf = await openPage(browser, { route: '/today', connections: [connection({ paused_until: 'infinity' })] })
  const ti = await inf.page.locator('.sh-day').first().innerText().catch(() => '')
  check('a pause with no end says so: paused, until turned back on, never a time', /paused/.test(ti) && /Until turned back on/.test(ti) && !/Back /.test(ti) && !/Histology/.test(ti), ti.replace(/\n/g, ' | '))
  await inf.page.context().close()
}
{
  // each switch decides only its own surface
  const a = await openPage(browser, { route: '/today', connections: [connection({ show_day: false })] })
  check('Today card OFF (lane on): no Her day card on Today', (await a.page.locator('.sh-day').count()) === 0)
  await a.page.context().close()
  const a2 = await openPage(browser, { route: '/calendar', connections: [connection({ show_day: false })] })
  await sleep(600)
  check('...but her lane is still on the calendar (the lane switch is its own)', (await a2.page.locator('.fc-bg-event.kf-her').count()) >= 3)
  await a2.page.context().close()
  const b = await openPage(browser, { route: '/calendar', connections: [connection({ show_lane: false })] })
  await sleep(600)
  check('Lane OFF (card on): no lane on the calendar', (await b.page.locator('.fc-bg-event.kf-her').count()) === 0)
  await b.page.context().close()
  const b2 = await openPage(browser, { route: '/today', connections: [connection({ show_lane: false })] })
  check('...but her card is still on Today (the Today switch is its own)', (await b2.page.locator('.sh-day').count()) === 1)
  await b2.page.context().close()
  const c = await openPage(browser, { phone: true, route: '/calendar', connections: [connection({ show_lane: false })] })
  await sleep(600)
  check('phone: lane OFF means no lane bar on the day either', (await c.page.locator('.pc-lane').count()) === 0)
  await c.page.context().close()
  // Family / Friend arrive with both off (the server's default): neither surface shows her
  const fam = await openPage(browser, { route: '/today', connections: [connection({ relation: 'family', show_lane: false, show_day: false })] })
  check('a Family connection with both switches off: no card', (await fam.page.locator('.sh-day').count()) === 0)
  await fam.page.context().close()
  const fam2 = await openPage(browser, { route: '/today', connections: [connection({ relation: 'family', show_lane: false, show_day: true })] })
  check('...and switching only the Today card on shows the card, lane still off', (await fam2.page.locator('.sh-day').count()) === 1)
  await fam2.page.context().close()
}
{
  // her colour, per connection, drawn on the card, the lane (desktop and phone) and the avatar; Heather until picked
  const her = (page, sel) => page.locator(sel).first().evaluate((e) => e.style.getPropertyValue('--her') || getComputedStyle(e).getPropertyValue('--her'))
  const d = await openPage(browser, { route: '/today' })
  check('default colour: the card draws in Heather', (await her(d.page, '.sh-day')) === 'var(--blk-heather)')
  const heatherBlock = await d.page.locator('.sh-blk').first().evaluate((e) => getComputedStyle(e).borderTopColor)
  await d.page.context().close()
  const r = await openPage(browser, { route: '/today', connections: [connection({ color: '#E58F99' })] })
  check('picked Rose: the card carries Rose (--her = the Rose token)', (await her(r.page, '.sh-day')) === 'var(--blk-rose)')
  const roseBlock = await r.page.locator('.sh-blk').first().evaluate((e) => getComputedStyle(e).borderTopColor)
  check('…and the block edge really is a different colour from Heather', roseBlock !== heatherBlock, heatherBlock + ' -> ' + roseBlock)
  await shot(r.page, 'desktop-today-rose')
  await r.page.context().close()
  const l = await openPage(browser, { route: '/calendar', connections: [connection({ color: '#4A9266' })] })
  await sleep(600)
  check('desktop lane in the picked colour (Pine)', (await her(l.page, '.fc-bg-event.kf-her')) === 'var(--blk-pine)')
  check('…and the lane chip avatar too', (await her(l.page, '.sh-chip .sh-av')) === 'var(--blk-pine)')
  const laneBg = await l.page.locator('.fc-bg-event.kf-her:not(.is-busy)').first().evaluate((e) => getComputedStyle(e).backgroundColor)
  check('...and its drawn colour is not Heather’s', laneBg !== 'rgb(137, 114, 179)' && laneBg !== '', laneBg)
  await shot(l.page, 'desktop-calendar-lane-pine')
  await l.page.context().close()
  const p = await openPage(browser, { phone: true, route: '/calendar', connections: [connection({ color: '#4A9266' })] })
  await sleep(600)
  check('phone lane in the picked colour too', (await her(p.page, '.pc-lane')) === 'var(--blk-pine)')
  await shot(p.page, 'phone-calendar-lane-pine')
  await p.page.context().close()
}
{
  const { page } = await openPage(browser, { route: '/today', connections: [] })
  check('no connection: no card', (await page.locator('.sh-day').count()) === 0)
  await page.context().close()
}

// ── 4. the lane on the desktop week, the chip, the Private switch ──
{
  const { page, errors, state } = await openPage(browser, { route: '/calendar' })
  await sleep(800)
  const lane = await page.locator('.fc-bg-event.kf-her').count()
  check('desktop week: her blocks are a thin lane behind yours', lane >= 3 && (await page.locator('.kf-has-her').count()) === 1, `lane blocks ${lane}`)
  const w = await page.locator('.fc-bg-event.kf-her').first().evaluate((e) => ({ w: Math.round(e.getBoundingClientRect().width), title: e.title }))
  check('…9px wide, hover says her title and time', w.w === 9 && /Reem · /.test(w.title), JSON.stringify(w))
  check('a Busy block of hers is hatched', (await page.locator('.fc-bg-event.kf-her.is-busy').count()) >= 1)
  await shot(page, 'desktop-calendar-lane')
  const chip = page.getByRole('button', { name: /Hide Reem’s lane on my calendar/ })
  check('the avatar chip is the lane switch, on for a Partner', (await chip.getAttribute('aria-pressed')) === 'true')
  // the lane's menu: pause offered there too, with no automatic end first
  await chip.click({ button: 'right' }); await sleep(500)
  const items = await page.getByRole('menuitem').allInnerTexts()
  check('the lane menu offers Pause until I turn it back on, then an hour, and no "today"', items.includes('Pause until I turn it back on') && items.includes('Pause for an hour') && !items.some((x) => /today/i.test(x)) && items.indexOf('Pause until I turn it back on') < items.indexOf('Pause for an hour'), items.join(' | '))
  await page.getByRole('menuitem', { name: 'Pause until I turn it back on' }).click(); await sleep(500)
  check('...and it writes infinity (no end)', state.writes.some((w2) => w2.table === 'circles' && /"paused_until":"infinity"/.test(JSON.stringify(w2.body))))
  await chip.click({ button: 'right' }); await sleep(400)
  check('while paused the menu says Resume instead', (await page.getByRole('menuitem', { name: 'Resume sharing' }).count()) === 1)
  await page.keyboard.press('Escape'); await sleep(300)
  await chip.click(); await sleep(600)
  check('a tap turns the lane off (my member row, show_lane only)', state.writes.some((w2) => w2.table === 'circle_members' && /"show_lane":false/.test(JSON.stringify(w2.body)) && !/show_day/.test(JSON.stringify(w2.body))))
  // Private switch in an event's menu
  await page.locator('.fc-event', { hasText: 'Dentist' }).first().click(); await sleep(900)
  const priv = page.getByRole('menuitem', { name: /Private/ }).first()
  check('an event’s details have a Private switch', (await priv.count()) > 0)
  if (await priv.count()) {
    await shot(page, 'desktop-event-private')
    await priv.click(); await sleep(600)
    const pw2 = state.writes.find((w2) => w2.table === 'calendar_events' && /"private":true/.test(JSON.stringify(w2.body)))
    check('turning it on writes private: true on that event', !!pw2, JSON.stringify(pw2?.body ?? null).slice(0, 120))
  }
  allErrors.push(...errors)
  await page.context().close()
}

// ── 5. the phone ──
{
  const { page, errors, state } = await openPage(browser, { phone: true, route: '/calendar' })
  await sleep(600)
  const lane = await page.locator('.pc-lane').count()
  check('phone day: her lane is a thin bar at the column’s edge (Heather until picked)', lane >= 3, `lane blocks ${lane}`)
  await shot(page, 'phone-calendar-lane')
  await page.locator('.pc-lane').first().click(); await sleep(400)
  const toast = await text(page)
  check('a tap on it says her title and time', /Reem · .* · \d+:\d\d/.test(toast))
  allErrors.push(...errors)
  await page.context().close()
  const t2 = await openPage(browser, { phone: true, route: '/today' })
  check('phone Today: her day card after Top 3', (await t2.page.locator('.sh-day').count()) === 1)
  await shot(t2.page, 'phone-today')
  allErrors.push(...t2.errors)
  await t2.page.context().close()
  const s = await openPage(browser, { phone: true, route: '/settings' })
  const st = await text(s.page)
  check('phone Settings list has Sharing', /Sharing/.test(st))
  await s.page.context().close()
  void state
}

// ── 6. a task's Private chip ──
{
  const { page, state } = await openPage(browser, { route: '/tasks' })
  await sleep(400)
  await page.getByText('Buy stamps').first().click(); await sleep(900)
  const chip = page.getByRole('button', { name: 'Private' }).first()
  check('a task has a Private chip', (await chip.count()) > 0)
  if (await chip.count()) {
    await chip.click(); await sleep(600)
    check('turning it on writes private: true on the task', state.writes.some((w) => w.table === 'tasks' && /"private":true/.test(JSON.stringify(w.body))))
  }
  await page.context().close()
}

// ── 7. the view link page, signed out ──
const TOKEN = 'kf_v_' + 'A'.repeat(43)
{
  const view = { status: 200, body: { name: 'Kai', zone: 'Africa/Cairo', level: 'busy', updated_at: iso('12:09'), expires_at: iso('12:09', 30), days: Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${18 + i}`, blocks: i === 0 ? [{ starts_at: iso('09:00'), ends_at: iso('10:00'), all_day: false }, { starts_at: iso('13:00'), ends_at: iso('14:00'), all_day: false, title: 'Dentist' }] : [] })) } }
  const { page, errors } = await openPage(browser, { route: `/v/${TOKEN}`, signedIn: false, extra: { view } })
  const t = await text(page)
  check('the view link page: whose day, which day, times in the owner’s zone', /Kai’s day/.test(t) && /Wed, Nov 18/.test(t) && /Cairo/.test(t))
  check('a block with no title is Busy, one with a title shows it, read-only', /Busy/.test(t) && /Dentist/.test(t) && /Read-only/.test(t))
  await shot(page, 'view-link')
  await click(page, 'Next day')
  check('day arrows step through the 8 days', /Thu, Nov 19/.test(await text(page)) && /Nothing planned/.test(await text(page)))
  allErrors.push(...errors)
  await page.context().close()
  const gone = await openPage(browser, { route: `/v/${TOKEN}`, signedIn: false, extra: { view: { status: 410, body: { error: 'gone', reason: 'revoked' } } } })
  check('a stopped link is one plain page', /This link is turned off/.test(await text(gone.page)))
  await shot(gone.page, 'view-link-off')
  await gone.page.context().close()
}

// ── 8. /join/<code> ──
{
  const out = await openPage(browser, { route: '/join/K7QMR4TX', signedIn: false })
  const t = await text(out.page)
  check('signed out: the invite page names the code and keeps it', /invited to share days/.test(t) && /K7QM–R4TX/.test(t) && (await out.page.evaluate(() => localStorage.getItem('kf-join-code'))) === 'K7QMR4TX')
  await shot(out.page, 'join-signed-out')
  await out.page.context().close()
  const inn = await openPage(browser, { route: '/join/K7QMR4TX', connections: [] })
  const t2 = await text(inn.page)
  check('signed in: straight to the confirm step (the link’s code is already in)', /Connect with Reem/.test(t2) && /invited you as their partner/.test(t2))
  check('…the code is used up from the stash', (await inn.page.evaluate(() => localStorage.getItem('kf-join-code'))) === null)
  await shot(inn.page, 'join-signed-in')
  allErrors.push(...inn.errors)
  await inn.page.context().close()
}

check('no page errors', allErrors.length === 0, allErrors.slice(0, 3).join(' || '))
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
process.exit(failed.length ? 1 : 0)
