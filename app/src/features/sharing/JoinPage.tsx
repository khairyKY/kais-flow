// /join/<code> (flow 2): the link in an invite message. The code is kept (it survives sign-in, and sign-up), and the shell opens
// the confirm step on its own once there is a session. Signed in already: straight to Today and the confirm step, two taps in all.
import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Button } from '../../components/kit'
import { useAuth } from '../auth/AuthProvider'
import { cleanCode, formatCode, isCode } from './model'
import { stashJoinCode } from './ui'
import './sharing.css'

export function JoinPage() {
  const { code: raw = '' } = useParams()
  const code = cleanCode(raw)
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (isCode(code)) stashJoinCode(code) }, [code])
  if (loading) return null
  if (!isCode(code)) return <Navigate to="/today" replace />
  if (session) return <Navigate to="/today" replace />
  return (
    <main className="sv-page">
      <div className="sv-gone">
        <h1>You’re invited to share days</h1>
        <p>Your code is <b>{formatCode(code)}</b>. It works once, for 24 hours. Sign in or make an account and it connects from there; the code is kept while you do.</p>
        <Button onClick={() => void navigate('/sign-in')}>Continue in the browser</Button>
        <p>It works right here. Install the app later if you like.</p>
      </div>
    </main>
  )
}
