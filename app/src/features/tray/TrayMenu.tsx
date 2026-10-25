import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { inRound, mmss, useFocusMirror } from './focusMirror'
import { PAUSE_ROWS, SIGNED_OUT, menuRows, moveFocus, parseMenuState, type MenuIcon, type MenuRow, type TrayMenuState } from './menuRows'
import { native } from './native'

// Tray menu B (Calendar extras options.html §5, Kai's pick): the right-click menu as a small window of
// ours — the K and a status line on top, kf icons, Stop in terra — on tray.html?menu (src-tauri tray.rs
// places it at the pointer, hides it on blur, and falls back to Windows' own menu if this never draws).
// It never touches the account: the main window's state comes through tray.rs (`tray_menu_state`, then
// `window.__kfMenu`), the timer over ./focusMirror, and a row runs there (`tray_menu_pick`).
// Keyboard: ↑ ↓ Home End move, Enter or Space picks, → opens Pause, ← or Esc goes back, Esc closes.
// deviation(2026-10-25): Pause ▸ opens in place (a back row and its three choices) rather than as a
// second panel beside the menu — one window, no see-through edges to get wrong on Windows.

const GLYPHS: Partial<Record<MenuIcon, ReactNode>> = {
  open: <path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5" />,
  pen: (
    <>
      <path d="M5 19l1-4L16 5l3 3L9 18z" />
      <path d="M14 7l3 3" />
    </>
  ),
}

function Glyph({ name }: { name: MenuIcon }) {
  const own = GLYPHS[name]
  if (!own) return <Icon name={name as Exclude<MenuIcon, 'open' | 'pen'>} size={16} />
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {own}
    </svg>
  )
}

const BACK: MenuRow = { id: 'back', label: 'Pause notifications', icon: 'back' }

export function TrayMenu() {
  const [state, setState] = useState<TrayMenuState | null>(null)
  const [sub, setSub] = useState(false)
  const [active, setActive] = useState(-1)
  const [focus] = useFocusMirror()
  const card = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const reported = useRef(0)

  useEffect(() => {
    const w = window as unknown as { __kfMenu?: (s: unknown) => void }
    w.__kfMenu = (s) => setState(parseMenuState(s))
    void native<string>('tray_menu_state').then((s) => setState((cur) => cur ?? parseMenuState(s ?? null)))
    // Shown again (it's hidden, not closed): the main list, nothing picked, keys to the menu.
    const shown = () => {
      setSub(false)
      setActive(-1)
      card.current?.focus()
    }
    window.addEventListener('focus', shown)
    return () => {
      delete w.__kfMenu
      window.removeEventListener('focus', shown)
    }
  }, [])

  // The window is exactly the menu: its height goes to tray.rs once drawn (that shows it), and again
  // when the rows change. The Pause choices draw over the list, so they never change it.
  useLayoutEffect(() => {
    if (!state || !card.current) return
    const h = Math.ceil(card.current.getBoundingClientRect().height)
    if (h === reported.current) return
    const first = reported.current === 0
    reported.current = h
    void native(first ? 'tray_menu_ready' : 'tray_menu_size', { height: h })
  })

  const s = state ?? SIGNED_OUT
  const on = inRound(focus)
  const onBreak = focus?.mode === 'break' || focus?.mode === 'garden'
  const lines = menuRows(s, { on, time: on ? mmss(focus!.secondsLeft) : `${String(focus?.roundMin ?? 25).padStart(2, '0')}:00` })
  const main = lines.filter((l): l is MenuRow => l !== 'sep')
  const rows = sub ? [BACK, ...PAUSE_ROWS] : main

  const status: ReactNode = on ? (
    <small className="is-focus">
      {onBreak ? 'Break' : 'Focus'} · {mmss(focus!.secondsLeft)} left{focus!.isRunning ? '' : ' · paused'}
    </small>
  ) : s.next ? (
    <small>
      {s.next.now ? 'Now' : 'Next'} · <bdi dir="auto">{s.next.title}</bdi> · {s.next.now ? `until ${s.next.at}` : s.next.at}
    </small>
  ) : s.signedIn ? (
    <small>Nothing else today</small>
  ) : null

  function go(i: number) {
    setActive(i)
    buttons.current[i]?.focus()
  }

  function pick(r: MenuRow) {
    if (r.sub) {
      setSub(true)
      return requestAnimationFrame(() => go(1))
    }
    if (r.id === 'back') {
      setSub(false)
      return requestAnimationFrame(() => go(main.findIndex((m) => m.sub)))
    }
    void native('tray_menu_pick', { id: r.id })
  }

  function onKey(e: KeyboardEvent) {
    const row = rows[active] as MenuRow | undefined
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault()
      go(moveFocus(active, rows.length, e.key))
    } else if (e.key === 'ArrowRight' && row?.sub) {
      e.preventDefault()
      pick(row)
    } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && sub) {
      e.preventDefault()
      pick(BACK)
    } else if (e.key === 'Escape') {
      void native('tray_hide')
    }
  }

  const button = (r: MenuRow, i: number) => (
    <button
      key={r.id}
      ref={(el) => {
        buttons.current[i] = el
      }}
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`kf-menu-row${r.danger ? ' is-danger' : ''}${active === i ? ' is-hi' : ''}`}
      aria-haspopup={r.sub ? 'menu' : undefined}
      aria-expanded={r.sub ? sub : undefined}
      onMouseEnter={() => setActive(i)}
      onClick={() => pick(r)}
    >
      <Glyph name={r.icon} />
      <span className="kf-menu-l">{r.label}</span>
      {r.hint && <span className="kf-menu-h">{r.hint}</span>}
      {r.sub && (
        <span className="kf-menu-s" aria-hidden="true">
          ▸
        </span>
      )}
    </button>
  )

  let i = -1
  return (
    <div ref={card} className="kf-menu" role="menu" aria-label="Kai’s Flow" tabIndex={-1} onKeyDown={onKey}>
      <div className="kf-menu-head">
        <span className="kf-tray-k" aria-hidden="true">
          K
        </span>
        <span className="kf-menu-who">
          <b>Kai’s Flow</b>
          {status}
        </span>
      </div>
      <div className="kf-menu-sep" role="separator" />
      <div className="kf-menu-body">
        <div className="kf-menu-list" aria-hidden={sub || undefined}>
          {lines.map((l, n) => (l === 'sep' ? <div key={`sep${n}`} className="kf-menu-sep" role="separator" /> : sub ? <div key={l.id} className="kf-menu-row is-ghost" /> : button(l, ++i)))}
        </div>
        {sub && (
          <div className="kf-menu-sub" role="group" aria-label="Pause notifications">
            {button(BACK, 0)}
            <div className="kf-menu-sep" role="separator" />
            {PAUSE_ROWS.map((r, n) => button(r, n + 1))}
          </div>
        )}
      </div>
    </div>
  )
}
