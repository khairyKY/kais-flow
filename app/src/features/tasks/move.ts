import type { Area, Domain, Project, Task } from '../../lib/types'

// "Move to…" (Kai 2026-10-07: "you can't assign tasks to areas or domains"). Since 0052 a task
// lives in a project OR an area, never both; its domain follows that container, or is set
// directly when it has none. One picker (./MovePicker) lists each domain, its areas and its
// projects; these are its rules. Pure, so they're tested (move.test.ts).

export type MoveTarget =
  | { kind: 'project'; id: string; domainId: string | null; name: string }
  | { kind: 'area'; id: string; domainId: string | null; name: string }
  | { kind: 'domain'; id: string; name: string }
  | { kind: 'none'; name: string }

export const NO_PLACE: MoveTarget = { kind: 'none', name: 'None' }

type Place = Pick<Task, 'project_id' | 'area_id' | 'domain_id' | 'milestone_id'>

/** The row after a move. A milestone belongs to its project, so it stays behind when the task
 * leaves that project (re-filing into the same project keeps it). */
export function placeTask<T extends Place>(task: T, to: MoveTarget): T {
  const place: Place =
    to.kind === 'project' ? { project_id: to.id, area_id: null, domain_id: to.domainId, milestone_id: task.milestone_id }
    : to.kind === 'area' ? { project_id: null, area_id: to.id, domain_id: to.domainId, milestone_id: null }
    : to.kind === 'domain' ? { project_id: null, area_id: null, domain_id: to.id, milestone_id: null }
    : { project_id: null, area_id: null, domain_id: null, milestone_id: null }
  if (place.project_id !== task.project_id) place.milestone_id = null
  return { ...task, ...place }
}

/** The picker's key for where a task is now (its check mark): the project, else the area, else the domain. */
export function placeKey(task: Pick<Task, 'project_id' | 'area_id' | 'domain_id'> | null): string | null {
  if (!task) return null
  if (task.project_id) return `project:${task.project_id}`
  if (task.area_id) return `area:${task.area_id}`
  if (task.domain_id) return `domain:${task.domain_id}`
  return 'none'
}

export function targetKey(t: MoveTarget): string {
  return t.kind === 'none' ? 'none' : `${t.kind}:${t.id}`
}

/** Where a task lives, by name: its project, else its area, else its domain. */
export function placeName(task: Pick<Task, 'project_id' | 'area_id' | 'domain_id'>, projects: Project[], areas: Area[], domains: Domain[]): string | null {
  if (task.project_id) return projects.find((p) => p.id === task.project_id)?.name ?? null
  if (task.area_id) return areas.find((a) => a.id === task.area_id)?.name ?? null
  if (task.domain_id) return domains.find((d) => d.id === task.domain_id)?.name ?? null
  return null
}

export interface MoveGroup {
  key: string
  /** The domain's name, or "No domain". */
  title: string
  /** The domain itself first, then its areas, then its projects. */
  targets: MoveTarget[]
}

/** The picker's list: one group per domain (in its order), then "No domain" for areas and projects
 * outside one. `query` narrows every group to the names that contain it. Archived projects aren't
 * somewhere to move a task. */
export function moveGroups(domains: Domain[], areas: Area[], projects: Project[], query = ''): MoveGroup[] {
  const q = query.trim().toLowerCase()
  const hit = (t: MoveTarget) => !q || t.name.toLowerCase().includes(q)
  const live = projects.filter((p) => p.status !== 'archived')
  const known = new Set(domains.map((d) => d.id))
  const inside = (domainId: string | null) => (x: { domain_id: string | null }) => (domainId ? x.domain_id === domainId : !x.domain_id || !known.has(x.domain_id))
  const contents = (domainId: string | null): MoveTarget[] => [
    ...areas.filter(inside(domainId)).map((a): MoveTarget => ({ kind: 'area', id: a.id, domainId, name: a.name })),
    ...live.filter(inside(domainId)).map((p): MoveTarget => ({ kind: 'project', id: p.id, domainId, name: p.name })),
  ]
  const groups: MoveGroup[] = [
    ...domains.map((d) => ({ key: d.id, title: d.name, targets: [{ kind: 'domain', id: d.id, name: d.name } as MoveTarget, ...contents(d.id)] })),
    { key: 'none', title: 'No domain', targets: contents(null) },
  ]
  return groups.map((g) => ({ ...g, targets: g.targets.filter(hit) })).filter((g) => g.targets.length > 0)
}

/** A container that changes domain takes its tasks with it (their domain follows the container):
 * each task in it whose domain differs, before and after. */
export function planReparent<T extends Pick<Task, 'id' | 'project_id' | 'area_id' | 'domain_id'>>(
  tasks: readonly T[],
  field: 'project_id' | 'area_id',
  containerId: string,
  domainId: string | null,
): { before: T; after: T }[] {
  return tasks.filter((t) => t[field] === containerId && t.domain_id !== domainId).map((t) => ({ before: t, after: { ...t, domain_id: domainId } }))
}
