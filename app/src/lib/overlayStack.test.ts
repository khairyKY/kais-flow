import { describe, expect, it } from 'vitest'
import { closeTopOverlay, pushOverlay } from './overlayStack'
import { pageBack } from './androidBack'

describe('overlay stack (Escape + Android Back)', () => {
  it('closes overlays newest first, one per press', () => {
    const closed: string[] = []
    const off: Record<string, () => void> = {}
    for (const name of ['sheet', 'picker', 'menu']) {
      off[name] = pushOverlay(() => {
        closed.push(name)
        off[name]() // what the overlay's unmount does
      })
    }
    expect(closeTopOverlay()).toBe(true)
    expect(closeTopOverlay()).toBe(true)
    expect(closeTopOverlay()).toBe(true)
    expect(closed).toEqual(['menu', 'picker', 'sheet'])
    expect(closeTopOverlay()).toBe(false)
  })

  it('keeps the order when an overlay underneath closes on its own', () => {
    const closed: string[] = []
    const offSelection = pushOverlay(() => closed.push('selection'))
    const offSearch = pushOverlay(() => closed.push('search'))
    offSelection() // selection mode ended by tapping ✕, not by Back
    expect(closeTopOverlay()).toBe(true)
    offSearch()
    expect(closeTopOverlay()).toBe(false)
    expect(closed).toEqual(['search'])
  })

  it('leaves an overlay that refuses to close on top', () => {
    const closed: string[] = []
    const offBusy = pushOverlay(() => closed.push('busy'))
    closeTopOverlay()
    closeTopOverlay()
    expect(closed).toEqual(['busy', 'busy'])
    offBusy()
  })
})

describe('Android Back with no overlay open', () => {
  it('walks the app history first', () => {
    expect(pageBack('/today', 2)).toBe('history')
    expect(pageBack('/inbox', 1)).toBe('history')
  })
  it('goes to Today from any other first page', () => {
    expect(pageBack('/inbox', 0)).toBe('today')
    expect(pageBack('/projects/42', 0)).toBe('today')
  })
  it('leaves the app from Today, or from pages outside the signed-in shell', () => {
    expect(pageBack('/today', 0)).toBe('leave')
    expect(pageBack('/sign-in', 0)).toBe('leave')
  })
})
