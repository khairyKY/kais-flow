import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import type { SearchHit, SearchEntityType } from '../../lib/types'
import { useOpenTask } from '../tasks/openTask'

export async function searchHybrid(query: string, limit = 50): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search', { body: { query, limit } })
  if (error) throw error
  // An answer without a results list is a failed search, not an empty one (useSearch → "resting").
  const results = (data as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) throw new Error('search answered without results')
  return results as SearchHit[]
}

// Punch 49: the groups the ⌘/ overlay and the full page both render, in the export's order
// (Search.dc.html: People, Tasks, Events, Journal, Projects — Inbox joins after Tasks, Areas after
// Projects since 0052). Rendering is driven by this list, so a hit type the backend doesn't return
// yet simply produces no group.
export const SEARCH_GROUPS: { type: SearchEntityType; label: string; tint: string; dot: string }[] = [
  { type: 'person', label: 'People', tint: 'var(--acc-sage-text)', dot: 'var(--acc-clover)' },
  { type: 'task', label: 'Tasks', tint: '#a1707c', dot: 'var(--acc-moss)' },
  { type: 'calendar_event', label: 'Events', tint: 'var(--acc-lavender-deep)', dot: 'var(--acc-lavender)' },
  { type: 'inbox_item', label: 'Inbox', tint: 'var(--acc-hydrangea-deep)', dot: 'var(--acc-hydrangea)' },
  { type: 'journal_entry', label: 'Journal', tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)' },
  { type: 'project', label: 'Projects', tint: 'var(--acc-lavender-deep)', dot: 'var(--acc-moss)' },
  { type: 'area', label: 'Areas', tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)' },
]

/** Where a result opens: the thing itself, every time (Kai 2026-10-06: "I type 'remanage', it
 * brought an entry, but when I clicked it, it wasn't there"). A task opens as itself — the sheet
 * on a phone, the editor on a computer — never a list that may not show it (done, someday, a
 * project page that lists only open tasks). Everything else opens its page holding that one item:
 * the Inbox / Journal / Calendar read the param and bring the item up (any status, any day). */
export type SearchDestination = { task: string } | { href: string }

export function searchDestination(hit: Pick<SearchHit, 'entity_type' | 'entity_id'>): SearchDestination {
  const id = hit.entity_id
  switch (hit.entity_type) {
    case 'task':
      return { task: id }
    case 'project':
    case 'area': // ProjectDetailPage draws either from the one id
      return { href: `/projects/${id}` }
    case 'person':
      return { href: `/people/${id}` }
    case 'inbox_item':
      return { href: `/inbox?focus=${id}` }
    case 'journal_entry':
      return { href: `/journal?focus=${id}` }
    case 'calendar_event':
      return { href: `/calendar?event=${id}` }
  }
}

/** Opens a search hit (or a chat citation, same shape) where `searchDestination` says. */
export function useOpenSearchHit(): (hit: Pick<SearchHit, 'entity_type' | 'entity_id'>) => void {
  const navigate = useNavigate()
  const openTask = useOpenTask()
  return useCallback(
    (hit) => {
      const to = searchDestination(hit)
      if ('task' in to) openTask(to.task)
      else void navigate(to.href)
    },
    [navigate, openTask],
  )
}
