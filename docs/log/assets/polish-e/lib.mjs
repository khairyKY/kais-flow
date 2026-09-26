// Shared helpers for the Polish E real runs (copied from the conductor's smoke.mjs pattern).
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

export const SUPA = 'http://127.0.0.1:54321'
export const ANON = readFileSync('/tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/anon.txt', 'utf8').trim()
export const EMAIL = 'polish-e@example.com'
export const PASS = 'polishe-local-123'
export const OUT = '/home/user/kais-flow/.claude/worktrees/agent-a1d5181d604725a33/docs/log/assets/polish-e'
mkdirSync(OUT, { recursive: true })

export const DESKTOP = { width: 1280, height: 800 }
export const PHONE = { width: 390, height: 844 }

export async function launch() {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    // A real MediaRecorder on Chromium's fake microphone — no stubbing needed.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
}

/** A context with console/request/page errors collected under `label`. */
export async function newContext(browser, base, { label, viewport = DESKTOP, timezoneId = 'Africa/Cairo', night = false } = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId, permissions: ['microphone'], serviceWorkers: 'block' })
  await ctx.grantPermissions(['microphone'], { origin: base })
  await ctx.addInitScript((night) => {
    try {
      if (night) localStorage.setItem('kf_theme', 'night')
    } catch {
      // about:blank has no storage — harness only
    }
    window.__gum = 0
    const md = navigator.mediaDevices
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md)
      md.getUserMedia = (c) => {
        window.__gum += 1
        return orig(c)
      }
    }
  }, night)
  const errors = []
  ctx.on('page', (page) => watch(page, label, errors))
  return { ctx, errors }
}

function watch(page, label, errors) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} console ${new URL(page.url()).pathname}: ${m.text()}`)
  })
  page.on('requestfailed', (q) => errors.push(`${label} requestfailed ${q.url()} ${q.failure()?.errorText ?? ''}`))
  page.on('pageerror', (e) => errors.push(`${label} pageerror ${new URL(page.url()).pathname}: ${e.message}`))
}

/** Splits errors into the known cloud trap (open-meteo), the ones a scenario expects, and the rest. */
export function triage(errors, expected = []) {
  // The weather chip's blocked request shows up twice: requestfailed (with the open-meteo URL)
  // and a console "Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED" (without it).
  const isMeteo = (e) => e.includes('open-meteo') || e.includes('ERR_TUNNEL_CONNECTION_FAILED')
  const meteo = errors.filter(isMeteo)
  const rest = errors.filter((e) => !isMeteo(e))
  const exp = rest.filter((e) => expected.some((re) => re.test(e)))
  const other = rest.filter((e) => !expected.some((re) => re.test(e)))
  // Both counts, so a tunnel failure that isn't the weather chip would show as a mismatch.
  const meteoRequests = meteo.filter((e) => e.includes('open-meteo')).length
  return { meteoRequests, tunnelConsole: meteo.length - meteoRequests, expected: exp, other }
}

export async function signIn(page, base) {
  await page.goto(base + '/sign-in')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

let token = null
/** REST as the test user (RLS applies), for counting what really reached the server. */
export async function rest(path) {
  if (!token) {
    const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    })
    token = (await r.json()).access_token
  }
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  return r.json()
}

/** The IndexedDB persister snapshot (idb-keyval's default store), parsed. */
export async function persistedCache(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('keyval-store')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('keyval')) return resolve(null)
          const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('kais-flow-query-cache')
          get.onsuccess = () => resolve(get.result ?? null)
          get.onerror = () => reject(get.error)
        }
      }),
  )
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
