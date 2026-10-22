// Paper capture — the pure half: resize maths, box → crop, confidence buckets, the daily cap, which
// captures to read again, and the results sheet → the writes "Add all" makes. Tested in paperMath.test.ts.
import { parseCommand } from '../command-bar/parseCommand'
import { cairoDateKey, zoneDateKey } from '../../lib/dateShortcuts'
import { DEFAULT_ZONE } from '../../lib/appZone'
import type { Project } from '../../lib/types'
import type { MoveTarget } from '../tasks/move'

/** What the `capture-image` function stores per line (supabase/functions/capture-image/read.ts). */
export type LineType = 'task' | 'event' | 'note' | 'journal'
export interface PageLine {
  text: string
  type: LineType
  when: string | null
  project: string | null
  confidence: number
  box: [number, number, number, number] | null
  page: number
  /** A checkbox on the line: ticked, empty, or none (absent on lines read before the ticks loop). */
  checked?: boolean | null
  /** 1 (most urgent) – 3, when the page marks the line (!, ★, "urgent"); absent on older reads. */
  priority?: number | null
  /** Set in review (the app writes it back on the row): where the line went, or dismissed. Absent: still to review. */
  done?: LineDone
}

/** A reviewed line: added (`to` and the row it became) or 'skipped' — dismissed, not wanted. */
export type LineDone = { to: Planned['to']; id: string } | 'skipped'

/** A line's key in review, `page:index` (its place in `items`, which the app never reorders). */
export const lineKey = (line: Pick<PageLine, 'page'>, index: number) => `${line.page}:${index}`

/** A drawing the read skipped (11e "1 drawing skipped (…) · Add as image"; capture-image/read.ts). */
export interface PageDrawing {
  what: string | null
  box: [number, number, number, number] | null
  page: number
}

export interface CaptureRow {
  id: string
  user_id?: string
  storage_paths: string[]
  pages: number
  pages_read: number
  status: 'queued' | 'reading' | 'done' | 'failed'
  error: 'daily_limit' | 'rate_limited' | 'unreadable' | 'upstream' | null
  title: string | null
  items: PageLine[]
  /** Absent until migration 0070 and on reads made before it. */
  drawings?: PageDrawing[]
  reviewed_at: string | null
  expires_at: string
  photos_deleted_at: string | null
  created_at: string
  updated_at: string
}

// ── resize (≤1600px long edge, JPEG ~250 KB) ──
export const MAX_EDGE = 1600
export const TARGET_BYTES = 250 * 1024
export const MAX_PAGES = 5
export const DAILY_PAGES = 15

/** The size an image is drawn at: the long edge capped at `max`, never enlarged, aspect kept. */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** The canvas for a drawn size turned by `deg` (0/90/180/270): quarter turns swap the sides. */
export function rotatedSize(w: number, h: number, deg: number): { w: number; h: number } {
  return (((deg % 360) + 360) % 360) % 180 === 0 ? { w, h } : { w: h, h: w }
}

/** JPEG qualities tried in turn until the page fits TARGET_BYTES (the last one is kept regardless). */
export const QUALITIES = [0.82, 0.72, 0.62, 0.5] as const

// ── box → crop ──
/** A crop of `box` (0–1, [x,y,w,h]) from an image `natW`×`natH`, shown `height` px tall (shorter if
 * that would be wider than `maxWidth`): the frame's size and where the full image sits inside it
 * (overflow hidden). `pad` widens the box a little so a descender isn't clipped; the frame never
 * reaches past the image. */
export function cropFrame(
  box: readonly [number, number, number, number],
  natW: number,
  natH: number,
  height: number,
  maxWidth = Infinity,
  pad = 0.012,
): { width: number; height: number; imgWidth: number; imgLeft: number; imgTop: number } {
  const x = Math.max(0, box[0] - pad)
  const y = Math.max(0, box[1] - pad)
  const w = Math.min(1 - x, box[2] + 2 * pad)
  const h = Math.min(1 - y, box[3] + 2 * pad)
  height = Math.min(height, (maxWidth * h * natH) / (w * natW))
  const scale = height / (h * natH) // CSS px per image px
  const r = (n: number) => Math.round(n * 10) / 10 || 0 // no -0
  return { width: r(w * natW * scale), height: r(height), imgWidth: r(natW * scale), imgLeft: r(-x * natW * scale), imgTop: r(-y * natH * scale) }
}

// ── confidence ──
/** Below this a line shows its handwriting and the "check this" tint (11e). */
export const CHECK_BELOW = 0.7
export const needsCheck = (line: Pick<PageLine, 'confidence'>) => line.confidence < CHECK_BELOW

// ── the daily cap (the server counts; this is what the app shows and when it asks again) ──
export function scansLeft(used: number, limit = DAILY_PAGES): number {
  return Math.max(0, limit - used)
}

/** Read a queued/half-read capture again? Never one already reviewed; a daily-limit one only on a
 * later Cairo day (the server's quota day, whatever the user's zone); a "reading" one only once it has sat still 2 minutes (another device may be on it). */
export function shouldResume(row: Pick<CaptureRow, 'status' | 'error' | 'reviewed_at' | 'updated_at' | 'pages_read' | 'pages' | 'storage_paths'>, now: Date): boolean {
  if (row.reviewed_at || row.pages_read >= row.pages || row.storage_paths.length === 0) return false
  if (row.status === 'queued') return row.error !== 'daily_limit' || zoneDateKey(new Date(row.updated_at), DEFAULT_ZONE) !== zoneDateKey(now, DEFAULT_ZONE)
  if (row.status === 'reading') return now.getTime() - new Date(row.updated_at).getTime() > 2 * 60_000
  return false
}

// ── a line → its proposed item ──
/** A clock time in the date words ("11:59pm", "17:00", "5 pm", "noon")? Without one an event is all-day. */
export function hasClock(when: string | null): boolean {
  return !!when && /\b\d{1,2}(:\d{2})\s*(am|pm)?\b|\b\d{1,2}\s*(am|pm)\b|\b(noon|midnight)\b/i.test(when)
}

/** The project a page's guess names: exact, then one name inside the other (≥ 2 letters). */
export function matchProject(guess: string | null, projects: readonly Project[]): Project | null {
  const g = guess?.trim().toLowerCase()
  if (!g || g.length < 2) return null
  return (
    projects.find((p) => p.name.toLowerCase() === g) ??
    projects.find((p) => p.name.toLowerCase().includes(g) || (p.name.length >= 2 && g.includes(p.name.toLowerCase()))) ??
    null
  )
}

export interface EditLine {
  key: string
  text: string
  type: LineType
  dueAt: string | null
  timed: boolean
  projectId: string | null
  domainId: string | null
  /** The chip's label: the matched project's name, else the page's own word. */
  projectLabel: string | null
  /** Set only when the user moves the line to an area (the project chip's Move to…). */
  areaId: string | null
  priority: number | null
  confidence: number
  box: PageLine['box']
  page: number
  done: LineDone | null
}

/** What the user changed on a line before adding it (the chips, the text). */
export type LineEdit = Partial<Pick<EditLine, 'text' | 'type' | 'dueAt' | 'timed' | 'projectId' | 'domainId' | 'areaId' | 'projectLabel' | 'priority'>>

/** The project chip's Move to… pick, as a line edit (tasks/move's places: project, area, domain, none). */
export function placeEdit(to: MoveTarget): LineEdit {
  if (to.kind === 'project') return { projectId: to.id, areaId: null, domainId: to.domainId, projectLabel: to.name }
  if (to.kind === 'area') return { projectId: null, areaId: to.id, domainId: to.domainId, projectLabel: to.name }
  if (to.kind === 'domain') return { projectId: null, areaId: null, domainId: to.id, projectLabel: to.name }
  return { projectId: null, areaId: null, domainId: null, projectLabel: null }
}

/** The same edit on every key (a selection's bulk Type / Date / Project / Drop). */
export function editLines(edits: Readonly<Record<string, LineEdit>>, keys: Iterable<string>, patch: LineEdit): Record<string, LineEdit> {
  const next = { ...edits }
  for (const k of keys) next[k] = { ...next[k], ...patch }
  return next
}

/** Long-press selection: one line in or out. */
export function toggleKey(sel: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(sel)
  if (!next.delete(key)) next.add(key)
  return next
}

// ── the quick look's page strip (11c "hold to reorder") ──
/** Page `from` dropped on page `to`'s place; the page on screen stays on screen. */
export function movePage<T>(pages: readonly T[], active: number, from: number, to: number): { pages: T[]; active: number } {
  const n = pages.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return { pages: [...pages], active }
  const next = [...pages]
  next.splice(to, 0, ...next.splice(from, 1))
  const at = active === from ? to : from < active && active <= to ? active - 1 : to <= active && active < from ? active + 1 : active
  return { pages: next, active: at }
}

// ── HEIC (iPhone photos) ──
/** A HEIC/HEIF photo, by type or — when the browser gives none (Chromium on Windows) — by name. Safari
 * decodes them (preparePage makes the JPEG); elsewhere the quick look shows "Convert it to JPEG first". */
export function isHeic(f: { type: string; name?: string }): boolean {
  return /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name ?? '')
}

/** A stored line, read against the user's projects and the moment the photo was taken. */
export function toEditLine(line: PageLine, index: number, projects: readonly Project[], takenAt: Date): EditLine {
  const dueAt = line.when ? parseCommand(line.when, [], [], { zone: 'cairo', now: takenAt }).dueAt : null
  const project = matchProject(line.project, projects)
  return {
    key: lineKey(line, index),
    text: line.text,
    type: line.type,
    dueAt,
    timed: hasClock(line.when),
    projectId: project?.id ?? null,
    domainId: project?.domain_id ?? null,
    projectLabel: project?.name ?? line.project,
    areaId: null,
    priority: line.priority ?? null,
    confidence: line.confidence,
    box: line.box,
    page: line.page,
    done: line.done ?? null,
  }
}

/** `keys`: the lines each write comes from (the journal entry joins several). */
export type Planned = { keys: string[] } & (
  | { to: 'task'; title: string; dueAt: string | null; projectId: string | null; domainId: string | null; areaId: string | null; priority: number | null; ref: string }
  | { to: 'event'; title: string; startsAt: string; endsAt: string; allDay: boolean }
  | { to: 'inbox'; line: EditLine }
  | { to: 'journal'; body: string }
)

const HOUR = 60 * 60_000

/** "Add all" (`mode` 'all') or "Inbox only": what each kept line becomes. An event needs a date (a
 * timed one is an hour, an untimed one all-day); without one it waits in the Inbox with its read
 * attached, like a note. Journal lines join into one entry. `ref` links a task back to its photo. */
export function planWrites(lines: readonly EditLine[], captureId: string, mode: 'all' | 'inbox'): Planned[] {
  if (mode === 'inbox') return lines.map((line) => ({ to: 'inbox', line, keys: [line.key] }))
  const out: Planned[] = []
  const journal: EditLine[] = []
  for (const line of lines) {
    const keys = [line.key]
    if (line.type === 'task') {
      out.push({ to: 'task', title: line.text, dueAt: line.dueAt, projectId: line.projectId, domainId: line.domainId, areaId: line.areaId, priority: line.priority, ref: `${captureId}:${line.key}`, keys })
    } else if (line.type === 'event' && line.dueAt) {
      if (line.timed) {
        out.push({ to: 'event', title: line.text, startsAt: line.dueAt, endsAt: new Date(new Date(line.dueAt).getTime() + HOUR).toISOString(), allDay: false, keys })
      } else {
        const day = cairoDateKey(new Date(line.dueAt))
        const next = new Date(`${day}T00:00:00.000Z`)
        next.setUTCDate(next.getUTCDate() + 1)
        out.push({ to: 'event', title: line.text, startsAt: `${day}T00:00:00.000Z`, endsAt: next.toISOString(), allDay: true, keys })
      }
    } else if (line.type === 'journal') {
      journal.push(line)
    } else {
      out.push({ to: 'inbox', line, keys })
    }
  }
  if (journal.length) out.push({ to: 'journal', body: journal.map((l) => l.text).join('\n'), keys: journal.map((l) => l.key) })
  return out
}

/** `items` with review marks set by line key (`undefined`: back to review); other lines untouched. */
export function markItems(items: readonly PageLine[], marks: Readonly<Record<string, LineDone | undefined>>): PageLine[] {
  return items.map((it, i) => {
    const k = lineKey(it, i)
    return k in marks ? { ...it, done: marks[k] } : it
  })
}

/** The lines still to review — of `only`, when given (the new scribbles left after a Notebook page's ticks). */
export function pendingKeys(items: readonly PageLine[], only?: readonly string[]): string[] {
  return items.flatMap((it, i) => (!it.done && (!only || only.includes(lineKey(it, i))) ? [lineKey(it, i)] : []))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The toast after adding (11g): "Added 5 tasks · 2 notes". */
export function addedSummary(plan: readonly Planned[]): string {
  const n = (to: Planned['to']) => plan.filter((p) => p.to === to).length
  const parts = [
    n('task') && plural(n('task'), 'task'),
    n('event') && plural(n('event'), 'event'),
    n('inbox') && plural(n('inbox'), 'note'),
    n('journal') && 'a journal entry',
  ].filter(Boolean)
  return `Added ${parts.join(' · ') || 'nothing'}`
}
