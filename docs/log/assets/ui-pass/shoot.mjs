// UI pass (Kai 2026-10-08, "This doesn't look good. Have an entire UI pass"): screenshots of every
// screen on the REAL app against a MOCKED backend (the phone-polish recipe: the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, Playwright answers
// every REST call). Not a pass/fail harness — it shoots, and records sideways scroll per shot.
//   node shoot.mjs <outDir> [baseUrl]
//   SCREENS=settings,today   SIZES=d1920,p390   THEMES=day,night   TALL=1 (the whole page in one shot)
// Sizes: d1280 / d1440 / d1920 = desktop at 125% (the computer's default interface size);
//        d1280-100 / d1440-100 / d1920-100 = 100%; p390 = phone (touch, 100%).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5279'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = (v, d) => (v ? v.split(',') : d)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000a1b2'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'kai@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data: a lived-in account (Wed 7 Oct 2026, Cairo) ──
const DAY = '2026-10-07'
const cairo = (hhmm, day = DAY) => new Date(`${day}T${hhmm}:00+03:00`)
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const T = '2026-09-01T09:00:00Z'
const ago = (n) => new Date(cairo('12:00').getTime() - n * 86_400_000).toISOString().slice(0, 10)
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DOMAIN = { id: id('d', 1), user_id: UID, name: 'Shaheen', color: '#C9A961', sort_order: 1, deleted_at: null, created_at: T, updated_at: T }
const project = (n, name, over = {}) => ({ id: id('b', n), user_id: UID, domain_id: DOMAIN.id, name, type: 'standard', status: 'active', color: null, target_date: null, milestones: [], checklist: [], engagement_model: null, completion_summary: null, deleted_at: null, created_at: T, updated_at: T, ...over })
const PROJECTS = [
  project(1, "Kai's Flow — the UI pass", { milestones: [{ id: 'm1', title: 'Settings', weight: 1, completed: true }, { id: 'm2', title: 'Every other screen', weight: 1, completed: false }], checklist: [{ id: 'c1', title: 'Before / after sheet', type: 'one-shot', completed: false }] }),
  project(2, 'Shaheen website relaunch'),
  project(3, 'Monthly bookkeeping', { type: 'retainer', engagement_model: 'monthly' }),
]
const AREAS = [
  { id: id('c', 1), user_id: UID, domain_id: DOMAIN.id, name: 'Health & training', description: 'Body, sleep, gym', color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T },
  { id: id('c', 2), user_id: UID, domain_id: null, name: 'Home', description: null, color: null, sort_order: 1, deleted_at: null, created_at: T, updated_at: T },
]
const task = (n, title, over = {}) => ({
  id: id('a', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 30, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over,
})
const TASKS = [
  task(1, 'Redesign the Settings page', { project_id: PROJECTS[0].id, top3: true, top3_rank: 1, due_at: iso('09:00'), duration_min: 90, scheduled_start: iso('10:00'), scheduled_end: iso('11:30') }),
  task(2, 'Send the Q3 numbers to Priya', { project_id: PROJECTS[1].id, top3: true, top3_rank: 2, due_at: iso('09:00'), priority: 1 }),
  task(3, 'Reconcile September receipts', { project_id: PROJECTS[2].id, top3: true, top3_rank: 3, due_at: iso('09:00') }),
  task(4, 'Book the physio follow-up', { area_id: AREAS[0].id, due_at: iso('09:00', '2026-10-05') }),
  task(5, 'Fix the balcony tap', { area_id: AREAS[1].id, due_at: iso('09:00', '2026-10-08') }),
  task(6, 'Call the tyre supplier', { due_at: iso('16:00'), scheduled_start: iso('16:00'), scheduled_end: iso('16:30') }),
  task(7, 'Write the release notes', { project_id: PROJECTS[0].id, status: 'done', completed_at: iso('08:30') }),
  task(8, 'Read about pressed-flower framing', { someday: true }),
  task(9, 'Renew the car licence', { due_at: iso('09:00', '2026-10-12') }),
  task(10, 'Water the herbs', { due_at: iso('09:00') }),
]
const ev = (n, title, from, to, day = DAY, taskN = null, type) => ({
  id: id('e', n), user_id: UID, title, starts_at: iso(from, day), ends_at: iso(to, day), all_day: false, task_id: taskN ? id('a', taskN) : null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: type ?? (taskN ? 'task' : 'event'), color: null, deleted_at: null, created_at: T, updated_at: T,
})
const EVENTS = [
  ev(1, 'Redesign the Settings page', '10:00', '11:30', DAY, 1),
  ev(2, 'Lunch with Omar', '13:00', '14:00'),
  ev(3, 'Call the tyre supplier', '16:00', '16:30', DAY, 6),
  ev(4, 'Gym', '18:00', '19:00', DAY, null, 'time_block'),
  ev(5, 'Team sync', '11:00', '11:45', '2026-10-08'),
]
const cad = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
const routine = (n, name, tod, over = {}) => ({ id: id('f', n), user_id: UID, name, time_of_day: tod, clock_time: null, cadence: cad, challenge_start: null, challenge_end: null, goal_days: null, active: true, steps: [], domain_id: null, created_at: '2026-08-01T06:00:00Z', updated_at: T, ...over })
const ROUTINES = [
  routine(1, 'Glass of water', 'morning', { clock_time: '07:00' }),
  routine(2, 'Stretch for ten minutes', 'morning', { clock_time: '07:15' }),
  routine(3, 'Walk around the block', 'afternoon'),
  routine(4, 'Tidy the desk', 'evening', { clock_time: '21:30' }),
  routine(5, '30 days of no sugar', 'anytime', { challenge_start: ago(9), challenge_end: ago(-20), goal_days: 30 }),
]
const COMPLETIONS = []
let cn = 0
for (const r of ROUTINES) for (let d = 1; d <= (r.name.length % 7) + 2; d++) COMPLETIONS.push({ id: id('9', ++cn), user_id: UID, routine_id: r.id, completed_on: ago(d), created_at: T })
const PEOPLE = [
  { id: id('8', 1), user_id: UID, name: 'Priya Raman', facts: [{ id: 'f1', label: 'Birthday', value: '12 March', date: '2026-03-12', recurs: true }, { id: 'f2', label: 'Works at', value: 'Shaheen Trading Co.' }], domain_id: DOMAIN.id, created_at: T, updated_at: T },
  { id: id('8', 2), user_id: UID, name: 'Omar El-Sayed', facts: [{ id: 'f3', label: 'Kids', value: 'Two — Laila and Youssef' }], domain_id: null, created_at: T, updated_at: T },
  { id: id('8', 3), user_id: UID, name: 'Mum', facts: [], domain_id: null, created_at: T, updated_at: T },
]
const INTERACTIONS = [
  { id: id('7', 1), user_id: UID, person_id: PEOPLE[0].id, summary: 'Coffee — talked about the Q3 numbers and the relaunch timeline', occurred_at: ago(3) + 'T10:00:00Z', created_at: T, updated_at: T },
  { id: id('7', 2), user_id: UID, person_id: PEOPLE[1].id, summary: 'Lunch at the usual place', occurred_at: ago(12) + 'T12:00:00Z', created_at: T, updated_at: T },
]
const JOURNAL = [
  { id: id('6', 1), user_id: UID, body: 'Long day. Settings finally reads like one page instead of a wall.', entry_date: DAY, mood: 'good', transcript: null, media_paths: [], gratitude: ['A quiet morning', 'Coffee with Priya'], deleted_at: null, created_at: T, updated_at: T },
  { id: id('6', 2), user_id: UID, body: 'Walked around the block twice. Read twenty pages.', entry_date: ago(1), mood: 'okay', transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: T, updated_at: T },
]
const BOOKS = [{ id: id('5', 1), user_id: UID, title: 'The Overstory', author: 'Richard Powers', published_year: 2018, current_page: 212, total_pages: 502, status: 'reading', created_at: T, updated_at: T }]
const NOTES = [{ id: id('5', 2), user_id: UID, title: 'Trees talk', body: 'Mycorrhizal networks share sugar between trees.', tags: ['nature'], domain_id: null, book_id: BOOKS[0].id, created_at: T, updated_at: T }]
const QUOTES = [{ id: id('5', 3), user_id: UID, text: 'The best arguments in the world won’t change a person’s mind. The only thing that can do that is a good story.', author: 'Richard Powers', source: 'The Overstory', tags: [], book_id: BOOKS[0].id, page: '336', created_at: T, updated_at: T }]
const act = (n, event_type, entity_type, entity_id, payload, at) => ({ id: id('4', n), user_id: UID, event_type, entity_type, entity_id, payload, created_at: at })
const ACTIVITY = [
  act(1, 'task.completed', 'task', TASKS[6].id, { title: TASKS[6].title }, iso('08:30')),
  act(2, 'routine.checked', 'routine', ROUTINES[0].id, { name: ROUTINES[0].name }, iso('07:05')),
  act(3, 'task.completed', 'task', id('a', 99), { title: 'Pay the electricity bill' }, ago(2) + 'T10:00:00Z'),
]
const SETTINGS = { id: id('3', 1), user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: 'Africa/Cairo', weekend_days: [5, 6], created_at: T, updated_at: T }
const inbox = (n, raw, at = T) => ({ id: id('2', n), user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: at, updated_at: at })
const INBOX = [inbox(1, 'book the dentist for next week'), inbox(2, 'idea: a pressed-flower wallpaper for the calendar'), inbox(3, 'ask Omar about the van')]
const TABLES = () => structuredClone({
  tasks: TASKS, projects: PROJECTS, areas: AREAS, domains: [DOMAIN], routines: ROUTINES, routine_completions: COMPLETIONS, people: PEOPLE, interactions: INTERACTIONS,
  journal_entries: JOURNAL, books: BOOKS, notes: NOTES, quotes: QUOTES, commentary: [], time_entries: [], activity_log: ACTIVITY, app_settings: [SETTINGS],
  inbox_items: INBOX, calendar_events: EVENTS, slipping: [], resurfaced_log: [], integrations: [], capture_keys: [], mcp_keys: [], push_subscriptions: [], chat_messages: [],
})

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

const SIZES = {
  d1280: { viewport: { width: 1280, height: 800 }, scale: 1.25 },
  d1440: { viewport: { width: 1440, height: 900 }, scale: 1.25 },
  d1920: { viewport: { width: 1920, height: 1080 }, scale: 1.25 },
  'd1280-100': { viewport: { width: 1280, height: 800 }, scale: 1 },
  'd1440-100': { viewport: { width: 1440, height: 900 }, scale: 1 },
  'd1920-100': { viewport: { width: 1920, height: 1080 }, scale: 1 },
  p390: { viewport: { width: 390, height: 844 }, scale: 1, hasTouch: true, isMobile: true },
}
const phone = (size) => size.startsWith('p')
const key = async (page, combo) => page.keyboard.press(combo)
const click = async (page, loc) => { await loc.first().click(); await sleep(600) }

// Each screen: route, optional Cairo clock time, optional act (opens a sheet / view) after load.
const SCREENS = {
  settings: { route: '/settings' },
  'settings-glossary': { route: '/settings', act: async (p) => { await p.locator('#settings-Calendar').scrollIntoViewIfNeeded(); await click(p, p.getByRole('button', { name: /What do these mean/ })) } },
  today: { route: '/today', at: '10:40' },
  tasks: { route: '/tasks' },
  'tasks-upcoming': { route: '/tasks', act: async (p) => { await click(p, p.locator('.app-main-content').getByText('Upcoming', { exact: true })) } },
  inbox: { route: '/inbox' },
  'cal-day': { route: '/calendar', at: '10:40', act: async (p, s) => { if (!phone(s)) await key(p, 'd'); await sleep(500) } },
  'cal-3day': { route: '/calendar', at: '10:40', act: async (p) => { await key(p, '3'); await sleep(500) } },
  'cal-week': { route: '/calendar', at: '10:40', act: async (p, s) => { if (!phone(s)) await key(p, 'w'); await sleep(500) } },
  projects: { route: '/projects' },
  project: { route: `/projects/${PROJECTS[0].id}` },
  area: { route: `/projects/${AREAS[0].id}` },
  routines: { route: '/routines' },
  journal: { route: '/journal' },
  people: { route: '/people' },
  person: { route: `/people/${PEOPLE[0].id}` },
  library: { route: '/library' },
  herbarium: { route: '/herbarium' },
  focus: { route: '/focus' },
  guide: { route: '/guide' },
  'guide-article': { route: '/guide/plan' },
  chat: { route: '/today', at: '10:40', act: async (p, s) => { if (phone(s)) { await click(p, p.locator('.kf-tab[aria-label="More"]')); await click(p, p.getByRole('button', { name: 'Chat', exact: true })) } else { await key(p, 'Control+j'); await sleep(800) } } },
  capture: { route: '/today', at: '10:40', act: async (p, s) => { if (phone(s)) await click(p, p.locator('.kf-capture')); else await key(p, 'Control+k'); await sleep(700) } },
  'task-sheet': { route: '/tasks', act: async (p, s) => { if (phone(s)) await click(p, p.getByText('Send the Q3 numbers to Priya')); else { await p.goto(`${BASE}/tasks/${TASKS[1].id}`, { waitUntil: 'networkidle' }); await sleep(900) } } },
  plan: { route: '/today', at: '07:40', act: async (p) => { await click(p, p.locator('.tp-ritual, .app-main-content').getByRole('button', { name: /^(Plan|Begin|Resume)$/ })) } },
  shutdown: { route: '/today', at: '21:40', act: async (p) => { await click(p, p.locator('.tp-ritual, .app-main-content').getByRole('button', { name: /^(Shut down|Begin|Resume)$/ })) } },
  'whats-new': { route: '/today', at: '10:40', seen: 'v1.0.20', act: async (p) => { await click(p, p.locator('.kf-toast-act', { hasText: 'What’s new' })) } },
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const want = { screens: list(process.env.SCREENS, Object.keys(SCREENS)), sizes: list(process.env.SIZES, ['d1920', 'p390']), themes: list(process.env.THEMES, ['day', 'night']) }
const report = []
for (const name of want.screens) {
  const sc = SCREENS[name]
  for (const size of want.sizes) {
    for (const theme of want.themes) {
      const sz = SIZES[size]
      const viewport = process.env.TALL ? { width: sz.viewport.width, height: Number(process.env.TALL) > 1 ? Number(process.env.TALL) : 2600 } : sz.viewport
      const ctx = await browser.newContext({ viewport, hasTouch: !!sz.hasTouch, isMobile: !!sz.isMobile, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
      await ctx.addInitScript(([t, sess, uid, scale, seen]) => {
        localStorage.setItem('kf_theme', t)
        localStorage.setItem('sb-127-auth-token', sess)
        localStorage.setItem('kf_ui_scale', scale)
        localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen, checkedAt: Date.now() }))
        localStorage.setItem('kf.captureHint', '3')
        localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
      }, [theme, JSON.stringify(session), UID, String(sz.scale), sc.seen ?? 'v999.0.0'])
      const rows = TABLES()
      await ctx.route('http://127.0.0.1:9/**', async (r) => {
        const req = r.request()
        const url = new URL(req.url())
        const table = url.pathname.replace('/rest/v1/', '')
        if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} })
        if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
        if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
        const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
        const out = filterRows(rows[table] ?? [], url)
        if (one) return out.length ? r.fulfill({ json: out[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
        return r.fulfill({ json: out, headers: { 'content-range': `0-${Math.max(0, out.length - 1)}/${out.length}` } }).catch(() => {})
      })
      const page = await ctx.newPage()
      await page.clock.install({ time: cairo(sc.at ?? '10:40') })
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      const file = `${name}-${size}-${theme}`
      try {
        await page.goto(`${BASE}${sc.route}`, { waitUntil: 'networkidle', timeout: 120_000 })
        await sleep(1100)
        if (sc.act) await sc.act(page, size)
        await sleep(400)
        const wide = await page.evaluate(() => {
          const m = document.querySelector('.app-main-content')
          return { doc: document.documentElement.scrollWidth - innerWidth, main: m ? m.scrollWidth - m.clientWidth : 0 }
        })
        await page.screenshot({ path: path.join(OUT, `${file}.jpg`), type: 'jpeg', quality: 72 })
        report.push({ file, hscroll: wide.doc > 1 || wide.main > 1 ? wide : null, errors })
        console.log(`${file}${wide.doc > 1 || wide.main > 1 ? ' HSCROLL ' + JSON.stringify(wide) : ''}${errors.length ? ' ERR ' + errors[0] : ''}`)
      } catch (e) {
        report.push({ file, failed: String(e.message).split('\n')[0] })
        console.log(`${file} FAILED ${String(e.message).split('\n')[0]}`)
      }
      await ctx.close()
    }
  }
}
fs.writeFileSync(path.join(OUT, 'shoot-report.json'), JSON.stringify(report, null, 1))
await browser.close()
