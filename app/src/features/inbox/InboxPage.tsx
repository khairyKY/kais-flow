import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
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
import { useOpenTask } from '../tasks/openTask'
import { CaptureCta } from '../capture/CaptureCta'
import { ReadyScans, ScanPaperButton, SourceLabel } from '../paper/PaperInbox'
import { hydrangeaAsset } from '../../lib/gardenAssets'
import { useListKeys, type ListBinding } from '../../components/useListKeys'
import { Select } from '../../components/Select'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { Skeleton } from '../../components/States'
import { ConfirmCard } from '../projects/ConfirmCard'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { InboxBulkBar } from './InboxBulkBar'
import { rowAnchor } from '../../lib/rowAnchor'
import { Button, Chip, KeyCombo } from '../../components/kit'
import { animateRowRemoval, useMotionEnabled } from '../../lib/motion'
import { countWord, daysAgo, dismissedAgo, formatCaptured, formatDue, githubUrl, isToday } from './inboxDisplay'
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

// Motion 3e (WB-1) — every inbox removal exits through the F4 primitive: slide 200ms,
// collapse 180ms, *then* the mutation, so the gap heals instead of snapping shut. Both row
// types render `id="inbox-<id>"` (already there for roving focus), so the lookup is free.
function breatheOut(itemId: string, mutate: () => void) {
  animateRowRemoval(document.getElementById(`inbox-${itemId}`), mutate)
}

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
  voice: { background: 'color-mix(in srgb, var(--acc-terra) 12%, transparent)', color: 'var(--acc-terra)' },
  github_issue: { background: 'color-mix(in srgb, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)' },
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
  const { data: items = [], isPending: itemsPending } = usePendingInboxItems()
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
  // P6: github-sync doesn't rank (yet) — most recently updated on GitHub first.
  const ghUpdated = (i: InboxItem) => String((i.payload as { updated_at?: string } | null)?.updated_at ?? i.created_at)
  const githubItems = items.filter((i) => i.kind === 'github_issue').sort((a, b) => ghUpdated(b).localeCompare(ghUpdated(a)))
  const aiItems = items.filter((i) => i.kind !== 'github_issue')
  const orderedItems = [...aiItems, ...githubItems]

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects])
  const projectDot = (id: string | null | undefined) => {
    if (!id) return 'var(--acc-moss)'
    const idx = projects.findIndex((p) => p.id === id)
    return `var(${PROJECT_DOTS[idx >= 0 ? idx % PROJECT_DOTS.length : 0]})`
  }

  // ── D2/D3 (2026-07-18 audit): real multi-select. Bulk triage is design-future
  // ("Try next", Inbox.dc.html:395) — greenlit by Kai; selected styling follows Tasks'
  // sage language. deviation(2026-07-18 audit): not Overlays.dc.html's terra rows, per ruling. ──
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectionActive = selected.size > 0
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEscapeStack(selectionActive, clearSelection)

  // Selection follows the visible list — items that file/dismiss/restore away (or a tab
  // switch) drop out instead of ghost-counting in the bar.
  const visibleItems = tab === 'waiting' ? orderedItems : dismissedItems
  useEffect(() => {
    setSelected((prev) => {
      const live = [...prev].filter((id) => visibleItems.some((i) => i.id === id))
      return live.length === prev.size ? prev : new Set(live)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, allItems, tab])

  const selectedItems = visibleItems.filter((i) => selected.has(i.id))
  const [bulkFilePos, setBulkFilePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkSnoozePos, setBulkSnoozePos] = useState<{ x: number; y: number } | null>(null)

  function bulkToast(n: number, verb: string) {
    useToastStore.getState().push({ message: `${n} capture${n === 1 ? '' : 's'} ${verb}.` })
  }
  // ponytail: bulk = loop the existing single-item outbox helpers; no batch API needed.
  // `silent` on each call so N items produce one summary toast, not N stacked ones.
  function bulkFile(projectId: string | null, domainId: string | null) {
    const n = selectedItems.length
    selectedItems.forEach((i) => {
      const parse = i.ai_parse as AiParse | null
      fileToTask(i, { domainId, projectId, title: parse?.cleaned_text ?? undefined, silent: true })
    })
    bulkToast(n, 'filed')
    clearSelection()
  }
  function bulkSnooze(until: string) {
    const n = selectedItems.length
    selectedItems.forEach((i) => snoozeInboxItem(i, until, true))
    bulkToast(n, 'snoozed')
    clearSelection()
  }
  function bulkDismiss() {
    const n = selectedItems.length
    selectedItems.forEach((i) => dismissInboxItem(i, true))
    bulkToast(n, 'dismissed')
    clearSelection()
  }
  function bulkRestore() {
    const n = selectedItems.length
    selectedItems.forEach((i) => restoreInboxItem(i, true))
    bulkToast(n, 'restored')
    clearSelection()
  }

  function fileWithFloret(item: InboxItem, opts: Parameters<typeof fileToTask>[1]) {
    if (motion) {
      setFilingIds((s) => new Set(s).add(item.id))
      window.setTimeout(() => {
        // Motion 1c florets have drifted; now 3e closes the gap (2d: "source position heals").
        breatheOut(item.id, () => {
          fileToTask(item, opts)
          setFilingIds((s) => {
            const next = new Set(s)
            next.delete(item.id)
            return next
          })
        })
      }, 260)
    } else {
      fileToTask(item, opts)
    }
  }

  // Punch 26 — the strip promises E / D / S / ↑↓ / ⏎ and a 5-item triage on those keys alone.
  // Without this, every action drops focus (useListKeys clears a focusedId that leaves the
  // list) and the run becomes ↓E↓E↓E…; parking focus on the neighbour makes it E E E E E.
  // (hoisted; `setFocusedId` below is only read when a key actually fires, after render)
  function advance(item: InboxItem) {
    const idx = orderedItems.findIndex((i) => i.id === item.id)
    setFocusedId(orderedItems[idx + 1]?.id ?? orderedItems[idx - 1]?.id ?? null)
  }
  const bindings: ListBinding<InboxItem>[] = [
    {
      keys: ['e'],
      label: 'File with AI suggestion',
      run: (item) => {
        const parse = item.ai_parse as AiParse | null
        fileWithFloret(item, { domainId: parse?.domain_id ?? null, projectId: parse?.project_id ?? null, title: parse?.cleaned_text ?? undefined })
        advance(item)
      },
    },
    { keys: ['d'], label: 'Dismiss', run: (item) => { breatheOut(item.id, () => dismissInboxItem(item)); advance(item) } },
    { keys: ['s'], label: 'Snooze', run: (item) => setKbSnoozeId(item.id) },
    { keys: ['Enter'], label: 'Open (edit title)', run: (item) => setEditRequestId(item.id) },
  ]
  const { focusedId, setFocusedId } = useListKeys(orderedItems, bindings, {
    idPrefix: 'inbox-',
    // Pause list keys while the S popover is up, or D would dismiss the row behind it.
    active: tab === 'waiting' && !kbSnoozeId,
    onSelectAll: () => setSelected(new Set(orderedItems.map((i) => i.id))),
  })
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: isMobile ? '0.2em' : '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Inbox{isMobile ? '' : ' · universal triage'}
          </div>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 24 : 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>
            {zero ? 'Inbox zero' : `${countWord(items.length)} waiting`}
          </h1>
        </div>
      </div>
      {!isMobile && !zero && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-1.5deg)' }}>clear them and the hydrangea calms ✿</span>
          <CaptureCta />
        </div>
      )}
    </div>
  )

  // ── 2a/2b header — distinct eyebrow/title/icon from the Waiting header above ──
  const dismissedHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 14 }}>
      <img src={`${A}/hydrangea/medium.png`} alt="" style={{ height: isMobile ? 40 : 52, filter: 'var(--shadow-drop-sm) saturate(0.55)', opacity: 0.8 }} />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: isMobile ? '0.2em' : '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
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
      {/* Paper capture: a photo of your notes becomes tasks (Paper Capture.dc.html 11g / 11m). */}
      <span style={{ marginLeft: 'auto', paddingBottom: 6 }}>
        <ScanPaperButton />
      </span>
    </div>
  )

  return (
    <div style={{ maxWidth: isMobile ? undefined : 940, userSelect: selectionActive ? 'none' : undefined }}>
      {tab === 'dismissed' ? dismissedHeader : !zero && header}
      {tabsRow}
      {tab === 'waiting' && <ReadyScans />}

      {/* Kai 2026-10-06: a search / activity link to a capture that isn't in the waiting list —
          filed, dismissed, snoozed — landed on a page without it (or on the empty Inbox). It now
          always shows, above whatever the list holds. */}
      {tab === 'waiting' && focusedItem && !orderedItems.some((i) => i.id === focusedItem.id) && <ResolvedCard item={focusedItem} />}

      {tab === 'waiting' ? (
        itemsPending ? (
          <Skeleton />
        ) : zero ? (
          <EmptyInboxCard />
        ) : (
          <>
            {focusId && !bannerDismissed && aiItems.some((i) => i.id === focusId) && (
              <div style={deepLinkBannerStyle(isMobile)}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>
                  jumped here from Search — the ringed card below is your match
                </span>
                <span onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', cursor: 'pointer' }}>✕</span>
              </div>
            )}

            <div className='kf-dim' style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12, marginTop: 18 }}>
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
                  selected={selected.has(item.id)}
                  selectionActive={selectionActive}
                  onToggleSelect={() => toggleSelected(item.id)}
                  onFile={fileWithFloret}
                />
              ))}
            </div>

            {githubItems.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: isMobile ? '22px 0 10px' : '30px 0 10px' }}>
                  {/* WB-4 punch 9: no hardcoded sample repo here — each row names its own (payload.repo). */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>GitHub · recently updated</span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{githubItems.length} open</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {githubItems.map((item) => (
                    <GithubRow
                      key={item.id}
                      item={item}
                      compact={isMobile}
                      highlighted={item.id === focusId || item.id === focusedId}
                      selected={selected.has(item.id)}
                      selectionActive={selectionActive}
                      onToggleSelect={() => toggleSelected(item.id)}
                      onFile={() => fileWithFloret(item, {})}
                      onDismiss={() => breatheOut(item.id, () => dismissInboxItem(item))}
                    />
                  ))}
                </div>
              </>
            )}

            {!isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 28, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {/* J-17: each key is a keycap (the `?` overlay's chip), not a bold letter. */}
                {([[['E'], 'file'], [['D'], 'dismiss'], [['S'], 'snooze'], [['↑', '↓'], 'move'], [['⏎'], 'open']] as const).map(([keys, label]) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <KeyCombo keys={keys} size="sm" />
                    {label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto' }}>one keystroke per capture — that's the whole game</span>
              </div>
            )}
          </>
        )
      ) : (
        <DismissedPanel items={dismissedItems} compact={isMobile} selected={selected} onToggleSelect={toggleSelected} />
      )}

      {kbSnoozeTask && (
        <SnoozeMenu
          position={rowAnchor('inbox-', kbSnoozeTask.id)}
          title={kbSnoozeTask.raw_text}
          onClose={() => setKbSnoozeId(null)}
          onSnooze={(until) => { snoozeInboxItem(kbSnoozeTask, until); advance(kbSnoozeTask); setKbSnoozeId(null) }}
          onSomeday={() => { snoozeInboxItem(kbSnoozeTask, new Date(Date.now() + 365 * 86_400_000).toISOString()); advance(kbSnoozeTask); setKbSnoozeId(null) }}
        />
      )}

      {selectionActive && (
        <InboxBulkBar
          count={selected.size}
          onFileTo={tab === 'waiting' ? (e) => setBulkFilePos({ x: e.clientX, y: e.clientY }) : undefined}
          onSnooze={tab === 'waiting' ? (e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY }) : undefined}
          onDismiss={tab === 'waiting' ? bulkDismiss : undefined}
          onRestore={tab === 'dismissed' ? bulkRestore : undefined}
          onClear={clearSelection}
        />
      )}
      {bulkFilePos && (
        <ProjectPicker position={bulkFilePos} projects={projects} domains={domains} currentProjectId={null} onSelect={bulkFile} onClose={() => setBulkFilePos(null)} />
      )}
      {bulkSnoozePos && (
        <SnoozeMenu
          position={bulkSnoozePos}
          onClose={() => setBulkSnoozePos(null)}
          onSnooze={(until) => { bulkSnooze(until); setBulkSnoozePos(null) }}
          onSomeday={() => { bulkSnooze(new Date(Date.now() + 365 * 86_400_000).toISOString()); setBulkSnoozePos(null) }}
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
const tabCountStyle: React.CSSProperties = { marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }
function tabUnderline(color: string): React.CSSProperties {
  return { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: color, borderRadius: 2 }
}
function deepLinkBannerStyle(isMobile: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'color-mix(in srgb, var(--acc-hydrangea) 14%, transparent)',
    border: '1px solid color-mix(in srgb, var(--acc-hydrangea) 35%, transparent)',
    borderRadius: 6,
    padding: isMobile ? '8px 11px' : '9px 14px',
    marginTop: isMobile ? 14 : 24,
  }
}

// ── 1b — Inbox zero ──
function EmptyInboxCard() {
  const motion = useMotionEnabled()
  return (
    <div style={{ padding: '60px 20px 54px', textAlign: 'center' }}>
      {/* D1 (2026-07-18 audit): margin:0 auto — Tailwind Preflight's img{display:block} defeats
          the card's text-align:center; this restores Inbox.dc.html 1b's centered bloom. */}
      {/* Effects 1e (WB-1) — bloom glow on a data-driven milestone. Projects use p100; the
          inbox's milestone is zero itself, which is what "one calm bloom ✿" below names. */}
      <span style={{ position: 'relative', display: 'inline-block' }}>
        {motion && <span className="kf-bloom" style={{ inset: -22 }} />}
        <img src={`${A}/hydrangea/zero.png`} alt="" style={{ height: 88, margin: '0 auto', position: 'relative', filter: 'var(--shadow-drop-sm)' }} />
      </span>
      <div style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink-body)' }}>Inbox zero</div>
      <p style={{ margin: '10px auto 0', maxWidth: 330, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-muted)' }}>
        Captures land here when the command bar can't tell where they go. Nothing waits on you.
      </p>
      <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-1deg)' }}>one calm bloom ✿</div>
    </div>
  )
}

// ── Already-resolved deep-link target (filed elsewhere / dismissed) ──
function ResolvedCard({ item }: { item: InboxItem }) {
  const filed = item.status === 'filed'
  const openTask = useOpenTask()
  // A pending capture outside the waiting list is a snoozed one.
  const state = filed ? 'already filed as a task' : item.status === 'dismissed' ? 'dismissed' : item.snoozed_until ? `snoozed · back ${new Date(item.snoozed_until).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'waiting'
  return (
    <div id={`inbox-${item.id}`} style={{ background: 'var(--paper-bone)', border: '1px dashed var(--line-solid)', borderRadius: 3, padding: '13px 19px', marginTop: 18, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 0 0 3px color-mix(in srgb, var(--acc-hydrangea) 30%, transparent)' }}>
      <span style={{ width: 15, height: 15, borderRadius: 4, background: filed ? 'var(--sig-done)' : 'var(--ink-hairline)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <span style={{ color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)' }}>✓</span>
      </span>
      <span style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}><EmojiText text={item.raw_text} /></span>
      <Chip tone="sage" style={filed ? undefined : { background: 'rgba(107,100,85,0.14)', color: 'var(--ink-faint)' }}>
        {state}
      </Chip>
      {/* Wave N: the task it became (the sheet on a phone); a plain href reloaded the whole app. */}
      {filed && item.filed_task_id && (
        <button type="button" className="kf-hit" onClick={() => openTask(item.filed_task_id!)} style={{ marginLeft: 'auto', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
          open task →
        </button>
      )}
    </div>
  )
}

// ── D2/D3 — selection checkbox, TaskRow's checkbox language (hover-reveal via .ib-select-box).
// stopPropagation so the row/card surface handler doesn't re-toggle (deselect must stick). ──
function SelectBox({ selected, active, onToggle, marginTop = 3 }: { selected?: boolean; active?: boolean; onToggle: () => void; marginTop?: number }) {
  return (
    <span
      role="checkbox"
      aria-checked={!!selected}
      aria-label="Select capture"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={`ib-select-box${selected || active ? ' on' : ''}`}
      style={{ width: 15, height: 15, marginTop, flex: 'none', borderRadius: 4, border: '1.5px solid var(--acc-sage)', background: selected ? 'var(--acc-sage)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', lineHeight: 1, cursor: 'pointer' }}
    >
      {selected ? '✓' : ''}
    </span>
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
  selected,
  selectionActive,
  onToggleSelect,
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
  selected?: boolean
  selectionActive?: boolean
  onToggleSelect?: () => void
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
      data-tour="inbox-item"
      // Motion 4a + 3e (WB-1). kf-lift-TILT, not kf-lift: the card carries a pasted-in
      // rotation, and the plain lift would erase it on hover. The tilt moves to --kf-tilt so
      // the class owns `transform` outright (an inline one can't be overridden on :hover).
      className="ib-card kf-lift-tilt kf-row-in"
      tabIndex={highlighted ? 0 : -1}
      onClick={(e) => {
        // Card-surface click toggles select; anything interactive (buttons, inputs, the Select
        // popovers, title-edit, edit-parse) opts out so every existing action stays untouched.
        if (!onToggleSelect) return
        if ((e.target as HTMLElement).closest('button, input, a, [role="listbox"], [data-no-select]')) return
        onToggleSelect()
      }}
      style={{
        ['--kf-tilt' as string]: `${rotate}deg`,
        position: 'relative',
        background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, var(--paper-parchment))' : 'var(--paper-parchment)',
        border: '1px solid var(--line-card)',
        outline: highlighted ? '2px solid color-mix(in srgb, var(--acc-hydrangea) 50%, transparent)' : 'none',
        outlineOffset: 2,
        borderRadius: 3,
        boxShadow: `${selected ? 'inset 2px 0 0 var(--acc-sage), ' : ''}${highlighted ? 'var(--shadow-card)' : 'var(--shadow-crisp)'}`,
        padding: size.pad,
        overflow: 'hidden',
        opacity: filing ? 0.55 : 1,
        // Must re-declare transform/box-shadow: an inline `transition` replaces the class's
        // wholesale, and without them the 4a lift would snap instead of easing.
        transition: 'opacity 200ms var(--ease-out), transform var(--dur-quick) var(--ease-out), box-shadow var(--dur-quick) var(--ease-out)',
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
        {onToggleSelect && <SelectBox selected={selected} active={selectionActive} onToggle={onToggleSelect} />}
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
          <div data-no-select onClick={() => setEditing(true)} title="Tap to edit the title before filing" style={{ flex: 1, minWidth: 0, fontSize: size.title, color: 'var(--ink-body)', lineHeight: 1.45, cursor: 'text', overflowWrap: 'anywhere' }}>
            {title}
          </div>
        )}
        {/* Polish F2b: on a phone this unbreakable caption took half the row and squeezed the
            title into a word-per-line column. 1c gives the text the card's full width; the
            caption moves to the end of the chip row below. */}
        {!compact && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', flex: 'none' }}>
            <SourceLabel item={item} label={KIND_LABEL[item.kind]} /> · {formatCaptured(item.created_at)}
          </span>
        )}
      </div>

      {compact ? (
        // Inbox.dc.html 1c: the AI read as a row of chips under the text (no tinted bar — the
        // title above already shows the cleaned text), wrapping as the width needs.
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 9 }}>
          {parse ? (
            confident ? (
              <>
                <Chip tone="hydrangea" style={{ background: 'color-mix(in srgb, var(--acc-hydrangea) 30%, transparent)' }}>AI · {parse.kind ?? 'note'} · {pct}%</Chip>
                {dueLabel && <Chip tone="lavender">→ {dueLabel}</Chip>}
                {projectName && <Chip tone="sage">{projectName}</Chip>}
              </>
            ) : (
              <Chip tone="bordered">AI unsure · {pct}%</Chip>
            )
          ) : (
            <span style={{ fontSize: size.meta, color: 'var(--ink-muted)', fontStyle: 'italic' }}>no AI read on this one — file it yourself</span>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
            <SourceLabel item={item} label={KIND_LABEL[item.kind]} /> · {formatCaptured(item.created_at)}
          </span>
        </div>
      ) : (
      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 9, background: confident ? 'color-mix(in srgb, var(--acc-hydrangea) 14%, transparent)' : 'var(--paper-bone)', borderRadius: 6, padding: size.barPad, flexWrap: 'wrap' }}>
        {parse ? (
          confident ? (
            <>
              <Chip tone="hydrangea" style={{ background: 'color-mix(in srgb, var(--acc-hydrangea) 30%, transparent)' }}>AI · {parse.kind ?? 'note'} · {pct}%</Chip>
              <span style={{ fontSize: size.meta, color: 'var(--ink-body)' }}>
                "<EmojiText text={parse.cleaned_text ?? item.raw_text} />"{dueLabel && <> · due <b style={{ fontWeight: 600 }}>{dueLabel}</b></>}{projectName && <> · → {projectName}</>}
              </span>
              {!compact && (
                <span data-no-select onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)', cursor: 'pointer' }}>
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
      )}

      {/* 1c: on a phone the actions sit under a dashed rule, File first and Dismiss at the far edge. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 9, marginTop: compact ? 11 : 13, flexWrap: 'wrap', ...(compact ? { paddingTop: 10, borderTop: '1px dashed var(--line-dashed)' } : null) }}>
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
        {!compact && <span style={{ flex: 1 }} />}
        <Button type="button" variant="cta" onClick={file} style={{ fontSize: compact ? 11.5 : 12.5, padding: compact ? '7px 14px' : '8px 16px' }}>
          File as task
        </Button>
        <Button type="button" variant="secondary" onClick={(e) => setSnoozePos({ x: e.clientX, y: e.clientY })} style={{ fontSize: compact ? 11.5 : 12.5, padding: compact ? '7px 12px' : '8px 14px' }}>
          Snooze
        </Button>
        <Button type="button" variant="ghost" onClick={() => breatheOut(item.id, () => dismissInboxItem(item))} style={{ fontSize: compact ? 11.5 : 12.5, padding: '8px 6px', ...(compact ? { marginLeft: 'auto' } : null) }}>
          Dismiss
        </Button>
      </div>

      {snoozePos && (
        <SnoozeMenu
          position={snoozePos}
          title={item.raw_text}
          onClose={() => setSnoozePos(null)}
          onSnooze={(until) => { snoozeInboxItem(item, until); setSnoozePos(null) }}
          onSomeday={() => { snoozeInboxItem(item, new Date(Date.now() + 365 * 86_400_000).toISOString()); setSnoozePos(null) }}
        />
      )}
    </div>
  )
}

// ── GitHub row (P6 step 4): source glyph · title · repo#n ↗ · labels · age. No AI rank — the
// group is ordered by the issue's last update (github-sync's ponytail note). ──
function GithubRow({ item, compact, highlighted, selected, selectionActive, onToggleSelect, onFile, onDismiss }: { item: InboxItem; compact?: boolean; highlighted?: boolean; selected?: boolean; selectionActive?: boolean; onToggleSelect?: () => void; onFile: () => void; onDismiss: () => void }) {
  const payload = item.payload as { number?: number; repo?: string; url?: string; labels?: unknown[]; created_at?: string | null } | null
  const issueUrl = githubUrl(payload?.url)
  const ref = `${payload?.repo ?? ''}${payload?.number ? `#${payload.number}` : ''}`
  const labels = (payload?.labels ?? []).filter((l): l is string => typeof l === 'string' && l !== '')
  const meta = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-faint)' } as const
  // The issue's own age; rows stored before it was kept fall back to when they arrived.
  const age = daysAgo(payload?.created_at ?? item.created_at)
  return (
    <div
      id={`inbox-${item.id}`}
      className="ib-card kf-lift kf-row-in"
      // Punch 26: these rows are in the same roving-focus list as the triage cards, so they
      // need the same focusable/ringed treatment — without it a keyboard triage that reaches
      // the GitHub group loses all sense of where it is.
      tabIndex={highlighted ? 0 : -1}
      onClick={(e) => {
        if (!onToggleSelect) return
        if ((e.target as HTMLElement).closest('button, input, a, [data-no-select]')) return
        onToggleSelect()
      }}
      style={{ background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, var(--paper-parchment))' : 'var(--paper-parchment)', border: '1px solid var(--line-card)', outline: highlighted ? '2px solid color-mix(in srgb, var(--acc-hydrangea) 50%, transparent)' : 'none', outlineOffset: 2, borderRadius: 3, boxShadow: `${selected ? 'inset 2px 0 0 var(--acc-sage), ' : ''}${highlighted ? 'var(--shadow-card)' : 'var(--shadow-crisp)'}`, padding: compact ? '10px 13px' : '13px 19px', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      {onToggleSelect && <SelectBox selected={selected} active={selectionActive} onToggle={onToggleSelect} marginTop={0} />}
      <svg role="img" aria-label="GitHub issue" width="16" height="16" viewBox="0 0 24 24" fill="var(--ink-muted)" style={{ flex: 'none' }}>
        <title>GitHub issue</title>
        <path d="M12 2C6.5 2 2 6.6 2 12.3c0 4.6 2.9 8.4 6.8 9.8.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 4-2.4 4.8-4.6 5.1.4.3.7 1 .7 1.9v2.8c0 .3.2.6.7.5a10.2 10.2 0 0 0 6.8-9.8C22 6.6 17.5 2 12 2Z" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12.5 : 14, color: 'var(--ink-body)' }}>{item.raw_text}</div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {ref && (issueUrl ? (
            <a href={issueUrl} target="_blank" rel="noopener noreferrer" style={{ ...meta, color: 'var(--ink-muted)' }}>{ref} ↗</a>
          ) : (
            <span style={meta}>{ref}</span>
          ))}
          {labels.slice(0, 3).map((l) => (
            <span key={l} style={{ ...meta, color: 'var(--ink-faint)', padding: '0 7px', border: '1px solid var(--line-solid)', borderRadius: 999 }}>{l}</span>
          ))}
          {labels.length > 3 && <span style={meta}>+{labels.length - 3}</span>}
          <span style={meta} title={payload?.created_at ? 'opened on GitHub' : 'in the inbox'}>{age}d</span>
        </div>
      </div>
      <Button type="button" variant="cta" onClick={onFile} style={{ fontSize: compact ? 10.5 : 12, padding: compact ? '6px 10px' : '7px 13px' }}>File</Button>
      {!compact && <Button type="button" variant="ghost" onClick={onDismiss} style={{ fontSize: 12, padding: '7px 4px' }}>Dismiss</Button>}
    </div>
  )
}

// ── 2a / 2b — Dismissed tab ──
function DismissedPanel({ items, compact, selected, onToggleSelect }: { items: InboxItem[]; compact?: boolean; selected: Set<string>; onToggleSelect: (id: string) => void }) {
  // Punch 14: in-app ConfirmCard replaces the native confirm popup
  const [confirmClear, setConfirmClear] = useState(false)
  const today = items.filter((i) => isToday(i.updated_at))
  const earlier = items.filter((i) => !isToday(i.updated_at))

  function restoreAll() {
    // Arrow, not a bare reference: forEach's index would land in `silent`.
    items.forEach((i) => restoreInboxItem(i, true))
    useToastStore.getState().push({ message: `${items.length} capture${items.length === 1 ? '' : 's'} restored.` })
  }
  function clearNow() {
    if (items.length === 0) return
    setConfirmClear(true)
  }

  if (items.length === 0) {
    return <div style={{ marginTop: 18, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', padding: '8px 2px' }}>nothing composting right now</div>
  }

  return (
    <div style={{ marginTop: compact ? 12 : 16 }}>
      <div style={{ fontFamily: 'var(--font-hand)', fontSize: compact ? 14 : 17, color: 'var(--ink-hand, #7a745f)', marginBottom: 12 }}>
        dismissed captures rest here, then compost after 30 days ✿
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 9 : 12, padding: compact ? '8px 11px' : '10px 14px', background: 'color-mix(in srgb, var(--acc-hydrangea) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--acc-hydrangea) 28%, transparent)', borderRadius: compact ? 7 : 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc-hydrangea)', flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 8.5 : 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>
          {items.length} dismissed · {compact ? 'clears after 30 days' : 'auto-clears after 30 days'}
        </span>
        <span style={{ flex: 1 }} />
        <span onClick={restoreAll} style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 8.5 : 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Restore all</span>
        {!compact && (
          <>
            <span style={{ width: 1, height: 14, background: 'var(--line-dashed)' }} />
            <span onClick={clearNow} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}>Clear now</span>
          </>
        )}
      </div>

      {compact && <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)', margin: '8px 0 4px' }}>swipe → any card to bring it back</div>}

      {today.length > 0 && <DismissedGroup label="Today" items={today} compact={compact} selected={selected} onToggleSelect={onToggleSelect} />}
      {earlier.length > 0 && <DismissedGroup label="Earlier" items={earlier} compact={compact} selected={selected} onToggleSelect={onToggleSelect} />}

      {!compact && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)' }}>
          a capture is never truly lost — it just goes quiet ✿
        </div>
      )}
      {confirmClear && (
        <ConfirmCard
          title={`Permanently delete ${items.length} dismissed item${items.length === 1 ? '' : 's'}?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => { setConfirmClear(false); items.forEach(purgeInboxItem) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}

function DismissedGroup({ label, items, compact, selected, onToggleSelect }: { label: string; items: InboxItem[]; compact?: boolean; selected: Set<string>; onToggleSelect: (id: string) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0 4px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 9 : 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{label} · {items.length}</span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      </div>
      {items.map((item) =>
        compact ? (
          // ponytail: mobile Dismissed keeps swipe→restore only; bulk select is a desktop flow.
          <DismissedRowMobile key={item.id} item={item} />
        ) : (
          <DismissedRow key={item.id} item={item} selected={selected.has(item.id)} selectionActive={selected.size > 0} onToggleSelect={() => onToggleSelect(item.id)} />
        ),
      )}
    </div>
  )
}

function DismissedRow({ item, selected, selectionActive, onToggleSelect }: { item: InboxItem; selected?: boolean; selectionActive?: boolean; onToggleSelect?: () => void }) {
  return (
    <div
      className="ib-row"
      onClick={(e) => {
        if (!onToggleSelect) return
        if ((e.target as HTMLElement).closest('button, input, a, [data-no-select]')) return
        onToggleSelect()
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 10px', margin: '0 -10px', borderRadius: 7, borderBottom: '1px dashed var(--line-dashed)', background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, transparent)' : undefined, boxShadow: selected ? 'inset 2px 0 0 var(--acc-sage)' : undefined }}
    >
      {onToggleSelect && <SelectBox selected={selected} active={selectionActive} onToggle={onToggleSelect} marginTop={0} />}
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(42,36,32,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 11, flex: 'none' }}>✕</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, color: 'var(--ink-muted)', lineHeight: 1.4 }}>{item.raw_text}</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 11 }}>
          <KindChip kind={item.kind} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>dismissed {dismissedAgo(item.updated_at)}</span>
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
          style={{ width: SWIPE_MAX, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'color-mix(in srgb, var(--acc-moss) 94%, transparent)', pointerEvents: swipe.x > 0 ? 'auto' : 'none', cursor: 'pointer' }}
        >
          <RestoreIcon color="var(--paper-parchment)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--paper-parchment)' }}>Restore</span>
        </div>
      </div>
      <div
        className="ib-swipe-content"
        {...swipe.handlers}
        style={{ position: 'relative', transform: swipe.x !== 0 ? `translateX(${swipe.x}px)` : undefined, transition: swipe.x === 0 || swipe.x === SWIPE_MAX ? 'transform 200ms var(--ease-spring)' : undefined, background: 'var(--paper-linen)', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 6px', boxShadow: swipe.x > 0 ? '-9px 0 12px rgba(var(--kf-shadow-rgb, 60,52,38),0.14)' : undefined }}
      >
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(42,36,32,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-meta)', flex: 'none' }}>✕</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.35 }}>{item.raw_text}</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{KIND_LABEL[item.kind]} · {dismissedAgo(item.updated_at)}</div>
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
