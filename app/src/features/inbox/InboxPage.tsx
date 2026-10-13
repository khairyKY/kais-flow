import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
import {
  usePendingInboxItems,
  useAllInboxItems,
  dismissInboxItem,
  snoozeInboxItem,
  restoreInboxItem,
  fileCapture,
  fileDone,
  fileMany,
  dismissMany,
  snoozeMany,
  restoreMany,
  purgeMany,
  type FileTo,
} from './api'
import { useAreas } from '../areas/api'
import { useDomains } from '../domains/api'
import { usePeople } from '../people/api'
import { useProjects } from '../projects/api'
import { githubRulesOf, useIntegrations } from '../settings/api'
import { useOpenTask } from '../tasks/openTask'
import { MovePicker } from '../tasks/MovePicker'
import { SelectCircle, SwipeRow } from '../tasks/SwipeRow'
import type { MoveTarget } from '../tasks/move'
import { listState } from '../journal/journalDay'
import { CaptureCta } from '../capture/CaptureCta'
import { ReadyScans, ScanPaperButton } from '../paper/PaperInbox'
import { useListKeys, type ListBinding } from '../../components/useListKeys'
import { INBOX_KEYS } from '../../lib/shortcuts'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { useIsMobile } from '../../components/BottomSheet'
import { ErrorCard, OfflineChip, Skeleton } from '../../components/States'
import { Button, Chip, Segmented } from '../../components/kit'
import { useEscapeStack } from '../../lib/overlayStack'
import { useOnline } from '../../lib/useOnline'
import { rowAnchor } from '../../lib/rowAnchor'
import { animateRowRemoval, useMotionEnabled } from '../../lib/motion'
import { scheduleToday } from '../../lib/dateShortcuts'
import { DragRow, type DragLoad } from '../../components/drag'
import { inboxVerdict, type FileSpot } from '../tasks/fileDrop'
import { InboxBulkBar } from './InboxBulkBar'
import { GithubRow, SelectBox, TriageCard } from './InboxCards'
import { backLabel, dayWord, defaultDraft, dismissedAgo, draftText, githubHeading, inboxSummary, isToday, KIND_LABEL, mentionedPerson, snoozedOf, type Draft } from './inboxDisplay'
import { Icon } from '../../components/Icon'
import type { InboxItem, InboxKind } from '../../lib/types'
import './Inbox.css'

// ── Inbox — pixel contract: Inbox.dc.html 3a (desktop, reviewed pass) + 3b (iPhone, reviewed pass),
// 1b (inbox zero), 2a/2b (Dismissed, swipe → restore). Header = "Inbox" + one honest summary line +
// the Waiting | Dismissed toggle; keys live on the buttons (no footer); cards sit flat. Later rulings
// kept on top of 3a: Capture in the desktop header (Kai 2026-10-07) and Scan paper (Paper Capture
// 11g/11m). Effects/motion: Motion 1c floret drift on file, 3e breathe-out on every removal. ──

const A = '/ds/assets'

// Motion 3e (WB-1) — every inbox removal exits through the F4 primitive: slide 200ms,
// collapse 180ms, *then* the mutation, so the gap heals instead of snapping shut.
function breatheOut(itemId: string, mutate: () => void) {
  animateRowRemoval(document.getElementById(`inbox-${itemId}`), mutate)
}

// Snoozed has no frame: the header's "· N snoozed" opens it, and the same toggle leads back.
type Tab = 'waiting' | 'dismissed' | 'snoozed'

export function InboxPage() {
  const pendingQ = usePendingInboxItems()
  const items = useMemo(() => pendingQ.data ?? [], [pendingQ.data])
  const { data: allItems = [] } = useAllInboxItems()
  const { data: domains = [] } = useDomains()
  const { data: areas = [] } = useAreas()
  const { data: projects = [] } = useProjects()
  const { data: people = [] } = usePeople()
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const focusedItem = focusId ? allItems.find((i) => i.id === focusId) : undefined
  const isMobile = useIsMobile()
  const motion = useMotionEnabled()
  const online = useOnline()
  const state = listState(pendingQ, online)
  const now = new Date()

  const [tab, setTab] = useState<Tab>('waiting')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [filingIds, setFilingIds] = useState<Set<string>>(new Set())
  const [kbSnoozeId, setKbSnoozeId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const dismissedItems = useMemo(
    () => allItems.filter((i) => i.status === 'dismissed').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [allItems],
  )
  const snoozedItems = snoozedOf(allItems, now)
  // P6: github-sync doesn't rank (yet) — most recently updated on GitHub first.
  const ghUpdated = (i: InboxItem) => String((i.payload as { updated_at?: string } | null)?.updated_at ?? i.created_at)
  const githubItems = items.filter((i) => i.kind === 'github_issue').sort((a, b) => ghUpdated(b).localeCompare(ghUpdated(a)))
  const captures = items.filter((i) => i.kind !== 'github_issue')
  // Settings 2a "Priority in inbox ordering": High puts the GitHub letters above your own captures,
  // Normal below them (as before), Low below them and folded to the heading (a deep link unfolds).
  const { data: integrations = [] } = useIntegrations()
  const ghPriority = githubRulesOf(integrations.find((i) => i.provider === 'github')).rules.priority
  const [ghOpen, setGhOpen] = useState(false)
  const ghFolded = ghPriority === 'low' && !ghOpen && !githubItems.some((i) => i.id === focusId)
  const orderedItems = ghPriority === 'high' ? [...githubItems, ...captures] : ghFolded ? captures : [...captures, ...githubItems]
  const ghRepos = new Set(githubItems.map((i) => (i.payload as { repo?: string } | null)?.repo))

  const draftOf = (i: InboxItem) => drafts[i.id] ?? defaultDraft(i, projects, domains)
  const personOf = (i: InboxItem) => mentionedPerson(i.raw_text, people)
  const setDraft = (id: string, d: Draft) => setDrafts((all) => ({ ...all, [id]: d }))
  const openCard = (id: string) => setOpenIds((s) => (s.has(id) ? s : new Set(s).add(id)))
  const toggleOpen = (id: string) =>
    setOpenIds((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const colorOf = (t: MoveTarget) => {
    const own = t.kind === 'project' ? projects.find((p) => p.id === t.id)?.color : t.kind === 'area' ? areas.find((a) => a.id === t.id)?.color : null
    const domainId = t.kind === 'domain' ? t.id : t.kind === 'none' ? null : t.domainId
    return own || domains.find((d) => d.id === domainId)?.color || 'var(--acc-moss)'
  }

  /** A card's draft as the write it means: a task (title, date, place), today's journal, a person. */
  function toFileTo(item: InboxItem, d: Draft): FileTo {
    const text = draftText(item, d)
    const person = d.to === 'person' ? people.find((p) => p.id === d.personId) : undefined
    if (person) return { to: 'person', person, summary: text }
    if (d.to === 'journal') return { to: 'journal', body: text }
    return { to: 'task', title: text, dueAt: d.dueAt, place: d.place }
  }

  // ── D2/D3 (2026-07-18 audit): real multi-select; selected styling follows Tasks' sage language.
  // deviation(2026-07-18 audit): not Overlays.dc.html's terra rows, per ruling. ──
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectionActive = selected.size > 0
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEscapeStack(selectionActive, clearSelection)

  // Selection follows the visible list — items that file/dismiss/restore away (or a tab
  // switch) drop out instead of ghost-counting in the bar.
  const visibleItems = tab === 'waiting' ? orderedItems : tab === 'dismissed' ? dismissedItems : snoozedItems
  useEffect(() => {
    setSelected((prev) => {
      const live = [...prev].filter((id) => visibleItems.some((i) => i.id === id))
      return live.length === prev.size ? prev : new Set(live)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, allItems, tab])

  const selectedItems = visibleItems.filter((i) => selected.has(i.id))
  const [bulkMovePos, setBulkMovePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkSnoozePos, setBulkSnoozePos] = useState<{ x: number; y: number } | null>(null)

  // Bulk = ONE toast with ONE Undo for the whole selection (api fileMany / dismissMany / …).
  function bulkFileTo(place: MoveTarget) {
    fileMany(selectedItems.map((i) => [i, { to: 'task', title: draftText(i, { ...draftOf(i), to: 'task' }), dueAt: draftOf(i).dueAt, place }] as const))
    clearSelection()
  }
  function bulkFileAsDrafted(sel: InboxItem[]) {
    fileMany(sel.map((i) => [i, toFileTo(i, draftOf(i))] as const))
    clearSelection()
  }
  function bulkSnooze(until: string) {
    snoozeMany(selectedItems, until)
    clearSelection()
  }
  // Someday = a someday task (Tasks › Someday, no date) with the card's title and place — it used to
  // be a 365-day snooze, so the capture vanished for a year (product audit, Inbox row).
  const asSomeday = (i: InboxItem) => [i, { to: 'task', title: draftText(i, { ...draftOf(i), to: 'task' }), dueAt: null, place: draftOf(i).place, someday: true }] as const
  const somedayOne = (item: InboxItem) => breatheOut(item.id, () => fileMany([asSomeday(item)]))
  // P7e A8: Space files the capture as a task already done (Akiflow's "done now"), with its card's title, date and place.
  const asDone = (i: InboxItem) => [i, { to: 'task', title: draftText(i, { ...draftOf(i), to: 'task' }), dueAt: draftOf(i).dueAt, place: draftOf(i).place }] as const
  const doneOne = (item: InboxItem) => breatheOut(item.id, () => fileDone([asDone(item)]))
  function bulkDone(sel: InboxItem[]) {
    fileDone(sel.map(asDone))
    clearSelection()
  }
  // P7e A8: P opens the card's own date picker. A compact or unsure card opens full first, and a note
  // or person draft turns into a task (only a task has a date). GitHub rows have no date to plan.
  function planOne(item: InboxItem) {
    if (item.kind === 'github_issue') return
    const d = draftOf(item)
    if (d.to !== 'task') setDraft(item.id, { ...d, to: 'task', personId: null })
    openCard(item.id)
    // ponytail: presses the card's own Due date field once it has rendered — the same picker a click opens.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#inbox-${item.id} [aria-label="Due date"]`)?.click())
  }
  function bulkSomeday() {
    fileMany(selectedItems.map(asSomeday))
    clearSelection()
  }
  function bulkDismiss(sel: InboxItem[] = selectedItems) {
    dismissMany(sel)
    clearSelection()
  }
  function bulkRestore(sel: InboxItem[] = selectedItems) {
    restoreMany(sel)
    clearSelection()
  }

  function fileOne(item: InboxItem, d: Draft) {
    const write = () => fileCapture(item, toFileTo(item, d))
    if (!motion || isMobile) {
      breatheOut(item.id, write)
      return
    }
    setFilingIds((s) => new Set(s).add(item.id))
    window.setTimeout(() => {
      // Motion 1c florets have drifted; now 3e closes the gap (2d: "source position heals").
      breatheOut(item.id, () => {
        write()
        setFilingIds((s) => {
          const next = new Set(s)
          next.delete(item.id)
          return next
        })
      })
    }, 260)
  }
  const dismissOne = (item: InboxItem) => breatheOut(item.id, () => dismissInboxItem(item))

  // Motion 2c/2d: a computer drags a capture (with the rest of the selection when it's part of one)
  // onto the sidebar's Today — filed as a task due today, with its card's title and place; the source
  // heals (3e). E and the card's File do the same by key and tap.
  function dragLoad(item: InboxItem): DragLoad<FileSpot> {
    const ids = selected.has(item.id) && selected.size > 1 ? [item.id, ...selectedItems.filter((i) => i.id !== item.id).map((i) => i.id)] : [item.id]
    const asTask = (i: InboxItem) => [i, { to: 'task', title: draftText(i, { ...draftOf(i), to: 'task' }), dueAt: scheduleToday(), place: draftOf(i).place }] as const
    return {
      ids,
      label: draftText(item, { ...draftOf(item), to: 'task' }),
      verdict: inboxVerdict,
      drop: () => {
        const pairs = ids.flatMap((id) => orderedItems.filter((i) => i.id === id)).map(asTask)
        if (pairs.length !== 1) {
          fileMany(pairs)
          clearSelection()
        } else breatheOut(item.id, () => fileMany(pairs))
      },
    }
  }

  // Punch 26: park focus on the neighbour after a key action, so a triage run is E E E E, not ↓E↓E.
  // (hoisted; `setFocusedId` below is only read when a key actually fires, after render)
  function advance(item: InboxItem) {
    const idx = orderedItems.findIndex((i) => i.id === item.id)
    setFocusedId(orderedItems[idx + 1]?.id ?? orderedItems[idx - 1]?.id ?? null)
  }
  // Keys act on a mouse selection when there is one (useListKeys `selected` + `runAll`), else on
  // the focused row. Waiting: E file (as the card says) · Space done now · P plan · D dismiss · S snooze · ⏎ open.
  // Dismissed: R restore. The letters live in lib/shortcuts INBOX_KEYS, the table the cheatsheet reads.
  const waitingBindings: ListBinding<InboxItem>[] = [
    { ...INBOX_KEYS.file, run: (i) => { fileOne(i, draftOf(i)); advance(i) }, runAll: bulkFileAsDrafted },
    { ...INBOX_KEYS.done, run: (i) => { doneOne(i); advance(i) }, runAll: bulkDone },
    { ...INBOX_KEYS.plan, run: planOne },
    { ...INBOX_KEYS.dismiss, run: (i) => { dismissOne(i); advance(i) }, runAll: bulkDismiss },
    { ...INBOX_KEYS.snooze, run: (i) => setKbSnoozeId(i.id), runAll: (sel) => setBulkSnoozePos(rowAnchor('inbox-', sel[0].id)) },
    {
      ...INBOX_KEYS.open,
      run: (i) => {
        // A31: on a computer a GitHub row has nothing to open in place; ↵ opens the issue, as a click on its number does.
        if (i.kind === 'github_issue' && !isMobile) return document.querySelector<HTMLElement>(`#inbox-${i.id} .ib-gh-num`)?.click()
        openCard(i.id)
        if (i.kind !== 'github_issue') setEditId(i.id)
      },
    },
  ]
  const dismissedBindings: ListBinding<InboxItem>[] = [{ ...INBOX_KEYS.restore, run: (i) => restoreInboxItem(i), runAll: bulkRestore }]
  // Snoozed shares Dismissed's R: it brings the capture back to Waiting now.
  const { focusedId, setFocusedId } = useListKeys(visibleItems, tab === 'waiting' ? waitingBindings : dismissedBindings, {
    idPrefix: 'inbox-',
    // Pause list keys while a menu from this page is up, or D would dismiss the row behind it.
    active: !kbSnoozeId && !bulkSnoozePos && !bulkMovePos,
    onSelectAll: () => setSelected(new Set(visibleItems.map((i) => i.id))),
    selected: selectedItems,
  })
  const kbSnoozeItem = orderedItems.find((i) => i.id === kbSnoozeId)

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`inbox-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, items, allItems])

  const zero = items.length === 0
  const summary = inboxSummary(captures, githubItems.length, now, !isMobile)
  const switchTab = (t: Tab) => {
    setTab(t)
    setFocusedId(null)
  }

  // ── 3a / 3b header: "Inbox", one line that says it once, the Waiting | Dismissed toggle. ──
  // A 2×2: title | Scan paper (+ Capture on desktop) / summary | the view switch, so the toggle sits
  // level with the summary as in 3a and the later header buttons never push the list down.
  const header = (
    <header className="ib-head">
      <h1 className="ib-h1">Inbox</h1>
      <div className="ib-head-acts">
        <ScanPaperButton />
        {!isMobile && <CaptureCta />}
      </div>
      <div className="ib-sum">
        {!online ? (
          <OfflineChip />
        ) : (
          <>
            {summary}
            {snoozedItems.length > 0 && (
              <>
                {summary && ' · '}
                <button type="button" className="ib-sum-link kf-hit" onClick={() => switchTab('snoozed')}>{snoozedItems.length} snoozed</button>
              </>
            )}
          </>
        )}
      </div>
      <div className="ib-head-view">
        {isMobile ? (
          <button type="button" className="ib-head-link" onClick={() => switchTab(tab === 'waiting' ? 'dismissed' : 'waiting')}>
            {tab === 'waiting' ? `Dismissed ${dismissedItems.length}` : `Waiting ${items.length}`}
          </button>
        ) : (
          <Segmented
            className="ib-toggle"
            label="Waiting or dismissed"
            value={tab}
            onChange={switchTab}
            options={[
              { value: 'waiting', label: `Waiting ${items.length}` },
              { value: 'dismissed', label: `Dismissed ${dismissedItems.length}` },
              ...(tab === 'snoozed' ? [{ value: 'snoozed' as const, label: `Snoozed ${snoozedItems.length}` }] : []),
            ]}
          />
        )}
      </div>
    </header>
  )

  const card = (item: InboxItem) => (
    <DragRow key={item.id} id={item.id} load={dragLoad(item)} disabled={isMobile}>
    <TriageCard
      item={item}
      draft={draftOf(item)}
      person={personOf(item)}
      phone={isMobile}
      open={openIds.has(item.id)}
      editing={editId === item.id}
      highlighted={item.id === focusId || item.id === focusedId}
      filing={filingIds.has(item.id)}
      selected={selected.has(item.id)}
      selecting={selectionActive}
      now={now}
      colorOf={colorOf}
      onDraft={(d) => setDraft(item.id, d)}
      onOpen={() => openCard(item.id)}
      onEditing={(on) => setEditId(on ? item.id : null)}
      onFile={(d) => fileOne(item, d)}
      onSnooze={(until) => snoozeInboxItem(item, until)}
      onSomeday={() => somedayOne(item)}
      onDismiss={() => dismissOne(item)}
      onToggleSelect={() => toggleSelected(item.id)}
    />
    </DragRow>
  )

  let list
  if (state === 'loading') list = <Skeleton />
  else if (state === 'resting') list = <ErrorCard message="Your Inbox didn't load." onRetry={() => void pendingQ.refetch()} />
  else if (state === 'away') list = <p className="ib-quiet">Your Inbox will be here when you're back online. Anything you capture now is kept.</p>
  else if (zero) list = <EmptyInboxCard />
  else {
    const ghSection = githubItems.length > 0 && (
      <section className="ib-gh-sec" style={ghPriority === 'high' ? { marginBottom: 'var(--sp-5)' } : undefined}>
        <div className="ib-gh-head">
          <span className="ib-gh-label">{isMobile ? 'From GitHub' : githubHeading(githubItems)}</span>
          <span className="ib-rule" />
          {/* deviation(Inbox t3): 3a says "most urgent first", but nothing ranks them (P6 step 3 is
              skipped on purpose); they're in last-updated order, and the line says so. */}
          {ghPriority === 'low' ? (
            <button type="button" className="ib-meta ib-gh-fold kf-hit" aria-expanded={!ghFolded} onClick={() => setGhOpen(ghFolded)}>
              {ghFolded ? `Show ${githubItems.length}` : 'Fold'}
            </button>
          ) : (
            !isMobile && <span className="ib-meta">recently updated first</span>
          )}
        </div>
        {!ghFolded && githubItems.map((item) => (
          <DragRow key={item.id} id={item.id} load={dragLoad(item)} disabled={isMobile}>
          <GithubRow
            item={item}
            phone={isMobile}
            open={openIds.has(item.id)}
            showRepo={ghRepos.size > 1}
            highlighted={item.id === focusId || item.id === focusedId}
            selected={selected.has(item.id)}
            selecting={selectionActive}
            now={now}
            onOpen={() => toggleOpen(item.id)}
            onFile={() => fileOne(item, draftOf(item))}
            onDismiss={() => dismissOne(item)}
            onToggleSelect={() => toggleSelected(item.id)}
          />
          </DragRow>
        ))}
      </section>
    )
    list = (
      <>
        {ghPriority === 'high' && ghSection}
        {captures.length > 0 && <div className="ib-list kf-dim">{captures.map(card)}</div>}
        {ghPriority !== 'high' && ghSection}
      </>
    )
  }

  return (
    <div className="ib-page" style={{ userSelect: selectionActive ? 'none' : undefined }}>
      {header}

      {tab === 'waiting' ? (
        <>
          {/* 3a: one plain sentence, a 28px close. */}
          {focusId && !bannerDismissed && orderedItems.some((i) => i.id === focusId) && (
            <div className="ib-banner">
              <span className="ib-banner-dot" />
              From Search: your match is highlighted below.
              <button type="button" className="ib-banner-x" aria-label="Close" onClick={() => setBannerDismissed(true)}>✕</button>
            </div>
          )}
          <ReadyScans />
          {/* Kai 2026-10-06: a search / activity link to a capture that isn't waiting — filed,
              dismissed, snoozed — always shows, above whatever the list holds. */}
          {focusedItem && !orderedItems.some((i) => i.id === focusedItem.id) && <ResolvedCard item={focusedItem} />}
          {list}
        </>
      ) : state === 'loading' ? (
        <Skeleton />
      ) : state === 'resting' ? (
        <ErrorCard message={`Your ${tab} captures didn't load.`} onRetry={() => void pendingQ.refetch()} />
      ) : state === 'away' ? (
        <p className="ib-quiet">Your {tab} captures will be here when you're back online.</p>
      ) : tab === 'snoozed' ? (
        <SnoozedPanel items={snoozedItems} phone={isMobile} now={now} selected={selected} focusedId={focusedId} onToggleSelect={toggleSelected} />
      ) : (
        <DismissedPanel
          items={dismissedItems}
          phone={isMobile}
          selected={selected}
          focusedId={focusedId}
          onToggleSelect={toggleSelected}
        />
      )}

      {kbSnoozeItem && (
        <SnoozeMenu
          position={rowAnchor('inbox-', kbSnoozeItem.id)}
          title={kbSnoozeItem.raw_text}
          onClose={() => setKbSnoozeId(null)}
          onSnooze={(until) => { snoozeInboxItem(kbSnoozeItem, until); advance(kbSnoozeItem); setKbSnoozeId(null) }}
          onSomeday={() => { somedayOne(kbSnoozeItem); advance(kbSnoozeItem); setKbSnoozeId(null) }}
        />
      )}

      {selectionActive && (
        <InboxBulkBar
          count={selected.size}
          onFileTo={tab === 'waiting' ? (e) => setBulkMovePos({ x: e.clientX, y: e.clientY }) : undefined}
          onSnooze={tab === 'waiting' ? (e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY }) : undefined}
          onDismiss={tab === 'waiting' ? () => bulkDismiss() : undefined}
          onRestore={tab !== 'waiting' ? () => bulkRestore() : undefined}
          onClear={clearSelection}
        />
      )}
      {bulkMovePos && <MovePicker position={bulkMovePos} current={null} meta={`${selected.size} selected`} onPick={bulkFileTo} onClose={() => setBulkMovePos(null)} />}
      {bulkSnoozePos && (
        <SnoozeMenu
          position={bulkSnoozePos}
          onClose={() => setBulkSnoozePos(null)}
          onSnooze={(until) => { bulkSnooze(until); setBulkSnoozePos(null) }}
          onSomeday={() => { bulkSomeday(); setBulkSnoozePos(null) }}
        />
      )}
    </div>
  )
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

// ── Already-resolved deep-link target (filed elsewhere / dismissed / snoozed) ──
function ResolvedCard({ item }: { item: InboxItem }) {
  const filed = item.status === 'filed'
  const openTask = useOpenTask()
  const filedTo = (item.payload as { filed_to?: string } | null)?.filed_to
  // A pending capture outside the waiting list is a snoozed one. Days on the user's clock.
  const state = filed
    ? filedTo === 'journal' ? 'filed to the journal' : filedTo === 'person' ? 'filed to People' : 'already filed as a task'
    : item.status === 'dismissed' ? 'dismissed' : item.snoozed_until ? `snoozed · back ${dayWord(item.snoozed_until)}` : 'waiting'
  return (
    <div id={`inbox-${item.id}`} className="ib-resolved">
      <span className="ib-resolved-tick" data-filed={filed || undefined}>✓</span>
      <span style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}><EmojiText text={item.raw_text} /></span>
      <Chip tone="sage" style={filed ? undefined : { background: 'var(--paper-bone)', color: 'var(--ink-muted)' }}>
        {state}
      </Chip>
      {/* Wave N: the task it became (the sheet on a phone); a plain href reloaded the whole app. */}
      {filed && item.filed_task_id && (
        <button type="button" className="kf-hit ib-resolved-open" onClick={() => openTask(item.filed_task_id!)}>
          open task →
        </button>
      )}
    </div>
  )
}

// ── 2a / 2b — Dismissed ──
function DismissedPanel({ items, phone, selected, focusedId, onToggleSelect }: { items: InboxItem[]; phone: boolean; selected: Set<string>; focusedId: string | null; onToggleSelect: (id: string) => void }) {
  const today = items.filter((i) => isToday(i.updated_at))
  const earlier = items.filter((i) => !isToday(i.updated_at))

  if (items.length === 0) {
    return <div className="ib-hand" style={{ marginTop: 18, padding: '8px 2px' }}>nothing composting right now</div>
  }

  const group = (label: string, rows: InboxItem[]) => (
    <div>
      <div className="ib-group-head">
        <span>{label} · {rows.length}</span>
        <span className="ib-rule" />
      </div>
      {rows.map((item) => (
        <DismissedRow
          key={item.id}
          item={item}
          meta={phone ? dismissedAgo(item.updated_at) : `dismissed ${dismissedAgo(item.updated_at)}`}
          phone={phone}
          selected={selected.has(item.id)}
          selecting={selected.size > 0}
          highlighted={item.id === focusedId}
          onToggleSelect={() => onToggleSelect(item.id)}
        />
      ))}
    </div>
  )

  return (
    <div style={{ marginTop: phone ? 4 : 0 }}>
      {!phone && <div className="ib-hand" style={{ marginBottom: 12 }}>dismissed captures rest here, then compost after 30 days ✿</div>}

      <div className="ib-dbar">
        <span className="ib-banner-dot" />
        <span className="ib-dbar-label">{phone ? 'clears after 30 days' : `${items.length} dismissed · auto-clears after 30 days`}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ib-dbar-act" style={{ color: 'var(--acc-terra-ink)' }} onClick={() => restoreMany(items)}>Restore all</button>
        {!phone && (
          <>
            <span className="ib-dbar-sep" />
            {/* Clear now = into Trash (30 days there too), with Undo — no "can't be undone" confirm. */}
            <button type="button" className="ib-dbar-act" onClick={() => purgeMany(items)}>Clear now</button>
          </>
        )}
      </div>

      {phone && <div className="ib-hand" style={{ margin: '8px 0 4px' }}>swipe → any card to bring it back</div>}

      {today.length > 0 && group('Today', today)}
      {earlier.length > 0 && group('Earlier', earlier)}

      {!phone && <div className="ib-hand ib-dfoot">a capture is never truly lost — it just goes quiet ✿</div>}
    </div>
  )
}

const KIND_CHIP_STYLE: Record<InboxKind, { background?: string; color?: string; border?: string }> = {
  text: { border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' },
  email: { border: '1px solid var(--line-solid)', color: 'var(--ink-muted)' },
  voice: { background: 'var(--block-terra)', color: 'var(--acc-terra-ink)' },
  github_issue: { background: 'var(--block-sage)', color: 'var(--acc-sage-text)' },
}

// ── Snoozed (no frame — the Dismissed view's rows): when each comes back; Unsnooze (R, swipe →) with Undo. ──
function SnoozedPanel({ items, phone, now, selected, focusedId, onToggleSelect }: { items: InboxItem[]; phone: boolean; now: Date; selected: Set<string>; focusedId: string | null; onToggleSelect: (id: string) => void }) {
  if (items.length === 0) return <div className="ib-hand" style={{ marginTop: 18, padding: '8px 2px' }}>nothing snoozed right now</div>
  return (
    <div style={{ marginTop: phone ? 4 : 0 }}>
      <div className="ib-hand" style={{ marginBottom: 12 }}>{phone ? 'swipe → any card to bring it back now' : 'snoozed captures come back to Waiting on their own ✿'}</div>
      <div className="ib-group-head">
        <span>Snoozed · {items.length}</span>
        <span className="ib-rule" />
      </div>
      {items.map((item) => (
        <DismissedRow
          key={item.id}
          item={item}
          meta={backLabel(item.snoozed_until!, now)}
          mark={<Icon name="clock" size={13} />}
          act="Unsnooze"
          phone={phone}
          selected={selected.has(item.id)}
          selecting={selected.size > 0}
          highlighted={item.id === focusedId}
          onToggleSelect={() => onToggleSelect(item.id)}
        />
      ))}
    </div>
  )
}

function DismissedRow({ item, meta, mark = '✕', act = 'Restore', phone, selected, selecting, highlighted, onToggleSelect }: { item: InboxItem; meta: string; mark?: ReactNode; act?: string; phone: boolean; selected: boolean; selecting: boolean; highlighted: boolean; onToggleSelect: () => void }) {
  const cls = `ib-drow${selected ? ' is-selected' : ''}${highlighted ? ' is-ringed' : ''}`
  if (phone) {
    // 2b: swipe → to restore — the task rows' SwipeRow, its right action renamed; hold selects.
    return (
      <SwipeRow actions={{ tomorrow: () => restoreInboxItem(item), tomorrowLabel: act, tomorrowIcon: 'undo' }} tomorrowHint="" onLongPress={onToggleSelect} selecting={selecting} onSelectTap={onToggleSelect}>
        <div id={`inbox-${item.id}`} tabIndex={highlighted ? 0 : -1} className={cls}>
          {selecting ? <SelectCircle on={selected} title={item.raw_text} /> : <span className="ib-drow-x">{mark}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ib-drow-text"><EmojiText text={item.raw_text} /></div>
            <div className="ib-meta ib-mono">{KIND_LABEL[item.kind]} · {meta}</div>
          </div>
        </div>
      </SwipeRow>
    )
  }
  return (
    <div
      id={`inbox-${item.id}`}
      tabIndex={highlighted ? 0 : -1}
      className={cls}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input, a, [data-no-select]')) return
        onToggleSelect()
      }}
    >
      <SelectBox selected={selected} active={selecting} onToggle={onToggleSelect} />
      <span className="ib-drow-x">{mark}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ib-drow-text"><EmojiText text={item.raw_text} /></div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 11 }}>
          <Chip tone="bordered" style={{ border: 'none', ...KIND_CHIP_STYLE[item.kind] }}>{KIND_LABEL[item.kind]}</Chip>
          <span className="ib-meta ib-mono">{meta}</span>
        </div>
      </div>
      <Button type="button" variant="secondary" className="ib-btn ib-btn--sm" style={{ color: 'var(--acc-terra-ink)' }} onClick={() => restoreInboxItem(item)}>
        <RestoreIcon /> {act}
      </Button>
    </div>
  )
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12a8 8 0 1 1 2.3 5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 18v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
