// The Shut down ritual's one optional answer ("What helped today, and what got in the way?") lives in the
// day's journal entry as a small "Shut down" block: the heading line, then the answer, ended by a blank
// line or the end of the entry. Saving again replaces that block (never appends a second one). Shared by
// the app (rituals/EveningRitual) and the MCP shut_down tool. Pure: no app or Deno imports.

export const SHUT_HEADING = 'Shut down'

/** The answer as one paragraph: trimmed, blank lines dropped (a blank line is what ends the block). */
export function tidyNote(text: string): string {
  return text.trim().replace(/\n\s*\n+/g, '\n')
}

function find(lines: string[]): { start: number; end: number } | null {
  const i = lines.findIndex((l, n) => l === SHUT_HEADING && (n === 0 || lines[n - 1] === ''))
  if (i < 0) return null
  let end = i + 1
  while (end < lines.length && lines[end] !== '') end++
  return { start: i, end }
}

/** The saved answer inside an entry's body, or null. */
export function shutdownNote(body: string): string | null {
  const lines = body.split('\n')
  const at = find(lines)
  return at && at.end > at.start + 1 ? lines.slice(at.start + 1, at.end).join('\n') : null
}

/** The body with the answer set: replaces this entry's block, else appends one under the heading. */
export function withShutdownNote(body: string, text: string): string {
  const note = tidyNote(text)
  const lines = body.split('\n')
  const at = find(lines)
  if (at) return [...lines.slice(0, at.start), SHUT_HEADING, note, ...lines.slice(at.end)].join('\n')
  const head = body.trimEnd()
  return head ? `${head}\n\n${SHUT_HEADING}\n${note}` : `${SHUT_HEADING}\n${note}`
}

/** Which of a day's entries (oldest first) holds the answer: the one with the block, else the last one. */
export function noteHome<T extends { body: string }>(dayEntries: T[]): T | undefined {
  return dayEntries.find((e) => shutdownNote(e.body) !== null) ?? dayEntries[dayEntries.length - 1]
}
