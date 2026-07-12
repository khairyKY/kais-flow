/** Popover position anchored under a row's DOM node (`id="{idPrefix}{id}"`), for menus opened
 * by keyboard rather than a click (no mouse coordinates to anchor to). Falls back to viewport
 * center if the row isn't mounted/visible. */
export function rowAnchor(idPrefix: string, id: string): { x: number; y: number } {
  const el = document.getElementById(`${idPrefix}${id}`)
  const rect = el?.getBoundingClientRect()
  if (!rect) return { x: window.innerWidth / 2 - 105, y: window.innerHeight / 2 - 80 }
  return { x: Math.min(rect.right - 210, window.innerWidth - 220), y: rect.bottom + 4 }
}
