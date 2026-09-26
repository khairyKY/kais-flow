import type { CSSProperties, FormEvent, InputHTMLAttributes, ReactNode } from 'react'
import { TapeCard, Button } from '../../components/kit'

// The sign-in card, lifted out of SignInPage verbatim so /reset (J-11) wears exactly the same
// page, card, inputs and button — no second look. A proper design pass is Phase C's job.

// Kai's eye: Restyled with system tokens, TapeCard, and Button
const FIELD_LABEL: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
}

const FIELD_INPUT: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 3, // House rules §06: sharp 3px card/input radius
  padding: '11px 13px',
  outline: 'none',
  color: 'var(--text-primary)',
}

/** The whole page: paper ground, faded botanicals (desktop only), the taped card and its logo. */
export function AuthShell({ onSubmit, children }: { onSubmit: (e: FormEvent) => void; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', position: 'relative', overflow: 'hidden' }}>
      <style>{'@media (max-width: 767px) { .signin-bg-illustration { display: none; } }'}</style>
      <img className="signin-bg-illustration" src="/ds/assets/fern/full.png" alt="" style={{ position: 'absolute', left: 120, top: 120, height: 640, width: 'auto', opacity: 0.16, transform: 'rotate(-6deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="/ds/assets/cherry/opening.png" alt="" style={{ position: 'absolute', right: 150, bottom: 110, height: 420, width: 'auto', opacity: 0.13, transform: 'rotate(7deg)', pointerEvents: 'none' }} />
      <img className="signin-bg-illustration" src="/ds/assets/clover/dewdrop.png" alt="" style={{ position: 'absolute', right: 280, top: 130, height: 180, width: 'auto', opacity: 0.14, transform: 'rotate(-4deg)', pointerEvents: 'none' }} />

      <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 384, margin: '0 16px' }}>
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
          {children}
        </TapeCard>
      </form>
    </div>
  )
}

/** The handwritten line under the logo (or under a message, with a larger top gap). */
export function HandLine({ children, top = 6 }: { children: ReactNode; top?: number }) {
  return <div style={{ marginTop: top, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-secondary)', transform: 'rotate(-0.8deg)' }}>{children}</div>
}

/** A plain message paragraph inside the card (the "seed sent" register). */
export function CardMessage({ children }: { children: ReactNode }) {
  return <p style={{ marginTop: 26, marginBottom: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)' }}>{children}</p>
}

/** The stack of labelled inputs. */
export function Fields({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
}

export function Field({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={FIELD_LABEL}>{label}</span>
      <input {...input} style={FIELD_INPUT} />
    </label>
  )
}

/** The calm terra line under the fields — never raw GoTrue text (see calmAuthLine). */
export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" style={{ marginTop: 12, marginBottom: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--acc-terra)' }}>{children}</p>
}

/** The card's one terra CTA. Submits the form unless given an onClick. */
export function CardCta({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <Button
      type={onClick ? 'button' : 'submit'}
      variant="cta"
      disabled={disabled}
      onClick={onClick}
      style={{
        marginTop: 24,
        width: '100%',
        justifyContent: 'center',
        padding: '13px 0',
        fontWeight: 500,
        fontSize: 14,
      }}
    >
      {children}
    </Button>
  )
}

/** The small mono "← Back to sign in" link. */
export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ marginTop: 22, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
    >
      {children}
    </button>
  )
}

/** J-11: a conventional underlined text link ("Create an account", "Forgot password?"). */
export function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: 3 }}
    >
      {children}
    </button>
  )
}
