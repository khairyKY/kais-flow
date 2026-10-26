// GitHub rules (Settings.dc.html 2a "Rules · how GitHub lands"), 2026-10-13, on the REAL app against
// a MOCKED backend (the cleanup/verify.mjs recipe): the dev server runs with
// VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session sits in localStorage, Playwright answers
// every REST call and every edge-function call (github-connect's repo list + rules save, github-sync).
// Checks: the panel as drawn (chips, + add repo from the server's list, Inbox/Tasks, priority, Pause),
// each control saving the whole rules state, Pause → "Sync now" says paused, the legacy help line,
// failing → no panel, a failed save puts the server state back, the phone, the Settings summary row,
// and the Inbox honouring the priority (High above captures, Low folded). Side by side with 2a.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5260'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const DESIGN = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../../../../design-export/Settings.dc.html')).href
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
const NOW = new Date('2026-10-13T07:00:00Z') // Tue 13 Oct 2026, 10:00 Cairo

// ── fixtures: the row as useIntegrations selects it (JSON paths — never `data` or the token) ──
const RULES = { land: 'inbox', priority: 'normal', paused: false }
const REPOS = ['khairyKY/kais-flow', 'khairyKY/shaheen_website']
const gh = (over = {}) => ({ provider: 'github', updated_at: '2026-10-13T06:30:00Z', login: 'kai', status: 'ok', synced_at: '2026-10-13T06:56:00Z', repos: REPOS, rules: RULES, ...over })
const LIST = ['khairyKY/kais-flow', 'khairyKY/shaheen_website', 'khairyKY/portfolio', 'acme/website']
const item = (n, kind, raw, payload = null) => ({
  id: `i0000000-0000-4000-8000-00000000000${n}`, user_id: UID, kind, raw_text: raw, transcript: null, ai_parse: null, confidence: null,
  status: 'pending', filed_task_id: null, payload, snoozed_until: null, external_ref: kind === 'github_issue' ? { source: 'github', id: payload.node_id } : null, deleted_at: null,
  created_at: '2026-10-12T09:00:00Z', updated_at: '2026-10-12T09:00:00Z',
})
const INBOX = [
  item(1, 'text', 'call the supplier about the tiles'),
  item(2, 'github_issue', 'Footer overlaps on iPad landscape', { node_id: 'I_a', number: 41, repo: 'khairyKY/shaheen_website', url: 'https://github.com/khairyKY/shaheen_website/issues/41', labels: ['bug'], updated_at: '2026-10-12T10:00:00Z', created_at: '2026-10-10T09:00:00Z' }),
  item(3, 'github_issue', 'Settings: GitHub rules panel', { node_id: 'I_b', number: 212, repo: 'khairyKY/kais-flow', url: 'https://github.com/khairyKY/kais-flow/issues/212', labels: [], updated_at: '2026-10-11T10:00:00Z', created_at: '2026-10-09T09:00:00Z' }),
]

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const VIEWS = { desktop: { viewport: { width: 1280, height: 800 } }, phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }

async function open(viewName, route, rows = {}, { theme = 'day', failSave = false } = {}) {
  const ctx = await browser.newContext({ ...VIEWS[viewName], deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(([sess, th, uid]) => {
    localStorage.setItem('kf_theme', th); localStorage.setItem('kf-download-bar-dismissed', '1') // the download bar has its own harness
    localStorage.setItem('sb-127-auth-token', sess)
    // The one-time hints have been seen (tour/help.ts) — they'd sit over the rows in the shots.
    localStorage.setItem(`kf-help:${uid}`, JSON.stringify(['tour', 'hint:inbox', 'hint:swipe', 'hint:calendar']))
    localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v99.0.0' })) // no "Updated to" toast over the shots
  }, [JSON.stringify(session), theme, UID])
  const state = { rows: { app_settings: [SETTINGS], ...rows }, writes: [], fns: [], selects: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    // ── edge functions ──
    if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.replace('/functions/v1/', '')
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204 })
      let body = null
      try { body = req.postDataJSON() } catch { body = null }
      state.fns.push({ name, body })
      const row = state.rows.integrations?.[0]
      if (name === 'github-connect' && body?.action === 'repos') return r.fulfill({ json: { repos: LIST } })
      if (name === 'github-connect' && body?.action === 'rules') {
        if (failSave) return r.fulfill({ status: 502, json: { error: 'github_unavailable' } })
        const repos = body.repos ? body.repos.split(',') : []
        state.rows.integrations = [{ ...row, repos, rules: body.rules }]
        return r.fulfill({ json: { repos, rules: body.rules } })
      }
      if (name === 'github-sync') {
        if (row?.rules?.paused) return r.fulfill({ status: 409, json: { error: 'paused' } })
        return r.fulfill({ json: { fetched: 3, new: 1, updated: 0, dismissed: 0, completed: 0 } })
      }
      return r.fulfill({ status: 404, json: { error: 'unknown' } })
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, query: url.search, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    if (table === 'integrations') state.selects.push(url.searchParams.get('select'))
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
const bodyText = (page) => page.evaluate(() => document.body.textContent ?? '')
const rulesSaves = (state) => state.fns.filter((f) => f.name === 'github-connect' && f.body?.action === 'rules').map((f) => f.body)
const lastSave = (state) => rulesSaves(state).at(-1)
// settings-build (2026-10-26): Integrations is a category; GitHub opens its own page from its row.
const toIntegrations = async (page) => {
  if (!new URL(page.url()).pathname.startsWith('/settings/integrations')) {
    await page.locator('.st-nav-item, .st-list-row', { hasText: /^Integrations/ }).first().click()
    await sleep(600)
  }
  await page.locator('.st-row.is-link[data-st-key="GitHub"]').click()
  await sleep(700)
}
const ghCard = (page) => page.locator('section.st-sec', { has: page.locator('.st-gh-rules') })
const segBtn = (page, group, label) => page.getByRole('group', { name: group }).getByRole('button', { name: label, exact: true })

// ── 1. Desktop: the panel as drawn, then every control ──
{
  const { ctx, page, state, errors } = await open('desktop', '/settings', { integrations: [gh()] })
  await toIntegrations(page)
  const card = ghCard(page)
  const txt = (await card.textContent()) ?? ''
  check('desktop: the rules panel sits in the GitHub card', (await card.count()) === 1 && txt.includes('Rules · how GitHub lands'))
  check('desktop: four rows as drawn', ['Watching', 'New issues land in', 'Priority in inbox ordering', 'Pause this source'].every((l) => txt.includes(l)), txt.slice(0, 200))
  check('desktop: the watched repos are chips (name only), each with its own ✕', txt.includes('kais-flow') && txt.includes('shaheen_website') && (await page.getByRole('button', { name: 'Stop watching khairyKY/kais-flow' }).count()) === 1)
  check('desktop: saved rules → the help names the scope', txt.includes('Every open issue in these repos, and nothing else'))
  check('desktop: Inbox · Normal selected, Pause off', (await segBtn(page, 'New issues land in', 'Inbox').getAttribute('aria-pressed')) === 'true' && (await segBtn(page, 'Priority in inbox ordering', 'Normal').getAttribute('aria-pressed')) === 'true' && (await page.getByRole('switch', { name: 'Pause GitHub' }).getAttribute('aria-checked')) === 'false')
  check('desktop: the client reads repos/rules as JSON paths, never `data`', state.selects.every((s) => s.includes('repos:data->repos') && s.includes('rules:data->rules') && !/(^|,)data(,|$)/.test(s)), state.selects[0])
  await card.screenshot({ path: path.join(OUT, 'desktop-github-card-day.png') })

  // + add repo: the server's list, minus what's watched
  await page.getByRole('button', { name: 'Add a repo to watch' }).click()
  await sleep(500)
  const opts = await page.getByRole('option').allTextContents()
  check('add repo: the list came from github-connect (action repos), watched ones left out', state.fns.some((f) => f.name === 'github-connect' && f.body?.action === 'repos') && JSON.stringify(opts) === '["khairyKY/portfolio","acme/website"]', JSON.stringify(opts))
  await page.screenshot({ path: path.join(OUT, 'desktop-add-repo-open.png') })
  await page.getByRole('option', { name: 'khairyKY/portfolio' }).click()
  await sleep(900)
  check('add repo: saves the whole state with the new repo', lastSave(state)?.repos === 'khairyKY/kais-flow,khairyKY/shaheen_website,khairyKY/portfolio' && JSON.stringify(lastSave(state)?.rules) === JSON.stringify(RULES), JSON.stringify(lastSave(state)))
  check('add repo: the chip shows at once', ((await card.textContent()) ?? '').includes('portfolio'))
  check('add repo: a sync starts so its issues arrive now', state.fns.some((f) => f.name === 'github-sync'))

  // ✕ removes
  await page.getByRole('button', { name: 'Stop watching khairyKY/portfolio' }).click()
  await sleep(700)
  check('✕: saves without that repo', lastSave(state)?.repos === 'khairyKY/kais-flow,khairyKY/shaheen_website', lastSave(state)?.repos)
  check('✕: the chip is gone', !((await card.textContent()) ?? '').includes('portfolio'))

  // Straight to Tasks
  await segBtn(page, 'New issues land in', 'Straight to Tasks').click()
  await sleep(700)
  check('tasks: saves land: tasks (repos unchanged)', lastSave(state)?.rules?.land === 'tasks' && lastSave(state)?.repos === 'khairyKY/kais-flow,khairyKY/shaheen_website', JSON.stringify(lastSave(state)))
  const t2 = (await card.textContent()) ?? ''
  check('tasks: the help line says how they land, the card and its link follow', t2.includes('As tasks with no project, linked to the issue') && t2.includes('Open issues come straight into Tasks') && (await page.getByRole('link', { name: 'See your tasks →' }).count()) === 1)
  await card.screenshot({ path: path.join(OUT, 'desktop-github-card-tasks.png') })
  await segBtn(page, 'New issues land in', 'Inbox').click()
  await sleep(500)

  // priority
  await segBtn(page, 'Priority in inbox ordering', 'High').click()
  await sleep(600)
  check('priority: saves priority high', lastSave(state)?.rules?.priority === 'high', JSON.stringify(lastSave(state)?.rules))

  // Pause, then Sync now
  await page.getByRole('switch', { name: 'Pause GitHub' }).click()
  await sleep(700)
  check('pause: saves paused: true', lastSave(state)?.rules?.paused === true)
  const t3 = (await card.textContent()) ?? ''
  check('pause: the status reads Paused and the row says nothing syncs', t3.includes('@kai · Paused') && t3.includes('Nothing syncs until you turn this off'), t3.slice(0, 160))
  await page.getByRole('button', { name: 'Sync now' }).click()
  await sleep(900)
  check('pause: Sync now says it is paused', ((await card.textContent()) ?? '').includes('GitHub is paused — turn Pause off to sync again.'))
  await card.screenshot({ path: path.join(OUT, 'desktop-github-card-paused.png') })
  check('every save went through github-connect (no direct write to integrations)', !state.writes.some((w) => w.table === 'integrations'))
  check('desktop: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 2. Other states: legacy help, failing (no panel), a failed save, the summary row ──
{
  const { ctx, page, errors } = await open('desktop', '/settings', { integrations: [gh({ rules: null })] })
  await toIntegrations(page)
  const txt = (await ghCard(page).textContent()) ?? ''
  check('legacy row (rules never saved): defaults shown, help says assigned issues still come', txt.includes('Every open issue in these, plus any assigned to you') && (await segBtn(page, 'New issues land in', 'Inbox').getAttribute('aria-pressed')) === 'true')
  check('legacy: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open('desktop', '/settings', { integrations: [gh({ status: 'failing' })] })
  await toIntegrations(page)
  check('failing token: no rules panel (Reconnect first)', (await page.locator('.st-gh-rules').count()) === 0 && (await bodyText(page)).includes('Reconnect'))
  await ctx.close()
}
{
  const { ctx, page, state } = await open('desktop', '/settings', { integrations: [gh()] }, { failSave: true })
  await toIntegrations(page)
  await page.getByRole('switch', { name: 'Pause GitHub' }).click()
  await sleep(1200)
  check('failed save: says so', ((await ghCard(page).textContent()) ?? '').includes('Couldn’t reach GitHub — try again in a minute.'))
  check('failed save: the switch goes back to what the server has', (await page.getByRole('switch', { name: 'Pause GitHub' }).getAttribute('aria-checked')) === 'false' && rulesSaves(state).length === 1)
  await ctx.close()
}
{
  const { ctx, page } = await open('desktop', '/settings/integrations', { integrations: [gh({ rules: { ...RULES, land: 'tasks', paused: true } })] })
  const summary = page.locator('#settings-Integrations')
  const t = (await summary.textContent()) ?? ''
  check('summary row: says where issues land and that it is paused', t.includes('Issues land straight in Tasks') && t.includes('Paused'), t)
  await ctx.close()
}

// ── 3. Phone + day/night shots ──
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open('desktop', '/settings', { integrations: [gh()] }, { theme })
  await toIntegrations(page)
  await page.screenshot({ path: path.join(OUT, `desktop-integrations-${theme}.png`) })
  await ghCard(page).screenshot({ path: path.join(OUT, `desktop-github-card-${theme}.png`) })
  check(`desktop ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
for (const theme of ['day', 'night']) {
  const { ctx, page, state, errors } = await open('phone', '/settings', { integrations: [gh()] }, { theme })
  await toIntegrations(page)
  const card = ghCard(page)
  await card.scrollIntoViewIfNeeded()
  await sleep(300)
  check(`phone ${theme}: the panel is in Settings → Integrations › GitHub`, (await card.count()) === 1 && ((await card.textContent()) ?? '').includes('Rules · how GitHub lands'))
  const wide = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`phone ${theme}: no sideways scroll at 390`, wide <= 390, wide)
  const segH = await segBtn(page, 'New issues land in', 'Straight to Tasks').evaluate((e) => e.getBoundingClientRect().height)
  const tgl = await page.getByRole('switch', { name: 'Pause GitHub' }).evaluate((e) => e.getBoundingClientRect().height)
  check(`phone ${theme}: segments and the switch are touch-sized (≥44)`, segH >= 44 && tgl >= 32, `segment ${segH}, switch ${tgl} (48 hit)`)
  const x = await page.getByRole('button', { name: 'Stop watching khairyKY/kais-flow' }).evaluate((e) => { const s = getComputedStyle(e, '::after'); return s.content !== 'none' ? s.inset : 'none' })
  check(`phone ${theme}: the chip ✕ has the kit hit area`, x !== 'none', x)
  if (theme === 'day') {
    await page.getByRole('switch', { name: 'Pause GitHub' }).click()
    await sleep(700)
    check('phone: Pause saves through github-connect', lastSave(state)?.rules?.paused === true)
    await page.getByRole('switch', { name: 'Pause GitHub' }).click()
    await sleep(700)
  }
  await card.screenshot({ path: path.join(OUT, `phone-github-card-${theme}.png`) })
  // The card is taller than the phone's screen, so the panel gets its own shot clear of the tab bar.
  await page.locator('.st-gh-rules').evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await sleep(300)
  await page.locator('.st-gh-rules').screenshot({ path: path.join(OUT, `phone-github-rules-${theme}.png`) })
  check(`phone ${theme}: no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── 4. The Inbox honours the priority ──
const order = (page) => page.evaluate(() => [...document.querySelectorAll('.ib-list, .ib-gh-sec')].map((e) => (e.classList.contains('ib-list') ? 'captures' : 'github')))
for (const view of ['desktop', 'phone']) {
  for (const priority of ['normal', 'high', 'low']) {
    const { ctx, page, errors } = await open(view, '/inbox', { inbox_items: INBOX, integrations: [gh({ rules: { ...RULES, priority } })] })
    await page.locator('.ib-gh-sec').waitFor({ timeout: 10000 }).catch(() => {})
    const o = await order(page)
    const rows = await page.locator('.ib-gh-sec .ib-gh').count()
    if (priority === 'normal') check(`${view} inbox normal: GitHub letters below your captures (as before)`, JSON.stringify(o) === '["captures","github"]' && rows === 2, JSON.stringify(o))
    if (priority === 'high') check(`${view} inbox high: GitHub letters above your captures`, JSON.stringify(o) === '["github","captures"]' && rows === 2, JSON.stringify(o))
    if (priority === 'low') {
      check(`${view} inbox low: below, folded to the heading`, JSON.stringify(o) === '["captures","github"]' && rows === 0, `${JSON.stringify(o)} rows ${rows}`)
      await page.screenshot({ path: path.join(OUT, `${view}-inbox-low-folded.png`), fullPage: true })
      await page.getByRole('button', { name: 'Show 2' }).click()
      await sleep(400)
      check(`${view} inbox low: "Show 2" unfolds them`, (await page.locator('.ib-gh-sec .ib-gh').count()) === 2)
    }
    if (priority !== 'low') await page.screenshot({ path: path.join(OUT, `${view}-inbox-${priority}.png`), fullPage: true })
    check(`${view} inbox ${priority}: no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

// ── 5. Side by side with Settings.dc.html 2a (the design draws desktop only; the phone uses the same card) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1300 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(DESIGN, { waitUntil: 'networkidle' }).catch(() => {})
  await sleep(1500)
  await page.locator('[id="2a"] .scard').first().screenshot({ path: path.join(OUT, 'design-2a-github.png') })
  await page.locator('[id="2a"] .dv-card').screenshot({ path: path.join(OUT, 'design-2a.png') })
  // Same scale for both (1 css px = 1 px): the app card is taller only because it carries the
  // status line and the Sync now / Disconnect buttons above the panel.
  const pair = async (design, app, name) => {
    const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString('base64')}`
    await page.setContent(`<body style="margin:0;background:#ddd;display:flex;gap:16px;padding:16px;align-items:flex-start;font:12px sans-serif">
      <figure style="margin:0"><figcaption>design ${design.replace('.png', '')}</figcaption><img src="${img(design)}"></figure>
      <figure style="margin:0"><figcaption>app ${app.replace('.png', '')}</figcaption><img src="${img(app)}"></figure></body>`)
    await sleep(300)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  }
  for (const t of ['day', 'night']) {
    await pair('design-2a-github.png', `desktop-github-card-${t}.png`, `side-2a-desktop-${t}`)
    await pair('design-2a-github.png', `phone-github-rules-${t}.png`, `side-2a-phone-${t}`)
  }
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
