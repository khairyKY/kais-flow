import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { BottomSheet, SheetRow, useIsMobile } from './BottomSheet'
import { Float } from './Float'

export interface SnoozeMenuProps {
  position: { x: number; y: number }
  /** Names the thing being snoozed in the phone sheet's heading (Overlays §03). */
  title?: string
  onClose: () => void
  onSnooze: (until: string) => void
  onSomeday: () => void
}

function atTime(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}
function thisEvening(now: Date): Date {
  const evening = atTime(now, 18)
  return evening > now ? evening : atTime(addDays(now, 1), 18)
}
function nextMonday(now: Date): Date {
  const diff = ((1 - now.getDay() + 7) % 7) || 7
  return atTime(addDays(now, diff), 9)
}

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  width: '100%',
  textAlign: 'left' as const,
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--ink-body)',
  background: 'none',
  border: 'none',
  borderRadius: 5,
  padding: '7px 10px',
  cursor: 'pointer',
}

const headerStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 8,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-hairline)',
  padding: '4px 10px 6px',
}

/** Same popover, three call sites (Tasks rows, Today, the bulk bar) — always this component, never re-derived.
 * At ≤767px it becomes the Overlays §03 bottom sheet instead; the presets and handlers are shared. */
export function SnoozeMenu({ position, title, onClose, onSnooze, onSomeday }: SnoozeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pickDate, setPickDate] = useState('')
  const isMobile = useIsMobile()

  useEscapeStack(!isMobile, onClose) // the sheet registers its own (BottomSheet)

  useEffect(() => {
    if (isMobile) return // the sheet's scrim handles dismissal
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, isMobile])

  const now = new Date()
  // `sheet` mirrors Overlays §03, which shows three rows with literal metas and drops
  // "This evening" (sheetLabel null = desktop-only row).
  const presets: { label: string; dot: string; at: Date; sheetLabel: string | null; sheetMeta: string }[] = [
    { label: 'Later today', dot: 'var(--acc-hydrangea)', at: new Date(now.getTime() + 3 * 60 * 60 * 1000), sheetLabel: 'Later today', sheetMeta: '+3h' },
    { label: 'This evening', dot: 'var(--acc-lavender)', at: thisEvening(now), sheetLabel: null, sheetMeta: '' },
    { label: 'Tomorrow', dot: 'var(--acc-blossom)', at: atTime(addDays(now, 1), 9), sheetLabel: 'Tomorrow morning', sheetMeta: '09:00' },
    { label: 'Next week', dot: 'var(--acc-moss)', at: nextMonday(now), sheetLabel: 'Next week', sheetMeta: 'Mon' },
  ]

  const rows = presets.length + 3 // header + Someday row + Pick-date row
  const itemHeight = 34
  const z = uiZoom() // visual->layout px; see uiZoom()
  const maxY = window.innerHeight / z - 12
  const left = Math.min(position.x / z, window.innerWidth / z - 220)
  const top = Math.min(position.y / z, maxY - rows * itemHeight)

  function fire(at: Date) {
    onSnooze(at.toISOString())
    onClose()
  }

  // ── Overlays.dc.html §03 "Snooze / schedule sheet" ──
  if (isMobile) {
    return (
      <Float>
      <BottomSheet onClose={onClose}>
        {(close) => (
          <>
            <div style={{ fontSize: 15, color: 'var(--ink-body)', fontWeight: 500, marginBottom: 4 }}>
              {title ? `Snooze "${title}"` : 'Snooze'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              Until…
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {presets.filter((p) => p.sheetLabel).map((p) => (
                <SheetRow
                  key={p.label}
                  dot={p.dot}
                  label={p.sheetLabel}
                  meta={p.sheetMeta}
                  onClick={() => { onSnooze(p.at.toISOString()); close() }}
                />
              ))}
              <SheetRow
                dot="var(--ink-hairline)"
                label="Someday"
                onClick={() => { onSomeday(); close() }}
              />
              {/* Not in §03, kept from the desktop popover: without it the phone can't
                  reach an arbitrary date, and every other snooze surface can. */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 4px', borderTop: '1px dashed var(--line-dashed)', fontSize: 14.5, color: 'var(--ink-muted)' }}>
                <span style={{ flex: 1 }}>Pick a date…</span>
                <input
                  type="date"
                  value={pickDate}
                  onChange={(e) => {
                    setPickDate(e.target.value)
                    if (e.target.value) { onSnooze(atTime(new Date(`${e.target.value}T00:00:00`), 9).toISOString()); close() }
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'none', border: 'none', color: 'var(--ink-faint)', padding: 0 }}
                />
              </label>
            </div>
          </>
        )}
      </BottomSheet>
      </Float>
    )
  }

  return (
    <Float>
    <div
      ref={ref}
      role="menu"
      className="kf-overlay-card"
      style={{
        position: 'fixed',
        top: Math.max(12, top),
        left: Math.max(8, left),
        zIndex: 1000,
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 5,
        padding: 6,
        minWidth: 210,
      }}
    >
      <div style={headerStyle}>Snooze until…</div>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => fire(p.at)}
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.dot, flex: 'none' }} />
          <span style={{ flex: 1 }}>{p.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-hairline)' }}>
            {p.at.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => { onSomeday(); onClose() }}
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink-hairline)', flex: 'none' }} />
        <span>Someday</span>
      </button>
      <div style={{ height: 1, background: 'var(--line-dashed)', margin: '4px 8px' }} />
      <div style={{ padding: '2px 10px 0' }}>
        <input
          type="date"
          value={pickDate}
          onChange={(e) => {
            setPickDate(e.target.value)
            if (e.target.value) fire(atTime(new Date(`${e.target.value}T00:00:00`), 9))
          }}
          style={{
            width: '100%',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            background: 'none',
            border: 'none',
            borderRadius: 5,
            padding: '7px 0',
            color: 'var(--ink-muted)',
          }}
        />
      </div>
    </div>
    </Float>
  )
}
