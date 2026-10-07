import type { ActivityLogEntry } from '../../lib/types'
import { digestNotice, nudgeNotice, reminderNotice, type NoticeAction } from '../../../../supabase/functions/notify/copy.ts'
import { appZone } from '../../lib/appZone'
import type { KindId } from '../notifications/kinds'

// What each activity_log row says on the Activity page (Activity.dc.html 1a/1b voice: a verb, the
// thing, then a quiet detail line). One entry per event type the app actually writes — every
// logActivity() caller was read for its event name and payload (2026-09-26 audit: a new person
// read "Logged an interaction with…", a capture "Captured "inbox item"", a journal save
// "Updated journal entry — "journal"", a new routine "Routine updated"). Event names in the
// database are never renamed; this only maps them to copy.
//
// Names come from the payload when the writer put one there, otherwise from the live lists the
// page already holds (`ActivityNames`). A thing that's gone (deleted) gets copy that reads well
// without a name rather than a placeholder in quotes.

export type ActivityCategory =
  | 'tasks'
  | 'inbox'
  | 'routines'
  | 'calendar'
  | 'people'
  | 'journal'
  | 'projects'
  | 'review'
  | 'library'
  /** What was sent: reminders, the digest, the nudge (Tray and Notifications.dc.html 12j). */
  | 'notifications'
  /** Onboarding, and any event newer than this map. */
  | 'garden'

/** Which of the page's existing row marks to draw (the page owns the pixels). */
export type ActivityIcon = 'check' | 'cross' | 'inbox' | 'vine' | 'calendar' | 'clover' | 'fern' | 'plus' | 'seedling' | 'notice'

export interface ActivityLine {
  text: string
  details: string
  category: ActivityCategory
  icon: ActivityIcon
  /** Where a click on the row goes; null when the thing has no page (or no longer exists). */
  href: string | null
  /** A notification that was sent: drawn with its kind's glyph, and its buttons still work (12j). */
  notice?: { kind: KindId; actions: NoticeAction[]; taskIds: string[] }
}

export interface ActivityNames {
  task(id: string): { title: string; project_id: string | null; status?: string } | undefined
  project(id: string): string | undefined
  area(id: string): string | undefined
  domain(id: string): string | undefined
  person(id: string): string | undefined
  routine(id: string): string | undefined
  inbox(id: string): string | undefined
  event(id: string): string | undefined
}

export const NO_NAMES: ActivityNames = {
  task: () => undefined,
  project: () => undefined,
  area: () => undefined,
  domain: () => undefined,
  person: () => undefined,
  routine: () => undefined,
  inbox: () => undefined,
  event: () => undefined,
}

/** "1 event" / "3 events". */
export function plural(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`
}

const MORNING_STEPS: Record<string, string> = {
  overdue: 'review overdue',
  top3: 'pick your Top-3',
  inbox: 'inbox to zero',
  block: 'time-block your day',
}
const EVENING_BEATS: Record<string, string> = {
  sweep: 'the sweep',
  garden: 'the garden',
  line: 'the line',
  seeds: "tomorrow's seeds",
  goodnight: 'goodnight',
}

function str(payload: Record<string, unknown> | null, key: string): string {
  const v = payload?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

function quoted(name: string): string {
  return `"${name}"`
}

/** `with` when the name is known, `without` otherwise — never a placeholder in quotes. */
function named(name: string, withName: (q: string) => string, without: string): string {
  return name ? withName(quoted(name)) : without
}

/** "2026-10-03" → "Sat 3 Oct" (calendar date, read in UTC so no zone can shift the day). */
function dayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
  const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  return `${weekday} ${d.getUTCDate()} ${month}`
}

function taskHref(id: string, names: ActivityNames): string {
  const projectId = names.task(id)?.project_id
  return projectId ? `/projects/${projectId}?focus=${id}` : `/tasks?focus=${id}`
}

function describeTask(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const task = names.task(id)
  const name = str(payload, 'title') || task?.title || ''
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category: 'tasks', icon: 'check', href: taskHref(id, names) })

  switch (type) {
    case 'task.created':
      return line(named(name, (q) => `Created task ${q}`, 'Created a task'), payload?.recurrence_parent ? 'the next one in its series' : 'added to tasks')
    case 'task.completed': {
      const project = task?.project_id ? names.project(task.project_id) : undefined
      return line(named(name, (q) => `Completed ${q}`, 'Completed a task'), project ? `${project} · dropped a petal` : 'dropped a petal')
    }
    case 'task.reopened':
      return line(named(name, (q) => `Reopened ${q}`, 'Reopened a task'), 'back on the list')
    case 'task.deleted': {
      const reason = str(payload, 'reason')
      if (reason === 'capture undo' || reason === 'inbox file undo')
        return { text: named(name, (q) => `Sent ${q} back to the Inbox`, 'Sent a task back to the Inbox'), details: 'undone', category: 'inbox', icon: 'inbox', href: '/inbox' }
      return { text: named(name, (q) => `Deleted task ${q}`, 'Deleted a task'), details: 'resting in Trash', category: 'tasks', icon: 'cross', href: '/trash' }
    }
    case 'task.restored':
      return line(named(name, (q) => `Restored ${q} from Trash`, 'Restored a task from Trash'), 'back on the list')
    case 'task.snoozed':
      return line(named(name, (q) => `Snoozed ${q}`, 'Snoozed a task'), 'back later')
    case 'task.someday_set':
      return payload?.someday === false
        ? line(named(name, (q) => `Brought ${q} back from Someday`, 'Brought a task back from Someday'))
        : line(named(name, (q) => `Moved ${q} to Someday`, 'Moved a task to Someday'))
    case 'task.moved': {
      // "Move to…" (Kai 2026-10-07): a project, an area, a domain, or none of them.
      const projectId = str(payload, 'project_id')
      const areaId = str(payload, 'area_id')
      const domainId = str(payload, 'domain_id')
      const where = projectId ? names.project(projectId) : areaId ? names.area(areaId) : domainId ? names.domain(domainId) : undefined
      if (!projectId && !areaId && !domainId) return line(named(name, (q) => `Took ${q} out of its project`, 'Took a task out of its project'))
      const other = projectId ? 'another project' : areaId ? 'another area' : 'another domain'
      return line(named(name, (q) => (where ? `Moved ${q} into ${where}` : `Moved ${q} to ${other}`), where ? `Moved a task into ${where}` : `Moved a task to ${other}`))
    }
    case 'task.starred':
      return line(named(name, (q) => `Added ${q} to the Top 3`, 'Added a task to the Top 3'))
    case 'task.unstarred':
      return line(named(name, (q) => `Took ${q} out of the Top 3`, 'Took a task out of the Top 3'))
    case 'task.rescheduled':
      return str(payload, 'due_at')
        ? line(named(name, (q) => `Rescheduled ${q}`, 'Rescheduled a task'))
        : line(named(name, (q) => `Cleared the date on ${q}`, 'Cleared the date on a task'))
    case 'task.scheduled':
      return { text: named(name, (q) => `Blocked time for ${q}`, 'Blocked time for a task'), details: 'on the calendar', category: 'calendar', icon: 'calendar', href: '/calendar' }
    case 'task.recurrence_set':
      return str(payload, 'rule')
        ? line(named(name, (q) => `Set ${q} to repeat`, 'Set a task to repeat'))
        : line(named(name, (q) => `Stopped ${q} repeating`, 'Stopped a task repeating'))
    case 'task.reminder_set':
      return str(payload, 'reminder_at')
        ? line(named(name, (q) => `Set a reminder for ${q}`, 'Set a reminder'))
        : line(named(name, (q) => `Cleared the reminder on ${q}`, 'Cleared a reminder'))
    case 'task.paused':
      return line(named(name, (q) => `Paused ${q}`, 'Paused a task'))
    case 'task.resumed':
      return line(named(name, (q) => `Resumed ${q}`, 'Resumed a task'))
    case 'task.reminder_sent': {
      // The words it arrived with (notify logs them since 0048); older rows say it plainly.
      const said = (payload?.notice ?? null) as { title?: string; body?: string } | null
      const open = task ? task.status !== 'done' : false
      return {
        ...line(said?.title || named(name, (q) => `A reminder about ${q}`, 'A reminder'), said?.body ?? ''),
        category: 'notifications',
        icon: 'notice',
        notice: { kind: 'task_reminder', actions: open ? reminderNotice([{ id, title: name }], {}, new Date(), appZone()).actions : [], taskIds: [id] },
      }
    }
    case 'task.skipped':
      return line(named(name, (q) => `Skipped this round of ${q}`, 'Skipped a round of a task'), 'the next one is planted')
    default:
      return line(named(name, (q) => `Updated ${q}`, 'Updated a task'))
  }
}

function captureDetails(payload: Record<string, unknown> | null): string {
  const kind = str(payload, 'kind')
  return [
    kind === 'voice' ? 'voice capture' : kind === 'text' || !kind ? 'quick capture' : `${kind} capture`,
    payload?.undoneFrom ? 'back from Tasks' : '',
    payload?.offline ? 'saved offline' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function describeInbox(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = names.inbox(id) ?? ''
  const line = (text: string, details = '', href: string | null = `/inbox?focus=${id}`): ActivityLine => ({ text, details, category: 'inbox', icon: 'inbox', href })

  switch (type) {
    case 'inbox.captured':
      return line(named(name, (q) => `Captured ${q}`, 'Captured a thought to the Inbox'), captureDetails(payload))
    case 'inbox.filed': {
      const taskId = str(payload, 'task_id')
      const task = taskId ? names.task(taskId) : undefined
      const project = task?.project_id ? names.project(task.project_id) : undefined
      const where = project ?? 'Tasks'
      return line(named(task?.title || name, (q) => `Filed ${q} to ${where}`, `Filed a note to ${where}`), 'sorted into the garden', task ? taskHref(taskId, names) : '/inbox')
    }
    case 'inbox.dismissed':
      return line(named(name, (q) => `Dismissed ${q}`, 'Dismissed a note'), 'set aside')
    case 'inbox.snoozed':
      return line(named(name, (q) => `Snoozed ${q}`, 'Snoozed a note'), 'back later')
    case 'inbox.restored':
      return line(named(name, (q) => `Brought ${q} back to the Inbox`, 'Brought a note back to the Inbox'))
    case 'inbox.purged':
      return line(named(name, (q) => `Cleared ${q}`, 'Cleared a note'), 'resting in Trash', '/trash')
    default:
      return line(named(name, (q) => `Updated ${q}`, 'Updated an Inbox note'))
  }
}

function describeRoutine(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = str(payload, 'name') || names.routine(id) || ''
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category: 'routines', icon: 'vine', href: '/routines' })

  switch (type) {
    case 'routine.created':
      return line(
        named(name, (q) => `Planted a new routine — ${q}`, 'Planted a new routine'),
        payload?.challenge ? 'a challenge' : str(payload, 'time_of_day'),
      )
    case 'routine.checked':
      // WB-4 punch 9: never invent a streak day — only say one when the writer recorded it.
      return line(named(name, (q) => `Kept the streak on ${q}`, 'Kept a routine'), payload?.streak ? `day ${payload.streak} · the vine grew a leaf` : 'the vine grew a leaf')
    case 'routine.unchecked':
      return line(named(name, (q) => `Unchecked ${q}`, 'Unchecked a routine'))
    case 'routine.archived':
      return line(named(name, (q) => `Archived the routine ${q}`, 'Archived a routine'))
    case 'routine.restored':
      return line(named(name, (q) => `Brought back the routine ${q}`, 'Brought back a routine'))
    default:
      return line(named(name, (q) => `Updated the routine ${q}`, 'Updated a routine'))
  }
}

function describeRitual(e: ActivityLogEntry): ActivityLine {
  const ritual = str(e.payload, 'ritual')
  const step = str(e.payload, 'step')
  const stepLabel = (ritual === 'evening' ? EVENING_BEATS : MORNING_STEPS)[step] ?? step
  const which = ritual === 'evening' ? 'Evening' : 'Morning'
  return { text: stepLabel ? `${which} ritual — ${stepLabel}` : `${which} ritual step`, details: 'step done', category: 'routines', icon: 'vine', href: null }
}

function describeCalendar(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = str(payload, 'title') || names.event(id) || ''
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category: 'calendar', icon: 'calendar', href: '/calendar' })
  switch (type) {
    case 'calendar_event.created':
      return line(named(name, (q) => `Scheduled ${q}`, 'Scheduled an event'), 'added to the calendar')
    case 'calendar_event.deleted':
      return line(named(name, (q) => `Removed ${q}`, 'Removed an event'), 'cleared from the calendar')
    case 'calendar_event.restored':
      return line(named(name, (q) => `Restored ${q}`, 'Restored an event'), 'back on the calendar')
    default:
      return line(named(name, (q) => `Updated ${q}`, 'Updated an event'))
  }
}

function describePeople(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const line = (text: string, details = '', href: string | null = `/people/${id}`): ActivityLine => ({ text, details, category: 'people', icon: 'clover', href })
  switch (type) {
    case 'people.created':
      return line(named(str(payload, 'name') || names.person(id) || '', (q) => `Added ${q} to People`, 'Added someone to People'), 'new in the clover patch')
    case 'people.updated':
      return line(named(str(payload, 'name') || names.person(id) || '', (q) => `Updated ${q}`, 'Updated someone in People'))
    case 'people.deleted':
      return line(named(names.person(id) ?? '', (q) => `Removed ${q} from People`, 'Removed someone from People'), '', null)
    case 'people.interaction_logged':
      // entity_id is the person; the summary is what happened between you.
      return line(named(names.person(id) ?? '', (q) => `Logged an interaction with ${q}`, 'Logged an interaction'), str(payload, 'summary'))
    case 'people.interaction_deleted':
      // entity_id is the interaction itself, which no longer exists — nowhere to go.
      return line('Removed an interaction', '', null)
    default:
      return line(named(names.person(id) ?? '', (q) => `Updated ${q}`, 'Updated someone in People'))
  }
}

function describeJournal(e: ActivityLogEntry): ActivityLine {
  const { event_type: type } = e
  const line = (text: string, details = '', href: string | null = '/journal'): ActivityLine => ({ text, details, category: 'journal', icon: 'fern', href })
  switch (type) {
    case 'journal.created':
      return line('Wrote a journal entry')
    case 'journal.updated':
      return line('Kept writing in the journal')
    case 'journal.deleted':
      return line('Moved a journal entry to Trash', '', '/trash')
    case 'journal.restored':
      return line('Brought back a journal entry', 'from Trash')
    case 'journal.line_added':
      // The evening ritual's one line. S8 (polish-f1): its words stay in the journal — the event
      // no longer carries them, and rows written before that still did, so never print payload.text.
      return line("Added a line to today's journal", 'evening ritual')
    default:
      return line('Updated the journal')
  }
}

function describeProject(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = names.project(id) || str(payload, 'name')
  const item = str(payload, 'title')
  const line = (text: string, details = '', href: string | null = `/projects/${id}`): ActivityLine => ({ text, details, category: 'projects', icon: 'plus', href })
  const onProject = name // the detail line under a milestone/checklist change

  switch (type) {
    case 'project.created':
      return line(named(name, (q) => `Created project ${q}`, 'Created a project'), payload?.type === 'retainer' ? 'a retainer' : '')
    case 'project.renamed':
      return line(named(str(payload, 'name'), (q) => `Renamed a project to ${q}`, 'Renamed a project'))
    case 'project.reparented': {
      const domainId = str(payload, 'domain_id')
      const domain = domainId ? names.domain(domainId) : undefined
      if (!domainId) return line(named(name, (q) => `Took ${q} out of its domain`, 'Took a project out of its domain'))
      return line(named(name, (q) => (domain ? `Moved ${q} into ${domain}` : `Moved ${q} to another domain`), 'Moved a project to another domain'))
    }
    case 'project.archived':
      return line(named(name, (q) => `Pressed ${q} into the Herbarium`, 'Pressed a project into the Herbarium'), 'finished', '/herbarium')
    case 'project.restored':
      return line(named(name, (q) => `Brought ${q} back from the Herbarium`, 'Brought a project back from the Herbarium'))
    case 'project.color_changed':
      return line(named(name, (q) => `Changed the color of ${q}`, "Changed a project's color"))
    case 'project.engagement_changed':
      return line(named(name, (q) => `Changed the engagement on ${q}`, "Changed a project's engagement"), str(payload, 'engagement_model'))
    case 'project.target_date_changed': {
      const target = str(payload, 'target_date')
      return target
        ? line(named(name, (q) => `Set a target date for ${q}`, 'Set a project target date'), dayLabel(target))
        : line(named(name, (q) => `Cleared the target date on ${q}`, "Cleared a project's target date"))
    }
    case 'project.milestone_added':
      return line(named(item, (q) => `Added the milestone ${q}`, 'Added a milestone'), onProject)
    case 'project.milestone_completed':
      return line(named(item, (q) => `Reached the milestone ${q}`, 'Reached a milestone'), onProject)
    case 'project.milestone_uncompleted':
      return line(named(item, (q) => `Reopened the milestone ${q}`, 'Reopened a milestone'), onProject)
    case 'project.milestone_renamed':
      return line(named(item, (q) => `Renamed a milestone to ${q}`, 'Renamed a milestone'), onProject)
    case 'project.milestone_removed':
      return line('Removed a milestone', onProject)
    case 'project.checklist_item_added':
      return line(named(item, (q) => `Added ${q} to the checklist`, 'Added a checklist item'), onProject)
    case 'project.checklist_item_completed':
      return line(named(item, (q) => `Checked off ${q}`, 'Checked off a checklist item'), onProject)
    case 'project.checklist_item_uncompleted':
      return line(named(item, (q) => `Unchecked ${q}`, 'Unchecked a checklist item'), onProject)
    case 'project.checklist_item_removed':
      return line('Removed a checklist item', onProject)
    case 'project.update_logged':
      return line(named(name, (q) => `Posted an update on ${q}`, 'Posted a project update'), str(payload, 'note'))
    case 'project.work_logged': {
      // The key is the project, else the focused task, else a fresh id (focus with neither).
      const task = names.task(id)
      const target = name || task?.title || ''
      // WB-4 punch 9: no invented minutes — only what the writer recorded.
      const details = [typeof payload?.duration_min === 'number' && payload.duration_min > 0 ? `${payload.duration_min}m` : '', str(payload, 'note')].filter(Boolean).join(' · ')
      const href = names.project(id) ? `/projects/${id}` : task ? taskHref(id, names) : null
      return line(named(target, (q) => `Logged work on ${q}`, 'Logged focus time'), details, href)
    }
    default:
      return line(named(name, (q) => `Updated ${q}`, 'Updated a project'))
  }
}

function describeArea(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = str(payload, 'name') || names.area(id) || ''
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category: 'projects', icon: 'plus', href: null })
  switch (type) {
    case 'area.created':
      return line(named(name, (q) => `Created the area ${q}`, 'Created an area'))
    case 'area.renamed':
      return line(named(name, (q) => `Renamed an area to ${q}`, 'Renamed an area'))
    case 'area.merged': {
      const into = names.area(str(payload, 'into'))
      return line(named(name, (q) => (into ? `Merged ${q} into ${into}` : `Merged ${q} into another area`), 'Merged two areas'))
    }
    case 'area.reparented': {
      const domainId = str(payload, 'domain_id')
      const domain = domainId ? names.domain(domainId) : undefined
      if (!domainId) return line(named(name, (q) => `Took the area ${q} out of its domain`, 'Took an area out of its domain'))
      return line(named(name, (q) => (domain ? `Moved the area ${q} into ${domain}` : `Moved the area ${q} to another domain`), 'Moved an area to another domain'))
    }
    case 'area.converted': {
      const projectId = str(payload, 'new_project_id')
      return { ...line(named(name, (q) => `Turned the area ${q} into a project`, 'Turned an area into a project')), href: projectId ? `/projects/${projectId}` : null }
    }
    default:
      return line(named(name, (q) => `Updated the area ${q}`, 'Updated an area'))
  }
}

function describeDomain(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_id: id, payload } = e
  const name = str(payload, 'name') || names.domain(id) || ''
  const line = (text: string): ActivityLine => ({ text, details: '', category: 'projects', icon: 'plus', href: null })
  switch (type) {
    case 'domain.created':
      return line(named(name, (q) => `Created the domain ${q}`, 'Created a domain'))
    case 'domain.renamed':
      return line(named(name, (q) => `Renamed a domain to ${q}`, 'Renamed a domain'))
    case 'domain.merged': {
      const into = names.domain(str(payload, 'into'))
      return line(named(name, (q) => (into ? `Merged ${q} into ${into}` : `Merged ${q} into another domain`), into ? `Merged a domain into ${into}` : 'Merged two domains'))
    }
    case 'domain.swept':
      // Weekly review: one domain's projects looked over.
      return { text: named(name, (q) => `Swept ${q}`, 'Swept a domain'), details: 'weekly review', category: 'review', icon: 'fern', href: '/weekly-review' }
    default:
      return line(named(name, (q) => `Updated the domain ${q}`, 'Updated a domain'))
  }
}

/** Project, area or domain name for review/slipping events keyed on any of the three. */
function gardenName(entityType: string, id: string, names: ActivityNames): string {
  if (entityType === 'project') return names.project(id) ?? ''
  if (entityType === 'area') return names.area(id) ?? ''
  if (entityType === 'domain') return names.domain(id) ?? ''
  return ''
}

function categoryOf(entityType: string): { category: ActivityCategory; icon: ActivityIcon } {
  switch (entityType) {
    case 'task':
      return { category: 'tasks', icon: 'check' }
    case 'inbox_item':
      return { category: 'inbox', icon: 'inbox' }
    case 'journal_entry':
      return { category: 'journal', icon: 'fern' }
    case 'people':
    case 'person':
      return { category: 'people', icon: 'clover' }
    case 'project':
    case 'area':
    case 'domain':
      return { category: 'projects', icon: 'plus' }
    default:
      return { category: 'review', icon: 'fern' }
  }
}

function describeResurfaced(e: ActivityLogEntry, names: ActivityNames): ActivityLine {
  const { event_type: type, entity_type: entityType, entity_id: id, payload } = e
  const name = (entityType === 'inbox_item' ? names.inbox(id) : entityType === 'task' ? names.task(id)?.title : gardenName(entityType, id, names)) ?? ''
  const { category, icon } = categoryOf(entityType)
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category, icon, href: null })
  switch (type) {
    case 'resurfaced.converted':
      return line(named(name, (q) => `Kept ${q} — filed as a task`, 'Kept a resurfaced note as a task'), 'resurfaced')
    case 'resurfaced.review_later': {
      const days = typeof payload?.snoozed_days === 'number' ? payload.snoozed_days : 0
      return line(named(name, (q) => `Snoozed ${q}`, 'Snoozed a resurfaced pick'), days ? `resurfaced · back in ${plural(days, 'day')}` : 'resurfaced')
    }
    case 'resurfaced.dismissed':
      return line(named(name, (q) => `Let ${q} go`, 'Let a resurfaced pick go'), 'resurfaced')
    case 'resurfaced.planned':
      return line(named(name, (q) => `Planned ${q}`, 'Planned a resurfaced task'), 'resurfaced')
    case 'resurfaced.done':
      return line(named(name, (q) => `Finished ${q}`, 'Finished a resurfaced task'), 'resurfaced')
    case 'resurfaced.kept':
      return line(named(name, (q) => `Kept ${q}`, 'Kept a resurfaced note'), 'resurfaced')
    default:
      return line(named(name, (q) => `Looked at ${q} again`, 'Looked at a resurfaced pick'), 'resurfaced')
  }
}

function describeLibrary(e: ActivityLogEntry): ActivityLine {
  const { event_type: type, payload } = e
  const title = str(payload, 'title')
  const line = (text: string, details = ''): ActivityLine => ({ text, details, category: 'library', icon: 'fern', href: '/library' })
  switch (type) {
    case 'book.created':
      return line(named(title, (q) => `Put ${q} on the shelf`, 'Put a book on the shelf'))
    case 'book.progress_updated':
      return str(payload, 'status') === 'finished'
        ? line('Finished a book')
        : line('Read on in a book', typeof payload?.current_page === 'number' ? `page ${payload.current_page}` : '')
    case 'book.deleted':
      return line('Took a book off the shelf')
    case 'note.created':
      return line(named(title, (q) => `Wrote the note ${q}`, 'Wrote a note'))
    case 'note.updated':
      return line(named(title, (q) => `Updated the note ${q}`, 'Updated a note'))
    case 'note.deleted':
      return line('Removed a note')
    case 'quote.created':
      return line('Kept a quote', str(payload, 'author'))
    case 'quote.updated':
      return line('Updated a quote')
    case 'quote.deleted':
      return line('Removed a quote')
    case 'commentary.created':
      return line('Added a commentary')
    default:
      return line('Updated the library')
  }
}

/** The one mapping: an activity_log row → what the Activity page says about it. */
export function describeActivity(e: ActivityLogEntry, names: ActivityNames = NO_NAMES): ActivityLine {
  const type = e.event_type
  const prefix = type.split('.')[0]
  switch (prefix) {
    case 'task':
      return describeTask(e, names)
    case 'capture': {
      // capture.autofiled: a capture confident enough to skip the Inbox and land as a task.
      const title = names.task(e.entity_id)?.title ?? ''
      const details = str(e.payload, 'source') === 'reconnect' ? 'filed once you were back online' : 'filed as you captured it'
      return { text: named(title, (q) => `Captured ${q} straight into Tasks`, 'Captured a task straight into Tasks'), details, category: 'inbox', icon: 'inbox', href: taskHref(e.entity_id, names) }
    }
    case 'inbox':
      return describeInbox(e, names)
    case 'routine':
      return describeRoutine(e, names)
    case 'ritual':
      return describeRitual(e)
    case 'calendar_event':
    case 'calendar':
      return describeCalendar(e, names)
    case 'people':
    case 'person':
      return describePeople(e, names)
    case 'journal':
      return describeJournal(e)
    case 'project':
      return describeProject(e, names)
    case 'area':
      return describeArea(e, names)
    case 'domain':
      return describeDomain(e, names)
    case 'review': {
      if (type === 'review.verdict') {
        const verdict = str(e.payload, 'verdict')
        const name = gardenName(e.entity_type, e.entity_id, names)
        const said = verdict && verdict !== 'reviewed ✓' ? ` — ${verdict}` : ''
        return { text: named(name, (q) => `Reviewed ${q}${said}`, `Reviewed a project${said}`), details: 'weekly review', category: 'review', icon: 'fern', href: '/weekly-review' }
      }
      return { text: type === 'review.week_closed' ? 'Closed the week' : 'Worked on the weekly review', details: 'weekly review', category: 'review', icon: 'fern', href: '/weekly-review' }
    }
    case 'entity': {
      // entity.reviewed — "Marked reviewed" on a Slipping card.
      const name = gardenName(e.entity_type, e.entity_id, names)
      return { text: named(name, (q) => `Marked ${q} reviewed`, 'Marked a quiet project reviewed'), details: 'from Slipping', category: 'projects', icon: 'plus', href: e.entity_type === 'project' ? `/projects/${e.entity_id}` : null }
    }
    case 'resurfaced':
      return describeResurfaced(e, names)
    case 'book':
    case 'note':
    case 'quote':
    case 'commentary':
      return describeLibrary(e)
    case 'onboarding':
      return { text: 'Planted your garden', details: 'the welcome, done', category: 'garden', icon: 'seedling', href: null }
    case 'notify': {
      // notify.morning_digest / notify.evening_nudge: the notice as it was sent, with its buttons.
      const kind = type === 'notify.evening_nudge' ? 'evening_nudge' : 'morning_digest'
      const sent = kind === 'morning_digest' ? digestNotice([], {}) : nudgeNotice(0, 0)
      return { text: str(e.payload, 'title') || sent.title, details: str(e.payload, 'body'), category: 'notifications', icon: 'notice', href: '/today', notice: { kind, actions: sent.actions, taskIds: [] } }
    }
    default: {
      // Anything newer than this map: say it plainly rather than print the raw event name.
      const verb = (type.split('.')[1] ?? type).replace(/_/g, ' ')
      return { text: `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`, details: '', category: 'garden', icon: 'seedling', href: null }
    }
  }
}
