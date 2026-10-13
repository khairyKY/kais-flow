// Labels (Overlays.dc.html "Label picker" + "Labels" manager). A label is free text on
// `tasks.labels` — there is no labels table. The one thing kept beside them is each label's colour
// (and a label made in the manager before any task carries it): `app_settings.label_meta`, a
// { name: colour } map (migration 0069). Rename and delete rewrite the label on every task that
// has it, through writeRow, with one Undo.

import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { updateAppSetting, useAppSettings } from '../../lib/settings'
import { toastUndo } from '../../lib/undo'
import type { AppSettings, Task } from '../../lib/types'
import { setLabels, useTasks } from './api'

/** label → colour token. */
export type LabelMeta = Record<string, string>

/** The manager's swatches, in the drawn order (Overlays.dc.html "Labels", the edit row). */
export const LABEL_COLORS: readonly { name: string; value: string }[] = [
  { name: 'Terracotta', value: 'var(--acc-terra)' },
  { name: 'Lavender', value: 'var(--acc-lavender)' },
  { name: 'Sage', value: 'var(--acc-sage)' },
  { name: 'Hydrangea', value: 'var(--acc-hydrangea)' },
  { name: 'Buttercream', value: 'var(--acc-buttercream)' },
  { name: 'Clover', value: 'var(--acc-clover)' },
]
/** A label nobody has coloured (the picker's "Someday" square). */
export const NO_COLOR = 'var(--ink-hairline)'

export interface LabelInfo {
  name: string
  /** Live tasks carrying it (open and done). */
  count: number
  color: string
}

const az = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
const sameName = (a: string, b: string) => az(a, b) === 0

/** A stored map, kept to known swatches (it lands in a style). Anything else reads as no colour. */
export function parseLabelMeta(raw: unknown): LabelMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => k.trim() && typeof v === 'string' && LABEL_COLORS.some((c) => c.value === v)))
}

/** Every label — on a live task, or only made in the manager — with its count and colour, A–Z. */
export function labelList(tasks: readonly Pick<Task, 'labels'>[], meta: LabelMeta = {}): LabelInfo[] {
  const counts = new Map<string, number>(Object.keys(meta).map((k) => [k, 0]))
  for (const t of tasks) for (const l of new Set(t.labels ?? [])) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count, color: meta[name] ?? NO_COLOR })).sort((a, b) => az(a.name, b.name))
}

/** The picker for what's typed: the matching labels (an exact match first), and the name "Create"
 * would make — null when that label already exists in any case ("urgent" finds "Urgent"). */
export function matchLabels<L extends { name: string }>(all: readonly L[], query: string): { rows: L[]; create: string | null } {
  const q = query.trim()
  if (!q) return { rows: [...all], create: null }
  const rows = all.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
  const exact = rows.findIndex((l) => sameName(l.name, q))
  if (exact > 0) rows.unshift(...rows.splice(exact, 1))
  return { rows, create: exact === -1 ? q : null }
}

/** One label across tasks: on every task when any lacks it, else off every task. The rows to write. */
export function planToggle(tasks: readonly Task[], label: string): { task: Task; labels: string[] }[] {
  const on = tasks.some((t) => !t.labels.includes(label))
  return tasks
    .filter((t) => t.labels.includes(label) !== on)
    .map((t) => ({ task: t, labels: on ? [...t.labels, label] : t.labels.filter((l) => l !== label) }))
}

/** Rename `from` to `to` (a merge when `to` is already a label) or, with `to` null, remove it —
 * on every task that has it, trashed ones too (a restore brings back the new name). */
export function planRelabel(tasks: readonly Task[], from: string, to: string | null): { task: Task; labels: string[] }[] {
  return tasks
    .filter((t) => t.labels?.includes(from))
    .map((t) => ({ task: t, labels: [...new Set(t.labels.flatMap((l) => (l === from ? (to === null ? [] : [to]) : [l])))] }))
}

/** The map after a rename (the colour goes with the name; a merge keeps the target's own) or a delete. */
export function relabelMeta(meta: LabelMeta, from: string, to: string | null, color?: string): LabelMeta {
  const { [from]: was, ...rest } = meta
  if (to === null) return rest
  const keep = color ?? rest[to] ?? was
  return keep ? { ...rest, [to]: keep } : rest
}

// ── reads ──

const settings = () => queryClient.getQueryData<AppSettings>(['app_settings'])
/** Colours sync once migration 0069 is pushed: until the row carries `label_meta` nothing is sent
 * (the write would be refused and set aside), and every label wears NO_COLOR. */
const metaReady = (s: AppSettings | undefined): boolean => !!s && 'label_meta' in s

/** Every label with its count and colour, and whether colours / manager-made labels can be saved. */
export function useLabels(): { labels: LabelInfo[]; meta: LabelMeta; ready: boolean } {
  const { data: tasks = [] } = useTasks()
  const { data: s } = useAppSettings()
  const meta = parseLabelMeta(s?.label_meta)
  return { labels: labelList(tasks, meta), meta, ready: metaReady(s) }
}

// ── writes ──

const cachedTasks = () => queryClient.getQueryData<Task[]>(['tasks']) ?? []
const writeMeta = (next: LabelMeta) => {
  const s = settings()
  if (metaReady(s) && JSON.stringify(parseLabelMeta(s?.label_meta)) !== JSON.stringify(next)) updateAppSetting('label_meta', next)
}
const tasksWord = (n: number) => `${n} task${n === 1 ? '' : 's'}`

/** The picker's tap — every one, from a row's `L`, a selection's or the task sheet — with one Undo
 * (P7e A17: one task used to change quietly). `label` is taken as typed — a new one is simply the
 * first task to carry it. */
export function toggleLabel(taskIds: readonly string[], label: string): void {
  const all = cachedTasks()
  const plan = planToggle(taskIds.flatMap((id) => all.find((t) => t.id === id) ?? []), label)
  plan.forEach((p) => setLabels(p.task, p.labels))
  if (plan.length === 0) return
  const on = plan[0].labels.includes(label)
  const many = taskIds.length > 1 ? ` ${on ? 'to' : 'from'} ${tasksWord(plan.length)}` : ''
  toastUndo(`${on ? 'Added' : 'Removed'} “${label}”${many}`, () => plan.forEach((p) => setLabels(p.task, p.task.labels)))
}

/** Rename (or merge into an existing label) / delete, everywhere, with one Undo that puts back every
 * task's labels and the colour map. Not logged as task activity: it reorganises, it doesn't work
 * on the tasks (the slipping view would read 40 tasks as touched). */
function relabelWithUndo(from: string, to: string | null, color: string | undefined, message: (n: number) => string): void {
  const plan = planRelabel(cachedTasks(), from, to)
  const metaBefore = parseLabelMeta(settings()?.label_meta)
  plan.forEach((p) => writeRow('tasks', { ...p.task, labels: p.labels }))
  writeMeta(relabelMeta(metaBefore, from, to, color))
  toastUndo(message(plan.length), () => {
    const now = cachedTasks()
    plan.forEach((p) => writeRow('tasks', { ...(now.find((t) => t.id === p.task.id) ?? p.task), labels: p.task.labels }))
    writeMeta(metaBefore)
  })
}

export function renameLabelWithUndo(from: string, to: string, color?: string): void {
  const merge = !sameName(from, to) && labelList(cachedTasks(), parseLabelMeta(settings()?.label_meta)).find((l) => sameName(l.name, to))
  const target = merge ? merge.name : to
  relabelWithUndo(from, target, color, (n) => `${merge ? 'Merged into' : 'Renamed to'} “${target}”${n ? ` · ${tasksWord(n)}` : ''}`)
}

export function deleteLabelWithUndo(name: string): void {
  relabelWithUndo(name, null, undefined, (n) => `Deleted “${name}”${n ? ` from ${tasksWord(n)}` : ''}`)
}

/** A colour, or a label made in the manager (＋ New) before any task carries it — a name that
 * already exists in another case colours that label instead of making a twin. Needs 0069. */
export function setLabelColor(name: string, color: string): void {
  const meta = parseLabelMeta(settings()?.label_meta)
  const own = labelList(cachedTasks(), meta).find((l) => sameName(l.name, name))?.name ?? name
  writeMeta({ ...meta, [own]: color })
}
