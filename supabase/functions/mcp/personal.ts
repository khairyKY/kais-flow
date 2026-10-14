// The personal MCP tools (docs/MCP.md): the journal, and the people you keep. The privacy policy
// (site info §2) promises an AI key never reads them unless its owner allows it, so each tool carries
// its `scope`: server.ts lists and runs it only for a key granted that scope in Settings → AI
// assistants (mcp_keys.scopes, 0080), and index.ts refuses those tables to any other key as well.
// Pure, like ./tools.ts; each write restates the app's own (journal/api.ts, people/api.ts).
import { dateKey, wallTime } from '../_shared/zone.ts'
import { bad, dayArg, id, instantOf, logIt, text, uuid, whenOrNull, whole, words, type Args, type Row, type ToolDef } from './tools.ts'

const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])

function entryOut(e: Row, zone: string): Row {
  return {
    id: e.id,
    date: e.entry_date,
    body: e.body,
    ...(e.mood ? { mood: e.mood } : {}),
    ...(list(e.gratitude).length ? { gratitude: e.gratitude } : {}),
    // Photos stay in the app (Storage paths say nothing to an assistant): only how many.
    ...(list(e.media_paths).length ? { photos: list(e.media_paths).length } : {}),
    written: wallTime(e.created_at as string, zone),
  }
}

/** A person's facts as given: [{label, value, date?}] — ids kept for facts that already had one. */
function factsArg(a: Args, before: Row[]): Row[] | undefined {
  const v = a.facts
  if (v === undefined) return undefined
  if (v === null) return []
  if (!Array.isArray(v) || v.length > 50) return bad('"facts" is a list of at most 50 {label, value, date?}.')
  return v.map((f) => {
    const o = (f ?? {}) as Row
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    const value = typeof o.value === 'string' ? o.value.trim() : ''
    if (!label || label.length > 60 || value.length > 500) return bad('Each fact needs a "label" (at most 60 characters) and a "value" (at most 500).')
    const date = o.date === undefined || o.date === null ? null : typeof o.date === 'string' && /^(\d{4}-)?\d{2}-\d{2}$/.test(o.date) ? o.date : bad('A fact\'s "date" is MM-DD (a birthday) or YYYY-MM-DD.')
    const kept = before.find((b) => b.label === label)
    return { id: (kept?.id as string | undefined) ?? crypto.randomUUID(), label, value, ...(date ? { date } : {}) }
  })
}

function personOut(p: Row, last: Row | undefined, zone: string): Row {
  return {
    id: p.id,
    name: p.name,
    ...(list(p.facts).length ? { facts: list(p.facts).map((f) => ({ label: f.label, value: f.value, ...(f.date ? { date: f.date } : {}) })) } : {}),
    ...(last ? { last_spoke: wallTime(last.occurred_at as string, zone).slice(0, 10) } : {}),
  }
}

const touchOut = (i: Row, zone: string) => ({ id: i.id, summary: i.summary, when: wallTime(i.occurred_at as string, zone) })

export const PERSONAL_TOOLS: readonly ToolDef[] = [
  {
    name: 'journal',
    title: 'Journal',
    description: "The user's journal entries (allowed for this key by its owner), newest first: by default the last 14 days; or from / to (days); `query` keeps the entries whose words contain it. Each with its day, words, mood and gratitude.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD, the first day.' },
        to: { type: 'string', description: 'YYYY-MM-DD, the last day (included).' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many (default 30).' },
      },
      additionalProperties: false,
    },
    write: false,
    scope: 'journal',
    async run(a, ctx) {
      const today = dateKey(ctx.now, ctx.zone)
      const to = dayArg(a, 'to', ctx.zone) ?? today
      const from = dayArg(a, 'from', ctx.zone) ?? (a.query ? '0000-01-01' : new Date(Date.parse(`${to}T00:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10))
      if (from > to) return bad('"from" must be on or before "to".')
      const q = text(a, 'query', 200)?.toLowerCase()
      const rows = await ctx.store.find('journal_entries', { deleted_at: null }, { order: 'entry_date', desc: true, limit: 2000 })
      const hits = rows.filter((e) => String(e.entry_date) >= from && String(e.entry_date) <= to && (!q || String(e.body ?? '').toLowerCase().includes(q)))
      return { timezone: ctx.zone, from, to, entries: hits.slice(0, whole(a, 'limit', 1, 100, 30)).map((e) => entryOut(e, ctx.zone)) }
    },
  },
  {
    name: 'save_journal_entry',
    title: 'Save journal entry',
    description:
      "Write a journal entry (no id: a new one, today unless `date`) or change one (id) — only when the user asks, in their words. A day can hold many entries; its mood and gratitude belong to the day and ride on its first entry, as in the app. Delete with move_to_trash (type journal_entry).",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The entry to change; leave out to write a new one.' },
        date: { type: 'string', description: 'YYYY-MM-DD (default today, the user\'s day).' },
        body: { type: 'string', description: 'The words.' },
        mood: { type: ['string', 'null'], description: "The day's mood, a word or an emoji." },
        gratitude: { type: ['array', 'null'], items: { type: 'string' }, description: "The day's gratitude lines (the whole list)." },
      },
      additionalProperties: false,
    },
    write: true,
    scope: 'journal',
    async run(a, ctx) {
      const eid = uuid(a, 'id')
      const date = dayArg(a, 'date', ctx.zone)
      const body = text(a, 'body', 20000, !eid)
      const mood = 'mood' in a ? (text(a, 'mood', 40) ?? null) : undefined
      const gratitude = 'gratitude' in a ? (words(a, 'gratitude', 10, 300) ?? []) : undefined
      let entry: Row
      if (!eid) {
        const day = date ?? dateKey(ctx.now, ctx.zone)
        // journal/api upsertJournalEntry, a new row (D-1: one row per entry).
        entry = { id: crypto.randomUUID(), body, entry_date: day, mood: null, transcript: null, media_paths: [], gratitude: [] }
        await ctx.store.insert('journal_entries', entry)
        await logIt(ctx, 'journal.created', 'journal_entry', entry.id as string, { entry_date: day })
      } else {
        const [e] = await ctx.store.find('journal_entries', { id: eid, deleted_at: null }, { limit: 1 })
        if (!e) return bad(`No journal entry with id ${eid} (it may be in Trash).`)
        const values: Row = { ...(body !== undefined ? { body } : {}), ...(date ? { entry_date: date } : {}) }
        entry = { ...e, ...values }
        if (Object.keys(values).length) {
          await ctx.store.patch('journal_entries', { id: eid }, values)
          await logIt(ctx, 'journal.updated', 'journal_entry', eid, { entry_date: entry.entry_date })
        }
      }
      if (mood !== undefined || gratitude !== undefined) {
        // Day-level: onto the day's first entry (which may be this one).
        const [first] = (await ctx.store.find('journal_entries', { entry_date: entry.entry_date, deleted_at: null }, { order: 'created_at', limit: 1 })) as Row[]
        const target = first ?? entry
        const values: Row = { ...(mood !== undefined ? { mood } : {}), ...(gratitude !== undefined ? { gratitude } : {}) }
        await ctx.store.patch('journal_entries', { id: target.id }, values)
        if (target.id !== entry.id || eid) await logIt(ctx, 'journal.updated', 'journal_entry', target.id as string, { entry_date: entry.entry_date })
        if (target.id === entry.id) entry = { ...entry, ...values }
      }
      return { [eid ? 'saved' : 'written']: entryOut({ created_at: ctx.now.toISOString(), ...entry }, ctx.zone), timezone: ctx.zone }
    },
  },
  {
    name: 'people',
    title: 'People',
    description: 'The people the user keeps (allowed for this key by its owner): each with their facts (birthday, kids, interests…) and when they last spoke. With `id`, one person and their logged interactions, newest first. `query` narrows the list by name or fact.',
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'One person.' }, query: { type: 'string' } }, additionalProperties: false },
    write: false,
    scope: 'people',
    async run(a, ctx) {
      const pid = uuid(a, 'id')
      const people = await ctx.store.find('people', pid ? { id: pid } : {}, { order: 'name' })
      const touches = await ctx.store.find('interactions', pid ? { person_id: pid } : {}, { order: 'occurred_at', desc: true })
      if (pid) {
        const p = people[0] ?? bad(`No person with id ${pid}.`)
        return { timezone: ctx.zone, person: { ...personOut(p, touches[0], ctx.zone), interactions: touches.slice(0, 50).map((i) => touchOut(i, ctx.zone)) } }
      }
      const q = text(a, 'query', 100)?.toLowerCase()
      return {
        timezone: ctx.zone,
        people: people.filter((p) => !q || JSON.stringify([p.name, p.facts]).toLowerCase().includes(q)).map((p) => personOut(p, touches.find((i) => i.person_id === p.id), ctx.zone)),
      }
    },
  },
  {
    name: 'save_person',
    title: 'Save person',
    description: 'Add a person (no id) or change one (id; give only what changes) — only when the user asks: their name, their facts (the whole list of {label, value, date?} — a birthday is a fact labelled Birthday with date MM-DD), their domain.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The person to change; leave out to add one.' },
        name: { type: 'string' },
        facts: { type: ['array', 'null'], items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, date: { type: 'string' } }, required: ['label', 'value'] } },
        domain_id: { type: ['string', 'null'], format: 'uuid' },
      },
      additionalProperties: false,
    },
    write: true,
    scope: 'people',
    async run(a, ctx) {
      const pid = uuid(a, 'id')
      const name = text(a, 'name', 200, !pid)
      const [p] = pid ? await ctx.store.find('people', { id: pid }, { limit: 1 }) : []
      if (pid && !p) return bad(`No person with id ${pid}. The people tool lists them.`)
      const facts = factsArg(a, list(p?.facts))
      let domainId: string | null | undefined
      if ('domain_id' in a) {
        domainId = uuid(a, 'domain_id') ?? null
        if (domainId && !(await ctx.store.find('domains', { id: domainId, deleted_at: null }, { limit: 1 })).length) return bad(`No domain with id ${domainId}.`)
      }
      // people/api upsertPerson.
      const values: Row = { ...(name !== undefined ? { name } : {}), ...(facts !== undefined ? { facts } : {}), ...(domainId !== undefined ? { domain_id: domainId } : {}) }
      if (!pid) {
        const row: Row = { id: crypto.randomUUID(), facts: [], domain_id: null, ...values }
        await ctx.store.insert('people', row)
        await logIt(ctx, 'people.created', 'people', row.id as string, { name })
        return { added: personOut(row, undefined, ctx.zone) }
      }
      if (!Object.keys(values).length) return bad('Nothing to change: give name, facts or domain_id.')
      const [row] = await ctx.store.patch('people', { id: pid }, values)
      await logIt(ctx, 'people.updated', 'people', pid, { name: (row ?? p).name })
      return { saved: personOut(row ?? { ...p, ...values }, undefined, ctx.zone) }
    },
  },
  {
    name: 'log_interaction',
    title: 'Log interaction',
    description: "Note that the user spoke with someone — a call, a meeting, a message — with a short summary (only when they ask); `when` defaults to now. With `id`, change a logged one's summary or time.",
    inputSchema: {
      type: 'object',
      properties: {
        person_id: { ...id, description: 'Who.' },
        id: { ...id, description: 'A logged interaction to change instead.' },
        summary: { type: 'string' },
        when: { type: 'string', description: "YYYY-MM-DD or YYYY-MM-DDTHH:mm on the user's clock (default now)." },
      },
      additionalProperties: false,
    },
    write: true,
    scope: 'people',
    async run(a, ctx) {
      const iid = uuid(a, 'id')
      const summary = text(a, 'summary', 2000, !iid)
      const w = whenOrNull(a, 'when', ctx.zone)
      const at = w ? instantOf(w, ctx.zone).toISOString() : undefined
      if (at && Date.parse(at) > ctx.now.getTime() + 60_000) return bad('"when" is in the future: an interaction is one that happened.')
      if (iid) {
        const [i] = await ctx.store.find('interactions', { id: iid }, { limit: 1 })
        if (!i) return bad(`No interaction with id ${iid}.`)
        const values: Row = { ...(summary !== undefined ? { summary } : {}), ...(at ? { occurred_at: at } : {}) }
        if (!Object.keys(values).length) return bad('Nothing to change: give summary or when.')
        await ctx.store.patch('interactions', { id: iid }, values)
        // people/api updateInteraction.
        await logIt(ctx, 'people.interaction_edited', 'people', i.person_id as string, { summary: summary ?? i.summary })
        return { saved: touchOut({ ...i, ...values }, ctx.zone) }
      }
      const pid = uuid(a, 'person_id', true)!
      const [p] = await ctx.store.find('people', { id: pid }, { limit: 1 })
      if (!p) return bad(`No person with id ${pid}. The people tool lists them.`)
      // people/api createInteraction.
      const row = { id: crypto.randomUUID(), person_id: pid, summary, occurred_at: at ?? ctx.now.toISOString() }
      await ctx.store.insert('interactions', row)
      await logIt(ctx, 'people.interaction_logged', 'people', pid, { summary })
      return { logged: { person: p.name, ...touchOut(row, ctx.zone) } }
    },
  },
  {
    name: 'delete_person',
    title: 'Delete person',
    description:
      "Delete a person (id) with every interaction logged with them, or one interaction (interaction_id) — for good: People has no Trash (the app's Delete has only a moment's Undo). Ask the user to confirm first. The answer holds everything removed, so it can be added back.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The person.' }, interaction_id: { ...id, description: 'Only this interaction.' } }, additionalProperties: false },
    write: true,
    destructive: true,
    scope: 'people',
    async run(a, ctx) {
      const pid = uuid(a, 'id')
      const iid = uuid(a, 'interaction_id')
      if (!!pid === !!iid) return bad('Give "id" (a person) or "interaction_id", one of them.')
      if (iid) {
        const [gone] = await ctx.store.remove('interactions', { id: iid })
        if (!gone) return bad(`No interaction with id ${iid}.`)
        await logIt(ctx, 'people.interaction_deleted', 'people', iid)
        return { deleted: { interaction: touchOut(gone, ctx.zone), person_id: gone.person_id } }
      }
      // people/api deletePerson: the server cascades their interactions, so they're read first.
      const touches = await ctx.store.find('interactions', { person_id: pid })
      const [gone] = await ctx.store.remove('people', { id: pid })
      if (!gone) return bad(`No person with id ${pid}.`)
      await logIt(ctx, 'people.deleted', 'people', pid!)
      return { deleted: { person: { id: gone.id, name: gone.name, facts: gone.facts, domain_id: gone.domain_id }, interactions: touches.map((i) => ({ summary: i.summary, occurred_at: i.occurred_at })) } }
    },
  },
]
