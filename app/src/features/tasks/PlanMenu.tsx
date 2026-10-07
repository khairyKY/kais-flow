import { useMemo, useState, type ReactNode } from 'react'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { DatePicker, Popover } from '../../components/DatePicker'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button } from '../../components/kit'
import { durationLabel, freeStarts, fromMin } from '../../components/pickerMath'
import { SheetTitle } from '../../components/TimePicker'
import { useAppSettings } from '../../lib/settings'
import { parseWeekend } from '../../lib/weekend'
import type { Task } from '../../lib/types'
import { useCalendarEvents } from '../calendar/api'
import { cairoToIso } from '../calendar/eventTime'
import { isOverdue, planOptions, slotText, spreadPlan, type PlanKey, type PlanOption, type SpreadPick } from './planMath'
import { tomorrowHint } from '../../lib/dateShortcuts'
import '../../components/pickers.css'

// ── The Plan menu (Kai 2026-10-07): one list wherever a task gets a date — the ⋯ / right-click
// menu's Plan… (Replan… once it's overdue), the swipe's Plan, the task sheet's date chip, the bulk
// bar. Each option says where it lands and what it means (./planMath). Next free slot proposes the
// first gap that fits and waits for Confirm; Pick date & time… is the date picker. Phone: a sheet;
// desktop: a popover (a submenu of the row menu). The calendar can open it for a task too. ──

/** The writes a plan makes — a row's TaskMenuActions, or a selection's bulk handlers. */
export interface PlanActions {
  schedule: (iso: string) => void
  tomorrow: () => void
  /** Next free slot's Confirm (one task only). */
  slot?: (startsAt: string, endsAt: string) => void
  someday?: () => void
  clearDate?: () => void
  /** A selection's Spread into free slots → Confirm (Today's overdue Replan all). */
  spread?: (picks: SpreadPick[]) => void
}

/** An Up next block's own Tomorrow: the same time tomorrow, block and all. */
export interface BlockTomorrow {
  hint: string
}

const ICONS: Record<PlanKey, IconName> = { today: 'today', slot: 'clock', spread: 'routines', tomorrow: 'tomorrow', weekend: 'calendar', nextweek: 'pickdate', pick: 'dots', someday: 'journal', none: 'close' }
const CSS = `
  .kf-plan .kf-as-row { padding-top: 6px; padding-bottom: 6px; }
  .kf-plan-means { display: block; margin-top: 1px; font-size: 12.5px; line-height: 16px; color: var(--ink-muted); }
  .kf-pk-pop .kf-plan-means { font-size: 11.5px; line-height: 15px; }
  .kf-plan-slot { font-family: var(--font-display); font-size: 22px; font-weight: 500; color: var(--ink-body); padding: 8px 0 2px; }
  .kf-pk-pop .kf-plan-slot { font-size: 19px; }
  .kf-plan-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .kf-plan-spread { list-style: none; margin: 8px 0; padding: 0; }
  .kf-plan-spread li { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--line-dashed); font-size: 14px; color: var(--ink-body); }
  .kf-plan-spread b { flex: none; width: 92px; font-family: var(--font-mono); font-size: 12px; font-weight: 400; color: var(--acc-lavender-text); padding-top: 1px; }
  .kf-plan-spread span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

export function PlanMenu({ task, bulkCount, spreadTasks, title: titleOverride, position, actions, blockTomorrow, onClose }: {
  /** The task (a selection: the row the menu opened on). */
  task: Task
  /** 2+ selected: the plan applies to all of them — no free-slot finder, Today is 09:00. */
  bulkCount?: number
  /** The selection, in order, for Spread into free slots (with `actions.spread`). */
  spreadTasks?: readonly Task[]
  /** "Replan all" — else Plan, or Replan for an overdue task. */
  title?: string
  /** Desktop anchor, screen px. */
  position: { x: number; y: number }
  actions: PlanActions
  blockTomorrow?: BlockTomorrow
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [stage, setStage] = useState<'list' | 'slot' | 'pick' | 'spread'>('list')
  const { data: settings } = useAppSettings()
  const { data: events = [] } = useCalendarEvents()
  const bulk = !!bulkCount && bulkCount > 1
  const dur = task.duration_min || 30
  // The task's own blocks don't count as busy — a free slot may be where it already sits.
  const slots = useMemo(() => (bulk || !actions.slot ? [] : freeStarts(events.filter((e) => e.task_id !== task.id), new Date(), dur)), [bulk, actions.slot, events, task.id, dur])
  const spread = useMemo(() => (actions.spread && spreadTasks?.length ? spreadPlan(spreadTasks, events, new Date()) : null), [actions.spread, spreadTasks, events])
  const now = new Date()
  const placed = spread?.filter((p) => p.slot).length ?? 0
  const options = planOptions(now, {
    task: bulk ? undefined : task,
    weekend: parseWeekend(settings?.weekend_days),
    slot: bulk || !actions.slot ? undefined : (slots[0] ?? null),
    dur,
    spread: spread ? { today: placed, tomorrow: spread.length - placed } : undefined,
    someday: !!actions.someday,
    clear: !!actions.clearDate,
  }).map((o) => (o.key === 'tomorrow' && blockTomorrow ? { ...o, label: 'Tomorrow, same time', hint: blockTomorrow.hint, means: 'the block moves a day' } : o))
  const title = titleOverride ?? (isOverdue(task, now) && !bulk ? 'Replan' : 'Plan')
  const meta = bulk ? `${bulkCount} tasks` : task.title

  if (stage === 'pick') {
    return <DatePicker title="Pick date & time" meta={meta} value={bulk ? null : task.due_at} withTime position={position} onPick={(iso) => actions.schedule(iso)} onClose={onClose} />
  }
  if (stage === 'spread' && spread) {
    return <SpreadConfirm meta={meta} picks={spread} position={position} mobile={isMobile} onConfirm={() => actions.spread?.(spread)} onClose={onClose} />
  }
  if (stage === 'slot') {
    return (
      <SlotConfirm
        meta={`${task.title} · ${durationLabel(dur)}`}
        slots={slots}
        dur={dur}
        position={position}
        mobile={isMobile}
        onConfirm={(s) => actions.slot?.(cairoToIso(s.day, fromMin(s.start)), cairoToIso(s.day, fromMin(s.start + dur)))}
        onPick={() => setStage('pick')}
        onClose={onClose}
      />
    )
  }

  const choose = (o: PlanOption, close: () => void) => {
    if (o.key === 'slot') return setStage(slots.length ? 'slot' : 'pick')
    if (o.key === 'spread') return setStage('spread')
    if (o.key === 'pick') return setStage('pick')
    if (o.key === 'tomorrow') actions.tomorrow()
    else if (o.key === 'someday') actions.someday?.()
    else if (o.key === 'none') actions.clearDate?.()
    else if (o.iso) actions.schedule(o.iso)
    close()
  }
  const list = (close: () => void) => (
    <div className="kf-pk-picks kf-plan">
      <style>{ACTION_ROW_CSS + CSS}</style>
      {options.map((o) => (
        <button key={o.key} type="button" className="kf-as-row" aria-current={o.current || undefined} onClick={() => choose(o, close)}>
          <span className="kf-as-icon" aria-hidden><Icon name={ICONS[o.key]} size={24} /></span>
          <span className="kf-pk-label">
            {o.label}
            <span className="kf-plan-means">{o.means}</span>
          </span>
          {o.hint && <span className="kf-as-hint">{o.hint}</span>}
          {o.current && <Icon name="check" size={20} className="kf-pk-check" />}
        </button>
      ))}
    </div>
  )
  const head = <SheetTitle title={title} meta={meta} />
  if (isMobile) {
    return (
      <BottomSheet key="plan" title={head} onClose={onClose}>
        {list}
      </BottomSheet>
    )
  }
  return (
    <Popover title={head} position={position} onClose={onClose} focusKey={null}>
      {list(onClose)}
    </Popover>
  )
}

const SPREAD_SHOWN = 8

/** Spread into free slots: the preview — which task lands where today, how many go to tomorrow —
 * then Confirm · Cancel. Nothing is written before Confirm. */
function SpreadConfirm({ meta, picks, position, mobile, onConfirm, onClose }: {
  meta: string
  picks: readonly SpreadPick[]
  position: { x: number; y: number }
  mobile: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const placed = picks.filter((p) => p.slot)
  const rest = picks.length - placed.length
  const body: ReactNode = (
    <>
      <style>{CSS}</style>
      <span className="kf-plan-means">{placed.length ? 'Today, in order, each in the first free gap that fits it:' : 'No free gap left today (08:00–20:00).'}</span>
      {placed.length > 0 && (
        <ul className="kf-plan-spread">
          {placed.slice(0, SPREAD_SHOWN).map((p) => (
            <li key={p.task.id}>
              <b>{slotText(p.slot!, p.dur).replace(/^Today /, '')}</b>
              <span>{p.task.title}</span>
            </li>
          ))}
          {placed.length > SPREAD_SHOWN && <li><b /><span>+ {placed.length - SPREAD_SHOWN} more today</span></li>}
        </ul>
      )}
      {rest > 0 && <span className="kf-plan-means">{rest} {rest === 1 ? 'goes' : 'go'} to tomorrow, first thing ({tomorrowHint()}).</span>}
    </>
  )
  const footer = (close: () => void) => (
    <div className="kf-plan-foot">
      <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
      <Button type="button" onClick={() => { onConfirm(); close() }}>Confirm</Button>
    </div>
  )
  const head = <SheetTitle title="Spread into free slots" meta={meta} />
  if (mobile) {
    return (
      <BottomSheet key="spread" title={head} onClose={onClose} footer={footer}>
        {() => body}
      </BottomSheet>
    )
  }
  return (
    <Popover title={head} position={position} onClose={onClose} focusKey={null} footer={footer(onClose)}>
      {body}
    </Popover>
  )
}

/** Next free slot: the proposed slot, then Confirm · Another time (the next gap that fits) · Cancel. */
function SlotConfirm({ meta, slots, dur, position, mobile, onConfirm, onPick, onClose }: {
  meta: string
  slots: readonly { day: string; start: number }[]
  dur: number
  position: { x: number; y: number }
  mobile: boolean
  onConfirm: (s: { day: string; start: number }) => void
  onPick: () => void
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const s = slots[i]
  const body: ReactNode = (
    <>
      <style>{CSS}</style>
      <div className="kf-plan-slot" aria-live="polite">{slotText(s, dur)}</div>
      <span className="kf-plan-means">
        {i === 0 ? `ASAP: the first free ${durationLabel(dur)} on your calendar, between 08:00 and 20:00` : `the next free ${durationLabel(dur)} after that (${i + 1} of ${slots.length})`}
      </span>
    </>
  )
  const footer = (close: () => void) => (
    <div className="kf-plan-foot">
      <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
      <Button type="button" variant="secondary" onClick={() => (i + 1 < slots.length ? setI(i + 1) : onPick())}>{i + 1 < slots.length ? 'Another time' : 'Pick a time…'}</Button>
      <Button type="button" onClick={() => { onConfirm(s); close() }}>Confirm</Button>
    </div>
  )
  const head = <SheetTitle title="Next free slot" meta={meta} />
  if (mobile) {
    return (
      <BottomSheet key="slot" title={head} onClose={onClose} footer={footer}>
        {() => body}
      </BottomSheet>
    )
  }
  return (
    <Popover title={head} position={position} onClose={onClose} focusKey={null} footer={footer(onClose)}>
      {body}
    </Popover>
  )
}
