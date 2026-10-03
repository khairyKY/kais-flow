import { supabase } from '../../lib/supabase'
import { authLinkOrigin } from '../../lib/platform'
import { authLinkLanding, readAuthRedirect, resetRequestLooksSent, type AuthRedirect } from './authLogic'

// J-11 · the browser half of password recovery. AuthProvider imports this eagerly, so the
// module runs at boot — before the router exists and before supabase-js has finished with the
// URL. (supabase-js blanks the hash only after a network round-trip to /auth/v1/user, so this
// synchronous read always sees the link as it arrived.)

/** What the address bar said when the app booted. */
export const bootAuthRedirect: AuthRedirect =
  typeof window === 'undefined' ? { kind: 'none' } : readAuthRedirect(window.location.href)

// "This tab is mid-reset" survives a reload (phones discard tabs; the build-refresh reloads
// open tabs) — by then the hash is gone but the recovery session is still in storage.
const FLAG = 'kf.recovery'

export function rememberRecovery(): void {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* private mode: the boot hash still covers the common case */
  }
}

export function forgetRecovery(): void {
  try {
    sessionStorage.removeItem(FLAG)
  } catch {
    /* nothing to forget */
  }
}

/** The address last used to sign in, sign up or ask for a reset on this device — pre-fills sign
 * in, and lets an expired reset link (9k-3) send a new one in one tap. Settings reads it too. */
const LAST_EMAIL = 'kf.lastEmail'

export function rememberEmail(email: string): void {
  try {
    localStorage.setItem(LAST_EMAIL, email)
  } catch {
    /* private mode — the field just starts empty */
  }
}

export function rememberedEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL) ?? ''
  } catch {
    return ''
  }
}

/** Mails a password-reset link that opens /reset (ResetPage). Resolves to the failure to show,
 * or null when it reads as sent — a 429 included, see resetRequestLooksSent. */
export async function requestReset(email: string): Promise<{ message?: string; code?: string; status?: number } | null> {
  rememberEmail(email)
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${authLinkOrigin()}/reset` })
  return resetRequestLooksSent(error) ? null : error
}

/** Where a sign-up confirmation link opens — "/", which recovery's boot step sends on to 9f. */
export const confirmRedirect = () => `${authLinkOrigin()}/`

/** Mails the sign-up confirmation link again (9d, 9e). Same answer shape as requestReset. */
export async function resendConfirmation(email: string): Promise<{ message?: string; code?: string; status?: number } | null> {
  rememberEmail(email)
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmRedirect() } })
  return resetRequestLooksSent(error) ? null : error
}

export function isRecovering(): boolean {
  if (bootAuthRedirect.kind === 'recovery') return true
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

if (typeof window !== 'undefined') {
  if (bootAuthRedirect.kind === 'recovery') rememberRecovery()
  // The trap: a recovery link that lands anywhere but /reset — GoTrue falls back to the Site URL
  // when the redirect isn't allow-listed — would walk through RequireAuth → OnboardingGate →
  // /today holding a live session and no new password. Re-point the address before the router
  // reads it; the hash rides along, so supabase-js still finds the tokens. Sign-up confirmation
  // links are re-pointed the same way, to 9f or 9e (authLinkLanding).
  const to = authLinkLanding(bootAuthRedirect, window.location.pathname + window.location.search)
  if (to) window.history.replaceState(window.history.state, '', `${to}${window.location.hash}`)
}
