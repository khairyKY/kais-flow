// SEC-2: per-user daily AI allowance for the Groq-backed functions (chat, transcribe,
// parse-capture). The Groq key is one shared free-tier key and signup is open, so requireUser()
// alone lets a handful of throwaway accounts use up the day's quota for everyone. Each call is
// counted in `ai_usage` (migration 0036) through `ai_usage_bump()`, which only the service role
// may execute, right after requireUser() and before the body is read or Groq is called.
//
//   const allowance = await takeAiAllowance(auth.user.id, 'chat')
//   if (allowance === 'over') return dailyLimitResponse(req)
//
// What to do when the check itself can't run ('unavailable') is the caller's decision — see each
// function for why it fails open or closed.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from './cors.ts'

export type AiKind = 'chat' | 'parse' | 'stt'

/** Calls per user per Cairo day. Env overrides are set by Kai as function secrets. */
export const DEFAULT_DAILY_LIMITS: Readonly<Record<AiKind, number>> = { chat: 150, parse: 300, stt: 60 }
const LIMIT_ENV: Readonly<Record<AiKind, string>> = {
  chat: 'AI_DAILY_LIMIT_CHAT',
  parse: 'AI_DAILY_LIMIT_PARSE',
  stt: 'AI_DAILY_LIMIT_STT',
}

// A hung database must not hang the request: past this the check counts as unavailable.
const CHECK_TIMEOUT_MS = 5000

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Created on first use: createClient throws on an empty key, and a missing key must surface as
// 'unavailable' on the call, not as a function that can't even boot.
let serviceClient: SupabaseClient | null = null
function quotaClient(): SupabaseClient {
  serviceClient ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return serviceClient
}

/**
 * The limit for `kind`: a whole number ≥ 0 from the env, else the default. 0 switches the kind
 * off for everyone (every call is over the limit). A typo'd value falls back to the default rather
 * than to "unlimited".
 */
export function dailyLimit(kind: AiKind): number {
  const raw = Deno.env.get(LIMIT_ENV[kind])?.trim()
  if (raw && /^\d+$/.test(raw)) return Number(raw)
  if (raw) console.warn(`${LIMIT_ENV[kind]}=${JSON.stringify(raw)} is not a whole number; using ${DEFAULT_DAILY_LIMITS[kind]}`)
  return DEFAULT_DAILY_LIMITS[kind]
}

export type Allowance = 'ok' | 'over' | 'unavailable'

/** Counts this call against the user's allowance for today (Cairo) and says whether it fits. */
export async function takeAiAllowance(userId: string, kind: AiKind): Promise<Allowance> {
  const limit = dailyLimit(kind)
  try {
    const { data, error } = await quotaClient()
      .rpc('ai_usage_bump', { p_user_id: userId, p_kind: kind })
      .abortSignal(AbortSignal.timeout(CHECK_TIMEOUT_MS))
    if (error || typeof data !== 'number') {
      console.error(`ai allowance check failed (${kind})`, error ?? `unexpected result ${JSON.stringify(data)}`)
      return 'unavailable'
    }
    return data > limit ? 'over' : 'ok'
  } catch (e) {
    console.error(`ai allowance check failed (${kind})`, e)
    return 'unavailable'
  }
}

/** The one over-the-limit answer the client recognises (features/capture/aiAllowance.ts). */
export function dailyLimitResponse(req: Request): Response {
  return jsonResponse(req, { error: 'daily_limit' }, 429)
}
