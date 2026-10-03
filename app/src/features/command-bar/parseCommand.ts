import * as chrono from 'chrono-node'
import { cairoOffsetMinutes, cairoWallTimeToIso } from '../../lib/dateShortcuts'
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
  /** `*label` words, in order, once each — the `*` the app shows labels with (task editor, Library tags). */
  labels: string[]
}

/** `*calls`, `*q3-review`: a `*` at a word start, then letters, digits, `_` or `-`. */
const LABEL_RE = /(^|\s)\*([\p{L}\p{N}_-]+)/gu

/** Pulls every `*label` out of the text (Kai 2026-10-03: labels in quick add). Run before the date
 * parse so a `*today` label is never read as a date. */
export function stripLabels(input: string): { text: string; labels: string[] } {
  const labels: string[] = []
  const text = input.replace(LABEL_RE, (_, lead: string, label: string) => {
    if (!labels.includes(label)) labels.push(label)
    return lead
  })
  return { text: text.replace(/\s{2,}/g, ' ').trim(), labels }
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
export function hasStructure(parsed: Pick<ParsedCommand, 'dueAt' | 'domainId' | 'projectId' | 'priority' | 'durationMin'> & { labels?: readonly string[] }): boolean {
  return !!(parsed.dueAt || parsed.domainId || parsed.projectId || parsed.priority != null || parsed.durationMin != null || parsed.labels?.length)
}

export interface ParseCommandOptions {
  /** Reference instant for "tomorrow"/"friday"/"10am" (tests pin it). Defaults to now. */
  now?: Date
  /** Whose wall clock a typed time is read on. The command bar reads Cairo's (T-4: the app's one
   * day boundary and render zone). `device` keeps the old reading for callers whose own form is
   * device-local — the calendar's QuickCreate. */
  zone?: 'cairo' | 'device'
}

/** T-4: chrono read the text against Cairo's clock (see the reference in `parseCommand`), so its
 * components are Cairo wall-clock: turn them into the instant with the tz database, which gets
 * a date across a DST switch right. An explicit zone in the text ("3pm UTC") or a relative time
 * ("in 2 hours") is already an exact instant, so chrono's own answer stands. */
function cairoInstant(start: chrono.ParsedComponents): string {
  if (start.isCertain('timezoneOffset')) return start.date().toISOString()
  return cairoWallTimeToIso(
    start.get('year') ?? 0,
    start.get('month') ?? 1,
    start.get('day') ?? 1,
    start.get('hour') ?? 12,
    start.get('minute') ?? 0,
    start.get('second') ?? 0,
  )
}

/**
 * Pure text -> structured-command parser (no AI). Extracts the first date/time mention via
 * chrono-node, a `30m`/`1h`/`1h30m` duration, a `!`/`!!`/`!!!` priority flag, and the first `#tag`
 * fuzzy-matched against project names, falling back to domain names. Whatever's left after
 * stripping all of those becomes the title.
 */
export function parseCommand(
  input: string,
  domains: Domain[],
  projects: Project[],
  { now = new Date(), zone = 'device' }: ParseCommandOptions = {},
): ParsedCommand {
  const { text: unlabelled, labels } = stripLabels(input)
  const stripped = stripPriorityAndDuration(unlabelled)
  let text = stripped.text
  const { priority, durationMin } = stripped

  let dueAt: string | null = null
  const reference = zone === 'cairo' ? { instant: now, timezone: cairoOffsetMinutes(now) } : now
  const results = chrono.parse(text, reference, { forwardDate: true })
  if (results.length > 0) {
    const first = results[0]
    dueAt = zone === 'cairo' ? cairoInstant(first.start) : first.start.date().toISOString()
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

  return { title, dueAt, durationMin, priority, domainId, projectId, domainMatch, projectMatch, labels }
}
