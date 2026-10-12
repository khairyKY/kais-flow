// Labels (Overlays.dc.html "Label picker" + "Labels" manager) on the REAL app against a MOCKED backend —
// the fix-tasks recipe: dev server with VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call; writes are recorded AND applied to the mock rows.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]      (ONLY=k,b,m,c,s,g,f,p,o to pick sections)
// The day: Monday 12 Oct 2026, Cairo (UTC+3), the clock at 10:00.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5261'
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

const cairo = (hhmm, day = 12) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 9, day, h - 3, m))
}
const iso = (hhmm, day) => cairo(hhmm, day).toISOString()
const CREATED = iso('09:00', 1)
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const D1 = 'd0000000-0000-4000-8000-000000000001'
const P1 = 'b0000000-0000-4000-8000-000000000001'
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
// The design's six labels, with its counts' spirit: Urgent on several, Someday uncoloured.
const FORE = 1, TYRE = 2, REVIEW = 3, INVOICE = 4, PASSPORT = 5, EMAIL = 6, GROCER = 7, PLANTS = 8, OLDBIN = 9
const TASKS = [
  task(FORE, 'Plan & implement forecasting logic', { project_id: P1, domain_id: D1, due_at: iso('15:00'), priority: 2, duration_min: 30, labels: ['Deep work', 'Urgent'] }),
  task(TYRE, 'Call the tyre supplier', { due_at: iso('09:00'), labels: ['Errand'] }),
  task(REVIEW, 'Review the week'),
  task(INVOICE, 'Send the invoice', { due_at: iso('09:00', 13), labels: ['Urgent', 'Quick win'] }),
  task(PASSPORT, 'Renew passport', { due_at: iso('09:00', 10), labels: ['Waiting on'] }),
  task(EMAIL, 'Reply to Omar', { labels: ['Quick win', 'Urgent'] }),
  task(GROCER, 'Learn the cello', { labels: ['Someday'] }),
  task(PLANTS, 'Water the plants', { status: 'done', completed_at: iso('08:00'), due_at: iso('08:00'), labels: ['Errand'] }),
  task(OLDBIN, 'Old binned task', { labels: ['Urgent'], deleted_at: iso('08:00', 11) }),
]
const META = { Urgent: 'var(--acc-terra)', 'Waiting on': 'var(--acc-lavender)', 'Quick win': 'var(--acc-sage)', 'Deep work': 'var(--acc-hydrangea)', Errand: 'var(--acc-buttercream)' }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', label_meta: META, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const DOMAINS = [{ id: D1, user_id: UID, name: 'Career', color: '#8A9A7E', sort_order: 0, created_at: CREATED, updated_at: CREATED }]
const PROJECTS = [{ id: P1, user_id: UID, name: 'Forecasting', domain_id: D1, status: 'active', type: 'standard', color: null, created_at: CREATED, updated_at: CREATED, deleted_at: null }]
const tables = (settings) => structuredClone({ tasks: TASKS, calendar_events: [], inbox_items: [], projects: PROJECTS, domains: DOMAINS, areas: [], app_settings: [settings] })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 } }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

async function open(route = '/tasks?list=all', o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([t, sess, uid, at]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf_tour_done', '1')
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: at }))
  }, [o.theme ?? 'day', JSON.stringify(session), UID, cairo('09:00').getTime()])
  const state = { rows: tables(o.settings ?? SETTINGS), writes: [] }
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
const text = (loc) => loc.first().innerText().catch(() => '')
const toastSoon = (page, msg) => page.locator('.kf-toast-msg', { hasText: msg }).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const posts = (state, table, from = 0) => state.writes.slice(from).filter((w) => w.table === table && w.method === 'POST').flatMap((w) => (Array.isArray(w.body) ? w.body : [w.body]))
const lastRow = (state, table, rowId, from = 0) => posts(state, table, from).filter((r) => r.id === rowId).at(-1)
const labelsNow = (state, n) => state.rows.tasks.find((t) => t.id === id(n))?.labels
async function settle(state) {
  let n = -1
  while (n !== state.writes.length) {
    n = state.writes.length
    await sleep(400)
  }
}
const row = (page, n) => page.locator(`#task-${id(n)}`)
/** Scrolled into view first, then clicked — a menu closes on a scroll behind it. */
async function steady(loc, opts) {
  await loc.scrollIntoViewIfNeeded()
  await sleep(300)
  await loc.click(opts)
}
const picker = (page) => page.locator('.lp-pop')
const pickRow = (page, name) => picker(page).getByRole('option', { name: new RegExp(`^${name}\\b`) })
/** j until the row has focus (useListKeys focuses `#task-<id>`). */
async function focusRow(page, n) {
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => document.activeElement?.id)) === `task-${id(n)}`) return true
    await page.keyboard.press('j')
    await sleep(120)
  }
  return false
}
async function undoToast(page, msg) {
  await page.locator('.kf-toast', { hasText: msg }).getByText('Undo', { exact: true }).first().click()
}

// ── K: L on a focused row — the picker, filtering, Enter, create ──
for (const theme of want('k') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
  await page.mouse.click(5, 790) // nothing focused in a field
  check(`k0 [${theme}] j reaches the forecasting row`, await focusRow(page, FORE))
  await page.keyboard.press('l')
  await sleep(500)
  const body = await text(picker(page))
  check(`k1 [${theme}] L opens the Label picker: find or create, every label with its count, checks on this task's`,
    (await picker(page).count()) === 1 && /Find or create/.test(await picker(page).locator('input').getAttribute('placeholder')) &&
    ['Deep work', 'Errand', 'Quick win', 'Someday', 'Urgent', 'Waiting on'].every((l) => body.includes(l)) &&
    (await pickRow(page, 'Urgent').getAttribute('aria-selected')) === 'true' && (await pickRow(page, 'Errand').getAttribute('aria-selected')) === 'false' &&
    /Urgent\s*3/.test(body) && /Create new label/.test(body), body.replace(/\n/g, ' | '))
  const sq = await pickRow(page, 'Urgent').locator('.lp-sq').evaluate((e) => getComputedStyle(e).backgroundColor)
  const none = await pickRow(page, 'Someday').locator('.lp-sq').evaluate((e) => getComputedStyle(e).backgroundColor)
  check(`k1 [${theme}] colours from label_meta; an uncoloured label wears the hairline square`, sq !== none && sq !== 'rgba(0, 0, 0, 0)', `${sq} / ${none}`)
  await shot(page, `k1-picker-${theme}`)
  if (theme === 'day') {
    const w0 = state.writes.length
    await page.keyboard.type('err')
    await sleep(200)
    const filtered = await picker(page).getByRole('option').allInnerTexts()
    check('k2 typing filters (any case) and offers Create “err”', filtered.length === 1 && /Errand/.test(filtered[0]) && /Create “err”/.test(await text(picker(page).locator('.is-create'))), filtered.join(','))
    await page.keyboard.press('Enter')
    await settle(state)
    check('k2 Enter toggles the highlighted label onto the task; the search clears', JSON.stringify(lastRow(state, 'tasks', id(FORE), w0)?.labels) === '["Deep work","Urgent","Errand"]' && (await picker(page).locator('input').inputValue()) === '', JSON.stringify(lastRow(state, 'tasks', id(FORE), w0)?.labels))
    await page.keyboard.type('Gym')
    await page.keyboard.press('Enter')
    await settle(state)
    check('k3 a new name + Enter creates it on the task', lastRow(state, 'tasks', id(FORE), w0)?.labels?.includes('Gym'), JSON.stringify(lastRow(state, 'tasks', id(FORE), w0)?.labels))
    await pickRow(page, 'Urgent').click()
    await settle(state)
    check('k4 a click takes a label off; the picker stays open for the next', !lastRow(state, 'tasks', id(FORE), w0)?.labels?.includes('Urgent') && (await picker(page).count()) === 1)
    const logged = posts(state, 'activity_log', w0).filter((a) => a.entity_id === id(FORE))
    check('k4 each edit is task activity (task.updated · labels), as any field edit', logged.length >= 3 && logged.every((a) => a.event_type === 'task.updated'), JSON.stringify(logged.map((a) => a.event_type)))
    await page.keyboard.press('Escape')
    await sleep(300)
    check('k5 Esc closes it, and the list keys come back (j moves)', (await picker(page).count()) === 0)
  }
  check(`k [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── B: L with a selection acts on all of it, one Undo ──
if (want('b')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const w0 = state.writes.length
  await row(page, TYRE).getByText('Call the tyre supplier').click({ modifiers: ['Control'] })
  await row(page, REVIEW).getByText('Review the week').click({ modifiers: ['Control'] })
  await sleep(300)
  await page.keyboard.press('l')
  await sleep(500)
  check('b1 L with 2 selected opens one picker', (await picker(page).count()) === 1)
  await page.keyboard.type('quick')
  await page.keyboard.press('Enter')
  await settle(state)
  check('b2 the label goes onto every selected task', labelsNow(state, TYRE)?.includes('Quick win') && labelsNow(state, REVIEW)?.includes('Quick win'), JSON.stringify([labelsNow(state, TYRE), labelsNow(state, REVIEW)]))
  check('b2 one toast with Undo', await toastSoon(page, 'Added “Quick win” to 2 tasks'))
  await shot(page, 'b2-selection')
  const mixed = await pickRow(page, 'Errand').innerText()
  await pickRow(page, 'Errand').click()
  await settle(state)
  check('b3 a label some of the selection has shows –, a tap puts it on all', labelsNow(state, REVIEW)?.includes('Errand') && labelsNow(state, TYRE)?.includes('Errand') && /–/.test(mixed), mixed.replace(/\n/g, ' '))
  await page.keyboard.press('Escape')
  await sleep(300)
  await undoToast(page, 'Added “Quick win” to 2 tasks')
  await settle(state)
  check('b4 Undo takes it back off both', !labelsNow(state, TYRE)?.includes('Quick win') && !labelsNow(state, REVIEW)?.includes('Quick win'), JSON.stringify([labelsNow(state, TYRE), labelsNow(state, REVIEW)]))
  check('b no page errors', errors.length === 0, errors.join(' | '))
  void w0
  await ctx.close()
}

// ── M: the row ⋯ / right-click menu → Labels ▸ ──
if (want('m')) {
  const { ctx, page, errors, state } = await open('/tasks?list=all')
  const w0 = state.writes.length
  await steady(row(page, REVIEW), { button: 'right' })
  await sleep(300)
  const items = await page.getByRole('menu').first().innerText()
  check('m1 desktop menu: Labels ▸ right after Priority', /Priority[\s\S]*Labels[\s\S]*Repeat/.test(items), items.replace(/\n/g, ' / '))
  await page.getByRole('menuitem', { name: /^Labels/ }).hover()
  await sleep(500)
  await page.getByRole('menuitem', { name: /^Labels/ }).click()
  await sleep(400)
  check('m2 it opens the Label picker beside the menu', (await picker(page).count()) === 1)
  await shot(page, 'm2-menu-picker')
  await pickRow(page, 'Waiting on').click()
  await settle(state)
  check('m3 a tap there writes the task', JSON.stringify(lastRow(state, 'tasks', id(REVIEW), w0)?.labels) === '["Waiting on"]')
  check('m no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── C: the popover's chips — a label chip opens the picker, inside the popover ──
for (const theme of want('c') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { theme })
  const w0 = state.writes.length
  await row(page, FORE).getByText(TASKS[FORE - 1].title, { exact: true }).click()
  await sleep(700)
  const pop = page.locator('.tp-pop')
  await pop.getByRole('button', { name: 'Urgent' }).click()
  await sleep(400)
  check(`c1 [${theme}] a label chip opens the picker inside the popover (both open)`, (await picker(page).count()) === 1 && (await pop.count()) === 1)
  await shot(page, `c1-popover-picker-${theme}`)
  if (theme === 'day') {
    await pickRow(page, 'Errand').click()
    await settle(state)
    check('c2 a tap writes; the popover stays', lastRow(state, 'tasks', id(FORE), w0)?.labels?.includes('Errand') && (await pop.count()) === 1)
    await page.keyboard.press('Escape')
    await sleep(300)
    check('c3 Esc closes the picker first, then the popover', (await picker(page).count()) === 0 && (await pop.count()) === 1)
    const chips = await pop.locator('.ts-chips').innerText()
    check('c3 the chip row shows the new label', /errand/i.test(chips), chips.replace(/\n/g, ' '))
    await row(page, REVIEW).getByText('Review the week').click()
    await sleep(700)
    check('c4 a task with no labels has the dashed Label chip', (await page.locator('.tp-pop').getByRole('button', { name: 'Label', exact: true }).count()) === 1)
  }
  check(`c [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── S: the phone task sheet → the label sheet ──
for (const theme of want('s') ? ['day', 'night'] : []) {
  const { ctx, page, errors, state } = await open('/tasks?list=all', { view: phone, theme })
  const w0 = state.writes.length
  await row(page, FORE).getByText(TASKS[FORE - 1].title, { exact: true }).click()
  await sleep(900)
  await page.getByRole('button', { name: 'Deep work' }).click()
  await sleep(900)
  const sheet = page.getByRole('listbox', { name: 'Labels' })
  const body = await text(sheet)
  check(`s1 [${theme}] a label chip on the phone sheet opens the Labels sheet with every label`, ['Deep work', 'Errand', 'Quick win', 'Someday', 'Urgent', 'Waiting on'].every((l) => body.includes(l)), body.replace(/\n/g, ' | '))
  const h = await sheet.getByRole('option').first().boundingBox()
  check(`s1 [${theme}] rows are touch-sized (≥48px)`, h && h.height >= 48, JSON.stringify(h))
  await shot(page, `s1-phone-labels-${theme}`)
  if (theme === 'day') {
    await sheet.getByRole('option', { name: /^Quick win/ }).click()
    await settle(state)
    check('s2 a tap writes the task (through the sheet\'s own setter)', lastRow(state, 'tasks', id(FORE), w0)?.labels?.includes('Quick win'))
  }
  check(`s [${theme}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── G: the manager in Settings → Organize — rename / colour / merge / delete / ＋ New, one Undo each ──
for (const [name, view] of want('g') ? [['desktop', desktop], ['phone', phone]] : []) {
  for (const theme of ['day', 'night']) {
    const { ctx, page, errors, state } = await open('/settings', { theme, view })
    const lm = page.locator('#settings-Labels')
    await lm.scrollIntoViewIfNeeded()
    await sleep(400)
    const body = await text(lm)
    check(`g1 [${name} ${theme}] Settings has the Labels panel: count, ＋ New, rows with "N tasks"`, /6 total/i.test(body) && /New/.test(body) && /Urgent\s*3 tasks/.test(body) && /Someday\s*1 task\b/.test(body) && /cut across every domain/.test(body), body.replace(/\n/g, ' | '))
    await shot(page, `g1-settings-${name}-${theme}`)
    await lm.getByRole('button', { name: 'Waiting on', exact: true }).click()
    await sleep(300)
    check(`g2 [${name} ${theme}] a name opens the drawn edit row: the field, six swatches, Save`, (await lm.locator('.lm-input').count()) === 1 && (await lm.locator('.lm-swatch').count()) === 6 && (await lm.locator('.lm-swatch[aria-pressed="true"]').getAttribute('aria-label')) === 'Lavender')
    await shot(page, `g2-edit-${name}-${theme}`)
    if (name === 'desktop' && theme === 'day') {
      const w0 = state.writes.length
      await lm.locator('.lm-input').fill('Waiting')
      await lm.getByRole('button', { name: 'Sage' }).click()
      await lm.getByRole('button', { name: 'Save' }).click()
      await settle(state)
      const meta = posts(state, 'app_settings', w0).at(-1)?.label_meta
      check('g3 rename rewrites the label on its task and moves the colour (the new pick) to the new name', JSON.stringify(labelsNow(state, PASSPORT)) === '["Waiting"]' && meta?.Waiting === 'var(--acc-sage)' && !('Waiting on' in (meta ?? {})), JSON.stringify(meta))
      check('g3 one toast with Undo', await toastSoon(page, 'Renamed to “Waiting” · 1 task'))
      await undoToast(page, 'Renamed to “Waiting”')
      await settle(state)
      check('g4 Undo puts the name and the colour back', JSON.stringify(labelsNow(state, PASSPORT)) === '["Waiting on"]' && state.rows.app_settings[0].label_meta?.['Waiting on'] === 'var(--acc-lavender)', JSON.stringify(state.rows.app_settings[0].label_meta))
      // Delete: every task carrying it, the trashed one too; one Undo.
      const w1 = state.writes.length
      await lm.locator('.lm-row', { hasText: 'Urgent' }).getByRole('button', { name: /More actions/ }).click()
      await sleep(300)
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await settle(state)
      const touched = posts(state, 'tasks', w1).map((t) => t.id).sort()
      check('g5 Delete takes it off every task (trashed included), in one pass', JSON.stringify(touched) === JSON.stringify([id(FORE), id(INVOICE), id(EMAIL), id(OLDBIN)].sort()) && [FORE, INVOICE, EMAIL, OLDBIN].every((n) => !labelsNow(state, n).includes('Urgent')), touched.join(','))
      check('g5 …and no task activity for a reorganise (slipping stays honest)', posts(state, 'activity_log', w1).length === 0)
      check('g5 one toast with Undo', await toastSoon(page, 'Deleted “Urgent” from 4 tasks'))
      await undoToast(page, 'Deleted “Urgent”')
      await settle(state)
      check('g6 Undo puts it back on all four, with its colour', [FORE, INVOICE, EMAIL, OLDBIN].every((n) => labelsNow(state, n).includes('Urgent')) && state.rows.app_settings[0].label_meta?.Urgent === 'var(--acc-terra)')
      // Merge: a rename onto an existing name (any case).
      await lm.getByRole('button', { name: 'Someday', exact: true }).click()
      await lm.locator('.lm-input').fill('quick WIN')
      await page.keyboard.press('Enter')
      await settle(state)
      check('g7 renaming onto an existing label merges into it', JSON.stringify(labelsNow(state, GROCER)) === '["Quick win"]' && (await toastSoon(page, 'Merged into “Quick win”')))
      // ＋ New: a coloured label before any task carries it — then it's in the picker.
      await lm.getByRole('button', { name: '＋ New' }).click()
      await lm.locator('.lm-input').fill('Gym')
      await lm.getByRole('button', { name: 'Clover' }).click()
      await lm.getByRole('button', { name: 'Save' }).click()
      await settle(state)
      check('g8 ＋ New keeps a label with its colour before any task has it', state.rows.app_settings[0].label_meta?.Gym === 'var(--acc-clover)' && /Gym\s*no tasks/.test(await text(lm)), JSON.stringify(state.rows.app_settings[0].label_meta))
      await lm.getByRole('button', { name: 'Gym', exact: true }).click()
      await page.keyboard.press('Escape')
      await sleep(200)
      check('g9 Esc leaves the edit row as it was (Settings stays)', (await lm.locator('.lm-input').count()) === 0 && new URL(page.url()).pathname === '/settings')
    }
    if (name === 'phone' && theme === 'day') {
      await page.keyboard.press('Escape')
      await lm.locator('.lm-row', { hasText: 'Errand' }).getByRole('button', { name: /More actions/ }).click()
      await sleep(700)
      const sheet = await text(page.locator('.kf-as-row').first())
      check('g10 phone ⋯ is an action sheet (Edit · Delete)', /Edit/.test(sheet) && (await page.locator('.kf-as-row', { hasText: 'Delete' }).count()) === 1, sheet)
      await shot(page, 'g10-phone-menu')
    }
    check(`g [${name} ${theme}] no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── F: the Tasks Label filter → "Manage labels…" ──
for (const [name, view] of want('f') ? [['desktop', desktop], ['phone', phone]] : []) {
  const { ctx, page, errors } = await open('/tasks?list=all', { view })
  await page.getByRole('button', { name: 'Label filter' }).click()
  await sleep(300)
  await page.getByRole('option', { name: 'Manage labels…' }).click()
  await sleep(700)
  const panel = page.locator('section[aria-label="Labels"]')
  const body = await text(panel)
  check(`f1 [${name}] the Label filter's "Manage labels…" opens the manager over Tasks`, /Urgent/.test(body) && /3 tasks/.test(body) && new URL(page.url()).pathname === '/tasks', body.replace(/\n/g, ' | ').slice(0, 200))
  await shot(page, `f1-tasks-manage-${name}`)
  await page.keyboard.press('Escape')
  await sleep(600)
  check(`f2 [${name}] Esc closes it`, (await panel.count()) === 0)
  check(`f [${name}] no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── P: before migration 0069 (no label_meta on the row) — labels work, colours wait, nothing refused ──
if (want('p')) {
  const { label_meta: _drop, ...pre } = SETTINGS
  const { ctx, page, errors, state } = await open('/settings', { settings: pre })
  const lm = page.locator('#settings-Labels')
  await lm.scrollIntoViewIfNeeded()
  check('p1 pre-push: no ＋ New, every square the hairline one', (await lm.getByRole('button', { name: '＋ New' }).count()) === 0)
  await lm.getByRole('button', { name: 'Errand', exact: true }).click()
  check('p2 pre-push: the edit row has no swatches', (await lm.locator('.lm-swatch').count()) === 0)
  const w0 = state.writes.length
  await lm.locator('.lm-input').fill('Errands')
  await page.keyboard.press('Enter')
  await settle(state)
  check('p3 pre-push: rename still rewrites the tasks, and sends no app_settings write', labelsNow(state, TYRE)?.[0] === 'Errands' && posts(state, 'app_settings', w0).length === 0)
  await shot(page, 'p1-pre-push')
  check('p no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── O: side by side with the Overlays frames (design-export/Overlays.dc.html, day) ──
if (want('o')) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const design = pathToFileURL(path.resolve(here, '../../../../design-export/Overlays.dc.html')).href
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const dp = await ctx.newPage()
  await dp.goto(design, { waitUntil: 'networkidle' })
  await sleep(1500)
  const cell = (label) => dp.locator('.cell', { has: dp.locator('.clabel', { hasText: label }) }).locator('.stage')
  await cell('Label picker').scrollIntoViewIfNeeded()
  const dPick = await cell('Label picker').screenshot()
  const dMan = await cell('Labels').last().screenshot()
  await ctx.close()
  // The app's own crops, day, desktop.
  const a = await open('/tasks?list=all')
  await a.page.mouse.click(5, 790)
  await focusRow(a.page, FORE)
  await a.page.keyboard.press('l')
  await sleep(500)
  const aPick = await picker(a.page).screenshot()
  await a.ctx.close()
  const s = await open('/tasks?list=all')
  await s.page.getByRole('button', { name: 'Label filter' }).click()
  await s.page.getByRole('option', { name: 'Manage labels…' }).click()
  await sleep(700)
  await s.page.locator('section[aria-label="Labels"]').getByRole('button', { name: 'Waiting on', exact: true }).click()
  await sleep(300)
  const aMan = await s.page.locator('section[aria-label="Labels"]').screenshot()
  await s.ctx.close()
  const side = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 })
  const sp = await side.newPage()
  const img = (b) => `data:image/png;base64,${b.toString('base64')}`
  for (const [nm, left, right] of [['o1-side-by-side-picker', dPick, aPick], ['o2-side-by-side-manager', dMan, aMan]]) {
    await sp.setContent(`<body style="margin:0;background:#e6dfce;font:12px monospace;display:flex;gap:24px;padding:16px;align-items:flex-start">
      <figure style="margin:0"><figcaption>design-export/Overlays.dc.html</figcaption><img src="${img(left)}"></figure>
      <figure style="margin:0"><figcaption>app (mock backend, 1280×800, zoom as shipped)</figcaption><img src="${img(right)}"></figure></body>`)
    await sp.screenshot({ path: path.join(OUT, `${nm}.png`), fullPage: true })
  }
  await side.close()
  check('o side-by-side crops written', true)
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
