// Akiflow adapter — parses our canonical akiflow-dump.json (produced by the PROMPT-BANK
// dump prompt) into an ImportBatch. Pure function, no app imports.
//
// Field mapping (akiflow → app):
//   projects[].name        → projects.name (as-is, emoji included — no domain guessing)
//   tasks[].title          → tasks.title
//   tasks[].description    → tasks.notes (<br /> → newline)
//   tasks[].priority       → tasks.priority (GOAL/HIGH→1, MEDIUM→2, LOW→3, else null)
//   tasks[].duration       → tasks.duration_min
//   tasks[].deadline       → tasks.due_at (date-only, Cairo midnight → UTC)
//   tasks[].datetime       → tasks.scheduled_start (+duration → scheduled_end; naive Cairo → UTC);
//                            also becomes due_at when there is no deadline (so lists sort)
//   tasks[].date           → tasks.due_at fallback when no deadline/datetime (Cairo midnight → UTC)
//   tasks[].status         → 'someday' → tasks.someday; "planned for …" strings are display-only
//                            (redundant with date/datetime) and live on in external_ref.raw
//   tasks[].done/done_at   → tasks.status 'done' + completed_at (kept only when the
//                            "include completed" toggle is on — the wizard filters)
//   tasks[].tags           → tasks.labels (tag titles; the app's labels are plain text[])
//   tasks[].project_id     → sourceProjectId (wizard resolves to an app project uuid)
//   events[]               → calendar_events (behind the default-OFF toggle)
//   everything else (url, parent_task_id, plan_week/plan_month, links, recurrence, …)
//                          → external_ref.raw — the WHOLE source row is kept there.

import { z } from 'zod'
import {
  type ImportBatch, type ImportTask, type ImportEvent,
  naiveLocalToUtc, mapPriority, stripBreaks, emptyBatch,
} from './shared'

const akiflowTask = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  date: z.string().nullish(),
  datetime: z.string().nullish(),
  deadline: z.string().nullish(),
  duration: z.number().nullish(),
  priority: z.string().nullish(),
  project_id: z.string().nullish(),
  // Real dumps carry three tag shapes: "title" strings, {id,title}, and orphaned
  // {id,name:null} refs to deleted tags — resolve in code, never reject the file.
  tags: z.array(z.unknown()).nullish(),
  done: z.boolean().nullish(),
  done_at: z.string().nullish(),
  status: z.string().nullish(),
})

const akiflowEvent = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  all_day: z.boolean().nullish(),
})

const akiflowDump = z.object({
  source: z.literal('akiflow'),
  projects: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  tags: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  tasks: z.array(akiflowTask).default([]),
  events: z.array(akiflowEvent).default([]),
})

// A task's tag may be a plain title string, {title}, {name}, or an orphaned {id} whose
// title only exists in the dump's top-level tags list (or nowhere, for deleted tags).
function resolveTag(tag: unknown, tagTitles: Map<string, string>): string | null {
  if (typeof tag === 'string') return tag
  if (tag && typeof tag === 'object') {
    const t = tag as { title?: unknown; name?: unknown; id?: unknown }
    if (typeof t.title === 'string') return t.title
    if (typeof t.name === 'string') return t.name
    if (typeof t.id === 'string') return tagTitles.get(t.id) ?? null
  }
  return null // deleted tag — full ref survives in external_ref.raw
}

export function parseAkiflow(json: unknown): ImportBatch {
  const dump = akiflowDump.parse(json)
  const rawItems = json as { projects?: unknown[]; tasks?: unknown[]; events?: unknown[] }
  const tagTitles = new Map(dump.tags.map((t) => [t.id, t.title]))

  const projects = dump.projects.map((p, i) => ({
    name: p.name,
    external_ref: { source: 'akiflow', id: p.id, raw: (rawItems.projects?.[i] ?? p) as Record<string, unknown> },
  }))

  const tasks: ImportTask[] = dump.tasks.map((t, i) => {
    const scheduledStart = t.datetime ? naiveLocalToUtc(t.datetime) : null
    const scheduledEnd = scheduledStart
      ? new Date(new Date(scheduledStart).getTime() + (t.duration ?? 30) * 60_000).toISOString()
      : null
    const dueAt = t.deadline
      ? naiveLocalToUtc(t.deadline)
      : (scheduledStart ?? (t.date ? naiveLocalToUtc(t.date) : null))
    return {
      title: t.title,
      notes: t.description ? stripBreaks(t.description) : null,
      priority: mapPriority(t.priority),
      duration_min: t.duration ?? null,
      due_at: dueAt,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      someday: t.status === 'someday',
      done: t.done === true,
      completed_at: t.done && t.done_at ? naiveLocalToUtc(t.done_at) : null,
      labels: (t.tags ?? []).map((tag) => resolveTag(tag, tagTitles)).filter((l): l is string => l !== null),
      sourceProjectId: t.project_id ?? null,
      external_ref: { source: 'akiflow', id: t.id, raw: (rawItems.tasks?.[i] ?? t) as Record<string, unknown> },
    }
  })

  const events: ImportEvent[] = dump.events.map((e, i) => ({
    title: e.title,
    starts_at: naiveLocalToUtc(e.start),
    ends_at: naiveLocalToUtc(e.end),
    all_day: e.all_day === true,
    external_ref: { source: 'akiflow', id: e.id, raw: (rawItems.events?.[i] ?? e) as Record<string, unknown> },
  }))

  return { ...emptyBatch('akiflow'), projects, tasks, events }
}
