import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { restoreTask } from '../tasks/api'
import { restoreInboxItem } from '../inbox/api'
import { restoreJournalEntry } from '../journal/api'
import { restoreTrashedProject } from '../projects/api'
import { restoreTrashedArea } from '../areas/api'
import { restoreTrashedDomain } from '../domains/api'
import { INBOX_COLUMNS, TASK_COLUMNS } from '../../lib/columns'
import type { Task, InboxItem, JournalEntry, Project, Area, Domain } from '../../lib/types'

export interface DeletedItem {
  id: string
  type: 'Task' | 'Inbox' | 'Event' | 'Journal' | 'Project' | 'Area' | 'Domain'
  title: string
  deleted_at: string
  rawRow: any
}

/** The table each Trash type lives in (its base query key is the same name). */
export const TRASH_TABLE: Record<DeletedItem['type'], string> = {
  Task: 'tasks',
  Inbox: 'inbox_items',
  Event: 'calendar_events',
  Journal: 'journal_entries',
  Project: 'projects',
  Area: 'areas',
  Domain: 'domains',
}

export function useDeletedItems() {
  return useQuery({
    queryKey: ['deleted_items'],
    queryFn: async () => {
      const [tasksRes, inboxRes, calendarRes, journalRes, projectsRes, areasRes, domainsRes] = await Promise.all([
        supabase.from('tasks').select(TASK_COLUMNS).not('deleted_at', 'is', null),
        supabase.from('inbox_items').select(INBOX_COLUMNS).not('deleted_at', 'is', null),
        supabase.from('calendar_events').select('*').not('deleted_at', 'is', null),
        supabase.from('journal_entries').select('*').not('deleted_at', 'is', null),
        supabase.from('projects').select('*').not('deleted_at', 'is', null),
        supabase.from('areas').select('*').not('deleted_at', 'is', null),
        supabase.from('domains').select('*').not('deleted_at', 'is', null),
      ])
      if (tasksRes.error) throw tasksRes.error
      if (inboxRes.error) throw inboxRes.error
      if (calendarRes.error) throw calendarRes.error
      if (journalRes.error) throw journalRes.error
      const list: DeletedItem[] = []
      for (const t of (tasksRes.data || [])) {
        list.push({ id: t.id, type: 'Task', title: t.title, deleted_at: t.deleted_at!, rawRow: t })
      }
      for (const i of (inboxRes.data || [])) {
        list.push({ id: i.id, type: 'Inbox', title: i.raw_text ? `"${i.raw_text}"` : '"voice note"', deleted_at: i.deleted_at!, rawRow: i })
      }
      for (const e of (calendarRes.data || [])) {
        list.push({ id: e.id, type: 'Event', title: e.title, deleted_at: e.deleted_at!, rawRow: e })
      }
      for (const j of (journalRes.data || [])) {
        list.push({ id: j.id, type: 'Journal', title: j.body ? `"${j.body.slice(0, 50)}..."` : '"draft"', deleted_at: j.deleted_at!, rawRow: j })
      }
      // ponytail: before migration 0044 is pushed these two have no deleted_at and answer 400 —
      // the rest of the Trash still lists rather than failing whole.
      for (const p of ((projectsRes.error ? [] : projectsRes.data) as Project[])) {
        list.push({ id: p.id, type: 'Project', title: p.name, deleted_at: p.deleted_at!, rawRow: p })
      }
      for (const a of ((areasRes.error ? [] : areasRes.data) as Area[])) {
        list.push({ id: a.id, type: 'Area', title: a.name, deleted_at: a.deleted_at!, rawRow: a })
      }
      // Before 0051 domains have no deleted_at either — same fallback.
      for (const d of ((domainsRes.error ? [] : domainsRes.data) as Domain[])) {
        list.push({ id: d.id, type: 'Domain', title: d.name, deleted_at: d.deleted_at!, rawRow: d })
      }
      return list.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    }
  })
}

export function restoreItem(item: DeletedItem): void {
  const row = item.rawRow
  if (item.type === 'Task') restoreTask(row as Task)
  else if (item.type === 'Inbox') restoreInboxItem(row as InboxItem, true) // TrashPage pushes its own "Restored to Inbox"
  else if (item.type === 'Event') writeRow('calendar_events', { ...row, deleted_at: null })
  else if (item.type === 'Journal') restoreJournalEntry(row as JournalEntry)
  else if (item.type === 'Project') restoreTrashedProject(row as Project)
  else if (item.type === 'Domain') restoreTrashedDomain(row as Domain)
  else restoreTrashedArea(row as Area)
}

/** Gone for good. A project's, area's or domain's contents stay — the FKs set them to no project / no area. */
export function deleteItemForever(item: DeletedItem): void {
  writeRow(TRASH_TABLE[item.type], item.rawRow, 'delete')
}
