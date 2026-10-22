import { zoneDateKey } from '../../lib/dateShortcuts'
import { addDays, dayShort, MONTHS, weekday } from '../../components/pickerMath'
import { timeRange, timeText } from '../calendar/eventTime'
import { dayWord } from '../tasks/taskSheetMath'
import { priorityFlag, resolveTag } from '../tasks/taskDisplay'
import { formatDuration } from '../projects/duration'
import { timeAgo } from '../people/timeAgo'
import type {
  Area, Book, CalendarEvent, Domain, InboxItem, Interaction, JournalEntry, Note, Person, Project, Quote, SearchEntityType, SearchHit, Task, TimeEntry,
} from '../../lib/types'

// Search 1a (design-export/Search.dc.html) — what /search shows for one answer: the groups and
// their chips, the rows (the hits plus "Related" rows), the two filters, and each row's lines.
// Pure: SearchPage renders it, the ⌘/ overlay reuses the groups, the tests read it. Rows are
// described from the app's own cached lists (every list is fetched whole), never from guesses.

export interface SearchGroup {
  /** Also the chip's id. */
  key: string
  label: string
  types: SearchEntityType[]
  tint: string
  dot: string
  /** Rows the All view shows before "Show all N →" (1a: Tasks 5 of 9, Journal 2 of 5). */
  peek: number
}

// Groups render in the export's order (1a: People, Tasks, Events, Journal, Projects); Inbox joins
// after Events, Areas after Projects (0054), Library last (0064 — books, notes and quotes in one).
export const SEARCH_GROUPS: SearchGroup[] = [
  { key: 'person', label: 'People', types: ['person'], tint: 'var(--acc-sage-text)', dot: 'var(--acc-clover)', peek: 3 },
  { key: 'task', label: 'Tasks', types: ['task'], tint: 'var(--acc-blossom-text)', dot: 'var(--acc-moss)', peek: 5 },
  { key: 'calendar_event', label: 'Events', types: ['calendar_event'], tint: 'var(--acc-lavender-text)', dot: 'var(--acc-lavender)', peek: 3 },
  { key: 'inbox_item', label: 'Inbox', types: ['inbox_item'], tint: 'var(--acc-hydrangea-deep)', dot: 'var(--acc-hydrangea)', peek: 3 },
  { key: 'journal_entry', label: 'Journal', types: ['journal_entry'], tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)', peek: 2 },
  { key: 'project', label: 'Projects', types: ['project'], tint: 'var(--acc-lavender-text)', dot: 'var(--acc-blossom)', peek: 3 },
  { key: 'area', label: 'Areas', types: ['area'], tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)', peek: 3 },
  { key: 'library', label: 'Library', types: ['book', 'note', 'quote'], tint: 'var(--acc-buttercream-text)', dot: 'var(--acc-buttercream)', peek: 3 },
]

/** The chips' own order in 1a: All · Tasks · Events · Inbox · Projects · Journal · People · Library. */
export const CHIP_ORDER = ['task', 'calendar_event', 'inbox_item', 'project', 'area', 'journal_entry', 'person', 'library']

// ── The data rows are described from ──

export interface SearchData {
  tasks?: Task[]
  events?: CalendarEvent[]
  inbox?: InboxItem[]
  journal?: JournalEntry[]
  projects?: Project[]
  areas?: Area[]
  domains?: Domain[]
  people?: Person[]
  interactions?: Interaction[]
  books?: Book[]
  notes?: Note[]
  quotes?: Quote[]
  timeEntries?: TimeEntry[]
}

type Row = { id: string }
const byId = <T extends Row>(rows: readonly T[] = []) => new Map(rows.map((r) => [r.id, r]))

export interface SearchIndex {
  data: Required<SearchData>
  task: Map<string, Task>
  calendar_event: Map<string, CalendarEvent>
  inbox_item: Map<string, InboxItem>
  journal_entry: Map<string, JournalEntry>
  project: Map<string, Project>
  area: Map<string, Area>
  person: Map<string, Person>
  book: Map<string, Book>
  note: Map<string, Note>
  quote: Map<string, Quote>
  /** Person id → their newest interaction's `occurred_at`. */
  lastTouch: Map<string, string>
}

export function indexSearchData(d: SearchData): SearchIndex {
  const data: Required<SearchData> = {
    tasks: d.tasks ?? [], events: d.events ?? [], inbox: d.inbox ?? [], journal: d.journal ?? [], projects: d.projects ?? [], areas: d.areas ?? [],
    domains: d.domains ?? [], people: d.people ?? [], interactions: d.interactions ?? [], books: d.books ?? [], notes: d.notes ?? [], quotes: d.quotes ?? [],
    timeEntries: d.timeEntries ?? [],
  }
  const lastTouch = new Map<string, string>()
  for (const i of data.interactions) {
    const seen = lastTouch.get(i.person_id)
    if (!seen || Date.parse(i.occurred_at) > Date.parse(seen)) lastTouch.set(i.person_id, i.occurred_at)
  }
  return {
    data,
    task: byId(data.tasks), calendar_event: byId(data.events), inbox_item: byId(data.inbox), journal_entry: byId(data.journal),
    project: byId(data.projects), area: byId(data.areas), person: byId(data.people), book: byId(data.books), note: byId(data.notes), quote: byId(data.quotes),
    lastTouch,
  }
}

// ── The filters ──

export type TimeWindow = 'any' | 'today' | 'week' | 'month' | 'year'

export const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
]

export interface SearchFilters {
  /** "Open only": hide what's finished with — done/cancelled tasks, filed/dismissed inbox, archived
   * projects, past events, finished books. */
  openOnly: boolean
  window: TimeWindow
}

export const NO_FILTERS: SearchFilters = { openOnly: false, window: 'any' }

/** Is `day` (YYYY-MM-DD) inside `w`, counted from `today` on the user's calendar? Weeks run
 * Monday–Sunday, as the planning board's (lib/dateShortcuts daysUntilNextMonday). */
export function inWindow(day: string, w: TimeWindow, today: string): boolean {
  switch (w) {
    case 'any':
      return true
    case 'today':
      return day === today
    case 'week': {
      const monday = addDays(today, -((weekday(today) + 6) % 7))
      return day >= monday && day <= addDays(monday, 6)
    }
    case 'month':
      return day.slice(0, 7) === today.slice(0, 7)
    case 'year':
      return day.slice(0, 4) === today.slice(0, 4)
  }
}

const dayOf = (iso: string | null | undefined) => (iso ? zoneDateKey(new Date(iso)) : null)

/** Still open? null = not in the cache (yet) — a filter never hides what it can't see. */
export function isOpen(hit: Pick<SearchHit, 'entity_type' | 'entity_id'>, ix: SearchIndex, now: Date): boolean | null {
  const id = hit.entity_id
  switch (hit.entity_type) {
    case 'task': {
      const t = ix.task.get(id)
      return t ? t.status === 'todo' : null
    }
    case 'inbox_item': {
      const i = ix.inbox_item.get(id)
      return i ? i.status === 'pending' : null
    }
    case 'project': {
      const p = ix.project.get(id)
      return p ? p.status !== 'archived' : null
    }
    case 'calendar_event': {
      const e = ix.calendar_event.get(id)
      return e ? Date.parse(e.ends_at) >= now.getTime() : null
    }
    case 'book': {
      const b = ix.book.get(id)
      return b ? b.status !== 'finished' : null
    }
    default:
      return true // people, areas, journal entries, notes and quotes are never "done"
  }
}

/** The day a hit belongs to on the user's calendar, for "Any time ▾": a task's planned day (else
 * the day it was done, else made), an event's start, a capture's, a journal entry's own date, a
 * person's last touch, the day a project / area / book was last changed, the day a note or quote
 * was written. null = not in the cache. */
export function hitDay(hit: Pick<SearchHit, 'entity_type' | 'entity_id'>, ix: SearchIndex): string | null {
  const id = hit.entity_id
  switch (hit.entity_type) {
    case 'task': {
      const t = ix.task.get(id)
      return t ? dayOf(t.scheduled_start ?? t.due_at ?? t.completed_at ?? t.created_at) : null
    }
    case 'calendar_event':
      return dayOf(ix.calendar_event.get(id)?.starts_at)
    case 'inbox_item':
      return dayOf(ix.inbox_item.get(id)?.created_at)
    case 'journal_entry':
      return ix.journal_entry.get(id)?.entry_date ?? null
    case 'person': {
      const p = ix.person.get(id)
      return p ? dayOf(ix.lastTouch.get(id) ?? p.updated_at) : null
    }
    case 'project':
      return dayOf(ix.project.get(id)?.updated_at)
    case 'area':
      return dayOf(ix.area.get(id)?.updated_at)
    case 'book':
      return dayOf(ix.book.get(id)?.updated_at)
    case 'note':
      return dayOf(ix.note.get(id)?.created_at)
    case 'quote':
      return dayOf(ix.quote.get(id)?.created_at)
  }
}

// ── Rows: the hits, then "Related" ──

export interface SearchRow {
  hit: SearchHit
  /** Why a row that didn't match is here ("In Shaheen website") — null for a real hit. */
  related: string | null
}

/** At most this many Related rows per group: a matched project with 40 open tasks must not bury
 * the hits. ponytail: a flat cap; rank by link strength if Kai wants more. */
export const RELATED_MAX = 3

const noteTitle = (n: Note) => n.title?.trim() || n.body.slice(0, 80)
const quoteSnippet = (q: Quote) => [q.author, q.source].filter(Boolean).join(' · ') || null

/** 1a's "Related" rows, built only from links the data really has (deviation(2026-10-12): the
 * export's people-to-people line — "Shares the Shaheen retainer with Omar" — needs person ↔
 * project links the app doesn't keep, so People never get a Related row):
 *  - open tasks filed in a matched project or area — "In <project>"
 *  - the notes and quotes of a matched book — "From <book>"
 * Never a row that is already a hit. Soonest-due tasks first. */
export function relatedRows(hits: readonly SearchHit[], ix: SearchIndex): SearchRow[] {
  const isHit = new Set(hits.map((h) => `${h.entity_type}:${h.entity_id}`))
  const containers = new Map<string, string>() // project / area id → its name
  const books = new Map<string, string>()
  for (const h of hits) {
    if (h.entity_type === 'project') containers.set(h.entity_id, ix.project.get(h.entity_id)?.name ?? h.title)
    if (h.entity_type === 'area') containers.set(h.entity_id, ix.area.get(h.entity_id)?.name ?? h.title)
    if (h.entity_type === 'book') books.set(h.entity_id, ix.book.get(h.entity_id)?.title ?? h.title)
  }
  const tasks = ix.data.tasks
    .filter((t) => t.status === 'todo' && !t.deleted_at && !isHit.has(`task:${t.id}`) && (containers.has(t.project_id ?? '') || containers.has(t.area_id ?? '')))
    .sort((a, b) => (a.due_at ?? '￿').localeCompare(b.due_at ?? '￿') || a.title.localeCompare(b.title))
    .slice(0, RELATED_MAX)
    .map((t): SearchRow => ({
      hit: { entity_type: 'task', entity_id: t.id, title: t.title, snippet: t.notes, score: 0 },
      related: `In ${containers.get(t.project_id ?? '') ?? containers.get(t.area_id ?? '')}`,
    }))
  const library = [
    ...ix.data.notes
      .filter((n) => n.book_id && books.has(n.book_id) && !isHit.has(`note:${n.id}`))
      .map((n): SearchRow => ({ hit: { entity_type: 'note', entity_id: n.id, title: noteTitle(n), snippet: n.body.slice(0, 200), score: 0 }, related: `From ${books.get(n.book_id!)}` })),
    ...ix.data.quotes
      .filter((q) => q.book_id && books.has(q.book_id) && !isHit.has(`quote:${q.id}`))
      .map((q): SearchRow => ({ hit: { entity_type: 'quote', entity_id: q.id, title: q.text.slice(0, 80), snippet: quoteSnippet(q), score: 0 }, related: `From ${books.get(q.book_id!)}` })),
  ].slice(0, RELATED_MAX)
  return [...tasks, ...library]
}

/** Everything the page lists for one answer: the hits that pass the filters, then the Related rows
 * of those hits that pass them too. */
export function searchRows(hits: readonly SearchHit[], ix: SearchIndex, filters: SearchFilters, now: Date): SearchRow[] {
  const today = zoneDateKey(now)
  const keep = (h: SearchHit) => {
    if (filters.openOnly && isOpen(h, ix, now) === false) return false
    if (filters.window === 'any') return true
    const day = hitDay(h, ix)
    return day === null || inWindow(day, filters.window, today)
  }
  const shown = hits.filter(keep)
  return [...shown.map((hit) => ({ hit, related: null })), ...relatedRows(shown, ix).filter((r) => keep(r.hit))]
}

export interface GroupView extends SearchGroup {
  /** The rows to draw (all of them under the group's own chip, else the peek). */
  rows: SearchRow[]
  total: number
}

/** The groups to draw, in order, empty ones dropped. `only` = the picked chip (null = All, where a
 * group shows its first `peek` rows and keeps the last place for a Related row when it has one —
 * 1a's Tasks: four hits, then "Invoice the retainer"). */
export function groupRows(rows: readonly SearchRow[], only: string | null): GroupView[] {
  return SEARCH_GROUPS.filter((g) => !only || g.key === only)
    .map((g) => {
      const all = rows.filter((r) => g.types.includes(r.hit.entity_type))
      let shown = all
      if (!only && all.length > g.peek) {
        const firstRelated = all.find((r) => r.related)
        shown = firstRelated ? [...all.filter((r) => !r.related).slice(0, g.peek - 1), firstRelated] : all.slice(0, g.peek)
      }
      return { ...g, rows: shown, total: all.length }
    })
    .filter((g) => g.total > 0)
}

/** The type chips with their counts, in 1a's chip order; a group with nothing found has no chip. */
export function chipCounts(rows: readonly SearchRow[]): { key: string; label: string; count: number }[] {
  return CHIP_ORDER.map((key) => {
    const g = SEARCH_GROUPS.find((x) => x.key === key)!
    return { key, label: g.label, count: rows.filter((r) => g.types.includes(r.hit.entity_type)).length }
  }).filter((c) => c.count > 0)
}

// ── One row's lines ──

/** The words around the first place `query` (or its first word) occurs: "…lock the retainer number
 * before Omar flies out…". The text's start when it doesn't occur. */
export function excerpt(text: string, query: string, width = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= width) return flat
  const lower = flat.toLowerCase()
  const q = query.trim().toLowerCase()
  let at = q ? lower.indexOf(q) : -1
  for (const word of q.split(' ')) {
    if (at >= 0) break
    if (word.length > 1) at = lower.indexOf(word)
  }
  // A third of the window leads into the match, the rest follows it.
  let start = Math.max(0, Math.min(at - Math.floor(width / 3), flat.length - width))
  if (start > 0) start = flat.indexOf(' ', start) + 1 || start // begin on a word
  let end = Math.min(flat.length, start + width)
  if (end < flat.length) end = flat.lastIndexOf(' ', end) > start ? flat.lastIndexOf(' ', end) : end
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Done today" · "Done yesterday" · "Done Tuesday" (this past week) · "Done Tue 30 Jun". */
export function doneWord(atIso: string, now: Date): string {
  const day = zoneDateKey(new Date(atIso))
  const today = zoneDateKey(now)
  if (day === today) return 'Done today'
  if (day === addDays(today, -1)) return 'Done yesterday'
  if (day > addDays(today, -7) && day < today) return `Done ${WEEKDAYS[weekday(day)]}`
  return `Done ${dayShort(day)}`
}

/** 1a's date column: "Jul 08", with the year when it isn't this one. */
export function journalDate(day: string, today: string): string {
  const m = MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3)
  return `${m} ${day.slice(8, 10)}${day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`}`
}

export interface RowView {
  title: string
  /** The line under the title (1a .sx) — for a Related row, its reason. */
  line: string | null
  related: boolean
  /** The title is a quoted passage (journal entries, quotes). */
  quoted?: boolean
  /** A done / cancelled task: filled check, struck title. */
  done?: boolean
  /** Past, filed or archived: the title goes faint (1a's past "Coffee — Omar"). */
  faded?: boolean
  /** "!!" */
  flag?: string | null
  /** The right-hand chip: a task's day ("Tomorrow 15:00"), a project's hours this month. */
  chip?: string | null
  /** People's "Last touch · 2d ago". */
  side?: string | null
  /** A journal entry's "Jul 08". */
  date?: string | null
  /** A project's / area's own colour for its dot. */
  color?: string | null
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ') || null
const contains = (text: string | null | undefined, query: string) => !!text && !!query.trim() && text.toLowerCase().includes(query.trim().toLowerCase())

export function describeRow(row: SearchRow, ix: SearchIndex, query: string, now: Date): RowView {
  const { hit, related } = row
  const id = hit.entity_id
  const base: RowView = { title: hit.title, line: related ?? (hit.snippet || null), related: !!related }
  const today = zoneDateKey(now)
  const openTasks = (pick: (t: Task) => boolean) => ix.data.tasks.filter((t) => t.status === 'todo' && !t.deleted_at && pick(t)).length

  switch (hit.entity_type) {
    case 'task': {
      const t = ix.task.get(id)
      if (!t) return base
      const done = t.status !== 'todo'
      // Subtasks (Kai 2026-10-16): a subtask's line says whose it is first — "↳ Finish the sheet".
      const parentTitle = t.parent_task_id ? ix.task.get(t.parent_task_id)?.title : null
      const place = join(parentTitle && `↳ ${parentTitle}`, resolveTag(t, ix.data.domains, ix.data.projects, ix.data.areas)?.label)
      const at = t.scheduled_start ?? t.due_at
      const line = related
        ?? (done ? join(doneWord(t.completed_at ?? t.updated_at, now), place)
          : contains(t.notes, query) ? `"${excerpt(t.notes!, query)}"`
          : join(place, t.notes?.split('\n')[0]))
      return {
        ...base, title: t.title, line, done,
        flag: done ? null : priorityFlag(t.priority),
        chip: done || !at ? null : `${dayWord(dayOf(at)!, now)}${t.scheduled_start ? ` ${timeText(new Date(t.scheduled_start))}` : ''}`,
      }
    }
    case 'calendar_event': {
      const e = ix.calendar_event.get(id)
      if (!e) return base
      const s = new Date(e.starts_at)
      const past = Date.parse(e.ends_at) < now.getTime()
      const day = dayShort(zoneDateKey(s))
      return { ...base, title: e.title, faded: past, line: past ? `Past · ${day}` : e.all_day ? `${day} · All day` : `${day} · ${timeRange(s, new Date(e.ends_at))}` }
    }
    case 'journal_entry': {
      const j = ix.journal_entry.get(id)
      return { ...base, title: `"${excerpt(j?.body ?? hit.snippet ?? hit.title, query, 140)}"`, quoted: true, line: related, date: j ? journalDate(j.entry_date, today) : null }
    }
    case 'project': {
      const p = ix.project.get(id)
      if (!p) return base
      const month = today.slice(0, 7)
      const minutes = ix.data.timeEntries.filter((e) => e.project_id === p.id && dayOf(e.started_at)!.slice(0, 7) === month).reduce((n, e) => n + e.duration_min, 0)
      return {
        ...base, title: p.name, color: p.color ?? null, faded: p.status === 'archived',
        line: related ?? join(hit.snippet && excerpt(hit.snippet, query, 60), `${openTasks((t) => t.project_id === p.id)} open`, p.type === 'retainer' && 'retainer', p.status === 'archived' && 'archived'),
        chip: minutes > 0 ? `${formatDuration(minutes)} this month` : null,
      }
    }
    case 'area': {
      const a = ix.area.get(id)
      if (!a) return base
      return { ...base, title: a.name, color: a.color, line: related ?? join(hit.snippet && excerpt(hit.snippet, query, 60), `${openTasks((t) => t.area_id === a.id)} open`) }
    }
    case 'person': {
      const touched = ix.lastTouch.get(id)
      return { ...base, title: ix.person.get(id)?.name ?? hit.title, line: related ?? (hit.snippet ? excerpt(hit.snippet, query) : null), side: touched ? `Last touch · ${timeAgo(touched, now.getTime())}` : null }
    }
    case 'inbox_item': {
      const i = ix.inbox_item.get(id)
      if (!i) return base
      const line = i.status === 'pending' ? `Captured ${dayShort(dayOf(i.created_at)!)}` : `${i.status === 'filed' ? 'Filed' : 'Dismissed'} · ${dayShort(dayOf(i.updated_at)!)}`
      return { ...base, title: excerpt(i.raw_text, query, 80), faded: i.status !== 'pending', line: related ?? line }
    }
    case 'book': {
      const b = ix.book.get(id)
      if (!b) return base
      return { ...base, title: b.title, line: related ?? join('Book', b.author, b.status === 'finished' && 'finished') }
    }
    case 'note': {
      const n = ix.note.get(id)
      if (!n) return base
      const titled = !!n.title?.trim()
      const book = n.book_id ? ix.book.get(n.book_id)?.title : null
      return { ...base, title: titled ? n.title!.trim() : excerpt(n.body, query, 80), line: related ?? join('Note', titled && `"${excerpt(n.body, query, 70)}"`, book) }
    }
    case 'quote': {
      const q = ix.quote.get(id)
      if (!q) return base
      return { ...base, title: `"${excerpt(q.text, query, 140)}"`, quoted: true, line: related ?? join('Quote', q.author, q.source) }
    }
  }
}
