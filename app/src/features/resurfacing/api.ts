import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { fileToTask } from '../inbox/api'
import { deleteTask } from '../tasks/api'
import type { InboxItem, ResurfacedLogRow } from '../../lib/types'

// ── Punch 21: priority-based "Later" cooldowns ────────────────────────────────────────────
// Defaults per the punchlist (high ~2d / med ~5d / low ~10d); the Settings sliders (another
// workstream) write per-tier overrides to `kf.resurfaceCooldown.{high,med,low}` — read here
// so they just work once they exist.
const COOLDOWN_DEFAULTS = { high: 2, med: 5, low: 10 } as const
export type CooldownTier = keyof typeof COOLDOWN_DEFAULTS

export function cooldownDays(tier: CooldownTier): number {
  try {
    const raw = Number(localStorage.getItem(`kf.resurfaceCooldown.${tier}`))
    if (Number.isFinite(raw) && raw > 0) return raw
  } catch {
    /* storage unavailable — defaults apply */
  }
  return COOLDOWN_DEFAULTS[tier]
}

// Client-side snooze ledger `{entityId: wakeAt ISO}`. MIG-1 (a server `snoozed_until` column
// on resurfaced_log, honored by the daily-resurface cron) hasn't been pushed — until it lands,
// the wake time persists here and useLatestResurfaced filters snoozed entities out client-side.
// When MIG-1 lands: write `snoozed_until` on the row instead and delete this ledger + filter.
const SNOOZE_KEY = 'kf.resurfaceSnoozes'

function readSnoozes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function setSnooze(entityId: string, wakeAt: string | null): void {
  const map = readSnoozes()
  if (wakeAt) map[entityId] = wakeAt
  else delete map[entityId]
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map))
  } catch {
    /* storage full — the snooze just won't survive a reload */
  }
}

export function isResurfaceSnoozed(entityId: string, now = Date.now()): boolean {
  const wake = readSnoozes()[entityId]
  return !!wake && Date.parse(wake) > now
}

// `writeRow`'s optimistic update assumes the cache under `[table]` is the raw array (it does
// findIndex/filter on it), so the array is cached as-is and reduced to "latest" via `select` —
// same split as usePendingInboxItems/useSlipping — rather than pre-reducing inside queryFn.
// `daily-resurface` writes at most one row/day (unique on (user_id, shown_on)), so the latest
// row is always today's pick — reading "latest" instead of filtering on an exact date sidesteps
// any UTC-vs-Cairo date-boundary mismatch between the cron's `current_date` and the client.
// Punch 21: snoozed entities are filtered out here, so a "Later"-ed pick stays gone across
// reloads until its cooldown passes (even if the cron re-picks it before MIG-1 lands).
export function useLatestResurfaced() {
  return useQuery({
    queryKey: ['resurfaced_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resurfaced_log').select('*').order('shown_on', { ascending: false })
      if (error) throw error
      return data as ResurfacedLogRow[]
    },
    select: (rows) => rows.filter((r) => !isResurfaceSnoozed(r.entity_id))[0] ?? null,
  })
}

/** Inbox-item resurfacing → files it as a real task, same as manual Inbox triage.
 * Undo unwinds all three writes: trashes the created task, restores the inbox item,
 * and re-pends the resurfaced pick. */
export function convertResurfaced(row: ResurfacedLogRow, item: InboxItem): void {
  const prevItem = { ...item }
  const task = fileToTask(item)
  writeRow('resurfaced_log', { ...row, action: 'converted' })
  logActivity('resurfaced.converted', row.entity_type, row.entity_id, {})
  toastUndo('Kept', () => {
    deleteTask(task)
    writeRow('inbox_items', prevItem)
    writeRow('resurfaced_log', { ...row })
  })
}

/** Punch 21: "Later" actually snoozes — by the entity's priority tier — and undoes cleanly.
 * (Also boosts this entity's weight in future resurfacing picks; see do_resurface's +20.) */
export function reviewLaterResurfaced(row: ResurfacedLogRow, tier: CooldownTier): void {
  const days = cooldownDays(tier)
  setSnooze(row.entity_id, new Date(Date.now() + days * 86_400_000).toISOString())
  writeRow('resurfaced_log', { ...row, action: 'review_later' })
  logActivity('resurfaced.review_later', row.entity_type, row.entity_id, { snoozed_days: days })
  toastUndo('Snoozed', () => {
    setSnooze(row.entity_id, null)
    writeRow('resurfaced_log', { ...row })
  })
}

export function dismissResurfaced(row: ResurfacedLogRow): void {
  writeRow('resurfaced_log', { ...row, action: 'dismissed' })
  logActivity('resurfaced.dismissed', row.entity_type, row.entity_id, {})
  toastUndo('Dismissed', () => writeRow('resurfaced_log', { ...row }))
}
