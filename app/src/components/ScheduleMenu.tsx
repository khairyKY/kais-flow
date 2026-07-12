import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../lib/dateShortcuts'

export interface ScheduleMenuProps {
  position: { x: number; y: number }
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
  color: 'var(--text-primary)',
  background: 'none',
  border: 'none',
  padding: '6px 16px',
  cursor: 'pointer',
}

/** The "Schedule ▸" submenu opened from the task context menu — same grouped-popover shape as
 * SnoozeMenu, reusing the same today/tomorrow/next-week math so keyboard (1/2/3) and mouse agree. */
export function ScheduleMenu({ position, onClose, onSchedule }: ScheduleMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pickDate, setPickDate] = useState('')

  useEscapeStack(true, onClose)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const presets = [
    { label: 'Today', at: scheduleToday() },
    { label: 'Tomorrow', at: scheduleTomorrow() },
    { label: 'Next week', at: scheduleNextWeek() },
  ]

  const rows = presets.length + 1
  const itemHeight = 34
  const maxY = window.innerHeight - 12
  const left = Math.min(position.x, window.innerWidth - 220)
  const top = Math.min(position.y, maxY - rows * itemHeight)

  function fire(iso: string) {
    onSchedule(iso)
    onClose()
  }

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        top: Math.max(12, top),
        left: Math.max(8, left),
        zIndex: 1000,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 'var(--radius-sharp)',
        padding: '4px 0',
        minWidth: 210,
        transform: 'rotate(-0.3deg)',
      }}
    >
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => fire(p.at)}
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <span>{p.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-tertiary)' }}>
            {new Date(p.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        </button>
      ))}
      <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
      <div style={{ padding: '6px 16px 2px' }}>
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
            fontSize: 12.5,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-input)',
            padding: '5px 8px',
            color: 'var(--text-primary)',
          }}
        />
      </div>
    </div>
  )
}
