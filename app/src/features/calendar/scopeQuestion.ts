import { create } from 'zustand'
import type { Scope } from './scope'

// cal-clicks (Kai 2026-10-26, Google Calendar): a change to a repeating event — or a repeating task's round — asks
// "This event · This and following events · All events" ("This one · This and following · All" for a task) before
// anything is written. ./ScopeAsk.tsx draws it (AppLayout): a small dialog by the block on a computer, an action
// sheet on a phone. Esc / Cancel / a click away = nothing changes (a drag goes back). Questions queue: closing the
// task popover saves its title and its notes, and each asks in turn.

export interface ScopeQuestion {
  kind: 'event' | 'task'
  /** "Edit", "Move", "Resize", "Delete", "Duplicate", "Complete" — the heading's verb. */
  verb: string
  title: string
  /** The calendar block it's about (its `data-kf-id`), for the dialog to sit by. */
  blockId?: string
  /** Duplicate copies just this occurrence unless the person says otherwise — every question defaults to the first. */
  answer: (scope: Scope | null) => void
}

export const useScopeAsk = create<{ queue: ScopeQuestion[] }>(() => ({ queue: [] }))

/** The words of each answer. */
export function scopeLabels(kind: ScopeQuestion['kind']): Record<Scope, string> {
  return kind === 'event'
    ? { this: 'This event', following: 'This and following events', all: 'All events' }
    : { this: 'This one', following: 'This and following', all: 'All' }
}

/** "Edit repeating event", "Delete repeating task". */
export const scopeHeading = (q: Pick<ScopeQuestion, 'kind' | 'verb'>): string => `${q.verb} repeating ${q.kind}`

/** The toast's tail for an answer: "· this event", "· this and following", "· all events". */
export function scopeSuffix(kind: ScopeQuestion['kind'], scope: Scope): string {
  return scope === 'this' ? (kind === 'event' ? 'this event' : 'this one') : scope === 'following' ? 'this and following' : kind === 'event' ? 'all events' : 'all of them'
}

/** Asks; resolves with the answer, or null (Esc, Cancel, a click away). */
export function askScope(q: Omit<ScopeQuestion, 'answer'>): Promise<Scope | null> {
  return new Promise((resolve) => {
    let settled = false
    const item: ScopeQuestion = {
      ...q,
      answer: (scope) => {
        if (settled) return
        settled = true
        useScopeAsk.setState((s) => ({ queue: s.queue.filter((x) => x !== item) }))
        resolve(scope)
      },
    }
    useScopeAsk.setState((s) => ({ queue: [...s.queue, item] }))
  })
}

/** Answers the question that's up (tests, a harness). */
export const answerScope = (scope: Scope | null): void => useScopeAsk.getState().queue[0]?.answer(scope)
