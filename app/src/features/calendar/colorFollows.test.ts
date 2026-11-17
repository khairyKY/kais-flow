import { describe, expect, it } from 'vitest'
import { BLOCK_SWATCHES, nearestSwatch } from './blockHue'
import { TOKEN_HEX, makeColorResolver, placeSwatch } from '../../../../supabase/functions/_shared/colorFollows.ts'

// "Colour follows where it lives": own → project → area → none; a task's block asks its task; Google / ICS keep their own.
const ROSE = '#E58F99', FERN = '#72BF8E', IRIS = '#B59CE3'
const projects = [{ id: 'p1', color: FERN }, { id: 'p2', color: null }, { id: 'p3', color: 'var(--acc-terra)' }]
const areas = [{ id: 'a1', color: ROSE }, { id: 'a2', color: '#7a4a52' }]
const tasks = [
  { id: 't1', project_id: 'p1', area_id: null },
  { id: 't2', project_id: null, area_id: 'a1' },
  { id: 't3', project_id: 'p2', area_id: 'a1' }, // a project without a colour falls through to its area
  { id: 't4', project_id: null, area_id: null },
]
const resolve = makeColorResolver(projects, areas, tasks)

describe('resolveColor precedence', () => {
  it('own colour first', () => {
    expect(resolve({ color: '#C9A658', project_id: 'p1', area_id: 'a1' })).toEqual({ color: '#C9A658', source: 'own' })
  })
  it('then the project, then the area, then none', () => {
    expect(resolve({ project_id: 'p1', area_id: 'a1' })).toEqual({ color: FERN, source: 'project', from: 'p1' })
    expect(resolve({ area_id: 'a1' })).toEqual({ color: ROSE, source: 'area', from: 'a1' })
    expect(resolve({ project_id: 'p2', area_id: 'a1' })).toEqual({ color: ROSE, source: 'area', from: 'a1' })
    expect(resolve({ project_id: 'p2' })).toEqual({ color: null, source: 'none' })
    expect(resolve({})).toEqual({ color: null, source: 'none' })
  })
  it('a task (no colour of its own) follows its project, else its area', () => {
    expect(resolve({ project_id: 'p1' }).color).toBe(FERN)
    expect(resolve({ area_id: 'a1' }).color).toBe(ROSE)
  })
  it('an unknown or empty colour is no colour', () => {
    expect(resolve({ project_id: 'gone' }).source).toBe('none')
    expect(resolve({ color: '' }).source).toBe('none')
  })
})

describe('a task block takes its task\'s colour', () => {
  it('follows the task\'s project, then area', () => {
    expect(resolve({ task_id: 't1' })).toEqual({ color: FERN, source: 'project', from: 'p1' })
    expect(resolve({ task_id: 't2' })).toEqual({ color: ROSE, source: 'area', from: 'a1' })
    expect(resolve({ task_id: 't3' })).toEqual({ color: ROSE, source: 'area', from: 'a1' })
  })
  it('moving the task to another project recolours the block', () => {
    const moved = makeColorResolver(projects, areas, tasks.map((t) => (t.id === 't1' ? { ...t, project_id: 'p3' } : t)))
    expect(resolve({ task_id: 't1' }).color).toBe(FERN)
    expect(moved({ task_id: 't1' }).source).toBe('project')
    expect(moved({ task_id: 't1' }).color).toBe(nearestSwatch('#B5654A').value)
  })
  it('keeps the block\'s own colour, and an untouched task\'s block has none', () => {
    expect(resolve({ task_id: 't1', color: '#0D9298' })).toEqual({ color: '#0D9298', source: 'own' })
    expect(resolve({ task_id: 't4' }).source).toBe('none')
  })
  it('falls back to the block\'s own place when the task has none', () => {
    expect(resolve({ task_id: 't4', project_id: 'p1' }).color).toBe(FERN)
  })
  it('Reset: clearing the colour makes it follow again', () => {
    const e = { color: '#0D9298', project_id: 'p1' }
    expect(resolve(e).source).toBe('own')
    expect(resolve({ ...e, color: null })).toEqual({ color: FERN, source: 'project', from: 'p1' })
  })
})

describe('Google / ICS events keep their calendar\'s colour unless filed', () => {
  for (const source of ['gcal', 'ics']) {
    it(source, () => {
      expect(resolve({ source, color: '#4285F4' })).toEqual({ color: '#4285F4', source: 'own' })
      expect(resolve({ source, color: '#4285F4', project_id: 'p1' })).toEqual({ color: FERN, source: 'project', from: 'p1' })
      expect(resolve({ source, color: '#4285F4', area_id: 'a1' }).color).toBe(ROSE)
      // filed under a place with no colour: the calendar's stays
      expect(resolve({ source, color: '#4285F4', project_id: 'p2' })).toEqual({ color: '#4285F4', source: 'own' })
      expect(resolve({ source }).source).toBe('none')
    })
  }
})

// TOKEN_HEX is colors.css's --acc-* day values (checked by hand: vitest reads a .css import as empty).
describe('legacy colours draw as their palette C swatch', () => {
  it('a project or area saved with a token or an old hex', () => {
    expect(resolve({ project_id: 'p3' }).color).toBe(nearestSwatch('#B5654A').value) // terracotta
    expect(resolve({ area_id: 'a2' }).color).toBe(nearestSwatch('#7a4a52').value) // plum
    for (const [token, hex] of Object.entries(TOKEN_HEX)) expect(placeSwatch(token)).toBe(nearestSwatch(hex).value)
  })
  it('palette C\'s own values are themselves', () => {
    for (const s of BLOCK_SWATCHES) expect(placeSwatch(s.value)).toBe(s.value)
  })
  it('an own legacy colour is its new swatch too', () => {
    expect(resolve({ color: '#a8a0be' }).color).toBe(IRIS)
  })
  it('something unreadable is no colour', () => {
    expect(placeSwatch('var(--nope)')).toBeNull()
    expect(placeSwatch(null)).toBeNull()
  })
})
