// worth-fireworks (2026-10-31): Worth a look as a deck (Kai's B) and the goal tick's fireworks (Kai's C4),
// plus the P1 fix: a ticked goal of the day stays the goal. Mocked backend (today-shell's mock, copied).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5344] [playwright-core path]
// The day: Saturday 31 Oct 2026, 10:00 Cairo. Desktop 1280×800, phone 390×844.
//
// Checks: the deck's arrows ("1 of 7", Previous off at the start), dots, sheets behind, ←/→ with focus, a swipe on
// the phone with the next card peeking; Plan a step ("#Sotto " in the Add bar; an area opens its page); Snooze a
// week slides out + Undo brings it back, no review written; one item = no arrows/dots/sheets; the empty line.
// Fireworks: nothing on load; a goal tick puts the layer up (sparks above the card, on the body, unclipped), gone
// after 2 s; reduced motion = the glow only; Undo plays nothing; the phone's layer stops at the top bar.
// The goal stays the goal: the unranked picks (no star log at all) are ranked on the tick, the done goal keeps
// the goal card struck through, and after a reload too.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5344'
const PW = process.argv[4] ?? 'D:/temp/claude/D--Coding-kais-flow/364f4c21-606b-40e0-a1f2-b46300b06cdf/scratchpad/pw/node_modules/playwright-core/index.mjs'
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
const UID = '00000000-0000-4000-8000-00000000f1e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const DAY = 31
const cairo = (hhmm, day = DAY) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 9, day, h - 3, m)) }
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const TODAY = '2026-10-31'
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pid = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  slot_id: null, slot_date: null, created_at: CREATED, updated_at: CREATED, ...over,
})
const GOAL = 1, P2 = 2, P3 = 3
const GOAL_TITLE = 'Finish the OS study guide, chapters 1–3'
// The P1 case: three picks, none ranked, and no star log — the goal is the first by its day order.
const TASKS = [
  task(GOAL, GOAL_TITLE, { top3: true, due_at: iso('09:00'), duration_min: 120, created_at: iso('07:00', 20) }),
  task(P2, 'Study VLSI lecture 4', { top3: true, due_at: iso('12:00'), duration_min: 90, created_at: iso('07:00', 21) }),
  task(P3, 'Gym — pull day', { top3: true, due_at: iso('18:00'), duration_min: 60, created_at: iso('07:00', 22) }),
  task(4, 'Reply to Salma'),
]
const project = (p, name) => ({ id: p, user_id: UID, domain_id: null, name, type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED, deleted_at: null })
const PROJECTS = [project(pid(1), 'Sotto'), project(pid(2), 'Sukoon'), project(pid(3), 'Career'), project(pid(4), 'Freelance'), project(pid(5), 'Auto Pricing app')]
const AREA = pid(11), DOMAIN = pid(21)
const AREAS = [{ id: AREA, user_id: UID, name: 'Learning up', domain_id: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const slip = (type, eid, name, d) => ({ entity_type: type, entity_id: eid, entity_name: name, last_touch: iso('09:00', DAY - d), days_since: d })
const SLIPPING = [
  slip('project', pid(1), 'Sotto', 19), slip('project', pid(2), 'Sukoon', 16), slip('project', pid(3), 'Career', 14),
  slip('area', AREA, 'Learning up', 13), slip('project', pid(4), 'Freelance', 12), slip('domain', DOMAIN, 'Deen', 9), slip('project', pid(5), 'Auto Pricing app', 10),
]
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: UID, event_type, entity_type, entity_id, payload, created_at: iso(at) })
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', help_seen: ['tour', 'hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks', 'hint:swipe'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(s) {
  const log = ['overdue', 'inbox', 'top3', 'block'].map((step, i) => act(30 + i, 'ritual.step_completed', 'ritual', `morning-${TODAY}`, { ritual: 'morning', step, date: TODAY }, '08:15'))
  log.push(act(1, 'ritual.finished', 'ritual', `morning-${TODAY}`, { ritual: 'morning', date: TODAY, steps: ['overdue', 'inbox', 'top3', 'block'] }, '08:20'))
  return {
    tasks: structuredClone(TASKS), calendar_events: [], projects: PROJECTS, areas: AREAS, domains: [], app_settings: [SETTINGS], routines: [], routine_completions: [],
    inbox_items: [], activity_log: log, time_entries: [], people: [], resurfaced_log: [],
    slipping: s.slipping ?? SLIPPING,
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
  return out
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(s = {}, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', reducedMotion: o.reduced ? 'reduce' : 'no-preference' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.parse('2026-10-31T00:00:00Z') }))
    // Every fireworks layer ever put up, from the first paint on (load, sync, Undo all count).
    window.__fw = 0
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('kf-goal-fw')) window.__fw++ })
      .observe(document, { childList: true, subtree: true })
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = o.state ?? { rows: tables(s), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      const rows = (state.rows[table] ??= [])
      if (req.method() === 'DELETE') {
        const gone = url.searchParams.get('id')?.replace(/^eq\./, '')
        state.rows[table] = rows.filter((x) => x.id !== gone)
      } else if (body && typeof body === 'object') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const i = rows.findIndex((x) => x.id === row.id)
          if (i === -1) rows.push(row)
          else rows[i] = { ...rows[i], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo(o.at ?? '10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${o.path ?? '/today'}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) { n = state.writes.length; await sleep(400) }
}
const fwCount = (page) => page.evaluate(() => window.__fw)
const fwLive = (page) => page.locator('.kf-goal-fw').count()
const goalCard = (page, phoneView) => page.locator(phoneView ? '.tp-gs' : '.kf-goal-row').first()
const goalTitle = (page, phoneView) => text(page.locator(phoneView ? '.tp-gs-title' : '.td-goal-title'))

// ── D · the deck on a computer ──
if (want('d')) {
  const { ctx, page, errors, state } = await open()
  const worth = page.locator('.td-rail section[aria-label="Worth a look"]')
  const count = () => text(worth.locator('.td-deck-count'))
  const name = () => text(worth.locator('.td-nudge-name'))
  const prev = worth.getByRole('button', { name: 'Previous' }), next = worth.getByRole('button', { name: 'Next' })
  check('d the deck: "1 of 7", Previous off, Next on', (await count()) === '1 of 7' && (await prev.isDisabled()) && !(await next.isDisabled()), await count())
  check('d …7 dots, the first on', (await worth.locator('.td-deck-dots i').count()) === 7 && (await worth.locator('.td-deck-dots i.is-on').count()) === 1)
  check('d …two sheets stacked behind the card', (await worth.locator('.td-deck-sh').count()) === 2)
  check('d …the oldest first: Sotto, 19 days', (await name()) === 'Sotto' && /untouched for 19 days/.test(await text(worth.locator('.td-nudge-why'))))
  await worth.scrollIntoViewIfNeeded()
  await shot(page, 'd-deck-desktop')
  await next.click()
  await sleep(300)
  check('d Next → "2 of 7", Sukoon, the second dot on, Previous on', (await count()) === '2 of 7' && (await name()) === 'Sukoon' && (await worth.locator('.td-deck-dots i').nth(1).getAttribute('class')) === 'is-on' && !(await prev.isDisabled()))
  await worth.focus()
  await page.keyboard.press('ArrowRight')
  await sleep(200)
  const k1 = await count()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await sleep(200)
  check('d ←/→ with the deck focused step it (→ 3 of 7, ←← 1 of 7); the day stays', k1 === '3 of 7' && (await count()) === '1 of 7' && page.url().endsWith('/today'), `${k1} / ${await count()}`)
  for (let i = 0; i < 6; i++) await next.click()
  check('d …at the last card Next is off, no sheets behind', (await count()) === '7 of 7' && (await next.isDisabled()) && (await worth.locator('.td-deck-sh').count()) === 0)
  check('d accessible: a labelled region, arrows named, the count live', (await worth.getAttribute('aria-roledescription')) === 'carousel' && (await worth.locator('.td-deck-count').getAttribute('aria-live')) === 'polite')
  await prev.click(); await prev.click(); await prev.click(); await prev.click(); await prev.click(); await prev.click()

  // Plan a step: a project → the Add bar with its #tag; an area → its page.
  await worth.getByRole('button', { name: 'Plan a step' }).click()
  await sleep(600)
  const field = await page.evaluate(() => { const el = document.getElementById('kf-capture-input'); return el && { value: el.value, caret: el.selectionStart, focused: document.activeElement === el } })
  check('d Plan a step (Sotto) → the Add bar opens on "#Sotto ", caret after it', field?.focused && field.value === '#Sotto ' && field.caret === 7, JSON.stringify(field))
  await shot(page, 'd-plan-a-step')
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  await sleep(300)
  if (await page.locator('.kf-cmd-scrim').count()) { await page.keyboard.press('Escape'); await sleep(300) }
  if (await page.locator('.kf-cmd-scrim').count()) { await page.locator('.kf-cmd-scrim').click({ position: { x: 5, y: 5 } }); await sleep(400) }

  // Snooze a week: slides out, Undo puts it back, no review written.
  const w0 = state.writes.length
  await worth.getByRole('button', { name: 'Snooze a week' }).click()
  check('d Snooze a week → "Snoozed a week" toast', await toastSoon(page, 'Snoozed a week'))
  await sleep(500)
  check('d …Sotto slid out: "1 of 6", Sukoon now', (await count()) === '1 of 6' && (await name()) === 'Sukoon', `${await count()} ${await name()}`)
  await page.locator('.kf-toast').getByRole('button', { name: /Undo/ }).first().click()
  await sleep(700)
  check('d …Undo brings it back: "1 of 7", Sotto', (await count()) === '1 of 7' && (await name()) === 'Sotto', `${await count()} ${await name()}`)
  await sleep(4600)
  check('d …and no review is written after an Undo', !posts(state, 'activity_log', w0).some((a) => a.event_type === 'entity.reviewed'))
  await worth.getByRole('button', { name: 'Snooze a week' }).click()
  await sleep(5200)
  await settle(state)
  check('d a Snooze left alone writes the review (it returns after a week while untouched)', posts(state, 'activity_log', w0).some((a) => a.event_type === 'entity.reviewed' && a.entity_id === pid(1)))
  // An area's Plan a step opens its page.
  for (let i = 0; i < 2; i++) await next.click()
  await sleep(200)
  const areaName = await name()
  await worth.getByRole('button', { name: 'Plan a step' }).click()
  await sleep(800)
  check(`d an area's Plan a step (${areaName}) opens its page`, areaName === 'Learning up' && page.url().includes(`/projects/${AREA}`), page.url())
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── O · one item, and none ──
if (want('o')) {
  {
    const { ctx, page, errors } = await open({ slipping: [SLIPPING[0]] })
    const worth = page.locator('.td-rail section[aria-label="Worth a look"]')
    check('o one item: the card, no arrows, no dots, no sheets', (await worth.locator('.td-nudge').count()) === 1 && (await worth.getByRole('button', { name: 'Next' }).count()) === 0 && (await worth.locator('.td-deck-dots').count()) === 0 && (await worth.locator('.td-deck-sh').count()) === 0)
    await shot(page, 'o-one-desktop')
    check('o no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors } = await open({ slipping: [] })
    const worth = page.locator('.td-rail section[aria-label="Worth a look"]')
    check('o none: "Nothing slipping. Everything was touched this week."', /Nothing slipping\. Everything was touched this week\./.test(await text(worth.locator('.td-worth-empty'))))
    await shot(page, 'o-empty-desktop')
    check('o none: no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P · the deck on the phone: the next card peeks, a swipe steps ──
if (want('p')) {
  const { ctx, page, cdp, errors } = await open({}, { view: phone })
  const worth = page.locator('section.td-worth.is-phone')
  await worth.scrollIntoViewIfNeeded()
  await sleep(300)
  const count = () => text(worth.locator('.td-deck-count'))
  check('p the phone deck: "1 of 7", the next card peeking, "swipe for the next"', (await count()) === '1 of 7' && (await worth.locator('.td-car-peek').count()) === 1 && /swipe for the next/.test(await text(worth.locator('.td-swipe'))))
  const card = await worth.locator('.td-car .td-deck-card').boundingBox(), peek = await worth.locator('.td-car-peek').boundingBox(), car = await worth.locator('.td-car').boundingBox()
  check('p …the peek sits right of the card, cut off at the screen edge', peek && card && peek.x > card.x + card.width && peek.x < 390 && Math.abs(car.x + car.width - 390) <= 1, JSON.stringify({ card, peek, car }))
  const arrow = await worth.getByRole('button', { name: 'Next' }).boundingBox()
  check('p …phone arrows are 36 px', arrow && Math.round(arrow.width) === 36, JSON.stringify(arrow))
  await shot(page, 'p-deck-phone')
  const y = card.y + card.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card.x + card.width - 30, y }] })
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: card.x + card.width - 30 - k * 25, y }] }); await sleep(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
  check('p a swipe left → "2 of 7" (and the card did not open)', (await count()) === '2 of 7' && page.url().endsWith('/today'), `${await count()} ${page.url()}`)
  check('p no sideways page scroll', await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── F · the fireworks on a goal tick, and the goal stays the goal ──
async function tick(page, phoneView) {
  await goalCard(page, phoneView).locator('[role="checkbox"]').first().click()
}
if (want('f')) {
  const { ctx, page, errors, state } = await open()
  await sleep(1200)
  check('f nothing plays on load (or the first sync)', (await fwCount(page)) === 0)
  const before = await goalTitle(page)
  check('f the goal card shows the first pick (no ranks, no star log)', before === GOAL_TITLE, before)
  const cardBox = await goalCard(page).boundingBox()
  const w0 = state.writes.length
  await tick(page)
  await sleep(60)
  check('f a goal tick puts the layer up', (await fwLive(page)) === 1 && (await fwCount(page)) === 1)
  const layer = await page.evaluate(() => { const l = document.querySelector('.kf-goal-fw'); const cs = getComputedStyle(l); return { parent: l.parentElement.tagName, pos: cs.position, w: l.getBoundingClientRect().width, clip: cs.clipPath } })
  check('f …on the body, fixed over the whole window (never clipped by the card)', layer.parent === 'BODY' && layer.pos === 'fixed' && layer.w === 1280 && layer.clip === 'none', JSON.stringify(layer))
  await sleep(560)
  await shot(page, 'f-fireworks-desktop')
  await sleep(240)
  const sparks = await page.evaluate(() => [...document.querySelectorAll('.kf-goal-fw span')].filter((s) => s.style.background && !s.style.backgroundImage && +getComputedStyle(s).opacity > 0.05).map((s) => s.getBoundingClientRect().top))
  const highest = Math.min(...sparks)
  check('f …bursts of sparks above the card (~0.9 s in)', sparks.length >= 10 && highest < cardBox.y - 20, `sparks=${sparks.length} highest=${Math.round(highest)} cardTop=${Math.round(cardBox.y)}`)
  await sleep(1150)
  check('f …and it is gone by 2 s', (await fwLive(page)) === 0)
  await settle(state)
  const goalWrites = posts(state, 'tasks', w0).filter((t) => t.id === id(GOAL))
  check('f the tick ranks the picks first: goal 1, then 2, 3', goalWrites.some((t) => t.top3_rank === 1) && posts(state, 'tasks', w0).some((t) => t.id === id(P2) && t.top3_rank === 2) && posts(state, 'tasks', w0).some((t) => t.id === id(P3) && t.top3_rank === 3), JSON.stringify(posts(state, 'tasks', w0).map((t) => [t.title, t.status, t.top3, t.top3_rank])))
  check('f …the done goal keeps rank 1', goalWrites.at(-1)?.status === 'done' && goalWrites.at(-1)?.top3_rank === 1, JSON.stringify(goalWrites.at(-1)))
  await sleep(500)
  check('f the goal card still holds the goal, struck through', (await goalTitle(page)) === GOAL_TITLE && (await page.locator('.td-goal-title.is-done').count()) === 1)
  await shot(page, 'f-goal-done-desktop')
  // Undo plays nothing; a reload still shows the done goal as the goal (from the rows alone).
  const n0 = await fwCount(page)
  await page.locator('.kf-toast').getByRole('button', { name: /Undo/ }).first().click().catch(() => {})
  await sleep(800)
  check('f Undo plays nothing', (await fwCount(page)) === n0)
  await tick(page)
  await sleep(2200)
  await settle(state)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(2000)
  check('f after a reload the done goal is still the goal (no star log needed)', (await goalTitle(page)) === GOAL_TITLE && (await page.locator('.td-goal-title.is-done').count()) === 1 && (await fwCount(page)) === 0, await goalTitle(page))
  check('f no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── R · reduced motion: the glow only ──
if (want('r')) {
  const { ctx, page, errors } = await open({}, { reduced: true })
  await tick(page)
  await sleep(80)
  const inside = await page.evaluate(() => { const l = document.querySelector('.kf-goal-fw'); return l && { stage: l.children.length, inStage: l.children[0]?.children.length, glow: l.children[0]?.children[0]?.style.background.includes('radial-gradient') } })
  check('r reduced motion: the layer holds the glow only — no shells, no sparks', inside && inside.stage === 1 && inside.inStage === 1 && inside.glow, JSON.stringify(inside))
  await sleep(1300)
  check('r …gone once the glow fades', (await fwLive(page)) === 0)
  check('r no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Q · the phone: the slim goal card, the layer stops at the top bar ──
if (want('q')) {
  const { ctx, page, errors } = await open({}, { view: phone })
  check('q phone: nothing on load', (await fwCount(page)) === 0)
  const bar = await page.locator('.tp-bar').boundingBox()
  await tick(page, true)
  await sleep(620)
  const clip = await page.evaluate(() => getComputedStyle(document.querySelector('.kf-goal-fw')).clipPath)
  await shot(page, 'q-fireworks-phone')
  check('q a goal tick plays; the layer is clipped at the top bar\'s bottom edge', /inset\(/.test(clip) && Math.abs(parseFloat(clip.match(/inset\(([\d.]+)px/)?.[1]) - (bar.y + bar.height)) <= 1, `${clip} bar=${bar.y + bar.height}`)
  await sleep(1500)
  check('q …gone by 2 s; the goal stays the goal, done', (await fwLive(page)) === 0 && (await goalTitle(page, true)) === GOAL_TITLE && (await page.locator('.tp-gs-title.is-done').count()) === 1)
  check('q no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
