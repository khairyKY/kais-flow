import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { searchHybrid } from './api'
import type { SearchHit } from '../../lib/types'

const DEBOUNCE_MS = 250

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else {
      setQuery('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      searchHybrid(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  if (!open) return null

  function goTo(hit: SearchHit) {
    onClose()
    navigate(hit.entity_type === 'task' ? `/tasks?focus=${hit.entity_id}` : `/inbox?focus=${hit.entity_id}`)
  }

  const tasks = results.filter((r) => r.entity_type === 'task')
  const inboxItems = results.filter((r) => r.entity_type === 'inbox_item')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Search tasks and inbox…"
          className="w-full border-b pb-2 text-lg outline-none"
        />
        {loading && <p className="mt-3 text-xs text-slate-400">Searching…</p>}
        {!loading && query.trim() && results.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No matches.</p>
        )}
        {tasks.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-semibold text-slate-500">Tasks</h3>
            <ul className="space-y-1">
              {tasks.map((hit) => (
                <li key={`task-${hit.entity_id}`}>
                  <button type="button" onClick={() => goTo(hit)} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100">
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {inboxItems.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-semibold text-slate-500">Inbox</h3>
            <ul className="space-y-1">
              {inboxItems.map((hit) => (
                <li key={`inbox_item-${hit.entity_id}`}>
                  <button type="button" onClick={() => goTo(hit)} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100">
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
