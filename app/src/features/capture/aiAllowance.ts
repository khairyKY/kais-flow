// SEC-2: once a user's AI allowance for the day (Cairo) is used up, the Groq-backed edge
// functions (chat, transcribe, parse-capture) answer 429 {"error":"daily_limit"}. That's a known,
// expected state — not a failure — so it gets calm copy of its own instead of the generic
// "try again" line. This file is its one detector and its one wording, shared by capture (voice +
// text parse) and chat.
import { FunctionsHttpError } from '@supabase/supabase-js'

export const AI_ALLOWANCE_USED_UP = "Today's AI allowance is used up — it refills tomorrow."

/** A capture that still landed in the Inbox, just without the AI sorting step. */
export const INBOX_WITHOUT_AI = 'Added to Inbox. ' + AI_ALLOWANCE_USED_UP

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
