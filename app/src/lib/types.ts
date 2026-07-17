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
  notifications_last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface SlippingRow {
  entity_type: 'domain' | 'project' | 'area'
  entity_id: string
  entity_name: string
  last_touch: string
  days_since: number
}

export type SearchEntityType = 'task' | 'inbox_item'

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
  user_id: string
  body: string
  entry_date: string
  mood: string | null
  transcript: string | null
  media_paths: string[]
  gratitude: string[]
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
