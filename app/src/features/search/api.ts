import { supabase } from '../../lib/supabase'
import type { SearchHit, SearchEntityType, Task } from '../../lib/types'

export async function searchHybrid(query: string, limit = 50): Promise<SearchHit[]> {
  const { data, error } = await supabase.functions.invoke('search', { body: { query, limit } })
  if (error) throw error
  return (data as { results: SearchHit[] }).results
}

// Punch 49: the groups the ⌘/ overlay and the full page both render, in the export's order
// (Search.dc.html: People, Tasks, Events, Journal, Projects — Inbox joins after Tasks).
// Rendering is driven by this list, so a hit type the backend doesn't return yet simply produces
// no group: if migration 0031 hasn't been pushed, search_hybrid still answers with tasks +
// inbox_items only and the page degrades to exactly today's two groups instead of breaking.
export const SEARCH_GROUPS: { type: SearchEntityType; label: string; tint: string; dot: string }[] = [
  { type: 'person', label: 'People', tint: 'var(--acc-sage-text)', dot: 'var(--acc-clover)' },
  { type: 'task', label: 'Tasks', tint: '#a1707c', dot: 'var(--acc-moss)' },
  { type: 'calendar_event', label: 'Events', tint: 'var(--acc-lavender-deep)', dot: 'var(--acc-lavender)' },
  { type: 'inbox_item', label: 'Inbox', tint: 'var(--acc-hydrangea-deep)', dot: 'var(--acc-hydrangea)' },
  { type: 'journal_entry', label: 'Journal', tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)' },
  { type: 'project', label: 'Projects', tint: 'var(--acc-lavender-deep)', dot: 'var(--acc-moss)' },
]

// Kai 2026-07-21: "it should take you to the task — if it's inside a project, take you to that
// project and highlight where it is." Only Tasks/Inbox/Projects honour `?focus=`; the rest land
// on their page. Shared by the overlay and the full page so they can never disagree.
export function searchHitHref(hit: SearchHit, tasks: Task[]): string {
  switch (hit.entity_type) {
    case 'task': {
      const task = tasks.find((t) => t.id === hit.entity_id)
      return task?.project_id ? `/projects/${task.project_id}?focus=${hit.entity_id}` : `/tasks?focus=${hit.entity_id}`
    }
    case 'person':
      return `/people/${hit.entity_id}`
    case 'project':
      return `/projects/${hit.entity_id}`
    case 'calendar_event':
      return '/calendar'
    case 'journal_entry':
      return '/journal'
    default:
      return `/inbox?focus=${hit.entity_id}`
  }
}
