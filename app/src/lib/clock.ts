import { create } from 'zustand'

// Kai 2026-10-22: "some stuff shows up in 24 hour format although I have chosen the 12h format". One
// clock for every time the app shows a person — the calendar's View options ▸ 24-hour time, and the same
// switch in Settings. Per device, like the theme and the interface size (it lived in the calendar's view
// options, so it stays in their storage). Machine strings — "HH:mm" keys, inputs, ISO values — never
// pass through here.

const KEY = 'kf.calViewOptions'

function stored(): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { hour24?: unknown } | null)?.hour24 === true
  } catch {
    return false // no storage (a test, a private window): the 12-hour clock
  }
}

export const useClockStore = create<{ hour24: boolean }>(() => ({ hour24: stored() }))

/** On the 24-hour clock? (read at call time — a toast, a label built outside React) */
export const hour24 = (): boolean => useClockStore.getState().hour24

/** The same, as a hook: a component re-renders when the person flips it. */
export const useHour24 = (): boolean => useClockStore((s) => s.hour24)

export function setHour24(on: boolean): void {
  useClockStore.setState({ hour24: on })
  try {
    const opts = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown> | null) ?? {}
    localStorage.setItem(KEY, JSON.stringify({ ...opts, hour24: on }))
  } catch {
    /* this session only */
  }
}

/** A wall-clock "HH:mm" (00:00–24:00) as the person reads times: "1:05 PM", or "13:05" on the 24-hour
 * clock. Anything else comes back as it was. */
export function clockText(hhmm: string, h24: boolean = hour24()): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (h24 || !m) return hhmm
  const h = Number(m[1]) % 24
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** A span on the person's clock: "1:00–1:30 PM", "11:30 AM–12:30 PM" (the meridiem once when both ends
 * share it), "13:00–13:30". */
export function clockRange(from: string, to: string, h24: boolean = hour24()): string {
  if (h24) return `${from}–${to}`
  const a = clockText(from, false)
  const b = clockText(to, false)
  return a.slice(-2) === b.slice(-2) && /[AP]M$/.test(a) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

/** Intl options for a time inside a longer toLocaleString ("Wed 1:00 PM"), on the person's clock. */
export function clockOptions(h24: boolean = hour24()): Intl.DateTimeFormatOptions {
  return h24 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { hour: 'numeric', minute: '2-digit', hour12: true }
}

/** An hour gutter's label: "9 AM" / "12 PM", or "09:00" on the 24-hour clock. */
export function hourLabel(h: number, h24: boolean = hour24()): string {
  return h24 ? `${String(h).padStart(2, '0')}:00` : `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`
}
