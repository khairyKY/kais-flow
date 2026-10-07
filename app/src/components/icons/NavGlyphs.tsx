// Punch 58 (Kai's V1 ruling): the collapsed-rail nav icons are ALL simple —
// these five replace the species PNG renders (hydrangea/wisteria/vine/daisy/fern).
// Grammar matches AppLayout's footer glyphs exactly: 15px, viewBox 24,
// stroke 1.8 currentColor, round caps/joins, no fills except dots.
// Kept as-is per the same ruling: Today/Tasks/Calendar (FlowerIcon glyph),
// People (clover PNG), Activity (dot), Library (row being removed elsewhere).
const base = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style: { flex: 'none' },
} as const

// Reference's "terrarium species" flower glyph — same five-ellipse shape, fill/center vary per page.
// Today/Tasks/Calendar in the sidebar rail; Tasks again in the phone More sheet (polish-c).
export function FlowerIcon({ fill, center }: { fill: string; center: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flex: 'none' }}>
      <g fill={fill}>
        <ellipse cx="12" cy="6.2" rx="2.7" ry="3.4" />
        <ellipse cx="17" cy="10" rx="2.7" ry="3.4" transform="rotate(72 17 10)" />
        <ellipse cx="15" cy="16" rx="2.7" ry="3.4" transform="rotate(144 15 16)" />
        <ellipse cx="9" cy="16" rx="2.7" ry="3.4" transform="rotate(216 9 16)" />
        <ellipse cx="7" cy="10" rx="2.7" ry="3.4" transform="rotate(288 7 10)" />
      </g>
      <circle cx="12" cy="11" r="2.4" fill={center} />
    </svg>
  )
}

// Inbox — tray
export function InboxGlyph() {
  return (
    <svg {...base}>
      <path d="M20.5 12.5V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5l2.5-6.8a1 1 0 0 1 .9-.7h10.2a1 1 0 0 1 .9.7l2.5 6.8Z" />
      <path d="M3.5 12.5h5l1.5 2.5h4l1.5-2.5h5" />
    </svg>
  )
}

// Projects — trellis branch: one stem, two rising side shoots
export function ProjectsGlyph() {
  return (
    <svg {...base}>
      <path d="M12 21V4.5" />
      <path d="M12 14.5C9.3 14.3 7.3 12.6 6.6 9.9" />
      <path d="M12 10c2.7-.2 4.7-1.9 5.4-4.6" />
    </svg>
  )
}

// Routines — cycle loop (two arcs, two arrowheads)
export function RoutinesGlyph() {
  return (
    <svg {...base}>
      <path d="m17 3.5 3.5 3.5L17 10.5" />
      <path d="M3.5 11.5V10a3 3 0 0 1 3-3h14" />
      <path d="M7 13.5 3.5 17 7 20.5" />
      <path d="M20.5 12.5V14a3 3 0 0 1-3 3h-14" />
    </svg>
  )
}

// Focus — target ring + centre dot
export function FocusGlyph() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Review — fern-frond curl: stem sweeping up into a spiral, one leaflet
export function ReviewGlyph() {
  return (
    <svg {...base}>
      <path d="M11.5 21.5c0-6.5.9-10.6 3.4-13.9 1.5-1.9 4-2.1 5-.7 1 1.4.3 3.2-1.3 3.4-1.3.2-2.3-.7-2-1.9" />
      <path d="M12.6 14.6c-1.7-.2-2.9-1.1-3.5-2.6" />
    </svg>
  )
}

// Guide (Tour & help 14i/14k) — an open book: the sidebar foot and the phone's More sheet
export function GuideGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 6.5C10.2 5.2 7.6 4.5 4 4.5v13c3.6 0 6.2.7 8 2 1.8-1.3 4.4-2 8-2v-13c-3.6 0-6.2.7-8 2Z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}
