// goal-check (2026-11-06): a ticked goal of the day shows a solid gold box with a parchment tick — not a pale/white square.
// Cause: the desktop GoalCard kept the pale 50% parchment fill (and the bloom's `checking` stays true after completion, so the
// DoneCheck chip never even showed). One goalBox(ticked) style now serves desktop, phone and slim cards.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5354] [playwright-core path]
// Checks: before the tick the box is the hollow pale gold-bordered one; after the tick (day, night; desktop 1280, phone 390 Now/Day)
// its computed background is opaque, equals --acc-gold, contrasts the card (>= 2:1) and the tick contrasts the box; same after reload.
// Mocked backend (worth-fireworks' mock, copied).
// Checks: the deck's arrows ("1 of 7", Previous off at the start), dots, sheets behind, ←/→ with focus, a swipe on
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5354'
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
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1'); localStorage.setItem('kf_undo_toasts', 'all') // these assert the toast wording (Settings → Undo toasts: All); quiet-undo has its own
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


// ── the goal's box, before and after the tick ──
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const rgba = (s) => (s.match(/[\d.]+/g) ?? []).map(Number)

/** The goal's checkbox: computed background, its alpha, the tick colour, the card's own paper and --acc-gold, all as rgb. */
async function probe(page, phoneView) {
  return page.evaluate((ph) => {
    const card = document.querySelector(ph ? '.tp-gs-in' : '.kf-goal-row .kf-page') ?? document.querySelector(ph ? '.tp-gs' : '.kf-goal-row')
    const box = card.querySelector('[role="checkbox"]')
    const probeColor = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v }
    const cs = getComputedStyle(box)
    return { bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow, opacity: cs.opacity, paper: getComputedStyle(card).backgroundColor, gold: probeColor('var(--acc-gold)'), checked: box.getAttribute('aria-checked'), svg: !!box.querySelector('svg') }
  }, phoneView)
}
function judge(label, p) {
  const bg = rgba(p.bg), paper = rgba(p.paper), mark = rgba(p.color)
  const opaque = bg.length === 3 || bg[3] === 1
  const sameGold = p.bg === p.gold
  const vsCard = ratio(bg.slice(0, 3), paper.slice(0, 3)), vsMark = ratio(bg.slice(0, 3), mark.slice(0, 3))
  check(`${label}: ticked box is opaque gold (not white/transparent), tick drawn`, opaque && sameGold && p.checked === 'true' && p.svg && p.opacity === '1', `${p.bg} vs gold ${p.gold}, opacity ${p.opacity}`)
  check(`${label}: box contrasts the card >= 1.8:1 and the tick contrasts the box >= 1.8:1`, vsCard >= 1.8 && vsMark >= 1.8, `card ${vsCard.toFixed(2)}, tick ${vsMark.toFixed(2)}`)
}

for (const theme of ['day', 'night']) {
  for (const [name, view, ph, view2] of [['desktop', desktop, false, null], ['phone Now', phone, true, 'now'], ['phone Day', phone, true, 'day']]) {
    const { ctx, page, errors } = await open({}, { view, theme })
    if (view2) { await page.evaluate((v) => localStorage.setItem('kf-phone-today-view', v), view2); await page.reload({ waitUntil: 'networkidle' }); await sleep(1500) }
    const sel = ph ? '.tp-gs [role="checkbox"]' : '.kf-goal-row [role="checkbox"]'
    const tag = `${theme} ${name}`
    const slug = `${theme}-${name.replace(' ', '-').toLowerCase()}`
    const before = await probe(page, ph)
    check(`${tag}: before the tick the box is hollow`, before.checked === 'false', before.bg)
    await shot(page, `before-${slug}`)
    await page.locator(sel).first().click()
    await sleep(2500) // past the bloom hold and the fireworks
    const after = await probe(page, ph)
    judge(`${tag} (just ticked)`, after)
    await shot(page, `after-${slug}`)
    await page.reload({ waitUntil: 'networkidle' }); await sleep(1800)
    judge(`${tag} (after reload, done card)`, await probe(page, ph))
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
process.exit(results.some((r) => !r.ok) ? 1 : 0)
