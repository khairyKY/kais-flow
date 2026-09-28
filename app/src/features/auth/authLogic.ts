// Pure auth helpers shared by the sign-in and /reset pages (J-11). No React, no supabase-js,
// no window — everything here is unit-tested in authLogic.test.ts.

/** Client-side floor for any new password (sign-up and reset). Audit S10 asks for the same
 * minimum on the hosted project; the local config.toml still says 6, which is only looser. */
export const MIN_PASSWORD_LENGTH = 8

// House rule: the word "error" (and raw GoTrue text) never reaches the UI — same register as
// the outbox toast ("One change couldn't be saved — set aside so the rest sync on.").
export function calmAuthLine(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('different from the old password')) return "That's the password you already use — choose a new one."
  if (m.includes('password') && (m.includes('at least') || m.includes('should be'))) {
    // Quote the server's own number when it gives one, so the line stays true if the
    // hosted minimum is ever raised above the client's.
    const n = /at least (\d+)/.exec(m)?.[1] ?? String(MIN_PASSWORD_LENGTH)
    return `Passwords need at least ${n} characters — a little more soil.`
  }
  if (m.includes('not confirmed')) return "Your seed hasn't sprouted yet — click the link in your email first."
  if (m.includes('invalid login credentials')) return "That email and password don't match a garden here — try again."
  if (m.includes('rate limit') || m.includes('too many')) return 'The garden needs a short rest — try again in a minute.'
  return "That didn't take root — try again in a moment."
}

/** What a failed auth call shows (First Run 9b). `in-use` is the card under the email field with
 * "Sign in instead"; `offline` is the card with Retry (supabase-js reports a fetch that never
 * reached the server as status 0); anything else is one calm line in the same card, no action. */
export type AuthProblem = { kind: 'in-use' } | { kind: 'offline' } | { kind: 'line'; text: string }

export function authProblem(error: { message?: string; code?: string; status?: number }): AuthProblem {
  if (error.status === 0) return { kind: 'offline' }
  if (error.code === 'user_already_exists' || error.code === 'email_exists' || /already registered/i.test(error.message ?? '')) return { kind: 'in-use' }
  return { kind: 'line', text: calmAuthLine(error.message ?? '') }
}

/** The live rule under a new password (9a / 9b-2 / 9k-2) — the only rule is the length. */
export function passwordRule(password: string): { state: 'empty' | 'short' | 'ok'; text: string } {
  if (password.length >= MIN_PASSWORD_LENGTH) return { state: 'ok', text: `${MIN_PASSWORD_LENGTH}+ characters` }
  if (!password) return { state: 'empty', text: `${MIN_PASSWORD_LENGTH}+ characters` }
  return { state: 'short', text: `Use ${MIN_PASSWORD_LENGTH} or more characters — ${MIN_PASSWORD_LENGTH - password.length} to go` }
}

// ponytail: the big webmail inboxes only; any other domain gets no "Open email app" button
// (a mailto: link would open a blank draft, not the inbox).
const INBOXES: Record<string, string> = {
  'gmail.com': 'https://mail.google.com/mail/u/0/#inbox',
  'googlemail.com': 'https://mail.google.com/mail/u/0/#inbox',
  'outlook.com': 'https://outlook.live.com/mail/',
  'hotmail.com': 'https://outlook.live.com/mail/',
  'live.com': 'https://outlook.live.com/mail/',
  'yahoo.com': 'https://mail.yahoo.com/',
  'icloud.com': 'https://www.icloud.com/mail',
  'proton.me': 'https://mail.proton.me/',
}

/** Where "Open email app" (9k-1) goes for this address, or null when we can't know. */
export function inboxUrl(email: string): string | null {
  return INBOXES[email.split('@')[1]?.trim().toLowerCase() ?? ''] ?? null
}

/** What an auth email link left in the address bar. GoTrue's implicit flow (supabase-js's
 * default, which this app uses) puts a recovery session in the hash —
 * `#access_token=…&type=recovery` — and a used or expired link comes back as
 * `#error=access_denied&error_code=otp_expired&…`. The query string is read too, for PKCE. */
export type AuthRedirect = { kind: 'recovery' } | { kind: 'error'; code: string } | { kind: 'none' }

export function readAuthRedirect(href: string): AuthRedirect {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const get = (key: string) => hash.get(key) ?? url.searchParams.get(key)
  if (get('error') || get('error_code') || get('error_description'))
    return { kind: 'error', code: get('error_code') ?? get('error') ?? 'unknown' }
  if (get('type') === 'recovery' && get('access_token')) return { kind: 'recovery' }
  return { kind: 'none' }
}

/** Enumeration guard for the "Forgot password?" request. GoTrue answers an unknown email with
 * 200 and sends nothing, but answers a known email that was mailed moments ago with 429 — so a
 * 429 has to read exactly like success, or the difference tells a stranger the account exists.
 * Anything else (offline, server trouble) is shown as a retry, which reveals nothing. */
export function resetRequestLooksSent(error: { status?: number } | null): boolean {
  return !error || error.status === 429
}

/** Which face the /reset page shows.
 * - `checking` while supabase-js is still trading the link's tokens for a session.
 * - `form` once a recovery session exists (from this link, or earlier in this tab).
 * - `expired` when the link was refused: GoTrue's error hash, or tokens that didn't hold.
 * - `no-link` when someone opens /reset without coming from an email. */
export type ResetView = 'checking' | 'form' | 'expired' | 'no-link'

export function resetView(s: { redirect: AuthRedirect; loading: boolean; hasSession: boolean; recovering: boolean }): ResetView {
  if (s.redirect.kind === 'error') return 'expired'
  if (s.loading) return 'checking'
  if (s.hasSession && s.recovering) return 'form'
  return s.redirect.kind === 'recovery' ? 'expired' : 'no-link'
}
