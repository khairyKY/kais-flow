// The small pieces the sharing screens share: the avatar, "never shared", the level list with previews, the 8 code tiles.
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { useToastStore } from '../../lib/toastStore'
import { LEVELS, LEVEL_HELP, LEVEL_NAME, formatCode, type Level } from './model'
import './sharing.css'

/** A round initial: mine in bone, hers in Heather. */
export function Avatar({ name, her = true, size = 28, dim }: { name: string; her?: boolean; size?: number; dim?: boolean }) {
  return (
    <span className={`sh-av${her ? ' is-her' : ''}${dim ? ' is-dim' : ''}`} style={{ '--sh-size': `${size}px` } as CSSProperties} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/** The hard rule, said wherever people choose what to share. */
export function NeverShared() {
  return (
    <div className="sh-never">
      <Icon name="lock" size={18} />
      <div><b>Never shared:</b> journal, health, people and AI chat. That’s a rule, not a setting.</div>
    </div>
  )
}

/** The three levels as a list, each with a small preview of what it shows (the picked look). One tap picks it. */
export function LevelList({ value, onPick, label }: { value: Level; onPick: (l: Level) => void; label: string }) {
  return (
    <div className="sh-levels" role="radiogroup" aria-label={label}>
      {LEVELS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={l === value} className="sh-level" onClick={() => onPick(l)}>
          <span className="sh-radio" aria-hidden="true" />
          <span className="sh-lb">{LEVEL_NAME[l]}<span className="sh-ld" style={{ display: 'block' }}>{LEVEL_HELP[l]}</span></span>
          {l === 'busy' ? <span className="sh-mini is-busy" aria-hidden="true" /> : <span className="sh-mini" aria-hidden="true">Lecture<small>{l === 'details' ? '+ Top 3' : '11:00'}</small></span>}
        </button>
      ))}
    </div>
  )
}

/** The code in 8 tiles with a dash between the fours; `typed` tiles are filled, `focus` is the next one. */
export function CodeTiles({ code, focus = -1 }: { code: string; focus?: number }) {
  return (
    <div className="sh-tiles" aria-label={code ? `Code ${formatCode(code)}` : 'Code'}>
      {[...Array(8)].map((_, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i === 4 && <span className="sh-dash" aria-hidden="true">–</span>}
          <span className={`sh-tile${i === focus ? ' is-focus' : ''}`}>{code[i] ?? ''}</span>
        </span>
      ))}
    </div>
  )
}

/** Hands text to the phone's share sheet (or the browser's); with neither, copies it. */
export async function shareText(text: string, title = "Kai's Flow"): Promise<void> {
  const push = useToastStore.getState().push
  try {
    if (navigator.share) {
      await navigator.share({ title, text })
      return
    }
    await navigator.clipboard.writeText(text)
    push({ message: 'Copied. Paste it in a message.' })
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return // they closed the sheet
    push({ message: 'Couldn’t share. Copy it by hand instead.' })
  }
}

export async function copyText(text: string, said = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    useToastStore.getState().push({ message: said })
  } catch {
    useToastStore.getState().push({ message: 'Couldn’t reach the clipboard. Select it and copy by hand.' })
  }
}

