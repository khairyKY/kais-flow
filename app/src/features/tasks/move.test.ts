import { describe, expect, it } from 'vitest'
import type { Area, Domain, Project, Task } from '../../lib/types'
import { moveGroups, placeKey, placeName, placeTask, planReparent, targetKey } from './move'

const task = (over: Partial<Task> = {}) => ({ id: 't', project_id: null, area_id: null, domain_id: null, milestone_id: null, ...over }) as Task
const domain = (id: string, name: string) => ({ id, name }) as Domain
const area = (id: string, name: string, domain_id: string | null) => ({ id, name, domain_id }) as Area
const project = (id: string, name: string, domain_id: string | null, status = 'active') => ({ id, name, domain_id, status }) as Project

describe('placeTask — a task lives in a project or an area, never both', () => {
  it('project: sets it and its domain, clears the area', () => {
    expect(placeTask(task({ area_id: 'a' }), { kind: 'project', id: 'p', domainId: 'd', name: 'P' })).toMatchObject({ project_id: 'p', area_id: null, domain_id: 'd' })
  })
  it('area: sets it and its domain, clears the project', () => {
    expect(placeTask(task({ project_id: 'p' }), { kind: 'area', id: 'a', domainId: 'd', name: 'A' })).toMatchObject({ project_id: null, area_id: 'a', domain_id: 'd' })
  })
  it('domain: sets only the domain', () => {
    expect(placeTask(task({ project_id: 'p', area_id: 'a', domain_id: 'x' }), { kind: 'domain', id: 'd', name: 'D' })).toMatchObject({ project_id: null, area_id: null, domain_id: 'd' })
  })
  it('none: clears all three', () => {
    expect(placeTask(task({ project_id: 'p', area_id: 'a', domain_id: 'd' }), { kind: 'none', name: 'None' })).toMatchObject({ project_id: null, area_id: null, domain_id: null })
  })
  it('a milestone stays behind when the task leaves its project; re-filing in place keeps it', () => {
    expect(placeTask(task({ project_id: 'p', milestone_id: 'm' }), { kind: 'project', id: 'q', domainId: null, name: 'Q' }).milestone_id).toBeNull()
    expect(placeTask(task({ project_id: 'p', milestone_id: 'm' }), { kind: 'project', id: 'p', domainId: null, name: 'P' }).milestone_id).toBe('m')
    expect(placeTask(task({ project_id: 'p', milestone_id: 'm' }), { kind: 'area', id: 'a', domainId: null, name: 'A' }).milestone_id).toBeNull()
  })
  it('leaves every other field alone', () => {
    expect(placeTask(task({ title: 'keep' } as Partial<Task>), { kind: 'none', name: 'None' })).toMatchObject({ id: 't', title: 'keep' })
  })
})

describe('moveGroups — one group per domain: the domain, its areas, its projects; then No domain', () => {
  const domains = [domain('w', 'Work'), domain('h', 'Home')]
  const areas = [area('a1', 'Health', 'h'), area('a2', 'Reading', null), area('a3', 'Old', 'trashed')]
  const projects = [project('p1', 'Site', 'w'), project('p2', 'Garage', null), project('p3', 'Done thing', 'w', 'archived')]
  it('lists every place in order, archived projects left out', () => {
    expect(moveGroups(domains, areas, projects).map((g) => [g.title, g.targets.map(targetKey)])).toEqual([
      ['Work', ['domain:w', 'project:p1']],
      ['Home', ['domain:h', 'area:a1']],
      ['No domain', ['area:a2', 'area:a3', 'project:p2']],
    ])
  })
  it('an area in a domain carries that domain; one outside a live domain carries none', () => {
    const [, home, none] = moveGroups(domains, areas, projects)
    expect(home.targets[1]).toEqual({ kind: 'area', id: 'a1', domainId: 'h', name: 'Health' })
    expect(none.targets[1]).toMatchObject({ id: 'a3', domainId: null })
  })
  it('a search narrows each group and drops the empty ones', () => {
    expect(moveGroups(domains, areas, projects, ' hEa ').map((g) => [g.title, g.targets.map((t) => t.name)])).toEqual([['Home', ['Health']]])
    expect(moveGroups(domains, areas, projects, 'work').map((g) => g.targets.map(targetKey))).toEqual([['domain:w']])
  })
})

describe('placeKey / placeName — where a task is now', () => {
  const domains = [domain('w', 'Work')]
  const areas = [area('a', 'Health', null)]
  const projects = [project('p', 'Site', 'w')]
  it('project, else area, else domain, else none', () => {
    expect(placeKey(task({ project_id: 'p', domain_id: 'w' }))).toBe('project:p')
    expect(placeKey(task({ area_id: 'a' }))).toBe('area:a')
    expect(placeKey(task({ domain_id: 'w' }))).toBe('domain:w')
    expect(placeKey(task())).toBe('none')
    expect(placeKey(null)).toBeNull()
    expect(placeName(task({ area_id: 'a' }), projects, areas, domains)).toBe('Health')
    expect(placeName(task({ domain_id: 'w' }), projects, areas, domains)).toBe('Work')
    expect(placeName(task(), projects, areas, domains)).toBeNull()
  })
})

describe('planReparent — a container changing domain takes its tasks', () => {
  it('only the tasks in it whose domain differs', () => {
    const tasks = [task({ id: '1', area_id: 'a', domain_id: 'x' }), task({ id: '2', area_id: 'a', domain_id: 'y' }), task({ id: '3', area_id: 'b', domain_id: 'x' })]
    expect(planReparent(tasks, 'area_id', 'a', 'y').map((m) => [m.before.domain_id, m.after.id, m.after.domain_id])).toEqual([['x', '1', 'y']])
    expect(planReparent(tasks, 'project_id', 'a', 'y')).toEqual([])
  })
})
