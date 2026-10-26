// cal-blocks (Kai 2026-10-26, design-export/Calendar extras options.html): check B's tick and repeat B, the
// "chasing box" — a repeating task's box outline split into two arrows chasing round it, on the kf 24 grid with
// round caps. Ticked, the box fills and the tick shows; the arrowheads stay at its sides. The desktop block
// (CalendarGrid) and the phone's (PhoneGrid) draw the same marks. `sw`: the stroke in grid units, so it matches
// the check's 2px edge at the size drawn.

const ARCS = 'M5 10.5V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M19 13.5V15a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-2'
const HEADS = 'M16.9 8.9L19 11l2.1-2.1M7.1 15.1L5 13l-2.1 2.1'
const STROKE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** The ticked box's mark. */
export function Tick({ sw = 3.4 }: { sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M6.5 12.5l3.8 3.8L17.5 8.6" stroke="currentColor" strokeWidth={sw} {...STROKE} />
    </svg>
  )
}

/** Repeat B: open, the two arrows in the block's ink (currentColor); ticked, the filled box, its heads, the tick. */
export function RepeatGlyph({ done, sw }: { done: boolean; sw: number }) {
  if (!done) {
    return (
      <svg viewBox="0 0 24 24" width="100%" height="100%" overflow="visible" aria-hidden="true">
        <path d={ARCS + HEADS} stroke="currentColor" strokeWidth={sw} {...STROKE} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" overflow="visible" aria-hidden="true">
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.6" fill="var(--check-fill)" />
      <path d={HEADS} stroke="var(--check-fill)" strokeWidth={sw} {...STROKE} />
      <path d="M8.4 12.4l2.5 2.5 4.9-5.1" stroke="var(--paper-parchment)" strokeWidth={sw} {...STROKE} />
    </svg>
  )
}
