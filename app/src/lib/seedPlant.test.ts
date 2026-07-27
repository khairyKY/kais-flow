import { describe, expect, it } from 'vitest'
import { seedPlant } from './seedPlant'

// ponytail: the one check that matters here. seedPlant is decorative, but it is called from
// inside the submit handler of every create form — if it throws, it takes task/project/journal
// creation down with it. This suite runs in the node environment (the repo has no jsdom
// dependency and this pass isn't adding one), so what's pinned is the no-DOM guard: the
// helper must be a silent no-op rather than a ReferenceError.
// Not covered without a DOM: the seed node itself, its removal, and the drop/puff timings.

const rect = (width: number, height: number) =>
  ({ getBoundingClientRect: () => ({ left: 10, top: 20, bottom: 44, width, height }) }) as unknown as HTMLElement

describe('seedPlant', () => {
  it('is a silent no-op with no DOM, and for every argument shape', () => {
    for (const from of [null, undefined, rect(50, 24), rect(0, 0)]) {
      for (const motionOn of [true, false]) {
        expect(() => seedPlant(from, motionOn)).not.toThrow()
      }
    }
  })
})
