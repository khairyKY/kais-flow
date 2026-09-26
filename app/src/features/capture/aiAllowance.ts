// SEC-2: once a user's AI allowance for the day (Cairo) is used up, the Groq-backed edge
// functions (chat, transcribe, parse-capture) answer 429 {"error":"daily_limit"}. That's a known,
// expected state — not a failure — so it gets calm copy of its own instead of the generic
// "try again" line. This file is its one detector and its one wording, shared by capture (voice +
// text parse) and chat.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { cairoDateKey } from '../../lib/dateShortcuts'

export const AI_ALLOWANCE_USED_UP = "Today's AI allowance is used up — it refills tomorrow."

/** A capture that still landed in the Inbox, just without the AI sorting step. */
export const INBOX_WITHOUT_AI = 'Added to Inbox. ' + AI_ALLOWANCE_USED_UP

/** Polish E: voice has an allowance of its own (speech-to-text), separate from chat and typed
 * capture — so the voice sheet names it, rather than claiming all AI is used up while chat works. */
export const VOICE_ALLOWANCE_USED_UP = "Today's voice allowance is used up — it refills tomorrow."

/** Thrown by raw-fetch callers (transcribe) so the UI can tell this state from a real failure. */
export class DailyLimitError extends Error {
  constructor() {
    super('daily_limit')
    this.name = 'DailyLimitError'
  }
}

/** True for the functions' over-the-allowance answer. Reads a clone, so the body stays readable. */
export async function isDailyLimitResponse(res: Response): Promise<boolean> {
  if (res.status !== 429) return false
  try {
    const body = (await res.clone().json()) as { error?: unknown } | null
    return body?.error === 'daily_limit'
  } catch {
    return false
  }
}

/** Same check for whatever a call threw or returned as `error` — including a
 * `supabase.functions.invoke` FunctionsHttpError, whose `context` is the raw Response. */
export async function isDailyLimitError(error: unknown): Promise<boolean> {
  if (error instanceof DailyLimitError) return true
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    return isDailyLimitResponse(error.context)
  }
  return false
}

// ── Polish E: a voice daily_limit is remembered for the rest of that Cairo day, on this device ──
// The next tap on voice then says so up front and offers typing, instead of letting you record
// something that can't be transcribed today. Tagged with the account, so another account on this
// browser isn't told its allowance is gone. Cairo's day, because that's the day the server counts.
const VOICE_LIMIT_KEY = 'kf-voice-limit-day'

export function rememberVoiceLimitReached(uid: string | undefined, now: Date = new Date()): void {
  try {
    localStorage.setItem(VOICE_LIMIT_KEY, JSON.stringify({ day: cairoDateKey(now), uid: uid ?? null }))
  } catch {
    // Storage blocked (private window) — the next tap just records and finds out again.
  }
}

export function voiceLimitReachedToday(uid: string | undefined, now: Date = new Date()): boolean {
  try {
    const raw = localStorage.getItem(VOICE_LIMIT_KEY)
    if (!raw) return false
    const saved = JSON.parse(raw) as { day?: unknown; uid?: unknown } | null
    return saved?.day === cairoDateKey(now) && saved.uid === (uid ?? null)
  } catch {
    return false
  }
}
