import type { ReactNode } from 'react'

const DOT_COLORS = { done: 'var(--acc-sage)', current: 'var(--acc-terra)', upcoming: 'var(--line-sidebar)' }

/** The 460px glass card + blurred/tinted backdrop shared by every ritual modal. Only the
 * top gradient strip and backdrop tint vary between morning (warm) and evening (dusk). */
export function RitualModal({ gradient, backdropTint, children }: { gradient: string; backdropTint: string; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: backdropTint,
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(251,246,233,0.85)',
          backdropFilter: 'blur(9px)',
          border: '1px solid rgba(224,216,194,0.9)',
          borderRadius: 16,
          boxShadow: '0 2px 4px rgba(40,32,20,0.15), 0 30px 70px rgba(40,32,20,0.35)',
        }}
      >
        <div style={{ height: 5, background: gradient }} />
        <div style={{ padding: '20px 24px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

export function RitualHeader({ label, onSkip }: { label: string; onSkip: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</div>
      <button type="button" onClick={onSkip} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
        skip
      </button>
    </div>
  )
}

export function StepDots({ stepIndex, total }: { stepIndex: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: i < stepIndex ? DOT_COLORS.done : i === stepIndex ? DOT_COLORS.current : DOT_COLORS.upcoming,
            boxShadow: i === stepIndex ? '0 0 0 3px rgba(181,101,74,0.2)' : undefined,
          }}
        />
      ))}
    </div>
  )
}

export function RitualFooter({ stepIndex, total, onNext, isLast }: { stepIndex: number; total: number; onNext: () => void; isLast: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
      <StepDots stepIndex={stepIndex} total={total} />
      <button
        type="button"
        onClick={onNext}
        style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontFamily: 'inherit', fontSize: 13, padding: '10px 26px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}
      >
        {isLast ? 'Finish' : 'Next'}
      </button>
    </div>
  )
}

export function PillButton({ onClick, children, primary }: { onClick: () => void; children: string; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        primary
          ? { border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontFamily: 'inherit', fontSize: 11, padding: '4px 12px', borderRadius: 999, cursor: 'pointer' }
          : { border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 11, padding: '4px 12px', borderRadius: 999, cursor: 'pointer' }
      }
    >
      {children}
    </button>
  )
}
