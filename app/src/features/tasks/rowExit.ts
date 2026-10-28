import { useEffect } from 'react'
import { animateRowRemoval, cancelRowRemoval } from '../../lib/motion'
import type { Task } from '../../lib/types'
import { releaseTop3 } from './top3Rule'

// T6 (2026-10-28) — "leaves this list" exits. Tomorrow, Plan, Someday, Snooze and Move write straight
// to the data, and the row used to vanish in one frame. The list on screen says which rows it would
// still show (useListShows); a change that takes a row OUT of it plays the shared exit (slide,
// collapse) first and writes after, as Delete already does. A row the list keeps (Tomorrow on All)
// is written at once and doesn't move. If a guess is wrong and an exited row is still there after
// the write, it eases back (cancelRowRemoval), so a row can never be left folded to nothing.

type Shows = (t: Task) => boolean
let shows: Shows | null = null

/** The page on screen registers what its list shows (Tasks, Today, Project detail). */
export function useListShows(fn: Shows): void {
  useEffect(() => {
    shows = fn
    return () => {
      if (shows === fn) shows = null
    }
  })
}

/** The rows `change` takes out of a list that `show`s them — with the Top 3 place a write gives up
 * as it lands (releaseTop3, applied by every writer). Pure. */
export function leavingRows(tasks: readonly Task[], change: (t: Task) => Task, show: Shows | null, now = new Date()): Task[] {
  return show ? tasks.filter((t) => show(t) && !show(releaseTop3(change(t), now))) : []
}

/** Plays the exit on the rows `change` takes out of the list on screen, then runs `write` (at once
 * when none leave, or nothing's on screen, or under reduced motion — animateRowRemoval's rule). */
export function exitThenWrite(tasks: readonly Task[], change: (t: Task) => Task, write: () => void): void {
  const els = leavingRows(tasks, change, shows)
    .map((t) => document.getElementById(`task-${t.id}`))
    .filter((el): el is HTMLElement => !!el)
  if (els.length === 0) return write()
  let left = els.length
  for (const el of els)
    animateRowRemoval(el, () => {
      if (--left > 0) return
      write()
      // The safety net: a row the write kept (a wrong guess) comes back instead of staying folded.
      requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((e) => e.isConnected && cancelRowRemoval(e))))
    })
}
