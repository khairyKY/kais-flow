import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToastStore, visibleToasts, lifeLeft, TOAST_LIFE_MS, type Toast } from '../lib/toastStore'
import { uiZoom } from '../lib/uiScale'

// ── MK Undo Toast (DS-CHANGELOG §3). Inverted snackbar: min-h 48, 12 from the screen edges,
// bottom = tab bar + 8 on a phone (bottom-centre 16 on desktop, as before), radius 3,
// --toast-bg / --toast-ink 14/20 wrapping to two lines, action 14/600 --toast-action in a 48 hit,
// 2px life line. Queue: two on screen, newest at the bottom, the older above at 0.92, a third
// waits (lib/toastStore). Life is 6s, paused while touched, hovered or focused. In 200ms
// (rise 12 + fade) / out 200ms fade; reduced motion cross-fades. ──

const EXIT_MS = 200 // --dur-toast

const CSS = `
  .kf-toast-host { position: fixed; z-index: 1100; display: flex; flex-direction: column; gap: var(--toast-gap);
    bottom: calc(16px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);
    width: max-content; max-width: min(480px, calc(var(--kf-vw) - 24px)); pointer-events: none; }
  @media (max-width: 767px) {
    .kf-toast-host { left: 12px; right: 12px; transform: none; width: auto; max-width: none;
      bottom: calc(var(--tabbar-h) + var(--tabbar-inset) + var(--toast-gap)); }
    /* A sheet or modal is up: dock to the top edge so the toast never covers its rows (the ⋯ sheet's
       Select/Delete sat under a swipe's Undo for 6s). Full sheets leave 48px there. */
    body:has([aria-modal="true"]) .kf-toast-host { top: calc(env(safe-area-inset-top) + 8px); bottom: auto; }
  }
  .kf-toast { position: relative; overflow: hidden; pointer-events: auto; display: flex; align-items: center; gap: 4px;
    min-height: 48px; padding: 0 4px 0 16px; box-sizing: border-box; border-radius: 3px;
    background: var(--toast-bg); color: var(--toast-ink); box-shadow: var(--shadow-toast);
    animation: toastIn var(--dur-toast) var(--ease-standard) backwards; }
  .kf-toast.is-leaving { animation: toastOut var(--dur-toast) var(--ease-standard) forwards; }
  .kf-toast-msg { flex: 1; min-width: 0; padding: 14px 0; font-size: 14px; line-height: 20px; text-wrap: pretty;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  .kf-toast-act { flex: none; height: 48px; padding: 0 12px; border: none; background: none; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 600; color: var(--toast-action); border-radius: 3px; }
  .kf-toast-act:active { background: var(--pressed-overlay); }
  .kf-toast-act:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .kf-toast-life { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--toast-action); opacity: 0.7;
    transform-origin: left; animation: kfToastLife ${TOAST_LIFE_MS}ms linear forwards; }
  @keyframes kfToastLife { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  @media (prefers-reduced-motion: reduce) {
    /* cross-fade instead of the rise; beats the global 0.01ms rule by specificity */
    .kf-toast { animation-name: scrimIn !important; animation-duration: var(--dur-toast) !important; }
    .kf-toast.is-leaving { animation-name: toastOut !important; }
    .kf-toast-life { animation-name: none !important; } /* a static line, not a 0.01ms sweep to empty */
  }
`

/** Over a sheet with a footer (Plan, Shut down, the pickers), a phone toast sits 8px above that
 * footer as MK draws it (6l / 8d) — the CSS top dock would cover the sheet's ✕. Measured when a
 * toast shows; null = the stylesheet's placement. */
function sheetFooterDock(): number | null {
  if (!window.matchMedia('(max-width: 767px)').matches) return null
  const footer = document.querySelector('[aria-modal="true"] [data-sheet-footer]')
  if (!footer) return null
  return (window.innerHeight - footer.getBoundingClientRect().top) / uiZoom() + 8
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const shown = visibleToasts(toasts)
  const [dock, setDock] = useState<number | null>(null)
  const count = shown.length
  useLayoutEffect(() => {
    if (!count) return
    const update = () => setDock(sheetFooterDock())
    update()
    // Sheets portal into <body>: re-measure when one opens or closes under a live toast.
    const mo = new MutationObserver(update)
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [count])
  return (
    <div className="kf-toast-host" role="status" aria-live="polite" style={dock != null ? { top: 'auto', bottom: dock } : undefined}>
      <style>{CSS}</style>
      {shown.map((t, i) => (
        <ToastCard key={t.id} toast={t} older={i < shown.length - 1} />
      ))}
    </div>
  )
}

function ToastCard({ toast, older }: { toast: Toast; older: boolean }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const [hovered, setHovered] = useState(false) // pointerenter/leave: a mouse hover, or a finger down (touch fires enter before down, leave after up)
  const [focused, setFocused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const left = useRef(TOAST_LIFE_MS)
  const paused = hovered || focused

  // The 6s clock only runs while this card is on screen and untouched.
  useEffect(() => {
    if (paused || leaving) return
    const since = Date.now()
    const t = setTimeout(() => setLeaving(true), left.current)
    return () => {
      clearTimeout(t)
      left.current = lifeLeft(left.current, since, Date.now())
    }
  }, [paused, leaving])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => dismiss(toast.id), EXIT_MS)
    return () => clearTimeout(t)
  }, [leaving, dismiss, toast.id])

  const actions = [toast.onUndo && { label: 'Undo', run: toast.onUndo }, toast.action].filter(
    (a): a is { label: string; run: () => void } => !!a,
  )

  return (
    <div style={{ opacity: older ? 0.92 : 1 }}>
      <div
        className={`kf-toast${leaving ? ' is-leaving' : ''}`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span className="kf-toast-msg">{toast.message}</span>
        {!leaving &&
          actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="kf-toast-act"
              onClick={() => {
                a.run()
                setLeaving(true)
              }}
            >
              {a.label}
            </button>
          ))}
        <span aria-hidden className="kf-toast-life" style={{ animationPlayState: paused ? 'paused' : 'running' }} />
      </div>
    </div>
  )
}
