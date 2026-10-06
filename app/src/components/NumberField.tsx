import { useRef, useState, type CSSProperties } from 'react'
import { cleanDraft, commitDraft, liveValue, stepValue } from './numberDraft'

/** A small whole-number field (Kai 2026-10-06: "typing in milestone weights is annoying — you add
 * the number after the existing 1 and then remove the 1"). Focus selects what's there, so typing
 * replaces it; the field may be empty while typing; blur / Enter settles it inside min–max (empty
 * keeps the last value); −/+ step it for a thumb. Used by every number input in the app. */
export function NumberField({ value, onChange, min = 1, max = 999, step = 1, ariaLabel, style, inputStyle }: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  style?: CSSProperties
  inputStyle?: CSSProperties
}) {
  const b = { min, max }
  const [draft, setDraft] = useState<string | null>(null) // null = not typing: show `value`
  const justFocused = useRef(false)
  const commit = () => {
    if (draft === null) return
    const n = commitDraft(draft, b, value)
    setDraft(null)
    if (n !== value) onChange(n)
  }
  const stepper = (by: number, label: string, glyph: string) => (
    <button
      type="button"
      className="kf-hit"
      aria-label={`${label} ${ariaLabel}`}
      disabled={by < 0 ? value <= min : value >= max}
      onClick={() => onChange(stepValue(value, by, b))}
      style={{ width: 22, height: 22, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', borderRadius: 999, background: 'none', font: 'inherit', fontSize: 14, lineHeight: 1, color: 'var(--ink-muted)', cursor: 'pointer', opacity: (by < 0 ? value <= min : value >= max) ? 0.35 : 1 }}
    >
      {glyph}
    </button>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: 'none', ...style }}>
      {stepper(-step, 'Less', '−')}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onFocus={(e) => {
          justFocused.current = true
          e.currentTarget.select()
        }}
        // The click that focused the field would otherwise drop the selection on mouse-up.
        onMouseUp={(e) => {
          if (justFocused.current) e.preventDefault()
          justFocused.current = false
        }}
        onChange={(e) => {
          const d = cleanDraft(e.target.value)
          setDraft(d)
          const n = liveValue(d, b)
          if (n !== null && n !== value) onChange(n)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            onChange(stepValue(value, e.key === 'ArrowUp' ? step : -step, b))
          }
        }}
        style={{ width: `${Math.max(2, String(max).length) + 1.5}ch`, font: 'inherit', textAlign: 'center', color: 'var(--ink-body)', background: 'transparent', border: '1px solid var(--line-solid)', borderRadius: 4, padding: '2px 4px', outline: 'none', ...inputStyle }}
      />
      {stepper(step, 'More', '+')}
    </span>
  )
}
