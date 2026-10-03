import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import type { Project, TimeEntry } from '../../lib/types'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('name')
      if (error) throw error
      return data as Project[]
    },
    // Trashed projects (0044) stay in the cache for Undo; no list shows them (Trash reads its own).
    select: (projects) => projects.filter((p) => !p.deleted_at),
  })
}

export function useTimeEntries() {
  return useQuery({
    queryKey: ['time_entries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_entries').select('*').order('started_at', { ascending: false })
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

/** punch 42: "this month" figures must actually mean this month — read against the local
 *  calendar month at call time, so the number rolls over when the month does. */
export function isThisMonth(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function createProject(
  name: string,
  domainId: string | null,
  type: Project['type'] = 'standard',
  engagementModel?: string | null,
  targetDate?: string | null,
  color?: string | null,
  milestones: Project['milestones'] = [],
  checklist: Project['checklist'] = []
): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    domain_id: domainId,
    name,
    type,
    status: 'active',
    color: color ?? null,
    target_date: targetDate ?? null,
    milestones,
    checklist,
    engagement_model: engagementModel ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('projects', project)
  logActivity('project.created', 'project', project.id, { name, domain_id: domainId, type })
  return project
}

export function renameProject(project: Project, name: string): void {
  const updated = { ...project, name, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.renamed', 'project', project.id, { name })
}

export function reparentProject(project: Project, domainId: string | null): void {
  const updated = { ...project, domain_id: domainId, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.reparented', 'project', project.id, { domain_id: domainId })
}

export function archiveProject(project: Project): void {
  const updated = { ...project, status: 'archived', updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.archived', 'project', project.id, {})
}

export function restoreProject(project: Project): void {
  const updated = { ...project, status: 'active', updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.restored', 'project', project.id, {})
}

/** Kai 2026-10-03 (Projects ⋯ / right-click → Delete): to Trash, no confirm, "Moved to Trash ·
 * Undo". Its tasks keep their project_id while it rests there, so Undo or Trash → Restore puts
 * everything back; only composting it (30 days) lets them go, to no project (migration 0044). */
export function deleteProjectWithUndo(project: Project): void {
  writeRow('projects', { ...project, deleted_at: nowIso(), updated_at: nowIso() })
  logActivity('project.deleted', 'project', project.id, { name: project.name })
  toastUndo('Moved to Trash', () => restoreTrashedProject(project))
}

export function restoreTrashedProject(project: Project): void {
  writeRow('projects', { ...project, deleted_at: null, updated_at: nowIso() })
  logActivity('project.restored', 'project', project.id, { from: 'trash' })
}

export function updateProjectColor(project: Project, color: string | null): void {
  const updated = { ...project, color, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.color_changed', 'project', project.id, { color })
}

export function updateProjectEngagement(project: Project, engagementModel: string | null): void {
  const updated = { ...project, engagement_model: engagementModel, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.engagement_changed', 'project', project.id, { engagement_model: engagementModel })
}

export function updateProjectTargetDate(project: Project, targetDate: string | null): void {
  const updated = { ...project, target_date: targetDate, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.target_date_changed', 'project', project.id, { target_date: targetDate })
}

export function addProjectMilestone(project: Project, title: string, weight: number): void {
  const milestones = project.milestones ? [...project.milestones] : []
  const newMilestone = {
    id: crypto.randomUUID(),
    title,
    weight,
    completed: false,
  }
  milestones.push(newMilestone)
  const updated = { ...project, milestones, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.milestone_added', 'project', project.id, { title, weight })
}

export function toggleProjectMilestone(project: Project, milestoneId: string): void {
  if (!project.milestones) return
  const milestones = project.milestones.map((m) =>
    m.id === milestoneId ? { ...m, completed: !m.completed } : m
  )
  const toggled = milestones.find((m) => m.id === milestoneId)
  const updated = { ...project, milestones, updated_at: nowIso() }
  writeRow('projects', updated)
  if (toggled) {
    logActivity(
      toggled.completed ? 'project.milestone_completed' : 'project.milestone_uncompleted',
      'project',
      project.id,
      { milestone_id: milestoneId, title: toggled.title }
    )
  }
}

/** The one milestone-array writer — rename, remove and their undos all route through it,
 *  so an undo replays the exact prior array through the same outbox path as the original write. */
export function setProjectMilestones(project: Project, milestones: NonNullable<Project['milestones']>): void {
  writeRow('projects', { ...project, milestones, updated_at: nowIso() })
}

export function renameProjectMilestone(project: Project, milestoneId: string, title: string): void {
  if (!project.milestones) return
  setProjectMilestones(
    project,
    project.milestones.map((m) => (m.id === milestoneId ? { ...m, title } : m))
  )
  logActivity('project.milestone_renamed', 'project', project.id, { milestone_id: milestoneId, title })
}

export function removeProjectMilestone(project: Project, milestoneId: string): void {
  if (!project.milestones) return
  setProjectMilestones(
    project,
    project.milestones.filter((m) => m.id !== milestoneId)
  )
  logActivity('project.milestone_removed', 'project', project.id, { milestone_id: milestoneId })
}

export function addProjectChecklistItem(
  project: Project,
  title: string,
  type: 'one-shot' | 'task-linked',
  taskId: string | null = null
): void {
  const checklist = project.checklist ? [...project.checklist] : []
  const newItem = {
    id: crypto.randomUUID(),
    title,
    type,
    completed: false,
    task_id: taskId,
  }
  checklist.push(newItem)
  const updated = { ...project, checklist, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.checklist_item_added', 'project', project.id, { title, type })
}

export function toggleProjectChecklistItem(project: Project, itemId: string): void {
  if (!project.checklist) return
  const checklist = project.checklist.map((item) =>
    item.id === itemId ? { ...item, completed: !item.completed } : item
  )
  const toggled = checklist.find((item) => item.id === itemId)
  const updated = { ...project, checklist, updated_at: nowIso() }
  writeRow('projects', updated)
  if (toggled) {
    logActivity(
      toggled.completed ? 'project.checklist_item_completed' : 'project.checklist_item_uncompleted',
      'project',
      project.id,
      { item_id: itemId, title: toggled.title }
    )
  }
}

export function removeProjectChecklistItem(project: Project, itemId: string): void {
  if (!project.checklist) return
  const checklist = project.checklist.filter((item) => item.id !== itemId)
  const updated = { ...project, checklist, updated_at: nowIso() }
  writeRow('projects', updated)
  logActivity('project.checklist_item_removed', 'project', project.id, { item_id: itemId })
}

export function logTimeEntry(
  projectId: string | null,
  taskId: string | null,
  note: string,
  durationMin: number,
  startedAt: string
): TimeEntry {
  const entry: TimeEntry = {
    id: crypto.randomUUID(),
    user_id: '', // Will be overridden by default auth.uid() in DB/outbox
    project_id: projectId,
    task_id: taskId,
    note,
    duration_min: durationMin,
    started_at: startedAt,
    ended_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('time_entries', entry)
  logActivity('project.work_logged', 'project', projectId || taskId || crypto.randomUUID(), {
    note,
    duration_min: durationMin,
  })
  return entry
}
