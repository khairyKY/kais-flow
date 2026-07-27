// Pure display helpers for InboxPage — colocated + unit-tested, same convention as
// tasks/taskDisplay.ts. TZ Africa/Cairo per house convention (store UTC, render Cairo).

const TZ = 'Africa/Cairo'

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/** "Three waiting" headline (Inbox.dc.html 1a) with real, dynamic counts — spelled out up
 * to ten (the design's own example), numeral beyond. */
export function countWord(n: number): string {
  return n <= 10 ? NUMBER_WORDS[n] : String(n)
}

export function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
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

function cairoDay(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD, sortable + comparable
}

/** Day-only label for the filing toast (punch 7): "Today" / "Tomorrow" / "Wed, Aug 5".
 * `now` is injectable so the day boundary is testable without faking the clock. */
export function dayWord(iso: string, now: Date = new Date()): string {
  const day = cairoDay(new Date(iso))
  if (day === cairoDay(now)) return 'Today'
  if (day === cairoDay(new Date(now.getTime() + 86_400_000))) return 'Tomorrow'
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
