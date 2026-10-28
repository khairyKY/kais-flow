import { useState, type MouseEvent, type ReactNode } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { Collapse } from '../../components/Collapse'
import { ContextMenu } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { RenameField } from '../../components/RenameField'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { Button } from '../../components/kit'
import { SourceLabel } from '../paper/PaperInbox'
import { MovePicker } from '../tasks/MovePicker'
import { SelectCircle, SwipeRow } from '../tasks/SwipeRow'
import { targetKey, type MoveTarget } from '../tasks/move'
import type { InboxItem, Person } from '../../lib/types'
import { ageLabel, captureLink, capturedLabel, cardShape, confidenceWord, draftText, dueLabel, dueShort, FILE_WORD, githubUrl, KIND_LABEL, parseOf, type Draft, type FileKind } from './inboxDisplay'
import { linkLabel } from '../../lib/links'

// ── Inbox t3 (Inbox.dc.html 3a desktop / 3b iPhone, the reviewed pass): one decision per card.
// A confident read is ONE row of editable fields (type · title · date · place) — "Suggested", its
// confidence as a word; an unsure read asks "Where does this go?" with its likely places; a capture
// with nothing to decide is a compact row with File. Cards sit flat. Phone: hold selects, a tap
// opens (a compact row grows into the full card), swipe left dismisses (the task-row grammar). ──

type At = { x: number; y: number }
const below = (e: MouseEvent<HTMLElement>): At => {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

/** Desktop multi-select (2026-07-18 audit D2/D3): TaskRow's hover-revealed box. On a phone a
 * selection shows SwipeRow's select circle instead. stopPropagation: the card's own click toggles too. */
export function SelectBox({ selected, active, onToggle }: { selected?: boolean; active?: boolean; onToggle: () => void }) {
  return (
    <span
      role="checkbox"
      aria-checked={!!selected}
      aria-label="Select capture"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={`ib-select-box${selected || active ? ' on' : ''}`}
      data-checked={selected || undefined}
    >
      {selected ? '✓' : ''}
    </span>
  )
}

/** The key a button answers to (3a: "File as task E"), on the button itself. */
const Key = ({ k }: { k: string }) => <span className="ib-key" aria-hidden>{k}</span>

/** A desktop card's surface click selects it (D2/D3); anything interactive opts out. */
function selectOnSurface(onToggle: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a, [data-no-select]')) return
    onToggle()
  }
}

interface Choice {
  to: FileKind
  personId: string | null
  label: string
}
function choicesFor(person: Person | undefined): Choice[] {
  return [
    { to: 'task', personId: null, label: 'Task' },
    { to: 'journal', personId: null, label: 'Journal note' },
    ...(person ? [{ to: 'person' as const, personId: person.id, label: person.name }] : []),
  ]
}

const primaryLabel = (d: Draft, person: Person | undefined) => (d.to === 'journal' ? 'File as note' : d.to === 'person' && person ? `Add to ${person.name.split(/\s+/)[0]}` : 'File as task')

export interface TriageCardProps {
  item: InboxItem
  draft: Draft
  /** Someone the capture names — offered as a place to file it (3a: "Salma (People)"). */
  person?: Person
  phone: boolean
  /** The user opened it (Enter, or a tap on a compact row): the full card whatever its shape. */
  open: boolean
  editing: boolean
  highlighted: boolean
  filing: boolean
  selected: boolean
  /** Something is selected: a phone taps to select instead of opening. */
  selecting: boolean
  now: Date
  colorOf: (t: MoveTarget) => string
  onDraft: (d: Draft) => void
  onOpen: () => void
  onEditing: (on: boolean) => void
  onFile: (d: Draft) => void
  onSnooze: (until: string) => void
  /** The Snooze menu's Someday: filed as a someday task (not a year-long snooze). */
  onSomeday: () => void
  onDismiss: () => void
  onToggleSelect: () => void
}

type Menu = { kind: 'type' | 'date' | 'place' | 'snooze'; at: At }

export function TriageCard(p: TriageCardProps) {
  const { item, draft, person, phone, now } = p
  const [menu, setMenu] = useState<Menu | null>(null)
  const shape = cardShape(item)
  const mode = p.open || shape === 'suggested' ? 'full' : shape
  const parse = parseOf(item)
  const confident = shape !== 'unsure' && !!parse
  const text = draftText(item, draft)
  const task = draft.to === 'task'
  const set = (patch: Partial<Draft>) => p.onDraft({ ...draft, ...patch })
  const link = captureLink(item)
  // P7e A19: the link back to where it came from, on the card's meta line ("Typed · example.com ↗ · 09:12").
  // Not inside the phone's compact row, which is one button: it shows once the card is open.
  const label = <SourceLabel item={item} label={KIND_LABEL[item.kind]} />
  const source = (
    <>
      {label}
      {link && (
        <>
          {' · '}
          <a className="ib-link" href={link} target="_blank" rel="noopener noreferrer" data-no-select onClick={(e) => e.stopPropagation()}>
            {linkLabel(link)} ↗
          </a>
        </>
      )}
    </>
  )
  const choices = choicesFor(person)
  const typeLabel = draft.to === 'person' && person ? person.name : FILE_WORD[draft.to]
  const file = () => p.onFile(draft)
  const snooze = (e: MouseEvent<HTMLElement>) => setMenu({ kind: 'snooze', at: below(e) })
  const suggest = `${FILE_WORD[draft.to]}${task && draft.dueAt ? ` · due ${dueShort(draft.dueAt, now)}` : ''}`

  const titleEdit = (
    <RenameField
      value={text}
      ariaLabel="Title to file"
      onDone={(next) => {
        p.onEditing(false)
        if (next && next !== text) set({ text: next })
      }}
      style={{ margin: 0, minWidth: 180 }}
    />
  )

  // ── The fields (3a's "Suggested" row; 3b's chips). Each opens the picker it names. ──
  const typeField = (
    <button type="button" className="ib-field" data-no-select aria-haspopup="menu" onClick={(e) => setMenu({ kind: 'type', at: below(e) })}>
      {draft.to === 'person' && <span className="ib-dot" style={{ background: 'var(--acc-clover)' }} />}
      {typeLabel}
      <span className="ib-caret" aria-hidden>▾</span>
    </button>
  )
  const dateField = task && (
    <button type="button" className="ib-field" data-no-select aria-haspopup="dialog" aria-label="Due date" onClick={(e) => setMenu({ kind: 'date', at: below(e) })}>
      <span className="ib-dot ib-dot--date" />
      {draft.dueAt ? dueLabel(draft.dueAt, draft.timed, now, phone) : <span className="ib-faint">No date</span>}
      <span className="ib-caret" aria-hidden>▾</span>
    </button>
  )
  const placeField = task && (
    <button type="button" className="ib-field ib-field--place" data-no-select aria-haspopup="menu" aria-label="Project or area" onClick={(e) => setMenu({ kind: 'place', at: below(e) })}>
      <span className="ib-dot" style={{ borderRadius: '50%', background: draft.place.kind === 'none' ? 'var(--ink-hairline)' : p.colorOf(draft.place) }} />
      {draft.place.kind === 'none' ? <span className="ib-faint">Project or area</span> : <span className="ib-field-name"><EmojiText text={draft.place.name} /></span>}
      <span className="ib-caret" aria-hidden>▾</span>
    </button>
  )

  const menus = (
    <>
      {menu?.kind === 'type' &&
        (phone ? (
          <ActionSheet
            title="File as"
            meta={item.raw_text}
            onClose={() => setMenu(null)}
            items={choices.map((c) => ({ label: c.to === 'person' ? `${c.label} (People)` : c.label, selected: draft.to === c.to && draft.personId === c.personId, onSelect: () => set({ to: c.to, personId: c.personId, text: null }) }))}
          />
        ) : (
          <ContextMenu
            position={menu.at}
            onClose={() => setMenu(null)}
            items={choices.map((c) => ({
              label: c.to === 'person' ? `${c.label} (People)` : c.label,
              icon: draft.to === c.to && draft.personId === c.personId ? <Icon name="check" size={16} /> : <span style={{ width: 16 }} />,
              onClick: () => set({ to: c.to, personId: c.personId, text: null }),
            }))}
          />
        ))}
      {menu?.kind === 'date' && (
        <ScheduleMenu
          position={menu.at}
          title={text}
          value={draft.dueAt}
          onClose={() => setMenu(null)}
          onSchedule={(iso, _min, timed) => {
            set({ dueAt: iso, timed: !!timed })
            setMenu(null)
          }}
          onClear={
            draft.dueAt
              ? () => {
                  set({ dueAt: null })
                  setMenu(null)
                }
              : undefined
          }
        />
      )}
      {menu?.kind === 'place' && <MovePicker position={menu.at} current={targetKey(draft.place)} meta={text} onPick={(to) => set({ place: to })} onClose={() => setMenu(null)} />}
      {menu?.kind === 'snooze' && (
        <SnoozeMenu
          position={menu.at}
          title={item.raw_text}
          onClose={() => setMenu(null)}
          onSnooze={(until) => {
            setMenu(null)
            p.onSnooze(until)
          }}
          onSomeday={() => {
            setMenu(null)
            p.onSomeday()
          }}
        />
      )}
    </>
  )

  const florets = p.filing && (
    <>
      <span className="inbox-floret" style={{ top: '30%', left: '20%', animationDelay: '0ms' }} />
      <span className="inbox-floret" style={{ top: '25%', left: '50%', animationDelay: '80ms' }} />
      <span className="inbox-floret" style={{ top: '35%', left: '75%', animationDelay: '160ms' }} />
    </>
  )
  const cls = (base: string) => `${base} kf-row-in${phone ? '' : ' kf-lift'}${p.selected ? ' is-selected' : ''}${p.highlighted ? ' is-ringed' : ''}${p.filing ? ' is-filing' : ''}`
  const lead = phone ? p.selecting && <SelectCircle on={p.selected} title={item.raw_text} /> : <SelectBox selected={p.selected} active={p.selecting} onToggle={p.onToggleSelect} />
  const rootProps = {
    id: `inbox-${item.id}`,
    'data-tour': 'inbox-item',
    tabIndex: p.highlighted ? 0 : -1,
    onClick: phone ? undefined : selectOnSurface(p.onToggleSelect),
  }

  let body: ReactNode
  if (mode === 'plain') {
    // 3a card 3 / 3b: "renew hosting before the 15th · Email · Wed · Task · due Tue 14 · File".
    body = phone ? (
      <div {...rootProps} className={cls('ib-row')}>
        {lead}
        <button type="button" className="ib-row-main" data-no-select onClick={p.onOpen} aria-label={`Open “${item.raw_text}”`}>
          <span className="ib-row-text"><EmojiText text={item.raw_text} /></span>
          <span className="ib-meta">{label} · {suggest}</span>
        </button>
        <Button type="button" variant="secondary" className="ib-btn ib-btn--sm" onClick={file}>File</Button>
      </div>
    ) : (
      <div {...rootProps} className={cls('ib-row')}>
        {florets}
        {lead}
        <button type="button" className="ib-row-main" data-no-select onClick={p.onOpen} title="Open to change where it goes">
          <span className="ib-row-text"><EmojiText text={item.raw_text} /></span>
        </button>
        <span className="ib-meta">{source} · {capturedLabel(item.created_at, now, false)}</span>
        <span className="ib-suggest">{suggest}</span>
        <Button type="button" variant="secondary" className="ib-btn ib-btn--sm" onClick={file}>File</Button>
        <Button type="button" variant="ghost" className="ib-btn ib-btn--sm" onClick={p.onDismiss}>Dismiss</Button>
      </div>
    )
  } else if (mode === 'unsure') {
    // 3a card 2 / 3b: "Where does this go?" and the likely places, dashed. A choice files it there.
    const pick = (c: Choice) => p.onFile({ ...draft, to: c.to, personId: c.personId, text: null })
    body = phone ? (
      <div {...rootProps} className={cls('ib-card')}>
        <div className="ib-card-top">
          {lead}
          <div className="ib-card-text"><EmojiText text={item.raw_text} /></div>
        </div>
        <div className="ib-meta">{source} · {capturedLabel(item.created_at, now)} · where does this go?</div>
        <div className="ib-choices" style={{ gridTemplateColumns: `repeat(${choices.length}, 1fr)` }}>
          {choices.map((c) => (
            <button key={c.to + (c.personId ?? '')} type="button" className="ib-choice" onClick={() => pick(c)}>
              {c.to === 'journal' ? 'Journal' : c.to === 'person' ? c.label.split(/\s+/)[0] : c.label}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div {...rootProps} className={cls('ib-card')}>
        {florets}
        <div className="ib-card-top">
          {lead}
          <div className="ib-card-text"><EmojiText text={item.raw_text} /></div>
          <span className="ib-meta ib-meta--top">{source} · {capturedLabel(item.created_at, now)}</span>
        </div>
        <div className="ib-fields">
          <span className="ib-ask">Where does this go?</span>
          {choices.map((c) => (
            <button key={c.to + (c.personId ?? '')} type="button" className="ib-choice" onClick={() => pick(c)}>
              {c.to === 'person' && <span className="ib-dot" style={{ borderRadius: '50%', background: 'var(--acc-clover)' }} />}
              {c.to === 'person' ? `${c.label} (People)` : c.label}
            </button>
          ))}
        </div>
        <div className="ib-actions">
          <Button type="button" variant="secondary" className="ib-btn" onClick={snooze}>Snooze<Key k="S" /></Button>
          <Button type="button" variant="ghost" className="ib-btn" onClick={p.onDismiss}>Dismiss<Key k="D" /></Button>
        </div>
      </div>
    )
  } else {
    const word = confident ? confidenceWord(parse?.confidence) : null
    body = phone ? (
      // 3b: the words, when and how, three field chips, then File as task · Snooze · Dismiss at 2:1:1.
      <div {...rootProps} className={cls('ib-card')}>
        <div className="ib-card-top">
          {lead}
          {p.editing ? titleEdit : (
            <button type="button" className="ib-card-text ib-card-text--btn" data-no-select onClick={() => p.onEditing(true)} title="Tap to change the title it files under">
              <EmojiText text={draft.text ?? item.raw_text} />
            </button>
          )}
        </div>
        <div className="ib-meta">{source} · {capturedLabel(item.created_at, now)}</div>
        <div className="ib-fields">
          {typeField}
          {dateField}
          {placeField}
        </div>
        <div className="ib-actions ib-actions--grid">
          <Button type="button" variant="cta" className="ib-btn" onClick={file}>{primaryLabel(draft, person)}</Button>
          <Button type="button" variant="secondary" className="ib-btn" onClick={snooze}>Snooze</Button>
          <Button type="button" variant="ghost" className="ib-btn" onClick={p.onDismiss}>Dismiss</Button>
        </div>
      </div>
    ) : (
      <div {...rootProps} className={cls('ib-card')}>
        {florets}
        <div className="ib-card-top">
          {lead}
          <div className="ib-card-text"><EmojiText text={item.raw_text} /></div>
          <span className="ib-meta ib-meta--top">{source} · {capturedLabel(item.created_at, now)}</span>
        </div>
        <div className="ib-fields">
          <span className="ib-fields-label">{confident ? 'Suggested' : 'File as'}</span>
          {typeField}
          {p.editing ? (
            <span className="ib-field ib-field--edit">{titleEdit}</span>
          ) : (
            <button type="button" className="ib-field" data-no-select aria-label="Title to file" onClick={() => p.onEditing(true)}>
              “<EmojiText text={text} />”
            </button>
          )}
          {dateField}
          {placeField}
          {word && <span className="ib-conf">{word}</span>}
        </div>
        <div className="ib-actions">
          <Button type="button" variant="cta" className="ib-btn" onClick={file}>{primaryLabel(draft, person)}<Key k="E" /></Button>
          <Button type="button" variant="secondary" className="ib-btn" onClick={snooze}>Snooze<Key k="S" /></Button>
          <Button type="button" variant="ghost" className="ib-btn" onClick={p.onDismiss}>Dismiss<Key k="D" /></Button>
        </div>
      </div>
    )
  }

  return phone ? (
    <SwipeRow
      actions={{ delete: p.onDismiss, deleteLabel: 'Dismiss', deleteIcon: 'close' }}
      tomorrowHint=""
      onLongPress={p.onToggleSelect}
      selecting={p.selecting}
      onSelectTap={p.onToggleSelect}
      overlay={menus}
    >
      {body}
    </SwipeRow>
  ) : (
    <>
      {body}
      {menus}
    </>
  )
}

// ── GitHub rows (3a: "#482 · title · 3 days · File · Dismiss"; 3b: 48px, "#482 · title · 3d"). The
// number opens the issue. On a phone a tap opens the row's File / Dismiss (and swipe left dismisses). ──
export function GithubRow({ item, phone, open, showRepo, highlighted, selected, selecting, now, onOpen, onFile, onDismiss, onToggleSelect }: {
  item: InboxItem
  phone: boolean
  open: boolean
  /** Issues from more than one repo: each number carries its repo. */
  showRepo: boolean
  highlighted: boolean
  selected: boolean
  selecting: boolean
  now: Date
  onOpen: () => void
  onFile: () => void
  onDismiss: () => void
  onToggleSelect: () => void
}) {
  const payload = item.payload as { number?: number; repo?: string; url?: string; created_at?: string | null } | null
  const url = githubUrl(payload?.url)
  const ref = payload?.number ? `${showRepo && payload.repo ? payload.repo : ''}#${payload.number}` : ''
  // The issue's own age; rows stored before it was kept fall back to when they arrived.
  const age = ageLabel(payload?.created_at ?? item.created_at, now, phone)
  const num = ref && (url ? <a className="ib-gh-num" href={url} target="_blank" rel="noopener noreferrer" title="Open on GitHub">{ref}</a> : <span className="ib-gh-num">{ref}</span>)
  const cls = `ib-gh${selected ? ' is-selected' : ''}${highlighted ? ' is-ringed' : ''}`
  if (!phone) {
    return (
      <div id={`inbox-${item.id}`} tabIndex={highlighted ? 0 : -1} className={cls} onClick={selectOnSurface(onToggleSelect)}>
        <SelectBox selected={selected} active={selecting} onToggle={onToggleSelect} />
        {num}
        <span className="ib-gh-title"><EmojiText text={item.raw_text} /></span>
        <span className="ib-meta">{age}</span>
        <Button type="button" variant="secondary" className="ib-btn ib-btn--sm" onClick={onFile}>File</Button>
        <Button type="button" variant="ghost" className="ib-btn ib-btn--sm" onClick={onDismiss}>Dismiss</Button>
      </div>
    )
  }
  return (
    <SwipeRow actions={{ delete: onDismiss, deleteLabel: 'Dismiss', deleteIcon: 'close' }} tomorrowHint="" onLongPress={onToggleSelect} selecting={selecting} onSelectTap={onToggleSelect}>
      <div id={`inbox-${item.id}`} tabIndex={highlighted ? 0 : -1} className={cls}>
        {selecting && <SelectCircle on={selected} title={item.raw_text} />}
        <button type="button" className="ib-gh-main" onClick={onOpen} aria-expanded={open}>
          {ref && <span className="ib-gh-num">{ref}</span>}
          <span className="ib-gh-title"><EmojiText text={item.raw_text} /></span>
          <span className="ib-meta">{age}</span>
        </button>
      </div>
      {/* T8: the open row's actions ease out from under it (components/Collapse). */}
      <Collapse open={open}>
        <div className="ib-gh-more">
          {url && <a className="ib-meta" href={url} target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a>}
          <span style={{ flex: 1 }} />
          <Button type="button" variant="secondary" className="ib-btn ib-btn--sm" onClick={onFile}>File</Button>
          <Button type="button" variant="ghost" className="ib-btn ib-btn--sm" onClick={onDismiss}>Dismiss</Button>
        </div>
      </Collapse>
    </SwipeRow>
  )
}
