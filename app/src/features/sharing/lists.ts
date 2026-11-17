// Shared lists (v1.6.6, partner sharing P2; migration 0102): the words and the small rules the screens use, pure so they are tested.
// The server owns every rule that protects data (who may write, Private, the tick credit, the copies on leaving); this file only
// decides what to SHOW: which project is shared, who a row's face is, and the lines of the design (design-export/Partner sharing P2 flows.html, flow 3).
import type { Project, Task } from '../../lib/types'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { Connection } from './model'

/** A project shared in a connection (set by the server only). */
export const isSharedList = (p: Pick<Project, 'shared_circle_id'> | null | undefined): boolean => !!p?.shared_circle_id

/** The connection a shared project belongs to (null when the connection is not loaded yet, or the project is not shared). */
export const listConnection = (p: Pick<Project, 'shared_circle_id'>, people: readonly Connection[]): Connection | null =>
  p.shared_circle_id ? (people.find((c) => c.circle_id === p.shared_circle_id) ?? null) : null

/** True when the list is the other person's (they own the project; I may add, edit and tick). */
export const isTheirs = (p: Pick<Project, 'user_id'>, uid: string | undefined): boolean => !!p.user_id && !!uid && p.user_id !== uid

/** The list's live items (no subtasks of a task outside it, nothing in Trash), in the order they were added. */
export function listItems(tasks: readonly Task[], projectId: string): Task[] {
  return tasks
    .filter((t) => t.project_id === projectId && !t.deleted_at && t.status !== 'cancelled' && !t.parent_task_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** "To buy" (open, in the order added) and "Got" (done, the latest tick first). */
export function splitItems(items: readonly Task[]): { toBuy: Task[]; got: Task[] } {
  return {
    toBuy: items.filter((t) => t.status === 'todo'),
    got: items.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
  }
}

/** Whose face a row wears. `by` is the id the server recorded; an item still waiting in my outbox has none yet and is mine. */
export function faceOf(by: string | null | undefined, uid: string | undefined, partner: Pick<Connection, 'partner_id' | 'partner_name'> | null): { name: string; mine: boolean } {
  if (!by || by === uid) return { name: 'You', mine: true }
  if (partner && by === partner.partner_id) return { name: partner.partner_name, mine: false }
  return { name: 'Someone', mine: false }
}

/** The mark on a ticked row: "6:12 PM" today, the weekday inside the week, else the date. */
export function tickWhen(iso: string | null | undefined, now: Date, zone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (zoneDateKey(d, zone) === zoneDateKey(now, zone)) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })
  const days = (now.getTime() - d.getTime()) / 86_400_000
  if (days >= 0 && days < 6) return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: zone })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: zone })
}

/** "5 to buy" on a list's row; "All got" when nothing is left; "Empty" before anything is added. */
export function leftLine(items: readonly Task[]): string {
  const open = items.filter((t) => t.status === 'todo').length
  if (open) return `${open} to buy`
  return items.length ? 'All got' : 'Empty'
}

/** The line under a shared list's title. */
export const sharedLine = (name: string): string => `Shared with ${name} · either of you adds and ticks`

/** The Private switch inside a shared list: off, and says why (design edge case "A Private item inside a shared list"). */
export const PRIVATE_IN_LIST = 'Not in a shared list'
export const PRIVATE_IN_LIST_HELP = 'Everything in a shared list is shared. To keep this one to yourself, move it out first.'

/** What the server answers to "share this project": the messages for each refusal. */
export type ShareStart = { ok: true } | { ok: false; error: 'not_yours' | 'not_connected' | 'private_items'; count?: number }
export function shareProblem(r: Extract<ShareStart, { ok: false }>, name: string): string {
  if (r.error === 'private_items') return `${r.count === 1 ? '1 item is' : `${r.count ?? 'Some'} items are`} Private. Move ${r.count === 1 ? 'it' : 'them'} out of the project first, then share it with ${name}.`
  if (r.error === 'not_connected') return `You are not connected to ${name} any more.`
  return 'Only the person who made the project can share it.'
}

/** The confirm sheet's lines for leaving a list or stopping sharing it (each keeps a copy: picked 3b). */
export function stopCopy(theirs: boolean, name: string, list: string): { title: string; body: string; action: string; done: string } {
  return theirs
    ? { title: `Leave ${list}?`, body: `You keep a copy of ${list} with every item in it. ${name} keeps theirs. Ticks on one no longer reach the other.`, action: 'Leave this list', done: `You left ${list}. You keep your own copy.` }
    : { title: `Stop sharing ${list}?`, body: `${name} keeps a copy of ${list} with every item in it, and you keep yours. Ticks on one no longer reach the other.`, action: 'Stop sharing', done: `${list} is only yours now. ${name} keeps a copy.` }
}
