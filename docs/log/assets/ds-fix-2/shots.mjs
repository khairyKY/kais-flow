// ds-fix-2 (2026-10-13): before/after screenshots of every page the ds-check fix touched, on the
// mocked backend (same recipe as ../fix-grammar/verify.mjs: dead VITE_SUPABASE_URL, a made-up
// session, Playwright answers every REST call). Desktop 1280×800 + phone 390×844, day + night,
// plus the overlays the fixed lines live in (Herbarium specimen + press, New project, Finished).
//   node shots.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=name,name to retake some)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5262'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const T = '2026-09-01T09:00:00Z'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, over) => ({ id: id('1', n), user_id: UID, project_id: null, domain_id: null, area_id: null, title: 'Task', notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over })
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const BOOK = { id: id('8', 1), user_id: UID, title: 'Dune', author: 'Frank Herbert', published_year: 1965, current_page: 120, total_pages: 412, status: 'reading', created_at: T, updated_at: T }
const NOTE = { id: id('8', 2), user_id: UID, title: 'On patience', body: 'Slow is smooth.', tags: ['pace'], domain_id: null, book_id: BOOK.id, created_at: T, updated_at: T }
const QUOTE = { id: id('8', 3), user_id: UID, text: 'Fear is the mind-killer.', author: 'Herbert', source: 'Dune', tags: [], book_id: null, page: '8', created_at: T, updated_at: T }
const SITE = { id: id('2', 1), user_id: UID, domain_id: WORK.id, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, target_date: '2026-11-15T00:00:00Z', engagement_model: 'Freelance', deleted_at: null, created_at: T, updated_at: T,
  milestones: [{ id: id('9', 1), title: 'Launch', weight: 2, completed: false }, { id: id('9', 4), title: 'Wireframes', weight: 1, completed: true }],
  checklist: [{ id: id('9', 2), title: 'Buy domain', type: 'one-shot', completed: true, task_id: null }, { id: id('9', 3), title: 'Ship the hero', type: 'task-linked', completed: false, task_id: id('1', 3) }] }
const OLD = { ...SITE, id: id('2', 2), name: 'Old site', status: 'archived', milestones: [], checklist: [], target_date: null, completion_summary: 'It finally shipped.' }
const AREA = { id: id('3', 1), user_id: UID, domain_id: WORK.id, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const tasks = [task(1, { title: 'Water plants', area_id: AREA.id, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', due_at: '2026-12-07T07:00:00Z' }), task(2, { title: 'Book the gym', area_id: AREA.id }), task(3, { title: 'Write the hero copy', project_id: SITE.id }), task(4, { title: 'Old errand', deleted_at: '2026-10-10T10:00:00Z' })]
const PERSON = { id: id('5', 1), user_id: UID, name: 'Priya', domain_id: null, created_at: T, updated_at: T, facts: [{ id: 'f-bday', label: 'Birthday', value: 'July 17', date: '2026-07-17', recurs: true }, { id: 'f-climb', label: 'Interest', value: 'Climbing' }] }
const QUIET = { id: id('5', 3), user_id: UID, name: 'Tarek', domain_id: null, facts: [], created_at: T, updated_at: T }
const TOUCH = { id: id('5', 2), user_id: UID, person_id: PERSON.id, summary: 'Coffee catch up', occurred_at: '2026-10-05T10:00:00Z', created_at: T, updated_at: T }
const ENTRY = { id: id('6', 9), user_id: UID, body: 'Morning pages', entry_date: TODAY, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: `${TODAY}T07:00:00Z`, updated_at: `${TODAY}T07:00:00Z` }
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
const tables = { tasks, projects: [SITE, OLD], areas: [AREA], domains: [WORK], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [ENTRY], activity_log: [], time_entries: [], people: [PERSON, QUIET], interactions: [TOUCH], routines: [], routine_completions: [], books: [BOOK], notes: [NOTE], quotes: [QUOTE], commentary: [] }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } }
const click = (re) => async (p) => { await p.getByRole('button', { name: re }).first().click(); await sleep(700) }
const SHOTS = [
  ['journal', '/journal'], ['library', '/library'], ['people', '/people'], ['person', `/people/${PERSON.id}`],
  ['projects', '/projects'], ['projects-finished', '/projects', click(/^Finished/)], ['project', `/projects/${SITE.id}`], ['perennials', '/perennials'],
  ['new-project', '/projects', click(/New project/)], ['herbarium', '/herbarium'],
  ['herbarium-specimen', '/herbarium', async (p) => { await p.getByText('Old site').first().click(); await sleep(700) }],
  ['herbarium-press', '/herbarium', async (p) => { await p.getByText('Old site').first().click(); await sleep(600); await click(/Press it/)(p) }],
  ['trash', '/trash'], ['focus', '/focus'],
  ['focus-settings', '/focus', async (p) => { await p.locator('[title="pomodoro settings"]').first().click(); await sleep(700) }],
].filter(([name]) => !process.env.ONLY || process.env.ONLY.split(',').includes(name))
let n = 0
for (const theme of ['day', 'night']) {
  for (const [view, viewport] of Object.entries(VIEWS)) {
    for (const [name, route, act] of SHOTS) {
      const phone = view === 'phone'
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
      await ctx.addInitScript(([t, sess, uid]) => {
        localStorage.setItem('kf_theme', t)
        localStorage.setItem('sb-127-auth-token', sess)
        localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
      }, [theme, JSON.stringify(session), UID])
      await ctx.route('http://127.0.0.1:9/**', async (r) => {
        const req = r.request()
        const url = new URL(req.url())
        if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
        if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
        let rows = tables[url.pathname.replace('/rest/v1/', '')] ?? []
        const q = decodeURIComponent(url.search)
        if (q.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
        else if (q.includes('deleted_at=is.null')) rows = rows.filter((x) => !x.deleted_at)
        if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
        return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
      })
      const page = await ctx.newPage()
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
        await sleep(900)
        if (act) await act(page)
        await page.screenshot({ path: path.join(OUT, `${theme}-${view}-${name}.jpg`), type: 'jpeg', quality: 72 })
        n++
      } catch (e) {
        console.log(`MISS ${theme}-${view}-${name}: ${String(e.message).split('\n')[0]}`)
      }
      await ctx.close()
    }
  }
}
await browser.close()
console.log(`${n} shots → ${OUT}`)
