import { useTasks } from '../tasks/api'
import { useAllInboxItems } from '../inbox/api'
import { useLatestResurfaced, convertResurfaced, reviewLaterResurfaced } from './api'

// Pixel contract: Today.dc.html 1a "From a while ago" card (lines 212-217). TodayPage
// already renders the SectionLabel above this — own only the card body. `#fff` in the
// export is swapped for --text-on-accent (house rule: no pure white).

export function ResurfaceCard() {
  const { data: row } = useLatestResurfaced()
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = useAllInboxItems()

  if (!row || row.action !== 'pending') return null

  const title =
    row.entity_type === 'task'
      ? tasks.find((t) => t.id === row.entity_id)?.title
      : inboxItems.find((i) => i.id === row.entity_id)?.raw_text
  if (!title) return null // entity was deleted since the pick was made

  const inboxItem = row.entity_type === 'inbox_item' ? inboxItems.find((i) => i.id === row.entity_id) : undefined
  const canConvert = row.entity_type === 'inbox_item' && inboxItem && inboxItem.status !== 'filed'

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--line-card)',
        background: 'var(--paper-parchment)',
        padding: '13px 14px',
        transform: 'rotate(-0.3deg)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 3,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -8,
          right: 16,
          width: 42,
          height: 12,
          background: 'rgba(201,160,160,0.4)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
          transform: 'rotate(3deg)',
          borderRadius: 1,
        }}
      />
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.4 }}>
        "{title}"
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
        {canConvert && (
          <button
            type="button"
            onClick={() => convertResurfaced(row, inboxItem)}
            style={{ background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 10.5, padding: '5px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            Still relevant
          </button>
        )}
        <button
          type="button"
          onClick={() => reviewLaterResurfaced(row)}
          style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 10.5, padding: '5px 9px', borderRadius: 999, background: 'none', cursor: 'pointer', font: 'inherit' }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
