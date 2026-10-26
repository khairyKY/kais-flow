import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { DateField } from '../../components/DatePicker'
import { TimeField } from './TimeField'
import { Icon } from '../../components/Icon'
import { BLOCK_SWATCHES, blockHue, swatchValue } from './blockHue'

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

// Menu B's swatch tray (cal-blocks, Kai 2026-10-26 — design-export/Calendar extras options.html): under the block's
// title, a quiet bone tray of None and palette C's 16 swatches in 8 columns (drawn in the theme's own value), and a
// labelled "+ Custom" — the system colour picker; the block then reads its colour's own AA text tone (./blockHue).
const TRAY_CSS = `
.kf-swatch-tray { display: grid; grid-template-columns: repeat(8, var(--z)); gap: 6px; padding: 8px; border-radius: 8px; background: var(--paper-bone); justify-content: start; }
.kf-sw { position: relative; width: var(--z); height: var(--z); padding: 0; border: none; border-radius: 50%; cursor: pointer; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink-body) 14%, transparent); }
.kf-sw[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--paper-parchment), 0 0 0 3.5px var(--sel-bg); }
.kf-sw[aria-pressed="true"]::after { content: ''; position: absolute; left: 50%; top: 50%; width: 5px; height: 9px; margin: -6px 0 0 -3px; border: solid var(--ink-body); border-width: 0 2px 2px 0; transform: rotate(45deg); }
.kf-sw[data-none] { background: var(--paper-parchment); box-shadow: inset 0 0 0 1px var(--line-control); }
.kf-sw[data-none]::before { content: ''; position: absolute; left: 3px; right: 3px; top: 50%; border-top: 1.5px solid var(--ink-faint); transform: rotate(-45deg); }
.kf-sw-custom { position: relative; grid-column: span 3; justify-self: start; display: inline-flex; align-items: center; gap: 4px; height: var(--z); padding: 0 9px 0 6px; border-radius: var(--radius-pill); box-shadow: inset 0 0 0 1px var(--line-control); font-family: var(--font-ui); font-size: var(--fs-caption); color: var(--ink-muted); cursor: pointer; white-space: nowrap; }
.kf-sw-custom[data-on] { box-shadow: 0 0 0 2px var(--paper-parchment), 0 0 0 3.5px var(--sel-bg); color: var(--ink-body); }
.kf-sw-custom > i { width: 10px; height: 10px; border-radius: 50%; }
.kf-sw-custom > input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
.kf-sw:focus-visible, .kf-sw-custom:focus-within { outline: none; box-shadow: var(--focus-ring); }
`

export function SwatchTray({ value, onChange, size = 20 }: { value: string | null; onChange: (v: string | null) => void; size?: number }) {
  const cur = swatchValue(value)
  const custom = !!cur && !BLOCK_SWATCHES.some((s) => s.value === cur)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef(onChange)
  latest.current = onChange
  // The picker's `change` (its last pick), not React's onChange — that is `input`, one write per drag step.
  useEffect(() => {
    const el = input.current
    if (!el) return
    const pick = () => latest.current(el.value.toUpperCase())
    el.addEventListener('change', pick)
    return () => el.removeEventListener('change', pick)
  }, [])
  return (
    <div className="kf-swatch-tray" role="group" aria-label="Colour" style={{ ['--z' as string]: `${size}px` }}>
      <style>{TRAY_CSS}</style>
      {ACCENT_COLORS.map((c) => (
        <button
          key={c.name}
          type="button"
          className="kf-sw"
          data-none={c.value ? undefined : ''}
          title={c.value ? c.name : 'No colour'}
          aria-label={c.value ? c.name : 'No colour'}
          aria-pressed={cur === c.value}
          style={c.value ? { background: blockHue(c.value).c } : undefined}
          onClick={() => onChange(c.value)}
        />
      ))}
      <label className="kf-sw-custom" title="Custom colour" data-on={custom ? '' : undefined}>
        {custom ? <i style={{ background: cur! }} /> : <Icon name="plus" size={12} />}
        Custom
        <input ref={input} type="color" aria-label="Custom colour" defaultValue={custom ? cur!.toLowerCase() : '#b59ce3'} /* ds-ok: the picker's starting colour (Iris) */ />
      </label>
    </div>
  )
}
