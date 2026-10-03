import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '../../components/BottomSheet'
import { QUARTERS as OPTIONS } from '../../components/pickerMath'
import { TimePicker } from '../../components/TimePicker'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { placeSelect, type SelectPlacement } from '../../components/selectPlacement'

// ── C5 (2026-07-18 audit): themed replacement for native <input type="time"> — the OS
// time-picker chrome can't take the parchment tokens. A plain text input stays for typing
// ("3pm", "15:00", "9:30 am"); the popup is ours, styled like components/Select's panel.
// Value contract is unchanged from the native input: "HH:mm" 24h, or "" for empty.
// On a phone (Wave M) it is a read-only field that opens the MK Time Picker sheet instead. ──

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

function nearestIndex(v: string): number {
  const [h, m] = v.split(':').map(Number)
  if (Number.isNaN(h)) return 36 // 09:00 — same default anchor as the calendar grid
  return Math.min(95, h * 4 + Math.round((m || 0) / 15))
}

export function TimeField({ value, onChange, style, day, ariaLabel = 'Time' }: {
  value: string
  onChange: (v: string) => void
  style?: CSSProperties
  /** Names the field when a form has more than one time (default "Time"). */
  ariaLabel?: string
  /** Phone sheet: the Cairo day ("YYYY-MM-DD") whose calendar gives the free slots and busy rows. */
  day?: string | null
}) {
  const isMobile = useIsMobile()
  const [sheet, setSheet] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => format12(value))
  const [pos, setPos] = useState<SelectPlacement | null>(null)
  const [highlight, setHighlight] = useState(0)

  useEscapeStack(open, () => setOpen(false))
  useEffect(() => { setText(format12(value)) }, [value])

  function openMenu() {
    const el = inputRef.current
    if (!el) return
    // Kai 2026-10-03: the list opened half off the right edge at 125–150% — the rect is VISUAL px
    // and `position: fixed` takes LAYOUT px (lib/uiScale uiZoom), so the zoom applied twice. The
    // Select's placement (zoom-divided, flipped above when there's more room, kept inside) instead.
    const z = uiZoom()
    const r = el.getBoundingClientRect()
    setPos(placeSelect({ left: r.left / z, top: r.top / z, bottom: r.bottom / z, width: r.width / z }, { width: window.innerWidth / z, height: window.innerHeight / z }, OPTIONS.length, false))
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
    if (isMobile) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(true) }
      return
    }
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
        aria-label={ariaLabel}
        onChange={(e) => {
          setText(e.target.value)
          const p = parseTimeText(e.target.value)
          if (p) setHighlight(nearestIndex(p))
        }}
        readOnly={isMobile}
        onFocus={isMobile ? undefined : openMenu}
        onClick={() => { if (isMobile) setSheet(true); else if (!open) openMenu() }}
        onBlur={commitText}
        onKeyDown={onKeyDown}
        style={style}
      />
      {sheet && (
        <TimePicker day={day} value={value || null} onDone={(t) => { if (t !== value) onChange(t) }} onClose={() => setSheet(false)} />
      )}
      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: pos.minWidth,
              maxHeight: Math.min(PANEL_MAX_H, pos.maxHeight),
              overflowY: 'auto',
              zIndex: 1000,
              background: 'var(--paper-parchment)',
              border: '1px solid var(--line-card)',
              boxShadow: 'var(--shadow-popover)',
              borderRadius: 5,
              padding: 4,
              // Overlay rules (Motion 3c popover dialect) — entryFadeUp is a global token
              // keyframe, so it reaches this body-level portal too.
              animation: 'entryFadeUp 200ms var(--ease-out)',
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
