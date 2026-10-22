// Paper capture review (Kai 2026-10-22: "missing a lot of things like dismiss or delete") on the REAL app
// against a MOCKED backend: line level (add one now, dismiss with Undo, Bring back, edit text / type,
// select / select all / none → Add), page level (Keep for later, Dismiss page, Delete page and photo, all
// with Undo), the Inbox's ready row (⋯ / right-click: Try again, See the photo, Dismiss, Delete), the
// desktop keys (⏎ ⌫ T A Esc). The mock + page drawing is paper-gaps/verify.mjs's; `captures` is stateful
// here (writes land in the rows the next read returns), and three captures are seeded: one read, one that
// failed, one waiting for tomorrow.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5296'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const TMP = path.join(OUT, '.pages')
fs.mkdirSync(TMP, { recursive: true })
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

// Sunday 4 Oct 2026, 09:52 in Cairo (UTC+3).
const NOW = new Date('2026-10-04T06:52:00Z')
const CREATED = '2026-09-21T06:00:00Z'
const PROJECTS = [
  { id: 'p0000000-0000-4000-8000-000000000001', user_id: UID, domain_id: null, name: 'OS', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
  { id: 'p0000000-0000-4000-8000-000000000002', user_id: UID, domain_id: null, name: "Kai's Flow", type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
  { id: 'p0000000-0000-4000-8000-000000000003', user_id: UID, domain_id: null, name: 'Study', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: CREATED, updated_at: CREATED },
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', capture_keep_photos: true, created_at: CREATED, updated_at: CREATED }
const OLD_INBOX = [
  { id: 'i0000000-0000-4000-8000-000000000001', user_id: UID, kind: 'text', raw_text: 'Renew the library card', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, created_at: '2026-10-02T08:00:00Z', updated_at: '2026-10-02T08:00:00Z' },
]

// ── the page: lined paper, one line per 80px row; a line's box is where its row is drawn ──
const W = 900, H = 1200, TOP = 110, ROW = 80
const box = (i, w = 0.82) => [Number((80 / W).toFixed(4)), Number(((TOP + i * ROW) / H).toFixed(4)), w, Number((62 / H).toFixed(4))]
const LECTURE = {
  rows: ['OS lecture 3 — 4 Oct', '• Assignment 2 due Thu 11:59pm', '• Read ch. 4 scheduling', '• ask Dr. Hany re: lab groups', '• Quiz next Sun !', '   CPU → ready → run', '   idea: kai’s flow paper mode', '• buy blue pens'],
  lines: [
    { text: 'OS lecture 3 — 4 Oct', type: 'note', when: null, project: 'OS', confidence: 0.95, row: 0 },
    { text: 'Assignment 2', type: 'task', when: 'Thu 11:59pm', project: 'OS', confidence: 0.93, row: 1, priority: 1 },
    { text: 'Read ch. 4 — scheduling', type: 'task', when: null, project: 'OS', confidence: 0.9, row: 2 },
    { text: 'Ask Dr. Hany about lab groups', type: 'task', when: null, project: 'OS', confidence: 0.58, row: 3 },
    { text: 'Quiz', type: 'task', when: 'next Sunday', project: 'OS', confidence: 0.88, row: 4 },
    { text: 'Idea: Kai’s Flow paper mode', type: 'note', when: null, project: "Kai's Flow", confidence: 0.62, row: 6 },
    { text: 'Buy blue pens', type: 'task', when: null, project: null, confidence: 0.91, row: 7 },
  ],
}
const ITEMS = LECTURE.lines.map((l) => ({ text: l.text, type: l.type, when: l.when, project: l.project, confidence: l.confidence, priority: l.priority ?? null, box: box(l.row, l.row === 0 ? 0.55 : 0.82), page: 0 }))

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

async function drawPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const rows = LECTURE.rows.map((t, i) => `<div style="position:absolute;left:80px;right:80px;top:${TOP + i * ROW}px;height:62px;line-height:62px;${i === 0 ? 'text-decoration:underline;' : ''}">${t}</div>`).join('')
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" rel="stylesheet"></head>
    <body style="margin:0;width:${W}px;height:${H}px;background-color:#f4f0e6;background-image:linear-gradient(90deg,transparent 60px,rgba(205,120,120,.45) 60px,rgba(205,120,120,.45) 62px,transparent 62px),repeating-linear-gradient(180deg,transparent 0 ${ROW - 2}px,rgba(120,150,175,.32) ${ROW - 2}px ${ROW}px);background-position:0 ${TOP + 62 - ROW}px;font-family:Caveat,cursive;font-size:46px;color:#2d3b5a;position:relative;overflow:hidden">${rows}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await sleep(300)
  const file = path.join(TMP, 'lecture.jpg')
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 })
  await page.close()
  return file
}
const PHOTO = fs.readFileSync(await drawPage())

// ── the seeded captures ──
const cid = (n) => `c0000000-0000-4000-8000-00000000000${n}`
const capture = (n, over) => ({
  id: cid(n), user_id: UID, storage_paths: [`${UID}/${cid(n)}/0.jpg`], pages: 1, pages_read: 1, status: 'done', error: null, title: 'Monday notes', items: ITEMS, drawings: [],
  reviewed_at: null, expires_at: '2026-10-11T06:40:00Z', photos_deleted_at: null, created_at: '2026-10-04T06:40:00Z', updated_at: '2026-10-04T06:45:00Z', ...over,
})
const READY = () => capture(1, {})
const FAILED = () => capture(2, { status: 'failed', error: 'upstream', pages_read: 0, items: [], title: null, created_at: '2026-10-04T06:30:00Z' })
const WAITING = () => capture(3, { status: 'queued', error: 'daily_limit', pages_read: 0, items: [], title: null, created_at: '2026-10-04T06:20:00Z', updated_at: '2026-10-04T06:21:00Z' })

/** What capture-image answers for page `n` (a retried read): the lecture's lines. */
const answerFor = (body) => ({ status: 'done', pages_read: body.page + 1, title: 'OS lecture 3', items: ITEMS, drawings: [] })

/** Opens `route` signed in, the backend mocked. */
async function open(route, o = {}) {
  const view = o.view ?? phone
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID])
  const state = {
    rows: { tasks: [], projects: PROJECTS, domains: [], app_settings: [SETTINGS], inbox_items: [...OLD_INBOX], captures: o.captures ?? [], calendar_events: [] },
    writes: [], reads: [],
  }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const p = url.pathname
    if (p.startsWith('/functions/v1/capture-image')) {
      const body = req.postDataJSON()
      state.reads.push(body)
      return r.fulfill({ json: answerFor(body) })
    }
    if (p.startsWith('/storage/v1/object/sign/captures') && req.method() === 'POST') {
      const body = req.postDataJSON()
      const paths = body.paths ?? [p.replace('/storage/v1/object/sign/captures/', '')]
      const signed = paths.map((x) => ({ path: x, error: null, signedURL: `/object/sign/captures/${x}?token=t` }))
      return r.fulfill({ json: body.paths ? signed : { signedURL: signed[0].signedURL } })
    }
    if (p.startsWith('/storage/v1/object/sign/captures/')) return r.fulfill({ status: 200, contentType: 'image/jpeg', body: PHOTO })
    if (p.startsWith('/storage/v1/')) {
      state.writes.push({ method: req.method(), table: 'storage', query: p, body: null })
      return r.fulfill({ json: {} })
    }
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = p.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      // captures is stateful: an upsert lands in the rows the next read returns.
      if (table === 'captures' && req.method() === 'POST') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const at = state.rows.captures.findIndex((c) => c.id === row.id)
          if (at === -1) state.rows.captures.push(row)
          else state.rows.captures[at] = { ...state.rows.captures[at], ...row }
        }
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (table === 'ai_usage') return one ? r.fulfill({ json: { count: 4 } }) : r.fulfill({ json: [{ count: 4 }] })
    let rows = state.rows[table] ?? []
    if (table === 'captures') {
      const q = url.searchParams
      if (q.get('reviewed_at') === 'is.null') rows = rows.filter((c) => !c.reviewed_at)
      if (q.get('id')?.startsWith('eq.')) rows = rows.filter((c) => c.id === q.get('id').slice(3))
    }
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(env, loc) {
  if (!env.cdp) {
    await loc.click()
    await sleep(350)
    return
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(450)
}
async function swipeLeft(env, loc) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const y = b.y + 24
  await touch(env.cdp, 'touchStart', [{ x: b.x + b.width - 30, y }])
  for (let i = 1; i <= 10; i++) {
    await touch(env.cdp, 'touchMove', [{ x: b.x + b.width - 30 - i * 30, y }])
    await sleep(16)
  }
  await sleep(150)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(600)
}
async function hold(env, loc) {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const b = await loc.boundingBox()
  const p = { x: b.x + Math.min(120, b.width / 2), y: b.y + 22 }
  await touch(env.cdp, 'touchStart', [p])
  await sleep(650)
  await touch(env.cdp, 'touchEnd', [])
  await sleep(450)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const text = (loc) => loc.first().innerText().catch(() => '')
const flat = (s) => s.replace(/\s+/g, ' ').trim()
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
/** A toast may wait its turn (two on screen at most): wait for it. */
const toastSeen = (page, msg, ms = 9000) => waitFor(async () => (await toasts(page)).some((x) => x.startsWith(msg)), ms)
async function undoToast(env, msg) {
  await toastSeen(env.page, msg)
  await tap(env, env.page.locator('.kf-toast', { hasText: msg }).getByRole('button', { name: 'Undo' }))
}
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const deletes = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'DELETE')
const lastCapture = (state, id, from = 0) => posts(state, 'captures', from).filter((c) => c.id === id).at(-1)
const dialog = (page, label) => page.locator(`[role="dialog"][aria-label="${label}"]`)
const sheet = (page) => page.locator('.pp-sheet-body')
const ready = (page, title) => page.locator('.pp-ready', { hasText: title })
const asRow = (page, label) => page.locator('.kf-as-row', { hasText: label })
const sheetRows = async (page) => (await page.locator('.kf-as-row').allInnerTexts()).map(flat)
const menuRows = async (page) => (await page.getByRole('menuitem').allInnerTexts()).map(flat)
async function waitFor(fn, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(150)
  }
  return false
}
async function basics(env, name) {
  const { page, errors } = env
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  const vw = page.viewportSize().width
  check(`${name} no horizontal scroll`, wide <= vw, `${wide}/${vw}`)
  const small = await page.evaluate(() => {
    const out = []
    for (const root of document.querySelectorAll('.pp-frame, .pp-sheet-body, [data-sheet-footer], .pp-ready, .kf-as-row')) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || !el.getClientRects().length) continue
        if (parseFloat(cs.fontSize) < 12) out.push(`${n.textContent.trim().slice(0, 24)} ${cs.fontSize}`)
      }
    }
    return out
  })
  check(`${name} no text under 12px`, small.length === 0, small.slice(0, 4).join(' | '))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
}
const things = async (page) => /From your page · (\d+)/.exec(await text(page.locator('.pp-rtitle')))?.[1]

// ═════ Phone ═════
for (const theme of ['day', 'night']) {
  const night = theme === 'night'
  const env = await open('/inbox', { theme, captures: [READY(), FAILED(), WAITING()] })
  const { page, state } = env
  const t = (s) => `phone-${theme} ${s}`

  // The Inbox's rows: one read, one that failed, one waiting for tomorrow — each with a ⋯.
  const rowsText = flat(await text(page.locator('.pp-ready').first().locator('xpath=..')))
  check(t('Inbox: the three page rows, each with ⋯'), (await page.locator('.pp-ready').count()) === 3 && (await page.locator('.pp-ready').getByRole('button', { name: /^More for/ }).count()) === 3, rowsText)
  await tap(env, page.locator('.pp-ready').nth(2).getByRole('button', { name: /^More for/ }))
  const waitingMenu = await sheetRows(page)
  check(t('waiting row ⋯ → the action sheet: See the photo · Dismiss page · Delete page and photo (no Try again: it’s the daily limit)'), waitingMenu.length === 3 && waitingMenu[0] === 'See the photo' && waitingMenu[1].startsWith('Dismiss page') && waitingMenu[2] === 'Delete page and photo', JSON.stringify(waitingMenu))
  await shot(page, `inbox-menu-${theme}`)
  await basics(env, t('inbox menu'))

  if (!night) {
    // Delete the waiting page: off the Inbox, its read wiped, the photo due within the hour; Undo puts it back.
    let w0 = state.writes.length
    await tap(env, asRow(page, 'Delete page and photo'))
    await sleep(700)
    let c = lastCapture(state, cid(3), w0)
    const due = c ? Date.parse(c.expires_at) - Date.parse(c.reviewed_at) : NaN
    check(t('Delete page and photo → toast "Page deleted · the photo goes within the hour", the row leaves'), (await toastSeen(page, 'Page deleted · the photo goes within the hour')) && (await page.locator('.pp-ready').count()) === 2, JSON.stringify(await toasts(page)))
    check(t('…the row written reviewed, read wiped (items [], title null), photo due ≤ 10 minutes on (the hourly sweep takes it)'), c && c.reviewed_at && c.items.length === 0 && c.title === null && due > 0 && due <= 10 * 60_000 + 1000, JSON.stringify(c && { reviewed_at: c.reviewed_at, expires_at: c.expires_at, items: c.items.length }))
    w0 = state.writes.length
    await undoToast(env, 'Page deleted')
    await sleep(700)
    c = lastCapture(state, cid(3), w0)
    check(t('…Undo writes it back as it was (unreviewed, its expiry back to 7 days) and the row returns'), c && c.reviewed_at === null && c.expires_at === '2026-10-11T06:40:00Z' && (await page.locator('.pp-ready').count()) === 3, JSON.stringify(c && { reviewed_at: c.reviewed_at, expires_at: c.expires_at }))

    // The failed read: ⋯ → Try again → read → the results. Then the page's own ⋯ → Dismiss page (+ Undo).
    await tap(env, page.locator('.pp-ready').nth(1).getByRole('button', { name: /^More for/ }))
    const failedMenu = await sheetRows(page)
    check(t('failed row ⋯ starts with "Try again · read it now"'), failedMenu[0] === 'Try again read it now', JSON.stringify(failedMenu))
    await tap(env, asRow(page, 'Try again'))
    await waitFor(async () => (await sheet(page).count()) === 1, 8000)
    check(t('…Try again reads it (one capture-image call) and opens the results: 7 things'), state.reads.length === 1 && state.reads[0].capture_id === cid(2) && (await things(page)) === '7', `${state.reads.length} / ${await things(page)}`)
    await tap(env, sheet(page).getByRole('button', { name: 'More for this page' }))
    const pageMenu = await sheetRows(page)
    check(t('the page’s ⋯: See the photo · Scan another page · Keep for later · Dismiss page · Delete page and photo'), flat(pageMenu.join(' | ')) === 'See the photo | Scan another page | Keep for later stays in the Inbox | Dismiss page adds nothing more | Delete page and photo', JSON.stringify(pageMenu))
    await shot(page, 'page-menu-day')
    w0 = state.writes.length
    await tap(env, asRow(page, 'Dismiss page'))
    await sleep(700)
    c = lastCapture(state, cid(2), w0)
    check(t('Dismiss page → the review closes, "Page dismissed", the row leaves; written reviewed, nothing added'), (await sheet(page).count()) === 0 && (await toastSeen(page, 'Page dismissed')) && c?.reviewed_at && posts(state, 'tasks', w0).length === 0 && (await page.locator('.pp-ready').count()) === 2, JSON.stringify(await toasts(page)))
    await undoToast(env, 'Page dismissed')
    await sleep(700)
    check(t('…Undo → back in the Inbox, ready to review'), (await page.locator('.pp-ready').count()) === 3 && /ready to review/i.test(await text(ready(page, 'OS lecture 3'))), flat(await text(ready(page, 'OS lecture 3'))))
  } else {
    await page.keyboard.press('Escape') // the waiting row's sheet
    await sleep(500)
  }

  // Review "Monday notes": the line's ⋯ (an action sheet on the phone).
  await tap(env, ready(page, 'Monday notes').getByRole('button', { name: 'Review' }))
  await waitFor(async () => (await sheet(page).count()) === 1)
  const row = (s) => sheet(page).locator('.pp-row', { hasText: s })
  check(t('the banner says how: "Swipe a line left to dismiss it, or tap its ⊞ for more."'), (await text(page.locator('.pp-banner'))).includes('Swipe a line left to dismiss it, or tap its ⊞ for more.'), await text(page.locator('.pp-banner')))
  await tap(env, row('Assignment 2').getByRole('button', { name: /^More for/ }))
  const lineMenu = await sheetRows(page)
  check(t('a line’s ⋯: Add this line (to do) · Edit the text · Change the type… · … · Select · Dismiss this line'), lineMenu[0] === 'Add this line to do' && lineMenu[1] === 'Edit the text' && lineMenu[2] === 'Change the type…' && lineMenu.at(-2) === 'Select' && lineMenu.at(-1) === 'Dismiss this line not wanted', JSON.stringify(lineMenu))
  await shot(page, `line-menu-${theme}`)
  await basics(env, t('line menu'))

  // Add one line now: a task, marked on the capture; the rest wait. Undo takes the task back.
  let w0 = state.writes.length
  await tap(env, asRow(page, 'Add this line'))
  await sleep(800)
  const task = posts(state, 'tasks', w0)
  let c = lastCapture(state, cid(1), w0)
  check(t('Add this line → "Added 1 task", the task written with its photo link, 6 things left'), (await toastSeen(page, 'Added 1 task')) && task.length === 1 && task[0].title === 'Assignment 2' && task[0].external_ref?.id === `${cid(1)}:0:1` && (await things(page)) === '6', JSON.stringify(await toasts(page)))
  check(t('…the capture remembers where it went (items[1].done = task + its id), still in review'), c?.items[1]?.done?.to === 'task' && c.items[1].done.id === task[0]?.id && c.reviewed_at === null, JSON.stringify(c?.items[1]?.done))
  check(t('…"Added already · Assignment 2 · in Tasks" under the lines'), flat(await text(sheet(page).locator('.pp-done'))) === 'Added already Assignment 2 in Tasks', flat(await text(sheet(page).locator('.pp-done'))))
  await sheet(page).locator('.pp-done').scrollIntoViewIfNeeded()
  await shot(page, `added-${theme}`)
  await basics(env, t('added'))
  w0 = state.writes.length
  await undoToast(env, 'Added 1 task')
  await sleep(800)
  c = lastCapture(state, cid(1), w0)
  check(t('…Undo deletes the task and puts the line back (7 things, no "Added")'), deletes(state, 'tasks', w0).length === 1 && (await things(page)) === '7' && (await sheet(page).locator('.pp-done').count()) === 0 && !c?.items[1]?.done, `${deletes(state, 'tasks', w0).length} / ${await things(page)}`)

  if (!night) {
    // Dismiss one line (swipe left), Undo; again, then Bring back.
    w0 = state.writes.length
    await swipeLeft(env, row('Buy blue pens'))
    await sleep(400)
    c = lastCapture(state, cid(1), w0)
    check(t('swipe left → "Line dismissed", 6 things, the capture marks it skipped'), (await toastSeen(page, 'Line dismissed')) && (await things(page)) === '6' && c?.items[6]?.done === 'skipped', JSON.stringify(await toasts(page)))
    await undoToast(env, 'Line dismissed')
    await sleep(500)
    check(t('…Undo → back (7 things)'), (await things(page)) === '7' && (await row('Buy blue pens').count()) === 1)
    await swipeLeft(env, row('Buy blue pens'))
    check(t('dismissed again → "1 line dismissed · Bring back" under the lines'), flat(await text(sheet(page).locator('.pp-done'))) === '1 line dismissed Bring back', flat(await text(sheet(page).locator('.pp-done'))))
    await tap(env, sheet(page).getByRole('button', { name: 'Bring back' }))
    await sleep(500)
    check(t('Bring back → the line returns'), (await row('Buy blue pens').count()) === 1 && (await things(page)) === '7')
    await swipeLeft(env, row('Buy blue pens'))

    // Edit the text; change a type from the ⋯; then Keep for later — the edits and the dismissal stay.
    await tap(env, row('Read ch. 4').locator('.pp-row-text'))
    await sheet(page).locator('.pp-row-input').fill('Read chapter 4')
    await sheet(page).locator('.pp-row-input').press('Enter')
    await sleep(300)
    await tap(env, row('Quiz').getByRole('button', { name: /^More for/ }))
    await tap(env, asRow(page, 'Change the type…'))
    await sleep(500)
    await tap(env, page.getByRole('menuitem', { name: /^Event/ }))
    check(t('edit the text → "Read chapter 4"; ⋯ → Change the type… → Event'), (await row('Read chapter 4').count()) === 1 && (await text(row('Quiz').locator('.pp-type'))).startsWith('Event'))
    await tap(env, sheet(page).getByRole('button', { name: 'More for this page' }))
    await tap(env, asRow(page, 'Keep for later'))
    await sleep(500)
    check(t('Keep for later → the review closes, the Inbox row still "Ready to review", 6 things'), (await sheet(page).count()) === 0 && /Monday notes · 6 things/.test(flat(await text(ready(page, 'Monday notes')))) && /ready to review/i.test(await text(ready(page, 'Monday notes'))), flat(await text(ready(page, 'Monday notes'))))
    await tap(env, ready(page, 'Monday notes').getByRole('button', { name: 'Review' }))
    await waitFor(async () => (await sheet(page).count()) === 1)
    check(t('…reopened: the edits kept (Read chapter 4, Quiz an Event), the dismissed line still off'), (await row('Read chapter 4').count()) === 1 && (await text(row('Quiz').locator('.pp-type'))).startsWith('Event') && (await row('Buy blue pens').count()) === 0 && (await things(page)) === '6')
  }

  // Select: hold → Add · Type · Date · Project · Dismiss; Select all; a tap takes one out; ✕ = none.
  await hold(env, row('Ask Dr. Hany'))
  const foot = flat(await text(page.locator('.pp-selfoot')))
  check(t('hold a line → "1 selected", footer Add · Type · Date · Project · Dismiss'), (await text(page.locator('.pp-banner'))).includes('1 selected') && foot === 'Add Type Date Project Dismiss', `${await text(page.locator('.pp-banner'))} / ${foot}`)
  await tap(env, page.getByRole('button', { name: 'Select all' }))
  const all = night ? 7 : 6
  check(t(`Select all → "${all} selected"`), (await text(page.locator('.pp-banner'))).includes(`${all} selected`), await text(page.locator('.pp-banner')))
  await shot(page, `select-${theme}`)
  await basics(env, t('selection'))
  await tap(env, page.getByRole('button', { name: 'Clear selection' }))
  check(t('✕ → none selected, the usual footer back'), !(await text(page.locator('.pp-banner'))).includes('selected') && (await page.getByRole('button', { name: /^Add all/ }).count()) === 1)

  if (!night) {
    await hold(env, row('OS lecture 3'))
    await tap(env, row('Read chapter 4'))
    w0 = state.writes.length
    await tap(env, page.locator('.pp-selfoot').getByRole('button', { name: 'Add' }))
    await sleep(800)
    const tasks = posts(state, 'tasks', w0)
    const notes = posts(state, 'inbox_items', w0)
    check(t('select two → Add: "Added 1 task · 1 note" (the edited text written), 4 things left'), (await toastSeen(page, 'Added 1 task · 1 note')) && tasks[0]?.title === 'Read chapter 4' && notes.length === 1 && (await things(page)) === '4', JSON.stringify(await toasts(page)))
    check(t('…"Added already" lists both, and where they went'), /Added already .*OS lecture 3 — 4 Oct in the Inbox.*Read chapter 4 in Tasks/.test(flat(await text(sheet(page).locator('.pp-done')))), flat(await text(sheet(page).locator('.pp-done'))))
    // Everything else, one at a time: the last one leaves review.
    await hold(env, row('Ask Dr. Hany'))
    await tap(env, row('Quiz'))
    await tap(env, row('Idea'))
    await tap(env, page.locator('.pp-selfoot').getByRole('button', { name: 'Dismiss' }))
    check(t('select three → Dismiss: "3 lines dismissed", 1 thing left'), (await toastSeen(page, '3 lines dismissed')) && (await things(page)) === '1', JSON.stringify(await toasts(page)))
    w0 = state.writes.length
    await tap(env, row('Assignment 2').getByRole('button', { name: /^More for/ }))
    await tap(env, asRow(page, 'Add this line'))
    await sleep(800)
    c = lastCapture(state, cid(1), w0)
    check(t('the last line added → the review closes and the page leaves the Inbox (reviewed)'), (await sheet(page).count()) === 0 && c?.reviewed_at && (await ready(page, 'Monday notes').count()) === 0, JSON.stringify(c && { reviewed_at: c.reviewed_at }))
    await undoToast(env, 'Added 1 task')
    await sleep(800)
    check(t('…Undo → back in the Inbox with 1 thing, 2 added'), /Monday notes · 1 thing/.test(flat(await text(ready(page, 'Monday notes')))) && (await text(ready(page, 'Monday notes'))).includes('2 added'), flat(await text(ready(page, 'Monday notes'))))
    await shot(page, 'inbox-after-day')
  }
  await env.ctx.close()
}

// ═════ Desktop ═════
for (const theme of ['day', 'night']) {
  const night = theme === 'night'
  const env = await open('/inbox', { theme, view: desktop, captures: [READY()] })
  const { page, state } = env
  const t = (s) => `desktop-${theme} ${s}`
  const badge = () => text(page.locator('.app-nav-badge'))
  check(t('the Inbox badge counts the ready page (1 capture + 1 page)'), (await badge()) === '2', await badge())

  // Right-click the ready row → its menu.
  await ready(page, 'Monday notes').click({ button: 'right', position: { x: 120, y: 20 } })
  await sleep(300)
  const rowMenu = await menuRows(page)
  check(t('right-click the ready row → See the photo · Dismiss page · Delete page and photo'), rowMenu.length === 3 && rowMenu[0] === 'See the photo' && rowMenu[1].startsWith('Dismiss page') && rowMenu[2].startsWith('Delete page and photo'), JSON.stringify(rowMenu))
  await shot(page, `inbox-menu-desktop-${theme}`)
  if (!night) {
    await page.getByRole('menuitem', { name: /^Dismiss page/ }).click()
    await sleep(700)
    check(t('…Dismiss page → the row leaves, the badge drops to 1, "Page dismissed"'), (await ready(page, 'Monday notes').count()) === 0 && (await badge()) === '1' && (await toastSeen(page, 'Page dismissed')), `${await badge()} ${JSON.stringify(await toasts(page))}`)
    await undoToast(env, 'Page dismissed')
    await sleep(700)
    check(t('…Undo → the row and the badge back'), (await ready(page, 'Monday notes').count()) === 1 && (await badge()) === '2', await badge())
    // See the photo from the row.
    await ready(page, 'Monday notes').getByRole('button', { name: /^More for/ }).click()
    await page.getByRole('menuitem', { name: 'See the photo' }).click()
    await sleep(500)
    check(t('⋯ → See the photo → the photo, full size'), (await dialog(page, 'Your page').count()) === 1 && (await dialog(page, 'Your page').locator('img.pp-photo').count()) === 1)
    await page.keyboard.press('Escape')
    await sleep(300)
  } else {
    await page.keyboard.press('Escape')
    await sleep(300)
  }

  await ready(page, 'Monday notes').getByRole('button', { name: 'Review' }).click()
  await waitFor(async () => (await dialog(page, 'From your page').count()) === 1)
  const panel = dialog(page, 'From your page')
  const row = (s) => panel.locator('.pp-row', { hasText: s })
  check(t('the footer names the keys: ↑↓ a line · ⏎ add · ⌫ dismiss · T type · A select all'), flat(await text(panel.locator('.pp-keys'))) === '↑↓ a line · ⏎ add · ⌫ dismiss · T type · A select all', await text(panel.locator('.pp-keys')))
  await sleep(400) // the panel fades in
  await shot(page, `review-desktop-${theme}`)
  await basics(env, t('review'))

  // Right-click a line → its menu, with the keys.
  await row('Quiz').locator('.pp-row-text').click({ button: 'right' })
  await sleep(300)
  const lineMenu = await menuRows(page)
  check(t('right-click a line → Add this line ⏎ … Dismiss this line ⌫'), /^Add this line/.test(lineMenu[0]) && lineMenu[0].includes('⏎') && /^Dismiss this line/.test(lineMenu.at(-1)) && lineMenu.at(-1).includes('⌫') && lineMenu.some((m) => m.startsWith('Change the type…') && m.includes('T')), JSON.stringify(lineMenu))
  await shot(page, `line-menu-desktop-${theme}`)
  if (night) {
    await env.ctx.close()
    continue
  }
  await page.getByRole('menuitem', { name: /^Dismiss this line/ }).click()
  await sleep(500)
  check(t('…Dismiss this line → "Line dismissed", 6 things'), (await toastSeen(page, 'Line dismissed')) && (await things(page)) === '6', JSON.stringify(await toasts(page)))
  await undoToast(env, 'Line dismissed')
  await sleep(500)
  check(t('…Undo → 7 things'), (await things(page)) === '7')

  // Keys: ↓ rings the first line; ⏎ adds it; ⌫ dismisses the next; A selects all; Esc clears, then closes.
  await page.keyboard.press('ArrowDown')
  await sleep(200)
  check(t('↓ rings the first line'), (await panel.locator('.pp-row.is-ringed').count()) === 1 && (await text(panel.locator('.pp-row.is-ringed'))).includes('OS lecture 3'))
  let w0 = state.writes.length
  await page.keyboard.press('Enter')
  await sleep(700)
  check(t('⏎ adds the ringed line ("Added 1 note"), the ring moves to the next'), (await toastSeen(page, 'Added 1 note')) && posts(state, 'inbox_items', w0).length === 1 && (await things(page)) === '6' && (await text(panel.locator('.pp-row.is-ringed'))).includes('Assignment 2'), JSON.stringify(await toasts(page)))
  await page.keyboard.press('Backspace')
  await sleep(500)
  check(t('⌫ dismisses it ("Line dismissed"), 5 things, the ring on Read ch. 4'), (await toastSeen(page, 'Line dismissed')) && (await things(page)) === '5' && (await text(panel.locator('.pp-row.is-ringed'))).includes('Read ch. 4'), JSON.stringify(await toasts(page)))
  await page.keyboard.press('Delete')
  await sleep(500)
  check(t('Del works the same (4 things)'), (await things(page)) === '4')
  await page.keyboard.press('a')
  await sleep(300)
  check(t('A selects every line ("4 selected")'), (await text(panel.locator('.pp-banner'))).includes('4 selected'), await text(panel.locator('.pp-banner')))
  await shot(page, `select-desktop-${theme}`)
  await page.keyboard.press('Escape')
  await sleep(300)
  check(t('Esc ends the selection, the panel stays'), !(await text(panel.locator('.pp-banner'))).includes('selected') && (await panel.count()) === 1)
  await page.keyboard.press('Escape')
  await sleep(400)
  check(t('Esc again closes it (kept for later): the row says "4 things · Ready to review · 1 added"'), (await panel.count()) === 0 && /Monday notes · 4 things/.test(flat(await text(ready(page, 'Monday notes')))) && (await text(ready(page, 'Monday notes'))).includes('1 added'), flat(await text(ready(page, 'Monday notes'))))

  // The page's ⋯ → Delete page and photo; Undo. Then Add all.
  await ready(page, 'Monday notes').getByRole('button', { name: 'Review' }).click()
  await waitFor(async () => (await panel.count()) === 1)
  check(t('reopened: "Added already" (the note) and "2 lines dismissed · Bring back"'), /Added already OS lecture 3 — 4 Oct in the Inbox 2 lines dismissed Bring back/.test(flat(await text(panel.locator('.pp-done')))), flat(await text(panel.locator('.pp-done'))))
  await panel.getByRole('button', { name: 'More for this page' }).click()
  await sleep(300)
  const pageMenu = await menuRows(page)
  check(t('the page’s ⋯ (a menu here): … Keep for later · Dismiss page · Delete page and photo'), pageMenu.some((m) => m.startsWith('Keep for later')) && pageMenu.some((m) => m.startsWith('Dismiss page')) && pageMenu.at(-1).startsWith('Delete page and photo'), JSON.stringify(pageMenu))
  w0 = state.writes.length
  await page.getByRole('menuitem', { name: /^Delete page and photo/ }).click()
  await sleep(700)
  const c = lastCapture(state, cid(1), w0)
  check(t('Delete page and photo → closed, row gone, read wiped; what was added stays (no deletes)'), (await panel.count()) === 0 && (await ready(page, 'Monday notes').count()) === 0 && c?.items.length === 0 && state.writes.slice(w0).filter((w) => w.method === 'DELETE').length === 0, JSON.stringify(await toasts(page)))
  await undoToast(env, 'Page deleted')
  await sleep(700)
  await ready(page, 'Monday notes').getByRole('button', { name: 'Review' }).click()
  await waitFor(async () => (await panel.count()) === 1)
  check(t('…Undo → back with its 4 lines'), (await things(page)) === '4')
  w0 = state.writes.length
  await panel.getByRole('button', { name: 'Add all 4' }).click()
  await sleep(800)
  const done = lastCapture(state, cid(1), w0)
  // The badge: the page itself no longer counts; its two notes (⏎'s and this one) are Inbox items now: 1 + 2.
  check(t('Add all 4 → only the lines left are written, the page reviewed; the badge counts its notes, not the page'), posts(state, 'tasks', w0).length === 3 && posts(state, 'inbox_items', w0).length === 1 && done?.reviewed_at && (await badge()) === '3', `${posts(state, 'tasks', w0).length}/${posts(state, 'inbox_items', w0).length} ${await badge()}`)
  await env.ctx.close()
}

await browser.close()
fs.rmSync(TMP, { recursive: true, force: true })
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
