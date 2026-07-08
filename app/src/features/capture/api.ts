import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { useToastStore } from '../../lib/toastStore'
import { createTask } from '../tasks/api'
import { ParseResultSchema, type ParseResult } from './parseSchema'
import type { Domain, Project, InboxItem } from '../../lib/types'

// TODO(P4): read from app_settings.confidence_threshold once settings UI exists.
const CONFIDENCE_THRESHOLD = 0.75

function nowIso(): string {
  return new Date().toISOString()
}

async function callParseCapture(rawText: string): Promise<ParseResult> {
  const domains = queryClient.getQueryData<Domain[]>(['domains']) ?? []
  const projects = queryClient.getQueryData<Project[]>(['projects']) ?? []

  const { data, error } = await supabase.functions.invoke('parse-capture', {
    body: {
      raw_text: rawText,
      context: {
        domains: domains.map((d) => ({ id: d.id, name: d.name })),
        projects: projects.map((p) => ({ id: p.id, name: p.name, domain_id: p.domain_id })),
        today: nowIso(),
        timezone: 'Africa/Cairo',
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
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`)
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
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

/** Text or transcript -> AI parse -> confidence-gated auto-file, else Inbox for triage. */
export async function captureWithAI(
  rawText: string,
  kind: 'text' | 'voice' = 'text',
  transcript: string | null = null,
): Promise<void> {
  if (!navigator.onLine) {
    const item = newInboxItem(rawText, kind, transcript, null, { needs_parse: true })
    writeRow('inbox_items', item)
    logActivity('inbox.captured', 'inbox_item', item.id, { kind, offline: true })
    useToastStore.getState().push({ message: 'Offline — captured, will process when back online' })
    return
  }

  let parse: ParseResult | null = null
  try {
    parse = await callParseCapture(rawText)
  } catch {
    // AI failed for any reason — never block capture, just fall through to Inbox below.
  }

  // Only 'task' has an auto-file target so far (P1 scope); everything else always goes to Inbox,
  // regardless of confidence — there's nowhere else to file a note/event/routine_idea yet.
  if (parse && parse.kind === 'task' && parse.confidence >= CONFIDENCE_THRESHOLD) {
    const task = createTask({
      title: parse.title,
      domainId: parse.domain_id ?? null,
      projectId: parse.project_id ?? null,
      dueAt: parse.due_at ?? null,
      reminderOffsetMin: parse.reminder_offset_min ?? null,
    })
    logActivity('capture.autofiled', 'task', task.id, { confidence: parse.confidence })
    useToastStore.getState().push({
      message: `Added "${task.title}"`,
      onUndo: () => {
        writeRow('tasks', task, 'delete')
        logActivity('task.deleted', 'task', task.id, { reason: 'capture undo' })
        const item = newInboxItem(rawText, kind, transcript, parse)
        writeRow('inbox_items', item)
        logActivity('inbox.captured', 'inbox_item', item.id, { kind, undoneFrom: task.id })
      },
    })
    return
  }

  const item = newInboxItem(rawText, kind, transcript, parse)
  writeRow('inbox_items', item)
  logActivity('inbox.captured', 'inbox_item', item.id, { kind })
  useToastStore.getState().push({ message: 'Added to Inbox for review' })
}

/** Reconnect hook: parse any captures that were queued while offline. */
export async function processQueuedCaptures(): Promise<void> {
  if (!navigator.onLine) return
  const items = queryClient.getQueryData<InboxItem[]>(['inbox_items']) ?? []
  const pending = items.filter(
    (i) => i.status === 'pending' && i.payload && (i.payload as { needs_parse?: boolean }).needs_parse,
  )
  for (const item of pending) {
    try {
      const parse = await callParseCapture(item.raw_text)
      if (parse.kind === 'task' && parse.confidence >= CONFIDENCE_THRESHOLD) {
        const task = createTask({
          title: parse.title,
          domainId: parse.domain_id ?? null,
          projectId: parse.project_id ?? null,
          dueAt: parse.due_at ?? null,
          reminderOffsetMin: parse.reminder_offset_min ?? null,
        })
        writeRow('inbox_items', {
          ...item,
          status: 'filed',
          filed_task_id: task.id,
          ai_parse: parse as unknown as Record<string, unknown>,
          confidence: parse.confidence,
          payload: null,
        })
        logActivity('capture.autofiled', 'task', task.id, { confidence: parse.confidence, source: 'reconnect' })
      } else {
        writeRow('inbox_items', {
          ...item,
          ai_parse: parse as unknown as Record<string, unknown>,
          confidence: parse.confidence,
          payload: null,
        })
      }
    } catch {
      // leave it queued with needs_parse — retried on the next reconnect
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void processQueuedCaptures())
}
