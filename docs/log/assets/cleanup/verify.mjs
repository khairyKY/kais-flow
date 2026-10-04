// Cleanup (builder X, 2026-10-03) on the REAL app against a MOCKED backend (the task-sheet/verify.mjs
// recipe): the dev server runs with VITE_SUPABASE_URL=http://127.0.0.1:9 (nothing listens there), a
// made-up session sits in localStorage, Playwright answers every REST call and records every write.
// Checks: Settings shows no fake Google Calendar sync and no Pushover; the GitHub row's real states;
// the ritual reminder controls write app_settings; GitHub Inbox rows show glyph/repo/labels/age; filing
// one writes the task's external_ref; the task editor (desktop) and task sheet (phone) link the issue.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5250'
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
const UID = '00000000-0000-4000-8000-00000000c1ea'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const SETTINGS = { id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const NOW = new Date('2026-10-03T09:00:00Z') // Sat 3 Oct 2026, 12:00 Cairo

// ── fixtures ──
const GH = {
  ok: { provider: 'github', updated_at: '2026-10-03T08:30:00Z', login: 'kai', status: 'ok', synced_at: '2026-10-03T08:37:00Z' },
  failing: { provider: 'github', updated_at: '2026-10-02T08:30:00Z', login: 'kai', status: 'failing', synced_at: '2026-10-01T05:07:00Z' },
  fresh: { provider: 'github', updated_at: '2026-10-03T08:30:00Z', login: 'kai', status: 'ok', synced_at: null },
}
const ISSUE_URL = 'https://github.com/acme/app/issues/7'
const inbox = (n, raw, payload, created) => ({
  id: `i0000000-0000-4000-8000-00000000000${n}`, user_id: UID, kind: 'github_issue', raw_text: raw, transcript: null, ai_parse: null, confidence: null,
  status: 'pending', filed_task_id: null, payload, snoozed_until: null, external_ref: { source: 'github', id: payload.node_id }, deleted_at: null,
  created_at: created, updated_at: created,
})
const ISSUES = [
  inbox(1, 'Login button does nothing on Safari', { node_id: 'I_kwDOseven', number: 7, repo: 'acme/app', url: ISSUE_URL, labels: ['bug', 'ui', 'p1', 'good first issue'], updated_at: '2026-10-02T10:00:00Z', created_at: '2026-09-28T09:00:00Z' }, '2026-10-01T09:00:00Z'),
  // Stored before created_at was kept: the age falls back to when it reached the inbox (2 days).
  inbox(2, 'Docs: explain the capture key', { node_id: 'I_kwDOtwelve', number: 12, repo: 'acme/docs', url: 'https://github.com/acme/docs/issues/12', labels: [], updated_at: '2026-10-01T10:00:00Z' }, '2026-10-01T09:00:00Z'),
]
const TASK_ID = '10000000-0000-4000-8000-0000000000aa'
const TASK = {
  id: TASK_ID, user_id: UID, title: 'Login button does nothing on Safari', project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo',
  due_at: null, scheduled_start: null, scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null,
  duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null,
  parent_task_id: null, external_ref: { source: 'github', id: 'I_kwDOseven', url: ISSUE_URL }, created_at: '2026-10-02T09:00:00Z', updated_at: '2026-10-02T09:00:00Z',
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }

async function open(viewName, route, rows = {}) {
  const ctx = await browser.newContext({ ...VIEWS[viewName], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess]) => {
    localStorage.setItem('kf_theme', 'day')
    localStorage.setItem('sb-127-auth-token', sess)
  }, [JSON.stringify(session)])
  const state = { rows: { app_settings: [SETTINGS], ...rows }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const list = state.rows[table] ?? []
    if (one) return list.length ? r.fulfill({ json: list[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: list, headers: { 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  await page.clock.resume()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(900)
  return { ctx, page, state, errors }
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
const bodyText = (page) => page.evaluate(() => document.body.textContent ?? '')
/** Every row written to `table` (POST bodies may be one row or an array). */
const written = (state, table) => state.writes.filter((w) => w.table === table && w.method === 'POST').flatMap((w) => [w.body].flat())

// ── 1. Desktop Settings: no fake Google sync, no Pushover, GitHub truthful, reminders write ──
for (const [state, expect] of [[null, 'Not connected'], ['failing', 'Token expired — reconnect'], ['ok', 'Connected · synced 3 Oct, 11:37'], ['fresh', 'Connected · not synced yet']]) {
  const { ctx, page, errors } = await open('desktop', '/settings', { integrations: state ? [GH[state]] : [] })
  const summary = page.locator('div', { hasText: 'GitHub · issues → inbox' }).last()
  const txt = await bodyText(page)
  check(`desktop settings [github ${state ?? 'none'}]: the summary row says "${expect}"`, txt.includes(expect), (await summary.textContent())?.slice(0, 80))
  if (!state) {
    check('desktop settings: no "Sync now" button (Google Calendar has no sync yet)', (await page.getByRole('button', { name: 'Sync now' }).count()) === 0)
    check('desktop settings: Google Calendar is an honest "Coming soon" row', txt.includes('Google Calendar · sync') && txt.includes('Coming soon') && !txt.includes('scopes: calendar.events'))
    check('desktop settings: no Pushover', !txt.includes('Pushover'))
    check('desktop settings: the old "configured" read-out is gone', !/configured/i.test(txt))
    await page.locator('#settings-Notifications').scrollIntoViewIfNeeded()
    await shot(page, 'desktop-settings')
    await page.locator('#settings-Notifications').screenshot({ path: path.join(OUT, 'desktop-ritual-reminders.png') })
  }
  // The summary card: the GitHub row's label span → its row → the card.
  if (state) await page.getByText('GitHub · issues → inbox').locator('xpath=../..').screenshot({ path: path.join(OUT, `desktop-summary-github-${state}.png`) }).catch(() => {})
  check(`desktop settings [github ${state ?? 'none'}]: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

{
  const { ctx, page, state, errors } = await open('desktop', '/settings', { integrations: [] })
  const morning = page.getByLabel('Morning digest time')
  const evening = page.getByLabel('Evening nudge time')
  check('reminders: two named time fields at the defaults (08:00, 21:00)', (await morning.inputValue()) === '8:00 AM' && (await evening.inputValue()) === '9:00 PM', `${await morning.inputValue()} / ${await evening.inputValue()}`)
  check('reminders: the old device-only copy is gone', !(await bodyText(page)).includes('morning 8:30 · evening 21:30'))
  await morning.click()
  await morning.fill('7:45')
  await morning.press('Enter')
  await sleep(1200)
  // v1.0.20 (Tray and Notifications 12i) folded the Ritual reminders card into Settings → Notifications'
  // kind rows: find each reminder's switch by its row label, not by position.
  const sw = (label) => page.locator('#settings-Notifications div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last().locator('[role="switch"]')
  const switches = { nth: (i) => sw(i === 0 ? 'Morning digest' : 'Evening nudge'), count: async () => (await sw('Morning digest').count()) + (await sw('Evening nudge').count()) }
  check('reminders: one switch per reminder, both on', (await switches.count()) === 2 && (await switches.nth(0).getAttribute('aria-checked')) === 'true' && (await switches.nth(1).getAttribute('aria-checked')) === 'true')
  await switches.nth(1).click()
  await sleep(1500)
  const rows = written(state, 'app_settings')
  check('reminders: the morning time is written to app_settings (07:45)', rows.some((r) => r.morning_digest_at === '07:45'), JSON.stringify(rows.map((r) => ({ at: r.morning_digest_at, on: r.evening_nudge_on }))))
  check('reminders: turning the evening nudge off writes evening_nudge_on: false (and keeps 07:45)', rows.some((r) => r.evening_nudge_on === false && r.morning_digest_at === '07:45'))
  check('reminders: the switch shows off, the field dims', (await switches.nth(1).getAttribute('aria-checked')) === 'false' && (await evening.evaluate((e) => getComputedStyle(e).opacity)) === '0.5')
  check('reminders: nothing about them went to localStorage', (await page.evaluate(() => localStorage.getItem('kf_ritual_reminders'))) === null)
  await page.locator('#settings-Notifications').screenshot({ path: path.join(OUT, 'desktop-ritual-reminders-edited.png') })

  // The Integrations page
  await page.locator('div', { hasText: /^Integrations$/ }).first().click()
  await sleep(600)
  const txt = await bodyText(page)
  check('integrations page: Google Calendar says "Coming soon" and nothing syncs', txt.includes('Google Calendar') && txt.includes('Coming soon') && txt.includes('Not built yet'))
  check('integrations page: no Pushover row', !txt.includes('Pushover'))
  await shot(page, 'desktop-integrations')
  check('desktop reminders + integrations: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Phone Settings ──
{
  const { ctx, page, state, errors } = await open('phone', '/settings', { integrations: [GH.failing] })
  const txt = await bodyText(page)
  const row = async (label) => page.locator('a, div', { has: page.locator(`span:text-is("${label}")`) }).last().textContent()
  check('phone settings: Google Calendar row says "Coming soon"', (await row('Google Calendar'))?.includes('Coming soon'), await row('Google Calendar'))
  check('phone settings: GitHub row says the token expired', (await row('GitHub'))?.includes('Token expired — reconnect'), await row('GitHub'))
  check('phone settings: no Pushover, no fake sync', !txt.includes('Pushover') && !txt.includes('Sync now'))
  const swRow = (label) => page.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('[role="switch"]') }).last().locator('[role="switch"]')
  const sw = { count: async () => (await swRow('Morning digest').count()) + (await swRow('Evening nudge').count()), nth: (i) => swRow(i === 0 ? 'Morning digest' : 'Evening nudge') }
  check('phone settings: both reminders have a switch (Settings → Notifications)', (await sw.count()) === 2 && (await page.getByLabel('Morning digest time').count()) === 1 && (await page.getByLabel('Evening nudge time').count()) === 1)
  await sw.nth(0).click()
  await sleep(1500)
  check('phone settings: turning the morning digest off writes app_settings', written(state, 'app_settings').some((r) => r.morning_digest_on === false))
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check('phone settings: no horizontal scroll at 390', wide <= 390, wide)
  await page.getByLabel('Evening nudge time').scrollIntoViewIfNeeded()
  await shot(page, 'phone-settings')
  check('phone settings: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 3. Inbox: GitHub rows, and filing one ──
for (const view of ['desktop', 'phone']) {
  const { ctx, page, state, errors } = await open(view, '/inbox', { inbox_items: ISSUES })
  const row = page.locator(`[id="inbox-${ISSUES[0].id}"]`)
  const row2 = page.locator(`[id="inbox-${ISSUES[1].id}"]`)
  await row.waitFor({ timeout: 10000 }).catch(() => {})
  check(`${view} inbox: each GitHub row has the small GitHub glyph`, (await page.locator('svg[aria-label="GitHub issue"]').count()) === 2)
  const link = row.getByRole('link', { name: 'acme/app#7 ↗' })
  check(`${view} inbox: repo#number links to the issue`, (await link.getAttribute('href')) === ISSUE_URL, await link.getAttribute('href'))
  const rowText = (await row.textContent()) ?? ''
  check(`${view} inbox: three labels, then +1`, ['bug', 'ui', 'p1', '+1'].every((l) => rowText.includes(l)) && !rowText.includes('good first issue'), rowText)
  const age = await row.locator('span[title="opened on GitHub"]').textContent().catch(() => null)
  check(`${view} inbox: age = days since the issue was opened (5d)`, age === '5d', age)
  const age2 = await row2.locator('span[title="in the inbox"]').textContent().catch(() => null)
  check(`${view} inbox: an older row without created_at falls back to its inbox age (2d)`, age2 === '2d', age2)
  check(`${view} inbox: no "rank" left over`, !rowText.toLowerCase().includes('rank'))
  await row.screenshot({ path: path.join(OUT, `${view}-inbox-github-row.png`) })
  await shot(page, `${view}-inbox`)
  await row.getByRole('button', { name: 'File' }).click()
  await sleep(2500)
  const tasks = written(state, 'tasks')
  check(`${view} inbox: File writes a task that keeps the issue link (external_ref)`, tasks.some((t) => t.external_ref?.source === 'github' && t.external_ref?.id === 'I_kwDOseven' && t.external_ref?.url === ISSUE_URL), JSON.stringify(tasks.map((t) => t.external_ref)))
  check(`${view} inbox: the inbox row is marked filed`, written(state, 'inbox_items').some((i) => i.id === ISSUES[0].id && i.status === 'filed'))
  check(`${view} inbox: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4. The filed task links back to the issue ──
{
  const { ctx, page, errors } = await open('desktop', `/tasks/${TASK_ID}`, { tasks: [TASK] })
  const link = page.getByRole('link', { name: 'View issue ↗' })
  check('desktop task editor: "View issue" links to the issue', (await link.count()) === 1 && (await link.getAttribute('href')) === ISSUE_URL && (await link.getAttribute('target')) === '_blank')
  await shot(page, 'desktop-task-editor-view-issue')
  check('desktop task editor: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page, errors } = await open('phone', `/tasks?task=${TASK_ID}`, { tasks: [TASK] })
  const link = page.locator('a.ts-next', { hasText: 'View issue' })
  check('phone task sheet: "View issue" links to the issue', (await link.count()) === 1 && (await link.getAttribute('href')) === ISSUE_URL)
  await shot(page, 'phone-task-sheet-view-issue')
  check('phone task sheet: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  // A task without a GitHub ref shows no link.
  const { ctx, page } = await open('desktop', `/tasks/${TASK_ID}`, { tasks: [{ ...TASK, external_ref: null }] })
  check('desktop task editor: a plain task shows no "View issue"', (await page.getByRole('link', { name: 'View issue ↗' }).count()) === 0)
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
