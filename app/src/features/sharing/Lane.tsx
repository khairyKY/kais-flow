// Her calendar on yours (flow 5, the picked look): a thin lane in the colour you gave her (Heather until you pick) beside your blocks - dashed, hatched where it is only Busy -
// on the desktop's week and day and on the phone. An avatar chip in the calendar's header turns it on and off; its menu pauses
// sharing or opens the person's page. The chip is your "Show her lane on my calendar" switch (on by default for a Partner, off for Family and
// Friend); her card on Today has its own.
import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import { useAppZone } from '../../lib/appZone'
import { supabase } from '../../lib/supabase'
import { useToastStore } from '../../lib/toastStore'
import { SHARED_DAY_KEY, setLane, setPause, useConnections, type SharedDay } from './api'
import { useMinuteNow } from '../today/useMinuteNow'
import { Avatar } from './parts'
import { usePartnerStatus } from './statusApi'
import { alive } from './statusModel'
import { occurrences } from './sharedBlocks'
import { useSharingUi } from './ui'
import { PAUSE_NAME, pauseLine, pausedSaid, pauseUntil, type Connection } from './model'
import './sharing.css'

export interface LaneBlock {
  id: string
  partnerId: string
  name: string
  /** 0 for the first person on, 1 for the next: lanes sit side by side. */
  lane: number
  starts_at: string
  ends_at: string
  all_day: boolean
  /** null = a Busy block. */
  title: string | null
  /** The colour I gave this person (one of palette C's 16). */
  color: string
}

const SAME = new Map<string, LaneBlock[]>() // keeps the array while nothing changed: a grid redraws on a new one

/** The lane blocks for everyone whose lane is on, over [range.start, range.end): the server's masked answer, repeats expanded on their clock. */
export function useLanes(range: { start: Date; end: Date } | undefined, key = 'grid'): LaneBlock[] {
  const { data: people = [] } = useConnections()
  const lanes = people.filter((c) => c.show_lane && !c.paused_until)
  const f = range?.start.toISOString(), t = range?.end.toISOString()
  const results = useQueries({
    queries: lanes.map((c) => ({
      queryKey: [SHARED_DAY_KEY, c.partner_id, f, t],
      enabled: !!range,
      staleTime: 20_000,
      queryFn: async (): Promise<SharedDay> => {
        const { data, error } = await supabase.rpc('shared_day', { p_owner: c.partner_id, p_from: f, p_to: t })
        if (error) throw error
        return data as SharedDay
      },
    })),
  })
  const stamp = results.map((r) => r.dataUpdatedAt).join()
  return useMemo(() => {
    if (!range) return []
    const out: LaneBlock[] = []
    lanes.forEach((c, i) => {
      const d = results[i]?.data
      if (!d?.level) return
      for (const o of occurrences(d, range.start, range.end)) out.push({ id: `${c.circle_id}:${o.id}:${o.startsAt}`, partnerId: c.partner_id, name: c.partner_name, lane: i, starts_at: o.startsAt, ends_at: o.endsAt, all_day: o.allDay, title: o.title, color: c.color })
    })
    const sig = JSON.stringify(out)
    const prev = SAME.get(key)
    if (prev && JSON.stringify(prev) === sig) return prev
    SAME.set(key, out)
    return out
  }, [stamp, range?.start.getTime(), range?.end.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps -- the stamp stands for the results
}

/** "Reem · Histology lab · 12:30 PM–2:00 PM" - what a tap on the lane says. */
export function laneSays(b: Pick<LaneBlock, 'name' | 'title' | 'starts_at' | 'ends_at'>, zone: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })
  return `${b.name} · ${b.title ?? 'Busy'} · ${t(b.starts_at)}–${t(b.ends_at)}`
}

/** A tap on a lane block: its title and time, in your clock. */
export function useLaneTap() {
  const zone = useAppZone()
  return (b: Pick<LaneBlock, 'name' | 'title' | 'starts_at' | 'ends_at'>) => useToastStore.getState().push({ message: laneSays(b, zone) })
}

/** One chip per person you share with: a tap turns their lane on or off; the chevron (or a right-click, a long press) opens the lane's menu.
 * `compact` (the phone's header): the avatar alone. */
export function LaneChips({ compact = false }: { compact?: boolean }) {
  const { data: people = [] } = useConnections()
  const ui = useSharingUi()
  const zone = useAppZone()
  const [menu, setMenu] = useState<{ c: Connection; x: number; y: number } | null>(null)
  if (!people.length) return null
  const fail = () => useToastStore.getState().push({ message: 'That didn’t save. Check the connection and try again.' })
  return (
    <>
      <span className="sh-chips-bar" role="group" aria-label="People on this calendar">
        {people.map((c) => (
          <span key={c.circle_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              className={`sh-chip${compact ? ' is-compact' : ''}`}
              aria-pressed={c.show_lane}
              aria-label={`${c.show_lane ? 'Hide' : 'Show'} ${c.partner_name}’s lane on my calendar`}
              title={c.paused_until ? `${c.partner_name} · paused · ${pauseLine(c.paused_until, new Date(), zone)}` : undefined}
              onClick={() => void setLane(c, !c.show_lane).catch(fail)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ c, x: e.clientX, y: e.clientY }) }}
            >
              <Avatar name={c.partner_name} size={28} color={c.color} />
              {!compact && c.partner_name}
              {!compact && <ChipStatus c={c} />}
            </button>
            {!compact && <button
              type="button"
              className="sh-chip"
              style={{ padding: 0, width: 32, justifyContent: 'center' }}
              aria-label={`More for ${c.partner_name}`}
              aria-haspopup="menu"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ c, x: r.left, y: r.bottom + 4 }) }}
            >
              <Icon name="chevdown" size={16} />
            </button>}
          </span>
        ))}
      </span>
      {menu && (
        <ContextMenu
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          label={`${menu.c.partner_name}’s lane`}
          items={[
            { label: menu.c.show_lane ? `Hide ${menu.c.partner_name}’s lane` : `Show ${menu.c.partner_name}’s lane`, onClick: () => void setLane(menu.c, !menu.c.show_lane).catch(fail) },
            ...(menu.c.paused_until
              ? [{ label: 'Resume sharing', onClick: () => void setPause(menu.c, null).catch(fail) }]
              : [
                  { label: PAUSE_NAME.forever, onClick: () => void setPause(menu.c, pauseUntil('forever', new Date())).then(() => useToastStore.getState().push({ message: pausedSaid('infinity', new Date(), zone) })).catch(fail) },
                  { label: PAUSE_NAME.hour, onClick: () => void setPause(menu.c, pauseUntil('hour', new Date())).then(() => useToastStore.getState().push({ message: pausedSaid(pauseUntil('hour', new Date()), new Date(), zone) })).catch(fail) },
                ]),
            { label: 'Sharing settings', onClick: () => ui.openPerson(menu.c.circle_id) },
          ]}
        />
      )}
    </>
  )
}

/** Her status next to her name on the lane's chip (Details only: the server answers null for anything less). */
function ChipStatus({ c }: { c: Connection }) {
  const now = useMinuteNow()
  const { data } = usePartnerStatus(c.partner_id, c.level === 'details' && !c.paused_until)
  return alive(data, now) ? <span className="sh-stt">· {data.words}</span> : null
}
