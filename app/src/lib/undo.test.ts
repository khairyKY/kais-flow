import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearUndoHistory, isLoud, redoLatest, toastAction, toastUndo, undoLatest } from './undo'
import { noteWrite, registerWriter } from './writeTape'
import { useToastStore } from './toastStore'

describe('undo helpers', () => {
  beforeEach(() => {
    clearUndoHistory()
    useToastStore.setState({ toasts: [] })
  })
  it('toastUndo pushes a toast whose onUndo runs the undo fn', async () => {
    let undone = false
    toastUndo('Filed', () => {
      undone = true
    })
    const toast = useToastStore.getState().toasts.at(-1)!
    expect(toast.message).toBe('Filed')
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

  it('undoLatest runs the newest Undo once, skipping toasts without one', async () => {
    useToastStore.setState({ toasts: [] })
    const ran: string[] = []
    toastUndo('first', () => void ran.push('first'))
    toastUndo('second', () => void ran.push('second'))
    toastAction('Restored', 'Jump there →', () => {})
    expect(undoLatest()).toBe(true)
    await Promise.resolve()
    expect(ran).toEqual(['second'])
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['first', 'Restored'])
    expect(undoLatest()).toBe(true)
    expect(undoLatest()).toBe(false)
    await Promise.resolve()
    expect(ran).toEqual(['second', 'first'])
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

// ── Quiet undo: one app-wide history ─────────────────────────────────────────────────────────────

describe('one global history', () => {
  // A two-table fake store standing in for the query cache: write() notes the prior row as writeRow does.
  const db: Record<string, Record<string, { id: string; v: string }>> = { tasks: {}, calendar_events: {} }
  const write = (table: string, row: { id: string; v?: string }, op: 'upsert' | 'delete' = 'upsert') => {
    noteWrite(table, row, op, db[table][row.id])
    if (op === 'delete') delete db[table][row.id]
    else db[table][row.id] = row as { id: string; v: string }
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))
  beforeEach(() => {
    clearUndoHistory()
    useToastStore.setState({ toasts: [] })
    db.tasks = { t1: { id: 't1', v: 'a' } }
    db.calendar_events = { e1: { id: 'e1', v: 'a' } }
    registerWriter(write)
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), clear: () => m.clear() })
  })
  const edit = (table: string, id: string, v: string, label = 'Moved to Fri') => {
    const prior = db[table][id]
    write(table, { id, v })
    toastUndo(label, () => write(table, prior))
  }

  it('routine edits make no toast but are undoable, newest first, from anywhere', async () => {
    localStorage.setItem('kf_undo_hints', '9')
    edit('calendar_events', 'e1', 'b')
    edit('tasks', 't1', 'b', 'Planned · Today') // another page, same history
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(undoLatest()).toBe(true)
    await settle()
    expect(db.tasks.t1.v).toBe('a')
    expect(db.calendar_events.e1.v).toBe('b')
    expect(undoLatest()).toBe(true)
    await settle()
    expect(db.calendar_events.e1.v).toBe('a')
    expect(undoLatest()).toBe(false)
  })

  it('redo replays an undo, and undo works again after the redo', async () => {
    localStorage.setItem('kf_undo_hints', '9')
    edit('tasks', 't1', 'b')
    undoLatest()
    await settle()
    expect(db.tasks.t1.v).toBe('a')
    expect(redoLatest()).toBe(true)
    await settle()
    expect(db.tasks.t1.v).toBe('b')
    expect(undoLatest()).toBe(true)
    await settle()
    expect(db.tasks.t1.v).toBe('a')
    expect(redoLatest()).toBe(true)
    await settle()
    expect(db.tasks.t1.v).toBe('b')
    expect(redoLatest()).toBe(false)
  })

  it('a new action clears redo; an action made by an undo is not a new entry', async () => {
    localStorage.setItem('kf_undo_hints', '9')
    edit('tasks', 't1', 'b')
    undoLatest()
    await settle()
    edit('tasks', 't1', 'c')
    expect(redoLatest()).toBe(false)
    const nested = () => {
      toastUndo('Moved inner', () => {}) // fired from inside an undo: ignored
      write('tasks', { id: 't1', v: 'a' })
    }
    toastUndo('Moved outer', nested)
    undoLatest()
    await settle()
    expect(undoLatest()).toBe(true) // the 'c' edit
    await settle()
    expect(db.tasks.t1.v).toBe('a')
    expect(undoLatest()).toBe(false) // 'Moved inner' never became an entry
  })

  it('delete is loud: it toasts, and the toast Undo and Ctrl+Z are the same single entry', async () => {
    edit('tasks', 't1', 'b', 'Deleted · Water plants')
    const toast = useToastStore.getState().toasts.at(-1)!
    expect(toast.message).toBe('Deleted · Water plants')
    toast.onUndo!()
    await settle()
    expect(db.tasks.t1.v).toBe('a')
    expect(undoLatest()).toBe(false)
  })

  it('"All" brings every toast back; "Fewer" shows the hint only three times', () => {
    edit('tasks', 't1', 'b')
    edit('tasks', 't1', 'c')
    edit('tasks', 't1', 'd')
    edit('tasks', 't1', 'e')
    expect(useToastStore.getState().toasts).toHaveLength(3) // three hints, then silence
    useToastStore.setState({ toasts: [] })
    localStorage.setItem('kf_undo_toasts', 'all')
    edit('tasks', 't1', 'f')
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Moved to Fri'])
  })

  it('classifies: routine edits quiet; delete, trash, bulk, series scope, AI loud', () => {
    for (const m of ['Moved to 16:15', 'Resized to 15:00–16:15', 'Planned · Today', 'Done', 'Reopened', 'Snoozed until Mon 9 AM', 'Renamed to “X”', 'Out of the slot · Call', 'Added “urgent”']) expect(isLoud(m), m).toBe(false)
    for (const m of ['Deleted · Call', 'Moved to Trash', '3 tasks moved', '2 blocks moved', 'Removed · 4 blocks', 'Moved to 10:00 · this and following', 'Resized · all events', '✦ Filed by AI: “x”', 'Something unfamiliar']) expect(isLoud(m), m).toBe(true)
  })
})
