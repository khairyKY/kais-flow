import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import { authLinkOrigin } from '../../lib/platform'
import { useOnline } from '../../lib/useOnline'
import { OfflineChip } from '../../components/States'
import { useAuth } from './AuthProvider'
import { Cta, Field, FirstRunPage, Hero, LinkButton, PasswordField, Plant, ProblemCard, ResetSent } from './AuthLayout'
import { authProblem, passwordRule, type AuthProblem } from './authLogic'
import { isRecovering, rememberEmail, rememberedEmail, requestReset } from './recovery'

// First Run.dc.html — 9a sign up · 9b-1/2/3 its errors · 9j sign in · 9k-1 reset link sent.
// 'forgot' asks for the address when "Forgot password?" is tapped with the field empty (not drawn);
// /reset's "Use a different email" lands here with ?forgot. Email confirmation is off (Kai,
// 2026-09-28 — no domain for SMTP yet), so sign-up returns a session and "/" routes the new
// account to onboarding. 9c–9f (check your email, resend cooldown, expired, confirmed) wait for
// a domain + SMTP.
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
  const formRef = useRef<HTMLFormElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Into the app through "/" — its OnboardingGate sends a brand-new account to /onboarding once.
  // A reset link opened in another tab reaches this one too (supabase-js broadcasts the
  // PASSWORD_RECOVERY event), so 9k-1's "Waiting for the link…" moves on to the new-password form.
  if (!loading && session) return <Navigate to={isRecovering() ? '/reset' : '/'} replace />

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
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${authLinkOrigin()}/` } })
    setSubmitting(false)
    if (error) return setProblem(authProblem(error))
    // With confirmation on, GoTrue hides an existing account as a user with no identities.
    if (data.user?.identities?.length === 0) return setProblem({ kind: 'in-use' })
    rememberEmail(email)
    // Confirmation switched on in the dashboard (parked 9c): there is no session to go on with.
    if (!data.session) {
      go('signin')
      setProblem({ kind: 'line', text: 'Confirm your email with the link we sent, then sign in.' })
    }
  }

  const retry = () => formRef.current?.requestSubmit()
  const card = problem && problem.kind !== 'in-use' && <ProblemCard problem={problem} onRetry={retry} />

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
