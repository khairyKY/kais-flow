import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Float } from '../../components/Float'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { appPlatform, compareVersions, openDownload, reloadToUpdate, type UpdateResult } from '../../lib/appUpdate'
import { useEscapeStack } from '../../lib/overlayStack'
import { useAppSettings } from '../../lib/settings'
import { useToastStore } from '../../lib/toastStore'
import { RELEASE_NOTES_URL, dueForCheck, isNewAccount, noteFor, openWhatsNew, readMemory, remember, shouldShowUpdated, useWhatsNew } from '../../lib/whatsNew'
import { checkForUpdates, runningVersion } from './check'

// What's new, in place (Kai 2026-10-07): "Updated to v1.0.21 · What's new" once after an update,
// "v1.0.22 is out · See what's new" once per newer version (and a Windows toast when nobody is looking),
// the sheet with a version's highlights, and Settings → App's two lists. The rules are lib/whatsNew.ts;
// the check (lib/appUpdate's Check for updates + the toasts) is ./check.ts.

/** Mounted once in the shell (AppLayout): the after-update toast, the daily quiet check, the sheet. */
export function WhatsNewHost({ uid, createdAt }: { uid: string | undefined; createdAt: string | undefined }) {
  const sheet = useWhatsNew((s) => s.sheet)
  const settingsReady = !!useAppSettings().data

  useEffect(() => {
    if (!uid) return
    let alive = true
    void runningVersion(appPlatform()).then((v) => {
      const mem = alive ? readMemory(uid) : null
      if (!mem) return // unmounted (StrictMode's first pass), or no storage to keep "once" with
      if (mem.seen && compareVersions(v, mem.seen) <= 0) return
      remember(uid, { seen: v })
      if (shouldShowUpdated(mem.seen ?? null, v, isNewAccount(createdAt, Date.now()))) {
        useToastStore.getState().push({ message: `Updated to ${v}`, action: { label: 'What’s new', run: () => openWhatsNew(v) } })
      }
    })
    return () => {
      alive = false
    }
  }, [uid, createdAt])

  // Once a day at most: on start, and when the app comes back (the Windows app can run for days).
  // After app_settings, so quiet hours / pause are known for the Windows toast.
  useEffect(() => {
    if (!uid || !settingsReady) return
    const maybe = () => {
      const mem = readMemory(uid)
      if (mem && dueForCheck(mem.checkedAt, Date.now())) void checkForUpdates(uid)
    }
    maybe()
    const onVisible = () => {
      if (document.visibilityState === 'visible') maybe()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [uid, settingsReady])

  return sheet ? <WhatsNewSheet v={sheet} onClose={() => useWhatsNew.setState({ sheet: null })} /> : null
}

const eyebrow: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** A version's highlights, one sprout each — or where to read them when this bundle doesn't have them. */
export function Highlights({ items, size = 14 }: { items: readonly string[]; size?: number }) {
  if (!items.length) return <p style={{ margin: '8px 0', fontSize: size - 0.5, lineHeight: 1.5, color: 'var(--ink-muted)' }}>The notes for this one are on the site.</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((t, i) => (
        <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: i === items.length - 1 ? 'none' : '1px dashed var(--line-dashed)', fontSize: size, lineHeight: 1.5, color: 'var(--ink-body)' }}>
          <Icon name="sprout" size={16} style={{ marginTop: 2, color: 'var(--acc-sage-text)' }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

export function NotesLink() {
  return (
    <a href={RELEASE_NOTES_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--acc-lavender-deep)', textUnderlineOffset: 3 }}>
      All release notes →
    </a>
  )
}

/** Update, the way this platform does it (lib/appUpdate): reload the web app, or download the installer. */
export function UpdateButton({ result }: { result: UpdateResult | null }) {
  if (result?.kind === 'reload') return <Button variant="cta" onClick={() => void reloadToUpdate()}>Update</Button>
  if (result?.kind === 'download') return <Button variant="cta" onClick={() => openDownload(result.url)}>Update</Button>
  return <Button variant="cta" disabled title="Its installer is still on its way — try again in a few minutes">Update</Button>
}

function WhatsNewSheet({ v, onClose }: { v: string; onClose: () => void }) {
  const isMobile = useIsMobile()
  const available = useWhatsNew((s) => s.available)
  const result = useWhatsNew((s) => s.result)
  const isNewer = available?.v === v
  const note = noteFor(v) ?? (isNewer ? available : null)
  const title = `What’s new in ${v}`
  const meta = [isNewer ? 'Ready to update' : 'Your version', note?.date && longDate(note.date)].filter(Boolean).join(' · ')
  const body = (
    <>
      <div style={eyebrow}>{meta}</div>
      {note?.title && <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.35, color: 'var(--ink-muted)' }}>{note.title}</div>}
      <div style={{ marginTop: 8 }}>
        <Highlights items={note?.highlights ?? []} size={isMobile ? 15 : 14} />
      </div>
      {isNewer && result?.kind === 'pending' && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>Its installer is still on its way — try again in a few minutes.</p>}
    </>
  )
  const actions = (close: () => void) => (
    <>
      <span style={{ flex: 1 }}>
        <NotesLink />
      </span>
      {isNewer ? <UpdateButton result={result} /> : <Button variant="cta" onClick={close}>Got it</Button>}
    </>
  )
  if (isMobile) {
    return (
      <BottomSheet title={title} onClose={onClose} footer={(close) => actions(close)}>
        {() => body}
      </BottomSheet>
    )
  }
  return <CentredPanel title={title} onClose={onClose} footer={actions(onClose)}>{body}</CentredPanel>
}

/** The desktop's sheet: a centred card over the scrim (Overlays.dc.html's confirm card, larger). */
function CentredPanel({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const titleId = useId()
  const card = useRef<HTMLDivElement>(null)
  useEscapeStack(true, onClose)
  useEffect(() => {
    const prev = document.activeElement
    card.current?.focus({ preventScroll: true })
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true })
    }
  }, [])
  return (
    <Float>
      <div onClick={onClose} className="kf-overlay-scrim" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--scrim)' }}>
        <div
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="kf-overlay-card"
          style={{ width: 'min(480px, 100%)', maxHeight: 'calc(var(--kf-vh) - 96px)', display: 'flex', flexDirection: 'column', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', outline: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 10px 4px 22px' }}>
            <div id={titleId} style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink-body)' }}>{title}</div>
            <button type="button" aria-label="Close" onClick={onClose} className="kf-press" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', borderRadius: '50%', color: 'var(--ink-muted)', cursor: 'pointer' }}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '2px 22px 10px' }}>{children}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 14px 22px', borderTop: '1px dashed var(--line-dashed)' }}>{footer}</div>
        </div>
      </div>
    </Float>
  )
}

const label: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }

/** Settings → App, under Check for updates: what's coming (with Update), and what's in this version. */
export function UpdateNotes({ running }: { running: string }) {
  const available = useWhatsNew((s) => s.available)
  const result = useWhatsNew((s) => s.result)
  const mine = noteFor(running)
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {available && (
        <section aria-label={`Coming in ${available.v}`} style={{ borderTop: '1px dashed var(--line-dashed)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...label, color: 'var(--acc-terra-ink)', flex: 1 }}>Coming in {available.v}</div>
            <UpdateButton result={result} />
          </div>
          <div style={{ marginTop: 4 }}>
            <Highlights items={available.highlights} size={13.5} />
          </div>
        </section>
      )}
      <details style={{ borderTop: '1px dashed var(--line-dashed)', paddingTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13.5, color: 'var(--ink-body)', padding: '4px 0' }}>What’s new in your version ({running})</summary>
        <div style={{ marginTop: 4 }}>
          <Highlights items={mine?.highlights ?? []} size={13.5} />
          <div style={{ marginTop: 6 }}>
            <NotesLink />
          </div>
        </div>
      </details>
    </div>
  )
}
