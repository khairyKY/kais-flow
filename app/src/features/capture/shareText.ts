/** A share (`/share?title&text&url` — the installed web app's share_target, or the Android app's
 * SEND intent: EXTRA_SUBJECT → title, EXTRA_TEXT → text) → the one capture it becomes. Parts are
 * trimmed, empties dropped, and a part already inside another dropped: Chrome puts the URL in both
 * `text` and `url`, and many apps repeat the subject inside the text. */
export function sharedText(parts: (string | null | undefined)[]): string {
  const kept = parts.map((p) => p?.trim() ?? '').filter(Boolean)
  return kept.filter((p, i) => !kept.some((q, j) => j !== i && q.includes(p) && (q !== p || j < i))).join('\n')
}
