// ── Inbox selection bar — same pill chrome as Overlays.dc.html:508-517 (and the shared
// BulkBar), but with the inbox's own actions: the shared bar's Complete/Schedule/Move/Delete
// slots don't map to triage, so this stays a small local sibling instead of forcing props on it.
// Waiting tab: File to… / Snooze / Dismiss · Dismissed tab: Restore. ──

interface InboxBulkBarProps {
  count: number
  onFileTo?: (e: React.MouseEvent) => void
  onSnooze?: (e: React.MouseEvent) => void
  onDismiss?: () => void
  onRestore?: () => void
  onClear: () => void
}

const actionStyle: React.CSSProperties = {
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
  whiteSpace: 'nowrap',
}

function Action({ color, onClick, children }: { color?: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      style={{ ...actionStyle, color }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

const caret = <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-meta)' }}>▾</span>

export function InboxBulkBar({ count, onFileTo, onSnooze, onDismiss, onRestore, onClear }: InboxBulkBarProps) {
  return (
    <div
      role="toolbar"
      // left/bottom live in .kf-bulkbar (AppLayout) — centred on the content column, above the phone tab bar.
      className="kf-bulkbar"
      // deviation(punch 15/26, 2026-07-26): export tilts the bar rotate(-0.4deg); dropped — the
      // sub-degree transform blurred the 10px mono labels (see QuickCreate's 07-18 deviation).
      style={{
        position: 'fixed',
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
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)' }}>
        {count} selected
      </span>
      <div style={{ width: 1, height: 18, background: 'var(--line-dashed)', margin: '0 6px' }} />
      {onFileTo && <Action onClick={onFileTo}>File to…{caret}</Action>}
      {onSnooze && <Action onClick={onSnooze}>Snooze{caret}</Action>}
      {onDismiss && <Action color="var(--acc-terra)" onClick={onDismiss}>Dismiss</Action>}
      {onRestore && <Action color="var(--acc-terra)" onClick={onRestore}>Restore</Action>}
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
