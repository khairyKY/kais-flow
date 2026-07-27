import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../lib/dateShortcuts'
import { BottomSheet, SheetRow, useIsMobile } from './BottomSheet'

export interface ScheduleMenuProps {
  position: { x: number; y: number }
  /** Names the thing being scheduled in the phone sheet's heading (Overlays §03). */
  title?: string
  onClose: () => void
  onSchedule: (iso: string) => void
}

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
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

/** The "Schedule ▸" submenu opened from the task context menu — same grouped-popover shape as
 * SnoozeMenu, reusing the same today/tomorrow/next-week math so keyboard (1/2/3) and mouse agree. */
export function ScheduleMenu({ position, title, onClose, onSchedule }: ScheduleMenuProps) {
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

  const presets = [
    { label: 'Today', key: '1', at: scheduleToday(), dot: 'var(--acc-hydrangea)' },
    { label: 'Tomorrow', key: '2', at: scheduleTomorrow(), dot: 'var(--acc-blossom)' },
    { label: 'Next week', key: '3', at: scheduleNextWeek(), dot: 'var(--acc-moss)' },
  ]

  const rows = presets.length + 2
  const itemHeight = 34
  const z = uiZoom() // visual->layout px; see uiZoom()
  const maxY = window.innerHeight / z - 12
  const left = Math.min(position.x / z, window.innerWidth / z - 220)
  const top = Math.min(position.y / z, maxY - rows * itemHeight)

  function fire(iso: string) {
    onSchedule(iso)
    onClose()
  }

  // ── Overlays.dc.html §03 "Snooze / schedule sheet" — same chrome, the schedule verb. ──
  if (isMobile) {
    return (
      <BottomSheet onClose={onClose}>
        {(close) => (
          <>
            <div style={{ fontSize: 15, color: 'var(--ink-body)', fontWeight: 500, marginBottom: 4 }}>
              {title ? `Schedule "${title}"` : 'Schedule'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10 }}>
              For…
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {presets.map((p) => (
                <SheetRow key={p.label} dot={p.dot} label={p.label} onClick={() => { onSchedule(p.at); close() }} />
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 4px', borderTop: '1px dashed var(--line-dashed)', fontSize: 14.5, color: 'var(--ink-muted)' }}>
                <span style={{ flex: 1 }}>Pick a date…</span>
                <input
                  type="date"
                  value={pickDate}
                  onChange={(e) => {
                    setPickDate(e.target.value)
                    if (e.target.value) { onSchedule(new Date(`${e.target.value}T09:00:00`).toISOString()); close() }
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'none', border: 'none', color: 'var(--ink-faint)', padding: 0 }}
                />
              </label>
            </div>
          </>
        )}
      </BottomSheet>
    )
  }

  return (
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
        minWidth: 196,
      }}
    >
      <div style={headerStyle}>Schedule for…</div>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => fire(p.at)}
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span>{p.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-hairline)' }}>{p.key}</span>
        </button>
      ))}
      <div style={{ height: 1, background: 'var(--line-dashed)', margin: '4px 8px' }} />
      <div style={{ padding: '2px 10px 0' }}>
        <input
          type="date"
          value={pickDate}
          onChange={(e) => {
            setPickDate(e.target.value)
            if (e.target.value) fire(new Date(`${e.target.value}T09:00:00`).toISOString())
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
  )
}
