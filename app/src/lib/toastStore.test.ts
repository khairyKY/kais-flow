import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOAST_LIFE_MS, lifeLeft, useToastStore, visibleToasts } from './toastStore'

const messages = () => visibleToasts(useToastStore.getState().toasts).map((t) => t.message)

describe('toast queue (MK Undo Toast)', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useRealTimers()
  })

  it('shows at most two, oldest above, newest at the bottom; a third waits', () => {
    const { push } = useToastStore.getState()
    push({ message: 'Moved to Tomorrow 09:00' })
    push({ message: 'Moved to Trash' })
    push({ message: 'Filed to Tasks' })
    expect(messages()).toEqual(['Moved to Tomorrow 09:00', 'Moved to Trash'])
  })

  it('a second action no longer wipes the first Undo, and the waiting one steps in when a slot frees', () => {
    const { push, dismiss } = useToastStore.getState()
    push({ message: 'A', onUndo: () => {} })
    push({ message: 'B', onUndo: () => {} })
    push({ message: 'C', onUndo: () => {} })
    const first = useToastStore.getState().toasts[0]
    expect(first.onUndo).toBeTypeOf('function')
    dismiss(first.id)
    expect(messages()).toEqual(['B', 'C'])
  })

  it('the store never expires a toast on its own — a queued toast cannot time out while it waits', () => {
    vi.useFakeTimers()
    useToastStore.getState().push({ message: 'waiting' })
    vi.advanceTimersByTime(TOAST_LIFE_MS * 3)
    expect(messages()).toEqual(['waiting'])
  })

  it('life pauses and resumes without losing or gaining time', () => {
    let left = TOAST_LIFE_MS
    left = lifeLeft(left, 1_000, 3_000) // ran 2s, then touched
    expect(left).toBe(4_000)
    left = lifeLeft(left, 50_000, 53_500) // released much later, ran 3.5s more
    expect(left).toBe(500)
    expect(lifeLeft(left, 0, 10_000)).toBe(0) // never negative
  })
})
