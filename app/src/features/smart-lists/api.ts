import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { toastUndo } from '../../lib/undo'
import { appZone } from '../../lib/appZone'
import { readFilter, smartFilter, type SmartFilter } from '../../../../supabase/functions/_shared/smartList.ts'
import { effectiveDomainId } from '../tasks/grouping'
import type { Area, Project, SmartListRow, Task } from '../../lib/types'

// Smart lists (migration 0081): saved filters in the sidebar's Plan group. The rules live in
// supabase/functions/_shared/smartList.ts (shared with the MCP); this is the app's cache and writes.
// No activity_log events: a list is a saved view, like a setting, not something that happened.

const KEY = ['smart_lists']
const nowIso = () => new Date().toISOString()

/** Live lists in sidebar order. Deleted ones stay in the cache for Undo; no list shows them. */
const live = (rows: SmartListRow[]): SmartListRow[] =>
  rows
    .filter((r) => !r.deleted_at)
    .map((r) => ({ ...r, filter: readFilter(r.filter) }))
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))

export function useSmartLists() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('smart_lists').select('*')
      if (error) throw error
      return data as SmartListRow[]
    },
    select: live,
  })
}

/** The tasks a list shows — its count is the open ones among them. `now` decides "today" / "this week". */
export function smartTasks(tasks: readonly Task[], filter: SmartFilter, projects: readonly Project[], areas: readonly Area[], now: Date = new Date()): Task[] {
  return smartFilter(tasks, filter, { now, zone: appZone(), domainOf: (t) => effectiveDomainId(t, projects, areas) })
}

export const openCount = (tasks: readonly Task[]): number => tasks.filter((t) => t.status === 'todo').length

export function createSmartList(name: string, filter: SmartFilter): SmartListRow {
  const lists = live(queryClient.getQueryData<SmartListRow[]>(KEY) ?? [])
  const row: SmartListRow = {
    id: crypto.randomUUID(),
    name,
    icon: null,
    filter,
    position: lists.length ? Math.max(...lists.map((l) => l.position)) + 1 : 0,
    deleted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('smart_lists', row)
  return row
}

export function saveSmartList(row: SmartListRow, change: Partial<Pick<SmartListRow, 'name' | 'filter'>>): void {
  writeRow('smart_lists', { ...row, ...change, updated_at: nowIso() })
}

/** No confirm, an Undo toast (the app's delete). Never in Trash — a saved view, nothing in it is lost. */
export function deleteSmartListWithUndo(row: SmartListRow): void {
  writeRow('smart_lists', { ...row, deleted_at: nowIso(), updated_at: nowIso() })
  toastUndo(`Deleted “${row.name}”`, () => writeRow('smart_lists', { ...row, deleted_at: null, updated_at: nowIso() }))
}

/** ⋯ → Move up / down: renumbers the sidebar order. */
export function moveSmartList(lists: readonly SmartListRow[], row: SmartListRow, by: -1 | 1): void {
  const order = lists.filter((l) => l.id !== row.id)
  order.splice(lists.findIndex((l) => l.id === row.id) + by, 0, row)
  order.forEach((l, i) => {
    if (l.position !== i) writeRow('smart_lists', { ...l, position: i, updated_at: nowIso() })
  })
}
