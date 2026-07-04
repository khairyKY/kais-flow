// P2 AI capture: text -> structured parse (Groq, JSON-schema-constrained via prompt + Zod validation).
import { z } from 'npm:zod@^4'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const GROQ_PARSE_MODEL = Deno.env.get('GROQ_PARSE_MODEL') ?? 'llama-3.3-70b-versatile'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RequestSchema = z.object({
  raw_text: z.string().min(1).max(4000),
  context: z.object({
    domains: z.array(z.object({ id: z.string(), name: z.string() })),
    projects: z.array(
      z.object({ id: z.string(), name: z.string(), domain_id: z.string().nullable() }),
    ),
    today: z.string(),
    timezone: z.string(),
  }),
})

export const ParseResultSchema = z.object({
  kind: z.enum(['task', 'event', 'routine_idea', 'note', 'unknown']),
  cleaned_text: z.string(),
  title: z.string(),
  domain_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  priority: z.number().nullable().optional(),
  confidence: z.number().min(0).max(1),
})

type Context = z.infer<typeof RequestSchema>['context']

function buildSystemPrompt(ctx: Context): string {
  const domainList = ctx.domains.map((d) => `- ${d.id}: ${d.name}`).join('\n') || '(none yet)'
  const projectList =
    ctx.projects
      .map((p) => `- ${p.id}: ${p.name} (domain: ${p.domain_id ?? 'none'})`)
      .join('\n') || '(none yet)'

  return `You parse a short capture (voice or text) from a personal task/life-management app into structured JSON.

Today's date: ${ctx.today}. Timezone: ${ctx.timezone}.

Known domains:
${domainList}

Known projects:
${projectList}

Rules:
- Strip filler words ("um", "uh", "like"), rewrite the text tersely and cleanly into "cleaned_text" and a short "title".
- kind is one of: task, event, routine_idea, note, unknown.
- domain_id/project_id: ONLY set these to an id from the lists above if you are genuinely confident it belongs there. Prefer null over guessing.
- due_at: an ISO 8601 datetime in UTC if a date/time is mentioned, else null.
- confidence (0 to 1): your honest confidence that kind + domain_id/project_id are correct. If unsure of placement, LOWER your confidence — the user strongly prefers triaging an item in their inbox over finding something misfiled later. Do not inflate confidence to seem helpful.
- Respond with ONLY a JSON object with exactly these keys: kind, cleaned_text, title, domain_id, project_id, due_at, duration_min, priority, confidence. Use null for unknown/inapplicable optional fields.`
}

async function callGroq(rawText: string, systemPrompt: string): Promise<unknown> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_PARSE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned no content')
  return JSON.parse(content)
}

function fallbackResult(rawText: string) {
  return {
    kind: 'unknown' as const,
    cleaned_text: rawText,
    title: rawText.slice(0, 80),
    domain_id: null,
    project_id: null,
    due_at: null,
    duration_min: null,
    priority: null,
    confidence: 0,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  let rawText = ''
  try {
    const body = RequestSchema.parse(await req.json())
    rawText = body.raw_text
    const systemPrompt = buildSystemPrompt(body.context)

    let result: z.infer<typeof ParseResultSchema>
    try {
      result = ParseResultSchema.parse(await callGroq(rawText, systemPrompt))
    } catch {
      try {
        result = ParseResultSchema.parse(await callGroq(rawText, systemPrompt))
      } catch {
        result = fallbackResult(rawText)
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
