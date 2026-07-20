// R4-21 (2026-07-20 audit): filter/sort controls were drawn with the `⚟` character — Kai:
// "the icon is fucked as well". A glyph that isn't a funnel in most fonts, rendered at
// whatever the font felt like. These are real icons, sized to the mono label they sit beside.

export function FunnelIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M3 4.5h18l-7 8.3v5.9l-4 2.3v-8.2z" />
    </svg>
  )
}

export function SortIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M4 6h10M4 12h7M4 18h4" />
      <path d="M17.5 5v14M17.5 19l-3-3M17.5 19l3-3" />
    </svg>
  )
}
