import { useState } from 'react'
import { signOut } from './AuthProvider'
import { unsyncedSignOutCopy } from './signOutCopy'
import { ConfirmCard } from '../projects/ConfirmCard'

/** The one Sign out flow behind every Sign out button (desktop sidebar, phone More sheet).
 * P0-B: if changes haven't reached the server yet, it asks before discarding them — staying
 * signed in is the default (Esc / tapping outside keeps them). Render `prompt` once. */
export function useSignOut() {
  const [waiting, setWaiting] = useState(0)
  const request = () => void signOut().then(setWaiting)
  const copy = unsyncedSignOutCopy(waiting)
  const prompt =
    waiting > 0 ? (
      <ConfirmCard
        title={copy.title}
        body={copy.body}
        confirmLabel={copy.confirmLabel}
        cancelLabel={copy.cancelLabel}
        onConfirm={() => {
          setWaiting(0)
          void signOut({ discardUnsynced: true })
        }}
        onCancel={() => setWaiting(0)}
      />
    ) : null
  return { request, prompt }
}
