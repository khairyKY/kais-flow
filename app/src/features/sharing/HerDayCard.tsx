// Her day on Today (flow 5, the picked look): a full card after Top 3 - now, what is next, and at Details her Top 3 and
// today's tasks (with notes), each at the level you both allow. A pause is one quiet line. Nothing is read here but what
// `shared_day` returns: the server already left out everything the level does not show.
import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useAppZone } from '../../lib/appZone'
import { useMinuteNow } from '../today/useMinuteNow'
import { useSharedDay, useConnections, type SharedTask } from './api'
import { usePartnerStatus } from './statusApi'
import { alive } from './statusModel'
import { Avatar } from './parts'
import { LEVEL_NAME, pauseLine, type Connection } from './model'
import { leftText, nowNext, occurrences, progress, type Occurrence } from './sharedBlocks'
import { PauseChips } from './PersonSheet'
import { useSharingUi } from './ui'
import './sharing.css'

const timeOf = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }).replace(' ', ' ')

/** Whose card shows on Today: a Partner always; Family and Friend when their lane is switched on (the one "show their day" switch). */
export const showsDay = (c: Pick<Connection, 'relation' | 'show_lane'>): boolean => c.show_lane || c.relation === 'partner'

/** One card per person whose day you show (a Partner by default). */
export function HerDayCards() {
  const { data: people = [] } = useConnections()
  return <>{people.filter(showsDay).map((c) => <HerDayCard key={c.circle_id} c={c} />)}</>
}

function Block({ o, label, cd, zone }: { o: Occurrence; label?: string; cd?: string; zone: string }) {
  return (
    <div className={`sh-blk${o.title ? '' : ' is-busy'}`}>
      {label && <span className="sh-lb">{label}</span>}
      <span className="sh-tm">{timeOf(o.startsAt, zone)}</span>
      <span className="sh-t">{o.title ?? 'Busy'}</span>
      {cd && <span className="sh-cd">{cd}</span>}
    </div>
  )
}

function Tasks({ title, rows }: { title: string; rows: SharedTask[] }) {
  if (!rows.length) return null
  return (
    <div className="sh-sec">
      <div className="sh-sec-l">{title}</div>
      {rows.map((t) => (
        <div key={t.id} className={`sh-task${t.done ? ' is-done' : ''}`}>
          <span className="sh-mk" aria-hidden="true">{t.done ? '✓' : ''}</span>
          <span className="sh-tt">{t.goal && <span className="sh-star">✶ </span>}{t.title}{t.notes ? <span className="sh-notes">{t.notes}</span> : null}</span>
        </div>
      ))}
    </div>
  )
}

export function HerDayCard({ c }: { c: Connection }) {
  const zone = useAppZone()
  const now = useMinuteNow()
  const ui = useSharingUi()
  const [menu, setMenu] = useState(false)
  const from = useMemo(() => new Date(now.getTime() - 12 * 3_600_000), [Math.floor(now.getTime() / 900_000)]) // eslint-disable-line react-hooks/exhaustive-deps -- a quarter hour is as fresh as the card needs
  const to = useMemo(() => new Date(now.getTime() + 36 * 3_600_000), [from]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useSharedDay(c.partner_id, from, to)
  const { data: status } = usePartnerStatus(c.partner_id, data?.level === 'details')

  if (c.paused_until) {
    return (
      <section className="sh-day" aria-label={`${c.partner_name}'s day`}>
        <div className="sh-day-h"><span>{c.partner_name}’s day</span></div>
        <div className="sh-paused">
          <Avatar name={c.partner_name} size={32} dim />
          <div style={{ flex: 1, minWidth: 0 }}><b>{c.partner_name}</b> · paused<div style={{ fontSize: 'var(--fs-meta-l)' }}>{pauseLine(c.paused_until, now, zone)}</div></div>
          <button type="button" className="sh-link" onClick={() => ui.openPerson(c.circle_id)}>Open</button>
        </div>
      </section>
    )
  }
  if (!data?.level) return null

  const occ = occurrences(data, from, to)
  const ownerZone = data.zone ?? zone
  const { now: running, next } = nowNext(occ, now, ownerZone)
  const top = data.top3 ?? []
  const doneN = top.filter((t) => t.done).length

  return (
    <section className="sh-day" aria-label={`${c.partner_name}'s day`}>
      <div className="sh-day-h">
        <span>{c.partner_name}’s day<span className="sh-note"> · {LEVEL_NAME[data.level]}</span></span>
        <button type="button" className="sh-link" onClick={() => ui.openPerson(c.circle_id)}>Sharing</button>
      </div>
      <div className="sh-card">
        <div className="sh-card-h">
          <Avatar name={c.partner_name} size={28} />{c.partner_name}{alive(status, now) && <span className="sh-stt">· {status.words}</span>}
          <button type="button" className="sh-menu" aria-label={`Pause sharing with ${c.partner_name}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="dots" size={18} /></button>
        </div>
        {menu && (
          <div className="sh-sec" style={{ borderTop: 0, marginTop: 4 }}>
            <div className="sh-sec-l">Pause sharing with {c.partner_name}</div>
            <PauseChips c={c} onDone={() => setMenu(false)} />
          </div>
        )}
        {running && (
          <>
            <Block o={running} label="Now" cd={leftText(running, now)} zone={zone} />
            <div className="sh-bar" aria-hidden="true"><i style={{ width: `${progress(running, now)}%` }} /></div>
          </>
        )}
        {next.map((o) => <Block key={o.id} o={o} zone={zone} label={!running && o === next[0] ? 'Next' : undefined} />)}
        {!running && !next.length && <div className="sh-sec-l" style={{ marginTop: 8 }}>Nothing else today</div>}
        {data.level === 'details' && (
          <>
            <Tasks title={`${c.partner_name}’s Top 3 · ${doneN} of ${top.length} done`} rows={top} />
            <Tasks title="Today’s tasks" rows={data.tasks ?? []} />
          </>
        )}
      </div>
    </section>
  )
}
