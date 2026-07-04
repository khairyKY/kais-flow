import * as chrono from 'chrono-node'
import type { Domain, Project } from '../../lib/types'

export interface ParsedCommand {
  title: string
  dueAt: string | null
  domainId: string | null
  projectId: string | null
  domainMatch: string | null
  projectMatch: string | null
}

/**
 * Pure text -> structured-command parser (no AI). Extracts the first date/time mention via
 * chrono-node and the first `#tag` fuzzy-matched against project names, falling back to domain
 * names. Whatever's left after stripping both becomes the title.
 */
export function parseCommand(input: string, domains: Domain[], projects: Project[]): ParsedCommand {
  let text = input

  let dueAt: string | null = null
  const results = chrono.parse(text, new Date(), { forwardDate: true })
  if (results.length > 0) {
    const first = results[0]
    dueAt = first.start.date().toISOString()
    text = (text.slice(0, first.index) + text.slice(first.index + first.text.length)).trim()
  }

  let domainId: string | null = null
  let projectId: string | null = null
  let domainMatch: string | null = null
  let projectMatch: string | null = null

  const tagMatch = text.match(/#(\S+)/)
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase()
    const project = projects.find((p) => p.name.toLowerCase().includes(tag))
    if (project) {
      projectId = project.id
      projectMatch = project.name
      domainId = project.domain_id
    } else {
      const domain = domains.find((d) => d.name.toLowerCase().includes(tag))
      if (domain) {
        domainId = domain.id
        domainMatch = domain.name
      }
    }
    text = text.replace(tagMatch[0], '').trim()
  }

  const title = text.replace(/\s{2,}/g, ' ').trim()

  return { title, dueAt, domainId, projectId, domainMatch, projectMatch }
}
