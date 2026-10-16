// The MCP tools for where things live and how they're kept (docs/MCP.md): projects (milestones,
// checklists, checklist templates), areas, domains, labels, the Inbox's triage, Trash and the safe
// settings. Pure, like ./tools.ts (tested from app/src/features/settings/mcp.test.ts and
// mcpFull.test.ts); each write restates the app's own (features/<f>/api.ts, named on each).
import { dateKey, userZone, wallTime } from '../_shared/zone.ts'
import {
  addEvent,
  bad,
  choice,
  clockArg,
  colorArg,
  colorName,
  completeTask,
  subtasksOf,
  createTask,
  dateArg,
  dayArg,
  dueFollows,
  eachId,
  eventOut,
  flag,
  id,
  ids,
  instantOf,
  liveRow,
  logIt,
  PLACE_COLORS,
  reopenTask,
  spanText,
  taskOut,
  text,
  uuid,
  when,
  whenOrNull,
  whole,
  words,
  type Args,
  type Row,
  type Scope,
  type TaskRow,
  type ToolContext,
  type ToolDef,
} from './tools.ts'

const nowIso = (ctx: ToolContext) => ctx.now.toISOString()
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
const PERSONAL_LIST = "This key can't reach that: the user can switch it on for this key in Kai's Flow → Settings → AI assistants."
const needScope = (ctx: ToolContext, s: Scope) => (ctx.scopes.has(s) ? undefined : bad(`${s === 'journal' ? 'The journal' : 'People'} — ${PERSONAL_LIST}`))

/** The settings row (one per user), or an empty object before the user ever saved one. */
async function settingsRow(ctx: ToolContext): Promise<Row> {
  const [s] = await ctx.store.find('app_settings', {}, { limit: 1 })
  return s ?? {}
}

/** Writes onto the user's settings row, inserting it when there is none yet (lib/settings updateAppSetting). */
async function writeSettings(ctx: ToolContext, values: Row): Promise<void> {
  const rows = await ctx.store.patch('app_settings', {}, values)
  if (!rows.length) await ctx.store.insert('app_settings', values)
}

// ── projects ─────────────────────────────────────────────────────────────────────────────────────

const STATUSES = ['active', 'archived'] as const

function projectOut(p: Row): Row {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    type: p.type,
    ...(p.color ? { color: colorName(p.color, PLACE_COLORS) } : {}),
    // A target is a date in no zone at UTC midnight (the date input's value), read in UTC as the app does.
    ...(p.target_date ? { target_date: new Date(p.target_date as string).toISOString().slice(0, 10) } : {}),
    ...(p.engagement_model ? { engagement_model: p.engagement_model } : {}),
  }
}

/** A container that changes domain takes its tasks with it (tasks/api carryTasksToDomain): each task
 * in it whose domain differs, logged as a move (the slipping view reads it). */
async function carryTasks(ctx: ToolContext, field: 'project_id' | 'area_id', containerId: string, domainId: string | null): Promise<number> {
  const tasks = (await ctx.store.find('tasks', { [field]: containerId })).filter((t) => (t.domain_id ?? null) !== domainId)
  for (const t of tasks) {
    await ctx.store.patch('tasks', { id: t.id }, { domain_id: domainId })
    await logIt(ctx, 'task.moved', 'task', t.id as string, { project_id: t.project_id ?? null, area_id: t.area_id ?? null, domain_id: domainId })
  }
  return tasks.length
}

const tasksWord = (n: number) => `${n} task${n === 1 ? '' : 's'}`

/** The live domain for `domain_id` when given (null = none). */
async function domainArg(a: Args, ctx: ToolContext): Promise<{ id: string | null; name: string | null } | undefined> {
  if (!('domain_id' in a)) return undefined
  const did = uuid(a, 'domain_id') ?? null
  if (!did) return { id: null, name: null }
  const d = await liveRow(ctx, 'domains', did, 'domain')
  return { id: did, name: d.name as string }
}

/** A project's checklist line: a task-linked one reads done when its task is (product audit 2026-10-12). */
function lineOut(i: Row, byId: Map<string, TaskRow>): Row {
  const linked = i.task_id ? byId.get(i.task_id as string) : undefined
  return { id: i.id, title: i.title, type: i.type, done: linked ? linked.status === 'done' : !!i.completed, ...(i.task_id ? { task_id: i.task_id } : {}) }
}

// ── labels (features/tasks/labels.ts): free text on tasks.labels + app_settings.label_meta colours ──

export const LABEL_COLORS: Record<string, string> = {
  terracotta: 'var(--acc-terra)', lavender: 'var(--acc-lavender)', sage: 'var(--acc-sage)',
  hydrangea: 'var(--acc-hydrangea)', buttercream: 'var(--acc-buttercream)', clover: 'var(--acc-clover)',
}
const known = new Set(Object.values(LABEL_COLORS))
/** label_meta kept to known swatches (labels.ts parseLabelMeta). */
const labelMeta = (raw: unknown): Record<string, string> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw as Row).filter(([k, v]) => k.trim() && typeof v === 'string' && known.has(v))) as Record<string, string> : {}
const sameName = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' }) === 0

/** Every label, with its count (live tasks, open and done) and colour, A–Z (labels.ts labelList). */
async function labelList(ctx: ToolContext): Promise<{ labels: { name: string; count: number; color: string | null }[]; meta: Record<string, string>; ready: boolean }> {
  const s = await settingsRow(ctx)
  const meta = labelMeta(s.label_meta)
  const counts = new Map<string, number>(Object.keys(meta).map((k) => [k, 0]))
  const tasks = await ctx.store.listTasks({ status: 'all', projectId: null, label: null, dueFrom: null, dueTo: null, limit: 20000 })
  for (const t of tasks) for (const l of new Set(t.labels ?? [])) counts.set(l, (counts.get(l) ?? 0) + 1)
  const labels = [...counts].map(([name, count]) => ({ name, count, color: meta[name] ? colorName(meta[name], LABEL_COLORS) : null })).sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }))
  return { labels, meta, ready: 'label_meta' in s }
}

// ── Trash ────────────────────────────────────────────────────────────────────────────────────────

const TRASH_TYPES = ['task', 'inbox_item', 'project', 'area', 'domain', 'journal_entry'] as const
const RESTORE_TYPES = ['task', 'inbox_item', 'calendar_event', 'project', 'area', 'domain', 'journal_entry'] as const
const TABLE_OF = { task: 'tasks', inbox_item: 'inbox_items', calendar_event: 'calendar_events', project: 'projects', area: 'areas', domain: 'domains', journal_entry: 'journal_entries' } as const
const titleOf = (r: Row) => ((r.title ?? r.name ?? r.raw_text ?? (typeof r.body === 'string' ? r.body.slice(0, 80) : null)) as string | null) ?? null

// ── settings: the safe subset (never keys, tokens or the app's internal state) ──────────────────────

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const SWITCHES = [
  'morning_digest_on', 'evening_nudge_on', 'task_reminder_on', 'event_reminder_on', 'routine_on', 'focus_done_on', 'paper_ready_on', 'birthday_on',
  'sync_problem_on', 'quiet_hours_on', 'lock_screen_names', 'capture_keep_photos',
] as const
const TIMES = ['morning_digest_at', 'evening_nudge_at', 'quiet_from', 'quiet_to'] as const
const SETTINGS_FIELDS = ['timezone', 'weekend_days', 'slipping_default_days', 'calendar_day_count', 'calendar_default_view', 'display_name', 'workspace_name', 'notify_paused_until', ...SWITCHES, ...TIMES] as const

function settingsOut(s: Row, zone: string): Row {
  const o: Row = {}
  for (const k of SETTINGS_FIELDS) {
    if (!(k in s)) continue
    const v = s[k]
    if (k === 'weekend_days') o.weekend_days = list(v).map((d) => WEEKDAYS[Number(d)])
    else if ((TIMES as readonly string[]).includes(k)) o[k] = typeof v === 'string' ? v.slice(0, 5) : v
    else if (k === 'notify_paused_until') o[k] = v ? wallTime(v as string, zone) : null
    else o[k] = v
  }
  return o
}

// ── the Inbox ────────────────────────────────────────────────────────────────────────────────────

const webUrl = (u: unknown): string | null => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : null)
const urlIn = (s: unknown): string | null => (typeof s === 'string' ? (/https?:\/\/[^\s<>"']+/i.exec(s)?.[0].replace(/[.,;:!?]+$/, '') ?? null) : null)

function inboxOut(i: Row, zone: string): Row {
  const p = (i.payload ?? {}) as Row
  const parse = (i.ai_parse ?? {}) as Row
  return {
    id: i.id,
    text: i.raw_text,
    ...(i.kind !== 'text' ? { kind: i.kind } : {}),
    captured: wallTime(i.created_at as string, zone),
    ...(i.status !== 'pending' ? { status: i.status } : {}),
    ...(i.snoozed_until ? { snoozed_until: wallTime(i.snoozed_until as string, zone) } : {}),
    ...(webUrl(p.url) ? { link: p.url } : {}),
    ...(typeof parse.title === 'string' && parse.title.trim() ? { suggested_title: parse.title } : {}),
    ...(i.filed_task_id ? { filed_task_id: i.filed_task_id } : {}),
    ...(p.filed_to ? { filed_to: p.filed_to } : {}),
  }
}

/** A pending capture, or a readable refusal. */
async function pendingItem(ctx: ToolContext, itemId: string): Promise<Row> {
  const [item] = await ctx.store.find('inbox_items', { id: itemId, deleted_at: null }, { limit: 1 })
  if (!item) return bad(`No Inbox item with id ${itemId} (it may be in Trash). The inbox tool lists them.`)
  if (item.status !== 'pending') return bad(`"${item.raw_text}" is ${item.status === 'filed' ? 'already filed' : 'dismissed'}${item.status === 'dismissed' ? ' — update_inbox_item with restore brings it back' : ''}.`)
  return item
}

/** The capture marked filed somewhere other than a task (inbox/api markFiled). */
async function markFiled(ctx: ToolContext, item: Row, filedTo: string, meta: Row): Promise<void> {
  await ctx.store.patch('inbox_items', { id: item.id }, { status: 'filed', payload: { ...((item.payload ?? {}) as Row), filed_to: filedTo } })
  await logIt(ctx, 'inbox.filed', 'inbox_item', item.id as string, meta)
}

export const ORGANIZE_TOOLS: readonly ToolDef[] = [
  {
    name: 'get_project',
    title: 'Get project',
    description: 'One project in full: status, type, domain, colour, target date, engagement, its milestones, its checklist (a task-linked line reads done when its task is) and its open tasks.',
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The project id.' } }, required: ['id'], additionalProperties: false },
    write: false,
    async run(a, ctx) {
      const p = await liveRow(ctx, 'projects', uuid(a, 'id', true)!, 'project')
      const tasks = await ctx.store.listTasks({ status: 'all', projectId: p.id as string, label: null, dueFrom: null, dueTo: null, limit: 1000 })
      const open = tasks.filter((t) => t.status === 'todo')
      const byId = new Map(tasks.map((t) => [t.id, t]))
      const [domain] = p.domain_id ? await ctx.store.find('domains', { id: p.domain_id }, { limit: 1 }) : []
      return {
        timezone: ctx.zone,
        project: {
          ...projectOut(p),
          ...(domain ? { domain: domain.name, domain_id: domain.id } : {}),
          milestones: list(p.milestones).map((m) => ({ id: m.id, title: m.title, weight: m.weight, done: !!m.completed })),
          checklist: list(p.checklist).map((i) => lineOut(i, byId)),
          open_task_count: open.length,
          open_tasks: open.slice(0, 50).map((t) => taskOut(t, ctx.zone)),
        },
      }
    },
  },
  {
    name: 'save_project',
    title: 'Save project',
    description:
      'Create a project (no id) or change one (id; give only what changes) — only when the user asks. status archived = Finish / Archive (active brings it back); type standard or retainer (a retainer reloads its checklist on the 1st); a new domain takes its tasks along; color is one of terracotta, moss, lavender, gold, hydrangea, sage, plum, stone. Delete with move_to_trash.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The project to change; leave out to create one.' },
        name: { type: 'string', description: 'Its name (required to create).' },
        domain_id: { type: ['string', 'null'], format: 'uuid', description: 'Its domain; null = none.' },
        type: { type: 'string', enum: ['standard', 'retainer'] },
        status: { type: 'string', enum: [...STATUSES], description: 'active, or archived (finished / put away).' },
        color: { type: ['string', 'null'], description: 'A colour name (see above); null = none.' },
        target_date: { type: ['string', 'null'], description: 'Its target day, YYYY-MM-DD; null = none.' },
        engagement_model: { type: ['string', 'null'], description: 'How the work is paid or run (free text); null = none.' },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const pid = uuid(a, 'id')
      const name = text(a, 'name', 200, !pid)
      const domain = await domainArg(a, ctx)
      const type = 'type' in a ? choice(a, 'type', ['standard', 'retainer'] as const, 'standard') : undefined
      const status = 'status' in a ? choice(a, 'status', STATUSES, 'active') : undefined
      const color = colorArg(a, 'color', PLACE_COLORS)
      const target = 'target_date' in a ? (a.target_date === null ? null : `${dayArg(a, 'target_date', ctx.zone)}T00:00:00Z`) : undefined
      const engagement = 'engagement_model' in a ? (text(a, 'engagement_model', 200) ?? null) : undefined
      if (!pid) {
        if (status === 'archived') return bad('A new project starts active.')
        // projects/api createProject.
        const row: Row = { id: crypto.randomUUID(), name, domain_id: domain?.id ?? null, type: type ?? 'standard', status: 'active', color: color ?? null, target_date: target ?? null, milestones: [], checklist: [], engagement_model: engagement ?? null }
        await ctx.store.insert('projects', row)
        await logIt(ctx, 'project.created', 'project', row.id as string, { name, domain_id: row.domain_id, type: row.type })
        return { created: projectOut(row), timezone: ctx.zone }
      }
      const p = await liveRow(ctx, 'projects', pid, 'project')
      const values: Row = {}
      const changed: string[] = []
      const logs: [string, Row][] = []
      const set = (k: string, v: unknown, said: string, event: string, payload: Row) => {
        values[k] = v
        changed.push(said)
        logs.push([event, payload])
      }
      if (name !== undefined && name !== p.name) set('name', name, `name → "${name}"`, 'project.renamed', { name })
      if (domain && domain.id !== (p.domain_id ?? null)) set('domain_id', domain.id, domain.name ? `domain → ${domain.name}` : 'out of its domain', 'project.reparented', { domain_id: domain.id })
      if (type && type !== p.type) set('type', type, `type → ${type}`, 'project.type_changed', { from: p.type, to: type, name: p.name })
      if (status && status !== p.status) set('status', status, status === 'archived' ? 'archived (finished)' : 'active again', status === 'archived' ? 'project.archived' : 'project.restored', {})
      if (color !== undefined && color !== (p.color ?? null)) set('color', color, color ? `colour → ${colorName(color, PLACE_COLORS)}` : 'colour cleared', 'project.color_changed', { color })
      const was = p.target_date ? new Date(p.target_date as string).toISOString().slice(0, 10) : null
      if (target !== undefined && (target?.slice(0, 10) ?? null) !== was) set('target_date', target, target ? `target → ${target.slice(0, 10)}` : 'target cleared', 'project.target_date_changed', { target_date: target })
      if (engagement !== undefined && engagement !== (p.engagement_model ?? null)) set('engagement_model', engagement, 'engagement', 'project.engagement_changed', { engagement_model: engagement })
      if (!changed.length) return { saved: projectOut(p), changed, timezone: ctx.zone }
      const [row] = await ctx.store.patch('projects', { id: pid }, values)
      for (const [event, payload] of logs) await logIt(ctx, event, 'project', pid, payload)
      if ('domain_id' in values) {
        const n = await carryTasks(ctx, 'project_id', pid, values.domain_id as string | null)
        if (n) changed.push(`${tasksWord(n)} moved with it`)
      }
      return { saved: projectOut(row ?? { ...p, ...values }), changed, timezone: ctx.zone }
    },
  },
  {
    name: 'update_milestone',
    title: 'Update milestone',
    description: "A project's milestones (only when the user asks): add (title, weight), rename, reweigh, complete, reopen or remove one (milestone_id from get_project).",
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { ...id, description: 'The project.' },
        action: { type: 'string', enum: ['add', 'rename', 'reweigh', 'complete', 'reopen', 'remove'] },
        milestone_id: { ...id, description: 'The milestone (all but add).' },
        title: { type: 'string', description: 'Its title (add, rename).' },
        weight: { type: 'integer', minimum: 1, maximum: 100, description: 'How much of the project it is (add, reweigh; default 1).' },
      },
      required: ['project_id', 'action'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const p = await liveRow(ctx, 'projects', uuid(a, 'project_id', true)!, 'project')
      const action = choice(a, 'action', ['add', 'rename', 'reweigh', 'complete', 'reopen', 'remove'] as const, 'add')
      const ms = list(p.milestones)
      // projects/api addProjectMilestone / renameProjectMilestone / reweighProjectMilestone / toggleProjectMilestone / removeProjectMilestone.
      if (action === 'add') {
        const m = { id: crypto.randomUUID(), title: text(a, 'title', 200, true)!, weight: whole(a, 'weight', 1, 100, 1), completed: false }
        await ctx.store.patch('projects', { id: p.id }, { milestones: [...ms, m] })
        await logIt(ctx, 'project.milestone_added', 'project', p.id as string, { title: m.title, weight: m.weight })
        return { added: { id: m.id, title: m.title, weight: m.weight, done: false } }
      }
      const mid = uuid(a, 'milestone_id', true)!
      const m = ms.find((x) => x.id === mid) ?? bad(`"${p.name}" has no milestone ${mid}. get_project lists them.`)
      let next: Row | null = m
      let event: string
      let payload: Row
      if (action === 'rename') {
        const title = text(a, 'title', 200, true)!
        next = { ...m, title }
        ;[event, payload] = ['project.milestone_renamed', { milestone_id: mid, title }]
      } else if (action === 'reweigh') {
        const weight = whole(a, 'weight', 1, 100, 1)
        next = { ...m, weight }
        ;[event, payload] = ['project.milestone_reweighted', { milestone_id: mid, weight }]
      } else if (action === 'remove') {
        next = null
        ;[event, payload] = ['project.milestone_removed', { milestone_id: mid }]
      } else {
        const done = action === 'complete'
        if (!!m.completed === done) return { milestone: { id: mid, title: m.title, done }, changed: [] }
        next = { ...m, completed: done }
        ;[event, payload] = [done ? 'project.milestone_completed' : 'project.milestone_uncompleted', { milestone_id: mid, title: m.title }]
      }
      await ctx.store.patch('projects', { id: p.id }, { milestones: next ? ms.map((x) => (x.id === mid ? next : x)) : ms.filter((x) => x.id !== mid) })
      await logIt(ctx, event, 'project', p.id as string, payload)
      return next ? { milestone: { id: mid, title: next.title, weight: next.weight, done: !!next.completed } } : { removed: { id: mid, title: m.title } }
    },
  },
  {
    name: 'update_checklist',
    title: 'Update checklist',
    description:
      "A project's checklist (only when the user asks): add a line (type one-shot — a line only — or task-linked — also a real task in the project), rename, check, uncheck or remove one (item_id from get_project). Checking a task-linked line completes its task (unchecking reopens it), as in the app.",
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { ...id, description: 'The project.' },
        action: { type: 'string', enum: ['add', 'rename', 'check', 'uncheck', 'remove'] },
        item_id: { ...id, description: 'The line (all but add).' },
        title: { type: 'string', description: 'Its words (add, rename).' },
        type: { type: 'string', enum: ['one-shot', 'task-linked'], description: 'add: one-shot (default) or task-linked.' },
      },
      required: ['project_id', 'action'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const p = await liveRow(ctx, 'projects', uuid(a, 'project_id', true)!, 'project')
      const action = choice(a, 'action', ['add', 'rename', 'check', 'uncheck', 'remove'] as const, 'add')
      const lines = list(p.checklist)
      if (action === 'add') {
        const title = text(a, 'title', 300, true)!
        const type = choice(a, 'type', ['one-shot', 'task-linked'] as const, 'one-shot')
        // ProjectDetailPage: a task-linked line makes its task first, in the project (and its domain).
        const task = type === 'task-linked' ? (await createTask(ctx, { title, project: { id: p.id as string, name: p.name as string, domain_id: (p.domain_id as string | null) ?? null } })).task : null
        const line = { id: crypto.randomUUID(), title, type, completed: false, task_id: task?.id ?? null }
        await ctx.store.patch('projects', { id: p.id }, { checklist: [...lines, line] })
        await logIt(ctx, 'project.checklist_item_added', 'project', p.id as string, { title, type })
        return { added: { id: line.id, title, type, ...(task ? { task: taskOut(task, ctx.zone) } : {}) } }
      }
      const iid = uuid(a, 'item_id', true)!
      const line = lines.find((x) => x.id === iid) ?? bad(`"${p.name}" has no checklist line ${iid}. get_project lists them.`)
      if (action === 'check' || action === 'uncheck') {
        const done = action === 'check'
        const linked = line.task_id ? await ctx.store.getTask(line.task_id as string) : null
        if (linked) {
          // A task-linked line IS its task: ticking it completes / reopens the task.
          if ((linked.status === 'done') === done) return { line: lineOut(line, new Map([[linked.id, linked]])), changed: [] }
          const after = done ? (await completeTask(ctx, linked)).done : await reopenTask(ctx, linked.id)
          return { line: lineOut(line, new Map([[after.id, after]])), changed: [done ? `"${linked.title}" done` : `"${linked.title}" reopened`] }
        }
        if (!!line.completed === done) return { line: lineOut(line, new Map()), changed: [] }
        await ctx.store.patch('projects', { id: p.id }, { checklist: lines.map((x) => (x.id === iid ? { ...x, completed: done } : x)) })
        await logIt(ctx, done ? 'project.checklist_item_completed' : 'project.checklist_item_uncompleted', 'project', p.id as string, { item_id: iid, title: line.title })
        return { line: lineOut({ ...line, completed: done }, new Map()), changed: [done ? 'checked' : 'unchecked'] }
      }
      if (action === 'rename') {
        // The line only — a task-linked item's task keeps its own title.
        const title = text(a, 'title', 300, true)!
        await ctx.store.patch('projects', { id: p.id }, { checklist: lines.map((x) => (x.id === iid ? { ...x, title } : x)) })
        await logIt(ctx, 'project.checklist_item_renamed', 'project', p.id as string, { item_id: iid, title })
        return { line: lineOut({ ...line, title }, new Map()) }
      }
      await ctx.store.patch('projects', { id: p.id }, { checklist: lines.filter((x) => x.id !== iid) })
      await logIt(ctx, 'project.checklist_item_removed', 'project', p.id as string, { item_id: iid })
      return { removed: { id: iid, title: line.title } }
    },
  },
  {
    name: 'checklist_template',
    title: 'Checklist template',
    description:
      "Checklist templates (the projects tool lists them): save a project's checklist as a template (project_id + name), use one on a project (template_id + project_id: its task-linked items become real tasks there), rename or delete one. Only when the user asks.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save', 'use', 'rename', 'delete'] },
        project_id: { ...id, description: 'save: the project whose checklist to save; use: the project to add it to.' },
        template_id: { ...id, description: 'use / rename / delete: the template.' },
        name: { type: 'string', description: 'save / rename: its name.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const action = choice(a, 'action', ['save', 'use', 'rename', 'delete'] as const, 'save')
      const s = await settingsRow(ctx)
      if (!('checklist_templates' in s)) return bad("Checklist templates need the server's 0079 update; the app offers none yet either.")
      // projects/templates.ts parseTemplates: malformed entries dropped.
      const templates = list(s.checklist_templates).filter((t) => typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.items))
      const write = (next: Row[]) => writeSettings(ctx, { checklist_templates: next })
      if (action === 'save') {
        const p = await liveRow(ctx, 'projects', uuid(a, 'project_id', true)!, 'project')
        const name = text(a, 'name', 120, true)!
        const t = { id: crypto.randomUUID(), name, items: list(p.checklist).map((i) => ({ title: i.title, type: i.type === 'task-linked' ? 'task-linked' : 'one-shot' })) }
        await write([...templates, t])
        await logIt(ctx, 'project.template_saved', 'project', p.id as string, { template_id: t.id, template: name, items: t.items.length })
        return { saved: { id: t.id, name, items: t.items.length } }
      }
      const tid = uuid(a, 'template_id', true)!
      const t = templates.find((x) => x.id === tid) ?? bad(`No checklist template with id ${tid}. The projects tool lists them.`)
      if (action === 'use') {
        // templates.ts applyTemplateWithUndo: every item a line; a task-linked one also a task in the project.
        const p = await liveRow(ctx, 'projects', uuid(a, 'project_id', true)!, 'project')
        const lines: Row[] = []
        let made = 0
        for (const it of list(t.items)) {
          const title = String(it.title ?? '').trim()
          if (!title) continue
          const linked = it.type === 'task-linked'
          const task = linked ? (await createTask(ctx, { title, project: { id: p.id as string, name: p.name as string, domain_id: (p.domain_id as string | null) ?? null } })).task : null
          if (task) made++
          lines.push({ id: crypto.randomUUID(), title, type: linked ? 'task-linked' : 'one-shot', completed: false, task_id: task?.id ?? null })
        }
        await ctx.store.patch('projects', { id: p.id }, { checklist: [...list(p.checklist), ...lines] })
        await logIt(ctx, 'project.template_used', 'project', p.id as string, { template_id: tid, template: t.name, items: lines.length, tasks: made })
        return { used: { template: t.name, project: p.name, lines: lines.length, tasks: made } }
      }
      if (action === 'rename') {
        const name = text(a, 'name', 120, true)!
        await write(templates.map((x) => (x.id === tid ? { ...x, name } : x)))
        await logIt(ctx, 'template.renamed', 'template', tid, { name })
        return { renamed: { id: tid, name } }
      }
      await write(templates.filter((x) => x.id !== tid))
      await logIt(ctx, 'template.deleted', 'template', tid, { name: t.name })
      return { deleted: { id: tid, name: t.name, items: list(t.items) } }
    },
  },
  {
    name: 'save_area',
    title: 'Save area',
    description: 'Create an area (no id) or change one (id; give only what changes) — only when the user asks. A new domain takes its tasks along. color: terracotta, moss, lavender, gold, hydrangea, sage, plum or stone. Delete with move_to_trash.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The area to change; leave out to create one.' },
        name: { type: 'string', description: 'Its name (required to create).' },
        domain_id: { type: ['string', 'null'], format: 'uuid', description: 'Its domain; null = none.' },
        color: { type: ['string', 'null'], description: 'A colour name; null = none.' },
        description: { type: ['string', 'null'], description: 'What it holds; null = none.' },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const aid = uuid(a, 'id')
      const name = text(a, 'name', 200, !aid)
      const domain = await domainArg(a, ctx)
      const color = colorArg(a, 'color', PLACE_COLORS)
      const description = 'description' in a ? (text(a, 'description', 2000) ?? null) : undefined
      const out = (r: Row) => ({ id: r.id, name: r.name, ...(r.color ? { color: colorName(r.color, PLACE_COLORS) } : {}), ...(r.description ? { description: r.description } : {}) })
      if (!aid) {
        // areas/api createArea: last in the list.
        const count = (await ctx.store.find('areas', {})).length
        const row: Row = { id: crypto.randomUUID(), name, domain_id: domain?.id ?? null, color: color ?? null, description: description ?? null, sort_order: count }
        await ctx.store.insert('areas', row)
        await logIt(ctx, 'area.created', 'area', row.id as string, { name })
        return { created: out(row) }
      }
      const ar = await liveRow(ctx, 'areas', aid, 'area')
      const values: Row = {}
      const changed: string[] = []
      const logs: [string, Row][] = []
      const set = (k: string, v: unknown, said: string, event: string, payload: Row) => {
        values[k] = v
        changed.push(said)
        logs.push([event, payload])
      }
      if (name !== undefined && name !== ar.name) set('name', name, `name → "${name}"`, 'area.renamed', { name })
      if (domain && domain.id !== (ar.domain_id ?? null)) set('domain_id', domain.id, domain.name ? `domain → ${domain.name}` : 'out of its domain', 'area.reparented', { domain_id: domain.id })
      if (color !== undefined && color !== (ar.color ?? null)) set('color', color, color ? `colour → ${colorName(color, PLACE_COLORS)}` : 'colour cleared', 'area.recolored', { color })
      if (description !== undefined && description !== (ar.description ?? null)) set('description', description, 'description', 'area.updated', { field: 'description' })
      if (!changed.length) return { saved: out(ar), changed }
      const [row] = await ctx.store.patch('areas', { id: aid }, values)
      for (const [event, payload] of logs) await logIt(ctx, event, 'area', aid, payload)
      if ('domain_id' in values) {
        const n = await carryTasks(ctx, 'area_id', aid, values.domain_id as string | null)
        if (n) changed.push(`${tasksWord(n)} moved with it`)
      }
      return { saved: out(row ?? { ...ar, ...values }), changed }
    },
  },
  {
    name: 'save_domain',
    title: 'Save domain',
    description:
      'Create a domain (no id), rename or recolour one (id), or merge it into another (id + merge_into: everything filed under it moves there, then it goes to Trash) — only when the user asks. color: terracotta, moss, lavender, gold, hydrangea, sage, plum or stone. Delete with move_to_trash.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The domain to change; leave out to create one.' },
        name: { type: 'string', description: 'Its name (required to create).' },
        color: { type: ['string', 'null'], description: 'A colour name; null = none.' },
        merge_into: { ...id, description: 'Merge this domain into that one.' },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const did = uuid(a, 'id')
      const into = uuid(a, 'merge_into')
      const name = text(a, 'name', 200, !did)
      const color = colorArg(a, 'color', PLACE_COLORS)
      const out = (r: Row) => ({ id: r.id, name: r.name, ...(r.color ? { color: colorName(r.color, PLACE_COLORS) } : {}) })
      if (!did) {
        if (into) return bad('"merge_into" needs "id", the domain to merge.')
        const count = (await ctx.store.find('domains', {})).length
        const row: Row = { id: crypto.randomUUID(), name, color: color ?? null, sort_order: count }
        await ctx.store.insert('domains', row)
        await logIt(ctx, 'domain.created', 'domain', row.id as string, { name })
        return { created: out(row) }
      }
      const d = await liveRow(ctx, 'domains', did, 'domain')
      if (into) {
        if (name !== undefined || color !== undefined) return bad('A merge takes only "id" and "merge_into".')
        if (into === did) return bad('A domain can\'t merge into itself.')
        const target = await liveRow(ctx, 'domains', into, 'domain')
        // domains/api mergeDomain: every row under it moves (organize.ts DOMAIN_TABLES), then it goes to
        // Trash. People move only for a key allowed People; for any other they keep the old domain
        // (read as "no domain" meanwhile, as when the app's people list never loaded).
        let moved = 0
        for (const table of ['projects', 'areas', 'tasks', 'routines', 'notes', ...(ctx.scopes.has('people') ? (['people'] as const) : [])] as const) {
          moved += (await ctx.store.patch(table, { domain_id: did }, { domain_id: into })).length
        }
        await ctx.store.patch('domains', { id: did }, { deleted_at: nowIso(ctx) })
        await logIt(ctx, 'domain.merged', 'domain', did, { into, name: d.name, moved })
        return {
          merged: { from: d.name, into: target.name, moved },
          changed: [`${moved} thing${moved === 1 ? '' : 's'} moved into ${target.name}; "${d.name}" is in Trash`, ...(ctx.scopes.has('people') ? [] : ['people filed under it keep it (this key can\'t reach People) — merging in the app moves them too'])],
        }
      }
      const values: Row = {}
      const changed: string[] = []
      if (name !== undefined && name !== d.name) {
        values.name = name
        changed.push(`name → "${name}"`)
        await logIt(ctx, 'domain.renamed', 'domain', did, { name })
      }
      if (color !== undefined && color !== (d.color ?? null)) {
        values.color = color
        changed.push(color ? `colour → ${colorName(color, PLACE_COLORS)}` : 'colour cleared')
        await logIt(ctx, 'domain.recolored', 'domain', did, { color })
      }
      if (!changed.length) return { saved: out(d), changed }
      const [row] = await ctx.store.patch('domains', { id: did }, values)
      return { saved: out(row ?? { ...d, ...values }), changed }
    },
  },
  {
    name: 'labels',
    title: 'Labels',
    description: 'Every label in use or made in the app, with how many tasks carry it (open and done) and its colour.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      return { labels: (await labelList(ctx)).labels }
    },
  },
  {
    name: 'update_label',
    title: 'Update label',
    description:
      'Labels (only when the user asks): create (name + color — a label no task carries yet), recolor, rename (to: the new name — onto an existing label it merges), merge (to: an existing label) or delete (off every task that has it). Colours: terracotta, lavender, sage, hydrangea, buttercream, clover.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'recolor', 'rename', 'merge', 'delete'] },
        name: { type: 'string', description: 'The label.' },
        to: { type: 'string', description: 'rename / merge: the new (or the existing) name.' },
        color: { type: 'string', description: 'create / recolor (also allowed on rename): a colour name.' },
      },
      required: ['action', 'name'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const action = choice(a, 'action', ['create', 'recolor', 'rename', 'merge', 'delete'] as const, 'create')
      const name = text(a, 'name', 60, true)!
      const to = action === 'rename' || action === 'merge' ? text(a, 'to', 60, true)! : undefined
      const color = 'color' in a ? colorArg(a, 'color', LABEL_COLORS) : undefined
      const { labels, meta, ready } = await labelList(ctx)
      const own = labels.find((l) => sameName(l.name, name))
      const writeMeta = async (next: Record<string, string>) => {
        if (ready && JSON.stringify(next) !== JSON.stringify(meta)) await writeSettings(ctx, { label_meta: next })
      }
      if (action === 'create' || action === 'recolor') {
        // labels.ts setLabelColor: a name that exists in another case colours that label, never a twin.
        if (!color) return bad('"color" is required: terracotta, lavender, sage, hydrangea, buttercream or clover.')
        if (!ready) return bad("Label colours need the server's 0069 update.")
        if (action === 'recolor' && !own) return bad(`No label "${name}". The labels tool lists them.`)
        const label = own?.name ?? name
        await writeMeta({ ...meta, [label]: color })
        await logIt(ctx, own ? 'label.recolored' : 'label.created', 'label', label, { name: label, color })
        return { label: { name: label, color: colorName(color, LABEL_COLORS), count: own?.count ?? 0 } }
      }
      if (!own) return bad(`No label "${name}". The labels tool lists them.`)
      const target = to !== undefined ? labels.find((l) => sameName(l.name, to) && !sameName(l.name, own.name)) : undefined
      if (action === 'merge' && !target) return bad(`No label "${to}" to merge into. To give it a new name, use rename.`)
      const into = to === undefined ? null : (target?.name ?? to)
      // labels.ts planRelabel: on every task that carries it, trashed ones too (a restore brings back the new name).
      const carriers = await ctx.store.find('tasks', { labels: [own.name] })
      for (const t of carriers) {
        const next = [...new Set(((t.labels as string[] | null) ?? []).flatMap((l) => (l === own.name ? (into === null ? [] : [into]) : [l])))]
        await ctx.store.patch('tasks', { id: t.id }, { labels: next })
      }
      // relabelMeta: the colour goes with the name; a merge keeps the target's own.
      const { [own.name]: was, ...rest } = meta
      const keep = into === null ? undefined : (color ?? rest[into] ?? was)
      await writeMeta(into === null ? rest : keep ? { ...rest, [into]: keep } : rest)
      // Not task activity (the slipping view would read every carrier as touched): one label event.
      const event = into === null ? 'label.deleted' : target ? 'label.merged' : 'label.renamed'
      await logIt(ctx, event, 'label', own.name, { name: own.name, ...(into ? { to: into } : {}), tasks: carriers.length })
      return { [into === null ? 'deleted' : target ? 'merged' : 'renamed']: { from: own.name, ...(into ? { to: into } : {}), tasks: carriers.length } }
    },
  },
  {
    name: 'trash',
    title: 'Trash',
    description: 'What is in Trash (kept 30 days, then gone): tasks, Inbox items, events, projects, areas, domains — and journal entries for a key allowed the journal. Newest first; restore_from_trash brings one back.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many (default 50).' } }, additionalProperties: false },
    write: false,
    async run(a, ctx) {
      const rows = await ctx.store.trashed(whole(a, 'limit', 1, 100, 50))
      return {
        timezone: ctx.zone,
        items: rows
          .filter((r) => r.type !== 'journal_entry' || ctx.scopes.has('journal'))
          .map((r) => ({ type: r.type, id: r.id, title: r.title, deleted: wallTime(r.deleted_at, ctx.zone) })),
      }
    },
  },
  {
    name: 'move_to_trash',
    title: 'Move to Trash',
    description:
      "Delete tasks, Inbox items, projects, areas or domains (and journal entries, for a key allowed the journal) — only when the user asks. They go to Trash for 30 days, where the app (or restore_from_trash) brings them back; a task's calendar blocks go with it. What's in a project, area or domain isn't touched. Events: delete_event.",
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: [...TRASH_TYPES] }, id: { ...id, description: 'The id.' }, ids: ids('The ids') },
      required: ['type'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const type = choice(a, 'type', TRASH_TYPES, 'task')
      if (type === 'journal_entry') needScope(ctx, 'journal')
      const at = nowIso(ctx)
      return eachId(a, async (rowId) => {
        const [row] = await ctx.store.find(TABLE_OF[type], { id: rowId, deleted_at: null }, { limit: 1 })
        if (!row) return bad(`No ${type.replace('_', ' ')} with id ${rowId} (it may already be in Trash).`)
        if (type === 'task') {
          // tasks/api deleteTasksWithUndo: its blocks too (deleteEventsForTask), a pick gives up its place,
          // and a parent takes its subtasks along at the same instant (restore brings them back together).
          const subs = await subtasksOf(ctx, rowId)
          for (const t of [row as unknown as TaskRow, ...subs]) {
            const blocks = await ctx.store.taskBlocks(t.id)
            if (blocks.length) await ctx.store.deleteEvents(blocks.map((b) => b.id))
            await ctx.store.patch('tasks', { id: t.id }, { deleted_at: at, ...(t.top3 ? { top3: false, top3_rank: null } : {}) })
            await logIt(ctx, 'task.deleted', 'task', t.id)
          }
          if (subs.length) return { trashed: { type, id: rowId, title: titleOf(row), with_subtasks: subs.length } }
        } else {
          await ctx.store.patch(TABLE_OF[type], { id: rowId }, { deleted_at: at })
          // inbox/api purgeInboxItem · projects/api deleteProjectWithUndo · areas, domains · journal/api deleteJournalEntry.
          const [event, entity, payload] =
            type === 'inbox_item' ? ['inbox.purged', 'inbox_item', {}]
            : type === 'journal_entry' ? ['journal.deleted', 'journal_entry', {}]
            : [`${type}.deleted`, type, { name: row.name }]
          await logIt(ctx, event, entity, rowId, payload)
        }
        return { trashed: { type, id: rowId, title: titleOf(row) } }
      })
    },
  },
  {
    name: 'restore_from_trash',
    title: 'Restore from Trash',
    description: 'Bring things back from Trash (the trash tool lists them): tasks (with their calendar blocks), Inbox items (back to the Inbox), events, projects, areas, domains — and journal entries for a key allowed the journal.',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: [...RESTORE_TYPES] }, id: { ...id, description: 'The id.' }, ids: ids('The ids') },
      required: ['type'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const type = choice(a, 'type', RESTORE_TYPES, 'task')
      if (type === 'journal_entry') needScope(ctx, 'journal')
      return eachId(a, async (rowId) => {
        const [row] = await ctx.store.find(TABLE_OF[type], { id: rowId, ...(type === 'calendar_event' ? { source: 'native' } : {}) }, { limit: 1 })
        if (!row || !row.deleted_at) return bad(`No ${type.replace('_', ' ')} with id ${rowId} in Trash. The trash tool lists what's there.`)
        if (type === 'task') {
          // tasks/api restoreTask: its blocks come back with it (restoreEventsForTask), and the subtasks
          // that went to Trash with it (the same instant).
          const subs = await ctx.store.find('tasks', { parent_task_id: rowId, deleted_at: row.deleted_at })
          for (const id of [rowId, ...subs.map((s) => s.id as string)]) {
            await ctx.store.patch('tasks', { id }, { deleted_at: null })
            await ctx.store.patch('calendar_events', { task_id: id, source: 'native' }, { deleted_at: null })
            await logIt(ctx, 'task.restored', 'task', id)
          }
          if (subs.length) return { restored: { type, id: rowId, title: titleOf(row), with_subtasks: subs.length } }
        } else if (type === 'inbox_item') {
          await ctx.store.patch('inbox_items', { id: rowId }, { status: 'pending', snoozed_until: null, deleted_at: null })
          await logIt(ctx, 'inbox.restored', 'inbox_item', rowId)
        } else if (type === 'calendar_event') {
          // calendar/api restoreEvent: a task's block re-links its task's schedule; a missed due date follows.
          await ctx.store.patch('calendar_events', { id: rowId }, { deleted_at: null })
          if (row.task_id) {
            const t = await ctx.store.getTask(row.task_id as string)
            if (t) {
              const starts = new Date(row.starts_at as string).toISOString()
              const follows = dueFollows(t.due_at, starts, ctx.now, ctx.zone)
              await ctx.store.patch('tasks', { id: t.id }, { scheduled_start: starts, scheduled_end: new Date(row.ends_at as string).toISOString(), slot_id: null, slot_date: null, ...(follows ? { due_at: starts } : {}) })
              if (follows) await logIt(ctx, 'task.rescheduled', 'task', t.id, { due_at: starts })
            }
          }
          await logIt(ctx, 'calendar_event.restored', 'calendar_event', rowId)
        } else {
          await ctx.store.patch(TABLE_OF[type], { id: rowId }, { deleted_at: null })
          await logIt(ctx, type === 'journal_entry' ? 'journal.restored' : `${type}.restored`, type, rowId, type === 'project' ? { from: 'trash' } : {})
        }
        return { restored: { type, id: rowId, title: titleOf(row) } }
      })
    },
  },
  {
    name: 'settings',
    title: 'Settings',
    description: "The user's settings an assistant may read: time zone, weekend, calendar view, the slipping threshold, names, and the notification switches, times and quiet hours.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      return { timezone: ctx.zone, settings: settingsOut(await settingsRow(ctx), ctx.zone) }
    },
  },
  {
    name: 'update_settings',
    title: 'Update settings',
    description:
      "Change settings (only when the user asks; give only what changes): timezone (an IANA zone like Europe/London), weekend_days (e.g. [\"fri\",\"sat\"]), calendar_day_count (1–7), calendar_default_view (day, 3day, week or null), slipping_default_days, display_name, workspace_name, the notification switches (true/false), their times (HH:MM: morning_digest_at, evening_nudge_at, quiet_from, quiet_to) and notify_paused_until (a date-time to pause notifications until, or null). Never keys, tokens or connections.",
    inputSchema: {
      type: 'object',
      properties: {
        timezone: { type: 'string' },
        weekend_days: { type: 'array', items: { type: 'string', enum: WEEKDAYS }, maxItems: 6 },
        calendar_day_count: { type: 'integer', minimum: 1, maximum: 7 },
        calendar_default_view: { type: ['string', 'null'], enum: ['day', '3day', 'week', null] },
        slipping_default_days: { type: 'integer', minimum: 1, maximum: 365 },
        display_name: { type: ['string', 'null'] },
        workspace_name: { type: 'string' },
        notify_paused_until: { type: ['string', 'null'], description: "YYYY-MM-DDTHH:mm on the user's clock, or null." },
        ...Object.fromEntries(SWITCHES.map((k) => [k, { type: 'boolean' }])),
        ...Object.fromEntries(TIMES.map((k) => [k, { type: 'string', description: 'HH:MM, 24h, on the user\'s clock.' }])),
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const values: Row = {}
      if ('timezone' in a) {
        const tz = text(a, 'timezone', 64, true)!
        if (userZone(tz) !== tz) return bad(`"${tz}" isn't a time zone this server knows: use an IANA name like Africa/Cairo or Europe/London.`)
        values.timezone = tz
      }
      if ('weekend_days' in a) {
        const days = words(a, 'weekend_days', 6, 3)!.map((d) => WEEKDAYS.indexOf(d.toLowerCase()))
        if (days.some((d) => d < 0)) return bad(`"weekend_days" takes ${WEEKDAYS.join(', ')}.`)
        values.weekend_days = days.sort()
      }
      if ('calendar_day_count' in a) values.calendar_day_count = whole(a, 'calendar_day_count', 1, 7, 7)
      if ('calendar_default_view' in a) values.calendar_default_view = a.calendar_default_view === null ? null : choice(a, 'calendar_default_view', ['day', '3day', 'week'] as const, 'week')
      if ('slipping_default_days' in a) values.slipping_default_days = whole(a, 'slipping_default_days', 1, 365, 7)
      if ('display_name' in a) values.display_name = text(a, 'display_name', 80) ?? null
      if ('workspace_name' in a) values.workspace_name = text(a, 'workspace_name', 80, true)
      if ('notify_paused_until' in a) {
        const w = whenOrNull(a, 'notify_paused_until', ctx.zone)
        values.notify_paused_until = w ? instantOf(w, ctx.zone).toISOString() : null
      }
      for (const k of SWITCHES) if (k in a) values[k] = flag(a, k) ?? bad(`"${k}" must be true or false.`)
      for (const k of TIMES) if (k in a) values[k] = clockArg(a, k) ?? bad(`"${k}" must be a time, HH:MM.`)
      const keys = Object.keys(values)
      if (!keys.length) return bad(`Nothing to change: give at least one of ${SETTINGS_FIELDS.join(', ')}.`)
      const s = await settingsRow(ctx)
      // A column this server doesn't have yet is refused, not sent (the app's 0058 pattern).
      const missing = Object.keys(s).length ? keys.filter((k) => !(k in s)) : []
      if (missing.length) return bad(`${missing.join(', ')} need a newer server; nothing was changed.`)
      await writeSettings(ctx, values)
      // The app logs no settings change; an assistant's is traced (entity 'settings', not a task: slipping is untouched).
      await logIt(ctx, 'settings.updated', 'settings', 'settings', { fields: keys })
      const after = settingsOut({ ...s, ...values }, userZone((values.timezone as string | undefined) ?? (s.timezone as string | undefined)))
      return { updated: Object.fromEntries(keys.map((k) => [k, after[k]])), changed: keys }
    },
  },
  {
    name: 'inbox',
    title: 'Inbox',
    description: "The user's Inbox captures, newest first: by default the ones waiting to be sorted (pending, not snoozed); or snoozed, dismissed, filed or all. Each with its text, link and the AI's suggested title if any. Sort them with file_inbox_item and update_inbox_item.",
    inputSchema: {
      type: 'object',
      properties: {
        show: { type: 'string', enum: ['pending', 'snoozed', 'dismissed', 'filed', 'all'], description: 'Which (default pending).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many (default 50).' },
      },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const rows = await ctx.store.inboxItems(choice(a, 'show', ['pending', 'snoozed', 'dismissed', 'filed', 'all'] as const, 'pending'), whole(a, 'limit', 1, 100, 50))
      return { timezone: ctx.zone, count: rows.length, items: rows.map((i) => inboxOut(i, ctx.zone)) }
    },
  },
  {
    name: 'file_inbox_item',
    title: 'File Inbox item',
    description:
      "Sort a waiting Inbox capture (only when the user asks): as a task (title, due, project_id or area_id, someday, duration_min — the AI's parsed date applies when no due is given; a time puts it on the calendar), as an event (start, end or duration_min), as a Library note (title, text), into today's journal (text — a key allowed the journal) or onto a person's page (person_id, text — a key allowed People). The capture is then filed.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The Inbox item.' },
        as: { type: 'string', enum: ['task', 'event', 'note', 'journal', 'person'] },
        title: { type: 'string', description: "task / event / note: its title (default: the AI's suggestion, else the capture's words)." },
        text: { type: 'string', description: 'note / journal / person: the words (default: the capture).' },
        due: dateArg('task: when it is due'),
        project_id: { ...id, description: 'task: into this project.' },
        area_id: { ...id, description: 'task: into this area.' },
        someday: { type: 'boolean', description: 'task: park it for Someday (no date).' },
        duration_min: { type: 'integer', minimum: 1, maximum: 1440, description: 'task / event: how long, in minutes.' },
        start: dateArg('event: when it starts — a date alone makes it all-day'),
        end: dateArg('event: when it ends (all-day: its last day)'),
        person_id: { ...id, description: 'person: who it is about.' },
      },
      required: ['id', 'as'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const item = await pendingItem(ctx, uuid(a, 'id', true)!)
      const as = choice(a, 'as', ['task', 'event', 'note', 'journal', 'person'] as const, 'task')
      const parse = (item.ai_parse ?? {}) as Row
      const payload = (item.payload ?? {}) as Row
      const raw = item.raw_text as string
      const suggested = (typeof parse.title === 'string' && parse.title.trim()) || (typeof parse.cleaned_text === 'string' && parse.cleaned_text.trim()) || raw
      const body = text(a, 'text', 10000) ?? raw
      const allowed: Record<typeof as, string[]> = {
        task: ['title', 'due', 'project_id', 'area_id', 'someday', 'duration_min'],
        event: ['title', 'start', 'end', 'duration_min'],
        note: ['title', 'text'],
        journal: ['text'],
        person: ['person_id', 'text'],
      }
      const stray = Object.keys(a).filter((k) => !['id', 'as', ...allowed[as]].includes(k))
      if (stray.length) return bad(`Filing as ${as} takes ${allowed[as].join(', ')} — not ${stray.join(', ')}.`)
      if (as === 'task') {
        // inbox/api fileToTask: the card's date, else the AI's; its time puts it on the calendar (A2).
        const someday = flag(a, 'someday') ?? false
        const due = when(a, 'due', ctx.zone)
        if (someday && due) return bad('A Someday task has no date: give "someday" or "due".')
        const parsedAt = typeof parse.due_at === 'string' && !Number.isNaN(Date.parse(parse.due_at)) ? new Date(parse.due_at) : null
        const projectId = uuid(a, 'project_id')
        const areaId = uuid(a, 'area_id')
        if (projectId && areaId) return bad('A task lives in a project or an area, not both: give one.')
        const project = projectId ? ((await ctx.store.projects()).find((p) => p.id === projectId) ?? bad(`No project with id ${projectId}. Call the projects tool for the ids.`)) : null
        const area = areaId ? ((await liveRow(ctx, 'areas', areaId, 'area')) as unknown as { id: string; domain_id: string | null }) : null
        const dur = 'duration_min' in a ? whole(a, 'duration_min', 1, 1440, 30) : ((payload.duration_override as number | null) ?? (typeof parse.duration_min === 'number' && parse.duration_min > 0 && parse.duration_min <= 1440 ? Math.round(parse.duration_min) : null))
        // A filed GitHub issue keeps its link; any other capture's link rides along (P7e A19).
        const issueUrl = item.kind === 'github_issue' && typeof payload.url === 'string' && payload.url.startsWith('https://github.com/') ? payload.url : null
        const link = item.kind === 'github_issue' ? null : (webUrl(payload.url) ?? urlIn(raw))
        const externalRef = issueUrl && payload.node_id ? { source: 'github', id: payload.node_id, url: issueUrl } : link ? { source: 'link', id: crypto.randomUUID(), url: link } : null
        const { task, block } = await createTask(ctx, {
          title: text(a, 'title', 500) ?? suggested,
          due: someday ? null : (due ?? (parsedAt ? { at: parsedAt } : null)),
          timed: due ? 'at' in due : parse.has_time === true,
          durationMin: dur,
          project,
          area,
          someday,
          priority: (payload.priority_override as number | null) ?? null,
          externalRef,
        })
        await ctx.store.patch('inbox_items', { id: item.id }, { status: 'filed', filed_task_id: task.id })
        await logIt(ctx, 'inbox.filed', 'inbox_item', item.id as string, { task_id: task.id })
        return { filed: { as, task: taskOut(task, ctx.zone), ...(block ? { calendar_block: spanText(block, ctx.zone) } : {}) }, timezone: ctx.zone }
      }
      if (as === 'event') {
        const { event } = await addEvent(a, ctx, suggested)
        await markFiled(ctx, item, 'event', { calendar_event_id: event.id })
        return { filed: { as, event: eventOut(event, ctx.zone) }, timezone: ctx.zone }
      }
      if (as === 'note') {
        // library/api createNote.
        const note = { id: crypto.randomUUID(), title: text(a, 'title', 300) ?? null, body, tags: [], domain_id: null, book_id: null }
        await ctx.store.insert('notes', note)
        await logIt(ctx, 'note.created', 'note', note.id, { title: note.title })
        await markFiled(ctx, item, 'note', { note_id: note.id })
        return { filed: { as, note: { id: note.id, title: note.title } } }
      }
      if (as === 'journal') {
        needScope(ctx, 'journal')
        // inbox/api fileQuietly → journal/api upsertJournalEntry: a new entry for today (the user's day).
        const entry = { id: crypto.randomUUID(), body, entry_date: dateKey(ctx.now, ctx.zone), mood: null, transcript: null, media_paths: [], gratitude: [] }
        await ctx.store.insert('journal_entries', entry)
        await logIt(ctx, 'journal.created', 'journal_entry', entry.id, { entry_date: entry.entry_date })
        await markFiled(ctx, item, 'journal', { journal_entry_id: entry.id })
        return { filed: { as, journal_entry: { id: entry.id, date: entry.entry_date } } }
      }
      needScope(ctx, 'people')
      const pid = uuid(a, 'person_id', true)!
      const [person] = await ctx.store.find('people', { id: pid }, { limit: 1 })
      if (!person) return bad(`No person with id ${pid}. The people tool lists them.`)
      // people/api createInteraction.
      const note = { id: crypto.randomUUID(), person_id: pid, summary: body, occurred_at: ctx.now.toISOString() }
      await ctx.store.insert('interactions', note)
      await logIt(ctx, 'people.interaction_logged', 'people', pid, { summary: body })
      await markFiled(ctx, item, 'person', { person_id: pid })
      return { filed: { as, person: person.name, interaction_id: note.id } }
    },
  },
  {
    name: 'update_inbox_item',
    title: 'Update Inbox item',
    description: "Triage captures (only when the user asks; `ids` for several): dismiss, snooze until a day or time (it leaves the waiting list until then), unsnooze, or restore a dismissed one to the Inbox. To delete one, move_to_trash.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The Inbox item.' },
        ids: ids('The Inbox items'),
        action: { type: 'string', enum: ['dismiss', 'snooze', 'unsnooze', 'restore'] },
        until: dateArg('snooze: until when (a date alone = 09:00 that day)'),
      },
      required: ['action'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const action = choice(a, 'action', ['dismiss', 'snooze', 'unsnooze', 'restore'] as const, 'dismiss')
      const w = when(a, 'until', ctx.zone)
      if (action === 'snooze' && !w) return bad('"until" is required to snooze.')
      if (action !== 'snooze' && w) return bad('"until" goes with snooze.')
      const until = w ? instantOf(w, ctx.zone).toISOString() : null
      if (until && Date.parse(until) <= ctx.now.getTime()) return bad('"until" must be in the future.')
      return eachId(a, async (itemId) => {
        const [item] = await ctx.store.find('inbox_items', { id: itemId, deleted_at: null }, { limit: 1 })
        if (!item) return bad(`No Inbox item with id ${itemId} (it may be in Trash).`)
        if (item.status === 'filed') return bad(`"${item.raw_text}" is already filed.`)
        if (action === 'dismiss') {
          // inbox/api dismissInboxItem.
          await ctx.store.patch('inbox_items', { id: itemId }, { status: 'dismissed' })
          await logIt(ctx, 'inbox.dismissed', 'inbox_item', itemId)
        } else if (action === 'snooze') {
          await ctx.store.patch('inbox_items', { id: itemId }, { snoozed_until: until })
          await logIt(ctx, 'inbox.snoozed', 'inbox_item', itemId, { until })
        } else {
          // inbox/api restoreInboxItem: pending again, unsnoozed — the one way back for both.
          await ctx.store.patch('inbox_items', { id: itemId }, { status: 'pending', snoozed_until: null })
          await logIt(ctx, 'inbox.restored', 'inbox_item', itemId)
        }
        const after = { ...item, ...(action === 'dismiss' ? { status: 'dismissed' } : action === 'snooze' ? { snoozed_until: until } : { status: 'pending', snoozed_until: null }) }
        return { [({ dismiss: 'dismissed', snooze: 'snoozed', unsnooze: 'unsnoozed', restore: 'restored' } as const)[action]]: inboxOut(after, ctx.zone) }
      })
    },
  },
]

