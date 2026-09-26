// Verifies supabase-js 2.110 sign-out behaviour when /logout can't be reached (offline).
import { createClient } from '/home/user/kais-flow/.claude/worktrees/agent-a12e471fdd8930ed5/app/node_modules/@supabase/supabase-js/dist/index.mjs'
import { API, ANON, EMAIL, PASS } from './lib.mjs'

const mem = new Map()
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
let offline = false
const fetchImpl = (...a) => (offline ? Promise.reject(new TypeError('Failed to fetch')) : fetch(...a))

async function run(label, steps) {
  mem.clear()
  offline = false
  const sb = createClient(API, ANON, { auth: { storage, autoRefreshToken: false, persistSession: true }, global: { fetch: fetchImpl } })
  const events = []
  sb.auth.onAuthStateChange((e) => events.push(e))
  await sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
  const key = sb.auth.storageKey
  offline = true
  console.log(`\n[${label}] storageKey=${key}`)
  await steps(sb, key, events)
  console.log(`[${label}] session in storage after: ${mem.has(key)}; getSession: ${!!(await sb.auth.getSession()).data.session}; events: ${events.join(',')}`)
}

await run('global offline', async (sb) => {
  const r = await sb.auth.signOut().catch((e) => ({ thrown: e }))
  console.log('  signOut() ->', r.thrown ? `THREW ${r.thrown}` : `error=${r.error?.name}:${r.error?.message} status=${r.error?.status}`)
})
await run('local offline', async (sb) => {
  const r = await sb.auth.signOut({ scope: 'local' }).catch((e) => ({ thrown: e }))
  console.log("  signOut({scope:'local'}) ->", r.thrown ? `THREW ${r.thrown}` : `error=${r.error?.name}:${r.error?.message}`)
})
await run('drop key + local offline', async (sb, key) => {
  const r1 = await sb.auth.signOut()
  console.log('  signOut() ->', `error=${r1.error?.name}`)
  storage.removeItem(key)
  const r2 = await sb.auth.signOut({ scope: 'local' })
  console.log("  after removing the stored session, signOut({scope:'local'}) ->", `error=${r2.error?.name ?? 'none'}`)
})
