import { useCallback } from 'react'
import { useNavigate } from 'react-router'

// Wave N (Task Sheet.dc.html): on a phone a task opens as the task sheet over the page you are on —
// `?task=<id>` added to the current address (AppLayout draws the sheet for it), pushed with
// `state.taskSheet` so Back closes it and the sheet's own close pops that entry. On desktop the same
// param draws the task detail popover (Overlays.dc.html "Task detail") anchored to the row that was
// clicked; its Enter / "Open full ↗" expands to the editor page at /tasks/:id. The address is read
// when the task opens (window.location), not through useLocation, so the rows that call this don't
// all re-render on every navigation.

export const TASK_PARAM = 'task'

/** The app's phone breakpoint (BottomSheet's useIsMobile), read at the moment of the tap. */
const isPhone = () => matchMedia('(max-width: 767px)').matches

/** What the desktop popover hangs off: the row the task was opened from, at that moment. */
export interface TaskAnchor {
  id: string
  rect: { left: number; top: number; right: number; bottom: number }
  el: Element
}
// ponytail: one module slot, not a store — only one task opens at a time, and the popover reads it once.
let anchor: TaskAnchor | null = null
/** The anchor `openTask` recorded for this task, if it was opened from a row on screen. */
export const taskAnchor = (id: string): TaskAnchor | null => (anchor?.id === id && anchor.el.isConnected ? anchor : null)

/** `?task=` added to (or, with null, taken off) the current address. */
export function taskSearch(id: string | null): string {
  const params = new URLSearchParams(window.location.search)
  if (id) params.set(TASK_PARAM, id)
  else params.delete(TASK_PARAM)
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Opens a task: the sheet over this page on a phone. On desktop, the popover anchored to the task's
 * row (`from`, else its `#task-<id>` row) — or, with no row on screen or a caller's own `desktopHref`
 * (search jumps to the row), that page: the editor at /tasks/:id by default. */
export function useOpenTask(): (id: string, desktopHref?: string, from?: Element | null) => void {
  const navigate = useNavigate()
  return useCallback(
    (id: string, desktopHref?: string, from?: Element | null) => {
      const pathname = window.location.pathname
      if (!isPhone()) {
        const el = desktopHref ? null : (from ?? document.getElementById(`task-${id}`))
        if (!el) {
          void navigate(desktopHref ?? `/tasks/${id}`)
          return
        }
        const r = el.getBoundingClientRect()
        anchor = { id, el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
        // Replace, not push: a click on another row closes this popover and opens that one in the same
        // gesture, and a Back still pending from the close would land after the open.
        void navigate({ pathname, search: taskSearch(id) }, { replace: true })
        return
      }
      void navigate({ pathname, search: taskSearch(id) }, { state: { taskSheet: true } })
    },
    [navigate],
  )
}
