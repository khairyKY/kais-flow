import { queryClient } from '../../lib/queryClient'
import type { InboxItem } from '../../lib/types'

// Kai's activity log, 2026-10-23 16:20: one capture became TWO tasks — filed by hand (inbox.filed) while
// the AI's read of it was still out, which then filed it too (capture.autofiled). Filing is once per
// inbox item: whoever claims it first files it; any later attempt — the other path, a second tap, a
// stale card — is a no-op. Every filer (inbox/api fileToTask, capture/api's auto-file) claims first.

const claimed = new Set<string>()

/** Claims `item` for filing. False when it is filed (or being filed) already — then do nothing. Reads
 * the cached row too: every filing writes it there first, so a copy the caller held from before the
 * other path ran still counts as filed. */
export function claimFiling(item: Pick<InboxItem, 'id' | 'status'>): boolean {
  const now = queryClient.getQueryData<InboxItem[]>(['inbox_items'])?.find((i) => i.id === item.id)
  if (claimed.has(item.id) || item.status !== 'pending' || (now && (now.status !== 'pending' || now.deleted_at))) return false
  claimed.add(item.id)
  return true
}

/** A filing undone: the capture waits again, and may be filed anew. */
export function releaseFiling(id: string): void {
  claimed.delete(id)
}
