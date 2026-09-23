// Local in-app confirm dialog — styled to Overlays.dc.html "Confirm · destructive only":
// parchment card, display title, muted body, Keep + terra destructive action.
// X2 (Motion 3b): scrim+card enter together via .kf-overlay-*; exit is a cut, esc obeys.
import { useEscapeStack } from '../../lib/overlayStack'
import { Float } from '../../components/Float'
import './xfx.css'

export function ConfirmCard({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep',
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscapeStack(true, onCancel)
  return (
    <Float>
    <div
      onClick={onCancel}
      className="kf-overlay-scrim"
      style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(42,36,32,0.14)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="kf-overlay-card"
        style={{ width: 300, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '18px 20px' }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-body)' }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 15px', borderRadius: 999, cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
    </Float>
  )
}
