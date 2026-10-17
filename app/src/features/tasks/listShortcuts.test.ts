import { describe, expect, it, vi } from 'vitest'
import { bindingFor } from '../../components/useListKeys'
import type { Task } from '../../lib/types'
import { buildListBindings, LIST_SHORTCUTS, shortcutHint } from './listShortcuts'

// Overlays.dc.html "Label picker · keyboard L": L opens the picker on the focused row, and with a
// selection on all of it (like T) — useListKeys calls a binding's runAll when rows are selected.
describe('L — the Label picker key', () => {
  const one = vi.fn()
  const all = vi.fn()
  const bindings = buildListBindings({ labels: one }, { labels: all })

  it('is bound once a page wires it, on any layout (code KeyL), and says L in the menus', () => {
    const l = bindingFor(bindings, { key: 'l', code: 'KeyL' })
    expect(l?.label).toBe('Labels…')
    expect(bindingFor(bindings, { key: 'L', code: 'KeyL' })).toBe(l) // Shift / Caps Lock
    expect(bindingFor(bindings, { key: 'ل', code: 'KeyG' })).toBeUndefined() // Arabic layout: the L key is code KeyL, not this
    expect(shortcutHint('labels')).toBe('L')
  })

  it('with a selection it acts on every selected row, without one on the focused row', () => {
    const l = bindingFor(bindings, { key: 'l', code: 'KeyL' })!
    const a = { id: 'a' } as Task
    const b = { id: 'b' } as Task
    l.runAll?.([a, b])
    expect(all).toHaveBeenCalledWith([a, b])
    l.run(a)
    expect(one).toHaveBeenCalledWith(a)
  })

  it('a page that does not wire it gets no L (Today, Done)', () => {
    expect(buildListBindings({ top3: vi.fn() }).some((b) => b.keys.includes('l'))).toBe(false)
    expect(LIST_SHORTCUTS.filter((s) => s.keys.includes('l'))).toHaveLength(1)
  })
})

// P7e A18: the rest of the verbs on free keys — B3's letters (p, t, #, 1/2/3) stay as they are.
describe('the A18 keys', () => {
  const run = vi.fn()
  const bindings = buildListBindings({ someday: run, sort: run, filter: run, priority: run, duration: run, plan: run, goal: run, focus: run })
  const label = (e: { key: string; code: string; shiftKey?: boolean }) => bindingFor(bindings, e)?.label

  it('s is Someday, ⇧S Sort, on any layout; Caps Lock alone stays the letter', () => {
    expect(label({ key: 's', code: 'KeyS' })).toBe('Someday')
    expect(label({ key: 'S', code: 'KeyS', shiftKey: true })).toBe('Sort')
    expect(label({ key: 'س', code: 'KeyS', shiftKey: true })).toBe('Sort') // Arabic layout
    expect(label({ key: 'S', code: 'KeyS' })).toBe('Someday') // Caps Lock
    expect(label({ key: 'F', code: 'KeyF', shiftKey: true })).toBe('Filter by label')
    expect(label({ key: 'f', code: 'KeyF' })).toBe('Start focus')
  })

  it('! priority, = duration, d plan, h goal; ⇧F/⇧S need no focused row', () => {
    expect(label({ key: '!', code: 'Digit1', shiftKey: true })).toBe('Priority…')
    expect(label({ key: '=', code: 'Equal' })).toBe('Duration…')
    expect(label({ key: 'd', code: 'KeyD' })).toBe('Plan…')
    expect(label({ key: 'h', code: 'KeyH' })).toBe('Make goal of the day')
    expect(bindings.filter((b) => b.page).map((b) => b.label)).toEqual(['Filter by label', 'Sort'])
  })

  it('without an uppercase binding, Shift + a letter is still the letter (T, as before)', () => {
    expect(bindingFor(buildListBindings({ top3: run }), { key: 'T', code: 'KeyT', shiftKey: true })?.label).toBe('Toggle Top 3')
  })

  it('every key is bound once', () => {
    const keys = LIST_SHORTCUTS.flatMap((s) => s.keys).filter((k) => k !== '⇧')
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// Kai 2026-10-17: ⌘/Ctrl+D duplicates the focused row (or the selection); a bare D stays Plan….
describe('⌘/Ctrl+D — Duplicate', () => {
  const one = vi.fn()
  const all = vi.fn()
  const bindings = buildListBindings({ duplicate: one, plan: vi.fn() }, { duplicate: all })
  const label = (e: { key: string; code: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => bindingFor(bindings, e)?.label

  it('Ctrl+D and ⌘D are Duplicate, on any layout; D, ⇧D and Caps Lock D stay Plan…', () => {
    expect(label({ key: 'd', code: 'KeyD', ctrlKey: true })).toBe('Duplicate')
    expect(label({ key: 'd', code: 'KeyD', metaKey: true })).toBe('Duplicate')
    expect(label({ key: 'ي', code: 'KeyD', ctrlKey: true })).toBe('Duplicate') // Arabic layout
    expect(label({ key: 'd', code: 'KeyD' })).toBe('Plan…')
    expect(label({ key: 'D', code: 'KeyD', shiftKey: true })).toBe('Plan…')
    expect(label({ key: 'D', code: 'KeyD' })).toBe('Plan…')
  })

  it('no other key answers to Ctrl (Ctrl+P stays the browser\'s), and the menus say ⌃D', () => {
    expect(label({ key: 'p', code: 'KeyP', ctrlKey: true })).toBeUndefined()
    expect(bindingFor(buildListBindings({ project: vi.fn() }), { key: 'p', code: 'KeyP', ctrlKey: true })).toBeUndefined()
    expect(shortcutHint('duplicate')).toBe('⌃D')
    expect(LIST_SHORTCUTS.find((s) => s.action === 'duplicate')?.keys).toEqual(['⌘/Ctrl', 'D']) // the cheatsheet's row
  })

  it('with a selection it duplicates all of it, without one the focused row', () => {
    const b = bindingFor(bindings, { key: 'd', code: 'KeyD', ctrlKey: true })!
    const a = { id: 'a' } as Task
    b.runAll?.([a])
    expect(all).toHaveBeenCalledWith([a])
    b.run(a)
    expect(one).toHaveBeenCalledWith(a)
  })
})
