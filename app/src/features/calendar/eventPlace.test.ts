import { describe, expect, it } from 'vitest'
import type { Area, Project } from '../../lib/types'
import { eventPlaceKey, eventPlaceName, eventPlacePatch } from './eventPlace'

describe('where an event lives (0099)', () => {
  const projects = [{ id: 'p1', name: 'Pricing site' }] as Project[]
  const areas = [{ id: 'a1', name: 'Health' }] as Area[]

  it('the picker key: the project, else the area, else none', () => {
    expect(eventPlaceKey({ project_id: 'p1', area_id: null })).toBe('project:p1')
    expect(eventPlaceKey({ project_id: null, area_id: 'a1' })).toBe('area:a1')
    expect(eventPlaceKey({})).toBe('none')
  })
  it('a pick is a project or an area, never both; None takes it out; a domain is never offered', () => {
    expect(eventPlacePatch({ kind: 'project', id: 'p1', domainId: null, name: 'Pricing site' })).toEqual({ project_id: 'p1', area_id: null })
    expect(eventPlacePatch({ kind: 'area', id: 'a1', domainId: null, name: 'Health' })).toEqual({ project_id: null, area_id: 'a1' })
    expect(eventPlacePatch({ kind: 'none', name: 'None' })).toEqual({ project_id: null, area_id: null })
  })
  it("the details' row names where it is", () => {
    expect(eventPlaceName({ project_id: 'p1' }, projects, areas)).toBe('Pricing site')
    expect(eventPlaceName({ area_id: 'a1' }, projects, areas)).toBe('Health')
    expect(eventPlaceName({ project_id: 'gone' }, projects, areas)).toBeNull()
    expect(eventPlaceName({}, projects, areas)).toBeNull()
  })
})
