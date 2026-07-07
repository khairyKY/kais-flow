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
  created_at: string
  updated_at: string
}

export type TaskStatus = 'todo' | 'done' | 'cancelled'

export interface Task {
  id: string
  project_id: string | null
  domain_id: string | null
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
  completed_at: string | null
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

export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

export interface Cadence {
  weekdays: number[] // 0=Sunday..6=Saturday
}

export interface Routine {
  id: string
  name: string
  time_of_day: TimeOfDay
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

export interface PushSubscriptionRow {
  id: string
  endpoint: string
  keys: Record<string, string>
  device_label: string | null
  created_at: string
}

export interface AppSettings {
  id: true
  timezone: string
  confidence_threshold: number
  digest_hour: number
  slipping_default_days: number
  created_at: string
  updated_at: string
}

export interface SlippingRow {
  entity_type: 'domain' | 'project'
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
