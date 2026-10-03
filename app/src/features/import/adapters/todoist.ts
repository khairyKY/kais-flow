// Todoist adapter — the per-project CSV export ("Export as a template" → CSV). One file = one
// project, named after the file. Pure, no app imports.
//
// Field mapping (Todoist column → app):
//   TYPE task                → tasks; `section` rows set the label of the tasks under them;
//                              `note` rows (comments) append to the previous task's notes; `meta` skipped
//   CONTENT                  → title, minus its inline `@labels` (→ labels)
//   DESCRIPTION              → notes
//   PRIORITY 1/2/3/4         → 1/2/3/null — Todoist's CSV writes p1 as 1 (its help page), the same
//                              way round as ours (1 = "!!!"); p4 is "no priority"
//   INDENT 2+                → a subtask of the task above it (one level deep, like the app)
//   DATE (natural language)  → due_at via chrono on TIMEZONE's wall clock (Cairo when blank);
//                              "every …" → recurrence_rule, due = its next occurrence (exports drop
//                              the start date) or today
//   DEADLINE                 → due_at when present (the Akiflow rule: deadline beats date)
//   DURATION + _UNIT minute  → duration_min
//   AUTHOR, RESPONSIBLE, DATE_LANG, … → external_ref.raw (the whole row)
// Completed tasks aren't in Todoist's export. No row ids either, so external_ref.id =
// hash(file + section + content + nth repeat of that content).

import { parseCsv } from './csv'
import {
  type ImportBatch, type ImportTask,
  mapPriority, stableHash, parseLooseDate, parseRecurrence, todayMidnight, zoneOr, eachChunked, emptyBatch,
} from './shared'

export async function parseTodoist(text: string, fileName: string, now: Date = new Date()): Promise<ImportBatch> {
  const [header = [], ...rows] = parseCsv(text)
  const col = (name: string) => header.findIndex((h) => h.trim().toUpperCase() === name)
  const C = { type: col('TYPE'), content: col('CONTENT'), description: col('DESCRIPTION'), priority: col('PRIORITY'), indent: col('INDENT'), date: col('DATE'), timezone: col('TIMEZONE'), duration: col('DURATION'), unit: col('DURATION_UNIT'), deadline: col('DEADLINE') }
  if (C.type < 0 || C.content < 0) throw new Error('not a Todoist CSV export')

  const project = fileName.replace(/\.csv$/i, '').replace(/\s*\(\d+\)$/, '').trim() || 'Todoist'
  const projectId = `project:${project}`
  const tasks: ImportTask[] = []
  const seen = new Map<string, number>()
  const parents: string[] = [] // parents[indent] = source id of the latest task at that depth
  let section: string | null = null

  await eachChunked(rows, (r) => {
    const cell = (i: number) => (i < 0 ? '' : (r[i] ?? '').trim())
    const type = cell(C.type).toLowerCase()
    const content = cell(C.content)
    if (type === 'section') { section = content || null; return }
    if (type === 'note') {
      const last = tasks[tasks.length - 1]
      if (last && content) last.notes = last.notes ? `${last.notes}\n\n${content}` : content
      return
    }
    if (type !== 'task' || !content) return

    const labels = [...content.matchAll(/(?:^|\s)@([^\s@]+)/g)].map((m) => m[1])
    const title = content.replace(/(?:^|\s)@[^\s@]+/g, ' ').replace(/^\*\s+/, '').replace(/\s+/g, ' ').trim() || content
    const key = `${project}|${section ?? ''}|${content}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const id = stableHash(`${key}|${n}`)

    const tz = zoneOr(cell(C.timezone))
    const date = cell(C.date)
    const rule = /^every/i.test(date) ? parseRecurrence(date) : null
    let due: string | null
    if (/^every/i.test(date)) {
      const rest = date.replace(/^every!?\s+/i, '').replace(/^(other\s+|\d+\s+)?(day|week|month|year|weekday|workday)s?\b\s*(on\s+)?/i, '')
      due = parseLooseDate(rest, now, tz, true) ?? todayMidnight(now, tz)
    } else due = parseLooseDate(date, now, tz)
    const deadline = parseLooseDate(cell(C.deadline), now, tz)

    const indent = Math.max(1, parseInt(cell(C.indent), 10) || 1)
    parents[indent] = id
    parents.length = indent + 1
    const duration = parseInt(cell(C.duration), 10)

    tasks.push({
      title,
      notes: cell(C.description) || null,
      priority: mapPriority(cell(C.priority) || null),
      duration_min: Number.isFinite(duration) && /^min/i.test(cell(C.unit) || 'minute') ? duration : null,
      due_at: deadline ?? due,
      scheduled_start: null,
      scheduled_end: null,
      someday: false,
      done: false,
      completed_at: null,
      labels: section ? [...labels, section] : labels,
      sourceProjectId: projectId,
      recurrence_rule: rule,
      sourceParentId: indent > 1 ? (parents[indent - 1] ?? null) : null,
      external_ref: { source: 'todoist', id, raw: { ...Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])), project, section } },
    })
  }, 50) // chrono reads every DATE cell — small chunks keep each blocking slice short

  return { ...emptyBatch('todoist'), projects: [{ name: project, external_ref: { source: 'todoist', id: projectId, raw: { name: project, file: fileName } } }], tasks }
}
