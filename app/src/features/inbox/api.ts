import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { createTask } from '../tasks/api'
import { dayWord, formatDue } from './inboxDisplay'
import type { InboxItem, Task } from '../../lib/types'

async function fetchInboxItems(): Promise<InboxItem[]> {
  const { data, error } = await supabase.from('inbox_items').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as InboxItem[]
}

export function usePendingInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
    select: (items) => items.filter((i) => !i.deleted_at && i.status === 'pending' && (!i.snoozed_until || new Date(i.snoozed_until) <= new Date())),
  })
}

// Unfiltered — shares the same cached query as usePendingInboxItems (same key+queryFn, no
// `select`), used by citation deep-links and resurfacing which need items of any status.
export function useAllInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
    select: (items) => items.filter((i) => !i.deleted_at),
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

// ── Punch 7: destination feedback. Every triage action toasts with a working Undo, and the
// filing toast names where the thing actually went. The toast lives here rather than in
// InboxPage so every entry point (cards, keyboard strip, GitHub rows, Morning Ritual triage)
// gets it from one place. `silent` is for callers that compose these into a bigger action and
// push their own single toast — bulk loops, resurfacing's "Kept", Trash's restore. ──

function lookupName(table: 'projects' | 'domains', id: string | null | undefined): string | null {
  if (!id) return null
  const rows = queryClient.getQueryData<{ id: string; name: string }[]>([table]) ?? []
  return rows.find((r) => r.id === id)?.name ?? null
}

/** "Shaheen website · Today" / "Tasks · Tomorrow" / "Tasks" — read off the task that was
 * actually written, so the toast can't claim a destination the row doesn't have. */
function destinationOf(task: Task): string {
  const where = lookupName('projects', task.project_id) ?? lookupName('domains', task.domain_id) ?? 'Tasks'
  return task.due_at ? `${where} · ${dayWord(task.due_at)}` : where
}

/** Undoing a *just-created* task hard-deletes it rather than routing it to Trash — same as
 * the auto-file undo in `capture/api.ts`; a task the user un-made shouldn't need composting. */
function unfile(item: InboxItem, task: Task): void {
  writeRow('tasks', task, 'delete')
  logActivity('task.deleted', 'task', task.id, { reason: 'inbox file undo' })
  writeRow('inbox_items', item)
}

/** Hides the item from the triage queue until `until` — a lighter cousin of `tasks.snoozeTask`,
 * no push reminder (that half of SPECS.md's "Snooze" backlog item stays future-phase). */
export function snoozeInboxItem(item: InboxItem, until: string, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, snoozed_until: until })
  logActivity('inbox.snoozed', 'inbox_item', item.id, { until })
  if (!silent) toastUndo(`Snoozed until ${formatDue(until)}`, () => writeRow('inbox_items', prior))
}

/** Manual triage: file a pending inbox item into a task under the chosen domain/project.
 * `title` lets the caller file the AI-cleaned/edited title instead of the raw capture
 * (the AI's `cleaned_text` used to be shown but never actually filed). Priority/duration typed
 * locally at capture time (command bar `!`/`30m` syntax) ride along on `item.payload` when the
 * item didn't auto-file — applied here so a deferred manual filing doesn't lose them either. */
// Returns the created task so callers can offer a real Undo (WA-4 punch 21 — convertResurfaced).
export function fileToTask(
  item: InboxItem,
  opts: { domainId?: string | null; projectId?: string | null; dueAt?: string | null; title?: string; silent?: boolean } = {},
): Task {
  const prior = { ...item }
  const overrides = item.payload as { priority_override?: number | null; duration_override?: number | null } | null
  // The triage card shows the AI's parsed date as a promise ("→ Sat, 18:00"); no caller was
  // passing it through, so every manual filing silently dropped it — and the punch-7 toast
  // could never truthfully say "· Today". Default to the parse; an explicit opt still wins.
  const parsedDue = (item.ai_parse as { due_at?: string | null } | null)?.due_at ?? null
  const task = createTask({
    title: opts.title?.trim() || item.raw_text,
    domainId: opts.domainId ?? null,
    projectId: opts.projectId ?? null,
    dueAt: opts.dueAt ?? parsedDue,
    priority: overrides?.priority_override ?? null,
    durationMin: overrides?.duration_override ?? null,
  })
  writeRow('inbox_items', { ...item, status: 'filed', filed_task_id: task.id })
  logActivity('inbox.filed', 'inbox_item', item.id, { task_id: task.id })
  if (!opts.silent) toastUndo(`Filed to ${destinationOf(task)}`, () => unfile(prior, task))
  return task
}

export function dismissInboxItem(item: InboxItem, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, status: 'dismissed' })
  logActivity('inbox.dismissed', 'inbox_item', item.id, {})
  if (!silent) toastUndo('Dismissed', () => writeRow('inbox_items', prior))
}

/** Dismissed → pending again (Inbox.dc.html 2a/2b "Restore"). */
export function restoreInboxItem(item: InboxItem, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, status: 'pending', snoozed_until: null, deleted_at: null })
  logActivity('inbox.restored', 'inbox_item', item.id, {})
  if (!silent) toastUndo('Restored to Inbox', () => writeRow('inbox_items', prior))
}

/** Permanent delete — the Dismissed tab's "Clear now" (2a). Soft-deletes into Trash; the
 * 30-day auto-compost the copy promises is now real, done server-side by the `compost-expired`
 * pg_cron job (migration 0032) rather than anything the client has to remember to run. */
export function purgeInboxItem(item: InboxItem): void {
  writeRow('inbox_items', { ...item, deleted_at: new Date().toISOString() })
  logActivity('inbox.purged', 'inbox_item', item.id, {})
}
