// ics-subscribe (Kai 2026-11-06: "a normal calendar subscription by link, the way Google Calendar's From URL works") on the
// REAL app against a MOCKED backend (the google-sync recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up
// session in localStorage, Playwright answers every REST and edge-function call and records every write; ics-sync is a small
// fake that keeps calendar_subscriptions the way the real function would).
//
//   S  settings   Calendar & time › Subscribed calendars: Add by link (the real prayer-times webcal link) → Preview (name,
//                 events, the feed's colour, the reminders switch) → Subscribe; a feed without a colour gets a palette C
//                 swatch; rename / recolour / reminders switch / Refresh / Remove; every refusal says why; a failing feed
//                 shows its error; the phone has no sideways scroll
//   G  grid       subscribed events on the calendar: Arabic titles (dir=auto, resolved right-to-left), read-only (no drag,
//                 no rename, no Delete), details say "From subscription · <name>", no "Open in Google Calendar", Duplicate as
//                 my event is a native copy; the Now card and Today show them
//   P  phone      the phone grid and the tap sheet
//   node verify.mjs <outDir> [baseUrl=http://localhost:5351] [playwright-core path]      (ONLY=s,g runs some)
// playwright-core: the 3rd argument, or $PLAYWRIGHT_CORE, else a bare `playwright-core` import.
// The day: Friday 6 Nov 2026, Cairo (UTC+2), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5351'
const PW = process.argv[4] ?? process.env.PLAYWRIGHT_CORE
const { chromium } = PW ? await import(pathToFileURL(PW).href) : await import('playwright-core')
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  const d = String(detail).slice(0, 240)
  results.push({ name, ok: !!ok, detail: d })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${d !== '' ? ' — ' + d : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000060c1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 6) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 10, day, h - 2, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LINK = 'webcal://pray.ahmedelywa.com/api/prayer-times.ics?latitude=30.7952538&longitude=30.9785009&method=5&alarm=5&duration=25&jumuah=true&jumuahDuration=60&color=%23E91E63&lang=ar'
const SUB = { id: 'b0000000-0000-4000-8000-000000000001', host: 'pray.ahmedelywa.com', name: 'مواقيت الصلاة', color: '#E91E63', use_alarms: true, status: 'ok', error: null, synced_at: iso('09:30'), event_count: 644, created_at: iso('09:00', 5) }
const SUB_PLAIN = { id: 'b0000000-0000-4000-8000-000000000002', host: 'fixtures.example.org', name: 'Team calendar', color: '#E58F99', use_alarms: false, status: 'ok', error: null, synced_at: iso('08:00'), event_count: 12, created_at: iso('09:00', 4) }
const FAILING = { ...SUB_PLAIN, id: 'b0000000-0000-4000-8000-000000000003', name: 'Old feed', status: 'failing', error: 'http_error' }

const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const ics = (n, title, from, to, over = {}) => ev(n, title, from, to, {
  source: 'ics', color: SUB.color, remind_min: 5, external_ref: { source: 'ics', id: `${SUB.id}/u${n}/`, sub_id: SUB.id, uid: `u${n}`, recurrence_id: '', calendar: SUB.name, calendar_id: SUB.id }, ...over,
})
const N = { FAJR: 1, DHUHR: 2, ASR: 3, LUNCH: 4, HOLIDAY: 5, MATCH: 6 }
const EVENTS = [
  ics(N.FAJR, 'الفجر', '04:42', '05:07'),
  ics(N.DHUHR, 'الظهر', '11:40', '12:05'),
  ics(N.ASR, 'العصر', '14:46', '15:11'),
  ev(N.LUNCH, 'Lunch with Omar', '12:10', '12:40'),
  ics(N.HOLIDAY, 'عطلة رسمية', '00:00', '00:00', { all_day: true, starts_at: '2026-11-07T00:00:00.000Z', ends_at: '2026-11-08T00:00:00.000Z', remind_min: null }),
  ics(N.MATCH, 'Match day', '13:00', '14:30', { external_ref: { source: 'ics', id: `${SUB.id}/u6/`, sub_id: SUB.id, uid: 'u6', recurrence_id: '', calendar: SUB.name, calendar_id: SUB.id, url: 'https://tickets.example.org/match' } }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = (over = {}) => structuredClone({ tasks: [], calendar_events: EVENTS, inbox_items: [], projects: [], domains: [], areas: [], integrations: [], calendar_subscriptions: [], app_settings: [SETTINGS], ...over })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 900 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** o.fn: { 'ics-sync': (body, state) => json | {status, json} } — the edge function's answers. */
async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf.calRailFolded', '0')
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: tables(o.rows), writes: [], calls: [], gets: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) {
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204 })
      const name = url.pathname.replace('/functions/v1/', '')
      let body = null
      try { body = req.postDataJSON() } catch { body = null }
      state.calls.push({ name, body })
      const answer = o.fn?.[name]?.(body, state) ?? { status: 404, json: { code: 'NOT_FOUND', message: 'Requested function was not found' } }
      return r.fulfill({ status: answer.status ?? 200, json: answer.json ?? answer })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    state.gets.push(url.pathname + url.search)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.addInitScript(() => { window.open = (u) => { (window.__opened ??= []).push(String(u)); return null } })
  await page.clock.install({ time: cairo('10:00') })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, state }
}

const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
const card = (page) => page.locator('#settings-Subscriptions')
const calls = (state, action) => state.calls.filter((c) => c.name === 'ics-sync' && c.body?.action === action)
const labels = async (loc) => (await loc.locator('[role="menuitem"]').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
const details = (page) => page.locator('[role="menu"][aria-label="Block details"]').last()
const menuB = (page) => page.locator('[role="menu"][aria-label="Block menu"]').last()
const fc = (page, id) => page.locator(`.fc-event[data-kf-id="${id}"]`).first()

/** The fake ics-sync: keeps calendar_subscriptions as the real function would. */
const fake = (extra = {}) => (body, state) => {
  const subs = state.rows.calendar_subscriptions
  switch (body?.action) {
    case 'preview': return extra.preview?.(body) ?? { name: 'مواقيت الصلاة', color: '#E91E63', events: 644, reminders: true, host: 'pray.ahmedelywa.com' }
    case 'add': {
      if (extra.add) return extra.add(body)
      subs.push({ ...SUB, name: body.name, color: body.color, use_alarms: body.use_alarms })
      return { id: SUB.id, fetched: 644, new: 644, updated: 0, removed: 0 }
    }
    case 'refresh': return { fetched: 644, new: 0, updated: 0, removed: 0 }
    case 'update': {
      const s = subs.find((x) => x.id === body.id)
      if (s) Object.assign(s, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'color', 'use_alarms'].includes(k))))
      return { fetched: 644, new: 0, updated: 644, removed: 0 }
    }
    case 'remove': {
      const i = subs.findIndex((x) => x.id === body.id)
      if (i >= 0) subs.splice(i, 1)
      return { removed: 644 }
    }
    default: return { status: 400, json: { error: 'bad_request' } }
  }
}

// ── S: Settings › Calendar & time › Subscribed calendars ──
if (want('s')) {
  // s1: nothing yet
  {
    const { ctx, page, errors } = await open('/settings/calendar', { fn: { 'ics-sync': fake() } })
    const c = card(page)
    check('s1 the card is there, with "Add by link" and an honest empty line', (await c.count()) === 1 && /Subscribed calendars/.test(await c.textContent()) && /None yet/.test(await c.textContent()) && (await c.getByLabel('Calendar link').count()) === 1)
    check('s1 Preview is off until a link is typed', await c.getByRole('button', { name: 'Preview' }).isDisabled())
    await shot(page, 's1-empty-day')
    check('s1 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // s2: the real link → preview → subscribe
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/settings/calendar', { theme, fn: { 'ics-sync': fake() } })
    const c = card(page)
    await c.getByLabel('Calendar link').fill(LINK)
    await c.getByRole('button', { name: 'Preview' }).click()
    await c.getByRole('group', { name: 'Preview' }).waitFor({ timeout: 4000 }).catch(() => {})
    const pre = calls(state, 'preview')
    check(`s2 ${theme}: Preview posts the pasted webcal:// link untouched (the server makes it https)`, pre.length === 1 && pre[0].body.url === LINK, JSON.stringify(pre[0]?.body))
    const txt = await c.getByRole('group', { name: 'Preview' }).textContent()
    check(`s2 ${theme}: it shows the number of events, "with reminders"`, /Found 644 events/.test(txt) && /with reminders/.test(txt), txt)
    const name = c.getByLabel('Subscription name')
    check(`s2 ${theme}: the name defaults to the feed's (Arabic), dir=auto, resolved right-to-left`, (await name.inputValue()) === 'مواقيت الصلاة' && (await name.getAttribute('dir')) === 'auto' && (await name.evaluate((el) => getComputedStyle(el).direction)) === 'rtl')
    check(`s2 ${theme}: the colour is the feed's (shown as Custom, selected)`, (await c.locator('.kf-sw-custom[data-on]').count()) === 1)
    check(`s2 ${theme}: "Use the calendar’s reminders" is on`, (await c.getByRole('switch', { name: 'Use the calendar’s reminders' }).getAttribute('aria-checked')) === 'true')
    await shot(page, `s2-preview-${theme}`)
    await name.fill('الصلاة')
    await c.getByRole('button', { name: 'Subscribe' }).click()
    await sleep(1200)
    const add = calls(state, 'add')
    check(`s2 ${theme}: Subscribe posts {url, name, color, use_alarms}`, add.length === 1 && add[0].body.url === LINK && add[0].body.name === 'الصلاة' && add[0].body.color === '#E91E63' && add[0].body.use_alarms === true, JSON.stringify(add[0]?.body))
    const after = await c.textContent()
    check(`s2 ${theme}: it says "Subscribed · 644 events", the list has the row with host and count, the link field is empty`, /Subscribed · 644 events/.test(after) && /pray\.ahmedelywa\.com · 644 events · updated/.test(after) && (await c.getByLabel('Calendar link').inputValue()) === '', after)
    check(`s2 ${theme}: nothing was written to calendar_events or calendar_subscriptions by the client (the function does it)`, state.writes.every((w) => w.table !== 'calendar_events' && w.table !== 'calendar_subscriptions'), JSON.stringify(state.writes.map((w) => w.table)))
    const listed = state.gets.filter((g) => g.startsWith('/rest/v1/calendar_subscriptions'))
    const cols = listed.map((g) => decodeURIComponent(new URL(g, 'http://x').searchParams.get('select') ?? '').split(',').map((x) => x.trim()))
    check(`s2 ${theme}: the list query asks for name, host, colour… and never for the link (url)`, cols.length >= 1 && cols.every((c) => c.includes('host') && !c.includes('url') && !c.includes('*')), JSON.stringify(cols))
    await shot(page, `s2-subscribed-${theme}`)
    check(`s2 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // s3: a feed with no colour → a palette C swatch; no reminders → no switch
  {
    const { ctx, page, errors, state } = await open('/settings/calendar', { rows: { calendar_subscriptions: [{ ...SUB, color: '#E58F99' }] }, fn: { 'ics-sync': fake({ preview: () => ({ name: 'Fixtures', color: null, events: 1, reminders: false, host: 'fixtures.example.org' }) }) } })
    const c = card(page)
    await c.getByLabel('Calendar link').fill('https://fixtures.example.org/a.ics')
    await c.getByLabel('Calendar link').press('Enter')
    await c.getByRole('group', { name: 'Preview' }).waitFor({ timeout: 4000 }).catch(() => {})
    const txt = await c.getByRole('group', { name: 'Preview' }).textContent()
    check('s3 one event reads "1 event", no reminders line, no reminders switch', /Found 1 event in/.test(txt) && !/with reminders/.test(txt) && (await c.getByRole('group', { name: 'Preview' }).getByRole('switch').count()) === 0, txt)
    check('s3 the colour defaults to the first palette C swatch no subscription wears (Rose is taken: Clay)', (await c.getByRole('group', { name: 'Preview' }).getByRole('button', { name: 'Clay' }).getAttribute('aria-pressed')) === 'true')
    await c.getByRole('button', { name: 'Cancel' }).click()
    check('s3 Cancel closes the preview and adds nothing', (await c.getByRole('group', { name: 'Preview' }).count()) === 0 && calls(state, 'add').length === 0)
    check('s3 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // s4: manage
  {
    const { ctx, page, errors, state } = await open('/settings/calendar', { rows: { calendar_subscriptions: [SUB, SUB_PLAIN] }, fn: { 'ics-sync': fake() } })
    const c = card(page)
    check('s4 two rows: each with its host, count and when it was read; the dot is the subscription’s colour', /pray\.ahmedelywa\.com · 644 events · updated/.test(await c.textContent()) && /fixtures\.example\.org · 12 events/.test(await c.textContent()) && (await c.locator('.st-dot').count()) >= 2)
    const row = c.locator('.st-row', { hasText: 'Team calendar' })
    await row.getByRole('button', { name: 'Refresh' }).click()
    await sleep(900)
    check('s4 Refresh posts {action:"refresh", id} and says "Updated"', calls(state, 'refresh').length === 1 && calls(state, 'refresh')[0].body.id === SUB_PLAIN.id && /Updated/.test(await row.textContent()), JSON.stringify(calls(state, 'refresh')))
    await row.getByRole('button', { name: 'Edit' }).click()
    const nm = c.getByLabel('Name of Team calendar')
    await nm.fill('Work')
    await nm.press('Enter')
    await sleep(900)
    check('s4 renaming posts {action:"update", id, name}', calls(state, 'update').some((u) => u.body.id === SUB_PLAIN.id && u.body.name === 'Work'), JSON.stringify(calls(state, 'update')))
    const open2 = c.locator('.st-row', { hasText: 'Work' })
    await open2.getByRole('button', { name: 'Iris' }).click()
    await sleep(700)
    check('s4 a palette C swatch posts {color:"#B59CE3"}', calls(state, 'update').some((u) => u.body.color === '#B59CE3'), JSON.stringify(calls(state, 'update')))
    const sw = open2.getByRole('switch', { name: 'Use the calendar’s reminders' })
    check('s4 "Use the calendar’s reminders" reads off for this one…', (await sw.getAttribute('aria-checked')) === 'false')
    await sw.click()
    await sleep(700)
    check('s4 …and turning it on posts {use_alarms:true}', calls(state, 'update').some((u) => u.body.use_alarms === true), JSON.stringify(calls(state, 'update')))
    await shot(page, 's4-manage-day')
    await open2.getByRole('button', { name: 'Remove', exact: true }).click()
    check('s4 Remove asks first, naming the events that go', /Remove it and its 12 events/.test(await open2.textContent()))
    await open2.getByRole('button', { name: /Remove it and its/ }).click()
    await sleep(900)
    check('s4 confirmed: posts {action:"remove", id}; the row is gone, the other stays', calls(state, 'remove').length === 1 && calls(state, 'remove')[0].body.id === SUB_PLAIN.id && !/Work/.test(await c.textContent()) && /مواقيت الصلاة/.test(await c.textContent()))
    check('s4 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // s5: refusals say why
  {
    const refuse = (error, status = 400) => () => ({ status, json: { error } })
    const cases = [
      ['blocked', /private network/, 'http://192.168.1.5/cal.ics'],
      ['bad_url', /isn’t a calendar link/, 'ftp://x.example/a.ics'],
      ['not_ics', /didn’t send a calendar/, 'https://example.org/page.html'],
      ['timeout', /too long/, 'https://slow.example.org/a.ics'],
      ['too_large', /too big/, 'https://big.example.org/a.ics'],
      ['http_error', /answered with an error/, 'https://gone.example.org/a.ics'],
    ]
    for (const [code, re, link] of cases) {
      const { ctx, page, errors } = await open('/settings/calendar', { fn: { 'ics-sync': fake({ preview: refuse(code, code === 'timeout' || code === 'http_error' ? 502 : 400) }) } })
      const c = card(page)
      await c.getByLabel('Calendar link').fill(link)
      await c.getByRole('button', { name: 'Preview' }).click()
      await c.getByRole('alert').waitFor({ timeout: 4000 }).catch(() => {})
      check(`s5 ${code}: says why in a sentence, no preview, no page error`, re.test((await c.getByRole('alert').textContent().catch(() => '')) ?? '') && (await c.getByRole('group', { name: 'Preview' }).count()) === 0 && errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
    const { ctx, page } = await open('/settings/calendar', { fn: { 'ics-sync': fake({ add: refuse('duplicate', 409) }) } })
    const c = card(page)
    await c.getByLabel('Calendar link').fill(LINK)
    await c.getByRole('button', { name: 'Preview' }).click()
    await c.getByRole('button', { name: 'Subscribe' }).click()
    await c.getByRole('alert').waitFor({ timeout: 4000 }).catch(() => {})
    check('s5 duplicate: "already subscribed", and the preview stays so the link can be fixed', /already subscribed/.test((await c.getByRole('alert').textContent().catch(() => '')) ?? '') && (await c.getByRole('group', { name: 'Preview' }).count()) === 1)
    await ctx.close()
    const nf = await open('/settings/calendar') // the function was never deployed
    await card(nf.page).getByLabel('Calendar link').fill(LINK)
    await card(nf.page).getByRole('button', { name: 'Preview' }).click()
    await card(nf.page).getByRole('alert').waitFor({ timeout: 4000 }).catch(() => {})
    const nfSaid = (await card(nf.page).getByRole('alert').textContent().catch(() => '')) ?? ''
    check('s5 not deployed: "aren’t on the server yet … needs deploying"', /aren’t on the server yet.*deploying/.test(nfSaid), nfSaid)
    await nf.ctx.close()
  }
  // s6: a failing feed
  {
    const { ctx, page, errors } = await open('/settings/calendar', { rows: { calendar_subscriptions: [FAILING] }, fn: { 'ics-sync': fake() } })
    const c = card(page)
    const alert = c.getByRole('alert')
    check('s6 a failing feed shows why and when it last worked', /fixtures\.example\.org · That address answered with an error.* Last updated /.test((await alert.textContent().catch(() => '')) ?? ''))
    await shot(page, 's6-failing-day')
    check('s6 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // s7: phone
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/settings/calendar', { view: phone, theme, rows: { calendar_subscriptions: [SUB, FAILING] }, fn: { 'ics-sync': fake() } })
    const c = card(page)
    await c.scrollIntoViewIfNeeded().catch(() => {})
    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    check(`s7 ${theme}: phone Settings has the card with Add by link and no sideways scroll at 390`, (await c.count()) === 1 && (await c.getByLabel('Calendar link').count()) === 1 && wide <= 390, wide)
    await c.screenshot({ path: path.join(OUT, `s7-phone-card-${theme}.png`) })
    check(`s7 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── G: the calendar, Today, the details ──
if (want('g')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { theme, rows: { calendar_subscriptions: [SUB] }, fn: { 'ics-sync': fake() } })
    const dhuhr = fc(page, eid(N.DHUHR))
    check(`g1 ${theme}: the subscribed events are on the grid with their Arabic titles`, (await dhuhr.count()) === 1 && (await dhuhr.textContent()).includes('الظهر') && (await fc(page, eid(N.ASR)).count()) === 1)
    const title = dhuhr.locator('.fc-event-title').first()
    check(`g1 ${theme}: the title carries dir=auto and resolves right-to-left`, (await title.getAttribute('dir')) === 'auto' && (await title.evaluate((el) => getComputedStyle(el).direction)) === 'rtl')
    check(`g1 ${theme}: an English title stays left-to-right`, (await fc(page, eid(N.MATCH)).locator('.fc-event-title').first().evaluate((el) => getComputedStyle(el).direction)) === 'ltr')
    await shot(page, `g1-grid-${theme}`, false)
    // left-click → details
    const box = await dhuhr.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await details(page).waitFor({ timeout: 3000 }).catch(() => {})
    const d = await labels(details(page))
    check(`g2 ${theme}: the details are read-only: date · time · From subscription · <name> · Duplicate as my event`, d.length === 4 && /^Fri, Nov 6$/.test(d[0]) && /^11:40 AM – 12:05 PM/.test(d[1]) && d[2] === 'From subscription · مواقيت الصلاة' && /^Duplicate as my event/.test(d[3]), JSON.stringify(d))
    check(`g2 ${theme}: no "Open in Google Calendar", no Delete, the title is read-only, no colour tray`, !d.some((t) => /Google Calendar|Delete/.test(t)) && (await details(page).getByRole('textbox', { name: 'Title' }).getAttribute('readonly')) !== null && (await details(page).locator('.kf-swatch-tray').count()) === 0)
    check(`g2 ${theme}: the title field is dir=auto too`, (await details(page).getByRole('textbox', { name: 'Title' }).getAttribute('dir')) === 'auto')
    await shot(page, `g2-details-${theme}`, false)
    if (theme === 'day') {
      const w = state.writes.length
      await details(page).getByRole('menuitem', { name: /Duplicate as my event/ }).click()
      await sleep(900)
      const made = state.writes.slice(w).filter((x) => x.table === 'calendar_events').map((x) => x.body).flat().filter(Boolean)
      check('g3 Duplicate as my event writes a native copy: same title and time, no source link, no reminder from the feed', made.length === 1 && made[0].title === 'الظهر' && made[0].source === 'native' && !made[0].external_ref && !made[0].gcal_id, JSON.stringify(made))
      check('g3 …and tells ics-sync nothing', state.calls.filter((c) => c.name === 'ics-sync').length === 0)
    }
    await page.keyboard.press('Escape')
    await sleep(250)
    // right-click → menu B
    const b2 = await dhuhr.boundingBox()
    await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2, { button: 'right' })
    await menuB(page).waitFor({ timeout: 3000 }).catch(() => {})
    check(`g4 ${theme}: menu B: Details · Duplicate as my event · Work with AI · Copy link — no Google row, no Delete`, (await labels(menuB(page))).map((t) => t.replace(/(Ctrl ?D|▸)$/, '')).join('|') === 'Details|Duplicate as my event|Work with AI|Copy link', JSON.stringify(await labels(menuB(page))))
    await page.keyboard.press('Escape')
    await sleep(250)
    // an event with its own link offers Join
    const b3 = await fc(page, eid(N.MATCH)).boundingBox()
    await page.mouse.click(b3.x + b3.width / 2, b3.y + b3.height / 2)
    await details(page).waitFor({ timeout: 3000 }).catch(() => {})
    check(`g5 ${theme}: an event with its own https link offers Join meeting, which opens it`, (await labels(details(page))).includes('Join meeting'))
    if (theme === 'day') {
      await details(page).getByRole('menuitem', { name: /Join meeting/ }).click()
      await sleep(300)
      check('g5 …the link opens', (await page.evaluate(() => window.__opened ?? [])).includes('https://tickets.example.org/match'), JSON.stringify(await page.evaluate(() => window.__opened ?? [])))
    }
    await page.keyboard.press('Escape')
    await sleep(250)
    check(`g6 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // read-only on the grid: drag does nothing
  {
    const { ctx, page, errors, state } = await open('/calendar', { fn: { 'ics-sync': fake() } })
    const b = await fc(page, eid(N.ASR)).boundingBox()
    const w = state.writes.length
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 90, { steps: 12 })
    await page.mouse.up()
    await sleep(700)
    const after = await fc(page, eid(N.ASR)).boundingBox()
    check('g7 a subscribed event can’t be dragged: no write, no call, the block is where it was', state.writes.length === w && state.calls.length === 0 && Math.abs(after.y - b.y) < 2, `${b.y} -> ${after.y}`)
    await page.keyboard.press('Delete')
    await sleep(400)
    check('g7 …nor deleted with the keyboard', state.writes.length === w && (await fc(page, eid(N.ASR)).count()) === 1)
    check('g7 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Today: the Now card
  {
    const { ctx, page, errors } = await open('/today', { fn: { 'ics-sync': fake() } })
    const t = await page.locator('body').textContent()
    check('g8 Today shows a subscribed event (Up next: الظهر) with the title dir=auto', t.includes('الظهر') && (await page.locator('[dir="auto"]', { hasText: 'الظهر' }).count()) >= 1)
    await shot(page, 'g8-today-day', false)
    check('g8 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P: phone ──
if (want('p')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/calendar', { view: phone, theme, rows: { calendar_subscriptions: [SUB] }, fn: { 'ics-sync': fake() } })
    const ev1 = page.locator(`[data-kf-id="${eid(N.DHUHR)}"], [data-event-id="${eid(N.DHUHR)}"]`).first()
    const has = (await ev1.count()) > 0
    check(`p1 ${theme}: the phone grid draws the subscribed event with its Arabic title`, has || (await page.locator('body').textContent()).includes('الظهر'))
    const target = has ? ev1 : page.getByText('الظهر', { exact: false }).first()
    await target.click()
    await sleep(700)
    const body = await page.locator('body').textContent()
    check(`p1 ${theme}: its tap sheet says "Subscribed event", read-only (no Delete)`, /Subscribed event/.test(body) && !/Delete/.test(await page.locator('.pc-bs, [role="dialog"]').last().textContent().catch(() => '')), '')
    await shot(page, `p1-phone-sheet-${theme}`, false)
    check(`p1 ${theme}: nothing was written or sent to ics-sync by opening it`, state.writes.length === 0 && state.calls.length === 0)
    check(`p1 ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`)
  process.exit(1)
}
