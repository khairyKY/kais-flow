// The phone's More sheet glyphs (MobileTabBar). The sidebar draws the kf line set instead (Sidebar
// options.html icons A, 2026-10-22), so the rail-only glyphs that lived here are gone.
// Grammar: 15px, viewBox 24, stroke 1.8 currentColor, round caps/joins, no fills except dots.
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
// Tasks in the phone More sheet (polish-c).
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

// Guide (Tour & help 14i/14k) — an open book: the phone's More sheet
export function GuideGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 6.5C10.2 5.2 7.6 4.5 4 4.5v13c3.6 0 6.2.7 8 2 1.8-1.3 4.4-2 8-2v-13c-3.6 0-6.2.7-8 2Z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}
