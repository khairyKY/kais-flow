import { useEffect, useId, useState, type CSSProperties, type FormEvent, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { useIsMobile } from '../../components/BottomSheet'
import { ErrorCard } from '../../components/States'
import { ToastHost } from '../../components/ToastHost'
import { useToastStore } from '../../lib/toastStore'
import { RESEND_WAIT_MS, calmAuthLine, inboxUrl, passwordRule, resendLabel, type AuthProblem } from './authLogic'
import { requestReset, resendConfirmation } from './recovery'
import './firstRun.css'

// ── First Run.dc.html — the frame every first-run screen shares: sign up (9a/9b), confirm your
// email (9c–9f), sign in (9j),
// reset (9k), onboarding (9g/9h), night (9l) and desktop (9m). Styles in firstRun.css. ──

/** The page: grain, the wordmark bar (or a ← for 9k-2), one column. Desktop adds the fern. */
export function FirstRunPage({ onSubmit, formRef, left, right, wide, children }: { onSubmit: (e: FormEvent) => void; formRef?: Ref<HTMLFormElement>; left?: ReactNode; right?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fr">
      <div className="fr-grain" />
      <img className="fr-fern" src="/ds/assets/fern/full.png" alt="" />
      <div className={`fr-bar${left ? ' fr-bar--back' : ''}`}>
        {left ?? <span className="fr-mark">Kai's Flow</span>}
        {right}
      </div>
      <form ref={formRef} className={`fr-col${wide ? ' fr-col--wide' : ''}`} onSubmit={onSubmit}>
        {children}
      </form>
      {/* Outside the app shell, so these pages carry their own (Resend's "Sent again"). */}
      <ToastHost />
    </div>
  )
}

/** One of the DS illustrations at its drawn height (desktop draws the auth ones 8px taller). */
export function Plant({ src, h = 72, envelope }: { src: string; h?: number; envelope?: boolean }) {
  return <img className={`fr-art${envelope ? ' fr-art--envelope' : ''}`} src={src} alt="" style={{ '--art-h': `${h}px` } as CSSProperties} />
}

/** The sealed envelope — reset link sent (9k-1). */
export function SealedEnvelope() {
  return (
    <div className="fr-envelope">
      <img src="/ds/assets/envelope/front.png" alt="" style={{ inset: 0, width: '100%', height: '100%' }} />
      <img src="/ds/assets/seal/intact.png" alt="" style={{ left: '50%', top: '50%', height: 52, margin: '-26px 0 0 -24px' }} />
    </div>
  )
}

export function Hero({ art, title, children }: { art: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="fr-hero">
      {art}
      <h1 className="fr-h1">{title}</h1>
      {children && <p className="fr-sub">{children}</p>}
    </div>
  )
}

type FieldProps = { label: string; hint?: string; after?: ReactNode; below?: ReactNode; boxClass?: string; inputRef?: Ref<HTMLInputElement> } & InputHTMLAttributes<HTMLInputElement>

/** Label + the 48 input box (+ an optional trailing control and a line under it). */
export function Field({ label, hint, after, below, boxClass, inputRef, ...input }: FieldProps) {
  const id = useId()
  return (
    <div>
      <label className="fr-label" htmlFor={id}>
        {label}
        {hint && <span className="fr-hint">{hint}</span>}
      </label>
      <div className={`fr-box${boxClass ? ` ${boxClass}` : ''}`}>
        <input id={id} ref={inputRef} className="fr-input" {...input} />
        {after}
      </div>
      {below}
    </div>
  )
}

/** Password with Show/Hide as a word (no eye glyph in the set). `rule` adds the live 8+ line. */
export function PasswordField({ rule, value, ...field }: Omit<FieldProps, 'type' | 'after' | 'below'> & { rule?: boolean; value: string }) {
  const [shown, setShown] = useState(false)
  const r = passwordRule(value)
  return (
    <Field
      {...field}
      value={value}
      type={shown ? 'text' : 'password'}
      required
      after={
        <button type="button" className="fr-show" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((s) => !s)}>
          {shown ? 'Hide' : 'Show'}
        </button>
      }
      below={
        rule && (
          <div className="fr-rule" data-state={r.state} aria-live="polite">
            <Icon name={r.state === 'short' ? 'alert' : 'check'} size={16} />
            {r.text}
          </div>
        )
      }
    />
  )
}

/** The lavender text action with a 48 target ("Sign in", "Forgot password?"). */
export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="fr-link" onClick={onClick}>
      {children}
    </button>
  )
}

/** The one terra CTA (kit Button), full width. Submits the form unless given an onClick. */
export function Cta({ children, loading, disabled, onClick }: { children: ReactNode; loading?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <Button type={onClick ? 'button' : 'submit'} className="fr-cta" loading={loading} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

/** A failed auth call as the DS Error card (9b-1 / 9b-3). */
export function ProblemCard({ problem, email, onSignIn, onRetry }: { problem: AuthProblem; email?: string; onSignIn?: () => void; onRetry: () => void }) {
  if (problem.kind === 'in-use') return <ErrorCard message={`${email || 'That email'} already has an account.`} onRetry={onSignIn} retryLabel="Sign in instead" />
  if (problem.kind === 'offline') return <ErrorCard message="No connection. Your details are kept — try again when you're online." onRetry={onRetry} />
  return <ErrorCard message={problem.text} />
}

/** The toast after a resend: what was sent, or why not. */
function resentLine(failed: { message?: string; status?: number } | null, sent: string): string {
  if (!failed) return sent
  return failed.status === 0 ? 'No connection — try again when you’re online.' : calmAuthLine(failed.message ?? '')
}
const toast = (message: string) => useToastStore.getState().push({ message })

/** 9c/9d check your email · 9k-1 reset link sent: the sealed envelope, "Waiting for the link…",
 * "Open email app" when we know the inbox (otherwise Resend is the one CTA), one way back, and
 * the spam hint. */
function LinkSent({ title, email, resend, alt, children }: { title: string; email: string; resend: { label: string; loading: boolean; disabled?: boolean; onClick: () => void }; alt: ReactNode; children: ReactNode }) {
  const inbox = inboxUrl(email)
  return (
    <>
      <Hero art={<SealedEnvelope />} title={title}>
        {children}
      </Hero>
      <div className="fr-waiting">
        <span className="kf-spinner kf-spinner--sm" aria-hidden="true" />
        Waiting for the link…
      </div>
      <div className="fr-stack" style={{ gap: 12, marginTop: 12 }}>
        {inbox && (
          <a className="kf-press kf-button kf-button--cta fr-cta" href={inbox} target="_blank" rel="noopener noreferrer">
            Open email app
          </a>
        )}
        <Button type="button" variant={inbox ? 'secondary' : 'cta'} className="fr-cta" loading={resend.loading} disabled={resend.disabled} onClick={resend.onClick}>
          {resend.label}
        </Button>
        <div className="fr-alt">{alt}</div>
      </div>
      <p className="fr-note">Not there? Check Spam or Promotions.</p>
    </>
  )
}

/** 9k-1 — the reset link is on its way. Resend is safe to tap: a 429 reads as sent. */
export function ResetSent({ email, onBack }: { email: string; onBack: () => void }) {
  const here = useIsMobile() ? 'this phone' : 'this device'
  const [sending, setSending] = useState(false)
  async function resend() {
    setSending(true)
    const failed = await requestReset(email)
    setSending(false)
    toast(resentLine(failed, 'Sent again — check your inbox.'))
  }
  return (
    <LinkSent title="Reset link sent" email={email} resend={{ label: 'Resend link', loading: sending, onClick: () => void resend() }} alt={<LinkButton onClick={onBack}>Back to sign in</LinkButton>}>
      We sent a password link to <b>{email}</b>. Open it on {here} to set a new one.
    </LinkSent>
  )
}

/** 9c check your email / 9d resend cooling down. Resend waits a minute from the first arrival and
 * after every send, counting down in its label. SignInPage notices the confirmation by itself, so
 * "Waiting for the link…" is true. */
export function CheckEmail({ email, onChange }: { email: string; onChange: () => void }) {
  const here = useIsMobile() ? 'this phone' : 'this device'
  const [sending, setSending] = useState(false)
  const [until, setUntil] = useState(() => Date.now() + RESEND_WAIT_MS)
  const [now, setNow] = useState(Date.now)
  const label = resendLabel(until, now)
  const cooling = until > now
  useEffect(() => {
    if (!cooling) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [cooling])
  async function resend() {
    setSending(true)
    const failed = await resendConfirmation(email)
    setSending(false)
    if (!failed) {
      setUntil(Date.now() + RESEND_WAIT_MS)
      setNow(Date.now())
    }
    toast(resentLine(failed, `Sent a new link to ${email}`))
  }
  return (
    <LinkSent
      title="Check your email"
      email={email}
      resend={{ label, loading: sending, disabled: cooling, onClick: () => void resend() }}
      alt={
        <>
          Wrong address?<LinkButton onClick={onChange}>Change it</LinkButton>
        </>
      }
    >
      We sent a link to <b>{email}</b>. Open it on {here} and you're in — no need to sign in again.
    </LinkSent>
  )
}

/** 9f — the link worked: the seal breaks and a seedling comes up (the one flourish), "Signing you
 * in…", then on into the app about a second after the session is here. No button, no wordmark. */
export function EmailConfirmed({ ready }: { ready: boolean }) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!ready) return
    // "/" → OnboardingGate → /onboarding (9g) for the new account.
    const t = setTimeout(() => navigate('/', { replace: true }), 1200)
    return () => clearTimeout(t)
  }, [ready, navigate])
  return (
    <FirstRunPage onSubmit={(e) => e.preventDefault()} left={<span />}>
      <div className="fr-confirmed">
        <Hero
          art={
            <div className="fr-sprout">
              <img src="/ds/assets/seal/broken-left.png" alt="" />
              <img src="/ds/assets/clover/seedling.png" alt="" />
              <img src="/ds/assets/seal/broken-right.png" alt="" />
            </div>
          }
          title="Email confirmed ✿"
        >
          Signing you in…
        </Hero>
        <div className="fr-hand">welcome to the garden</div>
        <div className="fr-progress" data-ready={ready || undefined} aria-hidden="true">
          <span />
        </div>
      </div>
    </FirstRunPage>
  )
}
