// ios-pwa: Lighthouse mobile (12.8.2, default Slow 4G + 4x CPU, simulated) on a mock-mode production build,
// for /sign-in and a signed-in /today.
//   node lighthouse.mjs <distDir> <outDir> <label>   (LH_MODULES=<node_modules holding lighthouse 12.8.2 + puppeteer-core>)
// The build must be `vite build --mode mock` with VITE_SUPABASE_URL=http://127.0.0.1:59999 in the environment.
// This serves <distDir> with an SPA fallback on :5336, answers the REST API on :59999 with a small fixed day
// (CORS open), and puts a session in localStorage from /privacy.html, a static page that loads none of the app.
// Lighthouse then runs with --disable-storage-reset, so the session survives and the HTTP cache is still cold.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

const [DIST, OUT, LABEL] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-00000000cc11'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const now = new Date()
const at = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).toISOString()
const C = '2026-01-01T00:00:00Z'
const task = (n, title, over = {}) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo',
  due_at: null, scheduled_start: null, scheduled_end: null, top3: false, top3_rank: null, snoozed_until: null, recurrence_rule: null, labels: [], priority: null,
  duration_min: null, someday: false, reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null,
  parent_task_id: null, slot_id: null, slot_date: null, created_at: C, updated_at: C, ...over,
})
const ROWS = {
  tasks: [
    task(1, 'Finish the CNN backprop notes', { top3: true, top3_rank: 1, due_at: at(9) }),
    task(2, 'Problem set 4', { top3: true, top3_rank: 2, due_at: at(9) }),
    task(3, 'Email the TA', { due_at: at(9) }),
    task(4, 'Pay the internet bill', { due_at: at(9) }),
  ],
  inbox_items: [{ id: 'b0000000-0000-4000-8000-000000000001', user_id: UID, raw_text: 'Look into a new phone plan', source: 'text', status: 'pending', created_at: C, updated_at: C }],
  app_settings: [{ id: 'a0000000-0000-4000-8000-000000000001', user_id: UID, onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', help_seen: ['hint:calendar', 'hint:today', 'hint:inbox', 'hint:tasks'], created_at: C, updated_at: C }],
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' }
const api = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
  if (url.pathname.startsWith('/auth/v1/user')) return res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(user))
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(201, { ...cors, 'content-type': 'application/json' }).end('[]')
  const rows = ROWS[url.pathname.replace('/rest/v1/', '')] ?? []
  if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
    return rows.length ? res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(rows[0])) : res.writeHead(406, { ...cors, 'content-type': 'application/json' }).end('{"code":"PGRST116"}')
  }
  res.writeHead(200, { ...cors, 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` }).end(JSON.stringify(rows))
}).listen(59999, '127.0.0.1')

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' }
const web = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let f = path.join(DIST, p)
  if (!f.startsWith(path.resolve(DIST)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html')
  const type = TYPES[path.extname(f)] ?? 'application/octet-stream'
  // gzip text like the real host (Cloudflare compresses), or Lighthouse prices every script at its raw size.
  if (/text|javascript|json|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    return res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'accept-encoding' }).end(zlib.gzipSync(fs.readFileSync(f)))
  }
  res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(f))
}).listen(5336, '127.0.0.1')

// Lighthouse's own Node API on a puppeteer page (both from the npx cache of lighthouse@12.8.2; pass its node_modules
// as LH_MODULES): the session goes into localStorage from /privacy.html, a static page that loads none of the app, then
// /today runs with disableStorageReset, so the session survives and the HTTP cache is still cold. /sign-in runs after
// with the default storage reset, which also signs out.
const MODS = process.env.LH_MODULES ?? 'D:/Coding/Environment_Caches/npm/_npx/8003d8991b0d346b/node_modules'
const puppeteer = (await import(pathToFileURL(`${MODS}/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js`).href)).default
const { navigation, generateReport } = await import(pathToFileURL(`${MODS}/lighthouse/core/index.js`).href)
// Lighthouse swings run to run on a busy machine: each page runs RUNS times (default 3), the median score is reported.
const RUNS = Number(process.env.RUNS ?? 3)
const summary = {}
for (let run = 0; run < RUNS; run++)
for (const [name, route, signedIn] of [['today', '/today', true], ['sign-in', '/sign-in', false]]) {
  // Every run in a fresh browser: no service worker or HTTP cache left from the run before (a second /today was
  // served from the precache), and signed out really is signed out.
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage()
  if (signedIn) {
    await page.goto('http://127.0.0.1:5336/privacy.html')
    await page.evaluate((sess, uid) => {
      localStorage.setItem('kf_theme', 'day')
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: '99.0.0', notified: '99.0.0', checkedAt: Date.now() }))
    }, JSON.stringify(session), UID)
  }
  const res = await navigation(page, `http://127.0.0.1:5336${route}`, { flags: { disableStorageReset: signedIn, onlyCategories: ['performance', 'accessibility', 'best-practices'] } })
  const r = res.lhr
  const file = path.join(OUT, `lighthouse-${LABEL}-${name}-${run + 1}`)
  fs.writeFileSync(`${file}.report.html`, generateReport(r, 'html'))
  fs.writeFileSync(`${file}.report.json`, JSON.stringify(r))
  const a = r.audits
  ;(summary[name] ??= []).push({
    finalUrl: r.finalDisplayedUrl,
    performance: Math.round(r.categories.performance.score * 100),
    accessibility: Math.round(r.categories.accessibility.score * 100),
    bestPractices: Math.round(r.categories['best-practices'].score * 100),
    FCP: a['first-contentful-paint'].displayValue, LCP: a['largest-contentful-paint'].displayValue, SI: a['speed-index'].displayValue,
    TBT: a['total-blocking-time'].displayValue, CLS: a['cumulative-layout-shift'].displayValue, TTI: a.interactive?.displayValue,
    weightKiB: Math.round(a['total-byte-weight'].numericValue / 1024),
  })
  console.log(name, JSON.stringify(summary[name].at(-1)))
  await browser.close()
}
for (const name of Object.keys(summary)) {
  const runs = summary[name].toSorted((x, y) => x.performance - y.performance)
  summary[name] = { median: runs[Math.floor(runs.length / 2)], runs: summary[name].map((x) => x.performance) }
  console.log('median', name, JSON.stringify(summary[name]))
}
fs.writeFileSync(path.join(OUT, `lighthouse-${LABEL}.json`), JSON.stringify(summary, null, 2))
api.close()
web.close()
