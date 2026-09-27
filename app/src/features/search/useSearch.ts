import { useEffect, useReducer, useState } from 'react'
import { searchHybrid } from './api'
import { IDLE, searchReducer, type SearchState } from './searchState'

const DEBOUNCE_MS = 400 // each pause = one edge-function call (free tier: 500k/month)

/** Debounced hybrid search for the ⌘/ overlay and /search — one copy of the lifecycle
 * (searchState.ts) so both tell "nothing found" from "didn't answer" the same way. */
export function useSearch(query: string): SearchState & { retry: () => void } {
  const [state, dispatch] = useReducer(searchReducer, IDLE)
  // Bumping this re-runs the effect for the same query — the "Try again" button.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      dispatch({ type: 'clear' })
      return
    }
    dispatch({ type: 'start', query: q })
    const handle = setTimeout(() => {
      searchHybrid(q).then(
        (results) => dispatch({ type: 'answered', query: q, results }),
        () => dispatch({ type: 'failed', query: q }),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}
