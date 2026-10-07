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

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'>

/** Ctrl/Cmd+A meant for a task list (Kai 2026-10-07: "Ctrl+A isn't working for tasks"):
 * - a field with text in it keeps the browser's own select-all;
 * - an EMPTY field on the page itself has nothing to select, so the list gets it — the quick add
 *   keeps focus after Enter, which used to swallow every Ctrl+A on the Tasks page. A field in an
 *   overlay (command bar, a picker's search) never hands it to the list behind;
 * - layout-proof: on an Arabic (or any non-Latin) layout Ctrl+A arrives as key 'ش', code 'KeyA'. */
export function isSelectAllKey(e: KeyLike): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false
  const isA = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() === 'a' : e.code === 'KeyA'
  if (!isA || !isTypingTarget(e.target)) return isA
  const el = e.target as HTMLInputElement
  if (el.closest?.('.kf-overlay-card, [role="dialog"], [role="menu"]')) return false
  return (typeof el.value === 'string' ? el.value : (el.textContent ?? '')) === ''
}

/** Ctrl/Cmd+A → `onSelectAll` on any page with a selectable task list (Tasks, Today, Inbox through
 * useListKeys; project and area pages and the Planning board directly). Esc stays each page's own
 * useEscapeStack. Without `onSelectAll` the browser's select-all is left alone. */
export function useSelectAllKey(onSelectAll: (() => void) | undefined, active = true): void {
  useEffect(() => {
    if (!active || !onSelectAll) return
    function onKeydown(e: KeyboardEvent) {
      if (!isSelectAllKey(e)) return
      e.preventDefault()
      onSelectAll!()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [onSelectAll, active])
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

  useSelectAllKey(onSelectAll, active)

  useEffect(() => {
    if (!active) return
    function onKeydown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
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
  }, [items, focusedId, bindings, active])

  return { focusedId, setFocusedId }
}
