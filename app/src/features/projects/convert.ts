// Change a thing's type (Kai 2026-10-06): project ↔ retainer, project / retainer ↔ area,
// area ↔ domain. Pure plans — the writes, the writes that take them back, and the one line the
// confirmation shows — so the rules are tested (convert.test.ts) and ./ChangeType.tsx only runs them.
//
// The rules, simplest honest version of each direction:
// · project ↔ retainer: flip `projects.type`; nothing else moves. A retainer's monthly reload
//   (0047) picks it up on the next 1st.
// · project / retainer → area: a new area with its name, domain and colour; every task in the
//   project (open and done) moves to it (project_id → area_id, its milestone link dropped). The
//   project goes to Trash, keeping what an area has no place for — milestones, checklist, logged
//   hours, status updates — restorable from Trash for 30 days.
// · area → project: a new standard project with its name, domain and colour; its tasks move in;
//   the area goes to Trash.
// · area → domain: a new domain with its name and colour; its tasks move to the domain (no area);
//   the area goes to Trash.
// · domain → area: a new area (no domain) with its name and colour; its loose tasks (no project,
//   no area) move into it; its projects, areas, people, routines and notes — and the domain link
//   of tasks inside those projects / areas — go to "no domain"; the domain goes to Trash.
// Every plan's `undo` restores each rewritten row as it was, then removes what was created.

import type { Area, Domain, Project, Task } from '../../lib/types'

export type Kind = 'project' | 'retainer' | 'area' | 'domain'
export const KIND_LABEL: Record<Kind, string> = { project: 'Project', retainer: 'Retainer', area: 'Area', domain: 'Domain' }
export type Table = 'projects' | 'areas' | 'domains' | 'tasks' | 'people' | 'routines' | 'notes'
export interface Write { table: Table; row: { id: string } & Record<string, unknown>; op?: 'delete' }
export interface Plan {
  writes: Write[]
  undo: Write[]
  /** The confirmation's one line: exactly what will happen. */
  summary: string
  /** What the thing becomes (its page / row), when it's a new row. */
  created?: { kind: Kind; id: string }
}

type Row = { id: string } & Record<string, unknown>
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)

/** Rewrite `rows` with `patch`; undo puts each back as it was. */
function moves(table: Table, rows: Row[], patch: (r: Row) => Record<string, unknown>): { writes: Write[]; undo: Write[] } {
  return { writes: rows.map((r) => ({ table, row: { ...r, ...patch(r) } })), undo: rows.map((r) => ({ table, row: r })) }
}

/** "3 open tasks and 2 done move to the new area" · "No tasks to move". */
function taskLine(tasks: Task[], dest: string, open = 'open'): string {
  const todo = live(tasks).filter((t) => t.status === 'todo').length
  const done = live(tasks).filter((t) => t.status !== 'todo').length
  if (!todo && !done) return 'No tasks to move'
  return `${[todo ? plural(todo, `${open} task`) : null, done ? `${done} done` : null].filter(Boolean).join(' and ')} ${todo + done === 1 ? 'moves' : 'move'} to ${dest}`
}

export function kindOf(entity: Project | Area | Domain, table: 'projects' | 'areas' | 'domains'): Kind {
  if (table === 'projects') return (entity as Project).type === 'retainer' ? 'retainer' : 'project'
  return table === 'areas' ? 'area' : 'domain'
}

/** What each kind can become, in menu order. */
export const TARGETS: Record<Kind, Kind[]> = {
  project: ['retainer', 'area'],
  retainer: ['project', 'area'],
  area: ['project', 'domain'],
  domain: ['area'],
}

export function flipProjectType(p: Project, now: string): Plan {
  const to = p.type === 'retainer' ? 'standard' : 'retainer'
  return {
    writes: [{ table: 'projects', row: { ...p, type: to, updated_at: now } as Row }],
    undo: [{ table: 'projects', row: p as unknown as Row }],
    summary: to === 'retainer'
      ? 'Everything stays · from the next 1st its checklist resets and unfinished work rolls into the new month.'
      : 'Everything stays · it stops resetting each month.',
  }
}

export function projectToArea(p: Project, tasks: Task[], newId: string, now: string): Plan {
  const area: Area = { id: newId, domain_id: p.domain_id, name: p.name, description: null, color: p.color ?? null, sort_order: 0, created_at: now, updated_at: now }
  const inIt = tasks.filter((t) => t.project_id === p.id) as unknown as Row[]
  const m = moves('tasks', inIt, () => ({ project_id: null, area_id: newId, milestone_id: null }))
  const kept = [p.milestones?.length ? 'milestones' : null, p.checklist?.length ? 'checklist' : null, 'logged hours', 'updates'].filter(Boolean).join(', ')
  return {
    writes: [{ table: 'areas', row: area as unknown as Row }, ...m.writes, { table: 'projects', row: { ...p, deleted_at: now, updated_at: now } as Row }],
    undo: [{ table: 'projects', row: { ...p, deleted_at: null } as Row }, ...m.undo, { table: 'areas', row: area as unknown as Row, op: 'delete' }],
    summary: `${taskLine(tasks.filter((t) => t.project_id === p.id), 'the new area')} · its ${kept} stay with the ${p.type === 'retainer' ? 'retainer' : 'project'} in Trash (30 days).`,
    created: { kind: 'area', id: newId },
  }
}

export function areaToProject(a: Area, tasks: Task[], newId: string, now: string): Plan {
  const project: Project = { id: newId, domain_id: a.domain_id, name: a.name, type: 'standard', status: 'active', color: a.color, target_date: null, milestones: [], checklist: [], engagement_model: null, created_at: now, updated_at: now } as Project
  const inIt = tasks.filter((t) => t.area_id === a.id) as unknown as Row[]
  const m = moves('tasks', inIt, () => ({ area_id: null, project_id: newId, domain_id: a.domain_id }))
  return {
    writes: [{ table: 'projects', row: project as unknown as Row }, ...m.writes, { table: 'areas', row: { ...a, deleted_at: now, updated_at: now } as Row }],
    undo: [{ table: 'areas', row: { ...a, deleted_at: null } as Row }, ...m.undo, { table: 'projects', row: project as unknown as Row, op: 'delete' }],
    summary: `${taskLine(tasks.filter((t) => t.area_id === a.id), 'the new project')} · the area goes to Trash.`,
    created: { kind: 'project', id: newId },
  }
}

export function areaToDomain(a: Area, tasks: Task[], newId: string, sortOrder: number, now: string): Plan {
  const domain: Domain = { id: newId, name: a.name, color: a.color, sort_order: sortOrder, created_at: now, updated_at: now }
  const inIt = tasks.filter((t) => t.area_id === a.id) as unknown as Row[]
  const m = moves('tasks', inIt, () => ({ area_id: null, project_id: null, domain_id: newId }))
  return {
    writes: [{ table: 'domains', row: domain as unknown as Row }, ...m.writes, { table: 'areas', row: { ...a, deleted_at: now, updated_at: now } as Row }],
    undo: [{ table: 'areas', row: { ...a, deleted_at: null } as Row }, ...m.undo, { table: 'domains', row: domain as unknown as Row, op: 'delete' }],
    summary: `${taskLine(tasks.filter((t) => t.area_id === a.id), 'the new domain')} · the area goes to Trash.`,
    created: { kind: 'domain', id: newId },
  }
}

export interface DomainRows {
  projects: Row[]
  areas: Row[]
  tasks: Task[]
  people?: Row[]
  routines?: Row[]
  notes?: Row[]
}

export function domainToArea(d: Domain, rows: DomainRows, newId: string, now: string): Plan {
  const area: Area = { id: newId, domain_id: null, name: d.name, description: null, color: d.color, sort_order: 0, created_at: now, updated_at: now }
  const mine = (r: Row) => r.domain_id === d.id
  const tasks = rows.tasks.filter((t) => t.domain_id === d.id) as unknown as Row[]
  const loose = tasks.filter((t) => !t.project_id && !t.area_id)
  const filed = tasks.filter((t) => t.project_id || t.area_id)
  const parts = [
    moves('tasks', loose, () => ({ area_id: newId, domain_id: null })),
    moves('tasks', filed, () => ({ domain_id: null })),
    ...(['projects', 'areas', 'people', 'routines', 'notes'] as const).map((t) => moves(t, (rows[t] ?? []).filter(mine), () => ({ domain_id: null }))),
  ]
  const projects = live(rows.projects as { deleted_at?: string | null }[]).filter((r) => mine(r as Row)).length
  const areas = live(rows.areas as { deleted_at?: string | null }[]).filter((r) => mine(r as Row)).length
  const leaving = [projects ? plural(projects, 'project') : null, areas ? plural(areas, 'area') : null].filter(Boolean).join(' and ')
  return {
    writes: [{ table: 'areas', row: area as unknown as Row }, ...parts.flatMap((p) => p.writes), { table: 'domains', row: { ...d, deleted_at: now, updated_at: now } as Row }],
    undo: [{ table: 'domains', row: { ...d, deleted_at: null } as Row }, ...parts.flatMap((p) => p.undo), { table: 'areas', row: area as unknown as Row, op: 'delete' }],
    summary: `${taskLine(loose as unknown as Task[], 'the new area', 'loose')}${leaving ? ` · its ${leaving} keep going with no domain` : ''} · the domain goes to Trash.`,
    created: { kind: 'area', id: newId },
  }
}
