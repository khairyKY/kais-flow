import { useTasks } from '../tasks/api'
import { useAllInboxItems } from '../inbox/api'
import { useLatestResurfaced, convertResurfaced, reviewLaterResurfaced, dismissResurfaced } from './api'

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
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          Resurfacing
        </span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--border-dashed)' }} />
      </div>
      <div
        style={{
          position: 'relative',
          border: '1px solid var(--line-card)',
          background: 'var(--bg-surface)',
          padding: '13px 14px',
          transform: 'rotate(0.3deg)',
          boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 5px 12px rgba(60,52,38,0.08)',
          borderRadius: 3,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -8,
            right: 16,
            width: 44,
            height: 13,
            background: 'rgba(212,168,176,0.4)',
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
            transform: 'rotate(3deg)',
            borderRadius: 1,
          }}
        />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          From a while ago
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14.5, color: 'var(--text-primary)', marginTop: 7, lineHeight: 1.4 }}>
          {title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
          {canConvert && (
            <button
              type="button"
              onClick={() => convertResurfaced(row, inboxItem)}
              style={{ background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 11, padding: '5px 9px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit' }}
            >
              Still relevant → task
            </button>
          )}
          <button
            type="button"
            onClick={() => reviewLaterResurfaced(row)}
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 11, padding: '5px 9px', borderRadius: 999, background: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            Review later
          </button>
          <button
            type="button"
            onClick={() => dismissResurfaced(row)}
            style={{ color: 'var(--text-tertiary)', fontSize: 11, padding: '5px 4px', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  )
}
