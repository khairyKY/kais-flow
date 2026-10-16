import { useEffect, useState } from 'react'
import type { Task } from '../../lib/types'
import { renameTask, setNotes as saveTaskNotes } from './api'
import { addTypedSubtask } from '../command-bar/quickAdd'

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
        renameTask(task, t)
        onSaved?.('title')
      } else setTitle(task.title)
    },
    saveNotes() {
      if (!task || (notes || null) === (task.notes || null)) return
      saveTaskNotes(task, notes || null)
      onSaved?.('notes')
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
