// What a function log may say about a failed Groq call (legal review 2026-10-29, finding C7): the HTTP
// status and Groq's short error kind (`error.code` / `error.type`, e.g. "rate_limit_exceeded"), never the
// body or message. Groq's error bodies can echo what the user sent (a `failed_generation` holds the model's
// output), and a JSON.parse error on its answer quotes the answer, so neither may reach the logs.

/** "429 rate_limit_exceeded" — reads (and drops) the body, keeping only Groq's error code or type. */
export async function groqFailure(res: Response): Promise<string> {
  let kind = 'unknown'
  try {
    const err = ((await res.json()) as { error?: { code?: unknown; type?: unknown } })?.error
    const k = typeof err?.code === 'string' ? err.code : typeof err?.type === 'string' ? err.type : null
    // ponytail: Groq's codes are short snake_case words; anything else is treated as content and dropped.
    if (k && /^[a-z0-9_]{1,64}$/.test(k)) kind = k
  } catch {
    kind = 'unreadable'
  }
  return `${res.status} ${kind}`
}

/** A caught error, for a log line: its class name ("SyntaxError", "TypeError") and, for a database error,
 * its code ("23503") — never its message, which can quote a value or an AI answer. */
export function errorKind(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(e.code) ? ` ${e.code}` : ''
  return (e instanceof Error ? e.name : typeof e) + code
}
