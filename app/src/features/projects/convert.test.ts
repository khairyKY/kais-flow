import { describe, expect, it } from 'vitest'
import type { Area, Domain, Project, Task } from '../../lib/types'
import { areaToDomain, areaToProject, domainToArea, flipProjectType, projectToArea, TARGETS, type Plan } from './convert'

const NOW = '2026-10-06T10:00:00.000Z'
const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', domain_id: 'd1', name: 'Site', type: 'standard', status: 'active', color: 'var(--acc-gold)', milestones: [{ id: 'm1', title: 'Launch', weight: 2, completed: false }], checklist: [], created_at: 'x', updated_at: 'x', ...over }) as Project
const area = (over: Partial<Area> = {}): Area => ({ id: 'a1', domain_id: 'd1', name: 'Health', description: null, color: '#7a4a52', sort_order: 0, created_at: 'x', updated_at: 'x', ...over })
const domain = (over: Partial<Domain> = {}): Domain => ({ id: 'd1', name: 'Work', color: 'var(--acc-terra)', sort_order: 0, created_at: 'x', updated_at: 'x', ...over })
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, project_id: null, area_id: null, domain_id: null, milestone_id: null, status: 'todo', title: id, ...over }) as Task
const rowsOf = (plan: Plan, table: string) => plan.writes.filter((w) => w.table === table && !w.op).map((w) => w.row)

describe('what each thing can become', () => {
  it('project ↔ retainer, project / retainer ↔ area, area ↔ domain', () => {
    expect(TARGETS).toEqual({ project: ['retainer', 'area'], retainer: ['project', 'area'], area: ['project', 'domain'], domain: ['area'] })
  })
})

describe('project ↔ retainer', () => {
  it('flips the type and nothing else; undo flips it back', () => {
    const p = project()
    const plan = flipProjectType(p, NOW)
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0].row).toMatchObject({ id: 'p1', type: 'retainer', milestones: p.milestones })
    expect(plan.undo[0].row).toBe(p)
    expect(plan.summary).toMatch(/resets/)
    expect(flipProjectType(project({ type: 'retainer' }), NOW).writes[0].row.type).toBe('standard')
  })
})

describe('project / retainer → area', () => {
  const tasks = [task('t1', { project_id: 'p1', milestone_id: 'm1' }), task('t2', { project_id: 'p1', status: 'done' }), task('t3', { project_id: 'other' })]
  const plan = projectToArea(project(), tasks, 'new', NOW)

  it('a new area with its name, domain and colour; every task in it moves (milestone link dropped)', () => {
    expect(rowsOf(plan, 'areas')[0]).toMatchObject({ id: 'new', name: 'Site', domain_id: 'd1', color: 'var(--acc-gold)' })
    expect(rowsOf(plan, 'tasks').map((t) => [t.id, t.project_id, t.area_id, t.milestone_id])).toEqual([['t1', null, 'new', null], ['t2', null, 'new', null]])
  })
  it('the project goes to Trash keeping what an area has no place for', () => {
    expect(rowsOf(plan, 'projects')[0]).toMatchObject({ id: 'p1', deleted_at: NOW, milestones: project().milestones })
    expect(plan.summary).toBe('1 open task and 1 done move to the new area · its milestones, logged hours, updates stay with the project in Trash (30 days).')
    expect(plan.created).toEqual({ kind: 'area', id: 'new' })
  })
  it('undo: project back, tasks back exactly, the new area removed', () => {
    expect(plan.undo[0].row).toMatchObject({ id: 'p1', deleted_at: null })
    expect(plan.undo.filter((w) => w.table === 'tasks').map((w) => w.row)).toEqual(tasks.slice(0, 2))
    expect(plan.undo.at(-1)).toMatchObject({ table: 'areas', op: 'delete', row: { id: 'new' } })
  })
})

describe('area → project', () => {
  it('a new standard project; its tasks move in with the area’s domain; the area goes to Trash', () => {
    const plan = areaToProject(area(), [task('t1', { area_id: 'a1' }), task('t2')], 'np', NOW)
    expect(rowsOf(plan, 'projects')[0]).toMatchObject({ id: 'np', name: 'Health', type: 'standard', domain_id: 'd1', milestones: [] })
    expect(rowsOf(plan, 'tasks')).toEqual([expect.objectContaining({ id: 't1', area_id: null, project_id: 'np', domain_id: 'd1' })])
    expect(rowsOf(plan, 'areas')[0]).toMatchObject({ id: 'a1', deleted_at: NOW })
    expect(plan.summary).toBe('1 open task moves to the new project · the area goes to Trash.')
  })
  it('an empty area says so', () => {
    expect(areaToProject(area(), [], 'np', NOW).summary).toBe('No tasks to move · the area goes to Trash.')
  })
})

describe('area → domain', () => {
  it('a new domain with its name and colour; its tasks get that domain and no area', () => {
    const plan = areaToDomain(area(), [task('t1', { area_id: 'a1', domain_id: 'd1' })], 'nd', 3, NOW)
    expect(rowsOf(plan, 'domains')[0]).toMatchObject({ id: 'nd', name: 'Health', color: '#7a4a52', sort_order: 3 })
    expect(rowsOf(plan, 'tasks')[0]).toMatchObject({ area_id: null, project_id: null, domain_id: 'nd' })
    expect(rowsOf(plan, 'areas')[0]).toMatchObject({ deleted_at: NOW })
    expect(plan.undo.at(-1)).toMatchObject({ table: 'domains', op: 'delete' })
  })
})

describe('domain → area', () => {
  const plan = domainToArea(domain(), {
    projects: [{ id: 'p1', domain_id: 'd1' }, { id: 'p2', domain_id: 'd2' }],
    areas: [{ id: 'a1', domain_id: 'd1' }],
    tasks: [task('loose', { domain_id: 'd1' }), task('inProject', { domain_id: 'd1', project_id: 'p1' }), task('elsewhere', { domain_id: 'd2' })],
    people: [{ id: 'pe1', domain_id: 'd1' }],
  }, 'na', NOW)

  it('loose tasks move into the new area; the rest goes to no domain; the domain to Trash', () => {
    expect(rowsOf(plan, 'areas')[0]).toMatchObject({ id: 'na', name: 'Work', domain_id: null })
    expect(rowsOf(plan, 'areas')[1]).toMatchObject({ id: 'a1', domain_id: null })
    expect(rowsOf(plan, 'tasks').map((t) => [t.id, t.area_id ?? null, t.domain_id, t.project_id ?? null])).toEqual([['loose', 'na', null, null], ['inProject', null, null, 'p1']])
    expect(rowsOf(plan, 'projects')).toEqual([{ id: 'p1', domain_id: null }])
    expect(rowsOf(plan, 'people')).toEqual([{ id: 'pe1', domain_id: null }])
    expect(rowsOf(plan, 'domains')[0]).toMatchObject({ id: 'd1', deleted_at: NOW })
    expect(plan.summary).toBe('1 loose task moves to the new area · its 1 project and 1 area keep going with no domain · the domain goes to Trash.')
  })
  it('undo restores the domain first and puts every row back', () => {
    expect(plan.undo[0]).toMatchObject({ table: 'domains', row: { id: 'd1', deleted_at: null } })
    expect(plan.undo.filter((w) => w.table === 'projects').map((w) => w.row)).toEqual([{ id: 'p1', domain_id: 'd1' }])
    expect(plan.undo.at(-1)).toMatchObject({ table: 'areas', op: 'delete', row: { id: 'na' } })
  })
})
