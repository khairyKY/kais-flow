import { writeRow } from './outbox'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ActivityRow {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown> | null
}

/** The row `logActivity` writes. `activity_log.entity_id` is a `uuid not null` column, but some
 * events key on something else — `morning-2026-09-26` (ritual steps), a date (the evening
 * one-liner), an ISO week start ("Close the week"). Postgres rejected every one of those rows, the
 * outbox parked it, and the user got "One change couldn't be saved" — daily, for every ritual step
 * (audit 2026-09-26, J-16). A non-uuid key now gets a fresh uuid and rides along in
 * `payload.entity_key`; every reader of these events already matches on payload fields, and the
 * uuid-keyed readers (tasks, projects, areas) are unaffected. */
export function activityRow(
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): ActivityRow {
  const keyed = UUID.test(entityId)
  return {
    id: crypto.randomUUID(),
    event_type: eventType,
    entity_type: entityType,
    entity_id: keyed ? entityId : crypto.randomUUID(),
    payload: keyed ? (payload ?? null) : { ...(payload ?? {}), entity_key: entityId },
  }
}

/** Appends one row to `activity_log`. Slipping, streaks, digests, and resurfacing (later phases) only ever read this log. */
export function logActivity(
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): void {
  writeRow('activity_log', activityRow(eventType, entityType, entityId, payload))
}
