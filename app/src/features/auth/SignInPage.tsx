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

export function SignInPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/today" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setError(error.message)
  }

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
          <div style={{ marginTop: 6, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-0.8deg)' }}>welcome back to the garden</div>

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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={FIELD_INPUT}
              />
            </label>
          </div>

          {error && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--acc-terra)' }}>{error}</p>}

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
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </TapeCard>
      </form>
    </div>
  )
}
