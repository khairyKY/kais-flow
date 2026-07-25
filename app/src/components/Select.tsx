import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeStack } from '../lib/overlayStack'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Merged onto the trigger button so a call site keeps its own field styling. */
  style?: CSSProperties
  title?: string
  ariaLabel?: string
  /** Shown when `value` matches no option (rare — most call sites include an empty-value option). */
  placeholder?: string
  /** Focus target for keyboard flows (e.g. Inbox `d` triage focuses the domain trigger). */
  triggerRef?: Ref<HTMLButtonElement>
  /** When the popover is closed, Enter calls this instead of opening — lets Inbox keep "focus, Enter files". */
  onEnterClosed?: () => void
}

const ITEM_H = 32

/**
 * Themed replacement for a native `<select>`: the popover list is ours, so it takes the app's
 * radius/tokens and has no OS blue-hover artifact (Kai's audit item 3). Portaled to `<body>` so
 * it escapes the transformed (rotated) cards it often lives inside — `position:fixed` inside a
 * `transform`ed ancestor would otherwise anchor to the card, not the viewport.
 */
export function Select({ value, onChange, options, style, title, ariaLabel, placeholder, triggerRef, onEnterClosed }: SelectProps) {
  const localRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number }>({ left: 0, width: 0 })
  const [highlight, setHighlight] = useState(0)

  useEscapeStack(open, () => setOpen(false))

  const selected = options.find((o) => o.value === value)
  const label = selected ? selected.label : placeholder ?? ''

  function setTriggerNode(node: HTMLButtonElement | null) {
    localRef.current = node
    if (typeof triggerRef === 'function') triggerRef(node)
    else if (triggerRef) (triggerRef as { current: HTMLButtonElement | null }).current = node
  }

  function openMenu() {
    const z = uiZoom() // visual->layout px; see uiZoom()
    const el = localRef.current
    if (!el) return
    const b = el.getBoundingClientRect()
    const r = { left: b.left / z, top: b.top / z, bottom: b.bottom / z, width: b.width / z }
    const estHeight = Math.min(options.length * ITEM_H + 8, 320)
    const below = r.bottom + estHeight <= window.innerHeight / z - 12
    setPos(
      below
        ? { left: r.left, top: r.bottom + 4, width: r.width }
        : { left: r.left, bottom: window.innerHeight / z - r.top + 4, width: r.width },
    )
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function step(dir: 1 | -1) {
    setHighlight((h) => {
      let i = h
      for (let n = 0; n < options.length; n++) {
        i = (i + dir + options.length) % options.length
        if (!options[i].disabled) return i
      }
      return h
    })
  }

  function commit(i: number) {
    const opt = options[i]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
    localRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (localRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function onKeyDown(e: React.KeyboardEvent) {
    // stopPropagation on keys we own so a parent list's roving-focus handler (useListKeys, which
    // listens on `window` and doesn't treat a <button> as a typing target) doesn't act on them too.
    if (!open) {
      if (e.key === 'Enter' && onEnterClosed) { e.preventDefault(); e.stopPropagation(); onEnterClosed(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation()
        openMenu()
      }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); step(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); step(-1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); commit(highlight) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        ref={setTriggerNode}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          textAlign: 'left',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-input)',
          color: 'var(--text-primary)',
          ...style,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span aria-hidden="true" style={{ fontSize: '0.8em', color: 'var(--text-tertiary)', lineHeight: 1 }}>▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="kf-overlay-card"
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(pos.left, window.innerWidth - Math.max(pos.width, 160) - 8)),
              top: pos.top,
              bottom: pos.bottom,
              minWidth: Math.max(pos.width, 160),
              maxWidth: 320,
              maxHeight: 320,
              overflowY: 'auto',
              zIndex: 1000,
              background: 'var(--paper-parchment)',
              border: '1px solid var(--line-card)',
              boxShadow: 'var(--shadow-popover)',
              borderRadius: 5,
              padding: 6,
            }}
          >
            {options.map((o, i) => {
              const isSel = o.value === value
              const isHi = i === highlight && !o.disabled
              return (
                <div
                  key={o.value || `opt-${i}`}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={o.disabled}
                  onMouseEnter={() => { if (!o.disabled) setHighlight(i) }}
                  onMouseDown={(e) => { e.preventDefault(); commit(i) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 11,
                    borderRadius: 5,
                    padding: '7px 10px',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13,
                    color: o.disabled ? 'var(--ink-faint)' : 'var(--ink-body)',
                    opacity: o.disabled ? 0.5 : 1,
                    cursor: o.disabled ? 'default' : 'pointer',
                    background: isSel ? 'var(--paper-bone)' : isHi ? 'var(--paper-bone)' : 'none',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {isSel && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flex: 'none' }}>
                      <path d="M4 12.5l5 5L20 6" stroke="var(--acc-terra)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
