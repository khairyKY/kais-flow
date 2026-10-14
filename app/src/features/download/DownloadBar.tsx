import { useState } from 'react'
import { downloadOrder, inPlainBrowser, LATEST_DOWNLOADS } from '../../lib/appUpdate'
import './download.css'

// Kai 2026-10-14: "why is there no download bar for both apps". A slim bar over the page in a plain
// browser tab (never in the Android / Windows apps or the installed PWA), dismissed once per device;
// Settings → App keeps the same two links for good. The links are the latest release's version-less
// copies, so a plain <a> downloads and the page stays put (the shells hand it to the system).

const DISMISSED = 'kf-download-bar-dismissed'

/** The two installers, the device's own first. */
export function DownloadLinks() {
  return (
    <>
      {downloadOrder().map((p) => (
        <a key={p} className="kf-btn kf-press kf-button kf-button--secondary kf-dl-link" href={LATEST_DOWNLOADS[p]} data-platform={p}>
          {p === 'android' ? 'Android' : 'Windows'}
        </a>
      ))}
    </>
  )
}

export function DownloadBar() {
  const [shown, setShown] = useState(() => {
    try {
      return inPlainBrowser() && localStorage.getItem(DISMISSED) !== '1'
    } catch {
      return inPlainBrowser()
    }
  })
  if (!shown) return null
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* storage blocked: gone for this visit only */
    }
    setShown(false)
  }
  return (
    <div className="kf-dl-bar" role="region" aria-label="Get the apps">
      <span className="kf-dl-text">Get Kai’s Flow for</span>
      <DownloadLinks />
      <button type="button" className="kf-dl-x" aria-label="Dismiss" onClick={dismiss}>
        ✕
      </button>
    </div>
  )
}
