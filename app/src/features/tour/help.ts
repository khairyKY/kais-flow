import { create } from 'zustand'
import { queryClient } from '../../lib/queryClient'
import { updateAppSetting } from '../../lib/settings'
import type { AppSettings } from '../../lib/types'

// Tour & help (design-export/Tour and Help*.dc.html, Claude Design prompt 14): the garden notes
// shown once after onboarding, the one-line hints met once each, and what this person has already
// been shown. The rules are the pure functions below; ./TourHost draws them.
//
// "Once, ever": a seen key lives in localStorage per user (`kf-help:<uid>`) and, once migration
// 0058 is on the server, in app_settings.help_seen too, so a new phone doesn't teach it again.
// Seen = the union of both. Until the column exists the server's row has no `help_seen` key and
// nothing is sent (an unknown column would dead-letter every later settings write).

export type HelpKey = 'tour' | 'hint:swipe' | 'hint:calendar' | 'hint:inbox'

// ── the notes ──

export interface TourNote {
  id: string
  /** `data-tour` names, in order of preference: the first one on the page is the note's anchor.
   * Empty = a card with no spotlight (the closing note). */
  anchors: string[]
  /** The page the note lives on — the tour goes there first. */
  path?: string
  line: string
  sub: string
  img: string
  /** Showing this note teaches that hint, so the hint never repeats it. */
  teaches?: HelpKey
  /** The capture button is round; everything else is a soft rectangle. */
  round?: boolean
  /** The looping ghost-finger swipe over the anchored row. */
  ghost?: boolean
  /** The last card: no Next/Skip, one Done. */
  last?: boolean
  /** The phone's closing card ("Garden note · done"): every dot filled, none of its own. */
  closing?: boolean
}

const A = '/ds/assets'
/** The command key as this computer writes it. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

/** 14a–14f: five notes on the real Today, then the closing card. */
export const PHONE_NOTES: TourNote[] = [
  { id: 'capture', anchors: ['capture'], path: '/today', line: 'Tap to write, hold to talk.', sub: 'The terra button is on every page.', img: `${A}/cherry/bud.png`, round: true },
  { id: 'top3', anchors: ['top3'], path: '/today', line: 'Star the three that matter today.', sub: 'Tap ☆ on any task. Three is plenty.', img: `${A}/clover/four_leaf.png` },
  { id: 'row', anchors: ['task-row'], path: '/today', line: 'Swipe right for tomorrow, left to let it go.', sub: 'Changed your mind? Undo waits at the bottom for a few seconds.', img: `${A}/vine/leaf-right.png`, teaches: 'hint:swipe', ghost: true },
  // The app's evening starts at 17:00 (today/dayPhase SHUTDOWN_FROM), so "after five", not the export's six.
  { id: 'plan', anchors: ['plan', 'plan-menu'], path: '/today', line: 'Mornings plan, evenings close.', sub: 'After five this button turns into Shut down.', img: `${A}/daisy/morning.png` },
  { id: 'ask', anchors: ['more'], path: '/today', line: 'Ask anything about your day.', sub: 'Chat lives under More — “what’s on today?” is a good first question.', img: `${A}/clover/awake.png` },
  { id: 'done', anchors: [], line: 'That’s the garden. The rest you’ll find as you go ✿', sub: 'Want the tour again? More → Guide → Show me around again.', img: `${A}/cherry/bloom.png`, last: true, closing: true },
]

/** 14g: the sidebar, the command bar, Top 3, the calendar, and the shortcut card that closes it. */
export const DESKTOP_NOTES: TourNote[] = [
  { id: 'sidebar', anchors: ['sidebar'], path: '/today', line: 'Every bed has a path.', sub: 'Plan up top, the slower things below. Search, Chat and the Guide wait at the foot.', img: `${A}/fern/unfurl1.png` },
  { id: 'command', anchors: ['command-bar'], path: '/today', line: `${MOD}K does nearly everything.`, sub: 'Write a task, jump anywhere, or ask. The date and the details are filled in for you.', img: `${A}/cherry/bud.png` },
  { id: 'top3', anchors: ['top3'], path: '/today', line: 'Star the three that matter today.', sub: 'Tap ☆ on any task. Three is plenty.', img: `${A}/clover/four_leaf.png` },
  { id: 'calendar', anchors: ['calendar-block', 'calendar'], path: '/calendar', line: 'Drag a block to move it; pull an edge to resize.', sub: 'Everything snaps to the quarter hour. Drag tasks in from the rail, too.', img: `${A}/wisteria/p40.png`, teaches: 'hint:calendar' },
  { id: 'keys', anchors: [], line: 'shows every shortcut.', sub: 'Press it on any page. Esc closes it. That’s the garden ✿', img: '', last: true },
]

/** The seedling progress: one dot per note; the phone's closing card has none of its own. */
export function dotCount(notes: readonly TourNote[]): number {
  return notes.filter((n) => !n.closing).length
}

// ── the tour's state machine ──

export type TourEvent = 'next' | 'missing' | 'skip' | 'done'

/** The tour after `e` on note `at` of `count`: the next note's index, or null when it's over.
 * Next past the end, Skip and Done all end it ("Skip ends the tour and counts as seen"); a note
 * whose anchor never showed up ("missing") is passed over, never a dead end. */
export function tourStep(at: number, e: TourEvent, count: number): number | null {
  if (e === 'skip' || e === 'done') return null
  const next = at + 1
  return next < count ? next : null
}

/** Start the tour on its own? Only right after onboarding on this device, never twice. */
export function shouldAutoStart(pending: boolean, seen: ReadonlySet<string>, running: boolean): boolean {
  return pending && !running && !seen.has('tour')
}

// ── the hints (14h): one line, once each, one at a time, never during the tour ──

export interface Hint {
  key: HelpKey
  /** The `data-tour` name it sits under — the first one in view. */
  anchor: string
  path?: string
  /** Swipes are touch-only (a mouse never swipes), so this hint is too. */
  touchOnly?: boolean
  line: { phone: string; desktop: string }
}

export const HINTS: Hint[] = [
  { key: 'hint:swipe', anchor: 'task-row', touchOnly: true, line: { phone: 'Swipe right for tomorrow, left to let it go.', desktop: '' } },
  { key: 'hint:calendar', anchor: 'calendar-block', path: '/calendar', line: { phone: 'Hold a block to move it, drag its edges to resize.', desktop: 'Drag a block to move it; pull an edge to resize.' } },
  { key: 'hint:inbox', anchor: 'inbox-item', path: '/inbox', line: { phone: 'Each one becomes a task, a note, or nothing.', desktop: 'Each one becomes a task, a note, or nothing.' } },
]

export interface HintContext {
  seen: ReadonlySet<string>
  touch: boolean
  tourRunning: boolean
  path: string
  /** A `data-tour` element with this name is on screen. */
  has: (name: string) => boolean
}

export function pickHint(hints: readonly Hint[], c: HintContext): Hint | null {
  if (c.tourRunning) return null
  return hints.find((h) => !c.seen.has(h.key) && (!h.touchOnly || c.touch) && (!h.path || c.path === h.path) && c.has(h.anchor)) ?? null
}

// ── what's been seen, per user ──

const localKey = (uid: string) => `kf-help:${uid}`
const pendingKey = (uid: string) => `kf-tour-pending:${uid}`

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const ls = (): Store | null => (typeof localStorage === 'undefined' ? null : localStorage)

export function readSeen(uid: string, s: Store | null = ls()): string[] {
  try {
    const v = JSON.parse(s?.getItem(localKey(uid)) ?? '[]')
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function writeSeen(uid: string, keys: readonly string[], s: Store | null = ls()): void {
  try {
    s?.setItem(localKey(uid), JSON.stringify([...new Set(keys)]))
  } catch {
    /* storage blocked: this session only */
  }
}

export function mergeSeen(local: readonly string[], synced: readonly string[] | null | undefined): Set<string> {
  return new Set([...local, ...(synced ?? [])])
}

/** Onboarding finished on this device (Start, Skip or Import): the tour is due on the first Today. */
export function markTourPending(uid: string | undefined, s: Store | null = ls()): void {
  if (!uid) return
  try {
    s?.setItem(pendingKey(uid), '1')
  } catch {
    /* no storage: no tour, nothing else depends on it */
  }
}

export function tourPending(uid: string, s: Store | null = ls()): boolean {
  try {
    return s?.getItem(pendingKey(uid)) === '1'
  } catch {
    return false
  }
}

function clearTourPending(uid: string, s: Store | null = ls()): void {
  try {
    s?.removeItem(pendingKey(uid))
  } catch {
    /* nothing to clear */
  }
}

// ── the shared state: who, what they've seen here, and which note is up ──

interface HelpState {
  uid?: string
  local: string[]
  /** The note on screen while the tour runs; null otherwise. */
  note: number | null
}

export const useHelp = create<HelpState>(() => ({ local: [], note: null }))

/** The server's copy, when the column exists (an array) — undefined before migration 0058. */
function syncedSeen(): string[] | undefined {
  const row = queryClient.getQueryData<AppSettings>(['app_settings'])
  return Array.isArray(row?.help_seen) ? row.help_seen : undefined
}

function save(next: string[]) {
  const { uid } = useHelp.getState()
  if (!uid) return
  writeSeen(uid, next)
  useHelp.setState({ local: next })
  // Every settings write goes through the outbox (lib/settings → writeRow).
  if (syncedSeen()) updateAppSetting('help_seen', next)
}

export function loadHelp(uid: string | undefined): void {
  if (uid === useHelp.getState().uid) return
  useHelp.setState({ uid, local: uid ? readSeen(uid) : [], note: null })
}

export function markSeen(...keys: HelpKey[]): void {
  const { local } = useHelp.getState()
  const all = mergeSeen(local, syncedSeen())
  if (keys.every((k) => all.has(k))) return
  save([...new Set([...all, ...keys])])
}

/** "Show me around again" (the Guide, Settings → App, the ? sheet): forget the tour and every
 * hint, and start the notes from the first one. */
export function restartTour(): void {
  save([])
  useHelp.setState({ note: 0 })
}

export function startTour(): void {
  useHelp.setState({ note: 0 })
}

/** Moves the tour on; when it ends it counts as seen and the onboarding flag is spent. */
export function tourEvent(e: TourEvent, count: number): void {
  const { note, uid } = useHelp.getState()
  if (note == null) return
  const next = tourStep(note, e, count)
  useHelp.setState({ note: next })
  if (next == null) {
    if (uid) clearTourPending(uid)
    markSeen('tour')
  }
}
