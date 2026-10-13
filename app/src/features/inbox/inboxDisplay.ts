// Pure display + triage helpers for InboxPage — colocated + unit-tested, same convention as
// tasks/taskDisplay.ts. Days and times are the user's zone (store UTC, render the user's clock).

import { cairoDateKey } from '../../lib/dateShortcuts'
import { appZone } from '../../lib/appZone'
import { addDays, dayHint, dayShort } from '../../components/pickerMath'
import { cairoTimeKey } from '../calendar/eventTime'
import { confidenceThreshold } from '../capture/aiFill'
import { NO_PLACE, type MoveTarget } from '../tasks/move'
import type { Domain, InboxItem, InboxKind, Person, Project } from '../../lib/types'

// ── Inbox t3 (Inbox.dc.html 3a/3b, the reviewed pass): one decision per card, honest counts,
// confidence as a word. ──

/** The AI read on a capture (capture/parseSchema's ParseResult, loosely — older rows lack fields). */
export interface AiParse {
  kind?: string
  cleaned_text?: string
  title?: string
  confidence?: number
  domain_id?: string | null
  project_id?: string | null
  due_at?: string | null
  has_time?: boolean | null
}
export const parseOf = (item: Pick<InboxItem, 'ai_parse'>): AiParse | null => item.ai_parse as AiParse | null

/** "3 to sort · 2 from GitHub · oldest is 1 day old" (3a); the phone drops the oldest (3b). Empty at
 * Inbox zero — the zero card says it. GitHub issues are counted on their own, never "to sort". */
export function inboxSummary(captures: readonly Pick<InboxItem, 'created_at'>[], github: number, now: Date = new Date(), withOldest = true): string {
  if (captures.length === 0 && github === 0) return ''
  const parts = [captures.length ? `${captures.length} to sort` : 'Nothing to sort']
  if (github) parts.push(`${github} from GitHub`)
  if (withOldest && captures.length) {
    const oldest = captures.reduce((a, b) => (a.created_at < b.created_at ? a : b)).created_at
    const days = Math.max(0, Math.round((Date.parse(cairoDateKey(now)) - Date.parse(cairoDateKey(new Date(oldest)))) / 86_400_000))
    parts.push(days === 0 ? 'oldest is from today' : `oldest is ${days} day${days === 1 ? '' : 's'} old`)
  }
  return parts.join(' · ')
}

/** "high confidence" (3a) instead of "87%". Below capture's auto-file line the card asks instead. */
export function confidenceWord(confidence: number | null | undefined): string | null {
  if (typeof confidence !== 'number') return null
  if (confidence >= 0.85) return 'high confidence'
  return confidence >= confidenceThreshold() ? 'medium confidence' : 'low confidence'
}

/** The title a capture files under: the AI's short title (dates and urgency already pulled into
 * fields — "Call Omar about pricing"), else its cleaned text, else the words as captured. */
export function suggestedTitle(item: Pick<InboxItem, 'ai_parse' | 'raw_text'>): string {
  const p = parseOf(item)
  return p?.title?.trim() || p?.cleaned_text?.trim() || item.raw_text
}

/** Which card a capture gets (3a): `suggested` — a confident read with something to show (a tidier
 * title, a place); `unsure` — "Where does this go?"; `plain` — nothing to decide but File (no read
 * at all, or a confident read that only confirms the words): the compact row. */
export type CardShape = 'suggested' | 'unsure' | 'plain'
export function cardShape(item: Pick<InboxItem, 'ai_parse' | 'raw_text'>): CardShape {
  const p = parseOf(item)
  if (!p) return 'plain'
  if ((p.confidence ?? 0) < confidenceThreshold()) return 'unsure'
  return suggestedTitle(item) === item.raw_text.trim() && !p.project_id && !p.domain_id ? 'plain' : 'suggested'
}

/** Someone the capture names ("that thing salma said…" → Salma): a whole-word match on the full
 * name, else the first name; the longest name wins. Letters of any script, any case. */
export function mentionedPerson<P extends Pick<Person, 'name'>>(text: string, people: readonly P[]): P | undefined {
  const has = (name: string) => {
    const n = name.trim()
    if (n.length < 2) return false
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu').test(text)
  }
  const byLength = [...people].sort((a, b) => b.name.length - a.name.length)
  return byLength.find((p) => has(p.name)) ?? byLength.find((p) => has(p.name.trim().split(/\s+/)[0]))
}

export const KIND_LABEL: Record<InboxKind, string> = { text: 'Typed', voice: 'Voice', github_issue: 'GitHub', email: 'Email' }

/** Where a capture would be filed: a task, today's journal, or a note on a person's page. */
export type FileKind = 'task' | 'journal' | 'person'
export const FILE_WORD: Record<FileKind, string> = { task: 'Task', journal: 'Journal note', person: 'People' }

/** One card's editable suggestion (3a's "Suggested" row). `text` is null until the user edits it —
 * the field then shows the default for its kind (a task's short title, a note's whole capture). */
export interface Draft {
  to: FileKind
  personId: string | null
  text: string | null
  dueAt: string | null
  /** The due has a clock time (shown and kept), not just a day. */
  timed: boolean
  place: MoveTarget
}

/** The AI's place, checked against the user's own lists (a deleted or archived project is no place). */
export function suggestedPlace(parse: AiParse | null, projects: readonly Project[], domains: readonly Domain[]): MoveTarget {
  const p = parse?.project_id ? projects.find((x) => x.id === parse.project_id && x.status !== 'archived') : undefined
  if (p) return { kind: 'project', id: p.id, domainId: p.domain_id ?? null, name: p.name }
  const d = parse?.domain_id ? domains.find((x) => x.id === parse.domain_id) : undefined
  return d ? { kind: 'domain', id: d.id, name: d.name } : NO_PLACE
}

export function defaultDraft(item: Pick<InboxItem, 'ai_parse' | 'raw_text'>, projects: readonly Project[], domains: readonly Domain[]): Draft {
  const p = parseOf(item)
  return {
    to: p?.kind === 'note' ? 'journal' : 'task',
    personId: null,
    text: null,
    dueAt: p?.due_at ?? null,
    timed: p?.has_time !== false,
    place: suggestedPlace(p, projects, domains),
  }
}

/** The words a draft files: what the user typed, else a task's short title, else the whole capture. */
export function draftText(item: Pick<InboxItem, 'ai_parse' | 'raw_text'>, draft: Draft): string {
  return draft.text ?? (draft.to === 'task' ? suggestedTitle(item) : item.raw_text)
}

/** When it was captured: "21:14" today, "yesterday", "Thu 21:14" this week (just "Thu" without the
 * time), else "9 Jul" — the user's clock. */
export function capturedLabel(iso: string, now: Date = new Date(), withTime = true): string {
  const at = new Date(iso)
  const day = cairoDateKey(at)
  const today = cairoDateKey(now)
  if (day === today) return withTime ? cairoTimeKey(at) : 'today'
  if (day === addDays(today, -1)) return 'yesterday'
  if (day > addDays(today, -7)) return withTime ? `${dayShort(day).slice(0, 3)} ${cairoTimeKey(at)}` : dayShort(day).slice(0, 3)
  return dayShort(day).slice(4)
}

/** The date field: "Sat 11 Oct · 15:00" (3a), "Sat 15:00" on a phone chip (3b), "Today"/"Tomorrow"
 * by name; a day-only due shows no time. */
export function dueLabel(iso: string, timed: boolean, now: Date = new Date(), short = false): string {
  const d = new Date(iso)
  const key = cairoDateKey(d)
  const today = cairoDateKey(now)
  const day = key === today ? 'Today' : key === addDays(today, 1) ? 'Tomorrow' : short ? dayShort(key).slice(0, 3) : dayShort(key)
  return timed ? `${day}${short ? ' ' : ' · '}${cairoTimeKey(d)}` : day
}

/** The compact row's "due Tue 14" (3a card 3): today / tomorrow by name, else the day. */
export function dueShort(iso: string, now: Date = new Date()): string {
  const key = cairoDateKey(new Date(iso))
  const today = cairoDateKey(now)
  return key === today ? 'today' : key === addDays(today, 1) ? 'tomorrow' : dayHint(key, today)
}

/** A GitHub row's age: "3 days" (3a), "3d" on a phone (3b). */
export function ageLabel(iso: string, now: Date = new Date(), short = false): string {
  const d = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
  if (d === 0) return 'today'
  return short ? `${d}d` : `${d} day${d === 1 ? '' : 's'}`
}

/** "From GitHub · Shaheen/website" when every issue is from one repo, else "From GitHub". */
export function githubHeading(items: readonly Pick<InboxItem, 'payload'>[]): string {
  const repos = new Set(items.map((i) => (i.payload as { repo?: string } | null)?.repo).filter(Boolean))
  return repos.size === 1 ? `From GitHub · ${[...repos][0]}` : 'From GitHub'
}

/** Snoozed captures — still pending, hidden from Waiting until their time — soonest back first.
 * They show in neither Waiting nor Dismissed; the header's "· N snoozed" opens them. */
export function snoozedOf<T extends Pick<InboxItem, 'status' | 'snoozed_until' | 'deleted_at'>>(items: readonly T[], now: Date = new Date()): T[] {
  const until = (i: T) => i.snoozed_until ?? ''
  return items.filter((i) => !i.deleted_at && i.status === 'pending' && until(i) && new Date(until(i)) > now).sort((a, b) => until(a).localeCompare(until(b)))
}

/** When a snoozed capture comes back: "back Tomorrow · 09:00", "back Mon 19 Oct · 09:00" (user's clock). */
export const backLabel = (iso: string, now: Date = new Date()): string => `back ${dueLabel(iso, true, now)}`

export function isToday(iso: string): boolean {
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
}

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: appZone() })
}

/** Day-only label for the filing toast (punch 7): "Today" / "Tomorrow" / "Wed, Aug 5".
 * `now` is injectable so the day boundary is testable without faking the clock. */
export function dayWord(iso: string, now: Date = new Date()): string {
  const day = cairoDateKey(new Date(iso))
  if (day === cairoDateKey(now)) return 'Today'
  if (day === cairoDateKey(new Date(now.getTime() + 86_400_000))) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: appZone() })
}

/** "dismissed 2h ago" while recent, then just the weekday, then a bare date — matches 2a/2b copy. */
export function dismissedAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h ago`
  if (hours < 24 * 7) return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: appZone() })
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: appZone() })
}

/** A GitHub issue link — only ever a github.com page (payloads and task refs are the user's own
 * rows, but they end up as hrefs). */
export function githubUrl(url: unknown): string | null {
  return typeof url === 'string' && url.startsWith('https://github.com/') ? url : null
}
