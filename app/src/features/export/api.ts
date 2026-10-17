// "Export your data": read with the person's own session (RLS scopes every table to them), 1000 rows
// a page (lib/fetchAll), build the file (./files) and hand it over (lib/platform saveFile).
import { supabase } from '../../lib/supabase'
import { fetchAll } from '../../lib/fetchAll'
import { INBOX_COLUMNS, TASK_COLUMNS } from '../../lib/columns'
import { appZone } from '../../lib/appZone'
import { saveFile } from '../../lib/platform'
import { BUNDLED_VERSION } from '../../lib/whatsNew'
import type { Area, CalendarEvent, Domain, Project, Task } from '../../lib/types'
import { calendarIcs, exportEnvelope, exportFileName, EXPORT_TYPES, tasksCsv, type ExportKind } from './files'

/** Every table a person owns. Left out: keys and tokens (integrations, mcp_keys, capture_keys,
 * push_subscriptions) and the server's own bookkeeping (ai_usage, ai_usage_global, embed_queue).
 * A new table belongs here. */
export const EXPORT_TABLES = [
  'app_settings', 'domains', 'areas', 'projects', 'tasks', 'inbox_items', 'calendar_events',
  'routines', 'routine_completions', 'time_entries', 'journal_entries', 'people', 'interactions',
  'books', 'notes', 'quotes', 'commentary', 'captures', 'resurfaced_log', 'activity_log',
] as const

// tasks / inbox_items: every column but the search ones (lib/columns.ts — the embeddings are ~4.5 KB a row).
const COLUMNS: Record<string, string> = { tasks: TASK_COLUMNS, inbox_items: INBOX_COLUMNS }

/** "tasks", 1200 — after each page, for the row's "Exporting… tasks 1,200". */
export type ExportProgress = (table: string, rows: number) => void

function rowsOf<T>(table: string, progress?: ExportProgress): Promise<T[]> {
  const key = table === 'app_settings' ? 'user_id' : 'id' // app_settings' key is the user (0030)
  return fetchAll<T>(
    (from, to) => supabase.from(table).select(COLUMNS[table] ?? '*').order(key).range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>,
    (n) => progress?.(table, n),
  )
}

/** Builds the file and hands it over; resolves to its name and what became of it. */
export async function runExport(kind: ExportKind, progress?: ExportProgress): Promise<{ name: string; result: Awaited<ReturnType<typeof saveFile>> }> {
  const now = new Date()
  const zone = appZone()
  let text: string
  if (kind === 'json') {
    const tables: Record<string, unknown[]> = {}
    for (const t of EXPORT_TABLES) tables[t] = await rowsOf(t, progress)
    text = JSON.stringify(exportEnvelope(tables, BUNDLED_VERSION.replace(/^v/i, ''), now), null, 2)
  } else if (kind === 'csv') {
    const tasks = await rowsOf<Task>('tasks', progress)
    const projects = await rowsOf<Project>('projects', progress)
    const areas = await rowsOf<Area>('areas', progress)
    const domains = await rowsOf<Domain>('domains', progress)
    text = tasksCsv(tasks, { projects, areas, domains }, zone)
  } else {
    text = calendarIcs(await rowsOf<CalendarEvent>('calendar_events', progress), zone, now)
  }
  const name = exportFileName(kind, now, zone)
  return { name, result: await saveFile(name, EXPORT_TYPES[kind], text) }
}
