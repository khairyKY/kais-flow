// Local in-app confirm dialog — styled to Overlays.dc.html "Confirm · destructive only":
// parchment card, display title, muted body, Keep + terra destructive action — the kit's B buttons.
// X2 (Motion 3b): scrim+card enter together via .kf-overlay-*; exit is a cut, esc obeys.
import { useEscapeStack } from '../../lib/overlayStack'
import { Float } from '../../components/Float'
import { Button } from '../../components/kit'
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
        style={{ width: 300, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-popover)', padding: '18px 20px' }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--ink-body)' }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </Float>
  )
}
