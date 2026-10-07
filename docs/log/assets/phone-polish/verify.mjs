// Phone polish (Kai's 2026-10-07 phone review, screenshots at 390 CSS px) on the REAL app, signed in
// against a MOCKED backend — the today-phone recipe (docs/log/assets/today-phone/verify.mjs): the dev
// server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session sits
// in localStorage, and Playwright answers every REST call (a small PostgREST filter, so a detail page
// gets its own rows). Writes are answered 201, go nowhere, and are recorded. Touch emulation
// (hasTouch + isMobile), real CDP taps and holds; the mic is Chrome's fake device.
//   FULL:        node verify.mjs <outDir> [baseUrl] [playwright-core path]
//   AUDIT ONLY:  PHASE=before node verify.mjs <outDir> [baseUrl]   (shots + layout metrics, no pass/fail; before/ was made so)
//   ONE PART:    ONLY=audit|more|routines|capture|toast   ·   AUDIT_PAGES=routines,focus (audit a few pages)
//   TALL=1:      each page once at 390 × 2400, the whole page in one shot (reading aid)
// The audit measures, on every More page at 360 / 390 / 430, Day + Night: sideways scroll, text wrapping a
// word per line, the last content vs the tab bar's top, overlapping text, page errors (+ header / gutters /
// sub-48 targets recorded in audit-*.json).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5274'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const PHASE = process.env.PHASE ?? 'after'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000f0e1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data: a lived-in account (long-ish names on purpose — wrapping is what this audits) ──
const T = '2026-09-01T09:00:00Z'
const NOW = new Date()
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d)
const daysAgo = (n) => dayKey(new Date(NOW.getTime() - n * 86_400_000))
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DOMAIN = { id: id('d', 1), user_id: UID, name: 'Shaheen', color: '#C9A961', sort_order: 1, deleted_at: null, created_at: T, updated_at: T }
const project = (n, name, over = {}) => ({ id: id('b', n), user_id: UID, domain_id: DOMAIN.id, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], engagement_model: null, completion_summary: null, deleted_at: null, created_at: T, updated_at: T, ...over })
const PROJECTS = [
  project(1, "Kai's Flow — the phone polish pass", { milestones: [{ id: 'm1', title: 'Audit every page', weight: 1, completed: true }, { id: 'm2', title: 'Ship v1.0.23', weight: 1, completed: false }], checklist: [{ id: 'c1', title: 'Screenshots before / after', type: 'one-shot', completed: false }] }),
  project(2, 'Shaheen website relaunch'),
  project(3, 'Monthly bookkeeping', { type: 'retainer', engagement_model: 'monthly' }),
  project(4, 'Old portfolio site', { status: 'archived', completion_summary: 'Shipped and retired.' }),
]
const AREAS = [
  { id: id('c', 1), user_id: UID, domain_id: DOMAIN.id, name: 'Health & training', description: 'Body, sleep, gym', color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T },
  { id: id('c', 2), user_id: UID, domain_id: null, name: 'Home', description: null, color: null, sort_order: 1, deleted_at: null, created_at: T, updated_at: T },
]
const task = (n, title, over = {}) => ({
  id: id('a', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over,
})
const TASKS = [
  task(1, 'Audit the More pages at 360, 390 and 430', { project_id: PROJECTS[0].id, top3: true, due_at: NOW.toISOString() }),
  task(2, 'Send the Q3 numbers to Priya', { project_id: PROJECTS[1].id }),
  task(3, 'Reconcile September receipts', { project_id: PROJECTS[2].id }),
  task(4, 'Book the physio follow-up', { area_id: AREAS[0].id }),
  task(5, 'Fix the balcony tap', { area_id: AREAS[1].id }),
  task(6, 'Old idea I threw away', { deleted_at: daysAgo(1) + 'T08:00:00Z' }),
  task(7, 'Write the release notes', { project_id: PROJECTS[0].id, status: 'done', completed_at: daysAgo(1) + 'T10:00:00Z' }),
]
const cad = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const routine = (n, name, tod, over = {}) => ({ id: id('e', n), user_id: UID, name, time_of_day: tod, clock_time: null, cadence: cad, challenge_start: null, challenge_end: null, goal_days: null, active: true, steps: [], domain_id: null, created_at: '2026-08-01T06:00:00Z', updated_at: T, ...over })
const ROUTINES = [
  routine(1, 'Glass of water', 'morning', { clock_time: '07:00' }),
  routine(2, 'Stretch for ten minutes', 'morning', { clock_time: '07:15' }),
  routine(3, 'Read twenty pages of a book', 'morning'),
  routine(4, 'Walk around the block', 'afternoon'),
  routine(5, 'Tidy the desk', 'evening', { clock_time: '21:30' }),
  routine(6, 'Phone on the charger, out of the bedroom', 'evening'),
  routine(7, '30 days of no sugar', 'anytime', { challenge_start: daysAgo(9), challenge_end: daysAgo(-20), goal_days: 30 }),
]
const COMPLETIONS = []
let cn = 0
for (const r of ROUTINES) for (let d = 1; d <= (r.name.length % 7) + 2; d++) COMPLETIONS.push({ id: id('f', ++cn), user_id: UID, routine_id: r.id, completed_on: daysAgo(d), created_at: T })
COMPLETIONS.push({ id: id('f', ++cn), user_id: UID, routine_id: ROUTINES[0].id, completed_on: daysAgo(0), created_at: T })
const PEOPLE = [
  { id: id('9', 1), user_id: UID, name: 'Priya Raman', facts: [{ id: 'f1', label: 'Birthday', value: '12 March', date: '2026-03-12', recurs: true }, { id: 'f2', label: 'Works at', value: 'Shaheen Trading Co.' }], domain_id: DOMAIN.id, created_at: T, updated_at: T },
  { id: id('9', 2), user_id: UID, name: 'Omar El-Sayed', facts: [{ id: 'f3', label: 'Kids', value: 'Two — Laila and Youssef' }], domain_id: null, created_at: T, updated_at: T },
  { id: id('9', 3), user_id: UID, name: 'Mum', facts: [], domain_id: null, created_at: T, updated_at: T },
]
const INTERACTIONS = [
  { id: id('8', 1), user_id: UID, person_id: PEOPLE[0].id, summary: 'Coffee — talked about the Q3 numbers and the relaunch timeline', occurred_at: daysAgo(3) + 'T10:00:00Z', created_at: T, updated_at: T },
  { id: id('8', 2), user_id: UID, person_id: PEOPLE[1].id, summary: 'Lunch at the usual place', occurred_at: daysAgo(12) + 'T12:00:00Z', created_at: T, updated_at: T },
]
const JOURNAL = [
  { id: id('7', 1), user_id: UID, body: 'Long day. The phone pages finally feel like one app — the gutters line up and nothing wraps one word per line.', entry_date: daysAgo(0), mood: 'good', transcript: null, media_paths: [], gratitude: ['A quiet morning', 'Coffee with Priya'], deleted_at: null, created_at: T, updated_at: T },
  { id: id('7', 2), user_id: UID, body: 'Walked around the block twice. Read twenty pages.', entry_date: daysAgo(1), mood: 'okay', transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: T, updated_at: T },
]
const BOOKS = [{ id: id('6', 1), user_id: UID, title: 'The Overstory', author: 'Richard Powers', published_year: 2018, current_page: 212, total_pages: 502, status: 'reading', created_at: T, updated_at: T }]
const NOTES = [{ id: id('6', 2), user_id: UID, title: 'Trees talk', body: 'Mycorrhizal networks share sugar between trees.', tags: ['nature'], domain_id: null, book_id: BOOKS[0].id, created_at: T, updated_at: T }]
const QUOTES = [{ id: id('6', 3), user_id: UID, text: 'The best arguments in the world won’t change a person’s mind. The only thing that can do that is a good story.', author: 'Richard Powers', source: 'The Overstory', tags: [], book_id: BOOKS[0].id, page: '336', created_at: T, updated_at: T }]
const TIME = [{ id: id('5', 1), user_id: UID, project_id: PROJECTS[0].id, task_id: TASKS[0].id, note: null, duration_min: 50, started_at: daysAgo(0) + 'T07:00:00Z', ended_at: daysAgo(0) + 'T07:50:00Z', created_at: T, updated_at: T }]
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: id('4', n), user_id: UID, event_type, entity_type, entity_id, payload, created_at: at })
const ACTIVITY = [
  act(1, 'task.completed', 'task', TASKS[6].id, { title: TASKS[6].title }, daysAgo(1) + 'T10:00:00Z'),
  act(2, 'routine.checked', 'routine', ROUTINES[0].id, { name: ROUTINES[0].name }, daysAgo(0) + 'T05:00:00Z'),
  act(3, 'project.created', 'project', PROJECTS[0].id, { name: PROJECTS[0].name }, daysAgo(4) + 'T09:00:00Z'),
  act(4, 'task.deleted', 'task', TASKS[5].id, { title: TASKS[5].title }, daysAgo(1) + 'T08:00:00Z'),
]
const SETTINGS = { id: id('3', 1), user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
const INBOX = [{ id: id('2', 1), user_id: UID, kind: 'text', raw_text: 'book the dentist for next week', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: T, updated_at: T }]
const TABLES = () => ({
  tasks: TASKS, projects: PROJECTS, areas: AREAS, domains: [DOMAIN], routines: ROUTINES, routine_completions: COMPLETIONS, people: PEOPLE, interactions: INTERACTIONS,
  journal_entries: JOURNAL, books: BOOKS, notes: NOTES, quotes: QUOTES, commentary: [], time_entries: TIME, activity_log: ACTIVITY, app_settings: [SETTINGS],
  inbox_items: INBOX, calendar_events: [], slipping: [], resurfaced_log: [], integrations: [], capture_keys: [], mcp_keys: [], push_subscriptions: [],
})

// A small PostgREST: eq / neq / is / not.is / in / gt(e) / lt(e) on top-level columns; the rest ignored.
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and'])
function filterRows(rows, url) {
  let out = rows
  for (const [k, raw] of url.searchParams) {
    if (SKIP.has(k)) continue
    const not = raw.startsWith('not.')
    const v = not ? raw.slice(4) : raw
    const [op, ...rest] = v.split('.')
    const arg = rest.join('.')
    const test = (row) => {
      const x = row[k]
      if (op === 'eq') return String(x) === arg
      if (op === 'neq') return String(x) !== arg
      if (op === 'is') return arg === 'null' ? x == null : String(x) === arg
      if (op === 'in') return arg.slice(1, -1).split(',').map((s) => s.replace(/"/g, '')).includes(String(x))
      if (op === 'gte') return x != null && String(x) >= arg
      if (op === 'gt') return x != null && String(x) > arg
      if (op === 'lte') return x != null && String(x) <= arg
      if (op === 'lt') return x != null && String(x) < arg
      return true
    }
    out = out.filter((row) => (not ? !test(row) : test(row)))
  }
  return out
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const phoneAt = (width, height = 844) => ({ viewport: { width, height }, hasTouch: true, isMobile: true })
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route, o = {}) {
  const view = o.view ?? phoneAt(390)
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.grantPermissions(['microphone', 'camera'], { origin: BASE })
  await ctx.addInitScript(([t, sess, uid, hintSeen, shell]) => {
    // The Android shell's bridge (native/android/MainActivity.java), recorded: what the bar strips get painted.
    if (shell) {
      window.__chrome = []
      window.KaisFlowShell = { setChrome: (c, l) => window.__chrome.push([c, l]) }
    }
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // The one-time "Updated to vX" toast stays out of the shots.
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    if (hintSeen != null) localStorage.setItem('kf.captureHint', String(hintSeen))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, o.hintSeen ?? 3, !!o.shell])
  const state = { rows: TABLES(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 180_000 }) // a busy machine: be patient
  await sleep(o.settle ?? 1000)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(env, loc, settle = 450) {
  if (!env.cdp) {
    await loc.click()
    await sleep(settle)
    return
  }
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(settle)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const writes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
async function waitFor(fn, ms = 5000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(120)
  }
  return false
}
/** Lines a text box wraps to (distinct line tops of its text), and its word count. */
const wrapOf = (loc) =>
  loc.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)))
    return { lines: tops.size, words: el.innerText.trim().split(/\s+/).length, text: el.innerText.trim() }
  })

// ── The layout audit: what a phone page gets measured on (the brief's six bug classes) ──
async function audit(page) {
  return page.evaluate(() => {
    const W = innerWidth
    const main = document.querySelector('.app-main-content')
    const route = document.querySelector('.kf-route') ?? main
    const visible = (el) => {
      // a closed <details> keeps its contents laid out but unpainted — not on screen
      if (el.closest('details:not([open])') && !el.closest('summary')) return false
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    // text leaves: elements with their own non-empty text node
    const leaves = []
    const walk = document.createTreeWalker(route, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      if (!el || leaves.includes(el) || !visible(el)) continue
      leaves.push(el)
    }
    // 1 · one word per line — measured per text node (an element's own words, not its children's)
    const oneWord = []
    let minLeft = Infinity
    let maxRight = -Infinity
    for (const el of leaves) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.textContent.trim()) continue
        const r = document.createRange()
        r.selectNodeContents(node)
        const rects = [...r.getClientRects()].filter((x) => x.width > 0)
        // gutters: text inside the page's own column (a sideways-scrolling strip is skipped)
        if (!el.closest('[style*="overflow-x"]')) for (const x of rects) {
          minLeft = Math.min(minLeft, x.left)
          maxRight = Math.max(maxRight, x.right)
        }
        const tops = new Set(rects.map((x) => Math.round(x.top)))
        const words = node.textContent.trim().split(/\s+/).length
        // a short two-word label ("Scan paper", "All projects") never wraps; a long two-word title may
        const short = node.textContent.trim().length <= 14
        if ((words >= 3 || (words === 2 && short)) && tops.size >= words) oneWord.push(node.textContent.trim().slice(0, 40))
      }
    }
    // 2 · sideways scroll
    const hscroll = Math.max(document.documentElement.scrollWidth - W, main ? main.scrollWidth - main.clientWidth : 0)
    // 3 · small targets (a coarse pointer gets .kf-hit's ±12 halo)
    const small = []
    for (const el of route.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea, [onclick]')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      const halo = el.classList.contains('kf-hit') ? 24 : el.classList.contains('kf-checkbox') ? 26 : 0
      const w = Math.round(r.width + halo)
      const h = Math.round(r.height + halo)
      if (w < 48 || h < 48) small.push(`${(el.getAttribute('aria-label') || el.innerText || el.title || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)} ${w}×${h}`)
    }
    // 4 · header
    const h1 = route.querySelector('h1')
    const h1cs = h1 && getComputedStyle(h1)
    const header = h1 ? { text: h1.innerText.trim().slice(0, 30), size: h1cs.fontSize, serif: /serif|Source|Fraunces|Display/i.test(h1cs.fontFamily) && !/sans/i.test(h1cs.fontFamily.split(',')[0]), left: Math.round(h1.getBoundingClientRect().left) } : null
    // 5 · overlapping text (two text leaves, neither inside the other, intersecting by > 6px both ways)
    const overlaps = []
    const boxes = leaves.map((el) => [el, el.getBoundingClientRect()])
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, ra] = boxes[i]
        const [b, rb] = boxes[j]
        if (a.contains(b) || b.contains(a)) continue
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (ix > 6 && iy > 6) overlaps.push(`${a.textContent.trim().slice(0, 18)} ∩ ${b.textContent.trim().slice(0, 18)}`)
      }
    return { hscroll, oneWord, small, header, gutterL: Math.round(minLeft), gutterR: Math.round(W - maxRight), overlaps: overlaps.slice(0, 6) }
  })
}
/** Scrolled to the end: does the last content clear the tab bar (and the gesture inset under it)? */
async function clearsTabBar(page) {
  return page.evaluate(async () => {
    const main = document.querySelector('.app-main-content')
    // twice: a page still growing (a late query) can move the end after the first scroll
    for (let i = 0; i < 2; i++) {
      main.scrollTop = main.scrollHeight
      await new Promise((r) => setTimeout(r, 300))
    }
    const bar = document.querySelector('.app-tabbar').getBoundingClientRect().top
    let bottom = 0
    for (const el of document.querySelectorAll('.kf-route *')) {
      const cs = getComputedStyle(el)
      if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      // what a person reads or taps: own text, an image, a control (an empty decorative rule doesn't count)
      const content = /^(IMG|SVG|BUTTON|INPUT|TEXTAREA|SELECT|A)$/i.test(el.tagName) || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (el.closest('details:not([open])') && !el.closest('summary')) continue
      if (r.width > 0 && r.height > 0 && r.bottom > bottom && content) bottom = r.bottom
    }
    const out = { bar: Math.round(bar), bottom: Math.round(bottom), ok: bottom <= bar + 1 }
    main.scrollTop = 0
    return out
  })
}

const PAGES = [
  ['routines', '/routines'],
  ['projects', '/projects'],
  ['project-detail', `/projects/${PROJECTS[0].id}`],
  ['retainer-detail', `/projects/${PROJECTS[2].id}`],
  ['area-detail', `/projects/${AREAS[0].id}`],
  ['perennials', '/perennials'],
  ['tasks', '/tasks'],
  ['inbox', '/inbox'],
  ['review', '/weekly-review'],
  ['journal', '/journal'],
  ['people', '/people'],
  ['person-detail', `/people/${PEOPLE[0].id}`],
  ['library', '/library'],
  ['herbarium', '/herbarium'],
  ['focus', '/focus'],
  ['settings', '/settings'],
  ['activity', '/activity'],
  ['trash', '/trash'],
]

// ═════ 1 · The audit — every More page at 360 / 390 / 430, day + night ═════
const auditRows = []
// TALL=1: each page once at 390 × 2400 (the whole page in one shot, for reading the audit)
if (process.env.TALL) {
  for (const [key, route] of PAGES) {
    if (ONLY && !ONLY.has(key) && !ONLY.has('tall')) continue
    const env = await open(route, { view: phoneAt(Number(process.env.TALL_W ?? 390), 2400) })
    await shot(env.page, `tall-${PHASE}-${key}`)
    await env.ctx.close()
  }
}
if ((!ONLY && !process.env.TALL) || ONLY?.has('audit')) {
  for (const theme of ['day', 'night']) {
    for (const width of [360, 390, 430]) {
      for (const [key, route] of PAGES) {
        if (process.env.AUDIT_PAGES && !process.env.AUDIT_PAGES.split(',').includes(key)) continue
        const env = await open(route, { theme, view: phoneAt(width) })
        const { page } = env
        const m = await audit(page)
        const clear = await clearsTabBar(page)
        // Shots: every page at 390, Day and Night (the 360 / 430 passes are measured, not shot).
        if (width === 390) await shot(page, `${PHASE}-${key}-${width}-${theme}`)
        const row = { theme, width, key, ...m, clear, errors: env.errors }
        auditRows.push(row)
        const tag = `${PHASE} ${key} @${width} ${theme}`
        if (PHASE === 'after') {
          check(`${tag} no sideways scroll`, m.hscroll <= 0, m.hscroll)
          check(`${tag} no text wrapping one word per line`, m.oneWord.length === 0, m.oneWord.join(' | '))
          check(`${tag} the last content clears the tab bar`, clear.ok, JSON.stringify(clear))
          check(`${tag} no overlapping text`, m.overlaps.length === 0, m.overlaps.join(' | '))
          check(`${tag} no page errors`, env.errors.length === 0, env.errors.join(' | '))
        } else {
          console.log(`${tag}: hscroll=${m.hscroll} oneWord=${JSON.stringify(m.oneWord)} gutters=${m.gutterL}/${m.gutterR} h1=${JSON.stringify(m.header)} clear=${JSON.stringify(clear)} overlaps=${JSON.stringify(m.overlaps)} small=${m.small.length} errors=${env.errors.length}`)
        }
        await env.ctx.close()
      }
    }
  }
  fs.writeFileSync(path.join(OUT, `audit-${PHASE}.json`), JSON.stringify(auditRows, null, 1))
}

if (PHASE !== 'after') {
  await browser.close()
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} passed (audit-only run: ${auditRows.length} page loads)`)
  process.exit(0)
}

// ═════ 1b · The More sheet itself: 48px rows and buttons, one line each, nothing over it ═════
if (!ONLY || ONLY.has('more')) {
  for (const theme of ['day', 'night']) {
    for (const width of [360, 390, 430]) {
      const name = `more-${width}-${theme}`
      const env = await open('/today', { theme, view: phoneAt(width) })
      const { page } = env
      await tap(env, page.locator('.app-tabbar').getByRole('button', { name: 'More' }), 600)
      const sheet = page.getByRole('dialog', { name: 'More' })
      const targets = await sheet.locator('a, button').evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect()
        return { t: e.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), right: r.right }
      }))
      const small = targets.filter((x) => x.h < 48 || x.w < 48)
      check(`${name} every row and button is ≥ 48px (${targets.length})`, targets.length >= 14 && small.length === 0, JSON.stringify(small))
      const wrapped = await sheet.locator('a span:last-of-type, button').evaluateAll((els) => els.filter((e) => {
        const r = document.createRange()
        r.selectNodeContents(e)
        return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size > 1
      }).map((e) => e.innerText))
      check(`${name} no label wraps`, wrapped.length === 0, wrapped.join(' | '))
      check(`${name} nothing runs off the right edge`, targets.every((x) => x.right <= width), '')
      const s = await sheet.getByRole('link', { name: 'Settings' }).boundingBox()
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.innerText.trim() ?? null, [s.x + s.width / 2, s.y + s.height / 2])
      check(`${name} the sheet is on top (Settings takes the tap at its centre)`, hit === 'Settings', hit)
      if (width === 390 || theme === 'day') await shot(page, `more-sheet-${width}-${theme}`)
      check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
      await env.ctx.close()
    }
  }
}

// ═════ 2 · Routines on the phone ═════
const ritualCard = (page, kind) => page.locator(`[data-ritual="${kind}"]`)
for (const theme of ['day', 'night']) {
  if (ONLY && !ONLY.has('routines')) break
  for (const width of [360, 390, 430]) {
    const name = `routines-${width}-${theme}`
    const env = await open('/routines', { theme, view: phoneAt(width) })
    const { page } = env
    // the two ritual cards: title + subtitle each on one line, the pin icon-only and ≥ 48
    for (const kind of ['morning', 'evening']) {
      const card = ritualCard(page, kind)
      const title = await wrapOf(card.locator('[data-ritual-title]'))
      const sub = await wrapOf(card.locator('[data-ritual-sub]'))
      check(`${name} ${kind} card title on one line ("${title.text}")`, title.lines === 1, JSON.stringify(title))
      check(`${name} ${kind} card subtitle on one line ("${sub.text}")`, sub.lines === 1, JSON.stringify(sub))
      const pin = card.getByRole('button', { name: /Pin this ritual|Unpin this ritual/ })
      const box = await pin.boundingBox()
      check(`${name} ${kind} pin is icon-only, ≥ 48×48, named + titled + aria-pressed`,
        (await pin.innerText()).trim() === '' && box.width >= 48 && box.height >= 48 && (await pin.getAttribute('title')) && (await pin.getAttribute('aria-pressed')) !== null,
        JSON.stringify({ text: await pin.innerText(), w: box.width, h: box.height, title: await pin.getAttribute('title'), pressed: await pin.getAttribute('aria-pressed') }))
    }
    // Today's phone gutter: 16
    const vine = await page.locator('.kf-route img').first().boundingBox()
    const card = await ritualCard(page, 'morning').boundingBox()
    const m = await audit(page)
    check(`${name} side gutters match Today's (16px): header + cards span 16…${width - 16}, text no closer`,
      Math.round(vine.x) === 16 && Math.round(card.x) === 16 && Math.round(card.x + card.width) === width - 16 && m.gutterL === 16 && m.gutterR >= 16,
      JSON.stringify({ vine: vine.x, card: [card.x, card.x + card.width], text: [m.gutterL, m.gutterR] }))
    // no bare "archive" link; each row has a ⋯ (≥ 48) named for the routine
    check(`${name} no bare "archive" text link left on the rows`, (await page.locator('.kf-route button', { hasText: /^archive$/ }).count()) === 0)
    const more = page.getByRole('button', { name: `More for ${ROUTINES[1].name}` })
    const mb = await more.boundingBox()
    check(`${name} each routine row has a ⋯ button ≥ 48×48`, (await page.getByRole('button', { name: /^More for / }).count()) === ROUTINES.length && mb.width >= 48 && mb.height >= 48, JSON.stringify(mb))
    const row = await wrapOf(page.getByText(ROUTINES[5].name, { exact: true }).first())
    check(`${name} a long routine name never wraps one word per line`, row.lines < row.words, JSON.stringify(row))
    if (width === 390 || theme === 'day') await shot(page, `routines-${width}-${theme}`)

    if (width === 390) {
      // pin toggles (local preference), the state reads back
      const pin = ritualCard(page, 'evening').locator('button[aria-pressed]')
      const before = await pin.getAttribute('aria-pressed')
      await tap(env, pin)
      check(`${name} tapping the pin flips aria-pressed (${before} → ${await pin.getAttribute('aria-pressed')})`, (await pin.getAttribute('aria-pressed')) !== before)
      await tap(env, pin)

      // ⋯ → the kit action sheet → Archive (outbox write) + Undo toast → Undo restores (outbox write)
      await tap(env, more, 600)
      const sheet = page.locator('[role="dialog"]').filter({ hasText: ROUTINES[1].name })
      const rows = await sheet.locator('.kf-as-row').allInnerTexts()
      check(`${name} ⋯ opens the kit action sheet titled with the routine (rows: ${rows.join(', ')})`, (await sheet.count()) === 1 && rows.some((r) => r.trim() === 'Archive'))
      // nothing covers the sheet: the Archive row is what a finger at its centre hits
      const archiveRow = sheet.locator('.kf-as-row', { hasText: 'Archive' })
      const ab = await archiveRow.boundingBox()
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.kf-as-row')?.innerText.trim() ?? null, [ab.x + ab.width / 2, ab.y + ab.height / 2])
      check(`${name} the sheet is on top (the Archive row takes the tap at its centre)`, hit === 'Archive', hit)
      await shot(page, `routines-menu-${theme}`)
      const from = env.state.writes.length
      await tap(env, archiveRow, 700)
      const w1 = writes(env.state, 'routines', from)
      check(`${name} Archive → routines row written with active = false (through the outbox)`, w1.length === 1 && w1[0].id === ROUTINES[1].id && w1[0].active === false, JSON.stringify(w1.map((w) => [w.name, w.active])))
      check(`${name} …and logged routine.archived`, writes(env.state, 'activity_log', from).some((a) => a.event_type === 'routine.archived'))
      check(`${name} …the row leaves the list`, (await page.getByRole('button', { name: `More for ${ROUTINES[1].name}` }).count()) === 0)
      const t = await toasts(page)
      check(`${name} …toast "Routine archived" with Undo`, t.some((x) => x.startsWith('Routine archived')) && (await page.getByRole('button', { name: 'Undo' }).count()) >= 1, JSON.stringify(t))
      await shot(page, `routines-archived-${theme}`)
      const from2 = env.state.writes.length
      await tap(env, page.getByRole('button', { name: 'Undo' }).first(), 700)
      const w2 = writes(env.state, 'routines', from2)
      check(`${name} Undo → written back active = true, the row returns`, w2.length === 1 && w2[0].active === true && (await page.getByRole('button', { name: `More for ${ROUTINES[1].name}` }).count()) === 1, JSON.stringify(w2.map((w) => [w.name, w.active])))
      check(`${name} …and logged routine.restored`, writes(env.state, 'activity_log', from2).some((a) => a.event_type === 'routine.restored'))
    }
    check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
    await env.ctx.close()
  }
}

// Desktop keeps a visible ⋯ that opens the context menu (Archive).
if (!ONLY || ONLY.has('routines')) {
  for (const theme of ['day', 'night']) {
    const name = `routines-desktop-${theme}`
    const env = await open('/routines', { theme, view: desktop })
    const { page } = env
    const more = page.getByRole('button', { name: `More for ${ROUTINES[0].name}` })
    check(`${name} the ⋯ is visible at rest (not hover-only)`, (await more.evaluate((el) => getComputedStyle(el).opacity)) === '1' && (await more.isVisible()))
    check(`${name} the pin keeps its "pinned" label on a computer`, (await page.locator('[data-ritual="morning"]').innerText()).toUpperCase().includes('PINNED'))
    await shot(page, `routines-desktop-${theme}`)
    // Scroll first and let the scroll event land: a context menu closes on any scroll under it, and
    // Playwright's own scroll-into-view fires its event a frame after the click it precedes.
    await more.scrollIntoViewIfNeeded()
    await sleep(300)
    await more.click()
    await sleep(300)
    const item = page.getByRole('menuitem', { name: 'Archive' }).or(page.locator('button', { hasText: /^Archive$/ }))
    check(`${name} ⋯ → the context menu with Archive`, (await item.count()) >= 1)
    await shot(page, `routines-desktop-menu-${theme}`)
    const from = env.state.writes.length
    await item.first().click()
    await sleep(500)
    const w = writes(env.state, 'routines', from)
    check(`${name} Archive writes active = false + Undo toast`, w.length === 1 && w[0].active === false && (await toasts(page)).some((x) => x.startsWith('Routine archived')))
    check(`${name} no page errors`, env.errors.length === 0, env.errors.join(' | '))
    await env.ctx.close()
  }
}

// ═════ 3 · The capture button: plus at rest, hold to talk, the sheet on the bottom edge ═════
const captureBtn = (page) => page.getByRole('button', { name: /^Capture — tap to type, hold to talk/ })
const capSheet = (page) => page.locator('[role="dialog"]').filter({ has: page.locator('[data-capture-sheet]') })
const keyboard = (page, px) =>
  page.evaluate((h) => {
    const vv = window.visualViewport
    if (h) Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - h })
    else delete vv.height
    vv.dispatchEvent(new Event('resize'))
  }, px)
if (!ONLY || ONLY.has('capture')) {
  // the desktop Capture CTA's glyph — the reference
  const d = await open('/today', { view: desktop })
  const plus = await d.page.getByRole('button', { name: 'Capture', exact: true }).first().locator('svg').evaluate((s) => s.innerHTML)
  await d.ctx.close()
  for (const theme of ['day', 'night']) {
    const name = `capture-${theme}`
    const env = await open('/routines', { theme, hintSeen: theme === 'day' ? 0 : 3 })
    const { page } = env
    const btn = captureBtn(page)
    const glyph = await btn.locator('svg').first().evaluate((s) => s.innerHTML)
    check(`${name} centre glyph = the desktop Capture button's plus (not the mic)`, glyph === plus && !glyph.includes('rect') , glyph.slice(0, 80))
    check(`${name} aria-label unchanged: "Capture — tap to type, hold to talk"`, (await btn.getAttribute('aria-label')) === 'Capture — tap to type, hold to talk')
    const bb = await btn.boundingBox()
    check(`${name} centre button ≥ 48×48`, bb.width >= 48 && bb.height >= 48, JSON.stringify(bb))
    await page.locator('.app-tabbar').screenshot({ path: path.join(OUT, `capture-tabbar-${theme}.png`) })

    // hold → recording (the mic shows while recording), release → the voice sheet takes the take
    const c = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
    await touch(env.cdp, 'touchStart', [c])
    const rec = await waitFor(async () => (await btn.getAttribute('data-phase')) === 'recording', 3000)
    await sleep(900)
    const recGlyph = await btn.locator('svg').first().evaluate((s) => s.innerHTML)
    check(`${name} hold → recording (hold-to-talk kept)`, rec)
    check(`${name} …while recording the button shows the mic`, recGlyph !== plus, recGlyph.slice(0, 60))
    await shot(page, `capture-hold-${theme}`)
    await touch(env.cdp, 'touchEnd', [])
    const voice = page.locator('[data-voice-phase]')
    check(`${name} release → the voice sheet files the take`, await waitFor(async () => (await voice.count()) === 1, 4000))
    await sleep(300)
    check(`${name} …and the button is back to the plus`, (await btn.locator('svg').first().evaluate((s) => s.innerHTML)) === plus)
    await page.keyboard.press('Escape')
    await sleep(500)
    await env.ctx.close()

    // tap → the capture sheet: first-opens hint, on the bottom edge over the tab bar, rides the keyboard
    const env2 = await open('/routines', { theme, hintSeen: theme === 'day' ? 0 : 3, shell: true })
    const p2 = env2.page
    await tap(env2, captureBtn(p2), 600)
    const sh = capSheet(p2)
    check(`${name} tap → the capture sheet, field focused`, (await sh.count()) === 1 && (await p2.evaluate(() => document.activeElement?.id)) === 'kf-capture-input')
    check(`${name} first-opens hint ${theme === 'day' ? 'shown on a first open' : 'gone after 3 opens'}`, theme === 'day' ? (await p2.locator('.kf-capture-hint').innerText()).toUpperCase() === 'TAP TO TYPE · HOLD TO TALK' : (await p2.locator('.kf-capture-hint').count()) === 0)
    const down = await sh.boundingBox()
    check(`${name} keyboard down → the sheet sits on the bottom edge (no gap under it)`, Math.abs(down.y + down.height - 844) <= 1, JSON.stringify(down))
    const bar = await p2.locator('.app-tabbar').boundingBox()
    const over = await p2.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-capture-sheet], [role="dialog"]'), [bar.x + 30, bar.y + bar.height / 2])
    check(`${name} …covering the tab bar (the sheet takes a tap where the tab bar is)`, over)
    await shot(p2, `capture-sheet-${theme}`)
    await keyboard(p2, 300)
    await sleep(400)
    const up = await sh.boundingBox()
    check(`${name} keyboard up (visualViewport 300px shorter) → the sheet's bottom rides it at 544`, Math.abs(up.y + up.height - 544) <= 1, JSON.stringify(up))
    await shot(p2, `capture-sheet-keyboard-${theme}`)
    await keyboard(p2, 0)
    await sleep(400)
    const back = await sh.boundingBox()
    check(`${name} keyboard down again → back on the bottom edge`, Math.abs(back.y + back.height - 844) <= 1, JSON.stringify(back))
    // Android's shell pads the WebView itself for the IME: the layout viewport shrinks, visualViewport = it.
    await p2.setViewportSize({ width: 390, height: 544 })
    await sleep(400)
    const padded = await sh.boundingBox()
    check(`${name} WebView resized for the keyboard (Android shell) → the sheet sits on the new bottom, no double gap`, Math.abs(padded.y + padded.height - 544) <= 1, JSON.stringify(padded))
    await p2.setViewportSize({ width: 390, height: 844 })
    await sleep(400)
    const restored = await sh.boundingBox()
    check(`${name} …keyboard gone → back on the bottom edge`, Math.abs(restored.y + restored.height - 844) <= 1, JSON.stringify(restored))
    // Android: the gesture-bar strip under the WebView is painted by the shell. With the sheet up it
    // takes the sheet's colour (no page-coloured band under the sheet); closed, the page's again.
    const paper = await p2.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('[data-capture-sheet]').closest('[role="dialog"]')).backgroundColor])
    const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    const lastChrome = () => p2.evaluate(() => window.__chrome.at(-1))
    const open1 = await lastChrome()
    check(`${name} Android strips painted the sheet's colour while it's up (${hex(paper[1])})`, open1 && open1[0] === hex(paper[1]) && open1[1] === (theme === 'day'), JSON.stringify(open1))
    await p2.keyboard.press('Escape')
    await sleep(500)
    const closed = await lastChrome()
    check(`${name} …and the page's again once it closes (${hex(paper[0])})`, (await sh.count()) === 0 && closed && closed[0] === hex(paper[0]) && closed[1] === (theme === 'day'), JSON.stringify(closed))
    check(`${name} no page errors`, env.errors.length === 0 && env2.errors.length === 0, [...env.errors, ...env2.errors].join(' | '))
    await env2.ctx.close()
  }
}

// ═════ 4 · Toasts over phone modals: never over a full-screen modal's header ═════
// (coordinator, 2026-10-07: the one-time "Updated to v1.0.22" toast docked at the top over Paper's
// "A quick look" and swallowed the Rotate taps.) The app's own toast store, imported from the dev server.
const pushToast = (page, message) =>
  page.evaluate(async (m) => (await import('/src/lib/toastStore.ts')).useToastStore.getState().push({ message: m, action: { label: 'What’s new', run: () => {} } }), message)
const boxOf = (loc) => loc.boundingBox()
const meets = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
if (!ONLY || ONLY.has('toast')) {
  for (const theme of ['day', 'night']) {
    const name = `toast-${theme}`
    const env = await open('/inbox', { theme })
    const { page } = env
    // a page photo: any PNG will do — a shot of the Inbox itself
    const photo = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 520 } })
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), tap(env, page.getByRole('button', { name: 'Scan paper' }).first())])
    await fc.setFiles([{ name: 'page.png', mimeType: 'image/png', buffer: photo }])
    const look = page.locator('[role="dialog"][aria-label="A quick look"]')
    check(`${name} Inbox → Scan paper → "A quick look" (full screen)`, await waitFor(async () => (await look.count()) === 1, 5000))
    await pushToast(page, 'Updated to v1.0.22 — see what’s new')
    await sleep(500)
    const toast = await boxOf(page.locator('.kf-toast').last())
    const close = await boxOf(look.getByRole('button', { name: 'Close' }))
    const rotateBtn = look.getByRole('button', { name: 'Rotate the page' })
    const rotate = await boxOf(rotateBtn)
    const foot = await boxOf(look.locator('[data-sheet-footer]'))
    const buttons = await Promise.all((await look.locator('[data-sheet-footer] button').all()).map(boxOf))
    check(`${name} the toast clears ✕ and Rotate`, !meets(toast, close) && !meets(toast, rotate), JSON.stringify({ toast, close, rotate }))
    check(`${name} …and the bottom buttons (Add page · Read)`, buttons.length === 2 && buttons.every((b) => !meets(toast, b)), JSON.stringify(buttons))
    check(`${name} …docked 8px above the bottom bar`, Math.abs(toast.y + toast.height + 8 - foot.y) <= 1, JSON.stringify({ toastBottom: toast.y + toast.height, foot: foot.y }))
    await shot(page, `toast-paper-look-${theme}`)
    const before = await look.locator('img.pp-photo').getAttribute('style')
    await tap(env, rotateBtn)
    const after = await look.locator('img.pp-photo').getAttribute('style')
    check(`${name} Rotate takes the tap while the toast is up`, before.includes('rotate(0deg)') && after.includes('rotate(90deg)'), `${before} → ${after}`)
    await page.keyboard.press('Escape')
    await sleep(400)

    // a full-screen modal with no bottom bar: the toast keeps the tab-bar dock, off its header
    await page.evaluate(() => {
      const d = document.createElement('div')
      d.id = 'bare-modal'
      d.setAttribute('role', 'dialog')
      d.setAttribute('aria-modal', 'true')
      d.style.cssText = 'position:fixed;inset:0;z-index:900;background:var(--paper-linen)'
      d.innerHTML = '<button aria-label="Close" style="position:absolute;top:4px;left:4px;width:48px;height:48px">✕</button>'
      document.body.appendChild(d)
    })
    await pushToast(page, 'A second toast')
    await sleep(500)
    const t2 = await boxOf(page.locator('.kf-toast').last())
    const x2 = await boxOf(page.locator('#bare-modal button'))
    const tabDock = await page.evaluate(() => innerHeight - parseFloat(getComputedStyle(document.querySelector('.kf-toast-host')).bottom))
    check(`${name} full-screen modal without a bottom bar → toast at the tab-bar dock, off the header`, !meets(t2, x2) && Math.abs(t2.y + t2.height - tabDock) <= 1 && t2.y > 600, JSON.stringify({ t2, tabDock }))
    await page.evaluate(() => document.getElementById('bare-modal').remove())
    await env.ctx.close()

    // a bottom sheet without a footer (a routine's ⋯) keeps the top dock; the full ritual sheet docks above its footer
    const env3 = await open('/routines', { theme })
    const p3 = env3.page
    await tap(env3, p3.getByRole('button', { name: `More for ${ROUTINES[0].name}` }), 600)
    await pushToast(p3, 'Over an action sheet')
    await sleep(500)
    const t3 = await boxOf(p3.locator('.kf-toast').last())
    const rows = await Promise.all((await p3.locator('.kf-as-row').all()).map(boxOf))
    check(`${name} an action sheet (no footer) still docks the toast at the top, clear of its rows`, t3.y < 60 && rows.every((r) => !meets(t3, r)), JSON.stringify(t3))
    await p3.keyboard.press('Escape')
    await sleep(500)
    await tap(env3, ritualCard(p3, 'morning').locator('button').first(), 900)
    await pushToast(p3, 'Over the morning ritual')
    await sleep(500)
    const t4 = await boxOf(p3.locator('.kf-toast').last())
    const rsheet = p3.locator('[role="dialog"]').filter({ has: p3.locator('[data-sheet-footer]') }).last()
    const rfoot = await boxOf(rsheet.locator('[data-sheet-footer]'))
    const rclose = await boxOf(rsheet.getByRole('button', { name: 'Close' }).first())
    check(`${name} the Plan-my-day sheet (full, with footer): toast 8px above its footer, clear of ✕`, Math.abs(t4.y + t4.height + 8 - rfoot.y) <= 1 && !meets(t4, rclose), JSON.stringify({ t4, rfoot, rclose }))
    await shot(p3, `toast-ritual-${theme}`)
    check(`${name} no page errors`, env.errors.length === 0 && env3.errors.length === 0, [...env.errors, ...env3.errors].join(' | '))
    await env3.ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 1))
const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
