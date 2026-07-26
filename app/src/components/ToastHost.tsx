import { useEffect, useRef, useState } from 'react'
import { useToastStore, type Toast } from '../lib/toastStore'
import { useMotionEnabled } from '../lib/motion'

// ── Motion 3d — toast rises 14px from the bottom edge, bottom-center, ONE slot
// (never stacking), always carrying its undo. Motion 5e — on dismissal the corner
// flower releases a single petal that falls 30px and fades.
// Dwell is 4s in lib/toastStore (Motion 3d). Exit: the departing toast lingers
// ~600ms locally to play its 160ms drop + 500ms petal.
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const motionOn = useMotionEnabled()

  const current: Toast | undefined = toasts[toasts.length - 1] // single slot — newest wins
  const [leaving, setLeaving] = useState<Toast | null>(null)
  const prev = useRef<Toast | undefined>(undefined)
  useEffect(() => {
    const was = prev.current
    prev.current = current
    if (was && !current && motionOn) {
      setLeaving(was)
      const t = setTimeout(() => setLeaving(null), 620)
      return () => clearTimeout(t)
    }
  }, [current, motionOn])

  const shown = current ?? leaving
  if (!shown) return null
  const isLeaving = !current

  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
      <style>{`
        @keyframes kfToastIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes kfToastOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(10px); } }
        @keyframes kfToastPetal { from { opacity: 0.9; transform: translateY(0) rotate(0deg); } to { opacity: 0; transform: translateY(30px) rotate(80deg); } }
      `}</style>
      <div
        key={shown.id}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
          background: 'var(--paper-parchment)',
          border: '1px solid var(--line-card)',
          borderLeft: '3px solid var(--acc-sage)',
          borderRadius: 4,
          boxShadow: 'var(--shadow-panel)',
          padding: '11px 16px',
          whiteSpace: 'nowrap',
          animation: motionOn ? (isLeaving ? 'kfToastOut 160ms var(--ease-in) both' : 'kfToastIn 220ms var(--ease-out)') : undefined,
        }}
      >
        {/* corner flower (Motion 5e) — artwork colors, same blossom palette as the petal pile */}
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" style={{ position: 'absolute', top: -6, left: -5 }}>
          <g fill="#D4A8B0">
            <ellipse cx="12" cy="6.2" rx="2.7" ry="3.4" />
            <ellipse cx="17" cy="10" rx="2.7" ry="3.4" transform="rotate(72 17 10)" />
            <ellipse cx="15" cy="16" rx="2.7" ry="3.4" transform="rotate(144 15 16)" />
            <ellipse cx="9" cy="16" rx="2.7" ry="3.4" transform="rotate(216 9 16)" />
            <ellipse cx="7" cy="10" rx="2.7" ry="3.4" transform="rotate(288 7 10)" />
          </g>
          <circle cx="12" cy="11" r="2.4" fill="#C9A55A" />
        </svg>
        <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{shown.message}</span>
        {!isLeaving &&
          [
            shown.onUndo && { label: 'Undo', run: shown.onUndo },
            shown.action,
          ]
            .filter((a): a is { label: string; run: () => void } => !!a)
            .map((a) => (
              <button
                key={a.label}
                type="button"
                className="kf-hit"
                onClick={() => {
                  a.run()
                  dismiss(shown.id)
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
                {a.label}
              </button>
            ))}
      </div>
      {isLeaving && motionOn && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: -4,
            left: -2,
            width: 11,
            height: 9,
            background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)',
            borderRadius: '70% 30% 60% 40%',
            animation: 'kfToastPetal 500ms linear both',
          }}
        />
      )}
    </div>
  )
}
