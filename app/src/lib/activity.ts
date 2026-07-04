import { writeRow } from './outbox'

/** Appends one row to `activity_log`. Slipping, streaks, digests, and resurfacing (later phases) only ever read this log. */
export function logActivity(
  eventType: string,
  entityType: string,
  entityId: string,
  payload?: Record<string, unknown>,
): void {
  writeRow('activity_log', {
    id: crypto.randomUUID(),
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    payload: payload ?? null,
  })
}
