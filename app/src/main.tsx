import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted (no Google Fonts CDN round-trip): removes a render-blocking
// external request and makes fonts part of the PWA's offline precache.
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/500.css'
import '@fontsource/source-serif-4/600.css'
import '@fontsource/source-serif-4/400-italic.css'
import '@fontsource/source-serif-4/500-italic.css'
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/600.css'
import './index.css'
// Shared X-pass motion/effect classes (.kf-lift, .kf-lift-tilt, .kf-row-in, .kf-bloom, .kf-sway,
// .kf-ink). Ten unrelated features already import this from features/projects/; WB-1 needs it on
// surfaces that import no CSS at all (kit chips, task rows, calendar), so it loads once here
// instead of another six per-file imports. index.css is frozen, hence main.tsx.
import './features/projects/xfx.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { installExternalLinks, isNativeShell, syncShellChrome } from './lib/platform'
import { quietForUpdate, setSwRegistration, setSwUpdate } from './lib/appUpdate'
import { installNativeMenuGuard } from './lib/nativeMenu'

// Auto-refresh (Kai, 2026-09-24): a deploy used to leave open tabs on the old cached build until a second
// reload. iOS PWA (2026-10-29): it used to reload the moment the new version took over — on an iPhone, coming
// back to the app is exactly when it looks, so a capture half-typed was lost. Now (registerType 'prompt') the new
// version waits, and goes in when nothing would be lost: when the app is put away or opened again with no sheet
// open and no field being typed in (lib/appUpdate quietForUpdate). A cold start takes it by itself; Settings →
// Check for updates → Reload, and the "vX is out" toast's Update, apply it at once.
// M1: not inside the native shell — the APK bundles dist/ itself and updates by a new APK, and
// Android's WebView has no Push API, so a service worker would only duplicate what's installed.
if (!isNativeShell()) {
  let waiting = false
  const updateSW = registerSW({
    // Registered on `load` (not at once): the worker's install downloads the whole precache, which must not race the
    // first page for a phone's bandwidth.
    immediate: false,
    onNeedRefresh() {
      waiting = true
      if (document.visibilityState === 'hidden' && quietForUpdate()) void updateSW(true)
    },
    onRegisteredSW(_url, registration) {
      setSwRegistration(registration) // Settings → Check for updates → Reload
      // Browsers only look for a new build on navigation — also look whenever the tab comes back.
      document.addEventListener('visibilitychange', () => {
        if (waiting && quietForUpdate()) void updateSW(true)
        else if (document.visibilityState === 'visible') void registration?.update()
      })
    },
  })
  setSwUpdate(updateSW)
}

// Kai 2026-10-03: no WebView Back/Refresh/Print menu on a right-click — ours, or none (lib/nativeMenu).
installNativeMenuGuard()
// Kai 2026-10-14: in the shells, links to other sites open in the system browser (lib/platform).
installExternalLinks()

// M1: once styles have settled, give the Android shell the page colour for its bar strips.
if (isNativeShell()) window.addEventListener('load', () => syncShellChrome(document.documentElement.dataset.theme === 'night' ? 'night' : 'day'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
