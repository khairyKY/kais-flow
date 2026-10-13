import * as chrono from 'chrono-node'
import { appZone } from '../../lib/appZone'
import { cairoOffsetMinutes, cairoWallTimeToIso, zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { parseRecurrence } from '../import/adapters/shared'
import { nextOccurrence } from '../tasks/recurrence'
import type { Domain, Project } from '../../lib/types'

export interface ParsedCommand {
  title: string
  dueAt: string | null
  /** A clock time was typed ("4am", "15:00", "in 2 hours") — not just a date, whose time chrono
   * only implies. Kai's rule (calendar/replan.ts): a timed capture lands on the calendar as a block. */
  dueTimed: boolean
  durationMin: number | null
  priority: number | null
  domainId: string | null
  projectId: string | null
  domainMatch: string | null
  projectMatch: string | null
  /** `*label` words, in order, once each — the `*` the app shows labels with (task editor, Library tags). */
  labels: string[]
  /** "every week", "every mon, fri" → the RRULE it repeats by (P7e A5); `dueAt` is then its first day. */
  recurrence: string | null
  /** `// the rest` — the notes, as written (P7e A6). */
  notes: string | null
}

/** `*calls`, `*q3-review`: a `*` at a word start, then letters, digits, `_` or `-`. */
const LABEL_RE = /(^|\s)\*([\p{L}\p{N}_-]+)/gu

/** Matches `30m`, `1h`, or `1h30m` anywhere in the text. */
const DURATION_RE = /\b(\d+)h(?:(\d+)m)?\b|\b(\d+)m\b/i

/** `!`/`!!`/`!!!` -> priority 3/2/1 (1 is most urgent) — matches `taskDisplay.ts`'s own
 * `priorityFlag`, which renders priority 1 back out as `!!!`: what you type is what you see. */
const PRIORITY_RE = /!{1,3}/

// P7e A5: "every day", "every 2 weeks", "every other month", "every monday", "every mon, fri",
// "every weekday", "every week on tue and thu". Only "every …": a bare "weekly review" stays a title.
// The words become the RRULE through the importer's own reader (import/adapters/shared parseRecurrence).
const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*'
const DAYS = `${DAY}(?:\\s*(?:,|and)\\s*${DAY})*`
const REPEAT_RE = new RegExp(`(?<![\\p{L}\\p{N}])every\\s+(?:(?:(?:other|\\d+)\\s+)?(?:day|week|month|year)s?(?:\\s+on\\s+${DAYS})?|(?:weekday|workday)s?|${DAYS})(?![\\p{L}\\p{N}])`, 'iu')

/** Does this parse carry enough structure to create a task directly, instead of falling through
 * to a bare Inbox capture? Priority/duration count as structure too — matching a `!`/`30m`-only
 * command (e.g. "buy milk !!") that has no date/project still means "create a task now". */
export function hasStructure(parsed: Pick<ParsedCommand, 'dueAt' | 'domainId' | 'projectId' | 'priority' | 'durationMin'> & { labels?: readonly string[]; notes?: string | null }): boolean {
  return !!(parsed.dueAt || parsed.domainId || parsed.projectId || parsed.priority != null || parsed.durationMin != null || parsed.labels?.length || parsed.notes)
}

export interface ParseCommandOptions {
  /** Reference instant for "tomorrow"/"friday"/"10am" (tests pin it). Defaults to now. */
  now?: Date
  /** Whose wall clock a typed time is read on. `'cairo'` (a historical name) is the user's own zone,
   * app_settings.timezone (T-4: the app's one day boundary and render zone) — what the command bar
   * reads. `device` keeps the old reading for callers whose own form is device-local. */
  zone?: 'cairo' | 'device'
}

/** T-4: chrono read the text against the user's clock (see the reference in `parseCommand`), so its
 * components are that wall-clock: turn them into the instant with the tz database, which gets
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
 * Pure text -> structured-command parser (no AI). Extracts `// notes`, `*labels`, a `!`/`!!`/`!!!` priority flag,
 * a `30m`/`1h`/`1h30m` duration, an "every …" repeat, the first date/time mention via chrono-node,
 * and the first `#tag` fuzzy-matched against project names, falling back to domain names. Whatever's
 * left after taking all of those out becomes the title.
 */
export function parseCommand(
  input: string,
  domains: Domain[],
  projects: Project[],
  { now = new Date(), zone = 'device' }: ParseCommandOptions = {},
): ParsedCommand {
  // Each token found is blanked out of `work` with spaces of its own length, so every index in `work`
  // is still an index into `input`; the title is what's left.
  let work = input
  const take = (start: number, end: number) => {
    work = work.slice(0, start) + ' '.repeat(end - start) + work.slice(end)
  }

  // `//` and everything after it are the notes, read as written (P7e A6, Akiflow's description mark).
  // Only at a word start: a link's "https://" keeps its slashes.
  let notes: string | null = null
  const slashes = /(^|\s)\/\//.exec(work)
  if (slashes) {
    const at = slashes.index + slashes[1].length
    notes = input.slice(at + 2).trim() || null
    take(at, input.length)
  }

  // Labels next (Kai 2026-10-03), so a `*today` label is never read as a date.
  const labels: string[] = []
  for (const m of work.matchAll(LABEL_RE)) {
    const at = m.index + m[1].length
    if (!labels.includes(m[2])) labels.push(m[2])
    take(at, at + 1 + m[2].length)
  }

  // Priority before the #tag: `\S+` doesn't stop at `!`.
  let priority: number | null = null
  const bang = PRIORITY_RE.exec(work)
  if (bang) {
    priority = 4 - bang[0].length
    take(bang.index, bang.index + bang[0].length)
  }

  // Duration before chrono: it reads a bare "30m"/"1h30m" as "in 30 minutes" and would take it as the date.
  let durationMin: number | null = null
  const len = DURATION_RE.exec(work)
  if (len) {
    durationMin = len[1] ? parseInt(len[1], 10) * 60 + (len[2] ? parseInt(len[2], 10) : 0) : parseInt(len[3], 10)
    take(len.index, len.index + len[0].length)
  }

  // The repeat before chrono too, or "every monday" would be read as just next Monday.
  const repeat = REPEAT_RE.exec(work)
  const recurrence = repeat && parseRecurrence(repeat[0])
  if (repeat && recurrence) take(repeat.index, repeat.index + repeat[0].length)

  let dueAt: string | null = null
  let dueTimed = false
  const reference = zone === 'cairo' ? { instant: now, timezone: cairoOffsetMinutes(now) } : now
  const first = chrono.parse(work, reference, { forwardDate: true })[0]
  if (first) {
    dueAt = zone === 'cairo' ? cairoInstant(first.start) : first.start.date().toISOString()
    dueTimed = first.start.isCertain('hour')
    // `<friday` (Akiflow's deadline mark) is just the date here — one date (P7e A6, B4 a); its `<` goes too.
    take(work[first.index - 1] === '<' ? first.index - 1 : first.index, first.index + first.text.length)
  }

  if (recurrence) {
    // A series starts on its own first day, at the typed time: "every monday 6pm" is next Monday 18:00.
    // Undated, it starts today first thing, like a repeat set from the menu (tasks/api setRecurrence).
    const z = zone === 'cairo' ? appZone() : Intl.DateTimeFormat().resolvedOptions().timeZone
    const [y, m, d] = zoneDateKey(now, z).split('-').map(Number)
    const from = new Date(dueAt ?? zoneWallTimeToIso(z, y, m, d, 9))
    dueAt = (nextOccurrence(recurrence, from, z, new Date(from.getTime() - 1)) ?? from).toISOString()
  }

  let domainId: string | null = null
  let projectId: string | null = null
  let domainMatch: string | null = null
  let projectMatch: string | null = null

  const tagMatch = /#(\S+)/.exec(work)
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
    take(tagMatch.index, tagMatch.index + tagMatch[0].length)
  }

  const title = work.replace(/\s{2,}/g, ' ').trim()

  return { title, dueAt, dueTimed, durationMin, priority, domainId, projectId, domainMatch, projectMatch, labels, recurrence, notes }
}

/** A parse as a new task — tasks/api createTask's input: the command bar's quick add, and the Tasks
 * page's quick add (Kai 2026-10-12: its placeholder promised "tomorrow 3pm #forecasting" but only
 * `*labels` were read). `typed` stands in when the tokens used the whole line up ("tomorrow 3pm"). */
export function quickAddTask(parsed: ParsedCommand, typed: string) {
  return {
    title: parsed.title || typed,
    domainId: parsed.domainId,
    projectId: parsed.projectId,
    dueAt: parsed.dueAt,
    durationMin: parsed.durationMin,
    priority: parsed.priority,
    labels: parsed.labels,
    recurrenceRule: parsed.recurrence,
    notes: parsed.notes,
  }
}
