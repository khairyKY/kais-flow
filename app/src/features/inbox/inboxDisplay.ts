// Pure display helpers for InboxPage — colocated + unit-tested, same convention as
// tasks/taskDisplay.ts. TZ Africa/Cairo per house convention (store UTC, render Cairo).

import { cairoDateKey } from '../../lib/dateShortcuts'

const TZ = 'Africa/Cairo'

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/** "Three waiting" headline (Inbox.dc.html 1a) with real, dynamic counts — spelled out up
 * to ten (the design's own example), numeral beyond. */
export function countWord(n: number): string {
  return n <= 10 ? NUMBER_WORDS[n] : String(n)
}

export function isToday(iso: string): boolean {
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
}

export function formatCaptured(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  })
}

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

/** Day-only label for the filing toast (punch 7): "Today" / "Tomorrow" / "Wed, Aug 5".
 * `now` is injectable so the day boundary is testable without faking the clock. */
export function dayWord(iso: string, now: Date = new Date()): string {
  const day = cairoDateKey(new Date(iso))
  if (day === cairoDateKey(now)) return 'Today'
  if (day === cairoDateKey(new Date(now.getTime() + 86_400_000))) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
}

/** "dismissed 2h ago" while recent, then just the weekday, then a bare date — matches 2a/2b copy. */
export function dismissedAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h ago`
  if (hours < 24 * 7) return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })
}

export function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/** A GitHub issue link — only ever a github.com page (payloads and task refs are the user's own
 * rows, but they end up as hrefs). */
export function githubUrl(url: unknown): string | null {
  return typeof url === 'string' && url.startsWith('https://github.com/') ? url : null
}
