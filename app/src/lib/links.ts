import { openExternal } from './platform'
import { useToastStore } from './toastStore'
import type { Task } from './types'

// A captured link back to its source (P7e A19, Akiflow's "O to jump back"): a shared page, an endpoint
// capture's `url`, a link typed in the bar. It stays on the inbox card, rides onto the task it's filed
// as (`external_ref`, like a filed GitHub issue's), and `o` on a task row opens it.

/** Only http(s) — these end up as hrefs. */
export const webUrl = (url: unknown): string | null => (typeof url === 'string' && /^https?:\/\/\S+$/i.test(url) ? url : null)

const URL_RE = /https?:\/\/[^\s<>"']+/i

/** The first link in a line, without the sentence's trailing punctuation. */
export function urlIn(text: string | null | undefined): { url: string; index: number } | null {
  const m = text ? URL_RE.exec(text) : null
  return m ? { url: m[0].replace(/[.,;:!?]+$/, ''), index: m.index } : null
}

/** A capture's link as the task's origin. The id only has to be unique (0027's index): the same page
 * captured twice is two tasks with a link each. */
export const linkRef = (url: string | null | undefined): Task['external_ref'] => (webUrl(url) ? { source: 'link', id: crypto.randomUUID(), url: url! } : null)

/** A task's link: a captured page or a filed GitHub issue. */
export const taskLink = (task: Pick<Task, 'external_ref'>): string | null => webUrl(task.external_ref?.url)

/** How a link reads on a chip: "View issue" for a GitHub one, else its site ("example.com"). */
export function linkLabel(url: string): string {
  if (url.startsWith('https://github.com/')) return 'View issue'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Open link'
  }
}

/** `o` on a task row. */
export function openTaskLink(task: Pick<Task, 'external_ref'>): void {
  const url = taskLink(task)
  if (url) void openExternal(url)
  else useToastStore.getState().push({ message: 'No link on this task' })
}
