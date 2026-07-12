import { CheckMenuIcon, ClockMenuIcon, FolderMenuIcon, ScheduleMenuIcon, TrashMenuIcon } from './icons/MenuIcons'

export interface BulkBarProps {
  count: number
  onComplete: () => void
  onSnooze: (e: React.MouseEvent) => void
  onToday: () => void
  onTomorrow: () => void
  onMoveToProject: (e: React.MouseEvent) => void
  onDelete: () => void
  onClear: () => void
}

const actionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-ui)',
  fontSize: 12.5,
  color: 'var(--text-primary)',
  background: 'none',
  border: 'none',
  padding: '6px 10px',
  borderRadius: 'var(--radius-input)',
  cursor: 'pointer',
}

/** One bar, three call sites' worth of actions (Tasks smart lists) — every button loops the
 * existing per-task mutation over the selection, per the phase's own "zero new API surface" rule. */
export function BulkBar({ count, onComplete, onSnooze, onToday, onTomorrow, onMoveToProject, onDelete, onClear }: BulkBarProps) {
  return (
    <div
      role="toolbar"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 22,
        transform: 'translateX(-50%) rotate(-0.2deg)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 'var(--radius-sharp)',
        padding: '6px 8px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          padding: '0 10px 0 6px',
          whiteSpace: 'nowrap',
        }}
      >
        {count} selected
      </span>
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-dashed)' }} />
      <button type="button" style={actionStyle} onClick={onComplete} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        <CheckMenuIcon /> Complete
      </button>
      <button type="button" style={actionStyle} onClick={onSnooze} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        <ClockMenuIcon /> Snooze…
      </button>
      <button type="button" style={actionStyle} onClick={onToday} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        <ScheduleMenuIcon /> Today
      </button>
      <button type="button" style={actionStyle} onClick={onTomorrow} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        <ScheduleMenuIcon /> Tomorrow
      </button>
      <button type="button" style={actionStyle} onClick={onMoveToProject} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
        <FolderMenuIcon /> Move…
      </button>
      <button
        type="button"
        style={{ ...actionStyle, color: 'var(--sig-overdue)' }}
        onClick={onDelete}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <TrashMenuIcon /> Delete
      </button>
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-dashed)' }} />
      <button
        type="button"
        title="Clear selection (Esc)"
        onClick={onClear}
        style={{ ...actionStyle, color: 'var(--text-tertiary)', fontSize: 15, padding: '6px 9px' }}
      >
        ×
      </button>
    </div>
  )
}
