// Integrations wave 1 — the file importers, on the REAL app against a MOCKED backend (the
// task-sheet/verify.mjs recipe): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, Playwright answers every REST
// call and records every write. For each source: pick it, upload a hand-written fixture with
// setInputFiles, read the preview counts, import, and check the rows that reached "the server".
// Desktop 1280 and phone 390. Todoist also runs the Undo; Kindle on the phone runs against a
// Library that already holds one of its books + one of its highlights (dedupe by title / text).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5249'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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
const UID = '00000000-0000-4000-8000-0000000017e1'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const NOW = new Date('2026-10-03T09:00:00Z') // Sat 3 Oct 2026, 12:00 Cairo

// ── fixtures (same shapes as the adapters' unit tests) ──
const file = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text, 'utf8') })
const akiflowDump = {
  source: 'akiflow',
  projects: [{ id: 'p1', name: 'Garden' }, { id: 'p2', name: 'Errands' }],
  tags: [],
  tasks: [
    { id: 't1', title: 'Water the ferns', priority: 'HIGH', duration: 45, project_id: 'p1', datetime: '2026-10-05T17:15:00', done: false, tags: [] },
    { id: 't2', title: 'Buy seeds', priority: 'LOW', project_id: 'p2', date: '2026-10-06', done: false, tags: [] },
    { id: 't3', title: 'Old chore', done: true, done_at: '2026-09-15T09:30:00', tags: [] },
  ],
  events: [{ id: 'e1', title: 'Standup', start: '2026-10-05T10:00:00', end: '2026-10-05T10:15:00', all_day: false }],
}
const todoistGarden = [
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
  'meta,view_style=list,,,,,,,,,,,,',
  'task,Repot the basil @garden @weekend,Terracotta pot from the shed,1,1,Kai (48151623),,Oct 5 2026,en,Africa/Cairo,30,minute,,',
  'task,Buy compost,,4,2,Kai (48151623),,,en,Africa/Cairo,,None,,',
  'note,Get the peat-free one,,,,Kai (48151623),,,,,,,,',
  'section,Weekly,,,,,,,,,,,,',
  'task,Water the ferns,,2,1,Kai (48151623),,every monday at 9am,en,Africa/Cairo,15,minute,,',
  'task,Check the seed tray,,3,1,Kai (48151623),,every day,en,,,,,',
].join('\r\n')
const todoistErrands = ['TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT', 'task,Post the parcel,,2,1,Kai (48151623),,Oct 9 2026 10:00,en,Africa/Cairo,,'].join('\r\n')
const tt = (o) => [o.folder ?? '', o.list ?? 'Inbox', o.title, o.kind ?? 'TEXT', o.tags ?? '', o.content ?? '', o.checklist ?? 'N', o.start ?? '', o.due ?? '', '', o.repeat ?? '', o.priority ?? '0', o.status ?? '0', '2026-09-30T08:00:00+0000', o.completed ?? '', '-1', o.tz ?? 'Africa/Cairo', o.allDay ?? 'false', 'false', '', '', 'list', o.id, o.parent ?? ''].map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
const ticktick = [
  '"Date: 2026-10-03+0000"', '"Version: 7.1"', '"Status: \n0 Normal\n1 Completed\n2 Archived"',
  '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"',
  tt({ folder: 'Home', list: 'Garden', title: 'Repot the basil', tags: 'garden,weekend', start: '2026-10-04T21:00:00+0000', due: '2026-10-04T21:00:00+0000', priority: '5', allDay: 'true', id: '64f0a1' }),
  tt({ folder: 'Home', list: 'Garden', title: 'Buy compost', id: '64f0a2', parent: '64f0a1' }),
  tt({ title: 'Call the nursery', start: '2026-10-05T07:00:00+0000', due: '2026-10-05T07:30:00+0000', priority: '3', id: '64f0a3' }),
  tt({ folder: 'Home', list: 'Garden', title: 'Water the ferns', start: '2026-10-05T06:00:00+0000', due: '2026-10-05T06:00:00+0000', repeat: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', priority: '1', id: '64f0a4' }),
  tt({ folder: 'Home', list: 'Garden', title: 'Seed tray checklist', kind: 'CHECKLIST', content: '▪Fill trays\n▫Sow seeds', checklist: 'Y', status: '2', completed: '2026-09-20T15:12:00+0000', id: '64f0a5' }),
  tt({ title: 'Garden ideas', kind: 'NOTE', tags: 'ideas', content: 'Espalier the pear tree', id: '64f0a6' }),
  tt({ list: 'Work', title: 'Quarterly review', start: '2026-10-07T07:00:00+0000', due: '2026-10-07T07:00:00+0000', status: '1', completed: '2026-10-02T10:00:00+0000', allDay: 'true', id: '64f0a7' }),
].join('\r\n')
const notion = '\uFEFF' + [
  'Name,Assignee,Created time,Date,Done,Priority,Project,Status,Tags',
  'Repot the basil,Kai,"October 1, 2026 9:12 AM","October 5, 2026",No,High,Garden (https://www.notion.so/Garden-1a2b3c4d5e6f),In progress,"garden, weekend"',
  'File the taxes,Kai,"September 20, 2026 8:00 AM","October 12, 2026 9:00 AM",No,Medium,,Not started,admin',
  'Order seeds,Kai,"September 2, 2026 8:00 AM","September 10, 2026 → September 12, 2026",Yes,Low,Garden (https://www.notion.so/Garden-1a2b3c4d5e6f),Done,',
].join('\n')
const mdGarden = [
  '---', 'tags: [garden]', '---', '# Garden', '', 'Spring plan for the back beds.', '', '## This week',
  '- [ ] Repot the basil 📅 2026-10-05 #garden ⏫', '- [x] Order seeds ✅ 2026-09-28', '- [ ] Water the ferns 🔁 every week ⏳ 2026-10-05 🔼',
  '\t- [ ] Check the drip line', '', '```', '- [ ] not a task', '```', '## Someday', '* [ ] Plant a pear tree #trees/fruit 🔽',
].join('\n')
const mdDaily = ['# Saturday', '- [ ] Call the nursery 🛫 2026-10-04 #calls', 'Neem oil for the aphids.'].join('\n')
const kclip = (head, meta, text) => [head, meta, '', text, '=========='].join('\r\n')
const FTW = 'Four Thousand Weeks: Time Management for Mortals (Burkeman, Oliver)'
const DUNE = 'Dune (Dune Chronicles Book 1) (Frank Herbert)'
const LONG = 'The average human lifespan is absurdly, terrifyingly, insultingly short. Here’s one way of putting things in perspective.'
const kindle = '\uFEFF' + [
  kclip(FTW, '- Your Highlight on page 12 | Location 170-172 | Added on Monday, 5 October 2026 07:12:44', 'The average human lifespan is absurdly, terrifyingly, insultingly short.'),
  kclip(FTW, '- Your Highlight on page 12 | Location 170-174 | Added on Monday, 5 October 2026 07:13:02', LONG),
  kclip(FTW, '- Your Note on page 12 | Location 174 | Added on Monday, 5 October 2026 07:13:40', 'Use this in the talk'),
  kclip(FTW, '- Your Bookmark on page 40 | Location 610 | Added on Monday, 5 October 2026 08:00:00', ''),
  kclip(DUNE, '- Your Highlight at location 1200-1201 | Added on Sunday, October 4, 2026 9:15:00 PM', 'I must not fear. Fear is the mind-killer.'),
  kclip(DUNE, '- Your Highlight at location 1300-1302 | Added on Sunday, October 4, 2026 9:20:00 PM', 'The mystery of life isn’t a problem to solve.'),
  kclip('My Clipped Article', '- Your Highlight on Location 5-6 | Added on Saturday, 3 October 2026 10:00:00', 'Plain documents have no author.'),
].join('\r\n') + '\r\n'
const goodreads = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '54785515,"Four Thousand Weeks: Time Management for Mortals",Oliver Burkeman,"Burkeman, Oliver",,"=""0374159122""","=""9780374159122""",5,4.18,"Farrar, Straus and Giroux",Hardcover,288,2021,2021,2026/09/12,2026/08/01,,,read,"Changed how I plan.<br/><br/>Re-read yearly.",,,1,0',
  '44767458,"Dune (Dune, #1)",Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.27,Ace,Paperback,,2019,1965,,2026/09/20,currently-reading,currently-reading (#1),currently-reading,,,,0,0',
  '40121378,The Overstory,Richard Powers,"Powers, Richard",,,,0,4.06,W. W. Norton,Hardcover,502,2018,2018,,2026/07/01,to-read,to-read (#3),to-read,,,Ask Lina about it,0,0',
  '11111111,Half a Book,Some Author,"Author, Some",,,,2,3.10,,Paperback,200,2010,,,2026/05/05,did-not-finish,did-not-finish (#1),did-not-finish,,,,0,0',
].join('\n')
const csv = ['Title,Notes,Due Date,Priority,Project,Done', 'Repot the basil,"Needs a bigger pot, terracotta",2026-10-20,HIGH,Garden,no', 'File the report,,2026-10-21 14:30,MEDIUM,Work,yes', '"Say ""hello"" to the neighbours",,,LOW,,no'].join('\r\n')

// ── scenes: source pill, files, expected preview chips, expected writes per table ──
const SCENES = [
  { label: 'Akiflow JSON', how: 'akiflow-dump.json', files: [file('akiflow-dump.json', JSON.stringify(akiflowDump), 'application/json')],
    counts: ['2 projects', '3 tasks', '1 event', '1 completed'], writes: { projects: 2, tasks: 2 },
    rows: (w) => w.tasks.find((t) => t.title === 'Water the ferns')?.scheduled_start === '2026-10-05T14:15:00.000Z' },
  { label: 'Todoist', how: 'Export as a template', files: [file('Garden Projects.csv', todoistGarden, 'text/csv'), file('Errands.csv', todoistErrands, 'text/csv')],
    counts: ['2 projects', '5 tasks'], writes: { projects: 2, tasks: 5 }, undo: true,
    rows: (w) => {
      const basil = w.tasks.find((t) => t.title === 'Repot the basil')
      const compost = w.tasks.find((t) => t.title === 'Buy compost')
      const ferns = w.tasks.find((t) => t.title === 'Water the ferns')
      return basil?.priority === 1 && basil.labels.join() === 'garden,weekend' && compost?.parent_task_id === basil.id && compost.notes === 'Get the peat-free one' &&
        ferns?.recurrence_rule === 'FREQ=WEEKLY;BYDAY=MO' && ferns.due_at === '2026-10-05T06:00:00.000Z' && basil.project_id === w.projects.find((p) => p.name === 'Garden Projects')?.id
    } },
  { label: 'TickTick', how: 'Backup & Restore', files: [file('ticktick-backup.csv', ticktick, 'text/csv')],
    counts: ['2 projects', '6 tasks', '1 note', '2 completed'], writes: { projects: 2, tasks: 4, notes: 1 },
    rows: (w) => {
      const n = w.tasks.find((t) => t.title === 'Call the nursery')
      return n?.scheduled_start === '2026-10-05T07:00:00.000Z' && n.duration_min === 30 && w.tasks.find((t) => t.title === 'Buy compost')?.parent_task_id === w.tasks.find((t) => t.title === 'Repot the basil')?.id && w.notes[0]?.title === 'Garden ideas'
    } },
  { label: 'Notion', how: 'Markdown & CSV', files: [file('Tasks 1a2b3c.csv', notion, 'text/csv')], mapping: true,
    counts: ['1 project', '3 tasks', '1 completed'], writes: { projects: 1, tasks: 2 },
    rows: (w) => w.tasks.find((t) => t.title === 'File the taxes')?.due_at === '2026-10-12T06:00:00.000Z' && w.tasks.find((t) => t.title === 'Repot the basil')?.labels.join() === 'garden,weekend' && w.projects[0]?.name === 'Garden' },
  { label: 'Obsidian / Markdown', how: 'Obsidian needs no export', files: [file('Garden.md', mdGarden, 'text/markdown'), file('2026-10-03.md', mdDaily, 'text/markdown')], markdown: true,
    counts: ['3 projects', '6 tasks', '2 inbox notes', '1 completed'], writes: { projects: 3, tasks: 5, inbox_items: 2 },
    rows: (w) => w.tasks.find((t) => t.title === 'Check the drip line')?.parent_task_id === w.tasks.find((t) => t.title === 'Water the ferns')?.id && w.tasks.find((t) => t.title === 'Water the ferns')?.recurrence_rule === 'FREQ=WEEKLY' && w.inbox_items.some((i) => i.raw_text === 'Neem oil for the aphids.' && i.status === 'pending') },
  { label: 'Kindle highlights', how: 'My Clippings.txt', files: [file('My Clippings.txt', kindle)],
    counts: ['3 books', '4 highlights', '1 note'], writes: { books: 3, quotes: 4, notes: 1 },
    rows: (w) => {
      const dune = w.books.find((b) => b.title === 'Dune (Dune Chronicles Book 1)')
      return dune?.status === 'reading' && w.quotes.filter((q) => q.book_id === dune.id).length === 2 && w.books.find((b) => b.title.startsWith('Four'))?.author === 'Oliver Burkeman' && w.notes[0]?.book_id === w.books.find((b) => b.title.startsWith('Four'))?.id
    } },
  { label: 'Goodreads books', how: 'Export Library', files: [file('goodreads_library_export.csv', goodreads, 'text/csv')],
    counts: ['4 books', '2 notes'], writes: { books: 2, notes: 2 }, toggle: 'want-to-read',
    rows: (w) => w.books.find((b) => b.title.startsWith('Four'))?.status === 'finished' && w.books.find((b) => b.title.startsWith('Four'))?.current_page === 288 && w.notes.some((n) => n.body.startsWith('My rating: 5/5')) },
  { label: 'Generic CSV', how: 'you map the columns next', files: [file('export.csv', csv, 'text/csv')], mapping: true,
    counts: ['2 projects', '3 tasks', '1 completed'], writes: { projects: 2, tasks: 2 },
    rows: (w) => w.tasks.find((t) => t.title === 'Repot the basil')?.due_at === '2026-10-19T21:00:00.000Z' },
]

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 860 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }

async function open(viewName, seed = {}) {
  const ctx = await browser.newContext({ ...VIEWS[viewName], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
  }, [JSON.stringify(session)])
  const state = { rows: { app_settings: [SETTINGS], ...seed }, writes: [] }
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
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/settings/import`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Import data' }).waitFor({ timeout: 15000 })
  return { ctx, page, state, errors }
}

/** Upserted rows per table (POST bodies may be one row or an array). */
function upserts(state, from = 0) {
  const by = {}
  for (const w of state.writes.slice(from)) {
    if (w.method !== 'POST' || !w.body || typeof w.body !== 'object') continue
    for (const row of [w.body].flat()) (by[w.table] ??= []).push(row)
  }
  return by
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })

async function runScene(viewName, s, seed, expectCounts = s.counts, expectWrites = s.writes) {
  const tag = `${viewName} ${s.label}`
  const slug = `${viewName}-${s.label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`
  const { ctx, page, state, errors } = await open(viewName, seed)
  await page.getByRole('button', { name: s.label, exact: true }).click()
  check(`${tag}: the pick card says how to export`, (await page.getByText(s.how, { exact: false }).count()) > 0)
  if (s.markdown) {
    await page.locator('select').first().selectOption('heading')
    await page.getByLabel('Also bring plain paragraphs in, as Inbox notes').check()
  }
  await shot(page, `${slug}-1-pick`)
  await page.locator('[data-testid="import-file"]').setInputFiles(s.files)
  if (s.mapping) {
    await page.getByRole('button', { name: 'Continue to preview' }).waitFor({ timeout: 10000 })
    await shot(page, `${slug}-2-mapping`)
    await page.getByRole('button', { name: 'Continue to preview' }).click()
  }
  const counts = page.locator('[data-testid="import-counts"]')
  await counts.waitFor({ timeout: 15000 })
  const chips = await counts.evaluate((el) => [...el.children].map((c) => c.textContent).join(' | ')) // textContent: chips render uppercase
  check(`${tag}: preview counts ${expectCounts.join(' / ')}`, expectCounts.every((c) => chips.includes(c)), chips)
  await shot(page, `${slug}-3-preview`)
  const go = page.getByRole('button', { name: /^Import / })
  const label = await go.innerText()
  await go.click()
  const summary = page.locator('[data-testid="import-summary"]')
  await summary.waitFor({ timeout: 20000 })
  await sleep(800) // the import.run activity row flushes right after
  const w = upserts(state)
  const got = Object.fromEntries(Object.keys(expectWrites).map((t) => [t, (w[t] ?? []).length]))
  check(`${tag}: writes ${JSON.stringify(expectWrites)} (button "${label}")`, Object.entries(expectWrites).every(([t, n]) => got[t] === n) && ['tasks', 'projects', 'books', 'quotes', 'notes', 'inbox_items', 'calendar_events'].every((t) => t in expectWrites || !(t in w)), JSON.stringify(got))
  check(`${tag}: rows carry the mapped fields`, s.rows({ projects: [], tasks: [], books: [], quotes: [], notes: [], inbox_items: [], ...w }))
  const run = (w.activity_log ?? []).find((a) => a.event_type === 'import.run')
  check(`${tag}: one import.run in Activity`, run && (w.activity_log ?? []).filter((a) => a.event_type === 'import.run').length === 1, JSON.stringify(run?.payload ?? null))
  await shot(page, `${slug}-4-summary`)

  if (s.undo) {
    const before = state.writes.length
    await page.getByRole('button', { name: 'Undo this import' }).click()
    await page.getByText('Undone —', { exact: false }).waitFor({ timeout: 15000 })
    await sleep(600)
    const after = state.writes.slice(before)
    const trashed = upserts(state, before).tasks ?? []
    check(`${tag}: Undo → every task to the Trash with its ref cleared, projects removed`,
      trashed.length === expectWrites.tasks && trashed.every((t) => t.deleted_at && t.external_ref === null) &&
      after.filter((x) => x.method === 'DELETE' && x.table === 'projects').length === expectWrites.projects, `${trashed.length} trashed, ${after.filter((x) => x.method === 'DELETE').length} deletes`)
    await shot(page, `${slug}-5-undone`)
  }
  if (s.toggle && viewName === 'phone') {
    // Start over and opt the want-to-read shelf in.
    await page.getByRole('button', { name: 'Import another file' }).click()
    await page.getByRole('button', { name: s.label, exact: true }).click()
    await page.locator('[data-testid="import-file"]').setInputFiles(s.files)
    await counts.waitFor({ timeout: 15000 })
    await page.getByLabel(/Include the want-to-read shelf/).check()
    const from = state.writes.length
    await page.getByRole('button', { name: /^Import / }).click()
    await summary.waitFor({ timeout: 20000 })
    await sleep(500)
    const books = upserts(state, from).books ?? []
    check(`${tag}: want-to-read opt-in lands those as reading, page 0`, books.length === 4 && books.filter((b) => b.status === 'reading' && b.current_page === 0).length === 3, books.map((b) => `${b.title}:${b.status}`).join(', '))
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

for (const viewName of ['desktop', 'phone']) {
  for (const s of SCENES) {
    try {
      if (viewName === 'phone' && s.label === 'Kindle highlights') {
        // The Library already has "Four thousand weeks" (typed by hand) holding the long highlight.
        const bookId = 'b0000000-0000-4000-8000-000000000001'
        const seed = {
          books: [{ id: bookId, user_id: UID, title: 'Four thousand weeks', author: 'Oliver Burkeman', published_year: 2021, current_page: 40, total_pages: 288, status: 'reading', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }],
          quotes: [{ id: 'q0000000-0000-4000-8000-000000000001', user_id: UID, text: LONG, author: 'Oliver Burkeman', source: 'Four thousand weeks', tags: [], book_id: bookId, page: '12', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }],
        }
        await runScene(viewName, { ...s, rows: (w) => w.quotes.length === 3 && w.notes[0]?.book_id === bookId && !w.books.some((b) => b.title.startsWith('Four')) }, seed,
          ['3 books · 1 already here', '4 highlights · 1 already here', '1 note'], { books: 2, quotes: 3, notes: 1 })
      } else await runScene(viewName, s, {})
    } catch (e) {
      check(`${viewName} ${s.label}: scene ran`, false, e.message.split('\n')[0])
    }
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
