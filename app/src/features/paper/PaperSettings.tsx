import { updateAppSetting, useAppSettings } from '../../lib/settings'
import { useScansToday } from './api'
import { DAILY_PAGES, scansLeft } from './paperMath'
import { usePaperStore } from './paperStore'

// Settings → Capture → photos (Paper Capture.dc.html 11o): how long page photos stay, today's scans,
// and what waits on this device.

export function PaperSettingsCard() {
  const { data: settings } = useAppSettings()
  const keep = settings?.capture_keep_photos !== false
  const used = Math.min(DAILY_PAGES, useScansToday())
  const waiting = usePaperStore((s) => s.waiting)
  const option = (on: boolean, label: string, value: boolean) => (
    <button type="button" className="pp-seg-btn" aria-pressed={on} onClick={() => updateAppSetting('capture_keep_photos', value)}>
      {label}
    </button>
  )
  return (
    <section className="pp-settings" aria-label="Capture · photos">
      <div className="pp-meta">Capture · photos of your pages</div>
      <div className="pp-set-row is-stack">
        <span>Photos of your pages</span>
        <div className="pp-seg" role="group" aria-label="Photos of your pages">
          {option(keep, 'Keep for 7 days', true)}
          {option(!keep, 'Delete after reading', false)}
        </div>
        <span className="pp-set-help">{keep ? 'So you can look back at the page. Then they’re deleted.' : 'Deleted within the hour after you review them.'}</span>
      </div>
      <div className="pp-set-row">
        <span>Scans today</span>
        <span className="pp-meter-bar" aria-hidden="true">
          <span style={{ width: `${(used / DAILY_PAGES) * 100}%` }} />
        </span>
        <span className="pp-meta" aria-label={`${used} of ${DAILY_PAGES} pages, ${scansLeft(used)} left`}>
          {used} of {DAILY_PAGES}
        </span>
      </div>
      <div className="pp-set-row">
        <span>Read when offline</span>
        <span className="pp-meta">Queue · {waiting}</span>
      </div>
    </section>
  )
}
