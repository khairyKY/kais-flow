import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  authProblem,
  calmAuthLine,
  inboxUrl,
  passwordRule,
  RESEND_WAIT_MS,
  authLinkLanding,
  readAuthRedirect,
  resendLabel,
  resetRequestLooksSent,
  resetView,
  signInView,
  signUpOutcome,
  type AuthRedirect,
} from './authLogic'

const ORIGIN = 'https://kais-flow.example'

describe('readAuthRedirect', () => {
  it('reads a recovery session from the hash (implicit flow)', () => {
    const href = `${ORIGIN}/reset#access_token=abc&expires_at=1&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`
    expect(readAuthRedirect(href)).toEqual({ kind: 'recovery' })
  })

  it('reads a used or expired link as an error, keeping GoTrue’s code', () => {
    const href = `${ORIGIN}/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    expect(readAuthRedirect(href)).toEqual({ kind: 'error', code: 'otp_expired' })
  })

  it('reads an error from the query string too (PKCE shape)', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset?error=access_denied`)).toEqual({ kind: 'error', code: 'access_denied' })
  })

  it('an error wins over tokens in the same URL', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset#access_token=a&type=recovery&error_code=otp_expired`).kind).toBe('error')
  })

  it('a sign-up confirmation is confirmed, not a recovery; a magic link is neither', () => {
    expect(readAuthRedirect(`${ORIGIN}/#access_token=a&expires_in=3600&refresh_token=r&token_type=bearer&type=signup`)).toEqual({ kind: 'confirmed' })
    expect(readAuthRedirect(`${ORIGIN}/#access_token=a&type=magiclink`)).toEqual({ kind: 'none' })
  })

  it('type=recovery or type=signup without tokens is nothing', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset#type=recovery`)).toEqual({ kind: 'none' })
    expect(readAuthRedirect(`${ORIGIN}/#type=signup`)).toEqual({ kind: 'none' })
  })

  it('a used confirmation link is an error too (9e)', () => {
    expect(readAuthRedirect(`${ORIGIN}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)).toEqual({ kind: 'error', code: 'otp_expired' })
  })

  it('a plain address is nothing', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset`)).toEqual({ kind: 'none' })
    expect(readAuthRedirect(`${ORIGIN}/sign-in?forgot`)).toEqual({ kind: 'none' })
  })
})

describe('passwordRule', () => {
  it('reads neutral before anything is typed', () => {
    expect(passwordRule('')).toEqual({ state: 'empty', text: `${MIN_PASSWORD_LENGTH}+ characters` })
  })

  it('counts what is missing while short (9b-2)', () => {
    expect(passwordRule('12345')).toEqual({ state: 'short', text: 'Use 8 or more characters — 3 to go' })
    expect(passwordRule('1234567').text).toContain('1 to go')
  })

  it('exactly the minimum is enough', () => {
    expect(passwordRule('12345678')).toEqual({ state: 'ok', text: '8+ characters' })
  })
})

describe('authProblem', () => {
  it('a fetch that never reached the server is offline (9b-3)', () => {
    expect(authProblem({ message: 'Failed to fetch', status: 0 })).toEqual({ kind: 'offline' })
  })

  it('an address that already has an account is in-use (9b-1)', () => {
    expect(authProblem({ message: 'User already registered', code: 'user_already_exists', status: 422 })).toEqual({ kind: 'in-use' })
    expect(authProblem({ message: 'x', code: 'email_exists', status: 422 })).toEqual({ kind: 'in-use' })
    expect(authProblem({ message: 'User already registered' })).toEqual({ kind: 'in-use' })
  })

  it('everything else is one calm line', () => {
    expect(authProblem({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 })).toEqual({
      kind: 'line',
      text: "That email and password don't match a garden here — try again.",
    })
    expect(authProblem({ message: 'Bad gateway', status: 502 })).toEqual({ kind: 'line', text: "That didn't take root — try again in a moment." })
  })
})

describe('inboxUrl', () => {
  it('knows the big webmail inboxes, whatever the case', () => {
    expect(inboxUrl('kai@gmail.com')).toBe('https://mail.google.com/mail/u/0/#inbox')
    expect(inboxUrl('Kai@Outlook.com')).toBe('https://outlook.live.com/mail/')
  })

  it('anything else has no button', () => {
    expect(inboxUrl('kai@example.com')).toBeNull()
    expect(inboxUrl('not-an-email')).toBeNull()
  })
})

describe('resetRequestLooksSent', () => {
  it('success reads as sent', () => {
    expect(resetRequestLooksSent(null)).toBe(true)
  })

  it('a 429 (known email, mailed moments ago) reads exactly like success', () => {
    expect(resetRequestLooksSent({ status: 429 })).toBe(true)
  })

  it('offline or server trouble asks for a retry', () => {
    expect(resetRequestLooksSent({ status: 0 })).toBe(false)
    expect(resetRequestLooksSent({ status: 500 })).toBe(false)
    expect(resetRequestLooksSent({})).toBe(false)
  })
})

describe('resetView', () => {
  const none: AuthRedirect = { kind: 'none' }
  const recovery: AuthRedirect = { kind: 'recovery' }
  const expired: AuthRedirect = { kind: 'error', code: 'otp_expired' }

  it('waits while the link is being exchanged', () => {
    expect(resetView({ redirect: recovery, loading: true, hasSession: false, recovering: true })).toBe('checking')
  })

  it('shows the form once the recovery session exists', () => {
    expect(resetView({ redirect: recovery, loading: false, hasSession: true, recovering: true })).toBe('form')
  })

  it('keeps the form across a reload mid-reset (hash gone, tab still recovering)', () => {
    expect(resetView({ redirect: none, loading: false, hasSession: true, recovering: true })).toBe('form')
  })

  it('an error link is expired immediately — even over an existing session', () => {
    expect(resetView({ redirect: expired, loading: true, hasSession: false, recovering: false })).toBe('expired')
    expect(resetView({ redirect: expired, loading: false, hasSession: true, recovering: true })).toBe('expired')
  })

  it('recovery tokens that did not hold read as expired', () => {
    expect(resetView({ redirect: recovery, loading: false, hasSession: false, recovering: true })).toBe('expired')
  })

  it('an ordinary signed-in session is not a reset', () => {
    expect(resetView({ redirect: none, loading: false, hasSession: true, recovering: false })).toBe('no-link')
  })

  it('no link and no session', () => {
    expect(resetView({ redirect: none, loading: false, hasSession: false, recovering: false })).toBe('no-link')
  })
})

describe('calmAuthLine', () => {
  it('never shows raw GoTrue text', () => {
    expect(calmAuthLine('Some unexpected failure')).toBe("That didn't take root — try again in a moment.")
  })

  it('quotes the server minimum when it names one', () => {
    expect(calmAuthLine('Password should be at least 10 characters.')).toContain('at least 10 characters')
  })

  it('falls back to the client minimum', () => {
    expect(calmAuthLine('Password should be longer')).toContain(`at least ${MIN_PASSWORD_LENGTH} characters`)
  })

  it('a reused password gets its own line', () => {
    expect(calmAuthLine('New password should be different from the old password.')).toBe(
      "That's the password you already use — choose a new one.",
    )
  })

  it('keeps the existing sign-in lines', () => {
    expect(calmAuthLine('Invalid login credentials')).toContain("don't match a garden")
    expect(calmAuthLine('Email rate limit exceeded')).toContain('short rest')
  })
})

describe('authLinkLanding', () => {
  const confirmed: AuthRedirect = { kind: 'confirmed' }
  const expired: AuthRedirect = { kind: 'error', code: 'otp_expired' }

  it('a confirmation link on "/" plays 9f on /sign-in first', () => {
    expect(authLinkLanding(confirmed, '/')).toBe('/sign-in?confirmed')
    expect(authLinkLanding(confirmed, '/sign-in?confirmed')).toBeNull()
  })

  it('a used or expired link outside /reset is 9e; on /reset it stays for 9k-3', () => {
    expect(authLinkLanding(expired, '/')).toBe('/sign-in?expired')
    expect(authLinkLanding(expired, '/sign-in?expired')).toBeNull()
    expect(authLinkLanding(expired, '/reset')).toBeNull()
  })

  it('a reset link still goes to /reset; nothing else moves', () => {
    expect(authLinkLanding({ kind: 'recovery' }, '/')).toBe('/reset')
    expect(authLinkLanding({ kind: 'recovery' }, '/reset')).toBeNull()
    expect(authLinkLanding({ kind: 'none' }, '/today')).toBeNull()
  })
})

describe('signUpOutcome', () => {
  const user = { identities: [{ id: 'i' }] }

  it('a session means confirmation is off: straight on (today)', () => {
    expect(signUpOutcome({ user, session: { access_token: 't' } })).toBe('signed-in')
  })

  it('no session means confirmation is on: check your email (9c)', () => {
    expect(signUpOutcome({ user, session: null })).toBe('check-email')
  })

  it('no identities is GoTrue hiding an existing account (9b-1)', () => {
    expect(signUpOutcome({ user: { identities: [] }, session: null })).toBe('in-use')
  })
})

describe('signInView', () => {
  const base = { link: null, loading: false, hasSession: false, waiting: false } as const

  it('the plain form, and an ordinary session goes in', () => {
    expect(signInView(base)).toBe('form')
    expect(signInView({ ...base, hasSession: true })).toBe('in')
  })

  it('9c waits; a session arriving there plays 9f', () => {
    expect(signInView({ ...base, waiting: true })).toBe('check-email')
    expect(signInView({ ...base, waiting: true, hasSession: true })).toBe('confirmed')
  })

  it('a confirmation link shows 9f while signing in, and 9e if its tokens did not hold', () => {
    expect(signInView({ ...base, link: 'confirmed', loading: true })).toBe('confirmed')
    expect(signInView({ ...base, link: 'confirmed', hasSession: true })).toBe('confirmed')
    expect(signInView({ ...base, link: 'confirmed' })).toBe('expired')
  })

  it('an expired link is 9e, unless this device is already signed in', () => {
    expect(signInView({ ...base, link: 'expired' })).toBe('expired')
    expect(signInView({ ...base, link: 'expired', hasSession: true })).toBe('in')
  })
})

describe('resendLabel', () => {
  const sent = Date.UTC(2026, 9, 3, 12, 0, 0)

  it('counts the minute down in the label (9d)', () => {
    expect(resendLabel(sent + RESEND_WAIT_MS, sent)).toBe('Resend in 1:00')
    expect(resendLabel(sent + RESEND_WAIT_MS, sent + 12_000)).toBe('Resend in 0:48')
    expect(resendLabel(sent + RESEND_WAIT_MS, sent + 12_300)).toBe('Resend in 0:48')
    expect(resendLabel(sent + RESEND_WAIT_MS, sent + 59_001)).toBe('Resend in 0:01')
  })

  it('reads plainly once the minute is up (9c)', () => {
    expect(resendLabel(sent + RESEND_WAIT_MS, sent + RESEND_WAIT_MS)).toBe('Resend link')
    expect(resendLabel(sent + RESEND_WAIT_MS, sent + 90_000)).toBe('Resend link')
  })
})
