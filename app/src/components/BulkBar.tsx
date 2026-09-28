import type { MouseEvent as ReactMouseEvent } from 'react'
import { useIsMobile } from './BottomSheet'
import { Icon } from './Icon'
import type { IconName } from './icons/kf'

export interface BulkBarProps {
  count: number
  onComplete: () => void
  onTomorrow: () => void
  onSchedule: (e: ReactMouseEvent) => void
  onMoveToProject: (e: ReactMouseEvent) => void
  onDelete: () => void
  onClear: () => void
  /** Phone app bar's "Select all" — every row the page shows. */
  onSelectAll?: () => void
}

const CSS = `
  .kf-bulk-act { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12.5px; color: var(--ink-body);
    background: none; border: none; padding: 6px 10px; border-radius: var(--radius-pill); cursor: pointer; white-space: nowrap;
    -webkit-tap-highlight-color: transparent; transition: background-color var(--dur-press) var(--ease-standard); }
  .kf-bulk-act:hover { background: var(--paper-bone); }
  .kf-bulk-act:active { background: var(--pressed-overlay); }
  .kf-bulk-act:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .kf-bulk-act.is-destructive { color: var(--acc-terra-ink); }
  .kf-bulk-act > svg { color: var(--ink-muted); }
  .kf-bulk-act.is-destructive > svg { color: inherit; }

  .kf-selbar { position: fixed; left: 0; right: 0; z-index: 950; background: var(--paper-parchment); display: flex; align-items: center; }
  .kf-selbar-top { top: 0; height: var(--topbar-h); padding: 0 var(--sp-2) 0 var(--sp-1); box-shadow: 0 1px 0 var(--line-card); }
  .kf-selbar-bottom { bottom: 0; height: calc(var(--tabbar-h) + var(--tabbar-inset)); padding: 0 var(--sp-1) var(--tabbar-inset); align-items: stretch; box-shadow: var(--shadow-tabbar); }
  .kf-selbar-btn { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-1);
    font: inherit; font-size: var(--fs-tab-label); line-height: 16px; font-weight: 500; color: var(--ink-body); background: none; border: none;
    padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .kf-selbar-btn.is-destructive { color: var(--acc-terra-ink); }
  .kf-selbar-btn:active { background: var(--pressed-overlay); }
  .kf-selbar-btn:focus-visible, .kf-selbar-icon:focus-visible, .kf-selbar-all:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--focus); }
  .kf-selbar-icon { width: var(--touch-min); height: var(--touch-min); flex: none; display: flex; align-items: center; justify-content: center;
    border: none; background: none; border-radius: 50%; color: var(--ink-body); padding: 0; cursor: pointer; }
  .kf-selbar-icon:active, .kf-selbar-all:active { background: var(--pressed-overlay); }
  .kf-selbar-all { height: var(--touch-min); padding: 0 var(--sp-3); border: none; background: none; border-radius: var(--radius-pill);
    font: inherit; font-size: 15px; font-weight: 600; color: var(--acc-hydrangea-deep); cursor: pointer; }
`

/** Selection mode's bars (DS-CHANGELOG §3 "Selection mode", MK Selection). On a phone: an app bar
 * (✕ · "N selected" · Select all) over the top bar, and a bulk bar that replaces the tab bar —
 * Done · Tomorrow · Pick date · Project · Delete. On desktop: the floating pill, same actions.
 * Every button loops the existing per-task writes over the selection ("zero new API surface"). */
export function BulkBar({ count, onComplete, onTomorrow, onSchedule, onMoveToProject, onDelete, onClear, onSelectAll }: BulkBarProps) {
  const isMobile = useIsMobile()
  const actions: { label: string; icon: IconName; run: (e: ReactMouseEvent) => void; menu?: boolean; destructive?: boolean }[] = [
    { label: 'Done', icon: 'check', run: onComplete },
    { label: 'Tomorrow', icon: 'tomorrow', run: onTomorrow },
    { label: 'Pick date', icon: 'pickdate', run: onSchedule, menu: true },
    { label: isMobile ? 'Project' : 'Move', icon: 'project', run: onMoveToProject, menu: true },
    { label: 'Delete', icon: 'delete', run: onDelete, destructive: true },
  ]

  if (isMobile) {
    return (
      <>
        <style>{CSS}</style>
        <div role="toolbar" aria-label="Selection" className="kf-selbar kf-selbar-top">
          <button type="button" className="kf-selbar-icon" aria-label="Clear selection" onClick={onClear}>
            <Icon name="close" size={24} />
          </button>
          <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.15, color: 'var(--ink-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {count} selected
          </div>
          {onSelectAll && <button type="button" className="kf-selbar-all" onClick={onSelectAll}>Select all</button>}
        </div>
        <div role="toolbar" aria-label="Selected tasks" className="kf-selbar kf-selbar-bottom">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`kf-selbar-btn${a.destructive ? ' is-destructive' : ''}`} onClick={a.run}>
              <Icon name={a.icon} size={24} />
              {a.label}
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <div
      role="toolbar"
      // left/bottom live in .kf-bulkbar (AppLayout) — centred on the content column.
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
      <style>{CSS}</style>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra-ink)' }}>
        {count} selected
      </span>
      <div style={{ width: 1, height: 18, background: 'var(--line-dashed)', margin: '0 6px' }} />
      {actions.map((a) => (
        <button key={a.label} type="button" className={`kf-bulk-act${a.destructive ? ' is-destructive' : ''}`} onClick={a.run}>
          <Icon name={a.icon} size={16} />
          {a.label}
          {a.menu && <span aria-hidden="true" style={{ color: 'var(--ink-hairline)', fontSize: 'var(--fs-meta)' }}>▾</span>}
        </button>
      ))}
      <button type="button" className="kf-bulk-act" title="Clear selection (Esc)" aria-label="Clear selection" onClick={onClear} style={{ width: 28, height: 28, padding: 0, marginLeft: 4, justifyContent: 'center', background: 'var(--paper-bone)' }}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
