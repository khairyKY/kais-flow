// Sharing with people you connect (v1.6.6, partner sharing P1; migration 0100): the words and the rules the screens use,
// pure so they are tested. The server owns every rule that protects data (masking, the lower level, the pause) -
// this file only mirrors the ones the app must SAY: what each level shows, what the rule line reads, when a pause ends.
import { zoneDateKey } from '../../lib/dateShortcuts'
import { BLOCK_SWATCHES } from '../calendar/blockHue'

export type Level = 'busy' | 'titles' | 'details'
export type Relation = 'partner' | 'family' | 'friend'

export const LEVELS: readonly Level[] = ['busy', 'titles', 'details']
export const RELATIONS: readonly Relation[] = ['partner', 'family', 'friend']

export const LEVEL_NAME: Record<Level, string> = { busy: 'Busy only', titles: 'Titles', details: 'Details' }
export const LEVEL_HELP: Record<Level, string> = {
  busy: 'Blocks with no titles',
  titles: 'Calendar titles and times',
  details: 'Titles and times, Top 3, today’s tasks and their notes',
}
export const RELATION_NAME: Record<Relation, string> = { partner: 'Partner', family: 'Family', friend: 'Friend' }

/** Partner starts at Details, Family at Titles, Friend at Busy only (Kai 2026-10-29); the server applies the same rule (share_default_level). */
export const defaultLevel = (r: Relation): Level => (r === 'partner' ? 'details' : r === 'family' ? 'titles' : 'busy')
/** Both of the viewer's switches ("Show her lane on my calendar", "Show her day on Today") start on for a Partner and off for
 * Family and Friend (Kai 2026-11-17, two switches 2026-11-18); the server applies the same rule when a code is accepted. */
export const laneDefault = (r: Relation): boolean => r === 'partner'
export const dayDefault = laneDefault
/** Her colour until you pick another: palette C's Heather (the day hex the server stores). */
export const HER_COLOR: string = BLOCK_SWATCHES.find((s) => s.name === 'Heather')!.value

/** You see what you show: both get the lower of the two levels. */
export const lower = (a: Level, b: Level): Level => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b)

/** One connection, as `share_connections()` returns it. */
export interface Connection {
  circle_id: string
  relation: Relation
  partner_id: string
  partner_name: string
  my_level: Level
  their_level: Level
  /** The lower of the two. */
  level: Level
  my_grant_id: string
  /** "Show her lane on my calendar": mine alone. */
  show_lane: boolean
  /** "Show her day on Today": mine alone. */
  show_day: boolean
  /** The colour I gave her: one of palette C's 16 (BLOCK_SWATCHES); mine alone, she never sees it. */
  color: string
  since: string
  /** Set while a pause is on ('infinity' = until turned back on). */
  paused_until: string | null
  paused_by_me: boolean
}

/** The rule line under the levels: "You show Details · Reem shows Busy only → you both see Busy only". */
export function ruleNow(c: Pick<Connection, 'my_level' | 'their_level' | 'partner_name'>): { show: string; sees: string } {
  return {
    show: `You show ${LEVEL_NAME[c.my_level]} · ${c.partner_name} shows ${LEVEL_NAME[c.their_level]}`,
    sees: `you both see ${LEVEL_NAME[lower(c.my_level, c.their_level)]}`,
  }
}

/** Whose choice limits the pair: 'me' when I show less than they do, 'them' when they show less, null when equal. */
export function limitedBy(c: Pick<Connection, 'my_level' | 'their_level'>): 'me' | 'them' | null {
  const a = LEVELS.indexOf(c.my_level), b = LEVELS.indexOf(c.their_level)
  return a === b ? null : a < b ? 'me' : 'them'
}

// ── the code ──

/** A-Z and 2-9 without 0, O, 1 and I: 32 symbols. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

/** What a person typed or pasted, as the code it names: "k7qm-r4tx", " K7QM R4TX " -> "K7QMR4TX". Never longer than 8. */
export const cleanCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
export const isCode = (s: string): boolean => CODE_RE.test(s)
/** "K7QMR4TX" -> "K7QM–R4TX" (the tiles' dash). */
export const formatCode = (code: string): string => (code.length > 4 ? `${code.slice(0, 4)}–${code.slice(4)}` : code)
/** The same, for a text message: a plain hyphen. */
export const plainCode = (code: string): string => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code)

/** The code in a pasted message or link: the last 8-character run of the alphabet in "…join/K7QMR4TX", "Code: K7QM-R4TX …". */
export function codeIn(text: string): string | null {
  const link = /\/join\/([A-Za-z0-9]{8})(?![A-Za-z0-9])/.exec(text)
  if (link && isCode(cleanCode(link[1]))) return cleanCode(link[1])
  const dashed = /\b([A-Za-z0-9]{4})[-–—]([A-Za-z0-9]{4})\b/.exec(text)
  if (dashed && isCode(cleanCode(dashed[1] + dashed[2]))) return cleanCode(dashed[1] + dashed[2])
  const bare = cleanCode(text)
  return isCode(bare) ? bare : null
}

/** The web fallback link (works with no app installed) and the app's own address. */
export const webInvite = (code: string, origin: string): string => `${origin.replace(/\/$/, '')}/join/${code}`
export const appInvite = (code: string): string => `kaisflow://join/${code}`

/** The message the invite's Share… hands to her chat app: who, the code, how long, and where to type it (or just tap the link). */
export function inviteMessage(from: string, code: string, link: string, expires: string): string {
  return `${from} invited you to share your days on Kai's Flow. Code: ${plainCode(code)} (works once, for 24 hours, until ${expires}). Tap to connect: ${link} Or in Kai's Flow: Settings → Sharing → Enter a code.`
}

// ── pause ──

/** A pause has no automatic end unless you pick a timed one (Kai 2026-11-18): "forever" is the first and main choice. */
export type PauseKind = 'forever' | 'hour'
export const PAUSE_KINDS: readonly PauseKind[] = ['forever', 'hour']
export const PAUSE_NAME: Record<PauseKind, string> = { forever: 'Pause until I turn it back on', hour: 'Pause for an hour' }

/** When a pause ends: 'infinity' (until turned back on), or an hour from now. */
export function pauseUntil(kind: PauseKind, now: Date): string {
  return kind === 'forever' ? 'infinity' : new Date(now.getTime() + 3_600_000).toISOString()
}

/** "Back tomorrow at 8:00 AM", "Back at 3:40 PM", "Until you turn it back on". */
export function pauseLine(until: string, now: Date, zone: string): string {
  if (until === 'infinity') return 'Until turned back on'
  const t = new Date(until)
  const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })
  const day = zoneDateKey(t, zone)
  const today = zoneDateKey(now, zone)
  if (day === today) return `Back at ${time}`
  const tomorrow = zoneDateKey(new Date(now.getTime() + 86_400_000), zone)
  return day === tomorrow ? `Back tomorrow at ${time}` : `Back ${t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone })} at ${time}`
}

/** What the toast says right after a pause is set: no end is said plainly, a timed one says when it ends. */
export const pausedSaid = (until: string, now: Date, zone: string): string =>
  until === 'infinity' ? 'Paused until you turn it back on.' : `Paused. ${pauseLine(until, now, zone)}.`

export const isPaused = (c: Pick<Connection, 'paused_until'>): boolean => !!c.paused_until

// ── told in the app only: what changed since the last time this device looked ──

export interface Seen { name: string; my_level: Level; their_level: Level; paused: boolean }
export type SeenMap = Record<string, Seen>

export const seenOf = (cs: readonly Connection[]): SeenMap =>
  Object.fromEntries(cs.map((c) => [c.circle_id, { name: c.partner_name, my_level: c.my_level, their_level: c.their_level, paused: isPaused(c) && !c.paused_by_me }]))

/** The toasts a change in the connections earns, in plain words. The other side's drop in level, their pause, and their
 * leaving (a connection I did not end myself) are told; my own changes never are. `ended`: circles this device ended itself. */
export function notices(prev: SeenMap, next: readonly Connection[], ended: ReadonlySet<string> = new Set(), now = new Date(), zone = 'UTC'): string[] {
  const out: string[] = []
  const nowIds = new Set(next.map((c) => c.circle_id))
  for (const [id, was] of Object.entries(prev)) {
    if (!nowIds.has(id) && !ended.has(id)) out.push(`${was.name} stopped sharing. Their blocks are gone from your calendar.`)
  }
  for (const c of next) {
    const was = prev[c.circle_id]
    if (!was) continue
    if (LEVELS.indexOf(c.their_level) < LEVELS.indexOf(was.their_level)) {
      out.push(`${c.partner_name} now shows ${LEVEL_NAME[c.their_level]}, so you both see ${LEVEL_NAME[c.level]}.`)
    }
    if (isPaused(c) && !c.paused_by_me && !was.paused) out.push(`${c.partner_name} paused sharing. ${pauseLine(c.paused_until!, now, zone)}.`)
  }
  return out
}
