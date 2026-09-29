import { useEffect, useState } from 'react'
import { writeRow } from '../../lib/outbox'
import type { Task } from '../../lib/types'
import { createTask, renameTask } from './api'

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
      writeRow('tasks', { ...task, notes: notes || null })
      onSaved?.('notes')
    },
    addSubtask() {
      const t = subtask.trim()
      if (!task || !t) return
      createTask({ title: t, parentTaskId: task.id, projectId: task.project_id, domainId: task.domain_id })
      setSubtask('')
      onSaved?.('subtasks')
    },
  }
}
