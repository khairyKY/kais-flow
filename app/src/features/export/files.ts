// "Export your data" (Settings → Your data, gap audit #1): the three files, built from rows already
// fetched. Pure — api.ts fetches, save.ts hands the file to the platform. Restoring is not a thing.
import { zoneDateKey } from '../../lib/dateShortcuts'
import { zoneTimeKey } from '../calendar/eventTime'
import { PRIORITY_LABELS } from '../tasks/taskMenuSpec'
import { ruleStamp, toFloating } from '../../../../supabase/functions/_shared/series.ts'
import type { Area, CalendarEvent, Domain, Project, Task } from '../../lib/types'

export type ExportKind = 'json' | 'csv' | 'ics'

export const EXPORT_TYPES: Record<ExportKind, string> = {
  json: 'application/json',
  csv: 'text/csv;charset=utf-8',
  ics: 'text/calendar;charset=utf-8',
}

/** kais-flow-2026-10-17.json · kais-flow-tasks-….csv · kais-flow-calendar-….ics (the user's day). */
export function exportFileName(kind: ExportKind, now: Date, zone: string): string {
  const day = zoneDateKey(now, zone)
  return kind === 'json' ? `kais-flow-${day}.json` : kind === 'csv' ? `kais-flow-tasks-${day}.csv` : `kais-flow-calendar-${day}.ics`
}

/** The .json file's shape: every table as its rows (Trash rows included, marked by `deleted_at`). */
export function exportEnvelope(tables: Record<string, unknown[]>, version: string, now: Date) {
  return { app: "Kai's Flow", version, exported_at: now.toISOString(), tables }
}

// ── Tasks (.csv) ──

/** One CSV field (RFC 4180). Text starting with = + - @ (or a tab / CR) gets a leading ' so Excel
 * and Sheets show it instead of running it as a formula — a GitHub issue or a captured page can
 * name a task. */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvRow = (cells: (string | number | null | undefined)[]): string => cells.map(csvCell).join(',')

export const TASK_CSV_HEADER = ['Title', 'Status', 'Due date', 'Scheduled start', 'Scheduled end', 'Duration (min)', 'Priority', 'Labels', 'Project', 'Area', 'Domain', 'Parent task', 'Notes', 'Created', 'Completed']
const STATUS: Record<string, string> = { todo: 'To do', done: 'Done', cancelled: 'Cancelled' }

/** "2026-10-17 09:30" on the user's clock — a date-time Excel and Sheets read as one. */
function wall(iso: string | null | undefined, zone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${zoneDateKey(d, zone)} ${zoneTimeKey(d, zone)}`
}

interface Named {
  id: string
  name: string
}

/** The whole .csv: a UTF-8 BOM (Excel then reads Arabic and emoji right), the header, one row per
 * task not in Trash — names, not ids. CRLF, as RFC 4180 and Excel expect. */
export function tasksCsv(tasks: readonly Task[], lists: { projects: readonly Project[]; areas: readonly Area[]; domains: readonly Domain[] }, zone: string): string {
  const names = (rows: readonly Named[]) => new Map(rows.map((r) => [r.id, r.name]))
  const project = names(lists.projects)
  const area = names(lists.areas)
  const domain = names(lists.domains)
  const title = new Map(tasks.map((t) => [t.id, t.title]))
  const name = (m: Map<string, string>, id: string | null | undefined) => (id ? (m.get(id) ?? '') : '')
  const rows = tasks
    .filter((t) => !t.deleted_at)
    .map((t) =>
      csvRow([
        t.title,
        STATUS[t.status] ?? t.status,
        t.due_at ? zoneDateKey(new Date(t.due_at), zone) : '',
        wall(t.scheduled_start, zone),
        wall(t.scheduled_end, zone),
        t.duration_min,
        t.priority == null ? '' : (PRIORITY_LABELS[t.priority] ?? t.priority),
        (t.labels ?? []).join(', '),
        name(project, t.project_id),
        name(area, t.area_id),
        name(domain, t.domain_id),
        name(title, t.parent_task_id),
        t.notes,
        wall(t.created_at, zone),
        wall(t.completed_at, zone),
      ]),
    )
  return '\uFEFF' + [csvRow(TASK_CSV_HEADER), ...rows].join('\r\n') + '\r\n'
}

// ── Calendar (.ics, RFC 5545) ──

/** TEXT value escaping (§3.3.11): backslash, ; and , escaped, newlines as \n. */
export const icsText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n|\r/g, '\\n')

/** Folds a content line at 75 octets (§3.1): CRLF + one space, never inside a UTF-8 character. */
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  let out = ''
  let used = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (used + n > 75) {
      out += '\r\n '
      used = 1
    }
    out += ch
    used += n
  }
  return out
}

const compactDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')
/** A floating stamp (wall clock read as UTC fields), no Z: "20261017T093000". */
const wallStamp = (ms: number): string => ruleStamp(ms).replace(/Z$/, '')
const HALF_DAY = 43_200_000
const DAY = 86_400_000

/** The VEVENT lines for one stored row. A one-off is in UTC. An all-day row is a date in no zone
 * (stored as that date's UTC midnight, `ends_at` the next day's). A repeating timed row runs on the
 * user's wall clock (calendar/series.ts), so its start, end and skipped starts carry TZID=<zone> and
 * the rule repeats at 09:00 through a DST switch, as the app draws it; its UNTIL is already UTC. */
function vevent(e: CalendarEvent, zone: string, stamp: string): string[] {
  const s = Date.parse(e.starts_at)
  const end = Date.parse(e.ends_at)
  const rule = e.recurrence_rule?.replace(/^RRULE:/i, '').trim() || null
  const skips = (e.recurrence_exdates ?? []).map((x) => Date.parse(x)).filter((x) => !Number.isNaN(x))
  const lines = ['BEGIN:VEVENT', `UID:${e.id}`, `DTSTAMP:${stamp}`]
  if (e.all_day) {
    // The last day the block covers (end − ½ day, replan.ts's reading), then the exclusive next day.
    const last = Math.max(s, end - HALF_DAY)
    lines.push(`DTSTART;VALUE=DATE:${compactDate(s)}`, `DTEND;VALUE=DATE:${compactDate(last + DAY)}`)
    if (rule && skips.length) lines.push(`EXDATE;VALUE=DATE:${skips.map(compactDate).join(',')}`)
  } else if (rule) {
    // ponytail: TZID names the IANA zone with no VTIMEZONE block. Google, Apple and Outlook read
    // IANA names; a strict validator wants a VTIMEZONE — generate one from Intl if that matters.
    const at = (ms: number) => `TZID=${zone}:${wallStamp(toFloating(ms, zone))}`
    lines.push(`DTSTART;${at(s)}`, `DTEND;${at(end)}`)
    if (skips.length) lines.push(`EXDATE;TZID=${zone}:${skips.map((x) => wallStamp(toFloating(x, zone))).join(',')}`)
  } else {
    lines.push(`DTSTART:${ruleStamp(s)}`, `DTEND:${ruleStamp(end)}`)
  }
  if (rule) lines.push(`RRULE:${rule}`)
  lines.push(`SUMMARY:${icsText(e.title || 'Untitled')}`)
  if (e.busy === false) lines.push('TRANSP:TRANSPARENT')
  lines.push('END:VEVENT')
  return lines
}

/** The whole .ics: the user's own events, Time blocks and task blocks, not in Trash. Google's
 * (source 'gcal') are left out — they already live in Google. */
export function calendarIcs(events: readonly CalendarEvent[], zone: string, now: Date): string {
  const stamp = ruleStamp(now.getTime())
  const own = events.filter((e) => e.source !== 'gcal' && !e.deleted_at)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Kai's Flow//Export//EN", 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText("Kai's Flow")}`, ...own.flatMap((e) => vevent(e, zone, stamp)), 'END:VCALENDAR']
  return lines.map(icsFold).join('\r\n') + '\r\n'
}
