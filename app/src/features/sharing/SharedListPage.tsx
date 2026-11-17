// A shared list (flow 3, Sharing looks 7): one project both people edit and tick. The page shows what the picked design shows -
// "Shared with Reem · either of you adds and ticks", an add field, To buy, Got - and the face of whoever added or ticked an item.
// The server decides who may write (membership of the live connection, migration 0102); this page is an ordinary project's rows.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { BackLink, Button, Checkbox } from '../../components/kit'
import { useAppZone } from '../../lib/appZone'
import { useToastStore } from '../../lib/toastStore'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { useMinuteNow } from '../today/useMinuteNow'
import type { Project, Task } from '../../lib/types'
import { useConnections } from './api'
import { faceOf, isTheirs, leftLine, listConnection, listItems, sharedLine, splitItems, stopCopy, tickWhen } from './lists'
import { addListItem, stopSharing, tickItem } from './listsApi'
import { Avatar } from './parts'
import './sharing.css'

/** Plain ids to a face and a name; the other person's name comes from the connection. */
function useFaces(project: Project) {
  const uid = useAuth().session?.user.id
  const { data: people = [] } = useConnections()
  const c = listConnection(project, people)
  return { uid, c, partner: c ? { partner_id: c.partner_id, partner_name: c.partner_name } : null }
}

function Row({ t, project }: { t: Task; project: Project }) {
  const openTask = useOpenTask()
  const zone = useAppZone()
  const now = useMinuteNow()
  const { uid, partner } = useFaces(project)
  const done = t.status === 'done'
  const who = faceOf(done ? t.done_by : t.added_by, uid, partner)
  return (
    <div id={`task-${t.id}`} className={`sl-row${done ? ' is-done' : ''}`}>
      <Checkbox checked={done} onChange={() => tickItem(t, uid)} label={done ? `Reopen ${t.title}` : `Tick ${t.title}`} />
      <button type="button" className="sl-title" onClick={(e) => openTask(t.id, undefined, e.currentTarget.closest('.sl-row'))}>{t.title}</button>
      <span className="sl-by" title={done ? `Ticked by ${who.name}` : `Added by ${who.name}`}>
        <Avatar name={who.name} her={!who.mine} size={22} />
        {done && <span className="sl-when">{tickWhen(t.completed_at, now, zone)}</span>}
      </span>
    </div>
  )
}

export function SharedListPage({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { uid, c } = useFaces(project)
  const { data: tasks = [] } = useTasks()
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState(false)
  const theirs = isTheirs(project, uid)
  const name = c?.partner_name ?? 'them'
  const { toBuy, got } = splitItems(listItems(tasks, project.id))
  const add = () => {
    if (addListItem(project, draft)) setDraft('')
  }
  return (
    <main className="sl-page">
      <div className="sl-top">
        <BackLink to="/projects">Projects</BackLink>
        <button type="button" className="sl-more" aria-label="List menu" onClick={() => setMenu(true)}><Icon name="dots" size={20} /></button>
      </div>
      <h1 className="sl-h1">{project.name}</h1>
      <div className="sl-line">{c && <Avatar name={name} size={22} />}{sharedLine(name)}</div>

      <form className="sl-add" onSubmit={(e) => { e.preventDefault(); add() }}>
        <Icon name="plus" size={18} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an item…" aria-label="Add an item" enterKeyHint="done" />
      </form>

      <h2 className="sl-sec">To buy<span> · {toBuy.length}</span></h2>
      <div className="sl-rows">
        {toBuy.map((t) => <Row key={t.id} t={t} project={project} />)}
        {!toBuy.length && <div className="sl-empty">{got.length ? 'Everything is got.' : 'Nothing here yet. Add the first item.'}</div>}
      </div>
      {got.length > 0 && (
        <>
          <h2 className="sl-sec">Got<span> · {got.length}</span></h2>
          <div className="sl-rows">{got.map((t) => <Row key={t.id} t={t} project={project} />)}</div>
        </>
      )}

      {menu && (
        <BottomSheet onClose={() => setMenu(false)} title={project.name}>
          {(close) => (
            <div className="sh-sheet">
              <div className="sh-sub">Shared with {name}</div>
              <div className="sh-box">
                <button type="button" className="sh-danger" onClick={() => { close(); setAsking(true) }}>{theirs ? 'Leave this list' : 'Stop sharing'}</button>
              </div>
              <div className="sh-cap" style={{ marginLeft: 4 }}>Asks what happens to the list first.</div>
            </div>
          )}
        </BottomSheet>
      )}
      {asking && <StopSheet project={project} name={name} theirs={theirs} onClose={() => setAsking(false)} onDone={() => navigate('/projects')} />}
    </main>
  )
}

/** Each keeps a copy (picked 3b): said before it happens, one tap to go ahead. */
function StopSheet({ project, name, theirs, onClose, onDone }: { project: Project; name: string; theirs: boolean; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const copy = stopCopy(theirs, name, project.name)
  return (
    <BottomSheet onClose={onClose} title={copy.title}>
      {(close) => (
        <div className="sh-sheet">
          <div className="sh-sub">{copy.body}</div>
          {err && <div className="sh-err" role="alert">That didn’t go through. Check the connection and try again.</div>}
          <div className="sh-btns is-col">
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true)
                stopSharing(project).then(() => {
                  useToastStore.getState().push({ message: copy.done })
                  onDone()
                }).catch(() => { setErr(true); setBusy(false) })
              }}
            >
              {copy.action}
            </Button>
            <Button variant="secondary" onClick={close}>Keep sharing</Button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

/** The list's line on the Projects page: its name, the pair's face, what is left to get. */
export function SharedListRow({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { c } = useFaces(project)
  const { data: tasks = [] } = useTasks()
  return (
    <button type="button" className="sl-prow" onClick={() => navigate(`/projects/${project.id}`)}>
      <Icon name="projects" size={18} />
      <span className="sl-pt">{project.name}</span>
      {c && <Avatar name={c.partner_name} size={20} />}
      <span className="sl-pm">{leftLine(listItems(tasks, project.id))}</span>
    </button>
  )
}

/** "Shared with Reem" on the Projects page: each list I share or that is shared with me, before "Yours". */
export function SharedListsGroup({ projects }: { projects: Project[] }) {
  const { data: people = [] } = useConnections()
  if (!projects.length) return null
  const names = [...new Set(projects.map((p) => listConnection(p, people)?.partner_name).filter(Boolean))]
  return (
    <section className="sl-group" aria-label="Shared lists">
      <h2 className="sl-sec">Shared with {names.length ? names.join(' and ') : 'someone'}<span> · {projects.length}</span></h2>
      <div className="sl-rows">{projects.map((p) => <SharedListRow key={p.id} project={p} />)}</div>
    </section>
  )
}
