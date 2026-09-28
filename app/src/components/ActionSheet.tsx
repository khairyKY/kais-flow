import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'

// ── MK Action Sheet — the ⋯ menu on a phone (DS-CHANGELOG §3): a content-sized BottomSheet,
// header title Source Serif 20 + meta mono 12, rows 52 with a 24 icon slot (--ink-muted),
// label 15/20, hint mono 12 on the right; a destructive row sits last under a dashed rule in
// --acc-terra-ink, no confirm (the toast carries Undo). Choosing a row runs it, then closes.
// Deviation: §3 says "≤ medium", but the full ⋯ menu is 9 rows (~600px; MK Action Sheet draws
// it 640 tall) — capped at medium, Delete would hide below a scroll. It sizes to content, ≤ full. ──

export interface ActionSheetItem {
  label: string
  icon?: ReactNode
  hint?: ReactNode
  destructive?: boolean
  /** The row opens a second picker (MK Action Sheet draws a chevron after the hint). */
  chevron?: boolean
  onSelect: () => void
}

const CSS = `
  .kf-as-row { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 52px; padding: 0 12px 0 20px;
    border: none; background: none; font: inherit; text-align: left; color: var(--ink-body); cursor: pointer;
    transition: background var(--dur-press) var(--ease-standard); }
  .kf-as-row:active { background: var(--pressed-overlay); }
  .kf-as-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--focus); }
  .kf-as-row.is-destructive { color: var(--acc-terra-ink); }
  .kf-as-icon { width: 24px; height: 24px; flex: none; display: flex; align-items: center; justify-content: center; color: var(--ink-muted); }
  .kf-as-row.is-destructive .kf-as-icon { color: var(--acc-terra-ink); }
  .kf-as-hint { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); white-space: nowrap; }
  .kf-as-row.is-destructive .kf-as-hint { color: var(--acc-terra-ink); }
`

export function ActionSheet({ title, meta, items, onClose }: { title: ReactNode; meta?: ReactNode; items: ActionSheetItem[]; onClose: () => void }) {
  const actions = items.filter((i) => !i.destructive)
  const destructive = items.filter((i) => i.destructive)

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <>
          {title}
          {meta != null && (
            <div style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 400, lineHeight: 1.4, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{meta}</div>
          )}
        </>
      }
    >
      {(close) => {
        const row = (item: ActionSheetItem) => (
          <button
            key={item.label}
            type="button"
            className={`kf-as-row${item.destructive ? ' is-destructive' : ''}`}
            onClick={() => {
              item.onSelect()
              close()
            }}
          >
            <span className="kf-as-icon" aria-hidden>{item.icon}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px' }}>{item.label}</span>
            {item.hint != null && <span className="kf-as-hint">{item.hint}</span>}
            {item.chevron && <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />}
          </button>
        )
        // Full-bleed rows: the sheet body has 20px gutters, the rows carry their own.
        return (
          <div style={{ margin: '0 -20px', paddingTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>
            <style>{CSS}</style>
            {actions.map(row)}
            {destructive.length > 0 && <div style={{ marginTop: 4, borderTop: '1px dashed var(--line-dashed)' }}>{destructive.map(row)}</div>}
          </div>
        )
      }}
    </BottomSheet>
  )
}
