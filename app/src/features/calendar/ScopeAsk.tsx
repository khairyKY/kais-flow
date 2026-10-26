import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { Float } from '../../components/Float'
import { Button } from '../../components/kit'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { placeUnderRow } from '../tasks/TaskPopover'
import { SCOPES } from './scope'
import { scopeHeading, scopeLabels, useScopeAsk, type ScopeQuestion } from './scopeQuestion'
import '../tasks/taskSheet.css'

// cal-clicks: the scope question (./scopeQuestion). Computer: a small dialog by the block — the three answers, then
// Cancel; the first ("This event") has the focus, so Enter takes it. Phone: an action sheet. Mounted once, in
// AppLayout, so it outlives the popover or sheet that asked.

let lastPress: { x: number; y: number; at: number } | null = null

export function ScopeAskHost() {
  const q = useScopeAsk((s) => s.queue[0])
  const isMobile = useIsMobile()
  useEffect(() => {
    const note = (e: PointerEvent) => void (lastPress = { x: e.clientX, y: e.clientY, at: Date.now() })
    window.addEventListener('pointerdown', note, true)
    return () => window.removeEventListener('pointerdown', note, true)
  }, [])
  if (!q) return null
  return isMobile ? <PhoneAsk q={q} /> : <DeskAsk q={q} />
}

function PhoneAsk({ q }: { q: ScopeQuestion }) {
  const words = scopeLabels(q.kind)
  return (
    <ActionSheet
      title={scopeHeading(q)}
      meta={q.title}
      onClose={() => q.answer(null)}
      items={SCOPES.map((s) => ({ label: words[s], destructive: q.verb === 'Delete' && s !== 'this' ? true : undefined, onSelect: () => q.answer(s) }))}
    />
  )
}

function DeskAsk({ q }: { q: ScopeQuestion }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const cancel = () => q.answer(null)
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useEscapeStack(true, cancel)
  const words = scopeLabels(q.kind)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) cancelRef.current()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Under the block (rects are visual px, `fixed` offsets layout px — TaskPopover's rule); else under the press
  // that asked; else a third of the way down the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const z = uiZoom()
    const view = { width: window.innerWidth / z, height: window.innerHeight / z }
    const blockEl = q.blockId ? document.querySelector(`[data-kf-id="${CSS.escape(q.blockId)}"]:not(.fc-event-mirror)`) : null
    const r = blockEl?.getBoundingClientRect()
    const press = lastPress && Date.now() - lastPress.at < 4000 ? lastPress : null
    const row = r && r.height > 0
      ? { left: r.left / z, top: r.top / z, bottom: r.bottom / z }
      : press
        ? { left: press.x / z - 28, top: press.y / z, bottom: press.y / z + 8 }
        : { left: view.width / 2 - 150, top: view.height / 3, bottom: view.height / 3 }
    setPos(placeUnderRow(row, { width: el.getBoundingClientRect().width / z, height: el.scrollHeight + 2 }, view))
  }, [q])

  return (
    <Float>
      <div ref={ref} role="dialog" aria-label={scopeHeading(q)} tabIndex={-1} className="kf-fade tp-pop tp-ask kf-scope-ask" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxHeight }}>
        <div className="tp-ask-title">{scopeHeading(q)}</div>
        <div className="tp-ask-meta">{q.title}</div>
        <div className="kf-scope-acts">
          {SCOPES.map((s, i) => (
            <Button key={s} variant={i === 0 ? 'cta' : 'secondary'} onClick={() => q.answer(s)}>
              {words[s]}
            </Button>
          ))}
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
        </div>
      </div>
    </Float>
  )
}
