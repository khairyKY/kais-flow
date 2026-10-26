import { useId, useState, type CSSProperties } from 'react'
import { useHour24 } from '../lib/clock'
import { applyTyped, readTyped, typedEcho, type Typed } from '../features/command-bar/typedTime'
import './pickers.css'

// Queue item 16: the typed way in, beside every time / length picker (the pickers stay). It says what
// it understood as you type ("7:10–8:30 PM · 1h20") or why it can't ("It ends before it starts");
// Enter applies it. Nothing is written here — the caller's onApply does, through its own outbox write.

export function TypedTime({ start, minutes, accepts = 'both', onApply, dense, label = 'Type a time or length', placeholder, style }: {
  /** What stands now: the start (minutes into the day, null = none yet) and the length (null = none). */
  start: number | null
  minutes: number | null
  /** A length only (an estimate), a time only, or either. */
  accepts?: 'length' | 'time' | 'both'
  /** Enter on something understood: the whole result (`start`/`minutes` filled from what stands) and
   * what was typed (`typed.start` / `typed.minutes` set only when typed). */
  onApply: (result: { start: number | null; minutes: number | null }, typed: Typed) => void
  /** Desktop popover density. */
  dense?: boolean
  label?: string
  placeholder?: string
  style?: CSSProperties
}) {
  const h24 = useHour24()
  const id = useId()
  const [text, setText] = useState('')
  const read = readTyped(text, { accepts, anchor: start, hour24: h24 })
  const result = read?.ok ? applyTyped(read.value, { start, minutes }) : null
  const why = read && !read.ok ? read.why : result?.why
  const line = why ?? (result ? typedEcho(result, h24) : '')
  const hint = placeholder ?? (accepts === 'length' ? 'Type 50m, 1h20…' : accepts === 'time' ? 'Type 7:10 pm, noon…' : 'Type 7–8:30, 50m, noon…')
  return (
    <div className={`kf-pk-typed${dense ? ' is-dense' : ''}`} style={style}>
      <input
        type="text"
        value={text}
        aria-label={label}
        aria-invalid={!!why || undefined}
        aria-describedby={line ? id : undefined}
        placeholder={hint}
        enterKeyHint="done"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Enter is this field's: not the menu's, the sheet's or the list's.
          e.preventDefault()
          e.stopPropagation()
          if (!read?.ok || !result || why) return
          onApply(result, read.value)
          setText('')
        }}
      />
      {line && <output id={id} className={why ? 'is-why' : undefined}>{line}</output>}
    </div>
  )
}
