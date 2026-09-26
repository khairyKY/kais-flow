import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useToastStore } from '../../lib/toastStore'
import { useAuth } from './AuthProvider'
import { AuthShell, BackLink, CardCta, CardMessage, Field, Fields, HandLine, Notice } from './AuthLayout'
import { MIN_PASSWORD_LENGTH, calmAuthLine, newPasswordProblem, resetView } from './authLogic'
import { bootAuthRedirect, forgetRecovery, isRecovering } from './recovery'

// J-11 · /reset — where the "Forgot password?" email lands. Public on purpose: it sits outside
// RequireAuth and the index OnboardingGate, so neither can bounce a recovery session to /today
// before the new password is saved. supabase-js turns the link into that session on boot;
// recovery.ts records that it happened. Same card as sign-in (AuthLayout) until Phase C.
export function ResetPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The session can lapse while the form is open (the link's session is short-lived).
  const [lapsed, setLapsed] = useState(false)

  const view = lapsed
    ? 'expired'
    : resetView({ redirect: bootAuthRedirect, loading, hasSession: !!session, recovering: isRecovering() })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (view !== 'form') return
    const problem = newPasswordProblem(password, confirm)
    if (problem) {
      setNotice(problem)
      return
    }
    setNotice(null)
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      const sessionGone =
        error.name === 'AuthSessionMissingError' || error.code === 'session_not_found' || error.code === 'session_expired' || error.status === 401
      if (sessionGone) setLapsed(true)
      else setNotice(calmAuthLine(error.message))
      return
    }
    forgetRecovery()
    useToastStore.getState().push({ message: 'New password saved — welcome back.' })
    // Into the app the usual way: RequireAuth → OnboardingGate → /today (or /onboarding).
    navigate('/', { replace: true })
  }

  const back = session
    ? { label: "← Back to Kai's Flow", to: '/' }
    : { label: '← Back to sign in', to: '/sign-in' }

  return (
    <AuthShell onSubmit={handleSubmit}>
      {view === 'checking' && <HandLine>opening your link…</HandLine>}

      {view === 'form' && (
        <>
          <HandLine>choose a new password{session?.user.email ? ` for ${session.user.email}` : ''}</HandLine>
          <Fields>
            <Field
              label="New password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Field
              label="Confirm password"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </Fields>
          {notice && <Notice>{notice}</Notice>}
          <CardCta disabled={submitting}>{submitting ? 'Saving…' : 'Save new password'}</CardCta>
        </>
      )}

      {(view === 'expired' || view === 'no-link') && (
        <>
          <CardMessage>
            {view === 'expired'
              ? 'This reset link has expired or has already been used.'
              : 'Password reset links from your email open here.'}
          </CardMessage>
          <HandLine top={12}>each link works once — ask for a fresh one any time</HandLine>
          {/* A signed-in visitor doesn't need a link (and /sign-in would send them to Today). */}
          {!session && <CardCta onClick={() => navigate('/sign-in?forgot')}>Send a new link</CardCta>}
          <BackLink onClick={() => navigate(back.to, { replace: true })}>{back.label}</BackLink>
        </>
      )}
    </AuthShell>
  )
}
