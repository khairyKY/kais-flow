import { supabase } from '../../lib/supabase'
import type { ChatMessage, Citation } from '../../lib/types'
import { isDailyLimitResponse } from '../capture/aiAllowance'

export interface StreamChatHandlers {
  onDelta: (delta: string) => void
  onDone: (citations: Citation[]) => void
  /** `reason` is 'daily_limit' when today's AI allowance is used up (SEC-2) — a known state with
   * its own calm copy, not a failure. */
  onError: (message: string, reason?: 'daily_limit') => void
}

/** Raw fetch (not supabase.functions.invoke) because the response body must be read as a stream. */
export async function streamChat(
  messages: ChatMessage[],
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  if (!res.ok || !res.body) {
    if (await isDailyLimitResponse(res)) handlers.onError('daily_limit', 'daily_limit')
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
          handlers.onDone((json.citations ?? []) as Citation[])
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
