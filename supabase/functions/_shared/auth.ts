// FIX-0 (S1/S3/S5): who is calling this function?
//
// `verify_jwt = true` (pinned per function in config.toml) only proves the bearer token was
// signed by this project. The public anon key is exactly such a token, so on its own it
// authenticates nobody. Every function now asks one of two questions:
//
//   requireUser(req)   — is a real, signed-in user behind this request? (all user-facing calls)
//   isServiceRole(req) — is this the pg_cron caller holding the service-role key? (notify, embed)
import { createClient, type User } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from './cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Anon-key client used only to ask the auth server who a token belongs to. No session state.
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('Authorization') ?? '')
  return match ? match[1] : null
}

export interface AuthedUser {
  user: User
  token: string
}

/**
 * Resolves the signed-in user from the bearer token, or returns the response to send instead:
 * 401 for no token / the anon key / the service-role key / an expired or revoked session (none of
 * those resolve to a user), 503 if the auth server itself couldn't be reached — a signed-in client
 * shouldn't be told its session is bad because of an outage.
 *
 *   const auth = await requireUser(req)
 *   if (auth instanceof Response) return auth
 */
export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const token = bearerToken(req)
  if (!token) return jsonResponse(req, { error: 'unauthorized' }, 401)

  // getUser(token) asks the auth server, so a deleted user or signed-out session is rejected
  // too — not just a bad signature. The auth server verifies the signature itself, so this works
  // for legacy HS256 and asymmetric (ES256 — what the local stack issues) user tokens alike.
  const { data, error } = await authClient.auth.getUser(token)
  if (data?.user) return { user: data.user, token }

  const status = (error as { status?: number } | null)?.status
  if (error && (!status || status >= 500)) {
    return jsonResponse(req, { error: 'auth unavailable' }, 503)
  }
  return jsonResponse(req, { error: 'unauthorized' }, 401)
}

/**
 * True only for the service-role caller — the pg_cron jobs, which send
 * `Authorization: Bearer <vault 'service_role_key'>` (migrations 0006/0007/0009/0016).
 *
 * Two ways in, on purpose:
 *  1. The token is byte-for-byte this runtime's `SUPABASE_SERVICE_ROLE_KEY` (constant-time
 *     compare). The expected case: Vault holds the same key the dashboard shows.
 *  2. The token is a JWT whose `role` claim is `service_role`, and the auth server confirms it.
 *     The Vault copy is pasted in by hand, so it can legitimately differ byte-for-byte from the
 *     key the runtime injects while still being a valid, project-signed service_role JWT (a key
 *     copied before a regeneration of the runtime value, a separately issued service_role JWT).
 *     Without path 2 the cron jobs would start getting 401s silently and every digest, reminder
 *     and embed drain would stop.
 *
 * Path 2 never trusts the claim on its own. The gateway (`verify_jwt = true`) already rejects any
 * bearer JWT this project didn't sign, and on top of that the auth server is asked to accept the
 * token as an admin — so path 2 stays safe even if someone later turns `verify_jwt` off for a
 * function (which Supabase's newer API-key docs suggest). A forged `{"role":"service_role"}`
 * token fails both checks.
 */
export async function isServiceRole(req: Request): Promise<boolean> {
  const token = bearerToken(req)
  if (!token) return false
  if (SERVICE_ROLE_KEY && timingSafeEqual(token, SERVICE_ROLE_KEY)) return true
  if (jwtPayload(token)?.role !== 'service_role') return false
  const confirmed = await authServerAcceptsAsAdmin(token)
  if (confirmed) {
    // Worth knowing in the logs: it means Vault's key and the runtime's key have drifted apart.
    console.warn('isServiceRole: accepted a verified service_role JWT that differs from SUPABASE_SERVICE_ROLE_KEY')
  }
  return confirmed
}

/**
 * Asks the auth server whether `token` is a valid admin (service_role) JWT. The admin endpoints
 * verify the signature and require the service_role claim; a one-row page is the cheapest such
 * call. Any failure — bad signature, wrong role, network — answers "no".
 */
async function authServerAcceptsAsAdmin(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    await res.body?.cancel()
    return res.ok
  } catch {
    return false
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  // Walk the longer length so the loop time doesn't depend on where the first mismatch is.
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** Decodes a JWT's payload WITHOUT verifying it — only ever used to decide whether to ask. */
function jwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}
