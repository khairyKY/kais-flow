import { useEffect } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useIsMobile } from '../../components/BottomSheet'
import { QuickCreate, type CreateDraft, type QuickCreateKind } from './QuickCreate'

// ── Editor.dc.html 1b / 1c / 1d — "Something new", the full create page (route /new). The popover's
// "More options ↗" lands here with what was typed (router state); /new?kind=event opens on a kind.
// "Sidebar folds to the rail": the shell's own collapse button is pressed for the visit and pressed
// back on the way out — the page never re-draws the sidebar. Phones create in the sheet (7c / 1e). ──

/** Folds the app sidebar while mounted, if it was open (AppLayout keeps the state; its button is
 * the one way in, so the fold goes through it). */
function useFoldedSidebar() {
  useEffect(() => {
    let folded = false
    // A frame later: the press is the shell's own state change, never two in one commit (StrictMode
    // mounts effects twice in dev — a cancelled frame presses nothing).
    const id = requestAnimationFrame(() => {
      const open = document.querySelector<HTMLButtonElement>('.app-sidebar:not(.collapsed) > .kf-collapse-btn')
      if (!open) return
      open.click()
      folded = true
    })
    return () => {
      cancelAnimationFrame(id)
      // ponytail: unfolds on the way out only if this page folded it and it's still folded; a reload
      // here keeps it folded (AppLayout remembers it).
      if (folded) document.querySelector<HTMLButtonElement>('.app-sidebar.collapsed > .kf-collapse-btn')?.click()
    }
  }, [])
}

const KINDS: readonly QuickCreateKind[] = ['task', 'event', 'block']

export function CreatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const isMobile = useIsMobile()
  useFoldedSidebar()
  if (isMobile) return <Navigate to="/calendar" replace />
  const draft = (location.state as { draft?: CreateDraft } | null)?.draft
  const asked = params.get('kind') as QuickCreateKind | null
  // Back where it came from; a cold /new link has nowhere to go back to.
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate('/calendar'))
  return <QuickCreate page initialKind={draft?.kind ?? (asked && KINDS.includes(asked) ? asked : 'task')} slot={null} anchor={null} draft={draft} onClose={close} />
}
