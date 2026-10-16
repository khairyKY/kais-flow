import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/kit'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { useSubtaskAsk, type SubtaskQuestion } from './subtaskQuestion'
import { timedToday } from './subtasks'
import { placeUnderRow } from './TaskPopover'
import './taskSheet.css'

// 4 C (Subtasks options.html, scene 4 · C): "2 subtasks are still open" — Tick them too / Leave them
// open. Computer: a small card under the row that was ticked (or where the click was). Phone: the
// action sheet. Esc, a click away or closing the sheet = Leave them open. Mounted once, in AppLayout.

// Where the last press was, for a tick made off the row (a calendar block, the tray, the popover's box).
let lastPress: { x: number; y: number; at: number } | null = null

const heading = (n: number) => (n === 1 ? '1 subtask is still open' : `${n} subtasks are still open`)

export function SubtaskAskHost() {
  const ask = useSubtaskAsk((s) => s.ask)
  const isMobile = useIsMobile()
  useEffect(() => {
    const note = (e: PointerEvent) => void (lastPress = { x: e.clientX, y: e.clientY, at: Date.now() })
    window.addEventListener('pointerdown', note, true)
    return () => window.removeEventListener('pointerdown', note, true)
  }, [])
  if (!ask) return null
  return isMobile ? <PhoneAsk key={ask.parent.id} ask={ask} /> : <DeskAsk key={ask.parent.id} ask={ask} />
}

function PhoneAsk({ ask }: { ask: SubtaskQuestion }) {
  const timed = timedToday(ask.open, new Date())
  return (
    <ActionSheet
      title={heading(ask.open.length)}
      meta={ask.parent.title}
      onClose={() => ask.answer(false)}
      items={[
        { label: 'Tick them too', icon: <Icon name="check" size={24} />, onSelect: () => ask.answer(true) },
        {
          label: 'Leave them open',
          icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="8" /></svg>,
          note: timed ? `${timed.title} stays on your day at ${timed.at}` : undefined,
          onSelect: () => ask.answer(false),
        },
      ]}
    />
  )
}

function DeskAsk({ ask }: { ask: SubtaskQuestion }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const leave = () => ask.answer(false)
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEscapeStack(true, leave)
  const timed = timedToday(ask.open, new Date())

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) leaveRef.current()
    }
    // The press that ticked the box is over by now; the next one outside answers.
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Under the ticked row (rects are visual px, `fixed` offsets layout px — TaskPopover's rule); off a
  // row, under the press that ticked it; else a third of the way down the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const z = uiZoom()
    const view = { width: window.innerWidth / z, height: window.innerHeight / z }
    const press = lastPress && Date.now() - lastPress.at < 2000 ? lastPress : null
    const rowEl = document.getElementById(`task-${ask.parent.id}`)
    const r = rowEl?.getBoundingClientRect()
    const row = r && r.height > 0 && (!press || (press.y >= r.top && press.y <= r.bottom))
      ? { left: r.left / z, top: r.top / z, bottom: r.bottom / z }
      : press
        ? { left: press.x / z - 28, top: press.y / z, bottom: press.y / z + 8 }
        : { left: view.width / 2 - 150, top: view.height / 3, bottom: view.height / 3 }
    setPos(placeUnderRow(row, { width: el.getBoundingClientRect().width / z, height: el.scrollHeight + 2 }, view))
  }, [ask])

  return (
    <Float>
      <div
        ref={ref}
        role="dialog"
        aria-label={heading(ask.open.length)}
        tabIndex={-1}
        className="kf-fade tp-pop tp-ask"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxHeight }}
      >
        <div className="tp-ask-title">{heading(ask.open.length)}</div>
        <div className="tp-ask-meta">{timed ? `${timed.title} is on your day at ${timed.at}.` : ask.parent.title}</div>
        <div className="tp-ask-acts">
          <Button onClick={() => ask.answer(true)}>Tick them too</Button>
          <Button variant="secondary" onClick={leave}>Leave them open</Button>
        </div>
      </div>
    </Float>
  )
}
