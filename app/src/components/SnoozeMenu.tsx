import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'

export interface SnoozeMenuProps {
  position: { x: number; y: number }
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

/** Same popover, three call sites (Tasks rows, Today, the bulk bar) — always this component, never re-derived. */
export function SnoozeMenu({ position, onClose, onSnooze, onSomeday }: SnoozeMenuProps) {
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

  const now = new Date()
  const presets = [
    { label: 'Later today', at: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
    { label: 'This evening', at: thisEvening(now) },
    { label: 'Tomorrow morning', at: atTime(addDays(now, 1), 9) },
    { label: 'Next week', at: nextMonday(now) },
  ]

  const rows = presets.length + 2 // + Someday row + Pick-date row
  const itemHeight = 34
  const maxY = window.innerHeight - 12
  const left = Math.min(position.x, window.innerWidth - 220)
  const top = Math.min(position.y, maxY - rows * itemHeight)

  function fire(at: Date) {
    onSnooze(at.toISOString())
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
            {p.at.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        </button>
      ))}
      <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
      <button
        type="button"
        onClick={() => { onSomeday(); onClose() }}
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <span>Someday</span>
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 13, color: 'var(--text-tertiary)' }}>no dates, no guilt</span>
      </button>
      <div style={{ padding: '6px 16px 2px' }}>
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
