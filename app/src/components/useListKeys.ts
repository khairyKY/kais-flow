import { useEffect, useState } from 'react'
import { usePageShortcutsStore } from '../lib/pageShortcutsStore'

export interface ListBinding<T> {
  keys: string[]
  label: string
  run: (item: T) => void
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

interface UseListKeysOptions {
  /** DOM id prefix for rows (`id="{idPrefix}{item.id}"`) — used to move real focus, not just a CSS ring. */
  idPrefix?: string
  /** Pause all key handling (e.g. while a snooze/project popover opened from this list is open). */
  active?: boolean
  /** Registers `bindings` under this label in `pageShortcutsStore`, for the `?` cheatsheet. Omit to stay unlisted. */
  sectionLabel?: string
  /** Ctrl/Cmd+A selects all `items` (bulk-selection pages only). Omit to leave the browser's native select-all alone. */
  onSelectAll?: () => void
}

/** Roving-focus keyboard nav shared by Tasks smart lists, Today, and Inbox: ↑/↓ or j/k move
 * a real (tabIndex-driven) focus ring over `items`, other keys dispatch through `bindings`. */
export function useListKeys<T extends { id: string }>(
  items: T[],
  bindings: ListBinding<T>[],
  { idPrefix = 'task-', active = true, sectionLabel, onSelectAll }: UseListKeysOptions = {},
) {
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    if (focusedId && !items.some((i) => i.id === focusedId)) setFocusedId(null)
  }, [items, focusedId])

  useEffect(() => {
    if (!focusedId) return
    document.getElementById(`${idPrefix}${focusedId}`)?.focus({ preventScroll: true })
  }, [focusedId, idPrefix])

  useEffect(() => {
    if (!sectionLabel) return
    usePageShortcutsStore.getState().set(sectionLabel, bindings.map(({ keys, label }) => ({ keys, label })))
    return () => usePageShortcutsStore.getState().clear()
  }, [sectionLabel, bindings])

  useEffect(() => {
    if (!active) return
    function onKeydown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (!onSelectAll) return
        e.preventDefault()
        onSelectAll()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (items.length === 0) return
      const idx = items.findIndex((i) => i.id === focusedId)

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setFocusedId(items[Math.min(items.length - 1, idx + 1)].id)
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setFocusedId(items[Math.max(0, idx - 1)].id)
        return
      }

      const focused = items[idx]
      if (!focused) return
      const binding = bindings.find((b) => b.keys.includes(e.key))
      if (binding) {
        e.preventDefault()
        binding.run(focused)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [items, focusedId, bindings, active, onSelectAll])

  return { focusedId, setFocusedId }
}
