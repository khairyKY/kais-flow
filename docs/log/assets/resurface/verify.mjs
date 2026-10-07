// "From a while ago" settles (Kai 2026-10-07: "if I press Later… it's just a loop of snoozing") on
// the REAL /today page, signed in against a MOCKED backend — the plan-replan recipe
// (docs/log/assets/plan-replan/verify.mjs): the dev server runs with VITE_SUPABASE_URL=
// http://127.0.0.1:9 (nothing listens there), a made-up session sits in localStorage, and
// Playwright answers every REST call from the scene's rows. Writes are kept in memory (a refetch
// sees them) and checked. Clock: Wed 7 Oct 2026, 10:00 Cairo. What's new and the tour are seeded
// as seen so neither overlays the shots.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5277'
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
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const P_SITE = 'p0000000-0000-4000-8000-000000000001'
const NOTE = 'i0000000-0000-4000-8000-000000000001'
const PICK = 'z0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: DAY0, updated_at: DAY0, ...over,
})
const OLD = 1, MILK = 2
const OLD_AT = iso('09:00', 16, 8) // 16 Sep — 3 weeks ago, never touched since
const SETTINGS = { user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const pick = (entity_type, entity_id, over = {}) => ({ id: PICK, user_id: UID, entity_type, entity_id, shown_on: '2026-10-07', action: 'pending', created_at: iso('06:30'), ...over })

/** Scenes: what resurfaced today, and whether the server has migration 0059 (rows carry snoozed_until). */
function tables({ entity = 'task', putOffs = 0, v59 = false, none = false } = {}) {
  const col = v59 ? { snoozed_until: null } : {}
  const earlier = Array.from({ length: putOffs }, (_, i) => ({
    id: `z0000000-0000-4000-8000-00000000010${i}`, user_id: UID, entity_type: 'task', entity_id: id(OLD), shown_on: ['2026-09-20', '2026-09-03'][i], action: 'review_later', created_at: DAY0, ...col,
  }))
  return {
    app_settings: [{ ...SETTINGS }],
    projects: [{ id: P_SITE, user_id: UID, domain_id: null, name: 'Shaheen website', type: 'standard', status: 'active', color: null, milestones: [], checklist: [], created_at: DAY0, updated_at: DAY0 }],
    routines: [], routine_completions: [], journal_entries: [], time_entries: [], activity_log: [],
    tasks: [
      task(OLD, 'Redesign the pricing page', { project_id: P_SITE, priority: 2, created_at: OLD_AT, updated_at: OLD_AT }),
      task(MILK, 'Buy milk', { duration_min: 15, due_at: iso('09:00') }),
    ],
    inbox_items: [
      { id: NOTE, user_id: UID, kind: 'text', raw_text: 'idea: a monthly letter to future Kai', transcript: null, ai_parse: null, confidence: null, status: 'pending', filed_task_id: null, payload: null, snoozed_until: null, deleted_at: null, created_at: iso('20:00', 1, 8), updated_at: iso('20:00', 1, 8) },
    ],
    resurfaced_log: none ? [] : [entity === 'task' ? pick('task', id(OLD), col) : pick('inbox_item', NOTE, col), ...earlier],
  }
}
function filterRows(rows, url) {
  const f = url.searchParams.get('event_type')
  if (!f) return rows
  const w = f.startsWith('eq.') ? [f.slice(3)] : f.startsWith('in.(') ? f.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')) : null
  return w ? rows.filter((r) => w.includes(r.event_type)) : rows
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 800 } }

async function open(theme, view, scene = {}, route = '/today') {
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:swipe', 'hint:calendar', 'hint:inbox']))
    localStorage.setItem('kf.today.more-open', '1')
  }, [theme, JSON.stringify(session), UID])
  const state = { rows: tables(scene), writes: [] }
  let seq = 0
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
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
    if (req.method() === 'DELETE') return r.fulfill({ status: 204, body: '' })
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
  // The realtime socket to the mock origin can't connect (nothing listens on :9) — that's the harness, not the app.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith("WebSocket connection to 'ws://127.0.0.1:9/") && errors.push(`console: ${m.text()}`))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(800)
  const cdp = view.hasTouch ? await ctx.newCDPSession(page) : null
  return { ctx, page, cdp, errors, state }
}

const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
async function tap(cdp, loc) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(150)
  const b = await loc.boundingBox()
  await touch(cdp, 'touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }])
  await sleep(40)
  await touch(cdp, 'touchEnd', [])
  await sleep(400)
}
const press = (cdp, loc) => (cdp ? tap(cdp, loc) : loc.click())
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const card = (page) => page.locator('[data-resurface]')
const btn = (page, a) => card(page).locator(`[data-action="${a}"]`)
const buttons = async (page) => (await card(page).locator('[data-action]').allInnerTexts()).map((t) => t.trim())
const toasts = (page) => page.locator('.kf-toast-msg').allInnerTexts()
const undo = (page) => page.locator('.kf-toast-act', { hasText: 'Undo' }).last()
const lastWrite = (state, table, rowId) => state.writes.filter((w) => w.table === table && w.row.id === rowId).at(-1)?.row
const logged = (state, type) => state.writes.some((w) => w.table === 'activity_log' && w.row.event_type === type)
const sectionShown = (page) => page.getByText('From a while ago', { exact: false }).count().then((n) => n > 0)
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
/** Presses an action, waits for the card's exit + the pick's mark, then Undo brings it back. */
async function settles(name, ctx, action, mark, verify, { toast, event }) {
  const { page, cdp, state } = ctx
  await press(cdp, btn(page, action))
  const marked = await until(() => lastWrite(state, 'resurfaced_log', PICK)?.action === mark)
  check(`${name} ${action} → pick marked ${mark}`, marked, JSON.stringify(lastWrite(state, 'resurfaced_log', PICK)?.action))
  check(`${name} ${action} → ${verify.label}`, await until(() => verify.ok(state)))
  check(`${name} ${action} → logged ${event}`, await until(() => logged(state, event)))
  check(`${name} ${action} → card gone, section hidden`, await until(async () => (await card(page).count()) === 0 && !(await sectionShown(page))))
  check(`${name} ${action} → toast "${toast}" with Undo`, (await toasts(page)).includes(toast), JSON.stringify(await toasts(page)))
  await press(cdp, undo(page))
  check(`${name} ${action} Undo → pick pending again`, await until(() => lastWrite(state, 'resurfaced_log', PICK)?.action === 'pending'))
  if (verify.undone) check(`${name} ${action} Undo → ${verify.undoneLabel}`, await until(() => verify.undone(state)))
  check(`${name} ${action} Undo → card back`, await until(async () => (await card(page).count()) === 1))
  await noToast(page)
}

for (const [label, view, width] of [['phone', PHONE, 390], ['desk', DESKTOP, 1280]]) {
  for (const theme of ['day', 'night']) {
    const name = `${label}-${theme}`
    if (!want(label) && !want(name)) continue

    // ── a task: the meta line, the explanation, the buttons, tap-to-open ──
    {
      const s = await open(theme, view)
      const { page, cdp, errors } = s
      await card(page).waitFor({ timeout: 8000 }).catch(() => {})
      await card(page).scrollIntoViewIfNeeded().catch(() => {})
      const meta = (await card(page).locator('.kf-resurface-meta span').first().innerText().catch(() => '')).trim()
      check(`${name} task meta line`, meta === 'Task · Shaheen website · added 3 weeks ago, untouched', meta)
      check(`${name} task buttons: Plan… · Done · Let it go · Not now · back in 5 days`, JSON.stringify(await buttons(page)) === JSON.stringify(['Plan…', 'Done', 'Let it go', 'Not now · back in 5 days']), JSON.stringify(await buttons(page)))
      await press(cdp, card(page).getByRole('button', { name: 'What is this?' }))
      const why = await card(page).locator('.kf-resurface-why').innerText().catch(() => '')
      check(`${name} ? explains: saved a while ago, keep / plan / let go`, /Something you saved a while ago\. Keep it, plan it, or let it go\./.test(why), why)
      await shot(page, `${name}-task`)
      await basics(page, `${name} task`, errors, width)
      await press(cdp, card(page).locator('.kf-resurface-open'))
      await sleep(600)
      const url = new URL(page.url())
      if (label === 'phone') {
        check(`${name} tap the quote → the task sheet over Today`, url.pathname === '/today' && url.searchParams.get('task') === id(OLD), url.pathname + url.search)
        await shot(page, `${name}-task-open`)
      } else {
        check(`${name} click the quote → the task editor`, url.pathname === `/tasks/${id(OLD)}`, url.pathname)
      }
      await s.ctx.close()
    }

    // ── a task: Done / Let it go / Not now, each with its writes and Undo (before 0059 is pushed) ──
    {
      const s = await open(theme, view)
      await card(s.page).waitFor({ timeout: 8000 }).catch(() => {})
      await settles(`${name} pre-0059`, s, 'done', 'converted', {
        label: 'task completed', ok: (st) => lastWrite(st, 'tasks', id(OLD))?.status === 'done',
        undoneLabel: 'task open again', undone: (st) => lastWrite(st, 'tasks', id(OLD))?.status === 'todo',
      }, { toast: 'Done', event: 'resurfaced.done' })
      await settles(`${name} pre-0059`, s, 'letgo', 'dismissed', {
        label: 'task in Trash', ok: (st) => !!lastWrite(st, 'tasks', id(OLD))?.deleted_at,
        undoneLabel: 'task restored', undone: (st) => lastWrite(st, 'tasks', id(OLD))?.deleted_at === null,
      }, { toast: 'Moved to Trash', event: 'resurfaced.dismissed' })
      await settles(`${name} pre-0059`, s, 'notnow', 'review_later', {
        label: 'no snoozed_until sent (column not there yet), snooze on this device',
        ok: async (st) => !('snoozed_until' in lastWrite(st, 'resurfaced_log', PICK)) && (await s.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kf.resurfaceSnoozes') ?? '{}')))).length === 1,
        undoneLabel: 'device snooze cleared', undone: async () => (await s.page.evaluate(() => localStorage.getItem('kf.resurfaceSnoozes'))) === '{}',
      }, { toast: 'Back in 5 days', event: 'resurfaced.review_later' })
      check(`${name} pre-0059 no page or console errors`, s.errors.length === 0, s.errors.slice(0, 3).join(' | '))
      await s.ctx.close()
    }

    // ── 0059 on the server: Not now writes snoozed_until, Done writes 'done' ──
    {
      const s = await open(theme, view, { v59: true })
      await card(s.page).waitFor({ timeout: 8000 }).catch(() => {})
      await settles(`${name} 0059`, s, 'notnow', 'review_later', {
        label: 'snoozed_until ≈ now + 5 days on the row', ok: (st) => {
          const u = lastWrite(st, 'resurfaced_log', PICK)?.snoozed_until
          return !!u && Math.abs(Date.parse(u) - (cairo('10:00').getTime() + 5 * 86_400_000)) < 3_600_000
        },
        undoneLabel: 'snoozed_until null again', undone: (st) => lastWrite(st, 'resurfaced_log', PICK)?.snoozed_until === null,
      }, { toast: 'Back in 5 days', event: 'resurfaced.review_later' })
      await settles(`${name} 0059`, s, 'done', 'done', { label: 'task completed', ok: (st) => lastWrite(st, 'tasks', id(OLD))?.status === 'done' }, { toast: 'Done', event: 'resurfaced.done' })
      await s.ctx.close()
    }

    // ── Plan… → the shared Plan list → Tomorrow ──
    {
      const s = await open(theme, view)
      const { page, cdp, state } = s
      await card(page).waitFor({ timeout: 8000 }).catch(() => {})
      await press(cdp, btn(page, 'plan'))
      await sleep(500)
      const scope = label === 'phone' ? page.locator('[role="dialog"]').last() : page.locator('.kf-pk-pop').last()
      const opts = (await scope.locator('.kf-as-row').allInnerTexts()).map((t) => t.split('\n')[0].trim())
      check(`${name} Plan… opens the shared Plan list (Today · Next free slot · Tomorrow …)`, opts.some((o) => /^Tomorrow/.test(o)) && opts.some((o) => /Next free slot/.test(o)), JSON.stringify(opts))
      await shot(page, `${name}-plan`)
      await press(cdp, scope.locator('.kf-as-row', { hasText: 'Tomorrow' }).first())
      check(`${name} Plan → Tomorrow: task due tomorrow`, await until(() => (lastWrite(state, 'tasks', id(OLD))?.due_at ?? '').startsWith('2026-10-08')), lastWrite(state, 'tasks', id(OLD))?.due_at)
      check(`${name} Plan → pick marked converted, logged resurfaced.planned`, await until(() => lastWrite(state, 'resurfaced_log', PICK)?.action === 'converted' && logged(state, 'resurfaced.planned')))
      check(`${name} Plan → one toast "Moved to tomorrow"`, await until(async () => JSON.stringify(await toasts(page)) === JSON.stringify(['Moved to tomorrow'])), JSON.stringify(await toasts(page)))
      check(`${name} Plan → card gone`, await until(async () => (await card(page).count()) === 0))
      await press(cdp, undo(page))
      check(`${name} Plan Undo → no date again, pick pending, card back`, await until(async () => lastWrite(state, 'tasks', id(OLD))?.due_at === null && lastWrite(state, 'resurfaced_log', PICK)?.action === 'pending' && (await card(page).count()) === 1))
      check(`${name} Plan no page or console errors`, s.errors.length === 0, s.errors.slice(0, 3).join(' | '))
      await s.ctx.close()
    }

    // ── put off twice: asks once, Keep or Let it go, no snooze ──
    {
      const s = await open(theme, view, { putOffs: 2 })
      const { page, errors } = s
      await card(page).waitFor({ timeout: 8000 }).catch(() => {})
      await card(page).scrollIntoViewIfNeeded().catch(() => {})
      const ask = await card(page).locator('.kf-resurface-ask').innerText().catch(() => '')
      check(`${name} twice put off: asks "keep it or let it go?"`, ask.trim() === "You've put this off twice — keep it or let it go?", ask)
      check(`${name} twice put off: Keep · Plan… and Let it go only`, JSON.stringify(await buttons(page)) === JSON.stringify(['Keep · Plan…', 'Let it go']), JSON.stringify(await buttons(page)))
      await shot(page, `${name}-twice`)
      await basics(page, `${name} twice`, errors, width)
      await s.ctx.close()
    }

    // ── an inbox note: meta, open, Make it a task, Let it go ──
    {
      const s = await open(theme, view, { entity: 'note' })
      const { page, cdp, errors, state } = s
      await card(page).waitFor({ timeout: 8000 }).catch(() => {})
      await card(page).scrollIntoViewIfNeeded().catch(() => {})
      const meta = (await card(page).locator('.kf-resurface-meta span').first().innerText().catch(() => '')).trim()
      check(`${name} note meta line`, meta === 'Inbox note · captured 5 weeks ago', meta)
      check(`${name} note buttons: Make it a task · Let it go · Not now`, JSON.stringify(await buttons(page)) === JSON.stringify(['Make it a task', 'Let it go', 'Not now · back in 5 days']), JSON.stringify(await buttons(page)))
      await shot(page, `${name}-note`)
      await basics(page, `${name} note`, errors, width)
      await settles(`${name} note`, s, 'convert', 'converted', {
        label: 'a task made, the note filed', ok: (st) => lastWrite(st, 'inbox_items', NOTE)?.status === 'filed' && st.writes.some((w) => w.table === 'tasks' && w.row.title === 'idea: a monthly letter to future Kai'),
        undoneLabel: 'note waiting again', undone: (st) => lastWrite(st, 'inbox_items', NOTE)?.status === 'pending',
      }, { toast: 'Made it a task', event: 'resurfaced.converted' })
      await settles(`${name} note`, s, 'letgo', 'dismissed', {
        label: 'note dismissed', ok: (st) => lastWrite(st, 'inbox_items', NOTE)?.status === 'dismissed',
        undoneLabel: 'note waiting again', undone: (st) => lastWrite(st, 'inbox_items', NOTE)?.status === 'pending',
      }, { toast: 'Let go', event: 'resurfaced.dismissed' })
      await press(cdp, card(page).locator('.kf-resurface-open'))
      await sleep(600)
      const url = new URL(page.url())
      check(`${name} tap the note → the Inbox, focused on it`, url.pathname === '/inbox' && url.searchParams.get('focus') === NOTE, url.pathname + url.search)
      check(`${name} note no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
      await s.ctx.close()
    }

    // ── nothing resurfaced: the section hides ──
    {
      const s = await open(theme, view, { none: true })
      await s.page.getByText('Buy milk').first().waitFor({ timeout: 8000 }).catch(() => {})
      check(`${name} nothing resurfaced → no "From a while ago"`, !(await sectionShown(s.page)) && (await card(s.page).count()) === 0)
      await s.ctx.close()
    }
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
