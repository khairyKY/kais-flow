import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import type { SearchHit } from '../../lib/types'
import { useOpenTask } from '../tasks/openTask'
import { literalAnswer } from './searchState'

export async function searchHybrid(query: string, limit = 50): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search', { body: { query, limit } })
  if (error) throw error
  // An answer without a results list is a failed search, not an empty one (useSearch → "resting").
  const results = (data as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) throw new Error('search answered without results')
  return literalAnswer(results as SearchHit[])
}

// The groups both the ⌘/ overlay and /search render live in ./searchView (SEARCH_GROUPS): rendering
// is driven by that list, so a hit type the backend doesn't return yet simply produces no group.

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
    // The Library (0064): its page opens the one item from tab + id.
    case 'book':
      return { href: `/library?tab=books&bookId=${id}` }
    case 'note':
      return { href: `/library?tab=notes&noteId=${id}` }
    case 'quote':
      return { href: `/library?tab=quotes&quoteId=${id}` }
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
