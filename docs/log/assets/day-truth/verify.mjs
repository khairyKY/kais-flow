// day-truth (P7e parity audit list A: A23 A26 A27 A29 A30) on the REAL app against a MOCKED backend —
// the fix-today recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9 (--mode mock), a made-up
// session in localStorage, Playwright answers every REST call (PostgREST eq / in / gte / is filters) and
// applies every write to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The week: Monday 12 Oct 2026, Cairo (UTC+3). A23 (a SQL view), A26 and the nudge half of A29 (push
// notices) and the retainer half of A30 (SQL) have no screen to drive: their proof is the unit tests and
// the pglite checks beside this file.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5275'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').some((p) => k.startsWith(p))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000d7a17'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
let seq = 0
const act = (event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: at })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const routine = (n, name, over = {}) => ({
  id: `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, name, time_of_day: null, clock_time: null, cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
  challenge_start: null, challenge_end: null, active: true, steps: [], step_minutes: [], domain_id: null, goal_days: null, plant: 'vine', created_at: CREATED, updated_at: CREATED, ...over,
})

function tables(o = {}) {
  return {
    tasks: o.tasks ?? [],
    calendar_events: [],
    projects: [],
    app_settings: [{ ...SETTINGS, ...o.settings }],
    routines: o.routines ?? [],
    routine_completions: [],
    inbox_items: o.inbox ?? [],
    activity_log: o.log ?? [],
    time_entries: [],
    domains: [],
    areas: [],
    slipping: [],
    resurfaced_log: [],
    people: [],
    interactions: [],
  }
}

/** PostgREST filters the app sends (eq / neq / in / gte / gt / lte / lt / is), enough for the mock. */
function filterRows(rows, url) {
  let out = rows
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    const m = v.match(/^(not\.)?(eq|neq|in|gte|gt|lte|lt|is)\.(.*)$/)
    if (!m) continue
    const [, not, op, raw] = m
    const val = (x) => (x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : x)
    const test = (r) => {
      const a = r[k]
      if (op === 'eq') return String(a) === raw
      if (op === 'neq') return String(a) !== raw
      if (op === 'is') return a === val(raw)
      if (op === 'in') return raw.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(a))
      if (a == null) return false
      return op === 'gte' ? a >= raw : op === 'gt' ? a > raw : op === 'lte' ? a <= raw : a < raw
    }
    out = out.filter((r) => (not ? !test(r) : test(r)))
  }
  if (url.searchParams.get('order')?.startsWith('created_at.asc')) out = [...out].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return out
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

/** `at` = a Cairo wall time on `day` (October 2026), or null for the real clock. */
async function open(at, rows, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const nowIso = at ? cairo(at, o.day ?? 12).toISOString() : null
  const state = { rows: rows, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      const list = (state.rows[table] ??= [])
      if (body && typeof body === 'object') {
        for (const row of Array.isArray(body) ? body : [body]) {
          // the column default, as Postgres would fill it (activity rows are written without one)
          const full = { created_at: nowIso ?? new Date().toISOString(), ...row }
          const i = list.findIndex((x) => x.id === row.id)
          if (i === -1) list.push(full)
          else list[i] = { ...list[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const found = filterRows(state.rows[table] ?? [], url)
    if (one) return found.length ? r.fulfill({ json: found[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: found, headers: { 'content-range': `0-${Math.max(0, found.length - 1)}/${found.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  if (at) await page.clock.install({ time: cairo(at, o.day ?? 12) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${o.path ?? '/today'}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  return { ctx, page, errors, state }
}

const shot = async (page, name) => {
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const text = (loc) => loc.first().innerText().catch(() => '')
const posts = (state, table) => state.writes.filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const go = async (page, to) => {
  // in-app navigation: the query cache (and what the outbox folded into it) is kept, as a person clicking would
  await page.evaluate((p) => {
    history.pushState({}, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, to)
  await sleep(1200)
}

// ── S · A29: Shut down after midnight (Tue 13 Oct 00:30 Cairo = still Monday's loop day) ──
if (want('s')) {
  const LEFT = 1, NEXT = 2
  const rows = () => tables({
    tasks: [
      task(LEFT, 'Renew the domain', { due_at: iso('09:00', 12) }), // Monday's plate, still open
      task(NEXT, 'Order printer ink', { due_at: iso('09:00', 13) }), // due Tuesday — the morning these seeds are for
    ],
    log: [act('ritual.finished', 'ritual', 'morning-2026-10-12', { ritual: 'morning', date: '2026-10-12', steps: ['overdue', 'inbox', 'top3', 'block'] }, iso('08:20', 12))],
  })
  for (const view of ['desktop', 'phone']) {
    const tag = `s-${view}`
    const { ctx, page, errors, state } = await open('00:30', rows(), { day: 13, view: view === 'phone' ? phone : desktop, theme: 'night' })
    if (view === 'desktop') {
      check(`${tag} 00:30: the Day card offers Shut down the day (not Plan, not Now)`, /Shut down the day/.test(await text(page.locator('.td-now'))), (await text(page.locator('.td-now'))).replace(/\n/g, ' '))
      check(`${tag} 00:30: the rail's Evening is open (4 steps), not "from 17:00"`, (await page.locator('.td-rit[data-ritual="evening"] .td-rit-step').count()) === 4 && !/from 17:00/.test(await text(page.locator('.td-rit[data-ritual="evening"]'))))
      await shot(page, `${tag}-0030-today`)
      await page.locator('.td-now').getByRole('button', { name: /^(Begin|Resume)$/ }).click()
    } else {
      check(`${tag} 00:30: the ritual card reads Shut down the day`, /Shut down the day/.test(await text(page.locator('.tp-ritual'))), (await text(page.locator('.tp-ritual'))).replace(/\n/g, ' '))
      await page.locator('.tp-ritual').getByRole('button', { name: /^(Shut down|Resume)$/ }).click()
    }
    await sleep(900)
    const left = page.locator(`[id="rt-${id(LEFT)}"]`)
    check(`${tag} the Sweep holds Monday's leftover, not Tuesday's task`, (await left.count()) === 1 && (await page.locator(`[id="rt-${id(NEXT)}"]`).count()) === 0)
    const seed = page.locator(`[id="rt-seed-${id(NEXT)}"]`)
    check(`${tag} Tomorrow's 3: Tuesday's task reads "Due tomorrow"`, /DUE TOMORROW/i.test(await text(seed)), (await text(seed)).replace(/\n/g, ' '))
    const before = state.writes.length
    await left.getByRole('button', { name: 'Tomorrow' }).click()
    await sleep(700)
    const rolled = posts({ writes: state.writes.slice(before) }, 'tasks').find((r) => r.id === id(LEFT))
    check(`${tag} Tomorrow → Tuesday 09:00, the morning it seeds (was Wednesday)`, rolled?.due_at === iso('09:00', 13), rolled?.due_at)
    check(`${tag} …and its meta says "→ Tue 09:00"`, /→ TUE 09:00/i.test(await text(left)), (await text(left)).replace(/\n/g, ' '))
    if (view === 'phone') await shot(page, `${tag}-0030-shutdown`)
    await page.locator('.kf-button--cta', { hasText: 'Close the day' }).click()
    await sleep(1200)
    const finished = posts(state, 'activity_log').find((r) => r.event_type === 'ritual.finished')
    const seeded = posts(state, 'activity_log').filter((r) => r.event_type === 'ritual.seeded')
    check(`${tag} Close the day logs Monday's Shut down, seeding Tuesday`, finished?.payload?.date === '2026-10-12' && seeded.length > 0 && seeded.every((r) => r.payload?.for_date === '2026-10-13'), JSON.stringify({ date: finished?.payload?.date, for: seeded.map((r) => r.payload?.for_date) }))
    if (view === 'desktop') await shot(page, `${tag}-0030-closed`)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── R · A29: the weekly-review prompt (weekend Mon + Tue → reviewed Monday 12 Oct; the week runs Wed 7 – Tue 13) ──
if (want('r')) {
  const W = '2026-10-07', LAST = '2026-09-30'
  const rev = (type, at, week) => act(type, 'review', '20000000-0000-4000-8000-000000000001', week ? { week } : {}, at)
  const shown = async (page) => (await page.locator('.td-rit[data-ritual="review"]').count()) === 1
  const cases = [
    ['r1-closed-then-undone', [rev('review.week_closed', iso('09:00', 12), W), rev('review.week_reopened', iso('09:00', 12).replace(':00.000', ':04.000'), W)], true],
    ['r2-late-close-for-last-week', [rev('review.week_closed', iso('15:00', 6), LAST)], true], // Tue 6 Oct: last week's, a day late
    ['r3-closed-this-week', [rev('review.week_closed', iso('11:00', 9), W)], false],
  ]
  for (const [tag, log, want_] of cases) {
    const { ctx, page, errors } = await open('14:10', tables({ settings: { weekend_days: [1, 2] }, log }))
    check(`${tag}: the rail's Weekly review ${want_ ? 'shows' : 'is hidden'}`, (await shown(page)) === want_)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // Live: Close the week → Undo → Today asks again; Close for good → Today stops asking.
  {
    const { ctx, page, errors, state } = await open('14:10', tables({ settings: { weekend_days: [1, 2] } }), { path: '/weekly-review' })
    await page.getByRole('button', { name: 'Close the week ✓' }).click()
    await sleep(500)
    await page.locator('.kf-toast').getByRole('button', { name: 'Undo' }).click()
    await sleep(800)
    await go(page, '/today')
    check('r4 Close the week, then Undo → Today prompts the review again', await shown(page))
    await shot(page, 'r4-undo-today')
    await go(page, '/weekly-review')
    await page.getByRole('button', { name: 'Close the week ✓' }).click()
    await sleep(5000) // the toast's undo window
    await go(page, '/today')
    check('r4 Close the week (kept) → the prompt is gone', !(await shown(page)))
    const weeks = posts(state, 'activity_log').filter((r) => r.event_type.startsWith('review.week')).map((r) => `${r.event_type}:${r.payload?.week}`)
    check('r4 rows: closed · reopened · closed, all for the week of Wed 7 Oct', JSON.stringify(weeks) === JSON.stringify([`review.week_closed:${W}`, `review.week_reopened:${W}`, `review.week_closed:${W}`]), JSON.stringify(weeks))
    check('r4 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // 00:30 Tuesday is still Monday's loop day: still the review day, and a close then is this week's.
  {
    const { ctx, page, errors, state } = await open('00:30', tables({ settings: { weekend_days: [1, 2] } }), { day: 13 })
    check('r5 00:30 Tue (Monday’s loop day): the review is still asked for', await shown(page))
    await go(page, '/weekly-review')
    await page.getByRole('button', { name: 'Close the week ✓' }).click()
    await sleep(800)
    const row = posts(state, 'activity_log').find((r) => r.event_type === 'review.week_closed')
    check('r5 …and closing it then closes the week of Wed 7 Oct, not the next one', row?.payload?.week === W, row?.payload?.week)
    check('r5 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── D · A27: New Routine's Description ──
if (want('d')) {
  for (const view of ['desktop', 'phone']) {
    const tag = `d-${view}`
    const { ctx, page, errors, state } = await open('10:00', tables({ routines: [routine(1, 'Glass of water')] }), { view: view === 'phone' ? phone : desktop, path: '/routines' })
    await page.getByRole('button', { name: /New routine/ }).first().click()
    await sleep(700)
    const field = page.getByRole('textbox', { name: 'Description' })
    check(`${tag} the form has an optional Description under Name`, (await field.count()) === 1 && (await field.getAttribute('placeholder'))?.startsWith('Optional'))
    await page.getByPlaceholder('Evening stretch').fill('Evening stretch')
    await field.fill('  Ten minutes before bed, phone in the other room  ')
    await shot(page, `${tag}-new-routine`)
    await page.getByRole('button', { name: 'Plant routine' }).click()
    await sleep(900)
    const made = posts(state, 'routines').find((r) => r.name === 'Evening stretch')
    check(`${tag} Plant writes it, trimmed`, made?.description === 'Ten minutes before bed, phone in the other room', made?.description)
    const plain = posts(state, 'routines').length
    if (view === 'desktop') {
      // reopen it (the name opens Edit), change it, save
      await page.locator('button[title="Edit routine"]', { hasText: 'Evening stretch' }).first().click()
      await sleep(700)
      check(`${tag} Edit routine reads it back`, (await page.getByRole('textbox', { name: 'Description' }).inputValue()) === 'Ten minutes before bed, phone in the other room')
      await page.getByRole('textbox', { name: 'Description' }).fill('Before bed')
      await page.getByRole('button', { name: 'Save routine' }).click()
      await sleep(900)
      const saved = posts(state, 'routines').slice(plain).find((r) => r.id === made?.id)
      check(`${tag} Save writes the edit`, saved?.description === 'Before bed', saved?.description)
      // a routine without one, saved untouched, doesn't send the column at all
      await page.locator('button[title="Edit routine"]', { hasText: 'Glass of water' }).first().click()
      await sleep(700)
      await page.getByRole('button', { name: 'Save routine' }).click()
      await sleep(900)
      const water = posts(state, 'routines').filter((r) => r.name === 'Glass of water').pop()
      check(`${tag} an untouched routine's save leaves the column out (a server before 0072 never sees it)`, !!water && !('description' in water), JSON.stringify(water && Object.keys(water)))
    }
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── C · A30: every running challenge gets its card ──
if (want('c')) {
  const challenges = [
    routine(1, 'No sugar', { challenge_start: '2026-10-01', challenge_end: '2026-10-30', goal_days: 30 }),
    routine(2, 'Read 20 pages', { challenge_start: '2026-10-05', challenge_end: '2026-10-18', goal_days: 14 }),
    routine(3, 'Old challenge', { challenge_start: '2026-09-01', challenge_end: '2026-09-30', goal_days: 30 }), // over
    routine(4, 'Glass of water'),
  ]
  const cards = (page) => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /days · ends/.test(d.textContent ?? '') && ![...d.children].some((c) => /days · ends/.test(c.textContent ?? ''))).map((d) => d.parentElement?.firstElementChild?.textContent ?? '')) // bj-pages: no tape strip before the name now
  for (const view of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('10:00', tables({ routines: challenges }), { view: view === 'phone' ? phone : desktop, path: '/routines' })
    if (view === 'phone') await page.evaluate(() => document.querySelector('.app-main-content')?.scrollTo(0, 99999))
    await sleep(400)
    const names = await cards(page)
    check(`c-${view} two challenges running today → two cards (the ended one has none)`, names.length === 2 && names.includes('No sugar') && names.includes('Read 20 pages'), JSON.stringify(names))
    await page.getByText('Read 20 pages').last().scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, `c-${view}-challenges`)
    check(`c-${view} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── K · A30: the Inbox card follows the user's confidence_threshold ──
if (want('k')) {
  const item = { id: 'a2000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'renew hosting', transcript: null, ai_parse: { kind: 'task', title: 'Renew hosting', cleaned_text: 'Renew hosting', confidence: 0.8, project_id: null, domain_id: null }, confidence: 0.8, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: iso('08:00'), updated_at: iso('08:00') }
  for (const [tag, threshold, asks] of [['k-default', undefined, false], ['k-raised', 0.9, true]]) {
    const { ctx, page, errors } = await open('10:00', tables({ inbox: [item], settings: threshold ? { confidence_threshold: threshold } : {} }), { path: '/inbox' })
    const n = await page.locator('.ib-ask', { hasText: 'Where does this go?' }).count()
    check(`${tag}: an 0.8 read ${asks ? 'asks "Where does this go?" (threshold 0.9)' : 'is a suggestion (threshold 0.75)'}`, (n > 0) === asks, `asks: ${n}`)
    if (asks) await shot(page, `${tag}-inbox`)
    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── F · A30: a focus round survives a reload (the real clock) ──
if (want('f')) {
  const { ctx, page, errors } = await open(null, tables(), { path: '/focus' })
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem('kf_focus_session') ?? 'null'))
  await page.getByRole('button', { name: '▶ Start' }).first().click()
  await sleep(3200)
  const before = await kept()
  check('f the running round is kept as it ticks', before?.isRunning === true && before?.mode === 'pomodoro' && before.secondsLeft < 25 * 60, JSON.stringify(before && { isRunning: before.isRunning, secondsLeft: before.secondsLeft }))
  await sleep(1000)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(1500)
  const after = await kept()
  check('f after a reload it is still running (Pause shows)', (await page.getByRole('button', { name: '❙❙ Pause' }).count()) > 0 && after?.isRunning === true)
  check('f …and caught up on the time away (no restart at 25:00)', after.secondsLeft <= before.secondsLeft - 2 && after.secondsLeft > 25 * 60 - 30, `${before.secondsLeft} → ${after.secondsLeft}`)
  await shot(page, 'f-focus-after-reload')
  await page.getByRole('button', { name: '❙❙ Pause' }).first().click()
  check('f no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
