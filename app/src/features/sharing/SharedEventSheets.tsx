// Free together, Propose / a new shared event, and "Delete for both" (flows 1 and 2 of design-export/Partner sharing P2 flows.html).
// Plain on purpose: the look is Kai's to pick. Free together is the server's compare of both calendars (windows only); Propose and
// New shared event are one sheet, the same time fields; Delete for both asks first and, once it's done, has an Undo.
import { useMemo, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/kit'
import { useAppZone } from '../../lib/appZone'
import { zoneDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent } from '../../lib/types'
import { restoreEvent } from '../calendar/api'
import { useConnections } from './api'
import {
  RANGE_NAME, createSharedEvent, deleteSharedForBoth, proposalFrom, rangeBounds, useFreeTogether, windowText, windowsByDay, dayLabel, zoneHint,
  type FreeRange, type FreeWindow,
} from './sharedEvents'
import { pauseLine } from './model'
import { useSharingUi } from './ui'
import './sharing.css'

const hhmm = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone, hourCycle: 'h23' })
function isoFrom(date: string, time: string, zone: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  if (![y, m, d, h, mi].every(Number.isFinite)) return null
  return zoneWallTimeToIso(zone, y, m, d, h, mi)
}

// ── Free together ──

export function FreeTogetherSheet({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const zone = useAppZone()
  const { data: people = [] } = useConnections()
  const c = people.find((p) => p.circle_id === circleId)
  const [range, setRange] = useState<FreeRange>('today')
  const now = useMemo(() => new Date(), [range])
  const { from, to } = useMemo(() => rangeBounds(range, now, zone), [range, now, zone])
  const { data, isLoading, isError } = useFreeTogether(c?.partner_id ?? '', from, to, !!c && !c.paused_until)
  const days = useMemo(() => windowsByDay(data?.windows ?? [], zone), [data, zone])
  if (!c) return null
  const name = c.partner_name
  const propose = (w: FreeWindow) => useSharingUi.getState().openPropose({ circleId, window: w, partnerZone: data?.partner_zone })

  return (
    <BottomSheet onClose={onClose} title="Free together">
      {() => (
        <div className="sh-sheet">
          <div className="sh-sub">Times you and {name} are both free: an hour or more, between 8:00 AM and 10:30 PM. Only the gaps are compared; nobody’s blocks are shown.</div>
          {c.paused_until ? (
            <div className="sh-banner" role="status"><div className="sh-bt">{name} paused sharing.<span>{pauseLine(c.paused_until, now, zone)} There is nothing to compare until it is back on.</span></div></div>
          ) : (
            <>
              <div className="sh-chips" role="group" aria-label="When" style={{ marginTop: 12 }}>
                {(['today', 'tomorrow', 'week'] as const).map((r) => <Button key={r} variant="secondary" selected={range === r} onClick={() => setRange(r)}>{RANGE_NAME[r]}</Button>)}
              </div>
              {isLoading && <div className="sh-cap" role="status">Comparing your calendars…</div>}
              {isError && <div className="sh-err" role="alert">Couldn’t compare. Free together needs a connection.</div>}
              {data && !data.ok && <div className="sh-err" role="alert">{data.error === 'paused' ? `${name} paused sharing.` : 'You are not connected.'}</div>}
              {data?.ok && !days.length && <div className="sh-cap" role="status">No hour when you are both free {range === 'week' ? 'this week' : range === 'today' ? 'today' : 'tomorrow'}. Try another day.</div>}
              {days.map((d) => (
                <div key={d.key} className="sh-box">
                  <div className="sh-sec-l" style={{ padding: '8px 16px 0' }}>{dayLabel(d.key, now, zone)}</div>
                  {d.windows.map((w) => (
                    <div key={w.starts_at} className="sh-row">
                      <div className="sh-grow">{windowText(w, zone)}</div>
                      <Button variant="secondary" onClick={() => propose(w)}>Propose</Button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

// ── Propose, and a new shared event (one sheet) ──

export function ProposeSheet({ circleId, window: w, partnerZone, onClose }: { circleId: string; window?: FreeWindow; partnerZone?: string; onClose: () => void }) {
  const zone = useAppZone()
  const { data: people = [] } = useConnections()
  const c = people.find((p) => p.circle_id === circleId)
  const init = useMemo(() => {
    if (w) return proposalFrom(w)
    const start = Math.ceil(Date.now() / 3_600_000) * 3_600_000
    return { startsAt: new Date(start + 3_600_000).toISOString(), endsAt: new Date(start + 2 * 3_600_000).toISOString() }
  }, [w])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => zoneDateKey(new Date(init.startsAt), zone))
  const [start, setStart] = useState(() => hhmm(init.startsAt, zone))
  const [end, setEnd] = useState(() => hhmm(init.endsAt, zone))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!c) return null
  const name = c.partner_name
  const startsAt = isoFrom(date, start, zone)
  let endsAt = isoFrom(date, end, zone)
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = null
  const hint = startsAt ? zoneHint(startsAt, zone, partnerZone, name) : null
  const ready = title.trim().length > 0 && !!startsAt && !!endsAt

  async function send() {
    if (!startsAt || !endsAt || !c) return
    setBusy(true)
    setErr(null)
    try {
      const r = await createSharedEvent(c, { title: title.trim(), startsAt, endsAt })
      if (r === 'ok') {
        useToastStore.getState().push({ message: `Sent to ${name}. It stays on both calendars until they answer.` })
        onClose()
        return
      }
      setErr(r === 'paused' ? `${name} paused sharing, so nothing can be sent.` : 'That didn’t go through.')
    } catch {
      setErr('Sending needs a connection. Try again when you are online.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet onClose={onClose} title={w ? 'Propose a time' : 'New shared event'}>
      {() => (
        <div className="sh-sheet">
          <div className="sh-sub">{name} is already on it. It shows on both calendars, dashed, until they answer.</div>
          <label className="sh-lbl" htmlFor="sh-ev-title">Title</label>
          <input id="sh-ev-title" className="sh-input" value={title} maxLength={300} autoFocus placeholder="Date night" onChange={(e) => setTitle(e.target.value)} />
          <label className="sh-lbl" htmlFor="sh-ev-date">Date</label>
          <input id="sh-ev-date" className="sh-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="sh-two">
            <div><label className="sh-lbl" htmlFor="sh-ev-start">From</label><input id="sh-ev-start" className="sh-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="sh-lbl" htmlFor="sh-ev-end">To</label><input id="sh-ev-end" className="sh-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          {hint && <div className="sh-cap">{hint}</div>}
          {!endsAt && startsAt && <div className="sh-cap">It has to end after it starts.</div>}
          {err && <div className="sh-err" role="alert">{err}</div>}
          <div className="sh-btns is-col">
            <Button loading={busy} disabled={!ready} onClick={() => void send()}>{`Send to ${name}`}</Button>
            <Button variant="ghost" onClick={onClose}>Not now</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Delete for both ──

export function DeleteBothSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const { data: people = [] } = useConnections()
  const name = people.find((p) => p.partner_id === event.shared_with)?.partner_name ?? 'them'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function go() {
    setBusy(true)
    setErr(null)
    try {
      const prior = { ...event }
      const r = await deleteSharedForBoth(event)
      if (r === 'ok') {
        toastUndo(`Deleted for both · ${event.title}`, () => restoreEvent(prior))
        onClose()
        return
      }
      setErr(r === 'paused' ? `${name} paused sharing, so it can’t be deleted for both. Remove it from your calendar instead.` : 'It’s already gone.')
    } catch {
      setErr('That needs a connection. Try again when you are online.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <BottomSheet onClose={onClose} title={`Delete “${event.title}” for both?`}>
      {(close) => (
        <div className="sh-sheet">
          <div className="sh-sub">It goes from {name}’s calendar too. You can undo for a few seconds, and it stays in your Trash for 30 days. To take it off only your own calendar, choose Remove from mine instead.</div>
          {err && <div className="sh-err" role="alert">{err}</div>}
          <div className="sh-btns is-col">
            <Button loading={busy} onClick={() => void go()}>Delete for both</Button>
            <Button variant="secondary" onClick={close}>Keep it</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
