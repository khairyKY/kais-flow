// Connect, the receiving half (flow 2): the code (typed, pasted, or already in from a link), then the confirm screen - who
// invited you, what each of you will see, and one button. Nothing is shared until Connect.
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/kit'
import { useToastStore } from '../../lib/toastStore'
import { acceptInvite, codeProblem, peekInvite, type Peek } from './api'
import { Avatar, CodeTiles, LevelList, NeverShared } from './parts'
import { LEVEL_HELP, LEVEL_NAME, RELATION_NAME, cleanCode, codeIn, isCode, lower, type Level } from './model'
import { useSharingUi } from './ui'

export function EnterCodeSheet({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const [code, setCode] = useState(() => cleanCode(initial ?? ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [peek, setPeek] = useState<Peek | null>(null)
  const [mine, setMine] = useState<Level | null>(null)
  const [changing, setChanging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function look(c: string) {
    setBusy(true)
    setErr(null)
    try {
      const r = await peekInvite(c)
      if (r.ok) { setPeek(r); setMine(r.level) } else setErr(codeProblem(r.error))
    } catch {
      setErr('Couldn’t reach Kai’s Flow. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }
  // A link brought the code: straight to the confirm step.
  useEffect(() => { if (isCode(code) && initial) void look(code) }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, for the code the link carried

  async function paste() {
    try {
      const found = codeIn(await navigator.clipboard.readText())
      if (found) { setCode(found); setErr(null) } else setErr('There’s no code in what you copied.')
    } catch {
      setErr('Couldn’t read the clipboard. Type the code instead.')
    }
  }

  async function connect() {
    if (!peek || !mine) return
    setBusy(true)
    setErr(null)
    try {
      const r = await acceptInvite(code, mine === peek.level ? undefined : mine)
      if (r.ok) {
        useToastStore.getState().push({ message: `Connected with ${peek.from_name}. You both see ${LEVEL_NAME[lower(peek.level, mine)]}.` })
        onClose()
        useSharingUi.getState().openPerson(r.circle_id)
        return
      }
      setPeek(null)
      setErr(codeProblem(r.error))
    } catch {
      setErr('That didn’t go through. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (peek && mine) {
    const both = lower(peek.level, mine)
    return (
      <BottomSheet onClose={onClose} title={`Connect with ${peek.from_name}`}>
        {() => (
          <div className="sh-sheet">
            <div className="sh-head"><Avatar name={peek.from_name} size={56} /><div><div className="sh-name">{peek.from_name}</div><div className="sh-since">invited you as their {RELATION_NAME[peek.relation].toLowerCase()}</div></div></div>
            <div className="sh-lbl">What you’ll each see</div>
            <div className="sh-box">
              <div className="sh-row"><Avatar name="You" her={false} size={26} /><div className="sh-grow"><b>You see {peek.from_name}’s</b> {LEVEL_NAME[both]}<small>{LEVEL_HELP[both]}</small></div></div>
              <div className="sh-row"><Avatar name={peek.from_name} size={26} /><div className="sh-grow"><b>{peek.from_name} sees your</b> {LEVEL_NAME[both]}<small>The same, unless you pick less</small></div>
                <Button variant="ghost" onClick={() => setChanging((c) => !c)}>Change</Button></div>
            </div>
            {changing && <div style={{ marginTop: 10 }}><LevelList label="What they see of you" value={mine} onPick={(l) => { setMine(l); setChanging(false) }} /></div>}
            <div className="sh-rule"><Icon name="eye" size={18} /><div><b>You see what you show.</b> If either of you picks less, you both get less.</div></div>
            <div className="sh-box"><NeverShared /></div>
            {err && <div className="sh-err" role="alert">{err}</div>}
            <div className="sh-btns is-col">
              <Button loading={busy} onClick={() => void connect()}>{`Connect with ${peek.from_name}`}</Button>
              <Button variant="ghost" onClick={onClose}>Not now</Button>
            </div>
          </div>
        )}
      </BottomSheet>
    )
  }

  return (
    <BottomSheet onClose={onClose} title="Enter a code">
      {() => (
        <div className="sh-sheet">
          <div className="sh-sub">Ask them for their Kai’s Flow invite code. It works once, for 24 hours.</div>
          <div className="sh-lbl">The code</div>
          <div className="sh-code-in" onClick={() => input.current?.focus()}>
            <CodeTiles code={code} focus={Math.min(code.length, 7)} />
            <input
              ref={input}
              autoFocus
              aria-label="Invite code"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={code}
              onChange={(e) => { setCode(codeIn(e.target.value) ?? cleanCode(e.target.value)); setErr(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && isCode(code) && !busy) void look(code) }}
            />
          </div>
          <div className="sh-paste"><Button variant="secondary" icon={<Icon name="clipboard" size={16} />} onClick={() => void paste()}>Paste the code</Button></div>
          {err && <div className="sh-err" role="alert">{err}</div>}
          <div className="sh-btns"><Button loading={busy} disabled={!isCode(code)} onClick={() => void look(code)}>Continue</Button></div>
        </div>
      )}
    </BottomSheet>
  )
}
