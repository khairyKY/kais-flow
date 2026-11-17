// Connect, the sending half (flow 1): a code, already there, with Partner already picked. 8 tiles, one use, 24 hours.
// Copy and Share… send the message: who invited, the code, a tap-to-open link, and where to type it.
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { Button, Segmented } from '../../components/kit'
import { appZone } from '../../lib/appZone'
import { authLinkOrigin } from '../../lib/platform'
import { useAppSettings } from '../../lib/settings'
import { cancelInvite, createInvite, type Invite } from './api'
import { CodeTiles, copyText, shareText } from './parts'
import { RELATIONS, RELATION_NAME, defaultLevel, inviteMessage, LEVEL_NAME, webInvite, type Relation } from './model'

const expiryText = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: appZone() })

export function InviteSheet({ onClose }: { onClose: () => void }) {
  const name = useAppSettings().data?.display_name?.trim() || 'Someone'
  const [relation, setRelation] = useState<Relation>('partner')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const last = useRef<Invite | null>(null)

  // The code exists as soon as the sheet opens (no Generate button); a new relation is a new code, the old one cancelled.
  useEffect(() => {
    let live = true
    setInvite(null)
    setErr(null)
    const old = last.current
    void (async () => {
      try {
        if (old) await cancelInvite(old.id).catch(() => undefined)
        const made = await createInvite(relation)
        last.current = made
        if (live) setInvite(made)
      } catch {
        if (live) setErr('Couldn’t make a code. Check the connection and try again.')
      }
    })()
    return () => { live = false }
  }, [relation])

  const link = invite ? webInvite(invite.code, authLinkOrigin()) : ''
  const message = invite ? inviteMessage(name, invite.code, link, expiryText(invite.expires_at)) : ''
  return (
    <BottomSheet onClose={onClose} title="Invite someone">
      {() => (
        <div className="sh-sheet">
          <div className="sh-sub">They type this code in their Kai’s Flow, or tap the link.</div>
          <div className="sh-lbl">Who are they to you?</div>
          <Segmented<Relation> label="Relationship" value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, label: RELATION_NAME[r] }))} />
          <div className="sh-cap">{RELATION_NAME[relation]} starts at {LEVEL_NAME[defaultLevel(relation)]}. Either of you can change it later.</div>
          <div className="sh-lbl">The code</div>
          <CodeTiles code={invite?.code ?? ''} />
          <div className="sh-exp"><Icon name="clock" size={16} />{invite ? `Works once, for 24 hours · until ${expiryText(invite.expires_at)}` : 'Making your code…'}</div>
          {err && <div className="sh-err" role="alert">{err}</div>}
          <div className="sh-btns">
            <Button variant="secondary" icon={<Icon name="clipboard" size={18} />} disabled={!invite} onClick={() => void copyText(message, 'Invite copied')}>Copy</Button>
            <Button icon={<Icon name="send" size={18} />} disabled={!invite} onClick={() => void shareText(message)}>Share…</Button>
          </div>
          {invite && (
            <div className="sh-msg"><b>Share sends:</b>{message}</div>
          )}
          <div className="sh-cap">Nothing is shared until they accept, and you both see a confirm screen first.</div>
        </div>
      )}
    </BottomSheet>
  )
}
