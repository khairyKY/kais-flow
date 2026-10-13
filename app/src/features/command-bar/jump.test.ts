import { describe, expect, it } from 'vitest'
import { jumpTargets, matchJump } from './jump'

const targets = jumpTargets(
  [{ id: 'p1', name: 'Shaheen website' }, { id: 'p2', name: 'Forecasting App' }, { id: 'p3', name: 'Inbox zero' }],
  [{ id: 'a1', name: 'Shaheen' }, { id: 'a2', name: 'Health' }],
  ['calls', 'garden & yard'],
)
const to = (q: string) => matchJump(q, targets)?.to ?? null

describe('⌘K jump (P7e A9)', () => {
  it('still needs two characters, and views keep their place', () => {
    expect(to('t')).toBeNull()
    expect(to('in')).toBe('/inbox') // the view before the project "Inbox zero"
    expect(to('notebook')).toBe('/notebook')
  })

  it('jumps to projects, areas and labels', () => {
    expect(to('fore')).toBe('/projects/p2')
    expect(to('heal')).toBe('/projects/a2')
    expect(to('calls')).toBe('/tasks?list=all&label=calls')
    expect(to('garden')).toBe('/tasks?list=all&label=garden%20%26%20yard')
  })

  it('an exact name wins over a longer one that starts the same', () => {
    expect(to('Shaheen')).toBe('/projects/a1')
    expect(to('shaheen w')).toBe('/projects/p1')
  })

  it('matches a word inside a name', () => {
    expect(to('website')).toBe('/projects/p1')
    expect(to('zero')).toBe('/projects/p3')
  })

  it('says what kind of place it is', () => {
    expect(matchJump('fore', targets)?.kind).toBe('Project')
    expect(matchJump('inbox', targets)?.kind).toBeUndefined()
  })
})
