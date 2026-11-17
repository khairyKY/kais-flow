import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ACTION_ROW_CSS, ActionSheet } from '../../components/ActionSheet'
import { BottomSheet } from '../../components/BottomSheet'
import { DatePicker } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, SectionLabel } from '../../components/kit'
import { durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { LengthChips, SheetTitle, TimePicker } from '../../components/TimePicker'
import { cairoDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { useAreas } from '../areas/api'
import { MovePicker } from '../tasks/MovePicker'
import { resetLabel, useBlockColor } from './blockColor'
import { eventPlaceKey, eventPlaceName, eventPlacePatch } from './eventPlace'
import '../tasks/taskSheet.css'
import { TaskPicker } from '../focus/TaskPicker'
import { useProjects } from '../projects/api'
import { uncompleteTask, useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { SAVED_MS } from '../tasks/taskSheetMath'
import { deleteEventWithUndo, linkTaskWithUndo, setEventRepeat, type BlockRef } from './api'
import { useStartFocus } from '../today/startFocus'
import { EVENT_REMIND, aiPrompts, blockMenuSpec, crossesDays, focusTaskOf, isSynced, isUntitled, remindLabel, type BlockMenuKey, type BlockMenuMode } from './blockMenuSpec'
import { completeBlockTask, deleteBlock, duplicateBlock, editEvent, moveToDay, remindEvent, retimeBlock, setEventRange } from './scoped'
import { askChat, copyBlockLink, joinMeeting, openInGoogle } from './blockActions'
import { gcalEditable, gcalRepeats } from './gcal'
import { RepeatMenu } from '../tasks/RepeatMenu'
import { cairoToIso } from './eventTime'
import { SwatchTray } from './formFields'
import { pickRange, rangeLabel, rangeOf, storeRange, toggleAllDay } from './rangeEdit'
import { eventSpan, rangeText, scheduleSlots, slotLabel, spanIso, type DragMode, type Span } from './phoneGridMath'

// ── The phone calendar's sheets (Calendar Phone.dc.html): 7d the event sheet,
// 7g / 7g2 Schedule. All on the kit BottomSheet; every write goes through calendar/api and
// tasks/api (the outbox), and every removal carries Undo. ──

type Rect = { left: number; top: number; width: number; height: number }
export type SlotRect = (day: string, start: number, end: number) => Rect | null

/** The slot or block a sheet is about, drawn over the scrim where it sits on the grid (7c, 7d).
 * Only while that sheet is the top one: a picker sheet opened over it hides it (Kai 2026-10-07 — the
 * draft drew over the time list, on its 13:15 row). */
function Held({ rect, fill, ink, edge, title, time }: { rect: Rect | null; fill: string; ink: string; edge: string; title: string; time: string }) {
  // …and never over the sheet itself: a block taller than the room above the sheet is cut at the
  // sheet's resting top edge (its layout top — the enter animation's transform doesn't count).
  const [sheetTop, setSheetTop] = useState(Infinity)
  // The keyboard rising lifts the sheet without re-rendering the parent (bj-final: the 16:00 slot drew
  // over the quick-create chips until the first key), so a visualViewport resize re-measures too.
  const [vvTick, setVvTick] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    const on = () => setVvTick((n) => n + 1)
    vv?.addEventListener('resize', on)
    return () => vv?.removeEventListener('resize', on)
  }, [])
  useLayoutEffect(() => {
    const sheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1)
    const box = sheet?.offsetParent?.getBoundingClientRect()
    setSheetTop(sheet && box ? box.top + sheet.offsetTop : Infinity)
  }, [rect, vvTick]) // a fresh rect each parent render (a title typed) — so it re-measures then
  if (!rect) return null
  const height = Math.min(rect.height, sheetTop - rect.top - 4)
  if (height < 12) return null
  return createPortal(
    <div className="pc-held" style={{ ...rect, height, '--pc-fill': fill, '--pc-ink': ink, '--pc-edge': edge } as CSSProperties} aria-hidden>
      <span className="pc-name">{title}</span>
      <span className="pc-time">{time}</span>
    </div>,
    document.body,
  )
}

/** A kit action row (ActionSheet's look): icon · label · hint · chevron. `quiet`: nothing set yet. */
function Row({ icon, label, hint, quiet, chevron = true, onClick }: { icon: IconName; label: string; hint?: string; quiet?: boolean; chevron?: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button type="button" className="kf-as-row" onClick={(e) => onClick(e.currentTarget)}>
      <span className="kf-as-icon" aria-hidden><Icon name={icon} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-body)', lineHeight: 'calc(20 / 15)', color: quiet ? 'var(--ink-muted)' : undefined }}>{label}</span>
      {hint && <span className="kf-as-hint">{hint}</span>}
      {chevron && <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />}
    </button>
  )
}

/** The block rows' glyphs — the desktop popover's (./BlockMenu), at the sheet's 24px. */
const ROW_ICONS: Record<BlockMenuKey, IconName> = {
  date: 'pickdate', time: 'clock', project: 'project', repeat: 'repeat', remind: 'remind', complete: 'check', open: 'tasks', replan: 'pickdate',
  link: 'plus', more: 'dots', duplicate: 'duplicate', ai: 'ai', copylink: 'link', unschedule: 'plus', delete: 'delete', google: 'calendar', details: 'info', focus: 'focus', join: 'link', gopen: 'calendar', ends: 'pickdate', allday: 'clock',
}

/** 7d — tap a plain event (a task block opens as its task, the Task sheet): the same rows as the
 * desktop popover (./blockMenuSpec — Calendar.dc.html §5) on the sheet's own rows, each committing as
 * it's picked. Kai 2026-10-07 ("it felt like a read-only pop-up"): the title is a field (renames on
 * Done / leaving it). Kai 2026-10-12: date, length, project, repeat, colour, task link and More here
 * too, so the phone does all the desktop does. Delete / Discard sits in the footer; a repeat asks
 * This event / All events. */
export function BlockSheet({ event, look, slotRect, pending, onMove, onRebind, onClose, mode = 'details', onMode }: {
  event: CalendarEvent
  /** cal-clicks: a tap opens the details; a long-press or the details' ⋯ opens menu B (the tray, Duplicate,
   * Work with AI ›, Copy link, Delete). */
  mode?: BlockMenuMode
  /** The details' ⋯ (→ menu B) and menu B's Details (→ the details). */
  onMode?: (mode: BlockMenuMode) => void
  look: { fill: string; ink: string }
  slotRect: SlotRect
  pending: boolean
  onMove: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  /** A repeat edited from a later occurrence splits (calendar/api): the sheet follows the new block. */
  onRebind?: (ref: BlockRef) => void
  onClose: () => void
}) {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const colorOf = useBlockColor()
  const openTask = useOpenTask()
  const startFocus = useStartFocus()
  const [picker, setPicker] = useState<null | 'date' | 'ends' | 'time' | 'project' | 'repeat' | 'remind' | 'more' | 'ai'>(null)
  const [linkAt, setLinkAt] = useState<{ x: number; y: number } | null>(null)
  const [untitled] = useState(() => isUntitled(event))
  const [title, setTitle] = useState(untitled ? '' : event.title)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const saved = () => setSavedAt(Date.now())
  const rename = () => {
    const name = title.trim()
    if (!name || name === event.title) return setTitle(untitled && !name ? '' : event.title)
    // cal-clicks: a repeat asks This / Following / All; cancelled, the title goes back.
    void editEvent(event, { title: name }, `Renamed · ${name}`).then((ref) => {
      if (ref === undefined) setTitle(event.title)
      else {
        if (ref) onRebind?.(ref)
        saved()
      }
    })
  }
  // Delete / Unschedule / Open task: the sheet leaves first, then the block goes and the Undo toast
  // lands on the page (or the task opens over it).
  const after = useRef<(() => void) | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const leave = (run: () => void) => {
    after.current = run
    closeRef.current?.()
  }
  useEffect(() => {
    if (savedAt == null) return
    const t = window.setTimeout(() => setSavedAt(null), SAVED_MS)
    return () => window.clearTimeout(t)
  }, [savedAt])
  const span = eventSpan(event)
  const len = span.end - span.start
  const task = event.task_id ? tasks.find((t) => t.id === event.task_id) : undefined
  const place = eventPlaceName(event, projects, areas)
  const menu = mode === 'menu'
  const spec = blockMenuSpec(event, { task, placeName: place, mode })
  const del = spec.at(-1)!
  // A Google event (B1): its rows say when and from which calendar, Join, Open in Google Calendar, Duplicate as my own event.
  // One that's ours to change (gcal-events: `mine`) also renames, moves, resizes and deletes — in Google (the footer's Delete).
  const synced = isSynced(event)
  const mine = gcalEditable(event)
  const readOnly = synced && !mine
  const repeats = !!event.seriesId || gcalRepeats(event)
  const kind = synced ? (event.source === 'ics' ? 'Subscribed event' : 'Google event') : event.task_id ? 'Task block' : event.type === 'time_block' ? 'Time block' : 'Event'
  const meta = `${kind} · ${event.all_day ? `All day${rangeOf(event).endDay > rangeOf(event).startDay ? ` · ${rangeLabel(rangeOf(event))}` : ''}` : crossesDays(event) ? rangeLabel(rangeOf(event)) : durationLabel(len)}`
  const run: Partial<Record<BlockMenuKey, (el: HTMLElement) => void>> = {
    date: () => setPicker('date'),
    ends: () => setPicker('ends'),
    allday: () => setRange(toggleAllDay(rangeOf(event), !event.all_day)),
    time: () => setPicker('time'),
    project: () => setPicker('project'),
    repeat: () => setPicker('repeat'),
    remind: () => setPicker('remind'),
    more: () => setPicker('more'),
    complete: () => {
      if (!task) return
      if (task.status === 'done') uncompleteTask(task)
      else void completeBlockTask(task, event.id)
    },
    open: () => leave(() => event.task_id && openTask(event.task_id)),
    duplicate: () => leave(() => void duplicateBlock(event, task)),
    ai: () => setPicker('ai'),
    copylink: () => copyBlockLink(event),
    join: () => joinMeeting(event),
    gopen: () => openInGoogle(event),
    details: () => onMode?.('details'),
    focus: () => leave(() => startFocus(focusTaskOf(event, tasks), event)),
    unschedule: () => leave(() => deleteEventWithUndo(event, 'Unscheduled')),
    link: (el) => {
      const r = el.getBoundingClientRect()
      setLinkAt({ x: r.left + 16, y: r.top })
    },
  }
  // F7: the event's new range (Starts / Ends / All day) — a repeat asks which occurrences (the sheet leaves first), one Undo.
  const setRange = (next: ReturnType<typeof rangeOf>) => {
    const write = () => void setEventRange(event, storeRange(next), `${rangeLabel(next)} · ${event.title}`)
    if (repeats) leave(write)
    else {
      write()
      saved()
    }
  }
  // cal-clicks: a repeat (or a repeating task's round) asks This / Following / All — the sheet leaves first.
  const remove = () => leave(() => void deleteBlock(event, untitled ? 'Discarded' : 'Deleted'))
  const choice = (label: string, on: boolean, act: () => void) => ({ label, selected: on, onSelect: () => { if (!on) { act(); saved() } } })
  return (
    <>
      <BottomSheet
        detent="medium"
        onClose={() => {
          onClose()
          after.current?.()
        }}
        handleGap={8}
        footer={readOnly ? undefined : (close) => {
          closeRef.current = close
          return (
            <Button variant="ghost" className="pc-bs-delete" icon={<Icon name="delete" size={20} />} onClick={remove}>
              {del.label}
            </Button>
          )
        }}
      >
        {(close) => {
          closeRef.current = close
          return (
            <>
              <div className="pc-bs-head">
                <div className="pc-bs-title">
                  <input
                    className="pc-qc-title pc-bs-title-in"
                    aria-label="Title"
                    readOnly={readOnly}
                    enterKeyHint="done"
                    placeholder="Add title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={rename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </div>
                <div className="pc-bs-meta" style={{ '--pc-ink': look.ink } as CSSProperties}>{meta}</div>
                {/* cal-clicks: the details' ⋯ opens menu B in its place (a long-press on the block does too). */}
                {!menu && onMode && (
                  <button type="button" className="pc-bs-more" aria-label={`More for ${event.title}`} onClick={() => onMode('menu')}>
                    <Icon name="dots" size={22} />
                  </button>
                )}
              </div>
              {/* Menu B (cal-blocks, Kai 2026-10-26): the desktop menu's tray under the title — None, palette C's 16
                  swatches and "+ Custom", saved on tap, for every block (the grid draws a block's own colour first). */}
              {menu && !synced && <div className="pc-bs-colors">
                <SwatchTray
                  value={event.color ?? null}
                  reset={resetLabel(colorOf({ ...event, color: null }), projects, areas)}
                  size={26}
                  columns={10}
                  onChange={(c) => {
                    if (c === (event.color ?? null)) return
                    void editEvent(event, { color: c }, `Colour changed · ${event.title}`).then((ref) => {
                      if (ref) onRebind?.(ref)
                    })
                    saved()
                  }}
                />
              </div>}
              {/* Kai 2026-10-21: the length in one tap, from the start — as the Time sheet's chips do. */}
              {!menu && !readOnly && !event.all_day && !crossesDays(event) && (
                <LengthChips
                  value={len}
                  style={{ minHeight: 0, padding: '4px 0 8px' }}
                  onPick={(m) => {
                    if (m === len) return
                    const to = { ...span, end: span.start + m }
                    // A repeat (or a repeating task's round) asks which occurrences (cal-clicks).
                    if (repeats) void retimeBlock(event, span, to).then((ref) => ref && onRebind?.(ref))
                    else onMove(event, span, to, 'bottom')
                    saved()
                  }}
                />
              )}
              <div className="pc-bs-rows">
                <style>{ACTION_ROW_CSS}</style>
                {(readOnly ? spec : spec.slice(0, -1)).map((e) => (
                  <Fragment key={e.key}>
                    {e.caption && (
                      <div className="pc-bs-caption">
                        <SectionLabel>{e.caption.label}</SectionLabel>
                        <EmojiText text={e.caption.text} />
                      </div>
                    )}
                    <Row icon={ROW_ICONS[e.key]} label={e.label} hint={e.key === 'unschedule' || e.key === 'delete' || e.key === 'duplicate' ? undefined : e.key === 'allday' ? (e.on ? 'On' : 'Off') : e.hint} quiet={e.unset} chevron={!!e.sub} onClick={(el) => (!readOnly || ['details', 'ai', 'copylink', 'join', 'gopen', 'duplicate'].includes(e.key)) && run[e.key]?.(el)} />
                  </Fragment>
                ))}
              </div>
              {(pending || savedAt != null) && <div className={`pc-bs-save${pending ? ' is-pending' : ''}`}>{pending ? '○ Pending sync' : '✓ Saved'}</div>}
            </>
          )
        }}
      </BottomSheet>
      <Held rect={event.all_day || crossesDays(event) || picker === 'date' || picker === 'ends' || picker === 'time' ? null : slotRect(span.day, span.start, span.end)} fill={look.fill} ink={look.ink} edge="var(--ink-body)" title={event.title} time={rangeText(span.start, span.end)} />
      {(picker === 'ends' || (picker === 'date' && !event.task_id)) && (
        // F7: Starts / Ends — a date, and Set time unless all-day; the end is never before the start.
        <DatePicker
          mode={event.all_day ? 'day' : 'iso'}
          withTime={!event.all_day}
          title={picker === 'ends' ? 'Ends' : 'Starts'}
          meta={event.title}
          value={event.all_day ? (picker === 'ends' ? rangeOf(event).endDay : event.starts_at.slice(0, 10)) : picker === 'ends' ? event.ends_at : event.starts_at}
          quick={picker === 'date'}
          onPick={(picked, _d, timed) => setRange(pickRange(rangeOf(event), picker === 'ends' ? 'end' : 'start', picked, timed))}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'date' && !!event.task_id && (
        <DatePicker
          mode="day"
          title="Date"
          meta={event.title}
          value={event.all_day ? event.starts_at.slice(0, 10) : span.day}
          quick
          onPick={(day) => {
            if (repeats) {
              // A repeat asks which occurrences move (cal-clicks); the sheet leaves first.
              return leave(() => void moveToDay(event, day))
            }
            if (event.all_day) void moveToDay(event, day)
            else if (day !== span.day) onMove(event, span, { ...span, day }, 'move')
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'time' && (
        <TimePicker
          day={span.day}
          value={fromMin(span.start)}
          duration={len}
          lengthChips={false} // queue 15: the sheet's length chips are its one length control
          title={event.title}
          onDone={(hhmm, d) => {
            const start = toMin(hhmm)
            const to = { day: span.day, start, end: start + (d ?? len) }
            if (to.start === span.start && to.end === span.end) return
            // A repeat asks which occurrences (cal-clicks); a one-off moves like a drag.
            if (repeats) void retimeBlock(event, span, to).then((ref) => ref && onRebind?.(ref))
            else onMove(event, span, to, d ? 'bottom' : 'move')
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'project' && (
        // An area or a project, like a task's (tasks/MovePicker): the event's colour follows it unless it has its own.
        <MovePicker
          noDomain
          position={{ x: 0, y: 0 }}
          current={eventPlaceKey(event)}
          meta={event.title}
          onPick={(to) => {
            const patch = eventPlacePatch(to)
            if (eventPlaceKey({ ...event, ...patch }) === eventPlaceKey(event)) return
            void editEvent(event, patch, `${to.kind === 'none' ? 'Taken out of its project or area' : `Filed under ${to.name}`} · ${event.title}`).then((ref) => ref && onRebind?.(ref))
            saved()
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'repeat' && (
        // The one Repeat picker (tasks/RepeatMenu) — the presets and the Custom… rule editor.
        <RepeatMenu
          value={event.recurrence_rule ?? null}
          start={event.starts_at}
          meta={event.title}
          position={{ x: 0, y: 0 }}
          onClose={() => setPicker(null)}
          onChange={(r) => {
            if (r === (event.recurrence_rule ?? null)) return
            const ref = setEventRepeat(event, r)
            if (ref) onRebind?.(ref)
            saved()
          }}
        />
      )}
      {picker === 'remind' && (
        <ActionSheet
          title="Remind"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={EVENT_REMIND.map((o) => choice(o.label, (event.remind_min ?? null) === o.min, () => void remindEvent(event, o.min, `${remindLabel(o.min)} · ${event.title}`).then((ref) => ref && onRebind?.(ref))))}
        />
      )}
      {picker === 'more' && (
        <ActionSheet
          title="More"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={[
            choice('Event', event.type === 'event', () => void editEvent(event, { type: 'event' }, `Event · ${event.title}`)),
            choice('Time block', event.type === 'time_block', () => void editEvent(event, { type: 'time_block' }, `Time block · ${event.title}`)),
            choice('Busy', event.busy, () => void editEvent(event, { busy: true }, `Busy · ${event.title}`)),
            choice('Free', !event.busy, () => void editEvent(event, { busy: false }, `Free · ${event.title}`)),
          ]}
        />
      )}
      {picker === 'ai' && (
        // Menu B's Work with AI ›: the chat opens with a request about this block typed in (the sheet leaves first).
        <ActionSheet
          title="Work with AI"
          meta={event.title}
          onClose={() => setPicker(null)}
          items={aiPrompts(event, !!event.task_id).map((p) => ({ label: p.label, onSelect: () => leave(() => askChat(p.text)) }))}
        />
      )}
      {linkAt && (
        <TaskPicker
          tasks={tasks.filter((t) => t.status === 'todo' && !t.scheduled_start && !t.deleted_at)}
          position={linkAt}
          placeholder="Link a task…"
          label="Search tasks to link"
          onPick={(id) => {
            const t = tasks.find((x) => x.id === id)
            if (t) linkTaskWithUndo(event, t)
            setLinkAt(null)
            saved()
          }}
          onClose={() => setLinkAt(null)}
        />
      )}
    </>
  )
}

/** 7g — tap a rail chip (Overdue · Today · Inbox): the next 3 free slots, one tap places the block
 * (the caller writes it, toast + Undo). 7g2 — nothing fits today: says so and offers the next days.
 * Or pick a time / a date. "Replan" (Kai 2026-10-07) is the same sheet for an overdue block, with
 * the way into its task. */
export function ScheduleSheet({ title, duration, events, heading = 'Schedule', onPlace, onOpen, onComplete, onClose }: {
  title: string
  duration: number
  events: readonly CalendarEvent[]
  heading?: string
  onPlace: (startsAt: string, endsAt: string) => void
  onOpen?: () => void
  /** A task chip: tick it off from here (the sheet leaves first, the Undo toast lands on the page). */
  onComplete?: () => void
  onClose: () => void
}) {
  const [picker, setPicker] = useState<'time' | 'date' | null>(null)
  const now = new Date()
  const today = cairoDateKey(now)
  const dur = duration
  const { today: fitsToday, slots } = scheduleSlots(events, now, dur)
  const place = (startsAt: string, len: number) => onPlace(startsAt, new Date(Date.parse(startsAt) + len * 60_000).toISOString())
  // Kai 2026-10-17: opening a chip's task is one tap — its title, or the first row (the sheet leaves first).
  const closeRef = useRef<(() => void) | null>(null)
  const open = onOpen && (() => { closeRef.current?.(); onOpen() })
  const head = <SheetTitle title={heading} meta={`${title} · ${durationLabel(dur)}`} />
  return (
    <>
      <BottomSheet
        onClose={onClose}
        title={open ? <button type="button" className="pc-sched-title" aria-label={`Open ${title}`} onClick={open}>{head}</button> : head}
      >
        {(close) => {
          closeRef.current = close
          return (
          <>
            {open && (
              <div className="pc-bs-rows pc-sched-open">
                <style>{ACTION_ROW_CSS}</style>
                <Row icon="tasks" label="Open task" onClick={open} />
              </div>
            )}
            <SectionLabel>{fitsToday ? 'Next free today' : 'Next free'}</SectionLabel>
            <div className="pc-slots">
              {slots.map((s) => (
                <button key={`${s.day}-${s.start}`} type="button" className="kf-pk-slot" onClick={() => { place(spanIso({ ...s, end: s.start + dur }).starts_at, dur); close() }}>
                  {slotLabel(s, dur, today)}
                </button>
              ))}
            </div>
            {!fitsToday && (
              <div className="pc-hint">
                <Icon name="clock" size={16} />
                No {durationLabel(dur)} gap left today
              </div>
            )}
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              <Row icon="clock" label="Pick a time…" onClick={() => setPicker('time')} />
              <Row icon="pickdate" label="Pick a date…" onClick={() => setPicker('date')} />
              {onComplete && <Row icon="check" label="Complete" chevron={false} onClick={() => { close(); onComplete() }} />}
            </div>
          </>
          )
        }}
      </BottomSheet>
      {picker === 'time' && (
        <TimePicker day={today} value={null} duration={dur} title={title} onDone={(hhmm, d) => { place(cairoToIso(today, hhmm), d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
      {picker === 'date' && (
        <DatePicker title={heading} meta={title} value={null} quick withTime duration={dur} onPick={(iso, d) => { place(iso, d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
    </>
  )
}
