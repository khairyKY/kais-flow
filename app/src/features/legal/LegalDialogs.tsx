import { useId, useState, type ReactNode } from 'react'
import { Float } from '../../components/Float'
import { Button } from '../../components/kit'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { useSignOut } from '../auth/useSignOut'
import { agreeToCurrent, deleteAccount, useOutdated } from './api'
import { LegalLink, PRIVACY_URL, TERMS_URL } from './LegalLinks'
import { LEGAL_SUMMARY, type LegalDoc } from '../../../../supabase/functions/_shared/legal.ts'
import './legal.css'

// docs/LEGAL.md — the "We've updated our terms" notice and Delete account. Both are cards over the page:
// the notice can't be closed without an answer (agree, or one of the ways out); Delete account asks for
// the word DELETE and offers the export first.

const toast = (message: string) => useToastStore.getState().push({ message })

function Sheet({ labelledBy, onScrim, children }: { labelledBy: string; onScrim?: () => void; children: ReactNode }) {
  return (
    <Float>
      <div className="lg-scrim kf-overlay-scrim" onClick={onScrim}>
        <div className="lg-card kf-overlay-card" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </Float>
  )
}

/** Everything as one .json (Settings → Your data → Export your data's first button). Loaded when asked:
 * the notice lives in the app shell. */
async function exportAll(): Promise<void> {
  try {
    const { runExport } = await import('../export/api')
    const { name, result } = await runExport('json')
    if (result !== 'cancelled') toast(`${result === 'shared' ? 'Shared' : 'Saved'} ${name}`)
  } catch (e) {
    toast(`Couldn’t export: ${(e as { message?: string } | null)?.message ?? String(e)}`)
  }
}

// ds-ok: deleting an account is the one delete that can't be Trash + Undo — it asks, by typing
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEscapeStack(true, () => {
    if (!busy) onClose()
  })
  const ready = typed.trim().toUpperCase() === 'DELETE'

  async function remove() {
    setBusy('delete')
    setProblem(null)
    try {
      await deleteAccount()
      toast('Your account and everything in it are deleted.')
    } catch {
      setProblem(navigator.onLine ? 'That didn’t go through — try again in a minute.' : 'No connection — try again when you’re online.')
      setBusy(null)
    }
  }

  return (
    <Sheet labelledBy={titleId} onScrim={busy ? undefined : onClose}>
      <h2 className="lg-title" id={titleId}>
        Delete your account?
      </h2>
      <p className="lg-body">
        This deletes your account and everything in it — tasks, calendar, journal, people, photos — for good, on every device. It can’t be undone. Export a copy first if you want to keep any of it.
      </p>
      <div className="lg-actions" style={{ justifyContent: 'flex-start' }}>
        <Button
          variant="secondary"
          loading={busy === 'export'}
          disabled={busy !== null}
          onClick={() => {
            setBusy('export')
            void exportAll().finally(() => setBusy(null))
          }}
        >
          Export everything first (.json)
        </Button>
      </div>
      <label className="lg-label">
        Type DELETE to confirm
        <input className="lg-field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy === 'delete'} />
      </label>
      {problem && (
        <p className="lg-error" role="alert">
          {problem}
        </p>
      )}
      <div className="lg-actions">
        <Button variant="secondary" disabled={busy === 'delete'} onClick={onClose}>
          Keep my account
        </Button>
        <Button disabled={!ready || busy === 'export'} loading={busy === 'delete'} onClick={() => void remove()}>
          Delete account
        </Button>
      </div>
    </Sheet>
  )
}

const NAMES: Record<LegalDoc, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy' }

/** Shown once a signed-in person's latest agreement is older than the current version (or there is none —
 * accounts from before 0083). Never while that isn't known: offline with nothing cached, it waits. */
export function TermsNoticeHost() {
  const docs = useOutdated()
  const titleId = useId()
  const [deleting, setDeleting] = useState(false)
  const signOutFlow = useSignOut()
  // Esc doesn't close it (nor whatever is under it): it waits for an answer.
  useEscapeStack(!!docs?.length && !deleting, () => undefined)
  if (!docs?.length) return null
  const what = docs.map((d) => NAMES[d]).join(' and ')
  return (
    <>
      <Sheet labelledBy={titleId}>
        <h2 className="lg-title" id={titleId}>
          We’ve updated our {what}
        </h2>
        <p className="lg-body">What changed:</p>
        <ul className="lg-list">
          {LEGAL_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="lg-links">
          <LegalLink href={TERMS_URL}>Read the Terms of Use</LegalLink>
          <LegalLink href={PRIVACY_URL}>Read the Privacy Policy</LegalLink>
        </div>
        <div className="lg-actions">
          {/* ds-ok: the one answer that closes it, so it's the one focused */}
          <Button autoFocus onClick={() => agreeToCurrent(docs)}>
            I agree
          </Button>
        </div>
        <div className="lg-out">
          <button type="button" onClick={() => void exportAll()}>
            Export my data
          </button>
          <button type="button" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
          <button type="button" onClick={signOutFlow.request}>
            Sign out
          </button>
        </div>
      </Sheet>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
      {signOutFlow.prompt}
    </>
  )
}
