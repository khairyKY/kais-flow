import { useCallback } from 'react'
import { useNavigate } from 'react-router'

// Wave N (Task Sheet.dc.html): on a phone a task opens as the task sheet over the page you are on —
// `?task=<id>` added to the current address (AppLayout draws the sheet for it), pushed with
// `state.taskSheet` so Back closes it and the sheet's own close pops that entry. Desktop keeps the
// full editor page at /tasks/:id. The address is read when the task opens (window.location), not
// through useLocation, so the rows that call this don't all re-render on every navigation.

export const TASK_PARAM = 'task'

/** The app's phone breakpoint (BottomSheet's useIsMobile), read at the moment of the tap. */
const isPhone = () => matchMedia('(max-width: 767px)').matches

/** Opens a task: the sheet over this page on a phone; on desktop `desktopHref` — the editor page
 * unless the caller has its own place for it (search jumps to the row). */
export function useOpenTask(): (id: string, desktopHref?: string) => void {
  const navigate = useNavigate()
  return useCallback(
    (id: string, desktopHref = `/tasks/${id}`) => {
      if (!isPhone()) {
        void navigate(desktopHref)
        return
      }
      const params = new URLSearchParams(window.location.search)
      params.set(TASK_PARAM, id)
      void navigate({ pathname: window.location.pathname, search: `?${params}` }, { state: { taskSheet: true } })
    },
    [navigate],
  )
}
