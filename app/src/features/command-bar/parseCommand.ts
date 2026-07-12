import * as chrono from 'chrono-node'
import type { Domain, Project } from '../../lib/types'

export interface ParsedCommand {
  title: string
  dueAt: string | null
  durationMin: number | null
  priority: number | null
  domainId: string | null
  projectId: string | null
  domainMatch: string | null
  projectMatch: string | null
}

/** Matches `30m`, `1h`, or `1h30m` anywhere in the text. */
const DURATION_RE = /\b(\d+)h(?:(\d+)m)?\b|\b(\d+)m\b/i

/** `!`/`!!`/`!!!` -> priority 3/2/1 (1 is most urgent) — matches `taskDisplay.ts`'s own
 * `priorityFlag`, which renders priority 1 back out as `!!!`: what you type is what you see. */
const PRIORITY_RE = /!{1,3}/

export interface PriorityDurationTokens {
  text: string
  priority: number | null
  durationMin: number | null
}

/** Extracts and strips just the local `!`/`!!`/`!!!` priority flag and `30m`/`1h`/`1h30m`
 * duration syntax — the two tokens with no AI-side equivalent worth waiting on. Shared by the
 * full `parseCommand` pipeline below and the command bar's Ctrl+Enter AI-capture path, which
 * strips these locally but leaves date/tag parsing to the AI parse itself. */
export function stripPriorityAndDuration(input: string): PriorityDurationTokens {
  let text = input

  // Priority is stripped first: it's the one token that could otherwise get swallowed into an
  // adjacent #tag match (`\S+` doesn't stop at `!`).
  let priority: number | null = null
  const priorityMatch = text.match(PRIORITY_RE)
  if (priorityMatch) {
    priority = 4 - priorityMatch[0].length
    text = (text.slice(0, priorityMatch.index) + text.slice(priorityMatch.index! + priorityMatch[0].length)).trim()
  }

  // Duration is stripped before chrono runs: chrono-node treats bare "30m"/"1h30m" as a
  // relative-time date expression ("in 30 minutes") and would otherwise swallow it as dueAt.
  let durationMin: number | null = null
  const durationMatch = text.match(DURATION_RE)
  if (durationMatch) {
    durationMin = durationMatch[1]
      ? parseInt(durationMatch[1], 10) * 60 + (durationMatch[2] ? parseInt(durationMatch[2], 10) : 0)
      : parseInt(durationMatch[3], 10)
    text = (text.slice(0, durationMatch.index) + text.slice(durationMatch.index! + durationMatch[0].length)).trim()
  }

  return { text, priority, durationMin }
}

/** Does this parse carry enough structure to create a task directly, instead of falling through
 * to a bare Inbox capture? Priority/duration count as structure too — matching a `!`/`30m`-only
 * command (e.g. "buy milk !!") that has no date/project still means "create a task now". */
export function hasStructure(parsed: Pick<ParsedCommand, 'dueAt' | 'domainId' | 'projectId' | 'priority' | 'durationMin'>): boolean {
  return !!(parsed.dueAt || parsed.domainId || parsed.projectId || parsed.priority != null || parsed.durationMin != null)
}

/**
 * Pure text -> structured-command parser (no AI). Extracts the first date/time mention via
 * chrono-node, a `30m`/`1h`/`1h30m` duration, a `!`/`!!`/`!!!` priority flag, and the first `#tag`
 * fuzzy-matched against project names, falling back to domain names. Whatever's left after
 * stripping all of those becomes the title.
 */
export function parseCommand(input: string, domains: Domain[], projects: Project[]): ParsedCommand {
  const stripped = stripPriorityAndDuration(input)
  let text = stripped.text
  const { priority, durationMin } = stripped

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

  return { title, dueAt, durationMin, priority, domainId, projectId, domainMatch, projectMatch }
}
