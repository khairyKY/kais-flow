// Where an event lives (0099): a project or an area, like a task — its colour follows that place when it has none of
// its own (./blockColor). One or the other, as a task's is (tasks/move.ts placeTask); a domain isn't offered.
import type { Area, CalendarEvent, Project } from '../../lib/types'
import type { MoveTarget } from '../tasks/move'

type Place = Pick<CalendarEvent, 'project_id' | 'area_id'>

/** The picker's key for where the event is (its check mark). */
export function eventPlaceKey(e: Place): string {
  return e.project_id ? `project:${e.project_id}` : e.area_id ? `area:${e.area_id}` : 'none'
}

/** The columns a pick writes: the project (area cleared), the area (project cleared), or neither. */
export function eventPlacePatch(to: MoveTarget): Place {
  return { project_id: to.kind === 'project' ? to.id : null, area_id: to.kind === 'area' ? to.id : null }
}

/** The details' row: the project's or area's name; null when it is in neither. */
export function eventPlaceName(e: Place, projects: readonly Project[], areas: readonly Area[]): string | null {
  return (e.project_id ? projects.find((p) => p.id === e.project_id)?.name : e.area_id ? areas.find((a) => a.id === e.area_id)?.name : null) ?? null
}
