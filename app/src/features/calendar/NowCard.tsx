import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Checkbox } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { useHour24 } from '../../lib/clock'
import { urlIn, webUrl } from '../../lib/links'
import { useMotionEnabled } from '../../lib/motion'
import { openExternal } from '../../lib/platform'
import type { CalendarEvent, Task } from '../../lib/types'
import { completeTaskWithUndo } from '../tasks/api'
import { useStartFocus } from '../today/startFocus'
import { useMinuteNow } from '../today/useMinuteNow'
import { blockHue, KIND_HUE } from './blockHue'
import { timeText } from './eventTime'
import { countdown, pickNowNext, progress } from './nowNext'
import './nowCard.css'

// cal-wave item 19 — Kai's "now card A" (design-export/Calendar extras options.html §4, in the looks2
// worktree): a paper card with "Ongoing · 15m left", the title with its mark, a 4px bar in the item's
// colour and the clock times under it; Next hangs under it as a lighter strip. Bottom left of the calendar
// page (CalendarPage docks or floats it; the phone draws it over its grid). It reads the app's one minute
// clock itself (lib/minuteClock via useMinuteNow), so the page and the grid never re-render on the minute.

/** Rows listed behind ⌄ before "+N more". */
const MAX_ROWS = 3

type Hue = { c: string; ink: string }
/** The grid's own colour rule: a colour set on the block, else a plain event's blossom, else lavender. */
function hueOf(e: CalendarEvent): Hue {
  if (e.color) return blockHue(e.color)
  return e.type === 'event' && !e.task_id ? KIND_HUE.event : KIND_HUE.task
}
const hueVars = (e: CalendarEvent) => {
  const h = hueOf(e)
  return { ['--c' as string]: h.c, ['--ct' as string]: h.ink } as CSSProperties
}

/** A meeting link on the event: a captured link (external_ref.url) or the first link in its title. */
function meetingLink(e: CalendarEvent): string | null {
  return webUrl((e.external_ref as { url?: unknown } | null | undefined)?.url) ?? urlIn(e.title)?.url ?? null
}

/** Remembered per device, like the calendar's other view choices. */
function useFolded(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s == null ? initial : s === '1'
    } catch {
      return initial
    }
  })
  return [
    v,
    (next) => {
      setV(next)
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* private mode: this visit only */
      }
    },
  ]
}

/** The bar: a running block fills from its start to its end with one compositor animation (transform
 * only), so it moves smoothly with no re-render; reduced motion or Effects off = the minute's share,
 * stepped. Remounted every ten minutes (the caller's key) to stay on the clock across a sleep. */
function Bar({ e, now, running, thin }: { e: CalendarEvent; now: Date; running: boolean; thin?: boolean }) {
  const motion = useMotionEnabled()
  const [startMs] = useState(() => Date.now())
  const span = Date.parse(e.ends_at) - Date.parse(e.starts_at)
  const style: CSSProperties =
    running && motion
      ? { animationDuration: `${span}ms`, animationDelay: `${Date.parse(e.starts_at) - startMs}ms` }
      : { transform: `scaleX(${running ? progress(e, now) : 0})` }
  return (
    <span className={thin ? 'kf-now-br is-thin' : 'kf-now-br'} aria-hidden="true">
      <i className={running && motion ? 'is-live' : undefined} style={style} />
    </span>
  )
}

export function NowCard({ events, tasks, onOpen, variant = 'dock' }: {
  /** The calendar's events (occurrences expanded) — today's are read. */
  events: readonly CalendarEvent[]
  tasks: readonly Task[]
  /** A click on an item: its block's details (desktop) or its sheet (phone). */
  onOpen: (e: CalendarEvent) => void
  variant?: 'dock' | 'float' | 'phone'
}) {
  const now = useMinuteNow()
  useHour24() // the times follow the app's one 12h/24h switch
  const startFocus = useStartFocus()
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks])
  const taskOf = (e: CalendarEvent) => (e.task_id ? taskById.get(e.task_id) : undefined)
  const pick = useMemo(
    () => pickNowNext(events, now, (e) => { const t = e.task_id ? taskById.get(e.task_id) : undefined; return !!t && (t.status === 'done' || !!t.completed_at) }),
    [events, now, taskById],
  )
  const [folded, setFolded] = useFolded(variant === 'phone' ? 'kf.calNowFoldedPhone' : 'kf.calNowFolded', variant === 'phone')
  const [open, setOpen] = useState(false)
  const tick = Math.floor(now.getTime() / 600_000)

  const cls = `kf-now kf-now--${variant}`
  const title = (e: CalendarEvent) => (
    <span className="kf-now-t" dir="auto">
      <EmojiText text={e.title} />
    </span>
  )
  const mark = (e: CalendarEvent): ReactNode => {
    const t = taskOf(e)
    if (t)
      return (
        <span className="kf-now-ck" onClick={(ev) => ev.stopPropagation()}>
          <Checkbox checked={false} size={15} label={t.title} onChange={() => completeTaskWithUndo(t)} />
        </span>
      )
    return <span className="kf-now-ring" aria-hidden="true" />
  }
  const focusBtn = (e: CalendarEvent) => {
    const t = taskOf(e)
    return (
      t && (
        // ds-ok: hover-only on a mouse; touch shows it always (nowCard.css @media (hover: none))
        <button type="button" className="kf-now-act kf-now-focus" onClick={(ev) => { ev.stopPropagation(); startFocus(t) }}>
          <span aria-hidden="true">▶</span>
          Focus
        </button>
      )
    )
  }
  const openProps = (e: CalendarEvent) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onOpen(e),
    onKeyDown: (ev: React.KeyboardEvent) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === ev.currentTarget) {
        ev.preventDefault()
        onOpen(e)
      }
    },
  })

  if (pick.state === 'none') return <div className={cls} data-state="none"><div className="kf-now-quiet">Nothing else today</div></div>
  if (pick.state === 'far') {
    const e = pick.next
    return (
      <div className={cls} data-state="far">
        <div className="kf-now-quiet" style={hueVars(e)} {...openProps(e)} aria-label={`Next: ${e.title} at ${timeText(new Date(e.starts_at))}`}>
          Next ·{mark(e)}
          {title(e)}
          <span className="kf-now-tm">· {timeText(new Date(e.starts_at))}</span>
        </div>
      </div>
    )
  }

  const main = pick.main
  const running = pick.state === 'on'
  const others = pick.state === 'on' ? pick.others : []
  const next = pick.next
  const label = running ? `Ongoing${others.length ? ` · ${others.length + 1}` : ''}` : 'Up next'
  const cd = countdown(main, now)

  if (folded)
    return (
      <div className={cls} data-state={running ? 'on' : 'soon'} data-folded="">
        <button type="button" className="kf-now-card kf-now-fold" style={hueVars(main)} onClick={() => setFolded(false)} aria-expanded={false} aria-label={`${label}: ${main.title}, ${cd}. Open the card`}>
          <b>{label}</b>·{title(main)}
          <span className="kf-now-cd">{cd}</span>
          <Icon name="chevdown" size={15} className="kf-now-chev" style={{ transform: 'rotate(180deg)' }} />
          <Bar key={`${main.id}:${tick}`} e={main} now={now} running={running} thin />
        </button>
      </div>
    )

  // ⌄ shows the others running (above) and every Next row; closed, only the first Next row hangs under it.
  const more = others.length > 0 || next.length > (running ? 1 : 0)
  const nextShown = open ? next.slice(0, MAX_ROWS) : running ? next.slice(0, 1) : []
  const nextHidden = open ? next.length - nextShown.length : 0
  const link = meetingLink(main)
  return (
    <div className={cls} data-state={running ? (others.length ? 'many-on' : 'on') : next.length ? 'many-soon' : 'soon'}>
      <div className="kf-now-card kf-now-main" style={hueVars(main)} {...openProps(main)} aria-label={`${label}: ${main.title}, ${cd}`}>
        {open && others.length > 0 && (
          <div className="kf-now-more">
            {others.slice(0, MAX_ROWS).map((o) => (
              <div key={o.id} className="kf-now-row" style={hueVars(o)} {...openProps(o)} onClick={(ev) => { ev.stopPropagation(); onOpen(o) }} aria-label={`${o.title}, ${countdown(o, now)}`}>
                {mark(o)}
                {title(o)}
                {focusBtn(o)}
                <Bar key={`${o.id}:${tick}`} e={o} now={now} running thin />
                <span className="kf-now-cd">{countdown(o, now)}</span>
              </div>
            ))}
            {others.length > MAX_ROWS && <div className="kf-now-plus">+{others.length - MAX_ROWS} more</div>}
          </div>
        )}
        <div className="kf-now-h">
          <button type="button" className="kf-now-lbl" onClick={(ev) => { ev.stopPropagation(); setFolded(true) }} title="Fold to one line" aria-label={`${label} — fold to one line`}>
            {label}
          </button>
          {link && (
            <button type="button" className="kf-now-join" onClick={(ev) => { ev.stopPropagation(); void openExternal(link) }}>
              Join
            </button>
          )}
          <span className="kf-now-cd">{cd}</span>
          {more && (
            <button type="button" className="kf-now-chev-btn" aria-expanded={open} aria-label={open ? 'Show less' : 'Show the rest'} onClick={(ev) => { ev.stopPropagation(); setOpen(!open) }}>
              <Icon name="chevdown" size={15} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
            </button>
          )}
        </div>
        <div className="kf-now-tl">
          {mark(main)}
          {title(main)}
          {focusBtn(main)}
        </div>
        <Bar key={`${main.id}:${tick}`} e={main} now={now} running={running} />
        <div className="kf-now-tms">
          <span>{timeText(new Date(main.starts_at))}</span>
          <span>{timeText(new Date(main.ends_at))}</span>
        </div>
      </div>
      {nextShown.map((n, i) => (
        <div key={n.id} className={`kf-now-nx${i < nextShown.length - 1 || nextHidden ? ' is-mid' : ''}`} style={hueVars(n)} {...openProps(n)} aria-label={`Next: ${n.title}, ${countdown(n, now)}`}>
          <span className="kf-now-k">{i === 0 ? 'Next' : ''}</span>
          {mark(n)}
          {title(n)}
          {/* Two at the same minute as the card's own: the clock time, not a second identical countdown. */}
          <span className="kf-now-cd">{n.starts_at === main.starts_at ? timeText(new Date(n.starts_at)) : countdown(n, now)}</span>
        </div>
      ))}
      {nextHidden > 0 && <div className="kf-now-nx kf-now-plus">+{nextHidden} more</div>}
    </div>
  )
}
