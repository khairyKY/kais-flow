import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { useMotionEnabled } from '../lib/motion'

// ── Shared component kit — Design System.dc.html §04. The design-system atoms
// every feature composes: Button · Chip · SectionLabel · TapeCard · Checkbox.
// Values are verbatim from §04. Composites (TaskRow, etc.) are built by their
// owning wave from these atoms. House rules (§06): radius 3px cards, tilt ±0.3–0.5°,
// tape only on placed standalone cards, one terra CTA + one gold Goal card per view. ──

// ── Button — one terra CTA per view (§04) ──
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'cta' | 'secondary' | 'ghost'
  icon?: ReactNode
}

const buttonBase: CSSProperties = {
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
}
const buttonVariants: Record<'cta' | 'secondary' | 'ghost', CSSProperties> = {
  cta: { border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', padding: '10px 17px 10px 15px', borderRadius: 999, boxShadow: 'var(--shadow-cta)' },
  secondary: { border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', padding: '9px 16px', borderRadius: 999, boxShadow: 'var(--shadow-crisp)' },
  ghost: { border: 'none', background: 'none', color: 'var(--ink-muted)', padding: '9px 6px' },
}

export function Button({ variant = 'cta', icon, children, style, ...props }: ButtonProps) {
  return (
    <button className="kf-btn" style={{ ...buttonBase, ...buttonVariants[variant], ...style }} {...props}>
      {icon}
      {children}
    </button>
  )
}

// ── Chip / tag — surface-tinted (§04) ──
type ChipTone = 'tasks' | 'inbox' | 'routed' | 'sage' | 'overdue' | 'terra' | 'gold' | 'lavender' | 'hydrangea' | 'clover' | 'bordered'

const chipTones: Record<ChipTone, CSSProperties> = {
  tasks: { background: 'rgba(212,168,176,0.16)', color: '#8A4A58' },
  inbox: { background: 'rgba(154,180,190,0.2)', color: 'var(--acc-hydrangea-deep)' },
  hydrangea: { background: 'rgba(154,180,190,0.2)', color: 'var(--acc-hydrangea-deep)' },
  routed: { background: 'rgba(138,154,126,0.18)', color: 'var(--acc-sage-text)' },
  sage: { background: 'rgba(138,154,126,0.18)', color: 'var(--acc-sage-text)' },
  overdue: { background: 'rgba(181,101,74,0.14)', color: 'var(--acc-terra)' },
  terra: { background: 'rgba(181,101,74,0.14)', color: 'var(--acc-terra)' },
  gold: { background: 'rgba(201,165,90,0.22)', color: 'var(--acc-gold)' },
  lavender: { background: 'rgba(168,160,190,0.18)', color: 'var(--acc-lavender-text)' },
  clover: { background: 'rgba(201,160,160,0.18)', color: 'var(--acc-clover-text)' },
  bordered: { border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' },
}

export function Chip({ tone = 'bordered', children, style }: { tone?: ChipTone; children: ReactNode; style?: CSSProperties }) {
  const bordered = tone === 'bordered'
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: bordered ? 9 : 10,
        letterSpacing: bordered ? '0.08em' : '0.06em',
        textTransform: 'uppercase',
        padding: bordered ? '5px 9px' : '5px 10px',
        borderRadius: bordered ? 3 : 999,
        whiteSpace: 'nowrap',
        ...chipTones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ── Section label — ≤4 per screen (§04, §06) ──
export function SectionLabel({ children, action, style }: { children: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...style }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      {action}
    </div>
  )
}

// ── TapeCard — the placed-note feel (§04). Tape ONLY on placed standalone cards. ──
export function TapeCard({
  children,
  tilt = -0.4,
  tape = 'var(--acc-gold-warm)',
  goal = false,
  style,
}: {
  children: ReactNode
  tilt?: number
  tape?: string | false
  goal?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: goal ? 'var(--paper-goal)' : 'var(--paper-parchment)',
        border: `1px solid ${goal ? 'var(--line-goal)' : 'var(--line-card)'}`,
        borderRadius: 3,
        boxShadow: goal ? 'var(--shadow-goal)' : 'var(--shadow-card)',
        transform: `rotate(${tilt}deg)`,
        padding: '22px 24px',
        ...style,
      }}
    >
      {tape && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            width: 82,
            height: 19,
            marginLeft: -41,
            background: tape,
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.32) 0 4px, transparent 4px 8px)',
            borderRadius: 1,
            boxShadow: 'var(--shadow-crisp)',
            opacity: 0.85,
          }}
        />
      )}
      {children}
    </div>
  )
}

// ── Checkbox — bloom on check (§04 task-row + Motion 5a). Uses the --check-* tokens
// (sage fill, night glow); checkPop keyframe lives in tokens/motion.css. ──
export function Checkbox({ checked, onChange, size = 17, style }: { checked: boolean; onChange?: (next: boolean) => void; size?: number; style?: CSSProperties }) {
  const motionOn = useMotionEnabled()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className="kf-checkbox"
      style={{
        width: size,
        height: size,
        flex: 'none',
        padding: 0,
        borderRadius: 5,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: checked ? 'none' : '1.5px solid var(--check-border)',
        background: checked ? 'var(--check-fill)' : 'var(--check-bg)',
        boxShadow: checked ? 'var(--check-glow)' : 'none',
        color: 'var(--check-mark)',
        fontSize: size * 0.62,
        lineHeight: 1,
        animation: checked && motionOn ? 'checkPop 260ms var(--ease-spring)' : 'none',
        ...style,
      }}
    >
      {checked ? '✓' : ''}
    </button>
  )
}
