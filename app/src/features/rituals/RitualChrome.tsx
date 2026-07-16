import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

// ── Shared chrome for the ritual takeovers — pixel contract Rituals.dc.html 1a-1d/1g
// (Morning, parchment "scene" panel) + 2b-2e/3a (Closing/Evening, dark dusk phone-first).
// The two rituals use genuinely different visual systems in the export (day-lit paper vs.
// fixed-dark dusk), so only the truly shared bits — breakpoint + small link/pill atoms — live
// here; each ritual builds its own panel chrome to stay a faithful transcription. ──

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

// `.flabel` — step label, e.g. "Morning ritual · step 1/4"
export function FieldLabel({ children, color = 'var(--ink-faint)' }: { children: ReactNode; color?: string }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>{children}</span>
}

// `.rlink` — ghost text link (skip / drop / dismiss / re-pick)
export function RLink({ onClick, children, color = 'var(--ink-faint)', style }: { onClick?: () => void; children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onClick} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color, cursor: 'pointer', ...style }}>
      {children}
    </button>
  )
}

// `.pill` — bordered mono pill button
export function Pill({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, cursor: 'pointer' }}>
      {children}
    </button>
  )
}

// Terra CTA pill — the recurring "Next →" / "Continue" / "Keep & continue →" button.
export function CtaButton({ onClick, children, full, style }: { onClick?: () => void; children: ReactNode; full?: boolean; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'var(--acc-terra)',
        color: 'var(--paper-parchment)',
        fontFamily: 'inherit',
        fontSize: 13,
        padding: '9px 22px',
        borderRadius: 999,
        boxShadow: 'var(--shadow-cta)',
        cursor: 'pointer',
        width: full ? '100%' : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
