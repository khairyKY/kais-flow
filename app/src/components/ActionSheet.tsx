import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Icon } from './Icon'

// ── MK Action Sheet — the ⋯ menu on a phone (DS-CHANGELOG §3): a content-sized BottomSheet,
// header title Source Serif 20 + meta 12, rows 52 with a 24 icon slot (--ink-muted),
// label 15/20, hint 12 on the right; a destructive row sits last under a hairline in
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
  /** A quiet second line under the label (the subtask question's "Questions 1–5 stays on your day at 16:00"). */
  note?: ReactNode
  /** The current choice (Calendar Phone 7n's view list): sage wash + check. */
  selected?: boolean
  onSelect: () => void
}

/** The row style (52 · icon 24 · label 15/20 · hint mono 12) — the date picker's quick picks reuse it. */
export const ACTION_ROW_CSS = `
  .kf-as-row { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 52px; padding: 0 12px 0 20px;
    border: none; background: none; font: inherit; text-align: left; color: var(--ink-body); cursor: pointer;
    transition: background var(--dur-press) var(--ease-standard); }
  .kf-as-row:active { background: var(--pressed-overlay); }
  .kf-as-row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--focus); }
  .kf-as-row.is-destructive { color: var(--acc-terra-ink); }
  .kf-as-row[aria-current='true'] { background: var(--block-sage); color: var(--acc-sage-text); font-weight: 600; }
  .kf-as-icon { width: 24px; height: 24px; flex: none; display: flex; align-items: center; justify-content: center; color: var(--ink-muted); }
  .kf-as-row.is-destructive .kf-as-icon { color: var(--acc-terra-ink); }
  .kf-as-note { display: block; font-size: var(--fs-caption); line-height: 1.4; color: var(--ink-faint); }
  .kf-as-hint { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: var(--ls-meta); color: var(--ink-faint); white-space: nowrap; }
  .kf-as-row.is-destructive .kf-as-hint { color: var(--acc-terra-ink); }
`

export function ActionSheet({ title, meta, items, header, onClose }: {
  title: ReactNode
  meta?: ReactNode
  items: ActionSheetItem[]
  /** Above the rows (a typed field — queue 16's Duration). */
  header?: ReactNode
  onClose: () => void
}) {
  const actions = items.filter((i) => !i.destructive)
  const destructive = items.filter((i) => i.destructive)

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <>
          {title}
          {meta != null && (
            <div style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', fontWeight: 400, lineHeight: 1.4, letterSpacing: 'var(--ls-meta)', color: 'var(--ink-faint)' }}>{meta}</div>
          )}
        </>
      }
    >
      {(close) => {
        // Keyed by place too: a list can name the same thing twice (a repeating Time block's days).
        const row = (item: ActionSheetItem, i: number) => (
          <button
            key={`${i}:${item.label}`}
            type="button"
            className={`kf-as-row${item.destructive ? ' is-destructive' : ''}`}
            aria-current={item.selected || undefined}
            onClick={() => {
              item.onSelect()
              close()
            }}
          >
            <span className="kf-as-icon" aria-hidden>{item.icon}</span>
            {/* ds-ok: MK Action Sheet's label 15/20, as it was (this line only grew the note) */}
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px' }}>{item.label}{item.note != null && <small className="kf-as-note">{item.note}</small>}</span>
            {item.hint != null && <span className="kf-as-hint">{item.hint}</span>}
            {item.chevron && <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />}
            {item.selected && <Icon name="check" size={20} />}
          </button>
        )
        // Full-bleed rows: the sheet body has 20px gutters, the rows carry their own.
        return (
          <>
          {header}
          <div style={{ margin: '0 -20px', paddingTop: 4, borderTop: '1px solid var(--line-dashed)' }}>
            <style>{ACTION_ROW_CSS}</style>
            {actions.map(row)}
            {destructive.length > 0 && <div style={{ marginTop: 4, borderTop: '1px solid var(--line-dashed)' }}>{destructive.map(row)}</div>}
          </div>
          </>
        )
      }}
    </BottomSheet>
  )
}
