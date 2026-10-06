// P5: hybrid retrieval (FTS + pgvector RRF) grounds a Groq streaming answer over the user's
// tasks/inbox_items + a small live snapshot. SSE out, terminated by a `done` event with citations.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { dailyLimitResponse, takeAiAllowance } from '../_shared/quota.ts'
import { hybridSearch } from '../_shared/retrieval.ts'
import { userZone } from '../_shared/zone.ts'
import { dayStart, snapshotText, systemPrompt } from './prompt.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
// llama-3.3-70b-versatile left Groq's free plan on 2026-08-16; gpt-oss-120b is its named replacement.
const GROQ_CHAT_MODEL = Deno.env.get('GROQ_CHAT_MODEL') ?? 'openai/gpt-oss-120b'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S3: a signed-in user, not merely the public anon key, before retrieval or Groq.
  // Retrieval below still runs as that user (their JWT is forwarded), so RLS scopes every row.
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  // SEC-2: today's AI allowance, before the body is read, retrieval runs or Groq is called.
  // Fails CLOSED: if the allowance can't be checked, chat does not call Groq. Nothing is lost by
  // saying "not right now" to a question, while an unmetered path during a database blip is the
  // one gap a quota-draining script would lean on.
  const allowance = await takeAiAllowance(auth.user.id, 'chat')
  if (allowance === 'over') return dailyLimitResponse(req)
  if (allowance === 'unavailable') return jsonResponse(req, { error: 'allowance unavailable' }, 503)

  try {
    const authHeader = `Bearer ${auth.token}`
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { messages } = (await req.json()) as { messages: ChatMessage[] }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      return new Response(JSON.stringify({ error: 'no user message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const hits = await hybridSearch(supabase, lastUser.content, 20)
    const { data: top3 } = await supabase.from('tasks').select('title').eq('top3', true).eq('status', 'todo')
    const { data: slipping } = await supabase.from('slipping').select('entity_name, days_since')
    // A live snapshot of today + tomorrow, so "what's on today?" works without a lucky search hit —
    // the user's today, on their own clock (app_settings.timezone; RLS returns only their row).
    const { data: settings } = await supabase.from('app_settings').select('timezone').maybeSingle()
    const tz = userZone((settings as { timezone?: string | null } | null)?.timezone)
    const now = new Date()
    const until = dayStart(now, tz, 2).toISOString()
    const [{ data: openTasks }, { data: events }, { count: inboxPending }] = await Promise.all([
      supabase.from('tasks').select('title, due_at, scheduled_start, top3')
        .eq('status', 'todo').is('deleted_at', null)
        .or(`due_at.lt.${until},scheduled_start.lt.${until}`).limit(60),
      supabase.from('calendar_events').select('title, starts_at, ends_at, all_day')
        .is('deleted_at', null).gte('starts_at', dayStart(now, tz).toISOString()).lt('starts_at', until).order('starts_at').limit(40),
      supabase.from('inbox_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    const prompt = systemPrompt({
      now,
      hits,
      top3: top3 ?? [],
      slipping: slipping ?? [],
      snapshot: snapshotText(now, openTasks ?? [], events ?? [], inboxPending ?? 0, tz),
    })

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: 'system', content: prompt }, ...messages],
        stream: true,
        temperature: 0.3,
        // Reasoning tokens count against the free plan's daily token budget; a grounded answer
        // over retrieved items needs little of it. (gpt-oss only; other models reject the field.)
        ...(GROQ_CHAT_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      }),
    })

    if (!groqRes.ok || !groqRes.body) {
      // Upstream detail stays in the function log; the caller only needs to know it failed.
      console.error('chat: groq', groqRes.status, await groqRes.text())
      return new Response(JSON.stringify({ error: 'upstream_failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const citations = hits.map((h) => ({ entity_type: h.entity_type, entity_id: h.entity_id, title: h.title }))

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()
        const reader = groqRes.body!.getReader()
        let buffer = ''
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const data = trimmed.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta?.content
                if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
              } catch {
                // malformed/partial chunk — skip it, next read() will complete the line
              }
            }
          }
        } finally {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ citations })}\n\n`))
          controller.close()
        }
      },
      cancel() {
        void groqRes.body?.cancel()
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('chat:', e)
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
