export interface Domain {
  id: string
  name: string
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  domain_id: string | null
  name: string
  type: 'standard' | 'retainer'
  status: string
  color?: string | null
  target_date?: string | null
  milestones?: Array<{
    id: string
    title: string
    weight: number
    completed: boolean
  }>
  checklist?: Array<{
    id: string
    title: string
    type: 'one-shot' | 'task-linked'
    completed: boolean
    task_id?: string | null
  }>
  engagement_model?: string | null
  completion_summary?: string | null
  /** In Trash since (migration 0044); absent before it is pushed. */
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export type TaskStatus = 'todo' | 'done' | 'cancelled'

export interface Task {
  id: string
  project_id: string | null
  domain_id: string | null
  area_id: string | null
  title: string
  notes: string | null
  status: TaskStatus
  due_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  top3: boolean
  snoozed_until: string | null
  recurrence_rule: string | null
  labels: string[]
  priority: number | null
  duration_min: number | null
  someday: boolean
  reminder_at: string | null
  reminder_sent: boolean
  completed_at: string | null
  paused?: boolean
  milestone_id?: string | null
  deleted_at?: string | null
  /** Subtasks (migration 0029): set → this task is a child of that task. One level deep. */
  parent_task_id?: string | null
  /** Origin key (0027, unique per user+source+id): an import's {source, id, raw}, or a filed GitHub
   * issue's {source: 'github', id: node_id, url}. Never copied onto a duplicate/next occurrence. */
  external_ref?: { source: string; id: string; url?: string; raw?: unknown } | null
  created_at: string
  updated_at: string
}

export type InboxKind = 'text' | 'voice' | 'github_issue' | 'email'
export type InboxStatus = 'pending' | 'filed' | 'dismissed'

export interface InboxItem {
  id: string
  kind: InboxKind
  raw_text: string
  transcript: string | null
  ai_parse: Record<string, unknown> | null
  confidence: number | null
  status: InboxStatus
  filed_task_id: string | null
  payload: Record<string, unknown> | null
  snoozed_until: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLogEntry {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown> | null
  created_at: string
}

export type CalendarEventSource = 'native' | 'gcal'
export type CalendarEventType = 'time_block' | 'event' | 'task'

export interface CalendarEvent {
  id: string
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  task_id: string | null
  source: CalendarEventSource
  gcal_id: string | null
  gcal_etag: string | null
  busy: boolean
  type: CalendarEventType
  color: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Cadence {
  weekdays: number[] // 0=Sunday..6=Saturday
}

export interface Routine {
  id: string
  name: string
  /** One of the 3 named presets, a custom label (e.g. "dusk"), or null (no time at all) — migration 0019. */
  time_of_day: string | null
  /** Explicit clock time, `HH:MM` 24h — migration 0019. Independent of `time_of_day`. */
  clock_time: string | null
  cadence: Cadence
  challenge_start: string | null
  challenge_end: string | null
  active: boolean
  /** Steps checklist (migration 0028): ordered labels, Routines.dc.html "what it's made of". */
  steps?: string[]
  /** Domain this routine tends (migration 0028), per the New Routine form's Domain picker. */
  domain_id?: string | null
  /** The streak goal in days (migration 0046), null = none: the streak reads "12 / 30". */
  goal_days?: number | null
  created_at: string
  updated_at: string
}

export interface RoutineCompletion {
  id: string
  routine_id: string
  completed_on: string // date, YYYY-MM-DD
  created_at: string
}

export interface Area {
  id: string
  domain_id: string | null
  name: string
  description: string | null
  color: string | null
  sort_order: number
  /** In Trash since (migration 0044); absent before it is pushed. */
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface PushSubscriptionRow {
  id: string
  endpoint: string
  keys: Record<string, string>
  device_label: string | null
  created_at: string
}

export interface AppSettings {
  id: string
  timezone: string
  confidence_threshold: number
  digest_hour: number
  slipping_default_days: number
  calendar_day_count: number
  /** The view the calendar opens on (migration 0043); null/absent = the platform's own default. */
  calendar_default_view?: 'day' | '3day' | 'week' | null
  /** Ritual reminders (migration 0045): on/off + Cairo wall-clock time, 'HH:MM' (Postgres reads back 'HH:MM:SS'). */
  morning_digest_on?: boolean
  morning_digest_at?: string
  evening_nudge_on?: boolean
  evening_nudge_at?: string
  /** Paper capture (migration 0048): keep page photos 7 days (default) or delete them once reviewed. */
  capture_keep_photos?: boolean
  notifications_last_seen_at: string | null
  created_at: string
  updated_at: string
  // N6 onboarding
  display_name: string | null
  workspace_name: string
  seed_avatar: string | null
  onboarded_at: string | null
}

export interface SlippingRow {
  entity_type: 'domain' | 'project' | 'area'
  entity_id: string
  entity_name: string
  last_touch: string
  days_since: number
}

// Widened by migration 0031 (punch 49). Additive: the first two are what search_hybrid returned
// before, and still all it returns until `supabase db push` runs.
export type SearchEntityType = 'task' | 'inbox_item' | 'person' | 'calendar_event' | 'project' | 'journal_entry'

export interface SearchHit {
  entity_type: SearchEntityType
  entity_id: string
  title: string
  snippet: string | null
  score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Citation {
  entity_type: SearchEntityType
  entity_id: string
  title: string
}

export type ResurfaceAction = 'pending' | 'converted' | 'review_later' | 'dismissed'

export interface ResurfacedLogRow {
  id: string
  entity_type: SearchEntityType
  entity_id: string
  shown_on: string
  action: ResurfaceAction
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  project_id: string | null
  task_id: string | null
  note: string | null
  duration_min: number
  started_at: string
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface JournalEntry {
  id: string
  /** Server-assigned (`default auth.uid()`); the client never knows it at write time and must
   * not send it — an explicit value overrides the default, and '' fails uuid parsing. */
  user_id?: string
  body: string
  entry_date: string
  mood: string | null
  transcript: string | null
  media_paths: string[]
  gratitude: string[]
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Book {
  id: string
  user_id: string
  title: string
  author: string | null
  published_year: number | null
  current_page: number
  total_pages: number
  status: 'reading' | 'finished'
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string[]
  domain_id: string | null
  book_id: string | null
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  user_id: string
  text: string
  author: string | null
  source: string | null
  tags: string[]
  book_id: string | null
  page: string | null
  created_at: string
  updated_at: string
}

export interface Commentary {
  id: string
  user_id: string
  parent_type: 'note' | 'quote'
  parent_id: string
  body: string
  created_at: string
  updated_at: string
}

export interface Fact {
  id: string
  label: string
  value: string
  date?: string | null
  recurs?: boolean
}

export interface Person {
  id: string
  user_id: string
  name: string
  facts: Fact[]
  domain_id: string | null
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  user_id: string
  person_id: string
  summary: string
  occurred_at: string
  created_at: string
  updated_at: string
}
