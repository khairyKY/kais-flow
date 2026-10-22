// Snooze (Kai 2026-10-17, "build snooze") on the REAL app against a MOCKED backend — the undo-verbs recipe:
// dev server with VITE_SUPABASE_URL=http://127.0.0.1:9 (`--mode mock`), a made-up session, Playwright answers
// every REST call; writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=s,u,k,b,p,o,n runs a subset)
// The day: Saturday 17 Oct 2026, Cairo (UTC+3), the clock at 10:00. Times read in the 12h default
// (cal-polish 2026-10-22: one clock for every time the app shows — the toasts said 24h before).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5293'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
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

const cairo = (hhmm, day = 17) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const tid = (n) => `f1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: tid(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, remind_again_at: null, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const BANK = 1, BASIL = 2, FERNS = 3, OMAR = 4, DENTIST = 5
const TASKS = [
  task(BANK, 'Call the bank', { due_at: iso('09:00'), top3: true, top3_rank: 1, reminder_at: iso('09:45') }), // the goal of the day
  task(BASIL, 'Plant the basil', { due_at: iso('11:00') }),
  task(FERNS, 'Water the ferns', { due_at: iso('09:00', 18) }),
  // Snoozed until 09:00 this morning (it's 10:00): back by itself — top of Today, "Back from snooze", not in the overdue fold.
  task(OMAR, 'Reply to Omar', { due_at: iso('09:00', 16), snoozed_until: iso('09:00') }),
  // Snoozed until Tuesday: on no list, in Snoozed.
  task(DENTIST, 'Book the dentist', { due_at: iso('12:00'), snoozed_until: iso('09:00', 20) }),
]
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const tables = () => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: [], domains: [], areas: [], people: [], app_settings: [SETTINGS] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route, o = {}) {
  const ctx = await browser.newContext({ ...(o.phone ? phone : desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at]) => {
    localStorage.setItem('kf_theme', t); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['hint:inbox', 'hint:swipe', 'hint:calendar', 'hint:today', 'hint:tasks']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime()])
  const state = { rows: tables(), writes: [] }
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
    if (url.pathname.startsWith('/functions/')) return r.fulfill({ status: 503, json: { error: 'mock' } })
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
  return { ctx, page, errors, state }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
const toast = (page, msg) => page.locator('.kf-toast', { has: page.locator('.kf-toast-msg', { hasText: msg }) }).first()
const toastSoon = (page, msg) => toast(page, msg).waitFor({ timeout: 8000 }).then(() => true, () => false)
const undoToast = async (page, msg) => (await toastSoon(page, msg)) && (await toast(page, msg).getByRole('button', { name: 'Undo' }).count()) === 1
const pressUndo = async (page, msg) => {
  await toast(page, msg).getByRole('button', { name: 'Undo' }).click()
  await sleep(1200)
}
const row = (state, n) => state.rows.tasks.find((r) => r.id === tid(n))
const rowEl = (page, n) => page.locator(`[id="task-${tid(n)}"]`)
const shown = async (page, n) => (await rowEl(page, n).count()) > 0
/** Right-click a row, then click Snooze… (its submenu opens on click). */
async function snoozeMenu(page, n) {
  const el = rowEl(page, n).first()
  await el.scrollIntoViewIfNeeded()
  await sleep(200)
  await el.click({ button: 'right', position: { x: 60, y: 14 } })
  await sleep(300)
  await page.getByRole('menuitem', { name: 'Snooze…' }).last().click()
  await sleep(400)
}
const snoozePick = (page, label) => page.locator('.kf-overlay-card button', { hasText: label }).first().click()
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
/** Ids of the task rows on the page, in screen order. */
const order = (page) => page.$$eval('[id^="task-"]', (els) => els.map((e) => e.id.replace('task-', '')))

// ── S: snooze from the row menu → gone from the lists → Snoozed → Unsnooze. ──
for (const theme of want('s') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
  check(`s0 [${theme}] All lists the open tasks; the one snoozed till Tuesday isn't among them`, (await shown(page, BASIL)) && !(await shown(page, DENTIST)))
  await snoozeMenu(page, BASIL)
  const menuText = await page.locator('.kf-overlay-card', { hasText: 'Snooze until…' }).first().innerText().catch(() => '')
  check(`s1 [${theme}] right-click → Snooze… opens the Snooze menu (Later today · This evening · Tomorrow · Next week · Someday · Pick a date…)`, ['Later today', 'This evening', 'Tomorrow', 'Next week', 'Someday', 'Pick a date…'].every((l) => menuText.includes(l)), menuText.replace(/\n/g, ' | '))
  await shot(page, `s1-snooze-menu-${theme}`)
  await snoozePick(page, 'Later today')
  check(`s2 [${theme}] Later today: "Snoozed until 1:00 PM" with Undo`, await undoToast(page, 'Snoozed until 1:00 PM'))
  await settle(state)
  const until = row(state, BASIL)?.snoozed_until
  check(`s3 [${theme}] written: snoozed_until three hours on, the due date kept`, until && Math.abs(Date.parse(until) - cairo('13:00').getTime()) < 120_000 && row(state, BASIL).due_at === iso('11:00'), `${until} / ${row(state, BASIL)?.due_at}`)
  await sleep(800)
  check(`s4 [${theme}] gone from All`, !(await shown(page, BASIL)))
  const tab = page.getByRole('link', { name: /Snoozed/ })
  check(`s5 [${theme}] a Snoozed tab, counting two`, (await tab.count()) === 1 && /Snoozed\s*2/.test(await tab.innerText()), await tab.innerText().catch(() => '-'))
  await tab.click()
  await sleep(1200)
  const snoozedRows = (await order(page)).filter((id) => [tid(BASIL), tid(DENTIST)].includes(id))
  check(`s6 [${theme}] Snoozed lists them, soonest back first`, snoozedRows.join() === [tid(BASIL), tid(DENTIST)].join(), snoozedRows.join())
  const basilText = await rowEl(page, BASIL).innerText()
  check(`s7 [${theme}] each says when it's back`, /Snoozed · back 1:00 PM/.test(basilText) && /Snoozed · back Tue 20 Oct · 9:00 AM/.test(await rowEl(page, DENTIST).innerText()), basilText.replace(/\n/g, ' | '))
  await shot(page, `s7-snoozed-list-${theme}`)
  await rowEl(page, BASIL).getByRole('button', { name: 'Unsnooze' }).click()
  check(`s8 [${theme}] Unsnooze: "Unsnoozed" with Undo`, await undoToast(page, 'Unsnoozed'))
  await settle(state)
  check(`s9 [${theme}] written: snoozed_until cleared`, row(state, BASIL)?.snoozed_until === null, row(state, BASIL)?.snoozed_until)
  await page.goto(`${BASE}/tasks?list=all`, { waitUntil: 'networkidle' })
  await sleep(1200)
  check(`s10 [${theme}] back on All`, await shown(page, BASIL))
  check(`s11 [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── U: Undo, and the Top 3: a snoozed pick gives its place up; Undo gives it back. ──
if (want('u')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await snoozeMenu(page, BANK)
  await snoozePick(page, 'Tomorrow')
  check('u1 Tomorrow: "Snoozed until Tomorrow · 9:00 AM" with Undo', await undoToast(page, 'Snoozed until Tomorrow · 9:00 AM'))
  await settle(state)
  check('u2 written: until tomorrow 09:00; the goal let its Top 3 place go; the date and reminder kept', row(state, BANK).snoozed_until === iso('09:00', 18) && row(state, BANK).top3 === false && row(state, BANK).top3_rank === null && row(state, BANK).due_at === iso('09:00') && row(state, BANK).reminder_at === iso('09:45'), JSON.stringify({ s: row(state, BANK).snoozed_until, top3: row(state, BANK).top3 }))
  await pressUndo(page, 'Snoozed until Tomorrow · 9:00 AM')
  await settle(state)
  check('u3 Undo: not snoozed, back in the Top 3 as the goal', row(state, BANK).snoozed_until === null && row(state, BANK).top3 === true && row(state, BANK).top3_rank === 1, JSON.stringify({ s: row(state, BANK).snoozed_until, top3: row(state, BANK).top3, rank: row(state, BANK).top3_rank }))
  check('u4 …and on the list again', await shown(page, BANK))
  check('u5 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── K: the Z key on a focused row; ⌘Z takes it back. ──
if (want('k')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  await page.evaluate(() => document.activeElement?.blur())
  let focused = false
  for (let i = 0; i < 8 && !focused; i++) {
    await page.keyboard.press('j')
    await sleep(120)
    focused = (await page.evaluate(() => document.activeElement?.id)) === `task-${tid(FERNS)}`
  }
  check('k0 j walks to a row', focused)
  await page.keyboard.press('z')
  await sleep(500)
  check('k1 Z opens the Snooze menu under the row', (await page.locator('.kf-overlay-card', { hasText: 'Snooze until…' }).count()) > 0)
  await snoozePick(page, 'Next week')
  check('k2 Next week: "Snoozed until Mon 19 Oct · 9:00 AM" with Undo', await undoToast(page, 'Snoozed until Mon 19 Oct · 9:00 AM'))
  await settle(state)
  check('k3 written', row(state, FERNS).snoozed_until === iso('09:00', 19), row(state, FERNS).snoozed_until)
  await page.keyboard.press('Control+z')
  await sleep(1200)
  check('k4 Ctrl+Z takes it back', row(state, FERNS).snoozed_until === null, row(state, FERNS).snoozed_until)
  await page.keyboard.press('?')
  const sheet = page.locator('[role="dialog"][aria-label="Shortcuts"]')
  const listed = await sheet.waitFor({ timeout: 4000 }).then(async () => /Snooze…/.test(await sheet.innerText()), () => false)
  check('k5 the ? cheatsheet lists Z · Snooze…', listed)
  await page.keyboard.press('Escape')
  check('k6 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B: one whose snooze is over is back by itself — top of Today, "Back from snooze"; a snoozed one isn't. ──
for (const view of want('b') ? ['desktop', 'phone'] : []) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors } = await open('/today', { theme, phone: view === 'phone' })
    const ids = await order(page)
    const omar = ids.indexOf(tid(OMAR))
    const firstListed = ids.filter((id) => ![tid(BANK)].includes(id))[0]
    check(`b1 [${view} ${theme}] back from snooze: on Today, first after the Top 3`, omar >= 0 && firstListed === tid(OMAR), ids.map((id) => TASKS.find((t) => t.id === id)?.title ?? id).join(' | '))
    const text = omar >= 0 ? await rowEl(page, OMAR).first().innerText() : ''
    check(`b2 [${view} ${theme}] …marked "Back from snooze"`, /Back from snooze/.test(text), text.replace(/\n/g, ' | '))
    check(`b3 [${view} ${theme}] the one snoozed till Tuesday isn't on Today`, !ids.includes(tid(DENTIST)))
    await rowEl(page, OMAR).first().scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, `b-today-${view}-${theme}`)
    check(`b4 [${view} ${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── P: the phone — ⋯ → Snooze… → the sheet → Later today. ──
for (const theme of want('p') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { phone: true, theme })
  await rowEl(page, BASIL).getByRole('button', { name: /More actions/ }).click()
  await sleep(700)
  await page.locator('.kf-as-row', { hasText: 'Snooze…' }).first().click()
  await sleep(900)
  const sheetOk = (await page.getByText('Snooze "Plant the basil"').count()) > 0
  check(`p1 [${theme}] phone: ⋯ → Snooze… opens the snooze sheet`, sheetOk)
  await shot(page, `p1-phone-sheet-${theme}`)
  await page.getByRole('button', { name: /Later today/ }).first().click()
  check(`p2 [${theme}] Later today: "Snoozed until 1:00 PM" with Undo`, await undoToast(page, 'Snoozed until 1:00 PM'))
  await settle(state)
  check(`p3 [${theme}] written, and off the list`, !!row(state, BASIL).snoozed_until && !(await shown(page, BASIL)))
  await page.goto(`${BASE}/tasks?list=snoozed`, { waitUntil: 'networkidle' })
  await sleep(1200)
  check(`p4 [${theme}] the Snoozed tab on the phone, with Unsnooze`, (await shown(page, BASIL)) && (await rowEl(page, BASIL).getByRole('button', { name: 'Unsnooze' }).count()) === 1)
  await shot(page, `p4-phone-snoozed-${theme}`)
  check(`p5 [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── O: the task's own ⋯ (TaskMoreMenu) — the editor page on a computer, the task sheet on a phone. ──
if (want('o')) {
  {
    const { ctx, page, errors, state } = await open(`/tasks/${tid(FERNS)}`)
    await page.getByRole('button', { name: 'More for "Water the ferns"' }).first().click()
    await sleep(400)
    await page.getByRole('menuitem', { name: 'Snooze…' }).last().click()
    await sleep(400)
    await snoozePick(page, 'This evening')
    check('o1 editor ⋯ → Snooze… → This evening: "Snoozed until 6:00 PM" with Undo', await undoToast(page, 'Snoozed until 6:00 PM'))
    await settle(state)
    check('o2 written', row(state, FERNS).snoozed_until === iso('18:00'), row(state, FERNS).snoozed_until)
    await page.getByRole('button', { name: 'More for "Water the ferns"' }).first().click()
    await sleep(400)
    const un = page.getByRole('menuitem', { name: /Unsnooze/ })
    check('o3 …and now offers Unsnooze, saying when it is back', (await un.count()) === 1 && /back 6:00 PM/.test(await un.innerText()), await un.innerText().catch(() => '-'))
    await un.click()
    await settle(state)
    check('o4 Unsnooze from there', row(state, FERNS).snoozed_until === null)
    check('o5 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  {
    const { ctx, page, errors, state } = await open('/tasks?list=all', { phone: true })
    await rowEl(page, FERNS).getByText('Water the ferns', { exact: true }).first().click()
    await sleep(900)
    await page.getByRole('button', { name: 'More for "Water the ferns"' }).first().click()
    await sleep(700)
    await page.locator('.kf-as-row', { hasText: 'Snooze…' }).first().click()
    await sleep(900)
    await page.getByRole('button', { name: /Tomorrow morning/ }).first().click()
    check('o6 phone sheet ⋯ → Snooze… → Tomorrow morning: "Snoozed until Tomorrow · 9:00 AM" with Undo', await undoToast(page, 'Snoozed until Tomorrow · 9:00 AM'))
    await settle(state)
    check('o7 written', row(state, FERNS).snoozed_until === iso('09:00', 18), row(state, FERNS).snoozed_until)
    check('o8 no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── N: a reminder's "In 10 min" from a closed app (the worker opens it at ?kfAction=snooze10): the reminder again
// at 10:10 — remind_again_at, the task and its own reminder untouched. ──
if (want('n')) {
  const { ctx, page, errors, state } = await open(`/tasks?focus=${tid(BANK)}&kfAction=snooze10&kfTasks=${tid(BANK)}`)
  check('n1 In 10 min: "Reminding you again at 10:10 AM" with Undo', await undoToast(page, 'Reminding you again at 10:10 AM'))
  await settle(state)
  const b = row(state, BANK)
  check('n2 written: remind_again_at = 10:10; due date, reminder_at and Top 3 untouched', b.remind_again_at && Math.abs(Date.parse(b.remind_again_at) - cairo('10:10').getTime()) < 120_000 && b.due_at === iso('09:00') && b.reminder_at === iso('09:45') && b.top3 === true, JSON.stringify({ again: b.remind_again_at, rem: b.reminder_at }))
  check('n3 the address drops the action (a reload won\'t run it twice)', !page.url().includes('kfAction'), page.url())
  check('n4 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
