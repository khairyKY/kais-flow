// One person's page (flows 3, 6, 7): the relationship, what they see of you (the level list with previews), the
// "you see what you show" rule at work, Pause, "Show on my calendar", and Disconnect behind a confirm sheet.
import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { Button, Segmented, Toggle } from '../../components/kit'
import { useAppZone } from '../../lib/appZone'
import { useToastStore } from '../../lib/toastStore'
import { useAuth } from '../auth/AuthProvider'
import { leaveCircle, setLane, setMyLevel, setPause, setRelation, useConnections } from './api'
import { Avatar, LevelList, NeverShared } from './parts'
import { LEVEL_NAME, PAUSE_NAME, RELATIONS, RELATION_NAME, limitedBy, pauseLine, pauseUntil, ruleNow, type Connection, type PauseKind, type Relation } from './model'

function saveFailed(msg: string) {
  return (e: unknown) => {
    void e
    useToastStore.getState().push({ message: msg })
  }
}

export function PersonSheet({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const { data } = useConnections()
  const c = data?.find((x) => x.circle_id === circleId)
  const uid = useAuth().session?.user.id ?? ''
  const zone = useAppZone()
  const [leaving, setLeaving] = useState(false)
  const failed = saveFailed('That didn’t save. Check the connection and try again.')
  if (!c) {
    // Gone (they disconnected, or this device just did): nothing to show.
    return (
      <BottomSheet onClose={onClose} title="Not connected">
        {() => <div className="sh-sheet"><div className="sh-sub">This connection has ended. Nothing is kept.</div></div>}
      </BottomSheet>
    )
  }
  const rule = ruleNow(c)
  const limit = limitedBy(c)
  const paused = !!c.paused_until

  if (leaving) return <LeaveSheet c={c} onClose={() => setLeaving(false)} onDone={onClose} />

  return (
    <BottomSheet onClose={onClose} detent="full" title={c.partner_name}>
      {() => (
        <div className="sh-sheet">
          <div className="sh-head">
            <Avatar name={c.partner_name} size={56} />
            <div>
              <div className="sh-name">{c.partner_name}</div>
              <div className="sh-since">{RELATION_NAME[c.relation]} · connected {new Date(c.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: zone })}</div>
            </div>
          </div>

          {paused && (
            <div className="sh-banner" role="status">
              <Icon name="stop" size={18} />
              <div className="sh-bt"><b>Paused</b><span>{pauseLine(c.paused_until!, new Date(), zone)}. {c.paused_by_me ? `${c.partner_name} sees nothing new, and you don’t see ${c.partner_name} either.` : `${c.partner_name} paused it. You don’t see each other until then.`}</span></div>
              <Button variant="secondary" onClick={() => void setPause(c, null).catch(failed)}>Resume</Button>
            </div>
          )}
          {!paused && limit === 'them' && (
            <div className="sh-banner" role="status">
              <Icon name="eye" size={18} />
              <div className="sh-bt"><b>{c.partner_name} shows {LEVEL_NAME[c.their_level]}</b><span>So you both see {LEVEL_NAME[c.level]}. You can still show more.</span></div>
            </div>
          )}

          <div className="sh-lbl">Relationship</div>
          <Segmented<Relation> label="Relationship" value={c.relation} onChange={(r) => void setRelation(c, r).catch(failed)} options={RELATIONS.map((r) => ({ value: r, label: RELATION_NAME[r] }))} />

          <div className="sh-lbl">What {c.partner_name} sees of you</div>
          <LevelList label={`What ${c.partner_name} sees of you`} value={c.my_level} onPick={(l) => l !== c.my_level && setMyLevel(c, l, uid)} />
          <div className="sh-rule">
            <Icon name="eye" size={18} />
            <div><b>You see what you show:</b> you both get the lower of your two levels.<div className="sh-now">{rule.show} → <b>{rule.sees}</b></div></div>
          </div>

          <div className="sh-box">
            <div className="sh-row is-col">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Icon name="stop" size={20} /><span>Pause sharing</span></div>
              <PauseChips c={c} />
              <div className="sh-cap" style={{ margin: 0 }}>While paused, neither of you sees the other.</div>
            </div>
            <div className="sh-row">
              <Icon name="calendar" size={20} />
              <span className="sh-grow">Show on my calendar</span>
              <Toggle on={c.show_lane} label={`Show ${c.partner_name} on my calendar`} onToggle={() => void setLane(c, !c.show_lane).catch(failed)} />
            </div>
          </div>
          <div className="sh-box"><NeverShared /></div>
          <div className="sh-box"><button type="button" className="sh-danger" onClick={() => setLeaving(true)}>Disconnect from {c.partner_name}</button></div>
          <div className="sh-cap" style={{ marginLeft: 4 }}>Either of you can, at any time. Nothing is kept.</div>
        </div>
      )}
    </BottomSheet>
  )
}

/** The three pause chips: an hour, today, until turned back on. Used here and from the lane's menu and her card. */
export function PauseChips({ c, onDone }: { c: Connection; onDone?: () => void }) {
  const zone = useAppZone()
  const failed = saveFailed('That didn’t save. Check the connection and try again.')
  return (
    <div className="sh-chips" role="group" aria-label="Pause sharing">
      {(['hour', 'today', 'forever'] as const).map((k: PauseKind) => (
        <Button
          key={k}
          variant="secondary"
          selected={!!c.paused_until && ((k === 'forever') === (c.paused_until === 'infinity'))}
          onClick={() => {
            void setPause(c, pauseUntil(k, new Date(), zone)).then(() => {
              useToastStore.getState().push({ message: `Paused. ${pauseLine(pauseUntil(k, new Date(), zone), new Date(), zone)}.` })
              onDone?.()
            }).catch(failed)
          }}
        >
          {PAUSE_NAME[k]}
        </Button>
      ))}
    </div>
  )
}

/** Disconnect asks once, in plain words: it is instant for both of you and nothing is kept. */
function LeaveSheet({ c, onClose, onDone }: { c: Connection; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  return (
    <BottomSheet onClose={onClose} title={`Disconnect from ${c.partner_name}?`}>
      {(close) => (
        <div className="sh-sheet">
          <div className="sh-sub">You both stop seeing each other’s days at once. Nothing is kept. To share again, one of you makes a new code.</div>
          {err && <div className="sh-err" role="alert">That didn’t go through. Check the connection and try again.</div>}
          <div className="sh-btns is-col">
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true)
                leaveCircle(c).then(() => {
                  useToastStore.getState().push({ message: `Disconnected from ${c.partner_name}. Nothing is kept.` })
                  onDone()
                }).catch(() => { setErr(true); setBusy(false) })
              }}
            >
              Disconnect
            </Button>
            <Button variant="secondary" onClick={close}>Keep sharing</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
