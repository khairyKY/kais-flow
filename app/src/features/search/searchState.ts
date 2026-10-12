import type { SearchHit } from '../../lib/types'

// One search's lifecycle, shared by the ⌘/ overlay and /search (2026-09-26 audit: a failed
// `search` call — network down, edge function 5xx — rendered "Nothing's come up for that", the
// exact copy of a genuine empty result). "No results" and "didn't answer" are now different
// states, so the UI can say "Search is resting" and offer a retry instead of claiming 0 results.

export type SearchStatus =
  /** No query. */
  | 'idle'
  /** Waiting on the debounce or the answer. */
  | 'searching'
  /** Answered — `results` may be empty (a real "nothing's come up"). */
  | 'done'
  /** The search didn't answer (network or server). Nothing is known about results. */
  | 'resting'

export interface SearchState {
  status: SearchStatus
  /** The query this state is about (trimmed). */
  query: string
  results: SearchHit[]
}

export type SearchAction =
  | { type: 'clear' }
  | { type: 'start'; query: string }
  | { type: 'answered'; query: string; results: SearchHit[] }
  | { type: 'failed'; query: string }

export const IDLE: SearchState = { status: 'idle', query: '', results: [] }

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'clear':
      return IDLE
    case 'start':
      // Keep the last answer on screen while the next one is on its way (no flash to empty).
      return { ...state, status: 'searching', query: action.query }
    case 'answered':
      // A slow answer for a query the user has already typed past must not land.
      if (action.query !== state.query || state.status !== 'searching') return state
      return { status: 'done', query: action.query, results: action.results }
    case 'failed':
      if (action.query !== state.query || state.status !== 'searching') return state
      return { status: 'resting', query: action.query, results: [] }
  }
}

/** The mono line under the page's search box. Resting says nothing about counts — it doesn't know.
 * `count` = what the page lists after its filters (1a: "23 results for 'omar'" = the chips' All). */
export function resultCountLine(state: SearchState, count = state.results.length): string {
  if (state.status === 'searching') return 'searching…'
  if (state.status === 'done') return `${count} result${count === 1 ? '' : 's'} for '${state.query}'`
  return ''
}

/** search_hybrid's score bands (0037): a lexical hit scores ≥ 1, an FTS hit ≥ 1/(60+40) = 0.01,
 * a hit only the vector arm found ≤ 0.5/61 ≈ 0.0082. Proven on 0064 in
 * docs/log/assets/search-design/0064-pglite-check.mjs. */
export const LITERAL_FLOOR = 0.009

/** An answer of nothing but meaning-neighbours is an empty answer. gte-small puts most of a small
 * corpus within the vector arm's 0.35 distance of any short query (0037: at 0.45 the arm filled all
 * 40 slots for "judge"), so search never said "nothing" and Search 1b's empty state — "try fewer
 * words, or let the chat dig deeper" — was unreachable. When at least one hit shares the query's
 * words, the neighbours stay (they still find things with no shared words); the chat keeps the
 * whole retrieval. */
export function literalAnswer<T extends Pick<SearchHit, 'score'>>(hits: T[]): T[] {
  return hits.some((h) => h.score >= LITERAL_FLOOR) ? hits : []
}

/** The calm line both surfaces show when the search didn't answer (house rule: never "error"). */
export const SEARCH_RESTING = 'Search is resting — try again in a moment.'
