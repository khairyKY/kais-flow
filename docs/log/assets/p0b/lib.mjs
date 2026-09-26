// Shared helpers for the P0-B real runs (local Supabase stack, account p0b@example.com).
import { chromium } from 'playwright'

export const API = 'http://127.0.0.1:54321'
export const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const EMAIL = 'p0b@example.com'
export const PASS = 'localtest123'
export const BASE = process.env.BASE ?? 'http://127.0.0.1:5232'

export async function token() {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const j = await r.json()
  return { jwt: j.access_token, uid: j.user.id }
}

export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { jwt } = await token()
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  return { status: r.status, data: text ? JSON.parse(text) : null }
}

/** Skip onboarding for the test account (it's a stranger-flow gate, not what we test). */
export async function ensureOnboarded() {
  const cur = await rest('app_settings?select=*')
  if (cur.data?.length && cur.data[0].onboarded_at) return
  const { uid } = await token()
  await rest('app_settings?on_conflict=user_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { user_id: uid, onboarded_at: new Date().toISOString() },
  })
}

export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
}

export function watch(page, label, sink) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (t.includes('TUNNEL') || t.includes('open-meteo')) return
    sink.push(`${label} console: ${t}`)
  })
  page.on('pageerror', (e) => sink.push(`${label} pageerror: ${e.message}`))
}

export async function signIn(page) {
  await page.goto(BASE + '/sign-in')
  await page.waitForTimeout(1500)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
  }
}

export function idbGet(page, key) {
  return page.evaluate(
    (k) =>
      new Promise((res) => {
        const r = indexedDB.open('keyval-store')
        r.onsuccess = () => {
          const tx = r.result.transaction('keyval')
          const g = tx.objectStore('keyval').get(k)
          g.onsuccess = () => res(g.result ?? null)
          g.onerror = () => res(null)
        }
        r.onerror = () => res(null)
      }),
    key,
  )
}

export async function waitFor(fn, ms = 15000, step = 500) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v || Date.now() > end) return v
    await new Promise((r) => setTimeout(r, step))
  }
}
