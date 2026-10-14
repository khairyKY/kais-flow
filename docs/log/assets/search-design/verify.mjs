// Search 1a / 1b (design-export/Search.dc.html) on the REAL app against a MOCKED backend (the
// cal-rail-drop recipe: dev server `--mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up
// session in localStorage, Playwright answers every REST call and the `search` function).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
// The day: Friday 10 Jul 2026 (the export's own day), Cairo (UTC+3), the clock at 10:00.
// The `search` function's answers below are what 0064's search_hybrid returns for that data
// (same titles / snippets / score bands — see 0064-pglite-check.mjs); the page does the rest.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5253'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const DESIGN = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../../../../design-export/Search.dc.html')).href
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// Cairo wall clock in July (UTC+3) → ISO.
const at = (month, day, hhmm = '09:00') => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month - 1, day, h - 3, m)).toISOString()
}
const NOW = at(7, 10, '10:00')
const CREATED = at(6, 1)
const uid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_SHAHEEN = uid('b', 1), P_FORECAST = uid('b', 2)
const OMAR = uid('c', 1), YOUSSEF = uid('c', 2)
const BOOK = uid('d', 1), NOTE_OMAR = uid('d', 2), NOTE_BOOK = uid('d', 3), QUOTE_BOOK = uid('d', 4)

const task = (n, title, over = {}) => ({
  id: uid('1', n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const TASKS = [
  task(1, 'Call Omar about pricing', { priority: 2, due_at: at(7, 11, '15:00'), scheduled_start: at(7, 11, '15:00'), scheduled_end: at(7, 11, '15:45'), notes: 'Lock the retainer number before Omar flies out on Thursday.' }),
  task(2, 'Send Omar the revised scope PDF', { project_id: P_FORECAST, due_at: at(7, 17), notes: 'waiting on the milestone table' }),
  task(3, "Reply to Omar's issue comments", { project_id: P_SHAHEEN, status: 'done', completed_at: at(7, 7, '16:00') }),
  task(4, 'Draft agenda for the Omar workshop', { notes: 'Wants three concrete demos, not slides — the Omar workshop is about the product, not the pitch.' }),
  task(5, 'Book a table for Omar', { due_at: at(7, 13) }),
  task(6, "Review Omar's milestone table", { due_at: at(7, 15) }),
  task(7, 'Ask Omar for the brand files', { someday: true }),
  task(8, 'Thank Omar for the intro', { due_at: at(7, 14) }),
  task(9, 'Invoice the retainer', { project_id: P_SHAHEEN, due_at: at(7, 31) }),
  task(10, 'Fix the footer links', { project_id: P_SHAHEEN, status: 'done', completed_at: at(7, 2) }),
]
const ev = (n, title, month, day, from, to) => ({
  id: uid('e', n), user_id: UID, title, starts_at: at(month, day, from), ends_at: at(month, day, to), all_day: false, task_id: null, source: 'native',
  gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, created_at: CREATED, updated_at: CREATED,
})
const EVENTS = [ev(1, 'Pricing call — Omar', 7, 11, '15:00', '15:45'), ev(2, 'Omar workshop — demo day', 7, 23, '10:00', '13:00'), ev(3, 'Coffee — Omar', 6, 30, '10:00', '11:00')]
const inbox = (n, raw, status, created) => ({ id: uid('a', n), user_id: UID, kind: 'text', raw_text: raw, transcript: null, ai_parse: null, confidence: null, status, filed_task_id: null, payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: created, updated_at: created })
const INBOX = [inbox(1, 'Omar mentioned a Zamalek studio for the workshop', 'pending', at(7, 9, '18:20')), inbox(2, "Omar's deck link", 'filed', at(6, 22))]
const jr = (n, body, day) => ({ id: uid('f', n), user_id: UID, body, entry_date: day, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: `${day}T18:00:00Z`, updated_at: `${day}T18:00:00Z` })
const JOURNAL = [
  jr(1, 'Omar pushed back on the timeline and he was right — the buffer was fantasy.', '2026-07-08'),
  jr(2, 'Long walk after the Omar call. Pricing anxiety is really scope anxiety.', '2026-06-27'),
  jr(3, 'Omar asked for the demo again. Said yes too quickly.', '2026-06-20'),
  jr(4, 'Good call with Omar about the retainer shape.', '2026-06-12'),
  jr(5, 'First proper meeting with Omar at the studio.', '2026-05-30'),
]
const PROJECTS = [
  { id: P_SHAHEEN, user_id: UID, name: 'Shaheen website', domain_id: null, type: 'retainer', status: 'active', color: null, completion_summary: "Omar's studio", created_at: CREATED, updated_at: CREATED, deleted_at: null },
  { id: P_FORECAST, user_id: UID, name: 'Forecasting App', domain_id: null, type: 'standard', status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null },
]
const PEOPLE = [
  { id: OMAR, user_id: UID, name: 'Omar El-Sayed', facts: [{ id: 'f1', label: 'Studio', value: 'Runs the Shaheen retainer' }], domain_id: null, created_at: CREATED, updated_at: CREATED },
  { id: YOUSSEF, user_id: UID, name: 'Youssef Hamdan', facts: [], domain_id: null, created_at: CREATED, updated_at: CREATED },
]
const INTERACTIONS = [{ id: uid('9', 1), user_id: UID, person_id: OMAR, summary: 'Pricing call prep', occurred_at: at(7, 8, '09:00'), created_at: at(7, 8), updated_at: at(7, 8) }]
const BOOKS = [{ id: BOOK, user_id: UID, title: 'Four Thousand Weeks', author: 'Oliver Burkeman', published_year: 2021, current_page: 168, total_pages: 288, status: 'reading', created_at: CREATED, updated_at: CREATED }]
const NOTES = [
  { id: NOTE_OMAR, user_id: UID, title: 'Pricing notes', body: 'From the Omar call: anchor on outcomes, not hours.', tags: ['business'], domain_id: null, book_id: null, created_at: CREATED, updated_at: CREATED },
  { id: NOTE_BOOK, user_id: UID, title: 'Efficiency trap', body: 'Clearing the inbox faster just refills it faster.', tags: [], domain_id: null, book_id: BOOK, created_at: CREATED, updated_at: CREATED },
]
const QUOTES = [{ id: QUOTE_BOOK, user_id: UID, text: 'The garden does not hurry, and yet everything is accomplished in its season.', author: 'Oliver Burkeman', source: 'Four Thousand Weeks', tags: [], book_id: BOOK, page: '148', created_at: CREATED, updated_at: CREATED }]
const TIME = [
  { id: uid('7', 1), user_id: UID, project_id: P_SHAHEEN, task_id: null, note: null, duration_min: 300, started_at: at(7, 2), ended_at: null, created_at: at(7, 2), updated_at: at(7, 2) },
  { id: uid('7', 2), user_id: UID, project_id: P_SHAHEEN, task_id: null, note: null, duration_min: 360, started_at: at(7, 8), ended_at: null, created_at: at(7, 8), updated_at: at(7, 8) },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({
  tasks: TASKS, calendar_events: EVENTS, inbox_items: INBOX, journal_entries: JOURNAL, projects: PROJECTS, areas: [], domains: [], people: PEOPLE, interactions: INTERACTIONS,
  books: BOOKS, notes: NOTES, quotes: QUOTES, time_entries: TIME, app_settings: [SETTINGS],
})

// What search_hybrid answers (0064): lexical tier 2 for a 1-word title hit, plus FTS; FTS-only rows ≥ 0.01; vector-only ≤ 0.5/61.
const h = (entity_type, entity_id, title, snippet, score) => ({ entity_type, entity_id, title, snippet, score })
const ANSWERS = {
  omar: [
    h('person', OMAR, 'Omar El-Sayed', 'Studio Runs the Shaheen retainer', 2.016),
    ...TASKS.slice(0, 8).map((t, i) => h('task', t.id, t.title, (t.notes ?? '').slice(0, 200), 2.015 - i * 0.0005)),
    h('calendar_event', uid('e', 1), 'Pricing call — Omar', null, 1.014), h('calendar_event', uid('e', 2), 'Omar workshop — demo day', null, 2.013), h('calendar_event', uid('e', 3), 'Coffee — Omar', null, 1.013),
    h('inbox_item', uid('a', 1), INBOX[0].raw_text.slice(0, 80), INBOX[0].raw_text, 2.012), h('inbox_item', uid('a', 2), INBOX[1].raw_text, INBOX[1].raw_text, 2.012),
    ...JOURNAL.map((j, i) => h('journal_entry', j.id, j.body.slice(0, 80), j.body, 1.012 - i * 0.0001)),
    h('project', P_SHAHEEN, 'Shaheen website', "Omar's studio", 0.0115),
    h('note', NOTE_OMAR, 'Pricing notes', NOTES[0].body, 0.011),
  ],
  'recurring invoces automation': [h('task', uid('1', 9), 'Invoice the retainer', '', 0.5 / 61), h('inbox_item', uid('a', 2), "Omar's deck link", "Omar's deck link", 0.5 / 63)],
  burkeman: [h('book', BOOK, 'Four Thousand Weeks', 'Oliver Burkeman', 0.0164)],
  'reply comments': [h('task', uid('1', 3), "Reply to Omar's issue comments", '', 0.0164)],
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uidKey]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(uidKey, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: 4102444800000 })) // no "Updated to …" toast over the shots
  }, [o.theme ?? 'day', JSON.stringify(session), `kf-whats-new:${UID}`])
  const state = { rows: tables(), writes: [], searches: [], offline: false }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    // A route still answers under ctx.setOffline, so "offline" is also enforced here.
    if (state.offline) return r.abort('internetdisconnected')
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname === '/functions/v1/search') {
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      const { query } = req.postDataJSON()
      state.searches.push(query)
      if (query === 'down') return r.fulfill({ status: 500, json: { error: 'bad_request' } })
      return r.fulfill({ json: { results: ANSWERS[query.trim().toLowerCase()] ?? [] } })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(NOW) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1800)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
/** The whole page: the app scrolls inside .app-main-content, so the window grows to fit it for the shot. */
async function fullShot(page, name) {
  const vp = page.viewportSize()
  let height = vp.height
  for (let i = 0; i < 4; i++) {
    const more = await page.evaluate(() => {
      const m = document.querySelector('.app-main-content')
      return m.scrollHeight - m.clientHeight
    })
    if (more <= 0 || height >= 4000) break
    height = Math.min(4000, height + more + 8)
    await page.setViewportSize({ width: vp.width, height })
    await sleep(400)
  }
  await shot(page, name)
  await page.setViewportSize(vp)
  await sleep(300)
}
const text = (loc) => loc.first().innerText().catch(() => '')
const countLine = (page) => text(page.locator('[data-search-count]'))
const group = (page, key) => page.locator(`[data-search-group="${key}"]`)
const rowsIn = (page, key) => group(page, key).locator('[data-search-row]')
const chipTexts = (page) => page.locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))

// ── A: /search?q=omar on a computer — the groups, chips, rows, Show all, the two filters ──
if (want('a')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/search?q=omar', { theme })
    if (theme === 'day') {
      check('a count line', (await countLine(page)) === "22 RESULTS FOR 'OMAR'" || (await countLine(page)).toLowerCase() === "22 results for 'omar'", await countLine(page))
      const chips = await chipTexts(page)
      check('a chips in 1a order with counts, then the two filters', JSON.stringify(chips) === JSON.stringify(['All22', 'Tasks9', 'Events3', 'Inbox2', 'Projects1', 'Journal5', 'People1', 'Library1', 'Open only']), JSON.stringify(chips))
      check('a "Any time ▾" filter present', (await page.getByRole('button', { name: 'When' }).innerText()).toLowerCase().includes('any time'), await page.getByRole('button', { name: 'When' }).innerText())
      const order = await page.locator('[data-search-group]').evaluateAll((els) => els.map((e) => e.dataset.searchGroup))
      check('a groups in 1a order (People, Tasks, Events, Inbox, Journal, Projects, Library)', JSON.stringify(order) === JSON.stringify(['person', 'task', 'calendar_event', 'inbox_item', 'journal_entry', 'project', 'library']), JSON.stringify(order))
      check('a Tasks peeks 5, the last a Related row "In Shaheen website"', (await rowsIn(page, 'task').count()) === 5 && (await text(rowsIn(page, 'task').nth(4))).includes('RELATED') && (await text(rowsIn(page, 'task').nth(4))).includes('In Shaheen website'), await text(rowsIn(page, 'task').nth(4)))
      check('a "Show all 9 →" under Tasks, "Show all 5 →" under Journal, none under Events', (await group(page, 'task').getByRole('button', { name: 'Show all 9 →' }).count()) === 1 && (await group(page, 'journal_entry').getByRole('button', { name: 'Show all 5 →' }).count()) === 1 && (await group(page, 'calendar_event').getByRole('button', { name: /Show all/ }).count()) === 0)
      const first = await text(rowsIn(page, 'task').first())
      check('a task row: the day chip "Tomorrow 15:00" and the "!!" flag', first.includes('TOMORROW 15:00') && first.includes('!!'), first.replace(/\n/g, ' | '))
      check('a task row with a matching note shows it quoted', first.includes('"Lock the retainer number before Omar flies out on Thursday."'), first.replace(/\n/g, ' | '))
      check('a event rows: day + times; the past one says so', (await text(rowsIn(page, 'calendar_event').first())).includes('Sat 11 Jul · 15:00 – 15:45') && (await text(rowsIn(page, 'calendar_event').nth(2))).includes('Past · Tue 30 Jun'), await text(rowsIn(page, 'calendar_event').nth(2)))
      check('a person row: "Last touch · 2d ago"', (await text(rowsIn(page, 'person').first())).includes('LAST TOUCH · 2D AGO'), await text(rowsIn(page, 'person').first()))
      const proj = await text(rowsIn(page, 'project').first())
      check('a project row: "1 open · retainer", "11h this month"', proj.includes('1 open · retainer') && proj.includes('11H THIS MONTH'), proj.replace(/\n/g, ' | '))
      check('a journal row: the date column and a quoted passage', (await text(rowsIn(page, 'journal_entry').first())).includes('JUL 08') && (await text(rowsIn(page, 'journal_entry').first())).includes('"Omar pushed back'), await text(rowsIn(page, 'journal_entry').first()))
      check('a library row: "Note · …"', (await text(rowsIn(page, 'library').first())).includes('Note · "From the Omar call'), await text(rowsIn(page, 'library').first()))
      check('a the query is marked in the rows', (await page.locator('.search-hl').count()) > 15, await page.locator('.search-hl').count())
      await fullShot(page, 'a-desktop-day')

      await group(page, 'task').getByRole('button', { name: 'Show all 9 →' }).click()
      await sleep(300)
      check('a Show all → the Tasks chip, all 9 rows, no other group', (await page.getByRole('button', { name: /^Tasks\s*9$/ }).getAttribute('aria-pressed')) === 'true' && (await rowsIn(page, 'task').count()) === 9 && (await page.locator('[data-search-group]').count()) === 1)
      const doneRow = rowsIn(page, 'task').filter({ hasText: "Reply to Omar's issue comments" })
      const struck = await doneRow.locator('div > div').first().evaluate((e) => getComputedStyle(e).textDecorationLine)
      check('a a done task: struck, "Done Tuesday · Shaheen website"', struck === 'line-through' && (await text(doneRow)).includes('Done Tuesday · Shaheen website'), `${struck} ${await text(doneRow)}`)
      await shot(page, 'a-desktop-show-all')
      await page.getByRole('button', { name: /^All\s*22$/ }).click()
      await sleep(200)

      await page.getByRole('button', { name: 'Open only' }).click()
      await sleep(300)
      const openChips = await chipTexts(page)
      check('a Open only: the done task, the filed capture and the past event step out (22 → 19)', (await countLine(page)).toLowerCase() === "19 results for 'omar'" && openChips.includes('Tasks8') && openChips.includes('Events2') && openChips.includes('Inbox1'), `${await countLine(page)} ${JSON.stringify(openChips)}`)
      check('a Open only is pressed', (await page.getByRole('button', { name: 'Open only' }).getAttribute('aria-pressed')) === 'true')
      await shot(page, 'a-desktop-open-only')
      await page.getByRole('button', { name: 'Open only' }).click()
      await sleep(200)

      await page.getByRole('button', { name: 'When' }).click()
      await sleep(250)
      const options = await page.getByRole('option').allInnerTexts()
      check('a Any time ▾ lists the windows', JSON.stringify(options) === JSON.stringify(['Any time', 'Today', 'This week', 'This month', 'This year']), JSON.stringify(options))
      await shot(page, 'a-desktop-any-time-open')
      await page.getByRole('option', { name: 'This week' }).click()
      await sleep(300)
      const weekGroups = await page.locator('[data-search-row]').evaluateAll((els) => els.map((e) => e.textContent.slice(0, 40)))
      check('a This week (Mon 6 – Sun 12 Jul, Cairo): 6 rows', (await countLine(page)).toLowerCase() === "6 results for 'omar'", `${await countLine(page)} ${JSON.stringify(weekGroups)}`)
      check('a the trigger reads "This week ▾"', (await page.getByRole('button', { name: 'When' }).innerText()).toLowerCase().includes('this week'))
      await page.getByRole('button', { name: 'When' }).click()
      await sleep(200)
      await page.getByRole('option', { name: 'Any time' }).click()
      await sleep(200)
      check('a back to Any time: 22', (await countLine(page)).toLowerCase() === "22 results for 'omar'", await countLine(page))

      await rowsIn(page, 'library').first().click()
      await sleep(800)
      check('a a Library hit opens its note in the Library', page.url().includes(`/library?tab=notes&noteId=${NOTE_OMAR}`), page.url())
      await page.goBack()
      await sleep(1000)
      await rowsIn(page, 'task').first().click()
      await sleep(800)
      check('a a task hit opens the task (desktop: its editor)', page.url().endsWith(`/tasks/${uid('1', 1)}`), page.url())
    } else {
      await fullShot(page, 'a-desktop-night')
    }
    check(`a no page errors (${theme})`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── B: the empty state (1b) — an answer of nothing but meaning-neighbours is "nothing came up" ──
if (want('b')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/search?q=recurring%20invoces%20automation', { theme })
    await page.locator('[data-search-state="empty"]').waitFor({ timeout: 8000 }).catch(() => {}) // a cold first load can outlast open()'s settle
    check(`b the search was asked (${theme})`, state.searches.includes('recurring invoces automation'), JSON.stringify(state.searches))
    check(`b 1b: bare soil + the chat pill, no rows (${theme})`, (await page.locator('[data-search-state="empty"]').count()) === 1 && (await page.locator('[data-search-row]').count()) === 0 && (await page.getByRole('button', { name: 'Ask the garden (chat) →' }).count()) === 1)
    check(`b "0 results for …" (${theme})`, (await countLine(page)).toLowerCase() === "0 results for 'recurring invoces automation'", await countLine(page))
    await shot(page, `b-empty-${theme}`)
    check(`b no page errors (${theme})`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── C: the search didn't answer → resting (no count, never "error") ──
if (want('c')) {
  const { ctx, page, errors, state } = await open('/search?q=down')
  check('c resting: the clover, the line, Try again', (await page.locator('[data-search-state="resting"]').count()) === 1 && (await page.getByRole('button', { name: 'Try again' }).count()) === 1)
  check('c no count line, no "error" anywhere', (await page.locator('[data-search-count]').count()) === 0 && !/error/i.test(await page.locator('main').innerText()))
  const asked = state.searches.length
  await page.getByRole('button', { name: 'Try again' }).click()
  await sleep(1200)
  check('c Try again asks again', state.searches.length === asked + 1, `${asked} → ${state.searches.length}`)
  await shot(page, 'c-resting-day')
  check('c no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D: offline — says why, waits, asks again by itself when the connection is back ──
if (want('d')) {
  const { ctx, page, errors, state } = await open('/search')
  await ctx.setOffline(true)
  state.offline = true
  await sleep(300)
  await page.getByRole('textbox', { name: 'Search' }).fill('omar')
  await sleep(1500)
  check('d offline: the offline line, no Try again, no "error"', (await page.locator('[data-search-state="offline"]').count()) === 1 && (await page.getByRole('button', { name: 'Try again' }).count()) === 0 && !/error/i.test(await page.locator('main').innerText()), JSON.stringify(await page.locator('[data-search-state]').evaluateAll((els) => els.map((e) => e.dataset.searchState + ': ' + e.textContent))) + ' ' + (await countLine(page)) + ' online=' + (await page.evaluate(() => navigator.onLine)))
  await shot(page, 'd-offline-day')
  state.offline = false
  await ctx.setOffline(false)
  await sleep(1800)
  check('d back online: the answer arrives without a tap', (await countLine(page)).toLowerCase() === "22 results for 'omar'" && state.searches.includes('omar'), await countLine(page))
  check('d no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── E: filters that hide everything found — not the "nothing came up" copy ──
if (want('e')) {
  const { ctx, page, errors } = await open('/search?q=reply%20comments')
  check('e one hit (a done task)', (await page.locator('[data-search-row]').count()) === 1)
  await page.getByRole('button', { name: 'Open only' }).click()
  await sleep(300)
  check('e Open only hides it: "Nothing here with these filters." + Clear filters, chips stay', (await page.locator('[data-search-state="filtered"]').count()) === 1 && (await page.locator('[data-search-state="empty"]').count()) === 0 && (await page.getByRole('button', { name: 'Open only' }).count()) === 1)
  await shot(page, 'e-filtered-day')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await sleep(300)
  check('e Clear filters brings it back', (await page.locator('[data-search-row]').count()) === 1 && (await page.getByRole('button', { name: 'Open only' }).getAttribute('aria-pressed')) === 'false')
  check('e no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── F: the Library group — a book, and its notes + quotes as Related ──
if (want('f')) {
  const { ctx, page, errors } = await open('/search?q=burkeman')
  const lib = await rowsIn(page, 'library').allInnerTexts()
  check('f the book, then its note and quote as Related "From Four Thousand Weeks"', lib.length === 3 && lib[0].includes('Book · Oliver Burkeman') && lib.slice(1).every((t) => t.includes('RELATED') && t.includes('From Four Thousand Weeks')), JSON.stringify(lib))
  check('f the chip: Library 3', (await chipTexts(page)).includes('Library3'), JSON.stringify(await chipTexts(page)))
  await shot(page, 'f-library-day')
  await rowsIn(page, 'library').first().click()
  await sleep(800)
  check('f the book opens in the Library', page.url().includes(`/library?tab=books&bookId=${BOOK}`), page.url())
  check('f no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── G: the ⌘/ overlay shares the answer — Library included — and "View all results" lands here ──
if (want('g')) {
  const { ctx, page, errors } = await open('/today')
  await page.keyboard.press('Control+/')
  await sleep(500)
  await page.keyboard.type('burkeman')
  await sleep(1500)
  const overlay = await text(page.locator('.kf-scrim'))
  check('g the overlay shows the Library group', overlay.includes('LIBRARY') || overlay.includes('Library'), overlay.replace(/\n/g, ' | '))
  await shot(page, 'g-overlay-day')
  await page.getByRole('button', { name: /View all results/ }).click()
  await sleep(1500)
  check('g View all results → /search?q=burkeman', page.url().endsWith('/search?q=burkeman') && (await rowsIn(page, 'library').count()) === 3, page.url())
  await page.keyboard.press('Control+/')
  await sleep(400)
  await page.keyboard.type('recurring invoces automation')
  await sleep(1500)
  check('g the overlay says nothing came up for neighbours-only', (await text(page.locator('.kf-scrim'))).includes("Nothing's come up for that"), await text(page.locator('.kf-scrim')))
  check('g no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: phone — chips scroll, input pins, groups stack; no sideways page scroll ──
if (want('p')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/search?q=omar', { view: phone, theme })
    const widths = await page.evaluate(() => {
      const main = document.querySelector('.app-main-content')
      const chips = document.querySelector('.search-chips')
      return { doc: document.documentElement.scrollWidth, main: main.scrollWidth, mainClient: main.clientWidth, chips: chips?.scrollWidth, chipsClient: chips?.clientWidth }
    })
    check(`p no sideways page scroll (${theme})`, widths.doc <= 390 && widths.main <= widths.mainClient, JSON.stringify(widths))
    check(`p the chips scroll sideways in one row (${theme})`, widths.chips > widths.chipsClient, JSON.stringify(widths))
    await shot(page, `p-phone-${theme}`)
    if (theme === 'day') {
      await fullShot(page, 'p-phone-day-full')
      await page.evaluate(() => document.querySelector('.app-main-content').scrollBy(0, 900))
      await sleep(400)
      const box = await page.getByRole('textbox', { name: 'Search' }).boundingBox()
      check('p scrolled 900px: the search box is still pinned at the top', box && box.y >= 0 && box.y < 80, JSON.stringify(box))
      await shot(page, 'p-phone-day-scrolled')
      await page.evaluate(() => document.querySelector('.app-main-content').scrollTo(0, 0))
      await sleep(300)
      await rowsIn(page, 'task').first().tap()
      await sleep(900)
      check('p a task hit opens the task sheet over the page', new URL(page.url()).searchParams.get('task') === uid('1', 1), page.url())
    }
    check(`p no page errors (${theme})`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── S: side by side with the export (1a desktop, 1b empty) ──
if (want('s')) {
  const ctx = await browser.newContext({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(DESIGN, { waitUntil: 'networkidle' })
  await sleep(1500)
  await page.locator('[id="1a"] .dv-card').screenshot({ path: path.join(OUT, 'design-1a.png') })
  await page.locator('[id="1b"] .dv-card').screenshot({ path: path.join(OUT, 'design-1b.png') })
  const pair = async (left, right, name, height = 900) => {
    const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}`
    await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:16px;padding:16px;align-items:flex-start;font:12px sans-serif">
      <figure style="margin:0"><figcaption>export</figcaption><img src="${img(left)}" style="height:${height}px"></figure>
      <figure style="margin:0"><figcaption>app</figcaption><img src="${img(right)}" style="height:${height}px"></figure></body>`)
    await sleep(300)
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 82 }) // jpeg: the pairs are for eyes, and light in git
  }
  if (fs.existsSync(path.join(OUT, 'a-desktop-day.png'))) await pair('design-1a.png', 'a-desktop-day.png', 'side-1a-desktop-day', 1400)
  if (fs.existsSync(path.join(OUT, 'a-desktop-night.png'))) await pair('design-1a.png', 'a-desktop-night.png', 'side-1a-desktop-night', 1400)
  if (fs.existsSync(path.join(OUT, 'p-phone-day-full.png'))) await pair('design-1a.png', 'p-phone-day-full.png', 'side-1a-phone-day', 1400)
  if (fs.existsSync(path.join(OUT, 'p-phone-night.png'))) await pair('design-1a.png', 'p-phone-night.png', 'side-1a-phone-night', 900)
  if (fs.existsSync(path.join(OUT, 'b-empty-day.png'))) await pair('design-1b.png', 'b-empty-day.png', 'side-1b-empty-day', 700)
  if (fs.existsSync(path.join(OUT, 'b-empty-night.png'))) await pair('design-1b.png', 'b-empty-night.png', 'side-1b-empty-night', 700)
  check('s side-by-side images written', fs.readdirSync(OUT).filter((f) => f.startsWith('side-')).length >= 4, fs.readdirSync(OUT).filter((f) => f.startsWith('side-')).join(', '))
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
