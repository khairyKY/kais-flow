import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import type { Project } from '../../lib/types'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('name')
      if (error) throw error
      return data as Project[]
    },
  })
}

function nowIso() {
  return new Date().toISOString()
}

export function createProject(
  name: string,
  domainId: string | null,
  type: Project['type'] = 'standard',
): Project {
  const project: Project = {
    id: crypto.randomUUID(),
    domain_id: domainId,
    name,
    type,
    status: 'active',
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('projects', project)
  logActivity('project.created', 'project', project.id, { name, domain_id: domainId })
  return project
}

export function renameProject(project: Project, name: string): void {
  writeRow('projects', { ...project, name })
  logActivity('project.renamed', 'project', project.id, { name })
}

/** Re-parents a project under a different domain. */
export function reparentProject(project: Project, domainId: string | null): void {
  writeRow('projects', { ...project, domain_id: domainId })
  logActivity('project.reparented', 'project', project.id, { domain_id: domainId })
}

export function archiveProject(project: Project): void {
  writeRow('projects', { ...project, status: 'archived' })
  logActivity('project.archived', 'project', project.id, {})
}
