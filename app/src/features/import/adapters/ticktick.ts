// TickTick adapter — the web app's backup CSV (Settings → Account → Backup & Restore). The file
// opens with a few metadata lines ("Date: …", "Version: …", a quoted multi-line "Status: …"
// legend) before the real header row; we look for the header instead of counting lines.
// Pure, no app imports.
//
// Field mapping (TickTick column → app):
//   List Name                 → project ("Inbox" → no project); Folder Name → raw only
//   Title / Content           → title / notes (checklist ▫/▪ items → "- [ ]"/"- [x]" lines)
//   Kind NOTE                 → a note (notes table), not a task
//   Tags                      → labels
//   Start Date / Due Date     → due_at; a timed task with start < due → scheduled_start/_end + duration;
//                               "Is All Day" → that calendar day's midnight (user's zone)
//   Repeat "RRULE:FREQ=…"     → recurrence_rule
//   Priority 5/3/1/0          → 1/2/3/null (high/medium/low/none)
//   Status 1|2, Completed Time → done + completed_at (2 = completed and archived)
//   taskId / parentId         → external_ref.id / subtask of
//   everything else (Reminder, Order, Column, View Mode, …) → external_ref.raw

import { parseCsv } from './csv'
import {
  type ImportBatch, type ImportTask, type ImportNote,
  naiveLocalToUtc, dayIn, stableHash, zoneOr, eachChunked, emptyBatch,
} from './shared'

const PRIORITY: Record<string, number> = { '5': 1, '3': 2, '1': 3 }

/** "2026-10-05T09:00:00+0000" → ISO; null when blank/unreadable. */
function instant(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** The calendar day an instant falls on in `tz`, as that day's midnight on the user's clock. */
function dayOf(iso: string, tz: string): string {
  return naiveLocalToUtc(dayIn(tz, new Date(iso)))
}

export async function parseTickTick(text: string): Promise<ImportBatch> {
  const rows = parseCsv(text)
  const h = rows.findIndex((r) => r.includes('Title') && r.includes('List Name'))
  if (h < 0) throw new Error('not a TickTick backup')
  const header = rows[h]
  const col = (name: string) => header.indexOf(name)
  const C = {
    list: col('List Name'), title: col('Title'), kind: col('Kind'), tags: col('Tags'), content: col('Content'),
    checklist: col('Is Check list'), start: col('Start Date'), due: col('Due Date'), repeat: col('Repeat'),
    priority: col('Priority'), status: col('Status'), completed: col('Completed Time'), tz: col('Timezone'),
    allDay: col('Is All Day'), id: col('taskId'), parent: col('parentId'),
  }

  const projects = new Set<string>()
  const tasks: ImportTask[] = []
  const notes: ImportNote[] = []
  await eachChunked(rows.slice(h + 1), (r) => {
    const cell = (i: number) => (i < 0 ? '' : (r[i] ?? '').trim())
    const title = cell(C.title)
    if (!title) return
    const raw = Object.fromEntries(header.map((name, i) => [name, r[i] ?? '']))
    const id = cell(C.id) || stableHash(`${cell(C.list)}|${title}|${cell(C.due)}`)
    const labels = cell(C.tags).split(/[,;]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
    let body = cell(C.content)
    if (cell(C.checklist) === 'Y') body = body.replace(/▫\s*/g, '- [ ] ').replace(/▪\s*/g, '- [x] ')

    if (cell(C.kind).toUpperCase() === 'NOTE') {
      notes.push({ title, body: body || title, tags: labels, book: null, external_ref: { source: 'ticktick', id, raw } })
      return
    }

    const list = cell(C.list)
    const project = list && list.toLowerCase() !== 'inbox' ? list : null
    if (project) projects.add(project)

    const tz = zoneOr(cell(C.tz))
    const start = instant(cell(C.start))
    const due = instant(cell(C.due))
    const allDay = cell(C.allDay).toLowerCase() === 'true'
    const timed = !allDay && start && due && start < due
    const done = cell(C.status) === '1' || cell(C.status) === '2'
    const rule = cell(C.repeat).split(/\r?\n/).find((l) => /FREQ=/.test(l))?.replace(/^RRULE:/, '').trim() ?? null

    tasks.push({
      title,
      notes: body || null,
      priority: PRIORITY[cell(C.priority)] ?? null,
      duration_min: timed ? Math.round((new Date(due).getTime() - new Date(start).getTime()) / 60_000) : null,
      due_at: allDay && (due ?? start) ? dayOf((due ?? start)!, tz) : (start ?? due),
      scheduled_start: timed ? start : null,
      scheduled_end: timed ? due : null,
      someday: false,
      done,
      completed_at: done ? instant(cell(C.completed)) : null,
      labels,
      sourceProjectId: project ? `project:${project}` : null,
      recurrence_rule: rule,
      sourceParentId: cell(C.parent) || null,
      external_ref: { source: 'ticktick', id, raw },
    })
  })

  return {
    ...emptyBatch('ticktick'),
    projects: [...projects].map((name) => ({ name, external_ref: { source: 'ticktick', id: `project:${name}`, raw: { name } } })),
    tasks,
    notes,
  }
}
