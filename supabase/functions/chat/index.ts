// P5: hybrid retrieval (FTS + pgvector RRF) grounds a Groq answer over the user's tasks, calendar
// and inbox plus a small live snapshot. SSE out (one `delta`, then a `done` event with citations).
//
// 2026-10-25 (queue item 5, "the AI chat sucks and doesn't work" — it said it had added three gym
// sessions and nothing was there): the chat ACTS, honestly.
//   - Groq function calling (OpenAI-compatible `tools`, GROQ_CHAT_MODEL — gpt-oss-120b by default).
//     Reads (calendar, search, list_tasks, inbox, projects, get_task) run at once; writes come as one
//     `propose` call of steps (./plan.ts). Both run the MCP server's own tools (mcp/tools.ts through
//     mcp/store.ts) as the signed-in user — RLS, their zone — so nothing is written twice over.
//   - A plan is DRY-RUN (inside a transaction that's rolled back) and sent to the app as a card; the
//     model's own words never claim anything. Nothing is written until the user confirms: the app
//     then POSTs `{ run: calls }` and gets back exactly what each tool returned, with the call that
//     takes it back where the app has one (an add → Trash, a completion → reopen).
//   - Never journal or people: the chat's Store has neither scope (mcp/store.ts refuses the tables),
//     and no step can name them. Search hits may still quote them as context, as before.
//   - One AI allowance per question (SEC-2); `run` calls no model and takes none.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { corsHeadersFor, jsonResponse } from '../_shared/cors.ts'
import { dailyLimitResponse, takeAiAllowance } from '../_shared/quota.ts'
import { hybridSearch } from '../_shared/retrieval.ts'
import { dropSynced } from '../_shared/google.ts'
import { userZone } from '../_shared/zone.ts'
import { todaysTop3, type Top3Row } from '../_shared/today.ts'
import { expandSeries } from '../_shared/series.ts'
import { asUser, nextOccurrence, ruleBetween, sql, store } from '../mcp/store.ts'
import { TOOLS } from '../mcp/server.ts'
import { runTool, type Scope, type ToolResult } from '../mcp/tools.ts'
import { dayStart, snapshotText, systemPrompt } from './prompt.ts'
import { CHAT_TOOLS, MAX_STEPS, READ_TOOLS, RUNNABLE, UNDO_TABLES, claimsAction, looksLikeAction, relevantCitations, restorePlan, stepToCall, type Call, type Refs, type Restore, type Snapshot } from './plan.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
// llama-3.3-70b-versatile left Groq's free plan on 2026-08-16; gpt-oss-120b is its named replacement
// (and calls tools — one per turn, hence `propose` takes a list).
const GROQ_CHAT_MODEL = Deno.env.get('GROQ_CHAT_MODEL') ?? 'openai/gpt-oss-120b'
/** Model turns per question: a read or two, then the answer or the plan. ponytail: 3 keeps a question
 * inside the free plan's 8K tokens a minute; raise it if questions need deeper look-ups. */
const MAX_ROUNDS = 3
/** A read's result as the model sees it, at most (the rest is cut). */
const READ_CHARS = 3000
/** Nothing journal or people — the chat's Store has no personal scope. */
const NO_SCOPES: ReadonlySet<Scope> = new Set()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
type GroqMessage = Record<string, unknown>
interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

/** One tool's outcome as the app shows it: what the tool said, honestly. */
interface Outcome {
  tool: string
  args: Record<string, unknown>
  ok: boolean
  output?: Record<string, unknown>
  error?: string
}

class StepFailed extends Error {
  result: ToolResult
  constructor(result: ToolResult) {
    super('step failed')
    this.result = result
  }
}
class DryRun extends Error {
  outcomes: Outcome[]
  constructor(outcomes: Outcome[]) {
    super('dry run')
    this.outcomes = outcomes
  }
}

const resultText = (r: ToolResult) => r.content.map((c) => c.text).join('\n')

/** This user's rows (RLS) in the tables a batch can change, as stored. ponytail: whole tables, read
 * twice per confirmed batch — exact and simple; narrow it to the touched ids if a big account makes
 * Confirm slow. */
async function snapshot(tx: Parameters<Parameters<typeof sql.begin>[0]>[0]): Promise<Snapshot> {
  const out: Snapshot = {}
  for (const table of UNDO_TABLES) {
    const rows = await tx`select t.id::text as id, to_jsonb(t) - 'user_id' - 'embedding' - 'search_tsv' as r from ${tx.unsafe(table)} t`
    out[table] = new Map(rows.map((x) => [x.id as string, x.r as Record<string, unknown>]))
  }
  return out
}

/** Runs `calls` in order as `userId` — each in its own savepoint, so one refused step doesn't undo
 * the rest. `dry`: everything is rolled back after (the plan's preview — the tools' real answers).
 * `undo`: the rows before and after the batch give its one Undo (restorePlan). */
async function execute(userId: string, calls: readonly Call[], dry: boolean, undo?: { restore?: Restore }): Promise<Outcome[]> {
  try {
    return await sql.begin(async (tx) => {
      await asUser(tx, userId)
      const before = undo ? await snapshot(tx) : null
      const zone = userZone(await store(tx, NO_SCOPES).timezone())
      const outcomes: Outcome[] = []
      for (const call of calls) {
        const tool = TOOLS.find((t) => t.name === call.tool)
        if (!tool) {
          outcomes.push({ ...call, ok: false, error: `No tool ${call.tool}.` })
          continue
        }
        try {
          const r = await tx.savepoint(async (sp) => {
            const res = await runTool(tool, call.args, { store: store(sp, NO_SCOPES), zone, now: new Date(), nextOccurrence, ruleBetween, scopes: NO_SCOPES, source: 'chat' })
            if (res.isError) throw new StepFailed(res)
            return res
          })
          outcomes.push({ ...call, ok: true, output: JSON.parse(resultText(r)) as Record<string, unknown> })
        } catch (e) {
          if (!(e instanceof StepFailed)) throw e
          outcomes.push({ ...call, ok: false, error: resultText(e.result) })
        }
      }
      if (dry) throw new DryRun(outcomes)
      if (undo && before) undo.restore = restorePlan(before, await snapshot(tx))
      return outcomes
    })
  } catch (e) {
    if (e instanceof DryRun) return e.outcomes
    throw e
  }
}

const sse = (req: Request, text: string, done: Record<string, unknown>) =>
  new Response(`${text ? `data: ${JSON.stringify({ delta: text })}\n\n` : ''}event: done\ndata: ${JSON.stringify(done)}\n\n`, {
    headers: { ...corsHeadersFor(req), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })

async function groq(messages: GroqMessage[]): Promise<{ message: GroqMessage } | { status: number }> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_CHAT_MODEL,
      messages,
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 1024,
      // Reasoning tokens count against the free plan's daily budget; planning a few steps needs little.
      // (gpt-oss only; other models reject the field.)
      ...(GROQ_CHAT_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
  })
  if (!res.ok) {
    // Upstream detail stays in the function log; the caller only needs to know it failed.
    console.error('chat: groq', res.status, await res.text())
    return { status: res.status }
  }
  const json = await res.json()
  return { message: (json.choices?.[0]?.message ?? {}) as GroqMessage }
}

/** `{ run: calls }` — the confirmed card (or an Undo): every call, as the user, honestly reported. */
async function run(req: Request, userId: string, raw: unknown[]): Promise<Response> {
  if (raw.length === 0 || raw.length > MAX_STEPS * 2) return jsonResponse(req, { error: 'bad_request' }, 400)
  const calls: Call[] = []
  for (const c of raw) {
    const call = c as Partial<Call> | null
    if (!call || typeof call.tool !== 'string' || !RUNNABLE.has(call.tool) || typeof call.args !== 'object' || call.args === null || Array.isArray(call.args)) {
      return jsonResponse(req, { error: 'bad_request' }, 400)
    }
    calls.push({ tool: call.tool, args: call.args as Record<string, unknown> })
  }
  const undo: { restore?: Restore } = {}
  const results = await execute(userId, calls, false, undo)
  return jsonResponse(req, { results, restore: undo.restore ?? { put: [], drop: [] } })
}

/** A question: retrieval + snapshot + up to MAX_ROUNDS model turns → an answer, or a plan to confirm. */
async function ask(req: Request, auth: { token: string; user: { id: string } }, messages: ChatMessage[], h24: boolean): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${auth.token}` } } })
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')!
  const action = looksLikeAction(lastUser.content)

  // Privacy (site info §3, B1): Google-synced events never reach the model — not as hits (here),
  // not in the snapshot (source = 'native' below). If the look-up fails, every event hit goes.
  // An action request gets no hits: they'd only be noise in its prompt and chips under its card.
  const found = action ? [] : (await hybridSearch(supabase, lastUser.content, 12)).slice(0, 8)
  const eventIds = found.filter((h) => h.entity_type === 'calendar_event').map((h) => h.entity_id)
  const { data: synced, error: syncedError } = eventIds.length
    ? await supabase.from('calendar_events').select('id').eq('source', 'gcal').in('id', eventIds)
    : { data: [], error: null }
  const hits = dropSynced(found, new Set(syncedError ? eventIds : ((synced ?? []) as { id: string }[]).map((r) => r.id)))
  const { data: slipping } = await supabase.from('slipping').select('entity_name, days_since')
  // A live snapshot of today + tomorrow, so "what's on today?" works without a lucky search hit —
  // the user's today, on their own clock (app_settings.timezone; RLS returns only their row).
  const { data: settings } = await supabase.from('app_settings').select('timezone').maybeSingle()
  const tz = userZone((settings as { timezone?: string | null } | null)?.timezone)
  const now = new Date()
  // Today's Top 3 as Today draws it (_shared/today.ts): a pick moved to a later day isn't one; goal first.
  const { data: picks } = await supabase.from('tasks').select('id, title, status, someday, paused, deleted_at, due_at, scheduled_start, top3, top3_rank, created_at')
    .eq('top3', true).eq('status', 'todo').eq('someday', false).is('deleted_at', null)
  const top3 = todaysTop3((picks ?? []) as (Top3Row & { id: string; title: string })[], now, tz)
  const top3Ids = new Set(top3.map((t) => t.id))
  const until = dayStart(now, tz, 2).toISOString()
  const from = dayStart(now, tz).toISOString()
  const [{ data: openTasks }, { data: rows }, { data: inbox, count: inboxPending }] = await Promise.all([
    supabase.from('tasks').select('id, title, due_at, scheduled_start')
      .eq('status', 'todo').eq('paused', false).is('deleted_at', null)
      .or(`due_at.lt.${until},scheduled_start.lt.${until}`).limit(60),
    // A repeating event is one row anchored at its first occurrence: it comes along whenever it
    // started before `until`, and is expanded below.
    supabase.from('calendar_events').select('id, title, starts_at, ends_at, all_day, recurrence_rule, recurrence_exdates')
      .is('deleted_at', null).eq('source', 'native').lt('starts_at', until).or(`starts_at.gte.${from},recurrence_rule.not.is.null`).order('starts_at').limit(40),
    supabase.from('inbox_items').select('id, raw_text', { count: 'exact' }).eq('status', 'pending').is('deleted_at', null).order('created_at').limit(5),
  ])
  const events = expandSeries(rows ?? [], new Date(from), new Date(until), tz, ruleBetween)
  const refs: Refs = {}
  const snapshot = snapshotText(now, (openTasks ?? []).map((t) => ({ ...t, top3: top3Ids.has(t.id) })), events, inboxPending ?? 0, tz, { h24, inbox: inbox ?? [], refs })
  const prompt = systemPrompt({ now, hits, top3, slipping: slipping ?? [], snapshot, tz, h24, action })

  const convo: GroqMessage[] = [{ role: 'system', content: prompt }, ...messages]
  let nudged = false
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const last = round === MAX_ROUNDS - 1
    const got = await groq(convo)
    if ('status' in got) return jsonResponse(req, { error: got.status === 429 ? 'busy' : 'upstream_failed' }, got.status === 429 ? 503 : 502)
    const msg = got.message
    const calls = ((msg.tool_calls as ToolCall[] | undefined) ?? []).filter((c) => c?.function?.name)
    if (!calls.length) {
      const text = String(msg.content ?? '').trim()
      // Honesty: only the app's card may say something changed. A claim with no plan gets one nudge,
      // then is replaced by the truth.
      if (claimsAction(text)) {
        if (!nudged && !last) {
          nudged = true
          convo.push({ role: 'assistant', content: text }, { role: 'user', content: '(App: nothing has changed — you did not call propose. Call propose with the steps now, or say plainly what you need.)' })
          continue
        }
        return sse(req, "I haven't changed anything yet. Tell me once more what to add and I'll show it to you to confirm.", { citations: [] })
      }
      return sse(req, text || 'Sorry — I lost my words there. Ask me again?', { citations: action ? [] : relevantCitations(text, hits).map((h) => ({ entity_type: h.entity_type, entity_id: h.entity_id, title: h.title })) })
    }
    convo.push({ role: 'assistant', content: String(msg.content ?? ''), tool_calls: calls })
    for (const c of calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(c.function.arguments || '{}')
      } catch {
        convo.push({ role: 'tool', tool_call_id: c.id, content: 'Those arguments were not valid JSON.' })
        continue
      }
      if (c.function.name === 'propose') {
        const steps = (Array.isArray(args.steps) ? args.steps : []).slice(0, MAX_STEPS) as Record<string, unknown>[]
        const mapped = steps.map((s) => stepToCall(s ?? {}, refs, now, tz))
        let problems = steps.length ? mapped.flatMap((m, i) => ('error' in m ? [`step ${i + 1}: ${m.error}`] : [])) : ['no steps']
        const planned = mapped.filter((m): m is Call => !('error' in m))
        const preview = problems.length ? [] : await execute(auth.user.id, planned, true)
        problems = problems.concat(preview.flatMap((o, i) => (o.ok ? [] : [`step ${i + 1} (${o.tool}): ${o.error}`])))
        if (!problems.length) {
          return sse(req, '', { citations: [], plan: { calls: planned, previews: preview.map((o) => o.output ?? {}) } })
        }
        if (last) return sse(req, `I couldn't set that up: ${problems.join('; ')}`, { citations: [] })
        convo.push({ role: 'tool', tool_call_id: c.id, content: `Not planned — nothing changed. Fix these and call propose again, or ask the user: ${problems.join('; ')}` })
        break
      }
      if (!(READ_TOOLS as readonly string[]).includes(c.function.name)) {
        convo.push({ role: 'tool', tool_call_id: c.id, content: `No tool ${c.function.name}.` })
        continue
      }
      const [o] = await execute(auth.user.id, [{ tool: c.function.name, args }], false)
      convo.push({ role: 'tool', tool_call_id: c.id, content: (o.ok ? JSON.stringify(o.output) : `Error: ${o.error}`).slice(0, READ_CHARS) })
    }
  }
  return sse(req, "Sorry — I couldn't finish that one. Could you ask it a simpler way?", { citations: [] })
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // FIX-0 / S3: a signed-in user, not merely the public anon key, before retrieval or Groq.
  // Retrieval below still runs as that user (their JWT is forwarded), so RLS scopes every row; the
  // tools run as that user too (mcp/store.ts asUser — auth.uid() = this id).
  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  try {
    const body = (await req.json()) as { messages?: unknown; run?: unknown; hour24?: unknown }
    if (Array.isArray(body.run)) return await run(req, auth.user.id, body.run)

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m): m is ChatMessage => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    if (!messages.some((m) => m.role === 'user')) return jsonResponse(req, { error: 'no user message' }, 400)

    // SEC-2: today's AI allowance, before retrieval runs or Groq is called. Fails CLOSED: if the
    // allowance can't be checked, chat does not call Groq. Nothing is lost by saying "not right now"
    // to a question, while an unmetered path during a database blip is the one gap a quota-draining
    // script would lean on.
    const allowance = await takeAiAllowance(auth.user.id, 'chat')
    if (allowance === 'over') return dailyLimitResponse(req)
    if (allowance === 'unavailable') return jsonResponse(req, { error: 'allowance unavailable' }, 503)

    return await ask(req, auth, messages, body.hour24 !== false)
  } catch (e) {
    // Details stay in the function log; callers get a stable code, never upstream or stack text.
    console.error('chat:', e)
    return jsonResponse(req, { error: 'bad_request' }, 400)
  }
})
