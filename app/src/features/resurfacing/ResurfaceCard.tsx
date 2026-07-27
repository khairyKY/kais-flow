import { useRef } from 'react'
import { animateRowRemoval } from '../../lib/motion'
import { useTasks } from '../tasks/api'
import { useAllInboxItems } from '../inbox/api'
import { useLatestResurfaced, convertResurfaced, reviewLaterResurfaced, type CooldownTier } from './api'

// Pixel contract: Today.dc.html 1a "From a while ago" card (lines 212-217). TodayPage
// already renders the SectionLabel above this — own only the card body. `#fff` in the
// export is swapped for --text-on-accent (house rule: no pure white).

export function ResurfaceCard() {
  // Motion 3e (WB-1). Only ever one card renders, so a ref beats an id scheme; both triage
  // chips route their mutation through the exit so the slot closes instead of blinking out.
  const cardRef = useRef<HTMLDivElement>(null)
  const { data: row } = useLatestResurfaced()
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = useAllInboxItems()

  if (!row || row.action !== 'pending') return null

  const task = row.entity_type === 'task' ? tasks.find((t) => t.id === row.entity_id) : undefined
  const title = row.entity_type === 'task' ? task?.title : inboxItems.find((i) => i.id === row.entity_id)?.raw_text
  if (!title) return null // entity was deleted since the pick was made

  const inboxItem = row.entity_type === 'inbox_item' ? inboxItems.find((i) => i.id === row.entity_id) : undefined
  const canConvert = row.entity_type === 'inbox_item' && inboxItem && inboxItem.status !== 'filed'

  // Punch 21 — "Later" cooldown tier from the task's priority (1 = !!! most urgent → high,
  // 2 → med, 3 → low); unranked tasks and inbox items take the middle tier.
  const tier: CooldownTier =
    task?.priority === 1 ? 'high' : task?.priority === 3 ? 'low' : 'med'

  return (
    <div
      ref={cardRef}
      // deviation(punch 15, 2026-07-26): export tilts this card rotate(-0.3deg), but the
      // sub-degree transform blurs the 14px quote text (grayscale AA on a rotated baseline,
      // compounded by the 1.25 root zoom) — dropped for crisp rendering, same call as
      // QuickCreate's 2026-07-18 deviation. The tape strip keeps the placed-note feel.
      style={{
        position: 'relative',
        border: '1px solid var(--line-card)',
        background: 'var(--paper-parchment)',
        padding: '13px 14px',
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
          background: 'color-mix(in srgb, var(--acc-clover) 40%, transparent)',
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
            onClick={() => animateRowRemoval(cardRef.current, () => convertResurfaced(row, inboxItem))}
            // punch 22: `font` (shorthand) must precede `fontSize` — later shorthand keys clobber
            // earlier longhands in React style objects, which reset the chip to the body size.
            style={{ font: 'inherit', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontSize: 10.5, padding: '5px 9px', borderRadius: 999, border: 'none', cursor: 'pointer' }}
          >
            Still relevant
          </button>
        )}
        <button
          type="button"
          onClick={() => animateRowRemoval(cardRef.current, () => reviewLaterResurfaced(row, tier))}
          style={{ font: 'inherit', border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 10.5, padding: '5px 9px', borderRadius: 999, background: 'none', cursor: 'pointer' }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
