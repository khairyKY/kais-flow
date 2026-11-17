// /projects/:id: a project shared with someone is a shared list (its own page); every other project, area or domain is the ordinary page.
import { useParams } from 'react-router'
import { ProjectDetailPage } from '../projects/ProjectDetailPage'
import { useProjects } from '../projects/api'
import { isSharedList } from './lists'
import { SharedListPage } from './SharedListPage'

export function ProjectRoute() {
  const { id } = useParams<{ id: string }>()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === id)
  return project && isSharedList(project) ? <SharedListPage project={project} /> : <ProjectDetailPage />
}
