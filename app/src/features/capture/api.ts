import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { appZone } from '../../lib/appZone'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { useToastStore } from '../../lib/toastStore'
import { createTask } from '../tasks/api'
import { ParseResultSchema, type ParseResult } from './parseSchema'
import { DailyLimitError, INBOX_WITHOUT_AI, isDailyLimitError, isDailyLimitResponse } from './aiAllowance'
import { SAVED_UNTRANSCRIBED, UNTRANSCRIBED_VOICE_NOTE } from './voiceCopy'
import { CONFIDENCE_THRESHOLD, aiFill, taskFromParse, type AiFields, type KnownPlaces } from './aiFill'
import { placeTask } from '../calendar/api'
import type { CalendarEvent, Domain, Project, InboxItem, Task } from '../../lib/types'

function nowIso(): string {
  return new Date().toISOString()
}

const plusMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString()

/**
 * Kai's rule (calendar/replan.ts, as in Akiflow): a task given a TIME is on the calendar; a date
 * alone isn't. So a capture with a time — typed ("crypto session 4am"), filled in or filed by the AI
 * (`has_time`) — also gets its block: at that time, as long as its estimate or 30 minutes, through
 * calendar-rail's placeTask (one block per task, never a second). Returns the block's Undo, or null
 * when nothing went on the calendar.
 */
export function blockIfTimed(task: Task, timed: boolean): (() => void) | null {
  if (!timed || !task.due_at) return null
  return placeTask(task, task.due_at, plusMinutes(task.due_at, task.duration_min || 30)).undo
}

/** A length the AI read stretches the default-length block this capture just made — one block, at
 * the task's time, still 30 minutes (anything else was placed or resized by hand: left alone). */
function stretchCaptureBlock(task: Task, minutes: number): (() => void) | null {
  const own = (queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []).filter((e) => e.task_id === task.id && !e.deleted_at)
  const b = own.length === 1 ? own[0] : null
  if (!b || b.all_day || b.starts_at !== task.due_at || Date.parse(b.ends_at) - Date.parse(b.starts_at) !== 30 * 60_000) return null
  return placeTask(task, b.starts_at, plusMinutes(b.starts_at, minutes)).undo
}

/** The live (not trashed) projects and domains this device knows — what the AI may place a capture in. */
function knownPlaces(): KnownPlaces {
  const domains = (queryClient.getQueryData<Domain[]>(['domains']) ?? []).filter((d) => !d.deleted_at)
  const projects = (queryClient.getQueryData<Project[]>(['projects']) ?? []).filter((p) => !p.deleted_at)
  return { projects, domainIds: domains.map((d) => d.id) }
}

// `today` is when the words were said: a queued capture parsed hours later still reads "tomorrow" from then.
async function callParseCapture(rawText: string, today = nowIso()): Promise<ParseResult> {
  // The raw caches still hold trashed rows (kept for Undo) — never offer the AI one of those.
  const domains = (queryClient.getQueryData<Domain[]>(['domains']) ?? []).filter((d) => !d.deleted_at)
  const projects = (queryClient.getQueryData<Project[]>(['projects']) ?? []).filter((p) => !p.deleted_at)

  const { data, error } = await supabase.functions.invoke('parse-capture', {
    body: {
      raw_text: rawText,
      context: {
        domains: domains.map((d) => ({ id: d.id, name: d.name })),
        projects: projects.map((p) => ({ id: p.id, name: p.name, domain_id: p.domain_id })),
        today,
        timezone: appZone(), // the user's own: "tomorrow 3pm" is their tomorrow
      },
    },
  })
  if (error) throw error
  return ParseResultSchema.parse(data)
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const form = new FormData()
  form.append('audio', blob, 'capture.webm')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/transcribe`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  )
  if (!res.ok) {
    // SEC-2: today's speech-to-text allowance is used up — its own error type so the voice sheet
    // can say so calmly instead of "failed".
    if (await isDailyLimitResponse(res)) throw new DailyLimitError()
    throw new Error(`transcribe failed: ${res.status}`)
  }
  const data = (await res.json()) as { text: string }
  return data.text
}

function newInboxItem(
  rawText: string,
  kind: InboxItem['kind'],
  transcript: string | null,
  parse: ParseResult | null,
  extraPayload: Record<string, unknown> | null = null,
): InboxItem {
  return {
    id: crypto.randomUUID(),
    kind,
    raw_text: rawText,
    transcript,
    ai_parse: (parse as unknown as Record<string, unknown>) ?? null,
    confidence: parse?.confidence ?? null,
    status: 'pending',
    filed_task_id: null,
    payload: extraPayload,
    snoozed_until: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export interface CaptureOverrides {
  priority?: number | null
  durationMin?: number | null
}

/** Stashes non-null overrides on a pending inbox item's `payload` so a later manual `fileToTask`
 * (see `inbox/api.ts`) can still apply them — the auto-file branch below applies them immediately
 * instead, so neither path loses a locally-typed `!`/`30m` token. */
function overridesPayload(overrides: CaptureOverrides): Record<string, unknown> | null {
  if (overrides.priority == null && overrides.durationMin == null) return null
  return { priority_override: overrides.priority ?? null, duration_override: overrides.durationMin ?? null }
}

/** Text or transcript -> AI parse -> confidence-gated auto-file, else Inbox for triage.
 * `overrides` carries priority/duration already resolved client-side (e.g. the command bar's
 * local `!`/`30m` syntax) that the AI parse doesn't need to (and won't) infer on its own. */
export async function captureWithAI(
  rawText: string,
  kind: 'text' | 'voice' = 'text',
  transcript: string | null = null,
  overrides: CaptureOverrides = {},
): Promise<void> {
  if (!navigator.onLine) {
    const item = newInboxItem(rawText, kind, transcript, null, { needs_parse: true, ...overridesPayload(overrides) })
    writeRow('inbox_items', item)
    logActivity('inbox.captured', 'inbox_item', item.id, { kind, offline: true })
    useToastStore.getState().push({ message: 'Offline — captured, will process when back online' })
    return
  }

  let parse: ParseResult | null = null
  let aiAllowanceUsedUp = false
  try {
    parse = await callParseCapture(rawText)
  } catch (err) {
    // AI failed for any reason — never block capture, just fall through to Inbox below.
    // SEC-2: if the reason is today's used-up AI allowance, the toast says the AI step was skipped.
    aiAllowanceUsedUp = await isDailyLimitError(err)
  }

  // Only 'task' has an auto-file target so far (P1 scope); everything else always goes to Inbox,
  // regardless of confidence — there's nowhere else to file a note/event/routine_idea yet.
  if (parse && parse.kind === 'task' && parse.confidence >= CONFIDENCE_THRESHOLD) {
    // Everything it read — priority from the wording, the description as notes — with a typed
    // `!` / `30m` still beating its own reading.
    const task = createTask(taskFromParse(parse, knownPlaces(), overrides))
    const unblock = blockIfTimed(task, parse.has_time === true)
    logActivity('capture.autofiled', 'task', task.id, { confidence: parse.confidence })
    useToastStore.getState().push({
      message: `Added "${task.title}"`,
      onUndo: () => {
        unblock?.()
        writeRow('tasks', task, 'delete')
        logActivity('task.deleted', 'task', task.id, { reason: 'capture undo' })
        const item = newInboxItem(rawText, kind, transcript, parse)
        writeRow('inbox_items', item)
        logActivity('inbox.captured', 'inbox_item', item.id, { kind, undoneFrom: task.id })
      },
    })
    return
  }

  const item = newInboxItem(rawText, kind, transcript, parse, overridesPayload(overrides))
  writeRow('inbox_items', item)
  logActivity('inbox.captured', 'inbox_item', item.id, { kind })
  useToastStore.getState().push({ message: aiAllowanceUsedUp ? INBOX_WITHOUT_AI : 'Added to Inbox for review' })
}

/** The AI's read of a typed capture, or null when it can't be had — offline, over today's allowance,
 * a failure. Then the local parse simply stands: the row is already written, nothing is lost. */
async function readQuietly(rawText: string): Promise<ParseResult | null> {
  if (!navigator.onLine) return null
  try {
    return await callParseCapture(rawText)
  } catch {
    return null
  }
}

/**
 * Kai 2026-10-07 (Akiflow-style capture): a typed capture with structure was just created from the
 * local parse; the AI's read fills in only what is still empty (aiFill) — a priority from "asap",
 * a duration from "an hour", notes from the details — then says so: "✦ Filled by AI: … · Undo".
 * Fields the person changed meanwhile are theirs; Undo puts back only what the AI wrote.
 */
export async function enrichTypedTask(created: Task, rawText: string): Promise<void> {
  const ai = await readQuietly(rawText)
  if (!ai) return
  const current = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === created.id) ?? created
  if (current.deleted_at) return
  const { patch, filled } = aiFill(current, ai, knownPlaces(), created.title)
  if (!filled.length) return
  const keys = Object.keys(patch) as (keyof AiFields)[]
  const before = Object.fromEntries(keys.map((k) => [k, current[k]])) as Partial<AiFields>
  const next = { ...current, ...patch, updated_at: nowIso() }
  writeRow('tasks', next)
  // The calendar follows what it read: a time puts the task on the calendar; a length stretches
  // the 30-minute block the typed time just made. Undo takes that back too.
  const unblock = patch.due_at ? blockIfTimed(next, ai.has_time === true) : patch.duration_min ? stretchCaptureBlock(next, patch.duration_min) : null
  logActivity('capture.ai_filled', 'task', current.id, { fields: filled })
  useToastStore.getState().push({
    message: `✦ Filled by AI: ${filled.join(', ')}`,
    onUndo: () => {
      unblock?.()
      const latest = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === current.id) ?? { ...current, ...patch }
      const back = Object.fromEntries(keys.filter((k) => latest[k] === patch[k]).map((k) => [k, before[k]]))
      writeRow('tasks', { ...latest, ...back, updated_at: nowIso() })
    },
  })
}

/**
 * A typed line with no structure was just put in the Inbox (instantly, as always). The AI then
 * decides, like a voice capture: a task it's sure of is filed for you ("✦ Filed by AI · Undo" puts
 * it back in the Inbox); anything else stays in the Inbox with the AI's read for triage.
 */
export async function enrichTypedInboxItem(item: InboxItem, rawText: string): Promise<void> {
  const ai = await readQuietly(rawText)
  if (!ai) return
  const current = queryClient.getQueryData<InboxItem[]>(['inbox_items'])?.find((i) => i.id === item.id) ?? item
  if (current.status !== 'pending') return // triaged meanwhile — the person's call stands
  const read = { ...current, ai_parse: ai as unknown as Record<string, unknown>, confidence: ai.confidence, updated_at: nowIso() }
  if (ai.kind !== 'task' || ai.confidence < CONFIDENCE_THRESHOLD) {
    writeRow('inbox_items', read)
    return
  }
  const task = createTask(taskFromParse(ai, knownPlaces()))
  const unblock = blockIfTimed(task, ai.has_time === true)
  writeRow('inbox_items', { ...read, status: 'filed', filed_task_id: task.id })
  logActivity('capture.autofiled', 'task', task.id, { confidence: ai.confidence, source: 'typed' })
  useToastStore.getState().push({
    message: `✦ Filed by AI: “${task.title}”`,
    onUndo: () => {
      unblock?.()
      writeRow('tasks', task, 'delete')
      logActivity('task.deleted', 'task', task.id, { reason: 'capture undo' })
      writeRow('inbox_items', { ...read, status: 'pending', filed_task_id: null, updated_at: nowIso() })
    },
  })
}

/** Polish E: a recording that couldn't be transcribed still lands in the Inbox — as a voice item
 * with no transcript, through the same row shape and outbox write as every other capture. No
 * audio is stored (the project has no storage bucket for it), so the row is a reminder, and it
 * carries no `needs_parse`: there's no text for the reconnect parser to read. */
export function saveUntranscribedVoiceNote(): InboxItem {
  const item = newInboxItem(UNTRANSCRIBED_VOICE_NOTE, 'voice', null, null, { untranscribed: true })
  writeRow('inbox_items', item)
  logActivity('inbox.captured', 'inbox_item', item.id, { kind: 'voice', untranscribed: true })
  useToastStore.getState().push({ message: SAVED_UNTRANSCRIBED })
  return item
}

let parsingQueued = false

/** Parses captures queued with `needs_parse`: ones made offline (run on reconnect), and ones sent
 * to the capture endpoint with `?file=1` (supabase/functions/capture — run by AppLayout once they
 * show up). Same confidence-gated auto-file as a live capture. */
export async function processQueuedCaptures(): Promise<void> {
  if (!navigator.onLine || parsingQueued) return
  parsingQueued = true
  try {
    await parseQueued()
  } finally {
    parsingQueued = false
  }
}

async function parseQueued(): Promise<void> {
  const items = queryClient.getQueryData<InboxItem[]>(['inbox_items']) ?? []
  const pending = items.filter(
    (i) => i.status === 'pending' && i.payload && (i.payload as { needs_parse?: boolean }).needs_parse,
  )
  for (const item of pending) {
    // The rest of the payload stays (overrides, the endpoint's source/url); only the flag goes.
    const { needs_parse: _queued, ...rest } = item.payload as Record<string, unknown>
    const payload = Object.keys(rest).length ? rest : null
    try {
      // An endpoint capture reaches every open device at once: claim it on the server first (a
      // conditional update — no row back means another device has it). One that fails to parse
      // after the claim simply stays in the Inbox, like any capture.
      if (rest.source === 'capture') {
        const { data: claimed, error } = await supabase
          .from('inbox_items')
          .update({ payload })
          .eq('id', item.id)
          .eq('payload->>needs_parse', 'true')
          .select('id')
        if (error || !claimed?.length) continue
      }
      const parse = await callParseCapture(item.raw_text, item.created_at)
      if (parse.kind === 'task' && parse.confidence >= CONFIDENCE_THRESHOLD) {
        const over = rest as { priority_override?: number | null; duration_override?: number | null }
        const task = createTask(taskFromParse(parse, knownPlaces(), { priority: over.priority_override, durationMin: over.duration_override }))
        blockIfTimed(task, parse.has_time === true)
        writeRow('inbox_items', {
          ...item,
          status: 'filed',
          filed_task_id: task.id,
          ai_parse: parse as unknown as Record<string, unknown>,
          confidence: parse.confidence,
          payload,
        })
        logActivity('capture.autofiled', 'task', task.id, { confidence: parse.confidence, source: rest.source === 'capture' ? 'capture' : 'reconnect' })
      } else {
        writeRow('inbox_items', {
          ...item,
          ai_parse: parse as unknown as Record<string, unknown>,
          confidence: parse.confidence,
          payload,
        })
      }
    } catch {
      // leave it queued with needs_parse — retried on the next reconnect (a claimed endpoint
      // capture isn't: it stays in the Inbox, unparsed, like any capture)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void processQueuedCaptures())
}
