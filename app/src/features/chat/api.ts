import { supabase } from '../../lib/supabase'
import { hour24 } from '../../lib/clock'
import type { ChatMessage, Citation } from '../../lib/types'
import { isDailyLimitResponse } from '../capture/aiAllowance'

/** A tool call the chat function runs as the user (the MCP server's tools — supabase/functions/chat). */
export interface ChatCall {
  tool: string
  args: Record<string, unknown>
}

/** A plan to confirm: the calls, and what each tool answered in the dry run (nothing written yet). */
export interface ChatPlan {
  calls: ChatCall[]
  previews: Record<string, unknown>[]
}

/** One call's real result: the tool's answer or its refusal, and the call that takes it back, if any. */
export interface ChatOutcome extends ChatCall {
  ok: boolean
  output?: Record<string, unknown>
  error?: string
  undo?: ChatCall | null
}

export interface StreamChatHandlers {
  onDelta: (delta: string) => void
  /** `plan`: the answer is a card to confirm (queue item 5) — nothing has changed yet. */
  onDone: (citations: Citation[], plan?: ChatPlan) => void
  /** `reason` is 'daily_limit' when today's AI allowance is used up (SEC-2) — a known state with
   * its own calm copy, not a failure; 'busy' when the shared Groq plan is out of tokens this minute. */
  onError: (message: string, reason?: 'daily_limit' | 'busy') => void
}

const CHAT_URL = () => `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/chat`

async function bearer(): Promise<string | undefined> {
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData.session?.access_token
}

/** Raw fetch (not supabase.functions.invoke) because the response body must be read as a stream. */
export async function streamChat(
  messages: ChatMessage[],
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = await bearer()
  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // The person's own clock style, so the answer writes times the way the app does (lib/clock).
    body: JSON.stringify({ messages, hour24: hour24() }),
    signal,
  })
  if (!res.ok || !res.body) {
    if (await isDailyLimitResponse(res)) handlers.onError('daily_limit', 'daily_limit')
    else if (res.status === 503 && ((await res.json().catch(() => null)) as { error?: string } | null)?.error === 'busy') handlers.onError('busy', 'busy')
    else handlers.onError(`chat failed: ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
        continue
      }
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw) continue
      try {
        const json = JSON.parse(raw)
        if (currentEvent === 'done') {
          handlers.onDone((json.citations ?? []) as Citation[], json.plan as ChatPlan | undefined)
        } else if (json.delta) {
          handlers.onDelta(json.delta as string)
        }
      } catch {
        // partial/malformed chunk — skip
      }
      currentEvent = 'message'
    }
  }
}

/** Runs confirmed calls (or an Undo's) as the user: every tool's own answer back, in order. Throws when
 * the request itself fails — then nothing can be said about what ran, and the panel says so. */
export async function runChatCalls(calls: readonly ChatCall[]): Promise<ChatOutcome[]> {
  const token = await bearer()
  const res = await fetch(CHAT_URL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ run: calls }),
  })
  if (!res.ok) throw new Error(`chat run failed: ${res.status}`)
  const { results } = (await res.json()) as { results?: ChatOutcome[] }
  if (!Array.isArray(results)) throw new Error('chat run: no results')
  return results
}
