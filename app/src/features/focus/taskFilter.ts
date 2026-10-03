import type { Task } from '../../lib/types'

/** The tasks the Focus picker offers for `query`: open ones whose title holds every typed word
 * (any order, any case), in the order given. */
export function filterFocusTasks<T extends Pick<Task, 'title' | 'status'>>(tasks: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tasks.filter((t) => t.status === 'todo' && words.every((w) => t.title.toLowerCase().includes(w)))
}
