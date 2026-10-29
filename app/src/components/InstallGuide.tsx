import { Float } from './Float'
import { Icon } from './Icon'
import { dismissInstallGuide, useInstallGuide } from '../lib/iosPwa'
import '../features/tour/tour.css' // .kf-hint — the guide is a hint that runs to three lines

// iOS PWA (2026-10-29): iPhone Safari never offers to install, and reminders, the full screen and storage that
// isn't cleared all need Kai's Flow on the Home Screen. So, once, in iOS Safari only (lib/iosPwa offerInstallNow),
// the three taps — and again from Settings → App. Plain on purpose: the look is Kai's to decide.

/** Safari's Share glyph (a square with an arrow out of its top), so the step looks like the button it names. */
function ShareGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-3px' }}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
    </svg>
  )
}

export function InstallGuide() {
  const close = () => {
    dismissInstallGuide()
    useInstallGuide.setState({ open: false })
  }
  return (
    <Float>
      <div
        className="kf-hint"
        data-install-guide
        role="dialog"
        aria-label="Add Kai’s Flow to your Home Screen"
        style={{ left: 16, right: 16, bottom: 'calc(var(--tabbar-h) + var(--tabbar-inset) + 12px)', maxWidth: 420, marginInline: 'auto', alignItems: 'flex-start', paddingBlock: 6 }}
      >
        <img src="/ds/assets/clover/seedling.png" alt="" style={{ marginTop: 10 }} />
        <div className="kf-hint-line">
          <div style={{ fontWeight: 'var(--fw-medium)' }}>Put Kai’s Flow on your Home Screen</div>
          <ol style={{ margin: '6px 0 4px', paddingInlineStart: 20, color: 'var(--ink-muted)' }}>
            <li>
              Tap Share <ShareGlyph /> in Safari’s bar.
            </li>
            <li>Choose “Add to Home Screen”.</li>
            <li>Tap Add, then open it from the Home Screen.</li>
          </ol>
          <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)' }}>Reminders, the full screen and offline saving work from there.</div>
        </div>
        <button type="button" className="kf-hint-x" aria-label="Not now" onClick={close}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </Float>
  )
}
