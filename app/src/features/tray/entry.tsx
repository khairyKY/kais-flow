import { createRoot } from 'react-dom/client'
import '@fontsource/source-serif-4/500.css'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import './tray-entry.css'
import { installNativeMenuGuard } from '../../lib/nativeMenu'
import { motionOnNow } from '../../lib/motion'

// tray.html: the flyout (popover B) or, with ?menu, the right-click menu (menu B). Each loads only its
// own half: the menu is a few rows and never touches the account; the flyout reads the day.

installNativeMenuGuard() // no WebView Back/Refresh menu on a right-click here either

// The day/night switch is the main window's (same origin, so its storage event reaches us).
window.addEventListener('storage', (e) => {
  if (e.key === 'kf_theme') document.documentElement.dataset.theme = e.newValue === 'night' ? 'night' : 'day'
})

// W1: the tray carries the app's motion gate on <html> too (AppLayout sets it in the main window), so
// the kit Checkbox and the gated bits animate here; Effects follows the main window through storage.
const gate = () => {
  document.documentElement.classList.toggle('motion-on', motionOnNow())
  document.documentElement.classList.toggle('kf-motion-on', motionOnNow())
}
gate()
window.addEventListener('storage', (e) => e.key === 'kf_effects' && gate())
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', gate)

const root = createRoot(document.getElementById('root')!)
if (new URLSearchParams(location.search).has('menu')) void import('./TrayMenu').then(({ TrayMenu }) => root.render(<TrayMenu />))
else void import('./TrayFlyout').then(({ mountPopover }) => mountPopover(root))
