import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { deleteEventsForTask } from '../calendar/api'
import { nextOccurrence } from './recurrence'
import type { Task } from '../../lib/types'

const MAX_TOP3 = 3

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').order('due_at', { nullsFirst: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

export interface CreateTaskInput {
  title: string
  domainId?: string | null
  projectId?: string | null
  dueAt?: string | null
  reminderOffsetMin?: number | null
}

export function createTask(input: CreateTaskInput): Task {
  const base = input.dueAt || input.reminderOffsetMin ? (input.dueAt ?? null) : null
  const reminderAt = base && input.reminderOffsetMin
    ? new Date(new Date(base).getTime() - input.reminderOffsetMin * 60 * 1000).toISOString()
    : null
  const task: Task = {
    id: crypto.randomUUID(),
    project_id: input.projectId ?? null,
    domain_id: input.domainId ?? null,
    title: input.title,
    notes: null,
    status: 'todo',
    due_at: input.dueAt ?? null,
    scheduled_start: null,
    scheduled_end: null,
    top3: false,
    snoozed_until: null,
    recurrence_rule: null,
    labels: [],
    priority: null,
    area_id: null,
    reminder_at: reminderAt,
    reminder_sent: false,
    completed_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('tasks', task)
  logActivity('task.created', 'task', task.id, { title: input.title })
  return task
}

/** Completing a recurring task materializes its next occurrence as a fresh task. */
export function completeTask(task: Task): void {
  writeRow('tasks', { ...task, status: 'done', completed_at: nowIso(), top3: false })
  logActivity('task.completed', 'task', task.id, {})

  if (task.recurrence_rule && task.due_at) {
    const next = nextOccurrence(task.recurrence_rule, new Date(task.due_at))
    if (next) {
      const nextTask: Task = {
        ...task,
        id: crypto.randomUUID(),
        status: 'todo',
        completed_at: null,
        due_at: next.toISOString(),
        scheduled_start: null,
        scheduled_end: null,
        top3: false,
        created_at: nowIso(),
        updated_at: nowIso(),
      }
      writeRow('tasks', nextTask)
      logActivity('task.created', 'task', nextTask.id, { recurrence_parent: task.id })
    }
  }
}

export function uncompleteTask(task: Task): void {
  writeRow('tasks', { ...task, status: 'todo', completed_at: null })
  logActivity('task.reopened', 'task', task.id, {})
}

/** Deletes the task and any calendar block scheduled for it (caller should confirm first). */
export function deleteTask(task: Task): void {
  deleteEventsForTask(task.id)
  writeRow('tasks', task, 'delete')
  logActivity('task.deleted', 'task', task.id, {})
}

export function snoozeTask(task: Task, until: string): void {
  writeRow('tasks', { ...task, snoozed_until: until })
  logActivity('task.snoozed', 'task', task.id, { until })
}

export function setLabels(task: Task, labels: string[]): void {
  writeRow('tasks', { ...task, labels })
}

export function setPriority(task: Task, priority: number | null): void {
  writeRow('tasks', { ...task, priority })
}

/** Client-enforced cap of 3 — no DB constraint, since that would fight the offline outbox. */
export function toggleTop3(task: Task): void {
  if (!task.top3) {
    const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
    const currentTop3Count = tasks.filter((t) => t.top3 && t.id !== task.id).length
    if (currentTop3Count >= MAX_TOP3) return
  }
  writeRow('tasks', { ...task, top3: !task.top3 })
  logActivity(task.top3 ? 'task.unstarred' : 'task.starred', 'task', task.id, {})
}

export function renameTask(task: Task, title: string): void {
  writeRow('tasks', { ...task, title })
}

export function rescheduleDue(task: Task, dueAt: string | null): void {
  writeRow('tasks', { ...task, due_at: dueAt })
  logActivity('task.rescheduled', 'task', task.id, { due_at: dueAt })
}

export function setRecurrence(task: Task, rule: string | null): void {
  writeRow('tasks', { ...task, recurrence_rule: rule })
  logActivity('task.recurrence_set', 'task', task.id, { rule })
}

export function setReminder(task: Task, reminderAt: string | null): void {
  writeRow('tasks', { ...task, reminder_at: reminderAt, reminder_sent: false })
  logActivity('task.reminder_set', 'task', task.id, { reminder_at: reminderAt })
}
