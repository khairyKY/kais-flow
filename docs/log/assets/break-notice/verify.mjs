// v1.6.4 F4: a notification when a focus break ends, on the REAL app against a MOCKED backend (the notif-sounds
// recipe). The focus session is seeded into localStorage (focusStore's kf_focus_session) as a break with 8 s left,
// so the real ticker runs it out; the Windows app is a stub __TAURI_INTERNALS__ recording notify_local, window.Audio
// a stub recording what would have played, document.hasFocus() is switched per case.
//   1. Auto-start off: "Break’s over" · Ready for round 2? · Start / Stop, the pack's break_end sound; the toast's
//      Start begins round 2, Stop leaves it stopped.
//   2. Auto-start on: "Back to it" · Round 2 of 4, no buttons.
//   3. Focus notifications off: nothing, no sound. Looking at the app: no toast, but the break_end sound.
//   4. A round ending is still "N minutes tended" (and no break notice).
//   node verify.mjs <outDir> [baseUrl=http://localhost:5254] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? '.'
const BASE = process.argv[3] ?? 'http://localhost:5254'
const PW = process.argv[4] ?? 'D:/Installations/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000095f4'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'break@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
const CREATED = '2026-09-20T12:00:00.000Z'
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Kai', workspace_name: 'Personal', quiet_hours_on: false, lock_screen_names: false, notification_sound_pack: 'felt', review_reminder_on: false, created_at: CREATED, updated_at: CREATED }
const FOCUS = { focusRoundMin: 25, shortBreakMin: 5, longBreakMin: 20, roundsBeforeLongBreak: 4, autoStartNextRound: false, autoStartBreaks: true, gentleChime: false, gardenViewOnLongBreaks: false, fitBlock: false, pill: true }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })

async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(
    ([sess, uid, focus, seed, looking]) => {
      localStorage.setItem('kf_theme', 'day')
      localStorage.setItem('kf-download-bar-dismissed', '1')
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
      localStorage.setItem('kf_focus_settings', JSON.stringify(focus))
      localStorage.setItem('kf_focus_session', JSON.stringify({ ...seed, savedAt: Date.now() }))
      window.__played = []
      window.Audio = class {
        constructor(src) { this.src = src }
        play() { window.__played.push(new URL(this.src, location.href).pathname); return Promise.resolve() }
        pause() {}
      }
      document.hasFocus = () => looking
      window.__tauriCalls = []
      window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => (window.__tauriCalls.push({ cmd, args: args ?? null }), cmd === 'autostart_get' ? false : null) }
    },
    [JSON.stringify(session), UID, { ...FOCUS, ...(o.focus ?? {}) }, o.seed, !!o.looking],
  )
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ status: 500, json: { error: 'mock' } })
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = table === 'app_settings' ? [o.settings ?? SETTINGS] : []
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
  return { ctx, page, errors }
}
const BREAK = { mode: 'break', isRunning: true, secondsLeft: 8, stopwatchSeconds: 0, stopwatchStartIso: '', stopwatchStartStr: '', currentRound: 1, breakType: 'short', activeTask: null, pomodoroStartIso: null, block: null, kept: 1 }
const ROUND = { ...BREAK, mode: 'pomodoro', secondsLeft: 8, kept: 0, pomodoroStartIso: new Date().toISOString() }
const toasts = (page) => page.evaluate(() => window.__tauriCalls.filter((c) => c.cmd === 'notify_local').map((c) => c.args))
const played = (page) => page.evaluate(() => window.__played.slice())
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kf_focus_session')))
const wait = () => sleep(12000) // the seeded 8 s run out (a cold page takes a few of them to mount), the toast reaches the stub

// 1
{
  const { ctx, page, errors } = await open({ seed: BREAK })
  await wait()
  const t = (await toasts(page)).filter((x) => x.title === 'Break’s over')
  check('1 auto-start off: one "Break’s over" toast', t.length === 1, JSON.stringify(await toasts(page)))
  check('1 … "Ready for round 2?" with Start / Stop', t[0]?.body === 'Ready for round 2?' && JSON.stringify(t[0].actions) === JSON.stringify([['focus_start', 'Start'], ['focus_stop', 'Stop']]), JSON.stringify(t[0]))
  check('1 … and the pack’s break_end sound (the toast goes out silent)', (await played(page)).includes('/notification-sounds/felt/break_end.wav') && t[0]?.silent === true, (await played(page)).join(' '))
  const s0 = await stored(page)
  check('1 the next round is waiting, not running', s0.mode === 'pomodoro' && s0.isRunning === false && s0.currentRound === 2, JSON.stringify(s0))
  await page.evaluate(() => window.__kfNotifyAction('focus_start', {}))
  await sleep(500)
  const s1 = await stored(page)
  check('1 Start begins round 2', s1.mode === 'pomodoro' && s1.isRunning === true && s1.currentRound === 2, JSON.stringify(s1))
  await page.evaluate(() => window.__kfNotifyAction('focus_stop', {}))
  await sleep(500)
  check('1 Stop leaves it stopped', (await stored(page)).isRunning === false)
  check('1 no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
// 2
{
  const { ctx, page } = await open({ seed: BREAK, focus: { autoStartNextRound: true } })
  await wait()
  const t = (await toasts(page)).filter((x) => x.title === 'Back to it')
  check('2 auto-start on: "Back to it" · Round 2 of 4, no buttons', t.length === 1 && t[0].body === 'Round 2 of 4' && t[0].actions.length === 0, JSON.stringify(await toasts(page)))
  check('2 … and the round is running', (await stored(page)).isRunning === true)
  await ctx.close()
}
// 3
{
  const off = await open({ seed: BREAK, settings: { ...SETTINGS, focus_done_on: false } })
  await wait()
  check('3 Focus notifications off: no toast', (await toasts(off.page)).length === 0, JSON.stringify(await toasts(off.page)))
  check('3 … and no sound', !(await played(off.page)).some((p) => p.includes('break_end')), (await played(off.page)).join(' '))
  await off.ctx.close()
  const here = await open({ seed: BREAK, looking: true })
  await wait()
  check('3 looking at the app: no toast', (await toasts(here.page)).length === 0, JSON.stringify(await toasts(here.page)))
  check('3 … but the break_end sound plays', (await played(here.page)).includes('/notification-sounds/felt/break_end.wav'), (await played(here.page)).join(' '))
  await here.ctx.close()
}
// 4
{
  const { ctx, page } = await open({ seed: ROUND })
  await wait()
  const ts = await toasts(page)
  check('4 a round ending: "25 minutes tended", no break notice', ts.some((x) => x.title === '25 minutes tended ✿') && !ts.some((x) => x.title === 'Break’s over' || x.title === 'Back to it'), JSON.stringify(ts.map((x) => x.title)))
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1))
const bad = results.filter((r) => !r.ok)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exit(bad.length ? 1 : 0)
