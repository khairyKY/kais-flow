import { useToastStore } from '../../lib/toastStore'
import type { CalendarEvent } from '../../lib/types'
import { openExternal } from '../../lib/platform'
import { setChatStarter } from '../widgets/native'
import { gcalLink, joinLink } from './gcal'

// Menu B's Copy link and Work with AI › (cal-blocks, Kai 2026-10-26) — the desktop block menu and the phone's
// event sheet share them.

/** Copies the block's address: /calendar?event=<id> turns the calendar to it and opens it (./linkedEvent). */
export function copyBlockLink(event: CalendarEvent): void {
  const push = useToastStore.getState().push
  const url = `${window.location.origin}/calendar?event=${encodeURIComponent(event.id)}`
  void (navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('no clipboard'))).then(
    () => push({ message: 'Link copied' }),
    () => push({ message: "Couldn't copy the link" }),
  )
}

/** A Google event's own page in Google Calendar (gcal-events): where everything about it can be changed. */
export function openInGoogle(event: CalendarEvent): void {
  const url = gcalLink(event)
  if (url) void openExternal(url)
}

/** Join: the event's meeting link (Meet's), if Google gave one. */
export function joinMeeting(event: CalendarEvent): void {
  const url = joinLink(event)
  if (url) void openExternal(url)
}

/** Opens the chat (⌘J) with `text` typed in, not sent — the person reads it, finishes it, sends it. */
export function askChat(text: string): void {
  setChatStarter(text)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }))
}
