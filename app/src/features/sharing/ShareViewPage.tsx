// /v/<token> (flow 8): the page a view link opens, for someone with no account. Read-only: today and the next 7 days, at Busy or
// Titles, in the owner's clock. Asks the `share-view` function; everything on it was masked by the server (no Top 3, no tasks, no
// notes, a Private item is Busy). A stopped or run-out link is one plain page.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { SHARE_VIEW_URL, TOKEN_RE } from './links'
import './sharing.css'

interface ViewBlock { starts_at: string; ends_at: string; all_day: boolean; title?: string }
interface ViewDay { date: string; blocks: ViewBlock[] }
interface View { name: string; zone: string; level: 'busy' | 'titles'; updated_at: string; expires_at: string; days: ViewDay[] }
type State = { s: 'loading' } | { s: 'ok'; view: View } | { s: 'gone'; reason: 'revoked' | 'expired' | 'unknown' } | { s: 'error' }

const clock = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })
const dayWords = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ShareViewPage() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [i, setI] = useState(0)
  useEffect(() => {
    document.title = 'A shared day'
    if (!TOKEN_RE.test(token)) { setState({ s: 'gone', reason: 'unknown' }); return }
    let live = true
    void (async () => {
      try {
        const res = await fetch(`${SHARE_VIEW_URL}?t=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (!live) return
        if (res.ok) setState({ s: 'ok', view: body as View })
        else if (res.status === 410) setState({ s: 'gone', reason: body.reason === 'expired' ? 'expired' : 'revoked' })
        else if (res.status === 401) setState({ s: 'gone', reason: 'unknown' })
        else setState({ s: 'error' })
      } catch {
        if (live) setState({ s: 'error' })
      }
    })()
    return () => { live = false }
  }, [token])

  if (state.s === 'loading') return <main className="sv-page" aria-busy="true"><p className="sv-sub">Loading…</p></main>
  if (state.s === 'gone') {
    return (
      <main className="sv-page">
        <div className="sv-gone">
          <h1>This link is turned off</h1>
          <p>{state.reason === 'expired' ? 'It ran out. Ask for a new one.' : 'Ask for a new one.'}</p>
        </div>
      </main>
    )
  }
  if (state.s === 'error') return <main className="sv-page"><div className="sv-gone"><h1>Couldn’t load this</h1><p>Check the connection and try again.</p></div></main>

  const v = state.view
  const day = v.days[Math.min(i, v.days.length - 1)]
  return (
    <main className="sv-page">
      <h1>{v.name}’s day</h1>
      <p className="sv-sub">{dayWords(day.date)} · times in {v.zone.split('/').pop()?.replace(/_/g, ' ')}</p>
      <div className="sv-nav">
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous day">‹ Earlier</button>
        <button type="button" disabled={i >= v.days.length - 1} onClick={() => setI(i + 1)} aria-label="Next day">Later ›</button>
      </div>
      {day.blocks.length === 0 && <p className="sv-sub">Nothing planned.</p>}
      {day.blocks.map((b, n) => (
        <div key={n} className={`sv-blk${b.title ? '' : ' is-busy'}`}>
          <span className="sv-tm">{b.all_day ? 'All day' : `${clock(b.starts_at, v.zone)}–${clock(b.ends_at, v.zone)}`}</span>
          <span className="sv-t">{b.title ?? 'Busy'}</span>
        </div>
      ))}
      <div className="sv-foot">Read-only · updated {clock(v.updated_at, v.zone)}.<br />{v.name} can turn this link off at any time.</div>
    </main>
  )
}
