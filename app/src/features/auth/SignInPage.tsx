import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { AuthShell, BackLink, CardCta, CardMessage, Field, Fields, HandLine, Notice, TextLink } from './AuthLayout'
import { MIN_PASSWORD_LENGTH, calmAuthLine, resetRequestLooksSent } from './authLogic'

// J-11: 'forgot' is the password-reset request step. /reset's "Send a new link" lands here
// with ?forgot, so there is one request form, not two.
type Mode = 'signin' | 'signup' | 'forgot'

export function SignInPage() {
  const { session, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(searchParams.has('forgot') ? 'forgot' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Non-null once an email is on its way — swaps the form for the matching "sent" state.
  const [sent, setSent] = useState<{ kind: 'signup' | 'reset'; to: string } | null>(null)

  // Polish A: into the app through "/" — its index OnboardingGate sends a brand-new account to
  // /onboarding once and everyone else on to /today (it waits for settings, so no flash).
  if (!loading && session) return <Navigate to="/" replace />

  function rememberEmail() {
    try {
      localStorage.setItem('kf.lastEmail', email)
    } catch {
      /* private mode — Settings just shows "signed in" */
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    setSubmitting(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setSubmitting(false)
      if (error) setNotice(calmAuthLine(error.message))
      else rememberEmail()
      return
    }
    if (mode === 'forgot') {
      // The email link opens /reset (ResetPage), which trades it for a recovery session.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` })
      setSubmitting(false)
      // Same confirmation whether or not the account exists — see resetRequestLooksSent.
      if (resetRequestLooksSent(error)) setSent({ kind: 'reset', to: email })
      else setNotice(calmAuthLine(error?.message ?? ''))
      return
    }
    // Sign-up: Supabase's default email-verification flow. The confirmation link redirects
    // back to origin; supabase-js (detectSessionInUrl) picks the session out of the URL hash,
    // then the index OnboardingGate routes the fresh account into /onboarding.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setSubmitting(false)
    if (error) {
      setNotice(calmAuthLine(error.message))
      return
    }
    // Confirmed-email obfuscation: an existing account comes back as a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setNotice('This garden is already planted — sign in instead.')
      return
    }
    rememberEmail()
    setSent({ kind: 'signup', to: email })
  }

  function switchMode(next: Mode) {
    setMode(next)
    setNotice(null)
  }

  function backToSignIn() {
    setSent(null)
    switchMode('signin')
  }

  const signup = mode === 'signup'
  const forgot = mode === 'forgot'

  return (
    <AuthShell onSubmit={handleSubmit}>
      {sent?.kind === 'signup' ? (
        <>
          <CardMessage>
            A seed's been sent to <b>{sent.to}</b> — click it to sprout your garden ✿
          </CardMessage>
          <HandLine top={12}>then come back and sign in</HandLine>
          <BackLink onClick={backToSignIn}>← Back to sign in</BackLink>
        </>
      ) : sent?.kind === 'reset' ? (
        <>
          <CardMessage>
            If there's an account for <b>{sent.to}</b>, a link to set a new password is on its way.
          </CardMessage>
          <HandLine top={12}>check your inbox — and the spam folder, just in case</HandLine>
          <BackLink onClick={backToSignIn}>← Back to sign in</BackLink>
        </>
      ) : (
        <>
          <HandLine>
            {signup ? 'a garden of your own starts here' : forgot ? "we'll email you a link to choose a new password" : 'welcome back to the garden'}
          </HandLine>

          <Fields>
            <Field label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {!forgot && (
              <Field
                label="Password"
                type="password"
                required
                minLength={signup ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            )}
          </Fields>

          {notice && <Notice>{notice}</Notice>}

          <CardCta disabled={submitting}>
            {signup
              ? submitting ? 'Planting…' : 'Plant your garden'
              : forgot
                ? submitting ? 'Sending…' : 'Send reset link'
                : submitting ? 'Signing in…' : 'Sign in'}
          </CardCta>

          {/* J-11 (Kai's ruling): the doorways are conventional underlined links; the garden
              voice lives in the button copy, not here. */}
          {mode === 'signin' && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <TextLink onClick={() => switchMode('signup')}>Create an account</TextLink>
              <TextLink onClick={() => switchMode('forgot')}>Forgot password?</TextLink>
            </div>
          )}
          {signup && (
            <div style={{ marginTop: 18, textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-secondary)' }}>
              Already have an account? <TextLink onClick={() => switchMode('signin')}>Sign in</TextLink>
            </div>
          )}
          {forgot && <BackLink onClick={() => switchMode('signin')}>← Back to sign in</BackLink>}
        </>
      )}
    </AuthShell>
  )
}
