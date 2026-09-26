import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  calmAuthLine,
  newPasswordProblem,
  readAuthRedirect,
  resetRequestLooksSent,
  resetView,
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

  it('a sign-up confirmation or magic link is not a recovery', () => {
    expect(readAuthRedirect(`${ORIGIN}/#access_token=a&type=signup`)).toEqual({ kind: 'none' })
    expect(readAuthRedirect(`${ORIGIN}/#access_token=a&type=magiclink`)).toEqual({ kind: 'none' })
  })

  it('type=recovery without tokens is not a recovery', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset#type=recovery`)).toEqual({ kind: 'none' })
  })

  it('a plain address is nothing', () => {
    expect(readAuthRedirect(`${ORIGIN}/reset`)).toEqual({ kind: 'none' })
    expect(readAuthRedirect(`${ORIGIN}/sign-in?forgot`)).toEqual({ kind: 'none' })
  })
})

describe('newPasswordProblem', () => {
  it(`asks for at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(newPasswordProblem('1234567', '1234567')).toContain(`at least ${MIN_PASSWORD_LENGTH}`)
    expect(newPasswordProblem('', '')).toContain(`at least ${MIN_PASSWORD_LENGTH}`)
  })

  it('exactly the minimum is enough', () => {
    expect(newPasswordProblem('12345678', '12345678')).toBeNull()
  })

  it('the two fields must match', () => {
    expect(newPasswordProblem('longenough1', 'longenough2')).toContain("don't match")
  })

  it('length is checked before the match', () => {
    expect(newPasswordProblem('short', 'other')).toContain('at least')
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
