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
