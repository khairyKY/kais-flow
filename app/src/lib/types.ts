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
