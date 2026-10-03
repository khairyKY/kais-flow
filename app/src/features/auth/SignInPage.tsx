import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useToastStore } from '../../lib/toastStore'
import { useOnline } from '../../lib/useOnline'
import { OfflineChip } from '../../components/States'
import { useAuth } from './AuthProvider'
import { CheckEmail, Cta, EmailConfirmed, Field, FirstRunPage, Hero, LinkButton, PasswordField, Plant, ProblemCard, ResetSent } from './AuthLayout'
import { authProblem, passwordRule, signInView, signUpOutcome, type AuthProblem } from './authLogic'
import { confirmRedirect, isRecovering, rememberEmail, rememberedEmail, requestReset, resendConfirmation } from './recovery'

// First Run.dc.html — 9a sign up · 9b-1/2/3 its errors · 9c/9d check your email · 9e link expired ·
// 9f email confirmed · 9j sign in · 9k-1 reset link sent.
// 'forgot' asks for the address when "Forgot password?" is tapped with the field empty (not drawn);
// /reset's "Use a different email" lands here with ?forgot.
// Confirm email (Supabase Auth, hosted) switches 9c–9f on by itself: sign-up without a session
// shows 9c; with one (confirmation off) it goes straight to onboarding through "/". The email's
// link lands here via recovery.ts: ?confirmed → 9f → onboarding, ?expired (used or old) → 9e.
type Mode = 'signin' | 'signup' | 'forgot'

const OFFLINE_CHIP: Record<Mode, string> = {
  signup: 'Offline — connect to sign up',
  signin: 'Offline — connect to sign in',
  forgot: 'Offline — connect to send the link',
}

export function SignInPage() {
  const { session, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const online = useOnline()
  // A device that has signed in before opens on sign in, pre-filled; a fresh one on sign up (9a).
  const [email, setEmail] = useState(rememberedEmail)
  const [mode, setMode] = useState<Mode>(searchParams.has('forgot') ? 'forgot' : email ? 'signin' : 'signup')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<AuthProblem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // What an email link said (recovery.ts re-points it here), and 9c's address while it waits.
  const [link, setLink] = useState<'confirmed' | 'expired' | null>(searchParams.has('confirmed') ? 'confirmed' : searchParams.has('expired') ? 'expired' : null)
  const [waitingFor, setWaitingFor] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // 9c's "Waiting for the link…" is true twice over. A link opened in this browser signs this tab
  // in too (supabase-js broadcasts the session), and 9f plays. One opened where this tab can't
  // hear it — the Gmail app's own browser, or the website when this is the Android shell — is
  // caught on the way back: coming back to the tab tries the password once, quietly. Not
  // confirmed yet, that just fails; confirmed, it signs in.
  useEffect(() => {
    if (!waitingFor || !password) return
    const retry = () => {
      if (document.visibilityState === 'visible') void supabase.auth.signInWithPassword({ email: waitingFor, password })
    }
    document.addEventListener('visibilitychange', retry)
    return () => document.removeEventListener('visibilitychange', retry)
  }, [waitingFor, password])

  // Into the app through "/" — its OnboardingGate sends a brand-new account to /onboarding once.
  // A reset link opened in another tab reaches this one too (supabase-js broadcasts the
  // PASSWORD_RECOVERY event), so 9k-1's "Waiting for the link…" moves on to the new-password form.
  const view = signInView({ link, loading, hasSession: !!session, waiting: !!waitingFor })
  if (view === 'confirmed') return <EmailConfirmed ready={!!session} />
  if (view === 'in') return <Navigate to={isRecovering() ? '/reset' : '/'} replace />

  function go(next: Mode) {
    setMode(next)
    setProblem(null)
  }

  async function sendReset() {
    setSubmitting(true)
    const failed = await requestReset(email)
    setSubmitting(false)
    if (failed) setProblem(authProblem(failed))
    else setSentTo(email)
  }

  // 9j: one tap when the address is already typed; otherwise ask for it first.
  function forgot() {
    setProblem(null)
    if (emailRef.current?.checkValidity()) void sendReset()
    else {
      go('forgot')
      emailRef.current?.focus()
    }
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (submitting) return
    setProblem(null)
    if (mode === 'forgot') return sendReset()
    if (mode === 'signup' && passwordRule(password).state !== 'ok') {
      passwordRef.current?.focus()
      return
    }
    setSubmitting(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setSubmitting(false)
      if (error) setProblem(authProblem(error))
      else rememberEmail(email)
      return
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirmRedirect() } })
    setSubmitting(false)
    if (error) return setProblem(authProblem(error))
    const outcome = signUpOutcome(data)
    if (outcome === 'in-use') return setProblem({ kind: 'in-use' })
    rememberEmail(email)
    // Confirm email on: no session until the link is opened (9c). Off: the session takes us in.
    if (outcome === 'check-email') setWaitingFor(email)
  }

  // 9e: one tap re-sends to the address this device knows, then 9d; without one, the sign-up form.
  async function sendAgain() {
    setProblem(null)
    if (!email) return backToSignUp()
    setSubmitting(true)
    const failed = await resendConfirmation(email)
    setSubmitting(false)
    if (failed) return setProblem(authProblem(failed))
    useToastStore.getState().push({ message: `Sent a new link to ${email}` })
    setLink(null)
    setWaitingFor(email)
  }

  // 9c's "Change it" and 9e's "Use a different email": back to 9a, the fields kept.
  function backToSignUp() {
    setLink(null)
    setWaitingFor(null)
    go('signup')
  }

  const retry = () => formRef.current?.requestSubmit()
  const card = problem && problem.kind !== 'in-use' && <ProblemCard problem={problem} onRetry={retry} />

  if (view === 'expired')
    return (
      <FirstRunPage onSubmit={(e) => e.preventDefault()}>
        <Hero art={<Plant src="/ds/assets/envelope/back.png" h={104} envelope />} title="This link has expired">
          Links last an hour and work once.{email ? ` We'll send a fresh one to ${email}.` : ''}
        </Hero>
        <div className="fr-stack" style={{ gap: 12, marginTop: 28 }}>
          {problem && <ProblemCard problem={problem} onRetry={() => void sendAgain()} />}
          <Cta loading={submitting} onClick={() => void sendAgain()}>
            Send a new link
          </Cta>
          <div className="fr-alt">
            <LinkButton onClick={backToSignUp}>Use a different email</LinkButton>
          </div>
        </div>
      </FirstRunPage>
    )

  if (view === 'check-email' && waitingFor)
    return (
      <FirstRunPage onSubmit={(e) => e.preventDefault()}>
        <CheckEmail email={waitingFor} onChange={backToSignUp} />
      </FirstRunPage>
    )

  if (sentTo)
    return (
      <FirstRunPage onSubmit={(e) => e.preventDefault()}>
        <ResetSent
          email={sentTo}
          onBack={() => {
            setSentTo(null)
            go('signin')
          }}
        />
      </FirstRunPage>
    )

  return (
    <FirstRunPage onSubmit={(e) => void handleSubmit(e)} formRef={formRef}>
      {mode === 'signup' ? (
        <Hero art={<Plant src="/ds/assets/clover/seedling.png" />} title="Create your account">
          Your days, planned in one quiet place.
        </Hero>
      ) : mode === 'signin' ? (
        <Hero art={<Plant src="/ds/assets/clover/resting.png" />} title="Welcome back">
          Sign in to pick up where you left off.
        </Hero>
      ) : (
        <Hero art={<Plant src="/ds/assets/clover/resting.png" />} title="Reset your password">
          We'll email you a link to set a new one.
        </Hero>
      )}

      <div className="fr-stack">
        {!online && (
          <div>
            <OfflineChip>{OFFLINE_CHIP[mode]}</OfflineChip>
          </div>
        )}
        <Field
          label="Email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          inputRef={emailRef}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          below={
            problem?.kind === 'in-use' && (
              <div style={{ marginTop: 8 }}>
                <ProblemCard problem={problem} email={email} onSignIn={() => go('signin')} onRetry={retry} />
              </div>
            )
          }
        />
        {mode !== 'forgot' && (
          <div>
            <PasswordField
              label="Password"
              rule={mode === 'signup'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              inputRef={passwordRef}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signin' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <LinkButton onClick={forgot}>Forgot password?</LinkButton>
              </div>
            )}
          </div>
        )}
        {card}
        <Cta loading={submitting}>{mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Send reset link'}</Cta>
        {mode === 'signup' ? (
          <div className="fr-alt">
            Already have an account?<LinkButton onClick={() => go('signin')}>Sign in</LinkButton>
          </div>
        ) : mode === 'signin' ? (
          <div className="fr-alt">
            New here?<LinkButton onClick={() => go('signup')}>Create an account</LinkButton>
          </div>
        ) : (
          <div className="fr-alt">
            <LinkButton onClick={() => go('signin')}>Back to sign in</LinkButton>
          </div>
        )}
      </div>
    </FirstRunPage>
  )
}
