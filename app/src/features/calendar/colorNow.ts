// The colour resolver outside a component (a Start focus press), kept apart from ./blockColor so it loads no query hooks.
import { queryClient } from '../../lib/queryClient'
import type { Area, Project, Task } from '../../lib/types'
import { makeColorResolver, type Colored, type Resolved } from '../../../../supabase/functions/_shared/colorFollows.ts'

/** The same resolver outside a component (a Start focus press): from what the queries hold right now. */
export function colorOfNow(): (item: Colored) => Resolved {
  const live = <T extends { deleted_at?: string | null }>(key: string) => (queryClient.getQueryData<T[]>([key]) ?? []).filter((r) => !r.deleted_at)
  return makeColorResolver(live<Project>('projects'), live<Area>('areas'), live<Task>('tasks'))
}
