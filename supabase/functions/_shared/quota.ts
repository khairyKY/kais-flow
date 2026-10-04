// SEC-2: per-user daily AI allowance for the Groq-backed functions (chat, transcribe,
// parse-capture). The Groq key is one shared free-tier key and signup is open, so requireUser()
// alone lets a handful of throwaway accounts use up the day's quota for everyone. Each call is
// counted in `ai_usage` (migration 0036) through `ai_usage_bump()`, which only the service role
// may execute, right after requireUser() and before the body is read or Groq is called.
// SCALE (migration 0040): the same call also counts it against a GLOBAL daily cap per kind, shared
// by every user, because 100 users within their own caps can still exhaust the one key together.
//
//   const allowance = await takeAiAllowance(auth.user.id, 'chat')
//   if (allowance === 'over') return dailyLimitResponse(req)
//
// What to do when the check itself can't run ('unavailable') is the caller's decision — see each
// function for why it fails open or closed.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from './cors.ts'

export type AiKind = 'chat' | 'parse' | 'stt' | 'vision'

/** Calls per user per Cairo day (vision: pages read — Paper capture's "15 pages today"). Env
 * overrides are set by Kai as function secrets. */
export const DEFAULT_DAILY_LIMITS: Readonly<Record<AiKind, number>> = { chat: 40, parse: 100, stt: 30, vision: 15 }
const LIMIT_ENV: Readonly<Record<AiKind, string>> = {
  chat: 'AI_DAILY_LIMIT_CHAT',
  parse: 'AI_DAILY_LIMIT_PARSE',
  stt: 'AI_DAILY_LIMIT_STT',
  vision: 'AI_DAILY_LIMIT_VISION',
}

/**
 * Calls per Cairo day for ALL users together. Sized from Groq's free plan as published on
 * console.groq.com/docs/rate-limits (checked 2026-09-27; the llama-3.x models were retired from the
 * free plan on 2026-08-16). Text models on it (gpt-oss-20b/120b, qwen3) get 1K requests and 200K
 * tokens a day each, so tokens bind first: a parse is ~1–2K tokens (prompt + domain/project lists
 * + reasoning) → ~100–200 a day; a chat carries 20 retrieved items and the history, ~2.5K+ → ~80.
 * Whisper gets 2K requests and 28,800 audio-seconds a day → ~1,000 captures of ~25 s. Kept under
 * those so users see the calm "used up" line instead of Groq's 429. Chat and parse only have
 * separate budgets if GROQ_CHAT_MODEL and GROQ_PARSE_MODEL are different models. Raise via env
 * when Groq's limits (or the plan) change.
 * Vision (checked 2026-10-04): Groq's one image model, qwen/qwen3.8-27b, gets 1K requests, 8K tokens a
 * minute and 200K tokens a day on the free plan; a page costs 2,048 image tokens + the prompt + the
 * answer + low reasoning, ~4–5K → ~40 pages a day for everyone.
 */
export const DEFAULT_GLOBAL_LIMITS: Readonly<Record<AiKind, number>> = { chat: 80, parse: 150, stt: 1000, vision: 40 }
const GLOBAL_LIMIT_ENV: Readonly<Record<AiKind, string>> = {
  chat: 'AI_GLOBAL_LIMIT_CHAT',
  parse: 'AI_GLOBAL_LIMIT_PARSE',
  stt: 'AI_GLOBAL_LIMIT_STT',
  vision: 'AI_GLOBAL_LIMIT_VISION',
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
 * A limit from env `name`: a whole number ≥ 0, else `fallback`. 0 switches the kind off for
 * everyone (every call is over the limit). A typo'd value falls back to the default rather than
 * to "unlimited".
 */
function envLimit(name: string, fallback: number): number {
  const raw = Deno.env.get(name)?.trim()
  if (raw && /^\d+$/.test(raw)) return Number(raw)
  if (raw) console.warn(`${name}=${JSON.stringify(raw)} is not a whole number; using ${fallback}`)
  return fallback
}

/** The per-user limit for `kind`. */
export function dailyLimit(kind: AiKind): number {
  return envLimit(LIMIT_ENV[kind], DEFAULT_DAILY_LIMITS[kind])
}

/** The all-users limit for `kind`. */
export function globalLimit(kind: AiKind): number {
  return envLimit(GLOBAL_LIMIT_ENV[kind], DEFAULT_GLOBAL_LIMITS[kind])
}

export type Allowance = 'ok' | 'over' | 'unavailable'

/**
 * Counts this call against the user's allowance and the global one for today (Cairo) and says
 * whether it fits both. Over either is the same 'over' — the client's copy ("used up — refills
 * tomorrow") is true of both, so it needs no second wording.
 */
export async function takeAiAllowance(userId: string, kind: AiKind): Promise<Allowance> {
  const limit = dailyLimit(kind)
  try {
    const { data, error } = await quotaClient()
      .rpc('ai_usage_take', { p_user_id: userId, p_kind: kind, p_user_limit: limit })
      .abortSignal(AbortSignal.timeout(CHECK_TIMEOUT_MS))
      .single()
    const counts = data as { user_count?: unknown; global_count?: unknown } | null
    if (error || typeof counts?.user_count !== 'number') {
      console.error(`ai allowance check failed (${kind})`, error ?? `unexpected result ${JSON.stringify(data)}`)
      return 'unavailable'
    }
    if (counts.user_count > limit) return 'over'
    // global_count is null only past the per-user limit (not counted), which returned above.
    if (Number(counts.global_count) > globalLimit(kind)) {
      console.warn(`ai global daily cap reached (${kind})`)
      return 'over'
    }
    return 'ok'
  } catch (e) {
    console.error(`ai allowance check failed (${kind})`, e)
    return 'unavailable'
  }
}

/** The one over-the-limit answer the client recognises (features/capture/aiAllowance.ts). */
export function dailyLimitResponse(req: Request): Response {
  return jsonResponse(req, { error: 'daily_limit' }, 429)
}
