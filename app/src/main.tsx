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
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
