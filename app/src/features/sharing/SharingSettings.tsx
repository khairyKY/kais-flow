// Settings › Sharing (flows 1, 3, 8): the people you share with, the codes waiting for an answer, and the view links for
// someone who won't make an account. Never shared, said at the foot: journal, health, people, AI chat.
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button, Segmented } from '../../components/kit'
import { appZone } from '../../lib/appZone'
import { cancelInvite, useConnections, useInvites } from './api'
import { createShareLink, expiryWords, renewShareLink, stopShareLink, useShareLinks, type LinkLevel } from './links'
import { Avatar, NeverShared, copyText, shareText } from './parts'
import { LEVEL_NAME, RELATION_NAME, formatCode, pauseLine } from './model'
import { useSharingUi } from './ui'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: appZone() })

/** Section chrome: Settings' own classes, so it sits like the other cards. */
function Sec({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="st-sec">
      <header className="st-sec-head">
        <h3 className="st-title">{title}</h3>
        {sub && <p className="st-sub">{sub}</p>}
      </header>
      <div className="st-panel">{children}</div>
    </section>
  )
}

export function SharingSettings() {
  const ui = useSharingUi()
  const { data: people = [], isError } = useConnections()
  const { data: invites = [] } = useInvites()
  return (
    <>
      <Sec title="People you share with" sub="Share your day with someone you trust. They need their own Kai’s Flow. Either of you can stop at any time.">
        {people.map((c) => (
          <button key={c.circle_id} type="button" className="sh-person" onClick={() => ui.openPerson(c.circle_id)}>
            <Avatar name={c.partner_name} size={40} />
            <span className="sh-pb">
              <span className="sh-p1" style={{ display: 'block' }}>{c.partner_name}</span>
              <span className="sh-p2">
                {RELATION_NAME[c.relation]} · {c.paused_until ? pauseLine(c.paused_until, new Date(), appZone()) : c.my_level === c.their_level ? `${LEVEL_NAME[c.level]} both ways` : `${LEVEL_NAME[c.level]} (you show ${LEVEL_NAME[c.my_level]}, they show ${LEVEL_NAME[c.their_level]})`}
              </span>
            </span>
            <Icon name="chevright" size={16} />
          </button>
        ))}
        {!people.length && <div className="st-help">{isError ? 'Couldn’t load your connections. Check the connection.' : 'Nobody yet.'}</div>}
        {invites.map((i) => (
          <div key={i.id} className="sh-person" style={{ cursor: 'default' }}>
            <Avatar name="?" her dim size={40} />
            <span className="sh-pb">
              <span className="sh-p1" style={{ display: 'block' }}>Invite sent <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>· {RELATION_NAME[i.relation]}</span></span>
              <span className="sh-p2">Code {formatCode(i.code)} · until {new Date(i.expires_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: appZone() })}</span>
            </span>
            <Button variant="ghost" onClick={() => void cancelInvite(i.id)}>Cancel</Button>
          </div>
        ))}
        <div className="st-btns" style={{ display: 'flex', gap: 10, padding: 12, flexWrap: 'wrap' }}>
          <Button icon={<Icon name="plus" size={18} />} onClick={ui.openInvite}>Invite someone</Button>
          <Button variant="secondary" onClick={() => ui.openEnter()}>Enter a code</Button>
        </div>
        <NeverShared />
      </Sec>
      <ViewLinks />
    </>
  )
}

/** Flow 8: a link for someone with no account. Busy or Titles; Details is never offered; 30 days; Stop works at once. */
function ViewLinks() {
  const { data: links = [] } = useShareLinks()
  const [level, setLevel] = useState<LinkLevel>('busy')
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try { await fn() } catch { setErr('That didn’t save. Check the connection and try again.') } finally { setBusy(false) }
  }
  return (
    <Sec title="View links" sub="For someone without Kai’s Flow. A read-only page of today and the next 7 days. Anyone with the link sees it, so stop one you no longer use.">
      {links.map((l) => (
        <div key={l.id} className="sh-person" style={{ cursor: 'default' }}>
          <Icon name="link" size={22} />
          <span className="sh-pb">
            <span className="sh-p1" style={{ display: 'block' }}>{LEVEL_NAME[l.level]} <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>· made {day(l.created_at)}</span></span>
            <span className="sh-p2">{expiryWords(l.expires_at)} · {l.last_used_at ? `last opened ${day(l.last_used_at)}` : 'not opened yet'}</span>
          </span>
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => renewShareLink(l.id))}>Renew</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => stopShareLink(l.id))}>Stop sharing</Button>
        </div>
      ))}
      {!links.length && !shown && <div className="st-help">No view links yet</div>}
      {shown && (
        <div style={{ padding: '0 12px' }}>
          <div className="sh-cap">Your link. Copy it now, it won’t be shown again:</div>
          <div className="st-mono-box" dir="ltr" style={{ color: 'var(--ink-body)', wordBreak: 'break-all' }}>{shown}</div>
          <div className="sh-btns">
            <Button variant="secondary" icon={<Icon name="clipboard" size={18} />} onClick={() => void copyText(shown, 'Link copied')}>Copy</Button>
            <Button icon={<Icon name="send" size={18} />} onClick={() => void shareText(`Here is my day: ${shown}`)}>Share…</Button>
          </div>
        </div>
      )}
      <div style={{ padding: 12 }}>
        <div className="sh-lbl" style={{ marginTop: 0 }}>What they see</div>
        <Segmented<LinkLevel> label="What the link shows" value={level} onChange={setLevel} options={[{ value: 'busy', label: 'Busy only' }, { value: 'titles', label: 'Titles' }]} />
        <div className="sh-cap">Details isn’t offered on a link. Your Top 3, tasks and notes never go out. A Private item is a Busy block.</div>
        <div className="sh-btns">
          <Button loading={busy} onClick={() => void run(async () => setShown(await createShareLink(level)))}>Make a view link</Button>
        </div>
        {err && <div className="sh-err" role="alert">{err}</div>}
      </div>
    </Sec>
  )
}

