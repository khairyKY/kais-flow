import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import type { InboxItem } from '../../lib/types'
import { useCaptures, usePageUrls } from './api'
import type { CaptureRow } from './paperMath'
import { pickPhotos, usePaperStore, type Stage } from './paperStore'

// Paper capture in the Inbox (11d right, 11g): "Scan paper" in the header, a "ready to review" row per
// read page, and the 📷 source on items that came from a photo.

export function ScanPaperButton() {
  return (
    <Button variant="secondary" icon={<Icon name="camera" size={18} />} onClick={() => void pickPhotos('camera')}>
      Scan paper
    </Button>
  )
}

function status(c: CaptureRow): { line: string; open?: Stage; action?: string } {
  const n = c.items.length
  if (c.status === 'done') return { line: 'Ready to review', open: { kind: 'results', captureId: c.id }, action: 'Review' }
  if (c.status === 'failed') return c.error === 'unreadable' ? { line: 'Couldn’t read it', open: { kind: 'unreadable', captureId: c.id }, action: 'Look' } : { line: 'Not read yet', open: { kind: 'failed', captureId: c.id }, action: 'Try again' }
  if (c.error === 'daily_limit') return { line: `Read tomorrow${n ? ` · ${n} so far` : ''}` }
  if (c.error === 'rate_limited') return { line: 'Read in a bit' }
  return { line: `Reading · page ${Math.min(c.pages_read + 1, c.pages)} of ${c.pages}` }
}

function ReadyRow({ capture }: { capture: CaptureRow }) {
  const urls = usePageUrls(capture)
  const s = status(capture)
  const n = capture.items.length
  return (
    <div className="pp-ready">
      {urls[0] ? (
        <span className="pp-thumb" aria-hidden="true">
          <img src={urls[0]} alt="" />
        </span>
      ) : (
        <span className="pp-thumb" aria-hidden="true" />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, color: 'var(--ink-body)', overflowWrap: 'anywhere' }}>
          {capture.title ?? 'Your page'}
          {capture.status === 'done' && ` · ${n} ${n === 1 ? 'thing' : 'things'}`}
        </div>
        <div className="pp-meta" style={{ marginTop: 4 }}>
          {s.line}
        </div>
      </div>
      {s.open && (
        <Button variant="ghost" style={{ color: 'var(--acc-terra-ink)' }} onClick={() => usePaperStore.getState().show(s.open!)}>
          {s.action}
        </Button>
      )}
    </div>
  )
}

/** Pages read (or being read) and not yet reviewed — nothing lands without a review. */
export function ReadyScans() {
  const { data = [] } = useCaptures()
  // A read waits for review even after its photos are swept; an unread page without its photo can't be read.
  const captures = data.filter((c) => c.status === 'done' || c.storage_paths.length > 0)
  if (!captures.length) return null
  return (
    <div style={{ marginTop: 16 }}>
      {captures.map((c) => (
        <ReadyRow key={c.id} capture={c} />
      ))}
    </div>
  )
}

/** "Typed" / "Voice" … or, for a line from a photo, 📷 and a way back to the page. */
export function SourceLabel({ item, label }: { item: InboxItem; label: string }) {
  const p = item.payload as { source?: string; source_ref?: string; page?: number; title?: string | null } | null
  if (p?.source !== 'photo' || !p.source_ref) return <>{label}</>
  return (
    <button
      type="button"
      className="pp-source"
      data-no-select
      title="See the photo this came from"
      onClick={() => usePaperStore.getState().show({ kind: 'photo', captureId: p.source_ref!, page: p.page ?? 0 })}
    >
      <Icon name="camera" size={14} />
      {p.title ?? 'Photo'}
    </button>
  )
}
