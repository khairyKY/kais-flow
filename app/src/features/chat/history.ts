import type { Citation } from '../../lib/types'
import type { ChatOutcome, ChatPlan } from './api'

// P7e A28 (Flow Audit J15): the chat keeps its conversation until you press Clear — on this device, per
// account, in localStorage. Sign-out forgets it (AuthProvider), like the query cache.

/** A plan's card (queue item 5): waiting for the OK, being changed, cancelled, running, or run. */
export type PlanState = 'pending' | 'editing' | 'cancelled' | 'running' | 'done'

export interface DisplayMessage {
  role: 'user' | 'assistant'
  /** What the model reads back (for a card: what was proposed, and what really happened). */
  content: string
  citations?: Citation[]
  plan?: ChatPlan & { state: PlanState }
  /** What each confirmed call really did. */
  outcomes?: ChatOutcome[]
  /** Its Undo ran. */
  undone?: boolean
}

const PREFIX = 'kf.chat.'
/** Kept on the device. ponytail: the oldest fall off past this; raise it if anyone scrolls that far back. */
export const KEEP = 100
/** Sent with each question: the chat function hands every message to the model, so a long conversation
 * would spend the day's allowance on old turns. The screen still shows everything kept. */
export const SEND = 20

export function loadChat(uid: string | undefined): DisplayMessage[] {
  if (!uid) return []
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFIX + uid) ?? '[]')
    // An answer cut off before its first word (the panel closed mid-reply) has nothing to show.
    if (!Array.isArray(raw)) return []
    return raw
      .filter((m): m is DisplayMessage => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content !== '')
      // A card closed while it ran can't say what happened: it says so, and is never offered again.
      .map((m) => (m.plan?.state === 'running' ? { ...m, plan: { ...m.plan, state: 'done' as const }, content: `${m.content}\n(The page closed while this ran — check before trying again.)` } : m))
  } catch {
    return []
  }
}

export function saveChat(uid: string | undefined, messages: readonly DisplayMessage[]): void {
  if (!uid) return
  try {
    if (messages.length) localStorage.setItem(PREFIX + uid, JSON.stringify(messages.slice(-KEEP)))
    else localStorage.removeItem(PREFIX + uid)
  } catch {
    /* storage full or blocked — the chat just won't outlive the page */
  }
}

/** Sign-out: this device forgets every account's chat. */
export function forgetChats(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    /* storage blocked — nothing was kept */
  }
}
