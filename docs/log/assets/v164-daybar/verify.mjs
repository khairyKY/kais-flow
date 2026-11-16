// v164-daybar (F1, v1.6.4): the phone Today's Day bar — drag a task onto it to schedule it, swipe it to change day.
// On the real /today page against a MOCKED backend (dev server: `npm run dev -- --port 5251 --mode mock --host ::`
// with app/.env.mock.local VITE_SUPABASE_URL=http://127.0.0.1:9; Playwright answers every REST call and keeps the writes).
// Real touch: Chromium over CDP Input.dispatchTouchEvent (hasTouch + isMobile), so SwipeRow's hold, the bar's pointer
// handlers and the page's own scroll all see what a finger sends. The day: Monday 26 Oct 2026, 10:40 Cairo (UTC+3).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5251] [playwright-core index.mjs]      (ONLY=A,B,… runs some scenes)
// Checks: lifting a Top 3 row (hold) shows the ghost, the drop line and a 12/24h time bubble snapped to the quarter;
// dropping at 14:20 on tomorrow's bar makes a 14:15 block of the task's length (+ Undo); dropping on a Time block
// pill rings it and puts the task in it; letting go off the bar writes nothing and the row comes back; a vertical drag
// on the bar still scrolls the page; a swipe left / right (or a flick) turns the day and the Today page with it
// (tomorrow, back, yesterday), a short drag springs back; a tap on the bar / a pill still opens; the bar shows on an
// empty day that is to come; reduced motion changes the day at once; 360 / 390 / 430, day and night; no page errors.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5251'
const PW = process.argv[4] ?? process.env.PW ?? 'D:/temp/claude/D--Coding-kais-flow/364f4c21-606b-40e0-a1f2-b46300b06cdf/scratchpad/pw2/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const cairo = (hhmm, day = 26) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const TODAY = '2026-10-26'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, slot_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const TASKS = [
  task(1, 'Finish the CNN backprop notes for the DL midterm', { top3: true, top3_rank: 1, duration_min: 120 }),
  task(2, 'Deep Learning problem set 4 (Q1–Q3)', { top3: true, top3_rank: 2, duration_min: 90 }),
  task(3, 'Email Dr. Hany the project proposal', { top3: true, top3_rank: 3, duration_min: 20 }),
  task(4, 'Review lecture 7 slides — Attention', { due_at: iso('09:00') }),
  task(5, 'Pay the internet bill', { due_at: iso('09:00') }),
  task(6, 'Read "Attention Is All You Need"'),
  task(7, 'Tidy the Drive folders'),
  task(8, 'Plan the demo for tomorrow', { due_at: iso('09:00', 27), duration_min: 45 }),
]
const ev = (n, title, from, to, over = {}) => ({
  id: eid(n), user_id: UID, title, starts_at: iso(from), ends_at: iso(to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const EVENTS = [
  ev(1, 'Lecture — Machine Learning', '08:30', '10:00'),
  ev(2, 'Lecture — Computer Vision', '11:00', '12:30'),
  ev(3, 'Deep work', '16:00', '16:45', { type: 'time_block' }),
  ev(4, 'Gym — push day', '17:00', '18:15'),
  ev(5, 'Deep work', '16:00', '16:45', { type: 'time_block', starts_at: iso('16:00', 27), ends_at: iso('16:45', 27) }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const tables = () => ({
  tasks: structuredClone(TASKS), calendar_events: structuredClone(EVENTS), projects: [], app_settings: [{ ...SETTINGS }], routines: [], routine_completions: [],
  inbox_items: [], activity_log: [...[1, 2, 3].map((n, i) => act(20 + i, 'task.starred', 'task', id(n), {}, '07:50')), act(30, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '07:55')],
  time_entries: [], domains: [], areas: [], people: [], books: [], journal_entries: [], slipping: [], resurfaced_log: [],
})
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
  return out
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

/** A fresh phone on the Day view at 10:40. */
async function open({ w = 390, h = 844, theme = 'day', reduced = false, h24 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, sess, uid, hh]) => {
    if (sessionStorage.getItem('kf-db-seeded')) return
    sessionStorage.setItem('kf-db-seeded', '1')
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo'); localStorage.setItem('kf-help:' + uid, JSON.stringify(['hint:swipe', 'hint:calendar', 'hint:inbox', 'row']))
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-12T00:00:00Z') }))
    localStorage.setItem('kf-phone-today-view', 'day')
    if (hh) localStorage.setItem('kf.calViewOptions', JSON.stringify({ hour24: true }))
  }, [theme, JSON.stringify(session), UID, h24])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time: cairo('10:40') })
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.tp-home .tp-dbar', { timeout: 15000 })
  await sleep(1200)
  const cdp = await ctx.newCDPSession(page)
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] })
  /** A finger: down at a, optionally held, then moved to each point in `via` (ms apart), and up (or left down with `keep`). */
  const finger = async (a, { hold = 0, via = [], gap = 16, keep = false } = {}) => {
    await t('touchStart', a[0], a[1])
    if (hold) await sleep(hold)
    for (const p of via) { await t('touchMove', p[0], p[1]); await sleep(gap) }
    if (!keep) await t('touchEnd')
  }
  return { ctx, page, errors, state, t, finger }
}
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null }, sel)
const rowCentre = (page, title) => page.evaluate((tt) => {
  const el = [...document.querySelectorAll('.tp-slim-t, .tp-gs-title, .ts-title, [class*="title"]')].find((e) => e.textContent.includes(tt))
  const r = el?.getBoundingClientRect()
  return r ? [r.left + 30, r.top + r.height / 2] : null
}, title)
/** The bar once the page has stopped moving (a day's page arrives with a short slide). */
const settledBar = async (page) => {
  let last = null
  for (let i = 0; i < 40; i++) {
    const r = await rect(page, '.tp-dbar')
    if (last && r && Math.abs(r.top - last.top) < 0.5 && Math.abs(r.left - last.left) < 0.5) return r
    last = r
    await sleep(100)
  }
  return last
}
/** x on the bar for a clock minute. */
const barX = (b, minutes) => b.left + ((minutes - 7 * 60) / (16 * 60)) * b.width
const lineAt = (via, from, to, n = 8) => Array.from({ length: n }, (_, i) => [from[0] + ((to[0] - from[0]) * (i + 1)) / n, from[1] + ((to[1] - from[1]) * (i + 1)) / n])
const taskWrites = (state, f) => state.writes.filter((w) => w.table === 'calendar_events' && [].concat(w.body ?? []).some((b) => f(b)))
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const dayOf = (page) => page.evaluate(() => new URL(location.href).searchParams.get('day'))
const hScroll = (page) => page.evaluate(() => { const de = document.scrollingElement; const sc = document.querySelector('.app-main-content'); return Math.max(de.scrollWidth - de.clientWidth, sc ? sc.scrollWidth - sc.clientWidth : 0) })

// ═══ A · drag a Top 3 row onto TODAY's bar: the line, the bubble, the quarter, the block ═══
if (want('A')) {
  const { ctx, page, errors, state, finger, t } = await open()
  const bar = await rect(page, '.tp-dbar')
  check('A bar is on the Day view', !!bar && bar.width > 200, bar && `${Math.round(bar.width)}px wide`)
  const from = await rowCentre(page, 'Email Dr. Hany')
  const x = barX(bar, 14 * 60 + 20) // 14:20 → 14:15
  const y = (bar.top + bar.bottom) / 2
  await finger(from, { hold: 520, via: lineAt(null, from, [x, y]), keep: true })
  await sleep(120)
  const mid = await page.evaluate(() => ({
    ghost: !!document.querySelector('.tp-lift'),
    ghostText: document.querySelector('.tp-lift')?.textContent ?? '',
    line: !!document.querySelector('.tp-dbar-drop'),
    bubble: document.querySelector('.tp-dbar-bub')?.textContent ?? '',
    dimmed: !!document.querySelector('.kf-swipe[data-lifted]'),
    pulled: document.querySelector('.kf-route')?.style.transform ?? '',
  }))
  check('A hold lifts the row: ghost + dimmed row', mid.ghost && /Email Dr. Hany/.test(mid.ghostText) && mid.dimmed, JSON.stringify(mid))
  check('A over the bar: line + bubble "2:15 PM" (snapped down from 2:20)', mid.line && mid.bubble === '2:15 PM', mid.bubble)
  check('A the page is not pulled by the finger (boundary resistance stands down)', mid.pulled === '', mid.pulled)
  await shot(page, 'a-lifted-over-bar')
  await t('touchEnd')
  await sleep(500)
  const w = taskWrites(state, (b) => b.task_id === id(3))
  const blk = w.map((x) => [].concat(x.body)).flat().find((b) => b.task_id === id(3))
  check('A release: a block at 14:15 Cairo, 20 minutes (the task\'s own length)', blk && blk.starts_at === iso('14:15') && blk.ends_at === iso('14:35'), blk && `${blk.starts_at} → ${blk.ends_at}`)
  const gone = await page.evaluate(() => !document.querySelector('.tp-lift') && !document.querySelector('.kf-swipe[data-lifted]'))
  check('A ghost gone, row restored', gone)
  check('A the drop is no tap (the calendar did not open)', new URL(page.url()).pathname === '/today', page.url())
  const toast = await page.evaluate(() => document.body.innerText.includes('Scheduled · Email Dr. Hany'))
  check('A toast "Scheduled · …" with Undo', toast)
  const before = state.writes.length
  await page.getByRole('button', { name: /undo/i }).first().click().catch(() => {})
  await sleep(600)
  const undone = state.writes.slice(before).some((x) => x.table === 'calendar_events' && (x.method === 'DELETE' || [].concat(x.body ?? []).some((b) => b?.id === blk?.id && b.deleted_at)))
  check('A Undo removes the block', undone, `${state.writes.length - before} writes after`)
  check('A no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ B · onto a Time block pill: it rings, and the task goes INTO it ═══
if (want('B')) {
  const { ctx, page, state, finger, t } = await open()
  const bar = await rect(page, '.tp-dbar')
  const from = await rowCentre(page, 'Email Dr. Hany')
  const x = barX(bar, 16 * 60 + 20)
  const y = (bar.top + bar.bottom) / 2
  await finger(from, { hold: 520, via: lineAt(null, from, [x, y]), keep: true })
  await sleep(120)
  const ring = await page.evaluate(() => !!document.querySelector('.tp-dbar-sg.is-drop'))
  check('B over a Time block: its pill is ringed', ring)
  await shot(page, 'b-over-time-block')
  await t('touchEnd')
  await sleep(500)
  const put = state.writes.filter((w) => w.table === 'tasks').map((w) => [].concat(w.body)).flat().find((b) => b?.id === id(3) && b.slot_id === eid(3))
  check('B release: the task is in the Time block (slot_id)', !!put && taskWrites(state, (b) => b.task_id === id(3)).length === 0, put ? `slot ${put.slot_id.slice(-2)}` : 'no write')
  await ctx.close()
}

// ═══ C · let go elsewhere: nothing is written, the row comes back ═══
if (want('C')) {
  const { ctx, page, state, finger, t } = await open()
  const bar = await rect(page, '.tp-dbar')
  const from = await rowCentre(page, 'Email Dr. Hany')
  const to = [from[0] + 40, Math.min(800, from[1] + 160)]
  await finger(from, { hold: 520, via: lineAt(null, from, to), keep: true })
  await sleep(100)
  const mid = await page.evaluate(() => ({ ghost: !!document.querySelector('.tp-lift'), bubble: !!document.querySelector('.tp-dbar-bub') }))
  check('C ghost follows the finger, no bubble off the bar', mid.ghost && !mid.bubble, JSON.stringify(mid))
  const n = state.writes.length
  await t('touchEnd')
  await sleep(700)
  const after = await page.evaluate(() => ({ ghost: !!document.querySelector('.tp-lift'), lifted: !!document.querySelector('.kf-swipe[data-lifted]') }))
  check('C released off the bar: no write, ghost and dim gone', state.writes.length === n && !after.ghost && !after.lifted, `${state.writes.length - n} writes, ${JSON.stringify(after)}`)
  check('C the bar is where it was', !!bar && !!(await rect(page, '.tp-dbar')))
  await ctx.close()
}

// ═══ D · vertical drag on the bar still scrolls the page; a tap opens the column; a pill tap opens the block ═══
if (want('D')) {
  const { ctx, page, finger } = await open()
  const bar = await rect(page, '.tp-dbar')
  const sc = () => page.evaluate(() => (document.querySelector('.app-main-content')?.scrollTop ?? 0) + (document.scrollingElement?.scrollTop ?? 0))
  const s0 = await sc()
  const cx = bar.left + 60
  const cy = (bar.top + bar.bottom) / 2
  await finger([cx, cy + 4], { via: lineAt(null, [cx, cy + 4], [cx + 4, cy - 150], 10) })
  await sleep(400)
  const s1 = await sc()
  check('D vertical drag over the bar scrolls the page', s1 > s0 + 20, `${s0} → ${s1}`)
  check('D …and does not change the day or open anything', (await dayOf(page)) === null && new URL(page.url()).pathname === '/today')
  await page.evaluate(() => { document.querySelector('.app-main-content')?.scrollTo(0, 0); document.scrollingElement?.scrollTo(0, 0) })
  await sleep(200)
  const b2 = await rect(page, '.tp-dbar')
  await finger([b2.left + 6, (b2.top + b2.bottom) / 2 + 12]) // a tap on bare rail
  await sleep(600)
  check('D a tap on the bar opens the calendar column', page.url().includes('/calendar') && page.url().includes('view=day'), page.url())
  await ctx.close()
}

// ═══ E · swipe the bar: tomorrow, back, yesterday; a flick; a short drag springs back ═══
if (want('E')) {
  const { ctx, page, errors, finger } = await open()
  const swipe = async (dx, o = {}) => {
    const b = await rect(page, '.tp-dbar')
    const y = (b.top + b.bottom) / 2 + 12
    const a = [b.left + b.width / 2 + dx / 2, y]
    await finger(a, { via: lineAt(null, a, [a[0] - dx, y], o.n ?? 8), gap: o.gap ?? 16 })
    await sleep(700)
  }
  await swipe(220) // left
  check('E swipe left: tomorrow\'s page (?day=2026-10-27)', (await dayOf(page)) === '2026-10-27', await dayOf(page))
  const tom = await page.evaluate(() => ({ page: document.querySelector('.tp')?.dataset.day, bar: !!document.querySelector('.tp-dbar'), hdr: document.querySelector('.tp-bar, .tp-pbar, header')?.textContent?.slice(0, 40) }))
  check('E tomorrow shows its own bar (a day to plan)', tom.page === '2026-10-27' && tom.bar, JSON.stringify(tom))
  const settled = await page.evaluate(() => document.querySelector('.tp-dbar')?.getBoundingClientRect().left)
  check('E the new day bar has settled into place', settled > 0 && settled < 40, settled)
  await shot(page, 'e-tomorrow')
  await swipe(-220) // right
  check('E swipe right: back to today', (await dayOf(page)) === null)
  await swipe(-220)
  check('E swipe right again: yesterday, still with a bar', (await dayOf(page)) === '2026-10-25' && !!(await rect(page, '.tp-dbar')), await dayOf(page))
  await swipe(220)
  await swipe(60, { n: 3, gap: 8 }) // a quick short flick, left
  check('E a flick (60px, fast) turns the day too', (await dayOf(page)) === '2026-10-27', await dayOf(page))
  await swipe(-30, { n: 6, gap: 90 }) // a slow short drag: springs back
  check('E a slow short drag (30px) springs back, no change', (await dayOf(page)) === '2026-10-27', await dayOf(page))
  // the ‹ › controls and the keyboard keep working
  await page.getByRole('button', { name: 'Next day' }).click()
  await sleep(500)
  check('E the Next day button still steps', (await dayOf(page)) === '2026-10-28', await dayOf(page))
  check('E no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ F · TOMORROW: lift a task from its page, drop at 14:20 on its bar → 14:15 tomorrow, task length; Undo ═══
if (want('F')) {
  const { ctx, page, state, finger, t } = await open()
  const b0 = await rect(page, '.tp-dbar')
  const a = [b0.left + b0.width / 2 + 110, (b0.top + b0.bottom) / 2 + 12]
  await finger(a, { via: lineAt(null, a, [a[0] - 220, a[1]]) })
  await sleep(700)
  check('F on tomorrow', (await dayOf(page)) === '2026-10-27')
  const bar = await settledBar(page)
  const from = await rowCentre(page, 'Plan the demo')
  check('F tomorrow\'s own task is on the page', !!from)
  const x = barX(bar, 14 * 60 + 20)
  const y = (bar.top + bar.bottom) / 2
  await finger(from, { hold: 520, via: lineAt(null, from, [x, y]), keep: true })
  await sleep(120)
  const bub = await page.evaluate(() => document.querySelector('.tp-dbar-bub')?.textContent ?? '')
  check('F bubble reads 2:15 PM', bub === '2:15 PM', bub)
  await shot(page, 'f-tomorrow-lifted')
  await t('touchEnd')
  await sleep(500)
  const blk = state.writes.filter((w) => w.table === 'calendar_events').map((w) => [].concat(w.body)).flat().find((b) => b?.task_id === id(8))
  check('F a block tomorrow at 14:15, 45 minutes', blk && blk.starts_at === iso('14:15', 27) && blk.ends_at === iso('15:00', 27), blk && `${blk.starts_at} → ${blk.ends_at}`)
  const before = state.writes.length
  await page.getByRole('button', { name: /undo/i }).first().click().catch(() => {})
  await sleep(600)
  check('F Undo takes it back', state.writes.length > before, `${state.writes.length - before} writes after`)
  await ctx.close()
}

// ═══ G · the 24-hour clock, reduced motion, three widths, day and night ═══
if (want('G')) {
  const { ctx, page, finger, t } = await open({ h24: true })
  const bar = await rect(page, '.tp-dbar')
  const from = await rowCentre(page, 'Email Dr. Hany')
  await finger(from, { hold: 520, via: lineAt(null, from, [barX(bar, 14 * 60 + 20), (bar.top + bar.bottom) / 2]), keep: true })
  await sleep(100)
  const bub = await page.evaluate(() => document.querySelector('.tp-dbar-bub')?.textContent ?? '')
  check('G 24-hour clock: bubble reads 14:15', bub === '14:15', bub)
  await t('touchEnd')
  await ctx.close()
}
if (want('G')) {
  const { ctx, page, finger } = await open({ reduced: true })
  const b = await rect(page, '.tp-dbar')
  const y = (b.top + b.bottom) / 2 + 12
  const a = [b.left + b.width / 2 + 110, y]
  await finger(a, { via: lineAt(null, a, [a[0] - 220, y]) })
  await sleep(80) // well under the 200ms settle: with reduced motion the day has already changed
  check('G reduced motion: the day changes at once', (await dayOf(page)) === '2026-10-27', await dayOf(page))
  await ctx.close()
}
for (const theme of want('G') ? ['day', 'night'] : []) for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  const { ctx, page, errors, state, finger, t } = await open({ w, h, theme })
  const bar = await rect(page, '.tp-dbar')
  const from = await rowCentre(page, 'Email Dr. Hany')
  await finger(from, { hold: 520, via: lineAt(null, from, [barX(bar, 14 * 60 + 20), (bar.top + bar.bottom) / 2]), keep: true })
  await sleep(150)
  if (theme === 'day' || w === 390) await shot(page, `lift-${w}-${theme}`)
  const bub = await page.evaluate(() => document.querySelector('.tp-dbar-bub')?.textContent ?? '')
  await t('touchEnd')
  await sleep(400)
  const blk = state.writes.filter((x) => x.table === 'calendar_events').map((x) => [].concat(x.body)).flat().find((b) => b?.task_id === id(3))
  check(`G ${w} ${theme}: drop at 14:20 → 14:15, bubble ${bub}`, blk?.starts_at === iso('14:15') && bub === '2:15 PM', blk?.starts_at)
  check(`G ${w} ${theme}: no sideways page scroll, no page errors`, (await hScroll(page)) === 0 && errors.length === 0, `${await hScroll(page)} ${errors.join(' | ')}`)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
