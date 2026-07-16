import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  usePendingInboxItems,
  useAllInboxItems,
  fileToTask,
  dismissInboxItem,
  snoozeInboxItem,
  restoreInboxItem,
  purgeInboxItem,
} from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { hydrangeaAsset } from '../../lib/gardenAssets'
import { useListKeys, type ListBinding } from '../../components/useListKeys'
import { Select } from '../../components/Select'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { rowAnchor } from '../../lib/rowAnchor'
import { Button, Chip } from '../../components/kit'
import { useMotionEnabled } from '../../lib/motion'
import { countWord, daysAgo, dismissedAgo, formatCaptured, formatDue, isToday } from './inboxDisplay'
import type { InboxItem, InboxKind } from '../../lib/types'
import './Inbox.css'

// ── Inbox — pixel contract: Inbox.dc.html 1a (desktop triage), 1b (inbox zero), 1c (iPhone
// ≤767px), 2a (Dismissed desktop), 2b (Dismissed iPhone, swipe→restore). Species: hydrangea
// by pending count (zero/light/medium/heavy). Effects/motion: Motion 1c floret drift on file. ──

const A = '/ds/assets'
// Mirrors capture/api.ts's own CONFIDENCE_THRESHOLD — that file isn't this wave's to edit,
// so the number is duplicated rather than imported.
const CONFIDENCE_THRESHOLD = 0.75
const PROJECT_DOTS = ['--acc-moss', '--acc-blossom', '--acc-lavender', '--acc-hydrangea', '--acc-buttercream', '--acc-sage']

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

const KIND_LABEL: Record<InboxKind, string> = { text: 'Typed', voice: 'Voice', github_issue: 'GitHub', email: 'Email' }
const KIND_CHIP_STYLE: Record<InboxKind, { background?: string; color?: string; border?: string }> = {
  text: { border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' },
  email: { border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' },
  voice: { background: 'rgba(181,101,74,0.12)', color: 'var(--acc-terra)' },
  github_issue: { background: 'rgba(122,148,110,0.18)', color: 'var(--acc-sage-text)' },
}

function KindChip({ kind }: { kind: InboxKind }) {
  return (
    <Chip tone="bordered" style={{ border: 'none', ...KIND_CHIP_STYLE[kind] }}>
      {KIND_LABEL[kind]}
    </Chip>
  )
}

// Swipe-right-only reveal, used by the Dismissed tab's iPhone rows (2b) — same physics as
// TaskRow's own swipe hook, just one direction since "restore" is the only action here.
const SWIPE_MAX = 78
function useRestoreSwipe() {
  const [x, setX] = useState(0)
  const dragging = useRef(false)
  const startClientX = useRef(0)
  const startX = useRef(0)
  return {
    x,
    reset: () => setX(0),
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        dragging.current = true
        startClientX.current = e.clientX
        startX.current = x
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      },
      onPointerMove(e: React.PointerEvent) {
        if (!dragging.current) return
        const next = startX.current + (e.clientX - startClientX.current)
        setX(Math.max(0, Math.min(SWIPE_MAX, next)))
      },
      onPointerUp() {
        dragging.current = false
        setX((cur) => (cur > SWIPE_MAX / 2 ? SWIPE_MAX : 0))
      },
    },
  }
}

interface AiParse {
  kind?: string
  cleaned_text?: string
  confidence?: number
  domain_id?: string | null
  project_id?: string | null
  due_at?: string | null
}

export function InboxPage() {
  const { data: items = [] } = usePendingInboxItems()
  const { data: allItems = [] } = useAllInboxItems()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusedItem = focusId ? allItems.find((i) => i.id === focusId) : undefined
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()

  const [tab, setTab] = useState<'waiting' | 'dismissed'>('waiting')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [filingIds, setFilingIds] = useState<Set<string>>(new Set())
  const [kbSnoozeId, setKbSnoozeId] = useState<string | null>(null)
  const [editRequestId, setEditRequestId] = useState<string | null>(null)

  const dismissedItems = useMemo(
    () => allItems.filter((i) => i.status === 'dismissed').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [allItems],
  )
  const githubItems = items.filter((i) => i.kind === 'github_issue')
  const aiItems = items.filter((i) => i.kind !== 'github_issue')
  const orderedItems = [...aiItems, ...githubItems]

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects])
  const projectDot = (id: string | null | undefined) => {
    if (!id) return 'var(--acc-moss)'
    const idx = projects.findIndex((p) => p.id === id)
    return `var(${PROJECT_DOTS[idx >= 0 ? idx % PROJECT_DOTS.length : 0]})`
  }

  function fileWithFloret(item: InboxItem, opts: Parameters<typeof fileToTask>[1]) {
    if (motion) {
      setFilingIds((s) => new Set(s).add(item.id))
      window.setTimeout(() => {
        fileToTask(item, opts)
        setFilingIds((s) => {
          const next = new Set(s)
          next.delete(item.id)
          return next
        })
      }, 260)
    } else {
      fileToTask(item, opts)
    }
  }

  const bindings: ListBinding<InboxItem>[] = [
    {
      keys: ['e'],
      label: 'File with AI suggestion',
      run: (item) => {
        const parse = item.ai_parse as AiParse | null
        fileWithFloret(item, { domainId: parse?.domain_id ?? null, projectId: parse?.project_id ?? null, title: parse?.cleaned_text ?? undefined })
      },
    },
    { keys: ['d'], label: 'Dismiss', run: (item) => dismissInboxItem(item) },
    { keys: ['s'], label: 'Snooze', run: (item) => setKbSnoozeId(item.id) },
    { keys: ['Enter'], label: 'Open (edit title)', run: (item) => setEditRequestId(item.id) },
  ]
  const { focusedId } = useListKeys(orderedItems, bindings, { idPrefix: 'inbox-', active: tab === 'waiting' })
  const kbSnoozeTask = orderedItems.find((i) => i.id === kbSnoozeId)

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`inbox-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, items, allItems])

  const hydrangea = hydrangeaAsset(items.length)
  const zero = items.length === 0

  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: isMobile ? 12 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 14 }}>
        <img src={`${A}/hydrangea/${hydrangea.src}.png`} alt="" style={{ height: isMobile ? 40 : 54, filter: 'var(--shadow-drop-sm)' }} />
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9 : 10.5, letterSpacing: isMobile ? '0.2em' : '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Inbox{isMobile ? '' : ' · universal triage'}
          </div>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 24 : 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
            {zero ? 'Inbox zero' : `${countWord(items.length)} waiting`}
          </h1>
        </div>
      </div>
      {!isMobile && !zero && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#7a745f', transform: 'rotate(-1.5deg)' }}>clear them and the hydrangea calms ✿</span>
          <VoiceCaptureButton />
        </div>
      )}
    </div>
  )

  // ── 2a/2b header — distinct eyebrow/title/icon from the Waiting header above ──
  const dismissedHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 14 }}>
      <img src={`${A}/hydrangea/medium.png`} alt="" style={{ height: isMobile ? 40 : 52, filter: 'var(--shadow-drop-sm) saturate(0.55)', opacity: 0.8 }} />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9 : 10.5, letterSpacing: isMobile ? '0.2em' : '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Inbox · {dismissedItems.length} dismissed
        </div>
        <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 24 : 34, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
          Dismissed
        </h1>
      </div>
    </div>
  )

  const tabsRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 18 : 22, marginTop: isMobile ? 14 : 22, borderBottom: '1px solid var(--line-card)' }}>
      <button type="button" onClick={() => setTab('waiting')} style={tabStyle(tab === 'waiting', isMobile)}>
        Waiting<span style={tabCountStyle}>{items.length}</span>
        {tab === 'waiting' && <span style={tabUnderline('var(--acc-hydrangea)')} />}
      </button>
      <button type="button" onClick={() => setTab('dismissed')} style={tabStyle(tab === 'dismissed', isMobile)}>
        Dismissed<span style={tabCountStyle}>{dismissedItems.length}</span>
        {tab === 'dismissed' && <span style={tabUnderline('var(--acc-hydrangea)')} />}
      </button>
    </div>
  )

  return (
    <div style={{ maxWidth: isMobile ? undefined : 940 }}>
      {tab === 'dismissed' ? dismissedHeader : !zero && header}
      {tabsRow}

      {tab === 'waiting' ? (
        zero ? (
          <EmptyInboxCard />
        ) : (
          <>
            {focusId && !bannerDismissed && aiItems.some((i) => i.id === focusId) && (
              <div style={deepLinkBannerStyle(isMobile)}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 8.5 : 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>
                  jumped here from Search — the ringed card below is your match
                </span>
                <span onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>✕</span>
              </div>
            )}

            {focusedItem && focusedItem.status !== 'pending' && <ResolvedCard item={focusedItem} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12, marginTop: 18 }}>
              {aiItems.map((item, i) => (
                <TriageCard
                  key={item.id}
                  item={item}
                  compact={isMobile}
                  highlighted={item.id === focusId || item.id === focusedId}
                  filing={filingIds.has(item.id)}
                  rotate={i % 2 === 0 ? -0.2 : 0.2}
                  domains={domains}
                  projects={projects}
                  projectName={projectName.get((item.ai_parse as AiParse | null)?.project_id ?? '')}
                  projectDot={projectDot}
                  editRequested={item.id === editRequestId}
                  onFile={fileWithFloret}
                />
              ))}
            </div>

            {githubItems.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: isMobile ? '22px 0 10px' : '30px 0 10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9 : 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>GitHub{isMobile ? '' : ' · Shaheen/website'} · ranked by AI</span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-hairline)' }}>{githubItems.length} open</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {githubItems.map((item) => (
                    <GithubRow key={item.id} item={item} compact={isMobile} onFile={() => fileWithFloret(item, {})} onDismiss={() => dismissInboxItem(item)} />
                  ))}
                </div>
              </>
            )}

            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 28, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
                <span><b style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>E</b> file</span>
                <span><b style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>D</b> dismiss</span>
                <span><b style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>S</b> snooze</span>
                <span><b style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>↑↓</b> move</span>
                <span><b style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>⏎</b> open</span>
                <span style={{ marginLeft: 'auto' }}>one keystroke per capture — that's the whole game</span>
              </div>
            )}
          </>
        )
      ) : (
        <DismissedPanel items={dismissedItems} compact={isMobile} />
      )}

      {kbSnoozeTask && (
        <SnoozeMenu
          position={rowAnchor('inbox-', kbSnoozeTask.id)}
          onClose={() => setKbSnoozeId(null)}
          onSnooze={(until) => { snoozeInboxItem(kbSnoozeTask, until); setKbSnoozeId(null) }}
          onSomeday={() => { snoozeInboxItem(kbSnoozeTask, new Date(Date.now() + 365 * 86_400_000).toISOString()); setKbSnoozeId(null) }}
        />
      )}
    </div>
  )
}

function tabStyle(active: boolean, isMobile: boolean): React.CSSProperties {
  return {
    position: 'relative',
    border: 'none',
    background: 'none',
    padding: `0 0 ${isMobile ? 9 : 11}px`,
    font: 'inherit',
    fontSize: isMobile ? 13.5 : 14,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--ink-body)' : 'var(--ink-faint)',
    cursor: 'pointer',
  }
}
const tabCountStyle: React.CSSProperties = { marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-hairline)' }
function tabUnderline(color: string): React.CSSProperties {
  return { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: color, borderRadius: 2 }
}
function deepLinkBannerStyle(isMobile: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(154,180,190,0.14)',
    border: '1px solid rgba(154,180,190,0.35)',
    borderRadius: 6,
    padding: isMobile ? '8px 11px' : '9px 14px',
    marginTop: isMobile ? 14 : 24,
  }
}

// ── 1b — Inbox zero ──
function EmptyInboxCard() {
  return (
    <div style={{ padding: '60px 20px 54px', textAlign: 'center' }}>
      <img src={`${A}/hydrangea/zero.png`} alt="" style={{ height: 88, filter: 'var(--shadow-drop-sm)' }} />
      <div style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>Inbox zero</div>
      <p style={{ margin: '10px auto 0', maxWidth: 330, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-muted)' }}>
        Captures land here when the command bar can't tell where they go. Nothing waits on you.
      </p>
      <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', transform: 'rotate(-1deg)' }}>one calm bloom ✿</div>
    </div>
  )
}

// ── Already-resolved deep-link target (filed elsewhere / dismissed) ──
function ResolvedCard({ item }: { item: InboxItem }) {
  const filed = item.status === 'filed'
  return (
    <div style={{ background: 'var(--paper-bone)', border: '1px dashed var(--line-solid)', borderRadius: 3, padding: '13px 19px', marginTop: 18, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 15, height: 15, borderRadius: 4, background: filed ? 'var(--sig-done)' : 'var(--ink-hairline)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <span style={{ color: 'var(--paper-parchment)', fontSize: 8 }}>✓</span>
      </span>
      <span style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>{item.raw_text}</span>
      <Chip tone="sage" style={filed ? undefined : { background: 'rgba(107,100,85,0.14)', color: 'var(--ink-faint)' }}>
        {filed ? 'already filed as a task' : 'dismissed'}
      </Chip>
      {filed && (
        <a href="/tasks" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
          open task →
        </a>
      )}
    </div>
  )
}

// ── 1a / 1c — triage card, AI confident or unsure ──
function TriageCard({
  item,
  compact,
  highlighted,
  filing,
  rotate,
  domains,
  projects,
  projectName,
  projectDot,
  editRequested,
  onFile,
}: {
  item: InboxItem
  compact?: boolean
  highlighted?: boolean
  filing?: boolean
  rotate: number
  domains: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  projectName?: string
  projectDot: (id: string | null | undefined) => string
  editRequested?: boolean
  onFile: (item: InboxItem, opts: { domainId?: string | null; projectId?: string | null; title?: string }) => void
}) {
  const parse = item.ai_parse as AiParse | null
  const [domainId, setDomainId] = useState(parse?.domain_id ?? '')
  const [projectId, setProjectId] = useState(parse?.project_id ?? '')
  const suggested = parse?.cleaned_text && parse.cleaned_text !== item.raw_text ? parse.cleaned_text : null
  const [title, setTitle] = useState(suggested ?? item.raw_text)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (editRequested) setEditing(true)
  }, [editRequested])
  const [snoozePos, setSnoozePos] = useState<{ x: number; y: number } | null>(null)

  const filedTitle = title.trim() || item.raw_text
  const pct = typeof parse?.confidence === 'number' ? Math.round(parse.confidence * 100) : null
  const confident = !!parse && (parse.confidence ?? 0) >= CONFIDENCE_THRESHOLD
  const dueLabel = parse?.due_at ? formatDue(parse.due_at) : null

  function file() {
    onFile(item, { domainId: domainId || null, projectId: projectId || null, title: filedTitle })
  }

  const size = compact
    ? { pad: '12px 14px', title: 13.5, meta: 11, barPad: '9px 11px' }
    : { pad: '17px 19px', title: 15.5, meta: 12, barPad: '9px 12px' }

  return (
    <div
      id={`inbox-${item.id}`}
      tabIndex={highlighted ? 0 : -1}
      style={{
        position: 'relative',
        background: 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        outline: highlighted ? '2px solid rgba(154,180,190,0.5)' : 'none',
        outlineOffset: 2,
        borderRadius: 3,
        boxShadow: highlighted ? 'var(--shadow-card)' : 'var(--shadow-crisp)',
        padding: size.pad,
        transform: `rotate(${rotate}deg)`,
        overflow: 'hidden',
        opacity: filing ? 0.55 : 1,
        transition: 'opacity 200ms var(--ease-out)',
      }}
    >
      {filing && (
        <>
          <span className="inbox-floret" style={{ top: '30%', left: '20%', animationDelay: '0ms' }} />
          <span className="inbox-floret" style={{ top: '25%', left: '50%', animationDelay: '80ms' }} />
          <span className="inbox-floret" style={{ top: '35%', left: '75%', animationDelay: '160ms' }} />
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        {editing ? (
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', fontFamily: 'var(--font-ui)', fontSize: size.title, color: 'var(--ink-body)', lineHeight: 1.45, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-input)', padding: '4px 8px' }}
          />
        ) : (
          <div onClick={() => setEditing(true)} title="Tap to edit the title before filing" style={{ fontSize: size.title, color: 'var(--ink-body)', lineHeight: 1.45, cursor: 'text' }}>
            {title}
          </div>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)', flex: 'none' }}>
          {KIND_LABEL[item.kind]} · {formatCaptured(item.created_at)}
        </span>
      </div>

      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 9, background: confident ? 'rgba(154,180,190,0.14)' : 'var(--paper-bone)', borderRadius: 6, padding: size.barPad, flexWrap: 'wrap' }}>
        {parse ? (
          confident ? (
            <>
              <Chip tone="hydrangea" style={{ background: 'rgba(154,180,190,0.3)' }}>AI · {parse.kind ?? 'note'} · {pct}%</Chip>
              <span style={{ fontSize: size.meta, color: 'var(--ink-body)' }}>
                "{parse.cleaned_text ?? item.raw_text}"{dueLabel && <> · due <b style={{ fontWeight: 600 }}>{dueLabel}</b></>}{projectName && <> · → {projectName}</>}
              </span>
              {!compact && (
                <span onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)', cursor: 'pointer' }}>
                  ✎ edit parse
                </span>
              )}
            </>
          ) : (
            <>
              <Chip tone="bordered">AI unsure · {pct}%</Chip>
              <span style={{ fontSize: size.meta, color: 'var(--ink-muted)', fontStyle: 'italic' }}>couldn't tell where this goes — it waits for you</span>
            </>
          )
        ) : (
          <span style={{ fontSize: size.meta, color: 'var(--ink-muted)', fontStyle: 'italic' }}>no AI read on this one — file it yourself</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 9, marginTop: 13, flexWrap: 'wrap' }}>
        {!compact && (
          <>
            <Select
              value={domainId}
              onChange={setDomainId}
              onEnterClosed={file}
              placeholder="Domain…"
              ariaLabel="Domain"
              style={{ fontSize: 12.5, padding: '7px 11px', gap: 8, border: '1px solid var(--line-card)' }}
              options={[{ value: '', label: 'Domain…' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
            />
            <div style={{ position: 'relative' }}>
              {projectId && (
                <span aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: projectDot(projectId), zIndex: 1, pointerEvents: 'none' }} />
              )}
              <Select
                value={projectId}
                onChange={setProjectId}
                onEnterClosed={file}
                placeholder="Project or area…"
                ariaLabel="Project"
                style={{ fontSize: 12.5, padding: '7px 11px', paddingLeft: projectId ? 22 : 11, gap: 8, border: '1px solid var(--line-card)' }}
                options={[{ value: '', label: 'Project or area…' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
            {dueLabel && <Chip tone="lavender">→ {dueLabel}</Chip>}
          </>
        )}
        <span style={{ flex: 1 }} />
        <Button type="button" variant="cta" onClick={file} style={{ fontSize: compact ? 11.5 : 12.5, padding: compact ? '7px 14px' : '8px 16px' }}>
          File as task
        </Button>
        <Button type="button" variant="secondary" onClick={(e) => setSnoozePos({ x: e.clientX, y: e.clientY })} style={{ fontSize: compact ? 11.5 : 12.5, padding: compact ? '7px 12px' : '8px 14px' }}>
          Snooze
        </Button>
        <Button type="button" variant="ghost" onClick={() => dismissInboxItem(item)} style={{ fontSize: compact ? 11.5 : 12.5, padding: '8px 6px' }}>
          Dismiss
        </Button>
      </div>

      {snoozePos && (
        <SnoozeMenu
          position={snoozePos}
          onClose={() => setSnoozePos(null)}
          onSnooze={(until) => { snoozeInboxItem(item, until); setSnoozePos(null) }}
          onSomeday={() => { snoozeInboxItem(item, new Date(Date.now() + 365 * 86_400_000).toISOString()); setSnoozePos(null) }}
        />
      )}
    </div>
  )
}

// ── GitHub-ranked row ──
function GithubRow({ item, compact, onFile, onDismiss }: { item: InboxItem; compact?: boolean; onFile: () => void; onDismiss: () => void }) {
  const payload = item.payload as { number?: number; rank?: number } | null
  return (
    <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: compact ? '10px 13px' : '13px 19px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <KindChip kind="github_issue" />
      <span style={{ flex: 1, fontSize: compact ? 12.5 : 14, color: 'var(--ink-body)' }}>{item.raw_text}</span>
      {!compact && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
          {payload?.number ? `#${payload.number} · ` : ''}{payload?.rank ? `rank ${payload.rank} · ` : ''}{daysAgo(item.created_at)}d
        </span>
      )}
      <Button type="button" variant="cta" onClick={onFile} style={{ fontSize: compact ? 10.5 : 12, padding: compact ? '6px 10px' : '7px 13px' }}>File</Button>
      {!compact && <Button type="button" variant="ghost" onClick={onDismiss} style={{ fontSize: 12, padding: '7px 4px' }}>Dismiss</Button>}
    </div>
  )
}

// ── 2a / 2b — Dismissed tab ──
function DismissedPanel({ items, compact }: { items: InboxItem[]; compact?: boolean }) {
  const today = items.filter((i) => isToday(i.updated_at))
  const earlier = items.filter((i) => !isToday(i.updated_at))

  function restoreAll() {
    items.forEach(restoreInboxItem)
  }
  function clearNow() {
    if (items.length === 0) return
    if (window.confirm(`Permanently delete ${items.length} dismissed item${items.length === 1 ? '' : 's'}? This can't be undone.`)) {
      items.forEach(purgeInboxItem)
    }
  }

  if (items.length === 0) {
    return <div style={{ marginTop: 18, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', padding: '8px 2px' }}>nothing composting right now</div>
  }

  return (
    <div style={{ marginTop: compact ? 12 : 16 }}>
      <div style={{ fontFamily: 'var(--font-hand)', fontSize: compact ? 14 : 17, color: '#7a745f', marginBottom: 12 }}>
        dismissed captures rest here, then compost after 30 days ✿
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 9 : 12, padding: compact ? '8px 11px' : '10px 14px', background: 'rgba(154,180,190,0.1)', border: '1px solid rgba(154,180,190,0.28)', borderRadius: compact ? 7 : 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 8.5 : 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>
          {items.length} dismissed · {compact ? 'clears after 30 days' : 'auto-clears after 30 days'}
        </span>
        <span style={{ flex: 1 }} />
        <span onClick={restoreAll} style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 8.5 : 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Restore all</span>
        {!compact && (
          <>
            <span style={{ width: 1, height: 14, background: 'var(--line-dashed)' }} />
            <span onClick={clearNow} style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}>Clear now</span>
          </>
        )}
      </div>

      {compact && <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', margin: '8px 0 4px' }}>swipe → any card to bring it back</div>}

      {today.length > 0 && <DismissedGroup label="Today" items={today} compact={compact} />}
      {earlier.length > 0 && <DismissedGroup label="Earlier" items={earlier} compact={compact} />}

      {!compact && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f' }}>
          a capture is never truly lost — it just goes quiet ✿
        </div>
      )}
    </div>
  )
}

function DismissedGroup({ label, items, compact }: { label: string; items: InboxItem[]; compact?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0 4px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 9 : 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{label} · {items.length}</span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      {items.map((item) => (compact ? <DismissedRowMobile key={item.id} item={item} /> : <DismissedRow key={item.id} item={item} />))}
    </div>
  )
}

function DismissedRow({ item }: { item: InboxItem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(42,36,32,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-hairline)', fontSize: 11, flex: 'none' }}>✕</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>{item.raw_text}</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 11 }}>
          <KindChip kind={item.kind} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>dismissed {dismissedAgo(item.updated_at)}</span>
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={() => restoreInboxItem(item)} style={{ fontSize: 11.5, padding: '6px 13px', color: 'var(--acc-terra)' }}>
        <RestoreIcon /> Restore
      </Button>
    </div>
  )
}

function DismissedRowMobile({ item }: { item: InboxItem }) {
  const swipe = useRestoreSwipe()
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px dashed var(--line-dashed)' }}>
      <div className="ib-swipe-actions">
        <div
          onClick={() => { restoreInboxItem(item); swipe.reset() }}
          style={{ width: SWIPE_MAX, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(122,148,110,0.94)', pointerEvents: swipe.x > 0 ? 'auto' : 'none', cursor: 'pointer' }}
        >
          <RestoreIcon color="var(--paper-parchment)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Restore</span>
        </div>
      </div>
      <div
        className="ib-swipe-content"
        {...swipe.handlers}
        style={{ position: 'relative', transform: `translateX(${swipe.x}px)`, transition: swipe.x === 0 || swipe.x === SWIPE_MAX ? 'transform 200ms var(--ease-spring)' : undefined, background: 'var(--paper-linen)', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 6px', boxShadow: swipe.x > 0 ? '-9px 0 12px rgba(60,52,38,0.14)' : undefined }}
      >
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(42,36,32,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-hairline)', fontSize: 10, flex: 'none' }}>✕</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.35 }}>{item.raw_text}</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>{KIND_LABEL[item.kind]} · {dismissedAgo(item.updated_at)}</div>
        </div>
      </div>
    </div>
  )
}

function RestoreIcon({ color = 'var(--acc-terra)' }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 1 1 2.3 5.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 18v-4h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
