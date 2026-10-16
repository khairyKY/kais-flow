// Edit-after-create (Kai 2026-10-12: "you cannot edit a routine after it's created — a recurring
// pattern"). The REAL app, signed in against a MOCKED backend (the projects-fixes recipe): the dev
// server runs with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, and
// Playwright answers every REST call; writes are answered 201 and recorded, so each check asserts
// the row the outbox actually sent. Desktop 1280×720 + phone 390×844.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5271'
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
const id = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const WORK = { id: id('4', 1), user_id: UID, name: 'Work', color: 'var(--acc-terra)', sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const ROUTINE = { id: id('7', 1), user_id: UID, name: 'Stretch', time_of_day: 'evening', clock_time: '21:30', cadence: { weekdays: [1, 3, 5] }, challenge_start: null, challenge_end: null, active: true, steps: ['Neck rolls', 'Hamstrings'], domain_id: WORK.id, goal_days: null, created_at: T, updated_at: T }
const BOOK = { id: id('8', 1), user_id: UID, title: 'Dune', author: 'Frank Herbert', published_year: 1965, current_page: 120, total_pages: 412, status: 'reading', created_at: T, updated_at: T }
const NOTE = { id: id('8', 2), user_id: UID, title: 'On patience', body: 'Slow is smooth.', tags: ['pace'], domain_id: null, book_id: null, created_at: T, updated_at: T }
const QUOTE = { id: id('8', 3), user_id: UID, text: 'Fear is the mind-killer.', author: 'Herbert', source: 'Dune', tags: [], book_id: null, page: '8', created_at: T, updated_at: T }
const SITE = { id: id('2', 1), user_id: UID, domain_id: WORK.id, name: 'Shaheen Website', type: 'standard', status: 'active', color: null, target_date: null, engagement_model: 'Freelance', deleted_at: null, created_at: T, updated_at: T,
  milestones: [{ id: id('9', 1), title: 'Launch', weight: 2, completed: false }], checklist: [{ id: id('9', 2), title: 'Buy domain', type: 'one-shot', completed: false, task_id: null }] }
const AREA = { id: id('3', 1), user_id: UID, domain_id: WORK.id, name: 'Health', description: null, color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }
const WORKLOG = { id: id('6', 1), user_id: UID, project_id: SITE.id, task_id: null, note: 'Wireframes', duration_min: 90, started_at: '2026-10-04T10:00:00Z', ended_at: null, created_at: T, updated_at: T }
const PERSON = { id: id('5', 1), user_id: UID, name: 'Priya', facts: [], domain_id: null, created_at: T, updated_at: T }
const TOUCH = { id: id('5', 2), user_id: UID, person_id: PERSON.id, summary: 'Coffee catch up', occurred_at: '2026-10-05T10:00:00Z', created_at: T, updated_at: T }
const settings = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: T, updated_at: T }
const tables = () => ({
  tasks: [], projects: [SITE], areas: [AREA], domains: [WORK], app_settings: [settings], calendar_events: [], inbox_items: [], journal_entries: [],
  activity_log: [], time_entries: [WORKLOG], people: [PERSON], interactions: [TOUCH], routines: [ROUTINE], routine_completions: [],
  books: [BOOK], notes: [NOTE], quotes: [QUOTE], commentary: [],
})

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { width: 390, height: 844 }

async function open(route, o = {}) {
  const phone = o.view === PHONE
  const ctx = await browser.newContext({ viewport: o.view ?? { width: 1280, height: 720 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', hasTouch: phone, isMobile: phone })
  await ctx.addInitScript(([t, sess]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
  }, [o.theme ?? 'day', JSON.stringify(session)])
  const state = { rows: tables(), writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let rows = state.rows[table] ?? []
    if (url.search.includes('deleted_at=not.is.null')) rows = rows.filter((x) => x.deleted_at)
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
const sent = async (state, table) => {
  await sleep(700) // the outbox flushes on the next tick
  return state.writes.filter((w) => w.table === table && w.method === 'POST').map((w) => (Array.isArray(w.body) ? w.body[0] : w.body))
}
const last = (rows) => rows[rows.length - 1]
/** The app's date picker: tap day `dd` of the month it shows, then Done. */
async function pickDay(page, dd) {
  await sleep(300)
  await page.locator(`button.kf-pk-day:not(.is-out)[data-day$="-${dd}"]`).click()
  await page.getByRole('button', { name: 'Done' }).click()
}

// 1 — Routines, desktop: ⋯ → Edit opens the form prefilled; Save writes over the same row.
{
  const { ctx, page, errors, state } = await open('/routines')
  await page.getByRole('button', { name: 'More for Stretch' }).click()
  const items = await page.locator('[role="menu"] [role="menuitem"], [role="menu"] button').allInnerTexts().catch(() => [])
  check('routine ⋯ menu lists Edit first', /edit/i.test(items[0] ?? ''), JSON.stringify(items))
  await page.getByText('Edit', { exact: true }).first().click()
  await sleep(300)
  check('form is titled "Edit routine"', await page.getByRole('heading', { name: 'Edit routine' }).isVisible())
  check('name prefilled', (await page.locator('input[placeholder="Evening stretch"]').inputValue()) === 'Stretch')
  const steps = await page.locator('input[placeholder="Neck & shoulder rolls"]').evaluateAll((els) => els.map((e) => e.value))
  check('steps shown + prefilled', JSON.stringify(steps) === JSON.stringify(['Neck rolls', 'Hamstrings']), JSON.stringify(steps))
  await shot(page, '1-routine-edit-desktop')
  await page.locator('input[placeholder="Evening stretch"]').fill('Long stretch')
  await page.getByRole('button', { name: /Save routine/ }).click()
  const row = last(await sent(state, 'routines'))
  check('save upserts the same routine', row?.id === ROUTINE.id && row?.name === 'Long stretch' && row?.time_of_day === 'evening' && row?.clock_time === '21:30' && JSON.stringify(row?.cadence) === JSON.stringify({ weekdays: [1, 3, 5] }) && row?.steps?.length === 2 && row?.domain_id === WORK.id, JSON.stringify(row))
  check('routine page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 2 — Routines, phone: tapping the name opens the edit sheet.
{
  const { ctx, page, errors } = await open('/routines', { view: PHONE })
  await page.getByRole('button', { name: 'Stretch', exact: true }).click()
  await sleep(400)
  check('phone: name tap opens "Edit routine"', await page.getByRole('heading', { name: 'Edit routine' }).isVisible())
  await shot(page, '2-routine-edit-phone')
  check('phone routines: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 3 — Library: book, note, quote.
{
  const { ctx, page, errors, state } = await open(`/library?tab=books&bookId=${BOOK.id}`)
  await page.locator('.chip', { hasText: /^edit$/i }).first().click()
  await sleep(200)
  await shot(page, '3-book-edit')
  const pages = page.locator('label', { hasText: 'Total pages' }).locator('input')
  await pages.fill('300')
  await page.locator('label', { hasText: 'Year' }).locator('input').fill('1966')
  await page.getByRole('button', { name: 'Save' }).click()
  const book = last(await sent(state, 'books'))
  check('book edit saves pages + year, keeps progress', book?.id === BOOK.id && book?.total_pages === 300 && book?.published_year === 1966 && book?.current_page === 120 && book?.title === 'Dune', JSON.stringify(book))

  await page.goto(`${BASE}/library?tab=notes&noteId=${NOTE.id}`, { waitUntil: 'networkidle' })
  await sleep(500)
  await page.locator('.chip', { hasText: /^edit$/i }).first().click()
  await page.locator('label', { hasText: 'Note' }).locator('textarea').fill('Slow is smooth, smooth is fast.')
  await shot(page, '3-note-edit')
  await page.getByRole('button', { name: 'Save' }).click()
  const note = last(await sent(state, 'notes'))
  check('note edit saves the body (updateNote)', note?.id === NOTE.id && note?.body === 'Slow is smooth, smooth is fast.' && note?.title === 'On patience' && note?.tags?.[0] === 'pace', JSON.stringify(note))

  await page.goto(`${BASE}/library?tab=quotes&quoteId=${QUOTE.id}`, { waitUntil: 'networkidle' })
  await sleep(500)
  await page.locator('.chip', { hasText: /^edit$/i }).first().click()
  await page.locator('label', { hasText: 'Author' }).locator('input').fill('Frank Herbert')
  await page.getByRole('button', { name: 'Save' }).click()
  const quote = last(await sent(state, 'quotes'))
  check('quote edit saves the author (updateQuote)', quote?.id === QUOTE.id && quote?.author === 'Frank Herbert' && quote?.text === QUOTE.text, JSON.stringify(quote))
  check('library: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 4 — Project page: target date, weight, checklist rename, work duration + day, engagement.
{
  const { ctx, page, errors, state } = await open(`/projects/${SITE.id}`)
  await page.getByRole('button', { name: /^Target date: not set/ }).click()
  await pickDay(page, '15')
  let p = last(await sent(state, 'projects'))
  check('target date set through the date picker', /^\d{4}-\d{2}-15/.test(p?.target_date ?? ''), p?.target_date)

  await page.getByRole('button', { name: 'weight 2' }).click()
  await page.getByRole('button', { name: 'More Weight of Launch' }).click()
  p = last(await sent(state, 'projects'))
  check('milestone weight steps up and saves', p?.milestones?.[0]?.weight === 3, JSON.stringify(p?.milestones))
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Buy domain', exact: true }).click() // the ✕ is "Remove checklist item Buy domain" since the grammar pass
  await page.getByRole('textbox', { name: 'Checklist item', exact: true }).fill('Buy the .com domain')
  await page.keyboard.press('Enter')
  p = last(await sent(state, 'projects'))
  check('checklist item renamed', p?.checklist?.[0]?.title === 'Buy the .com domain', JSON.stringify(p?.checklist))

  await page.getByTitle('Change duration').click()
  await page.getByRole('textbox', { name: 'Duration' }).fill('2h')
  await page.keyboard.press('Enter')
  let te = last(await sent(state, 'time_entries'))
  check('work entry duration edited', te?.id === WORKLOG.id && te?.duration_min === 120 && te?.note === 'Wireframes', JSON.stringify(te))

  await page.getByRole('button', { name: /^Day of this work entry/ }).click()
  await pickDay(page, '01')
  te = last(await sent(state, 'time_entries'))
  check('work entry day edited, time of day kept', te?.started_at && new Date(te.started_at).getDate() === 1 && te.duration_min === 120, te?.started_at)

  await page.getByRole('button', { name: 'Freelance' }).click()
  await page.getByRole('textbox', { name: 'Engagement model or client' }).fill('Retainer client')
  await page.keyboard.press('Enter')
  p = last(await sent(state, 'projects'))
  check('engagement edited', p?.engagement_model === 'Retainer client', p?.engagement_model)
  await shot(page, '4-project-edits')
  check('project page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 5 — Area page: colour swatches.
{
  const { ctx, page, errors, state } = await open(`/projects/${AREA.id}`)
  const swatches = page.locator('.flabel', { hasText: 'Color' }).locator('xpath=following-sibling::div[1]/span')
  check('area page shows the colour swatches', (await swatches.count()) === 8, await swatches.count())
  await swatches.nth(1).click()
  const a = last(await sent(state, 'areas'))
  check('area recoloured', a?.id === AREA.id && a?.color === 'var(--acc-moss)', a?.color)
  await shot(page, '5-area-colour')
  check('area page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// 6 — Person page: interaction summary + day.
{
  const { ctx, page, errors, state } = await open(`/people/${PERSON.id}`)
  await page.getByRole('button', { name: 'Coffee catch up' }).click()
  await page.getByRole('textbox', { name: 'Edit interaction' }).fill('Coffee + the Q3 plan')
  await page.keyboard.press('Enter')
  let i = last(await sent(state, 'interactions'))
  check('interaction summary edited', i?.id === TOUCH.id && i?.summary === 'Coffee + the Q3 plan', JSON.stringify(i))
  await page.getByRole('button', { name: /^Date of this interaction/ }).click()
  await pickDay(page, '02')
  i = last(await sent(state, 'interactions'))
  check('interaction day edited', i?.occurred_at && new Date(i.occurred_at).getDate() === 2 && i.summary === 'Coffee + the Q3 plan', i?.occurred_at)
  await shot(page, '6-person-interaction')
  check('person page: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
