import { useToastStore } from '../lib/toastStore'

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"
        >
          <span>{t.message}</span>
          {t.onUndo && (
            <button
              type="button"
              onClick={() => {
                t.onUndo?.()
                dismiss(t.id)
              }}
              className="font-semibold underline"
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
