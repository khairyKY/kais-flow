// Queue items 5, 7 and 17 on the REAL app, signed in against a MOCKED backend (the resurface-chat recipe):
// the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a made-up session
// sits in localStorage, and Playwright answers every REST and edge-function call. Clock: Sunday 25 Oct
// 2026, 12:00 Cairo (UTC+3).
//
// The `chat` function is mocked at the network layer AS THE SERVER BEHAVES: a scripted model makes its
// tool-call rounds (a read, then `propose`), the steps go through the REAL supabase/functions/chat/plan.ts
// (stepToCall → the real date reader; restorePlan → the batch's one Undo), the dry run answers as the MCP tools do, and `{ run }`
// writes the rows into this mock's tables and answers each tool's result.
//   G — Kai's gym request → a card with the right days, in his order, nothing written → Confirm → 3 event
//       writes at the right instants → the honest summary, its Undo; no raw pipes, no stray chips.
//   U — Undo for edits and moves too: one Undo puts the whole confirmed batch back, row for row, via the outbox.
//   F — a failed tool → an honest "1 of 2 done" naming the refusal; a plan the tools refused → said, no card.
//   M — a question's markdown table renders as a table.
//   A — "File captures for me": off by default (the one notice, a confident capture waits in the Inbox with
//       its suggestion; a ⌘K line with a date and #project waits too, filed in one tap; Today's "Add a
//       task…" row still adds at once), switched on in Settings (it files itself).
//   P — the project chip: "→ Forecasting App?" applies in one tap; "Assign" puts it there with Undo.
//   R — a capture filed by hand while the AI's read of it is out is filed ONCE (no second task).
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]     (ONLY=g,u,f,m,a,r,p to pick)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5308'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const want = (k) => !ONLY || ONLY.has(k)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const { chromium } = await import(pathToFileURL(PW).href)
// The chat function's own planning code, run here as the server runs it.
const { stepToCall, restorePlan, UNDO_TABLES } = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/chat/plan.ts')).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(ok, ms = 6000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await ok()) return true
  return ok()
}

// ── session ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000a1c5'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

// ── the day: Sunday 25 Oct 2026, Cairo = UTC+3 ──
const ZONE = 'Africa/Cairo'
const cairo = (hhmm, day = 25) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
/** A tool's "YYYY-MM-DDTHH:mm" on the user's clock → the UTC instant (Cairo is +03:00 all this week). */
const wallIso = (w) => new Date(`${w}:00+03:00`).toISOString()
const wallOf = (isoStr) => {
  const d = new Date(Date.parse(isoStr) + 3 * 3600_000).toISOString()
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`
}
const DAY0 = '2026-08-01T06:00:00.000Z'
const P_FC = 'f0000000-0000-4000-8000-0000000000fc'
const DENTIST = '10000000-0000-4000-8000-0000000000de'
const task = (id, title, over = {}) => ({ id, title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: DAY0, updated_at: '2026-10-20T09:00:00.000Z', ...over })
const SETTINGS = { user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', timezone: ZONE, help_seen: ['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

function tables(settings = {}) {
  return {
    app_settings: [{ ...SETTINGS, auto_file_captures: false, auto_project: 'suggest', ...settings }],
    projects: [{ id: P_FC, user_id: UID, name: 'Forecasting App', domain_id: null, type: 'standard', status: 'active', deleted_at: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 }],
    routines: [], routine_completions: [], time_entries: [], activity_log: [], inbox_items: [], commentary: [], calendar_events: [], domains: [], areas: [],
    tasks: [
      task('10000000-0000-4000-8000-0000000000f1', 'Fix the forecast chart', { project_id: P_FC }),
      task('10000000-0000-4000-8000-0000000000f2', 'Forecast model: add holidays', { project_id: P_FC }),
      task(DENTIST, 'Dentist', { due_at: iso('16:00', 26) }),
    ],
  }
}

const GYM_ASK = 'Schedule my gym this week. Session 1: Mon 7:00–8:15, HC, ID 7. Session 2: Wed 5:45–7:00 PM, HQ, ID 10. Session 3: Tue 5:45–7:00 PM, West, ID 18.'
// The scripted model: its tool-call rounds for each message (what Groq returns), as the server loops them.
const SCRIPT = [
  {
    when: (q) => q.startsWith('Schedule my gym'),
    rounds: [
      { tool: 'calendar', args: { from: '2026-10-26', to: '2026-10-28' } },
      {
        tool: 'propose',
        args: {
          steps: [
            { do: 'add_event', title: 'Gym · HC (Session 1, ID 7)', when: 'Mon 7:00–8:15' },
            { do: 'add_event', title: 'Gym · HQ (Session 2, ID 10)', when: 'Wed 5:45–7:00 PM' },
            { do: 'add_event', title: 'Gym · West (Session 3, ID 18)', when: 'Tue 5:45–7:00 PM' },
          ],
        },
      },
    ],
  },
  {
    when: (q) => q.startsWith('Move the dentist'),
    rounds: [{ tool: 'propose', args: { steps: [{ do: 'reschedule_task', id: 't1', when: 'Fri 4pm' }, { do: 'add_event', title: 'Swim', when: 'Thu 6pm' }] } }],
  },
  {
    when: (q) => q.startsWith('Push the dentist'),
    rounds: [{ tool: 'propose', args: { steps: [{ do: 'reschedule_task', id: 't1', when: 'Fri 4pm' }, { do: 'edit_task', id: 't1', project_id: P_FC }, { do: 'add_event', title: 'Swim', when: 'Thu 6pm' }] } }],
  },
  // The tools refuse the plan twice: the server says so in words, and draws no card.
  { when: (q) => q.startsWith('Add a meeting'), refused: 'I couldn\'t set that up: step 1 (add_event): "end" must be after "start".' },
  { when: (q) => q.startsWith("What's on"), text: 'This week:\n\n| Day | What |\n|---|---|\n| Mon | Gym · HC, 7:00 AM |\n| Mon | **Dentist**, 4:00 PM |\n\nWant me to add anything?' },
]
const REFS = { t1: { id: DENTIST, type: 'task' } }

/** What the MCP tool answers for a call (its dry run or the real thing): eventOut / taskOut shapes. */
function toolAnswer(state, call, write) {
  const rows = state.rows
  if (call.tool === 'add_event') {
    const id = crypto.randomUUID()
    const start = wallIso(call.args.start)
    const end = call.args.end ? wallIso(call.args.end) : new Date(Date.parse(start) + 30 * 60_000).toISOString()
    if (write) rows.calendar_events.push({ id, user_id: UID, title: call.args.title, starts_at: start, ends_at: end, all_day: false, task_id: null, type: 'event', source: 'native', busy: true, color: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, deleted_at: null, created_at: iso('12:00'), updated_at: iso('12:00') })
    return { ok: true, output: { added: { id, title: call.args.title, start: wallOf(start), end: wallOf(end) }, timezone: ZONE } }
  }
  if (call.tool === 'reschedule_task') {
    // F: the dentist was deleted on another device between the plan and the OK — the tool refuses.
    if (write && state.dentistGone) return { ok: false, error: `No task with id ${call.args.id} (it may have been deleted). Use list_tasks or search to find it.` }
    const t = rows.tasks.find((x) => x.id === call.args.id)
    if (write) Object.assign(t, { due_at: wallIso(call.args.when), updated_at: iso('12:05') })
    return { ok: true, output: { rescheduled: { id: call.args.id, title: 'Dentist', due: call.args.when.replace('T', ' ') }, changed: ['due'], timezone: ZONE } }
  }
  if (call.tool === 'edit_task') {
    const t = rows.tasks.find((x) => x.id === call.args.id)
    if (write) Object.assign(t, { project_id: call.args.project_id, updated_at: iso('12:05') })
    return { ok: true, output: { edited: { id: t.id, title: t.title }, changed: ['project → Forecasting App'], timezone: ZONE } }
  }
  if (call.tool === 'delete_event') {
    const e = rows.calendar_events.find((x) => x.id === call.args.id)
    if (write && e) e.deleted_at = iso('12:05')
    return e ? { ok: true, output: { deleted: { id: e.id, title: e.title, start: wallOf(e.starts_at), end: wallOf(e.ends_at) } } } : { ok: false, error: 'No event with that id.' }
  }
  return { ok: false, error: `No tool ${call.tool}.` }
}

function chatMock(state, body) {
  if (Array.isArray(body.run)) {
    state.runs.push(body.run)
    // As the server does: the rows before and after the batch give its one Undo (the real restorePlan).
    const snap = () => Object.fromEntries(UNDO_TABLES.map((tb) => [tb, new Map((state.rows[tb] ?? []).map((r) => [r.id, structuredClone(r)]))]))
    const before = snap()
    const out = body.run.map((call) => ({ ...call, ...toolAnswer(state, call, true) }))
    return { json: { results: out, restore: restorePlan(before, snap()) } }
  }
  const q = body.messages.at(-1).content
  const s = SCRIPT.find((x) => x.when(q))
  if (!s) return { sse: 'data: {"delta":"Sure."}\n\nevent: done\ndata: {"citations":[]}\n\n' }
  if (s.text) return { sse: `data: ${JSON.stringify({ delta: s.text })}\n\nevent: done\ndata: {"citations":[]}\n\n` }
  if (s.refused) return { sse: `data: ${JSON.stringify({ delta: s.refused })}\n\nevent: done\ndata: {"citations":[]}\n\n` }
  const now = cairo('12:00')
  for (const r of s.rounds) {
    state.rounds.push(r.tool)
    if (r.tool !== 'propose') continue // a read: the server answers it and loops
    const calls = r.args.steps.map((st) => stepToCall(st, REFS, now, ZONE))
    const previews = calls.map((c) => toolAnswer(state, c, false).output)
    return { sse: `event: done\ndata: ${JSON.stringify({ citations: [], plan: { calls, previews } })}\n\n` }
  }
}

// The AI read for the two captures A is about; anything else is over today's allowance (429), so a
// typed task's read stays out of the way (the project chip, Today's add row).
const parseFor = (raw) =>
  /mum|landlord|renew hosting/i.test(raw)
    ? { kind: 'task', cleaned_text: raw, title: /landlord/.test(raw) ? 'Email the landlord about the boiler' : /renew/.test(raw) ? 'Renew hosting' : 'Call mum about Sunday', priority: 1, confidence: 0.95 }
    : null

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open({ theme = 'day', view = DESKTOP, settings = {}, route = '/today', inbox = [], waitUntil = 'networkidle' } = {}) {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: ZONE, locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
  }, [theme, JSON.stringify(session), UID])
  const state = { rows: tables(settings), writes: [], fn: [], runs: [], rounds: [], gets: [] }
  state.rows.inbox_items.push(...inbox)
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const cors = { 'access-control-allow-origin': '*' }
    if (url.pathname === '/functions/v1/chat') {
      const body = JSON.parse(req.postData() ?? '{}')
      state.fn.push({ name: 'chat', body })
      const res = chatMock(state, body)
      return res.json ? r.fulfill({ json: res.json, headers: cors }) : r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', ...cors }, body: res.sse })
    }
    if (url.pathname === '/functions/v1/parse-capture') {
      const body = JSON.parse(req.postData() ?? '{}')
      state.fn.push({ name: 'parse-capture', body })
      const p = parseFor(body.raw_text ?? '')
      if (/renew hosting/.test(body.raw_text ?? '')) await sleep(8000) // R: the read is still out while it's filed by hand
      return p ? r.fulfill({ json: p, headers: cors }) : r.fulfill({ status: 429, json: { error: 'daily_limit' }, headers: cors })
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      state.fn.push({ name: url.pathname.slice(14) })
      return r.fulfill({ json: {}, headers: cors })
    }
    // A PATCH by query (processQueuedCaptures' server claim: id + still pending): the rows it matched, as written.
    if (req.method() === 'PATCH' && url.searchParams.get('id')) {
      const id = url.searchParams.get('id').replace(/^eq\./, '')
      const status = url.searchParams.get('status')?.replace(/^eq\./, '')
      const patch = JSON.parse(req.postData() ?? '{}')
      const hit = (state.rows[table] ?? []).filter((x) => x.id === id && (!status || x.status === status))
      for (const x of hit) Object.assign(x, patch)
      state.writes.push({ table, row: { id, ...patch }, method: 'PATCH' })
      return r.fulfill({ status: 200, json: hit.map((x) => ({ id: x.id })) })
    }
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      let body = []
      try {
        body = JSON.parse(req.postData() ?? '[]')
      } catch {}
      for (const row of [body].flat()) {
        const list = (state.rows[table] ??= [])
        const i = list.findIndex((x) => (row.id ? x.id === row.id : table === 'app_settings'))
        const full = { created_at: new Date(cairo('12:00').getTime() + ++seq * 1000).toISOString(), ...(i >= 0 ? list[i] : null), ...row }
        if (i >= 0) list[i] = full
        else list.push(full)
        state.writes.push({ table, row: full, sent: row })
      }
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (req.method() === 'DELETE') {
      state.writes.push({ table, row: { deleted: url.search }, method: 'DELETE' })
      const gone = /id=eq\.([0-9a-f-]+)/.exec(decodeURIComponent(url.search))?.[1]
      if (gone && state.rows[table]) state.rows[table] = state.rows[table].filter((r) => r.id !== gone)
      return r.fulfill({ status: 204, body: '' })
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    state.gets.push(table)
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = state.rows[table] ?? []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: cairo('12:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The 429 is this mock's own: the typed task's AI read is over today's allowance on purpose (parseFor).
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://127.0.0.1:9/") && !m.text().includes('status of 429') && errors.push(`console: ${m.text()}`))
  await page.goto(`${BASE}${route}`, { waitUntil })
  await sleep(900)
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const toastSoon = (page, text, ms = 5000) => until(async () => (await toasts(page)).some((t) => t.includes(text)), ms)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table).map((w) => w.row)
const drawer = (page) => page.locator('.kf-drawer')
async function openChat(page) {
  await page.keyboard.press('Control+j')
  await drawer(page).waitFor({ timeout: 6000 }).catch(() => {})
  await sleep(300)
}
async function ask(page, text) {
  const input = drawer(page).locator('form input')
  await input.fill(text)
  await input.press('Enter')
}
const card = (page) => drawer(page).locator('.kf-chat-card').last()
const cardText = async (page) => (await card(page).innerText().catch(() => '')).replace(/\n+/g, ' | ')
const bar = (page) => page.locator('#kf-capture-input')
async function capture(page, line) {
  if (!(await bar(page).isVisible().catch(() => false))) await page.keyboard.press('Control+k')
  await bar(page).waitFor({ timeout: 5000 })
  await bar(page).fill(line)
  await sleep(250)
  await bar(page).press('Enter')
  await sleep(600)
}

// ── G: Kai's gym request ──
if (want('g')) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open({ theme })
    await openChat(page)
    await ask(page, GYM_ASK)
    check(`g ${theme} a card arrives`, await until(async () => (await card(page).count()) === 1))
    const body = state.fn.find((f) => f.name === 'chat')?.body
    check(`g ${theme} the request carries the words and the 12-hour clock`, body?.messages.at(-1).content === GYM_ASK && body?.hour24 === false, JSON.stringify(body?.hour24))
    check(`g ${theme} the server's tool-call rounds: a read, then propose`, JSON.stringify(state.rounds) === JSON.stringify(['calendar', 'propose']), JSON.stringify(state.rounds))
    const head = (await card(page).locator('.kf-chat-card-head').innerText().catch(() => '')).trim()
    const lines = (await card(page).locator('.kf-chat-card-lines li').allInnerTexts()).map((l) => l.trim())
    check(`g ${theme} the card says what WILL happen: "Add 3 events"`, head === 'Add 3 events', head)
    check(
      `g ${theme} each session on its own day and time, in Kai's order (no swap)`,
      JSON.stringify(lines) === JSON.stringify(['Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7)', 'Wed 28 Oct · 5:45–7:00 PM · Gym · HQ (Session 2, ID 10)', 'Tue 27 Oct · 5:45–7:00 PM · Gym · West (Session 3, ID 18)']),
      JSON.stringify(lines),
    )
    const buttons = (await card(page).locator('button').allInnerTexts()).map((b) => b.trim())
    check(`g ${theme} Confirm · Edit · Cancel`, JSON.stringify(buttons) === JSON.stringify(['Confirm', 'Edit', 'Cancel']), JSON.stringify(buttons))
    check(`g ${theme} nothing written before Confirm`, state.runs.length === 0 && state.rows.calendar_events.length === 0)
    const all = await drawer(page).innerText()
    check(`g ${theme} no raw pipes, no stray ↗ chips, no "I've added"`, !all.includes('|') && !all.includes('↗') && !/I've added/i.test(all))
    await shot(page, `g1-${theme}-card`)
    if (theme === 'night') {
      await ctx.close()
      continue
    }
    const getsBefore = state.gets.length
    await card(page).getByRole('button', { name: 'Confirm' }).click()
    check('g Confirm runs exactly the 3 planned calls, once', await until(() => state.runs.length === 1 && state.runs[0].length === 3 && state.runs[0].every((c) => c.tool === 'add_event')), JSON.stringify(state.runs.map((r) => r.length)))
    const ev = state.rows.calendar_events
    check(
      'g 3 event writes at the right instants (Mon 07:00–08:15, Wed 17:45–19:00, Tue 17:45–19:00 Cairo)',
      ev.length === 3 &&
        ev[0].starts_at === iso('07:00', 26) && ev[0].ends_at === iso('08:15', 26) &&
        ev[1].starts_at === iso('17:45', 28) && ev[1].ends_at === iso('19:00', 28) &&
        ev[2].starts_at === iso('17:45', 27) && ev[2].ends_at === iso('19:00', 27),
      JSON.stringify(ev.map((e) => [e.title, e.starts_at])),
    )
    check('g the honest summary: "Done — all 3", each line what the tool said', await until(async () => (await cardText(page)).startsWith('Done — all 3')), await cardText(page))
    const done = (await card(page).locator('.kf-chat-card-lines li').allInnerTexts()).map((l) => l.trim())
    check('g …"Added event · Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7)" first', done[0] === 'Added event · Mon 26 Oct · 7:00–8:15 AM · Gym · HC (Session 1, ID 7)' && done.length === 3, JSON.stringify(done))
    check('g a toast "Done — all 3" with Undo', await toastSoon(page, 'Done — all 3'), JSON.stringify(await toasts(page)))
    check('g the calendar reads the server again after the run', await until(() => state.gets.slice(getsBefore).includes('calendar_events')))
    const kept = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').at(-1)?.content ?? '', `kf.chat.${UID}`)
    check('g what the model reads back next time: what the app really did', kept.startsWith('The user confirmed. What the app did:') && kept.includes('Added event · Mon 26 Oct'), kept.slice(0, 80))
    await shot(page, 'g2-day-done')
    const made = ev.map((e) => e.id)
    await card(page).getByRole('button', { name: 'Undo' }).click()
    check('g Undo removes the three events it made, through the outbox (no second run)', await until(() => made.every((id) => !state.rows.calendar_events.some((e) => e.id === id))) && state.runs.length === 1, JSON.stringify(state.rows.calendar_events.map((e) => e.title)))
    check('g …and the card shows the batch undone', await until(async () => (await cardText(page)).startsWith('Undone — back as it was')), await cardText(page))
    // Cancel and Edit on a fresh plan: nothing runs.
    await ask(page, GYM_ASK)
    await until(async () => (await card(page).locator('button', { hasText: 'Cancel' }).count()) === 1)
    await card(page).getByRole('button', { name: 'Cancel' }).click()
    check('g Cancel: nothing runs, "Cancelled — nothing changed."', state.runs.length === 1 && (await cardText(page)).includes('Cancelled — nothing changed.'), await cardText(page))
    await ask(page, GYM_ASK)
    await until(async () => (await card(page).locator('button', { hasText: 'Edit' }).count()) === 1)
    await card(page).getByRole('button', { name: 'Edit' }).click()
    const ph = await drawer(page).locator('form input').getAttribute('placeholder')
    check('g Edit: not done, the field asks what should change', state.runs.length === 1 && ph === 'What should change?' && (await cardText(page)).includes('Not done — tell me what to change.'), ph)
    check('g no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }
  // The phone draws the same card.
  const { ctx, page } = await open({ view: PHONE })
  await openChat(page)
  check('g phone: the chat opens', (await drawer(page).count()) === 1)
  await ask(page, GYM_ASK)
  check('g phone: the same card', await until(async () => (await card(page).count()) === 1))
  check('g phone: it fits 390px (no horizontal scroll)', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390)
  await shot(page, 'g3-phone-card')
  await ctx.close()
}

// ── U: one Undo for the whole batch — an edit and a move too ──
if (want('u')) {
  const { ctx, page, errors, state } = await open()
  const dentistBefore = structuredClone(state.rows.tasks.find((x) => x.id === DENTIST))
  await openChat(page)
  await ask(page, 'Push the dentist to Friday 4pm, file it under Forecasting, and add a swim Thursday 6pm')
  await until(async () => (await card(page).count()) === 1)
  await card(page).getByRole('button', { name: 'Confirm' }).click()
  const moved = await until(() => state.rows.tasks.find((x) => x.id === DENTIST)?.project_id === P_FC)
  check('u the batch ran: the dentist moved to Fri 16:00 and into Forecasting App, a swim added', moved && state.rows.tasks.find((x) => x.id === DENTIST).due_at === iso('16:00', 30) && state.rows.calendar_events.some((e) => e.title === 'Swim'))
  check('u Done — all 3, with Undo', await until(async () => (await cardText(page)).startsWith('Done — all 3')) && (await card(page).getByRole('button', { name: 'Undo' }).count()) === 1, await cardText(page))
  const w = state.writes.length
  await card(page).getByRole('button', { name: 'Undo' }).click()
  const back = await until(() => posts(state, 'tasks', w).some((r) => r.id === DENTIST))
  const sent = posts(state, 'tasks', w).find((r) => r.id === DENTIST)
  check('u Undo writes the dentist back exactly as it was (due Mon 16:00, no project) through the outbox', back && sent.due_at === dentistBefore.due_at && sent.project_id === null && sent.title === 'Dentist', JSON.stringify(sent && [sent.due_at, sent.project_id]))
  check('u …and removes the swim it made', await until(() => !state.rows.calendar_events.some((e) => e.title === 'Swim')))
  check('u one Undo, no second run of tools', state.runs.length === 1)
  check('u the card shows the batch undone', await until(async () => (await cardText(page)).startsWith('Undone — back as it was')), await cardText(page))
  const kept = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').at(-1)?.content ?? '', `kf.chat.${UID}`)
  check('u what the model reads back: done, then undone', kept.startsWith('What the app did, then the user undid:'), kept.slice(0, 60))
  await shot(page, 'u1-day-undone')
  check('u no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── F: a failed tool, honestly ──
if (want('f')) {
  const { ctx, page, errors, state } = await open()
  state.dentistGone = true
  await openChat(page)
  await ask(page, 'Move the dentist to Friday 4pm and add a swim Thursday 6pm')
  await until(async () => (await card(page).count()) === 1)
  const lines = (await card(page).locator('.kf-chat-card-lines li').allInnerTexts()).map((l) => l.trim())
  check('f the card names each step with its verb', (await card(page).locator('.kf-chat-card-head').innerText()).trim() === '2 changes' && lines[0] === 'Move · due Fri 30 Oct 4:00 PM · Dentist' && lines[1] === 'Add event · Thu 29 Oct · 6:00–6:30 PM · Swim', JSON.stringify(lines))
  await card(page).getByRole('button', { name: 'Confirm' }).click()
  check('f the report says 1 of 2 done', await until(async () => (await cardText(page)).startsWith('1 of 2 done')), await cardText(page))
  const refused = (await card(page).locator('li.is-refused').allInnerTexts()).map((l) => l.trim())
  check('f …and names the refusal word for word', refused.length === 1 && refused[0] === `Couldn't move “Dentist”: No task with id ${DENTIST} (it may have been deleted). Use list_tasks or search to find it.`, JSON.stringify(refused))
  check('f …while the swim really was added', state.rows.calendar_events.length === 1 && state.rows.calendar_events[0].title === 'Swim')
  await shot(page, 'f1-day-refused')
  await ask(page, 'Add a meeting with Omar from 3 to 2')
  const said = drawer(page).getByText('I couldn\'t set that up', { exact: false })
  check('f a plan the tools refused is said in words — no card, nothing run', await until(async () => (await said.count()) === 1) && (await drawer(page).locator('.kf-chat-card').count()) === 1 && state.runs.length === 1)
  check('f no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── M: markdown, not pipes ──
if (want('m')) {
  const { ctx, page, errors } = await open()
  await openChat(page)
  await ask(page, "What's on this week?")
  const table = drawer(page).locator('.kf-md table')
  check('m the answer\'s table is a real table', await until(async () => (await table.count()) === 1))
  check('m two rows, bold kept as bold, no raw pipes', (await table.locator('tbody tr').count()) === 2 && (await table.locator('strong', { hasText: 'Dentist' }).count()) === 1 && !(await drawer(page).innerText()).includes('|'))
  await shot(page, 'm1-day-table')
  check('m no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── A: "File captures for me" ──
if (want('a')) {
  const { ctx, page, errors, state } = await open()
  check('a an existing user is told once: "Captures now wait in your Inbox"', await toastSoon(page, 'Captures now wait in your Inbox', 6000), JSON.stringify(await toasts(page)))
  check('a …and it is remembered (help_seen notice:autofile)', await until(() => posts(state, 'app_settings').some((r) => r.help_seen?.includes('notice:autofile'))))
  await shot(page, 'a0-day-notice')
  let w = state.writes.length
  await capture(page, 'ring mum back about the party')
  check('a off (the default): a confident capture waits in the Inbox with the AI read', await until(() => posts(state, 'inbox_items', w).some((i) => i.status === 'pending' && i.ai_parse?.title === 'Call mum about Sunday' && i.confidence === 0.95)))
  check('a …no task made by itself', !posts(state, 'tasks', w).length, JSON.stringify(posts(state, 'tasks', w).map((t) => t.title)))
  w = state.writes.length
  await capture(page, 'Call the plumber tomorrow 3pm #forecasting')
  const held = await until(() => posts(state, 'inbox_items', w).find((i) => i.ai_parse?.source === 'typed'))
  const heldRow = posts(state, 'inbox_items', w).find((i) => i.ai_parse?.source === 'typed')
  check('a off: a ⌘K line with a date and #project waits in the Inbox too, its tokens the suggestion', held && heldRow.ai_parse.due_at === iso('15:00', 26) && heldRow.ai_parse.has_time === true && heldRow.ai_parse.project_id === P_FC && !posts(state, 'tasks', w).length, JSON.stringify(heldRow?.ai_parse))
  check('a …said so: "Added to Inbox · Tomorrow · 3:00 PM · Forecasting…"', await toastSoon(page, 'Added to Inbox ·'), JSON.stringify(await toasts(page)))
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
  await sleep(800)
  const heldCard = page.locator(`[id="inbox-${heldRow?.id}"]`)
  await shot(page, 'a2-day-held-card')
  check('a the Inbox card offers it ready to file (date + project)', /Forecasting App/.test(await heldCard.innerText().catch(() => '')), (await heldCard.innerText().catch(() => '')).replace(/\n/g, ' | '))
  w = state.writes.length
  await heldCard.getByRole('button', { name: /File as task/ }).first().click()
  const filed = await until(() => posts(state, 'tasks', w).find((t) => t.title === 'Call the plumber'))
  const filedRow = posts(state, 'tasks', w).find((t) => t.title === 'Call the plumber')
  check('a one tap files it: tomorrow 15:00, in Forecasting App', filed && filedRow.due_at === iso('15:00', 26) && filedRow.project_id === P_FC, JSON.stringify(filedRow && [filedRow.due_at, filedRow.project_id]))
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(700)
  w = state.writes.length
  await page.locator('.td-pill-field').first().click()
  await bar(page).waitFor({ timeout: 5000 })
  await bar(page).fill('Water the ferns tomorrow 9am')
  await sleep(250)
  await bar(page).press('Enter')
  const ferns = await until(() => posts(state, 'tasks', w).some((t) => t.title === 'Water the ferns'))
  check("a Today's \"Add a task…\" row is a task field: the task at once, nothing held", ferns && !posts(state, 'inbox_items', w).some((i) => /ferns/.test(i.raw_text ?? '')), JSON.stringify([posts(state, 'tasks', w).map((t) => t.title), posts(state, 'inbox_items', w).map((i) => [i.raw_text, i.status])]))
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await sleep(700)
  const sw = page.getByRole('switch', { name: 'File captures for me' })
  await sw.scrollIntoViewIfNeeded()
  check('a Settings → Capture & AI: the switch reads off', (await sw.getAttribute('aria-checked')) === 'false')
  await shot(page, 'a1-day-settings')
  w = state.writes.length
  await sw.click()
  check('a turning it on writes auto_file_captures: true (synced row)', await until(() => posts(state, 'app_settings', w).some((r) => r.auto_file_captures === true)))
  await sleep(1500) // the query cache's persister writes on a throttle; a reload sooner reads the old row
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(700)
  w = state.writes.length
  await capture(page, 'email the landlord about the boiler')
  check('a on: the AI files it as a task', await until(() => posts(state, 'tasks', w).some((t) => t.title === 'Email the landlord about the boiler')))
  check('a …the capture marked filed, "✦ Filed by AI" with Undo', await until(() => posts(state, 'inbox_items', w).some((i) => i.status === 'filed')) && (await toastSoon(page, 'Filed by AI')))
  check('a the notice is not shown twice', (await toasts(page)).every((t) => !t.includes('Captures now wait')))
  check('a no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── R: the double-task race (Kai's log 2026-10-23 16:20 — one capture, two tasks) ──
if (want('r')) {
  // A capture sent with the key while "File captures for me" is on: queued for the AI on this device.
  const RENEW = '30000000-0000-4000-8000-0000000000r1'.replace('r1', 'a1')
  const queued = { id: RENEW, user_id: UID, kind: 'text', raw_text: 'renew hosting', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: { source: 'capture', needs_parse: true }, snoozed_until: null, deleted_at: null, created_at: iso('11:00'), updated_at: iso('11:00') }
  const { ctx, page, errors, state } = await open({ route: '/inbox', settings: { auto_file_captures: true, help_seen: [...SETTINGS.help_seen, 'notice:autofile'] }, inbox: [queued], waitUntil: 'domcontentloaded' })
  check('r the AI read is out (claimed on the server, parsing)', await until(() => state.fn.some((f) => f.name === 'parse-capture')))
  const row = page.locator(`[id="inbox-${RENEW}"]`)
  await row.waitFor({ timeout: 8000 })
  check('r …and the capture is still waiting in the Inbox', state.rows.inbox_items.find((i) => i.id === RENEW)?.status === 'pending')
  await row.getByRole('button', { name: /^File/ }).first().click()
  const byHand = await until(() => posts(state, 'tasks').length === 1)
  await until(() => state.fn.filter((f) => f.name === 'parse-capture').length >= 1, 1000)
  await sleep(9000) // the read lands
  const tasks = posts(state, 'tasks')
  check('r filed by hand while the read was out → exactly ONE task', byHand && new Set(tasks.map((x) => x.id)).size === 1, JSON.stringify(tasks.map((x) => x.title)))
  check('r …no capture.autofiled, and the capture stays filed', !posts(state, 'activity_log').some((a) => a.event_type === 'capture.autofiled') && state.rows.inbox_items.find((i) => i.id === RENEW)?.status === 'filed', JSON.stringify(posts(state, 'activity_log').map((a) => a.event_type)))
  await shot(page, 'r1-day-filed-once')
  check('r no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ── P: the project chip ──
if (want('p')) {
  const { ctx, page, errors, state } = await open({ settings: { help_seen: [...SETTINGS.help_seen, 'notice:autofile'] } })
  // Tasks come in through Today's "Add a task…" row: a task field (⌘K would hold them in the Inbox, auto-filing off).
  const addTask = async (line) => {
    await page.locator('.td-pill-field').first().click()
    await bar(page).waitFor({ timeout: 5000 })
    await bar(page).fill(line)
    await sleep(250)
    await bar(page).press('Enter')
    await sleep(600)
  }
  let w = state.writes.length
  await addTask('Forecast chart tooltip tomorrow')
  const made = posts(state, 'tasks', w).find((t) => t.title === 'Forecast chart tooltip')
  check('p a typed task with no project lands where typed (no project)', !!made && made.project_id === null, JSON.stringify(made && [made.title, made.project_id]))
  const chip = page.locator('.kf-toast', { hasText: '→ Forecasting App?' })
  check('p a quiet chip "→ Forecasting App?" offers its likely project', await until(async () => (await chip.count()) === 1), JSON.stringify(await toasts(page)))
  await shot(page, 'p1-day-chip')
  w = state.writes.length
  await chip.getByRole('button', { name: 'Apply' }).click()
  check('p one tap puts it there', await until(() => posts(state, 'tasks', w).some((t) => t.id === made?.id && t.project_id === P_FC)))
  check('p …with "→ Forecasting App" and Undo', await toastSoon(page, '→ Forecasting App'))
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await sleep(700)
  const assign = page.getByRole('group', { name: 'Pick a project for new things' }).getByRole('button', { name: 'Assign' })
  await assign.scrollIntoViewIfNeeded()
  w = state.writes.length
  await assign.click()
  check('p Settings: "Assign" writes auto_project: assign', await until(() => posts(state, 'app_settings', w).some((r) => r.auto_project === 'assign')))
  await sleep(1500) // the query cache's persister writes on a throttle; a reload sooner reads the old row
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  await sleep(700)
  w = state.writes.length
  await addTask('Forecasting app: release notes tomorrow')
  const second = await until(() => posts(state, 'tasks', w).some((t) => t.project_id === P_FC))
  check('p assign: a sure match is put there by itself', second, JSON.stringify(posts(state, 'tasks', w).map((t) => [t.title, t.project_id])))
  const undoBtn = page.locator('.kf-toast', { hasText: '→ Forecasting App' }).getByRole('button', { name: 'Undo' })
  check('p …with Undo', (await undoBtn.count()) === 1)
  w = state.writes.length
  await undoBtn.click()
  check('p Undo takes it out again (and remembers "not there")', await until(() => posts(state, 'tasks', w).some((t) => t.project_id === null)) && (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kf.autoProject.not') ?? '{}')).length)) === 1)
  check('p no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
