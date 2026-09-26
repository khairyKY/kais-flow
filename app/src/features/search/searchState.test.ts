import { describe, expect, it } from 'vitest'
import { IDLE, resultCountLine, searchReducer, SEARCH_RESTING, type SearchState } from './searchState'
import type { SearchHit } from '../../lib/types'

const hit = (id: string): SearchHit => ({ entity_type: 'task', entity_id: id, title: `basil ${id}`, snippet: null, score: 1 })

function run(...actions: Parameters<typeof searchReducer>[1][]): SearchState {
  return actions.reduce(searchReducer, IDLE)
}

describe('searchReducer', () => {
  it('an answer with no hits is "done", not "resting"', () => {
    const s = run({ type: 'start', query: 'basil' }, { type: 'answered', query: 'basil', results: [] })
    expect(s.status).toBe('done')
    expect(resultCountLine(s)).toBe("0 results for 'basil'")
  })

  it('a failed search is "resting" and claims no result count', () => {
    const s = run({ type: 'start', query: 'basil' }, { type: 'failed', query: 'basil' })
    expect(s.status).toBe('resting')
    expect(s.results).toEqual([])
    expect(resultCountLine(s)).toBe('')
  })

  it('a retry goes back to searching, and a later answer clears the resting state', () => {
    const s = run(
      { type: 'start', query: 'basil' },
      { type: 'failed', query: 'basil' },
      { type: 'start', query: 'basil' },
      { type: 'answered', query: 'basil', results: [hit('1')] },
    )
    expect(s.status).toBe('done')
    expect(resultCountLine(s)).toBe("1 result for 'basil'")
  })

  it("a slow answer for an older query doesn't land on the newer one", () => {
    const s = run(
      { type: 'start', query: 'bas' },
      { type: 'start', query: 'basil' },
      { type: 'answered', query: 'bas', results: [hit('old')] },
      { type: 'failed', query: 'bas' },
    )
    expect(s.status).toBe('searching')
    expect(s.query).toBe('basil')
  })

  it('an answer after the box was cleared is ignored', () => {
    const s = run({ type: 'start', query: 'basil' }, { type: 'clear' }, { type: 'answered', query: 'basil', results: [hit('1')] })
    expect(s).toEqual(IDLE)
  })

  it('keeps the previous hits on screen while the next query is on its way', () => {
    const s = run({ type: 'start', query: 'bas' }, { type: 'answered', query: 'bas', results: [hit('1')] }, { type: 'start', query: 'basil' })
    expect(s.status).toBe('searching')
    expect(s.results).toHaveLength(1)
    expect(resultCountLine(s)).toBe('searching…')
  })
})

describe('copy', () => {
  it('the resting line is calm and never says "error"', () => {
    expect(SEARCH_RESTING).toBe('Search is resting — try again in a moment.')
    expect(SEARCH_RESTING).not.toMatch(/error/i)
  })
})
