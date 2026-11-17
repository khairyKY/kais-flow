// v166-share-widget (2026-11-18): partner sharing P2 flow 6, the "Her day" widgets, on the real pages against a MOCKED backend (Playwright, Edge/Chromium).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5275] [playwright-core index.mjs] [channel=msedge]
// The dev server runs in mock mode (app/.env.mock.local: VITE_SUPABASE_URL=http://127.0.0.1:9). Every Supabase request is answered here and every
// write is kept, so the checks say what the app SENT. The server's masking and the key's rules are proved by supabase/tests/share-widget.sh
// (Rehearsal); the Android widget's logic by Java (HerDayPlanTest) and its drawing by the android.yml build; the Rainmeter skin by
// desktop/rainmeter/tools/check-herday.mjs. This proves the screens and the snapshot the phone's widget is fed:
//   Settings > Sharing > Widgets: Make a key for Reem (only the hash goes out, the link shows once, Copy), Stop this key, nothing without a connection
//   the phone widget's snapshot (the Android shell's window.KaisFlowWidgets is faked): Reem's day at Details / Titles / Busy, a pause, and a
//   disconnect on the next refresh leaves nothing (partner: null)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5271'
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

async function openPage(browser, { phone = false, shell = false, route, connections = [connection()], level = 'details', signedIn = true, extra } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    timezoneId: 'Africa/Cairo', locale: 'en-US', ...(phone ? { hasTouch: true, isMobile: true } : {}),
  })
  await ctx.addInitScript(([sess, uid, signedIn, shell]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    if (signedIn) localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe']))
    // Copy and Share: the clipboard and the share sheet are the browser's; keep what was sent
    window.__sent = []
    window.__snaps = []
    if (shell) window.KaisFlowWidgets = { setSnapshot: (j) => window.__snaps.push(JSON.parse(j)), takeQueue: () => '[]' }
    navigator.share = (d) => { window.__sent.push(d); return Promise.resolve() }
  }, [JSON.stringify(session), UID, signedIn, shell])
  const state = { rows: { tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), app_settings: [SETTINGS], projects: [], domains: [], areas: [], inbox_items: [], activity_log: [], share_invites: [], share_links: [], share_widget_links: [] }, conns: structuredClone(connections), level, writes: [], rpcs: [], view: null, ...(extra ?? {}) }
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
      if (p.endsWith('/share_widget_links') && req.method() === 'POST') state.rows.share_widget_links.push({ id: body.id, owner_id: body.owner_id, label: body.label, created_at: new Date().toISOString(), last_used_at: null })
      if (p.endsWith('/share_widget_links') && req.method() === 'PATCH' && body?.revoked_at) state.rows.share_widget_links = []
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
const lastSnap = (page) => page.evaluate(() => window.__snaps.at(-1) ?? null)
const waitSnap = async (page, ms = 5000) => { for (let i = 0; i < ms / 200; i++) { if (await page.evaluate(() => window.__snaps.length)) return; await sleep(200) } }

// ── 1. Settings > Sharing > Widgets, desktop ──
{
  const { page, errors, state } = await openPage(browser, { route: '/settings/sharing' })
  let t = await text(page)
  check("Settings > Sharing has a Widgets section with Reem's day on your PC and Make a key", /Widgets/.test(t) && /Reem’s day on your PC/.test(t) && /Make a key/.test(t) && /Her day/.test(t), t.slice(Math.max(0, t.indexOf('Widgets') - 10), t.indexOf('Widgets') + 160).replace(/\n/g, ' | '))
  await page.getByText('Reem’s day on your PC').first().scrollIntoViewIfNeeded().catch(() => {})
  await shot(page, 'desktop-settings-widgets')
  await click(page, 'Make a key')
  const w = state.writes.find((x) => x.table === 'share_widget_links' && x.method === 'POST')
  check('Make a key sends only a hash, for Reem, labelled, no user_id of its own', !!w && w.body.owner_id === PARTNER && /^[0-9a-f]{64}$/.test(w.body.token_hash) && w.body.label === 'Desktop' && !('user_id' in w.body), JSON.stringify(w?.body ?? null).slice(0, 200))
  t = await text(page)
  const m = /(https:\/\/[^\s]*\/functions\/v1\/share-widget\?t=(kf_p_[A-Za-z0-9_-]{43}))/.exec(t) ?? /(http:\/\/[^\s]*\/functions\/v1\/share-widget\?t=(kf_p_[A-Za-z0-9_-]{43}))/.exec(t)
  const tok = m?.[2]
  check('the link is shown once: .../functions/v1/share-widget?t=kf_p_ + 43 characters', !!m, m?.[1] ?? '')
  const hash = tok ? await page.evaluate(async (x) => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('') }, tok) : ''
  check('its SHA-256 is what was sent, the token itself never was', hash === w?.body.token_hash && !JSON.stringify(state.writes).includes(tok ?? 'x_none'))
  check("it says it won't be shown again, and Copy is there", /won’t be shown again/.test(t) && /Copy/.test(t))
  await shot(page, 'desktop-key-made')
  await click(page, 'Stop this key')
  const p = state.writes.find((x) => x.table === 'share_widget_links' && x.method === 'PATCH')
  check('Stop this key sets revoked_at on that key only', !!p && !!p.body.revoked_at && /id=eq\./.test(p.query), p?.query)
  t = await text(page)
  check('the key and its link are gone from the screen', !/Stop this key/.test(t) && !/kf_p_/.test(t))
  check('no page errors', errors.length === 0, errors.join(' | '))
  allErrors.push(...errors)
  await page.context().close()
}
{
  const { page, errors } = await openPage(browser, { route: '/settings/sharing', connections: [] })
  const t = await text(page)
  check('nobody connected: no Widgets section, no key to make', !/Make a key/.test(t) && /Nobody yet/.test(t))
  allErrors.push(...errors)
  await page.context().close()
}

// ── 2. the phone widget's snapshot (the Android shell faked) ──
{
  const open = (o) => openPage(browser, { phone: true, shell: true, route: '/today', ...o })
  const names = (p) => p.blocks.map((b) => b.title)
  let r = await open({})
  await waitSnap(r.page)
  let s = await lastSnap(r.page)
  check('Details: Reem, her blocks with titles, her goal and Top 3 count', s?.partner?.name === 'Reem' && s.partner.level === 'details' && names(s.partner).includes('Histology lab') && s.partner.goal?.title === 'Finish the pharmacology summary' && s.partner.top?.total === 2 && s.partner.top?.done === 1, JSON.stringify(s?.partner ?? null).slice(0, 300))
  check('it carries when it was read (the widget greys out a day later) and no row ids', typeof s?.partner?.at === 'number' && s.partner.at > 0 && !JSON.stringify(s.partner).includes('"r2"') && !JSON.stringify(s.partner).includes('"q1"'))
  check('timed blocks only, still to come or running', s.partner.blocks.length >= 1 && s.partner.blocks.every((b) => b.end > Date.parse('2026-11-18T10:09:00Z')))
  await shot(r.page, 'phone-today-her-day')
  allErrors.push(...r.errors); await r.ctx.close()

  r = await open({ level: 'titles', connections: [connection({ their_level: 'titles', level: 'titles' })] })
  await waitSnap(r.page); s = await lastSnap(r.page)
  check('Titles: titles and times, no goal, no Top 3', s?.partner?.level === 'titles' && names(s.partner).includes('Histology lab') && s.partner.goal === null && s.partner.top === null, JSON.stringify(s?.partner ?? null).slice(0, 200))
  allErrors.push(...r.errors); await r.ctx.close()

  r = await open({ level: 'busy', connections: [connection({ their_level: 'busy', level: 'busy' })] })
  await waitSnap(r.page); s = await lastSnap(r.page)
  check('Busy only: every block is Busy (no title), no goal', s?.partner?.level === 'busy' && s.partner.blocks.length > 0 && s.partner.blocks.every((b) => b.title === null) && s.partner.goal === null, JSON.stringify(s?.partner ?? null).slice(0, 200))
  allErrors.push(...r.errors); await r.ctx.close()

  r = await open({ connections: [connection({ paused_until: new Date(Date.parse(iso('12:09')) + 3 * 3_600_000).toISOString() })] })
  await waitSnap(r.page); s = await lastSnap(r.page)
  check('a pause: her name and when it ends, no blocks, no goal', s?.partner?.paused === true && s.partner.blocks.length === 0 && s.partner.goal === null && s.partner.pausedUntil > 0, JSON.stringify(s?.partner ?? null).slice(0, 200))
  allErrors.push(...r.errors); await r.ctx.close()

  r = await open({ connections: [] })
  await waitSnap(r.page); s = await lastSnap(r.page)
  check('nobody connected: partner is null (the widget says "Share your day with someone")', !!s && s.partner === null)
  allErrors.push(...r.errors); await r.ctx.close()

  // a revoke is applied on the next refresh and leaves nothing
  r = await open({})
  await waitSnap(r.page); s = await lastSnap(r.page)
  check('before the disconnect the widget has her day', !!s?.partner?.blocks?.length)
  r.state.conns = []
  await r.page.clock.fastForward(120_000)
  await r.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await sleep(3000)
  s = await lastSnap(r.page)
  check('after a disconnect the next refresh writes partner: null, nothing of hers is kept', !!s && s.partner === null && !JSON.stringify(s).includes('Histology'), JSON.stringify(s?.partner ?? 'none').slice(0, 120))
  allErrors.push(...r.errors); await r.ctx.close()
}

check('no page errors anywhere', allErrors.length === 0, allErrors.join(' | '))
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length} of ${results.length} passed`)
process.exit(bad.length ? 1 : 0)
