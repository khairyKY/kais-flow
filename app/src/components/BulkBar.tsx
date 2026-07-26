export interface BulkBarProps {
  count: number
  onComplete: () => void
  onSnooze: (e: React.MouseEvent) => void
  onSchedule: (e: React.MouseEvent) => void
  onMoveToProject: (e: React.MouseEvent) => void
  onDelete: () => void
  onClear: () => void
}

const actionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-ui)',
  fontSize: 12.5,
  color: 'var(--ink-body)',
  background: 'none',
  border: 'none',
  padding: '6px 10px',
  borderRadius: 999,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
}

const checkSvg = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5l5 5L20 6" stroke="var(--ink-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** One bar, three call sites' worth of actions (Tasks smart lists) — every button loops the
 * existing per-task mutation over the selection, per the phase's own "zero new API surface" rule. */
export function BulkBar({ count, onComplete, onSnooze, onSchedule, onMoveToProject, onDelete, onClear }: BulkBarProps) {
  return (
    <div
      role="toolbar"
      // deviation(punch 15/26, 2026-07-26): export tilts the bar rotate(-0.4deg); dropped — the
      // sub-degree transform blurred the 10px mono labels (see QuickCreate's 07-18 deviation).
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 900,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 999,
        padding: '7px 8px 7px 16px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--acc-terra)',
        }}
      >
        {count} selected
      </span>
      <div style={{ width: 1, height: 18, background: 'var(--line-dashed)', margin: '0 6px' }} />
      <button type="button" style={actionStyle} onClick={onComplete} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        {checkSvg} Complete
      </button>
      <button type="button" style={actionStyle} onClick={onSnooze} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        Snooze<span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
      </button>
      <button type="button" style={actionStyle} onClick={onSchedule} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        Schedule<span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
      </button>
      <button type="button" style={actionStyle} onClick={onMoveToProject} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        Move<span style={{ color: 'var(--ink-hairline)', fontSize: 10 }}>▾</span>
      </button>
      <button
        type="button"
        style={{ ...actionStyle, color: 'var(--acc-terra)' }}
        onClick={onDelete}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        Delete
      </button>
      <button
        type="button"
        title="Clear selection (Esc)"
        onClick={onClear}
        style={{
          width: 28,
          height: 28,
          flex: 'none',
          marginLeft: 4,
          borderRadius: 999,
          background: 'var(--paper-bone)',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-faint)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  )
}
