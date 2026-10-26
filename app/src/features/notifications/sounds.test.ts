import { describe, expect, it } from 'vitest'
import type { NoticeKind } from '../../../../supabase/functions/notify/copy.ts'
import { NOTIFY_PACKS, NOTIFY_SOUNDS, parseNotifyPack, soundName, soundOf, soundUrl } from './sounds'

describe('notification sound packs', () => {
  it('every pack has a WAV for every sound, and nothing else (public/, where the app and the Android build read them)', () => {
    const files = Object.keys(import.meta.glob('../../../public/notification-sounds/**/*')).map((k) => k.replace('../../../public', '')).sort()
    expect(files).toEqual(NOTIFY_PACKS.flatMap((p) => NOTIFY_SOUNDS.map((s) => soundUrl(p, s))).sort())
  })

  it('res/raw names are valid Android resource names, unique per pack × sound', () => {
    const names = NOTIFY_PACKS.flatMap((p) => NOTIFY_SOUNDS.map((s) => soundName(p, s)))
    expect(new Set(names).size).toBe(NOTIFY_PACKS.length * NOTIFY_SOUNDS.length)
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('each kind of notice → its sound', () => {
    const of = (kind: NoticeKind, again?: boolean) => soundOf({ kind, again })
    expect(of('task_reminder')).toBe('task_reminder')
    expect(of('task_reminder', true)).toBe('snoozed_again')
    expect(of('routine')).toBe('task_reminder')
    expect(of('event_reminder')).toBe('event_reminder')
    expect(of('birthday')).toBe('event_reminder')
    expect(of('focus_done')).toBe('focus_end')
    for (const k of ['morning_digest', 'evening_nudge', 'paper_ready', 'terms', 'sync_problem'] as const) expect(of(k)).toBe(k)
    expect(of('test')).toBe('task_reminder')
  })

  it('an unknown or absent pack reads as Felt', () => {
    expect(parseNotifyPack(undefined)).toBe('felt')
    expect(parseNotifyPack('kalimba')).toBe('felt')
    expect(parseNotifyPack('mixed')).toBe('mixed')
  })
})
