import { blockIfTimed, enrichTypedTask } from '../capture/api'
import { createTask, toastAdded } from '../tasks/api'
import type { Task } from '../../lib/types'
import { quickAddTask, type ParsedCommand } from './parseCommand'

/** The one capture rule for a typed task (Kai 2026-10-12: "Enter = the one capture path"; the command
 * bar's Enter and the Tasks page's quick add): the instant local parse lands it now — on the calendar
 * too when a time was typed — a toast names where it went, and the AI's read fills what the tokens
 * left empty, after (capture/api enrichTypedTask). `place` names its project / area / domain for the
 * toast; `fallbackDue` dates a line that named no day (Tasks' Today tab). */
export function addTypedTask(parsed: ParsedCommand, typed: string, place: string | null, fallbackDue: string | null = null): Task {
  const input = quickAddTask(parsed, typed)
  const task = createTask({ ...input, dueAt: input.dueAt ?? fallbackDue })
  blockIfTimed(task, parsed.dueTimed)
  toastAdded(task, place)
  void enrichTypedTask(task, typed)
  return task
}
