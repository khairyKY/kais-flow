import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { playSound } from '../lib/sounds'
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

// punch 57: every tint was a hard-coded DAY accent rgba, so at night the chips kept their
// daylight fill on the dark ground (the "maroon-on-dark chip"). Each literal is exactly its
// accent token at that alpha, so color-mix over the token is byte-identical in day and flips
// automatically at night. `tasks` ink is the one value with no --acc-*-text token to reach for.
const chipTones: Record<ChipTone, CSSProperties> = {
  tasks: { background: 'color-mix(in srgb, var(--acc-blossom) 16%, transparent)', color: 'var(--kf-chip-tasks, #8A4A58)' },
  inbox: { background: 'color-mix(in srgb, var(--acc-hydrangea) 20%, transparent)', color: 'var(--acc-hydrangea-deep)' },
  hydrangea: { background: 'color-mix(in srgb, var(--acc-hydrangea) 20%, transparent)', color: 'var(--acc-hydrangea-deep)' },
  routed: { background: 'color-mix(in srgb, var(--acc-sage) 18%, transparent)', color: 'var(--acc-sage-text)' },
  sage: { background: 'color-mix(in srgb, var(--acc-sage) 18%, transparent)', color: 'var(--acc-sage-text)' },
  overdue: { background: 'color-mix(in srgb, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)' },
  terra: { background: 'color-mix(in srgb, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)' },
  gold: { background: 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', color: 'var(--acc-gold)' },
  lavender: { background: 'color-mix(in srgb, var(--acc-lavender) 18%, transparent)', color: 'var(--acc-lavender-text)' },
  clover: { background: 'color-mix(in srgb, var(--acc-clover) 18%, transparent)', color: 'var(--acc-clover-text)' },
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
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      {action}
    </div>
  )
}

// ── KeyChip — one keyboard key drawn as a keycap: Overlays.dc.html §04 `.kbd`, verbatim.
// J-17 (Kai, 2026-07-29): "the same exact thing globally — anywhere you're using a keyboard
// shortcut", so every shortcut display composes this instead of plain mono text. `sm` is the
// same cap scaled down for dense rows (menu items, sidebar footer, the Inbox strip) so it sits
// inside the row's existing height instead of growing it. `<kbd>` for the semantics; every
// UA default it carries (monospace font) is overridden below. ──
export function KeyChip({ text, size = 'md', style }: { text: string; size?: 'md' | 'sm'; style?: CSSProperties }) {
  const sm = size === 'sm'
  return (
    <kbd
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: sm ? 'var(--fs-mono-xs)' : 'var(--fs-mono)',
        lineHeight: 1,
        letterSpacing: 0,
        textTransform: 'none',
        color: 'var(--ink-body)',
        background: 'var(--paper-bone)',
        border: '1px solid var(--line-card)',
        borderBottomWidth: 2,
        borderRadius: sm ? 4 : 5,
        padding: sm ? '2px var(--sp-1)' : '5px 7px',
        minWidth: sm ? 16 : 22,
        textAlign: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-crisp)',
        ...style,
      }}
    >
      {text}
    </kbd>
  )
}

/** A chord — one KeyChip per key, e.g. `['⌘', 'K']` (the `?` overlay's `.kkeys` row). */
export function KeyCombo({ keys, size = 'md', className, style }: { keys: readonly string[]; size?: 'md' | 'sm'; className?: string; style?: CSSProperties }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? 3 : 5, flex: 'none', ...style }}>
      {keys.map((k, i) => (
        <KeyChip key={`${k}-${i}`} text={k} size={size} />
      ))}
    </span>
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
// R4-24 (Kai's 2026-07-20 ruling): the bloom (Motion 5a — pop + glow) is reserved for the Top-3
// and the Goal of the day, plus milestones. "Not every task in the today view, not in task view,
// not anywhere." Everything else still fills and shows its check, just without the ceremony —
// so opt in with `bloom`, don't opt out.
// U-5: `label` names the thing being checked ("Complete \"Buy tyres\"") — a screen reader said
// only "checkbox, not checked" 411 times on Tasks. Without it, a generic action name.
export function Checkbox({ checked, onChange, size = 17, bloom = false, style, label }: { checked: boolean; onChange?: (next: boolean) => void; size?: number; bloom?: boolean; style?: CSSProperties; label?: string }) {
  const motionOn = useMotionEnabled()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ? `Complete "${label}"` : checked ? 'Mark not done' : 'Mark done'}
      onClick={() => {
        // Sound map (MOTION_RETROFIT §E): paper rustle on task complete. Silent unless the
        // user turned it on — playSound gates itself, so no settings branch here.
        if (!checked) playSound('paper_rustle')
        onChange?.(!checked)
      }}
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
        boxShadow: checked && bloom ? 'var(--check-glow)' : 'none',
        color: 'var(--check-mark)',
        fontSize: size * 0.62,
        lineHeight: 1,
        // Motion 3b (F4): boxFill 90ms on every checkbox; the mark pops after it.
        animation: checked && motionOn ? 'boxFill 90ms var(--ease-out)' : 'none',
        ...style,
      }}
    >
      {checked ? (
        <span
          style={{
            display: 'inline-block',
            // checkPop 180ms (0→1.3→1), delayed behind the 90ms fill; `both` holds scale(0) during the delay.
            animation: motionOn ? 'checkPop 180ms var(--ease-out) 90ms both' : 'none',
          }}
        >
          ✓
        </span>
      ) : (
        ''
      )}
    </button>
  )
}

// ── BackLink — every page's "← Tasks" / "← Projects" breadcrumb (was hand-styled
// per file: no padding, no hover feedback, tiny hit target). One atom, a real
// hit target (.kf-hit, same rule the sidebar's small glyphs use), a hover tint,
// and a stroke chevron instead of the "←" glyph so it lines up with the rest
// of the icon set (sidebar nav uses the same stroke style). ──
type BackLinkProps = { children: ReactNode; style?: CSSProperties } & (
  | { to: string; onClick?: never }
  | { to?: never; onClick: () => void }
)

export function BackLink({ children, style, ...nav }: BackLinkProps) {
  const content = (
    <>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      {children}
    </>
  )
  const backLinkStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    margin: '-6px -8px',
    padding: '6px 8px',
    borderRadius: 6,
    font: 'inherit',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--fs-meta)',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--ink-muted)',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    ...style,
  }
  return nav.to ? (
    <Link to={nav.to} className="kf-backlink kf-hit" style={backLinkStyle}>{content}</Link>
  ) : (
    <button type="button" onClick={nav.onClick} className="kf-backlink kf-hit" style={backLinkStyle}>{content}</button>
  )
}
