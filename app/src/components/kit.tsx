import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { playSound } from '../lib/sounds'
import { useMotionEnabled } from '../lib/motion'
import { Icon } from './Icon'
import type { IconName } from './icons/kf'
import './kit.css'

// ── Shared component kit — Design System.dc.html §04. The design-system atoms
// every feature composes: Button · Chip · SectionLabel · TapeCard · Checkbox · Star.
// Values are verbatim from §04; the 2026-09-28 refresh (DS-CHANGELOG §3) adds the phone sizes
// and the pressed / focus / disabled / loading / selected states, which live in kit.css so a
// media query can size them (desktop keeps its Jul 2026 sizes). Composites (TaskRow, etc.) are
// built by their owning wave from these atoms. House rules (§06): radius 3px cards, tilt ±0.3–0.5°,
// tape only on placed standalone cards, one terra CTA + one gold Goal card per view. ──

// ── Button — one terra CTA per view (§04) ──
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'cta' | 'secondary' | 'ghost'
  icon?: ReactNode
  /** 16px ring spinner in place of the icon, presses blocked; pass the in-progress label ("Saving"). */
  loading?: boolean
  /** Secondary only: the selected (filter-on) state — sage wash, sage-text border + label, check 18. */
  selected?: boolean
}

export function Button({ variant = 'cta', icon, loading = false, selected, className, disabled, children, ...props }: ButtonProps) {
  const toggles = variant === 'secondary' && selected !== undefined
  return (
    <button
      className={`kf-btn kf-press kf-button kf-button--${variant}${className ? ` ${className}` : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={toggles ? selected : undefined}
      {...props}
    >
      {loading ? <span className="kf-spinner" aria-hidden="true" /> : toggles && selected ? <Icon name="check" size={18} /> : icon}
      {children}
    </button>
  )
}

// ── Chip / tag — surface-tinted (§04) ──
// date / project / duration / priority are the capture parse chips (DS-CHANGELOG §3): same box +
// a 16px glyph. No inline ✕ (a 16px target) — tapping the chip opens its picker, which has Remove.
type ChipTone = 'tasks' | 'inbox' | 'routed' | 'sage' | 'overdue' | 'terra' | 'gold' | 'lavender' | 'hydrangea' | 'clover' | 'bordered' | 'date' | 'project' | 'duration' | 'priority'

// punch 57 → 2026-09-28: the surface tints are the --block-* tokens (day + night pairs) with the
// matching -text ink (tasks blossom, inbox hydrangea, routed sage, overdue terra-ink).
// gold and clover have no block token, so they keep the color-mix over their accent.
const chipTones: Record<ChipTone, CSSProperties> = {
  tasks: { background: 'var(--block-blossom)', color: 'var(--acc-blossom-text)' },
  inbox: { background: 'var(--block-hydrangea)', color: 'var(--acc-hydrangea-deep)' },
  hydrangea: { background: 'var(--block-hydrangea)', color: 'var(--acc-hydrangea-deep)' },
  routed: { background: 'var(--block-sage)', color: 'var(--acc-sage-text)' },
  sage: { background: 'var(--block-sage)', color: 'var(--acc-sage-text)' },
  overdue: { background: 'var(--block-terra)', color: 'var(--acc-terra-ink)' },
  terra: { background: 'var(--block-terra)', color: 'var(--acc-terra-ink)' },
  gold: { background: 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', color: 'var(--acc-gold)' },
  lavender: { background: 'var(--block-lavender)', color: 'var(--acc-lavender-text)' },
  clover: { background: 'color-mix(in srgb, var(--acc-clover) 18%, transparent)', color: 'var(--acc-clover-text)' },
  bordered: { border: '1px solid var(--line-control)', color: 'var(--ink-muted)' },
  date: { background: 'var(--block-lavender)', color: 'var(--acc-lavender-text)' },
  project: { background: 'var(--block-moss)', color: 'var(--acc-sage-text)' },
  duration: { background: 'var(--block-buttercream)', color: 'var(--acc-buttercream-text)' },
  priority: { background: 'var(--block-terra)', color: 'var(--acc-terra-ink)' },
}
const parseGlyph: Partial<Record<ChipTone, IconName>> = { date: 'calendar', project: 'projects', duration: 'clock', priority: 'priority' }

type ChipProps = {
  tone?: ChipTone
  children: ReactNode
  style?: CSSProperties
  /** A 16px leading glyph; parse tones bring their own. */
  icon?: ReactNode
  /** 1.5px inset ring in the chip ink + check 16. */
  selected?: boolean
  loading?: boolean
  disabled?: boolean
  /** Makes the chip a button (48 hit on touch) — e.g. a parse chip opening its picker (anchored on
   * the event's chip). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}

export function Chip({ tone = 'bordered', children, style, icon, selected, loading, disabled, onClick }: ChipProps) {
  const glyphName = parseGlyph[tone]
  const glyph = loading ? <span className="kf-spinner kf-spinner--sm" aria-hidden="true" /> : selected ? <Icon name="check" size={16} /> : icon ?? (glyphName && <Icon name={glyphName} size={16} />)
  const className = `kf-chip${tone === 'bordered' ? ' kf-chip--bordered' : ''}${glyph ? ' kf-chip--glyph' : ''}${selected ? ' kf-chip--selected' : ''}`
  const chipStyle = { ...chipTones[tone], ...style }
  return onClick ? (
    <button type="button" className={`${className} kf-press kf-hit`} style={chipStyle} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-busy={loading || undefined}>
      {glyph}
      {children}
    </button>
  ) : (
    <span className={className} style={chipStyle} aria-disabled={disabled || undefined}>
      {glyph}
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
// 2026-09-28 (DS-CHANGELOG §3): on a phone every box draws 22 × 22 radius 6 (`subtask` 18) in a
// 48 hit whatever `size` says — `size` stays the desktop size; kit.css owns the phone override.
export function Checkbox({ checked, onChange, size = 17, bloom = false, style, label, subtask, disabled }: { checked: boolean; onChange?: (next: boolean) => void; size?: number; bloom?: boolean; style?: CSSProperties; label?: string; subtask?: boolean; disabled?: boolean }) {
  const motionOn = useMotionEnabled()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      data-subtask={subtask || undefined}
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
            display: 'flex',
            // The kit's 2.2px check (DS Kit: 16 in a 22 box), sized to the box so the phone's 22 fits.
            width: '72%',
            height: '72%',
            // checkPop 180ms (0→1.3→1), delayed behind the 90ms fill; `both` holds scale(0) during the delay.
            animation: motionOn ? 'checkPop 180ms var(--ease-out) 90ms both' : 'none',
          }}
        >
          <Icon name="check" strokeWidth={2.2} style={{ width: '100%', height: '100%' }} />
        </span>
      ) : (
        ''
      )}
    </button>
  )
}

// ── Star (Top 3) — glyph 22 in a 48 hit; empty = --star-empty stroke, on = filled --star-on
// (DS-CHANGELOG §3; the star is the icon set's one fill). ──
export function Star({ on, onChange, label, disabled, style }: { on: boolean; onChange?: (next: boolean) => void; label?: string; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button
      type="button"
      className="kf-star"
      aria-pressed={on}
      aria-label={label ? `Top 3: "${label}"` : 'Top 3'}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      style={style}
    >
      <Icon name="star" size={22} fill={on ? 'currentColor' : 'none'} />
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
    // Kai's phone review: beside a page's meta line it wrapped "ALL / PROJECTS" — it never wraps or shrinks
    whiteSpace: 'nowrap',
    flex: 'none',
    ...style,
  }
  return nav.to ? (
    <Link to={nav.to} className="kf-backlink kf-hit" style={backLinkStyle}>{content}</Link>
  ) : (
    <button type="button" onClick={nav.onClick} className="kf-backlink kf-hit" style={backLinkStyle}>{content}</button>
  )
}
