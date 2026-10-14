// Inbox t3 (Inbox.dc.html 3a/3b, the reviewed pass) + the verified Inbox findings, on the REAL app
// against a MOCKED backend (the cal-rail-drop recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9,
// a made-up session in localStorage, Playwright answers every REST call). Writes are recorded AND
// applied to the mock rows, so a refetch can't hide a bug behind the optimistic cache.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=d1,p1 runs a subset)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5250'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const DESIGN = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../../../design-export/Inbox.dc.html')).href
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

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const iid = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P1 = 'b0000000-0000-4000-8000-000000000001'
const D1 = 'd0000000-0000-4000-8000-000000000001'
const A1 = 'c0000000-0000-4000-8000-000000000001'
const SALMA_ID = 'e1000000-0000-4000-8000-000000000001'
const ib = (n, over) => ({
  id: iid(n), user_id: UID, kind: 'text', raw_text: '', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null,
  payload: null, snoozed_until: null, external_ref: null, deleted_at: null, created_at: CREATED, updated_at: CREATED, ...over,
})
// 3a's cards, on this app's data: a confident voice note, an unsure typed one, a plain email, two GitHub issues.
const OMAR = 1, SALMA = 2, HOSTING = 3, GH482 = 4, GH479 = 5
const PENDING = [
  ib(OMAR, { kind: 'voice', raw_text: 'Call Omar re: pricing Saturday 3pm', confidence: 0.87, created_at: iso('21:14', 8),
    ai_parse: { kind: 'task', title: 'Call Omar about pricing', cleaned_text: 'Call Omar about pricing Saturday 3pm', confidence: 0.87, project_id: P1, domain_id: D1, due_at: iso('15:00', 17), has_time: true } }),
  ib(SALMA, { raw_text: 'that thing salma said about the balcony plants', confidence: 0.44, created_at: iso('19:00', 11),
    ai_parse: { kind: 'note', title: 'Balcony plants from Salma', cleaned_text: 'That thing Salma said about the balcony plants', confidence: 0.44 } }),
  ib(HOSTING, { kind: 'email', raw_text: 'renew hosting before the 15th', confidence: 0.9, created_at: iso('08:30', 7),
    ai_parse: { kind: 'task', title: 'renew hosting before the 15th', cleaned_text: 'renew hosting before the 15th', confidence: 0.9, due_at: iso('09:00', 14), has_time: false } }),
  ib(GH482, { kind: 'github_issue', raw_text: 'Checkout drops the coupon field on mobile Safari', created_at: iso('09:00', 9),
    payload: { repo: 'Shaheen/website', number: 482, url: 'https://github.com/Shaheen/website/issues/482', node_id: 'I_482', created_at: iso('09:00', 9), updated_at: iso('09:00', 12) } }),
  ib(GH479, { kind: 'github_issue', raw_text: 'Add alt text to the gallery grid', created_at: iso('09:00', 6),
    payload: { repo: 'Shaheen/website', number: 479, url: 'https://github.com/Shaheen/website/issues/479', node_id: 'I_479', created_at: iso('09:00', 6), updated_at: iso('09:00', 11) } }),
]
const DISMISSED = [
  ib(11, { raw_text: 'maybe a second monitor', status: 'dismissed', updated_at: iso('08:00') }),
  ib(12, { kind: 'github_issue', raw_text: '[BUG] Footer overlaps on iPad landscape', status: 'dismissed', updated_at: iso('05:00'), payload: { repo: 'Shaheen/website', number: 471 } }),
  ib(13, { kind: 'voice', raw_text: 'maybe try oat milk in the cortado', status: 'dismissed', updated_at: iso('10:00', 6) }),
  ib(14, { kind: 'email', raw_text: 'spam — "your package is waiting"', status: 'dismissed', updated_at: iso('10:00', 5) }),
  ib(15, { raw_text: 'look into a standing desk mat', status: 'dismissed', updated_at: iso('10:00', 4) }),
  ib(16, { raw_text: 'old idea about a podcast', status: 'dismissed', updated_at: iso('10:00', 2) }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting App', domain_id: D1, type: 'standard', status: 'active', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const DOMAINS = [{ id: D1, user_id: UID, name: 'Freelance', color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const AREAS = [{ id: A1, user_id: UID, name: 'Health', domain_id: null, description: null, color: null, sort_order: 0, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const PEOPLE = [{ id: SALMA_ID, user_id: UID, name: 'Salma Hassan', facts: [], domain_id: null, created_at: CREATED, updated_at: CREATED }]
const tables = () => structuredClone({ tasks: [], calendar_events: [], inbox_items: [...PENDING, ...DISMISSED], projects: PROJECTS, domains: DOMAINS, areas: AREAS, people: PEOPLE, app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/inbox', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    // The one-time hints have been seen (tour/help.ts) — they'd sit over the cards in the shots.
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v99.0.0' })) // no "Updated to" toast over the shots
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = { rows: tables(), writes: [], failInbox: !!o.failInbox }
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
    if (table === 'inbox_items' && state.failInbox) return r.fulfill({ status: 500, json: { message: 'boom' } })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
/** The rest of the list (the app scrolls its own content column, so a full-page shot is the viewport). */
async function shotLower(page, name) {
  await page.locator('.ib-gh-sec').evaluate((e) => e.scrollIntoView({ block: 'end' })).catch(() => {})
  await sleep(400)
  await shot(page, name)
  await page.locator('.ib-h1').evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {})
  await sleep(200)
}
const text = (loc) => loc.first().innerText().catch(() => '')
const card = (page, n) => page.locator(`[id="inbox-${iid(n)}"]`)
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const undo = (page, msg) => page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }).click()
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const deletes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE')
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
async function toastsGone(page) {
  for (let i = 0; i < 40 && (await page.locator('.kf-toast').count()) > 0; i++) await sleep(250)
}
const touch = (cdp) => (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  const b = await loc.boundingBox()
  const t = touch(cdp)
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await t('touchEnd', [])
  await sleep(450)
}
async function hold(cdp, loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(200)
  const b = await loc.boundingBox()
  const t = touch(cdp)
  await t('touchStart', [{ x: b.x + b.width / 2, y: b.y + 12 }])
  await sleep(520)
  await t('touchEnd', [])
  await sleep(300)
}
async function swipe(cdp, loc, dx) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(200)
  const b = await loc.boundingBox()
  const x0 = dx < 0 ? b.x + b.width - 30 : b.x + 30
  const y0 = b.y + Math.min(b.height / 2, 24)
  const t = touch(cdp)
  await t('touchStart', [{ x: x0, y: y0 }])
  for (let i = 1; i <= 16; i++) {
    await t('touchMove', [{ x: x0 + (dx * i) / 16, y: y0 }])
    await sleep(16)
  }
  await sleep(150)
  await t('touchEnd', [])
  await sleep(900)
}

// ── D1: the desktop reads as 3a — honest header, toggle, words not %, fields not a sentence, no keys footer ──
if (want('d1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/inbox', { theme })
    if (theme === 'day') {
      check('d1 H1 is "Inbox" (not "N waiting")', (await text(page.locator('.ib-h1'))) === 'Inbox')
      check('d1 summary "3 to sort · 2 from GitHub · oldest is 5 days old"', (await text(page.locator('.ib-sum'))) === '3 to sort · 2 from GitHub · oldest is 5 days old', await text(page.locator('.ib-sum')))
      const seg = await page.locator('.ib-toggle .kf-seg-btn').allInnerTexts()
      check('d1 Waiting | Dismissed is a toggle in the header, counts = the sidebar badge and the dismissed list', JSON.stringify(seg) === '["Waiting 5","Dismissed 6"]' && (await page.locator('.ib-head .ib-toggle').count()) === 1, JSON.stringify(seg))
      const body = await page.locator('.ib-page').innerText()
      check('d1 no percentages, no "AI unsure", no "✎ edit parse"', !/\d%|AI unsure|edit parse/i.test(body))
      check('d1 no keyboard footer, no handwritten header line', !/one keystroke|hydrangea calms/i.test(body))
      const f1 = await card(page, OMAR).locator('.ib-fields').innerText()
      check('d1 card 1: one "Suggested" row — Task · "title" · Sat 17 Oct · 15:00 · Forecasting App · high confidence', /Suggested/.test(f1) && /Task/.test(f1) && /“Call Omar about pricing”/.test(f1) && /Sat 17 Oct · 15:00/.test(f1) && /Forecasting App/.test(f1) && /high confidence/.test(f1), f1.replace(/\n/g, ' | '))
      check('d1 card 1 meta "Voice · Thu 21:14"', /Voice · Thu 21:14/.test(await text(card(page, OMAR).locator('.ib-meta--top'))))
      const keys = await card(page, OMAR).locator('.ib-actions').innerText()
      check('d1 keys on the buttons: File as task E · Snooze S · Dismiss D', /File as task\s*E/.test(keys) && /Snooze\s*S/.test(keys) && /Dismiss\s*D/.test(keys), keys.replace(/\n/g, ' '))
      const c2 = await card(page, SALMA).innerText()
      check('d1 card 2 asks "Where does this go?" — Task · Journal note · Salma Hassan (People), no dropdowns', /Where does this go\?/.test(c2) && (await card(page, SALMA).locator('.ib-choice').allInnerTexts()).join('|') === 'Task|Journal note|Salma Hassan (People)' && (await card(page, SALMA).locator('.ib-field').count()) === 0)
      check('d1 card 3 is the compact row: "Email · Wed" · "Task · due Wed 14" · File', (await card(page, HOSTING).getAttribute('class')).includes('ib-row') && /Email · Wed/.test(await card(page, HOSTING).innerText()) && (await text(card(page, HOSTING).locator('.ib-suggest'))) === 'Task · due Wed 14')
      const tilt = await page.locator('.ib-card, .ib-row').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform).filter((t) => t !== 'none'))
      check('d1 cards sit flat (no rotation)', tilt.length === 0, JSON.stringify(tilt))
      check('d1 GitHub: "From GitHub · Shaheen/website", #482 · 3 days, File + Dismiss', (await page.locator('.ib-gh-label').textContent()) === 'From GitHub · Shaheen/website' && /#482[\s\S]*3 days/.test(await card(page, GH482).innerText()) && (await card(page, GH482).getByRole('button', { name: 'Dismiss' }).count()) === 1)
    }
    await shot(page, `d1-desktop-${theme}`)
    await shotLower(page, `d1-desktop-${theme}-lower`)
    check(`d1 no page errors (${theme})`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── D2: keys act on a mouse selection — click two cards, D → one toast, one Undo ──
if (want('d2')) {
  const { ctx, page, errors, state } = await open()
  await card(page, OMAR).locator('.ib-card-text').click()
  await card(page, HOSTING).locator('.ib-meta').click()
  check('d2 two cards selected by mouse; the bar says 2', /2 selected/i.test(await text(page.locator('.kf-bulkbar'))))
  const w0 = state.writes.length
  await page.keyboard.press('d')
  await settle(state)
  const rows = posts(state, 'inbox_items', w0)
  check('d2 D dismissed both selected (not the focused row, not nothing)', rows.length === 2 && rows.every((r) => r.status === 'dismissed') && rows.map((r) => r.id).sort().join() === [iid(OMAR), iid(HOSTING)].sort().join())
  check('d2 one toast: "2 captures dismissed"', (await toastSoon(page, '2 captures dismissed')) && (await page.locator('.kf-toast').count()) === 1)
  const w1 = state.writes.length
  await undo(page, '2 captures dismissed')
  await settle(state)
  check('d2 Undo puts both back', posts(state, 'inbox_items', w1).filter((r) => r.status === 'pending').length === 2)
  check('d2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D3: bulk File to… an AREA, one Undo (filing undoes through unfile: tasks deleted, captures back) ──
if (want('d3')) {
  const { ctx, page, errors, state } = await open()
  await page.keyboard.press('Control+a')
  await sleep(300)
  check('d3 Ctrl+A selects the waiting list (5)', /5 selected/i.test(await text(page.locator('.kf-bulkbar'))))
  await card(page, GH482).locator('.ib-gh-title').click()
  await card(page, GH479).locator('.ib-gh-title').click()
  await card(page, SALMA).locator('.ib-card-text').click()
  check('d3 …then 2 left', /2 selected/i.test(await text(page.locator('.kf-bulkbar'))))
  await page.locator('.kf-bulkbar').getByRole('button', { name: /File to/ }).click()
  await sleep(300)
  const menu = page.locator('[role="menu"][aria-label="Move to"]')
  check('d3 File to… lists areas (Health) beside projects and domains', (await menu.getByRole('menuitem', { name: /Health/ }).count()) === 1 && (await menu.getByRole('menuitem', { name: /Forecasting App/ }).count()) === 1)
  const w0 = state.writes.length
  await menu.getByRole('menuitem', { name: /Health/ }).click()
  await settle(state)
  const tasks = posts(state, 'tasks', w0)
  check('d3 two tasks in the Health AREA (no project)', tasks.length === 2 && tasks.every((t) => t.area_id === A1 && t.project_id === null), JSON.stringify(tasks.map((t) => [t.title, t.area_id])))
  check('d3 card 1 files under the AI\'s short title and its date', tasks.some((t) => t.title === 'Call Omar about pricing' && t.due_at === iso('15:00', 17)))
  check('d3 one toast "2 captures filed"', await toastSoon(page, '2 captures filed'))
  const w1 = state.writes.length
  await undo(page, '2 captures filed')
  await settle(state)
  check('d3 Undo deletes both tasks and the captures wait again', deletes(state, 'tasks', w1).length === 2 && posts(state, 'inbox_items', w1).filter((r) => r.status === 'pending').length === 2)
  check('d3 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D4: the fields are the edit — place → an area, title edited, Esc reverts, E files it ──
if (want('d4')) {
  const { ctx, page, errors, state } = await open()
  const c = card(page, OMAR)
  await c.getByRole('button', { name: 'Title to file' }).click()
  await page.keyboard.type(' XYZ')
  await page.keyboard.press('Escape')
  await sleep(200)
  check('d4 Esc on the title edit throws the typing away (RenameField)', /“Call Omar about pricing”/.test(await text(c.getByRole('button', { name: 'Title to file' }))), await text(c.getByRole('button', { name: 'Title to file' })))
  await c.getByRole('button', { name: 'Title to file' }).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Call Omar about Q4 pricing')
  await page.keyboard.press('Enter')
  await sleep(200)
  await c.getByRole('button', { name: 'Project or area' }).click()
  await sleep(300)
  await page.locator('[role="menu"][aria-label="Move to"]').getByRole('menuitem', { name: /Health/ }).click()
  await sleep(200)
  check('d4 the place field now reads Health', /Health/.test(await text(c.getByRole('button', { name: 'Project or area' }))))
  await shot(page, 'd4-fields-edited')
  const w0 = state.writes.length
  await c.getByRole('button', { name: /File as task/ }).click()
  // The florets drift (Motion 1c) and the card breathes out (3e) before the write — wait for the toast.
  check('d4 toast: Filed "…" as a task · Health · Sat', await toastSoon(page, 'Filed "Call Omar about Q4 pricing" as a task · Health'))
  await settle(state)
  const t = posts(state, 'tasks', w0)[0]
  check('d4 File as task: the edited title, in the Health area, due Sat 15:00', t?.title === 'Call Omar about Q4 pricing' && t?.area_id === A1 && t?.project_id === null && t?.due_at === iso('15:00', 17), JSON.stringify(t && [t.title, t.area_id, t.due_at]))
  await shot(page, 'd4-filed-toast')
  check('d4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D5: the unsure card's choices file where they say (journal, a person), each with Undo ──
if (want('d5')) {
  const { ctx, page, errors, state } = await open()
  const w0 = state.writes.length
  await card(page, SALMA).getByRole('button', { name: 'Journal note' }).click()
  check("d5 toast \"Added to today's journal\"", await toastSoon(page, "Added to today's journal"))
  await settle(state)
  const entry = posts(state, 'journal_entries', w0)[0]
  check("d5 Journal note → today's journal entry with the capture's words", entry?.body === 'that thing salma said about the balcony plants' && entry?.entry_date === '2026-10-12', JSON.stringify(entry))
  check('d5 the capture is filed (filed_to journal)', posts(state, 'inbox_items', w0).some((r) => r.id === iid(SALMA) && r.status === 'filed' && r.payload?.filed_to === 'journal'))
  const w1 = state.writes.length
  await undo(page, "Added to today's journal")
  await settle(state)
  check('d5 Undo deletes the entry and the capture waits again', !!entry && deletes(state, 'journal_entries', w1).some((d) => d.query.includes(entry.id)) && posts(state, 'inbox_items', w1).some((r) => r.id === iid(SALMA) && r.status === 'pending'))
  await toastsGone(page)
  await sleep(500)
  const w2 = state.writes.length
  await card(page, SALMA).getByRole('button', { name: 'Salma Hassan (People)' }).click()
  check('d5 toast "Added to Salma Hassan"', await toastSoon(page, 'Added to Salma Hassan'))
  await settle(state)
  const note = posts(state, 'interactions', w2)[0]
  check("d5 Salma (People) → a note on Salma's page", note?.person_id === SALMA_ID && note?.summary === 'that thing salma said about the balcony plants', JSON.stringify(note))
  check('d5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D6: Dismissed — keys work there (j, r), Restore all / Clear now are one Undo, no "can't be undone" ──
if (want('d6')) {
  const { ctx, page, errors, state } = await open()
  await page.locator('.ib-toggle').getByRole('button', { name: /Dismissed/ }).click()
  await sleep(400)
  check('d6 the toggle switches without moving the header', (await text(page.locator('.ib-h1'))) === 'Inbox' && (await page.locator('.ib-drow').count()) === 6)
  await shot(page, 'd6-dismissed-desktop')
  await page.keyboard.press('j')
  await sleep(200)
  const ringed = await page.locator('.ib-drow.is-ringed').count()
  const w0 = state.writes.length
  await page.keyboard.press('r')
  await settle(state)
  check('d6 j moves focus on the Dismissed tab, r restores the focused row', ringed === 1 && posts(state, 'inbox_items', w0).some((r) => r.id === iid(11) && r.status === 'pending'))
  check('d6 toast "Restored to Inbox"', await toastSoon(page, 'Restored to Inbox'))
  await toastsGone(page)
  const w1 = state.writes.length
  let dialog = false
  page.on('dialog', () => { dialog = true })
  await page.getByRole('button', { name: 'Clear now' }).click()
  await sleep(300)
  check('d6 Clear now: no confirm card, no "can\'t be undone"', !dialog && (await page.getByText("can't be undone").count()) === 0)
  await settle(state)
  const trashed = posts(state, 'inbox_items', w1)
  check('d6 Clear now moves every dismissed capture to Trash (deleted_at set), one toast', trashed.length === 5 && trashed.every((r) => typeof r.deleted_at === 'string') && (await toastSoon(page, 'Moved 5 captures to Trash')))
  const w2 = state.writes.length
  await undo(page, 'Moved 5 captures to Trash')
  await settle(state)
  check('d6 Undo takes them back out of Trash', posts(state, 'inbox_items', w2).filter((r) => r.deleted_at === null).length === 5)
  check('d6 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── D7: search deep link banner (3a copy) + designed error and offline states ──
if (want('d7')) {
  const { ctx, page, errors } = await open(`/inbox?focus=${iid(SALMA)}`)
  check('d7 banner: "From Search: your match is highlighted below." with a close', /From Search: your match is highlighted below\./.test(await text(page.locator('.ib-banner'))) && (await page.locator('.ib-banner-x').count()) === 1)
  check('d7 the match is ringed', (await card(page, SALMA).getAttribute('class')).includes('is-ringed'))
  await shot(page, 'd7-search-banner')
  await ctx.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await sleep(500)
  check('d7 offline: the header says so (OfflineChip) and the cached list stays', /Offline/.test(await text(page.locator('.ib-sum'))) && (await card(page, OMAR).count()) === 1)
  await shot(page, 'd7-offline')
  await ctx.setOffline(false)
  check('d7 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  const bad = await open('/inbox', { failInbox: true })
  await sleep(4000)
  check('d8 a failed load shows the error card with Retry (not an endless skeleton)', /Your Inbox didn't load\./.test(await text(bad.page.locator('[role="alert"]'))) && (await bad.page.getByRole('button', { name: 'Retry' }).count()) === 1, await text(bad.page.locator('.ib-page')))
  await shot(bad.page, 'd8-error')
  await bad.ctx.close()
}

// ── P1: the phone reads as 3b; tap opens, hold selects, swipe left dismisses, pickers on the phone ──
if (want('p1')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, cdp, errors, state } = await open('/inbox', { view: phone, theme })
    if (theme === 'day') {
      check('p1 header: "Inbox" · "3 to sort · 2 from GitHub" · "Dismissed 6"', (await text(page.locator('.ib-h1'))) === 'Inbox' && (await text(page.locator('.ib-sum'))) === '3 to sort · 2 from GitHub' && (await text(page.locator('.ib-head-link'))) === 'Dismissed 6')
      const cols = await card(page, OMAR).locator('.ib-actions--grid').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').map(parseFloat))
      check('p1 File as task / Snooze / Dismiss at 2 : 1 : 1', cols.length === 3 && Math.abs(cols[0] / cols[1] - 2) < 0.1 && Math.abs(cols[1] - cols[2]) < 1, JSON.stringify(cols))
      const chips = await card(page, OMAR).locator('.ib-field').allInnerTexts()
      check('p1 three field chips: Task · Sat 15:00 · Forecasting App', chips.length === 3 && /Task/.test(chips[0]) && /Sat 15:00/.test(chips[1]) && /Forecasting App/.test(chips[2]), JSON.stringify(chips))
      const choices = await card(page, SALMA).locator('.ib-choice').evaluateAll((els) => els.map((e) => [e.innerText, getComputedStyle(e).borderStyle, e.getBoundingClientRect().height]))
      check('p1 unsure card: dashed Task / Journal / Salma, ≥44px', choices.map((c) => c[0]).join('|') === 'Task|Journal|Salma' && choices.every((c) => c[1] === 'dashed' && c[2] >= 44), JSON.stringify(choices))
      await shot(page, 'p1-phone-day')
      // tap ≠ select
      await tap(cdp, card(page, OMAR).locator('.ib-meta').first())
      check('p1 a tap on a card does not select it', (await page.locator('.kf-bulkbar').count()) === 0)
      // tap the compact row → it opens into the full card
      await tap(cdp, card(page, HOSTING).locator('.ib-row-main'))
      check('p1 a tap opens the compact row into the full card (fields + File as task)', (await card(page, HOSTING).locator('.ib-field').count()) === 3 && (await card(page, HOSTING).getByRole('button', { name: 'File as task' }).count()) === 1)
      // the place picker is on the phone, as a sheet, and lists areas
      await tap(cdp, card(page, OMAR).getByRole('button', { name: 'Project or area' }))
      await sleep(500)
      const sheet = page.locator('[role="dialog"]', { hasText: 'Move to' })
      check('p1 the place chip opens the Move to sheet on the phone, areas included', (await sheet.count()) === 1 && (await sheet.getByRole('button', { name: /Health/ }).count()) === 1)
      await shot(page, 'p1-phone-place-sheet')
      await tap(cdp, sheet.getByRole('button', { name: /Health/ }))
      await sleep(600)
      check('p1 …and the pick lands on the card', /Health/.test(await text(card(page, OMAR).getByRole('button', { name: 'Project or area' }))))
      // hold selects
      await hold(cdp, card(page, SALMA))
      check('p1 hold selects (bulk bar "1 selected")', /1 selected/i.test(await text(page.locator('.kf-bulkbar'))))
      await page.locator('.kf-bulkbar').getByRole('button', { name: /Clear selection|✕/ }).click().catch(() => {})
      await page.keyboard.press('Escape')
      await sleep(400)
      // GitHub: tap opens its actions; swipe left dismisses
      await tap(cdp, card(page, GH482).locator('.ib-gh-main'))
      check('p1 a GitHub row taps open to File / Dismiss on the phone', (await page.locator('.ib-gh-more').getByRole('button', { name: 'Dismiss' }).count()) === 1)
      const w0 = state.writes.length
      await swipe(cdp, card(page, GH479), -300)
      await settle(state)
      check('p1 swipe left dismisses a GitHub row', posts(state, 'inbox_items', w0).some((r) => r.id === iid(GH479) && r.status === 'dismissed'))
      await toastsGone(page)
      const w1 = state.writes.length
      await swipe(cdp, card(page, SALMA), -300)
      await settle(state)
      check('p1 swipe left dismisses a waiting card', posts(state, 'inbox_items', w1).some((r) => r.id === iid(SALMA) && r.status === 'dismissed'))
    } else {
      await shot(page, 'p1-phone-night')
    }
    check(`p1 no page errors (${theme})`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P2: phone Dismissed — the toggle link, swipe right restores (SwipeRow), hold selects ──
if (want('p2')) {
  const { ctx, page, cdp, errors, state } = await open('/inbox', { view: phone })
  await tap(cdp, page.locator('.ib-head-link'))
  await sleep(400)
  check('p2 "Dismissed 6" opens the Dismissed list; the link now reads "Waiting 5"', (await page.locator('.ib-drow').count()) === 6 && (await text(page.locator('.ib-head-link'))) === 'Waiting 5')
  await shot(page, 'p2-phone-dismissed')
  const w0 = state.writes.length
  await swipe(cdp, card(page, 11), 320)
  await settle(state)
  check('p2 swipe right restores', posts(state, 'inbox_items', w0).some((r) => r.id === iid(11) && r.status === 'pending'))
  check('p2 …with an Undo toast', await toastSoon(page, 'Restored to Inbox'))
  check('p2 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── Design side by side: Inbox.dc.html 3a / 3b next to the app at 1280×800 / 390×844, day + night ──
if (want('side')) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(DESIGN, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(1500)
  await page.locator('[id="3a"] .dv-card').screenshot({ path: path.join(OUT, 'design-3a.png') })
  await page.locator('[id="3b"] .phone').screenshot({ path: path.join(OUT, 'design-3b.png') })
  const pair = async (design, app, name, h) => {
    const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}`
    await page.setContent(`<body style="margin:0;background:#ddd;display:flex;gap:16px;padding:16px;align-items:flex-start;font:12px sans-serif">
      <figure style="margin:0"><figcaption>design ${design.replace('.png', '')}</figcaption><img src="${img(design)}" style="height:${h}px"></figure>
      <figure style="margin:0"><figcaption>app ${app.replace('.png', '')}</figcaption><img src="${img(app)}" style="height:${h}px"></figure></body>`)
    await sleep(300)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  }
  for (const t of ['day', 'night']) {
    if (fs.existsSync(path.join(OUT, `d1-desktop-${t}.png`))) await pair('design-3a.png', `d1-desktop-${t}.png`, `side-3a-desktop-${t}`, 760)
    if (fs.existsSync(path.join(OUT, `p1-phone-${t}.png`))) await pair('design-3b.png', `p1-phone-${t}.png`, `side-3b-phone-${t}`, 844)
  }
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
