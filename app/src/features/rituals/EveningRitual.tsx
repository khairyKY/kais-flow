import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTasks, completeTask, completeTaskWithUndo, reopenTaskWithUndo, rescheduleDue, undoCompletion } from '../tasks/api'
import { upsertJournalEntry, useJournalEntries } from '../journal/api'
import { useTimeEntries } from '../focus/api'
import { useProjects } from '../projects/api'
import { focusedToday } from '../today/todayLayout'
import { formatDuration } from '../tasks/taskDisplay'
import { SelectCircle } from '../tasks/SwipeRow'
import { Button, Checkbox, Star } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { cairoDateKey, scheduleTomorrow } from '../../lib/dateShortcuts'
import { playSound, closeTheGarden } from '../../lib/sounds'
import { useEscapeStack } from '../../lib/overlayStack'
import { logActivity } from '../../lib/activity'
import { toastAction, toastUndo } from '../../lib/undo'
import { localDateKey } from '../routines/streaks'
import { logRitualFinished, logRitualStep, setSeed, useDraft, useRitualStepsToday, useSeedsFor } from './api'
import { loopDayKey, seedTargetDate } from './loopDay'
import { SHUT_STEPS, closeDay, daysBetween, headerDate, rolledMeta, seedDayName, span, swapIn, sweepRows, tomorrowSuggestions, withPick } from './ritualLogic'
import { Collapsed, KitRow, Meta, RitualFoot, RitualSheet, Section } from './RitualChrome'
import type { Task } from '../../lib/types'

// ── Shut down — design-export/Shutdown.dc.html 8a–8h (night first) + SCREENS-2026-09-28 §Shut down
// rulings 1–6. One sheet: Sweep (Done · Tomorrow, or roll them all), One line (optional, saves to
// the journal), Tomorrow's 3 (pre-suggested seeds for the morning plan), then Close the day and a
// short summary on the way out. Nothing on this screen deletes. Kai: this is the ONLY evening entry
// for tomorrow's 3 — Plan my day never plans tomorrow. ──

interface ShutDraft {
  /** The Sweep's rows in the order first seen (touched rows stay listed). */
  seen: string[]
  /** Rolled to tomorrow here: id → the due date it had, for the second tap that takes it back. */
  rolled: Record<string, string | null>
  doneHere: string[]
  line: string
  saved: { id: string; created_at: string; text: string } | null
  editing: boolean
  /** null until touched: the seeds already planted, else the first three suggestions. */
  stars: string[] | null
}

const A = '/ds/assets'

export function EveningRitual({ onClose }: { onClose: () => void }) {
  const now = new Date()
  const day = loopDayKey(now)
  const navigate = useNavigate()
  const { data: tasks = [], isPending } = useTasks()
  const { data: journal = [] } = useJournalEntries()
  const { data: timeEntries = [] } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const { data: stepsToday } = useRitualStepsToday()
  const seeded = useSeedsFor(seedTargetDate(now))
  const [draft, setDraft, clearDraft] = useDraft<ShutDraft>('shutdown', day, () => ({ seen: [], rolled: {}, doneHere: [], line: '', saved: null, editing: false, stars: null }))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<string[] | null>(null)
  const closeRef = useRef<() => void>(onClose)

  const byId = new Map(tasks.map((t) => [t.id, t]))
  const touched = new Set([...Object.keys(draft.rolled), ...draft.doneHere])
  const sweep = sweepRows(tasks, draft.seen, touched, now)
  const rows = sweep.rows
  const isRolled = (t: Task) => t.id in draft.rolled
  const open = rows.filter((t) => t.status === 'todo' && !isRolled(t))
  const suggestions = tomorrowSuggestions(tasks, rows, now)
  const stars = (draft.stars ?? (seeded.length ? seeded.map((t) => t.id) : suggestions.slice(0, 3).map((s) => s.task.id))).filter((id) => byId.get(id)?.status === 'todo')
  const seedList = [...suggestions, ...stars.filter((id) => !suggestions.some((s) => s.task.id === id)).map((id) => ({ task: byId.get(id)!, why: 'Planted' }))]
  const doneToday = tasks.filter((t) => t.completed_at && cairoDateKey(new Date(t.completed_at)) === cairoDateKey(now)).length
  const focused = focusedToday(timeEntries, now)
  const stats = [`${doneToday} done`, ...(focused > 0 ? [`${span(focused)} focused`] : [])]
  const selecting = selected.size > 0
  useEscapeStack(selecting, () => setSelected(new Set())) // Back leaves selection mode before the sheet
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name

  // "Sweep" is walked once nothing is left in it here; "One line" once a line is saved.
  const swept = rows.length > 0 && open.length === 0
  const wasSwept = useRef(swept)
  const loggedHere = useRef(new Set<string>())
  const logStep = (step: string) => {
    if (stepsToday?.evening.has(step) || loggedHere.current.has(step)) return
    loggedHere.current.add(step)
    logRitualStep('evening', step)
  }
  useEffect(() => {
    if (swept && !wasSwept.current && !isPending) logStep('sweep')
    wasSwept.current = swept
  })

  // ── Sweep (ruling 1): checkbox = Done; Tomorrow (or swipe right) = tomorrow 09:00, and a second
  // tap takes it back; long-press selects for bulk Done / Tomorrow. No ⋯, no swipe-left. ──
  const seen = sweep.seen
  function check(t: Task, next: boolean) {
    if (!next) return void reopenTaskWithUndo(t)
    completeTaskWithUndo(t)
    setDraft((d) => ({ seen, doneHere: [...d.doneHere, t.id] }))
  }
  function roll(list: Task[]) {
    const fresh = list.filter((t) => !isRolled(t) && t.status === 'todo')
    fresh.forEach((t) => rescheduleDue(t, scheduleTomorrow()))
    setDraft((d) => ({ seen, rolled: { ...d.rolled, ...Object.fromEntries(fresh.map((t) => [t.id, t.due_at])) } }))
  }
  function unroll(t: Task) {
    rescheduleDue(t, draft.rolled[t.id] ?? null)
    setDraft((d) => {
      const rolled = { ...d.rolled }
      delete rolled[t.id]
      return { rolled }
    })
  }
  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function bulkDone() {
    const list = rows.filter((t) => selected.has(t.id) && t.status === 'todo')
    const undos = list.map((t) => completeTask(t))
    setDraft((d) => ({ seen, doneHere: [...d.doneHere, ...list.map((t) => t.id)] }))
    toastUndo(list.length === 1 ? 'Done' : `${list.length} done`, () => undos.forEach(undoCompletion))
    setSelected(new Set())
  }
  function bulkTomorrow() {
    roll(rows.filter((t) => selected.has(t.id)))
    setSelected(new Set())
  }

  // ── One line (ruling 3): the last two lines in Caveat; Save → "Saved to journal ✓" + Edit. ──
  const pastLines = journal.filter((e) => e.entry_date < day && e.body.trim() && e.id !== draft.saved?.id).slice(0, 2)
  const showSaved = !!draft.saved && !draft.editing
  function saveLine(): boolean {
    const text = draft.line.trim()
    if (!text) return false
    playSound('pencil_scratch')
    const prior = draft.saved
    const entry = upsertJournalEntry(prior ? { id: prior.id, created_at: prior.created_at, entry_date: day, body: text } : { entry_date: day, body: text }, !prior)
    // S8 (polish-f1): the event says a line was written, never what it says.
    if (!prior) logActivity('journal.line_added', 'ritual', day, { date: day })
    setDraft({ saved: { id: entry.id, created_at: entry.created_at, text }, editing: false })
    logStep('line')
    return true
  }

  // ── Tomorrow's 3 (ruling 2): seed rows — star + title + why. A 4th star shows the swap toast. ──
  function toggleStar(id: string) {
    const r = withPick(stars, id)
    if (r.full) {
      toastAction("Tomorrow's 3 is full — swap one out?", 'Swap', () => setDraft((d) => ({ stars: swapIn(d.stars ?? stars, id) })))
      return
    }
    setDraft({ stars: r.picks })
  }

  // Close the day: writes the line, plants Tomorrow's 3 as seeds (starred Sweep rows roll to
  // tomorrow 09:00), logs the ritual finished, quiets the garden, then the summary (ruling 5).
  function closeTheDay() {
    if (summary) return
    const wroteLine = (draft.line.trim() && !showSaved ? saveLine() : false) || !!draft.saved
    const plan = closeDay(stars, seeded.map((t) => t.id), new Set(open.map((t) => t.id)))
    plan.seed.forEach((id) => byId.get(id) && setSeed(byId.get(id)!, true))
    plan.unseed.forEach((id) => byId.get(id) && setSeed(byId.get(id)!, false))
    plan.roll.forEach((id) => byId.get(id) && rescheduleDue(byId.get(id)!, scheduleTomorrow()))
    const steps = SHUT_STEPS.filter((s) => s !== 'line' || wroteLine)
    steps.forEach(logStep)
    logRitualFinished('evening', steps)
    // Settings 3a: "The garden is silent after you close it." Quiet hours lift at the date turn.
    closeTheGarden(localDateKey(new Date()))
    setSummary([...stats, `${stars.length} seeded`])
    clearDraft()
  }
  useEffect(() => {
    if (!summary) return
    const t = setTimeout(() => closeRef.current(), 3000)
    return () => clearTimeout(t)
  }, [summary])

  if (summary) {
    return (
      <RitualSheet
        title=""
        sub=""
        onClose={onClose}
        left={
          <div className="rt-summary">
            <img src={`${A}/clover/resting.png`} alt="" />
            <div className="rt-summary-title">The garden's closed.</div>
            <span className="rt-hand is-mine">See you in the morning ✿</span>
            <div className="rt-meta">{summary.map((s) => <span key={s}>{s}</span>)}</div>
          </div>
        }
        right={null}
        footer={(close) => {
          closeRef.current = close
          return (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <Button type="button" onClick={close}>
                Goodnight
              </Button>
            </div>
          )
        }}
      />
    )
  }

  const sweepSection =
    rows.length === 0 ? (
      <Collapsed label="Sweep" line="Everything tended ✿" />
    ) : (
      <>
        <Section first label={`Sweep · ${touched.size > 0 ? `${open.length} of ${rows.length}` : open.length} left`} link={open.length > 0 ? { label: 'Roll all to tomorrow', onClick: () => roll(open) } : undefined} />
        {rows.map((t) => {
          const done = t.status === 'done'
          const rolled = isRolled(t)
          const due = rolled ? draft.rolled[t.id] : t.due_at
          const late = due && !done ? daysBetween(cairoDateKey(new Date(due)), cairoDateKey(now)) : 0
          const sel = selected.has(t.id)
          return (
            <KitRow
              key={t.id}
              task={t}
              done={done}
              selected={sel}
              lead={selecting && !done ? <SelectCircle on={sel} title={t.title} /> : <Checkbox checked={done} label={t.title} bloom={t.top3} onChange={(next) => check(t, next)} />}
              meta={[
                !done && projectName(t.project_id) && <Meta key="p" dot="var(--acc-moss)">{projectName(t.project_id)}</Meta>,
                late > 0 && <Meta key="o" tone="var(--sig-overdue)">Overdue {late}d</Meta>,
                !done && t.top3 && <Meta key="t">Top 3</Meta>,
                t.duration_min != null && <Meta key="m">{formatDuration(t.duration_min)}</Meta>,
                rolled && <Meta key="r" tone="var(--acc-sage-text)">{rolledMeta(now)}</Meta>,
              ]}
              trail={
                !done &&
                !selecting && (
                  <span className="rt-trail">
                    <Button type="button" variant="secondary" selected={rolled} icon={rolled ? undefined : <Icon name="tomorrow" size={20} />} onClick={() => (rolled ? unroll(t) : roll([t]))}>
                      Tomorrow
                    </Button>
                  </span>
                )
              }
              swipe={{
                actions: done || rolled ? undefined : { tomorrow: () => roll([t]) },
                onLongPress: done ? undefined : () => setSelected(new Set([t.id])),
                selecting: selecting && !done,
                onSelectTap: () => toggleSel(t.id),
              }}
            />
          )
        })}
      </>
    )

  const lineSection = (
    <>
      <Section label="One line" />
      <div className="rt-line">
        {pastLines.map((e) => (
          <div key={e.id} className="rt-past">
            <span className="rt-past-date">{pastDate(e.entry_date)}</span>
            <span className="rt-hand">{e.body.trim().split('\n')[0]}</span>
          </div>
        ))}
        {showSaved ? (
          <>
            <div className="rt-past" style={{ alignItems: 'center', minHeight: 48, marginTop: 6 }}>
              <span className="rt-past-date">{pastDate(day)}</span>
              <span className="rt-hand is-mine" style={{ flex: 1, minWidth: 0 }}>{draft.saved!.text}</span>
              <Button type="button" variant="ghost" onClick={() => setDraft({ editing: true, line: draft.saved!.text })}>
                Edit
              </Button>
            </div>
            <div className="rt-saved">Saved to journal ✓</div>
          </>
        ) : (
          <div className="rt-line-form">
            <input
              className="rt-input"
              style={{ flex: 1, minWidth: 0 }}
              value={draft.line}
              placeholder="How did today go?"
              aria-label="One line about today"
              enterKeyHint="done"
              onChange={(e) => setDraft({ line: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveLine()
              }}
            />
            <Button type="button" variant="secondary" onClick={saveLine}>
              Save
            </Button>
          </div>
        )}
      </div>
    </>
  )

  const seedsSection = (
    <>
      <Section first={false} label={`Tomorrow's 3 · ${stars.length}/3`} link={{ label: 'All tasks', onClick: () => navigate('/tasks') }} />
      {seedList.map(({ task: t, why }) => {
        const i = stars.indexOf(t.id)
        return (
          <div key={t.id} className="rt-seedrow" id={`rt-seed-${t.id}`}>
            <Star on={i >= 0} label={t.title} onChange={() => toggleStar(t.id)} />
            <div className="rt-body">
              <div className="rt-title">{t.title}</div>
              <div className="rt-meta">
                {i === 0 && <Meta tone="var(--acc-gold)">✶ Goal</Meta>}
                <Meta>{why}</Meta>
                {t.duration_min != null && <Meta>{formatDuration(t.duration_min)}</Meta>}
              </div>
            </div>
          </div>
        )
      })}
      <div className="rt-planted">
        <img src={`${A}/clover/seedling.png`} alt="" />
        <span className="rt-hand is-mine">Planted for {seedDayName(now)} — the morning plan opens with these ✿</span>
      </div>
    </>
  )

  const status = `${stars.length} seed${stars.length === 1 ? '' : 's'} for ${seedDayName(now, 'short')}`
  return (
    <RitualSheet
      title="Shut down"
      sub={[headerDate(now), ...stats].join(' · ')}
      onClose={onClose}
      left={
        <>
          {sweepSection}
          {lineSection}
        </>
      }
      right={seedsSection}
      footer={(close) => {
        closeRef.current = close
        return selecting ? (
          <div className="rt-foot-row" style={{ flex: 1 }}>
            <span className="rt-mono" style={{ flex: 1, minWidth: 0 }}>{selected.size} selected</span>
            <Button type="button" variant="secondary" icon={<Icon name="tomorrow" size={20} />} onClick={bulkTomorrow}>
              Tomorrow
            </Button>
            <Button type="button" variant="secondary" icon={<Icon name="check" size={20} />} onClick={bulkDone}>
              Done
            </Button>
          </div>
        ) : (
          <RitualFoot status={status} cta={<Button type="button" onClick={closeTheDay}>Close the day</Button>} />
        )
      }}
    />
  )
}

/** "Sat 26" — a journal line's mono date. */
function pastDate(key: string): string {
  const d = new Date(`${key}T12:00:00Z`)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
}
