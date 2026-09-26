// P5: hybrid retrieval (FTS + pgvector RRF) grounds a Groq streaming answer over the user's
// tasks/inbox_items + a small live snapshot. SSE out, terminated by a `done` event with citations.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { hybridSearch, type SearchHit } from '../_shared/retrieval.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const GROQ_CHAT_MODEL = Deno.env.get('GROQ_CHAT_MODEL') ?? 'llama-3.3-70b-versatile'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildContext(hits: SearchHit[], top3: { title: string }[], slipping: { entity_name: string; days_since: number }[]) {
  const items = hits.map((h) => `- [${h.entity_type}] ${h.title}${h.snippet ? `: ${h.snippet}` : ''}`.slice(0, 260)).join('\n')
  const top3Line = top3.map((t) => t.title).join(', ') || 'none'
  const slippingLine =
    slipping
      .slice(0, 5)
      .map((s) => `${s.entity_name} (${Math.floor(s.days_since)}d)`)
      .join(', ') || 'none'
  return `Retrieved items from the user's system:\n${items || '(none found)'}\n\nToday's Top-3: ${top3Line}\nSlipping (untouched areas): ${slippingLine}`
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

    const systemPrompt = `You answer questions about the user's personal task/notes system using ONLY the context below. Cite the item titles you draw from. If the answer isn't in the context, say plainly "That's not in your data" rather than inventing an answer.\n\n${buildContext(hits, top3 ?? [], slipping ?? [])}`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
        temperature: 0.3,
      }),
    })

    if (!groqRes.ok || !groqRes.body) {
      return new Response(JSON.stringify({ error: `Groq error ${groqRes.status}: ${await groqRes.text()}` }), {
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
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
