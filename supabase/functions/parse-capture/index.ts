// P2 AI capture: text -> structured parse (Groq, JSON-schema-constrained via prompt + Zod validation).
import { z } from 'npm:zod@^4'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor } from '../_shared/cors.ts'
import { dailyLimitResponse, takeAiAllowance } from '../_shared/quota.ts'
import { userZone, wallClock } from '../_shared/zone.ts'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
// SCALE: a small model is plenty for turning one capture into JSON, and on Groq's free plan each
// model has its own daily budget. gpt-oss-20b is Groq's named replacement for llama-3.1-8b-instant,
// which (with llama-3.3-70b-versatile) left the free plan on 2026-08-16.
const GROQ_PARSE_MODEL = Deno.env.get('GROQ_PARSE_MODEL') ?? 'openai/gpt-oss-20b'

const RequestSchema = z.object({
  raw_text: z.string().min(1).max(4000),
  context: z.object({
    domains: z.array(z.object({ id: z.string(), name: z.string() })),
    projects: z.array(
      z.object({ id: z.string(), name: z.string(), domain_id: z.string().nullable() }),
    ),
    today: z.string(), // when the words were said (an ISO instant; a queued capture parses later)
    timezone: z.string(), // the user's app_settings.timezone, sent by the app
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
  reminder_offset_min: z.number().int().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1),
})

type Context = z.infer<typeof RequestSchema>['context']

/** The user's "now" on their own clock, so "tomorrow 3pm" is their tomorrow at 15:00 there. */
function nowLine(ctx: Context): string {
  const said = new Date(ctx.today)
  const at = Number.isNaN(said.getTime()) ? new Date() : said
  return `Now, on the user's clock: ${wallClock(at, ctx.timezone)}. Read every date and time in the capture on that clock (in ${userZone(ctx.timezone)}), then give due_at in UTC.`
}

function buildSystemPrompt(ctx: Context): string {
  const domainList = ctx.domains.map((d) => `- ${d.id}: ${d.name}`).join('\n') || '(none yet)'
  const projectList =
    ctx.projects
      .map((p) => `- ${p.id}: ${p.name} (domain: ${p.domain_id ?? 'none'})`)
      .join('\n') || '(none yet)'

  return `You parse a short capture (voice or text) from a personal task/life-management app into structured JSON.

${nowLine(ctx)}

Known domains:
${domainList}

Known projects:
${projectList}

Rules:
- Strip filler words ("um", "uh", "like"), rewrite the text tersely and cleanly into "cleaned_text" and a short "title".
- kind is one of: task, event, routine_idea, note, unknown.
- domain_id/project_id: ONLY set these to an id from the lists above if you are genuinely confident it belongs there. Prefer null over guessing.
- due_at: an ISO 8601 datetime in UTC if a date/time is mentioned, else null.
- reminder_offset_min: if the user says something like "remind me 10 min before", output the number of minutes (e.g. 10). Prefer null over guessing — only set this if the user explicitly mentions a reminder time offset. Leave null if no reminder is mentioned.
- confidence (0 to 1): your honest confidence that kind + domain_id/project_id are correct. If unsure of placement, LOWER your confidence — the user strongly prefers triaging an item in their inbox over finding something misfiled later. Do not inflate confidence to seem helpful.
- Respond with ONLY a JSON object with exactly these keys: kind, cleaned_text, title, domain_id, project_id, due_at, duration_min, priority, reminder_offset_min, confidence. Use null for unknown/inapplicable optional fields.`
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
      // Low: one capture → one small JSON object; reasoning tokens spend the free daily budget.
      ...(GROQ_PARSE_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
  })
  if (!res.ok) {
    console.error('parse-capture: groq', res.status, await res.text())
    throw new Error(res.status === 429 ? 'rate_limited' : 'upstream_failed')
  }
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
    reminder_offset_min: null,
    confidence: 0,
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S3: a signed-in user, not merely the public anon key, before anything reaches Groq.
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  // SEC-2: today's AI allowance, before the body is read or Groq is called.
  // Fails OPEN: if the allowance can't be checked ('unavailable'), the parse still runs. A capture
  // must never be lost or degraded by our own bookkeeping — and the client already files it to
  // the Inbox unparsed if this call fails, so failing closed would only cost the user their AI
  // filing during a blip while saving at most one small text call. Over the limit is different:
  // that 429 is a known state, and the client lands the capture in the Inbox as it does offline.
  const allowance = await takeAiAllowance(auth.user.id, 'parse')
  if (allowance === 'over') return dailyLimitResponse(req)

  let rawText = ''
  try {
    const body = RequestSchema.parse(await req.json())
    rawText = body.raw_text
    const systemPrompt = buildSystemPrompt(body.context)

    let result: z.infer<typeof ParseResultSchema>
    try {
      result = ParseResultSchema.parse(await callGroq(rawText, systemPrompt))
    } catch (e) {
      // One retry for a malformed answer or a blip — but not for Groq's 429: that's the shared
      // key's rate limit, and a retry would only spend another call against it.
      const rateLimited = e instanceof Error && e.message === 'rate_limited'
      try {
        result = rateLimited ? fallbackResult(rawText) : ParseResultSchema.parse(await callGroq(rawText, systemPrompt))
      } catch {
        result = fallbackResult(rawText)
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('parse-capture:', e)
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
