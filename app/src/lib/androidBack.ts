import { App } from '@capacitor/app'
import { closeTopOverlay } from './overlayStack'

// Android Back (M1b; DS-CHANGELOG §3: keyboard → picker → sheet → selection mode → search → page).
// The keyboard takes Back itself before the app sees it. Every other layer registers on
// lib/overlayStack in opening order, so one press closes the topmost; overlays keep their drafts,
// so nothing typed is lost. With nothing open, Back walks the app's own history, then lands on
// Today, and from there (or from sign-in) leaves the app.

/** Pages Back leaves the app from. The others go to Today first: from sign-in or onboarding
 * that would only bounce back through RequireAuth. */
const LEAVE_FROM = new Set(['/today', '/sign-in', '/reset', '/onboarding'])

/** What Back does when no overlay is open. `historyIdx` is React Router's index into this
 * session's history (`history.state.idx`, 0 = the first entry). */
export function pageBack(pathname: string, historyIdx: number): 'history' | 'today' | 'leave' {
  if (historyIdx > 0) return 'history'
  return LEAVE_FROM.has(pathname) ? 'leave' : 'today'
}

export function installAndroidBack(goToday: () => void): void {
  void App.addListener('backButton', () => {
    if (closeTopOverlay()) return
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    const step = pageBack(window.location.pathname, idx)
    if (step === 'history') window.history.back()
    else if (step === 'today') goToday()
    // ponytail: minimize, not App.exitApp() — Android 12+ does the same for a root activity, and
    // the next open resumes instantly instead of cold-starting the WebView.
    else void App.minimizeApp()
  })
}
