// cal-wave item 19 (Kai's pick "now card A", design-export/Calendar extras options.html §4): what the
// calendar's Ongoing / Up next card stands for. Today's own rule picks the candidates (today/upNext:
// timed, running now or starting later today, an event drops off the minute it ends); this adds the
// card's: only what starts within the hour is "Up next", and when several run at once the one that
// ENDS SOONEST leads, so a long block can't hide a prayer or a meeting inside it (the research:
// D:\Coding\_claude-cloud\kais-flow-akiflow-ongoing-research-2026-10-24.md). Pure: the card feeds it
// the clock from lib/minuteClock.
import { formatDuration } from '../tasks/taskDisplay'
import { isInProgress, upNextEvents, type UpNextEvent } from '../today/upNext'

/** Up next = starts within this many minutes; later today reads as a clock time only. */
export const NEXT_WINDOW_MIN = 60

export interface NowNextItem extends UpNextEvent {
  id: string
  title: string
}

export type NowNext<E> =
  | { state: 'none' }
  /** Nothing within the hour: the next thing today, as a clock time. */
  | { state: 'far'; next: E }
  /** Nothing running; `main` starts within the hour, `next` = the rest that do too. */
  | { state: 'soon'; main: E; next: E[] }
  /** `main` = the running one ending soonest, `others` = the rest running, `next` = within the hour. */
  | { state: 'on'; main: E; others: E[]; next: E[] }

const ms = (iso: string) => new Date(iso).getTime()

/** Running ones: the soonest end first; then the later start (the one inside the other); then the title. */
function endsSoonest<E extends NowNextItem>(a: E, b: E): number {
  return ms(a.ends_at) - ms(b.ends_at) || ms(b.starts_at) - ms(a.starts_at) || a.title.localeCompare(b.title)
}

/** `skip` drops what the card shouldn't stand for (a done task's block). Zero-length blocks never count. */
export function pickNowNext<E extends NowNextItem>(events: readonly E[], now: Date, skip: (e: E) => boolean = () => false): NowNext<E> {
  const t = now.getTime()
  const live = upNextEvents(events, now).filter((e) => ms(e.ends_at) > ms(e.starts_at) && !skip(e))
  const ongoing = live.filter((e) => isInProgress(e.starts_at, e.ends_at, now)).sort(endsSoonest)
  const upcoming = live.filter((e) => ms(e.starts_at) > t)
  const soon = upcoming.filter((e) => ms(e.starts_at) - t <= NEXT_WINDOW_MIN * 60_000)
  if (ongoing.length) return { state: 'on', main: ongoing[0], others: ongoing.slice(1), next: soon }
  if (soon.length) return { state: 'soon', main: soon[0], next: soon.slice(1) }
  if (upcoming.length) return { state: 'far', next: upcoming[0] }
  return { state: 'none' }
}

/** Whole minutes, rounded up, never 0: "12m", "1h 5m". */
const mins = (deltaMs: number) => formatDuration(Math.max(1, Math.ceil(deltaMs / 60_000)))

/** "in 12m" before it starts, "15m left" while it runs. */
export function countdown(e: UpNextEvent, now: Date): string {
  const t = now.getTime()
  return ms(e.starts_at) > t ? `in ${mins(ms(e.starts_at) - t)}` : `${mins(ms(e.ends_at) - t)} left`
}

/** How far through it is, 0–1. */
export function progress(e: UpNextEvent, now: Date): number {
  const span = ms(e.ends_at) - ms(e.starts_at)
  return span > 0 ? Math.min(1, Math.max(0, (now.getTime() - ms(e.starts_at)) / span)) : 0
}
