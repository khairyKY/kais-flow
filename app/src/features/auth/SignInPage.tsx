import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { TapeCard, Button } from '../../components/kit'

// Kai's eye: Restyled with system tokens, TapeCard, and Button
const FIELD_LABEL = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-tertiary)',
}

const FIELD_INPUT = {
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 3, // House rules §06: sharp 3px card/input radius
  padding: '11px 13px',
  outline: 'none',
  color: 'var(--text-primary)',
}

type Mode = 'signin' | 'signup'

// House rule: the word "error" (and raw GoTrue text) never reaches the UI — same register as
// the outbox toast ("One change couldn't be saved — set aside so the rest sync on.").
function calmAuthLine(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('password') && (m.includes('at least') || m.includes('should be')))
    return 'Passwords need at least 6 characters — a little more soil.'
  if (m.includes('already registered')) return 'This garden is already planted — sign in instead.'
  if (m.includes('not confirmed')) return "Your seed hasn't sprouted yet — click the link in your email first."
  if (m.includes('invalid login credentials')) return "That email and password don't match a garden here — try again."
  if (m.includes('rate limit') || m.includes('too many')) return 'The garden needs a short rest — try again in a minute.'
  return "That didn't take root — try again in a moment."
}

export function SignInPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Non-null once a verification email is on its way — swaps the form for the "seed sent" state.
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/today" replace />

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
    setSentTo(email)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setNotice(null)
  }

  const signup = mode === 'signup'

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', position: 'relative', overflow: 'hidden' }}>
      <style>{'@media (max-width: 767px) { .signin-bg-illustration { display: none; } }'}</style>
      <img className="signin-bg-illustration" src="/ds/assets/fern/full.png" alt="" style={{ position: 'absolute', left: 120, top: 120, height: 640, width: 'auto', opacity: 0.16, transform: 'rotate(-6deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="/ds/assets/cherry/opening.png" alt="" style={{ position: 'absolute', right: 150, bottom: 110, height: 420, width: 'auto', opacity: 0.13, transform: 'rotate(7deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="/ds/assets/clover/dewdrop.png" alt="" style={{ position: 'absolute', right: 280, top: 130, height: 180, width: 'auto', opacity: 0.14, transform: 'rotate(-4deg)', pointerEvents: 'none' }} />

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 384, margin: '0 16px' }}>
        <TapeCard
          tilt={-0.4}
          tape="color-mix(in oklch, var(--acc-sage) 40%, transparent)" // Sage tape to match original login design
          style={{
            boxShadow: 'var(--shadow-popover)',
            padding: '34px 34px 30px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 'var(--fw-semibold)', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>Kai's Flow</div>
          </div>

          {sentTo ? (
            <>
              <p style={{ marginTop: 26, marginBottom: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                A seed's been sent to <b>{sentTo}</b> — click it to sprout your garden ✿
              </p>
              <div style={{ marginTop: 12, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-0.8deg)' }}>then come back and sign in</div>
              <button
                type="button"
                onClick={() => {
                  setSentTo(null)
                  switchMode('signin')
                }}
                style={{ marginTop: 22, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
              >
                ← Back to sign in
              </button>
            </>
          ) : (
            <>
              <div style={{ marginTop: 6, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-0.8deg)' }}>
                {signup ? 'a garden of your own starts here' : 'welcome back to the garden'}
              </div>

              <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={FIELD_LABEL}>Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={FIELD_INPUT}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={FIELD_LABEL}>Password</span>
                  <input
                    type="password"
                    required
                    minLength={signup ? 6 : undefined}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={FIELD_INPUT}
                  />
                </label>
              </div>

              {notice && <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--acc-terra)' }}>{notice}</p>}

              <Button
                type="submit"
                variant="cta"
                disabled={submitting}
                style={{
                  marginTop: 24,
                  width: '100%',
                  justifyContent: 'center',
                  padding: '13px 0',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                {signup ? (submitting ? 'Planting…' : 'Plant your garden') : submitting ? 'Signing in…' : 'Sign in'}
              </Button>

              <button
                type="button"
                onClick={() => switchMode(signup ? 'signin' : 'signup')}
                style={{ marginTop: 18, display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--text-secondary)' }}
              >
                {signup ? 'Already have a garden? Sign in →' : 'New here? Plant your garden →'}
              </button>
            </>
          )}
        </TapeCard>
      </form>
    </div>
  )
}
