// export (2026-10-17, gap audit #1 "no data export or backup", Kai: build it): Settings → Your data →
// "Export your data" — Everything (.json), Tasks (.csv), Calendar (.ics). Clicks each, captures the
// download (a Blob download in a browser tab, the PWA and the Windows app) and reads the file back:
// the envelope and every owned table (no keys, no tokens), 1,234 tasks over two pages with progress
// ("Exporting… tasks 1,000"), the CSV's BOM / escaping / names / clock, the ICS's events (not Google's,
// not Trash), RRULE + TZID, folding. The Android app is simulated: a fake native bridge answers
// Filesystem.writeFile and Share.share, so its path (cache file → share sheet) is checked too.
// The real app signed in against a mocked backend (download-bar's recipe), desktop 1280×800 + phone
// 390×844, day + night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1')
const BASE = process.argv[3] ?? 'http://localhost:5291'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000e4a0'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const T = '2026-10-01T09:00:00Z'
const id = (n, p = '1') => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SETTINGS = { id: true, user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', timezone: 'Africa/Cairo', created_at: T, updated_at: T }
const base = { user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: true, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null, created_at: T, updated_at: T }
const P1 = id(1, 'b')
const A1 = id(1, 'c')
const D1 = id(1, 'd')
const PARENT = id(1)
const TASKS = [
  { ...base, id: PARENT, title: 'Launch, the "big" one 🚀', project_id: P1, area_id: A1, domain_id: D1, labels: ['Urgent', 'Deep work'], priority: 2, duration_min: 45, someday: false, scheduled_start: '2026-10-17T07:00:00Z', scheduled_end: '2026-10-17T07:45:00Z', notes: 'Line one\nline two' },
  { ...base, id: id(2), title: 'اكتب النص', parent_task_id: PARENT, status: 'done', completed_at: '2026-10-02T10:15:00Z' },
  { ...base, id: id(3), title: '=1+1 sums' },
  { ...base, id: id(4), title: 'Old idea', deleted_at: '2026-10-03T00:00:00Z' },
  ...Array.from({ length: 1230 }, (_, i) => ({ ...base, id: id(10 + i), title: `Someday thing ${i + 1}` })),
]
const LIVE_TASKS = TASKS.filter((t) => !t.deleted_at).length
const ev = (o) => ({ user_id: UID, all_day: false, task_id: null, source: 'native', gcal_id: null, gcal_etag: null, busy: true, type: 'event', color: null, deleted_at: null, recurrence_rule: null, recurrence_exdates: [], series_id: null, project_id: null, created_at: T, updated_at: T, ...o })
const EVENTS = [
  ev({ id: id(1, 'e'), title: 'Dentist, then lunch; maybe', starts_at: '2026-10-18T07:00:00Z', ends_at: '2026-10-18T08:00:00Z' }),
  ev({ id: id(2, 'e'), title: 'Trip', all_day: true, starts_at: '2026-10-20T00:00:00Z', ends_at: '2026-10-22T00:00:00Z', busy: false }),
  ev({ id: id(3, 'e'), title: 'Standup', starts_at: '2026-10-05T06:00:00Z', ends_at: '2026-10-05T06:15:00Z', recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO', recurrence_exdates: ['2026-10-12T06:00:00.000Z'] }),
  ev({ id: id(4, 'e'), title: 'Launch, the "big" one 🚀', type: 'task', task_id: PARENT, starts_at: '2026-10-17T07:00:00Z', ends_at: '2026-10-17T07:45:00Z' }),
  ev({ id: id(5, 'e'), title: 'From Google', source: 'gcal', gcal_id: 'g1', starts_at: '2026-10-19T08:00:00Z', ends_at: '2026-10-19T09:00:00Z' }),
  ev({ id: id(6, 'e'), title: 'Gone', deleted_at: T, starts_at: '2026-10-19T10:00:00Z', ends_at: '2026-10-19T11:00:00Z' }),
]
const OWN_EVENTS = EVENTS.filter((e) => e.source !== 'gcal' && !e.deleted_at)
const ROWS = {
  app_settings: [SETTINGS],
  tasks: TASKS,
  projects: [{ id: P1, user_id: UID, domain_id: D1, name: 'Website', type: 'standard', status: 'active', milestones: [], checklist: [], deleted_at: null, created_at: T, updated_at: T }],
  areas: [{ id: A1, user_id: UID, name: 'Work', domain_id: D1, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }],
  domains: [{ id: D1, user_id: UID, name: 'Shaheen', color: null, sort_order: 0, deleted_at: null, created_at: T, updated_at: T }],
  calendar_events: EVENTS,
  journal_entries: [{ id: id(1, 'f'), user_id: UID, body: 'A private line', entry_date: '2026-10-16', mood: null, transcript: null, media_paths: [], gratitude: [], deleted_at: null, created_at: T, updated_at: T }],
  people: [{ id: id(2, 'f'), user_id: UID, name: 'Sara', facts: {}, domain_id: null, created_at: T, updated_at: T }],
  // Secrets the Settings page reads for its status rows: none of them may reach a file.
  mcp_keys: [{ id: id(3, 'f'), user_id: UID, key_hash: 'SECRET_MCP_HASH_0123456789', scope: 'read', scopes: [], created_at: T, updated_at: T }],
  capture_keys: [{ id: id(4, 'f'), user_id: UID, key_hash: 'SECRET_CAPTURE_HASH_0123456789', created_at: T, updated_at: T }],
  push_subscriptions: [{ id: id(5, 'f'), user_id: UID, endpoint: 'https://push.example/SECRET_ENDPOINT', keys: { auth: 'SECRET_PUSH_AUTH' }, device_label: 'x', created_at: T }],
}
const SECRETS = ['SECRET_MCP_HASH', 'SECRET_CAPTURE_HASH', 'SECRET_ENDPOINT', 'SECRET_PUSH_AUTH']
const TABLES = ['app_settings', 'domains', 'areas', 'projects', 'tasks', 'inbox_items', 'calendar_events', 'routines', 'routine_completions', 'time_entries', 'journal_entries', 'people', 'interactions', 'books', 'notes', 'quotes', 'commentary', 'captures', 'resurfaced_log', 'activity_log', 'smart_lists']
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
const NAMES = { json: `kais-flow-${DAY}.json`, csv: `kais-flow-tasks-${DAY}.csv`, ics: `kais-flow-calendar-${DAY}.ics` }
const LABELS = { json: 'Everything (.json)', csv: 'Tasks (.csv)', ics: 'Calendar (.ics)' }

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const desktop = { viewport: { width: 1280, height: 800 }, userAgent: WINDOWS_UA }
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID_UA }

/** A fresh device on /settings. `shell`: 'tauri' | 'android' (fake bridge answering Filesystem + Share). */
async function open(o = {}) {
  const ctx = await browser.newContext({ ...(o.view ?? desktop), deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US', acceptDownloads: true })
  await ctx.addInitScript(([t, sess, uid, shell, shareCancels]) => {
    localStorage.setItem('kf_theme', t)
    localStorage.setItem('sb-127-auth-token', sess)
    localStorage.setItem('kf-app-zone', 'Africa/Cairo')
    localStorage.setItem('kf-download-bar-dismissed', '1')
    localStorage.setItem('kf-whats-new:' + uid, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    if (shell === 'tauri') window.__TAURI_INTERNALS__ = { invoke: async () => null, transformCallback: () => 0, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } } }
    if (shell === 'android') {
      window.androidBridge = { postMessage() {} }
      window.__native = []
      window.Capacitor = {
        PluginHeaders: [
          { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
          { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
        ],
        nativePromise: async (plugin, method, options) => {
          window.__native.push({ plugin, method, options })
          if (plugin === 'Filesystem') return { uri: `file:///data/user/0/com.kaisflow.garden/cache/${options.path}` }
          if (shareCancels) throw new Error('Share canceled')
          return {}
        },
      }
    }
  }, [o.theme ?? 'day', JSON.stringify(session), UID, o.shell ?? null, !!o.shareCancels])
  const asked = []
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const table = url.pathname.replace('/rest/v1/', '')
    asked.push({ table, at: Date.now(), offset: url.searchParams.get('offset'), select: url.searchParams.get('select') })
    const all = ROWS[table] ?? []
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : all.length
    const rows = all.slice(offset, offset + limit)
    if (table === 'tasks' && url.searchParams.has('offset')) await sleep(350) // time to read the progress line
    if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }).catch(() => {}) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } }).catch(() => {})
    return r.fulfill({ json: rows, headers: { 'content-range': `${offset}-${Math.max(offset, offset + rows.length - 1)}/${all.length}` } }).catch(() => {})
  })
  await ctx.route('https://*.github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  await ctx.route('https://github.com/**', (r) => r.fulfill({ status: 404, body: '' }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await sleep(1500)
  return { ctx, page, errors, asked }
}

const exportRow = (page) => page.locator('#settings-Data .st-row', { hasText: 'Export your data' })
const watchProgress = (page) =>
  page.evaluate(() => {
    window.__progress = []
    const row = [...document.querySelectorAll('#settings-Data .st-row')].find((r) => r.textContent.includes('Export your data'))
    const status = row.querySelector('[role=status]')
    new MutationObserver(() => window.__progress.push(status.textContent)).observe(status, { childList: true, characterData: true, subtree: true })
  })
const toastFor = (page, text) => page.getByText(text, { exact: true }).first()

function checkJson(tag, text, asked, since) {
  let j
  try {
    j = JSON.parse(text)
  } catch (e) {
    return check(`${tag} json parses`, false, e.message)
  }
  check(`${tag} json envelope { app, version, exported_at, tables }`, j.app === "Kai's Flow" && /^\d+\.\d+\.\d+$/.test(j.version) && !Number.isNaN(Date.parse(j.exported_at)) && typeof j.tables === 'object', JSON.stringify({ app: j.app, version: j.version, exported_at: j.exported_at }))
  check(`${tag} json has every owned table, and only those`, JSON.stringify(Object.keys(j.tables)) === JSON.stringify(TABLES), Object.keys(j.tables).join(','))
  check(`${tag} json tasks: all ${TASKS.length} over two pages, Trash included and flagged`, j.tables.tasks.length === TASKS.length && j.tables.tasks.some((t) => t.title === 'Old idea' && t.deleted_at), j.tables.tasks.length)
  check(`${tag} json calendar_events / journal / people rows as stored`, j.tables.calendar_events.length === EVENTS.length && j.tables.journal_entries[0]?.body === 'A private line' && j.tables.people[0]?.name === 'Sara')
  check(`${tag} json carries no key, hash or token`, !SECRETS.some((s) => text.includes(s)) && !('mcp_keys' in j.tables) && !('integrations' in j.tables) && !('capture_keys' in j.tables) && !('push_subscriptions' in j.tables))
  const during = asked.filter((a) => a.at >= since)
  check(`${tag} the export never asked for integrations / keys / push subscriptions`, !during.some((a) => ['integrations', 'mcp_keys', 'capture_keys', 'push_subscriptions'].includes(a.table)), [...new Set(during.map((a) => a.table))].join(','))
  const pages = during.filter((a) => a.table === 'tasks').map((a) => a.offset)
  check(`${tag} tasks read 1000 a page, without the search columns`, JSON.stringify(pages) === '["0","1000"]' && during.filter((a) => a.table === 'tasks').every((a) => a.select && !a.select.includes('embedding') && a.select !== '*'), JSON.stringify(pages))
}

function checkCsv(tag, buf) {
  check(`${tag} csv starts with a UTF-8 BOM`, buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, [...buf.subarray(0, 3)].join(','))
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
  const lines = text.split('\r\n')
  check(`${tag} csv header`, lines[0] === 'Title,Status,Due date,Scheduled start,Scheduled end,Duration (min),Priority,Labels,Project,Area,Domain,Parent task,Notes,Created,Completed', lines[0])
  // Rows = records; the parent's notes hold one quoted newline (\n, not \r\n), so CRLF splits records.
  check(`${tag} csv one row per task outside Trash (${LIVE_TASKS})`, lines.filter(Boolean).length - 1 === LIVE_TASKS && !text.includes('Old idea'), lines.filter(Boolean).length - 1)
  check(`${tag} csv quoting, names not ids, the user's clock`, lines[1] === '"Launch, the ""big"" one 🚀",To do,,2026-10-17 10:00,2026-10-17 10:45,45,High,"Urgent, Deep work",Website,Work,Shaheen,,"Line one\nline two",2026-10-01 12:00,', lines[1])
  check(`${tag} csv Arabic intact, the subtask names its parent`, lines[2] === 'اكتب النص,Done,,,,,,,,,,"Launch, the ""big"" one 🚀",,2026-10-01 12:00,2026-10-02 13:15', lines[2])
  check(`${tag} csv a formula is shown, not run`, lines[3].startsWith("'=1+1 sums,"), lines[3])
}

function checkIcs(tag, buf) {
  const text = buf.toString('utf8')
  const physical = text.split('\r\n')
  check(`${tag} ics VCALENDAR, CRLF only`, text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && text.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(text))
  check(`${tag} ics every line ≤ 75 octets`, physical.every((l) => Buffer.byteLength(l) <= 75), Math.max(...physical.map((l) => Buffer.byteLength(l))))
  const un = text.replace(/\r\n /g, '')
  const uids = [...un.matchAll(/^UID:(.+)$/gm)].map((m) => m[1].trim())
  check(`${tag} ics own events + task block, not Google's, not Trash (UID = row id)`, JSON.stringify(uids.sort()) === JSON.stringify(OWN_EVENTS.map((e) => e.id).sort()), uids.join(','))
  check(`${tag} ics one-off in UTC, text escaped`, un.includes('DTSTART:20261018T070000Z\r\nDTEND:20261018T080000Z') && un.includes('SUMMARY:Dentist\\, then lunch\\; maybe'))
  check(`${tag} ics all-day as dates (end exclusive), free = TRANSPARENT`, un.includes('DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261022') && un.includes('TRANSP:TRANSPARENT'))
  check(`${tag} ics the repeat: TZID wall clock, RRULE, EXDATE`, un.includes('DTSTART;TZID=Africa/Cairo:20261005T090000') && un.includes('RRULE:FREQ=WEEKLY;BYDAY=MO') && un.includes('EXDATE;TZID=Africa/Cairo:20261012T090000'))
  check(`${tag} ics the task block's emoji title survives folding`, un.includes('SUMMARY:Launch\\, the "big" one 🚀'))
}

async function runOne(tag, page, asked, kind, errors) {
  await watchProgress(page)
  const since = Date.now()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), exportRow(page).getByRole('button', { name: LABELS[kind] }).click()])
  check(`${tag} ${kind}: the file is named ${NAMES[kind]}`, dl.suggestedFilename() === NAMES[kind], dl.suggestedFilename())
  const file = path.join(OUT, '_dl-' + NAMES[kind])
  await dl.saveAs(file)
  const buf = fs.readFileSync(file)
  fs.unlinkSync(file)
  if (kind === 'json') checkJson(`${tag} ${kind}:`, buf.toString('utf8'), asked, since)
  if (kind === 'csv') checkCsv(`${tag} ${kind}:`, buf)
  if (kind === 'ics') checkIcs(`${tag} ${kind}:`, buf)
  // Two toasts show at once, 6 s each; a third waits its turn (toastStore), so give it time.
  await page.mouse.move(1, 1)
  await toastFor(page, `Saved ${NAMES[kind]}`).waitFor({ timeout: 15000 }).catch(() => {})
  check(`${tag} ${kind}: toast "Saved ${NAMES[kind]}"`, await toastFor(page, `Saved ${NAMES[kind]}`).isVisible().catch(() => false))
  const seen = await page.evaluate(() => window.__progress)
  if (kind !== 'ics') check(`${tag} ${kind}: progress "Exporting… tasks 1,000" while it reads`, seen.some((s) => s === 'Exporting… tasks 1,000'), JSON.stringify([...new Set(seen)].slice(0, 6)))
  check(`${tag} ${kind}: the row settles back to its help line`, (await exportRow(page).locator('[role=status]').innerText()) === 'A copy for you to keep · it can’t be imported back yet')
}

// ── desktop + phone, day + night: each export, read back ──
for (const [size, view] of [['desktop', desktop], ['phone', phone]]) for (const theme of ['day', 'night']) {
  const tag = `${size}-${theme}`
  const { ctx, page, errors, asked } = await open({ view, theme })
  const row = exportRow(page)
  check(`${tag} Settings → Your data has "Export your data"`, (await row.count()) === 1)
  check(`${tag} three choices`, JSON.stringify(await row.getByRole('button').allInnerTexts()) === JSON.stringify(Object.values(LABELS)), JSON.stringify(await row.getByRole('button').allInnerTexts()))
  await row.scrollIntoViewIfNeeded()
  const boxes = await Promise.all((await row.getByRole('button').all()).map((b) => b.boundingBox()))
  const vw = view.viewport.width
  check(`${tag} the buttons fit the screen${size === 'phone' ? ', 44px+ tall' : ''}`, boxes.every((b) => b && b.x >= 0 && b.x + b.width <= vw && (size !== 'phone' || b.height >= 44)), JSON.stringify(boxes.map((b) => b && [Math.round(b.x), Math.round(b.width), Math.round(b.height)])))
  const m = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }))
  check(`${tag} no sideways scroll`, m.sw <= m.iw + 1, JSON.stringify(m))
  await page.mouse.move(1, 1)
  await page.locator('#settings-Data').screenshot({ path: path.join(OUT, `${tag}-card.png`) })
  if (tag === 'desktop-day') {
    // Mid-export: the help line reads the progress.
    const done = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
    await row.getByRole('button', { name: LABELS.json }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('#settings-Data [role=status]')].some((s) => /tasks 1,000/.test(s.textContent)), null, { timeout: 10000 }).catch(() => {})
    await page.locator('#settings-Data').screenshot({ path: path.join(OUT, `${tag}-progress.png`) })
    check(`${tag} the buttons wait while one runs`, (await row.getByRole('button', { name: LABELS.csv }).isDisabled()) && (await row.getByRole('button', { name: LABELS.json }).getAttribute('aria-busy')) === 'true')
    await done
    await sleep(800)
  }
  for (const kind of ['json', 'csv', 'ics']) await runOne(tag, page, asked, kind, errors)
  await page.mouse.move(1, 1)
  await page.screenshot({ path: path.join(OUT, `${tag}-toast.png`) })
  check(`${tag} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the Windows app (Tauri bridge present): the same Blob download ──
{
  const { ctx, page, errors, asked } = await open({ shell: 'tauri' })
  await runOne('tauri', page, asked, 'csv', errors)
  check('tauri no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ── the Android app (simulated bridge): cache file → share sheet; cancel stays quiet ──
for (const cancels of [false, true]) {
  const tag = cancels ? 'android-cancel' : 'android'
  const { ctx, page, errors } = await open({ view: phone, shell: 'android', shareCancels: cancels })
  let downloaded = false
  page.on('download', () => (downloaded = true))
  await exportRow(page).getByRole('button', { name: LABELS.ics }).click()
  await page.waitForFunction(() => window.__native?.some((c) => c.plugin === 'Share'), null, { timeout: 15000 }).catch(() => {})
  await sleep(600)
  const calls = await page.evaluate(() => window.__native)
  const write = calls.find((c) => c.plugin === 'Filesystem' && c.method === 'writeFile')
  const share = calls.find((c) => c.plugin === 'Share' && c.method === 'share')
  check(`${tag} writes ${NAMES.ics} to the app's cache as UTF-8`, write && write.options.path === NAMES.ics && write.options.directory === 'CACHE' && write.options.encoding === 'utf8' && write.options.data.startsWith('BEGIN:VCALENDAR'), JSON.stringify(write && { ...write.options, data: write.options.data.slice(0, 20) }))
  check(`${tag} opens the share sheet on that file`, share && JSON.stringify(share.options.files) === JSON.stringify([`file:///data/user/0/com.kaisflow.garden/cache/${NAMES.ics}`]) && share.options.title === NAMES.ics, JSON.stringify(share?.options))
  check(`${tag} no Blob download inside the Android app`, !downloaded)
  const shared = await toastFor(page, `Shared ${NAMES.ics}`).isVisible().catch(() => false)
  const failed = await page.getByText(/Couldn’t export/).count()
  check(`${tag} ${cancels ? 'closing the sheet: no toast, no error' : 'toast "Shared …"'}`, cancels ? !shared && failed === 0 : shared)
  if (!cancels) {
    await page.mouse.move(1, 1)
    await page.screenshot({ path: path.join(OUT, 'android-shared.png') })
  }
  // The fake bridge answers only Filesystem and Share; App / LocalNotifications asking it is the fake's gap.
  const real = errors.filter((e) => !/plugin is not implemented on android/.test(e))
  check(`${tag} no page errors (beyond the fake bridge's missing plugins)`, real.length === 0, real.join(' | '))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
