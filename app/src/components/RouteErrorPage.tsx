import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { Button } from './kit'
import { useAuth } from '../features/auth/AuthProvider'
import { AuthShell, BackLink, CardCta, CardMessage, HandLine } from '../features/auth/AuthLayout'

// ── Polish A (new-user audit 2026-09-26): an unknown address, or a page that crashed while
// rendering, used to show React Router's developer screen ("Unexpected Application Error! …
// Hey developer 👋", with the stack). These two states replace it. House rule: no stack trace,
// no raw text from the failure, and never the word "error" on screen — the details still go to
// the console (React logs every caught crash there).
// No design exists for these yet: composed from existing parts only — Stub's centred column
// inside the app shell, and J-11's doorway card (AuthLayout, as /reset's expired-link state
// uses it) when there is no shell to stand in. Flagged for the Phase C design pass. ──

type Kind = 'not-found' | 'crash'

const COPY: Record<Kind, { title: string; line: string }> = {
  'not-found': { title: "This page isn't here", line: 'the link may be old, or the address mistyped' },
  crash: { title: 'Something went wrong on this page', line: 'a reload usually sets it right' },
}

/** Unknown address. `bare` = no app shell around it (a signed-out visitor). */
export function NotFoundPage({ bare = false }: { bare?: boolean }) {
  return <StatePage kind="not-found" bare={bare} />
}

/** A route's `errorElement`. `bare` on the top-level routes, where a crash takes the shell with it. */
export function RouteErrorPage({ bare = false }: { bare?: boolean }) {
  const failure = useRouteError()
  const kind: Kind = isRouteErrorResponse(failure) && failure.status === 404 ? 'not-found' : 'crash'
  return <StatePage kind={kind} bare={bare} />
}

function StatePage({ kind, bare }: { kind: Kind; bare: boolean }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { title, line } = COPY[kind]

  // Home is Today when signed in; for a signed-out visitor it's the sign-in page.
  const home = session ? { label: 'Back to Today', to: '/today' } : { label: 'Back to sign in', to: '/sign-in' }
  const goHome = () => navigate(home.to)
  const reload = () => window.location.reload()
  // A crash on the home page itself: "back" would only repeat it — Reload is the one way out.
  const showHome = kind === 'not-found' || pathname !== home.to

  if (bare) {
    return (
      <AuthShell onSubmit={(e) => e.preventDefault()}>
        <CardMessage>{title}.</CardMessage>
        <HandLine top={12}>{line}</HandLine>
        {kind === 'crash' ? (
          <>
            <CardCta onClick={reload}>Reload</CardCta>
            {showHome && <BackLink onClick={goHome}>← {home.label}</BackLink>}
          </>
        ) : (
          <CardCta onClick={goHome}>{home.label}</CardCta>
        )}
      </AuthShell>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 'var(--sp-3)', textAlign: 'center' }}>
      <img src="/ds/assets/clover/seedling.png" alt="" style={{ height: 40, opacity: 0.7 }} />
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-body)' }}>{title}</h1>
      <div style={{ fontFamily: 'var(--font-hand)', fontSize: 'var(--fs-hand-l)', color: 'var(--ink-muted)' }}>{line}</div>
      <div style={{ marginTop: 'var(--sp-3)', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--sp-3)' }}>
        {kind === 'crash' ? (
          <>
            <Button onClick={reload}>Reload</Button>
            {showHome && <Button variant="secondary" onClick={goHome}>{home.label}</Button>}
          </>
        ) : (
          <Button onClick={goHome}>{home.label}</Button>
        )}
      </div>
    </div>
  )
}
