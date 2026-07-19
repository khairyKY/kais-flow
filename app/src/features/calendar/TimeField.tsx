import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeStack } from '../../lib/overlayStack'

// ── C5 (2026-07-18 audit): themed replacement for native <input type="time"> — the OS
// time-picker chrome can't take the parchment tokens. A plain text input stays for typing
// ("3pm", "15:00", "9:30 am"); the popup is ours, styled like components/Select's panel.
// Value contract is unchanged from the native input: "HH:mm" 24h, or "" for empty. ──

const PANEL_MAX_H = 224

function format12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "3pm" · "3:30 PM" · "15:00" · "0930" → "HH:mm", or null if unparseable. */
export function parseTimeText(text: string): string | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2}):?([0-5]\d)?\s*(a|p)?\.?m?\.?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (m[3] && (h < 1 || h > 12)) return null
  if (m[3] === 'p' && h < 12) h += 12
  if (m[3] === 'a' && h === 12) h = 0
  if (h > 23) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// 15-min increments, midnight → 23:45.
const OPTIONS = Array.from(
  { length: 96 },
  (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
)

function nearestIndex(v: string): number {
  const [h, m] = v.split(':').map(Number)
  if (Number.isNaN(h)) return 36 // 09:00 — same default anchor as the calendar grid
  return Math.min(95, h * 4 + Math.round((m || 0) / 15))
}

export function TimeField({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => format12(value))
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 })
  const [highlight, setHighlight] = useState(0)

  useEscapeStack(open, () => setOpen(false))
  useEffect(() => { setText(format12(value)) }, [value])

  function openMenu() {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom + PANEL_MAX_H + 8 <= window.innerHeight
    setPos({ left: r.left, top: below ? r.bottom + 4 : Math.max(8, r.top - PANEL_MAX_H - 4), width: Math.max(r.width, 104) })
    setHighlight(nearestIndex(value))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (inputRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function commitText() {
    const parsed = parseTimeText(text)
    if (parsed) {
      if (parsed !== value) onChange(parsed)
      setText(format12(parsed))
    } else {
      setText(format12(value)) // unparseable → revert, same as a native input
    }
  }

  function commitOption(i: number) {
    onChange(OPTIONS[i])
    setText(format12(OPTIONS[i]))
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (!open) { openMenu(); return }
      setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : 95)) % 96)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const parsed = parseTimeText(text)
      // Typed text wins over the highlighted row; the list is a shortcut, not the source of truth.
      if (parsed) { commitText(); setOpen(false) }
      else if (open) commitOption(highlight)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        value={text}
        placeholder="—:—"
        aria-label="Time"
        onChange={(e) => {
          setText(e.target.value)
          const p = parseTimeText(e.target.value)
          if (p) setHighlight(nearestIndex(p))
        }}
        onFocus={openMenu}
        onClick={() => { if (!open) openMenu() }}
        onBlur={commitText}
        onKeyDown={onKeyDown}
        style={style}
      />
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(pos.left, window.innerWidth - pos.width - 8)),
              top: pos.top,
              width: pos.width,
              maxHeight: PANEL_MAX_H,
              overflowY: 'auto',
              zIndex: 1000,
              background: 'var(--paper-parchment)',
              border: '1px solid var(--line-card)',
              boxShadow: 'var(--shadow-popover)',
              borderRadius: 5,
              padding: 4,
            }}
          >
            {OPTIONS.map((t, i) => {
              const isSel = t === value
              return (
                <div
                  key={t}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); commitOption(i) }}
                  style={{
                    borderRadius: 4,
                    padding: '5px 9px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: isSel ? 'var(--acc-terra)' : 'var(--ink-body)',
                    cursor: 'pointer',
                    background: isSel || i === highlight ? 'var(--paper-bone)' : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {format12(t)}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
