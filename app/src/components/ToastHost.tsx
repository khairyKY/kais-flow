import { useToastStore } from '../lib/toastStore'

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            background: 'var(--paper-parchment)',
            border: '1px solid var(--line-card)',
            borderLeft: '3px solid var(--acc-sage)',
            borderRadius: 4,
            boxShadow: 'var(--shadow-panel)',
            padding: '11px 16px',
          }}
        >
          <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{t.message}</span>
          {t.onUndo && (
            <button
              type="button"
              onClick={() => {
                t.onUndo?.()
                dismiss(t.id)
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--acc-terra)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
