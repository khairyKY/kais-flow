import type { CSSProperties, ReactNode } from 'react'
import { DateField } from '../../components/DatePicker'
import { TimeField } from './TimeField'
import { BLOCK_SWATCHES, swatchValue } from './blockHue'

// ── Small form atoms shared by QuickCreate / TaskEditorPage / the block menus —
// Editor.dc.html's .flabel / .fhelp / .finput / .fsel / .seg classes, ported as
// components so the three editor surfaces don't each re-declare the same styles. ──

// B (D5): a field label is metadata — the interface face, sentence case, untracked.
export const FLABEL: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-meta)',
  letterSpacing: 'var(--ls-meta)',
  color: 'var(--ink-faint)',
}

export function FLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...FLABEL, marginBottom: 6, ...style }}>{children}</div>
}

export function FHelp({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    // UI pass (2026-10-08): help is a sentence in the UI face (13, muted), not mono — mono is for labels and metadata.
    <div className="kf-help" style={style}>
      {children}
    </div>
  )
}

const inputBase: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--fs-caption)',
  color: 'var(--ink-body)',
  background: 'var(--paper-bone)',
  border: '1px solid var(--line-card)',
  borderRadius: 'var(--radius-md)', // B: inputs 12px (was 6)
  padding: '8px 10px',
  width: '100%',
}

// Wave M: our date picker instead of native <input type="date"> (FIX-7/J-25 — the OS chrome can't
// take the parchment tokens). Same "YYYY-MM-DD" value contract, "" when cleared.
export function DateInput({ value, onChange, style, title }: { value: string; onChange: (v: string) => void; style?: CSSProperties; title?: string }) {
  return <DateField value={value} onChange={onChange} title={title} style={{ ...inputBase, ...style }} />
}

// C5 (2026-07-18 audit): themed TimeField instead of native <input type="time"> —
// the OS picker chrome ignored the parchment theme. Same "HH:mm" value contract.
// `day` feeds the phone sheet's free slots.
export function TimeInput({ value, onChange, style, day }: { value: string; onChange: (v: string) => void; style?: CSSProperties; day?: string }) {
  return <TimeField value={value} onChange={onChange} day={day} style={{ ...inputBase, ...style }} />
}

// ── Segmented control — Editor .seg/.on, drawn by the kit's Segmented classes (B, D12: a visible edge,
// the pick ink-filled). Generic over any option value; an option's `color` tints its label at rest. ──
export function Seg<T extends string>({
  options,
  value,
  onChange,
  style,
  dense,
}: {
  options: { value: T; label: string; color?: string }[]
  value: T
  onChange: (v: T) => void
  style?: CSSProperties
  /** Tighter cells, for a row that shares its line (the popover's Busy / Free beside the swatches). */
  dense?: boolean
}) {
  return (
    <div className="kf-seg" role="group" style={{ display: 'flex', ...style }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" className="kf-seg-btn" aria-pressed={on} onClick={() => onChange(o.value)} style={{ ...(dense ? { padding: '0 6px', fontSize: 'var(--fs-meta)' } : null), ...(on || !o.color ? null : { color: o.color }) }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Accent color swatches — Editor 1c/1d + Overlays §02. Shared by every surface
// that colors an event/block. cal-blocks: palette C (./blockHue). ──
export const ACCENT_COLORS: { name: string; value: string | null }[] = [{ name: 'None', value: null }, ...BLOCK_SWATCHES]

export function ColorDots({ value, onChange, size = 22 }: { value: string | null; onChange: (v: string | null) => void; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
      {ACCENT_COLORS.map((c) => {
        const on = swatchValue(value) === c.value // a colour saved before palette C shows as its new swatch
        return (
          <button
            key={c.name}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={on}
            onClick={() => onChange(c.value)}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              border: c.value ? 'none' : '1.5px dashed var(--ink-hairline)',
              background: c.value ?? 'transparent',
              // Kai 2026-10-12: None reads as picked too (a faint ring), so a block with no colour
              // shows which swatch it's on.
              boxShadow: on ? `0 0 0 2.5px ${c.value ?? 'var(--ink-faint)'}` : 'none',
              outline: on ? '2px solid var(--paper-linen)' : 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink-faint)',
            }}
          >
            {!c.value ? '—' : ''}
          </button>
        )
      })}
    </div>
  )
}
