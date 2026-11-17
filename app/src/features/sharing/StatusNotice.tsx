// Partner sharing P2 on Today (design-export/Partner sharing P2 flows.html, flows 4 and 5): the status line under the Now card
// ("Reem sees Focusing until 3:30 · auto", a tap changes it) and the one strip of notices ("From Reem": Added Dinner, Fri 8 PM).
// The server decides what a person may see and when it comes (the level, quiet hours, the 24-hour cap); this only draws it.
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { Button, Segmented, Toggle } from '../../components/kit'
import { useAppZone } from '../../lib/appZone'
import { useHour24 } from '../../lib/clock'
import { useToastStore } from '../../lib/toastStore'
import { shareNoticeLine, type ShareNoticeRow } from '../../../../supabase/functions/notify/copy.ts'
import { useMinuteNow } from '../today/useMinuteNow'
import { useFocusStore } from '../focus/focusStore'
import { useCalendarEvents } from '../calendar/api'
import { useConnections } from './api'
import { dismissNotices, sendBlock, sendFocus, setStatusAuto, setStatusWords, useMyStatus, useNoticeSettings, usePartnerNotices } from './statusApi'
import { CLEAR_KINDS, CLEAR_NAME, STATUS_MAX, STATUS_RULE, STATUS_WORDS, alive, clearsLine, currentRepeating, type ClearKind } from './statusModel'
import { Avatar } from './parts'
import './sharing.css'

const failed = () => useToastStore.getState().push({ message: 'That didn’t save. Check the connection and try again.' })

/** Under the Now card: my status line, and the notices strip. Each draws nothing until there is something to say. */
export function ShareTodayExtras() {
  return (
    <>
      <StatusLine />
      <NoticeStrip />
    </>
  )
}

/** "Reem sees Focusing until 3:30 · auto". Only for people I show my status to who can see it (Details, no pause). */
function StatusLine() {
  const { data: people = [] } = useConnections()
  const { data: settings = [] } = useNoticeSettings()
  const seeing = people.filter((c) => c.level === 'details' && !c.paused_until && settings.find((s) => s.circle_id === c.circle_id)?.status_on)
  const { data: mine } = useMyStatus(seeing.length > 0)
  const now = useMinuteNow()
  const [open, setOpen] = useState(false)
  if (!seeing.length) return null
  const names = seeing.map((c) => c.partner_name).join(' and ')
  const live = alive(mine?.now, now) ? mine!.now : null
  return (
    <>
      <button type="button" className="sh-status" onClick={() => setOpen(true)} aria-label="Your status">
        <Avatar name={seeing[0].partner_name} size={20} color={seeing[0].color} />
        <span className="sh-status-t">
          {live ? <>{names} sees <b>{live.words}</b>{live.source === 'auto' ? ' · auto' : ''}</> : `${names} sees no status · tap to set one`}
        </span>
        <Icon name="chevright" size={16} />
      </button>
      {open && <StatusSheet names={names} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Your status: "From the Now card" on or off, a word in a tap, or your own, and when it clears. Never a place. */
function StatusSheet({ names, onClose }: { names: string; onClose: () => void }) {
  const { data: mine } = useMyStatus()
  const zone = useAppZone()
  const now = useMinuteNow()
  const [clear, setClear] = useState<ClearKind>('tonight')
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState(false)
  const auto = mine?.auto ?? true
  const autoNow = mine?.now && mine.now.source === 'auto' ? mine.now.words : null
  const say = (words: string | null) => {
    setBusy(true)
    setStatusWords(words, clear).then(() => { if (words) setOwn('') }).catch(failed).finally(() => setBusy(false))
  }
  return (
    <BottomSheet onClose={onClose} title="Your status">
      {(close) => (
        <div className="sh-sheet">
          <div className="sh-sub">{names} sees it next to your name.</div>
          <div className="sh-box" style={{ marginTop: 14 }}>
            <div className="sh-row">
              <span className="sh-grow">From the Now card<small>{autoNow ? `Right now: ${autoNow}` : 'Right now: nothing to say'}</small></span>
              <Toggle on={auto} label="From the Now card" onToggle={() => void setStatusAuto(!auto).catch(failed)} />
            </div>
          </div>
          <div className="sh-lbl">Or say it yourself</div>
          <div className="sh-chips" role="group" aria-label="Words">
            {STATUS_WORDS.map((w) => (
              <Button key={w} variant="secondary" selected={alive(mine?.now, now) && mine?.now?.words === w} disabled={busy} onClick={() => say(w)}>{w}</Button>
            ))}
          </div>
          <form className="sh-own" onSubmit={(e) => { e.preventDefault(); if (own.trim()) say(own.trim()) }}>
            <input className="sh-field" value={own} maxLength={STATUS_MAX} onChange={(e) => setOwn(e.target.value)} placeholder="Write your own…" aria-label="Write your own status" />
            <Button variant="secondary" type="submit" disabled={busy || !own.trim()}>Set</Button>
          </form>
          <div className="sh-lbl">Clears</div>
          <Segmented<ClearKind> label="Clears" value={clear} onChange={setClear} options={CLEAR_KINDS.map((k) => ({ value: k, label: CLEAR_NAME[k] }))} />
          {mine?.words && mine.words_until && (
            <div className="sh-exp"><Icon name="clock" size={16} />“{mine.words}” · {clearsLine(mine.words_until, now, zone)}
              <button type="button" className="sh-link" style={{ marginLeft: 'auto' }} onClick={() => say(null)}>Clear it</button>
            </div>
          )}
          <div className="sh-exp" style={{ marginTop: 12 }}><Icon name="lock" size={16} />{STATUS_RULE}</div>
          <div className="sh-btns is-col"><Button variant="secondary" onClick={close}>Done</Button></div>
        </div>
      )}
    </BottomSheet>
  )
}

/** One strip on Today for what Reem did and is waiting for you. Gone when dismissed, or after a day (the server stops sending it). */
function NoticeStrip() {
  const { data: notices = [] } = usePartnerNotices()
  const { data: people = [] } = useConnections()
  const zone = useAppZone()
  const h24 = useHour24()
  if (!notices.length) return null
  const nameOf = (actorId: string) => people.find((c) => c.partner_id === actorId)?.partner_name ?? 'Someone'
  const rows = notices.map((n) => ({ id: n.id, actor: n.actor_id, row: { actor_name: nameOf(n.actor_id), kind: n.kind, payload: n.payload, n: n.n } satisfies ShareNoticeRow }))
  const who = [...new Set(rows.map((r) => r.row.actor_name))]
  const whoColor = people.find((c) => c.partner_name === who[0])?.color // the colour I gave them; many senders: the first's
  const line = (r: (typeof rows)[number]) => {
    const full = shareNoticeLine(r.row, zone, h24, true)
    return who.length === 1 ? full.slice(r.row.actor_name.length + 1).replace(/^./, (c) => c.toUpperCase()) : full
  }
  return (
    <section className="sh-strip" aria-label="Notices from the people you share with">
      <div className="sh-strip-h"><Avatar name={who[0]} size={22} color={whoColor} /><b>{who.length === 1 ? `From ${who[0]}` : 'From the people you share with'}</b></div>
      <div className="sh-strip-l">{rows.map((r) => <div key={r.id}>{line(r)}</div>)}</div>
      <div><Button variant="secondary" onClick={() => void dismissNotices(rows.map((r) => r.id)).catch(failed)}>Dismiss</Button></div>
    </section>
  )
}

/** Mounted once in the shell: my Focus round tells the server until when (the words "Focusing until 3:30" are made there), and
 * its end clears them. Only while I show my status to someone, and only a timed round (not the stopwatch). */
export function useShareFocus(): void {
  const { data: settings = [] } = useNoticeSettings()
  const on = settings.some((s) => s.status_on)
  const sent = useRef('')
  useEffect(() => {
    if (!on) return
    const send = () => {
      const s = useFocusStore.getState()
      const running = s.isRunning && s.mode === 'pomodoro' && s.secondsLeft > 0
      const key = running ? `${s.activeTask?.id ?? ''}|${s.currentRound}` : ''
      if (key === sent.current) return
      const wasRunning = sent.current !== ''
      sent.current = key
      if (running) sendFocus(new Date(Date.now() + s.secondsLeft * 1000), s.activeTask?.id ?? null)
      else if (wasRunning) sendFocus(null, null)
    }
    send()
    return useFocusStore.subscribe(send)
  }, [on])
}

/** Mounted once in the shell, only while I show my status to someone: when I am inside an occurrence of a repeating block (a weekly class, the
 * gym) the server is told which series and when it ends, so "In class" can be said; it lapses at the end by itself, and leaving early clears it. */
export function ShareBlockSync() {
  const { data: settings = [] } = useNoticeSettings()
  return settings.some((s) => s.status_on) ? <BlockSync /> : null
}

function BlockSync() {
  const { data: events = [] } = useCalendarEvents()
  const now = useMinuteNow()
  const sent = useRef('')
  useEffect(() => {
    const b = currentRepeating(events, now)
    const key = b ? `${b.seriesId}|${b.starts}` : ''
    if (key === sent.current) return
    const was = sent.current !== ''
    sent.current = key
    if (b) sendBlock(b)
    else if (was) sendBlock(null)
  }, [events, now])
  return null
}
