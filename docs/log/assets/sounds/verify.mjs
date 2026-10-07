// Sounds v2 (Kai 2026-10-07: "Redesign the sounds, I hate the current sounds.") on the REAL app, signed in
// against a MOCKED backend (the user-tz recipe: VITE_SUPABASE_URL=http://127.0.0.1:9, a made-up session in
// localStorage, Playwright answers every REST call). Three parts:
//   1. renders every pack × event with lib/sounds.ts's own renderSound (an OfflineAudioContext in Chrome),
//      measures it (peak, length, clicks, energy above 6 kHz) and writes <pack>/<event>.wav + index.html
//      next to this file so Kai can audition them without opening the app;
//   2. swaps lib/sounds' `player.play` for a recorder and checks each call site plays the right event;
//   3. the Settings → Sound card at desktop 1280 and phone 390, day and night.
//   node verify.mjs <outDir> [baseUrl] [playwright-core path]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? HERE
const BASE = process.argv[3] ?? 'http://localhost:5275'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PW).href)
fs.mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null // render,wiring,settings
const want = (k) => !ONLY || ONLY.has(k)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '00000000-0000-4000-8000-0000000000a7'
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.x`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'sounds@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }

const CREATED = '2026-09-20T12:00:00.000Z'
const SOON = new Date(Date.now() + 90 * 60_000).toISOString() // due later today (the tasks show on Today)
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const task = (n, title, over = {}) => ({
  id: id(n), title, user_id: UID, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: SOON, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, paused: false, milestone_id: null, deleted_at: null, parent_task_id: null,
  created_at: CREATED, updated_at: CREATED, ...over,
})
const GOAL = 1, PICK2 = 2, PICK3 = 3, PLAIN = 4
const TASKS = [
  task(GOAL, 'Finish the audit draft', { top3: true }),
  task(PICK2, 'Call the tyre supplier', { top3: true }),
  task(PICK3, 'Water the ferns', { top3: true }),
  task(PLAIN, 'Reply to Sam', {}),
]
// Today keeps a finished pick in its Top 3 by reading the star log (features/today/top3Today).
const STARS = [GOAL, PICK2, PICK3].map((n) => ({ entity_id: id(n), event_type: 'task.starred', created_at: CREATED }))
// Quiet hours off so the run doesn't depend on the hour (sounds.test.ts covers quiet hours + pause).
const SETTINGS = { user_id: UID, timezone: 'Africa/Cairo', onboarded_at: '2026-01-02T00:00:00Z', display_name: 'Demo', workspace_name: 'Personal', quiet_hours_on: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const desktop = { viewport: { width: 1280, height: 800 } }

async function open(route, o = {}) {
  const view = o.view ?? desktop
  const ctx = await browser.newContext({ ...view, deviceScaleFactor: 1, timezoneId: 'Africa/Cairo', locale: 'en-US' })
  await ctx.addInitScript(
    ([sess, uid, theme, local]) => {
      if (sessionStorage.getItem('seeded')) return // reloads keep what the page wrote
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('kf_theme', theme)
      localStorage.setItem('sb-127-auth-token', sess)
      localStorage.setItem(`kf-whats-new:${uid}`, JSON.stringify({ seen: 'v999.0.0', checkedAt: Date.now() }))
      for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
    },
    [JSON.stringify(session), UID, o.theme ?? 'day', o.local ?? {}],
  )
  const state = { rows: { tasks: structuredClone(TASKS), app_settings: [SETTINGS] }, writes: [] }
  await ctx.route('http://127.0.0.1:9/**', async (r) => {
    const req = r.request()
    const url = new URL(req.url())
    const table = url.pathname.replace('/rest/v1/', '')
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      let body = null
      try { body = req.postDataJSON() } catch { body = req.postData() }
      state.writes.push({ method: req.method(), table, body })
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: user })
    const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const rows = table === 'activity_log' ? (url.searchParams.get('event_type')?.includes('task.starred') ? STARS : []) : (state.rows[table] ?? [])
    if (one) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }).catch(() => {})
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await sleep(1200)
  return { ctx, page, errors, state }
}

/** The app's own instance of a source module: Vite serves an edited file as `…ts?t=<stamp>`, and a
 * bare import of `…ts` would be a second copy the app never calls. */
const importApp = (page, file) =>
  page.evaluate(async (file) => {
    window.__mods ??= {}
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new URL(n).pathname === file) ?? file
    window.__mods[file] = await import(url)
  }, file)
/** Swap the player for a recorder: every sound that would have played lands in window.__sounds. */
async function stub(page) {
  await importApp(page, '/src/lib/sounds.ts')
  await page.evaluate(() => {
    window.__sounds = []
    window.__mods['/src/lib/sounds.ts'].player.play = (event, pack) => window.__sounds.push({ event, pack })
  })
}
const heard = (page) => page.evaluate(() => window.__sounds.map((s) => s.event))
const box = (page, title) => page.locator(`[role="checkbox"][aria-label=${JSON.stringify(`Complete "${title}"`)}]:visible`).first()

// ═══ 1 — every voice, rendered offline and measured ═══
const LABEL = {
  complete: 'Task done', complete_big: 'Goal / last Top 3 done', capture: 'Captured', focus_start: 'Focus begins',
  focus_end: 'Focus ends', ritual_done: 'Ritual done', undo: 'Undo',
}
const rendered = []
if (want('render')) {
  const { ctx, page, errors } = await open('/settings')
  const out = await page.evaluate(async () => {
    const m = await import('/src/lib/sounds.ts')
    // Radix-2 FFT of the whole voice: the share of energy above 6 kHz, and where the energy sits.
    function spectrum(x, rate) {
      let n = 1
      while (n < x.length) n <<= 1
      const re = new Float64Array(n), im = new Float64Array(n)
      re.set(x)
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) { [re[i], re[j]] = [re[j], re[i]] }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a)
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0
          for (let k = 0; k < len / 2; k++) {
            const ur = re[i + k], ui = im[i + k]
            const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
            const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
            re[i + k] = ur + vr; im[i + k] = ui + vi
            re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
            const t = cr * wr - ci * wi
            ci = cr * wi + ci * wr
            cr = t
          }
        }
      }
      let total = 0, high = 0, weighted = 0
      for (let k = 1; k < n / 2; k++) {
        const e = re[k] * re[k] + im[k] * im[k]
        const f = (k * rate) / n
        total += e
        weighted += e * f
        if (f > 6000) high += e
      }
      return { highShare: high / total, centroid: weighted / total }
    }
    function wav(x, rate) {
      const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf)
      const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
      str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
      v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, x.length * 2, true)
      for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true)
      let bin = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    const res = []
    for (const pack of m.SOUND_PACKS) {
      for (const event of m.SOUND_EVENTS) {
        const buf = await m.renderSound(pack, event)
        const x = buf.getChannelData(0)
        const rate = buf.sampleRate
        const ms5 = Math.round(rate * 0.005)
        let peak = 0, clipped = 0, last = 0, step = 0, power = 0
        for (let i = 0; i < x.length; i++) {
          const a = Math.abs(x[i])
          if (a > peak) peak = a
          if (a >= 0.999) clipped++
          if (a > 0.001) last = i // −60 dBFS
          if (i) step = Math.max(step, Math.abs(x[i] - x[i - 1]))
          power += x[i] * x[i]
        }
        let head = 0
        for (let i = 0; i < ms5; i++) head = Math.max(head, Math.abs(x[i]))
        const limit = Math.round(m.MAX_DURATION[event] * rate)
        let atLimit = 0
        for (let i = limit - ms5; i < limit; i++) atLimit = Math.max(atLimit, Math.abs(x[i]))
        const end = Math.min(limit, last + Math.round(rate * 0.03))
        const clip = x.slice(0, end)
        let tail = 0
        for (let i = clip.length - ms5; i < clip.length; i++) tail = Math.max(tail, Math.abs(clip[i]))
        res.push({ pack, event, rate, peakDb: 20 * Math.log10(peak), rmsDb: 10 * Math.log10(power / Math.max(1, last)), clipped, seconds: last / rate, limit: m.MAX_DURATION[event], headPeak: head, tailPeak: tail, atLimit, maxStep: step, ...spectrum(clip, rate), wav: wav(clip, rate), wavSeconds: clip.length / rate })
      }
    }
    return res
  })
  for (const r of out) {
    const dir = path.join(HERE, r.pack)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${r.event}.wav`), Buffer.from(r.wav, 'base64'))
    delete r.wav
    rendered.push(r)
    const n = `${r.pack}/${r.event}`
    check(`${n} peak ≤ −6 dBFS, nothing clipped`, r.peakDb <= -6 && r.clipped === 0, `${r.peakDb.toFixed(1)} dBFS`)
    check(`${n} rings ≤ ${r.limit * 1000} ms (to −60 dBFS)`, r.seconds <= r.limit, `${Math.round(r.seconds * 1000)} ms`)
    check(`${n} no click: starts from silence, ends in silence, no jump anywhere`, r.headPeak < 0.01 && r.tailPeak < 0.001 && r.atLimit < 0.001 && r.maxStep < 0.15, `first 5 ms ${r.headPeak.toFixed(4)} · last 5 ms ${r.tailPeak.toFixed(5)} · max step ${r.maxStep.toFixed(3)}`)
    check(`${n} not hissy: < 1% of the energy above 6 kHz`, r.highShare < 0.01, `${(r.highShare * 100).toFixed(3)}% · centroid ${Math.round(r.centroid)} Hz`)
  }
  check('render: every pack × event (3 × 7) written', rendered.length === 21 && rendered.every((r) => fs.existsSync(path.join(HERE, r.pack, `${r.event}.wav`))))
  const bytes = rendered.reduce((n, r) => n + fs.statSync(path.join(HERE, r.pack, `${r.event}.wav`)).size, 0)
  check('render: WAVs are mono 44.1k, ≤ 2.5 s each', rendered.every((r) => r.rate === 44100 && r.wavSeconds <= 2.5), `${(bytes / 1024).toFixed(0)} KB total`)
  check('render: no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// The audition page.
if (want('render')) {
  const rows = (pack) =>
    rendered
      .filter((r) => r.pack === pack)
      .map((r) => `      <tr><td>${LABEL[r.event]}<br><code>${r.event}</code></td><td><audio controls preload="none" src="${r.pack}/${r.event}.wav"></audio></td><td>${Math.round(r.seconds * 1000)} ms</td><td>${r.peakDb.toFixed(1)} dBFS</td></tr>`)
      .join('\n')
  const blurb = { kalimba: 'Kalimba: plucked tines, bright and round', felt: 'Felt (the default): muted felt piano, warm and low', glass: 'Glass: soft glass bells, airy' }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kai's Flow sounds</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 24px auto; padding: 0 16px; color: #2e2b24; background: #faf6ec; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; } td { padding: 6px 8px; border-bottom: 1px dashed #d8d0bc; vertical-align: middle; font-size: 14px; }
  td:nth-child(3), td:nth-child(4) { color: #8a8270; font-size: 12px; white-space: nowrap; } code { color: #8a8270; font-size: 11px; }
  audio { width: 260px; max-width: 100%; height: 34px; }
  p { font-size: 14px; color: #5d574a; }
</style>
</head>
<body>
<h1>Kai's Flow sounds</h1>
<p>Every sound the app makes, rendered from the app's own synthesis code (app/src/lib/sounds.ts), at full volume. The app's default volume is quieter. One key (C major pentatonic) across all of them. Pick a pack in Settings → Sound.</p>
${['kalimba', 'felt', 'glass'].map((p) => `<h2>${blurb[p]}</h2>\n<table>\n${rows(p)}\n</table>`).join('\n')}
</body>
</html>
`
  fs.writeFileSync(path.join(HERE, 'index.html'), html)
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(rendered, null, 2))
}

// ═══ 2 — the call sites play the right event ═══
if (want('wiring')) {
  const name = 'tasks-complete'
  const { ctx, page, errors } = await open('/tasks', { local: { kf_sound_events: JSON.stringify({ undo: true }) } })
  await stub(page)
  await box(page, 'Reply to Sam').click()
  await sleep(700)
  check(`${name} checking a plain task → complete, once (the box no longer plays its own)`, JSON.stringify(await heard(page)) === '["complete"]', JSON.stringify(await heard(page)))
  await page.locator('.kf-toast').last().getByRole('button', { name: 'Undo' }).click()
  await sleep(400)
  check(`${name} the toast's Undo → undo (turned on for this run; off by default)`, (await heard(page)).at(-1) === 'undo', JSON.stringify(await heard(page)))
  await page.keyboard.press('Control+k')
  await sleep(400)
  await page.keyboard.type('Buy stamps')
  await page.keyboard.press('Enter')
  await sleep(500)
  check(`${name} the capture bar's Enter → capture`, (await heard(page)).at(-1) === 'capture', JSON.stringify(await heard(page)))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('wiring')) {
  const name = 'today-top3'
  const { ctx, page, errors } = await open('/today', { local: { kf_goal_task_id: id(GOAL) } })
  await stub(page)
  for (const title of ['Call the tyre supplier', 'Finish the audit draft', 'Water the ferns']) {
    await box(page, title).click()
    await sleep(700)
  }
  const got = await heard(page)
  check(`${name} a Top 3 pick with others still open → complete`, got[0] === 'complete', JSON.stringify(got))
  check(`${name} the Goal of the day → complete_big`, got[1] === 'complete_big', JSON.stringify(got))
  check(`${name} the last open Top 3 pick → complete_big`, got[2] === 'complete_big', JSON.stringify(got))
  check(`${name} one sound per check`, got.length === 3, got.length)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('wiring')) {
  const name = 'focus'
  const { ctx, page, errors } = await open('/focus')
  await stub(page)
  await page.getByRole('button', { name: /▶ Start/ }).first().click()
  await sleep(400)
  check(`${name} ▶ Start (a fresh round) → focus_start`, JSON.stringify(await heard(page)) === '["focus_start"]', JSON.stringify(await heard(page)))
  await page.getByRole('button', { name: /Pause/ }).first().click()
  await sleep(300)
  await page.getByRole('button', { name: /▶ Start/ }).first().click()
  await sleep(300)
  check(`${name} resuming a paused round is silent`, (await heard(page)).length === 1, JSON.stringify(await heard(page)))
  await importApp(page, '/src/features/focus/focusStore.ts')
  await page.evaluate(() => window.__mods['/src/features/focus/focusStore.ts'].useFocusStore.setState({ secondsLeft: 2 }))
  await sleep(3200)
  check(`${name} the round runs out → focus_end`, (await heard(page)).at(-1) === 'focus_end', JSON.stringify(await heard(page)))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('wiring')) {
  const name = 'morning'
  const { ctx, page, errors } = await open('/today?ritual=morning')
  await stub(page)
  await page.getByRole('button', { name: 'Start the day' }).filter({ visible: true }).first().click()
  await sleep(500)
  check(`${name} Start the day → ritual_done`, JSON.stringify(await heard(page)) === '["ritual_done"]', JSON.stringify(await heard(page)))
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
if (want('wiring')) {
  const name = 'evening'
  const { ctx, page, errors } = await open('/today?ritual=evening')
  await stub(page)
  await page.getByRole('button', { name: 'Close the day' }).filter({ visible: true }).first().click()
  await sleep(500)
  check(`${name} Close the day → ritual_done (before the garden goes quiet)`, JSON.stringify(await heard(page)) === '["ritual_done"]', JSON.stringify(await heard(page)))
  check(`${name} …and the garden is closed now`, (await page.evaluate(() => localStorage.getItem('kf.gardenClosed'))) !== null)
  check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

// ═══ 3 — Settings → Sound, desktop 1280 + phone 390, day + night ═══
for (const [viewName, view] of want('settings') ? [['desktop', desktop], ['phone', phone]] : []) {
  for (const theme of ['day', 'night']) {
    const name = `settings-${viewName}-${theme}`
    const { ctx, page, errors } = await open('/settings', { view, theme })
    await stub(page)
    const card = page.locator('#settings-Sound:visible').first()
    // Tall enough that the whole card is on screen (and clear of the phone's tab bar) for its picture.
    await page.setViewportSize({ width: view.viewport.width, height: 1500 })
    await card.scrollIntoViewIfNeeded()
    await sleep(400)
    await card.screenshot({ path: path.join(OUT, `${name}.png`) })
    await page.setViewportSize(view.viewport)
    const radios = card.getByRole('radio')
    check(`${name} three packs, Felt chosen`, (await radios.count()) === 3 && (await card.getByRole('radio', { name: /Felt/ }).getAttribute('aria-checked')) === 'true')
    check(`${name} a ▶ per pack and per event, seven event rows`, (await card.getByRole('button', { name: /^Hear / }).count()) === 3 && (await card.locator('[data-sound-event]').count()) === 7 && (await card.getByRole('button', { name: /^Preview / }).count()) === 7)
    const b = await card.boundingBox()
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
    check(`${name} fits the width (no sideways scroll)`, b.x >= 0 && b.x + b.width <= view.viewport.width && overflow <= 0, `card ${Math.round(b.x)}–${Math.round(b.x + b.width)} · overflow ${overflow}`)
    if (viewName === 'desktop' && theme === 'day') {
      await card.getByRole('radio', { name: /Felt/ }).click()
      await sleep(200)
      const rec = await page.evaluate(() => window.__sounds.at(-1))
      check(`${name} choosing Felt saves it and plays its phrase`, (await card.getByRole('radio', { name: /Felt/ }).getAttribute('aria-checked')) === 'true' && (await page.evaluate(() => localStorage.getItem('kf_sound_pack'))) === 'felt' && rec?.event === 'complete_big' && rec?.pack === 'felt', JSON.stringify(rec))
      await card.getByRole('button', { name: 'Hear Glass' }).click()
      await sleep(200)
      const glass = await page.evaluate(() => window.__sounds.at(-1))
      check(`${name} ▶ Glass auditions glass without choosing it`, glass?.pack === 'glass' && (await page.evaluate(() => localStorage.getItem('kf_sound_pack'))) === 'felt', JSON.stringify(glass))
      await card.getByRole('switch', { name: 'Undo' }).click()
      await sleep(200)
      check(`${name} turning Undo on saves it and lets you hear it`, JSON.parse(await page.evaluate(() => localStorage.getItem('kf_sound_events'))).undo === true && (await page.evaluate(() => window.__sounds.at(-1).event)) === 'undo')
      await card.getByRole('button', { name: 'Preview Focus ends' }).click()
      await sleep(200)
      check(`${name} ▶ on a row previews that event in the chosen pack`, JSON.stringify(await page.evaluate(() => window.__sounds.at(-1))) === '{"event":"focus_end","pack":"felt"}')
      await page.reload({ waitUntil: 'networkidle' })
      await sleep(800)
      const after = page.locator('#settings-Sound:visible').first()
      check(`${name} after a reload: Felt still chosen, Undo still on`, (await after.getByRole('radio', { name: /Felt/ }).getAttribute('aria-checked')) === 'true' && (await after.getByRole('switch', { name: 'Undo' }).getAttribute('aria-checked')) === 'true')
    }
    check(`${name} no page errors`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
