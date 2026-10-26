import { useEffect, useState } from 'react'
import type { Task } from '../../lib/types'
import { renameTask, setNotes as saveTaskNotes } from './api'
import { addTypedSubtask } from '../command-bar/quickAdd'
import { editTask } from '../calendar/scoped'

export type DraftField = 'title' | 'notes' | 'subtasks'

/** The task editor's typed fields — title, notes, the new-subtask line — and their commits, shared by
 * the desktop page (/tasks/:id) and the phone task sheet. A commit writes only a real change and
 * reports it through `onSaved` (the sheet's "Saved" flicker). Subtasks are one level deep: callers
 * hide the line on a task that is itself a child. */
export function useTaskDraft(task: Task | undefined, onSaved?: (field: DraftField) => void) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [subtask, setSubtask] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNotes(task.notes ?? '')
    }
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    title,
    setTitle,
    notes,
    setNotes,
    subtask,
    setSubtask,
    saveTitle() {
      if (!task) return
      const t = title.trim()
      if (t && t !== task.title) {
        // cal-clicks: a repeating task asks This one / Following / All; cancelled, the title goes back.
        void editTask(task, () => ({ title: t }), `Renamed · ${t}`, () => renameTask(task, t)).then((ok) => (ok ? onSaved?.('title') : setTitle(task.title)))
      } else setTitle(task.title)
    },
    saveNotes() {
      if (!task || (notes || null) === (task.notes || null)) return
      const next = notes || null
      void editTask(task, () => ({ notes: next }), 'Notes saved', () => saveTaskNotes(task, next)).then((ok) => (ok ? onSaved?.('notes') : setNotes(task.notes ?? '')))
    },
    // Subtasks C (Kai 2026-10-16): the line goes through the one capture parse — "at 6pm" gives the
    // subtask its own time, on the calendar (command-bar/quickAdd addTypedSubtask).
    addSubtask() {
      if (!task || !addTypedSubtask(task, subtask)) return
      setSubtask('')
      onSaved?.('subtasks')
    },
  }
}
