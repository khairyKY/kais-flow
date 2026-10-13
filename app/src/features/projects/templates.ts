// Checklist templates (P7 7d "instantiate → real tasks", parity audit A25). A project's checklist is
// saved under a name and used on any project. Kept beside the settings like label colours:
// `app_settings.checklist_templates` (migration 0079), [{ id, name, items: [{ title, type }] }].
// Using one follows the checklist's own model (PLAN_ADDENDUM §12): a task-linked item becomes a real
// task under the project — project + its domain, as tasks/move.ts files one — with its linked line;
// a one-shot item stays a line on the page only. Every write has one Undo.

import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { updateAppSetting, useAppSettings } from '../../lib/settings'
import type { AppSettings, Project } from '../../lib/types'
import { createTask } from '../tasks/api'
import { setProjectChecklist } from './api'

type ChecklistItem = NonNullable<Project['checklist']>[number]
export type TemplateItem = Pick<ChecklistItem, 'title' | 'type'>
export interface ChecklistTemplate {
  id: string
  name: string
  items: TemplateItem[]
}

/** The stored list, kept to well-formed templates (anything else is dropped, never thrown on). */
export function parseTemplates(raw: unknown): ChecklistTemplate[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((t) => {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.name !== 'string' || !Array.isArray(t.items)) return []
    const items = t.items.flatMap((i: unknown): TemplateItem[] => {
      const it = i as Partial<TemplateItem> | null
      return it && typeof it.title === 'string' && it.title.trim() ? [{ title: it.title, type: it.type === 'task-linked' ? 'task-linked' : 'one-shot' }] : []
    })
    return [{ id: t.id, name: t.name, items }]
  })
}

/** A checklist as a template: its lines' titles and types — not their ticks or tasks. */
export function templateFrom(checklist: readonly ChecklistItem[], name: string): ChecklistTemplate {
  return { id: crypto.randomUUID(), name, items: checklist.map(({ title, type }) => ({ title, type })) }
}

/** The new checklist lines for a template, unticked. `makeTask` is called once per task-linked
 * item (in order) and returns the task's id; one-shot items never touch it (§12's split). */
export function instantiate(items: readonly TemplateItem[], makeTask: (title: string) => string): ChecklistItem[] {
  return items.map((it) => ({ id: crypto.randomUUID(), title: it.title, type: it.type, completed: false, task_id: it.type === 'task-linked' ? makeTask(it.title) : null }))
}

// ── reads ──

const settings = () => queryClient.getQueryData<AppSettings>(['app_settings'])
/** Templates sync once migration 0079 is pushed: until the row carries the column nothing is sent
 * (the write would be refused and set aside), and the page offers no "save as template". */
const ready = (s: AppSettings | undefined): boolean => !!s && 'checklist_templates' in s

export function useChecklistTemplates(): { templates: ChecklistTemplate[]; ready: boolean } {
  const { data: s } = useAppSettings()
  return { templates: parseTemplates(s?.checklist_templates), ready: ready(s) }
}

// ── writes ──

const current = () => parseTemplates(settings()?.checklist_templates)
const write = (next: ChecklistTemplate[]) => {
  if (ready(settings())) updateAppSetting('checklist_templates', next)
}
const itemsWord = (n: number) => `${n} item${n === 1 ? '' : 's'}`

/** Saves the project's checklist as a new template named `name`. Returns it, or null before 0079. */
export function saveTemplateWithUndo(project: Project, name: string): ChecklistTemplate | null {
  if (!ready(settings())) return null
  const before = current()
  const t = templateFrom(project.checklist ?? [], name)
  write([...before, t])
  logActivity('project.template_saved', 'project', project.id, { template_id: t.id, template: name, items: t.items.length })
  toastUndo(`Saved as a template · ${itemsWord(t.items.length)}`, () => write(current().filter((x) => x.id !== t.id)))
  return t
}

export function renameTemplateWithUndo(id: string, name: string): void {
  const before = current()
  const was = before.find((t) => t.id === id)
  if (!was || !name || name === was.name) return
  write(before.map((t) => (t.id === id ? { ...t, name } : t)))
  toastUndo(`Renamed to “${name}”`, () => write(current().map((t) => (t.id === id ? { ...t, name: was.name } : t))))
}

export function deleteTemplateWithUndo(id: string): void {
  const before = current()
  const at = before.findIndex((t) => t.id === id)
  if (at === -1) return
  const gone = before[at]
  write(before.filter((t) => t.id !== id))
  // Back in its old place (or at the end, if the list got shorter since).
  toastUndo(`Deleted “${gone.name}”`, () => {
    const now = current().filter((t) => t.id !== id)
    write([...now.slice(0, at), gone, ...now.slice(at)])
  })
}

/** The template's items onto the project: task-linked ones as real tasks under it, every one as a
 * checklist line. One Undo takes the lines back and removes the new tasks outright (they never
 * should have existed — like Duplicate's Undo). */
export function applyTemplateWithUndo(project: Project, template: ChecklistTemplate): void {
  const prior = project.checklist ?? []
  const made: string[] = []
  const lines = instantiate(template.items, (title) => {
    const task = createTask({ title, projectId: project.id, domainId: project.domain_id })
    made.push(task.id)
    return task.id
  })
  setProjectChecklist(project, [...prior, ...lines])
  logActivity('project.template_used', 'project', project.id, { template_id: template.id, template: template.name, items: lines.length, tasks: made.length })
  toastUndo(`Added “${template.name}” · ${itemsWord(lines.length)}${made.length ? `, ${made.length} as tasks` : ''}`, () => {
    made.forEach((id) => writeRow('tasks', { id }, 'delete'))
    const now = queryClient.getQueryData<Project[]>(['projects'])?.find((p) => p.id === project.id) ?? project
    setProjectChecklist(now, (now.checklist ?? []).filter((l) => !lines.some((n) => n.id === l.id)))
    logActivity('project.template_unused', 'project', project.id, { template_id: template.id, template: template.name })
  })
}
