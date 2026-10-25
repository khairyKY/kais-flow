import { queryClient } from '../../lib/queryClient'
import { autoProjectMode } from '../../lib/settings'
import { toastAction, toastUndo } from '../../lib/undo'
import { moveTasksWithUndo } from '../tasks/api'
import { updateEvent } from '../calendar/api'
import type { CalendarEvent, Project, Task } from '../../lib/types'

// Queue item 17 (Kai misses Akiflow picking a new task's project from its title). A task or event made
// without a place gets its likely project from the user's OWN history — titles already filed in
// projects, shared labels, the Time block it went into — never a model (the typed capture's AI read
// is the one Groq path, capture/api enrichTypedTask). Settings → Capture & AI (0086): 'suggest' (the
// default) shows a quiet "→ Forecasting App?" chip that applies in one tap; 'assign' puts it there
// when sure, with Undo; 'off'. It learns from corrections for free: history is where things are NOW,
// so a task moved by hand teaches the next one, and an assignment taken back with Undo is remembered
// as a "not there". Tasks and events only — never journal or people content.

/** Something already filed: what history reads. */
export interface PastItem {
  title: string
  project_id?: string | null
  labels?: readonly string[] | null
  updated_at?: string | null
}

export interface Suggestion {
  project: Project
  score: number
  /** Strong enough to put it there by itself ('assign'); else only offered. */
  sure: boolean
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about', 'call', 'email', 'meeting', 'new', 'todo', 'task'])
export const titleWords = (s: string): string[] => [...new Set(s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)))]

const RECENT_MS = 30 * 86_400_000
/** Offered from here up; put there by itself ('assign') from SURE, when twice the runner-up. */
const OFFER = 0.5
const SURE = 1

/** The likely project for `title`, or null when history doesn't point anywhere clearly.
 * ponytail: bag-of-words overlap (Jaccard per filed item, summed per project, recent ones counting
 * more); a TF-IDF weighting or a Groq read would be the upgrade if suggestions come out noisy. */
export function suggestProject(
  title: string,
  past: readonly PastItem[],
  projects: readonly Project[],
  o: { labels?: readonly string[]; slotProjectId?: string | null; not?: readonly string[]; now?: number } = {},
): Suggestion | null {
  const live = new Map(projects.filter((p) => !p.deleted_at && p.status !== 'archived' && p.status !== 'done' && !o.not?.includes(p.id)).map((p) => [p.id, p]))
  // A Time block that belongs to a project holds that project's work.
  const slot = o.slotProjectId ? live.get(o.slotProjectId) : undefined
  if (slot) return { project: slot, score: 2, sure: true }
  const mine = titleWords(title)
  if (!mine.length) return null
  const now = o.now ?? Date.now()
  const score = new Map<string, number>()
  const add = (id: string, n: number) => score.set(id, (score.get(id) ?? 0) + n)
  for (const item of past) {
    if (!item.project_id || !live.has(item.project_id)) continue
    const theirs = titleWords(item.title)
    const shared = theirs.filter((w) => mine.includes(w)).length
    const recent = item.updated_at && now - Date.parse(item.updated_at) < RECENT_MS ? 1 : 0.6
    if (shared) add(item.project_id, (shared / new Set([...mine, ...theirs]).size) * recent)
    if (o.labels?.length && item.labels?.some((l) => o.labels!.includes(l))) add(item.project_id, 0.15)
  }
  // Its name in the title ("Forecasting: fix the chart") says it outright.
  for (const p of live.values()) {
    const name = titleWords(p.name)
    if (name.length && name.every((w) => mine.includes(w))) add(p.id, SURE)
  }
  const [best, second] = [...score].sort((a, b) => b[1] - a[1])
  if (!best || best[1] < OFFER) return null
  return { project: live.get(best[0])!, score: best[1], sure: best[1] >= SURE && best[1] >= 2 * (second?.[1] ?? 0) }
}

// ── "not there": an assignment taken back, remembered on this device ──

const NOT_KEY = 'kf.autoProject.not'
const notKey = (title: string) => titleWords(title).sort().join(' ')

function readNot(): Record<string, string[]> {
  try {
    const v = JSON.parse(localStorage.getItem(NOT_KEY) ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

function rememberNot(title: string, projectId: string): void {
  try {
    const all = readNot()
    const k = notKey(title)
    all[k] = [...new Set([...(all[k] ?? []), projectId])]
    // ponytail: the newest 200 titles; older "not theres" fall off.
    localStorage.setItem(NOT_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-200))))
  } catch {
    /* storage blocked: this session only forgets */
  }
}

// ── the side effect: a chip or an assignment, right after a create ──

type Made = { kind: 'task'; row: Task } | { kind: 'event'; row: CalendarEvent }

function placed(m: Made): boolean {
  return m.kind === 'task' ? !!(m.row.project_id || m.row.area_id || m.row.domain_id) : !!m.row.project_id
}

/** Puts `m` in `project`, with its own Undo (that also remembers "not there" when it was the AI's doing). */
function apply(m: Made, project: Project, auto: boolean): void {
  const label = `→ ${project.name}`
  const notThere = () => auto && rememberNot(m.row.title, project.id)
  if (m.kind === 'task') {
    const row = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === m.row.id) ?? m.row
    moveTasksWithUndo([row], { kind: 'project', id: project.id, domainId: project.domain_id, name: project.name }, label, notThere)
    return
  }
  const latest = () => queryClient.getQueryData<CalendarEvent[]>(['calendar_events'])?.find((e) => e.id === m.row.id) ?? m.row
  updateEvent(latest(), { project_id: project.id })
  toastUndo(label, () => {
    notThere()
    updateEvent(latest(), { project_id: null })
  })
}

/** After a task or event is made without a place: offer (or, on 'assign' and sure, put) its likely
 * project. True when something was offered or done. `fallback`: a project the capture's AI read named,
 * offered only when history has nothing. */
export function offerProject(m: Made, fallback?: Project | null): boolean {
  const mode = autoProjectMode()
  // A "#word" still in the title: the person took the place chip off (Esc) — the words stay words.
  if (mode === 'off' || placed(m) || /(^|\s)#\S/.test(m.row.title)) return false
  const projects = queryClient.getQueryData<Project[]>(['projects']) ?? []
  const tasks = (queryClient.getQueryData<Task[]>(['tasks']) ?? []).filter((t) => !t.deleted_at && t.id !== m.row.id)
  const events = (queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []).filter((e) => !e.deleted_at && e.id !== m.row.id)
  const row = m.kind === 'task' ? (queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === m.row.id) ?? m.row) : m.row
  const slotId = m.kind === 'task' ? (row as Task).slot_id : null
  const not = readNot()[notKey(m.row.title)] ?? []
  const s =
    suggestProject(m.row.title, [...tasks, ...events], projects, {
      labels: m.kind === 'task' ? m.row.labels : undefined,
      slotProjectId: slotId ? events.find((e) => e.id === slotId)?.project_id : null,
      not,
    }) ?? (fallback && !not.includes(fallback.id) && !fallback.deleted_at ? { project: fallback, score: OFFER, sure: false } : null)
  if (!s) return false
  if (mode === 'assign' && s.sure) apply(m, s.project, true)
  else toastAction(`→ ${s.project.name}?`, 'Apply', () => apply(m, s.project, false))
  return true
}
