import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button, Chip } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { Cta, Field, FirstRunPage, LinkButton, Plant } from '../auth/AuthLayout'
import { useAppSettings, needsOnboarding, completeOnboarding } from './api'
import { DatePicker } from '../../components/DatePicker'
import { uiZoom } from '../../lib/uiScale'
import { useAuth } from '../auth/AuthProvider'
import { markFirstTodayHint } from '../today/firstTodayHint'
import { markTourPending } from '../tour/help'
import { readFirstThing, whenChip, withPicked, type PickedDate } from './firstThings'

// ── First Run.dc.html 9g (empty) / 9h (filled, a date parse chip) / 9l-g night / 9m-g desktop:
// the one onboarding screen. An optional name and three lines that become today's Top 3; Start
// stays disabled until a line has text, Skip is the empty path, Import sits under Start. Then
// Today with the three (9i). Settings → "Replant" reopens it with ?replant. ──

const PLACEHOLDERS = ['e.g. Call the supplier tomorrow 3pm', 'Second thing', 'Third thing']

export function OnboardingPage() {
  const { data: settings } = useAppSettings()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // WA-1 punch 3: without ?replant a finished account is bounced to /today — onboarding runs once.
  const replant = searchParams.has('replant')
  const [name, setName] = useState('')
  const [lines, setLines] = useState(['', '', ''])
  const lineRefs = useRef<(HTMLInputElement | null)[]>([])
  const prefilled = useRef(false)
  // 9h: a tap on a line's date chip opens the date picker; its pick rides on that line.
  const [picked, setPicked] = useState<(PickedDate | undefined)[]>([])
  const [picking, setPicking] = useState<{ line: number; at: { x: number; y: number } } | null>(null)
  // Read as you type; one clock per render so the three chips agree.
  const parsed = useMemo(() => {
    const now = new Date()
    return lines.map((l) => readFirstThing(l, now))
  }, [lines])
  const things = parsed.map((t, i) => withPicked(t, picked[i]))
  const pick = (line: number, at: string | null) => {
    const over = parsed[line]?.dueAt
    if (!over) return
    setPicked((ps) => {
      const next = [...ps]
      next[line] = { over, at }
      return next
    })
  }
  const ready = things.some(Boolean)

  useEffect(() => {
    if (prefilled.current || !settings) return
    prefilled.current = true
    if (settings.display_name) setName(settings.display_name)
  }, [settings])

  if (!replant && settings && !needsOnboarding(settings)) return <Navigate to="/today" replace />

  function finish(to: string, withThings: boolean) {
    completeOnboarding(name, withThings ? things.filter((t) => t !== null) : [])
    if (!replant) markFirstTodayHint(session?.user.id) // 9i: the first Today explains its top card
    if (!replant) markTourPending(session?.user.id) // Tour & help: the garden notes, once, on that first Today
    navigate(to, { replace: true })
  }

  // Enter walks down the lines; on the last one it submits (Start, once a line has text).
  function onLineKey(i: number) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || i === lines.length - 1) return
      e.preventDefault()
      lineRefs.current[i + 1]?.focus()
    }
  }

  return (
    <FirstRunPage
      wide
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) finish('/today', true)
      }}
      right={
        <Button type="button" variant="ghost" className="fr-skip" onClick={() => finish('/today', false)}>
          Skip
        </Button>
      }
    >
      <div className="fr-hero" style={{ gap: 4 }}>
        <Plant src="/ds/assets/clover/awake.png" h={64} />
        <div className="fr-hand">let's plant something ✿</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field
          label="What should we call you?"
          hint="optional"
          autoComplete="given-name"
          enterKeyHint="next"
          placeholder="Your first name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            lineRefs.current[0]?.focus()
          }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h1 className="fr-q">What are 3 things on your mind today?</h1>
        <p className="fr-q-sub">They become today's Top 3. Add a when if there is one — “tomorrow 3pm” works.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {lines.map((line, i) => {
          const due = things[i]?.dueAt
          return (
            <div key={i}>
              <div className="fr-box fr-box--line">
                <span className="fr-star">
                  <Icon name="star" size={20} />
                </span>
                <input
                  ref={(el) => void (lineRefs.current[i] = el)}
                  className="fr-input"
                  aria-label={`Thing ${i + 1}`}
                  placeholder={PLACEHOLDERS[i]}
                  autoFocus={i === 0}
                  enterKeyHint={i === lines.length - 1 ? 'done' : 'next'}
                  value={line}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
                  onKeyDown={onLineKey(i)}
                />
              </div>
              {due && (
                <div className="fr-when">
                  <Chip
                    tone="date"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setPicking({ line: i, at: { x: r.left, y: r.bottom + 4 * uiZoom() } })
                    }}
                  >
                    {whenChip(due)}
                  </Chip>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="fr-foot">
        <Cta disabled={!ready}>Start</Cta>
        <div className="fr-alt">
          <LinkButton onClick={() => finish('/settings/import', false)}>Import from Akiflow / CSV instead</LinkButton>
        </div>
      </div>

      {picking && things[picking.line]?.dueAt && (
        <DatePicker
          title="Due date"
          meta={things[picking.line]?.title}
          value={things[picking.line]?.dueAt ?? null}
          quick
          withTime
          position={picking.at}
          onPick={(at) => pick(picking.line, at)}
          onClear={() => pick(picking.line, null)}
          onClose={() => setPicking(null)}
        />
      )}
    </FirstRunPage>
  )
}
