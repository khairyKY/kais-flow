import { useEffect, useState } from 'react'
import { usePageShortcutsStore } from '../lib/pageShortcutsStore'

export interface ListBinding<T> {
  keys: string[]
  label: string
  run: (item: T) => void
  /** With rows selected, the key acts on all of them (one Undo) instead of the focused row. */
  runAll?: (items: T[]) => void
  /** A page key (Tasks' ⇧F / ⇧S): runs with no row focused, even on an empty list. */
  page?: boolean
  /** Pressed with ⌘/Ctrl (⌘/Ctrl+D Duplicate): matches only then, and the bare key never matches it. */
  mod?: boolean
}

/** The binding a key press means. Letters match whatever the layout or Caps Lock make of them (Kai
 * 2026-10-12: T did nothing) — on an Arabic layout T arrives as key 'ف', code 'KeyT'. Shift + a letter
 * is its capital's binding when there is one (Tasks' ⇧F filter, ⇧S sort — P7e A18), else the letter's. */
export function bindingFor<T>(bindings: readonly ListBinding<T>[], e: Pick<KeyboardEvent, 'key' | 'code'> & { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): ListBinding<T> | undefined {
  // ⌘/Ctrl + a letter only ever means a `mod` binding (its capital: ['⌘/Ctrl', 'D']); a bare key never does.
  const mod = !!(e.ctrlKey || e.metaKey)
  const pool = bindings.filter((b) => !!b.mod === mod)
  const find = (k: string) => pool.find((b) => b.keys.includes(k))
  const latin = /^[a-z]$/i.test(e.key)
  const exact = latin ? undefined : find(e.key)
  if (exact) return exact
  const letter = latin ? e.key.toLowerCase() : /^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase()
  if (!letter) return undefined
  if (mod) return find(letter.toUpperCase())
  return (e.shiftKey ? find(letter.toUpperCase()) : undefined) ?? find(letter)
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

const NONE: never[] = []

type KeyLike =Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'>

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

interface UseListKeysOptions<T> {
  /** DOM id prefix for rows (`id="{idPrefix}{item.id}"`) — used to move real focus, not just a CSS ring. */
  idPrefix?: string
  /** Pause all key handling (e.g. while a snooze/project popover opened from this list is open). */
  active?: boolean
  /** Registers `bindings` under this label in `pageShortcutsStore`, for the `?` cheatsheet. Omit to stay unlisted. */
  sectionLabel?: string
  /** Ctrl/Cmd+A selects all `items` (bulk-selection pages only). Omit to leave the browser's native select-all alone. */
  onSelectAll?: () => void
  /** The rows selected right now: a key with a `runAll` acts on these. */
  selected?: T[]
  /** ⌘/Ctrl+↑/↓ (p7e A22): move the selection, else the focused row, one place up (-1) or down (+1). */
  reorder?: (rows: T[], dir: -1 | 1) => void
}

/** Roving-focus keyboard nav shared by Tasks smart lists, Today, and Inbox: ↑/↓ or j/k move
 * a real (tabIndex-driven) focus ring over `items`, other keys dispatch through `bindings`. */
export function useListKeys<T extends { id: string }>(
  items: T[],
  bindings: ListBinding<T>[],
  { idPrefix = 'task-', active = true, sectionLabel, onSelectAll, selected = NONE as T[], reorder }: UseListKeysOptions<T> = {},
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
      const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      if (reorder && dir && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const rows = selected.length > 0 ? selected : items.filter((i) => i.id === focusedId)
        if (rows.length === 0) return
        e.preventDefault()
        reorder(rows, dir)
        // The row's node moved in the list: keep the keyboard on it.
        if (focusedId) requestAnimationFrame(() => document.getElementById(`${idPrefix}${focusedId}`)?.focus())
        return
      }
      if (e.altKey || ((e.ctrlKey || e.metaKey) && !bindingFor(bindings, e))) return
      if (items.length === 0 && !bindingFor(bindings, e)?.page) return
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

      const binding = bindingFor(bindings, e)
      if (!binding) return
      // A selection made with the mouse leaves nothing focused — it's what the key is about.
      if (selected.length > 0 && binding.runAll) {
        e.preventDefault()
        binding.runAll(selected)
        return
      }
      const focused = items[idx]
      if (!focused && !binding.page) return
      e.preventDefault()
      binding.run(focused) // a page key ignores the row
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [items, focusedId, bindings, active, selected, reorder, idPrefix])

  return { focusedId, setFocusedId }
}
