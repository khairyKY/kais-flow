// Generic CSV adapter — the universal fallback. parseCsv is a minimal RFC 4180 reader
// (quotes, escaped quotes, CRLF); csvToBatch applies a user-chosen column → field mapping.
// CSV rows have no stable source id, so external_ref.id = hash(title+due+project)
// (the wizard says so in the preview). Pure, no app imports.

import {
  type ImportBatch, type ImportTask,
  naiveLocalToUtc, mapPriority, stableHash,
} from './shared'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

/** Task fields a CSV column can map onto. */
export const CSV_TARGETS = ['title', 'notes', 'due', 'priority', 'project', 'duration', 'done', 'labels'] as const
export type CsvTarget = (typeof CSV_TARGETS)[number]
/** column index → target field ('title' required to import). */
export type CsvMapping = Record<number, CsvTarget>

function parseDue(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(v)) return naiveLocalToUtc(v.replace(' ', 'T'))
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function csvToBatch(rows: string[][], mapping: CsvMapping): ImportBatch {
  const [, ...data] = rows // row 0 = headers
  const col = (target: CsvTarget) => {
    const e = Object.entries(mapping).find(([, t]) => t === target)
    return e ? Number(e[0]) : null
  }
  const cols = Object.fromEntries(CSV_TARGETS.map((t) => [t, col(t)])) as Record<CsvTarget, number | null>
  const cell = (r: string[], t: CsvTarget) => (cols[t] == null ? '' : (r[cols[t]!] ?? '').trim())

  const seen = new Set<string>()
  const projectNames = new Set<string>()
  const tasks: ImportTask[] = []
  for (const r of data) {
    const title = cell(r, 'title')
    if (!title) continue
    const project = cell(r, 'project') || null
    const due = parseDue(cell(r, 'due'))
    const id = stableHash(`${title}|${due ?? ''}|${project ?? ''}`)
    if (seen.has(id)) continue // ponytail: identical title+due+project rows collapse to one
    seen.add(id)
    if (project) projectNames.add(project)
    const done = /^(true|yes|1|done|x|completed)$/i.test(cell(r, 'done'))
    const duration = parseInt(cell(r, 'duration'), 10)
    const raw = Object.fromEntries(rows[0].map((h, i) => [h || `col${i}`, r[i] ?? '']))
    tasks.push({
      title,
      notes: cell(r, 'notes') || null,
      priority: mapPriority(cell(r, 'priority') || null),
      duration_min: Number.isFinite(duration) ? duration : null,
      due_at: due,
      scheduled_start: null,
      scheduled_end: null,
      someday: false,
      done,
      completed_at: null,
      labels: cell(r, 'labels') ? cell(r, 'labels').split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [],
      sourceProjectId: project,
      external_ref: { source: 'csv', id, raw },
    })
  }

  const projects = [...projectNames].map((name) => ({
    name,
    external_ref: { source: 'csv', id: `project:${name}`, raw: { name } },
  }))

  return { source: 'csv', projects, tasks, events: [] }
}

/** Guess a mapping from header names — the user confirms/edits it in the mapping step. */
export function guessMapping(headers: string[]): CsvMapping {
  const m: CsvMapping = {}
  headers.forEach((h, i) => {
    const k = h.trim().toLowerCase()
    if (/^(title|task|name|summary)$/.test(k)) m[i] = 'title'
    else if (/note|description|content/.test(k)) m[i] = 'notes'
    else if (/due|date|deadline/.test(k)) m[i] = 'due'
    else if (/priority/.test(k)) m[i] = 'priority'
    else if (/project|list/.test(k)) m[i] = 'project'
    else if (/duration|estimate/.test(k)) m[i] = 'duration'
    else if (/done|complete|status/.test(k)) m[i] = 'done'
    else if (/label|tag/.test(k)) m[i] = 'labels'
  })
  return m
}
