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
    { label: 'Later today', dot: 'var(--acc-hydrangea)', at: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
    { label: 'This evening', dot: 'var(--acc-lavender)', at: thisEvening(now) },
    { label: 'Tomorrow', dot: 'var(--acc-blossom)', at: atTime(addDays(now, 1), 9) },
    { label: 'Next week', dot: 'var(--acc-moss)', at: nextMonday(now) },
  ]

  const rows = presets.length + 3 // header + Someday row + Pick-date row
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
      <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
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
  )
}
