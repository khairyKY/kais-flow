// v165: the end-of-day question in Shut down — "What helped today, and what got in the way?" — on the REAL
// app, signed in against a MOCKED backend (the rituals harness's recipe: VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every REST call; the clock is Sun 27 Sep 2026
// 21:40 Cairo). Writes are kept in memory so a refetch sees them and the checks can read them.
//   node verify.mjs <outDir> [baseUrl=http://localhost:5265] [playwright-core index.mjs]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5265'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e5'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const cairo = (hhmm, day = 27) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const DAY0 = new Date(Date.UTC(2026, 8, 27 - 83, 6)).toISOString()
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const Q = 'What helped today, and what got in the way?'
const ANSWER = 'Coffee and a clear plan helped; email got in the way.'
const J_TODAY = 'j0000000-0000-4000-8000-0000000000aa'
const journal = (jid, date, body, at = '19:00') => ({ id: jid, user_id: UID, entry_date: date, body, mood: '🙂', transcript: null, media_paths: [], gratitude: ['tea'], deleted_at: null, created_at: `${date}T${at}:00Z`, updated_at: `${date}T${at}:00Z` })

function tables(s) {
  const tasks = [
    task(1, 'Call the tyre supplier', { duration_min: 30, due_at: iso('09:00', 28) }),
    ...[2, 3, 4].map((n) => task(n, `Done thing ${n}`, { status: 'done', completed_at: iso(`1${n}:00`) })),
  ]
  return {
    app_settings: [SETTINGS], projects: [], routines: [], routine_completions: [], time_entries: [], calendar_events: [], inbox_items: [], activity_log: [], tasks,
    journal_entries: [
      journal('j0000000-0000-4000-8000-000000000001', '2026-09-26', 'Slow start, good finish.'),
      ...(s.todayEntry ? [journal(J_TODAY, '2026-09-27', s.block ? `A walk before lunch.\n\nShut down\n${ANSWER}` : 'A walk before lunch.')] : []),
    ],
  }
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }

async function open(s, view = PHONE) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, uid]) => {
    localStorage.setItem('kf_theme', 'night'); localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [JSON.stringify(session), UID])
  const state = { rows: tables(s), writes: [] }
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try { body = JSON.parse(req.postData() ?? '[]') } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        const full = { created_at: new Date(cairo('21:40').getTime() + ++seq * 1000).toISOString(), ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('21:40') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(700)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function press(page, cdp, loc) {
  await loc.scrollIntoViewIfNeeded()
  if (!cdp) { await loc.click(); await sleep(350); return }
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(350)
}
const text = (loc) => loc.innerText().catch(() => '')
const sheet = (page) => page.locator('body') // the ritual is the only dialog open; its text is the page's here
async function openShut(page, cdp) {
  const b = page.locator('section[aria-label="Rituals"] [data-ritual="evening"]')
  await b.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  for (let i = 0; i < 50 && (await page.getByRole('button', { name: 'Undo' }).count()) > 0; i++) await sleep(150)
  await press(page, cdp, b)
  await sleep(600)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const jw = (state) => state.writes.filter((w) => w.table === 'journal_entries')
const dayRows = (state) => state.rows.journal_entries.filter((e) => e.entry_date === '2026-09-27')
async function fit(page, name, errors, width) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll`, wide <= width, wide)
  const small = await page.evaluate(() => [...document.querySelectorAll('.rt .rt-line button, .rt .rt-line input')].filter((b) => b.getClientRects().length).map((b) => [b.textContent.trim() || b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)]).filter(([, h]) => h < 40))
  check(`${name} the question's controls are ≥ 40 tall`, small.length === 0, JSON.stringify(small))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}
const input = (page) => page.getByRole('textbox', { name: Q })

for (const [label, view] of [['phone', PHONE], ['desktop', DESKTOP]]) {
  // A — an entry exists today: the answer is appended under "Shut down"; the Journal shows it.
  {
    const { ctx, page, cdp, errors, state } = await open({ todayEntry: true }, view)
    await openShut(page, cdp)
    await sleep(400)
    const t0 = await text(sheet(page))
    check(`A-${label} the question shows, optional, with Skip and Save`, t0.toLowerCase().includes(Q.toLowerCase()) && /Optional/.test(t0) && (await page.getByRole('button', { name: 'Skip' }).count()) === 1 && (await page.getByRole('button', { name: 'Save' }).count()) === 1, `${t0.length} ${await page.getByRole('button', { name: 'Skip' }).count()} ${await page.getByRole('button', { name: 'Save' }).count()}`)
    check(`A-${label} nothing is written before you answer`, jw(state).length === 0)
    await input(page).fill(ANSWER)
    await shot(page, `A-${label}-typed`)
    await press(page, cdp, page.getByRole('button', { name: 'Save' }))
    await sleep(1500)
    await shot(page, `A-${label}-saved`)
    check(`A-${label} appended to today's entry under "Shut down" (same id, mood and gratitude kept)`, jw(state).length === 1 && jw(state)[0].row.id === J_TODAY && jw(state)[0].row.body === `A walk before lunch.\n\nShut down\n${ANSWER}` && jw(state)[0].row.mood === '🙂' && jw(state)[0].row.gratitude[0] === 'tea', JSON.stringify(jw(state).map((w) => w.row.body)))
    check(`A-${label} still one entry for the day`, dayRows(state).length === 1)
    check(`A-${label} shows "Saved to journal ✓" + Edit`, /SAVED TO JOURNAL ✓/i.test(await text(sheet(page))) && (await page.getByRole('button', { name: 'Edit' }).count()) === 1, `${(await text(sheet(page))).slice(0, 300)} | edit=${await page.getByRole('button', { name: 'Edit' }).count()}`)
    await fit(page, `A-${label}`, errors, view.viewport.width)
    await page.goto(`${BASE}/journal`, { waitUntil: 'networkidle' })
    await sleep(900)
    const shown = await page.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('textarea,input')].map((e) => e.value).join('\n'))
    await shot(page, `A-${label}-journal`)
    check(`A-${label} the Journal shows the answer and the heading`, shown.includes(ANSWER) && shown.includes('Shut down'))
    await ctx.close()
  }
}

// B — no entry today: one is created with the block.
{
  const { ctx, page, cdp, state } = await open({})
  await openShut(page, cdp)
  await input(page).fill(ANSWER)
  await page.keyboard.press('Enter') // Enter saves, like Save
  await sleep(1500)
  check('B no entry yet: one is created with "Shut down" + the answer, dated today', jw(state).length === 1 && jw(state)[0].row.body === `Shut down\n${ANSWER}` && jw(state)[0].row.entry_date === '2026-09-27', JSON.stringify(jw(state).map((w) => w.row.body)))
  await ctx.close()
}

// C — Skip: nothing is written, Close the day still works, and the question can come back.
{
  const { ctx, page, cdp, errors, state } = await open({ todayEntry: true })
  await openShut(page, cdp)
  await press(page, cdp, page.getByRole('button', { name: 'Skip' }))
  await shot(page, 'C-skipped')
  check('C Skip folds the question away (Write one to bring it back)', /Skipped/.test(await text(sheet(page))) && (await input(page).count()) === 0 && (await page.getByRole('button', { name: 'Write one' }).count()) === 1)
  await press(page, cdp, page.getByRole('button', { name: 'Close the day' }))
  await sleep(1500)
  check("C Close the day works without an answer (the garden's closed)", (await text(sheet(page))).includes("The garden's closed."))
  check('C nothing was written to the journal', jw(state).length === 0 && dayRows(state)[0].body === 'A walk before lunch.')
  const steps = state.writes.find((w) => w.row.event_type === 'ritual.finished' && w.row.payload?.ritual === 'evening')?.row.payload.steps
  check('C the "line" step is not logged as done', Array.isArray(steps) && !steps.includes('line'), JSON.stringify(steps))
  check('C no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  const again = await open({ todayEntry: true })
  await openShut(again.page, again.cdp)
  await press(again.page, again.cdp, again.page.getByRole('button', { name: 'Skip' }))
  await press(again.page, again.cdp, again.page.getByRole('button', { name: 'Write one' }))
  check('C Write one brings the field back', (await input(again.page).count()) === 1)
  await again.ctx.close()
}

// D — re-open the same day: it is edited, never duplicated.
{
  const { ctx, page, cdp, errors, state } = await open({ todayEntry: true })
  await openShut(page, cdp)
  await input(page).fill(ANSWER)
  await press(page, cdp, page.getByRole('button', { name: 'Save' }))
  await sleep(1500)
  await page.keyboard.press('Escape')
  await sleep(700)
  check('D the sheet closed', (await page.locator('.rt').count()) === 0)
  await openShut(page, cdp)
  const t = await text(sheet(page))
  await shot(page, 'D-reopened')
  check('D re-opened: the answer is shown with Edit, not an empty field', t.includes(ANSWER) && (await page.getByRole('button', { name: 'Edit' }).count()) === 1 && (await input(page).count()) === 0)
  const before = jw(state).length
  await press(page, cdp, page.getByRole('button', { name: 'Edit' }))
  check('D Edit opens the saved text in the field', (await input(page).inputValue()) === ANSWER)
  await press(page, cdp, page.getByRole('button', { name: 'Save' }))
  await sleep(1200)
  check('D saving the same text again writes nothing new', jw(state).length === before, `${before} → ${jw(state).length}`)
  await press(page, cdp, page.getByRole('button', { name: 'Edit' }))
  await input(page).fill('Walking helped.')
  await press(page, cdp, page.getByRole('button', { name: 'Save' }))
  await sleep(1500)
  const body = dayRows(state)[0].body
  check('D editing replaces the block: one entry, one "Shut down", the new text, the old gone', dayRows(state).length === 1 && body === 'A walk before lunch.\n\nShut down\nWalking helped.' && (body.match(/Shut down/g) ?? []).length === 1, JSON.stringify(body))
  await press(page, cdp, page.getByRole('button', { name: 'Close the day' }))
  await sleep(1200)
  check('D Close the day after saving: the entry is still the same one', dayRows(state).length === 1 && dayRows(state)[0].body === body)
  check('D no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// E — a fresh load of the same day (draft gone from this tab's memory, journal has the block): edit, not duplicate.
{
  const s = await open({ todayEntry: true, block: true })
  await openShut(s.page, s.cdp)
  check('E a day that already holds the block opens on it (Edit)', (await text(sheet(s.page))).includes(ANSWER) && (await s.page.getByRole('button', { name: 'Edit' }).count()) === 1)
  await press(s.page, s.cdp, s.page.getByRole('button', { name: 'Edit' }))
  await s.page.getByRole('textbox', { name: Q }).fill('Quiet helped.')
  await press(s.page, s.cdp, s.page.getByRole('button', { name: 'Save' }))
  await sleep(1500)
  check('E the edit lands in the same entry', dayRows(s.state).length === 1 && dayRows(s.state)[0].body === 'A walk before lunch.\n\nShut down\nQuiet helped.', JSON.stringify(dayRows(s.state).map((e) => e.body)))
  await s.ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
