import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

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
  borderRadius: 6,
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', position: 'relative', overflow: 'hidden' }}>
      <style>{'@media (max-width: 767px) { .signin-bg-illustration { display: none; } }'}</style>
      <img className="signin-bg-illustration" src="assets/fern/full.png" alt="" style={{ position: 'absolute', left: 120, top: 120, height: 640, width: 'auto', opacity: 0.16, transform: 'rotate(-6deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="assets/cherry/opening.png" alt="" style={{ position: 'absolute', right: 150, bottom: 110, height: 420, width: 'auto', opacity: 0.13, transform: 'rotate(7deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="assets/clover/dewdrop.png" alt="" style={{ position: 'absolute', right: 280, top: 130, height: 180, width: 'auto', opacity: 0.14, transform: 'rotate(-4deg)', pointerEvents: 'none' }} />

      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 384,
          margin: '0 16px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--line-card)',
          borderRadius: 4,
          boxShadow: 'var(--shadow-popover)',
          padding: '34px 34px 30px',
          transform: 'rotate(-0.4deg)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            width: 78,
            height: 18,
            marginLeft: -39,
            background: 'rgba(138,154,126,0.4)',
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
            transform: 'rotate(-2deg)',
            borderRadius: 1,
            boxShadow: 'var(--shadow-crisp)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="assets/clover/seedling.png" alt="" style={{ height: 34, width: 'auto', objectFit: 'contain' }} />
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

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 24,
            width: '100%',
            border: 'none',
            background: 'var(--acc-terra)',
            color: 'var(--text-on-accent)',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 500,
            padding: '13px 0',
            borderRadius: 999,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.5 : 1,
            boxShadow: 'var(--shadow-cta)',
          }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
