import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { restoreTask } from '../tasks/api'
import { restoreInboxItem } from '../inbox/api'
import { restoreJournalEntry } from '../journal/api'
import type { Task, InboxItem, JournalEntry } from '../../lib/types'

export interface DeletedItem {
  id: string
  type: 'Task' | 'Inbox' | 'Event' | 'Journal'
  title: string
  deleted_at: string
  rawRow: any
}

export function useDeletedItems() {
  return useQuery({
    queryKey: ['deleted_items'],
    queryFn: async () => {
      const [tasksRes, inboxRes, calendarRes, journalRes] = await Promise.all([
        supabase.from('tasks').select('*').not('deleted_at', 'is', null),
        supabase.from('inbox_items').select('*').not('deleted_at', 'is', null),
        supabase.from('calendar_events').select('*').not('deleted_at', 'is', null),
        supabase.from('journal_entries').select('*').not('deleted_at', 'is', null)
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
      return list.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    }
  })
}

export function restoreItem(item: DeletedItem): void {
  const row = item.rawRow
  if (item.type === 'Task') restoreTask(row as Task)
  else if (item.type === 'Inbox') restoreInboxItem(row as InboxItem)
  else if (item.type === 'Event') writeRow('calendar_events', { ...row, deleted_at: null })
  else if (item.type === 'Journal') restoreJournalEntry(row as JournalEntry)
}

export function deleteItemForever(item: DeletedItem): void {
  const row = item.rawRow
  const table = item.type === 'Task' ? 'tasks' :
                item.type === 'Inbox' ? 'inbox_items' :
                item.type === 'Event' ? 'calendar_events' :
                'journal_entries'
  writeRow(table, row, 'delete')
}
