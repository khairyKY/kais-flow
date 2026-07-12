import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { createTask } from '../tasks/api'
import type { InboxItem } from '../../lib/types'

async function fetchInboxItems(): Promise<InboxItem[]> {
  const { data, error } = await supabase.from('inbox_items').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as InboxItem[]
}

export function usePendingInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
    select: (items) => items.filter((i) => i.status === 'pending' && (!i.snoozed_until || new Date(i.snoozed_until) <= new Date())),
  })
}

// Unfiltered — shares the same cached query as usePendingInboxItems (same key+queryFn, no
// `select`), used by citation deep-links and resurfacing which need items of any status.
export function useAllInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function captureText(rawText: string): InboxItem {
  const item: InboxItem = {
    id: crypto.randomUUID(),
    kind: 'text',
    raw_text: rawText,
    transcript: null,
    ai_parse: null,
    confidence: null,
    status: 'pending',
    filed_task_id: null,
    payload: null,
    snoozed_until: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('inbox_items', item)
  logActivity('inbox.captured', 'inbox_item', item.id, { kind: 'text' })
  return item
}

/** Hides the item from the triage queue until `until` — a lighter cousin of `tasks.snoozeTask`,
 * no push reminder (that half of SPECS.md's "Snooze" backlog item stays future-phase). */
export function snoozeInboxItem(item: InboxItem, until: string): void {
  writeRow('inbox_items', { ...item, snoozed_until: until })
  logActivity('inbox.snoozed', 'inbox_item', item.id, { until })
}

/** Manual triage: file a pending inbox item into a task under the chosen domain/project.
 * `title` lets the caller file the AI-cleaned/edited title instead of the raw capture
 * (the AI's `cleaned_text` used to be shown but never actually filed). Priority/duration typed
 * locally at capture time (command bar `!`/`30m` syntax) ride along on `item.payload` when the
 * item didn't auto-file — applied here so a deferred manual filing doesn't lose them either. */
export function fileToTask(
  item: InboxItem,
  opts: { domainId?: string | null; projectId?: string | null; dueAt?: string | null; title?: string } = {},
): void {
  const overrides = item.payload as { priority_override?: number | null; duration_override?: number | null } | null
  const task = createTask({
    title: opts.title?.trim() || item.raw_text,
    domainId: opts.domainId ?? null,
    projectId: opts.projectId ?? null,
    dueAt: opts.dueAt ?? null,
    priority: overrides?.priority_override ?? null,
    durationMin: overrides?.duration_override ?? null,
  })
  writeRow('inbox_items', { ...item, status: 'filed', filed_task_id: task.id })
  logActivity('inbox.filed', 'inbox_item', item.id, { task_id: task.id })
}

export function dismissInboxItem(item: InboxItem): void {
  writeRow('inbox_items', { ...item, status: 'dismissed' })
  logActivity('inbox.dismissed', 'inbox_item', item.id, {})
}
