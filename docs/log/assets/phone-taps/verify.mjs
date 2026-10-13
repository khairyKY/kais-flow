// phone-taps (2026-10-13): proof that the patch draws NOTHING new. ds-fix-3's harness (docs/log/assets/ds-fix-3/verify.mjs),
// pointed at the pages this patch touches: the real app against a mocked backend (dev server `--mode mock`,
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session, Playwright answers every REST call), clock frozen.
//   - journal: phone 360/390/430 (+ the "add a thought" editor open) and desktop: the new tap areas are invisible;
//   - tasks: an in-progress task draws its "In progress" label (the --acc-blossom-text swap);
//   - every page whose phone title size was removed: activity, journal, people, projects, weekly review, routines,
//     guide (+ an article), settings, today.
// Each view, day and night: a PNG of the viewport and a dump of every element's computed type/colour/size. The
// `kf-hit*` tap-area classes are left out of the dump's names (adding one is the point; what it draws is not).
//   node verify.mjs shots <outDir> [baseUrl]   (ONLY=name,name narrows)
//   node verify.mjs diff  <dirA> <dirB>        PNG pixels + computed styles; exit 1 on any difference
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [MODE, A, B] = process.argv.slice(2)
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const APP = path.resolve(HERE, '../../../../app')
const PW = process.env.PW ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (MODE === 'diff') {
  const { default: sharp } = await import(pathToFileURL(path.join(APP, 'node_modules/sharp/dist/index.cjs')).href)
  let bad = 0, n = 0
  for (const f of fs.readdirSync(A).filter((x) => x.endsWith('.png')).sort()) {
    n++
    const j = f.replace(/\.png$/, '.json')
    if (!fs.existsSync(path.join(B, f))) { console.log(`FAIL ${f} missing in ${B}`); bad++; continue }
    const [x, y] = await Promise.all([A, B].map((d) => sharp(path.join(d, f)).raw().toBuffer({ resolveWithObject: true })))
    let px = 0
    if (x.data.length === y.data.length) for (let i = 0; i < x.data.length; i += x.info.channels) if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2]) px++
    const [sa, sb] = [A, B].map((d) => JSON.parse(fs.readFileSync(path.join(d, j), 'utf8')))
    const styl = sa.length === sb.length ? sa.filter((s, i) => s !== sb[i]) : null
    const ok = x.data.length === y.data.length && px === 0 && styl?.length === 0
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${f.replace(/\.png$/, '')}  ${x.info.width}×${x.info.height}  ${px} px differ · ${sa.length} elements, ${styl ? styl.length : `count ${sa.length}→${sb.length}`} styles differ`)
    if (styl?.length) for (const [i, s] of sa.entries()) if (s !== sb[i]) console.log(`     #${i}\n       ${s}\n       ${sb[i]}`)
  }
  console.log(`\n${n - bad}/${n} identical`)
  process.exit(bad || !n ? 1 : 0)
}

const OUT = A
const BASE = B ?? 'http://localhost:5269'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data: Tue 13 Oct 2026, 11:00 Cairo (ds-fix-3's set, plus an in-progress task) ──
const NOW = new Date('2026-10-13T08:00:00Z')
const TODAY = '2026-10-13'
const T = '2026-09-01T09:00:00Z'
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, over) => ({ id: id('1', n), user_id: UID, project_id: null, domain_id: null, area_id: null, title: 'Task', notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over })
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const HOME = { id: id('4', 2), user_id: UID, name: 'Home', color: 'var(--acc-sage)', sort_order: 1, deleted_at: null, created_at: T, updated_at: T }
const SITE = { id: id('2', 1), user_id: UID, domain_id: WORK.id, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, target_date: '2026-11-15T00:00:00Z', engagement_model: 'Freelance', deleted_at: null, created_at: T, updated_at: T,
  milestones: [{ id: id('9', 1), title: 'Launch', weight: 2, completed: false }, { id: id('9', 4), title: 'Wireframes', weight: 1, completed: true }],
  checklist: [{ id: id('9', 2), title: 'Buy domain', type: 'one-shot', completed: true, task_id: null }, { id: id('9', 3), title: 'Ship the hero', type: 'task-linked', completed: false, task_id: id('1', 3) }] }
const OLD = { ...SITE, id: id('2', 2), name: 'Old site', status: 'archived', milestones: [], checklist: [], target_date: null, completion_summary: 'It finally shipped.' }
const AREA = { id: id('3', 1), user_id: UID, domain_id: WORK.id, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const TASKS = [
  task(1, { title: 'Water plants', area_id: AREA.id, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', due_at: '2026-12-07T07:00:00Z' }),
  task(2, { title: 'Book the gym', area_id: AREA.id, top3: true, due_at: '2026-10-13T07:00:00Z' }),
  task(3, { title: 'Write the hero copy', project_id: SITE.id, domain_id: WORK.id }),
  task(4, { title: 'Old errand', deleted_at: '2026-10-10T10:00:00Z' }),
  task(5, { title: 'Send the invoice', status: 'done', completed_at: '2026-10-13T06:30:00Z', project_id: SITE.id }),
  task(6, { title: 'Fix the gate', status: 'done', completed_at: '2026-10-11T12:00:00Z' }),
  task(7, { title: 'Learn the cello', someday: true }),
  task(8, { title: 'Call the bank', due_at: '2026-10-09T07:00:00Z' }),
  task(9, { title: 'Draft the newsletter', scheduled_start: '2026-10-13T07:30:00Z', scheduled_end: '2026-10-13T08:30:00Z', due_at: '2026-10-13T07:00:00Z' }),
]
const ROUTINE = { id: id('7', 1), user_id: UID, name: 'Stretch', time_of_day: 'evening', clock_time: '21:30', cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: ['Neck rolls', 'Hamstrings'], domain_id: WORK.id, goal_days: null, created_at: T, updated_at: T }
const WATERR = { ...ROUTINE, id: id('7', 2), name: 'Glass of water', time_of_day: 'morning', clock_time: '07:00', steps: [], challenge_start: '2026-10-01', challenge_end: '2026-10-30' }
const COMPLETIONS = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].flatMap((d, i) => [
  { id: id('c', 10 + i), user_id: UID, routine_id: WATERR.id, completed_on: d, created_at: `${d}T05:00:00Z` },
  ...(i < 3 ? [{ id: id('c', 20 + i), user_id: UID, routine_id: ROUTINE.id, completed_on: d, created_at: `${d}T19:00:00Z` }] : []),
])
const BOOK = { id: id('8', 1), user_id: UID, title: 'Dune', author: 'Frank Herbert', published_year: 1965, current_page: 120, total_pages: 412, status: 'reading', created_at: T, updated_at: T }
const NOTE = { id: id('8', 2), user_id: UID, title: 'On patience', body: 'Slow is smooth.', tags: ['pace'], domain_id: null, book_id: BOOK.id, created_at: T, updated_at: T }
const QUOTE = { id: id('8', 3), user_id: UID, text: 'Fear is the mind-killer.', author: 'Herbert', source: 'Dune', tags: [], book_id: BOOK.id, page: '8', created_at: T, updated_at: T }
const THOUGHT = { id: id('8', 4), user_id: UID, parent_type: 'quote', parent_id: QUOTE.id, body: 'Still true.', created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z' }
const PERSON = { id: id('5', 1), user_id: UID, name: 'Priya', domain_id: null, created_at: T, updated_at: T, facts: [{ id: 'f-bday', label: 'Birthday', value: 'July 17', date: '2026-07-17', recurs: true }, { id: 'f-climb', label: 'Interest', value: 'Climbing' }] }
const QUIET = { id: id('5', 3), user_id: UID, name: 'Tarek', domain_id: null, facts: [], created_at: T, updated_at: T }
const TOUCH = { id: id('5', 2), user_id: UID, person_id: PERSON.id, summary: 'Coffee catch up', occurred_at: '2026-10-05T10:00:00Z', created_at: T, updated_at: T }
const ENTRY = { id: id('6', 9), user_id: UID, body: 'Morning pages', entry_date: TODAY, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: `${TODAY}T05:00:00Z`, updated_at: `${TODAY}T05:00:00Z` }
const TIME = { id: id('b', 1), user_id: UID, task_id: id('1', 3), project_id: SITE.id, started_at: '2026-10-12T07:00:00Z', ended_at: '2026-10-12T09:00:00Z', duration_min: 120, note: 'Hero section', type: 'work', created_at: T, updated_at: T }
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }
const tables = () => structuredClone({
  tasks: TASKS, projects: [SITE, OLD], areas: [AREA], domains: [WORK, HOME], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [ENTRY],
  activity_log: [], time_entries: [TIME], people: [PERSON, QUIET], interactions: [TOUCH], routines: [ROUTINE, WATERR], routine_completions: COMPLETIONS,
  books: [BOOK], notes: [NOTE], quotes: [QUOTE], commentary: [THOUGHT],
})

// ── views ──
const PHONES = ['phone360', 'phone', 'phone430']
const SHOTS = [
  ['journal', '/journal', null, ['desktop', ...PHONES]],
  ['journal-thought', '/journal', async (p) => { await p.getByRole('button', { name: /add a thought/ }).first().click(); await sleep(700) }, PHONES],
  ['tasks', '/tasks'], ['tasks-all', '/tasks?list=all'],
  ['activity', '/activity'], ['people', '/people'], ['projects', '/projects'], ['weekly-review', '/weekly-review'], ['routines', '/routines'],
  ['guide', '/guide'], ['guide-article', '/guide/getting-started'], ['settings', '/settings'], ['today', '/today'],
].filter(([name]) => !process.env.ONLY || process.env.ONLY.split(',').includes(name))

const STYLE_PROPS = ['font-size', 'letter-spacing', 'line-height', 'font-family', 'font-weight', 'color', 'background-color', 'border-top-color', 'border-top-left-radius', 'border-bottom-right-radius', 'box-shadow', 'width', 'height']
// Software raster, images decoded before they draw, no partial re-raster: the same page paints the same pixels.
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: (process.env.CHROME_ARGS ?? '--disable-gpu --disable-checker-imaging --disable-partial-raster').split(' ').filter(Boolean) })
const phone = (width) => ({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 800 } }, phone: phone(390), phone360: phone(360), phone430: phone(430) }
let n = 0, miss = 0
for (const theme of ['day', 'night']) for (const [name, route, act, views = ['desktop', 'phone']] of SHOTS) for (const view of views) {
  const ctx = await browser.newContext({ ...VIEWS[view], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox', 'hint:top3', 'hint:capture']))
  }, [theme, JSON.stringify(session), UID])
  const rows = tables()
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    let list = rows[url.pathname.replace('/rest/v1/', '')] ?? []
    const q = decodeURIComponent(url.search)
    if (q.includes('deleted_at=not.is.null')) list = list.filter((x) => x.deleted_at)
    else if (q.includes('deleted_at=is.null')) list = list.filter((x) => !x.deleted_at)
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return list.length ? r.fulfill({ json: list[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: list, headers: { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` } }).catch(() => {})
  })
  const file = path.join(OUT, `${theme}-${view}-${name}`)
  try {
    const page = await ctx.newPage()
    await page.clock.install({ time: NOW })
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await sleep(1200)
    if (act) await act(page)
    // Settle: park the pointer where nothing hovers, hide the text caret (it blinks), let transitions finish.
    await page.mouse.move(VIEWS[view].viewport.width - 1, 1)
    await page.addStyleTag({ content: '* { caret-color: transparent !important }' })
    await page.evaluate(() => document.fonts.ready)
    await sleep(1500)
    // Visually still: shots until two in a row match (≤8 tries). Raster images hidden, boxes kept (ds-fix-3: Chrome's
    // resample of a downscaled <img> differs run to run on an untouched tree).
    await page.addStyleTag({ content: 'img { visibility: hidden !important }' })
    const shoot = () => page.screenshot({ animations: 'disabled' })
    let shot = await shoot()
    for (let i = 0; i < 8; i++) {
      await sleep(500)
      const next = await shoot()
      if (next.equals(shot)) break
      shot = next
    }
    fs.writeFileSync(`${file}.png`, shot)
    const styles = await page.evaluate((props) => [...document.querySelectorAll('body *')].map((e) => {
      const s = getComputedStyle(e)
      const cls = e.className && typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => c && !c.startsWith('kf-hit')) : []
      return `${e.tagName.toLowerCase()}${cls.length ? '.' + cls.join('.') : ''} ${(e.childNodes[0]?.nodeType === 3 ? e.childNodes[0].textContent.trim().slice(0, 24) : '')}|${props.map((p) => s.getPropertyValue(p)).join('|')}`
    }), STYLE_PROPS)
    fs.writeFileSync(`${file}.json`, JSON.stringify(styles))
    n++
    console.log(`ok   ${theme}-${view}-${name}`)
  } catch (e) {
    miss++
    console.log(`MISS ${theme}-${view}-${name}: ${String(e.message).split('\n')[0]}`)
  }
  await ctx.close().catch(() => {})
}
await browser.close()
console.log(`${n} views → ${OUT}${miss ? ` (${miss} missed)` : ''}`)
process.exit(miss ? 1 : 0)
