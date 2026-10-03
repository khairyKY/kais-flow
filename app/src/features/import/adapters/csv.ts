// Generic CSV adapter — the universal fallback, and Notion's database export (same mapping step,
// Notion-aware defaults). parseCsv is a minimal RFC 4180 reader (quotes, escaped quotes, CRLF,
// a leading BOM); csvToBatch applies a user-chosen column → field mapping.
// CSV rows have no stable source id, so external_ref.id = hash(title+due+project)
// (the wizard says so in the preview). Pure, no app imports.

import {
  type ImportBatch, type ImportTask,
  mapPriority, stableHash, parseLooseDate, eachChunked, emptyBatch,
} from './shared'

export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '') // Notion/Excel exports start with a BOM — it would glue onto the first header
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

/** Notion's cell shapes, harmless elsewhere: a relation reads "Garden (https://www.notion.so/…)",
 *  a date range "October 5, 2026 → October 7, 2026" (the start is the due date). */
function clean(v: string): string {
  return v.replace(/\s*\(https?:\/\/[^)]*\)/g, '').split('→')[0].trim()
}

export async function csvToBatch(rows: string[][], mapping: CsvMapping, source: 'csv' | 'notion' = 'csv', now: Date = new Date()): Promise<ImportBatch> {
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
  await eachChunked(data, (r) => {
    const title = cell(r, 'title')
    if (!title) return
    const projectCell = clean(cell(r, 'project'))
    const project = (source === 'notion' ? projectCell.split(',')[0].trim() : projectCell) || null // a Notion multi-relation keeps its first
    const due = parseLooseDate(clean(cell(r, 'due')), now)
    const id = stableHash(`${title}|${due ?? ''}|${project ?? ''}`)
    if (seen.has(id)) return // ponytail: identical title+due+project rows collapse to one
    seen.add(id)
    if (project) projectNames.add(project)
    const done = /^(true|yes|1|done|x|complete|completed|checked)$/i.test(cell(r, 'done'))
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
      external_ref: { source, id, raw },
    })
  }, 50) // chrono reads every date cell — small chunks keep each blocking slice short

  const projects = [...projectNames].map((name) => ({
    name,
    external_ref: { source, id: `project:${name}`, raw: { name } },
  }))

  return { ...emptyBatch(source), projects, tasks }
}

/** Guess a mapping from header names — the user confirms/edits it in the mapping step. One column
 *  per field (the first wins), and Notion's bookkeeping columns ("Created time", "Last edited",
 *  "Date Created") never pass for the due date. */
export function guessMapping(headers: string[]): CsvMapping {
  const m: CsvMapping = {}
  const taken = new Set<CsvTarget>()
  const set = (i: number, t: CsvTarget) => { if (!taken.has(t)) { m[i] = t; taken.add(t) } }
  headers.forEach((h, i) => {
    const k = h.trim().toLowerCase()
    if (/created|edited|updated|modified/.test(k)) return
    if (/^(title|task|name|summary|task name)$/.test(k)) set(i, 'title')
    else if (/note|description|content/.test(k)) set(i, 'notes')
    else if (/due|date|deadline/.test(k)) set(i, 'due')
    else if (/priority/.test(k)) set(i, 'priority')
    else if (/project|list/.test(k)) set(i, 'project')
    else if (/duration|estimate/.test(k)) set(i, 'duration')
    else if (/done|complete|status|checkbox/.test(k)) set(i, 'done')
    else if (/label|tag/.test(k)) set(i, 'labels')
  })
  return m
}
