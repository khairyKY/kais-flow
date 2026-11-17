// "Colour follows where it lives" in the app (Kai 2026-11-16): every drawing of a task, a task's block or an event
// asks this for its colour — its own, else its project's, else its area's (supabase/functions/_shared/colorFollows.ts
// holds the rule; the widget feed and the MCP call the same one). The result is a palette C hex (or a custom one) for
// ./blockHue blockHue(); null = none, the kind's own hue (KIND_HUE). Changing a project's or area's colour changes
// the queries this reads, so every inheritor redraws with it.
import { useMemo } from 'react'
import { makeColorResolver, type Colored, type Resolved } from '../../../../supabase/functions/_shared/colorFollows.ts'
import { useAreas } from '../areas/api'
import { useProjects } from '../projects/api'
import { useTasks } from '../tasks/api'

export { makeColorResolver, placeSwatch, type ColorSource, type Colored, type Resolved } from '../../../../supabase/functions/_shared/colorFollows.ts'

/** The resolver, rebuilt when a project's or area's colour or a task's place changes. */
export function useBlockColor(): (item: Colored) => Resolved {
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  return useMemo(() => makeColorResolver(projects, areas, tasks), [projects, areas, tasks])
}

/** The colour picker's reset line for a hand-coloured item: "Reset to Pricing colour" (what it would follow), else the default. */
export function resetLabel(inherited: Resolved, projects: readonly { id: string; name: string }[], areas: readonly { id: string; name: string }[]): string {
  const list = inherited.source === 'project' ? projects : inherited.source === 'area' ? areas : []
  const name = list.find((x) => x.id === inherited.from)?.name
  return name ? `Reset to ${name} colour` : 'Reset to default colour'
}
