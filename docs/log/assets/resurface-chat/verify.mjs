// P7e A24 + A28 on the REAL app, signed in against a MOCKED backend (the resurface recipe,
// docs/log/assets/resurface/verify.mjs): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9
// (nothing listens there), a made-up session sits in localStorage, and Playwright answers every REST and
// edge-function call — `chat` streams a canned reply, `transcribe` returns canned words. Chrome's fake
// microphone records real (silent) audio. Clock: Wed 7 Oct 2026, 10:00 Cairo.
//   A24 — "From a while ago" shows a journal page, a quote (with its book) and a library note faithfully,
//         opens each where it lives, settles with Keep / Let it go / Not now, and journal text is never sent.
//   A28 — the chat keeps its conversation across close, reopen and reload until Clear (with Undo), and
//         its mic (tap → Stop & send, or hold and let go) turns the words into the message.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5282'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (k) => !ONLY || ONLY.has(k)

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000d3e0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day: Wednesday 7 Oct 2026, Cairo = UTC+3 ──
const cairo = (hhmm, day = 7, month = 9) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, month, day, h - 3, m))
}
const iso = (hhmm, day, month) => cairo(hhmm, day, month).toISOString()
const DAY0 = '2026-08-01T06:00:00.000Z'
const PICK = 'z0000000-0000-4000-8000-000000000001'
const PAGE = 'j0000000-0000-4000-8000-000000000001'
const QUOTE = 'q0000000-0000-4000-8000-000000000001'
const NOTE = 'n0000000-0000-4000-8000-000000000001'
const BOOK = 'b0000000-0000-4000-8000-000000000001'
const PAGE_BODY = 'Walked by the river after work.\nThe light was gold and I finally felt the week let go.'
const PAGE_LINE = 'Walked by the river after work. The light was gold and I finally felt the week let go.'
const QUOTE_TEXT = 'The best arguments in the world won’t change a person’s mind. The only thing that can do that is a good story.'
const NOTE_BODY = 'Ideas for the garden: a bench under the fig, mint by the tap.'
const SETTINGS = { user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const MILK = { id: '10000000-0000-4000-8000-000000000002', title: 'Buy milk', user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: iso('09:00'), scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: 15, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: DAY0, updated_at: DAY0 }

const ENTITY = { journal: ['journal_entry', PAGE], quote: ['quote', QUOTE], note: ['note', NOTE] }
function tables({ entity = null, putOffs = 0 } = {}) {
  const [type, id] = ENTITY[entity] ?? []
  const earlier = Array.from({ length: entity ? putOffs : 0 }, (_, i) => ({
    id: `z0000000-0000-4000-8000-00000000010${i}`, user_id: UID, entity_type: type, entity_id: id, shown_on: ['2026-09-20', '2026-09-03'][i], action: 'review_later', snoozed_until: null, created_at: DAY0,
  }))
  return {
    app_settings: [{ ...SETTINGS }],
    projects: [], routines: [], routine_completions: [], time_entries: [], activity_log: [], inbox_items: [], commentary: [],
    tasks: [{ ...MILK }],
    journal_entries: [{ id: PAGE, user_id: UID, body: PAGE_BODY, entry_date: '2026-07-14', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: '2026-07-14T17:00:00Z', updated_at: '2026-07-14T17:00:00Z' }],
    books: [{ id: BOOK, user_id: UID, title: 'The Overstory', author: 'Richard Powers', published_year: 2018, current_page: 120, total_pages: 502, status: 'reading', created_at: DAY0, updated_at: DAY0 }],
    quotes: [{ id: QUOTE, user_id: UID, text: QUOTE_TEXT, author: null, source: null, tags: [], book_id: BOOK, page: '42', created_at: iso('09:00', 1, 8), updated_at: iso('09:00', 1, 8) }],
    notes: [{ id: NOTE, user_id: UID, title: null, body: NOTE_BODY, tags: [], domain_id: null, book_id: null, created_at: iso('09:00', 16, 8), updated_at: iso('09:00', 16, 8) }],
    resurfaced_log: entity ? [{ id: PICK, user_id: UID, entity_type: type, entity_id: id, shown_on: '2026-10-07', action: 'pending', snoozed_until: null, created_at: iso('06:30') }, ...earlier] : [],
  }
}
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const w = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return w ? rows.filter((r) => w.includes(r.event_type)) : rows
}

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const HEARD = ['what should I drop', 'move the dentist to Friday']

async function open(theme, view, scene = {}, route = '/today') {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', permissions: ['microphone'] })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
    localStorage.setItem('kf.today.more-open', '1')
  }, [theme, JSON.stringify(session), UID])
  const state = { rows: tables(scene), writes: [], fn: [], bodies: [] }
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (req.method() !== 'GET') state.bodies.push(req.postData() ?? '')
    if (url.pathname === '/functions/v1/chat') {
      const body = JSON.parse(req.postData() ?? '{}')
      state.fn.push({ name: 'chat', body })
      const sse = 'data: {"delta":"You have "}\n\ndata: {"delta":"three things today."}\n\nevent: done\ndata: {"citations":[]}\n\n'
      return r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse })
    }
    if (url.pathname === '/functions/v1/transcribe') {
      const n = state.fn.filter((f) => f.name === 'transcribe').length
      state.fn.push({ name: 'transcribe', size: req.postDataBuffer()?.length ?? 0 })
      return r.fulfill({ json: { text: HEARD[n % HEARD.length] }, headers: { 'access-control-allow-origin': '*' } })
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      state.fn.push({ name: url.pathname.slice(14) })
      return r.fulfill({ json: {} })
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try {
        body = JSON.parse(req.postData() ?? '[]')
      } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => x.id === row.id)
        const full = { created_at: new Date(cairo('10:00').getTime() + ++seq * 1000).toISOString(), ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') {
      state.writes.push({ table, row: { deleted: url.search } })
      return r.fulfill({ status: 204, body: '' })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = filterRows(state.rows[table] ?? [], url)
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('10:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://127.0.0.1:9/") && errors.push(`console: ${m.text()}`))
  // Every request leaving the page: journal text must never be in one (A24 — "no AI").
  page.on('request', (q) => state.bodies.push(`${q.url()} ${q.postData() ?? ''}`))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function center(loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(150)
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
async function tap(cdp, loc) {
  const p = await center(loc)
  await touch(cdp, 'touchStart', [p])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
}
const press = (cdp, loc) => (cdp ? tap(cdp, loc) : loc.click())
/** Holds the pointer on `loc` until `held()` says the take is recording, a little longer, then lets go. */
async function hold(page, cdp, loc, held) {
  const p = await center(loc)
  if (cdp) await touch(cdp, 'touchStart', [p])
  else {
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
  }
  const recording = await until(held, 6000)
  await sleep(900)
  if (cdp) await touch(cdp, 'touchEnd', [])
  else await page.mouse.up()
  return recording
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const card = (page) => page.locator('[data-resurface]')
const btn = (page, a) => card(page).locator(`[data-action="${a}"]`)
const buttons = async (page) => (await card(page).locator('[data-action]').allInnerTexts()).map((t) => t.trim())
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const undo = (page) => page.locator('.kf-toast-act', { hasText: 'Undo' }).last()
const lastWrite = (state, table, rowId) => state.writes.filter((w) => w.table === table && w.row.id === rowId).at(-1)?.row
const logged = (state, type) => state.writes.some((w) => w.table === 'activity_log' && w.row.event_type === type)
async function until(ok, ms = 6000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await ok()) return true
  return ok()
}
const noToast = (page) => page.waitForFunction(() => !document.querySelector('.kf-toast'), null, { timeout: 12000 }).catch(() => {})
async function basics(page, name, errors, width) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${name} no horizontal scroll at ${width}`, wide <= width, wide)
  check(`${name} no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
}
const pageHas = (page, text) => page.evaluate((t) => document.body.innerText.includes(t) || [...document.querySelectorAll('textarea, input')].some((x) => x.value.includes(t)), text)
async function settles(name, s, action, mark, { toast, event }) {
  const { page, cdp, state } = s
  await press(cdp, btn(page, action))
  check(`${name} ${action} → pick marked ${mark}`, await until(() => lastWrite(state, 'resurfaced_log', PICK)?.action === mark), JSON.stringify(lastWrite(state, 'resurfaced_log', PICK)?.action))
  check(`${name} ${action} → logged ${event}`, await until(() => logged(state, event)))
  check(`${name} ${action} → card gone`, await until(async () => (await card(page).count()) === 0))
  check(`${name} ${action} → toast "${toast}" with Undo`, (await toasts(page)).includes(toast), JSON.stringify(await toasts(page)))
  check(`${name} ${action} → the memory itself untouched (no write, no delete)`, !state.writes.some((w) => ['journal_entries', 'quotes', 'notes'].includes(w.table)))
  await press(cdp, undo(page))
  check(`${name} ${action} Undo → pick pending, card back`, await until(async () => lastWrite(state, 'resurfaced_log', PICK)?.action === 'pending' && (await card(page).count()) === 1))
  await noToast(page)
}

const MEMORIES = [
  {
    entity: 'journal', type: 'journal_entry', quote: PAGE_LINE, meta: 'Journal · 14 Jul 2026 · 2 months ago',
    opens: (u) => u.pathname === '/journal' && u.searchParams.get('focus') === PAGE, there: PAGE_BODY.split('\n')[0], where: 'that day in the Journal',
  },
  {
    entity: 'quote', type: 'quote', quote: QUOTE_TEXT, meta: 'Quote · The Overstory · Richard Powers · saved 5 weeks ago',
    opens: (u) => u.pathname === '/library' && u.searchParams.get('quoteId') === QUOTE, there: 'The only thing that can do that is a good story', where: 'the quote in the Library',
  },
  {
    entity: 'note', type: 'note', quote: NOTE_BODY, meta: 'Library note · saved 3 weeks ago',
    opens: (u) => u.pathname === '/library' && u.searchParams.get('noteId') === NOTE, there: 'a bench under the fig', where: 'the note in the Library',
  },
]

for (const [label, view, width] of [['phone', PHONE, 390], ['desk', DESKTOP, 1280]]) {
  for (const theme of ['day', 'night']) {
    const name = `${label}-${theme}`
    if (!want(label) && !want(name)) continue

    // ── A24: each memory kind, shown faithfully, opening where it lives ──
    for (const m of MEMORIES) {
      if (!want(m.entity) && ONLY && !want(label) && !want(name)) continue
      const s = await open(theme, view, { entity: m.entity })
      const { page, cdp, errors, state } = s
      await card(page).waitFor({ timeout: 8000 }).catch(() => {})
      await card(page).scrollIntoViewIfNeeded().catch(() => {})
      check(`${name} ${m.entity}: the card shows it (data-resurface=${m.type})`, (await card(page).getAttribute('data-resurface').catch(() => null)) === m.type)
      const said = (await card(page).locator('.kf-resurface-open').innerText().catch(() => '')).trim()
      check(`${name} ${m.entity}: quotes its words`, said === `"${m.quote}"`, said)
      const meta = (await card(page).locator('.kf-resurface-meta span').first().innerText().catch(() => '')).trim()
      check(`${name} ${m.entity}: meta "${m.meta}"`, meta === m.meta, meta)
      check(`${name} ${m.entity}: Keep · Let it go · Not now · back in 5 days`, JSON.stringify(await buttons(page)) === JSON.stringify(['Keep', 'Let it go', 'Not now · back in 5 days']), JSON.stringify(await buttons(page)))
      await press(cdp, card(page).getByRole('button', { name: 'What is this?' }))
      const why = await card(page).locator('.kf-resurface-why').innerText().catch(() => '')
      check(`${name} ${m.entity}: ? says letting go deletes nothing`, /back for a reread/.test(why) && /nothing is deleted/.test(why), why)
      await shot(page, `${name}-${m.entity}`)
      await basics(page, `${name} ${m.entity}`, errors, width)
      if (m.entity === 'journal') {
        await settles(`${name} journal`, s, 'keep', 'converted', { toast: 'Kept', event: 'resurfaced.kept' })
        await settles(`${name} journal`, s, 'letgo', 'dismissed', { toast: 'Let go', event: 'resurfaced.dismissed' })
        await settles(`${name} journal`, s, 'notnow', 'review_later', { toast: 'Back in 5 days', event: 'resurfaced.review_later' })
        check(`${name} journal: its text never left the page (no request carries it)`, !state.bodies.some((b) => b.includes('Walked by the river') || b.includes('Walked%20by%20the%20river')))
        check(`${name} journal: no AI function called`, state.fn.length === 0, JSON.stringify(state.fn))
      }
      await press(cdp, card(page).locator('.kf-resurface-open'))
      check(`${name} ${m.entity}: tap → ${m.where}`, await until(() => m.opens(new URL(page.url()))), new URL(page.url()).pathname + new URL(page.url()).search)
      check(`${name} ${m.entity}: …and it's there on the page`, await until(() => pageHas(page, m.there), 8000))
      await sleep(400)
      await shot(page, `${name}-${m.entity}-open`)
      check(`${name} ${m.entity} open: no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
      await s.ctx.close()
    }

    // ── A24: a memory put off twice asks once — Keep or Let it go ──
    {
      const s = await open(theme, view, { entity: 'quote', putOffs: 2 })
      await card(s.page).waitFor({ timeout: 8000 }).catch(() => {})
      check(`${name} quote put off twice: Keep · Let it go only`, JSON.stringify(await buttons(s.page)) === JSON.stringify(['Keep', 'Let it go']), JSON.stringify(await buttons(s.page)))
      await s.ctx.close()
    }

    // ── A28: the chat keeps the conversation until Clear, and the mic turns words into the message ──
    {
      const s = await open(theme, view)
      const { page, cdp, errors, state } = s
      const drawer = page.locator('.kf-drawer')
      const openChat = async () => {
        await page.keyboard.press('Control+j')
        await drawer.waitFor({ timeout: 6000 }).catch(() => {})
        await sleep(300)
      }
      const closeChat = async () => {
        await page.keyboard.press('Escape')
        await until(async () => (await drawer.count()) === 0)
      }
      const said = (t) => drawer.getByText(t, { exact: true })
      const clearBtn = drawer.locator('.kf-chat-clear')
      const mic = drawer.locator('.kf-chat-mic')
      const sheet = page.locator('[role="dialog"][aria-label="Voice capture"]')
      const chats = () => state.fn.filter((f) => f.name === 'chat')
      const lastAsked = () => chats().at(-1)?.body.messages.at(-1)?.content

      await openChat()
      check(`${name} chat: opens empty, no Clear yet`, (await drawer.locator('.kf-chat-empty').count()) === 1 && (await clearBtn.count()) === 0)
      await drawer.locator('input[placeholder="Ask about your day…"]').fill('What’s on today?')
      await page.keyboard.press('Enter')
      check(`${name} chat: the answer streams in`, await until(async () => (await said('You have three things today.').count()) === 1))
      check(`${name} chat: Clear shows once there's a conversation`, await until(async () => (await clearBtn.count()) === 1))
      await closeChat()
      await openChat()
      check(`${name} chat: close + reopen keeps the conversation`, (await said('What’s on today?').count()) === 1 && (await said('You have three things today.').count()) === 1)
      await page.reload({ waitUntil: 'networkidle' })
      await sleep(800)
      await openChat()
      check(`${name} chat: a reload keeps it too (this device)`, (await said('What’s on today?').count()) === 1 && (await said('You have three things today.').count()) === 1)
      check(`${name} chat: kept under this account's key`, await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '[]')).length === 2, `kf.chat.${UID}`))

      // Tap the mic: the voice sheet listens; Stop & send → transcribe → the words are the message.
      await press(cdp, mic)
      check(`${name} mic tap: the voice sheet opens, listening`, await until(async () => (await sheet.getAttribute('data-voice-phase').catch(() => null)) === 'recording'))
      const stop = sheet.getByRole('button', { name: 'Stop & send' })
      check(`${name} mic tap: Stop & send ready once the mic is on`, await until(async () => (await stop.isEnabled().catch(() => false))))
      await sleep(700)
      await shot(page, `${name}-chat-voice`)
      await press(cdp, stop)
      check(`${name} mic tap: the take went to transcribe (Groq path)`, await until(() => state.fn.some((f) => f.name === 'transcribe' && f.size > 0)), JSON.stringify(state.fn.filter((f) => f.name === 'transcribe')))
      check(`${name} mic tap: the words became the message`, await until(async () => (await said(HEARD[0]).count()) === 1 && lastAsked() === HEARD[0]), lastAsked())
      check(`${name} mic tap: and it was answered`, await until(async () => (await said('You have three things today.').count()) === 2))
      check(`${name} mic tap: the sheet is gone`, await until(async () => (await sheet.count()) === 0))

      // Hold the mic: it records while held and sends on release — no Stop needed.
      const recorded = await hold(page, cdp, mic, async () => (await sheet.getByRole('button', { name: 'Stop & send' }).isEnabled().catch(() => false)))
      check(`${name} mic hold: records while held`, recorded)
      check(`${name} mic hold: letting go sends the words`, await until(async () => (await said(HEARD[1]).count()) === 1 && lastAsked() === HEARD[1], 8000), lastAsked())
      check(`${name} mic hold: answered, sheet gone`, await until(async () => (await said('You have three things today.').count()) === 3 && (await sheet.count()) === 0))
      check(`${name} chat: the request carried the conversation so far`, (chats().at(-1)?.body.messages.length ?? 0) === 5, chats().at(-1)?.body.messages.length)
      await noToast(page)
      await shot(page, `${name}-chat-kept`)

      // Clear → empty, one toast with Undo → back; Clear again → gone after a reload.
      await press(cdp, clearBtn)
      check(`${name} Clear: the chat is empty again`, await until(async () => (await drawer.locator('.kf-chat-empty').count()) === 1))
      check(`${name} Clear: toast "Chat cleared" with Undo`, (await toasts(page)).includes('Chat cleared'), JSON.stringify(await toasts(page)))
      await press(cdp, undo(page))
      check(`${name} Clear Undo: the conversation is back`, await until(async () => (await said(HEARD[1]).count()) === 1 && (await said('What’s on today?').count()) === 1))
      await noToast(page)
      await press(cdp, clearBtn)
      await noToast(page)
      await page.reload({ waitUntil: 'networkidle' })
      await sleep(800)
      await openChat()
      check(`${name} Clear: stays cleared after a reload`, (await drawer.locator('.kf-chat-empty').count()) === 1 && (await page.evaluate((k) => localStorage.getItem(k), `kf.chat.${UID}`)) === null)
      await basics(page, `${name} chat`, errors, width)
      await s.ctx.close()
    }
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
