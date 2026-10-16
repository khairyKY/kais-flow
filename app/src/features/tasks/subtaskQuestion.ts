import { create } from 'zustand'
import type { Task } from '../../lib/types'

// 4 C (Kai 2026-10-16): a parent ticked while subtasks are still open asks "Tick them too" / "Leave
// them open". The parent is done at once; the answer decides what happens to its subtasks and the
// toast (tasks/api completeTaskWithUndo). ./SubtaskAsk.tsx draws the question (AppLayout).

export interface SubtaskQuestion {
  parent: Task
  open: Task[]
  /** Runs once: true = tick them too. Esc, a click away, a new question = leave them open. */
  answer: (tick: boolean) => void
}

export const useSubtaskAsk = create<{ ask: SubtaskQuestion | null }>(() => ({ ask: null }))

export function askSubtasks(parent: Task, open: Task[], answer: (tick: boolean) => void): void {
  answerSubtasks(false) // a question still up when another task is ticked: its subtasks stay open
  let settled = false
  useSubtaskAsk.setState({
    ask: {
      parent,
      open,
      answer: (tick) => {
        if (settled) return
        settled = true
        useSubtaskAsk.setState({ ask: null })
        answer(tick)
      },
    },
  })
}

/** Answers the question that's up, if any. */
export const answerSubtasks = (tick: boolean): void => useSubtaskAsk.getState().ask?.answer(tick)
