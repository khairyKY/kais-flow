import { useEffect, useMemo, useRef, useState } from 'react'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { createTask } from '../tasks/api'
import { captureText } from '../inbox/api'
import { parseCommand } from './parseCommand'

export function CommandBar() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setText('')
  }, [open])

  const parsed = useMemo(() => parseCommand(text, domains, projects), [text, domains, projects])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    if (parsed.dueAt || parsed.domainId || parsed.projectId) {
      createTask({
        title: parsed.title || trimmed,
        domainId: parsed.domainId,
        projectId: parsed.projectId,
        dueAt: parsed.dueAt,
      })
    } else {
      captureText(trimmed)
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="Call Omar tomorrow 3pm #shaheen"
          className="w-full border-b pb-2 text-lg outline-none"
        />
        {text.trim() && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {parsed.dueAt && (
              <span className="rounded bg-slate-100 px-2 py-1">
                {new Date(parsed.dueAt).toLocaleString()}
              </span>
            )}
            {parsed.projectMatch && (
              <span className="rounded bg-slate-100 px-2 py-1">→ {parsed.projectMatch}</span>
            )}
            {parsed.domainMatch && !parsed.projectMatch && (
              <span className="rounded bg-slate-100 px-2 py-1">→ {parsed.domainMatch}</span>
            )}
            {!parsed.dueAt && !parsed.domainId && !parsed.projectId && (
              <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">→ Inbox (unfiled)</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
