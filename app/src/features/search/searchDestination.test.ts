import { describe, expect, it, vi } from 'vitest'
import type { SearchEntityType } from '../../lib/types'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const { searchDestination, SEARCH_GROUPS } = await import('./api')

// Every entity type search_hybrid returns (0054) → where its result opens: the thing itself.
const ID = '11111111-2222-4333-8444-555555555555'
const TABLE: [SearchEntityType, ReturnType<typeof searchDestination>][] = [
  ['task', { task: ID }], // the task sheet on a phone, the editor on a computer (openTask) — done or not, in a project or not
  ['project', { href: `/projects/${ID}` }],
  ['area', { href: `/projects/${ID}` }], // ProjectDetailPage draws an area from the same route
  ['person', { href: `/people/${ID}` }],
  ['inbox_item', { href: `/inbox?focus=${ID}` }], // shown even when filed / dismissed / snoozed
  ['journal_entry', { href: `/journal?focus=${ID}` }], // turns to the entry's day
  ['calendar_event', { href: `/calendar?event=${ID}` }], // turns to its day, opens its details
]

describe('a search result opens the thing itself', () => {
  it.each(TABLE)('%s → %j', (type, want) => {
    expect(searchDestination({ entity_type: type, entity_id: ID })).toEqual(want)
  })

  it('every type the overlay can render has a destination, and the table covers them all', () => {
    const rendered = SEARCH_GROUPS.map((g) => g.type).sort()
    expect(TABLE.map(([t]) => t).sort()).toEqual(rendered)
  })
})
