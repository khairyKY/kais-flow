import { useRef, useState, type CSSProperties } from 'react'

/** A name edited in place: Enter or leaving it saves, Esc keeps the old one. `onDone` gets the
 * trimmed text, or null for "no change" (Esc, or emptied). Shared by the Projects rows' Rename, the
 * project / area / retainer title, the domain rows and the status-update log. */
export function RenameField({ value, onDone, style, ariaLabel = 'Name' }: { value: string; onDone: (next: string | null) => void; style?: CSSProperties; ariaLabel?: string }) {
  const [text, setText] = useState(value)
  const done = useRef(false)
  const finish = (next: string | null) => {
    if (done.current) return
    done.current = true
    onDone(next)
  }
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(text.trim() || null)
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(null)
        }
      }}
      onBlur={() => finish(text.trim() || null)}
      style={{ font: 'inherit', color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 5, padding: '2px 6px', margin: '-3px -7px', minWidth: 0, width: '100%', ...style }}
    />
  )
}
