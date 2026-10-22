import { create } from 'zustand'

// One minute clock for the whole app (calendar smoothness S9, 2026-10-22): it ticks on the minute
// (aligned, not 60 s after whoever mounted first), and a background tab catches up when it comes back.
// Subscribers pick what they need from it with a selector, so a component whose answer didn't change
// (a block that is still "later") never re-renders.

export const useMinuteClock = create<{ now: number }>(() => ({ now: Date.now() }))

function tick(): void {
  useMinuteClock.setState({ now: Date.now() })
}

if (typeof window !== 'undefined') {
  const arm = (): void => {
    // a few ms past the minute, so the new minute has certainly begun
    window.setTimeout(() => {
      tick()
      arm()
    }, 60_000 - (Date.now() % 60_000) + 15)
  }
  arm()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })
}
