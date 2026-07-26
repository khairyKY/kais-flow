import { describe, expect, it } from 'vitest'
import { toastAction, toastUndo } from './undo'
import { useToastStore } from './toastStore'

describe('undo helpers', () => {
  it('toastUndo pushes a toast whose onUndo runs the undo fn', async () => {
    let undone = false
    toastUndo('Done', () => {
      undone = true
    })
    const toast = useToastStore.getState().toasts.at(-1)!
    expect(toast.message).toBe('Done')
    toast.onUndo!()
    await Promise.resolve()
    expect(undone).toBe(true)
  })

  it('a rejecting undo surfaces a follow-up toast instead of throwing', async () => {
    toastUndo('Filed', () => Promise.reject(new Error('nope')))
    useToastStore.getState().toasts.at(-1)!.onUndo!()
    await new Promise((r) => setTimeout(r, 0))
    expect(useToastStore.getState().toasts.at(-1)!.message).toContain('undo slipped away')
  })

  it('toastAction carries a labeled action', () => {
    let ran = false
    toastAction('Restored to Tasks', 'Jump there →', () => {
      ran = true
    })
    const toast = useToastStore.getState().toasts.at(-1)!
    expect(toast.action!.label).toBe('Jump there →')
    toast.action!.run()
    expect(ran).toBe(true)
  })
})
