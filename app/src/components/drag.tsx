import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { DndContext, MouseSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { EmojiText } from './EmojiText'
import { Float } from './Float'
import { motionOnNow, playOnce, useMotionEnabled } from '../lib/motion'
import { uiZoom } from '../lib/uiScale'
import './drag.css'

// ── The one drag grammar outside the calendar: Motion 2c (the ghost in hand), 2d (filing across
// containers), 4d (lift, the catch, the edge scroll, the stacked ghost) and Effects 2j (the soft no).
// Built on @dnd-kit/core like the Top 3, routine-step and paper-page drags. A computer's mouse only:
// a phone's hold selects (SwipeRow) and every drag here has its tap and keyboard path in the row's
// ⋯ menu (Move to…, Plan, Domain…). A load says what it does where it lands; a spot only says what
// it is — so the shell's sidebar takes a task and an inbox capture without knowing either. ──

/** A place something can be dropped. `label` is what a screen reader hears. */
export interface Spot {
  kind: string
  label: string
}

/** What's in hand. `verdict` (method syntax, so a load typed for its own spots still fits here):
 * true = takes it, false = refuses it (the soft no), null = not a place for this load at all. */
export interface DragLoad<S extends Spot = Spot> {
  /** Everything lifted together — the selection, when the row is part of one. */
  ids: readonly string[]
  /** What the ghost says (the first one's title). */
  label: string
  verdict(spot: S): boolean | null
  drop(spot: S): void
}

const NOTHING: ReadonlySet<string> = new Set()
const Lifted = createContext<ReadonlySet<string>>(NOTHING)
const spotNodes = new Map<UniqueIdentifier, HTMLElement>()

/** Plays a one-shot on the spot that was dropped on (the catch, or the soft no). */
const flash = (id: UniqueIdentifier | undefined, name: string, ms: number) => playOnce(id === undefined ? undefined : spotNodes.get(id), name, ms)

/** The click a mouse-up after a drag fires is not a tap on the row under it. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

const loadOf = (data: unknown) => (data as DragLoad | undefined) ?? null
const spotOf = (data: unknown) => (data as { spot?: Spot } | undefined)?.spot ?? null

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${loadOf(active.data.current)?.label ?? 'it'}.`,
  onDragOver: ({ active, over }) => {
    const spot = spotOf(over?.data.current)
    const v = spot ? loadOf(active.data.current)?.verdict(spot) : null
    return spot && v != null ? (v ? `Over ${spot.label}.` : `${spot.label} won't take it.`) : undefined
  },
  onDragEnd: ({ active, over }) => {
    const spot = spotOf(over?.data.current)
    return spot && loadOf(active.data.current)?.verdict(spot) ? `Dropped on ${spot.label}.` : 'Put back.'
  },
  onDragCancel: () => 'Put back.',
}

type Ghost = { load: DragLoad; sourceId: UniqueIdentifier; from: { x: number; y: number }; grab: number; leaving: null | 'settle' | 'home' }

/** Wraps the app shell: every DragRow and drop spot inside it is one drag world (the page's rows and
 * the sidebar's destinations). Pages with a drag of their own keep their own nested DndContext. */
export function DragShell({ children }: { children: ReactNode }) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }))
  const [ghost, setGhost] = useState<Ghost | null>(null)

  function end(e: DragEndEvent) {
    document.documentElement.classList.remove('kf-dragging')
    swallowNextClick()
    const load = loadOf(e.active.data.current)
    const spot = spotOf(e.over?.data.current)
    const verdict = load && spot ? load.verdict(spot) : null
    const motion = motionOnNow()
    if (load && spot && verdict) {
      load.drop(spot)
      flash(e.over?.id, 'drop-catch', 160) // Motion 4d: the place it landed gives a 2px dip
    } else if (verdict === false) {
      flash(e.over?.id, 'drop-softno', 360) // Effects 2j: the place declines, once, gently
    }
    if (!load || !motion) return setGhost(null)
    // Taken: the ghost settles where it was let go. Refused or dropped on nothing: it rides home.
    setGhost((g) => g && { ...g, leaving: verdict ? 'settle' : 'home' })
    window.setTimeout(gone, 1500) // backstop: a hidden tab holds animation events back
  }
  const gone = useCallback(() => setGhost((g) => (g?.leaving ? null : g)), [])

  return (
    <DndContext
      sensors={sensors}
      // The spot under the pointer, not under the ghost's box: sidebar rows are small.
      collisionDetection={pointerWithin}
      // Motion 4d's edge hold: near a list's edge it scrolls underneath at a gentle rate.
      autoScroll={{ threshold: { x: 0, y: 0.08 }, acceleration: 6 }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'Drag with the mouse, or use the row’s menu.' } }}
      onDragStart={({ active, activatorEvent }) => {
        const load = loadOf(active.data.current)
        if (!load) return
        document.documentElement.classList.add('kf-dragging')
        const e = activatorEvent as MouseEvent
        const left = document.getElementById(`drag-${active.id}`)?.getBoundingClientRect().left ?? e.clientX
        setGhost({ load, sourceId: active.id, from: { x: e.clientX, y: e.clientY }, grab: (e.clientX - left) / uiZoom(), leaving: null })
      }}
      onDragEnd={end}
      onDragCancel={() => {
        document.documentElement.classList.remove('kf-dragging')
        setGhost(null)
      }}
    >
      <Lifted.Provider value={ghost && !ghost.leaving ? new Set(ghost.load.ids) : NOTHING}>{children}</Lifted.Provider>
      {ghost && <GhostCard ghost={ghost} onGone={gone} />}
    </DndContext>
  )
}

/** The ghost (2c): follows the pointer, lifted 1.04 under --shadow-lift, floats while held; with
 * more than one in hand the rest fan out behind it with a count (4d). Its own fixed layer on <body>,
 * placed in CSS px under the app's root zoom (lib/uiScale) — dnd-kit's DragOverlay isn't. */
function GhostCard({ ghost, onGone }: { ghost: Ghost; onGone: () => void }) {
  const motion = useMotionEnabled()
  const ref = useRef<HTMLDivElement>(null)
  const at = useRef(ghost.from)
  // It hangs just under the pointer, held where the row was grabbed (at most 120px in) and kept
  // inside the window, so the place under the pointer — a small sidebar row — stays readable. The
  // raw pointer, not dnd-kit's delta: that one folds in scroll offsets, in other px under the zoom.
  const place = useCallback(() => {
    const z = uiZoom()
    const x = Math.min(Math.max(8, at.current.x / z - Math.min(120, Math.max(24, ghost.grab))), window.innerWidth / z - 308)
    if (ref.current) ref.current.style.transform = `translate3d(${x}px, ${at.current.y / z + 16}px, 0)`
  }, [ghost.grab])
  useLayoutEffect(() => {
    place()
    if (ghost.leaving) return
    const move = (e: MouseEvent) => {
      at.current = { x: e.clientX, y: e.clientY }
      place()
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [place, ghost.leaving])
  // Refused or let go over nothing: back to the row it came from (2j: 380ms, ease-out).
  useLayoutEffect(() => {
    const el = ref.current
    const home = document.getElementById(`drag-${ghost.sourceId}`)?.getBoundingClientRect()
    if (ghost.leaving !== 'home' || !el || !home) return
    const z = uiZoom()
    const ride = el.animate([{ transform: el.style.transform }, { transform: `translate3d(${home.left / z}px, ${home.top / z}px, 0)` }], { duration: 380, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' })
    ride.onfinish = onGone
  }, [ghost.leaving, ghost.sourceId, onGone])
  const n = ghost.load.ids.length
  return (
    <Float>
      <div ref={ref} className="kf-ghost" data-motion={motion || undefined} data-leaving={ghost.leaving ?? undefined} aria-hidden="true" onAnimationEnd={(e) => e.target === e.currentTarget && ghost.leaving === 'settle' && onGone()}>
        {n > 2 && <span className="kf-ghost-under is-far" />}
        {n > 1 && <span className="kf-ghost-under" />}
        <div className="kf-ghost-card">
          <span className="kf-ghost-title">
            <EmojiText text={ghost.load.label} />
          </span>
          <span className="kf-ghost-grip">⋮⋮</span>
        </div>
        {n > 1 && <span className="kf-ghost-count">{n}</span>}
      </div>
    </Float>
  )
}

/** `useDropSpot` on a plain div — for spots drawn in a loop (the rail's projects, a board column). */
export function DropZone<S extends Spot>({ id, spot, className, children, ...rest }: { id: string; spot: S | null } & HTMLAttributes<HTMLDivElement>) {
  const drop = useDropSpot(id, spot)
  return (
    <div ref={drop.ref} className={`${className ?? ''} ${drop.className}`} {...rest}>
      {children}
    </div>
  )
}

/** A row you can pick up. The row itself (and every other row lifted with it) stays in place as
 * 2c's dashed slot while the ghost is in hand, so nothing jumps, and a refused drop rides home to it.
 * A press that doesn't move 6px is still the row's own click. */
export function DragRow({ id, load, disabled, children, ...rest }: { id: string; load: DragLoad; disabled?: boolean } & HTMLAttributes<HTMLDivElement>) {
  const { setNodeRef, listeners } = useDraggable({ id, data: load, disabled })
  const lifted = useContext(Lifted).has(id)
  return (
    <div ref={setNodeRef} id={`drag-${id}`} data-drag-slot={lifted || undefined} {...rest} {...(disabled ? undefined : listeners)}>
      {children}
    </div>
  )
}

/** A place to drop onto: spread `ref` and `className` on it. While something is in hand over it,
 * it opens as the 2d placeholder when it takes the load, or warms to terra when it won't (2j). */
export function useDropSpot<S extends Spot>(id: string, spot: S | null): { ref: (el: HTMLElement | null) => void; className: string } {
  const { setNodeRef, isOver, active } = useDroppable({ id, data: { spot }, disabled: !spot })
  const load = loadOf(active?.data.current)
  const verdict = load && spot ? load.verdict(spot) : null
  const ref = useCallback(
    (el: HTMLElement | null) => {
      setNodeRef(el)
      if (el) spotNodes.set(id, el)
      else spotNodes.delete(id)
    },
    [id, setNodeRef],
  )
  return { ref, className: verdict === null || !isOver ? '' : verdict ? 'kf-drop-over' : 'kf-drop-no' }
}
