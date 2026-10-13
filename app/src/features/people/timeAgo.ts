/** "today" · "3d ago" · "2w ago" · "5mo ago" — a person's last touch (People list, Search 1a's
 * "Last touch · 2d ago"). Whole days since the instant, not calendar days. */
export function timeAgo(dateStr: string, now: number = Date.now()): string {
  const d = Math.floor((now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (d === 0) return 'today'
  if (d === 1) return '1d ago'
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w === 1) return '1w ago'
  if (w < 4) return `${w}w ago`
  const mo = Math.floor(d / 30)
  return mo <= 1 ? '1mo ago' : `${mo}mo ago`
}
