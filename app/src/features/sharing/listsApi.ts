// Shared lists (migration 0102): what the app asks the server. A list is an ordinary project the server has marked shared in a
// connection; its items are ordinary tasks, so adding, editing and ticking go through the outbox like any task (offline too).
// Only sharing and stopping are online-only: they change two people at once, so the server answers.
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { flushOutbox } from '../../lib/outbox'
import { useToastStore } from '../../lib/toastStore'
import { completeTaskWithUndo, createTask, reopenTaskWithUndo } from '../tasks/api'
import type { Project, Task } from '../../lib/types'
import { shareProblem, type ShareStart } from './lists'
import type { Connection } from './model'

const refresh = () => {
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
}

/** Share a project of mine with a connection. The project must be on the server first (a brand new one waits in the outbox), so the
 * queue is flushed before the answer is asked; offline, this says so and the project stays private. */
export async function shareProject(project: Project, c: Pick<Connection, 'circle_id' | 'partner_name'>): Promise<boolean> {
  const push = useToastStore.getState().push
  if (!navigator.onLine) {
    push({ message: `Sharing needs a connection. ${project.name} is still only yours.` })
    return false
  }
  try {
    await flushOutbox()
    const { data, error } = await supabase.rpc('share_list_start', { p_project: project.id, p_circle: c.circle_id })
    if (error) throw error
    const r = data as ShareStart
    if (!r.ok) {
      push({ message: shareProblem(r, c.partner_name) })
      return false
    }
    refresh()
    push({ message: `${project.name} is shared with ${c.partner_name}. They’ll find it in their Projects.` })
    return true
  } catch {
    push({ message: `Couldn’t share ${project.name}. Check the connection and try again.` })
    return false
  }
}

/** "Stop sharing" (the owner) or "Leave this list" (the other person): the server gives the other person a copy and the owner keeps the original. */
export async function stopSharing(project: Project): Promise<{ ok: boolean; copyId?: string | null }> {
  const { data, error } = await supabase.rpc('share_list_stop', { p_project: project.id })
  if (error) throw error
  const r = data as { ok: boolean; copy_id?: string | null }
  refresh()
  return { ok: r.ok, copyId: r.copy_id }
}

/** One item added to a list (the field's Enter): an ordinary task in the project, off every Top 3 and every date. */
export function addListItem(project: Project, title: string): Task | null {
  const t = title.trim()
  if (!t) return null
  return createTask({ title: t, projectId: project.id })
}

/** A tick is "set to done", never "toggle": the row is written done (or open again) and the server keeps the first tick's credit.
 * The face on a row still waiting in the outbox is mine (no done_by yet). */
export function tickItem(task: Task, uid: string | undefined): void {
  if (task.status === 'done') {
    reopenTaskWithUndo(task)
    return
  }
  completeTaskWithUndo(task)
  queryClient.setQueryData<Task[]>(['tasks'], (old) => old?.map((r) => (r.id === task.id ? { ...r, done_by: uid ?? r.done_by } : r)))
}
