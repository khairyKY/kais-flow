// Kai 2026-10-03: right-clicking a row in the desktop app opened the WebView's own menu (Back,
// Refresh, Save as, Print, More tools). The app's right-click belongs to our menus (ContextMenu);
// the browser's only shows where it is useful — in a text field (cut / copy / paste / spelling)
// and over selected text (copy).

const TEXT_FIELD =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="color"]):not([type="file"])'

type SelectionLike = Pick<Selection, 'isCollapsed' | 'containsNode' | 'toString'>

/** Whether the browser's own context menu may open for a right-click on `target`. */
export function allowsNativeMenu(target: Element | null, selection: SelectionLike | null): boolean {
  if (!target) return false
  if (target.closest(TEXT_FIELD)) return true
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '' && selection.containsNode(target, true)
}

/** Once, at boot (main.tsx). Our own menus call preventDefault themselves; this only stops the
 * native one where nothing of ours answered. */
export function installNativeMenuGuard(doc: Document = document): void {
  doc.addEventListener('contextmenu', (e) => {
    const t = e.target
    const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null
    if (!allowsNativeMenu(el, doc.getSelection())) e.preventDefault()
  })
}
