import { useToastStore } from './toastStore'

// Foundation F1 (punch item 6): the ONE way to toast a completing/destructive
// action. Pattern for every call site:
//   1. capture the prior state BEFORE the write (the row/fields you're changing)
//   2. perform the write through the feature's api.ts as usual
//   3. toastUndo('Filed to Tasks · Today', () => writeBack(prior))
// The undo fn must route through the same api/outbox path as the original write
// so offline + reapply semantics hold. Never push a bare toast for an undoable
// action; never build a second undo mechanism.
export function toastUndo(message: string, undo: () => void | Promise<void>) {
  useToastStore.getState().push({
    message,
    onUndo: () => {
      void Promise.resolve()
        .then(undo)
        .catch(() => useToastStore.getState().push({ message: 'That undo slipped away — check the item.' }))
    },
  })
}

// Non-undo action toasts, e.g. toastAction('Restored to Tasks', 'Jump there →', () => navigate('/tasks'))
export function toastAction(message: string, label: string, run: () => void) {
  useToastStore.getState().push({ message, action: { label, run } })
}
