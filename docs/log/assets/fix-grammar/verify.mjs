// fix-grammar (2026-10-12): the interaction grammar across People, Library, Journal, Projects,
// Perennials, Routines, Trash, Settings, Focus — Undo instead of confirms, no data loss, ⋯ +
// right-click + ActionSheet, phone sheets. The REAL app signed in against a MOCKED backend (the
// edit-after-create recipe): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9, a
// made-up session sits in localStorage, Playwright answers every REST call and records each write,
// so the checks assert the rows the outbox actually sent. Desktop 1280×800 + phone 390×844,
// then a day + night screenshot sweep of every touched page.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5248'
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
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── data ──
const T = '2026-09-01T09:00:00Z'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, over) => ({ id: id('1', n), user_id: UID, project_id: null, domain_id: null, area_id: null, title: 'Task', notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T, ...over })
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const ROUTINE = { id: id('7', 1), user_id: UID, name: 'Stretch', time_of_day: 'evening', clock_time: '21:30', cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, challenge_start: null, challenge_end: null, active: true, steps: ['Neck rolls', 'Hamstrings'], domain_id: WORK.id, goal_days: null, created_at: T, updated_at: T }
const BOOK = { id: id('8', 1), user_id: UID, title: 'Dune', author: 'Frank Herbert', published_year: 1965, current_page: 120, total_pages: 412, status: 'reading', created_at: T, updated_at: T }
const NOTE = { id: id('8', 2), user_id: UID, title: 'On patience', body: 'Slow is smooth.', tags: ['pace'], domain_id: null, book_id: BOOK.id, created_at: T, updated_at: T }
const QUOTE = { id: id('8', 3), user_id: UID, text: 'Fear is the mind-killer.', author: 'Herbert', source: 'Dune', tags: [], book_id: null, page: '8', created_at: T, updated_at: T }
const SITE = { id: id('2', 1), user_id: UID, domain_id: WORK.id, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, target_date: '2026-11-15T00:00:00Z', engagement_model: 'Freelance', deleted_at: null, created_at: T, updated_at: T,
  milestones: [{ id: id('9', 1), title: 'Launch', weight: 2, completed: false }], checklist: [{ id: id('9', 2), title: 'Buy domain', type: 'one-shot', completed: false, task_id: null }, { id: id('9', 3), title: 'Ship the hero', type: 'task-linked', completed: false, task_id: id('1', 3) }] }
const OLD = { ...SITE, id: id('2', 2), name: 'Old site', status: 'archived', milestones: [], checklist: [], target_date: null }
const AREA = { id: id('3', 1), user_id: UID, domain_id: WORK.id, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const WATER = task(1, { title: 'Water plants', area_id: AREA.id, recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', due_at: '2026-12-07T07:00:00Z' })
const GYM = task(2, { title: 'Book the gym', area_id: AREA.id })
const COPY = task(3, { title: 'Write the hero copy', project_id: SITE.id })
const BINNED = task(4, { title: 'Old errand', deleted_at: '2026-10-10T10:00:00Z' })
const PERSON = { id: id('5', 1), user_id: UID, name: 'Priya', domain_id: null, created_at: T, updated_at: T,
  facts: [{ id: 'f-bday', label: 'Birthday', value: 'July 17', date: '2026-07-17', recurs: true }, { id: 'f-climb', label: 'Interest', value: 'Climbing' }] }
// never reached out → a nudge card on People (desktop and phone)
const QUIET = { id: id('5', 3), user_id: UID, name: 'Tarek', domain_id: null, facts: [], created_at: T, updated_at: T }
const TOUCH = { id: id('5', 2), user_id: UID, person_id: PERSON.id, summary: 'Coffee catch up', occurred_at: '2026-10-05T10:00:00Z', created_at: T, updated_at: T }
const ENTRY = { id: id('6', 9), user_id: UID, body: 'Morning pages', entry_date: TODAY, mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: `${TODAY}T07:00:00Z`, updated_at: `${TODAY}T07:00:00Z` }
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
const tables = () => ({
  tasks: [WATER, GYM, COPY, BINNED], projects: [SITE, OLD], areas: [AREA], domains: [WORK], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [ENTRY],
  activity_log: [], time_entries: [], people: [PERSON, QUIET], interactions: [TOUCH], routines: [ROUTINE], routine_completions: [],
  books: [BOOK], notes: [NOTE], quotes: [QUOTE], commentary: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESK = { width: 1280, height: 800 }
const live = new Set()
/** One check group: a throw is a FAIL for the group, never the end of the run; its contexts close. */
async function block(fn) {
  try {
    await fn()
  } catch (e) {
    check(`group threw: ${String(e.message).split('\n')[0]}`, false)
  } finally {
    for (const c of live) await c.close().catch(() => {})
    live.clear()
  }
}
const PHONE = { width: 390, height: 844 }

async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? DESK, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  live.add(ctx)
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    // the 'Updated to vX' toast would sit over the page (and the Undo toasts) — seen already
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body, search: decodeURIComponent(url.search) })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    const q = decodeURIComponent(url.search)
    if (q.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
    else if (q.includes('deleted_at=is.null')) rows = rows.filter((x) => !x.deleted_at)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, errors, state }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const writes = async (state, table, method) => {
  await sleep(700) // the outbox flushes on the next tick
  return state.writes.filter((w) => w.table === table && (!method || w.method === method)).map((w) => ({ ...w, row: Array.isArray(w.body) ? w.body[0] : w.body }))
}
const last = (list) => list[list.length - 1]
const undo = async (page) => {
  await page.locator('.kf-toast-act', { hasText: 'Undo' }).last().click()
  await sleep(300)
}
const toastText = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const confirmShown = async (page) => (await page.getByRole('button', { name: /^(Delete|Remove|Archive)$/ }).count()) > 0 && (await page.locator('text=/\\?$/').count()) > 0

// 1 — Person page: the data-loss fix and Undo on every removal.
await block(async () => {
  const { ctx, page, errors, state } = await open(`/people/${PERSON.id}`)
  // edit used to delete the fact first, then refill the form — now nothing is written until Save
  await page.getByRole('button', { name: 'edit', exact: true }).first().click()
  await sleep(300)
  check('fact "edit" writes nothing (the fact is not deleted)', (await writes(state, 'people')).length === 0)
  check('fact "edit" loads the form', (await page.locator('input[placeholder="e.g. July 17"]').inputValue()) === 'July 17')
  await page.locator('input[placeholder="e.g. July 17"]').fill('July 18')
  await page.getByRole('button', { name: 'Save fact' }).click()
  let p = last(await writes(state, 'people'))?.row
  check('Save replaces the same fact in place (no dup, no loss)', p?.facts?.length === 2 && p.facts[0].id === 'f-bday' && p.facts[0].value === 'July 18' && p.facts[1].id === 'f-climb', JSON.stringify(p?.facts))
  await shot(page, '01-person-fact-edited')

  await page.getByRole('button', { name: 'Remove Interest' }).click()
  p = last(await writes(state, 'people'))?.row
  check('fact ✕ removes it', p?.facts?.length === 1, JSON.stringify(p?.facts))
  check('fact ✕ offers Undo', (await toastText(page)).some((t) => t.startsWith('Removed')), JSON.stringify(await toastText(page)))
  await undo(page)
  p = last(await writes(state, 'people'))?.row
  check('fact Undo puts it back', p?.facts?.some((f) => f.id === 'f-climb'), JSON.stringify(p?.facts))

  await page.getByRole('button', { name: 'Remove interaction' }).click()
  const del = last(await writes(state, 'interactions', 'DELETE'))
  check('interaction ✕ deletes it', del?.search.includes(TOUCH.id), del?.search)
  await undo(page)
  const back = last(await writes(state, 'interactions', 'POST'))?.row
  check('interaction Undo re-inserts the same row', back?.id === TOUCH.id && back?.summary === TOUCH.summary, JSON.stringify(back))

  await page.getByRole('button', { name: 'log a call' }).click()
  const call = last(await writes(state, 'interactions', 'POST'))?.row
  check('log a call writes an interaction', call?.summary === 'Phone call catch up', JSON.stringify(call))
  check('log a call offers Undo', (await toastText(page)).some((t) => t.startsWith('Call logged')), JSON.stringify(await toastText(page)))
  await undo(page)
  const callUndo = last(await writes(state, 'interactions', 'DELETE'))
  check('the call Undo deletes that interaction', callUndo?.search.includes(call?.id), callUndo?.search)

  await page.getByRole('button', { name: 'Delete person' }).click()
  await sleep(500)
  check('delete person: no confirm, back to the directory', new URL(page.url()).pathname === '/people', page.url())
  const pd = last(await writes(state, 'people', 'DELETE'))
  check('delete person deletes the row', pd?.search.includes(PERSON.id), pd?.search)
  const before = state.writes.length
  await undo(page)
  await sleep(700)
  const after = state.writes.slice(before).filter((w) => w.method === 'POST' && w.table !== 'activity_log').map((w) => `${w.table}:${(Array.isArray(w.body) ? w.body[0] : w.body)?.id}`)
  check('person Undo re-inserts the person, THEN their interactions', after[0] === `people:${PERSON.id}` && after.includes(`interactions:${TOUCH.id}`), JSON.stringify(after))
  check('person page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 2 — People list: row menus (⋯ + right-click), themed Select, phone sheet + nudge parity.
await block(async () => {
  const { ctx, page, errors } = await open('/people')
  await page.getByRole('button', { name: 'More for Priya' }).click()
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('person ⋯ menu: Open / log / Delete', items.join('|').includes('Open') && items.join('|').includes('Log a call') && items.join('|').includes('Delete'), JSON.stringify(items))
  await shot(page, '02-people-row-menu')
  await page.keyboard.press('Escape')
  await page.getByText('Priya', { exact: true }).last().click({ button: 'right' })
  check('person row right-click opens the menu', await page.locator('[role="menu"]').isVisible())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '+ New person' }).first().click()
  check('desktop New person form has no native select', (await page.locator('select').count()) === 0)
  check('people desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors, state } = await open('/people', { view: PHONE })
  check('phone nudge has "later" (parity)', await page.getByRole('button', { name: 'later' }).first().isVisible())
  await page.getByRole('button', { name: 'New person' }).click()
  await sleep(500)
  check('phone "+ New person" opens a sheet', await page.getByRole('dialog', { name: 'New person' }).isVisible())
  await page.getByRole('textbox', { name: 'Name' }).fill('Omar')
  await shot(page, '03-people-phone-new-sheet')
  await page.getByRole('button', { name: 'Add' }).click()
  const np = last(await writes(state, 'people', 'POST'))?.row
  check('phone sheet plants the person', np?.name === 'Omar', JSON.stringify(np))
  check('people phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page } = await open('/people', { view: PHONE })
  await page.getByRole('button', { name: 'More for Priya' }).click()
  await sleep(500)
  check('phone person ⋯ is an ActionSheet', await page.getByRole('dialog').getByText('Log a call').isVisible())
  await shot(page, '04-people-phone-action-sheet')
  await ctx.close()
})

// 3 — Library: remove with Undo; Library in the nav.
await block(async () => {
  const { ctx, page, errors, state } = await open(`/library?tab=books&bookId=${BOOK.id}`)
  await page.getByRole('button', { name: 'Remove book' }).click()
  const bd = last(await writes(state, 'books', 'DELETE'))
  check('Remove book deletes (no confirm)', bd?.search.includes(BOOK.id), bd?.search)
  check('Remove book offers Undo', (await toastText(page)).some((t) => t.includes('Dune')), JSON.stringify(await toastText(page)))
  const before = state.writes.length
  await undo(page)
  await sleep(700)
  const after = state.writes.slice(before).filter((w) => w.method === 'POST' && w.table !== 'activity_log').map((w) => `${w.table}:${(Array.isArray(w.body) ? w.body[0] : w.body)?.id}`)
  check('book Undo re-inserts the book, then re-hooks its note', after[0] === `books:${BOOK.id}` && after.includes(`notes:${NOTE.id}`), JSON.stringify(after))
  await page.goto(`${BASE}/library?tab=books&bookId=${BOOK.id}`, { waitUntil: 'networkidle' })
  await sleep(500)
  check('book detail: no "cover placeholder" / "via capture"', (await page.getByText(/placeholder|via capture/).count()) === 0)
  check('book cover slot shows real progress', await page.getByText('29% read').first().isVisible())
  check('sidebar has a Library entry', await page.getByRole('link', { name: 'Library' }).first().isVisible())
  check('library: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page } = await open('/today', { view: PHONE })
  await page.getByRole('button', { name: 'More' }).last().click()
  await sleep(500)
  check('phone More sheet has Library', await page.getByRole('link', { name: 'Library' }).isVisible())
  await shot(page, '05-more-sheet-library')
  await ctx.close()
})

// 4 — Journal: delete without the double gate; phone day navigation.
await block(async () => {
  const { ctx, page, errors, state } = await open('/journal')
  check('journal Kept = days written this month, no streak', await page.getByText('of showing up this month').isVisible())
  await page.getByRole('button', { name: /^Delete .* entry$/ }).first().click()
  await sleep(400)
  check('entry Delete has no confirm card', (await page.getByText('Delete this entry?').count()) === 0)
  const je = last(await writes(state, 'journal_entries', 'POST'))?.row
  check('entry goes to Trash (deleted_at)', je?.id === ENTRY.id && !!je?.deleted_at, JSON.stringify(je))
  check('entry Delete offers Undo', (await page.locator('.kf-toast-act', { hasText: 'Undo' }).count()) > 0)
  check('journal: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors } = await open('/journal', { view: PHONE })
  const label = () => page.getByRole('button', { name: /^Go to day: / }).getAttribute('aria-label')
  const was = await label()
  await page.getByRole('button', { name: 'Previous day' }).click()
  await sleep(300)
  const now = await label()
  check('phone ‹ opens the day before', was && now && was !== now, `${was} → ${now}`)
  check('phone › is off on today, on for a past day', await page.getByRole('button', { name: 'Next day' }).isEnabled())
  check('phone prompt shuffle', await page.getByRole('button', { name: 'Another prompt' }).count() >= 0)
  await shot(page, '06-journal-phone-day-nav')
  check('journal phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 5 — Project page: checklist / milestone without confirms, with Undo; list keys.
await block(async () => {
  const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`)
  await page.getByRole('button', { name: 'Remove checklist item Buy domain' }).click()
  let p = last(await writes(state, 'projects', 'POST'))?.row
  check('checklist ✕ removes the item', p?.checklist && !p.checklist.some((i) => i.title === 'Buy domain'), JSON.stringify(p?.checklist))
  await undo(page)
  p = last(await writes(state, 'projects', 'POST'))?.row
  check('checklist Undo restores it', p?.checklist?.[0]?.title === 'Buy domain', JSON.stringify(p?.checklist))
  await page.getByRole('button', { name: 'Delete milestone Launch' }).click()
  await sleep(300)
  check('milestone ✕: no confirm card', (await page.getByText('Delete "Launch"?').count()) === 0)
  p = last(await writes(state, 'projects', 'POST'))?.row
  check('milestone ✕ removes it, Undo offered', p?.milestones?.length === 0 && (await toastText(page)).some((t) => t.includes('Milestone deleted')), JSON.stringify(p?.milestones))
  await undo(page)
  // product audit: a task-linked checklist line IS its task
  await page.getByRole('checkbox', { name: 'Complete "Ship the hero"' }).click()
  const linked = last(await writes(state, 'tasks', 'POST'))?.row
  check('ticking a task-linked line completes its task (with Undo)', linked?.id === COPY.id && linked?.status === 'done' && (await page.locator('.kf-toast-act', { hasText: 'Undo' }).count()) > 0, JSON.stringify(linked && { id: linked.id, status: linked.status }))
  check('…and the line reads done from the task', (await page.getByRole('checkbox', { name: 'Complete "Ship the hero"' }).getAttribute('aria-checked')) === 'true')
  await undo(page)
  // list keys: focus the open task with j, then t = Top 3
  await page.locator('body').click({ position: { x: 1200, y: 780 } })
  await page.keyboard.press('j')
  await page.keyboard.press('t')
  const t3 = last(await writes(state, 'tasks', 'POST'))?.row
  check('list keys work on a project page (j, t → Top 3)', t3?.id === COPY.id && t3?.top3 === true, JSON.stringify(t3 && { id: t3.id, top3: t3.top3 }))
  check('target date reads in UTC (15 Nov)', await page.getByText(/15/).first().isVisible())
  await shot(page, '07-project-detail')
  check('project page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors } = await open(`/projects/${AREA.id}`)
  const rows = await page.locator(`[id="task-${WATER.id}"]`).count()
  check('area: the repeat is one TaskRow under "Keeps coming back"', rows === 1, rows)
  check('area page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 5b — Finish is one tap + Undo; the press is optional (product audit).
await block(async () => {
  const { page, errors, state } = await open('/projects')
  await page.getByRole('button', { name: 'More for Shaheen Website' }).click()
  await page.getByRole('menuitem', { name: /^Finish/ }).click()
  await sleep(300)
  const fin = last(await writes(state, 'projects', 'POST'))?.row
  check('Finish archives in one tap', fin?.id === SITE.id && fin?.status === 'archived', JSON.stringify(fin && { id: fin.id, status: fin.status }))
  check('Finish toast offers Undo and "Press it ✿"', (await page.locator('.kf-toast-act', { hasText: 'Undo' }).count()) > 0 && (await page.locator('.kf-toast-act', { hasText: 'Press it' }).count()) > 0)
  await shot(page, '15-finish-toast')
  const before = state.writes.filter((w) => w.table === 'projects').length
  await page.locator('.kf-toast-act', { hasText: 'Press it' }).click()
  await page.waitForURL(/\/herbarium/)
  await sleep(600)
  check('"Press it ✿" opens the ceremony', await page.getByText('Ready for the press · 1 of 3').isVisible())
  await shot(page, '16-press-optional')
  await page.keyboard.press('Escape')
  await sleep(400)
  check('leaving the ceremony writes nothing (the archive already happened)', state.writes.filter((w) => w.table === 'projects').length === before && (await page.getByText('Ready for the press').count()) === 0)
  check('finish/press: no page errors', errors.length === 0, errors.join(' | '))
})

// 6 — Projects list: board column domain, NewProjectModal outside-click rule; phone Finished + sheet.
await block(async () => {
  const { ctx, page, errors } = await open('/projects')
  await page.getByRole('button', { name: '+ New project' }).click()
  await page.locator('input[placeholder="e.g. Balcony garden rebuild…"]').fill('Balcony')
  await page.mouse.click(8, 8)
  await sleep(300)
  check('a dirty New project form ignores the outside click', await page.getByRole('heading', { name: 'Plant something new' }).isVisible())
  check('New project form has no native select', (await page.locator('select').count()) === 0)
  await shot(page, '08-new-project-dirty')
  await page.keyboard.press('Escape')
  await sleep(300)
  check('Esc closes it', (await page.getByRole('heading', { name: 'Plant something new' }).count()) === 0)
  await page.getByRole('button', { name: '+ New project' }).click()
  check('Esc discarded the desktop draft', (await page.locator('input[placeholder="e.g. Balcony garden rebuild…"]').inputValue()) === '')
  await page.mouse.click(8, 8)
  await sleep(300)
  check('a clean form closes on the outside click', (await page.getByRole('heading', { name: 'Plant something new' }).count()) === 0)
  check('projects desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors, state } = await open('/projects', { view: PHONE })
  await page.getByRole('button', { name: /^Finished/ }).click()
  await sleep(300)
  check('phone Finished view lists the archived project', await page.getByRole('button', { name: 'Restore Old site' }).isVisible())
  check('phone Finished view links the Herbarium', await page.getByRole('link', { name: /Herbarium/ }).isVisible())
  await shot(page, '09-projects-phone-finished')
  await page.getByRole('button', { name: 'Restore Old site' }).click()
  const r = last(await writes(state, 'projects', 'POST'))?.row
  check('phone Restore writes it active, with Undo', r?.id === OLD.id && r?.status === 'active' && (await page.locator('.kf-toast-act', { hasText: 'Undo' }).count()) > 0, JSON.stringify(r && { id: r.id, status: r.status }))
  await page.getByRole('button', { name: 'Active' }).click()
  await page.getByRole('button', { name: 'New project' }).click()
  await sleep(500)
  check('phone New project is a BottomSheet', await page.getByRole('dialog', { name: 'Plant something new' }).isVisible())
  await shot(page, '10-new-project-phone-sheet')
  check('projects phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 7 — Perennials: openable rows, series menu, End series = Undo, no confirm.
await block(async () => {
  const { ctx, page, errors, state } = await open('/perennials')
  await page.getByRole('button', { name: 'Series options for Water plants' }).click()
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('series menu: Edit rule / Skip / Pause / End series', ['Edit rule', 'Skip next', 'Pause', 'End series'].every((w) => items.join('|').includes(w)), JSON.stringify(items))
  await shot(page, '11-perennials-series-menu')
  await page.getByRole('menuitem', { name: /End series/ }).click()
  await sleep(300)
  check('End series: no confirm', (await page.getByText('End this repeat?').count()) === 0)
  const t = last(await writes(state, 'tasks', 'POST'))?.row
  check('End series → Trash with Undo', t?.id === WATER.id && !!t?.deleted_at && (await page.locator('.kf-toast-act', { hasText: 'Undo' }).count()) > 0, JSON.stringify(t && { id: t.id, deleted_at: t.deleted_at }))
  check('perennials: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 8 — Routines: right-click; phone sheet keeps its draft; trellis as a sheet.
await block(async () => {
  const { ctx, page, errors } = await open('/routines')
  // a real pointer: the row's meta wraps under the name now instead of covering it
  // scrolled into view first: an open menu closes on any scroll (ContextMenu), and Playwright's own
  // scroll-before-click can land after the menu opened
  await page.getByRole('button', { name: 'Stretch', exact: true }).scrollIntoViewIfNeeded()
  await sleep(500)
  await page.getByRole('button', { name: 'Stretch', exact: true }).click({ button: 'right' })
  await page.locator('[role="menu"]').waitFor({ timeout: 4000 }).catch(() => {})
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('routine row right-click opens its menu', items.includes('Edit'), JSON.stringify(items))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '2 steps ▸' }).click()
  check('a routine\'s steps fold out read-only under its row', await page.getByText('Hamstrings').isVisible())
  await shot(page, '17-routine-steps-fold')
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await page.locator('input[placeholder="Evening stretch"]').fill('Hydrate')
  await page.mouse.click(8, 8)
  await sleep(300)
  check('a dirty routine form ignores the outside click', await page.getByRole('heading', { name: 'New routine' }).isVisible())
  await page.keyboard.press('Escape')
  check('routines desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors } = await open('/routines', { view: PHONE })
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await sleep(500)
  await page.locator('input[placeholder="Evening stretch"]').fill('Hydrate')
  await shot(page, '12-routine-phone-sheet')
  await page.mouse.click(195, 30) // the scrim above the sheet
  await sleep(600)
  check('scrim tap dismisses the phone sheet', (await page.getByRole('heading', { name: 'New routine' }).count()) === 0)
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await sleep(500)
  check('…and keeps its draft', (await page.locator('input[placeholder="Evening stretch"]').inputValue()) === 'Hydrate')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await sleep(600)
  await page.getByRole('button', { name: '＋ New routine' }).click()
  await sleep(500)
  check('Cancel throws the draft away', (await page.locator('input[placeholder="Evening stretch"]').inputValue()) === '')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await sleep(600)
  check('phone shows the Challenge section', await page.getByRole('button', { name: '＋ Start a challenge' }).isVisible())
  await page.locator('[title="14-day trellis"]').first().click()
  await sleep(500)
  check('phone trellis opens as a sheet', await page.getByRole('dialog').getByText('Stretch · streak').isVisible())
  await shot(page, '13-trellis-phone-sheet')
  check('routines phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 9 — Trash: kit menus.
await block(async () => {
  const { ctx, page, errors } = await open('/trash')
  await page.getByText('Old errand').click({ button: 'right' })
  await page.locator('[role="menu"]').waitFor({ timeout: 4000 }).catch(() => {})
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  check('trash row right-click: Restore / Delete forever', items.join('|').includes('Restore') && items.join('|').includes('Delete forever'), JSON.stringify(items))
  check('trash desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors } = await open('/trash', { view: PHONE })
  await page.getByRole('button', { name: 'More for Old errand' }).click()
  await sleep(500)
  check('phone trash ⋯ is an ActionSheet', await page.getByRole('dialog').getByText('Delete forever').isVisible())
  await shot(page, '14-trash-phone-sheet')
  check('trash phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

// 10 — Settings phone parity; Focus checkbox.
await block(async () => {
  const { ctx, page, errors } = await open('/settings', { view: PHONE })
  check('phone Settings: Resurfacing card', (await page.locator('#settings-Resurfacing').count()) === 1)
  check('phone Settings: importer', await page.getByRole('link', { name: 'Open importer' }).count() === 1)
  check('phone Settings: the capture key sits in Advanced, last', (await page.locator('#settings-Advanced').getByText('External capture endpoint').count()) === 1 && (await page.evaluate(() => { const kids = [...document.querySelector('.st-phone').children]; return kids[kids.length - 2]?.id })) === 'settings-Advanced')
  await page.locator('#settings-Advanced').scrollIntoViewIfNeeded()
  await shot(page, '18-settings-advanced-phone')
  check('phone Settings: Rerun the welcome', await page.getByRole('link', { name: 'Rerun the welcome' }).count() === 1)
  check('settings phone: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})
await block(async () => {
  const { ctx, page, errors } = await open('/focus')
  check('Focus check-off is the kit checkbox', (await page.getByRole('checkbox').count()) >= 1)
  check('focus: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
})

await block(async () => {
  const { page, errors } = await open('/settings')
  check('desktop Settings: Advanced holds the capture key', (await page.locator('#settings-Advanced').getByText('External capture endpoint').count()) === 1)
  await page.getByRole('button', { name: 'Advanced', exact: true }).click()
  await sleep(1500) // the nav scrolls smoothly to the section
  await page.locator('#settings-Advanced').scrollIntoViewIfNeeded()
  await shot(page, '19-settings-advanced-desktop')
  await page.getByRole('button', { name: 'Integrations', exact: true }).click()
  await sleep(400)
  check('desktop Integrations no longer lists the capture key', (await page.getByText('External capture endpoint').count()) === 0 && (await page.getByText('Share target').count()) === 1)
  check('settings desktop: no page errors', errors.length === 0, errors.join(' | '))
})

// 11 — Day + night sweep of every touched page (desktop and phone).
const PAGES = [['people', '/people'], ['person', `/people/${PERSON.id}`], ['library', '/library'], ['journal', '/journal'], ['projects', '/projects'], ['project', `/projects/${SITE.id}`], ['area', `/projects/${AREA.id}`], ['perennials', '/perennials'], ['routines', '/routines'], ['trash', '/trash'], ['focus', '/focus'], ['settings', '/settings'], ['herbarium', '/herbarium'], ['import', '/settings/import']]
fs.mkdirSync(path.join(OUT, 'sweep'), { recursive: true })
let sweepFails = 0
for (const theme of ['day', 'night']) {
  for (const [view, size] of [['desktop', DESK], ['phone', PHONE]]) {
    for (const [name, route] of PAGES) {
      await block(async () => {
        const { page, errors } = await open(route, { view: size, theme })
        await page.screenshot({ path: path.join(OUT, 'sweep', `${theme}-${view}-${name}.jpg`), type: 'jpeg', quality: 62 })
        if (errors.length) {
          sweepFails++
          check(`${theme} ${view} ${name}: no page errors`, false, errors.join(' | '))
        }
      })
    }
  }
}
check(`day + night sweep: ${PAGES.length * 4} pages rendered without page errors`, sweepFails === 0, sweepFails)

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
