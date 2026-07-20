// R4-5c (2026-07-20 audit): the pinned marker was the character `◧` — a half-filled square,
// which as Kai put it "doesn't really relate to when something is pinned… the icon is not a
// pin." This is an actual push-pin: head, shaft, point.
export function PinIcon({ size = 11, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 1.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none' }}
      aria-hidden="true"
    >
      <path d="M9 3h6l-1 5.2 3.2 2.6a1 1 0 0 1-.63 1.77H13.1L12 21l-1.1-8.4H7.43a1 1 0 0 1-.63-1.78L10 8.2 9 3Z" />
    </svg>
  )
}
