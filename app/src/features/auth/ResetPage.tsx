import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useToastStore } from '../../lib/toastStore'
import { useOnline } from '../../lib/useOnline'
import { Icon } from '../../components/Icon'
import { OfflineChip } from '../../components/States'
import { useIsMobile } from '../../components/BottomSheet'
import { signOut, useAuth } from './AuthProvider'
import { Cta, FirstRunPage, Hero, LinkButton, PasswordField, Plant, ProblemCard, ResetSent } from './AuthLayout'
import { authProblem, passwordRule, resetView, type AuthProblem } from './authLogic'
import { bootAuthRedirect, forgetRecovery, isRecovering, rememberedEmail, requestReset } from './recovery'

// J-11 · /reset — where the "Forgot password?" email lands (First Run 9k-2 set a new password,
// 9k-3 link expired). Public on purpose: it sits outside RequireAuth and the index
// OnboardingGate, so neither can bounce a recovery session to /today before the new password is
// saved. supabase-js turns the link into that session on boot; recovery.ts records that it did.
export function ResetPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const online = useOnline()
  const here = useIsMobile() ? 'this phone' : 'this device'
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<AuthProblem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // The session can lapse while the form is open (the link's session is short-lived).
  const [lapsed, setLapsed] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const view = lapsed
    ? 'expired'
    : resetView({ redirect: bootAuthRedirect, loading, hasSession: !!session, recovering: isRecovering() })
  const email = session?.user.email ?? rememberedEmail()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (view !== 'form' || submitting) return
    if (passwordRule(password).state !== 'ok') {
      passwordRef.current?.focus()
      return
    }
    setProblem(null)
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      const sessionGone =
        error.name === 'AuthSessionMissingError' || error.code === 'session_not_found' || error.code === 'session_expired' || error.status === 401
      if (sessionGone) setLapsed(true)
      else setProblem(authProblem(error))
      return
    }
    forgetRecovery()
    useToastStore.getState().push({ message: 'New password saved — welcome back.' })
    // Into the app the usual way: RequireAuth → OnboardingGate → /today (or /onboarding).
    navigate('/', { replace: true })
  }

  // 9k-3: one tap re-sends to the address this device knows; without one, ask for it.
  async function sendAgain() {
    if (!email) return navigate('/sign-in?forgot')
    setSubmitting(true)
    const failed = await requestReset(email)
    setSubmitting(false)
    if (failed) setProblem(authProblem(failed))
    else setSentTo(email)
  }

  // 9k-2's ←: leave without a new password. The recovery session goes too, or "/" would walk
  // into the app on it (signOut keeps it only when this device still owes the server changes).
  const leave = () => void signOut().then(() => navigate('/sign-in', { replace: true }))

  if (sentTo)
    return (
      <FirstRunPage onSubmit={(e) => e.preventDefault()}>
        <ResetSent email={sentTo} onBack={() => navigate('/sign-in', { replace: true })} />
      </FirstRunPage>
    )

  if (view === 'form')
    return (
      <FirstRunPage
        onSubmit={(e) => void handleSubmit(e)}
        formRef={formRef}
        left={
          <button type="button" className="fr-back kf-press" aria-label="Back to sign in" onClick={leave}>
            <Icon name="back" size={24} />
          </button>
        }
      >
        <Hero art={<Plant src="/ds/assets/fern/unfurl1.png" h={96} />} title="Set a new password">
          {email ? `For ${email}. ` : ''}You'll stay signed in on {here}.
        </Hero>
        <div className="fr-stack">
          {!online && (
            <div>
              <OfflineChip>Offline — connect to save it</OfflineChip>
            </div>
          )}
          <PasswordField label="New password" rule autoComplete="new-password" autoFocus inputRef={passwordRef} value={password} onChange={(e) => setPassword(e.target.value)} />
          {problem && <ProblemCard problem={problem} onRetry={() => formRef.current?.requestSubmit()} />}
          <Cta loading={submitting}>Save password</Cta>
        </div>
      </FirstRunPage>
    )

  if (view === 'checking')
    return (
      <FirstRunPage onSubmit={(e) => e.preventDefault()}>
        <Hero art={<Plant src="/ds/assets/fern/unfurl1.png" h={96} />} title="Opening your link…" />
      </FirstRunPage>
    )

  // 9k-3 (and /reset opened without a link). A signed-in visitor needs no link — and /sign-in
  // would only send them on to Today — so they just get the way back.
  const expired = view === 'expired'
  return (
    <FirstRunPage onSubmit={(e) => e.preventDefault()}>
      <Hero art={<Plant src="/ds/assets/envelope/back.png" h={104} />} title={expired ? 'This reset link has expired' : 'Reset links open here'}>
        {expired ? 'Reset links last an hour and work once.' : 'Ask for a link and open it from your email.'}
        {!session && email ? ` We'll send a new one to ${email}.` : ''}
      </Hero>
      <div className="fr-stack" style={{ gap: 12, marginTop: 28 }}>
        {problem && <ProblemCard problem={problem} onRetry={() => void sendAgain()} />}
        {session ? (
          <Cta onClick={() => navigate('/', { replace: true })}>Back to Kai's Flow</Cta>
        ) : (
          <>
            <Cta loading={submitting} onClick={() => void sendAgain()}>
              Send a new link
            </Cta>
            <div className="fr-alt">
              <LinkButton onClick={() => navigate('/sign-in?forgot')}>Use a different email</LinkButton>
            </div>
          </>
        )}
      </div>
    </FirstRunPage>
  )
}
