// Mounted once in the signed-in shell: the sharing sheets (invite, enter a code, a person), a /join/<code> link that was
// waiting for sign-in, and the in-app notices of what the other side changed (a level, a pause, a leave).
import { Suspense, lazy, useEffect } from 'react'
import { useShareNotices } from './api'
import { ShareBlockSync, useShareFocus } from './StatusNotice'
import { takeJoinCode, useSharingUi } from './ui'

const InviteSheet = lazy(() => import('./InviteSheet').then((m) => ({ default: m.InviteSheet })))
const EnterCodeSheet = lazy(() => import('./EnterCodeSheet').then((m) => ({ default: m.EnterCodeSheet })))
const PersonSheet = lazy(() => import('./PersonSheet').then((m) => ({ default: m.PersonSheet })))

export function SharingHost() {
  const { invite, enter, person, close, openEnter } = useSharingUi()
  useShareNotices()
  useShareFocus()
  // A link followed before there was a session (or a shell): its code was kept, and now it opens on its confirm step.
  useEffect(() => {
    const code = takeJoinCode()
    if (code) openEnter(code)
  }, [openEnter])
  return (
    <Suspense fallback={null}>
      <ShareBlockSync />
      {invite && <InviteSheet onClose={close} />}
      {enter && <EnterCodeSheet initial={enter.code} onClose={close} />}
      {person && <PersonSheet circleId={person} onClose={close} />}
    </Suspense>
  )
}
